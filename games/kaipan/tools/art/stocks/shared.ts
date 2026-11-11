/** 股票小人生成器的共用部分：画布常量、类型、小件画法（胳膊、脚、皇冠、领带等）、配方类型与图形工具。 */
import type { FaceStyle } from '../lib/face.ts';
import { INK, WHITE, type Frag, darken, frag, hiArc, lighten, shape, starD } from '../lib/svg.ts';

export const CANVAS = 128;
export const GROUND = 116;

export interface StockSpec {
  id: string;
  name: string;
  theme: string;
  role: 'leader' | 'follower' | 'bluechip' | 'meme' | 'st';
  hero?: boolean;
  body?: string;
  shape?: string;
  motif?: string;
  colors?: { body?: string; accent?: string; trim?: string };
}

export interface Colors {
  body: string;
  accent: string;
  trim: string;
}

export type Pt = [number, number];

export interface Built {
  back?: Frag;
  spin?: Frag;
  body: Frag;
  mark?: Frag;
  acc?: Frag;
  face: FaceStyle;
  shadowRx: number;
  shadowX?: number;
  anchors: { headTop: Pt; hand?: Pt; spin?: Pt };
}

// ---------------------------------------------------------------- 通用小部件

export function line(d: string, color: string, w: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
}

/** 粗短的小胳膊：描边线 + 填色线 + 手 */
export function arm(x0: number, y0: number, x1: number, y1: number, color: string, hand = true): string {
  const d = `M${x0} ${y0}L${x1} ${y1}`;
  let s = line(d, INK, 12) + line(d, color, 5.5);
  if (hand) s += `<circle cx="${x1}" cy="${y1}" r="5" fill="${color}" stroke="${INK}" stroke-width="3"/>`;
  return s;
}

export function feet(xs: number[], color: string, y = GROUND - 3): string {
  return xs.map((x) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="5" fill="${darken(color, 0.15)}" stroke="${INK}" stroke-width="3.2"/>`).join('');
}

export function crown(cx: number, cy: number, s = 1, rot = 0): Frag {
  const d = 'M-14 7L-15 -7L-7 0L0 -12L7 0L15 -7L14 7Z';
  const f = shape(d, { fill: '#ffd23f', shade: '#f0a020', shadeOffset: [-3, -3], sw: 3.2 });
  const gems =
    `<circle cx="0" cy="-12" r="2.6" fill="#ff5d7a" stroke="${INK}" stroke-width="1.8"/>` +
    `<circle cx="-15" cy="-7" r="2.2" fill="#5ee0ff" stroke="${INK}" stroke-width="1.6"/>` +
    `<circle cx="15" cy="-7" r="2.2" fill="#5ee0ff" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M-13 3.5h26" stroke="${INK}" stroke-width="2" stroke-opacity="0.5"/>` +
    hiArc('M-9 -1l3 3', 2, 0.8);
  return frag(`<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">${f.content}${gems}</g>`, f.defs);
}

export function tie(cx: number, cy: number, color: string, s = 1, rot = 0, collar = true): Frag {
  let c = '';
  if (collar) c += `<path d="M-12 -3l12 6 12 -6 -2 8 -10 2 -10 -2z" fill="${WHITE}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
  const blade = shape('M-4 3L4 3L7 22L0 30L-7 22Z', { fill: color, sw: 2.8, shadeOffset: [-2, -2] });
  const knot = `<path d="M-5.5 -2h11l-2 6h-7z" fill="${lighten(color, 0.15)}" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>`;
  const stripes = `<path d="M-4 12l8 -3M-5 19l10 -4" stroke="${lighten(color, 0.55)}" stroke-width="2" stroke-linecap="round"/>`;
  return frag(
    `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">${c}${blade.content}${stripes}${knot}</g>`,
    blade.defs,
  );
}

/** 妖股的闪电标记：画在额头正中（两条眉毛之间的上方），不压住眼睛 */
export function boltMark(fs: FaceStyle): Frag {
  const k = fs.s * 0.8;
  const x = fs.x + (fs.markDx ?? 0) * fs.s;
  const y = fs.y + (fs.markDy ?? -19) * fs.s;
  const d = `M${x + 2 * k} ${y - 9 * k}L${x - 5 * k} ${y + 1 * k}L${x} ${y + 1 * k}L${x - 3 * k} ${y + 9 * k}L${x + 5 * k} ${y - 2 * k}L${x} ${y - 2 * k}L${x + 4 * k} ${y - 9 * k}Z`;
  return frag(`<path d="${d}" fill="#ffe14a" stroke="${INK}" stroke-width="${(2.4 * fs.s).toFixed(2)}" stroke-linejoin="round"/>`);
}

