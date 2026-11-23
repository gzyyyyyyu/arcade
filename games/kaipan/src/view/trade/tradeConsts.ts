import type { GameEvent } from '../../core/index.ts';
import { PHONE as PHONE_MODE } from '../theme.ts';
import { SLOTS } from '../trade/layout.ts';

// 交易场景和它的协作者（tradeActions / dayPlayback / monthFlow …）共用的常量和事件筛选函数
export type Ev<T extends GameEvent['type']> = Extract<GameEvent, { type: T }>;

export const DELEVERAGE_TIP = '杠杆降一档：现在能拿回的不变，之后涨跌放大得少、利息少，也不会再被清零。不能再加回去。';

export function pick<T extends GameEvent['type']>(events: GameEvent[], type: T): Ev<T>[] {
  return events.filter((e): e is Ev<T> => e.type === type);
}

export function first<T extends GameEvent['type']>(events: GameEvent[], type: T): Ev<T> | undefined {
  return events.find((e): e is Ev<T> => e.type === type);
}

/** 节拍（毫秒，1 倍速）：一天的结算约 6 秒 */
/** 轻提示的位置：显示器和开盘按钮之间，猫气泡右边、群聊左边。 */
// 手机上开盘键旁边没地方：提示条压在持仓区下沿（一闪而过，不挡小结卡）
export const TOAST = PHONE_MODE ? { x: SLOTS.x + SLOTS.w / 2, y: SLOTS.y + SLOTS.h - 18, w: 440 } : { x: 720, y: 576, w: 460 };
/** 屏幕中部大字的位置：电脑在持仓区上方，手机上持仓顶着顶栏，就压在持仓区中间 */
export const SHOUT_AT = PHONE_MODE ? { x: SLOTS.x + SLOTS.w / 2, y: SLOTS.y + 70 } : { x: 612, y: 150 };
export const T = {
  open: 240,
  // 收紧：热度条 420→300ms、每只翻牌 255→180ms（实际用 ×0.6、×0.75，见 dayPlayback）
  themes: 500,
  reveal: 240,
  afterReveal: 240,
  chain: 460,
  item: 400,
  account: 650,
  judge: 80,
  comment: 220,
  hold: 300,
  chatGap: 120,
  monthIntro: 1900,
  /** 本月看点卡停留（boss 月多一点；点一下或空格跳过） */
  monthCard: 4600,
  bossCard: 5600,
  /** 屏幕中部大字每条 */
  shout: 950,
};
/** 快进（平淡日）时结算节拍的倍数 */
export const FAST = 0.22;
/** 自动快进前留给玩家停下的时间（毫秒） */
export const AUTO_DELAY = 900;
