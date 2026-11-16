/**
 * 守岛的"谁在打谁、打多远"：射程圈、目标虚线、开火准星的纯函数和小对象池（不碰 Phaser，Node 里可测）。
 * 画面层（TdScene）每帧往同一张 Graphics 上画，这里只算尺寸、线段、准星动画。
 */

/** 等距画面里半径 cells 格的圆：椭圆的宽和高（屏幕像素） */
export function isoRing(cells: number): { w: number; h: number } {
  return { w: cells * 64 * Math.SQRT2, h: cells * 32 * Math.SQRT2 };
}

/**
 * 单位圆里的斜线（u + v = c）截成的线段，用来在内圈死区里画斜线：n 条，两端点是 [u0, v0, u1, v1]（-1..1）。
 * 调用方把它按椭圆的半宽半高缩放，等距画面里自然也是斜的。
 */
export function hatchSegments(n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const c = -1.3 + (2.6 * (i + 0.5)) / n;
    const d = Math.sqrt(Math.max(0, 2 - c * c));
    const u0 = (c - d) / 2;
    const u1 = (c + d) / 2;
    out.push([u0, c - u0, u1, c - u1]);
  }
  return out;
}

/** 虚线：把 (x0,y0)→(x1,y1) 切成 dash 长、gap 间隔的小段，逐段交给 cb；phase 让虚线慢慢流动 */
export function forEachDash(x0: number, y0: number, x1: number, y1: number, dash: number, gap: number, phase: number, cb: (ax: number, ay: number, bx: number, by: number) => void): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1e-6 || dash <= 0) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const period = dash + Math.max(0, gap);
  let a = -(((phase % period) + period) % period);
  while (a < len) {
    const s = Math.max(0, a);
    const e = Math.min(len, a + dash);
    if (e > s) cb(x0 + ux * s, y0 + uy * s, x0 + ux * e, y0 + uy * e);
    a += period;
  }
}

/** 射程圈的样子（1280 宽下的屏幕像素；调用方再乘 1/镜头缩放）。半径只来自核心的 tdTowerRange / tdBuildRange，这里不乘系数 */
export const RANGE_RING = {
  fillColor: 0xfff0b8,
  fillAlpha: 0.18,
  lineColor: 0xffe070,
  lineAlpha: 0.95,
  lineW: 3,
  dash: 12,
  gap: 8,
  deadFillColor: 0x1a0f0c,
  deadFillAlpha: 0.5,
  deadLineColor: 0xff9a8a,
  deadLineAlpha: 0.9,
  deadLineW: 2,
  deadDash: 8,
  deadGap: 6,
  /** 虚线流动速度（像素 / 毫秒），减少动效时为 0 */
  flow: 0.02,
} as const;

/** 椭圆（中心 cx,cy，宽 w 高 h）的虚线：沿周长连续排布，逐段交给 cb；phase 让虚线流动 */
export function forEachEllipseDash(cx: number, cy: number, w: number, h: number, dash: number, gap: number, phase: number, cb: (ax: number, ay: number, bx: number, by: number) => void, steps = 72): void {
  if (w <= 0 || h <= 0) return;
  let d = phase;
  let px = cx + w / 2;
  let py = cy;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = cx + (Math.cos(a) * w) / 2;
    const y = cy + (Math.sin(a) * h) / 2;
    forEachDash(px, py, x, y, dash, gap, d, cb);
    d += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
}

/** 弹道要不要跟着目标的实时位置：只有单体直射（没有溅射、不贯穿）才跟；溅射飞向提前量落点 */
export function shotTracks(splash: number, line: boolean): boolean {
  return splash <= 0 && !line;
}

/** 开火准星闪的时长（毫秒） */
export const FIRE_FLASH_MS = 150;

/** 准星此刻的样子：age 毫秒；steady（减少动效）时不缩放不渐隐，整段时间原样显示 */
export function flashLook(age: number, steady: boolean): { alpha: number; scale: number } | null {
  if (age < 0 || age >= FIRE_FLASH_MS) return null;
  if (steady) return { alpha: 0.9, scale: 1 };
  const k = age / FIRE_FLASH_MS;
  return { alpha: 1 - k * 0.7, scale: 1.7 - 0.7 * k };
}

/** 定长环形池：开火时登记（目标 id、时刻），画的时候遍历还没过期的；满了覆盖最老的，不分配新对象 */
export class FlashPool {
  readonly id: Int32Array;
  readonly at: Float64Array;
  private n = 0;
  readonly cap: number;
  constructor(cap = 32) {
    this.cap = cap;
    this.id = new Int32Array(cap).fill(-1);
    this.at = new Float64Array(cap).fill(-1e9);
  }

  add(id: number, now: number): void {
    // 同一目标刚闪过就刷新那一格，不重复占位
    for (let i = 0; i < this.cap; i++) {
      if (this.id[i] === id && now - (this.at[i] as number) < FIRE_FLASH_MS) {
        this.at[i] = now;
        return;
      }
    }
    this.id[this.n] = id;
    this.at[this.n] = now;
    this.n = (this.n + 1) % this.cap;
  }

  each(now: number, cb: (id: number, age: number) => void): void {
    for (let i = 0; i < this.cap; i++) {
      const age = now - (this.at[i] as number);
      if (age >= 0 && age < FIRE_FLASH_MS) cb(this.id[i] as number, age);
    }
  }
}
