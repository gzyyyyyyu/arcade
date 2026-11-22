# Arcade · Texas Hold'em

No-limit Texas Hold'em for 2–9 players: solo against computer players, Sit & Go tournaments and friend rooms, one game of the Arcade mini-game site on Cloudflare Workers.
To run it: `npm ci && npm run dev` (page on :5175), `npm test` for type check, unit and workerd tests, `npm run smoke` for the headless browser test (after `npm run build:cf`); all commands are listed under "本地开发" below.
Design lives in [DESIGN.md](DESIGN.md) (overview) and [docs/](docs/) (rules, AI, online, screens, scenes, economy, tournament, testing, deploy, art); module conventions in [AGENTS.md](AGENTS.md).

- **Solo play** against 1–5 computer players, entirely in the browser: ten personalities, three fun difficulties (beginner / normal / expert) and four real-chip tables tuned against simulated players.
- **Sit & Go tournaments** (solo: classic 6-player, turbo 6-player with blinds rising twice as fast, or 9-player with top-3 payouts; friend rooms: classic 6-player) and **quick match** (queue for a table of real players).
- **Friend rooms** with a six-digit code or an invite link (built on the shared `arcade-kit` room); empty seats are filled by the computer, and the server never sends anyone else's hole cards.
- **Table fun** — props, stickers and taunts, with computer players that react — from the shared `arcade-kit/table-fun` component.
- **Play chips only**: chips live in the platform wallet and have no cash value; they cannot be bought, exchanged or transferred.
- **Standalone deploy**: `wrangler.jsonc` deploys as-is without the platform (guest identity, solo and friend rooms, no wallet).

![A six-player table at showdown](docs/img/table.webp)

