/** 每日结算明细的类型。 */
import type { ThemeId, Stage, Feel, Mood, Dir, AutoSellReason } from './base.ts';
import type { CollateralId } from './state.ts';
import type { DayTempo } from './run.ts';

// ================================================================ 结算明细

export interface ThemeMove {
  id: ThemeId;
  heatBefore: number;
  heat: number;
  /** 实际热度变化（截断到 0..100 之后） */
  dH: number;
  /** 题材当日涨幅（pp） */
  ret: number;
  feelBefore: Feel;
  feel: Feel;
  /** 隐藏：当天的真实阶段 */
  stage: Stage;
}

export interface StockMove {
  id: string;
  /** 当日涨跌（pp，含龙头带动，已按涨跌停截断） */
  move: number;
  limitUp: boolean;
  limitDown: boolean;
  /** 收盘后的连板数 */
  boards: number;
  /** 炸板 */
  blown: boolean;
  /** 妖股跳空（pp），没有为 0 */
  jump: number;
  /** 龙头涨停带来的跟涨（pp），没有为 0 */
  chain: number;
  /** ST：今天摘帽 / 收到退市警告 / 退市 */
  st: 'uncap' | 'warning' | 'delisted' | null;
  /** 真实行情：识别出的妖股异动（过山车股单日暴涨暴跌）；真实行情下 jump 恒为 0 */
  wild?: boolean;
  /** 真实行情：大哥涨停、这只小弟也跟着大涨（识别出来的，不额外加涨幅；chain 恒为 0） */
  follow?: boolean;
}

/** 结算明细里一格持仓的收益拆解。 */
export interface HoldingStep {
  /** 'move' 个股涨跌，或道具 id */
  source: string;
  label: string;
  /** 这一步之后这格的收益（pp） */
  value: number;
}

/**
 * 归因：一只持仓当天涨跌的一项来源（pp）。各项之和等于 HoldingMove.ret（误差 ≤ 0.01）。
 * 只用当天已经揭晓的数（风口热度变化、大环境、个股消息等），不含真实阶段。
 * - theme：风口热度变化带来的涨跌（风口本身的涨跌，附 theme、dH）
 * - role：角色放大（带头大哥、过山车更猛，老实股、危险股更钝；可正可负）
 * - market：今天大环境
 * - momentum：连续涨停的惯性
 * - chain：大哥涨停带小弟
 * - jump：过山车突然跳空
 * - news：个股消息（危险股摘帽、退市）
 * - blown：涨停没封住，被砸下来
 * - limit：涨跌停截断（一天最多涨 / 跌 10%，危险股 5%）
 * - item：道具（附 itemId）
 * - noise：随机波动（余项，含四舍五入）
 */
export type RetPartKind = 'theme' | 'role' | 'market' | 'momentum' | 'chain' | 'jump' | 'news' | 'blown' | 'limit' | 'item' | 'noise' | 'short' | 'squeeze' | 'swan' | 'ipo';

/** 黑天鹅 Boss 日的种类（src/core/swan.ts）。 */
export type SwanKind = 'blackout' | 'themeBust' | 'windfall' | 'flashCrash';

/** 黑天鹅这一天的结果（收盘后写进 DayReport.swan；结束页读最后一天的这一项）。 */
export interface SwanReport {
  kind: SwanKind;
  name: string;
  /** 受影响的题材（没有题材的种类为 null） */
  theme: ThemeId | null;
  /** 黑天鹅给持仓带来的盈亏（元，好坏相抵；没有持仓为 0） */
  money: number;
  /** 持仓里有被它改了涨跌的格子 */
  touched: boolean;
}

/** 黑天鹅预告（最后 N 个交易日盘前公开）：只有种类和避险办法，没有幅度。 */
export interface SwanNotice {
  kind: SwanKind;
  name: string;
  theme: ThemeId | null;
  /** 离黑天鹅还有几个交易日：0 = 就是今天 */
  daysLeft: number;
  line: string;
  hedge: string;
}

export interface RetPart {
  kind: RetPartKind;
  /** 这一项的涨跌（pp，两位小数） */
  value: number;
  /** 大白话说明，如"AI 风口热度 +15" */
  label: string;
  theme?: ThemeId;
  /** theme：这个风口当天的热度变化 */
  dH?: number;
  /** item：道具 id */
  itemId?: string;
}

/** 账户层的效果（不属于某一格持仓），金额为元。 */
export interface AccountEffect {
  /** 'leverage'（借钱炒股的放大）或道具 id（如分散投资） */
  source: string;
  label: string;
  /** 元，两位小数 */
  amount: number;
}

/** 收盘新闻：只解释已经发生的热度变化。theme 为 null 是全场性的新闻。 */
export interface NewsItem {
  theme: ThemeId | null;
  dir: 'up' | 'down';
  /** 风口新闻为当天热度变化；全场新闻为今天大环境的涨跌（pp） */
  value: number;
  text: string;
  /**
   * 真实行情：预告类新闻——说的是这个风口接下来 ahead 个交易日（从明天起）的方向，dir 是新闻的说法，
   * 按 BALANCE.intel.news 的概率说中（说错时反着说）。value 为 0。
   */
  ahead?: number;
}

