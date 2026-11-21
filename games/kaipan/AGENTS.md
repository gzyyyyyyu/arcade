# 《开盘》模块约定

> 总规范见仓库根 `AGENTS.md`（第 1、2 节优先）；本文件只写开盘特有的规矩和坑。命令见 `README.md`「本地开发」和 `tools/README.md`，文档索引 `docs/README.md`。

## 1. 这是什么

股市主题的肉鸽网页游戏：散户看群聊情报，挑股票小人进持仓，跟风口轮动赚钱，每月还月供，闯过 12 个月（短局 5 个月）。
涨跌来自 1996–2018 年美股真实行情段（公有领域），游戏里不露年份、公司和代码。

取向：**游戏为主、娱乐为主**。真实只为让涨跌像真的，不做成炒股软件：不堆术语和长句，用图标、数字、图表、动画表达；删掉的信息要有替代，画面不能空。

## 2. 规则核心（`src/core/`）

- 不依赖 DOM、Phaser、网络；状态 + 操作 → 新状态 + 事件。画面只读状态和事件，不算规则。分工见 `docs/architecture.md`。
- 确定性：禁止 `Math.random`、`Date.now`、`new Date` 和 `Math.exp/log/pow/sin` 等平台相关函数；随机一律 `rngFor(seed, 用途)`。
- 两种行情：真实行情（`state.real` 不为空，个股照搬绑定真实股票的逐日涨跌 × 统一系数，再按涨跌停截断）和合成行情（离线兜底、`?market=synthetic`）。
- 情报（群聊、推荐、猫的建议）读行情段接下来 1–3 天，按群友靠谱度决定说对的概率（`BALANCE.intel`）。**画面上的走势、强弱只能用已发生的数据和 `preHistory`，不能偷看未来。**
- 两把回归锁，都只锁当前版本：规则或数值真改了就重新生成，diff 里说明原因。
  - `tests/core/fingerprint.test.ts`：25 局整局指纹，`UPDATE_FINGERPRINT=1 npx vitest run tests/core/fingerprint.test.ts`；
  - `tests/core/replay-golden.test.ts`：合成行情回放基准，`UPDATE_REPLAY_GOLDEN=1 npx vitest run tests/core/replay-golden.test.ts`。
- 每日挑战、闪电盘、本周市场、实盘要和排行榜、配平表对得上：往它们的抽取池（奖励、事件、主题）加东西会改变同种子的结果，新内容默认只给真实行情的普通局（`isRegularRun`）。
- 改数值用 `npm run sim` 验证（难度梯度、牛熊都有通关路径、牛市不能躺赢、抵押不是最优解）；口径见 `docs/design-balance.md`。改到实盘期望的要报主线。

## 3. 画面和冒烟

- 冒烟截图在自动化下要可复现：画面层随机走 `src/view/ui/stable.ts`，待机循环动画自动化下不播，截「播完」用 `quietShot`、截中途用 `cueShot`（`docs/architecture.md`）。
- 文字和纹理的性能规矩见 `docs/architecture.md`「性能：文字和纹理」；量性能用 `tools/perf.ts`。
- 无头浏览器参数 `--enable-unsafe-swiftshader --no-proxy-server --no-zygote --in-process-gpu`；中文截图要装中文字体。
- 竖屏打开就是竖屏版（0.33.0），方向和版面不一致时才出转屏提示。
- 群友和股票小人的台词改了，用 `docs/design-chat.md` 第 7 节的口径重量重复率，不放宽测试。

## 4. 存储和数据

- 浏览器存储 key 全部 `kaipan.` 前缀，清单在 `docs/architecture.md`「浏览器存储 key」，加删 key 同步改它。
- 行情数据管线和数据来源见 `tools/README.md`「行情数据管线」；原始数据和 API key 不进仓库。

## 5. 发布

- 改了什么改哪份文档：规则或玩法 → `docs/design-*.md`、`docs/core-api-*.md` 和游戏里的「怎么玩」；画面或布局 → `art-v3.md` / `mobile.md`；命令、存储 key、URL 参数 → 本文件、`README.md`、`docs/architecture.md`。
- `wrangler.jsonc` 能单独部署：不写平台绑定、`GATE`、路由和站点地址，代码里也不写站点地址（`docs/platform-integration.md`）。
- 上线后打开 `/games/kaipan/`：版本号、开局能加载行情段、玩一天、控制台零报错；`/games/kaipan/health` 的版本号和这次一致。
