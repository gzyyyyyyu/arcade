# Arcade · Platform

The lobby and `/api` of the Arcade mini-game site, running on Cloudflare Workers + D1.

![Lobby with eight games](docs/media/lobby.webp)

- **Lobby** with game cards (the last game you played comes first) and one notice at a time; **accounts** (username + password + recovery code, invite-only by default).
- **Cloud saves, friends, leaderboards and match history** shared by every game through `/api/*`.
- **Play-chip wallet** — one balance across games; game servers buy in, settle and exchange in-game currency (capped per day) through a service-binding RPC (`WalletService`), browsers can only look and claim the daily relief. Chips are play money only.
- **Admin console** at `/admin` and a command-line tool (`npm run admin`).
- **Abuse limits and circuit breakers** — persistent rate limits, per-category write budgets, read-only and off tiers.

```bash
cd platform && npm ci
npm run build && cp .dev.vars.example .dev.vars
npm run dev:api   # API on :5181 (local D1)
npm run dev       # UI on :5180, proxies /api to :5181
npm test          # type check + vitest in workerd
npm run lint      # Biome lint (must be clean)
```

The rest of this README, the code comments and the API contract (`docs/platform-backend.md` in the repository root, sections 5–7 and 15) are in Simplified Chinese.

---

# 小游戏街机厅 · 平台（platform）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/platform)

本目录是仓库里的 `platform/` 模块，游戏在同一仓库的 `games/<id>/` 下，各自独立部署。架构和选型原则见仓库根的 `docs/architecture.md`；
后端方案和**接口约定**见 `docs/platform-backend.md`（第 5–7 节、第 15 节）。

## 功能

每个页面怎么排、细节见 [docs/pages.md](docs/pages.md)。所有页面一屏放下不滚，长列表按高度翻页（冒烟的 `noscroll` 段五个尺寸逐页量）。

- **大厅**：游戏卡片（最近玩的排第一、按钮是"继续玩"），一条提醒条，电脑上一屏放下全部游戏；有进出游戏的过渡、快捷键和新人三步引导。匿名访客一个 `/api` 请求都不发。
- **账号**：注册、登录、找回密码（恢复码）、改昵称和密码、换恢复码、退出其他设备、注销。
- **邀请制**：不登录不能玩；注册默认关着，管理员在 `/admin` 或命令行工具随时开关（存在 D1），`vars.REGISTRATION` 是紧急总闸。注册关着时凭邀请码注册（`/i/<码>`）：普通码一码一人，用码注册的人和邀请人自动成为好友；管理员还能建长期码（一码多人，默认 100 次、不过期）。
- **好友和动态**：好友码和链接、请求、屏蔽；在线状态和一键加入好友的房间；好友动态（赞、扔道具）；好友房打完记搭子战绩。
- **钱包**（`/wallet`）：一个余额通用所有游戏，领补给、看桌上的筹码、这周输赢和最近进出。带入、结回、放弃和兑换（游戏内货币换筹码，每人每游戏每天有上限）只能由游戏的服务端经 `WalletService` RPC 调。
- **战绩和排行榜**：战绩页有徽章墙和各游戏概览；排行榜总榜是本周净赢（只排赢了的）加各游戏的周榜和代表性每日榜；异步挑战链接；晒战绩出图。
- **云存档**：`/api/saves/<游戏>/<槽>`，游戏白名单就是 `shared/games.ts`。
- **隐藏游戏**：管理员设默认隐藏哪些游戏，每个人在 我的账号 → 偏好 里逐个改（存在服务端）；隐藏了的不出现在大厅、继续玩、排行页签、动态里，游戏地址照常能玩。
- **管理页**（`/admin`）：概览、用户、钱包统计、真人对局、邀请码、设置（公告、开放注册、默认隐藏的游戏、钱包规则，即时生效）。管理员账号只能用命令行工具建。
- **隐私说明**（`/privacy`）：其中"积分和筹码"一段适用于所有游戏：免费、没有充值，不能买、换、转让，不设奖品。
- **监控**：`/api/health`、`/api/client-error`（游戏报错只存签名和计数）、每 5 分钟巡检和公开的 `/api/monitor`，告警由 GitHub Actions 读它开关 issue（`docs/platform-backend.md` 第 16 节）。
- **防刷和熔断**：持久限流、每天上限、内存令牌桶；按类别的写入预算和熔断档位（`docs/platform-backend.md` 5.4、6.6）。

