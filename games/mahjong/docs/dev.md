# 雀馆：开发、目录和部署

> 命令、代码目录、两种部署和线上监控。设计见 [DESIGN.md](../DESIGN.md)，模块约定见 [AGENTS.md](../AGENTS.md)。

## 1. 本地开发和命令

需要 Node 22（见 `.nvmrc`）。共用包从 npm 装（`arcade-kit` 是 `@yyyu-star/arcade-kit` 的别名，版本见 `package.json`，代码里写 `arcade-kit/...`），直接 `npm ci` 就行。

提 PR 前跑 `npm run lint`、`npm test` 和 `npm run smoke`；改了好友房、匹配或 Worker，再跑对应的 `smoke:room`、`smoke:match`、`smoke:standalone`（先 `npm run build:cf`）。
CI 在每个 PR 上跑独立性检查、`npm test` 和 `npm run build:cf`；冒烟、模拟和配平不在 CI 里，按下面的说明本地跑。
本地整套和冒烟用的假平台、开发入口在 `dev/`（不部署），`test/` 只放测试。

```bash
# 日常
npm ci
npm run dev          # http://localhost:5176/games/mahjong/（娱乐局直接能玩；平台接口转给 5181）
npm run lint         # Biome 检查
npm test             # 类型检查 + vitest（规则、电脑、架构约束、房间规则）+ workerd 里的 Worker 和房间测试
npm run build        # 页面
npm run smoke        # 无头浏览器冒烟：单机横竖屏各一场（川麻、立直）

# 调参和模拟（含好友房、匹配、单独部署的冒烟）
node scripts/balance.ts 2000 solo:small   # 配平：小白、普通两个模拟玩家在一个场地的期望、胜率、时长（docs/balance.md，DESIGN.md 4.1）
npm run sim 1500     # 模拟器：单机各场地模拟玩家的期望，各性格的打法指标（DESIGN.md 4.1）
node scripts/strength.ts 1200 0,2,3 5   # 一个性格对固定三家的强弱（轮换座位）
node scripts/stake-room.ts 1500 venues   # 好友房实盘桌：两个普通真人对电脑的期望（DESIGN.md 4.1）
npm run build:cf && npm run smoke:room  # 好友房两个浏览器（本地 wrangler dev + 假平台）
npm run build:cf && node scripts/smoke-room-riichi.ts  # 好友房开立直：娱乐打一局、实盘开打再离开带回
npm run build:cf && npm run smoke:match  # 快速匹配：两个浏览器同档同桌、取消、一个人转单机
npm run build:cf && npm run smoke:standalone  # 单独部署：wrangler.jsonc 原样起，两个游客
npm run build:cf && npm run dev:worker  # 本地整套（Worker + 页面 + 假平台），端口由系统分配，打开它打印的地址；登录用 __Host-sid cookie（见 dev/arcade.dev.ts）
node scripts/capture.ts se-port 40      # 截图到 shots/，并报互相压住的元素（land|port|se-land|se-port）
node scripts/fingerprint.ts 12          # 整局指纹：拆文件、搬代码前后各跑一次，每行一组规则，必须逐位相同（加 --mutate 看它能抓到差别）
```

## 2. 目录

