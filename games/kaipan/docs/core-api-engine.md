# 《开盘》规则层接口：入口、状态、操作、事件、查询

> 本文件是 [core-api.md](core-api.md) 的分册，节号和内容原样保留；总目录见 [core-api.md](core-api.md)。

## 2. 入口函数（`engine/`、`index.ts`）

```ts
createRun(seed: string, setup: RunSetup | null = null, opts: CreateOptions = {}): { state: GameState; events: GameEvent[] }
dispatch(prev: GameState, action: Action, opts?: DispatchOptions): DispatchResult
replay(seed, actions, setup, opts): GameState        // 任何一步非法都抛错
validate(state, action): string | null
```

`CreateOptions`：

| 字段 | 含义 |
|---|---|
| `segment` | 抽中的行情段（第 7 节）。缺省或 `null` = 合成行情：离线兜底、`?market=synthetic`、行情段下载失败时走它；一局最少要 `totalDays()`（58）天 |
| `ext` | 打开仓位、押跌、抵押（第 8 节）。正式游戏都开；不开时新操作报「这一局没有这个玩法」，新道具不进奖励池 |
| `tempo` | 月度主题、目标、高光、连击（第 9 节）。缺省：有行情段就开、合成行情关 |

`createRun` 返回的 `events` 是第 1 个月的开场事件（`monthStarted`、`monthTheme`、`dayStarted`、`chat`）。

`RunSetup`（开局设置，存进 `state.setup`，正常开局为 `null` 或只带前几项）：

| 字段 | 说明 |
|---|---|
| `persona` | 人设（缺省 `newbie`），见第 11 节 |
| `difficulty` | 难度 1..8（缺省 1，`MIN_DIFFICULTY / MAX_DIFFICULTY / clampDifficulty`；超过 8 报错） |
| `daily` | 每日挑战日期 `YYYY-MM-DD`（由 `dailySetup` 给出） |
| `short` | 娱乐短局：`{ months, billMult, goal }`，由 `shortSetup(persona, difficulty)` 给出（第 10 节） |
| `flash` | 闪电盘日期 `YYYY-MM-DD`（由 `flashSetup` 给出）：10 个交易日、没有月供、开局三选一道具、第 4 / 8 天收盘后各一个事件；和 `daily / live / short` 互斥（第 10 节） |
| `weekly` | 本周市场周号 `YYYY-Www`（北京时间 ISO 周，由 `weeklySetup` 给出）：玩法同闪电盘（`isFlash(s)` 两者都为真），另带这一周的一条规则（`weeklyRule(周号)`）；和 `daily / live / short / flash` 互斥（第 10 节） |
| `live` | 实盘：`{ months, billMult, lev?, tier?, gear? }`，由 `liveSetup(tier, persona, x)` 给出（第 10 节） |
| `account / items / friends / themes / holdings / noChat` | 只给调试、测试、模拟：开局资金、道具、额外群友、指定 6 个风口、开局持仓、关闭群聊（推荐来自「行情软件」，`Rec.friendId` 为空串） |

`isRankedSetup(setup)`：只带 `persona / difficulty / daily / short / flash / weekly` 才算正常开局，才计入档案和成就（闪电盘、本周市场例外：`recordRun` 回 `ignored: 'flash'`，只交榜）；带了调试字段的局不计。
`checkSetup` 会拒绝无效设置（未知 id、风口不是 6 个不重复、实盘与每日挑战同时给、闪电盘、本周市场与每日挑战 / 实盘 / 短局同时给，周号不合法等）并抛错。

## 3. GameState（`types.ts`，实际在 `types/run.ts`）

字段很多，类型看 `types/run.ts` 的 `GameState`，这里只讲不显然的。**标 隐藏 的画面不能显示**（显示等于剧透）。

