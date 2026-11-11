/**
 * 点击抑制：拖拽进行中和刚结束的 150 毫秒里，按钮和卡片自己的「点一下」不响应
 * （拖完松手那下正好落在别的按钮或卡上，不该被当成点击：比如把推荐卡拖到有持仓的格子上，松手处就是那张卡的「卖出」）。
 * 用时间戳：拖拽开始 → 无限；结束 → now + 150。
 */
let suppressUntil = 0;

export function dragStarted(): void {
  suppressUntil = Infinity;
}

export function dragEnded(now: number): void {
  suppressUntil = now + 150;
}

export function clickSuppressed(now: number): boolean {
  return now < suppressUntil;
}

export function resetClickSuppress(): void {
  suppressUntil = 0;
}

/** 按下时记下的那一下：哪个指针、第几次按下（Phaser 的 pointer.downTime）、按钮在哪（世界坐标）。 */
export interface PressSpot {
  id: number;
  downTime: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 松手时判断「是不是按在这个按钮上的那一下」：按钮在按下到松手之间被重建（状态更新时整块重画）时，新按钮没收到按下，
 * 但同一次按下、位置和大小都还对得上（允许悬停抬起、按下下沉这点挪动），就当作同一个按钮，点击不丢。
 * 按在别处（比如刚收起的引导气泡）、松手才落到按钮上的，位置对不上，不算点击。
 */
export function samePress(down: PressSpot | null, p: { id: number; downTime: number }, r: { x: number; y: number; w: number; h: number }): boolean {
  if (!down || down.id !== p.id || down.downTime !== p.downTime) return false;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 12;
  return near(down.x + down.w / 2, r.x + r.w / 2) && near(down.y + down.h / 2, r.y + r.h / 2) && near(down.w, r.w) && near(down.h, r.h);
}

/** 触屏按住这么久算长按（出说明，不算点击）。 */
export const LONG_PRESS_MS = 450;

let longPresses = 0;

/** 被作废的那次按下（长按出了说明）：同一次按下松手时，哪个按钮都不算点击。 */
let cancelled: { id: number; downTime: number } | null = null;

/** 长按显示说明时调用：这次按下作废（长按永远不算点击，按钮在按住期间被重建了也一样）。 */
export function cancelPress(p: { id: number; downTime: number }): void {
  cancelled = { id: p.id, downTime: p.downTime };
  longPresses++;
}

/** 长按生效（这次按下被作废）过几次：冒烟按住后等它加一再松手，不按固定时长等（机器忙时计时器慢，按满时长也未必到点）。 */
export function longPressCount(): number {
  return longPresses;
}

export function pressCancelled(p: { id: number; downTime: number }): boolean {
  return cancelled !== null && cancelled.id === p.id && cancelled.downTime === p.downTime;
}

/**
 * 按钮要不要用调用方给的 hitPad（只往一边撑的点击区）：凡是点击区被 HIT_MIN 撑出按钮的触屏设备（手机、省内存平板）都要，
 * 否则按 HIT_MIN 上下平分，相邻两行的点击区会互相叠住。电脑 HIT_MIN 为 0，不撑，不用。
 */
export function usesHitPad(hitMin: number, hasHitPad: boolean): boolean {
  return hitMin > 0 && hasHitPad;
}