/** 跟风小旗。dir=1 旗面朝右，-1 朝左；stick=插在身上（没有手）；w 旗面宽 */
export function flag(hx: number, hy: number, color: string, dir: 1 | -1 = 1, stick = false, w = 28): Frag {
  const top = hy - (stick ? 44 : 50);
  const px = hx + 3 * dir;
  const pd = `M${hx} ${hy + (stick ? 0 : 8)}L${px} ${top}`;
  const pole = line(pd, INK, 6) + line(pd, '#c98a4a', 2.5);
  const cloth = shape(`M${px} ${top + 2}Q${px + dir * w * 0.5} ${top - 2} ${px + dir * w} ${top + 8}Q${px + dir * w * 0.5} ${top + 13} ${px} ${top + 20}Z`, {
    fill: color,
    sw: 3,
    shadeOffset: [-3 * dir, -3],
  });
  const star = `<path d="${starD(px + dir * w * 0.42, top + 9, 4)}" fill="${WHITE}"/>`;
  const knob = `<circle cx="${px}" cy="${top - 1}" r="3.4" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/>`;
  const hand = stick ? '' : `<circle cx="${hx}" cy="${hy}" r="5.5" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>`;
  return frag(pole + cloth.content + star + knob + hand, cloth.defs);
}

export function bandage(cx: number, cy: number): string {
  const one = (rot: number) =>
    `<g transform="translate(${cx} ${cy}) rotate(${rot})"><rect x="-14" y="-4.8" width="28" height="9.6" rx="4.8" fill="#ffe0bd" stroke="${INK}" stroke-width="2.6"/>` +
    `<rect x="-4.5" y="-3.2" width="9" height="6.4" rx="1.5" fill="#f2bf8c"/><circle cx="-9" cy="-1.5" r="0.9" fill="#d69a66"/><circle cx="-9" cy="1.8" r="0.9" fill="#d69a66"/><circle cx="9" cy="-1.5" r="0.9" fill="#d69a66"/><circle cx="9" cy="1.8" r="0.9" fill="#d69a66"/></g>`;
  return one(40) + one(-40);
}

export function leaf(bx: number, by: number, tx: number, ty: number, w: number, bend: number): string {
  const mx = (bx + tx) / 2;
  const my = (by + ty) / 2;
  const len = Math.hypot(tx - bx, ty - by);
  const nx = -(ty - by) / len;
  const ny = (tx - bx) / len;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  return `M${bx - w / 2} ${by}Q${(cx - w / 2).toFixed(1)} ${cy.toFixed(1)} ${tx} ${ty}Q${(cx + w / 2).toFixed(1)} ${cy.toFixed(1)} ${bx + w / 2} ${by}Z`;
}

export function wing(side: 1 | -1, x: number, y: number, s = 1): Frag {
  const d = 'M0 0C-8 -10 -22 -20 -36 -16C-30 -12 -32 -8 -34 -4C-27 -4 -27 0 -30 4C-22 3 -18 6 -20 10C-12 8 -4 6 0 0Z';
  const f = shape(d, { fill: WHITE, shade: '#d9e4f5', shadeOffset: [3, -3], sw: 3 });
  const feathers = line('M-30 -4L-12 -2M-26 5L-10 2', '#b8c6dd', 2);
  return frag(`<g transform="translate(${x} ${y}) scale(${-side * s} ${s})">${f.content}${feathers}</g>`, f.defs);
}

// ---------------------------------------------------------------- 精做 6 只

/**
 * 每个配方 = 一种和名字梗对应的剪影（身体用题材色），角色配饰按 role 统一加在配方给的位置上。
 * 精细度介于精做 6 只和最初的通用形状之间，保证互相不撞形。
 */
export interface Recipe {
  back?: string;
  /** 可旋转层（风扇叶、螺旋桨），绕 spinAt 转 */
  spin?: string;
  spinAt?: Pt;
  /** 身体之前画的东西（腿、茎、蒸汽） */
  under?: string;
  body: Frag;
  /** 最上层的额外装饰（和配饰同层） */
  top?: string;
  face: FaceStyle;
  headTop: Pt;
  shadowRx: number;
  shadowX?: number;
  /** 小短手：[肩, 手]；右手如果举旗就用 flag.hand 覆盖 */
  armL?: [Pt, Pt];
  armR?: [Pt, Pt];
  feetX?: number[];
  /** 跟风小旗：hand=举在手里（从 armR 的肩膀伸过去）/ stick=插在身上 */
  flag?: { x: number; y: number; dir: 1 | -1; stick?: boolean; w?: number };
  crown?: [number, number, number, number?];
  /** 领带位置 [x, y, 缩放?]，缩放默认 0.85 */
  tie?: [number, number, number?];
  bandage?: Pt;
  /** 整体缩放（以地面中心 (64, 116) 为原点）：跟风股小一号 */
  scale?: number;
}

/** 一串顺时针的点之间用外凸圆弧相连：云朵、烟团。点的第三个值是弧的平缓度（≥0.5，越大越平） */
export function bumpsD(pts: [number, number, number?][], k = 0.62): string {
  let d = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * (a[2] ?? k);
    d += `A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${b[0]} ${b[1]}`;
  }
  return d + 'Z';
}

export function coinStack(x: number, y: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const yy = y - i * 5;
    s += `<path d="M${x - 10} ${yy}v3a10 4 0 0 0 20 0v-3" fill="#f0a020" stroke="${INK}" stroke-width="2.2"/><ellipse cx="${x}" cy="${yy}" rx="10" ry="4" fill="#ffd23f" stroke="${INK}" stroke-width="2.2"/>`;
  }
  return s;
}

