# arcade-kit · 联机底座

Multiplayer toolkit for small turn-based games on Cloudflare Workers: a Durable Object room base class, create/join entry points, a reconnecting browser client, daily quotas, a seeded ChaCha20 RNG, and platform or guest identity.

**English** · [简体中文](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/README.zh-CN.md)

## Features

- **Room base class** `GameRoom`: seats, host start, turn-based or simultaneous moves, per-seat filtered views, seats kept on disconnect, turn timers, bot takeover and batched bot moves.
- **Server-authoritative**: rules are pure functions shared by room and browser; hidden information never leaves the server.
- **Reconnecting client** `RoomClient`: backoff with jitter, dead-connection probing, sequence de-duplication and resend of unacknowledged moves.
- **Fair dealing**: 256-bit entropy per game and ChaCha20 streams locked to the RFC 8439 test vectors.
- **Cost guard**: a daily write and room quota meter (`RoomMeter`) with per-seat inbound limits.
- **Two deploy modes**: identify players through the Arcade platform, or run standalone with guest cookies.
- **Optional extras**: quick-match queue, friend-room chat filter, table emotes and props, share cards, presence and invites, theme variables.
- **No runtime dependencies**; ESM only, compiled JavaScript plus `.d.ts`, Node ≥ 22.

## Quick start

Install under the alias `arcade-kit` so imports stay short (`arcade-kit/room` instead of `@yyyu-star/arcade-kit/room`):

```bash
npm i arcade-kit@npm:@yyyu-star/arcade-kit
```

A two-seat card game, end to end:

