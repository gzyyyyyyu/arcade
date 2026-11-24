# 夜巡 · Night Patrol

A survivors-like action game in the browser: a young Taoist patrols a snowy old town at night while talismans, peach-wood swords and thunder charms fire on their own.

**English** · [简体中文](README.zh-CN.md)

![Night Patrol cover](public/cover.webp)

## Features

- **Two modes.** **Vigil**: survive the hopping-corpse hordes until dawn. **Night Raid**: sneak into a town, loot chests and get out while an exit gate is open.
- **You only steer.** Gear fires on its own; level up, pick one of three upgrades, evolve and combine your gear.
- **Lots to build.** 24 weapons, 20 passives and 10 schools; 10 characters, each with their own gear pool and an active skill.
- **Places and threats.** 8 Vigil maps and 6 raid towns plus a tutorial town, one map event per map, bosses, elites, curses, danger levels 0–5 plus nightmare 1–3.
- **Reasons to come back.** Daily Vigil, a boss rush (daily or free), weekly challenges with leaderboards, permanent upgrades, 70 achievements and local replays.
- **Live mode.** With the Arcade wallet you can stake play chips in Vigil or Night Raid (four tiers each, same rules as casual). Chips are play money only: they can't be bought, cashed out or transferred.
- **Deterministic core.** A fixed 30-tick-per-second simulation: same seed + same inputs = the same run, which replays and the bot simulator rely on.
- **Everything generated in code.** Sprites are drawn with Canvas 2D and sounds synthesized with Web Audio; no image or audio files.

## Quick start

Node 22 (see `.nvmrc`), in this directory:

```sh
npm ci
npm run dev       # http://localhost:5178/
npm test          # type checks (page + Worker) + vitest
npm run build:cf  # deploy build to dist-cf/games/yexun/
```

Simulator, smoke tests, screenshots and other tools: the command table in [AGENTS.md](AGENTS.md). Screenshots and smoke tests need `playwright-core` with chromium-headless-shell and a Chinese font.

Deploy on your own: `npm ci && npx wrangler login && npm run deploy` gives you `yexun.<your-subdomain>.workers.dev`; `/` redirects to `/games/yexun/`. Without the platform there is no login, cloud save, leaderboard or live mode; casual play works as usual.

## Project layout

```
src/
  core/       deterministic simulation (30 ticks/s, no DOM, network, clock or Math.random)
  content/    content tables: weapons, foes, maps, characters, live-mode multipliers
  explore/    Night Raid rules: map generation, chests, guards, exits, scoring
  view/       Phaser scenes, DOM UI, generated art and audio
  platform/   local save, cloud save, live mode client
  online/     leaderboards, daily, weekly challenges, sharing
  replay/     local replays
worker/       the game's Worker: login gate, live buy-in and payout, coin-to-chip exchange, /health
tools/        smoke tests, screenshots, simulator, bots, cover, font subset
tests/        vitest, split by layer
docs/         design docs
```

## Documentation

Design docs are in Chinese. [DESIGN.md](DESIGN.md) is the index; section numbers are shared across the design files.

- [docs/design-play.md](docs/design-play.md) — the pitch, quality bar, the two modes, new-player protection, boss rush, trials and weekly goals.
- [docs/design-content-1.md](docs/design-content-1.md) — content rules, weapons, passives, evolutions and combinations.
- [docs/design-content-2.md](docs/design-content-2.md) — sets and schools, foes and bosses, maps.
- [docs/design-content-3.md](docs/design-content-3.md) — characters, permanent upgrades, card picks, the night market.
- [docs/design-live.md](docs/design-live.md) — live mode: rules, payout multipliers, character and map factors, balance targets.
- [docs/design-arch.md](docs/design-arch.md) — architecture (core, content, view, input and replays, platform, Worker, leaderboards) and performance budgets.
- [docs/design-art-tools.md](docs/design-art-tools.md) — art and sound style, bots and balancing tools, tests.
- [docs/design-misc.md](docs/design-misc.md) — registrations, content scale, known issues, acceptance criteria, how it fits the platform.
- [docs/art.md](docs/art.md) — UI flow, HUD, layouts per screen size, low-memory devices, palette.
- [docs/balance-play.md](docs/balance-play.md) — measured balance data for every school.
- [ASSETS.md](ASSETS.md) — where every asset comes from and its license.
- [AGENTS.md](AGENTS.md) — module conventions: rules core, UI, commands, storage keys, release.
- [CHANGELOG.md](CHANGELOG.md) — what changed in each version; older entries start at [docs/changelog-archive.md](docs/changelog-archive.md).

## Part of Arcade

Night Patrol is one module of the Arcade mini-game arcade (`games/yexun`) and can be split out and deployed on its own; see the repository root for the platform and contribution guide.

## License

MIT, see [LICENSE](LICENSE). The brush font `public/fonts/brush.woff2` is a subset of Ma Shan Zheng under SIL OFL 1.1 ([OFL.txt](public/fonts/OFL.txt)); details in [ASSETS.md](ASSETS.md).
