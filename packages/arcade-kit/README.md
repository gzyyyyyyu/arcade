# arcade-kit

Multiplayer toolkit for small turn-based games on Cloudflare Workers: a Durable Object room base class, create/join entry points for your game Worker,
a reconnecting browser client, a daily write-quota meter, a seeded ChaCha20 RNG, and platform or standalone (guest) identity.
小游戏共用的联机底座：好友房、开房进房、浏览器连接、每天的额度，德州、牌馆、雀馆等游戏的好友房都用它。每个版本改了什么见 `CHANGELOG.md`，本文只写现状。

## Install

```bash
npm i @yyyu-star/arcade-kit
```

To keep imports short (`arcade-kit/room` instead of `@yyyu-star/arcade-kit/room`), install it under the alias `arcade-kit`:

```bash
npm i arcade-kit@npm:@yyyu-star/arcade-kit
```

`package.json` then reads `"arcade-kit": "npm:@yyyu-star/arcade-kit@^0.25.1"`. ESM only; each subpath ships compiled JavaScript plus `.d.ts`. Node ≥ 22.

## Minimal example

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
| `arcade-kit/client` | `RoomClient`, `MatchClient`, `createRoom`, default texts, `detectPlatform` |
| `arcade-kit/protocol` | Message types, protocol version, close codes, room-code format |
| `arcade-kit/meter` | `RoomMeter` daily write and room quota (export it, bind it as `METER`) |
| `arcade-kit/match` | `MatchQueue`: quick-match queue Durable Object |
| `arcade-kit/auth` | `whoIs`, `identify`, `sameOrigin`: identify players through the platform or as guests |
| `arcade-kit/guest` | Standalone mode: guest cookie, guest identity, nickname cleaning |
| `arcade-kit/rng` | ChaCha20 (RFC 8439) streams, uniform integers, shuffle; for dealing in online rooms |
| `arcade-kit/prng` | Small deterministic sfc32 PRNG for single-player rule cores (not secret) |
| `arcade-kit/viewport` | Mobile visible area, render scale, low-memory and WebGL-loss handling |
| `arcade-kit/table-fun`, `fun`, `fun-logic` | Table interactions: avatar menu, emotes, props, bot reactions, chat UI |
| `arcade-kit/chat` | Friend-room chat filter shared by the room and the page |
| `arcade-kit/share` | Share card drawing and system share or preview |
| `arcade-kit/social` | Presence, friend invites, invite panel, feed moments |
| `arcade-kit/theme` | `--ak-*` theme variables for the DOM components |
| `arcade-kit/report` | `reportErrors`: report uncaught page errors to the platform |
| `arcade-kit/testing` | Fake platform wallet for tests and local dev only |

- **Two modes.** With a service binding `ARCADE` to the Arcade platform, players are identified through the platform's `/api/me` (login required).
  Without it (and `GATE` not set to `"login"`) the game runs standalone: the Worker issues a guest cookie and anyone can play. See [docs/deploy-modes.md](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/deploy-modes.md).
- **Runtime.** `room`, `meter`, `match` and `testing` import `cloudflare:workers` and need a Workers bundler (wrangler, esbuild, `@cloudflare/vitest-plugin`);
  every other subpath also loads in plain Node. Types reference `@cloudflare/workers-types` (optional peer dependency).
- **Versioning.** Semver; before 1.0 a minor bump may change behaviour. The room protocol only adds fields; incompatible changes bump `PROTOCOL_VERSION` (old pages are asked to reload).
- Source and issues: <https://github.com/gzyyyyyyu/arcade/tree/main/packages/arcade-kit>. License: MIT.

下面是中文说明。文档在仓库的 `docs/` 里（npm 包不带），链接都指向 GitHub。

## 功能和文档

文档目录：<https://github.com/gzyyyyyyu/arcade/tree/main/packages/arcade-kit/docs>。