| 字段 | 说明 |
|---|---|
| `phase` | `premarket` 盘前（买卖、开盘）/ `reward` 月度三选一 / `event` 事件二选一 / `won` / `lost` |
| `seed, setup, actions` | 回放三件套 |
| `persona, difficulty` | 人设、难度 |
| `account` | 账户余额（元），唯一的分数和货币。实盘的「资产」= 账户 − 欠银行的钱（`liveAssets`） |
| `month, dayInMonth, dayIndex` | 月份 1..12；本月第几个交易日（0 起）；全局交易日编号（0 起，= 已结算天数）。一局 58 天：每月 5 天，10 月 3 天（`BALANCE.monthDays`） |
| `themeIds / themes[id]` | 本局登场的 6 个风口（看板顺序）及状态。公开：`heat`、`history`（近几天收盘热度，最后一项 = heat）、`boost`（直播间加成）。**隐藏**：`stage`、`lastStage`、`left`、`sure`、`age`、`rebound` |
| `stocks[id]` | 在场股票：`price`（展示用）、`move`（上一交易日涨跌）、`boards`（连板数）、`history`（近 5 日）、`warnings`、`uncap`（ST 状态）、`delisted` |
| `mood` | 大盘（上一个交易日）`bull / flat / bear`，画面用窗外天气（`WEATHER_LABEL`）。今天的天气要等 `marketMoved` 才换 |
| `slots` | 持仓格 `(Holding \| null)[]`，基础 4 格（`extra_slot` 多一格）。只增不减 |
| `friends` | 群友 `{ id, hits, total, topics }`，战绩 = 说中 hits / total |
| `items` | 持有道具 id（按获得顺序，触发也按这个顺序） |
| `bill` | 本月账单 `{ month, name, amount, extras? }`。`amount` 是本月要还的总额（含突发账单、短局首付、杠杆利息）；常规月供 = `amount − Σextras.amount`，`billView` 直接给 `base` |
| `nextBillMult` | 下月月供倍数（信用卡代还后 1.2） |
| `today` | 今天：`messages`、`recs`、`buysLeft`、`ops`、`buys`、`quiet`（盘前平淡日，第 9 节）；**`plan` 隐藏**（今天预先掷好的行情） |
| `reward / event / lastDay` | 月度奖励（仅 `phase === 'reward'`）、当前事件（仅 `'event'`，展示用 `eventView`）、最近一天的结算明细 `DayReport` |
| `review / notice / pending / expiring / busyDay` | 熬夜复盘揭示（`review.day === dayIndex − 1` 时有效，**直接用 `themeBoard`**）、本月市场传闻、事件的延后结算、临时道具、加班日（用 `topBar(s).busy`） |
| `stats` | 复盘统计，成就和结束页用（`eventPicks` 记每个事件选了第几项，格式 `事件id:序号`）；`trades[]` 里的 `stage / guard` **隐藏**，结束页才能揭晓 |
| `endReason` | `bankrupt`（没还上账单）或 `margin`（实盘杠杆跌破清零线） |
| `real` | 本局的真实行情（第 7 节），**整段含未来的走势，画面绝对不能读**；合成行情为 `null` |
| `stars` | 自选股 id（0.35.0，`star` 操作加减；只影响画面排序和星标，不影响行情和结算；没加过的局缺省） |
| `ext / tempo / watch` | 仓位押跌抵押状态；月度主题状态（`tempo.plan` 是 12 个月的主题，**只能显示已经到的月份**）；`watch` 是还没揭晓的多日消息（**隐藏**，只存说法） |

`Holding`：`stockId, boughtDay, value`（买入以来的净值倍数，持有收益 = (value − 1) × 100）、`todayRet`（刚买入为 `null`）、`lowBuy`、`recBy`、`units`、`short`、`squeezed`、`ipo`（打新：`{ stage: 'frozen' | 'listed', offer, size? }`）等。
`stats.ipo`（`RunStats`，一次都没申购过的局缺省）：`{ subs, wins, money }` 申购次数、中签次数、打新累计盈亏（元）。
隐藏：`buyStage`、`sawEbb`。**T+1**：`dayIndex > boughtDay` 才能卖（`canSell(state, slot)`）；道具 `fomo` 取消 T+1。

`Message`：`{ friendId, theme, claim: 'up'|'flat'|'down', text, turn?, reverse?, days?, big? }`。`claim` 是群友对该风口方向的说法：
合成行情说的是「今天热度的变化」，真实行情说的是「从今天起 `days` 天（1–3）的累计涨跌」。`turn`（`start / top / ebb`）是拐点说法，只由说法方向和公开体感决定，不泄露真实阶段。
`Rec`：`{ stockId, friendId, text, taken, short?, days?, big? }`；`short` 是空军老周建议押它跌。

