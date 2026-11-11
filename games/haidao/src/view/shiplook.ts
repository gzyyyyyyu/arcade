/** 护航商船在世界里的血条和遮挡剪影的纯函数（tests/shiplook.test.ts 锁住） */

/** 船上方血条的宽、高（世界像素）和离船脚的高度 */
export const SHIP_BAR = { w: 64, h: 7, up: 84 };

/** 血条"拖尾"：掉血时白色残段从旧值慢慢收到新值（按时间，4 倍速也一样）；涨血直接跟上。返回新的残段值（0..100） */
export function trailStep(trail: number, pct: number, dtMs: number): number {
  if (trail <= pct) return pct;
  return Math.max(pct, trail - (dtMs / 1000) * 40);
}

/** 剪影的透明度：被挡住时淡入、不挡时淡出，按时间走（毫秒），减弱动态直接到位 */
export function ghostAlpha(cur: number, blocked: boolean, dtMs: number, still: boolean): number {
  const goal = blocked ? 0.6 : 0;
  if (still) return goal;
  const step = (dtMs / 150) * 0.6;
  return cur < goal ? Math.min(goal, cur + step) : Math.max(goal, cur - step);
}
