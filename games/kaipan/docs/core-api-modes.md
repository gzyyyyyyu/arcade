# 《开盘》规则层接口：局的种类、内容、隐藏信息、数值表、URL 参数

> 本文件是 [core-api.md](core-api.md) 的分册，节号和内容原样保留；总目录见 [core-api.md](core-api.md)。

## 10. 局的种类：完整一年、娱乐短局、新号短局、新手课、实盘、每日挑战、闪电盘、本周市场、好友挑战

| 种类 | 开局 | 规则差别 |
|---|---|---|
| 完整一年 | `createRun(seed, { persona, difficulty })` | 12 个月，打完最后一个月月底的账单即通关（`runWon`），没有奖励 |
| 娱乐短局 | `shortSetup(persona, difficulty)` | 只打 `BALANCE.short.months`（5）个月；账单 × `billMult`（0.25）；最后一个月月底多交一笔「首付」（突发账单 `SHORT_GOAL_BILL`，金额 = 开局资产 × `short.goal[难度]`，`shortGoal(s)`）。`runMonths(s)` 给出这局打几个月；`shortNeed(s)` 给出剩下的账单加首付一共约多少（本月用已公布的账单，以后几个月按不带主题的规则表 `rulesWithoutTheme` 估，不透露没公布的主题和突发账单） |
| 新号短局 | `noviceSetup(persona)` | 新手档短局，首付比例换成 `BALANCE.novice.goal`（0.85）；画面在档案正式局不到 `BALANCE.novice.runs`（3）局时用它，行情段只从 `NOVICE_SEGMENTS`（不含崩盘、熊市）里按种子抽，`isNoviceSetup(setup)` 认出它（重玩同池）。规则和娱乐短局相同，进档案 |
| 新手课 | `lessonSetup()`，种子 `LESSON.seed`、段 `LESSON.segment` | 两个月短局，账单 × 0.05，首付 = 开局资产（不亏就过）；`setup.lesson = true`，必须是短局、不和每日挑战等同开。`lessonAdvice(s)` 给盘前建议，`mindMoment(s)` 给心法的当场例子（`src/core/lesson.ts`，设计见 `design-lesson.md`）。不进档案、不交分，过关记 `Profile.lessonWon`、六张心法全亮 |
| 实盘 | `liveSetup(tier, persona, x)` | 档位 `small / mid / big / lux`（`LIVE_TIERS`：一份 2,000 / 10,000 / 50,000 / 200,000 筹码，难度 1/2/3/3）；打 5 个月；账单 × 档位 `billMult`。带回倍数见下 |
| 每日挑战 | `dailySetup(date)` → `{ date, seed, setup }` | 种子 `daily-<日期>`；人设从 5 个里挑（含未解锁的）、难度 2..5（`DAILY_LEVELS`）；段在冻结池里抽，大家同一段；日期用玩家本地日期，由画面决定 |
| 闪电盘 | `flashSetup(date)` → `{ date, seed, setup }` | 种子 `flash-<日期>`，独立的 rng 用途名；人设 5 选 1、难度 2..4（`FLASH_LEVELS`）；段 `flashSegmentId(date)` 在每日冻结池里抽。只打 `BALANCE.flash.months`（2）个月 = `flashDays()`（10）个交易日：没有月供、突发账单、股灾传闻、月度主题（`startMonth` 的 `isFlash` 分支，不发 `monthStarted`），月底不发奖励不抽事件，不会出局。开局 `phase = 'reward'`，三选一只出道具（`rollFlashRewards`，不含 `credit / crowd_fund`，rng 用途 `flashReward`），领完才 `startDay`；第 `BALANCE.flash.eventAfter`（4、8）个交易日收盘后必来一个事件，从 `FLASH_EVENTS`（当场见分晓的 9 个）里抽、不重复（`flashEvent`，rng 用途 `flashEvent`），选完直接接着打。`isFlash(s)` 判断；`flashScore(s)` 是分数。不进档案，不能发好友挑战 |
| 本周市场 | `weeklySetup(week)` → `{ week, seed, rule, setup }` | 玩法同闪电盘（10 天、没有月供和银行、开局三选一、第 4 / 8 天事件，rng 用途 `weeklyReward` / `weeklyEvent`），种子 `weekly-<周号>`，rng 用途 `weekly`；段 `weeklySegmentId(week)`。另带一条按周号轮换的规则（`src/core/weekly.ts`：`weeklyRule` / `applyWeeklyRules` / `applyWeeklyMarket`，数值 `BALANCE.weekly`）：涨跌停放宽（`limitMult`）、反向群聊（`reverseAll`，`Message.liar` / `Rec.liar`）、题材快轮（`MarketRules.dHMult`）、满仓周（`slots` +2）、做空周（`canShort`、`shortGainMult`、`squeezeMult`）。`weeklyScore(s)` = `flashScore(s)`；榜 `weeklyBoardId(week)` = `week-<周号>-rules`。不进档案，不能发好友挑战 |
| 好友挑战 | `challengeOf(state, version)` → payload；`challengeSetup(p)` | 把一局的开局（种子 + 人设 + 难度 + 短局规则 + 行情段 id）存成一小段 JSON，好友打开是同一个开局。只发打完的娱乐局；payload 是别人交上来的，`parseChallenge` 按白名单逐项校验 |

