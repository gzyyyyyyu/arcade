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
