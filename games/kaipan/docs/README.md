# 文档索引

各文档讲什么见模块 [README.zh-CN.md](../README.zh-CN.md) 的「文档」一节。文档写代码现状，对不上时以代码为准并顺手改对；各版改了什么只在 [CHANGELOG.md](../CHANGELOG.md)。

## 节号对照

玩法设计和规则层接口各分几份，节号整套统一（代码、测试里写「design-modes.md 第 18 节」这类引用时按节号找）。

| 玩法设计 | 节 |
|---|---|
| [design-play.md](design-play.md) | 1 总览与设计支柱、2 小白词表、3 面向玩家的文案规矩、4 一局怎么玩、9 节奏、10 道具事件奖励日历 |
| [design-market.md](design-market.md) | 5 真实行情怎么驱动、6 仓位押跌抵押、7 群聊与情报、8 月供与突发账单 |
| [design-persona.md](design-persona.md) | 11 人设与难度、12 成就、13 结局称号与「这段日子」、14 其他模式与专题（指路） |
| [design-modes.md](design-modes.md) | 15 闪电盘、16 黑天鹅 Boss 日、17 本周市场、18 打新、19 财报周和龙虎榜 |

| 规则层接口 | 节 |
|---|---|
| [core-api-engine.md](core-api-engine.md) | 1 总则、2 入口函数、3 GameState、4 操作、5 一天的时序与事件、6 查询函数 |
| [core-api-market.md](core-api-market.md) | 7 真实行情与行情段文件、8 仓位押跌抵押（`ext`）、9 节奏 |
| [core-api-modes.md](core-api-modes.md) | 10 局的种类、11 内容与 id、12 隐藏信息、13 数值表、14 URL 参数 |

## 资料

- [changelog/](changelog/)：0.35.0 及更早的更新日志，按版本段分五个文件。
- [history/](history/)：数据核对和几个年份的事件时间线，是创作研究底稿，不上线、不进游戏；游戏里不出现真实年份和公司名（故事用化名，行情段只存相对涨跌）。
- 故事稿的化名表是数据，在 `tools/data/story-aliases.json`（`tests/core/story.test.ts`、`tools/data/check.ts` 读它）。