/** 股票小人台词的时机。 */
export type QuipMoment = 'limitUp' | 'limitDown' | 'streak' | 'delisted' | 'bought' | 'sold';

export interface StockQuip {
  stockId: string;
  /** 持仓格；收盘时被自动卖出的、已经不在持仓里的也给原来的格 */
  slot: number | null;
  moment: QuipMoment;
  text: string;
}

export interface HoldingMove {
  slot: number;
  stockId: string;
  /** 个股当日涨跌（pp） */
  move: number;
  /** 这一格最终收益（pp，含道具修正） */
  ret: number;
  /** ret 的归因，各项之和等于 ret（顺序固定，见 RetPartKind） */
  parts: RetPart[];
  /** 影响最大的一项（|value| 最大），画面挑"主要原因"用；0.3.0 的旧存档里为 null */
  lead: RetPart | null;
  /** 这一格今天给账户带来的盈亏（元，不含账户层效果）；所有格加上 account.effects 等于账户当天的变化 */
  amount: number;
  steps: HoldingStep[];
  /** 结算后的持有收益（pp） */
  holdRet: number;
  /** 收盘后被自动卖出 */
  sold: AutoSellReason | null;
  /** 这一格占几份（缺省 1） */
  units?: number;
  /** 押跌 */
  short?: boolean;
  /** 押跌的股票涨停了（被轧） */
  squeeze?: boolean;
  /** 黑天鹅那天：这一格被黑天鹅额外改了多少（pp；> 0 赚、< 0 亏）；没被改到为缺省 */
  swan?: number;
  /** 打新：新股上市头两天叠的溢价 / 折价（pp；< 0 = 破发）；只在上市头两天有 */
  ipo?: number;
}

export interface ChainLink {
  /** 涨停的龙头 */
  leader: string;
  /** 被带动的同题材跟风股 */
  followers: string[];
  /** 其中在持仓里的 */
  held: string[];
  /** 龙头本身在持仓里 */
  leaderHeld: boolean;
}

export interface ItemTrigger {
  itemId: string;
  slot: number | null;
  stockId: string | null;
  text: string;
  /** 这一下改动的数值（pp；账户类为元） */
  delta: number;
}

export interface MessageJudge {
  /** 当天消息的下标；隔天揭晓的（report.intel）是发出那天的下标 */
  index: number;
  /** 发出那天（隔天揭晓的才有） */
  day?: number;
  /** 说的天数（缺省 1） */
  days?: number;
  friendId: string;
  theme: ThemeId;
  claim: Dir;
  truth: Dir;
  hit: boolean;
}

export interface Comment {
  friendId: string;
  text: string;
  /** 得意 / 尴尬 / 普通（对应头像表情） */
  mood: 'smug' | 'awkward' | 'normal';
}

/** 一天的结算明细，按设计稿第 5 节的播放顺序组织。 */
export interface DayReport {
  day: number;
  month: number;
  /** 本月第几天（0 起） */
  dayInMonth: number;
  market: { moodBefore: Mood; mood: Mood; ret: number };
  themes: ThemeMove[];
  /** 当天所有在场股票的涨跌 */
  stocks: StockMove[];
  holdings: HoldingMove[];
  chains: ChainLink[];
  triggers: ItemTrigger[];
  account: {
    before: number;
    /** 各格加权收益之和（pp，两融之前） */
    gross: number;
    /** 最终账户收益（pp） */
    ret: number;
    after: number;
    /** 账户层效果（借钱炒股、分散投资等），金额为元 */
    effects: AccountEffect[];
  };
  autoSold: { slot: number; stockId: string; reason: AutoSellReason }[];
  messages: MessageJudge[];
  comments: Comment[];
  /** 持仓里有涨停（放烟花） */
  fireworks: boolean;
  /** 持仓里有跌停（下雨云） */
  rain: boolean;
  /** 今天股灾来了（第 6 级：所有题材提前退潮的那天，收盘后才揭晓） */
  crash: boolean;
  /** 收盘新闻（热度变化最大的 1–2 个风口，以及全场大涨 / 大跌） */
  news: NewsItem[];
  /** 今天揭晓的、前几天发的多日消息（说的是 2–3 天的累计方向） */
  intel?: MessageJudge[];
  /** 节奏与反馈（月度目标进度、高光、连击、平淡日）；没有月度主题的局没有这一项 */
  tempo?: DayTempo;
  /** 持仓股票小人的台词（涨停、连续涨停、跌停、退市、被自动卖出） */
  quips: StockQuip[];
  /** 银行这一天的动作（打电话、收走抵押物）；没有为缺省 */
  bank?: { called: boolean; seized: CollateralId[] };
  /** 黑天鹅 Boss 日（每局最后一天）：这一天的黑天鹅和它对持仓的影响；别的日子缺省 */
  swan?: SwanReport;
}
