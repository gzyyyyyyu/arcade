/** 新人大厅引导（三步）的纯逻辑：谁该看、跳过缺失的目标、气泡摆在哪。界面在 LobbyTour.tsx。 */

/** 只给注册不久的新账号看，老玩家上线后不被打扰 */
const TOUR_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface TourStep {
  /** 目标元素上的 data-tour 值 */
  target: string;
  text: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { target: 'play', text: '挑一个游戏，点这里就开打' },
  { target: 'chips', text: '这是你的筹码：只能用来玩，不能买、不能换。用完了每天能领补给' },
  { target: 'friends', text: '加好友、看好友在玩什么、一键加入他的房间' },
];

export const tourKey = (userId: string): string => `arcade.tour.${userId}`;

/** 没存过记录，且账号是 7 天内建的才显示 */
export function shouldShow(user: { id: string; createdAt: number } | null, now: number, stored: string | null): boolean {
  if (!user || stored !== null) return false;
  return Number.isFinite(user.createdAt) && now - user.createdAt <= TOUR_DAYS * DAY_MS;
}

/** from 之后第一个目标还在页面上的步骤；没有返回 -1（from 传 -1 就是找第一步） */
export function nextStep(steps: readonly TourStep[], from: number, present: (target: string) => boolean): number {
  for (let i = from + 1; i < steps.length; i++) if (present(steps[i]!.target)) return i;
  return -1;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Viewport {
  w: number;
  h: number;
  /** 刘海、圆角、home 条让出的边 */
  inset: Box;
}

export interface Placement {
  side: 'top' | 'bottom';
  x: number;
  y: number;
  width: number;
  /** 箭头在气泡里的横向位置 */
  arrowX: number;
}

const MARGIN = 12;
const GAP = 14;
const ARROW_PAD = 20;

/**
 * 气泡放目标的下方，放不下放上方；两边都放不下取空间大的一边再夹进屏幕。
 * 窄屏（手机竖屏）气泡占满宽度，横向夹在安全区内，320 宽也不出界。
 */
export function placeBubble(target: Box, vp: Viewport, bubble: { w: number; h: number }): Placement {
  const minX = vp.inset.left + MARGIN;
  const maxX = vp.w - vp.inset.right - MARGIN;
  const minY = vp.inset.top + MARGIN;
  const maxY = vp.h - vp.inset.bottom - MARGIN;
  const width = Math.max(0, Math.min(vp.w <= 480 ? maxX - minX : bubble.w, maxX - minX));
  const cx = (target.left + target.right) / 2;
  const x = Math.min(Math.max(cx - width / 2, minX), Math.max(minX, maxX - width));
  const below = maxY - (target.bottom + GAP);
  const above = target.top - GAP - minY;
  const side = below >= bubble.h || (above < bubble.h && below >= above) ? 'bottom' : 'top';
  const rawY = side === 'bottom' ? target.bottom + GAP : target.top - GAP - bubble.h;
  const y = Math.min(Math.max(rawY, minY), Math.max(minY, maxY - bubble.h));
  const arrowX = Math.min(Math.max(cx - x, ARROW_PAD), Math.max(ARROW_PAD, width - ARROW_PAD));
  return { side, x, y, width, arrowX };
}
