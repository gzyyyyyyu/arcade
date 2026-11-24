// 画布按钮 DOM 影子的坐标换算（纯函数，单测用）

interface Cam {
  scrollX: number;
  scrollY: number;
  zoom: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 世界矩形换算到页面（CSS 像素）：先按相机变成画布内的像素（(世界 − 滚动) × 缩放），
 * 再乘画布显示尺寸和内部尺寸之比（EXPAND、渲染倍数、窗口缩放都体现在这个比里），最后加上画布左上角。
 */
export function worldToPage(r: Box, cam: Cam, canvas: Box, inner: { w: number; h: number }): Box {
  const kx = canvas.w / inner.w;
  const ky = canvas.h / inner.h;
  return {
    x: canvas.x + (r.x - cam.scrollX) * cam.zoom * kx,
    y: canvas.y + (r.y - cam.scrollY) * cam.zoom * ky,
    w: r.w * cam.zoom * kx,
    h: r.h * cam.zoom * ky,
  };
}

/** 把页面上的点击框撑到至少 min × min（以原框中心为准，看不见，只管点击）；本来就够大的不变。 */
export function atLeast(r: Box, min: number): Box {
  const w = Math.max(r.w, min);
  const h = Math.max(r.h, min);
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}
