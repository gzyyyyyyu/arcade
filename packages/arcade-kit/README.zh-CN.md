# arcade-kit · 联机底座

给跑在 Cloudflare Workers 上的回合制小游戏用的联机工具包：Durable Object 房间基类、开房进房入口、会重连的浏览器客户端、每天的额度、带种子的 ChaCha20 随机数，以及经平台或以游客认人。

[English](README.md) · **简体中文**

## 功能

- **房间基类** `GameRoom`：入座离座、房主开局、轮流或同时出手、按座位过滤下发、断线保留座位、超时代出、掉线托管、电脑批量出手。
- **服务端说了算**：规则是纯函数，房间和浏览器共用；别人的隐藏信息不出服务端。
- **会重连的客户端** `RoomClient`：退避加抖动重连、静默死连接探测、seq 去重、没确认的操作重发。
- **公平发牌**：每局 256 位熵，ChaCha20 流用 RFC 8439 测试向量锁住。
- **守额度**：计量 `RoomMeter` 管每天的写入额度和开房名额，按座位限入站。
- **两种部署方式**：经 Arcade 平台认人，或不带平台以游客 cookie 独立运行。
- **可选再接**：快速匹配、好友房聊天过滤、牌桌表情和道具、分享卡、在线状态和邀请、主题变量。
- **没有运行时依赖**；只有 ESM，发编译好的 JavaScript 加 `.d.ts`，Node ≥ 22。

## 快速开始

按别名 `arcade-kit` 装，代码里写短路径（`arcade-kit/room`，不写 `@yyyu-star/arcade-kit/room`）：

```bash
npm i arcade-kit@npm:@yyyu-star/arcade-kit
```

一个两人比大小的完整例子：