## 4. 操作（Action）

| Action | 何时 | 规则 |
|---|---|---|
| `{ type: 'buy', rec, slot?, size?, short? }` | 盘前 | 买第 `rec` 条推荐。`slot` 缺省放第一个空格；指定已有持仓的格子 = **替换**（原持仓卖出，也受 T+1）。每天限 `buysLeft` 只。`size`（`taste / half / heavy`）和 `short` 只在 `ext` 局可用 |
| `{ type: 'sell', slot }` | 盘前 | 卖出，格子变现金。当天买入的不能卖 |
| `{ type: 'add', slot }` | 盘前，ext | 加 1 份（现金不够有多少加多少），算一次买入（`freeAdd` 道具除外） |
| `{ type: 'trim', slot }` | 盘前，ext | 份数减半，至少留 0.5 份；T+1 同卖出；不记一笔交易 |
| `{ type: 'subscribe', size }` | 盘前，ext，申购日 | 打新：申购今天的新股（第 10 节「打新」），放进第一个空格，份数同买入；只在 `ipoToday(s)` 不为 `null` 时合法 |
| `{ type: 'borrow', id }` / `{ type: 'repay', id }` | 盘前，ext | 抵押借钱 / 还钱赎回（第 8 节） |
| `{ type: 'open' }` | 盘前 | 开盘：结算今天，然后进入下一天或月底流程 |
| `{ type: 'pickReward', index, slot? }` / `{ type: 'skipReward' }` | 奖励 | 选第 `index` 张卡；股票卡要放进 `slot`（缺省第一个空格；满仓必须指定，原持仓卖出）/ 都不要 |
| `{ type: 'choose', option }` | 事件 | 选 0 或 1 |
| `{ type: 'star', stockId }` | 局中 | 加 / 取消自选（`stars` 里有就去掉，没有就加上）；不算买卖、不占次数 |
| `{ type: 'deleverage' }` | 盘前，实盘 2× / 3× | 盘中减仓：杠杆降一档，记进 `gearCut`，发 `deleveraged { levered, x }`（第 10 节） |

加班日（`isBusy`）不能买卖；`rec.taken` 的推荐不能重复买；手里已有的股票不能再买。键盘快捷键是画面层的事（1–3 买、Shift+1–8 卖、空格开盘）。

## 5. 一天的时序与事件（GameEvent）

`dispatch` 返回的 `events` 按发生顺序排列，画面可以逐条播放。类型完整定义见 `types/event.ts` 的 `GameEvent`。

```
盘前：dayStarted → chat → [ipoOpened]          玩家买卖：bought / added / trimmed / sold（各自跟一个 quip）、subscribed（打新申购）、borrowed / repaid
开盘：opened
  ① marketMoved、themeMoved × 6               大盘天气、风口热度变化
  ② stockMoved × 持仓数（按格子顺序）、squeezed   每格持仓揭晓涨跌
  ③ chain × n                                 龙头涨停带跟风（合成行情；真实行情只播报识别出的跟涨）
  ④ itemTriggered × n、stockNews、autoSold     道具、ST 消息、止损/止盈/退市自动卖出
     ipoListed { slot, stockId, premium }     新股上市首日收盘（premium < 0 = 破发），跟在这格的 stockMoved 后
  ⑤ ipoDrawn { slot, won, offer }（出签那天）  打新抽签结果，没中这一格清空；然后 accountChanged 账户滚动
     bankCalled / seized                      银行打电话、收走抵押物（ext）
     messageJudged × n、intelJudged × n        今天的消息揭晓；前几天发的 2–3 天消息到期揭晓
     comment × 0..2、news × n、quip × n       群友吐槽、收盘新闻、股票小人台词
     crashHit（股灾日）                        
     swanOpen { notice }（黑天鹅日开盘，画面全屏报幕；收盘结果在 dayClosed 的 report.swan）
     spotted、highlight、combo、goalProgress/goalDone/goalFailed   节奏事件（第 9 节）
     themeReviewed（熬夜复盘）
  dayClosed { report }
月底（本月最后一个交易日收盘后）：
  [interestPaid（有借款）] → billPaid（含 credit: true 信用卡代还）或 bankrupt → runLost
  → [seized] → runWon（打完最后一个月）或 rewardOffered
选完奖励：rewardPicked / rewardSkipped（可能 friendJoined）→（约 40%）eventStarted → eventResolved
→ itemExpired × n → monthStarted → [marketNotice] → [pendingSettled × n] → [itemTriggered(打新)] → monthTheme → dayStarted → chat
```

