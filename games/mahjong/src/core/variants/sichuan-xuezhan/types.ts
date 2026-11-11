/** 川麻·血战到底的类型与常量：房间选项、状态、动作、事件。其他文件都从这里取，它自己不依赖它们（叶子文件，避免循环引用）。 */
import type { Entropy } from 'arcade-kit/rng';
import type { ShapeRules } from '../../hand/index.ts';
import type { Payment } from '../../match/index.ts';
import type { Answer, ClaimKind, KanType, Meld, RiverTile, Wall } from '../../table/index.ts';
import type { Suit, Tile, TileSet } from '../../tiles/index.ts';
import type { SeatKind, Tune } from '../types.ts';
import type { FanItem } from './fan.ts';

export const VARIANT = 'sichuan-xuezhan' as const;
export const RULES_VERSION = 1;
/** 四人局的座位数（变体登记、房间用；三人两房按 seatsOf） */
export const SEATS = 4;
export const TILESET: TileSet = { suits: [0, 1, 2], honors: false, flowers: false, red: [] };
/** 三人两房的牌：去掉万，筒、条两门 */
export const TILESET_THREE: TileSet = { suits: [1, 2], honors: false, flowers: false, red: [] };
export const SHAPE: ShapeRules = { seven: true, sevenQuads: true, kokushi: false };
/** 能和的牌种：只有数牌 */
export const SUITED_KINDS: readonly number[] = Array.from({ length: 27 }, (_, i) => i);

/** 房间选项（开房就定，进房的人都看得到） */
export interface XzOpts {
  /** 一场几局 */
  rounds: 1 | 4 | 8 | 16;
  /** 封顶几番 */
  cap: 3 | 4 | 5;
  /** 换三张 */
  swap: boolean;
  /** 自摸加底（di）还是加番（fan） */
  zimo: 'di' | 'fan';
  /** 呼叫转移 */
  transfer: boolean;
  /**
   * 血流成河：胡了不下桌，手牌锁住接着打，牌墙摸完才结束（DESIGN.md 2.10）。读的时候一律按 `!!opts.flow`：
   * 旧存档、旧偏好里没有这个字段，按 false（血战）
   */
  flow?: boolean;
  /** 三人两房：3 个人、筒条两门、不定缺（DESIGN.md 第 13 节）。旧存档、旧偏好没有这个字段，按 false */
  three?: boolean;
}

/** 这一桌几个人 */
export const seatsOf = (o: { three?: boolean }): number => (o.three ? 3 : SEATS);

export const DEFAULT_OPTS: XzOpts = { rounds: 8, cap: 4, swap: true, zimo: 'di', transfer: true, flow: false, three: false };

/** 刮风下雨每家付几倍底分（DESIGN.md 2.5） */
export const KAN_PAY: Record<KanType, number> = { direct: 2, added: 1, concealed: 2 };

export type Phase = 'swap' | 'que' | 'turn' | 'claim' | 'end' | 'over';

/** 一次胡 */
export interface Win {
  /** 这一局第几个胡（全桌按先后数；血战 1–3，血流不封顶） */
  order: number;
  tile: Tile;
  /** 点炮的人；自摸是 null */
  from: number | null;
  fan: number;
  items: FanItem[];
  capped: boolean;
  /** 胡的时候手里的牌（公开） */
  hand: Tile[];
}

export interface XzPlayer {
  hand: Tile[];
  melds: Meld[];
  river: RiverTile[];
  que: Suit | -1;
  /** 换三张：选出去的、换进来的（只有自己看得到） */
  swapOut: Tile[] | null;
  swapIn: Tile[] | null;
  /** 第一次胡：血战里表示下桌，血流里表示"已胡、手牌锁住" */
  won: Win | null;
  /** 这一局所有的胡，按先后（血战最多一条；旧存档没有这个字段，读的时候用 winsOf） */
  wins: Win[];
  /** 这一局摸了几次牌（地胡） */
  draws: number;
}

/** 一个座位这一场的统计（都是公开的事，结算页和称号用） */
export interface SeatStats {
  rounds: number;
  wins: number;
  zimo: number;
  pao: number;
  gangs: number;
  maxFan: number;
  /** 最大一局净赢 */
  best: number;
  /** 拿到的称号 id（不含要比较全场的那几个，见 titles.ts） */
  flags: string[];
}

