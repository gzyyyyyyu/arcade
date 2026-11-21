# 《开盘》规则层接口（现行）

> 这是规则层（`src/core`）对画面层、工具和测试的现行接口说明，按代码现状写；和代码对不上时以代码为准（先看 `src/core/index.ts` 的导出和 `src/core/types/`；`types.ts` 只做入口）。
> 各版本加了什么见 `CHANGELOG.md`；设计依据在 `docs/design-*.md`，数值的配平记录在 `docs/design-balance.md`。
> 画面只从 `src/core/index.ts` 引用 core；存档、档案、云同步在 `src/platform/`，不在本文范围。

## 1. 总则

- **纯函数、完全确定**：`createRun(seed, setup, opts)` 开局，`dispatch(state, action)` 推进，同一个种子 + 同一个行情段 + 同一串操作（`state.actions`）永远得到同一个局面；
  `replay(seed, actions, setup, opts)` 重建。行情段、`ext`、`tempo` 三个开局选项必须和原局一致，回放才逐位相同：
  `replay(seed, actions, setup, { segment, ext: !!state.ext, tempo: !!state.tempo })`（`segment` 要给同一个行情段，`state.real.segId` 是它的 id）。
- **随机一律用 `rngFor(seed, 用途, …)`**（`rng.ts`，sfc32）：按用途分流，行情、情报、商店、新闻、台词各用各的流，改一处不扰动别处。
  `hashSeed`、`createRng` 同在 `rng.ts`。
- **禁止的 API**：`src/core` 里不许 `Math.random`、`Date.now`、`new Date`，也不许结果依赖平台的数学函数（`Math.exp/log/pow/sin/cos` 等）；
  只用加减乘除、比较、`Math.imul` 之类。`tests/repo/architecture.test.ts` 扫源码卡这条。真实行情的映射路径同样只有四则运算。
- **core 不依赖 DOM、Phaser、网络**；画面只读状态和事件，不自己算规则。按钮能不能点用 `validate(state, action)`（返回原因文字或 `null`），
  或查询函数里的 `error / canSell` 字段，不要自己判断。
- **`dispatch(state, action, opts?) → { state, events, error }`**：默认 `structuredClone` 后改副本，传入的 `state` 不动；
  `error` 非空时 `state` 原样返回、`events` 为空。`opts.events = false` 不收集事件、`opts.inPlace = true` 原地改（模拟器提速用，画面不要用）。
- **单位**：涨跌幅、收益都是百分点（`5.2` = +5.2%），显示用 `formatPoints`；账户、月供是元，显示用 `formatMoney`（≥1 万显示「万」）；
  热度是 0..100 的整数；倍数用 `formatMult`；`formatPct` 在 `format.ts`。
- **规则表只有两张**：玩家这边的 `Rules`（格数、每天买几只、杠杆、手续费、涨跌停倍数……，`rulesOf(state)`）和市场这边的 `MarketRules`
  （当月日历与难度对合成行情的修正，`marketRulesFor`）。难度、人设、道具、月度主题各改其中几格，叠加顺序在 `market.ts` 的 `rulesFor`。
- **数值都在 `balance.ts`**（`BALANCE`、`fx(id, key)`）。画面不要写死数字，一律从接口、查询函数或 `desc()` 取（见第 12 节）。
- 玩家看得见的文案不含 emoji、不用 A 股术语（`tests/repo/content-text.test.ts`、`tests/repo/content-terms.test.ts` 扫描）；名字和说明可能随版本改，id 不变，
  画面一律取 `name / desc()` / `labels.ts`。

## 目录：各节在哪个分册

第 1 节在本文件；其余各节按下表。引用「core-api.md 第 N 节」时按本表找文件，节号不变。

| 节 | 文件 |
|---|---|
| 第 2 节 入口函数（`engine/`、`index.ts`） | [core-api-engine.md](core-api-engine.md) |
| 第 3 节 GameState（`types.ts`，实际在 `types/run.ts`） | [core-api-engine.md](core-api-engine.md) |
| 第 4 节 操作（Action） | [core-api-engine.md](core-api-engine.md) |
| 第 5 节 一天的时序与事件（GameEvent） | [core-api-engine.md](core-api-engine.md) |
| 第 6 节 查询函数（`queries.ts` 汇总导出，实现在 `queries/` 下；另有 `extview.ts`、`meta.ts`） | [core-api-engine.md](core-api-engine.md) |
| 第 7 节 真实行情与行情段文件 | [core-api-market.md](core-api-market.md) |
| 第 8 节 仓位、押跌、抵押（`ext`） | [core-api-market.md](core-api-market.md) |
| 第 9 节 节奏：月度主题、目标、高光、平淡日（`tempo.ts`、`content/monthThemes.ts`） | [core-api-market.md](core-api-market.md) |
| 第 10 节 局的种类：完整一年、娱乐短局、实盘、每日挑战、闪电盘、本周市场、好友挑战 | [core-api-modes.md](core-api-modes.md) |
| 第 11 节 内容与 id | [core-api-modes.md](core-api-modes.md) |
| 第 12 节 隐藏信息（画面不能显示） | [core-api-modes.md](core-api-modes.md) |
| 第 13 节 数值表（`balance.ts`） | [core-api-modes.md](core-api-modes.md) |
| 第 14 节 URL 参数（调试和自动化，`src/debug/params.ts`、`src/main.ts`） | [core-api-modes.md](core-api-modes.md) |
