# 《开盘》模块约定

> 总仓库规范见仓库根的 `AGENTS.md`，其中第 1、2 节的硬约束优先于本文件。本文件只写开盘特有的约定。

## 1. 这是什么

一款股市主题的肉鸽网页游戏：散户每天看群聊情报，挑股票小人进持仓，跟着风口轮动赚钱，每月还月供，闯过 12 个月（短局 5 个月）。
涨跌来自 1996–2018 年美股的真实历史行情段（公有领域数据），但游戏里不露年份、公司和代码，局末用花名讲一个"这段日子"小故事。

产品取向：**游戏为主、娱乐为主，让人快乐**。真实性只为让涨跌像真的；不能把游戏做成炒股软件，不堆术语、不堆长句，
信息用图标、数字、图表、动画来表达，但删掉的信息必须有替代，画面不能空。文档在 `docs/`（索引 `docs/README.md`）：玩法总设计 `design.md`、规则核心接口 `core-api.md`、实盘 `design-live.md`、配平 `design-balance.md`、代码结构 `architecture.md`、
画面 `art-v3.md` / `design-visual.md` / `mobile.md`。群友和股票小人的性格、按局面接话在 `design-chat.md`（改台词后用里面第 7 节的口径重新量重复率）。

## 2. 目录

- `src/core/`：规则核心（纯函数、确定性），`engine/` 是规则引擎，`content/` 是内容表。
- `src/view/`：Phaser 画面层（`scenes/`、`trade/`、`end/`、`meta/`、`ui/`、`fx/`、`audio/`），布局常量在 `theme.ts`。
- `src/platform/`：浏览器存档、档案、设置、云存档；`src/worker/`：开盘自己的 Worker；`src/debug/`：调试桥 `window.__game`。
- `tests/`：vitest；`tools/`：机器人模拟、冒烟截图、美术生成、数据管线（命令见 `tools/README.md`）。
- `public/data/segments/`：行情段；`docs/`：设计和专题文档（索引 `docs/README.md`）。

各文件怎么分工（交易场景、群聊、持仓、结束页的拆法，规则引擎各文件）见 `docs/architecture.md`。

## 3. 规则核心的约束

- `src/core` 不依赖 DOM、Phaser、网络；输入状态和操作，输出新状态和事件。画面层只读状态和事件，不自己算规则。
- 确定性：禁止 `Math.random`、`Date.now`、`new Date`，以及 `Math.exp/log/pow/sin` 等结果依赖平台的函数；随机一律用 `rngFor(seed, 用途)`。
  同一个种子 + 同一个行情段 + 同一串操作，结果必须逐位相同。
  `tests/core/fingerprint.test.ts` 是整局指纹锁：机器人打 25 局（合成 / 真实行情、各难度、每日 / 闪电 / 本周 / 短局 / 实盘、打新），事件流和每月月末、终局状态的哈希和 `tests/fixtures/fingerprint.json` 逐个比；
  重构规则核心时必须不变，规则或数值真的改了才用 `UPDATE_FINGERPRINT=1 npx vitest run tests/core/fingerprint.test.ts` 重新生成。
- 两种行情模式：真实行情（`state.real` 不为空，个股照搬绑定真实股票的逐日涨跌 × 统一系数，再按涨跌停截断）和合成行情（离线兜底、
  `?market=synthetic`）。`tests/core/replay-golden.test.ts` 只在合成行情下跑，必须保持与 0.3.0 逐位一致。
- 情报（群聊、推荐、猫的建议）读取行情段接下来 1–3 天的真实走势，按群友靠谱程度决定说对的概率（`BALANCE.intel`）。
  画面上展示的走势、强弱只能用已经发生的数据和开局前历史（`preHistory`），不能偷看未来。
- 改数值必须用 `npm run sim` 跑机器人验证（难度梯度、牛熊都有通关路径、牛市不能躺赢、抵押不是最优解），不凭感觉。

## 4. 常用命令（都在本目录运行）

| 命令 | 用途 |
|---|---|
| `npm ci` | 安装依赖（本模块自带 lockfile，不在仓库根装） |
| `npm run dev` / `npm run preview` | 开发 0.0.0.0:5173 / 正式构建预览 0.0.0.0:4173 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `biome lint .`（规则见 `biome.jsonc`，与仓库模板一致；`npm test` 会先跑它） |
| `npm test` | vitest 全量（规则、回放、内容、文案扫描、防泄漏、架构约束） |
| `npm run build` / `npm run build:cf` | 根路径构建 / 线上子路径 `/games/kaipan/` 构建到 `dist-cf/` |
| `npm run sim -- …` | 机器人模拟与平衡验收（参数见 `tools/sim.ts` 顶部） |
| `npm run shot` | 无头 Chromium 冒烟 + 截图，默认输出到 `shots/`（已忽略）；`--out` 指定目录；`--real`、`--ext`、`--story`、`--rhythm`、`--vis`、`--v05`、`--touch` 等模式见脚本顶部 |
| `node tools/realness.ts` | 实测游戏个股、大盘与真实走势的逐日相关度（0.5 验收：个股 ≥ 0.9） |

截图脚本需要 `playwright-core` 和一个 chromium-headless-shell；中文截图要装中文字体。浏览器启动参数用
`--enable-unsafe-swiftshader --no-proxy-server --no-zygote --in-process-gpu`（没有 GPU 的环境也能跑）。