/** 一局的小结（结算页的历史） */
export interface RoundSummary {
  round: number;
  dealer: number;
  net: number[];
  /** 一次胡一条（血流里同一家可以有多条） */
  wins: { seat: number; from: number | null; fan: number; items: FanItem[] }[];
  /** 流局（牌墙摸完）还是三家胡了（血流只有牌墙摸完） */
  end: 'wall' | 'three';
}

/** 声明窗口：opts 是每个座位能做的（隐藏），ans 是回答，bot 是电脑、托管代答的（这些座位离开名单） */
export interface Claim {
  id: number;
  tile: Tile;
  from: number;
  /** 是补杠被抢（只能胡） */
  rob: boolean;
  /** 打牌的人是杠后补牌打出的：杠上炮，ref 是那一杠（呼叫转移找回去） */
  kanRef: number | null;
  haidi: boolean;
  opts: ClaimKind[][];
  ans: (Answer | null)[];
  bot: boolean[];
}

/** 这一步发生了什么（画面的动作字、音效、动画都从这里来）；摸到的牌、暗杠的牌只有本人看得到（view 里过滤） */
export type XzEvent =
  | { e: 'deal'; round: number; dealer: number }
  | { e: 'swapped'; dir: number }
  | { e: 'que' }
  | { e: 'draw'; seat: number; tile: Tile; tail: boolean }
  | { e: 'discard'; seat: number; tile: Tile }
  | { e: 'pon'; seat: number; from: number; tile: Tile }
  | { e: 'kan'; seat: number; from: number | null; tile: Tile; kan: KanType }
  | { e: 'hu'; seat: number; from: number | null; tile: Tile; fan: number; items: FanItem[]; rob: boolean; /** 这一家这一局第几次胡（1 起） */ n: number }
  | { e: 'pay'; pays: Payment[] }
  | { e: 'end'; end: 'wall' | 'three' }
  | { e: 'over' };

export interface XzState {
  variant: typeof VARIANT;
  v: number;
  /** 随机数密钥：只在状态里，view 绝不带 */
  key: Entropy;
  opts: XzOpts;
  share: number;
  base: number;
  kinds: SeatKind[];
  personas: number[];
  /** 每个座位当电脑时这一场的状态（部署前存下的没有，按不浮动算） */
  tunes?: Tune[];
  round: number;
  dealer: number;
  chips: number[];
  /** 每个座位带进来的（净输赢、"一场最多赢 3 份"按它算；好友房有人接管座位时重新记） */
  stake: number[];
  /** 这一局开始时的筹码（算一局的净输赢） */
  start: number[];
  phase: Phase;
  wall: Wall;
  players: XzPlayer[];
  turn: number;
  /** 这一手摸到的牌（自摸、杠上花） */
  drawn: Tile | null;
  /** 这一手是摸牌开始的（能自摸）；碰了以后只能打 */
  canZimo: boolean;
  /** 这一手的牌是杠后补的：那一杠的编号 */
  afterKan: number | null;
  claim: Claim | null;
  claimSeq: number;
  kanSeq: number;
  swapDir: number | null;
  /** 这一局还没人碰杠（地胡） */
  noCalls: boolean;
  /** 这一局打出了几张 */
  discards: number;
  winners: number;
  /** 这一局第一个胡的人；第一个胡是一炮多响时记点炮的人（下一局的庄） */
  nextDealer: number | null;
  ledger: Payment[];
  /**
   * 每个座位这一局从 ledger 第几笔起算是"现在坐着的人"的（好友房中途换人、带入到账时记；没有这个字段按 0）。
   * 退税只追到两头都还是同一个人的那几笔杠钱：换人前收的不让新人退，换人前付的也不退给新人（自审 C5）
   */
  since?: number[];
  events: XzEvent[];
  history: RoundSummary[];
  stats: SeatStats[];
}

export type XzAction =
  | { t: 'swap'; tiles: Tile[] }
  | { t: 'que'; suit: Suit }
  | { t: 'discard'; tile: Tile }
  | { t: 'zimo' }
  | { t: 'kan'; tile: Tile }
  | { t: 'claim'; w: number; c: Answer; bot?: boolean }
  | { t: 'expire'; w: number };

