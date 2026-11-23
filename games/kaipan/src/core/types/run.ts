/** 统计、开局设置、整局状态与节奏的类型。 */
import type { LiveTier } from '../liveTiers.ts';
import type { RealMarket } from '../segment.ts';
import type { ThemeId, Stage, Feel, Mood, Dir, Phase, EndReason, PersonaId, AutoSellReason } from './base.ts';
import type { ThemeState, StockState, Holding, ExtState, TodayState, FriendState, BillState, RewardState, EventState, PendingEffect, ThemeReview, MarketNotice } from './state.ts';
import type { DayReport } from './report.ts';
import type { Action } from './action.ts';

// ================================================================ 统计

/** 一笔已了结的交易（结束页复盘与模拟用；stage 是隐藏信息）。 */
export interface TradeLog {
  stockId: string;
  buyDay: number;
  sellDay: number;
  /** 隐藏：买入当天题材的真实阶段 */
  stage: Stage;
  /** 买入时的体感 */
  feel: Feel;
  /** 持有收益（pp） */
  ret: number;
  reason: 'sell' | 'replace' | AutoSellReason | 'end';
  /** 推荐人（不是买推荐来的为 null） */
  recBy: string | null;
  /** 买入当天群主在唱空这个题材 */
  contra: boolean;
  /** 隐藏：高潮期买入，并一直拿到了退潮 */
  guard: boolean;
  /** 押跌的一笔（ret 已经按押跌算：它跌你赚） */
  short?: boolean;
  /** 了结时占几份 */
  units?: number;
}

export interface RunStats {
  /** 已结算的交易日 */
  days: number;
  buys: number;
  sells: number;
  /** 有买或卖的交易日数 */
  activeDays: number;
  /** 持仓里有涨停的交易日数 */
  limitUpDays: number;
  /** 持仓股票达到过的最高连板 */
  maxBoards: number;
  /** 持仓触发龙头带动的次数 */
  chains: number;
  peakAccount: number;
  billsPaid: number;
  /** 账户实际付掉的账单合计（信用卡垫的不算） */
  billMoney: number;
  /** 炒股本身累计赚亏（每天收盘结算的账户变化之和，不含账单、利息、奖励、银行） */
  tradeMoney: number;
  trades: TradeLog[];
  /** 选过的奖励 id */
  picked: string[];
  events: string[];
  /** 事件里选了哪个选项，每项 `事件id:选项序号`（成就用；只记录、不影响规则） */
  eventPicks: string[];
  /** 持仓里有跌停的交易日数 */
  limitDownDays: number;
  /** 单日账户最大涨幅（pp） */
  maxDayRet: number;
  /** 还过（或信用卡代还过）的突发账单 id */
  surprisesPaid: string[];
  /** 信用卡代还的次数 */
  creditUsed: number;
  /** 结算时持仓同时覆盖的最多题材数 */
  maxThemes: number;
  /** 结算时同一题材的最多持仓只数 */
  maxSameTheme: number;
  /** 每个月交易日的账户涨跌（pp，月初效果之后、还月供之前） */
  monthRets: number[];
  /** 本月月初（月初效果之后）的账户，用来算 monthRets */
  monthOpen: number;
  /** 股灾那个月的账户涨跌（pp）；没有股灾为 null */
  crashRet: number | null;
  /** 进过持仓的股票（任何来源，按顺序，不重复） */
  acquired: string[];
  /** 开局之后拿到的道具（奖励、事件；人设自带的不算） */
  itemsTaken: string[];
  /** 见过的道具（持有过或出现在奖励卡上，图鉴用） */
  seenItems: string[];
  /** 见过的群友（入群或出现在奖励卡上，图鉴用） */
  seenFriends: string[];
  /** 打新：申购次数、中签次数、打新累计盈亏（元）；一次都没申购过的局缺省 */
  ipo?: { subs: number; wins: number; money: number };
}

// ================================================================ 局面

/**
 * 开局设置。正常开局只用 persona / difficulty / daily（缺省为 newbie、第 1 级）；
 * 其余字段只给调试、测试、模拟用，带了这些字段的局不计入档案（见 isRankedSetup）。
 */
