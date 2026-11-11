# arcade-kit 模块约定

> 总规范见仓库根的 `AGENTS.md`（拆成独立仓库后，以本文件和随附的 docs 为准）。房间规范见仓库根的 `docs/rooms.md`；kit 怎么实现、守哪些规矩见本模块的 `docs/rooms.md`。
> 每个版本改了什么看 `CHANGELOG.md`，本文只写现状和改代码时要守的规矩。

- 内容：联机底座，给各游戏的 Worker 和页面用，不部署、没有自己的 Worker。文件和入口的完整清单看 README 的"目录结构"。
  - 服务端：`room.ts`（DO 房间基类）加不碰 DO 状态的 `room-seats.ts`、`room-rate.ts`、`room-persist.ts`；`worker.ts`、`meter.ts`、`match.ts`、`store.ts`、`together.ts`、`auth.ts`、`guest.ts`、`internal.ts`。
  - 两边共用：`game.ts`、`protocol.ts`、`rng.ts`、`prng.ts`、`chat.ts`。
  - 浏览器：`client.ts`、`viewport.ts`、`fun*.ts`、`table-fun.ts`、`table-chat.ts`、`share.ts`、`qr.ts`、`social.ts`、`theme.ts`、`report.ts`。
  - `testing.ts` 是假平台钱包，只给测试和本地开发。
- 两种形态：npm 上发 `dist/`；仓库里 `package.json` 的 `exports` 一律指 `src/*.ts`，`prepack`/`postpack`（`scripts/manifest.mjs`）打包时换成 dist 版再换回来。
  不要手改 exports 指 dist，不提交 `dist/`；`src/` 里相互引用写 `.js` 扩展名。仓库里的游戏都按 npm 别名装（`npm:@yyyu-star/arcade-kit@^x.y.z`），发布由维护者做。
- 两种部署方式：有 `ARCADE` 绑定是平台模式，不认游客 cookie；没有 `ARCADE` 且 `GATE` 不是 `"login"` 是独立模式（游客）；`GATE: "login"` 没绑 `ARCADE` 必须 fail-closed。`test/guest.test.ts` 的"平台模式不认游客"几条要守住。
- 会进浏览器包或普通 Node 测试的文件（上面"两边共用"和"浏览器"两组加 `chat-words.ts`、`guest.ts`）不能引用 `room.ts`、`match.ts`、`meter.ts`（依赖 `cloudflare:workers`）。`worker.ts`、`auth.ts` 同样要能在 Node 里加载（只引类型）。
- 画面层（`fun.ts`、`table-fun.ts`、`share.ts`、`social.ts`）：import 时不碰 DOM；动画只动 `transform`、`opacity`、不读布局；素材只用 `fun-art.ts` 的手写 SVG，不用 emoji 字体、不引外部资源。
- 牌桌互动（规范见 `docs/table-fun.md`）：`fun-logic.ts` 是纯函数（时间和随机数由调用方给），默认数字就是规范，改了同步改测试和文档。kit 里不出现任何游戏的名字、短语和人物。
- 视口（`viewport.ts`，说明见 `docs/viewport.md`）：规矩以仓库根 AGENTS.md 第 4 节为准，改默认值同步改 `docs/viewport.md` 和测试。
- 主题（`theme.ts`，变量表见 `docs/theme.md`）：DOM 样式的颜色、圆角、字体一律 `var(--ak-xxx, <原值>)`，不传主题外观不变，`test/theme.test.ts` 扫源码守着。`themeVars` 只放行安全的值，不要绕过它直接拼 CSS。
- 可插拔存储（`store.ts`，自托管 PG）：有 `KIT_STORE` 绑定才走 `MirrorStore`，没有时原来的代码路径不动。改存储相关代码两条路都改，`npm test` 的两遍（默认、`vitest.pg.config.ts`）都要过。
  PG 路径的"一步之内不 await、提交失败不广播、`kitWake` 幂等"等由 `test/store.test.ts` 守着；直接读写存储的测试用 `test/helpers.ts` 的两种存储通用帮手。
