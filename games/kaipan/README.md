# Kaipan · 开盘

A stock-market roguelike for the browser (Phaser 4 + TypeScript). You are a small-time retail trader: each morning read the
group-chat gossip, pick cartoon "stock buddies" for your holdings, then hit **Open** and watch hot themes rotate, leaders drag their
followers up limit after limit, and your account swing. Pay the bill at the end of every month or the run is over.

- **Real price action, fictional everything else.** Every run replays a random slice of real 1996–2018 US market history (public-domain
  WIKI Prices data), scaled into the game; years, companies and tickers never appear on screen. All stocks, people, news, art and audio
  are original or procedurally generated.
- **Deterministic rules core.** `src/core/` is pure: same seed + same actions = the same run, bit for bit. Saves, replays, the daily
  challenge and bot simulations (`npm run sim`) all rely on it.
- **Modes.** Casual runs (a 5-month short run or a full year, eight difficulty levels), a daily challenge with a leaderboard, a
  5-minute "flash" run (10 trading days, same run for everyone each day, its own leaderboard), a weekly market
  (the flash format plus one limited rule per week, e.g. "everything your friends say is a lie"; weekly leaderboard), friend
  challenges, and a "live" mode that stakes play chips from the Arcade platform wallet. Chips are play money only.
- **Runs standalone.** `wrangler.jsonc` deploys the game on its own as a single Worker; login, cloud saves, leaderboards and chips light up
  only when it is mounted next to the Arcade platform.

```bash
cd games/kaipan && npm ci
npm run dev      # http://localhost:5173
npm run lint     # Biome lint (npm test runs it first)
npm test         # vitest: rules, replays, content, workers, architecture checks
npm run build:cf # production build for /games/kaipan/
```

The rest of this README, the in-game text, code comments and design docs (`docs/`) are in Simplified Chinese. License: MIT (`LICENSE`).
How to play: [docs/play.md](docs/play.md) (Chinese). Contributing: see [CONTRIBUTING.md](https://github.com/gzyyyyyyu/arcade/blob/main/CONTRIBUTING.md) in the repository root.

---

# 开盘

散户炒股主题的肉鸽游戏，玩法见上面的英文简介；一天、一个月怎么玩，主页、操作、快捷键和设置见 [docs/play.md](docs/play.md)。
画面一律用大白话，A 股原词（题材、龙头、跟风……）只出现在提示和图鉴的小白词典里。当前版本见 `package.json`，每版改了什么见 `CHANGELOG.md`。

![开盘的主页](public/assets/art/v3/scene/title_keyart.svg)

## 屏幕

电脑按 1280×720 的世界布局，窗口不是 16:9 时背景往两边或上下铺满。手机横屏和触屏平板用手机布局（世界高 404、宽随屏幕比例 718–960），
比 iPhone SE 还矮的屏幕再抬最小字号和点击区；手机和平板竖着拿时提示「把屏幕横过来」。省内存设备（iOS、触屏）渲染倍数封顶 2。
详细做法见 `docs/mobile.md`。

## 存档和平台

存档、档案存在浏览器本地（`kaipan.save`、`kaipan.profile`）；登录后同步档案和教程标记到云，并接每日榜、周榜、实盘、好友挑战、分享卡。
单独部署（没有平台）时只有单机玩法，这些入口自动藏起来。细节见 [docs/platform-integration.md](docs/platform-integration.md)。

## 本地开发

需要 Node 22（见 `.nvmrc`）。在本目录里：

```bash
npm ci
npm run dev          # 开发服务器 0.0.0.0:5173（热更新）
npm run build        # 类型检查 + 正式构建到 dist/（KP_SOURCEMAP=1 时带 sourcemap）
npm run build:cf     # 部署用的构建：产物在 dist-cf/games/kaipan/，适配 /games/kaipan/ 子路径
npm run preview      # 用正式构建启动服务 0.0.0.0:4173
npm run lint         # Biome lint，零报告才算过（npm test 会先跑）
npm test             # 单元测试：规则与回放、内容、机器人、平台层、Worker、音频纯逻辑、架构约束
npm run sim          # 数值模拟（参数见 tools/sim.ts 顶部：--balance 配平表、--live 实盘结回、--gear 杠杆、--set 临时改数值）
npm run shot         # 无头 Chromium 冒烟 + 截图到 shots/（参数见 tools/shot.ts 顶部：--main、--live、--phone、--playtest 等）
npm run audio-check  # 离线渲染所有音效与音乐，检查峰值、响度、时长、拖尾、节点泄漏
node tools/mem-probe.ts  # 按几种手机、平板、电脑的视口和 DPR 估算显存
```

`tools/` 下所有脚本的用途和命令见 [tools/README.md](tools/README.md)。

开发和预览服务监听所有网卡，同一局域网里的手机、平板可以直接打开测试（不登录，云存档、排行榜、实盘不可用）。

和平台联调（登录、云存档、排行榜、实盘）：平台目录先 `npm run build` 再 `npm run dev:api`（5181），开盘 `npm run dev` 会把 `/api` 转过去；
先在 http://localhost:5181 登录，再用 http://localhost:5173 打开开盘（`__Host-` cookie 要求安全上下文，用 IP 打开时登录状态带不过来）。

### 调试用 URL 参数

开局参数映射到规则层的开局设置（`RunSetup`，见 `docs/core-api.md`）：`seed`、`account`、`items=a,b`、`friends=a,b`、`themes=a,b,…`（6 个登场题材）、
`holdings=a,b`（开局持仓，须属于登场题材）、`difficulty`（1–8）、`persona`、`daily=1|YYYY-MM-DD`、`ext=1`（打开仓位、押跌、银行）。带调试开局参数的局跳过主页、不计入档案，而且是模拟行情。
其余：`anim=0`、`speed=N`、`debug=1`（调试浮层，显示预先掷好的行情等隐藏信息）、`scale=N`（渲染倍数）、`soundboard=1`（音频试听）、
`atlas=0|1`、`layout=phone|portrait|desktop`（强制横屏版、竖屏版或电脑布局）、`challenge=<id>`（好友挑战链接，开始菜单弹挑战卡片）、`market=synthetic|<段 id>`（从界面开的局用模拟行情或指定一段，id 查 `tools/data/segments-manifest.json`）。
开发版和 `debug=1` 时挂出 `window.__game` 调试接口（`src/debug/bridge.ts`：`controls()` 控件坐标、`loadState()`、`skip()` 等）。

## 部署

开盘是一个 Cloudflare Worker（名字 `kaipan`）：静态资源加一小段 Worker 代码。`wrangler.jsonc` 是能单独部署的独立配置，不依赖平台。

### 单独部署这个游戏

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/gzyyyyyyu/arcade/tree/main/games/kaipan)