| 目录 | 是什么 |
|---|---|
| `src/core/tiles`、`hand`、`table`、`match` | 通用层：牌、向听和听牌、牌桌小件、筹码账 |
| `src/core/variants/<id>/` | 玩法：`sichuan-xuezhan`、`riichi`（都已登记）；`variants/index.ts` 是登记表 |
| `src/ai/` | 电脑（只拿视图）：`personas.ts` 性格，`style.ts` 这一场的状态和局面，`venues.ts` 场地 → 电脑 |
| `src/game/` | 档位和底分（`stakes`）、快速匹配档位（`match`）、钱包操作号（`ops`）、互动编号（`emotes`）、名场面（`banter`、`feed`）、颁奖（`awards`）、大牌判定和结算动画节奏（`bighand`）、模块 id（`id`）、推荐出牌开在哪些桌（`coach`）、选桌页规则表（`rule-spec`、`xuezhan-rules`）、每日挑战（`daily`）、何切（`hekiri`）、听牌速判（`ting`）、擂台（`ladder`）、成就（`achieve`）、图鉴（`dex`）、主页进度（`progress`）、牌局节奏（`pace`：单机电脑想多久、`sleep`）；立直特有的颁奖、无役提醒、规则表在 `riichi/` |
| `src/room/` | 好友房的规则（kit 的 RoomGame：带入带回、座位换人、再来一场），房间和页面共用 |
| `src/net/` | 单机实盘的带入带回（`wallet`，经本模块 Worker 转平台钱包）、云存档（`cloud`）、每日榜（`scores`）、请求封装（`http`） |
| `src/main.ts`、`solo.ts`、`online.ts` | 页面入口（只留启动、全局事件和按地址栏选第一页）、单机牌局（推进、存档、实盘带入带回）、好友房连接（收帧、按顺序播、发操作） |
| `src/storage.ts` | 浏览器存储的读写收口（读写失败不抛），各层都能用 |
| `src/app/` | 页面和流程，按下面「页面层谁管什么」分 |
| `src/view/` | 牌桌（DOM + SVG）、选桌页、主页、规则小册子；`view/variants/<id>/` 是玩法专属的界面（牌桌组件 `ui.ts`、结算 `summary.ts`、引导 `guide.ts`），`page.ts` 是玩法的页面层钩子（`VariantPage`），`view/variants/pages.ts` 是登记表 |
| `worker/` | 登录闸门、单机带入带回、开房进房、房间 DO（`room.ts`） |

### 2.1 页面层谁管什么

依赖只朝一个方向：`main.ts` → `app/` → `solo.ts`、`online.ts` → `core/`、`ai/`、`room/rules.ts`、`game/`、`net/`；`view/` 只画，不 import `app/`（只从 `solo.ts` 拿类型）；`game/`、`net/` 不 import `app/`、`solo.ts`、`online.ts`。`solo.ts`、`online.ts` 也不 import `app/`；这条由 `test/arch.test.ts`「页面层的依赖方向」守着。
每类状态只有一个所有者，别处只读：

| 管什么 | 文件 | 状态放哪 |
|---|---|---|
| 启动、全局事件、地址栏选第一页 | `main.ts`（`entryFromUrl`、`loadAccount`） | 无 |
| 骨架和顶栏（screen、toast、标题、叫朋友、离开） | `app/shell.ts` | DOM 节点 |
| 设置面板（音量、茶馆声、出牌速度、提示和互动、恢复默认） | `app/settings.ts`（shell 搭骨架时调 `mountSettings`） | 偏好在 `app/prefs.ts` |
| 偏好（`mahjong.prefs`）和这次打开的静音 | `app/prefs.ts` | `prefs`、`live` |
| 主页、选桌页、何切、速判、擂台各页的进出 | `app/routes.ts` | `session.lobbyMode` |
| 会话：现在在打的单机或好友房、牌桌、互动、钱包、身份 | `app/session.ts` | `session`，离开时 `app/lifecycle.ts` 的 `dispose` 一处放掉 |
| 单机：开局、接着打、牌桌回调、每日、擂台 | `app/solo-flow.ts` → `solo.ts` 的 `Solo` | `session.solo`；存档 `mahjong.solo` 只由 `solo.ts` 读写 |
| 单机一局 / 一场的结算弹窗、再来一局 | `app/solo-settle.ts` | 钱包带回的那句（按 `Solo` 记） |
| 好友房：开房、进房、等人页、牌桌 | `app/room-flow.ts` → `online.ts` 的 `Online` | `session.online`；房间状态只来自房间，页面不改 |
| 好友房一局 / 一场的结算、跟着再来一场 | `app/room-settle.ts` | `session.followTimer`、`session.endTimer` |
| 快速匹配的排队卡 | `app/match-flow.ts` | `session.matcher` |
| 两边共用的结算零件（翻页、名次、分享卡、颁奖） | `app/settle.ts` | 无 |
| 钱包、身份、好友、云存档、互动、离开、战绩、报错 | `app/wallet.ts`、`identity.ts`、`social.ts`、`cloud.ts`、`fun.ts`、`leave.ts`、`record.ts`、`report.ts` | 钱包和身份在 `session` |
| 页面手感时间（提示条多久、标题闪烁、快速倍率） | `app/timing.ts` | 常量 |
| 牌局节奏（单机电脑想多久、`sleep`） | `game/pace.ts` | 常量，`solo.ts`、`online.ts`、`app/leave.ts` 读 |
| 网络（单机实盘带入带回、云存档、每日榜） | `net/` | 无，调用处传入要的数据 |