- 游戏只经 `acceptCreate` / `acceptJoin` / `acceptMatch` 开房进房排队，不自己转发请求；房间 `fetch` 只认 `KIT_HOST` 内部地址。`internal.ts` 不进 `exports`；`auth.ts` 只认人。
- 额度不能挂在房间上被别人挤占：按座位分开算，没入座的连接单独封顶，入座的人永远进得了，单人不能用光房间额度（`maxInboundShare`）。
- 开打后座位绑人（`owners`）：一个 userId 一局只对应一个座位，放宽就会漏别人的手牌。
- 进房猜码限次：超限的人进任何房间都同一个 1013，看不出房间在不在。改 `acceptJoin` 或房间 `fetch` 时守住 `room.test` 的"第三轮审计"几条。
- 房间硬规矩（每条有测试）：只用 `ctx.acceptWebSocket`、一个闹钟、不用 `setTimeout`/`setInterval`；每步写入 ≤ 2 行、没变不写；构造函数和读路径不碰存储；下发前按座位过滤；
  续局中间没有 `await`、广播在 `setAlarm` 之前；闹钟以 `getAlarm()` 为准、不往外抛异常。
- 额度计量：找计量一律在 `entry` 之外 await；计量连不上时不开新房、不进新人，在打的照常；名额必须能自愈（到点作废）；计量自己写的行也记进当天的数。
- 对外的事（`RoomGame.effects` + `GameRoom.perform`）：只在 entry 之外 await，写回和退避是普通的一步；关房前先办完（`ending`），办不完到 `closingMs` 就删。
- 开局随机只经 `begin` 给 256 位熵，`rng.ts` 的 ChaCha20 用 RFC 8439 测试向量锁住；不再给游戏 32 位种子（旧 `start` 已弃用）。
- 协议只加字段、不改含义（部署后旧房间还跑旧代码）。不兼容的改动加 `PROTOCOL_VERSION`，房间用 `minClientVersion` 让旧页面刷新。
- 测试：`npm test`（类型检查、默认和假 PG 两遍 vitest、构建 dist 并检查入口）。改房间行为加测试并做反证；测试的假时间放在将来，见 `test/helpers.ts`。
- 版本号和 `CHANGELOG.md` 各自独立；提交信息以 `arcade-kit:` 开头，分支名 `<模块>/<简短说明>`。
- 电脑短语：`onStep` 是同步钩子（不 await、不写存储、抛错只记日志），`botEmote` 只给电脑座位。真人短语不交给规则和 `onStep`（电脑不读真人互动），
  唯一例外是 `onEmote`，只许用来调 `botEmote`。`test/emote.test.ts` 的 ChattyRoom 守着。
- 好友房聊天（`docs/chat.md`）：`chat.ts` 的过滤是纯函数，房间只校验、过滤、限速、转发，不写存储、不进快照、不交给规则（电脑不读真人说的话）。
  `test/chat.test.ts` 的"不进快照、不进存储""架构"两条守着；正则不用后行断言（iOS 16.4 以前不认），测试扫源码。改过滤规则同步改 `docs/chat.md` 和误伤清单。
- 快速匹配（`docs/match.md`）：排队 DO 0 行存储、一个闹钟，不 import 规则、不读房间状态；凑桌的外部调用都有 `MATCH_CALL_MS` 超时。
  匹配桌是普通 `GameRoom`，别破坏 `kitCreateMatch`、自动开打、外人 4004，`test/match.test.ts` 守着。
- 搭子战绩（`together.ts`）：只在房间服务端经 `WALLET.together()` 报，不重试、不写房间状态；`reportMatch` 按 `owners` 认人，电脑座位不报。平台改形状时同步改 `testing.ts` 和 `test/together.test.ts`。
- 分享卡和邀请（`share.ts`、`social.ts`，说明见 `docs/share.md`）：守画面层规矩；`social.ts` 只在有平台且已登录时挂；kit 不认识任何游戏，名字、图标、主题色都由游戏给。
  二维码链接只用运行时 `location.origin`，`qr.ts` 是纯函数，`test/qr.test.ts` 的解码和已知向量要过；kit 不加运行时依赖。
- 文档里不写正式域名和个人站点，示例域名一律用 `game.example.com`。
