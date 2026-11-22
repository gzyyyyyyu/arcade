# 《开盘》规则层接口：真实行情、仓位押跌抵押、节奏

> 本文件是 [core-api.md](core-api.md) 的分册，节号和内容原样保留；总目录见 [core-api.md](core-api.md)。

## 7. 真实行情与行情段文件

### 7.1 两种行情模式

| 模式 | 条件 | 行为 |
|---|---|---|
| 真实行情 | `createRun` 给了 `segment`（`state.real` 不为 null） | 个股、风口、大盘照搬绑定的真实走势；情报读真实未来；`tempo` 默认打开 |
| 合成行情 | 不给 `segment` | 风口生命周期（冷门 → 萌芽 → 发酵 → 主升 → 高潮 → 退潮）、随机行情、日历与难度改走势；没有 `tempo` |

合成行情完整保留，`tests/core/replay-golden.test.ts` 在这个模式下固定若干局当当前版本的回归基准：规则真的改了用 `UPDATE_REPLAY_GOLDEN=1` 重新生成，diff 里说明原因。
0.4 开发期的真实行情存档（`state.real` 没有 `track`）读档时提示一次后清掉（`platform/storage.ts`），核心里只有上面两种模式。

### 7.2 真实行情怎么算（`market.ts` 的 `moveStocksTrack`、`real.ts`）

- 当天涨跌 = `BALANCE.track.amp`（2，所有股票相同）× 绑定的真实股票当天总收益，再按涨跌停截断：跌停 = 角色涨跌停（10，ST 5）× `rules.limitMult`，涨停再 × `rules.limitUpMult`。
  风口（看板）涨跌 = amp × 真实行业等权收益；大盘 = amp × 老三十。日历、难度、道具、事件、股灾都不再改大盘和个股。
- 风口热度和阶段（只是信息，不影响涨跌）：行业相对「所有行业平均」的超额收益按 `real.smooth`（0.35）指数均摊，让风口有惯性；
  热度变化 = `heatGain × ex / scale − heatPull × (热度 − heatBase)` + 加成。阶段是状态机（冷 → 冒头 → 发酵 → 主升 → 高潮 → 退潮 → 冷，冒头可夭折、发酵可证伪），
  门槛在 `BALANCE.real.stage`。大盘天气看最近 `moodDays`（3）天放大后的大盘均值，≥ `track.moodBull` 晴、≤ 负值雨。
- **识别**（只播报，不改涨跌，`StockMove` 上）：连板（触及涨停则 `boards + 1`，≥ 2 发 `spotted`）；炸板（前一天涨停、今天跌 ≤ `track.blown`）；
  妖股异动（过山车股 |涨跌| ≥ `track.wild`，`jump` 恒为 0）；跟涨（同风口大哥涨停、小弟涨 ≥ `track.follow`，`chain` 恒为 0）。
  危险股跌停记一次退市警告、有警告时涨停摘帽，真实行情下不会退市。
- **性格校正** `fitRoles`（开局）：每个风口内按这一段（开局前 + 一局）的真实表现重新分配绑定序列：过山车 ← 相对行业残差波动最大；危险股 ← 整段跌得最多；
  带头大哥 ← 对行业 β 最大；老实股 ← 波动最小；其余当小弟。只决定显示和情报口吻。`node tools/realness.ts` 实测个股逐日相关 ≥ 0.9。
- **股灾**（难度 6）：月份和日子对齐段内股灾可选月份里大盘真实跌得最多的一天（跌 ≥ 1.5% 才对齐，否则按种子，`real.crashReal`）；风口热度一起退潮，突发账单照旧，不再额外压大盘。
  `crashPlan(seed, difficulty, real?)` 是隐藏信息（只给测试和模拟）；画面只读 `state.notice` 和收盘后的 `crashHit / report.crash`。
- **情报从真实未来推算**（`chat.ts`）：
  - 消息：说的是风口接下来 `days` 天（含今天，1–3，权重 `intel.days` 8:3:1）的累计涨跌方向，累计在 ±`intel.flat[days−1]` 以内算「横」（`themeTruth`）。
    说中概率 `messageCred`：`intel.cred[群友]`（擅长 / 不擅长）+ 每局状态 `chat.form`（±0.05）+ 加成（开局靠谱群友聊擅长 `expertMsg`、拐点 `turnCred`）
    − `intel.diffStep` × (难度 − 1)，封顶 `chat.credMax` 0.95；只有道具指定的必中（`credOverride`）能到 1。说错时群主 80% 直接反着说，空军老周一律唱空，其余随机另一个方向。
  - `days = 1` 当天收盘揭晓（`messageJudged`）；`days > 1` 进 `state.watch`，到期那天收盘揭晓（`intelJudged`，`report.intel` 带 `day / days`）。战绩两种都算。
  - 推荐：推荐人对每只候选股以 `recCredibility` 的概率看对它接下来 `rec.days` 天的真实方向（±`intel.stockFlat`），在看涨的里按角色权重挑；空军老周挑看跌的押跌。
  - 重磅情报（`Message.big`）：今天真实涨跌幅度最大的风口，由群里最靠谱的人说，准确率 `intel.headline` 0.85；月末前一天本月还没有高光时，月度主题补一条（`needsHeadline`）。
  - 收盘新闻多一条预告（`NewsItem.ahead`，准确率 `intel.news`）；稀有股票奖励卡是「内部消息：下个月走势偏强」（`intel.headline` 的概率是真的）。
  - 隐藏、只给测试和模拟：`themeTruth / stockTruth / forwardRet / messageCred / turnOf`。画面显示的走势、强弱只能用已发生的数据和 `preHistory`。
