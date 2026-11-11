# Deployment and its security model

How code gets from `main` to a running site, and how the pipeline is protected. Written for maintainers and for anyone auditing the project;
contributors only need [CONTRIBUTING.md](../CONTRIBUTING.md). The review rules for pull requests are in [review-policy.md](review-policy.md) (in Chinese).

## Two deployment targets

| Target | Built by | Deployed by | Used for |
|---|---|---|---|
| **Self-hosted** (release tarball or Docker image) | whoever runs the site, from a checkout of `main` with `tools/selfhost/` ([self-hosting.md](self-hosting.md)); no image is published. `.github/workflows/selfhost.yml` tests the packaging on pull requests that touch it | the operator installs or upgrades the release on their server | the project's own site; anyone self-hosting |
| **Cloudflare Workers** | the `test` job of each module's workflow (`platform.yml`, `game-<id>.yml`) on every pull request, and on `main` when Cloudflare deploys are on | the `deploy` job, only on `main` and only when the repository variable `CF_DEPLOY` is `true` | the project's own site; forks that deploy to Cloudflare |

Both targets build from the same module code and the same `wrangler.jsonc` files, and both add the platform bindings with the same rules
(`tools/deployer/lib.mjs`). `main` only accepts pull requests; the Cloudflare deploy additionally refuses to run unless `tools/verify-main.sh`
confirms the whole history since `TRUSTED_BASE` is owner-merged pull requests. The project's own site runs on one of the two at a time; maintainers choose which.

## Repository settings and the Cloudflare pipeline

Kept in sync with the repository's settings:

- **`main` only accepts pull requests.** The repository's plan has no branch protection, so two things enforce it: the
  `tools/git-hooks/pre-push` hook (enable once per clone with `git config core.hooksPath tools/git-hooks`) blocks direct pushes to `main` and
  force pushes from a contributor's machine, and the deploy guard below refuses to deploy any history that did not come through a pull request.
- **Merging**: squash merge only (one pull request = one commit on `main`, the pull request title becomes the commit message); branches are deleted after merge.
- **Workflows**: `check.yml`, the `pkg-<name>.yml` workflows and `selfhost.yml` run on pull requests only (and on demand); each module's `platform.yml` / `game-<id>.yml`
  tests on pull requests that touch the module. A new push to a pull request cancels its older checks. Nothing runs on a schedule, and no workflow opens issues.
- **Cloudflare deploys are off by default.** Merges to `main` run no workflow at all until the repository variable `CF_DEPLOY` is set to `true`;
  then each module's workflow tests, packs and deploys on merges that touch the module. To turn them on: create the **`production`** environment
  restricted to `main`, add the secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `SITE_HOST` (plus `D1_DATABASE_ID`, which the platform's
  deploy needs), then set `CF_DEPLOY=true`. The hostname and database ID are secrets so they are masked in the Actions logs; the repository itself names no domain.
  On a plan with environment protection rules, adding the repository owner as a required reviewer of `production` makes every deploy wait for approval.
- **One deploy per module at a time**: deploy jobs of the same module queue instead of cancelling each other. Only the latest commit on `main` is deployed: if another
  pull request touching the module was merged while a run was queued, that run fails its "latest commit" step; do not re-run old runs — start the module's
  workflow on `main` manually (*Run workflow*), which deploys the current head.
- **Merging and publishing are maintainer-only.** The automated reviewer never merges and never approves deployments; its token has no
  Deployments, Environments, Secrets or Administration permission.
- **Actions**: every workflow declares its own minimal `permissions` (read-only unless a job needs more). In the repository settings, keep the default workflow
  token read-only and require approval for workflows from first-time and external contributors; fork pull requests never receive secrets.
- **Secret scanning and push protection**: turn both on as soon as the repository is public (they are not available for private repositories on the free plan).
- **Build and deploy are separate jobs.** The `test` job runs the module's code (install, tests, build, `wrangler deploy --dry-run --outdir`)
  without any secret and uploads the bundle and static assets as an artifact. The `deploy` job (production environment) never checks out or runs
  module code: it sparse-checks-out `tools/` plus the module's `wrangler.jsonc` (and the platform's `migrations/`), installs the pinned wrangler from
  `tools/deployer/` with `npm ci --ignore-scripts`, and runs `tools/deployer/deploy.mjs`. That script treats the artifact as data, parses the reviewed
  `wrangler.jsonc` with the pinned wrangler's own parser, checks it against the allowlist in `tools/deployer/lib.mjs`, generates the final config,
  re-checks it and deploys with `--no-bundle` from an empty directory, `--env-file /dev/null`, a minimal environment and a fixed
  `CLOUDFLARE_API_BASE_URL`. Do not add caches, `npm ci` of module code or extra `wrangler` commands to deploy jobs.