点上面的按钮，或在本目录 `npm ci && npm run deploy`（需要环境变量 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`）。
部署完用 `https://kaipan.<你的 workers.dev 子域>/` 打开，根路径会跳到 `/games/kaipan/`。

### 和平台一起部署

挂在平台同一个域名的 `/games/kaipan` 下：部署工具 `tools/deployer/deploy.mjs` 在独立配置上叠加平台绑定（`ARCADE`、`WALLET`）、登录闸门 `GATE` 和路由，站点主机名由部署工具注入。
绑定各是什么、哪些路径进 Worker，见 [docs/platform-integration.md](docs/platform-integration.md)。

健康检查 `GET /games/kaipan/health` 回 `{"ok":true,"version":"<版本>"}`：走在登录闸门前面，不要登录、不读存储、不问平台，单独部署时一样能访问，给监控用。

本仓库的正式站由 `.github/workflows/game-kaipan.yml` 部署：改动经 PR 合并进 `main` 后测试、打包，再由部署工具补上平台绑定和路由部署；PR 上只测试不部署。
需要拆成单独仓库时，在仓库根运行 `tools/split-module.sh games/kaipan`。

## 目录结构

- `src/core/`：游戏规则，纯逻辑且完全确定，不依赖浏览器和 Phaser。数值在 `balance.ts`；风口和个股在 `market.ts`；群聊与推荐在 `chat.ts`；
  节奏（月度主题、目标、高光、平淡日）在 `tempo.ts`；股票、群友、道具、日历、事件、人设、难度、成就在 `content/`；画面用的查询在 `queries.ts`。
- `src/view/`：Phaser 画面。`session.ts` 持有状态并分发事件；`scenes/` 是启动、主页、对局、结束页；`trade/` 是对局的各部分；
  `meta/` 是开局、每日挑战、图鉴与成就、解锁、这段日子；`ui/` 是按钮、文字、对话框等基础件；`audio/` 是程序化音频。颜色、字号、间距在 `theme.ts`。
- `src/platform/`：设置、存档、档案、错误兜底、云存档、排行榜、实盘的本地账、竖屏提示。
- `src/worker/`：开盘自己的 Worker：登录闸门（`gate.ts`）、实盘钱包接口（`live.ts`）、分流（`route.ts`）。
- `src/debug/`：URL 参数与 `window.__game` 调试接口。
- `public/assets/art/`：SVG 素材，由 `tools/art/` 的脚本生成；`v3/atlas/` 是烘焙好的 WebP 图集（`node tools/art/bake.ts`），缺失时回退到单张 SVG。
- `public/data/segments/`：行情段。文件名和 id 是不透明的短哈希，段文件里只有相对涨跌（基点）、市况、游戏化标题和故事句，
  没有年份、日期、公司和代码（`tests/repo/segments-leak.test.ts` 把关）。id 和年份的对照只在 `tools/data/segments-manifest.json`。
- `tools/`：机器人与数值模拟（`bots.ts`、`bots/`、`sim.ts`）、截图冒烟（入口 `shot.ts`，公共部分和各模式在 `shot/`）、音频检查、美术生成（`art/`）、真实行情数据管线（`data/`）。
- `docs/`：设计、接口和专题文档，索引见 `docs/README.md`。

## 许可证

MIT，见本目录的 `LICENSE`。例外：数字字体 `public/assets/fonts/kaipan-num.woff2` 由 Fredoka 改出，按 SIL OFL 1.1 授权（`public/assets/fonts/OFL.txt`）。