要点：
- 实盘杠杆的 `gearWiped` + `runLost { reason: 'margin' }` 在收盘后（`dayClosed` 之后）和月底还完账单后各查一次。
- 道具触发点还有：`value_eye` 在月底 `billPaid` 之前逐只触发（`delta` 为元）；`diversify` 在账户结算时触发（`slot` 为 `null`，`delta` 为 pp），在 `accountChanged` 之前。

`DayReport`（`state.lastDay`、`dayClosed.report`，结算动画的数据源）：

| 字段 | 说明 |
|---|---|
| `market`, `themes[]` | 大盘 `{ moodBefore, mood, ret }`；每个风口 `{ id, heatBefore, heat, dH, ret, feelBefore, feel, stage(隐藏) }`，`dH` 是截断到 0..100 后的实际变化 |
| `stocks[]` | 当天**所有**在场股票 `StockMove`：`move, limitUp, limitDown, boards, blown, jump, chain, st, wild?, follow?` |
| `holdings[]` | 每格持仓 `HoldingMove`：`move`（个股）、`ret`（这格最终收益）、`parts`（归因）、`lead`（影响最大的一项）、`amount`（给账户带来的元）、`steps`、`holdRet`、`sold`、`units / short / squeeze` |
| `account` | `{ before, gross, ret, after, effects[] }`；**所有格的 `amount` 加上 `effects[].amount` 等于 `after − before`**（取到分，零头并进金额最大的一格） |
| `chains, triggers, autoSold, messages, intel?, comments, news, quips, bank?` | 如其名。`messages[].truth` 是收盘后才可以显示的真相 |
| `fireworks, rain, crash` | 持仓有涨停（烟花）/ 跌停（下雨）/ 今天股灾（收盘后才揭晓） |
| `tempo?` | `DayTempo { quiet, highlights, combos, goal, streak }`，无月度主题的局没有 |

**归因** `RetPart { kind, value, label, theme?, dH?, itemId? }`：`parts` 各项 `value` 之和等于 `ret`（误差 ≤ 0.01）；`label` 是规则层给的整句大白话，已带百分比，画面直接用。
`kind` 取 `theme / role / market / momentum / chain / jump / news / blown / limit / item / noise / short / squeeze`，顺序固定，值为 0 的项不给（`theme` 除外）。
真实行情下：`market` = 放大后的大盘，`theme` = 放大后的（行业 − 大盘），`noise` = 个股自身（股票 − 行业），`limit` = 涨跌停截断，之后才是道具。
账户日收益 = Σ 每格收益 × 份数 ÷ `holdingBase(s, Σ份数)`，再 × 杠杆倍数（借钱炒股道具）。
基础 4 格每格 1/4（空格是现金，不涨不跌）；多开一格拿满 5 只时每只 1/4.5（`extra_slot.share` 0.5，总仓位 111%），`HoldingCard.weight` 已算好。

## 6. 查询函数（`queries.ts` 汇总导出，实现在 `queries/` 下；另有 `extview.ts`、`meta.ts`）

画面优先用查询函数：它们只返回能显示的东西，并处理了隐藏信息的条件（情绪指标、熬夜复盘等）。

