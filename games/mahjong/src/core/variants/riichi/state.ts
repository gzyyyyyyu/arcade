/**
 * 牌局的状态与常量：玩法常量（起始点数、返点、顺位马、王牌区）、选项、一局和一场的状态类型、动作类型。
 * 只放类型和常量，不放逻辑；rules.ts 的其他文件都从这里取类型。
 */
import type { Entropy } from 'arcade-kit/rng';
import type { Payment } from '../../match/index.ts';
import type { Answer, ClaimKind, KanType, Meld, RiverTile, Wall } from '../../table/index.ts';
import type { Tile, TileSet } from '../../tiles/index.ts';
import type { SeatKind, Tune } from '../types.ts';
import { RED, type HandScore } from './score.ts';

export const VARIANT = 'riichi' as const;
export const RULES_VERSION = 1;
export const SEATS = 4;
export const TILESET: TileSet = { suits: [0, 1, 2], honors: true, flowers: false, red: RED };

export const START_POINTS = 25_000;
/** 返点：得分按它算，第一名多拿 (返点 − 起始) × 4（头名奖） */
export const RETURN_POINTS = 30_000;
/** 顺位马（千点） */
export const UMA: readonly number[] = [20, 10, -10, -20];
/** 王牌区：宝牌指示 [0, 5)、里宝牌指示 [5, 10)、岭上牌 [10, 14) */
export const DEAD_WALL = 14;
export const URA0 = 5;
export const RINSHAN0 = 10;
/**
 * 一场的得分（按点数记：+52.3 记 52,300）换筹码：多少分值一份（docs/riichi.md 第 2、7 节，按模拟定）。
 * 半庄 50,000（K = 50，小档一份 2,000 → 每 1,000 分 40 筹码）；东风战打得短、得分摆动小，40,000，两种打法输掉整份的机会差不多（约 5%）；
 * 一局一结（实盘用）只打一局、只按点数差记，摆动更小，数值见 docs/riichi.md 第 7 节
 */
export const SHARE_POINTS: Readonly<Record<RcOpts['length'], number>> = { hanchan: 50_000, tonpuu: 40_000, ikkyoku: 22_000 };

export interface RcOpts {
  /** 东南半庄、东风战，还是一局一结（只打一局，不算马和头名奖；实盘用，一个带入打完就结） */
  length: 'hanchan' | 'tonpuu' | 'ikkyoku';
}

export const DEFAULT_OPTS: RcOpts = { length: 'hanchan' };

export type Phase = 'turn' | 'claim' | 'end' | 'over';

/** 一局怎么结束的：和了、荒牌流局、流局满贯，或者中途流局的五种 */
export type RcEnd = 'ron' | 'tsumo' | 'draw' | 'nagashi' | 'nine_terminals' | 'four_winds' | 'four_kans' | 'four_riichi' | 'three_ron';

/** 河里的一张：n 是这一局全桌第几张打出的（从 1 起）。现物要看"立直以后别家打的"，鸣牌会打乱轮次，只看各家河里第几张推不准 */
export interface RcRiverTile extends RiverTile {
  n: number;
}

export interface RcPlayer {
  hand: Tile[];
  melds: Meld[];
  river: RcRiverTile[];
  /** 0 没立直，1 立直，2 双立直 */
  riichi: 0 | 1 | 2;
  /** 立直宣告的那张在河里的位置（画面横放）；没立直是 -1 */
  riichiAt: number;
  ippatsu: boolean;
  /** 同巡振听：放过和牌张，到自己下次摸牌（或鸣牌）前不能荣和 */
  passed: boolean;
  /** 立直后放过和牌张：这一局一直振听 */
  locked: boolean;
  /** 刚吃、碰过：这一手不能打的牌种（不许食替） */
  banned: number[];
  /** 这一局摸了几次牌（天和、地和、九种九牌） */
  draws: number;
}

/** 一次和牌（公开） */
export interface RcWin {
  seat: number;
  /** 放铳的人；自摸是 null */
  from: number | null;
  tile: Tile;
  score: HandScore;
  hand: Tile[];
  melds: Meld[];
  /** 这一家拿到的点数（含本场、供托），给结算表 */
  gain: number;
  /** 包牌的责任者 */
  pao: number | null;
}

/** 一局的小结（结算页和一场的历史） */
export interface RoundSummary {
  wind: number;
  hand: number;
  honba: number;
  dealer: number;
  end: RcEnd;
  delta: number[];
  wins: RcWin[];
  /** 荒牌流局时谁听牌 */
  tenpai: boolean[] | null;
  dora: Tile[];
  /** 有立直的人和了才亮里宝指示牌 */
  ura: Tile[];
}

/** 一个座位这一场的统计（都是公开的事，结算页、称号、给钱包的小结用） */
export interface SeatStats {
  rounds: number;
  wins: number;
  tsumo: number;
  /** 放铳 */
  dealIn: number;
  riichi: number;
  maxHan: number;
  yakuman: number;
  /** 最大一局净得点 */
  best: number;
}

