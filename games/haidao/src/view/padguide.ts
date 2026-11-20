/**
 * 守岛金圈（开局造法、预告卡指的那块）的纯计算：什么时候显示、头上的字放大多少。不依赖 Phaser，tests/padguide.test.ts 锁住。
 */

/** 引导还该不该显示：开局倒数里（第一波没开、倒数还在走）、没结束、挑出来的木台里还有空的 */
export function guideVisible(wave: number, tick: number, next: number, over: boolean, emptyPicks: number): boolean {
  return wave === 0 && next >= 0 && tick < next && !over && emptyPicks > 0;
}

/** 金圈头上字的字号（世界坐标）；镜头缩得小时按 markScale 放大 */
export const MARK_FONT = 20;
/** 屏幕上的最小字号：手机横屏全景镜头约 0.4 倍，不放大只有 8px，14px 也还吃力 */
export const MARK_MIN_PX = 16;

/** 字要放大几倍，屏幕上才不小于 MARK_MIN_PX；镜头放大时不跟着缩小 */
export function markScale(zoom: number): number {
  return Math.max(1, MARK_MIN_PX / (MARK_FONT * zoom));
}