- **Deploy configuration check** (`tools/check-deploy-config.mjs`, on every pull request; `deploy.mjs` checks again before every deploy): modules may not
  contain `.env*`, `.npmrc`, `wrangler.json`, `wrangler.toml`, `.wrangler/`, unlisted hidden files or symlinks; each module's `wrangler.jsonc` may only
  deploy to its own Worker — named after the module and listed in `tools/workers.json` — with no routes, domains, account ids, limits, log
  destinations or resources beyond the per-key allowlisted bindings, and Durable Object migrations may only create classes.
  `vars` names and `compatibility_flags` must be listed per module in `tools/deploy-allowlist.json`; the platform's secret names and `SITE_ORIGIN` are never allowed as `vars`.
  Only maintainers add names to `tools/workers.json` (after checking that no Worker with that name already exists in the account) and to `tools/deploy-allowlist.json`.
- **Platform overlay**: a game's `wrangler.jsonc` is a standalone config that deploys without the platform. For this site, maintainers declare in
  `tools/workers.json` which games connect to the platform, and `deploy.mjs` adds the `ARCADE` / `WALLET` bindings, `GATE`, routes and `SITE_ORIGIN`
  (the full table is in [new-game.md](new-game.md) section 4, the single reference for this overlay). The bindings use the canonical shapes fixed in
  `tools/deployer/lib.mjs` (`props.game` = the game's id), so a game cannot change how it connects to the platform, for example to bill another game;
  a module may spell them out only in exactly that form, and any other service binding is rejected.
- **Fixed bundling**: the final config always sets `no_bundle: true`, `find_additional_modules: false` and `upload_source_maps: false`; the entry file is
  copied alone into its directory with its trailing `sourceMappingURL` comment removed, so exactly one file is uploaded (`FINAL_BUNDLE_FLAGS` in `lib.mjs`).
- **Publishing `arcade-kit` to npm** (package name `@yyyu-star/arcade-kit`; the npm token only covers that scope): only a maintainer publishes, from their own machine, from a merge commit on `main` — the npm token never goes into
  GitHub. `git switch --detach origin/main && cd packages/arcade-kit && npm ci && npm test && npm publish` (the version must be the one in its
  `package.json` / `CHANGELOG.md`, merged through a kit pull request). Then verify in an empty directory with `npm i arcade-kit@npm:@yyyu-star/arcade-kit@<version>`.
  Games install it under the alias `arcade-kit` (`"arcade-kit": "npm:@yyyu-star/arcade-kit@^0.25.1"`), so their `arcade-kit/...` imports stay unchanged.
  Games move to a new kit version through their own pull requests; `pkg-arcade-kit.yml` already runs every game's tests against the packed kit.
- **Pinned tooling**: third-party actions are pinned to full commit SHAs, and the deployer's wrangler version is fixed in `tools/deployer/` (upgrade steps in
  [tools/deployer/README.md](../tools/deployer/README.md)). Pull requests that touch `tools/` or `.github/workflows/` also run the whole deploy path for one game
  with `deploy.mjs --dry-run` (no credentials) in `Check isolation`.
- **Residual risk**:
  - The deploy token is account-wide. The checks above stop module code from reaching the token and stop deploys that leave the allowlist; they do not
    stop a maintainer from merging a malicious change to `tools/` or a workflow. The safest setup is a separate Cloudflare account (with its own domain)
    for this project; that is the repository owner's call.
  - The bundle and static assets are module code: once deployed they run on the site as the player. What they can do depends on review
    ([review-policy.md](review-policy.md) section 4), not on the pipeline.
  - GitHub Actions caches can be written by jobs that run module code, so deploy jobs use no cache.
  - When a game Worker calls the platform's default `fetch` entry through the `ARCADE` binding, the game controls every request header and can forge
    `cf-connecting-ip` or `Origin`, which the platform uses for IP hashing (rate limits) and for checking write requests. Reviewers check that a game
    Worker does not rewrite or forge these headers when forwarding to the platform. The wallet goes through the `WalletService` entry, whose identity is fixed by `props.game`.
