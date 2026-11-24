# 牌馆 · Card Hall

Guandan (掼蛋, four players, two decks, partners level up from 2 to A) and Dou Dizhu (斗地主, three players, landlord against two farmers) in the browser. Play solo against computer players or with friends in a private room.

**English** · [简体中文](README.zh-CN.md)

![Card Hall cover](public/cover.png)

## Features

- **Full Guandan rules** in a pure, deterministic rules core: every pattern including wild cards, tribute / refusal / return, *jiefeng*, level-ups and the A round. Same seed plus same actions gives the same game.
- **Dou Dizhu**: classic bidding, open-hand doubling, a card counter, 20 endgame puzzles and an auto-generated daily puzzle.
- **Computer players with personalities** that only see their own hand and public information. A counterfactual test checks this, and you can run it yourself.
- **Solo play**: tutorial, three fun difficulties (beginner / normal / pro), stats, a recap after each deal, a daily challenge and achievements.
- **Friend rooms and quick match** with a six-digit code or an invite link. Rooms handle reconnects, auto-play while you are away, spectating and "play again". The server never sends anyone else's cards.
- **Table fun**: props, stickers, phrases and short chat. Computer players react to them.
- **Play chips only**: real-chip tables use the platform wallet. Chips cannot be bought, exchanged or transferred.
- **Mobile friendly**: portrait menus and a landscape table. All art is generated in code (SVG) and all sound is synthesized with WebAudio.

## Quick start

Needs Node 22 (`.nvmrc`). Run these in this directory:

```bash
npm ci
npm run dev      # http://localhost:5174/ (guest mode, saves stay in the browser)
npm test         # vitest: rules, computer players, rooms, architecture checks
npm run build    # production build into dist/
```

Before you send a change, also run `npm run lint`. If you touched rooms, run `npm run test:room`. If you touched the screen, run `npm run shot`. All commands and debug URL parameters are listed in [docs/structure.md](docs/structure.md).

## Project layout

```
src/core/          shared card-hall layer: card encoding, RNG, seat ring
src/variants/
  guandan/         core (rules), ai, net (room rules), stake (real-chip rules)
  doudizhu/        same layers, plus puzzles/
src/net/           room code shared by both games
src/view/          Phaser 4 screens, table widgets, generated art, audio, storage
worker/            Cloudflare Worker: login gate, rooms, quick match, real-chip API
tests/             vitest by layer; tests/room/ runs real rooms in workerd
tools/             simulators, smoke tests and screenshots, build and deploy
docs/              design documents (Chinese)
```

## Documentation

Design docs are in Chinese.

- [AGENTS.md](AGENTS.md): module conventions and pitfalls, for developers and coding agents.
- [docs/structure.md](docs/structure.md): every directory and file, every command, debug URL parameters.
- [docs/design.md](docs/design.md): overall design and trade-offs.
- [docs/rules.md](docs/rules.md): sources for the rules and how regional variants were resolved.
- [docs/core-api.md](docs/core-api.md): the rules-core interface used by the screen layer.
- [docs/ai.md](docs/ai.md): computer players (strength, venues, personalities, measured numbers) and how to verify they never peek (section 8).
- [docs/doudizhu.md](docs/doudizhu.md): how the two games share code, the Guandan golden test, Dou Dizhu modes.
- [docs/view.md](docs/view.md): screen-layer conventions.
- [docs/art.md](docs/art.md): art direction, asset sources and how to rebuild the font subsets.
- [docs/net.md](docs/net.md): friend rooms, real chips, cloud saves, deployment and health checks.
- [docs/stake.md](docs/stake.md), [docs/stake-ddz.md](docs/stake-ddz.md), [docs/stake-sim.md](docs/stake-sim.md): real-chip design for each game and the simulation behind the numbers.
- [docs/storage.md](docs/storage.md): every browser storage key.
- [CHANGELOG.md](CHANGELOG.md): release notes. Older entries are in `docs/changelog-archive*.md`.

## Part of Arcade

This is one module of the Arcade mini-game site. It is mounted at `/games/guandan/` and uses the platform for accounts, cloud saves and the chip wallet. It also deploys on its own: `wrangler.jsonc` is a standalone config, so `npm run deploy` (or the button below) gives you a playable game with guest identity, solo play and friend rooms, but no wallet. See [docs/net.md](docs/net.md) section 7.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/guandan)

Contributions go through pull requests on the Arcade repository. Commit messages start with `guandan:`, and module rules are in [AGENTS.md](AGENTS.md).

## License

MIT, see [LICENSE](LICENSE). The title font is a subset of Noto Serif SC (SIL Open Font License 1.1, see `src/view/fonts/OFL.txt`).
