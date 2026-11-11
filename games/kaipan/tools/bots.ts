/**
 * 自动玩家：数值模拟（tools/sim.ts）和测试共用。按设计稿第 11 节：
 * - random：随机买卖。
 * - follower：总是买推荐里的第一只，从不卖。
 * - chaser：追最热的题材，热度下降就卖。
 * - normal：普通人。参考群友战绩，在升温早期买入，过热又遇到看空消息时卖出，分散在两个题材里。
 * - smart：对题材阶段做贝叶斯推断，结合群友的可信度做期望值决策。
 *   smart-focus（集中单题材）、smart-spread（每个题材最多一只）是它的两种仓位风格。
 * - oracle：知道真实阶段和当天的热度变化。
 * - qunzhu：无脑跟群主（买群主推荐的，群主说跌就卖）。
 * 除 oracle 外，机器人只看玩家能看到的信息（热度与走势、群聊、战绩、持仓、日历、自己的道具），
 * 不读题材真实阶段、今天预先掷好的行情等隐藏字段。
 *
 * 实现拆在 tools/bots/ 下，本文件只做对外入口（sim.ts、测试、截图工具都从这里引）：
 * common.ts 公共小件、simple.ts 简单机器人、normal.ts、smart-belief.ts + smart.ts（smart / oracle）、
 * variants.ts（extBot / trackBot / dual 三种外套）、run.ts（注册表、playRun、useMarket / useExt）。
 */
export { ARCHETYPES } from './bots/smart.ts';
export { setRealMsg } from './bots/smart-belief.ts';
export { BOTS, BOT_DESC, botByName, playRun, useExt, useMarket } from './bots/run.ts';
export { CUT, IPO_BOTS, SWAN_BOTS, type Bot, type BotFactory } from './bots/common.ts';