**实盘带回**（`live.ts`、`liveTiers.ts`，Worker 也用后者）：不碰钱包，只算倍数。`liveMultipleBp(s)`（万分之几的整数，0..cap × 10000）= 1 + 档位涨跌倍数 `lev` ×（资产 ÷ 开局资产 − 1），破产为 0；
`liveReturn(stake, bp)` = ⌊一份 × bp ÷ 10000⌋，全是整数运算，不会因小数误差少给 1 筹码。`liveValue(s)` 给顶栏小牌子用。
**杠杆**：稳健 1× / 进取 2× / 疯狂 3×（`BALANCE.live.gears`：封顶 3 / 5 / 7 份，每月利息 0 / 1.3% / 1.8% 乘档位 `gearRate`，清零线 0 / 0.2 / 0.5）。
带回再按 x 放大一次；放大后的带回倍数跌到清零线就爆仓（`gearWiped` + `runLost { reason: 'margin' }`，`endReason = 'margin'`）；利息作为突发账单 `GEAR_INTEREST_BILL` 随月供扣（`gearInterest(s)`），
`gearLevered(s)` 给放大后的倍数，`warnGap` 内顶栏提醒（只是画面）。
**盘中减仓**（`deleverage`）：降一档后 `s.gearCut = { r0, v0, x }`，之后倍数 = `v0 + x × lev ×（资产比 − r0）`，利息按 x 那一档（1× 为 0），不再检查清零线；`liveMultipleBp` 同样按它算。

每日挑战的分数：`dailyScore(won, account, billsPaid)`，通关的按最后账户（元，取整）排、都排在没通关的前面，没通关的按还上几个月排；`dailyScoreView` 还原，`dailyBoardId(date, kind)` 是榜单 id：每日榜按子榜分，经典是 `daily-<日期>-classic`（`kind` 缺省），闪电盘是 `daily-<日期>-flash`。好友挑战沿用这个分数（`challengeScore`）。
**黑天鹅 Boss 日**（`src/core/swan.ts` 内容表和纯函数，`engine/calendar.ts` 定哪局哪天）：`hasSwan(s)`（真实行情、正常开局、非每日 / 闪电 / 实盘）、`lastDayIndex(s)`（这局最后一个交易日的 `dayIndex`）、
`swanPlan(s)`（`{ kind, theme }`，只由种子定，rng 用途名 `blackSwan`；隐藏信息，画面不直接读）、`swanNotice(s)`（最后 `BALANCE.swan.warnDays` 天盘前公开：`kind / name / theme / daysLeft（2、1、0）/ line / hedge`，不含幅度；`topBar(s).swan` 同源）。
最后一天 `open` 时发 `swanOpen { notice }`，每格持仓的 `HoldingMove.swan`（这格被额外改了多少 pp）、`parts` 里的 `swan` 项（`RetPartKind`）和 `DayReport.swan`（`SwanReport`：种类、题材、对持仓的盈亏元、`touched`）都在收盘报告里；
`runSummary(s).swan` 取最后一天的这一项。`swanSwitch.enabled = false` 是模拟器 `--no-swan` 和测试对照用的开关，正式游戏不动。幅度在 `BALANCE.swan`，成就 `swan_hunter` 读 `lastDay.swan` 和当天账户涨跌。

