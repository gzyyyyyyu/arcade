# 德州扑克：目录和部署

> 节号沿用设计总纲的编号，各章在哪个文件见 [DESIGN.md](../DESIGN.md) 目录。

## 10. 目录和部署

```
games/texas/
├─ src/core/        规则、牌力、随机数、边池（纯函数）
├─ src/ai/          电脑：胜率表、蒙特卡洛、性格
├─ src/tour/        锦标赛：rules.ts 规则（纯函数）、solo.ts 单机的一场（第 14 节）
├─ src/room/        好友房的规则（接 kit 的 RoomGame，纯函数，房间和页面共用）：rules.ts 现金桌、tour.ts 锦标赛、game.ts 按开房选项分发、match.ts 快速匹配的档位
├─ src/fun/         互动里德州自己的：短语表 taunts、名场面和互动性格 moments（其余是 kit 的 table-fun）
├─ src/view/        页面（DOM + CSS）：牌桌 table、操作区 actions、标题页 lobby、等人页 room、牌面头像筹码 art、布局 layout、音效 sound 等，其余见目录
├─ src/net/         钱包 wallet、云存档 cloud
├─ src/app/         页面的流程，把规则、钱包、画面接起来：mount 装页面（建状态、骨架，把各块的函数接成 ctx.fn），state 共享状态，shell 骨架和顶栏，
│                   lobby 大厅和启动，table 单机牌桌，daily 快速局和今日局，tour 锦标赛（单机、今日赛、好友房的出局和结束页），
│                   online 好友房和快速匹配，fun 互动聊天和成就，guide 新手指引，takeprofit 止盈，puzzle 每日谜题；
│                   import 进来没有副作用，模块顶层不碰 DOM、不放可变状态，之间的运行时 import 没有环（test/arch.test.ts 查）
├─ src/             main.ts 页面入口（找到 #app，交给 app/mount.ts），solo.ts 单机的一桌，online.ts 好友房连接（kit 的 RoomClient），bot.ts 电脑的入口，store.ts 浏览器存储，site.ts 有没有平台
├─ worker/          texas Worker：探活 /games/texas/health（回 {ok, version}，不读存储、不要登录，排在登录闸门前面）、登录闸门、单机带入结回（转平台钱包）、好友房 TexasRoom DO、快速匹配的排队 Queue DO（match.ts）
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
同一份代码两种部署，由 env 决定（kit 0.10 的 `isStandalone`：没有 ARCADE、GATE 不是 login），代码里不分支部署目标：

| | 本站（有平台） | 单独部署 |
|---|---|---|
| 认人 | 平台 `/api/me`（登录闸门，没登录去登录页） | kit 的游客 cookie（首页放行并补发，开房、进房认它）；昵称是页面带的 `?name=`，kit 清洗，10 个电脑的名字不许用（`GUEST.reserved`） |
| 单机 | 娱乐、实盘 | 只有娱乐；`/games/texas/api/solo/*` 直接回 404 `no_wallet` |
| 好友房 | 实盘，带入、结回走平台钱包 | 照常开房进房，带入直接办成、结回不办（`TexasRoom.perform` 没有 WALLET 时回 ok）：筹码不算数，离开就没了 |
| 云存档、战绩同步、钱包、补给 | 有 | 没有（战绩只存在浏览器本地） |
| 站点根 `/` | 平台的 | 跳到 `/games/texas/`（kit 的 `standaloneRoot`） |
| "大厅"按钮 | 平台首页 `/` | 游戏自己的首页 `./` |

- **页面怎么知道**：开局用 kit 的 `detectPlatform()` 问同域 `/api/me`（顺带拿平台昵称）。单独部署时 `/api/me` 由德州 Worker 经 kit 的 `standaloneRoot` 答 200 `{ standalone: true }`
  （没有 user 就算没有平台）：不回 404，免得每次打开页面控制台都冒一条红的。平台抖了一下（5xx、超时，`unknown`）按有平台算。结果记在 `src/site.ts`。
- **安全**：本站有 ARCADE 绑定，游客 cookie 一律不认；绑定丢了（GATE=login 却没有 ARCADE）kit 按平台不可用拒绝，房间也不会因为没有 WALLET 就白给筹码（`perform` 只在单独部署时回 ok，否则回 `unavailable`）。
- **真人至少两个**照旧（规则不分部署），说明换成不提实盘的一句。
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
