/** 推荐布局：用玩家现有的建筑（不新增、不丢）重摆成三种套路 */
import { BUILDINGS, DEFENSE_KINDS } from '../content/index.ts';
import { islandExt } from './base.ts';
import { ISLAND } from './types.ts';
import type { BuildingKind, Placed, Profile } from './types.ts';

export type PresetStyle = 'turtle' | 'spread' | 'trap';

class Grid {
  private cells = new Set<string>();
  readonly out: Placed[] = [];
  /** 岛扩了几圈（islandExt）：套路的位置按 22×22 写，挤不下的往扩出来的地方找 */
  private readonly ext: number;
  constructor(ext: number) {
    this.ext = ext;
  }

  fits(kind: BuildingKind, x: number, y: number): boolean {
    const s = BUILDINGS[kind].size;
    const e = this.ext;
    if (x < -e || y < -e || x + s > ISLAND + e || y + s > ISLAND + e) return false;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) if (this.cells.has(`${x + dx},${y + dy}`)) return false;
    return true;
  }

  put(b: Placed, x: number, y: number): boolean {
    if (!this.fits(b.kind, x, y)) return false;
    const s = BUILDINGS[b.kind].size;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) this.cells.add(`${x + dx},${y + dy}`);
    this.out.push({ ...b, x, y });
    return true;
  }

  /**
   * 先试给定位置；都不行就从岛中心往外找第一个能放的位置（保证不丢建筑）。
   * stretch：套路的位置按 22×22 写，岛扩了就按离中心的远近成比例往外推，摆法铺满整座岛（墙圈和贴着墙的地雷不推，推了会断开）
   */
  place(b: Placed, prefer: Array<[number, number]>, stretch = false): void {
    const s = BUILDINGS[b.kind].size;
    const out = (c: number): number => c + Math.round(((2 * c + s - ISLAND) * this.ext) / ISLAND);
    for (const [x, y] of prefer) if (stretch ? this.put(b, out(x), out(y)) : this.put(b, x, y)) return;
    // 先在 22×22 里找（和不扩的岛摆法一样），挤不下才用扩出来的那圈
    const inner: Array<[number, number]> = [];
    const outer: Array<[number, number]> = [];
    for (let y = -this.ext; y < ISLAND + this.ext; y++) {
      for (let x = -this.ext; x < ISLAND + this.ext; x++) (x >= 0 && y >= 0 && x < ISLAND && y < ISLAND ? inner : outer).push([x, y]);
    }
    const near = (p: [number, number], q: [number, number]): number => Math.abs(p[0] - 10) + Math.abs(p[1] - 10) - (Math.abs(q[0] - 10) + Math.abs(q[1] - 10)) || p[1] - q[1] || p[0] - q[0];
    for (const [x, y] of [...inner.sort(near), ...outer.sort(near)]) if (this.put(b, x, y)) return;
  }
}

/** 以 (11,11) 为中心、半径 r 的方环上的格子；gapSouth 时在南边留一个 3 格宽的口子 */
function ring(r: number, gapSouth: boolean): Array<[number, number]> {
  const lo = 11 - r;
  const hi = 11 + r;
  const cells: Array<[number, number]> = [];
  for (let x = lo; x <= hi; x++) {
    cells.push([x, lo]);
    if (!(gapSouth && Math.abs(x - 11) <= 1)) cells.push([x, hi]);
  }
  for (let y = lo + 1; y < hi; y++) {
    cells.push([lo, y]);
    cells.push([hi, y]);
  }
  return cells.filter(([x, y]) => x >= 0 && y >= 0 && x < ISLAND && y < ISLAND);
}

const NEAR_HQ: Array<[number, number]> = [[11, 13], [13, 10], [8, 11], [10, 8], [13, 13], [8, 8]];
const INNER: Array<[number, number]> = [[7, 7], [14, 7], [7, 14], [14, 14], [10, 6], [10, 15], [6, 10], [15, 10], [6, 6], [15, 15], [6, 15], [15, 6]];
const OUTER_CORNERS: Array<[number, number]> = [[0, 0], [19, 0], [0, 19], [19, 19], [8, 0], [8, 19], [0, 8], [19, 8], [0, 4], [19, 4], [0, 14], [19, 14]];
const FAR_DEF: Array<[number, number]> = [[3, 3], [17, 3], [3, 17], [17, 17], [10, 2], [10, 18], [2, 10], [18, 10], [6, 4], [14, 4], [6, 17], [14, 17]];