`app/` 里的文件有函数级的循环 import（顶栏调离开、离开调选桌页、选桌页调开局……）：模块顶层只放声明，不在顶层调别的 `app/` 文件的函数。
唯一的例外是 `shell.ts` 搭骨架时调 `settings.ts` 的 `mountSettings`，所以 `settings.ts` 不 import `shell.ts`，要重画顶栏时调传进来的 `repaint`。

## 3. 单独部署（不要平台）


用 README 里的 Deploy to Cloudflare 按钮，或者 fork 后在这个目录里 `npm ci && npx wrangler login && npm run deploy`（`deploy` = `build:cf` 再 `wrangler deploy`），
部署到自己的 Cloudflare 账户，得到 `https://mahjong.<你的子域>.workers.dev`，打开后转到 `/games/mahjong/`。`wrangler.jsonc` 就是这份独立配置，不用改。

| 有 | 没有 |
|---|---|
| 单机对三个电脑（娱乐） | 登录：任何人打开就能玩，身份是游客 cookie |
| 好友房：开房、进房、断线重连、托管、再来一场，选桌页填个昵称（不填就是"游客"加 4 位数字） | 钱包和实盘（单机、好友房都只有娱乐） |
| 互动、名场面、称号（只显示在本局结算里） | 战绩、排行榜、称号墙（这些在平台上） |
| 浏览器本地存档（接着打上一场） | 云存档 |

页面用 kit 的 `detectPlatform()` 判断有没有平台：没有时藏起钱包和实盘，"大厅"改成回游戏首页。好友房的额度按 `KIT_QUOTA`（DESIGN.md 第 9 节）。

## 4. 本站部署（部署工具补什么）和线上监控

本站的正式部署由仓库的 `.github/workflows/game-mahjong.yml` 在 main 上经 PR 合并后完成。
部署工具（`tools/deployer`，按 `tools/workers.json`）在这份独立配置上补上平台的东西，模块里不写：

| 类型 | 名字 | 说明 |
|---|---|---|
| 路由 | `<站点>/games/mahjong`、`<站点>/games/mahjong/*` | 部署时注入，同时关掉 `workers_dev` |
| 服务绑定 | `ARCADE` → Worker `arcade` | 平台，认人（`/api/me`）；要先部署平台 |
| 服务绑定 | `WALLET` → `arcade` 的 `WalletService`，`props.game = "mahjong"` | 平台钱包（实盘带入、带回） |
| 变量 | `GATE = "login"`、`SITE_ORIGIN` | 首页要登录；同站校验认的 origin |

模块自己的：Durable Object `ROOM`（`MahjongRoom`）、`METER`（`RoomMeter`），变量 `KIT_QUOTA`（每天的写入预算和开房名额）。
没有 `ARCADE` 时首页和开房发游客 cookie（kit 的独立模式）；`GATE` 是 `login` 却没有 `ARCADE` 时一律拒绝，不会悄悄变成人人可进。

线上监控：
- `GET /games/mahjong/health` 回 `{"ok":true,"version":"<package.json 的版本>"}`：不读存储、不认人，排在登录闸门前面，单独部署也能访问。
- `wrangler.jsonc` 开着 `observability`（Workers 日志，只用 Cloudflare 默认的，不往别处发）。
- 页面启动时调 kit 的 `reportErrors({ game: "mahjong", version })`（`arcade-kit/report`），没人接住的报错发给平台的 `/api/client-error`。
  只发报错文字、调用栈、路径和版本，不带账号和昵称；单独部署没有这个接口，发不出去就算了。
