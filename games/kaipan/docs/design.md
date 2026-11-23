# 《开盘》玩法设计（按代码现状）

> 这是《开盘》玩法的总设计稿，写"现在的游戏是什么样、为什么这样"。数值以 `src/core/balance.ts` 为准，内容以 `src/core/content/` 为准，
> 稿里的数字只是写稿时的取值；对不上时信代码。版本演进看 `CHANGELOG.md`，不在这里重复。
> 专题另有现行稿，这里只指过去：画面去文字化 `design-visual.md`、群友和小人的性格与接话 `design-chat.md`、
> 实盘（筹码）`design-live.md`、难度与收益配平 `design-balance.md`、分享 `design-share.md`、好友挑战 `design-challenge.md`、
> 美术 `art-v3.md`、手机适配 `mobile.md`。代码和测试用"design.md 第 N 节"引用本稿。

## 1. 总览与设计支柱

一款股市主题的肉鸽网页游戏：玩家是一个散户，每天盘前看群聊里的小道消息和推荐，挑股票小人进持仓，开盘看结果，月底还一笔越来越离谱的账单，
撑过去再三选一领奖励，一直打到年底。

1. **游戏为主、娱乐为主，让人快乐。** 真实性只为让涨跌像真的；不能做成炒股软件，不堆术语、不堆长句。
   能用图标、数字、颜色、动画表达的就不写字，但删掉的信息必须有替代，画面不能空。
2. **每天最多点两下**：买一只或卖一只，然后开盘。一个数字、一条主线：账户余额是唯一的分数，所有内容都通过"风口"和"角色"起作用。
3. **有选择、有取舍**：每只买多少、押涨还是押跌、借不借钱、信哪个群友。每个新机制都要能用一句话说清楚，说不清就砍。
4. **高难但公平**：难度靠"信息与判断"变难，不靠运气杀人；牛市不能躺赢，熊市和崩盘也要有通关路径。
5. **搭配丰富**：规则表只有几行，每个道具只改其中一格，组合靠风口集中、角色搭配、消息来源。
6. **全部虚构**：股票、公司、群友都是化名和小人，不出现真实公司、真人、真实机构、政治、军事或真实社会事件；
   伤亡、灾害类事件不进故事，不拿来搞笑。真实行情只驱动涨跌，不露年份和公司。

模式有两种入口，共用同一套规则核心：**娱乐**（本稿主体：完整一年或 5 个月短局、每日挑战、闪电盘、好友挑战）和**实盘**（带筹码打 5 个月，见 `design-live.md`）。
规则核心在 `src/core/`，是纯函数、带种子、同一个行情段 + 种子 + 操作结果逐位相同；画面层只读状态和事件。

## 目录：各节在哪个分册

第 1 节在本文件；其余各节按下表。引用「design.md 第 N 节」时按本表找文件，节号不变。

| 节 | 文件 |
|---|---|
| 第 2 节 小白词表 | [design-play.md](design-play.md) |
| 第 3 节 面向玩家的文案规矩 | [design-play.md](design-play.md) |
| 第 4 节 一局怎么玩 | [design-play.md](design-play.md) |
| 第 5 节 真实行情怎么驱动 | [design-market.md](design-market.md) |
| 第 6 节 仓位、押跌、抵押 | [design-market.md](design-market.md) |
| 第 7 节 群聊与情报 | [design-market.md](design-market.md) |
| 第 8 节 月供与突发账单 | [design-market.md](design-market.md) |
| 第 9 节 节奏：月度主题、目标、高光、连击 | [design-play.md](design-play.md) |
| 第 10 节 道具、事件、奖励、日历 | [design-play.md](design-play.md) |
| 第 11 节 人设与难度 | [design-persona.md](design-persona.md) |
| 第 12 节 成就 | [design-persona.md](design-persona.md) |
| 第 13 节 结局、称号与"这段日子" | [design-persona.md](design-persona.md) |
| 第 14 节 其他模式与专题（指路） | [design-persona.md](design-persona.md) |
| 第 15 节 闪电盘 | [design-modes.md](design-modes.md) |
| 第 16 节 黑天鹅 Boss 日 | [design-modes.md](design-modes.md) |
| 第 17 节 本周市场 | [design-modes.md](design-modes.md) |
| 第 18 节 打新 | [design-modes.md](design-modes.md) |
| 第 19 节 财报周和龙虎榜 | [design-modes.md](design-modes.md) |
