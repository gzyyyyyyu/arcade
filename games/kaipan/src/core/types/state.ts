/** 局内状态的类型（题材、股票、持仓、打新、抵押、当日、月度事件）。 */
import type { ThemeId, Stage, Feel, Mood, Dir, TurnTalk, Rarity, RewardKind } from './base.ts';

// ================================================================ 状态

export interface ThemeState {
  id: ThemeId;
  /** 热度 0..100（公开） */
  heat: number;
  /** 最近几天的收盘热度，旧 → 新，最后一项等于 heat（公开） */
  history: number[];
  /** 隐藏：今天的真实阶段（盘前已推进到今天） */
  stage: Stage;
  /** 上一个交易日的真实阶段（情绪指标显示这个；没有情绪指标时隐藏） */
  lastStage: Stage;
  /** 隐藏：当前阶段还剩几天（含今天） */
  left: number;
  /** 隐藏：这一轮萌芽不会夭折（稀有股票奖励拉起的萌芽） */
  sure: boolean;
  /** 重做（真实行情）：当前阶段已经持续了几天（含今天）；合成行情不用 */
  age?: number;
  /** 隐藏：股灾里被打下来的题材：这一轮退潮之后冷门很短，接着的萌芽不会夭折（报复性反弹） */
  rebound?: boolean;
  /** 大V直播间跟单：接下来 days 天热度额外 +dH（玩家自己选的，公开） */
  boost: { dH: number; days: number } | null;
}

export interface StockState {
  id: string;
  /** 展示用价格（元） */
  price: number;
  /** 上一个交易日的涨跌（pp） */
  move: number;
  /** 连板数（公开） */
  boards: number;
  /** 最近 5 天的涨跌（pp），旧 → 新 */
  history: number[];
  /** ST：已收到的退市警告次数（公开） */
  warnings: number;
  /** ST：摘帽后还要连续涨停几天（公开） */
  uncap: number;
  /** 已退市：不再被推荐，也不能持有 */
  delisted: boolean;
}

export interface Holding {
  stockId: string;
  /** 买入的交易日；dayIndex > boughtDay 时才能卖（T+1） */
  boughtDay: number;
  /** 买入以来的净值倍数（1 = 不赚不亏） */
  value: number;
  /** 上一个交易日这一格的收益（pp，含道具修正）；刚买入还没开盘为 null */
  todayRet: number | null;
  /** 低吸：买入时题材体感是冷门或降温（低吸大师用） */
  lowBuy: boolean;
  /** 买入时的体感 */
  buyFeel: Feel;
  /** 隐藏：买入当天题材的真实阶段（复盘与模拟用） */
  buyStage: Stage;
  /** 从哪来：推荐、奖励、事件、开局设置 */
  source: 'rec' | 'reward' | 'event' | 'setup';
  /** 推荐人（群友 id；行情软件为空串）；不是买推荐来的为 null */
  recBy: string | null;
  /** 当天第一只买入的（游资席位用） */
  firstBuy: boolean;
  /** 买入当天群主在唱空这个题材（反向大师用，公开） */
  contra: boolean;
  /** 隐藏：持有期间题材进入过退潮（站岗专业户用，结束页才判定） */
  sawEbb: boolean;
  /**
   * 仓位：这一格占几份钱（1 份 = 账户的 1/4；缺省 1）。
   * 试一口 1 份、半仓 2 份、重仓 = 剩下的全部现金；加仓 +1 份，减一半砍掉一半。
   */
  units?: number;
  /** 押跌：它跌你赚、它涨你亏（缺省 false） */
  short?: boolean;
  /** 押跌期间它连续涨停了几天（嘴硬王用） */
  squeezed?: number;
  /**
   * 打新（docs/design-modes.md 第 18 节）：
   * frozen = 申购冻结中（stockId 是新股 id，但 s.stocks 里还没有它；收益 0，不能卖、减、加）；
   * listed = 中签后的新股持仓（units 固定 1，s.stocks[stockId] 存在）。
   */
  ipo?: { stage: 'frozen' | 'listed'; offer: IpoOffer; /** 申购时选的档位（抽签按它的中签率；冻结时才有） */ size?: BuySize };
}

