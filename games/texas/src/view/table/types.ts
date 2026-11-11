/** 牌桌画面共用的类型、时长表和常量（table.ts 拆分，只挪不改） */
import type { Card } from '../../core/cards.ts';
import type { HandResult, Owner, Status } from '../../core/table.ts';
import type { StickerId } from 'arcade-kit/fun';

/** 画面上一个座位此刻的样子（和视图不完全一样：动画中途、一手的结尾要摆出规则已经翻过去的那一刻） */
export interface SeatFrame {
  owner: Owner;
  persona: number;
  stack: number;
  bet: number;
  status: Status;
  away: boolean;
  leaving: boolean;
  /** 手里的牌：null 是背面；空数组是没牌 */
  cards: (Card | null)[];
  /** 摊牌时的牌型名 */
  hand: string;
  win: boolean;
  /** 这一轮做了什么（"跟注 40"），挂在头像上方，到下一轮才收 */
  tag: string;
}

export interface Frame {
  handNo: number;
  board: Card[];
  /** 收进池子的（不含各座位面前这一轮的下注），按主池、边池分开；一个都没有时是空的 */
  pots: number[];
  button: number;
  toAct: number | null;
  bb: number;
  seats: SeatFrame[];
  /** 一手打完、停着：这一手的结果（结果条、赢的五张高亮） */
  result: HandResult | null;
}

export interface SeatNodes {
  root: HTMLDivElement;
  avatar: HTMLDivElement;
  plate: HTMLDivElement;
  name: HTMLSpanElement;
  stack: HTMLSpanElement;
  hole: HTMLDivElement;
  cards: HTMLDivElement[];
  bubble: HTMLDivElement;
  badge: HTMLSpanElement;
  clock: SVGSVGElement;
  hand: HTMLSpanElement;
  bet: HTMLDivElement;
  betChips: HTMLSpanElement;
  betAmt: HTMLSpanElement;
  look: number;
  /** 名牌上现在显示的数（跳数字的起点） */
  shown: number | null;
  tween: number;
  /** 名牌上此刻实际显示的数（滚动中的中间值）：下一次滚动从这里起，不从上一个目标值跳回去 */
  cur: number | null;
  /** 下一次滚数用的时长（毫秒，pace 为 1 时）；赢池子时设大一点，用一次清掉 */
  roll: number;
  /** 气泡上次夹边用的 key（文字 + 舞台宽），没变就不再量 */
  clampKey: string;
}

export interface TableViewOpts {
  /** 我的名字（平台昵称） */
  myName: () => string;
  /** 动画速度：1 正常，越小越快 */
  pace: () => number;
  /** 点了某个座位（好友房里接管电脑用） */
  onSeat?: (seat: number) => void;
  /** 好友房：每帧的时长是房间定的，大场面只放不占时间的轻效果（不加悬念停顿、不下筹码雨） */
  quick?: () => boolean;
  /** 不看嘲讽和道具（0.3.0 总开关）：电脑说话也一起收起 */
  quiet?: () => boolean;
  /** 这个座位被我屏蔽了（0.6.0：真人、电脑都能屏蔽）：电脑说话也不显示 */
  muted?: (seat: number) => boolean;
  /** 电脑说话时配一个表情包（和真人发的同一套画法，kit 的 STICKERS） */
  sticker?: (seat: number, id: StickerId) => void;
  /** 催促炸弹按钮上的图（kit 的 bomb） */
  bombIcon?: () => string;
}

/** 好友房里每个座位上的人：真人的昵称、状态小字（掉线、电脑代打、买入中），能不能点它接管 */
export interface SeatPeople {
  name: string | null;
  tag: string | null;
  takeable: boolean;
}

/** 全下补牌的胜率标签前缀（放在座位的牌型位上，摊牌后被牌型名换掉） */
export const EQ = '胜率 ';

/** 补牌的戏：quick 是好友房（不加停顿）；after 在每张牌翻开后调，刷新胜率 */
export interface Drama {
  quick: boolean;
  after: () => void;
}

/** 不许盖的操作区：按钮、加注那一行、快捷下注、胜率、预选（看对手的卡、kit 的互动菜单都避开） */
/** 庄家按钮 D 依次试的位置（相对 buttonPos，placeDealer）：原处、上、下、隔开那摞筹码的右边、更左、右上、右下 */
export const DEALER_TRY: readonly (readonly [number, number])[] = [[0, 0], [0, -32], [0, 32], [128, 0], [-36, 0], [64, -32], [64, 32]];
export const KEEP_OUT = '.actions .buttons, .actions .raise-panel, .actions .quick, .actions .odds, .pre';

/** 倒计时圈的周长（半径 34） */
export const CLOCK_LEN = 214;
