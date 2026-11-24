<div align="center">

# Arcade

**A mini-game arcade you host yourself: one lobby, one account, eight browser games — on Cloudflare Workers or your own server.**

**English** · [简体中文](README.zh-CN.md)

[![Check isolation](https://github.com/gzyyyyyyu/arcade/actions/workflows/check.yml/badge.svg)](https://github.com/gzyyyyyyu/arcade/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

![The lobby with eight games](docs/media/lobby.webp)

> There is no public demo: run it locally ([Quick start](#quick-start)) or host your own copy ([Deploy](#deploy)).
> The games' interface is in Simplified Chinese. Chips are play money only: they cannot be bought, sold, exchanged or transferred.

## Games

| [开盘 · Kaipan](games/kaipan/) | [牌馆 · Card Hall](games/guandan/) | [德州 · Texas Hold'em](games/texas/) | [雀馆 · Mahjong](games/mahjong/) |
|:---:|:---:|:---:|:---:|
| ![Kaipan](platform/public/covers/kaipan.webp) | ![Card Hall](platform/public/covers/guandan.webp) | ![Texas Hold'em](platform/public/covers/texas.webp) | ![Mahjong](platform/public/covers/mahjong.webp) |
| Stock-market roguelike on real historical prices; daily challenge, flash and weekly runs | Guandan (4 players) and Dou Dizhu (3 players) | No-limit, 2–9 seats; Sit & Go tournaments | Sichuan "Bloody Battle" and Riichi |
| [**夜巡 · Night Patrol**](games/yexun/) | [**飞驰 · Racing**](games/racing/) | [**弹里个弹 · Danli**](games/danli/) | [**海岛 · Haidao**](games/haidao/) |
| ![Night Patrol](platform/public/covers/yexun.webp) | ![Racing](platform/public/covers/racing.webp) | ![Danli](platform/public/covers/danli.webp) | ![Haidao](platform/public/covers/haidao.webp) |
| Survivors-like action: Vigil and Night Raid modes | Turn-based card racing, 2–6 cars | Turn-based artillery on destructible terrain | Pirate island building, raids and tower defence |

Every game plays solo against computer opponents; the card and board games and the two community games (Racing, Danli) also have friend rooms.
All but Racing and Danli have a stake mode played with wallet chips. Each game's README has the details.

## Features

- **One account for every game**: username, password and recovery code; invite-only by default, with an admin switch for open registration.
- **Shared platform services**: cloud saves, friends, leaderboards, match history and a play-chip wallet, all through the platform's same-origin `/api`.
- **Solo play in the browser**: computer opponents run entirely client-side, so a solo hand costs the server nothing.
- **Private online rooms** on Durable Objects: hibernating WebSockets, one alarm per room, and the server never sends anyone's hidden cards.
- **Deterministic rules cores**: pure functions with seeded RNGs, enforced by architecture tests, so saves, replays and bug reports reproduce.
- **Mobile-first**: tested on low-memory iPhones and iPads (capped render scale, visual-viewport sizing, safe areas, WebGL context recovery).
- **Modules you can split**: the platform, each game and each shared package has its own dependencies, tests, Worker and workflow.
- **Two ways to run it**: Cloudflare Workers, or one `workerd` process on your own machine (binary or Docker, SQLite or PostgreSQL) with the same module code.

## Quick start

Requirements: Node.js 22 (see `.nvmrc`) and npm. No Cloudflare account is needed to develop or test. There is no root `package.json`: every module installs and runs on its own.

```bash
git clone https://github.com/gzyyyyyyu/arcade.git
cd arcade/games/texas     # or platform, packages/arcade-kit, any games/<id>
npm ci
npm run dev               # dev server; single-player works without the platform
npm test                  # unit tests (vitest)
npm run build             # production build
```

To run the lobby with games, start `npm run dev:api` and `npm run dev` in `platform/` and open <http://localhost:5180>; the lobby links each game to its own dev server, so start the games you want too.
Dev ports are listed in [AGENTS.md](AGENTS.md#3-本地开发) section 3 and in each module's README. Before opening a pull request, also run `node tools/check-isolation.mjs` at the repository root.

## Deploy

| Option | What you get | Guide |
|---|---|---|
| Self-host (Docker or a binary) | The whole site on your own server, SQLite or PostgreSQL | [docs/self-hosting.md](docs/self-hosting.md) |
| Cloudflare, whole site | Platform and games on Workers, D1 and Durable Objects, one hostname | [docs/deployment.md](docs/deployment.md#cloudflare-whole-site-from-a-fork) |
| Cloudflare, one game | A single game on `workers.dev` with guest play and friend rooms, no accounts | [docs/deployment.md](docs/deployment.md#cloudflare-one-game) |

## Project layout

```
platform/              lobby (React) and the /api Worker: accounts, saves, friends, boards, wallet, admin
games/<id>/            one game per directory, each with its own Worker, tests and CHANGELOG
packages/arcade-kit/   shared kit on npm (@yyyu-star/arcade-kit): rooms, client, metering, mobile viewport, table fun, social widgets
packages/arcade-host/  self-hosting runtime on workerd
tools/                 isolation and deploy checks, pinned deployer, module split, git hooks, self-hosting scripts
docs/                  cross-module design (Chinese) and deployment guides (English)
```

Browsers reach the platform at `/` and `/api/*` and each game's own Worker at `/games/<id>/`; games call the platform through service bindings.
Each module carries all of its files, never references files outside its directory (except the shared packages), and can be split into its own repository with `tools/split-module.sh`.
The full rules are in [AGENTS.md](AGENTS.md) and are checked in CI by `tools/check-isolation.mjs`.

## Documentation

Design docs are in Chinese; the ones marked *(English)* are not. [docs/README.md](docs/README.md) lists every document with a reading order.

- [CONTRIBUTING.md](CONTRIBUTING.md) *(English)* — how a change gets in; [AGENTS.md](AGENTS.md) — repository rules for people and AI agents (module independence, rules vs. rendering, determinism, tests, Git)
- [docs/project.md](docs/project.md) — what the project is, who it is for, principles and roadmap
- [docs/architecture.md](docs/architecture.md) — modules, routing and deployment shapes
- [docs/engineering.md](docs/engineering.md) — the quality standard for code, tests, docs and pull requests; [docs/ui.md](docs/ui.md) — UI rules every screen follows
- [docs/new-game.md](docs/new-game.md) — adding a game; [docs/rooms.md](docs/rooms.md) — online-room rules
- [docs/economy.md](docs/economy.md) — the chip economy; [docs/balance.md](docs/balance.md) — difficulty and payout targets
- [docs/table-fun.md](docs/table-fun.md) — emotes and props at the table; [docs/social.md](docs/social.md) — sharing, presence, invites, spectating
- [docs/platform-backend.md](docs/platform-backend.md) — platform backend design and the cost guard; [docs/api.md](docs/api.md) — the `/api` reference
- [docs/self-hosting.md](docs/self-hosting.md) *(English)* — running on your own server; [docs/deployment.md](docs/deployment.md) *(English)* — the deploy pipeline and its security model
- [docs/review-policy.md](docs/review-policy.md) — how pull requests are reviewed and merged
- Module READMEs: [platform](platform/README.md) · [kaipan](games/kaipan/README.md) · [guandan](games/guandan/README.md) · [texas](games/texas/README.md) · [mahjong](games/mahjong/README.md) · [yexun](games/yexun/README.md) · [racing](games/racing/README.md) · [danli](games/danli/README.md) · [haidao](games/haidao/README.md) · [arcade-kit](packages/arcade-kit/README.md) · [arcade-host](packages/arcade-host/README.md) · [tools](tools/README.md)

## Contributing

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). After cloning, run `git config core.hooksPath tools/git-hooks` once.
Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Game assets are generated by the project's own code or come from sources whose licenses allow commercial use; see each module's asset notes.
Kaipan's market data comes from the public-domain WIKI Prices dataset.
