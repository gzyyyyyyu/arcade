# arcade-kit 模块约定

> 总规范见仓库根 `AGENTS.md`（拆成独立仓库后以本文件和 docs 为准）。房间规范见仓库根 `docs/rooms.md`，kit 的实现和规矩见本模块 `docs/rooms.md`。
> 每版改动看 `CHANGELOG.md`；本文只写现状和规矩，括号里是守着它的测试。

- 内容：联机底座，给游戏的 Worker 和页面用，不部署；文件分服务端、两边共用、浏览器三组，清单见 `docs/rooms.md`「目录结构」；`testing.ts` 是假钱包。
- 发包：npm 发 `dist/`；仓库里 `exports` 一律指 `src/*.ts`，`prepack`/`postpack`（`scripts/manifest.mjs`）打包时换成 dist。不手改 exports、不提交 `dist/`；`src/` 里互相引用写 `.js`。游戏按 npm 别名装，发布由维护者做。
- 部署方式：有 `ARCADE` 绑定是平台模式（不认游客 cookie）；没有且 `GATE` 不是 `"login"` 是独立模式；`GATE: "login"` 没绑 `ARCADE` 必须 fail-closed（`test/guest.test.ts`、`gate.test.ts`）。
- 浏览器和 Node 里加载的文件不引 `room.ts`、`match.ts`、`meter.ts`（依赖 `cloudflare:workers`）；`worker.ts`、`auth.ts` 只引类型。
- 画面层（`fun.ts`、`table-fun.ts`、`share.ts`、`social.ts`）：import 时不碰 DOM；动画只动 transform、opacity；素材只用 `fun-art.ts` 手写 SVG。kit 里（含注释）不出现游戏名和玩法短语；人物只在共用名册 `personas.ts`。
- 牌桌互动（`docs/table-fun.md`）：`fun-logic.ts` 纯函数，默认数字即规范，改了同步改测试、文档。
- 视口（`docs/viewport.md`）、主题（`docs/theme.md`）：DOM 样式一律 `var(--ak-xxx, <原值>)`，`themeVars` 只放行安全值（`test/theme.test.ts` 扫源码）。
- 存储（`store.ts`，自托管 PG）：有 `KIT_STORE` 才走 `MirrorStore`；改存储两条路都改，`npm test` 默认和 `vitest.pg.config.ts` 两遍都过（`test/store.test.ts`）。
- 开房进房：游戏只经 `acceptCreate` / `acceptJoin` / `acceptMatch`；房间 `fetch` 只认 `KIT_HOST`；`internal.ts` 不进 exports；`auth.ts` 只认人。
- 额度：按座位分开算，没入座的单独封顶，入座的人永远进得来，单人不能用光房间额度（`maxInboundShare`）。猜码限次：超限的人进任何房间都同一个 1013（`room.test`「第三轮审计」）。
- 开打后座位绑人（`owners`）：一个 userId 一局一个座位，放宽就漏手牌（`room.test`）。等人时最后一个人离开、没别人连着就关房还名额（`quota.test`）。
- 房间硬规矩（各有测试）：只 `ctx.acceptWebSocket`；一个闹钟、以 `getAlarm()` 为准、不往外抛；服务端文件不用 `setTimeout`/`setInterval`（`room.test` 扫全部服务端源码）；每步写入 ≤2 行、没变不写；构造和读路径不碰存储；下发前按座位过滤；续局中间没有 `await`、广播在 `setAlarm` 之前。
- 计量：找计量在 `entry` 外 await；开房找计量有超时（`METER_CALL_MS`，超时退回可能晚到的占位）；连不上时不开新房、不进新人、在打的照常；名额到点自愈；计量自己的写也记进当天的数（`quota.test`）。
- 对外的事（`RoomGame.effects` + `GameRoom.perform`）：只在 entry 外 await；关房前先办完（`ending`），办不完到 `closingMs` 就删。
- 随机：开局只经 `begin` 给 256 位熵，`rng.ts` 的 ChaCha20 用 RFC 8439 向量锁住（`rng.test`）。旧 `start` 32 位种子的退路保留（朋友的游戏可能在用），只 warn。
- 协议只加字段、不改含义；不兼容的改动加 `PROTOCOL_VERSION`，房间用 `minClientVersion` 让旧页面刷新。
- 电脑短语：`onStep` 同步、不写存储、抛错只记日志；`botEmote` 只给电脑座位；真人短语只经 `onEmote` 调 `botEmote`（`test/emote.test.ts`）。
- 好友房聊天（`docs/chat.md`）：过滤是纯函数；房间只校验、过滤、限速、转发，不写存储、不进快照、不交给规则；正则不用后行断言（`test/chat.test.ts`）。节奏默认值只在 `chat.ts` 的 `CHAT_RATE`、`EMOTE_RATE`。
- 快速匹配（`docs/match.md`）：排队 DO 0 行存储、一个闹钟，不 import 规则、不读房间状态，外部调用有 `MATCH_CALL_MS` 超时；别破坏 `kitCreateMatch`、自动开打、外人 4004（`test/match.test.ts`）。
- 搭子战绩（`together.ts`）：只在房间服务端经 `WALLET.together()` 报，不重试、不写房间状态，按 `owners` 认人（`test/together.test.ts`）。
- 分享和社交（`docs/share.md`）：`social.ts` 只在有平台且已登录时挂，平台没问出来（unknown）按 `SOCIAL_DETECT_RETRY` 再问；社交请求都有超时（`SOCIAL_FETCH_MS`）；二维码只用 `location.origin`，`qr.ts` 纯函数；kit 不加运行时依赖。
- 测试：`npm test`（类型检查、默认和假 PG 两遍、构建 dist 查入口）；改房间行为加测试并反证。
- 版本号、`CHANGELOG.md` 独立；提交以 `arcade-kit:` 开头，分支 `<模块>/<说明>`。文档不写正式域名，示例用 `game.example.com`。