Contributions are welcome: see [CONTRIBUTING.md](https://github.com/gzyyyyyyu/arcade/blob/main/CONTRIBUTING.md) in the main repository for branches, pull requests and review; issues and pull requests go to the main [gzyyyyyyu/arcade](https://github.com/gzyyyyyyu/arcade) repository.

The rest of this README, the design document (`DESIGN.md`) and the code comments are in Simplified Chinese. MIT licensed, see [LICENSE](LICENSE).

---

# 德州扑克（texas）

无限注德州扑克，一桌 2–9 人：单机对电脑（全在浏览器里跑）、好友房（基于 `arcade-kit`，空位电脑补）、快速匹配和淘汰的锦标赛（经典 6 人、极速赛、9 人赛）。
筹码跨场保留，存在平台的钱包里（几个游戏共用一个余额，`docs/economy.md`），先选娱乐（不碰钱包）或实盘；筹码只是游戏积分，**无任何现金价值**：不能买、不能换钱换物、不能转给别人，输光了靠每日补给。
也能不带平台单独部署（见下面"单独部署这个游戏"）：单机和游客好友房照常玩，没有登录、钱包和实盘。

- 路径：`/games/texas/`（Worker 名 `texas`），开发端口 5175，预览 4175
- 设计细节见 [DESIGN.md](DESIGN.md)，开发约定见 [AGENTS.md](AGENTS.md)，素材来源见 [ASSETS.md](ASSETS.md)，美术见 [docs/art.md](docs/art.md)，
  当前版本见 `package.json` 的 `version`，各版改了什么见 [CHANGELOG.md](CHANGELOG.md)。标题页左边牌扇下面显示版本号。

## 功能

- **单机**：对 1–5 个电脑，10 种性格，每种有自己的风格（松凶、紧凶、跟注站、爱诈唬……入池、加注、下注大小、爱犯的小错都不一样），高档的会按位置、筹码深浅和对手的公开打法调整，想多久随局面和性格变但不透露牌力（docs/ai.md 4.3、4.11）；娱乐分新手、普通、高手三个难度，实盘四档（docs/ai.md 4.3、4.10）。娱乐桌不碰钱包，实盘从平台钱包带一份上桌、离桌结回。要跟注时赔率条写"胜率约 X% · 要过 Y%"（跟注提示，只在单机桌，设置里能关，docs/screens.md 8.2）。牌局存在浏览器里，刷新接着打。
- **好友房**：六位房间码或邀请链接，空位电脑补，服务端说了算、不下发别人的底牌（docs/online.md 6）。现金桌和锦标赛开房时都可选实盘四档或娱乐：实盘现金桌至少两个真人才发牌，娱乐现金桌一个人也能开打（空位电脑补，筹码不算数）；锦标赛至少两个真人（第 14 节）。**快速匹配**排队凑一桌，有实盘四档和一个娱乐档，娱乐档开的是筹码不算数的娱乐房间（docs/online.md 6.11）。
- **锦标赛**（Sit & Go）：打到剩一人；单机有经典 6 人、极速赛（6 人、涨盲快一倍）和 9 人赛，娱乐、实盘都有，好友房是经典 6 人（第 14 节）。**止盈**：赢够自动起身（8.13）。
- **快速局 · 全下或弃牌**（只有娱乐）：6 人、每人 10 个大盲，只点“全下 / 弃牌”（面对全下是“跟注全下 / 弃牌”），翻牌前定胜负，15 手或输光一局，几十秒一手；电脑版 A 全下、F 弃牌；结果卡记在浏览器本地最好成绩；另有**今日局**：每天同一副牌，一天记一次分上平台每日榜（docs/features.md 13.10）。
- **今日赛**（只有娱乐）：每天一场 6 人极速赛，牌堆、电脑性格和座位当天人人一样，难度固定“普通”；当天第一场按名次和手数记分（第 1 名最高 6100）上平台每日榜，之后重打是练习（docs/tournament.md 14.5）。
- **成就**：30 个铜银金成就（牌型、全下、诈唬、赢过每个电脑、连胜、锦标赛名次……），单机和单机锦标赛里拿，标题页有成就墙，存在浏览器本地（docs/features.md 13.9）。
- **每日谜题**：每天（北京日期）5 道牌局题，所有人一样，选弃牌、跟注、加注或全下；每道揭晓看赢面对要的赢面的条和一句为什么，按和最优选择的 EV 差给分（每道 100、满分 500），答完总分上平台每日榜，可以晒一下；不碰钱包，进度存在浏览器本地（docs/features.md 13.11）。
- **新手指引**：第一次轮到出手时一步步指着桌上的底牌、公共牌、按钮和牌型讲（3 步；从牌桌的"?"再看时电脑多一页快捷键），前几手有情境提示（结果、摊牌、加注、底池）；大厅的"怎么玩"、牌桌上的"?"随时再看（docs/features.md 13.8）。
- **互动**：短语、表情、道具、聊天，单机里电脑会回，用 kit 的 `table-fun`（13.7）。
- **登录闸门**：首页要先在平台登录（`GATE=login`）；单独部署时没有闸门，认游客（10.1）。
- **画面**：牌桌是 DOM + CSS，没有画布和 WebGL；横屏、竖屏牌桌都有，按仓库 AGENTS.md 第 4 节处理 iOS 的高度、双指放大和 safe-area（docs/screens.md 8.1–8.3）。
- **大场面**：全下后底牌一起翻开、每家标实时胜率，转牌河牌前心跳停顿、慢翻；葫芦以上赢有庆祝和筹码雨，转牌领先八成却输了的冒"被逆转"；筹码声按池子大小分四档（docs/scenes.md 8.10）。好友房只放不占时间的轻效果。
- **素材**：全部由本模块的代码生成，没有图片、音频、字体文件。
- **地址参数**：`?room=123456` 直接进这个房间，`?online=1` 直接到好友房选桌、输码那一行亮一下（6.2）。

## 本地开发
```bash
npm ci
npm run dev           # 页面（vite，5175）；钱包连不上时娱乐照常，设 TEXAS_WORKER=<本地 Worker 端口> 把 api/、/api/wallet* 转给 Worker
npm run build:cf      # 页面打包到 dist-cf/games/texas/（Worker 的静态资源），并把 _headers（assets 长缓存）拷到 dist-cf/
npm run smoke         # 冒烟：先 build:cf；本地起 Worker + 无头 Chromium，跑单机（打满 30 手、补码、离桌结算、回大厅）、手机横屏、双指放大、竖屏、好友房、快速匹配，
                      # 再用原样的 wrangler.jsonc 起一个单独部署的 Worker 跑单机和游客好友房；
                      # --only desktop|mobile|portrait|room|match|standalone 只跑一段，tall|guide|tp|tour|tourfmt|tourroom|devices|scenes|noscroll|lobbyui|settings|dialogs|ach|puzzle|pushfold|dailytour|bigmoments|roomsoak|roomweak 只能单独指定（docs/testing.md 第 9 节；devices 是 27 个尺寸的多尺寸检查，加 --lobby 只查主页和选桌页；scenes 是牌桌各种局面的互压检查，8.2；roomsoak 好友房长跑量内存和连接、roomweak 后台和弱网后恢复，第 6 节）
npm run capture -- [--device desk|phone|both] [--every 250] [--secs 40] [--auto] [--out 目录]
                      # 连拍：本地起页面、娱乐桌自动打，每隔固定毫秒截一张，拼成带时间的 4×4 大图，逐帧看节奏（不进 CI）
npm run lint         # Biome 静态检查（biome.jsonc 是统一模板，不改规则）；提交前要零报告，确需放行用 biome-ignore 并写理由
npm run test:unit     # 只跑 vitest 单元测试（不含类型检查和 workerd）
npm test              # 类型检查 + vitest（含全量 1.34 亿手的牌力测试、机器人对打 1 万手）+ workerd 里的 Worker 和好友房测试
npm run test:worker   # 只跑 workerd 里的那部分：test/worker/（配置 test/wrangler.test.jsonc，平台和平台钱包用假的服务绑定，钱包是 arcade-kit/testing）
                      # 和 test/standalone/（单独部署，配置 test/wrangler.standalone.jsonc，没有平台）
npm run sim [手数] [档位] [--size=2–9] [--level=0–5] [--mix-only] [--no-form]  # 性格混桌对打，打印每种性格每百手的输赢、风格（VPIP/PFR/AF/诈唬率/慢打/下注大小）和各热点的耗时；--level 钉死强弱档，--no-form 去掉每场的状态
npm run vs -- [每格场数] [档位,...] [策略,...]                     # 每档 × 每种策略一个玩家对电脑，打印每百手大盲（等同 npm run sim -- --vs）
npm run balance -- [每格场数]                                     # 配平（docs/ai.md 4.10，等同 npm run sim -- --balance）
npm run tour-sim -- <场数> [--format sng|turbo|nine]              # 锦标赛模拟：平均手数、各座位名次是否均匀（docs/tournament.md）
npm run tour-balance -- [每格场数] [--format=sng,turbo,nine]      # 单机锦标赛配平，大表放 CI 上跑
npm run scenes                                                    # 只跑冒烟里的牌局互压检查（等同 npm run smoke -- --only scenes）
npm run gen:preflop   # 重新生成翻牌前胜率表 src/ai/preflop-table.ts（固定种子）
```

依赖共用包 arcade-kit：装的是 npm 上发布的 `@yyyu-star/arcade-kit`（`package.json` 里起别名 `arcade-kit`，源码在仓库的 `packages/arcade-kit`），只经它的包入口用：`arcade-kit/rng`、`/room`、`/client`、`/auth` 等。脚本直接用 Node 跑 TypeScript（Node 22 的类型剥离）。

### 本地试 Worker
`npx wrangler dev`（用 `wrangler.jsonc`）就是单独部署的样子：游客、没有钱包。要试有平台的样子（登录、钱包），把 `wrangler.local.example.jsonc` 复制成 `wrangler.local.jsonc`（已 gitignore），
它和一个名叫 `arcade` 的假平台 Worker（`test/arcade.dev.jsonc`：`/api/me` 和钱包，cookie `__Host-sid=<id>` 就认作这个人）一起起：

```bash
cp wrangler.local.example.jsonc wrangler.local.jsonc && npm run build:cf
TEXAS_WORKER=8775 npm run dev:worker   # Worker 的端口取 TEXAS_WORKER，不设就由系统分配（看输出的 Ready on），不占 5175 / 4175
TEXAS_WORKER=8775 npm run dev           # 页面在 5175，api/、/api/wallet* 转给上面的 Worker
curl -b '__Host-sid=me' http://localhost:8775/api/wallet
```

## 单独部署这个游戏

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/texas)