| 入口 | 做什么 | 细节 |
|---|---|---|
| `room` | 房间基类 `GameRoom`：入座离座、房主开局、轮流或同时出手、按座位过滤下发、断线保留座位、超时代出、掉线托管、电脑批量出手、硬限制；转出搭子战绩 `reportTogether` | [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md)、[room-options](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/room-options.md) |
| `worker` | `acceptCreate`、`acceptJoin`、`acceptMatch`：查 Origin、认人、找房间；`loginGate` 首页登录闸门；`standaloneRoot`、`json`、`readJson` | [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) |
| `auth`、`guest` | 经平台 `/api/me` 认人（fail-closed）、按部署方式认人、同站校验；独立模式的游客 cookie 和昵称清洗 | [deploy-modes](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/deploy-modes.md) |
| `meter` | 计量 `RoomMeter`：每天的写入额度、每人和全站的开房名额；`meterReport`、`meterLevel` 给房间以外的 DO 用 | [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) 的"每天的额度" |
| `game` | 规则接口 `RoomGame`、快照体积 `snapshotBytes`、匹配档位检查 `matchConfigErrors` | [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) |
| `client` | `RoomClient`：退避加抖动重连、静默死连接探测、seq 去重、没确认的操作重发；`MatchClient`；`createRoom`、默认文案；`detectPlatform` | [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) |
| `protocol` | 消息类型、协议版本、关闭码、房间码格式 | |
| `rng`、`prng` | 联机发牌用 ChaCha20 流；单机规则核心用 sfc32（种子 32 位、不保密，**不得用于联机发牌**） | |
| `viewport` | 手机平板的可见区、双指放大、安全区、渲染倍数、省内存、WebGL 丢失恢复 | [viewport](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/viewport.md) |
| `table-fun`、`fun`、`fun-logic` | 牌桌互动：头像菜单、短语、表情、道具、冷却护盾连击、电脑反应、聊天界面 | [table-fun](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/table-fun.md) |
| `chat` | 好友房聊天过滤（链接、号码整条拒发，脏话打码）、单机 `localChat`；不落库 | [chat](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/chat.md) |
| `match` | 快速匹配排队 `MatchQueue`：每个档位一个实例、一个闹钟，凑满或到点开桌 | [match](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/match.md) |
| `share`、`social` | 分享卡（1080×1350，带二维码）；报位置、收好友邀请、叫朋友来、报名场面 | [share](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/share.md) |
| `theme` | DOM 组件的主题变量 `--ak-*`，不传主题外观不变 | [theme](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/theme.md) |
| `report` | `reportErrors`：把没人接住的页面报错报给平台 `/api/client-error` | [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) |
| `testing` | 假平台钱包（`WalletService`、`FakeBank`、`walletHttp`），只给测试和本地开发 | [rooms](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) 的"假钱包" |