- **月供**：真实行情下常规月供再 × `track.billMult`（0.5）× `track.regimeBill[市况]`（牛 1.1、泡沫 1.25、横盘 0.95、熊 0.9、崩盘 0.95）。市况不公开，局末才揭晓。

难度在真实行情下的效果由各难度的 `realRules` 给出（`realDesc / realDetail`）：震荡月供略增；熊出没每次买入收 `buyFee` 0.6%；消息失真；强监管涨停那一头 × 0.7；股灾见上；7、8 月供与坏事。道具、日历在真实行情下只剩信息或结算类效果，不改走势。

### 7.3 行情段文件

`public/data/segments/index.json`：`{ v: 1, source, segments: [{ id, file }] }`（目录顺序决定「按种子取第几个」，顺序不变则同一种子抽到同一段）。
`public/data/segments/<id>.json` 的类型是 `segment.ts` 的 `Segment`，要点：

| 字段 | 含义 |
|---|---|
| `id` | 不透明 id：`seg_` + 加盐哈希前 10 位十六进制；盐只在 `tools/data/segments.ts` |
| `warm / days` | 20 / 58；所有逐日数组长度 = `warm + days`，下标 `warm` 是第一个交易日 |
| `regime / title / stats` | 市况 `bull / bubble / flat / bear / crash`（`REGIME_LABEL`）、游戏化标题（`SEGMENT_TITLES`）、`{ ret, dd, ref }`（比例） |
| `events[]` | 最多 4–5 条大事 `{ day, t?, alt?, sectors }`：一局里第几个交易日、故事句（`t` 可含 `{股}{风口}`，对不上本局风口用 `alt`）、相关行业。不带真实日期和原文 |
| `market` | 大盘（老三十）逐日收益，**基点整数** |
| `themes.<风口>` | `{ sector, name, r, stocks }`：主行业 id、行业大白话、行业等权逐日收益（基点）、绑定股票；8 个风口全在文件里，开局才决定哪 6 个登场 |
| `themes.<风口>.stocks[]` | `{ slot, id, name, sec, r }`：游戏股票 id、段内编号（`<风口>_<n>`，不含真实代码）、`name` 恒为 null、真实行业、逐日总收益（基点，含拆股分红） |

规矩：
- **防泄漏**：玩家能在网络面板看到这些文件，所以文件名、目录、内容里都不能有年份、日期、大事原文、真实代码。`tests/repo/segments-leak.test.ts` 扫所有文件。
  id 与真实年份的对照只在 `tools/data/segments-manifest.json`（工具和测试用，不进画面包）。不存任何价格，只存相对涨跌。
- 风口 ↔ 真实行业的对应在 `segment.ts` 的 `THEME_REAL`。`checkSegment(raw, themeIds)` 校验下载来的段，不对就退回合成行情。
- 开局 `realFromSegment(seg, themeIds, stockIds, smooth)` 只取登场风口和绑定股票的部分存进 `state.real`（约 15KB，进存档；读档、回放不再下载），并算好每个行业的 `ex`（均摊超额）与 `scale`（归一尺度）。
- `pickSegmentId(seed, ids, hash)`：同一种子同一份目录抽到同一段。每日挑战只在冻结的段池 `DAILY_SEGMENTS` 里抽（`dailySegmentId(date)`），段库加了新段也不变。
- 数据管线（`tools/data/`）在开发机上跑，产物进仓库、原始数据不进，见 `AGENTS.md` 第 5 节；段库现为 135 段，开局日两两至少隔 39 个交易日。

### 7.4 局末故事

