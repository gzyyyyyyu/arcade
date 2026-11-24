# 德州扑克：目录、部署和命令

> 节号沿用设计总纲的编号，各章在哪个文件见 [DESIGN.md](../DESIGN.md) 目录。

## 10. 目录、部署和命令

```
games/texas/
├─ src/core/        规则、牌力、随机数、边池（纯函数）
├─ src/ai/          电脑：胜率表、蒙特卡洛、性格
├─ src/tour/        锦标赛规则 rules.ts（纯函数；单机的一场是 src/tour-solo.ts，第 14 节）
├─ src/room/        好友房的规则（接 kit 的 RoomGame，纯函数，房间和页面共用）：rules.ts 现金桌、tour.ts 锦标赛、game.ts 按开房选项分发、match.ts 匹配真人的档位
├─ src/fun/         互动里德州自己的：短语表 taunts、名场面和互动性格 moments（其余是 kit 的 table-fun）
├─ src/view/        页面（DOM + CSS）：牌桌 table、操作区 actions、标题页 lobby、等人页 room、牌面头像筹码 art、布局 layout、音效 sound 等，其余见目录
├─ src/net/         钱包 wallet、云存档 cloud
├─ src/app/         页面的流程，把规则、钱包、画面接起来：mount 装页面（建状态、骨架，把各块的函数接成 ctx.fn），state 共享状态，shell 骨架和顶栏，
│                   lobby 大厅和启动，table 单机牌桌，daily 全下局和今日全下，tour 锦标赛（单机、今日锦标赛、好友房的出局和结束页），
│                   online 好友房和匹配真人，fun 互动聊天和成就，guide 新手指引，takeprofit 止盈，puzzle 每日谜题；
│                   import 进来没有副作用，模块顶层不碰 DOM、不放可变状态，之间的运行时 import 没有环（test/arch.test.ts 查）
├─ src/             main.ts 页面入口（找到 #app，交给 app/mount.ts），solo.ts 单机的一桌，tour-solo.ts 单机锦标赛的一场（钱包、存档），online.ts 好友房连接（kit 的 RoomClient），bot.ts 电脑的入口，store.ts 浏览器存储，site.ts 有没有平台
├─ worker/          texas Worker：探活 /games/texas/health（回 {ok, version}，不读存储、不要登录，排在登录闸门前面）、登录闸门、单机带入带回（转平台钱包）、好友房 TexasRoom DO、匹配真人的排队 Queue DO（match.ts）
├─ test/            规则、电脑的 vitest（Node；分 core/ ai/ tour/ view/，辅助在 support/）；test/worker/ 是 Worker、钱包、房间的 vitest（workerd，配置 test/wrangler.test.jsonc）；
│                   test/standalone/ 是单独部署的（配置 test/wrangler.standalone.jsonc，入口就是 worker/main.ts）
├─ scripts/         smoke.ts（冒烟入口，各段在 smoke/ 下）  sim.ts + vs.ts（模拟，vs 是多线程部分）  balance.ts（配平）  tour-sim.ts（锦标赛时长）  tour-balance.ts（锦标赛配平）  scenes.ts（牌桌互压的固定局面）  capture.ts（连拍看节奏）  gen-preflop.ts（生成翻牌前胜率表）  args.ts
└─ wrangler.jsonc   独立配置：原样就能单独部署；本站的正式部署只走 `.github/workflows/game-texas.yml`，由部署工具在它上面补平台的东西。
                    本地试平台模式用 gitignore 掉的 wrangler.local.jsonc。
                    不写路由和 zone（本站的路由 `<站点>/games/texas`、`<站点>/games/texas/*` 与 SITE_ORIGIN 由部署流程用 GitHub production secret `SITE_HOST` 注入；没设 SITE_ORIGIN 时 Worker 认请求自己的来源）；
                    workers_dev: true（单独部署用 workers.dev，本站部署时关掉）、preview_urls: false；
                    observability 开着（Workers 日志）；
                    run_worker_first：/、/api/me（单独部署用）、首页三个路径、/games/texas/health（探活）、/games/texas/api/solo/*、/games/texas/rooms、/games/texas/rooms/*（排队 rooms/match/<档位> 也在里面）；
                    绑定 ROOM（类 TexasRoom）、METER（DO）、MATCH（类 Queue）；不写 ARCADE、WALLET、GATE（本站部署时按 tools/workers.json 补：ARCADE 服务、WALLET 服务 arcade 的 WalletService、props.game = texas，GATE=login）；
                    vars KIT_QUOTA（每天的写入预算、每人开房数、互动的限流，数见 wrangler.jsonc 和第 7 节）；迁移 v1 TexasRoom + RoomMeter、v2 Queue（已上线以后新加的类要新的一版）
```

### 10.1 单独部署

不需要平台也能部署单个游戏：别人 fork 或点 Deploy to Cloudflare，就能把德州原样部署到自己的 `texas.<子域>.workers.dev`。
同一份代码两种部署，由 env 决定（kit 的 `isStandalone`：没有 ARCADE、GATE 不是 login），代码里不分支部署目标：

| | 本站（有平台） | 单独部署 |
|---|---|---|
| 认人 | 平台 `/api/me`（登录闸门，没登录去登录页） | kit 的游客 cookie（首页放行并补发，开房、进房认它）；昵称是页面带的 `?name=`，kit 清洗，10 个电脑的名字不许用（`GUEST.reserved`） |
| 单机 | 娱乐、实盘 | 只有娱乐；`/games/texas/api/solo/*` 直接回 404 `no_wallet` |
| 好友房 | 实盘，带入、带回走平台钱包 | 照常开房进房，带入直接办成、带回不办（`TexasRoom.perform` 没有 WALLET 时回 ok）：筹码不算数，离开就没了 |
| 云存档、战绩同步、钱包、补给 | 有 | 没有（战绩只存在浏览器本地） |
| 站点根 `/` | 平台的 | 跳到 `/games/texas/`（kit 的 `standaloneRoot`） |
| "大厅"按钮 | 平台首页 `/` | 游戏自己的首页 `./` |

- **页面怎么知道**：开局用 kit 的 `detectPlatform()` 问同域 `/api/me`（顺带拿平台昵称）。单独部署时 `/api/me` 由德州 Worker 经 kit 的 `standaloneRoot` 答 200 `{ standalone: true }`
  （没有 user 就算没有平台）：不回 404，免得每次打开页面控制台都冒一条红的。平台抖了一下（5xx、超时，`unknown`）按有平台算。结果记在 `src/site.ts`。
- **安全**：本站有 ARCADE 绑定，游客 cookie 一律不认；绑定丢了（GATE=login 却没有 ARCADE）kit 按平台不可用拒绝，房间也不会因为没有 WALLET 就白给筹码（`perform` 只在单独部署时回 ok，否则回 `unavailable`）。
- **真人至少两个**（规则不分部署），说明换成不提实盘的一句。
- 单独部署的额度照 `KIT_QUOTA`（同一份配置），计量照常。
- **探活和报错**：`/games/texas/health` 两种部署都不要登录，回 `{ ok: true, version }`（`package.json` 的版本）；页面开局调 kit 的 `reportErrors`（`arcade-kit/report`），没人接住的报错发给平台的 `/api/client-error`，单独部署时那里回 404，kit 吞掉不重试。
- 测试：`test/standalone/`（workerd，入口就是 `worker/main.ts`，入口多导出了具名常量时 workerd 起不来，这里先报）；冒烟 `--only standalone` 用原样的 `wrangler.jsonc` 起 `wrangler dev`。

### 10.2 仓库级的事（不在本模块里改）

部署流程 `.github/workflows/game-texas.yml`、根 `AGENTS.md` 的端口表、平台 `platform/shared/games.ts` 的登记和封面、平台"昵称不许用电脑名字"的名单（10 个电脑名字，顺序见 4.3 的表）、
网关限速对 `/games/texas/api/*` 和 `/games/texas/rooms*` 的覆盖（5.5）都在模块外，由仓库级流程处理。

### 10.3 游戏页的安全响应头

游戏页（首页三个路径，都过登录闸门）的响应由 Worker 加 `Content-Security-Policy`（`worker/main.ts` 的 `secure`），别的静态资源不是文档，不带。带哈希的 `assets/*` 由模块根的 `_headers` 设长缓存（`public, max-age=31536000, immutable`），`npm run build:cf` 把它拷到 `dist-cf/_headers`（资源根目录）。
没有放在静态资源的 `_headers` 里，是因为 WebSocket 那一条要写明本站的 `wss://<host>`：Safari 的 `'self'` 不认 ws/wss，仓库公开又不写正式域名，只能按请求的 host 拼（单独部署也对）。

| 指令 | 值 | 为什么 |
|---|---|---|
| `default-src` | `'self'` | 字体等没单列的都只许同源 |
| `script-src` | `'self' https://static.cloudflareinsights.com` | 只有打包出来的同源脚本，没有内联脚本、没有 eval；外加 Cloudflare Web Analytics 的统计脚本（线上边缘自动插进页面，本地冒烟看不到） |
| `style-src` | `'self' 'unsafe-inline'` | kit 的互动、叫人面板往页面里插 style 元素 |
| `img-src` | `'self' data: blob:` | CSS 里的小图标是 data: 的 SVG；分享卡预览是 blob: |
| `connect-src` | `'self' wss://<host> https://cloudflareinsights.com` | 接口都同源；好友房的 WebSocket 同源（本地 http 是 ws:）；统计脚本往 Cloudflare 上报 |
| `object-src` / `base-uri` / `form-action` | `'none'` / `'self'` / `'self'` | 用不到，收紧 |
| `frame-ancestors` | `'self'` | 不许别的站点用 iframe 嵌，只许同源 |

冒烟里每个页面监听 `securitypolicyviolation` 记成控制台错误，所以任何违规都会让冒烟失败。`test/worker/api.test.ts` 查首页带着这条头。

### 10.4 本站部署（部署工具补什么）

德州是一个 Cloudflare Worker（名字 `texas`），本站挂在平台同一个域名的 `/games/texas` 路径下，用平台的登录和钱包，用 GitHub Actions 部署：
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
| `MATCH` | Durable Object `Queue` | 匹配真人的排队（每档一个实例，不写存储） |
| `ARCADE` | 服务绑定 → `arcade`（本站部署时补） | 登录闸门和认人，问平台 `/api/me`；没有就是单独部署 |
| `WALLET` | 服务绑定 → `arcade` 的 `WalletService`，`props.game = texas`（本站部署时补） | 单机和好友房的带入、带回 |
| `GATE` | 变量（本站部署时补） | `login`（没登录跳平台登录页；没绑 ARCADE 时拒绝，不退成游客）或 `off`（不拦，本地试页面用）；不写时看有没有 ARCADE |
| `KIT_QUOTA` | 变量 | 每天的写入预算和每人开房数（docs/economy.md 第 7 节） |
| `SITE_ORIGIN` | 变量（可选，部署时注入） | 开房、进房、单机带入带回只认这个 Origin；没设就认请求自己的 origin |
| `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`SITE_HOST` | GitHub `production` 环境的 secret | 部署流程用，不进 Worker |

需要拆成单独仓库时，在仓库根运行 `tools/split-module.sh games/texas`。

### 10.5 本地开发和命令
```bash
npm ci
npm run dev           # 页面（vite，5175）；钱包连不上时娱乐照常，设 TEXAS_WORKER=<本地 Worker 端口> 把 api/、/api/wallet* 转给 Worker
npm run build:cf      # 页面打包到 dist-cf/games/texas/（Worker 的静态资源），并把 _headers（assets 长缓存）拷到 dist-cf/
npm run smoke         # 冒烟：先 build:cf；本地起 Worker + 无头 Chromium，跑单机（打满 30 手、补筹码、离桌结算、回大厅）、手机横屏、双指放大、竖屏、好友房、匹配真人，
                      # 再用原样的 wrangler.jsonc 起一个单独部署的 Worker 跑单机和游客好友房；
                      # --only desktop|mobile|portrait|room|match|standalone 只跑一段，tall|guide|tp|tour|tourfmt|tourroom|devices|scenes|noscroll|lobbyui|settings|fun|dialogs|ach|puzzle|pushfold|dailytour|bigmoments|roomsoak|roomweak|quota 只能单独指定（docs/testing.md 第 9 节；devices 是 27 个尺寸的多尺寸检查，加 --lobby 只查主页和选桌页；scenes 是牌桌各种局面的互压检查，8.2；roomsoak 好友房长跑量内存和连接、roomweak 后台和弱网后恢复，第 6 节）
npm run capture -- [--device desk|phone|both] [--every 250] [--secs 40] [--auto] [--out 目录]
                      # 连拍：本地起页面、娱乐桌自动打，每隔固定毫秒截一张，拼成带时间的 4×4 大图，逐帧看节奏（不进 CI）
npm run lint         # Biome 静态检查（biome.jsonc 是统一模板，不改规则）；提交前要零报告，确需放行用 biome-ignore 并写理由
npm run test:unit     # 只跑 vitest 单元测试（不含类型检查和 workerd）
npm test              # 类型检查 + vitest（含全量 1.34 亿手的牌力测试、机器人对打 1 万手）+ workerd 里的 Worker 和好友房测试
npm run test:worker   # 只跑 workerd 里的那部分：test/worker/（配置 test/wrangler.test.jsonc，平台和平台钱包用假的服务绑定，钱包是 arcade-kit/testing）
                      # 和 test/standalone/（单独部署，配置 test/wrangler.standalone.jsonc，没有平台）
npm run sim [手数] [档位] [--size=2–9] [--level=0–6] [--mix-only] [--no-form]  # 性格混桌对打，打印每种性格每百手的输赢、风格（VPIP/PFR/AF/诈唬率/慢打/下注大小）和各热点的耗时；--level 钉死强弱档，--no-form 去掉每场的状态
npm run vs -- [每格场数] [档位,...] [策略,...]                     # 每档 × 每种策略一个玩家对电脑，打印每百手大盲（等同 npm run sim -- --vs）
npm run balance -- [每格场数]                                     # 配平（docs/ai.md 4.10，等同 npm run sim -- --balance）
npm run tour-sim -- <场数> [--format sng|turbo|nine]              # 锦标赛模拟：平均手数、各座位名次是否均匀（docs/tournament.md）
npm run tour-balance -- [每格场数] [--format=sng,turbo,nine]      # 单机锦标赛配平，大表放 CI 上跑
npm run scenes                                                    # 只跑冒烟里的牌局互压检查（等同 npm run smoke -- --only scenes）
npm run gen:preflop   # 重新生成翻牌前胜率表 src/ai/preflop-table.ts（固定种子）
```

依赖共用包 arcade-kit：装的是 npm 上发布的 `@yyyu-star/arcade-kit`（`package.json` 里起别名 `arcade-kit`，源码在仓库的 `packages/arcade-kit`），只经它的包入口用：`arcade-kit/rng`、`/room`、`/client`、`/auth` 等。脚本直接用 Node 跑 TypeScript（Node 22 的类型剥离）。

本地试 Worker：
`npx wrangler dev`（用 `wrangler.jsonc`）就是单独部署的样子：游客、没有钱包。要试有平台的样子（登录、钱包），把 `wrangler.local.example.jsonc` 复制成 `wrangler.local.jsonc`（已 gitignore），
它和一个名叫 `arcade` 的假平台 Worker（`test/arcade.dev.jsonc`：`/api/me` 和钱包，cookie `__Host-sid=<id>` 就认作这个人）一起起：

```bash
cp wrangler.local.example.jsonc wrangler.local.jsonc && npm run build:cf
TEXAS_WORKER=8775 npm run dev:worker   # Worker 的端口取 TEXAS_WORKER，不设就由系统分配（看输出的 Ready on），不占 5175 / 4175
TEXAS_WORKER=8775 npm run dev           # 页面在 5175，api/、/api/wallet* 转给上面的 Worker
curl -b '__Host-sid=me' http://localhost:8775/api/wallet
```