export interface RunSetup {
  /** 人设（缺省 newbie） */
  persona?: PersonaId;
  /** 每日挑战的日期 YYYY-MM-DD（由 dailySetup 给出） */
  daily?: string;
  /** 开局账户（元） */
  account?: number;
  /** 开局道具 */
  items?: string[];
  /** 开局额外群友 */
  friends?: string[];
  /** 指定登场题材（6 个） */
  themes?: ThemeId[];
  /** 开局持仓（股票 id） */
  holdings?: string[];
  /** 难度等级 1..8（缺省 1；0.3.0-alpha.1 的 0 按 1 处理） */
  difficulty?: number;
  /** 关闭群聊消息（模拟"消息有用"用；推荐照常） */
  noChat?: boolean;
  /** 实盘模式：打几个月、账单倍数（开局时从 BALANCE.live 抄进来，存档自带）；娱乐局没有 */
  live?: LiveRules;
  /** 娱乐短局：打几个月、账单倍数（开局时从 BALANCE.short 抄进来，存档自带）；完整一年的局、实盘、每日挑战没有 */
  short?: ShortRules;
  /**
   * 闪电盘的日期 YYYY-MM-DD（由 flashSetup 给出）：固定 10 个交易日、没有月供、开局三选一道具、第 4 / 8 天收盘后各一个事件，
   * 比谁最后的资产多；每个人拿到同一局。和每日挑战、实盘、短局互斥。
   */
  flash?: string;
  /**
   * 本周市场的周号 YYYY-Www（北京时间 ISO 周，由 weeklySetup 给出）：玩法同闪电盘（10 个交易日、开局三选一、没有月供），
   * 另带这一周的一条限定规则（weeklyRule），榜是 week-YYYY-Www-rules。和每日挑战、实盘、短局、闪电盘互斥。
   */
  weekly?: string;
  /** 新手课（core/lesson.ts）：固定种子和行情段的两个月短局，不进档案、排行和新号局数；一定带 short，和其余模式互斥 */
  lesson?: true;
}

/** 娱乐短局这一局的规则。 */
export interface ShortRules {
  months: number;
  billMult: number;
  /** 最后一个月月底多交一笔"首付"：开局资产的几成（短局的最终目标，按难度定） */
  goal: number;
}

/** 实盘这一局的规则。 */
export interface LiveRules {
  months: number;
  billMult: number;
  /** 资产涨跌算进筹码的倍数；更早开的局没有，按 1 算 */
  lev?: number;
  /** 档位；更早开的局没有，按难度认（那时一档一个难度） */
  tier?: LiveTier;
  /** 玩家选的杠杆（开局时从 BALANCE.live.gears 抄进来）；稳健 1× 和更早开的局没有 */
  gear?: LiveGear;
}

/** 实盘杠杆：结回再按 x 放大、封顶 cap 份，每月扣利息（让结回少 interest），放大后的结回倍数跌到清零线 call 就按 0 结。 */
export interface LiveGear {
  x: number;
  cap: number;
  interest: number;
  call: number;
}

export interface GameState {
  version: 4;
  seed: string;
  setup: RunSetup | null;
  /** 人设 */
  persona: PersonaId;
  /** 难度等级 1..8 */
  difficulty: number;
  phase: Phase;
  /** 账户余额（元）：唯一的分数和货币 */
  account: number;
  /** 当前月份 1..12 */
  month: number;
  /** 本月第几个交易日（0 起） */
  dayInMonth: number;
  /** 全局交易日编号（0 起）；也是已结算的交易日数 */
  dayIndex: number;
  /** 本局登场的题材（6 个，看板按这个顺序） */
  themeIds: ThemeId[];
  themes: Partial<Record<ThemeId, ThemeState>>;
  /** 在场股票的行情，键为股票 id */
  stocks: Record<string, StockState>;
  /** 大盘：上一个交易日的状态（公开，窗外天气） */
  mood: Mood;
  /** 持仓格；null 为空格（现金） */
  slots: (Holding | null)[];
  friends: FriendState[];
  /** 持有的道具 id（按获得顺序） */
  items: string[];
  bill: BillState;
  /** 下个月月供的倍数（信用卡代还后 1.2） */
  nextBillMult: number;
  today: TodayState;
  reward: RewardState | null;
  event: EventState | null;
  lastDay: DayReport | null;
  endReason: EndReason | null;
  /**
   * 盘中减仓（docs/design-live.md 2.6）：最近一次减仓那一刻的资产比 r0、放大后的结回倍数 v0 和减完的杠杆 x；
   * 之后结回 = v0 + x × 涨跌倍数 ×（资产比 − r0），利息按 x 那一档算（1× 没有），不再有清零线。没减过仓（或老存档）为 undefined。
   */
  gearCut?: { r0: number; v0: number; x: number };
  /** 熬夜复盘：上一个交易日收盘后揭示的题材阶段（公开；review.day === dayIndex − 1 时有效） */
  review: ThemeReview | null;
  /** 本月的市场传闻（第 6 级股灾，月初公布，公开） */
  notice: MarketNotice | null;
  /** 事件留下的延后结算（公开） */
  pending: PendingEffect[];
  /** 临时道具：到 month 月底失效（量化软件试用） */
  expiring: { id: string; month: number }[];
  /** 这一个交易日（dayIndex）没空看盘，不能买卖（加班事件） */
  busyDay: number | null;
  stats: RunStats;
  /** 本局全部操作，配合 seed 与 setup 可完整回放 */
  actions: Action[];
  /** 自选：加了星的股票 id（加星的先后顺序；没加过为缺省） */
  stars?: string[];
  /**
   * 重做：这一局用的真实行情段（只含登场风口用到的部分，读档、回放不用再下载）。
   * null 或缺省 = 0.3 的合成行情（离线、数据加载失败时的兜底，也是 0.3 存档的样子）。
   */
  real?: RealMarket | null;
  /** 仓位、押跌、抵押（缺省 = 0.3 的玩法） */
  ext?: ExtState | null;
  /** 月度主题、中场、高光、连击（缺省 = 没有；真实行情开局默认打开） */
  tempo?: TempoState | null;
  /** 还没揭晓的多日消息（隐藏真相，只存说法） */
  watch?: WatchedIntel[];
}

