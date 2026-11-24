# 平台本地开发和代码结构

## 本地开发

需要 Node 22（见 `.nvmrc`）。

```bash
npm ci
npm run dev        # 界面开发服务器 0.0.0.0:5180（热更新，/api 转给 5181）
npm run dev:api    # 接口：本地 D1 应用迁移后起 wrangler dev，0.0.0.0:5181
npm test           # 类型检查 + vitest（跑在本地 workerd 里，D1 是本地库）
npm run lint       # Biome lint（biome.jsonc 是全仓统一的规则，提交前要零报告）
npm run build      # 类型检查 + 正式构建到 dist/
npm run preview    # 用正式构建启动服务 0.0.0.0:4180
npm run smoke      # 界面冒烟：临时本地 D1 + 无头浏览器走主流程，控制台零报错，截图到 shots/（5181 要空着）
npm run smoke -- --only=devices  # 只跑一段
```

冒烟有 30 来段，每段查什么、改什么跑哪段见 [smoke.md](smoke.md)。

起接口前先 `npm run build` 生成 `dist/`（wrangler 把它当静态资源目录；改了界面要重新 build），再把 `.dev.vars.example` 复制成 `.dev.vars`
（里面是本地专用的假 Secret，`.dev.vars` 不进 Git）：

```bash
npm run build
cp .dev.vars.example .dev.vars
npm run dev:api
curl http://localhost:5181/api/me
```

写请求要带 `X-Arcade: 1`，`Origin` 要等于站点地址（本地是 `http://localhost:5181`，仓库根 `docs/platform-backend.md` 15.1）。
改界面时两个一起开：`npm run dev:api` 和 `npm run dev`；vite 把 `/api` 转给 5181，并把 Host、Origin 改成 5181 的。

本地注册默认也关着，先用命令行工具建一个管理员（令牌是 `.dev.vars.example` 里的本地假值）：

```bash
ARCADE_ADMIN_TOKEN=dev:local-dev-admin-token-000000 npm run admin -- create me 我自己 --admin --base=http://localhost:5181
```

改界面时别用内联脚本、内联 style、外站资源：`public/_headers` 的 CSP 会拦，冒烟会把任何拦截当成失败。

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

## 加一个新游戏

整套步骤见仓库根 `docs/new-game.md`。平台这边：

- 在 `shared/games.ts` 登记后，云存档、分数榜、钱包的游戏白名单和保留用户名就都认它了（都从 `GAMES` 派生，`GAME_IDS`）；用钱包的游戏，服务绑定上写 `props.game`（5.9）。
- 有每日挑战榜的登记 `daily: true`，分数怎么显示由游戏自己的 `daily.json` 给（15.12）；有每周挑战榜的登记 `weekly: [{ id, name }]`（榜名 `week-<YYYY>-W<ww>-<子榜>`，北京时间的 ISO 周，`shared/weekly.ts`），分数写法放 `weekly.json`。
- 想先接钱包、存档，再正式上大厅：先登记成 `status: 'coming'`（大厅显示"即将上线"，进不去），上线时改成 `'playable'`。
- 有电脑人物的，把名字补进 `worker/api/account/reserved-names.ts` 的 `RESERVED_PERSONAS`（按游戏 id 分组；没有电脑也要写一组空的，测试会查）。
- 封面放 `public/covers/<id>.webp`（16:9），来源写进 `ASSETS.md`。

## 代码结构

