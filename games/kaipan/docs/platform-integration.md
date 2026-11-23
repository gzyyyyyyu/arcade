# 存档和平台

《开盘》怎么存档、怎么接平台的账号、云存档、排行榜、实盘、好友挑战等功能，以及单独部署时少什么。入口见 [README](../README.md)。

- **存档**：`kaipan.save` 存完整的局面快照和版本号（格式 5），读档直接用快照，小版本调数值后旧存档按当时的局面继续；
  更早格式的存档和 0.4 开发期的真实行情局（`state.real` 没有 `track`）接不上，读到时清掉并提示开新局。存档损坏时先备份到 `kaipan.save.corrupt`。启动时清掉早年留下的旧 key（`src/platform/storage.ts` 的 `LEGACY_KEYS`）。
- **档案**：`kaipan.profile` 和单局存档分开，记图鉴、成就、解锁和各人设、难度、每日挑战的最好成绩；损坏时备份到 `kaipan.profile.corrupt` 后重建。
- **云存档**（`src/platform/cloud.ts`，同步哪些槽在 `src/view/cloudSync.ts`）：登录后同步档案（槽 `profile`）和教程标记（槽 `tutorial`），
  打到一半的局和设置不同步。元数据在 `kaipan.cloud`，合并前的本地备份在 `kaipan.<槽>.pre-sync`；换账号时上一个账号的本地进度存在
  `kaipan.<槽>.pre-switch.<userId>`，它回来时并回去，并完改名 `.restored`。教程重新开启记一次 `reset`，合并时次数多的一边说了算。
  切回前台、上传前、收到 409 时重新确认账号；多个标签页靠 storage 事件互通。接口见总仓库 `docs/platform-backend.md`。
- **每日排行榜**（交分和读榜 `src/platform/board.ts`，一局的交分状态 `src/view/dailyBoard.ts`）：每日榜分子榜，一局结束交一次分，
  经典每日挑战交到 `daily-YYYY-MM-DD-classic`（通关分 = 1e11 + 账户元数，没通关 = 还上的月数），闪电盘交到 `daily-YYYY-MM-DD-flash`（分数 = 最终资产元数）
  （北京日期），显示规则在 `public/daily.json` 的 `boards.classic` / `boards.flash`；平台那边要在登记里写这两个子榜。
  本周市场交到周榜 `week-YYYY-Www-rules`（周号是北京时间 ISO 周，分数 = 最终资产元数，只收当周），显示规则在 `public/weekly.json` 的 `boards.rules`，平台登记里也要写这个榜。
  只有用当天冻结段池（`src/core/content/dailySegments.ts`）里那段真实行情的局才交；段池顺序和数量不随便改（改的那一天前后打的不是同一局）。
  429（限流）结束页写「成绩稍后补交」，照平台给的 retryAfter（没给按 60 秒）自动补交一次，再被限写「这局成绩没交上」；busy、wrong_user 不重试，连不上给「重试」。读榜按榜和范围缓存 45 秒，交上分时作废。
- **请求超时**（`src/platform/fetchTimeout.ts`）：排行榜、好友挑战、实盘的请求最多等 10 秒，云存档 20 秒；超时按连不上处理，走各自原来的说法和重试。
- **实盘**（设计 `design-live.md`）：规则在开局设置 `RunSetup.live` 和 `src/core/live.ts`（四档对应难度 1/2/3/3，杠杆 1× / 2× / 3×）；
  档位表和带回算法在 `src/core/liveTiers.ts`（Worker 也用）。钱包走浏览器 → 开盘 Worker（同域 `POST api/live/{buyin,settle,refund}`，`src/worker/live.ts`）
  → 服务绑定 `WALLET`；浏览器只给 `ref`、`tier`、`bp`，金额和到期时间由 Worker 定。这台设备上的账在 `kaipan.live`（`src/platform/live.ts`）：
  带入前记 `buying`，带回或放弃先记 `settling` 再发，连不上、busy 都留着重发。带回时带战绩小结（`src/core/career.ts`），称号中文名在 `public/titles.json`。
- **好友挑战**（设计 `design-challenge.md`）：娱乐局打完、登录了，结束页「挑战好友」把种子、开局设置、行情段和版本交给平台拿链接 `?challenge=<id>`；
  好友打开先弹挑战卡，接受就是同一个开局，打完交成绩看名次。挑战局照每日挑战的规矩记档案。
- **分享卡**（设计 `design-share.md`）：结束页「分享」，开盘只交数据，画卡和分享在共用包 `arcade-kit/share`；链接按当前页面推出游戏地址，代码里不写站点地址。
- **社交**：有登录提示时挂共用包 `arcade-kit/social`，报「在玩开盘」、收好友邀请。
- **回大厅**（`src/view/lobby.ts`）：跳平台首页 `/`。主页和结束页左上角的「大厅」直接走；对局里从设置走先确认一次，走之前先补传云存档
  （keepalive 额度记账在 `src/platform/keepalive.ts`）。电脑上叠了一个透明的 DOM 按钮（`src/view/ui/domProxy.ts`），读屏和自动化能点到。
  画布外的 DOM（这个影子按钮、转屏提示、出错面板、好友面板）上的按下不冒到 window（`src/main.ts`）：Phaser 会把它当成点画布，触屏上会连带点到正下方的画布按钮。
- **安全头**（`public/_headers`）：CSP、`frame-ancestors 'self'`、`X-Frame-Options: SAMEORIGIN`；经 Worker 回的首页也带上。用到新来源时同时改这里，`tests/repo/headers.test.ts` 锁底线。
- 未捕获的错误弹独立面板，可以继续、重新载入、放弃存档开新局或复制错误信息；最近 20 条错误记在 `kaipan.errors`。没人接住的报错同时经共用包 `arcade-kit/report` 发给平台 `/api/client-error`（单独部署时没有这个接口，发不出去就算了）。

单独部署（没有平台）时：有完整的单机游戏、本机的每日挑战、闪电盘和本周市场；没有登录、云存档、排行榜、好友挑战和实盘。页面启动时问一次同域 `/api/me`，
回 404 或不是 JSON 就当没有平台，把这些入口藏起来；实盘接口回 `501 no_wallet`。开盘没有好友房。

## 和平台一起部署

挂在平台同一个域名的 `/games/kaipan` 下。部署时 `tools/deployer/deploy.mjs` 在独立配置上叠加：

| 名字 | 类型 | 说明 |
|---|---|---|
| `ARCADE` | 服务绑定 → `arcade` | 登录闸门问平台 `/api/me` |
| `WALLET` | 服务绑定 → `arcade` 的 `WalletService`，`props.game = kaipan` | 实盘的带入、带回、放弃 |
| `GATE` | 变量 `login` | 登录闸门：没登录跳 `/login?from=kaipan`，平台有问题回 503 不放行 |

另外关掉 `workers_dev`、`preview_urls`，注入 `<站点>/games/kaipan` 和 `<站点>/games/kaipan/*` 两条路由。独立配置里只有 `ASSETS`，没有 secret；开着 Workers 日志（`observability`）。
写了 `GATE=login` 却没有 `ARCADE` 时首页回 503。只有根路径、首页、实盘接口 `/games/kaipan/api/*` 和健康检查进 Worker（分流在 `src/worker/route.ts`），其余静态资源不经过 Worker。