```ts
// rules.ts: pure functions, shared by the room and the browser
import type { RoomGame } from 'arcade-kit/game';
import { shuffle, stream } from 'arcade-kit/rng';
export type S = { hands: number[][]; turn: number };
export type A = { card: number };
export type V = { mine: number[] | null; counts: number[]; turn: number };
export const rules: RoomGame<S, A, V> = {
  seats: 2, rulesVersion: 1,
  begin: (entropy) => { // 256-bit entropy from the room; never put it in a view
    const deck = shuffle(Array.from({ length: 10 }, (_, i) => i + 1), stream(entropy, 'deal', 0));
    return { hands: [deck.slice(0, 3), deck.slice(3, 6)], turn: 0 };
  },
  start: () => { throw new Error('deprecated, use begin'); },
  parse: (raw) => (typeof (raw as A | null)?.card === 'number' ? { card: (raw as A).card } : null),
  apply: (s, seat, a) => s.turn !== seat || !s.hands[seat]!.includes(a.card) ? { error: 'illegal_move' }
    : { hands: s.hands.map((h, i) => (i === seat ? h.filter((c) => c !== a.card) : h)), turn: 1 - seat },
  turn: (s) => (s.hands.every((h) => h.length === 0) ? null : s.turn),
  view: (s, seat) => ({ mine: seat === null ? null : s.hands[seat]!, counts: s.hands.map((h) => h.length), turn: s.turn }),
  ai: (s, seat) => ({ card: s.hands[seat]![0]! }),
  over: (s) => s.hands.every((h) => h.length === 0),
};
// worker.ts: bind ROOM (class Room) and METER (class RoomMeter) in wrangler.jsonc
import { GameRoom } from 'arcade-kit/room';
import { acceptCreate, acceptJoin, type KitEnv } from 'arcade-kit/worker';
export { RoomMeter } from 'arcade-kit/meter';
export class Room extends GameRoom<S, A, V, KitEnv> { protected readonly game = rules; }
export default {
  fetch(request: Request, env: KitEnv) {
    const path = new URL(request.url).pathname;
    if (path === '/rooms') return acceptCreate(request, env); // POST -> 201 { code }
    const m = /^\/rooms\/([^/]+)\/ws$/.exec(path); // WebSocket upgrade
    return m ? acceptJoin(request, env, m[1]!) : new Response('not found', { status: 404 });
  },
};
// browser.ts
import { RoomClient, createRoom } from 'arcade-kit/client';
const made = await createRoom('/rooms', {});
if (!('error' in made)) {
  const client = new RoomClient<A, V>({
    url: `wss://${location.host}/rooms/${made.code}/ws`,
    onMessage: (msg) => console.log(msg), // welcome (full snapshot) and state (frames)
    onStatus: (status, closeCode) => console.log(status, closeCode),
  });
  client.sit(0); client.start(); client.act({ card: 3 });
}
```

## Subpaths

| Import | What it is |
|---|---|
| `arcade-kit/room` | `GameRoom`: Durable Object room base class (seats, turns, reconnect, bots, limits) |
| `arcade-kit/worker` | `acceptCreate`, `acceptJoin`, `acceptMatch`, `loginGate`, and small response helpers for the game Worker |
| `arcade-kit/game` | `RoomGame` rule interface, `snapshotBytes`, `matchConfigErrors` |
| `arcade-kit/client` | `RoomClient`, `MatchClient`, `createRoom`, default texts, `detectPlatform`, `platformSoundOn` |
| `arcade-kit/protocol` | Message types, protocol version, close codes, room-code format |
| `arcade-kit/meter` | `RoomMeter` daily write and room quota (export it, bind it as `METER`) |
| `arcade-kit/match` | `MatchQueue`: quick-match queue Durable Object |
| `arcade-kit/auth` | `whoIs`, `identify`, `sameOrigin`: identify players through the platform or as guests |
| `arcade-kit/guest` | Standalone mode: guest cookie, guest identity, nickname cleaning |
| `arcade-kit/rng` | ChaCha20 (RFC 8439) streams, uniform integers, shuffle; for dealing in online rooms |
| `arcade-kit/prng` | Small deterministic sfc32 PRNG for single-player rule cores (not secret, never for online dealing) |
| `arcade-kit/viewport` | Mobile visible area, pinch zoom, safe area, render scale, low-memory and WebGL-loss handling |
| `arcade-kit/table-fun`, `fun`, `fun-logic` | Table interactions: avatar menu, emotes, props, bot reactions, chat UI |
| `arcade-kit/chat` | Friend-room chat filter shared by the room and the page, plus single-player `localChat` |
| `arcade-kit/share` | Share card drawing (with QR code) and system share or preview |
| `arcade-kit/social` | Presence, friend invites, invite panel, feed moments |
| `arcade-kit/personas` | Shared bot roster: names, faces, traits, style switching |
| `arcade-kit/theme` | `--ak-*` theme variables for the DOM components |
| `arcade-kit/report` | `reportErrors`: report uncaught page errors to the platform |
| `arcade-kit/testing` | Fake platform wallet for tests and local dev only |

`room`, `meter`, `match` and `testing` import `cloudflare:workers` and need a Workers bundler (wrangler, esbuild, `@cloudflare/vitest-plugin`); every other subpath also loads in plain Node. Types reference `@cloudflare/workers-types` (optional peer dependency).

## Integrating a game

1. **Rules**: implement `RoomGame<S, A, V, O, E>` as pure functions. Deal in `begin(entropy, rulesVersion, setup)` using the entropy as the `rng` key, and never put it in a view; `view(state, seat)` contains only what that seat may see; `apply` returns `{ error }` with a short fixed code. Assert snapshot size with `snapshotBytes` in tests.
2. **Room class**: `export class Room extends GameRoom<S, A, V, Env> { protected readonly game = rules; }`; override limits with `{ ...DEFAULT_LIMITS, turnMs: 20_000 }`.
3. **Meter**: `export { RoomMeter } from 'arcade-kit/meter';`, bind `ROOM` and `METER` in `wrangler.jsonc` with `new_sqlite_classes` migrations. Always bind `METER` in production: without it there is no quota and no counting.
4. **Worker routes**: only `acceptCreate` (`POST …/rooms`, 201 `{ code }`) and `acceptJoin` (`GET …/rooms/<code>/ws`); never forward browser requests to the room yourself.
5. **Browser**: `new RoomClient({ url, clientVersion, onMessage, onStatus })`, then `sit`, `start` (host), `act`, `leave`, `close`. Redraw on `welcome`, play `state` frames, show a message per close code on `onStatus('closed', code)`, and offer `retry()` on `failed`.
6. **Optional**: chat, quick match, table interactions, share cards, theme.
7. **Deploy modes**: with a service binding `ARCADE` to the Arcade platform, players are identified through its `/api/me` (login required); without it, and `GATE` not `"login"`, the game runs standalone with guest cookies.

The room protocol only adds fields; incompatible changes bump `PROTOCOL_VERSION` and old pages are asked to reload. Semver; before 1.0 a minor bump may change behaviour.

## Development

```bash
npm ci
npm test        # type check + vitest in workerd (real Durable Objects, hibernating WebSockets, alarms; default and fake-PG storage) + build dist and check every entry
npm run build   # build dist/ only
npm pack        # build, swap exports to dist, pack a tgz, swap back
```

In the repository `exports` point at `src/*.ts`; `prepack`/`postpack` (`scripts/manifest.mjs`) swap them to `dist/` for publishing. The published package contains `dist`, `src` and `CHANGELOG.md`. The test game Worker in `test/worker.ts` is a complete minimal integration. `demo/` holds clickable browser examples: serve the folder with any dev server that understands TypeScript (for example `npx vite`) and open `/demo/`.

## Project layout

```
arcade-kit/
├─ src/        one file per subpath, plus internal parts (room-*.ts, store.ts, qr.ts, internal.ts …)
├─ test/       vitest suites and the test game Workers
├─ demo/       browser examples for table fun, share and social
├─ docs/       usage and rules for each subpath (Chinese)
└─ scripts/    manifest.mjs swaps exports at pack time
```

## Documentation

Design docs are in Chinese and live in the repository (not in the npm package).

- [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) — full integration guide: error and close codes, `RoomClient` fields, quotas, fake wallet, annotated source map.
- [room-options](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/room-options.md) — optional `RoomGame` hooks: setup options, seat swaps, side effects, simultaneous moves, pauses, bot phrases.
- [deploy-modes](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/deploy-modes.md) — platform vs standalone mode, self-hosted storage, bindings and variables a game needs.
- [match](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/match.md) — quick-match queue.
- [chat](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/chat.md) — friend-room chat: filtering, rate limits, UI.
- [table-fun](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/table-fun.md) — avatar menu, emotes, props and bot reactions.
- [share](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/share.md) — share cards, presence and invites.
- [personas](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/personas.md) — the shared bot roster.
- [viewport](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/viewport.md) — phone and tablet viewport handling.
- [theme](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/theme.md) — `--ak-*` theme variables.
- [sound](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/sound.md) — carrying the lobby mute into games.
- [CHANGELOG](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/CHANGELOG.md) — version history.

## Part of Arcade

This is the `packages/arcade-kit/` module of the [Arcade](https://github.com/gzyyyyyyu/arcade) repository, published to npm on its own; Arcade's games build their online rooms on it. Source and issues: <https://github.com/gzyyyyyyu/arcade/tree/main/packages/arcade-kit>.

## License

MIT, see [LICENSE](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/LICENSE).
