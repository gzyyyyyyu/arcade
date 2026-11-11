/**
 * 材质层：给方盒的面、圆柱的侧面叠上程序画的木纹、石头斑驳和青苔、金属锈迹，再加光照（左上来光：亮面偏暖、暗面偏冷）和脚下的环境暗角。
 * 全部是 SVG 小图元，按面的坐标做确定性散列（同一个面永远同样的纹路，不同的面不一样），烘焙时一次画进纹理，运行时零开销。
 * 小面（面积太小的箱子、钉子）不加，免得糊。
 */
import { materialOf, rng, h32, type Material } from './grade.ts';
import { darken, lighten, uid } from './kit.ts';

type Pt = [number, number];
export type Face = 'L' | 'R' | 'T';

const r2 = (n: number): number => Math.round(n * 100) / 100;
const f1 = (n: number): string => String(Math.round(n * 10) / 10);

/** 四边形 p0 p1 p2 p3（左下、右下、右上、左上）里的双线性插值 */
function bil(q: Pt[], u: number, v: number): Pt {
  const [a, b, c, d] = q as [Pt, Pt, Pt, Pt];
  return [
    a[0] * (1 - u) * (1 - v) + b[0] * u * (1 - v) + c[0] * u * v + d[0] * (1 - u) * v,
    a[1] * (1 - u) * (1 - v) + b[1] * u * (1 - v) + c[1] * u * v + d[1] * (1 - u) * v,
  ];
}