冒烟截图在自动化下尽量可复现（同样的参数跑两次，除动画中途截的几张外逐像素一致）：画面层的随机走 `src/view/ui/stable.ts`，待机循环动画自动化下不播，截「播完」用 `quietShot`、截中途用 `cueShot`。新加画面层的随机或循环动画要照做，细节见 `docs/architecture.md`。

## 5. 数据管线（在开发机上跑，产物进仓库，原始数据不进）

- 来源：WIKI Prices（Quandl 社区整理、Nasdaq Data Link 托管，公有领域）。
- **外部依赖**：原始 CSV 默认在模块里的 `.data/wiki-prices/`（被 .gitignore，`tools/data/common.ts` 的 `DATA_DIR`），
  逐年年包缓存在 `.data/wiki-prices/packs`；环境变量 `KAIPAN_WIKI_PRICES` 或命令行参数都能改（数据有 4 GB 多）。下载要 Nasdaq Data Link 的 key：设环境变量 `NASDAQ_DATA_LINK_API_KEY`，不进仓库。
- 流程：`tools/data/slice.ts` 切片 → `build.ts` 清洗、选池、合成大盘 → `segments.ts` 切行情段到 `public/data/segments/`。
  段文件名和 id 是加盐哈希，年份对照只在 `tools/data/segments-manifest.json`；`tests/repo/segments-leak.test.ts` 保证线上文件不含年份日期。
- 化名在 `aliases.ts`（故事稿的化名表在 `story-aliases.json`），行业标注在 `sectors.ts`，道指成分沿革在 `dow.ts`，大事在 `events.ts`，故事版在 `beats.ts`。
  伤亡、灾害、袭击、停市、选举类事件不进故事。

## 6. 浏览器存储 key（全部 `kaipan.` 前缀）

`kaipan.save`、`kaipan.save.corrupt`、`kaipan.profile`、`kaipan.settings`、`kaipan.view.prefs`、`kaipan.setup.last`、`kaipan.tutorial.v3`、
`kaipan.extTips.v1`、`kaipan.codex.viewed.v1`、`kaipan.soundboard`、`kaipan.errors`、`kaipan.run.unscored`、`kaipan.cloud`（云同步元数据）、`kaipan.homeTip.off`（关掉了「添加到主屏幕」提示）、`kaipan.live`（实盘这一局的筹码走到哪一步，见 `src/platform/live.ts`）、`kaipan.challenge`（这台设备接下的好友挑战，见 `src/platform/challenge.ts`）；
云同步备份类：`kaipan.<槽>.pre-sync`、`kaipan.<槽>.pre-switch.<userId>`、`kaipan.<槽>.pre-switch.<userId>.restored`（槽是 `profile`、`tutorial`；key 由 `src/platform/cloud.ts` 的 `preSwitchKey` 拼接、并回后在末尾加 `.restored`，不是固定常量）；
`kaipan.profile.corrupt`。
启动时清掉（`src/platform/storage.ts` 的 `LEGACY_KEYS`）：`kaipan.records`（旧版本地纪录，档案取代了它）、`kaipan.save.v1`、`kaipan.save.v0.1/v0.2/v0.3/v0.3a/v0.4a/v0.3.restored`、
`kaipan.records.v0.2/v0.3/v0.4a/v0.3.restored`、`kaipan.terms.v04`。新增 key 必须带 `kaipan.` 前缀并补进这张表。

## 7. 发布与验证

1. 本目录 `npm run typecheck`、`npm test`、`npm run build:cf` 全过；改了画面就跑 `npm run shot`（或对应模式）并逐张看截图。
   提交前 `npm run lint` 要过（`npm test` 会先跑），放行用 `// biome-ignore lint/<组>/<规则>: <理由>` 写明理由，不改 `biome.jsonc`。
2. 更新 `package.json` 和 lockfile 的版本、`CHANGELOG.md`（带日期，用户看得懂的大白话）；**同步改相关文档**（合并门槛）：规则或玩法改了改 `docs/design.md` /
   `core-api.md` 和游戏里的「怎么玩」，画面或布局改了改 `art-v3.md` / `mobile.md`，命令、存储 key、URL 参数改了改本文件和 `README.md`。文档写现状，不写过程。
3. 提交信息以 `kaipan:` 开头，只暂存明确路径；推 `kaipan/<说明>` 分支开 PR（见仓库根 CONTRIBUTING.md），审阅通过、合并进 `main` 后由 `.github/workflows/game-kaipan.yml` 部署。
   `wrangler.jsonc` 是能单独部署的独立配置（0.8.0）：不写平台绑定、`GATE`、路由和站点地址，代码里也不写站点地址；本站部署时由 `tools/deployer` 补上平台绑定、`GATE=login` 和路由，站点主机名由部署工具注入（见 `docs/platform-integration.md`）。
   Cloudflare 偶尔返回 504，但部署可能已经生效：先用 `npx wrangler deployments list` 核实再决定是否重跑。
4. 发布后在线上 `/games/kaipan/` 实际打开：版本号、开局能加载行情段、玩一天、控制台零报错；`/games/kaipan/health` 回的版本号和这次一致。