## 浏览器存储

平台和所有游戏同域，平台自己的 key 一律用 `arcade.` 前缀：

| key | 存在哪 | 用来做什么 |
|---|---|---|
| `arcade.reloaded` | sessionStorage | 发版后分块加载失败时只自动重载一次 |
| `arcade.enterFx` | sessionStorage | 进游戏时记下游戏 id、时间和当时的筹码总数（余额 + 桌上筹码），30 分钟内回大厅播一次封面缩回，并在顶栏筹码牌子上按总数变化滚数字、多了迸金币，播完就删 |
| `arcade.sound` | localStorage | 声音开关：只有 `off`（静音）或没有；游戏经 arcade-kit `platformSoundOn()` 读，格式不改 |
| `arcade.feedSeen` | localStorage | 动态看到哪一条（顶栏红点） |
| `arcade.recent.<用户 id>` | localStorage | 最近点过"进入游戏"的记录，按账号分开 |
| `arcade.tour.<用户 id>` | localStorage | 新人引导看过没有（`arcade.tour.test` 只给冒烟用） |
| `arcade.badgesSeen.<用户 id>` | localStorage | 徽章看到哪一档（新拿到、升档的只演一次；第一次打开只记不演） |

## 本地开发

需要 Node 22（见 `.nvmrc`）。

```bash
cd platform
npm ci
npm run dev        # 界面开发服务器 0.0.0.0:5180（热更新，/api 转给 5181）
npm run dev:api    # 接口：本地 D1 应用迁移后起 wrangler dev，0.0.0.0:5181
npm test           # 类型检查 + vitest（跑在本地 workerd 里，D1 是本地库）
npm run lint       # Biome lint（biome.jsonc 是全仓统一的规则，提交前要零报告）
npm run build      # 类型检查 + 正式构建到 dist/
npm run preview    # 用正式构建启动服务 0.0.0.0:4180
npm run smoke      # 界面冒烟：临时本地 D1 + 无头浏览器走主流程，控制台零报错，截图到 shots/（5181 要空着）
npm run smoke -- --only=devices  # 只跑一段，见下
```

冒烟有 30 来段，每段查什么、改什么跑哪段见 [docs/smoke.md](docs/smoke.md)。

起接口前先 `npm run build` 生成 `dist/`（wrangler 把它当静态资源目录；改了界面要重新 build），再把 `.dev.vars.example` 复制成 `.dev.vars`
（里面是本地专用的假 Secret，`.dev.vars` 不进 Git）：

```bash
npm run build
cp .dev.vars.example .dev.vars
npm run dev:api
curl http://localhost:5181/api/me
```

写请求要带 `X-Arcade: 1`，`Origin` 要等于站点地址（本地是 `http://localhost:5181`，见 `docs/platform-backend.md` 15.1）。
改界面时两个一起开：`npm run dev:api` 和 `npm run dev`；vite 把 `/api` 转给 5181，并把 Host、Origin 改成 5181 的。

本地注册默认也关着，先用命令行工具建一个管理员（令牌是 `.dev.vars.example` 里的本地假值）：

```bash
ARCADE_ADMIN_TOKEN=dev:local-dev-admin-token-000000 npm run admin -- create me 我自己 --admin --base=http://localhost:5181
```

## 部署

平台是一个 Worker（名字 `arcade`）加一个 D1 库，要先于游戏部署：游戏经服务绑定 `arcade` 调它。

- **本仓库的正式站**：只由 `main` 上的 GitHub Actions 部署（见下面"本仓库的正式部署"），不手动部署。
- **fork 以后自己部署整站**（平台加游戏）：照仓库根 README 的部署一节做。
- **Deploy to Cloudflare 按钮**：只部署平台本身（下面"一键部署"），游戏要另外部署。