**打新**（`src/core/ipo.ts` 纯函数，`content/ipos.ts` 16 只化名新股 `IPO_STOCKS`，`engine/calendar.ts` 定哪局哪天、`engine/open.ts` 冻结抽签上市）：
`hasIpo(s)`（真实行情、带 `ext`、正常开局、非每日 / 闪电 / 本周 / 实盘）、`ipoOffer(s, month)`（这个月的新股和日程 `IpoOffer`：`stockId / name / theme / month / day / drawDay / listDay / odds`，除第 1 个月和最后一个月每月一只，题材和新股只由种子定，rng 用途 `ipo`）、
`ipoToday(s)`（今天盘前能申购的新股：这个月还没申购、有空格也有闲钱、没在加班；别的时候 `null`）、`ipoPending(s)`（正在冻结的申购 `{ slot, offer }`）。
申购占第一个空格，`Holding.ipo = { stage: 'frozen', offer, size }`：冻结 2 个交易日，`stockId` 是新股 id 但 `s.stocks` 里还没有它，收益 0（不在 `report.holdings` 里），`canSell` 为 `false`，卖、减、加、换都报错（`validate`）；
冻结满那天收盘后出签（`ipoDrawn`）：没中清空这一格；中了固定 1 份、`stage` 变 `'listed'`、新股加进 `s.stocks`（`role: 'ipo'`，`newStock`），次日起能卖；再过一天是上市首日。
新股逐日照搬绑定的替身（同题材真实波动最大的在场股票，`ipoBoundStock`）的真实涨跌 × `BALANCE.track.amp`，上市首日叠溢价（`ipoFirstPremium`：70% +15..+45pp，否则破发 −5..−20pp），第 2 天叠首日的 0.3 倍（`ipoPremiumOn`），
`HoldingMove.ipo` 记这一天叠了多少（只在头两天有），`parts` 里多一项 `ipo`（`ipoPartLabel` 一句大白话：新股上市溢价 / 破发），首日收盘发 `ipoListed`。
新股不进推荐、群聊、奖励（`stocksOf` 和 `STOCKS` 都不含 `role: 'ipo'`，`stockById` / `isStockId` 认得它；`StockDef.look` 是画面借用形象的同题材内容股）。
`stats.ipo` 记申购、中签和打新盈亏，成就 `ipo_first`（首次中签）、`ipo_three`（一局中签 3 次）读它。中签率、冻结天数、配售份数、溢价区间在 `BALANCE.ipo`；
`ipoSwitch.enabled = false` 是模拟器 `--no-ipo` 和测试对照用的开关，正式游戏不动。自动快进（`TodayState.quiet`）不管申购日，画面要自己看 `ipoToday(s)`，申购日停下来。

闪电盘的分数：`flashScore(state)` = 最终资产（元，取整，不分通关），显示规则是 `public/daily.json` 的 `boards.flash`（`¥{n}`）；本周市场的分数 `weeklyScore` 同口径，榜 `week-<周号>-rules`，显示规则是 `public/weekly.json` 的 `boards.rules`（周号由画面层 `beijingIsoWeek` 算，核心只收字符串）；`boards.classic` 是上面经典的写法。

## 11. 内容与 id

内容表在 `src/core/content/`，都从 `index.ts` 导出（`STOCKS / ITEMS / EVENTS / ACHIEVEMENTS / CALENDAR / PERSONAS / DIFFICULTIES / FRIENDS / MONTH_THEMES / KNOWLEDGE / COLLATERALS` 等）；美术按 id 出图。

