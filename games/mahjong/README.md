# 雀馆 · Mahjong

Browser mahjong built as one engine with pluggable rule variants: Sichuan "Bloody Battle" (血战到底) and Japanese riichi mahjong. Play solo against computer players or with friends in a private room.

**English** · [简体中文](README.zh-CN.md)

<img src="public/cover.svg" alt="Mahjong cover" width="360">

## Features

- **Sichuan Bloody Battle**: tile swap, void suit, kongs paid on the spot, multiple winners on one discard, end-of-hand checks. Rule options include Bloody River (keep winning after you win) and a three-player two-suit table.
- **Riichi mahjong**: Tenhou-style four players, hanchan, east-only or a single hand, three red fives.
- **Computer players**: nine personalities whose form changes each session. They only see what a player at their seat could see. Three fun difficulties, and real-chip tables get stronger at higher stakes.
- **Friend rooms and quick match**: share a link, auto-play when someone drops, take over a seat mid-game, spectate, "play again". Quick match seats strangers at the same stake.
- **Daily modes**: daily challenge, daily discard quiz, tenpai speed drill and a teahouse ladder, with daily leaderboards on the platform.
- **Feel and art**: wait hints, discard suggestions for beginners, safe-tile marks, drag to discard and big-hand effects. Tiles and pictures are generated in code (DOM + SVG) and sound is synthesized with WebAudio.
- **Collection and achievements**: a yaku / fan collection and 22 achievements, stored on the device.
- **Play chips only**: real-chip tables use the platform wallet. Chips have no cash value and cannot be bought, exchanged or transferred.

## Quick start

Needs Node 22 (`.nvmrc`). Run these in this directory:

```bash
npm ci
npm run dev      # http://localhost:5176/games/mahjong/ (solo play works without the platform)
npm test         # type check + vitest (rules, computer players, architecture, room rules) + Worker tests in workerd
npm run build    # production build
```

Before a pull request, also run `npm run lint` and `npm run smoke`. Room, quick-match and standalone smoke tests, simulators and balance scripts are listed in [docs/dev.md](docs/dev.md).

## Project layout

```
src/core/          engine: tiles, hand analysis, table pieces, chip ledger
  variants/<id>/   rule variants: sichuan-xuezhan, riichi
src/ai/            computer players (view only), personalities, venues
src/game/          stakes, quick match, daily modes, achievements, collection
src/room/          friend-room rules shared by the room and the page
src/app/ src/view/ page flow, table (DOM + SVG), home and table-picker screens
worker/            Cloudflare Worker: login gate, real-chip API, rooms
test/              vitest and workerd tests
dev/ scripts/      local fake platform; smoke tests, simulators, screenshots
docs/              design documents (Chinese)
```

## Documentation

Design docs are in Chinese.

- [DESIGN.md](DESIGN.md): the design index. Each chapter lives in `docs/design-*.md` (rules, engine, chips, computer players, online, screens).
- [AGENTS.md](AGENTS.md): module conventions and pitfalls, for developers and coding agents.
- [docs/dev.md](docs/dev.md): every command, the full directory map, standalone and site deployment, health checks.
- [docs/riichi.md](docs/riichi.md): the riichi variant.
- [docs/practice-modes.md](docs/practice-modes.md): daily challenge, discard quiz, tenpai drill, ladder, cloud save.
- [docs/online-social.md](docs/online-social.md): table fun, share images, awards, friends.
- [docs/table.md](docs/table.md): table layout and effects.
- [docs/collection.md](docs/collection.md): collection and achievements.
- [docs/balance.md](docs/balance.md), [docs/balance-results.md](docs/balance-results.md): balance targets and measured results.
- [docs/art.md](docs/art.md): art direction.
- [docs/storage.md](docs/storage.md): every browser storage key.
- [ASSETS.md](ASSETS.md): asset sources and licenses.
- [CHANGELOG.md](CHANGELOG.md): release notes. Older entries are in `docs/changelog-archive-*.md`.

## Part of Arcade

This is one module of the Arcade mini-game site. It is mounted at `/games/mahjong/` and uses the platform for accounts, leaderboards, cloud saves and the chip wallet. It also deploys on its own: `wrangler.jsonc` is a standalone config, so `npm run deploy` (or the button below) gives you a playable game with guest identity, solo play and friend rooms, but no wallet. See [docs/dev.md](docs/dev.md) section 3.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/mahjong)

Contributions go through pull requests on the Arcade repository. Commit messages start with `mahjong:`, and module rules are in [AGENTS.md](AGENTS.md).

## License

MIT, see [LICENSE](LICENSE). The title font is a subset of Noto Serif SC (SIL Open Font License 1.1, see [ASSETS.md](ASSETS.md)).