### 绑定、变量和 Secret

| 名字 | 种类 | 说明 |
|---|---|---|
| `DB` | D1 | 账号、存档、好友、钱包等数据；表结构在 `migrations/`（只增不删） |
| `ASSETS` | 静态资源 | `dist/`，单页回退；`/api/*`、`/games/*` 先进 Worker |
| `SITE_ORIGIN` | 变量，可选 | 站点地址，如 `https://game.example.com`。设了 `/api` 只认这个主机名、写请求的 Origin 必须等于它；不设按请求自己的地址 |
| `REGISTRATION` | 变量 | 注册的紧急总闸，默认 `"switch"` |
| `LIMITS` | 变量 | 覆盖 `worker/api/lib/config.ts` 里的上限和阈值，只写要改的项 |
| `PEPPER_PW`、`PEPPER_RC`、`PEPPER_SID`、`PEPPER_IP` | Secret，必填 | 各种哈希的 pepper，值写成 `<kid>:<随机串>`（随机串至少 16 个字符）。缺了 `/api` 返回 503 |
| `ADMIN_TOKEN` | Secret | 管理令牌，格式同上，给命令行工具 `npm run admin` 用；不设就只能在 `/admin` 页面里管理 |
| `API_MODE` | Secret，可选 | 紧急开关 `normal` / `readonly` / `off`（`docs/platform-backend.md` 6.6） |
| `PEPPER_*_PREV` | Secret，可选 | 换 pepper 时还要认的旧值（`PEPPER_IP` 没有，`docs/platform-backend.md` 5.1） |

必填的几项也写在 `.dev.vars.example` 和 `package.json` 的 `cloudflare.bindings` 里。Secret 一律自己生成随机值（`openssl rand -hex 24`），
不要用 `.dev.vars.example` 里的本地假值。另有两个 Cron 写在 `wrangler.jsonc` 里：每天 UTC 19:17 跑统计和清理，每 5 分钟巡检一次（第 16 节）。

### 一键部署（Deploy to Cloudflare）

按钮只部署平台本身，不带游戏。

1. 点上面的按钮：Cloudflare 把本目录复制成你自己的仓库，自动建 D1 库，按提示填 Secret；`npm run deploy` 会先建表（D1 迁移）再部署。
2. **绑自定义域名**：`wrangler.jsonc` 关掉了 workers.dev 地址（它绕过网关限速），所以部署完要绑一个域名才能访问：
   在 Cloudflare 控制台的 Workers & Pages → `arcade` → Settings → Domains & Routes → Add → Custom domain，填你的主机名（域名要在这个账号下）。
   也可以在自己的仓库里给 `npx wrangler deploy` 加 `--domain <主机名>`。
3. （建议）把变量 `SITE_ORIGIN` 设成 `https://<你的主机名>`，`/api` 就只认这个地址。
4. **建第一个管理员**：新站点没有任何账号、注册默认关着。在自己的仓库目录里：

   ```bash
   npm ci
   export ARCADE_BASE_URL=https://game.example.com     # 换成你的地址
   read -rs ARCADE_ADMIN_TOKEN && export ARCADE_ADMIN_TOKEN   # 粘贴部署时填的 ADMIN_TOKEN，不回显、不进 shell 历史
   npm run admin -- create <用户名> <昵称> --admin
   ```

   打印出的密码和恢复码记好，用它登录后在 `/admin` 里建号、开放注册。

游戏要挂在同一个域名下：每个游戏的 Worker 用路径路由 `<主机名>/games/<id>/*`（路由优先于平台的自定义域名），见各游戏的 README。

### 本仓库的正式部署

正式部署只走 `main` 上的 GitHub Actions（仓库根的 `.github/workflows/platform.yml`）：改动经 PR 合并进 `main` 后，先测试、构建、打包，
再由仓库级的部署程序 `tools/deployer` 部署；部署作业进 `production` 环境，要维护者批准。
部署程序从审过的 `wrangler.jsonc` 生成最终配置，填上 `production` 环境 secret 里的正式库 id（`D1_DATABASE_ID`）和站点域名（`SITE_HOST`），
先跑 D1 迁移再部署；仓库里不写这两个值。做法和理由见 `tools/deployer/README.md`。

