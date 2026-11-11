/** 推荐布局：用玩家现有的建筑（不新增、不丢）重摆成三种套路 */
import { BUILDINGS, DEFENSE_KINDS } from '../content/index.ts';
import { ISLAND } from './types.ts';
import type { BuildingKind, Placed, Profile } from './types.ts';

export type PresetStyle = 'turtle' | 'spread' | 'trap';

class Grid {
  private cells = new Set<string>();
  readonly out: Placed[] = [];

  fits(kind: BuildingKind, x: number, y: number): boolean {
    const s = BUILDINGS[kind].size;
    if (x < 0 || y < 0 || x + s > ISLAND || y + s > ISLAND) return false;
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

  /** 先试给定位置；都不行就从岛中心往外找第一个能放的位置（保证不丢建筑） */
  place(b: Placed, prefer: Array<[number, number]>): void {
    for (const [x, y] of prefer) if (this.put(b, x, y)) return;
    const cells: Array<[number, number]> = [];
    for (let y = 0; y < ISLAND; y++) for (let x = 0; x < ISLAND; x++) cells.push([x, y]);
    cells.sort((p, q) => Math.abs(p[0] - 10) + Math.abs(p[1] - 10) - (Math.abs(q[0] - 10) + Math.abs(q[1] - 10)) || p[1] - q[1] || p[0] - q[0]);
    for (const [x, y] of cells) if (this.put(b, x, y)) return;
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

const INNER: Array<[number, number]> = [[7, 7], [14, 7], [7, 14], [14, 14], [10, 6], [10, 15], [6, 10], [15, 10], [6, 6], [15, 15], [6, 15], [15, 6]];
const OUTER_CORNERS: Array<[number, number]> = [[0, 0], [19, 0], [0, 19], [19, 19], [8, 0], [8, 19], [0, 8], [19, 8], [0, 4], [19, 4], [0, 14], [19, 14]];
const FAR_DEF: Array<[number, number]> = [[3, 3], [17, 3], [3, 17], [17, 17], [10, 2], [10, 18], [2, 10], [18, 10], [6, 4], [14, 4], [6, 17], [14, 17]];

export function presetLayout(p: Profile, style: PresetStyle): Placed[] {
  const g = new Grid();
  const all = p.base.buildings;
  const hq = all.find((b) => b.kind === 'hq');
  const walls = all.filter((b) => b.kind === 'wall');
  const defs = all.filter((b) => DEFENSE_KINDS.has(b.kind) && b.kind !== 'kraken');
  const mines = all.filter((b) => b.kind === 'mine' || b.kind === 'tar');
  const eco = all.filter((b) => ['goldmine', 'sawmill', 'vault', 'woodyard', 'dock', 'armory'].includes(b.kind));
  const rest = all.filter((b) => b !== hq && !walls.includes(b) && !defs.includes(b) && !mines.includes(b) && !eco.includes(b));
  if (hq) g.put(hq, 9, 9);
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
    defs.forEach((d, i) => g.place(d, INNER.slice(i)));
    // 地雷埋在墙外一圈，兵绕墙时踩上
    mines.forEach((m, i) => g.place(m, [[11 - r - 1 - (i % 2), 3 + ((i * 3) % 16)]]));
    eco.forEach((e, i) => g.place(e, OUTER_CORNERS.slice(i)));
  } else if (style === 'spread') {
    defs.forEach((d, i) => g.place(d, FAR_DEF.slice(i)));
    mines.forEach((m, i) => g.place(m, [[2 + ((i * 5) % 18), 2 + ((i * 7) % 18)]]));
    eco.forEach((e, i) => g.place(e, OUTER_CORNERS.slice(i)));
  } else {
    // 陷阱：口子在南边，口子里外摆地雷和焦油，臼炮和炮盯着口子
    const gate: Array<[number, number]> = [[10, 11 + r + 1], [11, 11 + r + 1], [12, 11 + r + 1], [10, 11 + r + 2], [12, 11 + r + 2], [9, 11 + r + 1], [13, 11 + r + 1], [11, 11 + r - 1], [10, 11 + r - 1], [12, 11 + r - 1]];
    mines.forEach((m, i) => g.place(m, gate.slice(i)));
    const near: Array<[number, number]> = [[8, 11 + r - 3], [13, 11 + r - 3], [6, 11 + r - 4], [15, 11 + r - 4], [8, 6], [13, 6], [11, 5], [5, 9], [16, 9]];
    defs.forEach((d, i) => g.place(d, near.slice(i)));
    eco.forEach((e, i) => g.place(e, OUTER_CORNERS.slice(i)));
  }
  rest.forEach((b, i) => g.place(b, [[1 + ((i * 3) % 19), 1 + ((i * 5) % 19)]]));
  // 按原来的顺序返回，id 不变
  return all.map((b) => g.out.find((q) => q.id === b.id) ?? b);
}