/** 还没揭晓的多日消息。 */
export interface WatchedIntel {
  day: number;
  index: number;
  friendId: string;
  theme: ThemeId;
  claim: Dir;
  days: number;
}

/** 月度目标的种类（都能按局面判定）。 */
export type GoalKind =
  /** 本月账户涨 ≥ target%（月底还钱之前算） */
  | 'gain'
  /** 本月任何一天收盘账户都不低于月初的 (100 − target)% */
  | 'keep'
  /** 持仓涨停 target 次 */
  | 'limitUp'
  /** 押跌那格当天赚钱 target 次 */
  | 'shortWin'
  /** 连续 target 天收盘赚钱 */
  | 'streak'
  /** 某天收盘同时拿着 target 个不同风口的股票 */
  | 'themes'
  /** 本月收益比大盘本月涨跌多 ≥ target 个百分点 */
  | 'beat'
  /** 当天买、当天收盘就赚的次数 ≥ target */
  | 'quickWin'
  /** 持仓单日涨 ≥ target% 一次 */
  | 'bigDay';

export interface MonthReward {
  /** 现金（元） */
  cash: number;
  /** 道具碎片 */
  shards: number;
  /** boss 月：另给一个道具（月底领取时按种子挑，null = 没有） */
  item: boolean;
}

/** 本月主题和目标（公开）。 */
export interface MonthGoalState {
  month: number;
  /** 主题 id（src/core/content/monthThemes.ts） */
  id: string;
  boss: boolean;
  kind: GoalKind;
  target: number;
  /** 当前进度（gain / beat 为 pp，keep 为本月最大回撤 pp，其余为次数或天数） */
  progress: number;
  done: boolean;
  /** 保底类目标（keep）中途破线；或月底没达成 */
  failed: boolean;
  reward: MonthReward;
  /** 月初账户、本月大盘累计（pp） */
  open: number;
  market: number;
  /** 本月的高光次数（主题会在月末前一天补一个） */
  highlights: number;
}

export interface TempoState {
  /** 12 个月的主题 id（开局按种子、行情、难度抽好；画面只该显示已经到了的月份） */
  plan: string[];
  cur: MonthGoalState | null;
  /** 连续收盘赚钱的天数（有持仓才算） */
  streak: number;
  bestStreak: number;
  /** 道具碎片（集满 BALANCE.tempo.shards 换一个道具） */
  shards: number;
  /** 各月结果 */
  results: { month: number; id: string; done: boolean }[];
  /** 小奖励、月度奖励累计发的钱（元） */
  bonus: number;
}

/** 一次高光。 */
export interface Highlight {
  kind: 'limitUp' | 'limitDown' | 'bigWin' | 'bigLoss' | 'boards' | 'blown' | 'wild' | 'combo' | 'goal' | 'crash' | 'shortWin' | 'headline';
  text: string;
  stockId?: string;
}

/** 小奖励（连击、押对跌、抓到涨停）。 */
export interface ComboReward {
  kind: 'streak' | 'shortWin' | 'limitUp' | 'shards';
  /** 连续天数、次数 */
  count: number;
  cash: number;
  shards: number;
  /** 碎片集满换到的道具 */
  itemId?: string;
  text: string;
}

/** 收盘时的节奏信息。 */
export interface DayTempo {
  /** 平淡日：持仓波动小、账户几乎没动、没有事件、没有高光——画面可以快速翻过 */
  quiet: boolean;
  highlights: Highlight[];
  combos: ComboReward[];
  /** 本月目标（收盘后的进度） */
  goal: MonthGoalState | null;
  streak: number;
}