- 风口 `THEME_IDS`（8 个）：`ai, newenergy, consumer, pharma, finance, lowalt, gaming, pig`。每局登场 6 个（人设可指定必登场）。
- 股票 `STOCKS`（40 只）：每个风口约 5 只，角色 `leader` 带头大哥 / `follower` 小弟 / `bluechip` 老实股 / `meme` 过山车 / `st` 危险股；`stocksOf(theme)`。
- 群友 `FRIENDS`（10 个）：开局 `xiaoli, laowang, zhangjie, qunzhu, laozhao, dav`；后加入 `neimu`（付费群或新群友卡）、`zhuchang`（新群友卡，需要养猪风口在场）、`kongjun`（空军老周，只唱空，押跌解锁时入群）、`quant`（量化小哥，月度奖励的新群友卡，`realOnly`：只在真实行情的非每日局进抽取池，合成行情和每日挑战的奖励抽取不变）。
- 道具 `ITEMS`（30 个）；押跌、抵押相关的标 `ext`（`short_permit, sunglasses, banker, pyramid`……）；`contrarian`、`hold_tight` 标 `realOnly`，只在真实行情的非每日局进月底三选一和随机送道具的事件（`events.ts` 的 `tacticIds`、`blindPool`，`engine/reward.ts` 的 `rewardCandidates`）。`HoldingCtx.marketRet` 是今天大盘涨跌（pp）。
- 事件 `EVENTS`（21 个，`salary_advance`、`old_trader` 只在真实行情的非每日局出现，见 `events.ts` 的 `realOnly`）、日历 `CALENDAR`（12 个月）、成就 `ACHIEVEMENTS`（51 个，铜 / 银 / 金）、突发账单 `SURPRISE_BILLS`（9 个，`BillExtra.id`）、月供名目 `BILL_NAMES`。
- 人设 `PERSONA_IDS`：`newbie, retiree, mom, coder, youzi`（`coder`、`youzi` 由成就解锁，`personaView(id).unlockBy`）；难度 8 级 `slow_bull … doom`（`DIFFICULTIES`）。哪些人设、难度能选由档案决定（`src/platform/profile.ts` 的 `isPersonaUnlocked / isDifficultyUnlocked`）。

## 12. 隐藏信息（画面不能显示）

| 字段 / 函数 | 说明 |
|---|---|
| `themes[id].stage / lastStage / left / sure / age / rebound` | 风口真实阶段与内部计数。`lastStage` 只有持有情绪指标时才能显示，熬夜复盘只揭示一个、只到第二天盘前：一律以 `themeBoard` 为准 |
| `today.plan` | 今天预先掷好的行情，开盘前显示等于剧透 |
| `real`（整个对象）、`watch` | 含未来的走势序列；多日消息的说法在揭晓前不能被当作线索。画面只用 `preHistory` 和已发生的数据 |
| `tempo.plan` | 12 个月的主题，只显示已经到的月份 |
| `Holding.buyStage / sawEbb`、`TradeLog.stage / guard` | 买入时的阶段、站岗判定。结束页复盘可以揭晓，局中不显示 |
| `ThemeMove.stage`（`themeMoved` 事件、`report.themes`） | 当天真实阶段，局中不显示 |
| `PendingEffect` 的结果 | 到期才掷，画面只显示本金和到期月份 |
| `crashPlan / surprisePlan / turnOf / messageCred / themeTruth / stockTruth / forwardRet / earningsPlan` | 只给测试和模拟用 |

可以显示的：热度、走势、体感、大盘天气（上一个交易日）、消息与推荐、战绩、收盘后揭晓的 `truth`、连板、ST 警告、当月的 `bill.extras`、本月 `notice`、已到月份的主题与目标。

## 13. 数值表（`balance.ts`）

`BALANCE` 的分组和关键值，具体数字以 `balance.ts` 为准（每项上面有注释）：

| 分组 | 内容与关键值 |
|---|---|
| 基础 | `startAccount` 10 万、`monthDays` [5×9, 3, 5, 5]（共 58 天）、`slots` 4、`buysPerDay` 1、`recs` 3、`messages` [2,4]、`activeThemes` 6 |
| `bills`、`surprise` | 月供 = 9,000 × 1.105^(月−1)，取整到百元（12 月约 1 月的 3 倍）；一局 2–3 次突发账单，窗口 [2,4] [5,8] [9,10]；金额范围按名目 |
| `heat`、`stages`、`themes`、`market`、`roles`、`boards`、`chain`、`st` | 合成行情的风口生命周期、角色参数（`beta / market / noise / limit / jump`）、连板、龙头带跟风、ST；真实行情下只有 `roles[].limit` 和显示相关的用到 |
| `real`、`track` | 真实行情推热度和天气：`smooth 0.35, heatGain 12, heatPull 0.2, heatBase 20, moodDays 3`、阶段门槛 `real.stage`；个股照搬：`track.amp 2`、`billMult 0.5`、`regimeBill`、识别阈值 `blown −5 / wild 7 / follow 3` |
| `intel`、`chat`、`cred` | 情报与群聊：群友准确率表 `intel.cred`（合成行情用 `cred`）、`diffStep 0.02`、`qunzhuFlip 0.8`、`headline 0.85`、`news 0.65`、`cat 0.6`；`chat.credMax 0.95`、`form` 每局状态 |
| `ext` | 仓位 / 押跌 / 抵押（第 8 节） |
| `tempo` | 月度主题与高光（第 9 节） |
| `reward`、`events`、`crash` | 三选一卡数与权重、每月事件概率 0.4、股灾月份 [4–9, 11] 与出事日 |
| `short`、`live` | 短局 5 个月 / 账单 × 0.25 / 首付比例 [0.95, 1.05, 1.1]；实盘 5 个月、封顶 3 份、四档 `billMult / lev / gearRate`、三档杠杆 |
| `fx[id]` | 道具、日历、事件、人设、难度的效果数值，键为内容 id；文案的 `desc()` 从这里取数，改数值不用改文案。`fx(id, key)` 取值（缺省 0） |