/** 打新：这个月的一只新股和它的日程、中签率。日程全部是 dayIndex。 */
export interface IpoOffer {
  /** 新股 id（IPO_STOCKS 里的） */
  stockId: string;
  name: string;
  theme: ThemeId;
  month: number;
  /** 申购日：这天盘前能申购 */
  day: number;
  /** 这个交易日收盘后出签 */
  drawDay: number;
  /** 这个交易日收盘是上市首日 */
  listDay: number;
  /** 各档中签率（0..1） */
  odds: Record<BuySize, number>;
}

/** 买入时选的仓位：试一口、半仓、重仓。 */
export type BuySize = 'taste' | 'half' | 'heavy';
/** 抵押物。 */
export type CollateralId = 'bracelet' | 'car' | 'house' | 'pension';

/** 一笔抵押借款。 */
export interface Loan {
  id: CollateralId;
  /** 借了多少（元） */
  amount: number;
  /** 每月利息（比例，0.02 = 2%） */
  rate: number;
  /** 哪个月借的 */
  month: number;
}

/** 本局的仓位、押跌、抵押经历（结局故事、成就、图鉴用）。 */
export interface ExtLog {
  /** 重仓买入次数 */
  heavy: number;
  /** 最重的一次（份）和那只股票 */
  maxUnits: number;
  maxStock: string | null;
  adds: number;
  trims: number;
  /** 押跌开仓次数 */
  shorts: number;
  /** 押跌累计赚亏（元） */
  shortPnl: number;
  /** 押跌最赚的一只（元） */
  shortBest: { stockId: string; amount: number } | null;
  /** 被轧（押跌的股票涨停）次数 */
  squeezes: number;
  /** 押跌时同一只连续涨停最多几天还没认输 */
  stubborn: number;
  /** 借过的抵押物（按顺序，不重复） */
  borrowed: CollateralId[];
  /** 银行打过几次电话 */
  calls: number;
  /** 被收走的抵押物 */
  seized: CollateralId[];
  /** 自己赎回来的抵押物 */
  redeemed: CollateralId[];
  /** 付过的利息（元） */
  interest: number;
}

/** 新机制的状态；缺省（老存档、合成行情回放基准）时新机制全部不出现。 */
export interface ExtState {
  loans: Loan[];
  /** 银行正在打电话（账户跌破警戒线） */
  called: boolean;
  /** 本局第一次触发的小知识（按顺序） */
  learned: string[];
  log: ExtLog;
}

export interface Message {
  friendId: string;
  theme: ThemeId;
  /** 说的是今天该题材热度的变化方向 */
  claim: Dir;
  text: string;
  /** 用了拐点说法时给出（可选，画面可以据此换气泡样式） */
  turn?: TurnTalk;
  /** 反着信群主（道具）：这条是群主说的，对你来说按反方向读（公开） */
  reverse?: boolean;
  /**
   * 真实行情：说的是接下来几个交易日（含今天，1–3）这个风口的累计涨跌方向；缺省 1。
   * days > 1 的消息不在当天揭晓，到第 days 天收盘时在 report.intel 里揭晓。
   */
  days?: number;
  /** 重磅情报（月度主题制造的高光、"提前看一天"），画面可以加大气泡 */
  big?: boolean;
  /** 本周市场「反向群聊」：这条是反话（说涨多半跌）。claim 照他说的写，不替玩家翻 */
  liar?: boolean;
}

