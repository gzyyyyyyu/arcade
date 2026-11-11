import type { Rect } from '../rect.ts';

/**
 * 拖拽（推荐卡拖进空格买入、持仓卡拖出持仓区卖出）里不依赖 Phaser 的判断，单独放出来好测。
 * 坐标都是世界坐标。
 */

/** 按下后挪动超过这么远才算拖（世界单位）；再小就当点击，免得手抖把点击变成拖拽 */
export const DRAG_THRESHOLD = 8;

/** 倾斜的最大角度（度） */
export const TILT_MAX = 12;

/** 从按下点到现在点挪了多远，够不够开始拖。 */
export function pastThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** 点落在哪一格（rects[i] 为 null 的格子不算）；都不在返回 -1。pad 放大每格的命中区（手指拖进去不用太准）。 */
export function slotAt(rects: readonly (Rect | null)[], x: number, y: number, pad = 0): number {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r && inRect(r, x, y, pad)) return i;
  }
  return -1;
}

/** 点已经拖出持仓区（四周留 margin 的余量，贴着边放手不算卖）。 */
export function outsideArea(area: Rect, x: number, y: number, margin = 12): boolean {
  return !inRect(area, x, y, margin);
}

/** 拖着的卡随水平速度倾斜：往右拖往右歪，限制在 ±TILT_MAX。vx 是这一帧的水平位移。 */
export function tiltDeg(vx: number, max = TILT_MAX): number {
  return Math.max(-max, Math.min(max, vx * 0.6));
}

/** 倾斜角往目标角靠（每帧 35%），停下来时慢慢回正。 */
export function easeTilt(current: number, target: number): number {
  const next = current + (target - current) * 0.35;
  return Math.abs(next - target) < 0.05 ? target : next;
}

/** 一格的情况：有没有股票 */
export interface DropSlot {
  filled: boolean;
}

/**
 * 推荐卡能放进哪几格。
 * buy：有空格就只有空格能放；replace（满仓）：每个有持仓的格子都能放（放上去走「换掉这只」）；null（买不了）：哪都不能放。
 */
export function buyDropSlots(slots: readonly DropSlot[], action: 'buy' | 'replace' | null): number[] {
  if (action === null) return [];
  const out: number[] = [];
  slots.forEach((s, i) => {
    if (action === 'buy' ? !s.filled : s.filled) out.push(i);
  });
  return out;
}

// 点击抑制（拖拽进行中和刚结束时卡片、按钮不响应点击）在 ui/clickGuard.ts，这里转出去，拖拽相关的都从这一个入口拿
export { clickSuppressed, dragEnded, dragStarted, resetClickSuppress } from '../ui/clickGuard.ts';