正式站不用 `npm run deploy` 手动部署（它不带上面的注入和检查）；Secret 用 `wrangler secret put` 单独设，不随部署变。

### 命令行工具

`tools/admin.ts`（`npm run admin`）调 `/api/admin/*`，令牌只从环境变量 `ARCADE_ADMIN_TOKEN` 读、不打印；站点地址必须用 `--base=<地址>` 或环境变量 `ARCADE_BASE_URL` 给，
只许 https（本机的 http://localhost 除外）。生成的密码和恢复码打印在终端。

```bash
npm run admin -- list
npm run admin -- create <用户名> <昵称> [--admin] [--password=<密码>]
npm run admin -- reset <用户名> [--new-recovery-code] [--password=<密码>]
npm run admin -- registration open|close|status
```

不给 `--password` 时由服务器生成一个好记的密码（推荐：命令行里的密码会留在 shell 历史里）。

## 自托管

除了 Cloudflare，平台也能用仓库的自托管运行时部署（一个 workerd 进程里跑平台和所有游戏，数据库二选一 SQLite 或 PostgreSQL），本模块的代码不用改。步骤见仓库根的 `docs/self-hosting.md` 和 `tools/selfhost/README.md`。

## 加一个新游戏

见仓库根 `AGENTS.md` 第 2 节。在 `shared/games.ts` 登记后，云存档、分数榜、钱包的游戏白名单和保留用户名就都认它了（都从 `GAMES` 派生，`GAME_IDS`）；
用钱包的游戏，服务绑定上写 `props.game`（`docs/platform-backend.md` 5.9）。有每日挑战榜的登记 `daily: true`，分数怎么显示由游戏自己的 `daily.json` 给（15.12）；有每周挑战榜的登记 `weekly: [{ id, name }]`（榜名 `week-<YYYY>-W<ww>-<子榜>`，北京时间的 ISO 周，`shared/weekly.ts`），分数写法放 `weekly.json`。
想先接钱包、存档，再正式上大厅：先登记成 `status: 'coming'`（大厅显示"即将上线"，进不去），上线时改成 `'playable'`。
有电脑人物的，把名字补进 `worker/api/account/reserved-names.ts` 的 `RESERVED_PERSONAS`（按游戏 id 分组；没有电脑也要写一组空的，测试会查）。
封面放 `public/covers/<id>.webp`（16:9），来源写进 `ASSETS.md`。

## 目录结构

