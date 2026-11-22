# tools：开发工具

都是 Node 22 直接运行的 TypeScript 脚本（类型剥离），在模块根目录（`games/kaipan/`）里跑。用途以各文件开头的注释为准，参数看那里。
带浏览器的脚本（shot、audio-check、mem-probe、art/bake）要和别的浏览器任务错开跑。

## 常用

| 脚本 | 用途 | 命令 |
|---|---|---|
| `sim.ts` | 数值模拟：机器人各玩 N 局，出通关率、出局月份、爽点频率；`--accept` 一键验收，`--balance`、`--live` 走配平表和实盘量测 | `npm run sim -- --runs 2000` |
| `shot.ts` + `shot/` | 无头 Chromium 冒烟 + 截图到 `shots/`；`shot/modes/` 是各个模式（`--main`、`--live`、`--phone`、`--playtest` 等），`harness.ts`、`fakes.ts` 是共用辅助 | `npm run shot` |
| `audio-check.ts` | 离线渲染所有音效与音乐，检查峰值、响度、时长、拖尾、节点泄漏 | `npm run audio-check` |
| `build-cf.ts` | 部署用构建，产物在 `dist-cf/games/kaipan/` | `npm run build:cf` |
| `art/build.ts` | 生成 `public/assets/art/v3/` 下的全部 SVG 与 `art-preview.html`，可只跑某几组 | `node tools/art/build.ts [组名…]` |
| `art/bake.ts` | 把小件 SVG 烘焙成 Phaser 图集（WebP）；`--check` 只比较不写盘 | `node tools/art/bake.ts` |
| `mem-probe.ts` | 按几种设备的视口和 DPR 估算显存 | `node tools/mem-probe.ts` |

## 按需（查某个数值或体验）

| 脚本 | 用途 | 命令 |
|---|---|---|
| `balance.ts` | 配平：小白、普通两个玩家模型在实盘各档、娱乐各难度下的结果（由 sim 调用） | `npm run sim -- --balance --runs 2000` |
| `live.ts` | 实盘量测：某档、某机器人打 N 局，结回倍数分布（由 sim 和测试调用） | `npm run sim -- --live` |
| `intel-check.ts` | 群友消息说中率、推荐股票后续涨跌 | `node tools/intel-check.ts` |
| `realness.ts` | 游戏里个股、大盘逐日涨跌与真实行情的相似度 | `node tools/realness.ts` |
| `parity.ts` | 核心对拍：同一批种子（实盘四档 + 娱乐普通局，真实行情）在两份代码上各跑一遍，逐局比终局阶段、账户、持仓、结回额、事件流和状态指纹；重构、删旧路径交审时附上 | 在要跑的那份代码的模块目录里 `node <路径>/tools/parity.ts run --from 1 --to 200 --out <结果.json>`，再 `node tools/parity.ts diff <旧.json> <新.json>` |
| `tempo-check.ts` | 节奏：主题是否重复、每月高光、平淡日比例、月度目标完成率 | `node tools/tempo-check.ts` |
| `perf.ts` | 性能：正式构建上量开机、开局、交易日的长任务、帧时间、纹理上传和量字次数、包体积（电脑 1280 / 竖屏 CPU 4 倍降速）；`--who` 找纹理上传来自哪段代码，`--cpuprofile` 存 CPU 采样 | `npm run build -- --outDir <目录>` 后 `node tools/perf.ts --dist <目录>`（浏览器排队） |

## 被别的脚本引用，不单独跑

| 脚本 | 用途 |
|---|---|
| `bots.ts`、`bots/` | 自动玩家（random、follower、chaser、normal、smart、oracle 等），sim 和测试共用；`bots.ts` 只做入口，实现按策略拆在 `bots/`（common、simple、normal、smart-belief、smart、variants、run；`useMarket` / `useExt` 的开关只在 run.ts） |
| `segments-disk.ts` | 从 `public/data/segments` 读行情段，给机器人、模拟、测试用 |
| `node-env.d.ts` | 没装 `@types/node` 时，tools 下脚本用到的最小 Node 声明 |
| `art/*.ts`（除 build、bake）、`art/lib/`、`art/stocks/` | 各类素材的生成器（股票小人、群友头像、徽记、场景、标题主视觉等），由 `art/build.ts` 调用；`art/stocks.json` 是股票小人配方，`art/stocks.ts` 是入口，`art/stocks/` 放共用小件、精做 6 只和名字梗剪影配方 |

## 行情数据管线（`data/`，一次性或换数据时才用）

原始数据（WIKI Prices：Quandl 社区整理、Nasdaq Data Link 托管，公有领域；4 GB 多）不进仓库，默认在模块里的 `.data/wiki-prices/`（被 .gitignore，逐年年包缓存在 `.data/wiki-prices/packs`），
环境变量 `KAIPAN_WIKI_PRICES` 或命令行参数能改；下载要 Nasdaq Data Link 的 key，设环境变量 `NASDAQ_DATA_LINK_API_KEY`，不进仓库。顺序：`slice` → `build` → `check` → `segments`。
段文件名和 id 是加盐哈希，年份对照只在 `data/segments-manifest.json`，`tests/repo/segments-leak.test.ts` 保证线上文件不含年份日期。伤亡、灾害、袭击、停市、选举类事件不进故事。

| 脚本 | 用途 | 命令 |
|---|---|---|
| `data/slice.ts` | 第 1 步：按年从原始 CSV 切片 | `node tools/data/slice.ts --years 1999,2000,2008` |
| `data/build.ts` | 第 2 步：清洗、选股票池、合成大盘、打年度包 | `node tools/data/build.ts --years 1999,2000,2008` |
| `data/check.ts` | 第 3 步：生成核对报告 `docs/history/data-check.md` | `node tools/data/check.ts` |
| `data/segments.ts` | 从年度包切出一局用的行情段，写 `public/data/segments` 和 `segments-manifest.json`；`--full` 一条命令走完全流程 | `node tools/data/segments.ts` |
| `data/candidates.ts` | 列出某年补股候选，标出缺行业的代码 | `node tools/data/candidates.ts --year 1999 --missing` |

其余是上面几步的数据和库，不单独跑：`aliases.ts`（化名表与数据代码对应）、`backfill.ts`（时间线待核对数字的查询）、`beats.ts`（大事的故事版）、`clean.ts`（清洗）、`common.ts`（路径与参数）、`dow.ts`（道指成分股名单）、`events.ts`（揭晓页用的真实大事）、`fixes.ts`（人工修正的公司行动）、`index-calc.ts`（合成大盘计算）、`picks.ts`（故事股）、`pool.ts`（选股规则）、`real-index.ts`（真实指数全年涨跌，只用于核对）、`sectors.ts`（行业标注）、`node-data.d.ts`（Node 声明）、`story-aliases.json`（故事稿化名表）、`segments-manifest.json`（段 id 对照表）。
