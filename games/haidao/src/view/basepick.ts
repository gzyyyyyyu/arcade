/**
 * 基地建筑选中判定（纯函数，不依赖 Phaser）。DESIGN.md 第 6 节「建筑选中与遮挡」：
 * 1. 占地格优先（占地互不重叠，至多一座）；
 * 2. 占地没命中，再按贴图不透明像素，前面（depth 大）的优先；
 * 3. 同一点连点，在这一点下所有命中的建筑间循环，选中被压住的那座。
 * 遮挡：被选中 / 悬停 / 摆放的占地，被谁的不透明像素盖住，由 occluders 给出（交给画面把它们变半透明）。
 */
import { iso, unIso } from './iso.ts';

export interface PickItem {
  id: number;
  /** 占地左上角格和边长（格） */
  x: number;
  y: number;
  size: number;
  /** 画的先后（等距深度，越大越靠前） */
  depth: number;
}

/** 世界坐标 (wx, wy) 在建筑 id 的贴图不透明像素上吗（画面层实现：先看外框再读 alpha） */
export type HitFn = (id: number, wx: number, wy: number) => boolean;

/** 同一点连点的循环状态：几像素内算同一点 */
export interface Cycle {
  wx: number;
  wy: number;
  id: number | null;
}

export const newCycle = (): Cycle => ({ wx: NaN, wy: NaN, id: null });

/** 点 (wx, wy) 下所有命中的建筑：占地命中的在最前，然后是不透明像素命中的、前面的先 */
export function candidates(items: readonly PickItem[], wx: number, wy: number, hit: HitFn): number[] {
  const g = unIso(wx, wy);
  const foot = items.find((b) => g.gx >= b.x && g.gx < b.x + b.size && g.gy >= b.y && g.gy < b.y + b.size);
  const out: number[] = foot ? [foot.id] : [];
  const px = items.filter((b) => b !== foot && hit(b.id, wx, wy)).sort((a, b) => b.depth - a.depth || b.id - a.id);
  for (const b of px) out.push(b.id);
  return out;
}

/**
 * 点中的建筑 id。传 cycle 就按连点循环（并更新它）；不传就只取最前的（悬停、右键用）。
 * tol 是"同一点"的容差（世界像素）。
 */
export function pick(items: readonly PickItem[], wx: number, wy: number, hit: HitFn, cycle?: Cycle, tol = 8): number | null {
  const c = candidates(items, wx, wy, hit);
  if (!cycle) return c[0] ?? null;
  let out = c[0] ?? null;
  if (c.length > 1 && cycle.id !== null && Math.hypot(wx - cycle.wx, wy - cycle.wy) <= tol) {
    const i = c.indexOf(cycle.id);
    if (i >= 0) out = c[(i + 1) % c.length] ?? null;
  }
  // 连点里位置取第一次点的，免得一点点飘出容差
  if (!(cycle.id !== null && Math.hypot(wx - cycle.wx, wy - cycle.wy) <= tol)) {
    cycle.wx = wx;
    cycle.wy = wy;
  }
  cycle.id = out;
  return out;
}

/** 占地 (x, y, size) 里取样的点（世界坐标）：3×3，避开边 */
export function footSamples(x: number, y: number, size: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const u of [0.2, 0.5, 0.8]) for (const v of [0.2, 0.5, 0.8]) out.push(iso(x + size * u, y + size * v));
  return out;
}

/** 占地的深度（和 depthOf(footCenter) 一致：中心 gx+gy） */
export const footDepth = (x: number, y: number, size: number): number => x + y + size;

/**
 * 盖住占地 (x, y, size) 的建筑：比它靠前（depth 大）、且不透明像素落在占地取样点上的。
 * skip 是自己（选中的建筑别把自己算进去）。
 */
export function occluders(items: readonly PickItem[], x: number, y: number, size: number, hit: HitFn, skip?: number): Set<number> {
  const d = footDepth(x, y, size);
  const pts = footSamples(x, y, size);
  const out = new Set<number>();
  for (const b of items) {
    if (b.id === skip || b.depth <= d) continue;
    if (pts.some((p) => hit(b.id, p.x, p.y))) out.add(b.id);
  }
  return out;
}

/** 渐隐一步：当前值朝目标走，按时间（毫秒）线性；快速模式直接到位 */
export function fadeStep(cur: number, target: number, dt: number, instant: boolean, ms = 140): number {
  if (instant || ms <= 0) return target;
  const k = dt / ms;
  return cur < target ? Math.min(target, cur + k) : Math.max(target, cur - k);
}