`wrangler.jsonc` 是能原样部署的独立配置：点上面的按钮，或者 fork 后在本目录 `npm ci && npm run deploy`（先 `npx wrangler login`），
部署到你自己 Cloudflare 账号的 `texas.<你的子域>.workers.dev`，打开根路径会跳到 `/games/texas/`。只用到 Workers、静态资源和三个 Durable Object（免费版就够；单独部署的快速匹配只有娱乐档）。

单独部署有的和没有的（细节见 docs/deploy.md 10.1）：

- 有：单机对电脑（娱乐，筹码不算数）；好友房（游客身份，浏览器记一个 cookie，昵称在大厅填，空位电脑补，至少两个真人才发牌）；嘲讽、表情、道具；战绩存在浏览器本地。
- 没有：登录、云存档、排行榜、钱包和实盘（单机只有娱乐，好友房的筹码不记账，离开就没了）。

每天开房数、写入预算照 `wrangler.jsonc` 里的 `KIT_QUOTA`，可以按自己的用量改。

探活：`GET /games/texas/health` 不要登录，回 `{"ok":true,"version":"<版本>"}`，两种部署都有；`wrangler.jsonc` 开着 `observability`，报错和请求在 Cloudflare 控制台的 Workers 日志里看。

## 本站部署

德州是一个 Cloudflare Worker（名字 `texas`），本站挂在平台同一个域名的 `/games/texas` 路径下，用平台的登录和钱包，按仓库根 README 的部署一节用 GitHub Actions 部署：
**先部署平台**（Worker 名 `arcade`，德州的服务绑定都指向它），再跑本模块的流程。

