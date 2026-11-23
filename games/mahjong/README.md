# 雀馆 · Mahjong (games/mahjong)

A browser mahjong game built as one engine with pluggable rule variants: **Sichuan "Bloody Battle" (血战到底)** (four players, or the three-player two-suit table) and **Japanese riichi mahjong** are both live.
Play solo against three computer opponents (they only ever see what a player at their seat could see), or open a friends' room and play together online.
Plain TypeScript with DOM + SVG rendering (every tile and picture is generated in code); the server is a Cloudflare Worker with a Durable Object per room, built on
[`@yyyu-star/arcade-kit`](https://www.npmjs.com/package/@yyyu-star/arcade-kit).
It is one module of the Arcade monorepo, but deploys on its own too (see "单独部署这个游戏" below): solo play and guest friends' rooms work without the platform.
Chips are play money only — they cannot be bought, cashed out or transferred. MIT licensed.

Quick start (Node 22): `npm ci && npm run dev`, then open http://localhost:5176/games/mahjong/ — solo play works without the platform.
Before a pull request run `npm run lint`, `npm test` and `npm run smoke`. Contribution flow: [CONTRIBUTING.md](https://github.com/gzyyyyyyu/arcade/blob/main/CONTRIBUTING.md). The rest of this README is in Chinese.

<img src="public/cover.svg" alt="雀馆封面" width="360">

## 功能

细节都在 [DESIGN.md](DESIGN.md)，括号里是章节。

- **川麻·血战到底**：换三张、定缺、刮风下雨、一炮多响、查花猪查大叫，局数、封顶、换三张、自摸加底、呼叫转移可选（第 2 节）。
- **血流成河**：川麻的规则选项，胡了不下桌接着摸打、能连胡，底分减半（2.10）。
- **三人两房**：川麻的规则选项，3 人只用筒条、不定缺，两家胡了就结束（2.11）。
- **立直麻将**：天凤式四人，半庄、东风战或一局，赤宝牌 3 张（[docs/riichi.md](docs/riichi.md)）。
- **电脑**：六个性格，每场状态不同，只拿自己座位能看到的信息；娱乐三档难度，实盘档位越高越强（第 5 节）。
- **单机和实盘**：娱乐直接玩；实盘从平台钱包带筹码上桌、一局一结（第 4 节）。以上玩法娱乐、实盘、好友房都开。
- **好友房和快速匹配**：分享链接叫朋友、掉线托管、中途接管、旁观、再来一场；快速匹配和陌生人按档位排桌（第 6 节）。
- **每日挑战、每日何切、听牌速判、茶馆擂台**：每天同一副牌或同一套题，登录后进平台每日榜；擂台连打三桌拿称号，称号云存档（[docs/practice-modes.md](docs/practice-modes.md)）。
- **快速一局**：主页最大的按钮，一键开一局一结的单机，约 2 分钟。
- **互动和社交**：扔道具、表情、四川话短语、电脑起哄；战绩分享图（不含牌）、好友房颁奖、好友在线和叫人（[docs/online-social.md](docs/online-social.md)）。
- **手感和画面**：听牌提示、新手和小档的推荐出牌、安全牌角标、拖牌出牌、大牌演出，减少动态效果时自动收敛（第 7 节）。
- **图鉴和成就**：番型 / 役收集、22 个成就，存在本机（[docs/collection.md](docs/collection.md)）。
- **手机**：横屏竖屏都能玩，小到 iPhone SE。

立直麻将见 [docs/riichi.md](docs/riichi.md)，画风见 [docs/art.md](docs/art.md)，配平目标见 [docs/balance.md](docs/balance.md)，模块约定见 [AGENTS.md](AGENTS.md)，素材来源见 [ASSETS.md](ASSETS.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 本地开发

需要 Node 22（见 `.nvmrc`）。共用包从 npm 装（`arcade-kit` 是 `@yyyu-star/arcade-kit` 的别名，版本见 `package.json`，代码里照旧写 `arcade-kit/...`），直接 `npm ci` 就行。

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
npm run build:cf && node scripts/smoke-room-riichi.ts  # 好友房开立直：娱乐打一局、实盘开打再离开结回
npm run build:cf && npm run smoke:match  # 快速匹配：两个浏览器同档同桌、取消、一个人转单机
npm run build:cf && npm run smoke:standalone  # 单独部署：wrangler.jsonc 原样起，两个游客
npm run build:cf && npm run dev:worker  # 本地整套（Worker + 页面 + 假平台），端口由系统分配，打开它打印的地址；登录用 __Host-sid cookie（见 dev/arcade.dev.ts）
node scripts/capture.ts se-port 40      # 截图到 shots/，并报互相压住的元素（land|port|se-land|se-port）
node scripts/fingerprint.ts 12          # 整局指纹：拆文件、搬代码前后各跑一次，每行一组规则，必须逐位相同（加 --mutate 看它能抓到差别）
```

## 单独部署这个游戏（不要平台）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/mahjong)

点上面的按钮，或者 fork 后在这个目录里 `npm ci && npx wrangler login && npm run deploy`（`deploy` = `build:cf` 再 `wrangler deploy`），
部署到自己的 Cloudflare 账户，得到 `https://mahjong.<你的子域>.workers.dev`，打开后转到 `/games/mahjong/`。`wrangler.jsonc` 就是这份独立配置，不用改。

| 有 | 没有 |
|---|---|
| 单机对三个电脑（娱乐） | 登录：任何人打开就能玩，身份是游客 cookie |
| 好友房：开房、进房、断线重连、托管、再来一场，选桌页填个昵称（不填就是"游客"加 4 位数字） | 钱包和实盘（单机、好友房都只有娱乐） |
| 互动、名场面、称号（只显示在本局结算里） | 战绩、排行榜、称号墙（这些在平台上） |
| 浏览器本地存档（接着打上一场） | 云存档 |

页面用 kit 的 `detectPlatform()` 判断有没有平台：没有时藏起钱包和实盘，"大厅"改成回游戏首页。好友房的额度照 `KIT_QUOTA`（DESIGN.md 第 9 节）。

## 部署（本站）

本站的正式部署由仓库的 `.github/workflows/game-mahjong.yml` 在 main 上经 PR 合并后完成，整体做法见仓库根 README 的部署一节。
部署工具（`tools/deployer`，按 `tools/workers.json`）在这份独立配置上补上平台的东西，模块里不写：

| 类型 | 名字 | 说明 |
|---|---|---|
| 路由 | `<站点>/games/mahjong`、`<站点>/games/mahjong/*` | 部署时注入，同时关掉 `workers_dev` |
| 服务绑定 | `ARCADE` → Worker `arcade` | 平台，认人（`/api/me`）；要先部署平台 |
| 服务绑定 | `WALLET` → `arcade` 的 `WalletService`，`props.game = "mahjong"` | 平台钱包（实盘带入、结回） |
| 变量 | `GATE = "login"`、`SITE_ORIGIN` | 首页要登录；同站校验认的 origin |

模块自己的：Durable Object `ROOM`（`MahjongRoom`）、`METER`（`RoomMeter`），变量 `KIT_QUOTA`（每天的写入预算和开房名额）。
没有 `ARCADE` 时首页和开房发游客 cookie（kit 的独立模式）；`GATE` 是 `login` 却没有 `ARCADE` 时一律拒绝，不会悄悄变成人人可进。

线上监控：
- `GET /games/mahjong/health` 回 `{"ok":true,"version":"<package.json 的版本>"}`：不读存储、不认人，排在登录闸门前面，单独部署也能访问。
- `wrangler.jsonc` 开着 `observability`（Workers 日志，只用 Cloudflare 默认的，不往别处发）。
- 页面启动时调 kit 的 `reportErrors({ game: "mahjong", version })`（`arcade-kit/report`），没人接住的报错发给平台的 `/api/client-error`。
  只发报错文字、调用栈、路径和版本，不带账号和昵称；单独部署没有这个接口，发不出去就算了。

## 目录结构

| 目录 | 是什么 |
|---|---|
| `src/core/tiles`、`hand`、`table`、`match` | 通用层：牌、向听和听牌、牌桌小件、筹码账 |
| `src/core/variants/<id>/` | 玩法：`sichuan-xuezhan`、`riichi`（都已登记）；`variants/index.ts` 是登记表 |
| `src/ai/` | 电脑（只拿视图）：`personas.ts` 性格，`style.ts` 这一场的状态和局面，`venues.ts` 场地 → 电脑 |
| `src/game/` | 档位和底分（`stakes`）、快速匹配档位（`match`）、单机推进（`driver`）、钱包操作号（`ops`）、互动编号（`emotes`）、名场面（`banter`、`feed`）、颁奖（`awards`）、大牌判定和结算动画节奏（`bighand`） |
| `src/room/` | 好友房的规则（kit 的 RoomGame：带入结回、座位换人、再来一场），房间和页面共用 |
| `src/net/` | 单机实盘的带入结回（经本模块 Worker 转平台钱包） |
| `src/main.ts`、`solo.ts`、`online.ts` | 页面入口（只留启动和全局事件）、单机控制器、好友房连接 |
| `src/app/` | 页面和流程：`shell`（骨架和顶栏）、`routes`（主页、选桌页）、`session`（会话状态）、`prefs`、`wallet`、`identity`、`solo-flow`、`room-flow`、`room-settle`、`match-flow`、`settle`、`fun`、`leave`、`social`、`lifecycle`、`record` |
| `src/view/` | 牌桌（DOM + SVG）、选桌页、主页、规则小册子；`view/variants/<id>/` 是玩法专属的界面（牌桌组件 `ui.ts`、结算 `summary.ts`、引导 `guide.ts`），`page.ts` 是玩法的页面层钩子（`VariantPage`），`view/variants/pages.ts` 是登记表 |
| `worker/` | 登录闸门、单机带入结回、开房进房、房间 DO（`room.ts`） |

## 许可证

MIT，见 [LICENSE](LICENSE)（和仓库根的一样，拆成独立仓库时直接带走）。