function area(q: Pt[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

const polyPts = (a: Pt[]): string => a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
const dot = (p: Pt, rx: number, ry: number, fill: string, op: number): string => `<ellipse cx="${f1(p[0])}" cy="${f1(p[1])}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${fill}" opacity="${op}"/>`;
const ln = (a: Pt, b: Pt, stroke: string, sw: number, op: number): string => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`;

/** 一种材质在面上的细节（q 是面的四个角，已经转成 bil 坐标） */
function detail(mat: Material, q: Pt[], base: string, face: Face, R: () => number, big: boolean): string {
  let s = '';
  switch (mat) {
    case 'wood': {
      // 木纹：顺着面的横向拉的细线，略带起伏；两三个木疤、钉眼
      const dark = darken(base, 0.4);
      const n = big ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const v = (i + 0.5 + (R() - 0.5) * 0.6) / n;
        const u0 = R() * 0.25;
        const u1 = 0.65 + R() * 0.35;
        const m = bil(q, (u0 + u1) / 2, v + (R() - 0.5) * 0.05);
        const a = bil(q, u0, v);
        const b = bil(q, u1, v + (R() - 0.5) * 0.04);
        s += `<path d="M${f1(a[0])},${f1(a[1])} Q${f1(m[0])},${f1(m[1] - 0.8)} ${f1(b[0])},${f1(b[1])}" fill="none" stroke="${dark}" stroke-width="0.8" opacity="${f1(0.2 + R() * 0.2)}"/>`;
      }
      if (R() < 0.6) s += dot(bil(q, 0.2 + R() * 0.6, 0.25 + R() * 0.5), 1.6, 1.1, dark, 0.35);
      if (big) s += ln(bil(q, 0.05, 0.04), bil(q, 0.95, 0.04), lighten(base, 0.35), 0.7, 0.4);
      break;
    }
    case 'stone': {
      const dk = darken(base, 0.3);
      const lt = lighten(base, 0.3);
      const n = big ? 14 : 6;
      for (let i = 0; i < n; i++) {
        const p = bil(q, R(), R());
        s += dot(p, 0.8 + R() * 1.8, 0.6 + R() * 1.1, R() < 0.55 ? dk : lt, r2(0.16 + R() * 0.2));
      }
      // 裂缝：一条折线
      if (big && R() < 0.5) {
        let u = 0.2 + R() * 0.6;
        let v = 0.9;
        let d = `M${polyPts([bil(q, u, v)])}`;
        for (let k = 0; k < 4; k++) {
          u += (R() - 0.5) * 0.14;
          v -= 0.12 + R() * 0.1;
          d += ` L${polyPts([bil(q, u, v)])}`;
        }
        s += `<path d="${d}" fill="none" stroke="${darken(base, 0.55)}" stroke-width="0.9" stroke-linecap="round" opacity="0.5"/>`;
      }
      // 青苔：贴着下沿的几团绿
      if (face !== 'T' && R() < (big ? 0.75 : 0.35)) {
        const cx = 0.1 + R() * 0.8;
        for (let k = 0; k < 4; k++) s += dot(bil(q, cx + (R() - 0.5) * 0.3, 0.06 + R() * 0.16), 2.2 + R() * 2.4, 1.2 + R() * 1.2, k % 2 ? '#5f8f3c' : '#7aa84a', r2(0.45 + R() * 0.25));
      }
      break;
    }
    case 'iron': {
      // 锈迹：下沿和边角的橙褐斑；几颗铆钉；一两道划痕
      for (let k = 0; k < (big ? 5 : 2); k++) s += dot(bil(q, R(), R() < 0.6 ? R() * 0.3 : R()), 2 + R() * 3.5, 1.2 + R() * 2, R() < 0.5 ? '#8b4a26' : '#a5612f', r2(0.22 + R() * 0.2));
      if (big) {
        for (let k = 0; k < 3; k++) s += dot(bil(q, 0.15 + k * 0.35 + R() * 0.1, 0.88), 0.9, 0.9, lighten(base, 0.4), 0.7);
        s += ln(bil(q, R() * 0.5, 0.3 + R() * 0.4), bil(q, 0.5 + R() * 0.5, 0.3 + R() * 0.4), lighten(base, 0.35), 0.6, 0.4);
      }
      break;
    }
    default:
      break;
  }
  return s;
}

/**
 * 面上的材质 + 光照。q：面的四个角（左下、右下、右上、左上）；base：这个面的底色；
 * clip：面的轮廓（多边形点串或 path 的 d）；返回要直接拼进 SVG 的字符串（自带 clipPath）。
 * 面太小（面积 < 220）什么也不画。
 */
export function wear(q: Pt[], base: string, face: Face, clip?: { d: string } | { points: string }, seedExtra = 0): string {
  const a = area(q);
  if (a < 220) return '';
  const big = a > 900;
  const R = rng(h32(Math.round(q[0]![0] * 8), Math.round(q[0]![1] * 8), Math.round(q[2]![0] * 8) ^ (Math.round(q[2]![1] * 8) << 11), seedExtra + (face === 'L' ? 1 : face === 'R' ? 2 : 3)));
  const mat = materialOf(base);
  const id = uid('wc');
  const gid = uid('wg');
  const shape = clip ? ('d' in clip ? `<path d="${clip.d}"/>` : `<polygon points="${clip.points}"/>`) : `<polygon points="${polyPts(q)}"/>`;
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  const x0 = Math.min(...xs) - 2;
  const y0 = Math.min(...ys) - 2;
  const w = Math.max(...xs) - x0 + 4;
  const h = Math.max(...ys) - y0 + 4;
  // 光照：左面迎光偏暖，右面背光偏冷，顶面最亮偏暖；下沿加环境暗角
  const tint = face === 'L' ? '#ffd9a0' : face === 'R' ? '#2a3a7a' : '#fff0c8';
  const tintOp = face === 'L' ? 0.1 : face === 'R' ? 0.16 : 0.12;
  const defs = `<defs><clipPath id="${id}">${shape}</clipPath><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#1a1030" stop-opacity="0"/><stop offset="1" stop-color="#1a1030" stop-opacity="${face === 'T' ? 0.06 : 0.22}"/></linearGradient></defs>`;
  const body =
    `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" fill="${tint}" opacity="${tintOp}"/>` +
    (face === 'T' ? '' : `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" fill="url(#${gid})"/>`) +
    detail(mat, q, base, face, R, big);
  return `${defs}<g clip-path="url(#${id})">${body}</g>`;
}
