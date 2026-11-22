/** <Paged> 的算术（src/features/fit/Fit.tsx），纯函数好测 */

/** 高 height 的框里，每条高 item、行距 gap、一行 cols 个，一页能放几条；至少一行 */
export function perPage(height: number, item: number, gap: number, cols: number): number {
  if (!(item > 0)) return cols;
  const rows = Math.max(1, Math.floor((height + gap) / (item + gap)));
  return rows * cols;
}

/** n 条、一页 size 条，一共几页；空列表也算一页 */
export function pageCount(n: number, size: number): number {
  return Math.max(1, Math.ceil(n / Math.max(1, size)));
}

/**
 * 条目高矮不一时按每条的实际高度分页：从头往下装，装不下就另起一页（每页至少一条）。
 * 全部放得下 full（没有翻页条时的整块高）就一页；否则每页能用 room（扣掉翻页条）。返回每页第一条的下标。
 */
export function packPages(heights: readonly number[], full: number, room: number, gap: number): number[] {
  const total = heights.reduce((s, h) => s + h, 0) + gap * Math.max(0, heights.length - 1);
  if (total <= full) return [0];
  const starts = [0];
  let used = 0;
  heights.forEach((h, i) => {
    const need = used === 0 ? h : used + gap + h;
    if (used > 0 && need > room) {
      starts.push(i);
      used = h;
    } else used = need;
  });
  return starts;
}
