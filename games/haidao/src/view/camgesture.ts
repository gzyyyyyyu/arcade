/**
 * 镜头手势的纯判定（不碰 Phaser，单测锁住）：点和拖怎么分、缩放怎么夹。
 * 单位全是 CSS 像素；Phaser 指针坐标是画布像素，用的时候乘渲染倍数 r。
 */

/** 按下后移动超过它才算拖镜头，否则松手算点。手指比鼠标抖得多、指肚也大，所以宽一些（鼠标 6，触屏 10） */
export const DRAG_PX = { mouse: 6, touch: 10 } as const;

/** 一次按下的位移（CSS 像素）是否已经算拖 */
export function exceedsDrag(dx: number, dy: number, touch: boolean): boolean {
  const t = touch ? DRAG_PX.touch : DRAG_PX.mouse;
  return Math.hypot(dx, dy) > t;
}

export interface TapCheck {
  /** 这次按下中途动过超过阈值（只升不降：拖出去再拖回原处也不算点） */
  moved: boolean;
  /** 中途出现过第二根手指（捏合） */
  multi: boolean;
  /** 被摆放拖拽接管过 */
  dragging: boolean;
  /** 按住的毫秒数 */
  heldMs: number;
}

/** 太久的按住（长按）不算点：误触和犹豫的手指不该触发点选 */
export const TAP_MAX_MS = 600;

/** 松手时是否触发点按 */
export function isTap(c: TapCheck): boolean {
  return !c.moved && !c.multi && !c.dragging && c.heldMs < TAP_MAX_MS;
}

/** 缩放夹在上下限里 */
export function clampZoom(z: number, minZ: number, maxZ: number): number {
  return Math.min(maxZ, Math.max(minZ, z));
}

/** 以屏幕点 (sx, sy) 为不动点缩放后，镜头中心应在哪（世界坐标）。k = 渲染倍数 × 缩放，w、h 是画布像素宽高；wp 是缩放前该屏幕点下的世界点 */
export function centerAfterZoom(wp: { x: number; y: number }, sx: number, sy: number, k: number, w: number, h: number): { cx: number; cy: number } {
  return { cx: wp.x - (sx - w / 2) / k, cy: wp.y - (sy - h / 2) / k };
}
