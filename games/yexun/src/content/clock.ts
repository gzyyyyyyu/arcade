// 时间的单位：规则每秒走几拍，和「分:秒」的写法。内容表、核心、画面都从这里取，不各写一份

/** 规则每秒走几拍 */
export const TICKS_PER_SECOND = 30;

/** 秒 → "m:ss"（小数舍掉、负数按 0）；拍数先按场合取整再传（倒计时向上取整，已过时间向下） */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
