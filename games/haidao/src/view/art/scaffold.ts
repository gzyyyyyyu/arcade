/**
 * 升级施工用的脚手架（基地升级演出，upfx.ts）：粗木杆、两层走道板（有顶面和侧面）、斜撑、绳结、梯子、杆顶一面小三角旗。
 * 按占地边长 1–4 各画一套，分成"后半"（压在建筑后面：最里面那根杆和靠里的两条边）和"前半"（挡在建筑前面：其余的杆、靠外的两条边、梯子、旗），
 * 场景里前后各贴一张，看上去脚手架把建筑围在中间。锚点 = 占地中心（和建筑图一样），贴在建筑同一点上就对齐。
 * 不进开局的 allArt（省纹理内存），基地场景开场时单独烘焙。
 */
import { PALETTE as C } from './palette.ts';
import { P, ell, line, piece, poly, type ArtPiece, type Pt } from './kit.ts';

const POLE = C.woodD!;
const POLE_L = C.wood!;
const TOP = C.woodL!;
const SIDE = C.wood!;
const INK = C.woodDD!;
const ROPE = '#e9d49c';

/** 脚手架的高度（像素）：大建筑高一些 */
export const scaffoldH = (size: number): number => 24 + size * 19;

type C2 = [number, number];
const T: C2 = [-1, -1];
const R: C2 = [1, -1];
const B: C2 = [1, 1];
const L: C2 = [-1, 1];
const lerp2 = (a: C2, b: C2, t: number): C2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function pole(a: Pt, b: Pt): string {
  return line(a, b, INK, 8) + line(a, b, POLE, 5) + line([a[0] - 1.4, a[1]], [b[0] - 1.4, b[1]], POLE_L, 1.6, 0.9);
}

/**
 * 一条走道板：沿边 A→B（单位：k 倍的格），在高度 z，往里伸 depth 格；画顶面（亮）和外侧面（暗），顶面上几道板缝。
 * inward 是往建筑中心的方向（A、B 都乘 1 - depth/k）。
 */
function walk(k: number, a: C2, b: C2, z: number, depth: number): string {
  const q = 1 - depth / k;
  const A = P(a[0] * k, a[1] * k, z);
  const Bp = P(b[0] * k, b[1] * k, z);
  const Ai = P(a[0] * k * q, a[1] * k * q, z);
  const Bi = P(b[0] * k * q, b[1] * k * q, z);
  const A2 = P(a[0] * k, a[1] * k, z - 6);
  const B2 = P(b[0] * k, b[1] * k, z - 6);
  let s = poly([A, Bp, B2, A2], SIDE, { sw: 1.6, stroke: INK }) + poly([Ai, Bi, Bp, A], TOP, { sw: 1.6, stroke: INK });
  const n = Math.max(2, Math.round(k * 2.4));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const o = lerp2(a, b, t);
    s += line(P(o[0] * k, o[1] * k, z), P(o[0] * k * q, o[1] * k * q, z), INK, 1, 0.55);
  }
  return s;
}

function brace(k: number, a: C2, b: C2, z0: number, z1: number): string {
  const A = P(a[0] * k, a[1] * k, z0);
  const Bp = P(b[0] * k, b[1] * k, z1);
  return line(A, Bp, INK, 4.6) + line(A, Bp, SIDE, 2.6);
}

function knot(k: number, c: C2, z: number): string {
  const p = P(c[0] * k, c[1] * k, z);
  return ell(p[0], p[1] + 1, 3.6, 2.6, ROPE, { sw: 1.3, stroke: INK }) + line([p[0] - 3, p[1] + 1], [p[0] + 3, p[1] + 2], INK, 0.9, 0.6);
}

export function scaffoldArt(size: number, part: 'back' | 'front'): ArtPiece {
  const s = Math.max(1, Math.min(4, Math.round(size)));
  const k = s / 2 + 0.16;
  const H = scaffoldH(s);
  const levels = [Math.round(H * 0.46), H];
  const depth = Math.min(0.42, 0.18 + s * 0.06);
  const w = Math.ceil(128 * k + 32);
  const ay = Math.ceil(32 * k + H + 30);
  const h = ay + Math.ceil(32 * k + 12);
  const up = (c: C2, z0: number, z1: number): string => pole(P(c[0] * k, c[1] * k, z0), P(c[0] * k, c[1] * k, z1));
  // 边上的中间杆：大建筑每隔约 1.3 格一根
  const mids = (a: C2, b: C2): C2[] => {
    const n = Math.max(0, Math.round((2 * k) / 1.3) - 1);
    return Array.from({ length: n }, (_, i) => lerp2(a, b, (i + 1) / (n + 1)));
  };
  let b = '';
  if (part === 'back') {
    for (const c of [...mids(L, T), ...mids(T, R)]) b += up(c, 0, H + 4);
    b += up(T, 0, H + 8);
    b += brace(k, L, T, 0, levels[0]!) + brace(k, T, R, levels[0]!, 0);
    for (const z of levels) b += walk(k, L, T, z, depth) + walk(k, T, R, z, depth);
    for (const z of levels) b += knot(k, T, z);
  } else {
    b += up(L, 0, H + 8) + up(R, 0, H + 8);
    b += brace(k, L, B, 0, levels[0]!) + brace(k, B, R, levels[0]!, 0) + brace(k, L, B, levels[1]!, levels[0]!) + brace(k, B, R, levels[0]!, levels[1]!);
    for (const z of levels) b += walk(k, L, B, z, depth) + walk(k, B, R, z, depth);
    for (const c of [...mids(L, B), ...mids(B, R)]) b += up(c, 0, H + 4);
    b += up(B, 0, H + 16);
    for (const c of [L, R, B]) for (const z of levels) b += knot(k, c, z);
    // 梯子：靠在左前那条边上，从地面搭到第一层走道
    const g0 = P(-k * 0.62, k, 0);
    const g1 = P(-k * 0.3, k, 0);
    const t0 = P(-k * 0.62, k, levels[0]! + 4);
    const t1 = P(-k * 0.3, k, levels[0]! + 4);
    b += line(g0, t0, INK, 4.2) + line(g1, t1, INK, 4.2) + line(g0, t0, TOP, 2.2) + line(g1, t1, TOP, 2.2);
    for (let i = 1; i <= 3; i++) {
      const q = i / 4;
      const a: Pt = [g0[0] + (t0[0] - g0[0]) * q, g0[1] + (t0[1] - g0[1]) * q];
      const c: Pt = [g1[0] + (t1[0] - g1[0]) * q, g1[1] + (t1[1] - g1[1]) * q];
      b += line(a, c, INK, 3.2) + line(a, c, SIDE, 1.8);
    }
    // 旗：最外那根杆顶上一面红三角旗
    const top = P(k, k, H + 16);
    b += poly([[top[0] + 1, top[1]], [top[0] + 19, top[1] + 5], [top[0] + 1, top[1] + 11]], C.red!, { sw: 1.6, stroke: INK });
  }
  return piece(`fx.scaffold.${s}.${part}`, w, h, w / 2, ay, b);
}

/** 四种尺寸前后各一张 */
export function scaffoldPieces(): ArtPiece[] {
  const out: ArtPiece[] = [];
  for (let s = 1; s <= 4; s++) out.push(scaffoldArt(s, 'back'), scaffoldArt(s, 'front'));
  return out;
}