```
platform/
├─ src/                 界面（React + Vite）：顶层放入口和全站共用的几件，其余按功能、按页面分目录；导出组件的文件用 PascalCase，逻辑和样式用 kebab-case
│  ├─ main.tsx、App.tsx、router.tsx  入口、页面切换和全站外框（顶栏、页脚）、极简路由
│  ├─ session.tsx、api.ts  登录状态、接口封装
│  ├─ ui.tsx、icons.tsx、styles.css  表单和恢复码卡片、手写 SVG 图标和小插画；全站样式（开头是主题变量，组件只用变量；配色表见 docs/style.md）
│  ├─ features/         一个功能一个目录（组件、逻辑、样式放一起）：fit（一屏放下：按高度翻页、窄屏页签、一屏高的外框）、modal（弹窗：同时只开一个、Tab 循环）、
│  │                    recent（大厅游戏的先后和"上次玩"）、lobby-tour（新人引导）、hotkeys（键盘快捷键和说明面板）、
│  │                    wallet（钱包余额和本周走势）、ledger（流水列表）、feed（好友动态浮层）、invites（收邀请，同一次轮询带回约局和在线好友数）、meetup（约局的时间算术）、share（晒战绩卡及挑选）、
│  │                    badges（战绩页徽章的计算和"已看过"记录）、coinfly（金币飞入钱包）、topbar（顶栏右上角和页脚声音开关）
│  ├─ lib/              不属于单个功能的纯函数和小工具：format、next（登录后跳回的地址）、play（进游戏的地址）、gamefile（读各游戏公开的 JSON）、
│  │                    scores（榜上分数的显示写法）、titles（称号名）、mates（搭子战绩文字）、presence（报"我在大厅"）、countup（数字滚动）、
│  │                    enter-fx（进出游戏的封面过渡）、sound（提示音，WebAudio 合成，见 docs/style.md 声音一节）
│  └─ pages/            每个页面一个目录：lobby（大厅）、auth（登录注册、找回密码）、me（我的账号）、friends、feed、wallet、stats（战绩）、boards（排行榜）、privacy（隐私说明）、admin（管理页）
├─ shared/              界面和 Worker 都要的纯数据、纯函数（只许引 shared 自己的文件；worker 不许引 src/，test/architecture.test.ts 守着）
│  ├─ games.ts          游戏目录：登记即生效，钱包、云存档、分数榜、保留用户名都从它派生
│  └─ weekly.ts         每周榜的 ISO 周和榜名
├─ worker/              Worker
│  ├─ index.ts          入口：默认导出 WorkerEntrypoint（fetch、给游戏的 RPC blockedAmong、Cron）；/api/* 交给 api/router.ts；导出钱包 RPC 入口 WalletService（api/wallet/service.ts；部署工具按这个名字给游戏接 WALLET 绑定，类名和这条导出都不能改）
│  └─ api/              接口，router.ts 拼路由总表并做通用检查，各功能目录的 routes.ts 放本目录的路由条目（account、social、scores、wallet、ops；条目的类型在 core/route.ts，每条路由匹配到谁由 test/routes-lock.test.ts 锁着），其余按层分目录：
│                       lib/ 基础设施，不知道任何业务（只引 lib 自己、shared 和 env，architecture.test.ts 守着）：body（读请求体和字段，统一错误码）、
│                         json-column（读库里的 JSON 列：解析加形状校验，坏了 500 或兜底）、db、meter、crypto、http、config（所有上限和阈值的默认值）；
│                       core/ 依赖会话的通用部分：context（每个请求的上下文）、ratelimit、time、settings（settings 表的读写）；
│                       account/ auth、account、session、validate、reserved-names、weak-passwords、words、invite-codes；
│                       wallet/ state（类型和纯函数的账）、parse（游戏传来的参数）、tally（真人对局统计）→ store（读写那一行、规则）→ api（浏览器和管理页接口）、service（游戏用的 RPC）；只能往箭头方向 import；
│                       social/ friends、friends-week（好友周榜）、presence、invites、feed、challenges、mates、blocked-among（游戏房间查屏蔽，只走服务绑定）；
│                       scores/ boards、leaderboard、daily（每日榜登记）、stats、saves；ops/ admin、monitor、cron（每天清理）
├─ migrations/          D1 迁移，只增不删
├─ public/              静态资源：_headers（CSP 等安全头）、covers/（游戏封面）、favicon.svg、bg.svg（底色小图案）
├─ docs/                style.md（配色表、形状质感、动效）、pages.md（各页面怎么排、怎么用）、smoke.md（冒烟分段）、changelog-archive.md（旧版本更新日志）、media/（README 截图）
├─ test/                接口测试（每个接口断言写入行数，docs/platform-backend.md 7.2）
├─ tools/               smoke.ts 界面冒烟的入口（分段在 smoke/sections/，公共部分在 smoke/lib/）、admin.ts 命令行工具、cover.ts 封面（covers/ 里是牌馆、雀馆、弹里个弹封面的 SVG 源文件）
├─ wrangler.jsonc       Worker 配置（不含域名和正式库 id）
├─ .dev.vars.example    Secret 一览和本地假值
├─ ASSETS.md            素材来源
└─ CHANGELOG.md         更新日志
```

改界面时别用内联脚本、内联 style、外站资源：`public/_headers` 的 CSP 会拦，冒烟会把任何拦截当成失败。

## 第三方数据

- `worker/api/account/weak-passwords.ts`：常见弱密码表，取自 SecLists（MIT 许可，Copyright (c) 2018 Daniel Miessler）。

## 许可证

MIT，见本目录的 `LICENSE`（和仓库根的同一份）。
