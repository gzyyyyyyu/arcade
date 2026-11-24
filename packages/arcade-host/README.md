# arcade-host · 自托管运行时

Run the whole Arcade site on your own machine: one [workerd](https://github.com/cloudflare/workerd) process serves the platform and every game, with module code and `wrangler.jsonc` unchanged.

**English** · [简体中文](README.zh-CN.md)

## Features

- **D1 on SQLite**: one Durable Object per database, workerd's own D1 client used as is; migrations run on start (same `d1_migrations` table as wrangler).
- **D1 on PostgreSQL**: same D1 protocol backed by PostgreSQL, mechanical SQL translation plus a site-supplied override table, errors mapped back to SQLite wording.
- **Durable Object state in PostgreSQL**: `KIT_STORE` lets arcade-kit keep rooms, meters and queues in PG; alarms wake objects after a restart.
- **Static assets** ported rule by rule from Cloudflare's asset worker: `html_handling`, `not_found_handling`, `run_worker_first`, `_headers`, `_redirects`, ETag/304.
- **Routing** by path to each Worker (`/games/<id>` to games, the rest to the platform), `/__health`, `/cdn-cgi/*` blocked.
- **Cron Triggers** without experimental flags: a wrapper entry and one Durable Object alarm call `scheduled`, catching up once after downtime.
- **Admin endpoint** on loopback only: whole-database export and import, manual cron runs.
- **Generator** that turns a site description into a release directory (`config.capnp` + runtime + bundles + assets); the server needs only the workerd binary, no Node.

## Quick start

Requires Node 22 (`.nvmrc`) to build and test; the release itself runs on workerd alone.

```bash
npm ci
npm run lint    # Biome lint
npm test        # type check, bundle the runtime, run tests against a real workerd (about a minute)
npm run build   # bundle the runtime into dist/runtime only
```

Generate and start a site (the package is private; install it by local path, `"arcade-host": "file:<path>"`):

```js
import { generate } from 'arcade-host/src/gen/generate.ts';
generate(site, { out: 'release', storage: 'sqlite' });
```

```sh
cd release
workerd serve config.capnp -I . --directory-path data=/var/lib/arcade
```

The site listens on `127.0.0.1:8787` and the admin endpoint on `127.0.0.1:8788`.

## Project layout

```
arcade-host/
├─ src/runtime/   code that runs inside workerd: D1 (SQLite, PG), KitStore, assets, router, cron, admin
├─ src/gen/       generator run by Node at build time: site description → config.capnp + release directory
├─ scripts/       build-runtime.mjs bundles the runtime
├─ test/          tests against a real workerd, including a wrangler dev parity check
└─ docs/          usage details and the Cloudflare comparison (Chinese)
```

## Documentation

Design docs are in Chinese.

- [docs/usage.md](docs/usage.md) — what replaces each Cloudflare feature, storage modes, generator and workerd options, admin endpoint, PostgreSQL mode, test details.
- [docs/verify.md](docs/verify.md) — measured comparison with Cloudflare: what matches, what differs on purpose, and the tests that lock it.
- [CHANGELOG.md](CHANGELOG.md) — version history.

## Part of Arcade

This is the `packages/arcade-host/` module of the Arcade repository. It reads no other module; in the repository, `tools/selfhost/` reads each module's `wrangler.jsonc`, builds the site description and calls this package. It has its own package and tests, so it can be split out on its own.

## License

MIT, see [LICENSE](LICENSE).