```
platform/
├─ src/                 界面（React + Vite）：顶层放入口和全站共用的几件，其余按功能、按页面分目录；导出组件的文件用 PascalCase，逻辑和样式用 kebab-case
│  ├─ main.tsx、App.tsx、router.tsx  入口、页面切换和全站外框（顶栏、页脚）、极简路由
│  ├─ session.tsx、api.ts  登录状态、接口封装
│  ├─ ui.tsx、icons.tsx、styles.css  表单和恢复码卡片、手写 SVG 图标和小插画；全站样式（开头是主题变量，组件只用变量；配色表见 style.md）
│  ├─ features/         一个功能一个目录（组件、逻辑、样式放一起）：fit（一屏放下：按高度翻页、窄屏页签、一屏高的外框）、modal（弹窗：同时只开一个、Tab 循环）、
│  │                    recent（大厅游戏的先后和"上次玩"）、lobby-tour（新人引导）、hotkeys（键盘快捷键和说明面板）、
│  │                    wallet（钱包余额和本周余额变化）、ledger（流水列表）、feed（好友动态浮层）、invites（收邀请，同一次轮询带回约局和在线好友数）、meetup（约局的时间算术）、share（晒战绩卡及挑选）、
│  │                    badges（战绩页徽章的计算和"已看过"记录）、coinfly（金币飞入钱包）、topbar（顶栏右上角和页脚声音开关）
│  ├─ lib/              不属于单个功能的纯函数和小工具：format、next（登录后跳回的地址）、play（进游戏的地址）、gamefile（读各游戏公开的 JSON）、
│  │                    scores（榜上分数的显示写法）、titles（称号名）、mates（搭子战绩文字）、presence（报"我在大厅"）、countup（数字滚动）、
│  │                    enter-fx（进出游戏的封面过渡）、chips-fx 和 chips-fx-logic（回大厅时顶栏筹码的演出）、sound（提示音，WebAudio 合成，见 style.md 声音一节）
│  └─ pages/            每个页面一个目录：lobby（大厅）、auth（登录注册、找回密码）、me（我的账号）、friends、feed、wallet、stats（战绩）、boards（排行榜）、privacy（隐私说明）、admin（管理页）
├─ shared/              界面和 Worker 都要的纯数据、纯函数（只许引 shared 自己的文件；worker 不许引 src/，test/architecture.test.ts 守着）
│  ├─ games.ts          游戏目录：登记即生效，钱包、云存档、分数榜、保留用户名都从它派生
│  ├─ game-prefs.ts     隐藏游戏：管理员设的默认加每人改的，算出哪些不出现在大厅
│  ├─ invite.ts         长期邀请码能设的次数和天数范围
│  └─ weekly.ts         每周榜的 ISO 周和榜名
├─ worker/              Worker
│  ├─ index.ts          入口：默认导出 WorkerEntrypoint（fetch、给游戏的 RPC blockedAmong、Cron）；/api/* 交给 api/router.ts；导出钱包 RPC 入口 WalletService（api/wallet/service.ts；部署工具按这个名字给游戏接 WALLET 绑定，类名和这条导出都不能改）
│  └─ api/              接口，router.ts 拼路由总表并做通用检查，各功能目录的 routes.ts 放本目录的路由条目（account、social、scores、wallet、ops；条目的类型在 core/route.ts，每条路由匹配到谁由 test/routes-lock.test.ts 锁着），其余按层分目录：
│                       lib/ 基础设施，不知道任何业务（只引 lib 自己、shared 和 env，architecture.test.ts 守着）：body（读请求体和字段，统一错误码）、
│                         json-column（读库里的 JSON 列：解析加形状校验，坏了 500 或兜底）、db、meter、crypto、http、config（所有上限和阈值的默认值）；
│                       core/ 依赖会话的通用部分：context（每个请求的上下文）、ratelimit、time、settings（settings 表的读写）；
│                       account/ auth、account、session、validate、reserved-names、weak-passwords、words、invite-codes；
│                       wallet/ state（类型和纯函数的账）、parse（游戏传来的参数）、tally（真人对局统计）→ store（读写那一行、规则）→ api（浏览器和管理页接口）、service（游戏用的 RPC）；只能往箭头方向 import；
│                       social/ friends、friends-week（好友周榜）、presence、invites、meetups（约局）、feed、challenges、mates、blocked-among（游戏房间查屏蔽，只走服务绑定）；
│                       scores/ boards、leaderboard、daily（每日榜登记）、stats、saves；ops/ admin、monitor、cron（每天清理）
├─ migrations/          D1 迁移，只增不删
├─ public/              静态资源：_headers（CSP 等安全头）、covers/（游戏封面）、favicon.svg、bg.svg（底色小图案）
├─ docs/                本模块的文档、changelog-<版本段>.md（旧版本更新日志）、media/（README 截图）
├─ test/                接口测试（每个接口断言写入行数，仓库根 docs/platform-backend.md 7.2）
├─ tools/               smoke.ts 界面冒烟的入口（分段在 smoke/sections/，公共部分在 smoke/lib/）、admin.ts 命令行工具、cover.ts 封面（covers/ 里是牌馆、雀馆、弹里个弹封面的 SVG 源文件）
├─ wrangler.jsonc       Worker 配置（不含域名和正式库 id）
├─ .dev.vars.example    Secret 一览和本地假值
├─ ASSETS.md            素材来源
└─ CHANGELOG.md         更新日志
```