内部地址和身份头（`src/internal.ts`）不在 `exports` 里，游戏引用不到。房间规范见仓库根 [docs/platform-backend.md](https://github.com/gzyyyyyyu/arcade/blob/main/docs/platform-backend.md) 第 4 节。

## 游戏怎么接

详细版（错误码、关闭码、`RoomClient` 字段）见 [docs/rooms.md](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md)。

1. 装依赖：`npm i @yyyu-star/arcade-kit`，或按别名 `arcade-kit@npm:@yyyu-star/arcade-kit` 装（仓库里的游戏都用别名，代码写 `arcade-kit/room`）。
2. 写规则：实现 `RoomGame<S, A, V, O, E>`，都是纯函数，浏览器和房间共用。开局用 `begin(entropy, rulesVersion, setup)`，把 256 位熵当 `rng` 的密钥发牌，`view` 绝不带它；
   `view(state, seat)` 只放这个座位看得到的；`apply` 的 `{ error }` 原样发给出手的人，只能是固定的短码。测试里用 `snapshotBytes` 断言快照上限。
   开局选项、座位换人、对外的事、不轮流的操作、停顿、快捷短语等见 [docs/room-options.md](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/room-options.md)。
3. 房间类：`export class Room extends GameRoom<S, A, V, Env> { protected readonly game = rules; }`，要改限制就 `{ ...DEFAULT_LIMITS, turnMs: 20_000 }`。
4. 计量：入口文件 `export { RoomMeter } from 'arcade-kit/meter';`，`wrangler.jsonc` 绑 `ROOM`、`METER`，迁移里写 `new_sqlite_classes`。**正式环境一定要绑 `METER`**：没绑时不限额、不计数。
5. Worker 路由只接 `acceptCreate`（`POST …/rooms`，成功 201 `{ code }`）和 `acceptJoin`（`GET …/rooms/<码>/ws`），不要自己把浏览器的请求转给房间。
6. 浏览器：`new RoomClient({ url, clientVersion, onMessage, onStatus })`，`sit`、`start`（房主）、`act`、`leave`、`close`；收到 `welcome` 整桌重画，`state` 按 `frames` 播放；
   `onStatus('closed', 关闭码)` 按码提示，`failed` 时让用户点重试 `retry()`。
7. 可选再接：好友房聊天（[chat](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/chat.md)）、快速匹配（[match](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/match.md)）、牌桌互动、分享卡、主题。
8. 不带平台也能部署成独立游戏（游客身份）：见 [docs/deploy-modes.md](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/deploy-modes.md)。

## 包的两种形态

- npm 上发编译好的 `dist/`（JS + `.d.ts`）；包里带 `dist`、`src` 和 `CHANGELOG.md`，不带 `docs/`、`AGENTS.md`、测试。
- 仓库里 `package.json` 的 `exports` 指向 `src/*.ts`，模块内的测试和开发直接用源码；`prepack` 构建 `dist` 并把 `exports` 换成 dist 版，`postpack` 换回来（`scripts/manifest.mjs`）。
  所以不要手改 `exports` 成 dist，新加入口照 `"./x": "./src/x.ts"` 写。
- 仓库里的游戏和发布后的用法一样，都按 npm 别名装（`"arcade-kit": "npm:@yyyu-star/arcade-kit@^0.25.1"`）。
- `src/` 里相互引用写 `.js` 扩展名（`./auth.js`），编出来的 JS 原样能被 Node 原生 ESM 解析；vite、esbuild、tsc 对源码会映射回 `.ts`。

## 本地开发

```bash
npm ci
npm test        # 类型检查 + vitest（本地 workerd 里跑真的 Durable Object、WebSocket 休眠接口和闹钟，默认和假 PG 各一遍）+ 构建 dist 并检查每个入口
npm run build   # 只构建 dist/（tsconfig.build.json）
npm pack        # prepack 构建并把 exports 换成 dist 版，打出 tgz，postpack 换回来
```

在本模块目录里运行。测试用的游戏 Worker 在 `test/worker.ts`（最小的"比大小"规则，是接入的完整例子；可选接口用 `test/ledger.ts` 的"记账桌"和 `test/pause.ts` 测），
平台的 `/api/me` 用假的服务绑定代替（`vitest.config.ts`），假钱包 `WALLET` 绑回测试 Worker 自己导出的 `WalletService`。测试里的站点一律是示例域名 `game.example.com`。
`demo/` 是能在浏览器里点的小例子（`npx vite` 后打开 `/demo/`）。

## 目录结构

- `src/`：每个子路径一个同名文件（`room.ts`、`worker.ts`、`client.ts`……）；`room-seats.ts`、`room-rate.ts`、`room-persist.ts` 是房间里不碰 DO 状态的部分，
  `store.ts` 是可插拔存储，`together.ts` 是搭子战绩，`table-chat.ts` 是牌桌互动里的聊天界面，`qr.ts` 是二维码编码器，`chat-words.ts` 是打码词表，`fun-art.ts` 是手写 SVG，`internal.ts` 是内部地址和身份头（不导出）。完整注释版见 [docs/rooms.md](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/rooms.md) 末尾。
- `docs/`：各子模块的用法和房间规矩；`test/`：vitest 和测试用的游戏 Worker；`demo/`：浏览器里的小例子；`scripts/manifest.mjs`：打包时换 `exports`。

## 发布

kit 自己不部署、没有 Worker：发到 npm（`npm publish`，由维护者做；`publishConfig.access` 是 public），游戏把它打包进自己的 Worker 和页面。
CI 的 `pkg-arcade-kit.yml` 只跑测试；kit 改动时依赖它的游戏的流程也会跑一遍测试。游戏要准备的绑定和变量见 [docs/deploy-modes.md](https://github.com/gzyyyyyyu/arcade/blob/main/packages/arcade-kit/docs/deploy-modes.md)。

## 许可证

MIT，见 `LICENSE`。
