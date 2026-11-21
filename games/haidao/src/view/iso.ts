/**
 * 等距 2:1 投影（画面层和美术共用；规则核心不知道它）。
 * 格 (x, y) 的菱形：宽 TILE_W、高 TILE_H；格坐标 (gx, gy)（可带小数）的屏幕位置 = 世界原点 + iso(gx, gy)。
 * 建筑贴图的锚点 = 它占地菱形的中心，美术按这个锚点画（art 里每张图给出 anchor）。
 */
const TILE_W = 64;
const TILE_H = 32;

/** 格坐标 → 屏幕偏移（1 倍像素，未乘渲染倍数） */
export function iso(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * TILE_W) / 2, y: ((gx + gy) * TILE_H) / 2 };
}

/** 屏幕偏移 → 格坐标（小数） */
export function unIso(sx: number, sy: number): { gx: number; gy: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

/** 占地 size×size、左上角 (x, y) 的建筑的锚点（格坐标） */
export function footCenter(x: number, y: number, size: number): { gx: number; gy: number } {
  return { gx: x + size / 2, gy: y + size / 2 };
}

/** 画的先后：越靠屏幕下方越后画（盖在上面） */
export function depthOf(gx: number, gy: number): number {
  return gx + gy;
}
