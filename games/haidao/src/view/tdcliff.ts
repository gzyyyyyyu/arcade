/**
 * 第五章的断崖（TdLevel.cliffs）和崖上的高台（TdSlot.high）：画面层。
 * 断崖格和这一关用到的高台合起来是一块崖（高台那几格在规则里是木台、不在 cliffs 里，画的时候并回去），
 * 每格画成抬高 CLIFF_LIFT 的一块红褐色岩块：顶面带碎石和崖边的草、朝玩家的两个侧面上浅下深加裂缝、崖脚一道阴影；
 * 高台上的木台和塔整体抬高同样多，外圈一道石栏杆（盖在木台上、塔下面）。
 * 开局画一次，不随局面变。规则只认格子，这里的抬高只是画法（点木台按格子算；高台是 2×2 的菱形、高 64，抬高 28 后大半还压在原位，点得到）
 */
import type { TdScene } from './TdScene.ts';
import type { TdState } from '../core/index.ts';
import { DEPTH } from './depth.ts';
import { depthOf, footCenter, iso } from './iso.ts';

/** 崖顶比地面高多少（1 倍像素；一格菱形高 32） */
export const CLIFF_LIFT = 28;

/** 这块木台画的时候要抬高多少：高台抬 CLIFF_LIFT，别的木台不抬 */
export function slotLift(s: Pick<TdState, 'slots'>, slot: number): number {
  return s.slots[slot]?.high ? CLIFF_LIFT : 0;
}

/** 编号 id 的塔画的时候要抬高多少（常驻塔、驻守台不在高台上） */
export function towerLift(s: Pick<TdState, 'slots' | 'towers'>, id: number): number {
  const t = s.towers.find((q) => q.id === id);
  return t && t.slot >= 0 ? slotLift(s, t.slot) : 0;
}

const TOP = 0xa86a45;
const TOP_DARK = 0x9a5d3c;
const SPECK = 0x7c4a2e;
const FACE_L = 0x8a4c2e;
const FACE_L_LOW = 0x6e3b23;
const FACE_R = 0x6a3822;
const FACE_R_LOW = 0x542b19;
const CRACK = 0x3a2014;
const RIM = 0xe0a878;
const GRASS = 0x6fae3e;
const RAIL = 0xd8d1c2;
const RAIL_DARK = 0x7d776c;

type Pt = { x: number; y: number };