| 函数 | 返回 / 用途 |
|---|---|
| `themeBoard(s)` | 风口看板 `ThemeCard[]`：`heat, trend, lastDelta, feel/feelLabel, stage/stageLabel`（只有持有情绪指标，或被熬夜复盘揭示的那个才非空，`reviewed` 标记后者）、`boost, stocks` |
| `holdingCards(s)` / `stockCard(s, id)` | 持仓格（空格为 `null`）/ 股票卡。`HoldingCard` 多 `slot, todayRet, holdRet, holdMoney`（买入以来大约赚亏多少元，按现在的账户折算）`, canSell, lowBuy, weight, units, short`；`canSell` 已考虑加班日 |
| `chatView(s)` | `{ messages: MessageView[], recs: RecView[], buysLeft }`。消息带 `friend`（含 `record`：「说对 3/5」，没发过言是「新来的」）、`certain`（只有道具指定的必中，即老王的小本本）、`turn`、`reverse / readAs`（反着信群主：「实际看…」）；推荐带 `error`（现在不能买的原因）、`short` |
| `buyError(s, rec, slot?)` | 替换买入前的提示 |
| `buyOptions(s, rec, slot?)` | 买法选项：`sizes[]`（每个带份数、`error`、重仓的冲击成本 `cost / note`）和 `short`（解锁与否、原因、是否群友建议） |
| `positionsView(s)` / `bankView(s)` / `bankRisk(s)` | 份数与现金份数、银行（欠款、警戒线、可押物品、月息）/ 月底付账单会不会跌破线（盘前提示用） |
| `friendsView / friendView` | 群友名、身份、战绩、擅长风口 |
| `topBar(s)` | 顶栏：月日、账户、账单、剩余天数、天气、道具、格数、人设难度、`daily`、`flash`（闪电盘的日期、第几天、共几天、开局资产；本周市场也有，date 是周号）、`weekly`（本周市场的周号、规则 id、名字、进局一句话、说明；不是本周市场为 null）、`notice`、`busy`、`live`（实盘档位名/一份/按现在资产能带回多少）、`expiring`、`pending` |
| `billView(s)` | `amount`（总额）、`base`（常规）、`extras`（突发明细）、`enough`、`credit` |
| `calendarView / currentCalendar` | 12 个月日历；真实行情下 `desc` 自动换成 `realDesc`（老话说……涨跌照真的走）；0.36 起带 `ipo`（这个月抽新股的名字、第几天）和 `earnings`（有没有财报周） |
| `itemView(id)` / `rewardView(s)` / `eventView(s)` | 道具（`tag`「道具（常见）」、`brief` 短版）、三选一卡、事件（`brief`、`picks`） |
| `monthThemeView(s)` | 本月主题与目标（第 9 节） |
| `storyView(s)` | 局末「这段日子」（第 7 节） |
| `runSummary(s)` | 结束页小结：`won, account, peakAccount, month, billsPaid, bestTrade, title, style, startAccount / billMoney / tradeMoney / otherMoney / debtLeft`（账：本钱 + 炒股 − 账单 + 其他 + 没还的借款 = 最后剩）、`runId`（只用来判重，不要解析）、`ranked, short, daily, flash, weekly, live, achievements, seen, segment, knowledge, recap` |
| `dragonBoard(s, report?)` | 0.36 龙虎榜：`{ up, down, brag }`，涨跌各前 3（`BoardEntry`：名字、风口、涨跌、是否涨跌停、`callers` 当天说对它风口方向的群友名），`brag` 上榜群友的得意话；只读收盘报告，缺省 `s.lastDay` |
| `earningsView(s)` / `earningsPlan(s, month)` | 0.36 财报周（`earnings.ts`）：盘前横条 `{ name, stage: soon/today/done, daysLeft, nth, bets[], move?, beat? }`；`earningsPlan` 是隐藏的日程（哪只、哪天），画面只用 `earningsView` |
| `preHistory(s)` | 开局前 `warm` 天已发生的走势（大盘、个股、风口热度），按交易日同样的放大与截断算；合成行情补 20 天。画面画「开局前走势」只用它 |
| `validate / canSell / canShortNow / holdingBase / daysInMonth / totalDays / baseBill` | 按钮可用性与日历、账单预览 |

标签表在 `labels.ts`（`FEEL_LABEL`、`STAGE_LABEL`、`ROLE_LABEL`、`WEATHER_LABEL`、`DIR_LABEL`、`RARITY_LABEL` 等）。

元数据查询（`meta.ts`）：`personasView / personaView`、`difficultiesView / difficultyView`（`desc` 只有一句体感，具体数字在 `detail`；真实行情下用 `realDesc / realDetail`）、
`achievementsView`、`achievementsOf(state)`（**一局结束后才返回**，局中判定会剧透）、`codex()`（图鉴全部条目，点亮由档案决定）、`seenOf`、`runId`。

