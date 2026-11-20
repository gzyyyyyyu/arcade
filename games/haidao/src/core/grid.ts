/**
 * 格子图和公共小工具：战斗（battle.ts）和守岛（td.ts）共用。
 * 格子是岛加一圈海滩；流场是 8 邻格 Dijkstra（直走 10 斜走 14、墙能走但贵、斜着不许从两个占格的缝里挤）。
 * 这里的结果是登陆战指纹和金标准的一部分，改动要保证逐格不变。
 * 格子占用 occ：0 空地、1 墙（能砸开）、2 别的东西（不能走）。
 * 岛能按主寨等级向四周扩 ext 圈（HQ_LEVELS.ext，只有玩家自己的岛）：一局的世界是 [-ext-BEACH, ISLAND+ext+BEACH)，
 * 格子数组按最大扩展 EXT_MAX 定长，所以同一个格子在哪个 ext 下下标都一样；判边界一律带局的 ext。
 */
import { BEACH, EXT_MAX, ISLAND, UNIT } from './types.ts';

const OFF = BEACH + EXT_MAX;
export const GRID = ISLAND + 2 * OFF;
export const INF = 0x3fffffff;
/** 堆里把（代价, 格子下标）打成一个数：代价 × PACK + 下标；PACK 要大于格子数，排序才和先比代价再比下标一样 */
const PACK = 2048;
export const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 10], [0, 1, 10], [-1, 0, 10], [0, -1, 10],
  [1, 1, 14], [-1, 1, 14], [-1, -1, 14], [1, -1, 14],
];

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : Math.min(v, hi);
}

/** 两点距离的平方 */
export function d2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

/** 点到线段距离的平方（整数近似：投影比例按千分之一取整） */
export function segD2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const L = vx * vx + vy * vy;
  if (L === 0) return d2(px, py, ax, ay);
  let k = Math.floor((((px - ax) * vx + (py - ay) * vy) * 1000) / L);
  k = k < 0 ? 0 : Math.min(k, 1000);
  return d2(px, py, ax + Math.floor((vx * k) / 1000), ay + Math.floor((vy * k) / 1000));
}

/** 格子在这一局的世界里（岛加海滩）；ext 是岛扩了几圈 */
export function inGrid(ext: number, cx: number, cy: number): boolean {
  const lo = -BEACH - ext;
  const hi = ISLAND + BEACH + ext;
  return cx >= lo && cy >= lo && cx < hi && cy < hi;
}

/** 格子在岛上（不含海滩） */
export function inIsle(ext: number, cx: number, cy: number): boolean {
  return cx >= -ext && cy >= -ext && cx < ISLAND + ext && cy < ISLAND + ext;
}

export function cellIdx(cx: number, cy: number): number {
  const x = cx + OFF < 0 ? 0 : cx + OFF >= GRID ? GRID - 1 : cx + OFF;
  const y = cy + OFF < 0 ? 0 : cy + OFF >= GRID ? GRID - 1 : cy + OFF;
  return y * GRID + x;
}

export function cellOf(x: number, y: number): number {
  return cellIdx(Math.floor(x / UNIT), Math.floor(y / UNIT));
}

/** 格子中心（单位） */
export function cellX(idx: number): number {
  return ((idx % GRID) - OFF) * UNIT + UNIT / 2;
}
export function cellY(idx: number): number {
  return (Math.floor(idx / GRID) - OFF) * UNIT + UNIT / 2;
}

/**
 * 流场的通用核心：seeds 回调里调 seed(idx) 放终点（先放先入堆）；blocked 判能不能走；
 * stepMul 是进入该格的代价倍数（普通格 1）。守岛（flowField）和登陆战（battle.ts）各给自己的判法。
 */
export function flowFrom(
  occ: ArrayLike<number>,
  ext: number,
  seeds: (seed: (idx: number) => void) => void,
  blocked: (idx: number) => boolean,
  stepMul: (idx: number) => number,
): Int32Array {
  const dist = new Int32Array(GRID * GRID).fill(INF);
  const heap: number[] = [];
  const push = (v: number): void => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if ((heap[par] as number) <= v) break;
      heap[i] = heap[par] as number;
      i = par;
    }
    heap[i] = v;
  };
  const pop = (): number => {
    const top = heap[0] as number;
    const last = heap.pop() as number;
    if (heap.length > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && (heap[c + 1] as number) < (heap[c] as number)) c++;
        if ((heap[c] as number) >= last) break;
        heap[i] = heap[c] as number;
        i = c;
      }
      heap[i] = last;
    }
    return top;
  };
  seeds((idx) => {
    if (blocked(idx) || dist[idx] === 0) return;
    dist[idx] = 0;
    push(idx);
  });
  while (heap.length > 0) {
    const top = pop();
    const idx = top % PACK;
    const d = Math.floor(top / PACK);
    if (d > (dist[idx] as number)) continue;
    const cx = (idx % GRID) - OFF;
    const cy = Math.floor(idx / GRID) - OFF;
    for (const [ox, oy, base] of NEIGHBORS) {
      const nx = cx + ox;
      const ny = cy + oy;
      if (!inGrid(ext, nx, ny)) continue;
      const n = cellIdx(nx, ny);
      if (blocked(n)) continue;
      if (ox !== 0 && oy !== 0 && ((occ[cellIdx(cx + ox, cy)] ?? 0) > 0 || (occ[cellIdx(cx, cy + oy)] ?? 0) > 0)) continue;
      const nd = d + base * stepMul(n);
      if (nd < (dist[n] as number)) {
        dist[n] = nd;
        push(nd * PACK + n);
      }
    }
  }
  return dist;
}

/**
 * 到一组终点格的代价流场。wallCost：墙格的代价倍数；0 表示墙不能走（英雄）。
 * 终点格本身被占（宝藏箱、障碍）时，改用它四周能站的格做终点。
 */
export function flowField(occ: Uint8Array, ext: number, goals: number[], wallCost: number): Int32Array {
  const blocked = (idx: number): boolean => {
    const o = occ[idx] ?? 0;
    return o === 2 || (o === 1 && wallCost === 0);
  };
  return flowFrom(
    occ,
    ext,
    (seed) => {
      for (const g of goals) {
        if (!blocked(g)) {
          seed(g);
          continue;
        }
        const gx = (g % GRID) - OFF;
        const gy = Math.floor(g / GRID) - OFF;
        for (const [ox, oy] of NEIGHBORS) if (inGrid(ext, gx + ox, gy + oy)) seed(cellIdx(gx + ox, gy + oy));
      }
    },
    blocked,
    (n) => ((occ[n] ?? 0) === 1 ? wallCost : 1),
  );
}

/** 下一步该走的格（流场里最低的邻格）；已经在终点或没有路时返回 -1 */
export function nextCell(occ: ArrayLike<number>, ext: number, f: Int32Array, x: number, y: number): number {
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  const here = f[cellIdx(cx, cy)] as number;
  if (here === 0) return -1;
  let best = -1;
  let bestD = here;
  for (const [ox, oy] of NEIGHBORS) {
    const nx = cx + ox;
    const ny = cy + oy;
    if (!inGrid(ext, nx, ny)) continue;
    if (ox !== 0 && oy !== 0 && ((occ[cellIdx(cx + ox, cy)] ?? 0) > 0 || (occ[cellIdx(cx, cy + oy)] ?? 0) > 0)) continue;
    const n = cellIdx(nx, ny);
    const d = f[n] as number;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}