- **Deploy guard**: before deploying, `tools/verify-main.sh` checks that every commit on `main` since `TRUSTED_BASE` is a GitHub-generated squash merge of a pull request, merged by the repository owner.
  With `TRUSTED_BASE` empty nothing deploys, so a new repository first sets it to its initial commit through a pull request.
  If someone pushes to `main` directly, every later deploy fails at this step. To recover: review the push (revert it if needed),
  then open a pull request that moves `TRUSTED_BASE` to the full SHA of the last direct push. If credentials may have been exposed, rotate the Cloudflare token first.
- Administrator accounts, passwords, recovery codes, `ADMIN_TOKEN` and the password pepper are never shared and never go into the repository, issues, pull requests or GitHub secrets.

## Pull request screenshots

Contributors drag screenshots into the pull request description. Maintainers with write access upload them to the `pr-assets` pre-release instead
(it holds screenshots only and is not a software release), named `<module>-<PR>-<n>.webp`:
`gh release upload pr-assets <file> -R gzyyyyyyu/arcade`, then reference
`![caption](https://github.com/gzyyyyyyu/arcade/releases/download/pr-assets/<file>)` in the description. Limits (at most 3 webp files, 300 KB each) are in
[engineering.md](engineering.md) section 7.

## Cloudflare: whole site from a fork

These two sections are for running your own copy; the self-hosted option is in [self-hosting.md](self-hosting.md).

Everything runs on **one hostname**: the platform Worker serves `/` and `/api/*`, and each game Worker is mounted on
`/games/<id>/*` with a path route. Sharing one hostname lets every game reuse the platform's login cookie and `/api`
without CORS. You need a Cloudflare account with a zone (domain) for that hostname. Each module has a workflow in
`.github/workflows/` that tests on every pull request and, once `CF_DEPLOY` is `true`, deploys from `main`.

1. Fork the repository and create an environment named **`production`** (Settings → Environments), restricted to `main`.
   In your fork, set `TRUSTED_BASE` in [`tools/verify-main.sh`](../tools/verify-main.sh) to the commit you forked from —
   the deploy guard only trusts pull requests merged by the repository owner after that point.
2. Add these environment secrets:

   | Secret | Used by | Value |
   |---|---|---|
   | `CLOUDFLARE_API_TOKEN` | all | API token with Workers Scripts, Workers Routes, D1 and Durable Objects edit rights |
   | `CLOUDFLARE_ACCOUNT_ID` | all | your account ID |
   | `SITE_HOST` | all | the hostname to serve on, without scheme, e.g. `game.example.com` |
   | `D1_DATABASE_ID` | platform | ID of the D1 database created with `npx wrangler d1 create arcade` |

3. Set the platform's own Worker secrets once with `npx wrangler secret put <NAME>` (list in `platform/.dev.vars.example`).
4. Set the repository variable `CF_DEPLOY` to `true` (Settings → Secrets and variables → Actions → Variables).
5. Run the workflows — **platform first** (the games bind to its `arcade` Worker), then the games.
   [`tools/workers.json`](../tools/workers.json) declares which games connect to the platform; for those, `tools/deployer/deploy.mjs`
   adds the `ARCADE` (login) and `WALLET` (wallet) service bindings, sets `GATE` to `"login"` and turns off `workers.dev`.
   Routes and the site origin are injected from `SITE_HOST`; nothing in the repository names a domain.

Deploys only run for commits that reached `main` through a merged pull request (`tools/verify-main.sh`). How the pipeline is secured: [above](#repository-settings-and-the-cloudflare-pipeline).

## Cloudflare: one game

No platform, no domain needed — the game gets a `https://<id>.<your-subdomain>.workers.dev` address.

- **Deploy to Cloudflare button**: `https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/<id>`
  (replace `<id>` with `kaipan`, `guandan`, `texas`, `mahjong`, `racing`, `yexun`, `danli` or `haidao`). The button copies only that game's directory, so it needs the game to depend on the published `@yyyu-star/arcade-kit` from npm
  (aliased, see the `arcade-kit` line in each game's `package.json`) instead of the in-repo copy; each game's README says whether its button is ready.
  The same button on [`platform`](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/platform) deploys the lobby alone (it creates the D1 database and asks for the secrets in `platform/.dev.vars.example`); games deployed with their own buttons are not connected to it.
- **From a fork**: `cd games/<id> && npm ci && npx wrangler login && npm run deploy`.

A standalone game has single-player against the computer, friend rooms (players are identified by a guest cookie and pick a
nickname with `?name=`) and local saves. It has no login, cloud saves, leaderboards or wallet. Details (in Chinese):
[new-game.md](new-game.md) section 7.
