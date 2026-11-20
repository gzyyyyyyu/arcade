# mahjong 模块约定（《雀馆》）

> 总规范见仓库根的 `AGENTS.md`（拆成独立仓库后，以本文件和 `DESIGN.md` 为准）。设计正本是 [DESIGN.md](DESIGN.md)。

- 模块 id `mahjong`，Worker 名 `mahjong`，路径 `/games/mahjong/`，开发端口 5176、预览 4176；工具用系统分配的临时端口（端口写 0）。
- 只改 `games/mahjong/`；不读、不引用其他游戏的源码。共用的东西只走共用包（npm 上的 `@yyyu-star/arcade-kit`，按别名 `arcade-kit` 装）和平台的公开 `/api`。
- **一套引擎 + 多个玩法**（DESIGN.md 第 3 节）：通用层 `src/core/{tiles,hand,table,match}` 不认识任何玩法；玩法在 `src/core/variants/<id>/`，玩法之间不互相 import；
  房间、单机、界面、电脑都按玩法 id 驱动（`src/core/variants/index.ts`、`src/ai/index.ts`）；类型从登记表的 `VariantMap` 推出（`StateOf`、`ViewOf`、`ActionOf`、`OptsOf`），加玩法时登记表加一行，别处不手写联合类型。立直麻将按 `docs/riichi.md`，入口开关在 `src/view/variants/riichi/gate.ts`（已放开）。
- 规则核心 `src/core/` 和电脑 `src/ai/` 是纯函数：不碰 DOM、网络；不用 `Math.random`、`Date.now`、`new Date`、结果依赖平台的数学函数；
  随机只用 `arcade-kit/rng`（ChaCha20）按"用途 + 序号"分流（`deal` 洗牌、`swap` 换牌方向、`seat` 首庄、`persona` 挑电脑和这一场的状态）。
  电脑只拿视图（`src/ai/` 不出现状态类型）。`test/arch.test.ts` 检查这些。
- 隐藏信息：`view` 只放这个座位能看到的；别人的手牌、牌墙、密钥、换三张的牌、声明窗口里别人的选择一律不下发。
  声明窗口的名单是所有没胡的别家，真人的回答走 kit 的 `free`（DESIGN.md 第 6 节），改这块要保住"从外面看不出谁能碰杠胡"。
- 改了电脑或底分，跑 `node scripts/balance.ts <局数> <场地>`（娱乐每格 200 局、实盘每格 2,000 局，离群超过 20 个点才追；小白、普通两个模拟玩家对 [`docs/balance.md`](docs/balance.md) 的目标，每个场地开一个进程），再跑 `npm run sim`（性格强弱再跑 `scripts/strength.ts`，好友房实盘桌再跑 `scripts/stake-room.ts`；场地表在 `src/ai/venues.ts`），结果写进 `docs/balance-results.md`（DESIGN.md 4.1 只留做法和结论）。
- 改了立直的电脑或换筹码的 `SHARE_POINTS`，跑 `node scripts/sim-riichi.ts 300 hanchan` 和 `… tonpuu`，再跑配平 `node scripts/balance-riichi.ts <场数> <场地> <hanchan|tonpuu>`（小白、普通对 `docs/balance.md`；娱乐每格 200 场、实盘每格 2,000 场，本机跑），结果写进 `docs/riichi.md` 第 7 节和 `docs/balance-results.md`。
- 只搬代码、不该改行为的重构（拆文件、改名、挪函数）动了 `src/core/` 或 `src/ai/`：前后各跑 `node scripts/fingerprint.ts 40`，每一行都要逐位相同。
- 改了牌桌布局，跑 `node scripts/capture.ts land|port 40` 看截图和"压住了"的报告（DESIGN.md 第 7 节）。测试够用就停：日常只跑改到的单测，交审前整套单测、lint、build 一次，冒烟只跑受影响的流程、电脑 1280 和手机竖屏两个尺寸。
- 筹码：钱包是平台的（服务绑定 `WALLET`，`props.game = "mahjong"`）；不能买、不能兑换、不能转让，界面写明"无任何现金价值"。
  显示钱包、平台的错误一律按 `docs/platform-backend.md` 15.10 的对照表说人话（`src/view/text.ts`）。
- `wrangler.jsonc` 是能单独部署的独立配置：不写平台绑定（`ARCADE`、`WALLET`）和 `GATE`，本站部署时由仓库的部署工具补上（README 的部署两节）。
  没有平台时 Worker 认游客、实盘回 `no_wallet`，页面按 `detectPlatform()` 藏起钱包和实盘；`test/worker/standalone.test.ts` 覆盖。
- 快速匹配（档位、排队、三人桌，见 DESIGN.md 6.3）：改了档位、房间的 `options` 或座位数，`test/match-tier.test.ts` 的 `matchConfigErrors` 必须还是 `[]`；Worker 入口的具名导出只有 `MahjongRoom`、`RoomMeter`、`Queue`（`test/worker/match.test.ts` 守着）。
  `wrangler.jsonc` 已上线的迁移（v1、v2）不能改，加 DO 类另起一条新 tag，并同步 `test/wrangler.test.jsonc`、`dev/wrangler.smoke.jsonc`。改了排队、匹配桌，跑 `npm run build:cf && npm run smoke:match`（一次只开一个无头浏览器）。
- 线上监控（README 的部署一节）：`/games/mahjong/health` 排在 Worker 最前面，不许读存储、认人或调平台；页面最先调 `reportErrors`。改了这块，`test/worker/api.test.ts`、`standalone.test.ts` 的健康检查一起改。
- 浏览器存储的键一律 `mahjong.` 前缀（[docs/storage.md](docs/storage.md)）。
- 目录：`test/` 只放测试（vitest 和 `test/worker` 的 workerd 测试）；本地整套和冒烟用的假平台、开发入口、wrangler 配置在 `dev/`，都不部署。
- 云存档（docs/practice-modes.md「云存档」）只同步擂台一个槽 `ladder`；加槽时在那里写上，合并规则写成纯函数并加单测（`test/cloud.test.ts`）。
- 提交信息以 `mahjong:` 开头，分支 `mahjong/<说明>`；只暂存明确路径。
- 提交前 `npm run lint` 要过（Biome，配置 `biome.jsonc` 照 arcade-host 的模板，不在模块里改规则）；确实有意这么写的用 `// biome-ignore lint/<组>/<规则>: <理由>` 单行放行。