export interface Rec {
  stockId: string;
  /** 推荐人；关闭群聊（模拟用）时为空串，表示行情软件推荐 */
  friendId: string;
  text: string;
  /** 今天已经买过这条推荐 */
  taken: boolean;
  /** 唱空的群友建议押它跌 */
  short?: boolean;
  /** 真实行情：推荐人说的是接下来几个交易日（含今天）会涨（押跌推荐是会跌）；缺省 1 */
  days?: number;
  /** 重磅推荐（月度主题制造的高光） */
  big?: boolean;
  /** 本周市场「反向群聊」：这条推荐是反话（推的票多半要跌，唱空的反而是好票） */
  liar?: boolean;
}

/** 隐藏：今天开盘前就掷好的行情（开盘时按它结算，群聊消息按它的方向生成）。 */
export interface DayPlan {
  mood: Mood;
  /** 大盘当日涨幅（pp） */
  marketRet: number;
  /** 各题材今天的热度变化（未截断到 0..100） */
  dH: Partial<Record<ThemeId, number>>;
}

export interface TodayState {
  /** 全局交易日编号（0 起） */
  day: number;
  messages: Message[];
  recs: Rec[];
  /** 今天还能买几只 */
  buysLeft: number;
  /** 今天已经买卖了几次 */
  ops: number;
  /** 今天已经买了几只 */
  buys: number;
  /** 隐藏 */
  plan: DayPlan;
  /**
   * 盘前是不是"平淡日"（没有重磅情报、没有新群友的消息要看、不是月初、没有传闻）——画面可以自动快进。
   * 收盘后另看 report.tempo.quiet。
   */
  quiet?: boolean;
}

export interface FriendState {
  id: string;
  /** 本局说中次数 */
  hits: number;
  /** 本局发过的（已揭晓的）题材消息数 */
  total: number;
  /** 实际擅长的题材（内幕哥入群时随机两个；大V为空，表示当前最热） */
  topics: ThemeId[];
}

/** 突发账单：某个月月初和月供一起公布。 */
export interface BillExtra {
  /** 内容 id（美术按 id 出图） */
  id: string;
  name: string;
  amount: number;
}

export interface BillState {
  month: number;
  name: string;
  /** 本月要还的总额（含突发账单） */
  amount: number;
  /** 本月的突发账单明细（没有时缺省或为空）；常规月供 = amount − Σ extras.amount */
  extras?: BillExtra[];
}

export interface RewardCard {
  kind: RewardKind;
  /** 道具 id、群友 id 或股票 id */
  id: string;
  rarity: Rarity;
}

export interface RewardState {
  month: number;
  cards: RewardCard[];
}

export interface EventState {
  id: string;
  /** 刚还完月供的月份 */
  month: number;
  /** 表哥荐股：那只妖股 */
  stockId?: string;
  /** 表哥荐股：买入会放进的格子（空格优先，否则换掉持有收益最低的一只） */
  slot?: number;
  /** 大V直播间：推荐的题材 */
  theme?: ThemeId;
  /** 年会抽奖、年终奖：金额（元）；群主卖课、买彩票、盲盒、借钱、摆摊、理财：花费或本金（元） */
  amount?: number;
  /** 银行经理、丈母娘：说的是哪件抵押物 */
  collateral?: CollateralId;
  /** 楼下老股民：教你的那一招（战法道具 id） */
  itemId?: string;
}

/** 事件留下的延后结算：某个月月初到账或扣款。玩家自己选的，公开；结果在到账时才掷。 */
export interface PendingEffect {
  /** 来源事件 id */
  id: string;
  /** 哪个月月初结算 */
  month: number;
  /** 本金或费用（元） */
  amount: number;
}

/** 熬夜复盘（道具）：上一个交易日收盘后揭示的一个题材的真实阶段（公开，只在第二天盘前有效）。 */
export interface ThemeReview {
  theme: ThemeId;
  stage: Stage;
  /** 揭示的是哪个交易日（收盘时的阶段） */
  day: number;
}

/** 市场传闻（第 6 级"股灾"）：月初公布，本月某个交易日起所有题材提前退潮。 */
export interface MarketNotice {
  id: 'crash';
  month: number;
  name: string;
  text: string;
}