`storyView(state)`（`reveal.ts`）→ `{ regime, regimeWord, title, lines, verdict, marks? }`；合成行情为 `null`。`runSummary(state).segment`（`SeenSegment`）带上故事，档案图鉴里可以重看。
拼法是确定的（按种子 + 段 id + 本局结果）：开头（按市况）→ 大环境和冷热风口 → 段内大事的故事版（最多 3 条，只讲玩家撑到的那段）→ 经历（被收走 > 赎回 > 押到年底 > 押跌 / 被轧 > 重仓，模板 `EXT_TALES`）
→ 赚得最多 / 亏得最多的一笔 → 跟得最多的群友 → 结局；超过 8 句时先省大环境、再省群友。时间一律说游戏内的「第二个月月底」。
伤亡、灾害、袭击、停市、选举类大事用 `SENSITIVE_WORDS` 过滤；故事里不能出现四位年份、真实日期、化名、内部 id、段 id（`tests/core/story.test.ts` 扫描）。

## 8. 仓位、押跌、抵押（`ext`）

`createRun` 带 `ext: true` 才有，`state.ext = { loans, called, learned, log }`。数值在 `BALANCE.ext`，`node tools/sim.ts --set ext.xxx=…` 可临时覆盖。

**仓位**：1 份 = 账户的 1/4，总份数 = 格子数。`taste` 1 份（`ext.taste`）、`half` 2 份、`heavy` 剩下全部现金；换股时那一格的份数先回来；现金不到半份（`minUnit` 0.5）不能买。
超过 1 份时这一笔多花 `impact`（1.2）× (份 − 1) pp 的冲击成本。`add` +1 份，`trim` 减半（至少留 0.5）。引擎：`unitsOf / usedUnits / freeUnits / sizeUnits`。

**押跌**：`canShortNow(s)` = 娱乐局 `isEaseRun(s)`（`real.ts`：真实行情且不是实盘；账单打折、群友更准也认它）或 `rules.canShort`（押跌许可证道具、人设炒股大佬、主题解锁）或 `difficulty ≥ ext.shortLevel`（现为 99，难度不送；送了会让难度梯度倒挂）。
押跌那一格收益 = −个股涨跌 − `shortFee`（0.3）+ 顺风逆风 `shortWind`：真实行情看开盘前 20 个交易日大盘累计涨跌 × −`shortWeather`/2，封顶 ±1.5 × `shortWeather`（2）pp；
合成行情晴天 −`shortWeather`、雨天 +`shortWeather`。个股涨停（被轧）时再 − 涨幅 × (`squeeze` 1.5 − 1) × `rules.squeezeMult`。归因只有「押跌」「被轧」两项（加道具）。

**抵押**（`borrow` / `repay`）：第 `bankMonth`（2）月起、盘前、借完后账户 ≥ 欠款 × `borrowLine`（1.6）才肯借，借款加进账户；还清拿回东西。难度每高一级借款额 +10%、利息 +10%。

| 抵押物 | 借款 | 月息 | 起始难度 |
|---|---|---|---|
| 金镯子 `bracelet` | 2 万 | 8% | 1 |
| 车 `car` | 5 万 | 10% | 1 |
| 房子 `house` | 12 万 | 9% | 3 |
| 爸妈的养老钱 `pension` | 8 万 | 6% | 5 |

银行每天收盘和每月还完钱后检查：账户 < 欠款 × `seizeLine`（1.25）时先收走借得最多的那件（账户 − 借款 − 借款 × `penalty` 0.2），直到回到线上；
账户 < 欠款 × `callLine`（1.45）打电话（跌破那一下才打，回到线上清掉）。月底先付利息（Σ 借款 × 月息）再还月供；最后一个月还完后银行收回没还的借款。
`loanOffer(s, id)`、`debtOf(s)`、`bankView(s)` 给出画面要的一切；`bankRisk(s)` 在月底前一天提示「付完账单会不会被收东西」。

小知识：`KNOWLEDGE` 11 条，第一次触发时发 `learned` 事件；`knowledgeView / knowledgeCard / extTip / extRecap` 在 `extview.ts`，档案里记 `Profile.knowledge`。

## 9. 节奏：月度主题、目标、高光、平淡日（`tempo.ts`、`content/monthThemes.ts`）

`state.tempo`（`TempoState`）：`plan`（12 个月主题 id，隐藏未来月份）、`cur`（本月 `MonthGoalState`）、`streak / bestStreak`、`shards`、`results`、`bonus`。

- **开局** `planTempo(seed, difficulty, real, ext)`：按种子、这一段每个月大盘的真实涨跌和最大单日跌幅、难度加权抽 12 个，不重复；第 4、8 个月（`tempo.bossMonths`）从 boss 池抽。需要 ext 的主题（押跌、抵押）只在 `ext` 时进池。
- **月初**：`beginMonth`（算月供之前，规则表从此叠加主题的 `rules`）→ `monthStarted` → `monthTheme` 事件（看点卡：`goal, name, intro, rule, goalText, rewardText, roast`）。
  顶栏用 `monthThemeView(s)`（`goal.progress / target / done / failed / boss`、`daysLeft`、短版 `ruleShort / line`）。