本仓库的正式站由 `.github/workflows/game-texas.yml` 部署：改动经 PR 合并进 `main` 且涉及 `games/texas/**` 或 `packages/arcade-kit/**` 时，先跑模块独立性检查，再 `npm ci`、`npm test`、`build:cf`，
然后由部署工具 `tools/deployer` 在 `wrangler.jsonc` 上补平台的东西：`ARCADE`、`WALLET` 两个服务绑定和 `GATE=login`（`tools/workers.json`）、
路由 `<站点>/games/texas`、`<站点>/games/texas/*` 和变量 `SITE_ORIGIN=https://<站点>`（站点的主机名在 GitHub `production` 环境的 secret `SITE_HOST` 里，没设就失败），关掉 `workers_dev`，再部署。
PR 上只测试不部署。在本仓库里不对正式环境手动部署（`npm run deploy` 是给单独部署用的）。

本模块要的绑定、变量和 secret：

| 名字 | 类型 | 说明 |
|---|---|---|
| `ASSETS` | 静态资源 | `dist-cf/`，由 `npm run build:cf` 生成 |
| `ROOM` | Durable Object `TexasRoom` | 好友房 |
| `METER` | Durable Object `RoomMeter` | kit 的每日额度计量 |
| `MATCH` | Durable Object `Queue` | 快速匹配的排队（每档一个实例，不写存储） |
| `ARCADE` | 服务绑定 → `arcade`（本站部署时补） | 登录闸门和认人，问平台 `/api/me`；没有就是单独部署 |
| `WALLET` | 服务绑定 → `arcade` 的 `WalletService`，`props.game = texas`（本站部署时补） | 单机和好友房的带入、结回 |
| `GATE` | 变量（本站部署时补） | `login`（没登录跳平台登录页；没绑 ARCADE 时拒绝，不退成游客）或 `off`（不拦，本地试页面用）；不写时看有没有 ARCADE |
| `KIT_QUOTA` | 变量 | 每天的写入预算和每人开房数（docs/economy.md 第 7 节） |
| `SITE_ORIGIN` | 变量（可选，部署时注入） | 开房、进房、单机带入结回只认这个 Origin；没设就认请求自己的 origin |
| `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`SITE_HOST` | GitHub `production` 环境的 secret | 部署流程用，不进 Worker |

需要拆成单独仓库时，在仓库根运行 `tools/split-module.sh games/texas`。

## 目录一览

- `src/core/`：规则核心（发牌、下注、牌力、边池、视图），纯函数
- `src/ai/`：电脑的性格、决定和思考时间，只拿视图
- `src/app/`：页面的流程和状态（主页、单机、好友房、锦标赛、谜题、新手指引）
- `src/view/`：界面（DOM + CSS、牌桌、特效、声音）
- `worker/`：Cloudflare Worker 入口、好友房（Durable Object）和钱包转发
- `scripts/`：工具（模拟、配平、连拍、冒烟）
- `test/`：vitest 单元测试，按层分 `core/`（规则、牌力、房间）、`ai/`、`tour/`（锦标赛）、`view/`（画面层），`arch.test.ts` 查跨层约束，`support/` 放共用的测试辅助、策略和假平台入口；`test/worker/` 和 `test/standalone/` 在 workerd 里跑
- `docs/`：分主题的设计文档和更新日志归档

更细的目录说明见 [docs/deploy.md](docs/deploy.md) 第 10 节。

## 许可证

MIT，见本目录的 [LICENSE](LICENSE)（和仓库根的一样，拆成单独仓库时直接带走）。