export function presetLayout(p: Profile, style: PresetStyle): Placed[] {
  const g = new Grid(islandExt(p.base.buildings));
  const all = p.base.buildings;
  const hq = all.find((b) => b.kind === 'hq');
  const walls = all.filter((b) => b.kind === 'wall');
  const defs = all.filter((b) => DEFENSE_KINDS.has(b.kind) && b.kind !== 'kraken');
  const mines = all.filter((b) => b.kind === 'mine' || b.kind === 'tar');
  const eco = all.filter((b) => ['goldmine', 'sawmill', 'vault', 'woodyard', 'dock', 'armory'].includes(b.kind));
  const chests = all.filter((b) => b.kind === 'treasure');
  const rest = all.filter((b) => b !== hq && !walls.includes(b) && !defs.includes(b) && !mines.includes(b) && !eco.includes(b) && !chests.includes(b));
  if (hq) g.put(hq, 9, 9);
  // 宝藏箱是海盗来袭和驻岛英雄守的点：贴着主寨摆在岛心，别落到岛角让敌人一上岸就抢到
  chests.forEach((c, i) => g.place(c, NEAR_HQ.slice(i)));
  const r = Math.max(4, Math.min(10, Math.ceil(walls.length / 8)));
  if (style === 'turtle' || style === 'trap') {
    const cells = ring(r, style === 'trap');
    walls.forEach((w, i) => g.place(w, cells[i] ? [cells[i] as [number, number]] : []));
  } else {
    // 分散：只在主寨两侧立几段短墙，别的不围
    const seg: Array<[number, number]> = [];
    for (let i = 0; i < 4; i++) seg.push([7, 8 + i], [14, 8 + i]);
    walls.forEach((w, i) => g.place(w, seg[i] ? [seg[i] as [number, number]] : []));
  }
  if (style === 'turtle') {
    defs.forEach((d, i) => g.place(d, INNER.slice(i), true));
    // 地雷埋在墙外一圈，兵绕墙时踩上
    mines.forEach((m, i) => g.place(m, [[11 - r - 1 - (i % 2), 3 + ((i * 3) % 16)]]));
    eco.forEach((e, i) => g.place(e, OUTER_CORNERS.slice(i), true));
  } else if (style === 'spread') {
    defs.forEach((d, i) => g.place(d, FAR_DEF.slice(i), true));
    mines.forEach((m, i) => g.place(m, [[2 + ((i * 5) % 18), 2 + ((i * 7) % 18)]], true));
    eco.forEach((e, i) => g.place(e, OUTER_CORNERS.slice(i), true));
  } else {
    // 陷阱：口子在南边，口子里外摆地雷和焦油，臼炮和炮盯着口子
    const gate: Array<[number, number]> = [[10, 11 + r + 1], [11, 11 + r + 1], [12, 11 + r + 1], [10, 11 + r + 2], [12, 11 + r + 2], [9, 11 + r + 1], [13, 11 + r + 1], [11, 11 + r - 1], [10, 11 + r - 1], [12, 11 + r - 1]];
    mines.forEach((m, i) => g.place(m, gate.slice(i)));
    const near: Array<[number, number]> = [[8, 11 + r - 3], [13, 11 + r - 3], [6, 11 + r - 4], [15, 11 + r - 4], [8, 6], [13, 6], [11, 5], [5, 9], [16, 9]];
    defs.forEach((d, i) => g.place(d, near.slice(i), true));
    eco.forEach((e, i) => g.place(e, OUTER_CORNERS.slice(i), true));
  }
  rest.forEach((b, i) => g.place(b, [[1 + ((i * 3) % 19), 1 + ((i * 5) % 19)]], true));
  // 按原来的顺序返回，id 不变
  return all.map((b) => g.out.find((q) => q.id === b.id) ?? b);
}