- **目标** `GoalKind`：`gain` 本月涨 X%、`keep` 最大回撤不超过 X%（破线当场失败）、`limitUp` 抓到涨停 N 次、`shortWin` 押跌赚 N 次、`streak` 连续 N 天赚钱、`themes` 同时拿 N 个风口、
  `beat` 跑赢大环境 X pp、`quickWin` 当天买当天赚 N 次、`bigDay` 持仓单日涨 ≥ X%。难度每高一级目标 × (1 + `tempo.goalStep` 0.08)（`keep` 反过来收紧，`goalTarget`）。
  真实行情的普通局（`isRegularRun(real, setup)`：不是每日挑战、闪电盘、本周市场、实盘）`streak` 少要一天，其余模式照原数。
  计数类达成当场发奖；`gain / beat / keep` 月底还钱之前判定（`goalDone / goalFailed`）。
- **奖励**：现金 = 当月常规月供 × `tempo.cash`（0.2；boss `bossCash` 0.5），加碎片；boss 另给一个道具。
- **主题**（17 个普通（基金抱团月 `herd_month`、群聊刷屏月 `flood_month` 只在真实行情普通局，`realOnly`）+ 4 个 boss，`MONTH_THEMES`，规则与第 1 级目标见 `content/monthThemes.ts`；每个有一句开场白和一句群友吐槽，群友不在群里时换成群主）：
  过山车月（推荐里过山车股多三倍；抓涨停）、收割机带单月（群主说话和推荐翻三倍；涨 3%）、年终奖到账（月初多半个月的钱但这月要还的多 20%；涨 4%）、
  银行搞活动（ext，借款利息减半；涨 3%）、空头来袭（ext，白送押跌许可；押跌赚 2 次）、考试月（只能买老实股；回撤 ≤ 4%）、丈母娘查岗（回撤 ≤ 5%）、
  消息满天飞（每天多 2 条消息；当天买当天赚 2 次）、提前看一天（每天一条重磅情报；涨 5%）、券商送福利（免手续费、每天多买一只；同时拿 3 个风口）、
  涨跌停放宽（宽一倍；持仓一天涨 12%）、连胜挑战（连击奖励翻倍；连续 3 天赚钱，规则版本 2 起 2 天）、鸡蛋别放一个篮子（每天多一条推荐；同时拿 3 个风口）、
  散户狂欢（每天多两条推荐；涨 5%）、逆风翻盘（跑赢大环境 2pp）；boss：股灾来袭（白送押跌、每天一条重磅情报；回撤 ≤ 6%）、年中考核（涨 6%）、
  庄家对决（过山车推荐 ×2、涨跌停宽一半；抓涨停 2 次）、基金经理挑战（跑赢大环境 4pp）。
  抽选偏好随这一段的真实行情（真实下跌月更容易抽到空头 / 逆风，上涨月更容易抽到散户狂欢；段内有真实大跌的月份几乎必抽股灾 boss）。主题只改规则和信息，不改走势。
- **收盘** `tempoClose` → `report.tempo`，同时发事件：
  - `spotted { kind: 'boards' | 'blown' | 'wild', stockId, move, boards, held }`：全场识别出的连板（≥ 2）、炸板、妖股异动；
  - `highlight { kind, text, stockId? }`：持仓涨停 / 跌停 / 连板 / 炸板 / 妖股 / 单日 ±5% / 账户 ±3% / 押跌跌停 / 连击 / 目标达成 / 股灾 / 重磅情报；
  - `combo { kind: 'streak' | 'shortWin' | 'limitUp' | 'shards', count, cash, shards, itemId? }`：连续 `tempo.streak`（3）天起每天赚钱给当月月供 × 1.5% 的红包（连胜挑战翻倍），
    押对跌、抓到涨停各 1 片碎片，集满 `tempo.shards`（3）片换一个道具；
  - `goalProgress / goalDone { cash, shards, itemId } / goalFailed`。
  每个月至少一次高光：月末前一天本月还没有高光时，主题放一条重磅情报。
- **平淡日**：`report.tempo.quiet` = 没有高光、连击、自动卖出、道具触发、银行电话，账户 |涨跌| < `quietAcc`（1%）、持仓 |涨跌| < `quietMove`（3%），画面可以快速翻过。
  盘前 `state.today.quiet`（`premarketQuiet(s)`，别名 `isQuietDay`）：不是月初、没有传闻、没有重磅情报、格子满了、没人聊你拿着的风口，画面可以自动开盘。
- 工具：`tools/tempo-check.ts`（节奏）、`tools/intel-check.ts`（情报准确率）、`tools/realness.ts`（真实度），参数见脚本顶部。