/** 声明窗口：opts 是每个座位能做的（隐藏），chi 是能吃的几种吃法（顺子最小那张的牌种），ans、low 是回答 */
export interface Claim {
  id: number;
  tile: Tile;
  from: number;
  /** 抢杠：加杠能被任何和牌抢，暗杠只有国士能抢 */
  rob: 'added' | 'concealed' | null;
  opts: ClaimKind[][];
  chi: number[][];
  /** 这张能凑成和牌形（不管有没有役、振不振听）：没和的人进同巡振听 */
  could: boolean[];
  ans: (Answer | null)[];
  low: (number | null)[];
  bot: boolean[];
}

/** 这一步发生了什么；摸到的牌、暗杠的牌只有本人看得到（view 里过滤） */
export type RcEvent =
  | { e: 'deal'; wind: number; hand: number; honba: number; dealer: number }
  | { e: 'draw'; seat: number; tile: Tile; rinshan: boolean }
  | { e: 'discard'; seat: number; tile: Tile; riichi: boolean }
  | { e: 'riichi'; seat: number; double: boolean }
  | { e: 'chi' | 'pon'; seat: number; from: number; tile: Tile }
  | { e: 'kan'; seat: number; from: number | null; tile: Tile; kan: KanType }
  | { e: 'dora'; indicator: Tile }
  | { e: 'win'; seat: number; from: number | null; tile: Tile; score: HandScore; rob: boolean }
  | { e: 'pay'; pays: Payment[] }
  | { e: 'end'; end: RcEnd }
  | { e: 'over' };

/** 一场打完的名次和得分（按点数记，+52.3 记 52,300；不听罚符有 750 这样的零头，所以不按 100 记） */
export interface Final {
  rank: number[];
  score: number[];
}

export interface RcState {
  variant: typeof VARIANT;
  v: number;
  /** 随机数密钥：只在状态里，view 绝不带 */
  key: Entropy;
  opts: RcOpts;
  share: number;
  base: number;
  kinds: SeatKind[];
  personas: number[];
  tunes?: Tune[];
  /** 筹码只在一场结束时动：chips 是带进来的，结束时换成结回去的 */
  chips: number[];
  stake: number[];
  points: number[];
  /** 这一局开始时的点数（算一局的得失；没打完就收场时这一局不算，回到它） */
  start: number[];
  /** 这一局开始时桌上的供托（同上；部署前的存档没有，按 0） */
  sticks0?: number;
  /** 起家 */
  first: number;
  /** 场风 0 东 1 南 2 西 */
  wind: number;
  /** 第几局（0–3） */
  hand: number;
  honba: number;
  /** 桌上的立直棒（供托）根数 */
  sticks: number;
  /** 这一场的第几局（洗牌的序号，连庄也加一） */
  kyoku: number;
  dealer: number;
  phase: Phase;
  wall: Wall;
  dead: Tile[];
  /** 翻开了几张宝牌指示牌 */
  doraOpen: number;
  /** 明杠、加杠的杠宝：打出下一张（或再开杠）时才翻 */
  pendingDora: number;
  kans: number;
  /** 每一杠是谁开的（四杠散了看是不是同一个人） */
  kanBy: number[];
  players: RcPlayer[];
  turn: number;
  drawn: Tile | null;
  /** 这一手是摸牌开始的（能自摸、能杠）；吃碰以后只能打 */
  canTsumo: boolean;
  /** 这一手是岭上牌 */
  rinshan: boolean;
  claim: Claim | null;
  claimSeq: number;
  /** 这一局还没人吃碰杠（含暗杠）：双立直、天和地和、九种九牌、四风连打 */
  noCalls: boolean;
  discards: number;
  /** 刚宣告立直、还没过窗口的座位（被荣和了立直不成立，不放棒） */
  pendingRiichi: number | null;
  ledger: Payment[];
  events: RcEvent[];
  history: RoundSummary[];
  stats: SeatStats[];
  final: Final | null;
  /**
   * 好友房中途接管座位时，这个座位那一刻的得分（standings）：新来的人只为接手以后的输赢负责。
   * 没人接管过就没有这个字段（按 0）
   */
  entry?: number[];
  /**
   * 同一刻按"没打完"算的得分（standings(s, true)，不含马和头名奖）：提前收场、离座时和它比。
   * 只记含马的那份的话，坐下到账马上走，一张牌没打也会差出整份马（0.47.3 跨审）。部署前的房间没有，按 entry
   */
  entryEarly?: number[];
}

export type RcAction =
  | { t: 'discard'; tile: Tile; riichi?: true }
  | { t: 'tsumo' }
  | { t: 'kan'; tile: Tile }
  | { t: 'kyuushu' }
  | { t: 'claim'; w: number; c: Answer; low?: number; bot?: boolean }
  | { t: 'expire'; w: number };

/** 立直棒、供托的收付用这个座位号代表"桌上" */
export const TABLE = -1;
