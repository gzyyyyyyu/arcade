/** 「买 ›」小签的布局计算（纯函数，不碰画面库）。 */

/** 文字左边距、小签右边距、文字和小签之间的最小空隙。 */
const TEXT_LEFT = 12;
const TAG_RIGHT = 10;
const GAP = 4;
/** 放不下时气泡下沿多留的一行高度（小签 18 + 上下各 1）。 */
export const BUY_ROW = 20;

/**
 * 小签挂在气泡里靠右、上下居中时，会不会压住最宽的一行文字。
 * 压得到就返回要多留的一行高度（小签改挂气泡下沿），压不到返回 0。
 */
export function buyTagRowHeight(textWidth: number, bubbleW: number, tagW: number): number {
  return TEXT_LEFT + textWidth + GAP > bubbleW - tagW - TAG_RIGHT ? BUY_ROW : 0;
}