export function drawCliffs(bs: TdScene): void {
  const s = bs.s;
  const cells = [...(s.level.cliffs ?? [])];
  for (const sl of s.slots) if (sl.high) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) cells.push({ x: sl.x + dx, y: sl.y + dy });
  if (cells.length === 0) return;
  const on = new Set(cells.map((c) => `${c.x},${c.y}`));
  const has = (x: number, y: number): boolean => on.has(`${x},${y}`);
  const g = bs.add.graphics().setDepth(DEPTH.cliff);
  const H = CLIFF_LIFT;
  const pt = (gx: number, gy: number, up: number): Pt => {
    const p = iso(gx, gy);
    return { x: p.x, y: p.y - up };
  };
  const poly = (pts: Pt[], color: number, alpha = 1): void => {
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
    g.closePath();
    g.fillPath();
  };
  /** 一个朝外的侧面：a、b 是底边两头（格坐标），上半浅、下半深，再按格子坐标挑一两道竖裂缝（固定，不随机） */
  const face = (a: [number, number], b: [number, number], hi: number, lo: number, seed: number): void => {
    poly([pt(a[0], a[1], H), pt(b[0], b[1], H), pt(b[0], b[1], H / 2), pt(a[0], a[1], H / 2)], hi);
    poly([pt(a[0], a[1], H / 2), pt(b[0], b[1], H / 2), pt(b[0], b[1], 0), pt(a[0], a[1], 0)], lo);
    g.lineStyle(1.5, CRACK, 0.55);
    for (const k of [0.3, 0.7]) {
      if ((seed + Math.round(k * 10)) % 3 === 0) continue;
      const gx = a[0] + (b[0] - a[0]) * k;
      const gy = a[1] + (b[1] - a[1]) * k;
      const top = pt(gx, gy, H - 3);
      const mid = pt(gx, gy, H / 2);
      const bot = pt(gx, gy, 4);
      g.lineBetween(top.x, top.y, mid.x + 2, mid.y);
      g.lineBetween(mid.x + 2, mid.y, bot.x - 1, bot.y);
    }
  };
  // 崖脚的阴影：朝外的两边往地上铺一道半透明的暗带
  for (const { x, y } of cells) {
    if (!has(x, y + 1)) poly([pt(x, y + 1, 0), pt(x + 1, y + 1, 0), pt(x + 1, y + 1.35, 0), pt(x, y + 1.35, 0)], 0x1d2a12, 0.22);
    if (!has(x + 1, y)) poly([pt(x + 1, y, 0), pt(x + 1, y + 1, 0), pt(x + 1.35, y + 1, 0), pt(x + 1.35, y, 0)], 0x1d2a12, 0.22);
  }
  // 从后往前画（x + y 小的先画），前面的侧面盖住后面的顶
  cells.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
  for (const { x, y } of cells) {
    if (!has(x, y + 1)) face([x, y + 1], [x + 1, y + 1], FACE_L, FACE_L_LOW, x * 7 + y * 3);
    if (!has(x + 1, y)) face([x + 1, y], [x + 1, y + 1], FACE_R, FACE_R_LOW, x * 5 + y * 11);
    poly([pt(x, y, H), pt(x + 1, y, H), pt(x + 1, y + 1, H), pt(x, y + 1, H)], (x * 3 + y * 5) % 4 === 0 ? TOP_DARK : TOP);
    // 顶面的碎石：每格两三点
    for (let k = 0; k < 3; k++) {
      const h = (x * 31 + y * 17 + k * 13) % 97;
      if (h % 3 === 0) continue;
      const c = pt(x + 0.2 + (h % 7) / 10, y + 0.2 + ((h >> 3) % 7) / 10, H);
      g.fillStyle(SPECK, 0.7).fillEllipse(c.x, c.y, 6, 3);
    }
  }
  // 崖边：朝外的顶边一道亮边；朝北、朝西（离玩家远的那两边）冒几簇草
  for (const { x, y } of cells) {
    const edges: Array<[boolean, [number, number], [number, number], boolean]> = [
      [!has(x, y - 1), [x, y], [x + 1, y], true],
      [!has(x + 1, y), [x + 1, y], [x + 1, y + 1], false],
      [!has(x, y + 1), [x, y + 1], [x + 1, y + 1], false],
      [!has(x - 1, y), [x, y], [x, y + 1], true],
    ];
    for (const [open, [ax, ay], [bx, by], back] of edges) {
      if (!open) continue;
      const a = pt(ax, ay, H);
      const b = pt(bx, by, H);
      g.lineStyle(2, RIM, 0.9).lineBetween(a.x, a.y, b.x, b.y);
      if (!back || (x + y) % 2 === 0) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.lineStyle(2, GRASS, 1);
      g.lineBetween(m.x - 4, m.y, m.x - 6, m.y - 6);
      g.lineBetween(m.x, m.y, m.x, m.y - 7);
      g.lineBetween(m.x + 4, m.y, m.x + 6, m.y - 5);
    }
  }
  // 崖脚的落石：露出来的侧面底下按格子坐标挑一些摆一两块（固定，不随机）
  for (const { x, y } of cells) {
    const h = (x * 13 + y * 7) % 5;
    if (h > 1) continue;
    const spots: Array<[number, number]> = [];
    if (!has(x, y + 1)) spots.push([x + 0.35 + h * 0.3, y + 1.08]);
    if (!has(x + 1, y)) spots.push([x + 1.08, y + 0.4 + h * 0.25]);
    for (const [gx, gy] of spots) {
      const c = pt(gx, gy, 0);
      g.fillStyle(FACE_R_LOW, 1).fillEllipse(c.x, c.y - 3, 14, 9);
      g.fillStyle(FACE_L, 1).fillEllipse(c.x - 2, c.y - 5, 9, 5);
    }
  }
  // 高台外圈一道石栏杆：盖在木台上、塔下面（木台的深度是中心 - 0.5，塔是中心）
  for (const sl of s.slots) {
    if (!sl.high) continue;
    const f = footCenter(sl.x, sl.y, 2);
    const rg = bs.add.graphics().setDepth(depthOf(f.gx, f.gy) - 0.45);
    const corners = [pt(sl.x, sl.y, H), pt(sl.x + 2, sl.y, H), pt(sl.x + 2, sl.y + 2, H), pt(sl.x, sl.y + 2, H)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      rg.lineStyle(4, RAIL_DARK, 1).lineBetween(a.x, a.y - 4, b.x, b.y - 4);
      rg.lineStyle(2, RAIL, 1).lineBetween(a.x, a.y - 5, b.x, b.y - 5);
    }
    for (const c of corners) {
      rg.fillStyle(RAIL_DARK, 1).fillRect(c.x - 3, c.y - 11, 6, 11);
      rg.fillStyle(RAIL, 1).fillRect(c.x - 3, c.y - 12, 6, 3);
    }
  }
}