```ts
// rules.ts：纯函数，房间和浏览器共用
import type { RoomGame } from 'arcade-kit/game';
import { shuffle, stream } from 'arcade-kit/rng';
export type S = { hands: number[][]; turn: number };
export type A = { card: number };
export type V = { mine: number[] | null; counts: number[]; turn: number };
export const rules: RoomGame<S, A, V> = {
  seats: 2, rulesVersion: 1,
  begin: (entropy) => { // 房间给的 256 位熵，绝不能放进 view
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
// worker.ts：wrangler.jsonc 里绑 ROOM（类 Room）和 METER（类 RoomMeter）
import { GameRoom } from 'arcade-kit/room';
import { acceptCreate, acceptJoin, type KitEnv } from 'arcade-kit/worker';
export { RoomMeter } from 'arcade-kit/meter';
export class Room extends GameRoom<S, A, V, KitEnv> { protected readonly game = rules; }
export default {
  fetch(request: Request, env: KitEnv) {
    const path = new URL(request.url).pathname;
    if (path === '/rooms') return acceptCreate(request, env); // POST -> 201 { code }
    const m = /^\/rooms\/([^/]+)\/ws$/.exec(path); // WebSocket 升级
    return m ? acceptJoin(request, env, m[1]!) : new Response('not found', { status: 404 });
  },
};
// browser.ts
import { RoomClient, createRoom } from 'arcade-kit/client';
const made = await createRoom('/rooms', {});
if (!('error' in made)) {
  const client = new RoomClient<A, V>({
    url: `wss://${location.host}/rooms/${made.code}/ws`,
    onMessage: (msg) => console.log(msg), // welcome（整桌快照）和 state（frames）
    onStatus: (status, closeCode) => console.log(status, closeCode),
  });
  client.sit(0); client.start(); client.act({ card: 3 });
}
```

## 子路径

| 入口 | 做什么 |
|---|---|
| `arcade-kit/room` | `GameRoom`：Durable Object 房间基类（座位、轮次、重连、电脑、硬限制） |
| `arcade-kit/worker` | `acceptCreate`、`acceptJoin`、`acceptMatch`、`loginGate` 和给游戏 Worker 的小工具 |
| `arcade-kit/game` | 规则接口 `RoomGame`、快照体积 `snapshotBytes`、匹配档位检查 `matchConfigErrors` |
| `arcade-kit/client` | `RoomClient`、`MatchClient`、`createRoom`、默认文案、`detectPlatform`、`platformSoundOn` |
| `arcade-kit/protocol` | 消息类型、协议版本、关闭码、房间码格式 |
| `arcade-kit/meter` | 计量 `RoomMeter`：每天的写入额度和开房名额（导出并绑成 `METER`） |
| `arcade-kit/match` | 快速匹配排队 `MatchQueue`（Durable Object） |
| `arcade-kit/auth` | `whoIs`、`identify`、`sameOrigin`：经平台或按游客认人 |
| `arcade-kit/guest` | 独立模式：游客 cookie、游客身份、昵称清洗 |
| `arcade-kit/rng` | ChaCha20（RFC 8439）流、均匀整数、洗牌；联机发牌用 |
| `arcade-kit/prng` | 小型确定性 sfc32，给单机规则核心用（不保密，不得用于联机发牌） |
| `arcade-kit/viewport` | 手机可见区、双指放大、安全区、渲染倍数、省内存、WebGL 丢失恢复 |
| `arcade-kit/table-fun`、`fun`、`fun-logic` | 牌桌互动：头像菜单、表情、道具、电脑反应、聊天界面 |
| `arcade-kit/chat` | 好友房聊天过滤（房间和页面共用），单机 `localChat` |
| `arcade-kit/share` | 分享卡绘制（带二维码）、系统分享或预览 |
| `arcade-kit/social` | 在线状态、好友邀请、邀请面板、报名场面 |
| `arcade-kit/personas` | 共用电脑名册：名字、头像、性格、换打法 |
| `arcade-kit/theme` | DOM 组件的主题变量 `--ak-*` |
| `arcade-kit/report` | `reportErrors`：把没人接住的页面报错报给平台 |
| `arcade-kit/testing` | 假平台钱包，只给测试和本地开发 |

`room`、`meter`、`match`、`testing` 引了 `cloudflare:workers`，要用 Workers 打包工具（wrangler、esbuild、`@cloudflare/vitest-plugin`）；其余子路径在普通 Node 里也能加载。类型引用 `@cloudflare/workers-types`（可选的 peer 依赖）。

## 游戏怎么接

1. **规则**：实现 `RoomGame<S, A, V, O, E>`，都是纯函数。在 `begin(entropy, rulesVersion, setup)` 里把熵当 `rng` 的密钥发牌，`view` 绝不带它；`view(state, seat)` 只放这个座位看得到的；`apply` 的 `{ error }` 只能是固定的短码。测试里用 `snapshotBytes` 断言快照上限。
2. **房间类**：`export class Room extends GameRoom<S, A, V, Env> { protected readonly game = rules; }`，改限制写 `{ ...DEFAULT_LIMITS, turnMs: 20_000 }`。
3. **计量**：入口文件 `export { RoomMeter } from 'arcade-kit/meter';`，`wrangler.jsonc` 绑 `ROOM`、`METER`，迁移里写 `new_sqlite_classes`。正式环境一定要绑 `METER`：没绑时不限额、不计数。
4. **Worker 路由**：只接 `acceptCreate`（`POST …/rooms`，201 `{ code }`）和 `acceptJoin`（`GET …/rooms/<码>/ws`），不自己把浏览器的请求转给房间。
5. **浏览器**：`new RoomClient({ url, clientVersion, onMessage, onStatus })`，再 `sit`、`start`（房主）、`act`、`leave`、`close`。收到 `welcome` 整桌重画，`state` 按 `frames` 播；`onStatus('closed', 关闭码)` 按码提示，`failed` 时让用户点 `retry()`。
6. **可选**：聊天、快速匹配、牌桌互动、分享卡、主题。
7. **部署方式**：有服务绑定 `ARCADE` 连 Arcade 平台时经平台 `/api/me` 认人（要登录）；没有且 `GATE` 不是 `"login"` 时独立运行，用游客 cookie。

房间协议只加字段；不兼容的改动加 `PROTOCOL_VERSION`，旧页面会被要求刷新。版本号守 semver；1.0 以前次版本可能改行为。

## 本地开发

```bash
npm ci
npm test        # 类型检查 + vitest（workerd 里跑真的 Durable Object、WebSocket 休眠接口和闹钟，默认和假 PG 存储各一遍）+ 构建 dist 并检查每个入口
npm run build   # 只构建 dist/
npm pack        # 构建、把 exports 换成 dist 版、打 tgz、再换回来
```

仓库里 `exports` 指向 `src/*.ts`；`prepack`/`postpack`（`scripts/manifest.mjs`）发包时换成 `dist/`。发出去的包带 `dist`、`src` 和 `CHANGELOG.md`。`test/worker.ts` 里的测试游戏 Worker 是最小的完整接法。`demo/` 是能在浏览器里点的小例子：用任意认得 TypeScript 的开发服务器打开这个目录（比如 `npx vite`），访问 `/demo/`。

## 目录结构

```
arcade-kit/
├─ src/        每个子路径一个同名文件，另有内部部件（room-*.ts、store.ts、qr.ts、internal.ts……）
├─ test/       vitest 用例和测试用的游戏 Worker
├─ demo/       牌桌互动、分享、社交的浏览器例子
├─ docs/       各子路径的用法和规矩
└─ scripts/    manifest.mjs 打包时换 exports
```

## 文档

文档在仓库里，npm 包不带。

- [rooms](docs/rooms.md)：完整接法，错误码和关闭码、`RoomClient` 字段、额度、假钱包、带注释的源码清单。
- [room-options](docs/room-options.md)：`RoomGame` 的可选接口：开局选项、座位换人、对外的事、不轮流的操作、停顿、电脑短语。
- [deploy-modes](docs/deploy-modes.md)：平台模式和独立模式、自托管存储、游戏要准备的绑定和变量。
- [match](docs/match.md)：快速匹配排队。
- [chat](docs/chat.md)：好友房聊天的过滤、限速和界面。
- [table-fun](docs/table-fun.md)：头像菜单、表情、道具和电脑反应。
- [share](docs/share.md)：分享卡、在线状态和邀请。
- [personas](docs/personas.md)：共用电脑名册。
- [viewport](docs/viewport.md)：手机和平板的视口处理。
- [theme](docs/theme.md)：`--ak-*` 主题变量。
- [sound](docs/sound.md)：大厅静音带进游戏。
- [CHANGELOG](CHANGELOG.md)：更新日志。

## 属于 Arcade

这是 [Arcade](https://github.com/gzyyyyyyu/arcade) 仓库的 `packages/arcade-kit/` 模块，单独发到 npm；Arcade 的游戏用它搭联机房间。源码和问题反馈：<https://github.com/gzyyyyyyu/arcade/tree/main/packages/arcade-kit>。

## 许可证

MIT，见 [LICENSE](LICENSE)。