改数值必须用 `npm run sim` 验证（难度梯度、牛熊都有通关路径、牛市不能躺赢、抵押不是最优解），不凭感觉。常用：

`node tools/sim.ts --real-table --ext --runs 540 --seed <种子>`（135 段 × 各难度通关率，真实行情）、`--diff-table`（合成行情）、`--set ext.xxx=…`（临时覆盖 BALANCE 某项）。

机器人在 `tools/bots.ts`（`random / follower / normal / truster / smart / oracle` 和 `heavy / shorter / gambler` 等变体）；`smart / oracle` 在真实行情下是 `trackBot`（知道群友真实准确率 / 直接看行情段的真实未来）。
配平目标与历次实测见 `docs/design-balance.md`。

## 14. URL 参数（调试和自动化，`src/debug/params.ts`、`src/main.ts`）

带了 `seed` 或任何开局参数就跳过开始菜单直接开局，**这一局不计入档案**（`session.markUnscored`），正式构建里已有存档时也不写存档。

| 参数 | 映射 |
|---|---|
| `seed` | 种子（不读存档） |
| `account`、`items=a,b`、`friends=a,b`、`themes=a,b,…`（6 个）、`holdings=a,b` | 对应 `RunSetup` 的调试字段 |
| `difficulty` | `RunSetup.difficulty`，截到 1..8 |
| `persona` | `RunSetup.persona`（须是有效人设 id） |
| `daily=1` / `daily=YYYY-MM-DD` | 用 `dailySetup` 开那天的每日挑战（种子、人设、难度、`daily`）；再带 `seed / persona / difficulty` 覆盖对应项，仅供调试，档案仍按那天的每日挑战记 |
| `layout=phone\|portrait\|desktop` | 强制手机横屏版、手机竖屏版或电脑布局（`view/theme.ts`），缺省按屏幕和开局时的方向判断 |
| `atlas=0\|1` | 强制不用 / 用烘焙图集（`BootScene`），缺省自动；对比清晰度、统计请求数用 |
| `challenge=<id>` | 好友挑战链接：读出挑战 id，有平台时开始菜单弹挑战卡片；id 不合格当没有（`view/challenge.ts`） |
| `ext=1` | URL 开的局也打开仓位、押跌、银行（缺省按基础玩法开，旧自动化脚本不受影响）。注意：URL 开局直接 `createRun`，**不带行情段**，是合成行情 |
| `market=synthetic` / `market=<段 id>` | 经界面「再开一局」开局时：`synthetic` 用合成行情，段 id 指定那一段真实行情（缺省 `real` = 按种子抽） |
| `anim=0/1`、`speed=N` | 关 / 开动画、动画倍速（优先于玩家设置） |
| `debug=1` | 调试浮层（显示隐藏信息）；这个会话里的局都不计入档案 |
| `scale=N`、`soundboard=1` | 强制渲染倍数、音频试听面板（在 `view/theme.ts`、`view/audio` 里读取） |

真实行情下用脚本开局：`window.__game.newRun(seed, setup)`（和界面同一条路，按种子异步抽段），或在 node 里 `createRun(seed, setup, { segment, ext: true })` 推进后 `__game.loadState(state)`；调试桥完整接口见 `src/debug/bridge.ts`。
