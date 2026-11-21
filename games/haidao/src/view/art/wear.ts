/**
 * 材质层：给方盒的面、圆柱的侧面叠上程序画的木纹、石头斑驳和青苔、金属锈迹，再加光照（左上来光：亮面偏暖、暗面偏冷）和脚下的环境暗角。
 * 全部是 SVG 小图元，按面的坐标做确定性散列（同一个面永远同样的纹路，不同的面不一样），烘焙时一次画进纹理，运行时零开销。
 * 小面（面积太小的箱子、钉子）不加，免得糊。
 */
import { rng, h32, type Material } from './grade.ts';
import { darken, lighten, uid } from './kit.ts';

type Pt = [number, number];
type Face = 'L' | 'R' | 'T';

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

/**
 * 同色同宽同透明度的短线、同色的色块各并成一条 path 再输出：一面墙几十条灰缝 / 板缝原来是几十个 <line>，
 * 烘焙时每个元素都要单独设画笔、光栅化，合成一条后画面一样（交叉处不再叠两次透明度，更干净），元素数降一个量级
 */
class Batch {
  private m = new Map<string, string>();
  private add(k: string, d: string): void {
    this.m.set(k, (this.m.get(k) ?? '') + d);
  }
  ln(a: Pt, b: Pt, stroke: string, sw: number, op: number): void {
    this.add(`s|${stroke}|${sw}|${op}`, `M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}`);
  }
  quad(a: Pt, m: Pt, b: Pt, stroke: string, sw: number, op: number): void {
    this.add(`s|${stroke}|${sw}|${op}`, `M${f1(a[0])},${f1(a[1])}Q${f1(m[0])},${f1(m[1])} ${f1(b[0])},${f1(b[1])}`);
  }
  fill(q: Pt[], fill: string, op: number): void {
    this.add(`f|${fill}|${op}`, `M${q.map((p) => `${f1(p[0])},${f1(p[1])}`).join('L')}Z`);
  }
  out(): string {
    let s = '';
    for (const [k, d] of this.m) {
      const [t, c, a, b] = k.split('|');
      s += t === 's' ? `<path d="${d}" fill="none" stroke="${c}" stroke-width="${a}" stroke-linecap="round" opacity="${b}"/>` : `<path d="${d}" fill="${c}" opacity="${a}"/>`;
    }
    return s;
  }
}

const len = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * 一种材质在面上的细节（q 是面的四个角，已经转成 bil 坐标）。尺度按 1× 能看清来定（spec 5.1–5.3）：
 * 木 = 6–8 像素一条的拼板缝（缝下沿一条受光木棱）+ 两三条长木纹 + 至多一个木节；
 * 石 = 错缝砌块（行高 6–7、块宽 9–12，灰缝 1 像素），两成的砌块整块提亮或压暗出体量；
 * 铁 = 不撒碎点，只在下沿一两处锤纹和几颗铆钉。
 */
function detail(mat: Material, q: Pt[], base: string, face: Face, R: () => number, big: boolean): string {
  let s = '';
  const B = new Batch();
  const fh = len(bil(q, 0.5, 0), bil(q, 0.5, 1));
  const fw = len(bil(q, 0, 0.5), bil(q, 1, 0.5));
  switch (mat) {
    case 'wood': {
      const rows = Math.max(1, Math.round(fh / (6 + R() * 2)));
      for (let i = 1; i < rows; i++) {
        const v = i / rows;
        B.ln(bil(q, 0.02, v), bil(q, 0.98, v), '#543220', 1, 0.48);
        B.ln(bil(q, 0.02, v - 0.8 / fh), bil(q, 0.98, v - 0.8 / fh), '#ecc089', 0.8, 0.45);
      }
      const dark = darken(base, 0.4);
      for (let i = 0; i < (big ? 3 : 2); i++) {
        const v = (i + 0.5 + (R() - 0.5) * 0.5) / (big ? 3 : 2);
        const u0 = R() * 0.2;
        const u1 = 0.6 + R() * 0.38;
        const m = bil(q, (u0 + u1) / 2, v);
        const a = bil(q, u0, v);
        const b = bil(q, u1, v);
        B.quad(a, [m[0], m[1] - 1.2], b, dark, 1.2, 0.28);
      }
      if (big && R() < 0.7) s += dot(bil(q, 0.2 + R() * 0.6, 0.25 + R() * 0.5), 1.75, 1, dark, 0.35);
      break;
    }
    case 'stone': {
      if (face === 'T') {
        // 顶面：几块整块明暗，不画灰缝（顶面是平台，不是墙）
        for (let k = 0; k < (big ? 3 : 1); k++) s += dot(bil(q, 0.15 + R() * 0.7, 0.15 + R() * 0.7), 4 + R() * 3, 2 + R() * 1.5, R() < 0.5 ? '#ffffff' : '#1f456e', 0.12);
        break;
      }
      const rows = Math.max(1, Math.round(fh / (6 + R())));
      const cols = Math.max(1, Math.round(fw / (9 + R() * 3)));
      for (let r = 0; r < rows; r++) {
        const v0 = r / rows;
        const v1 = (r + 1) / rows;
        if (r > 0) B.ln(bil(q, 0, v0), bil(q, 1, v0), '#48566b', 1, 0.45);
        const off = r % 2 ? 0.5 : 0;
        for (let c = 0; c <= cols; c++) {
          const u = (c + off) / cols;
          if (u > 0.02 && u < 0.98) B.ln(bil(q, u, v0), bil(q, u, v1), '#48566b', 1, 0.45);
          // 两成的砌块整块提亮 / 压暗
          if (R() < 0.2) {
            const ua = Math.max(0, (c - 1 + off) / cols);
            const ub = Math.min(1, u);
            if (ub - ua > 0.05) B.fill([bil(q, ua, v0), bil(q, ub, v0), bil(q, ub, v1), bil(q, ua, v1)], R() < 0.5 ? '#ffffff' : '#1f456e', R() < 0.5 ? 0.12 : 0.14);
          }
        }
      }
      // 青苔：贴着下沿的几团绿（只在大墙面）
      if (big && R() < 0.5) {
        const cx = 0.1 + R() * 0.8;
        for (let k = 0; k < 3; k++) s += dot(bil(q, cx + (R() - 0.5) * 0.3, 0.06 + R() * 0.12), 2.2 + R() * 2.4, 1.2 + R() * 1.2, k % 2 ? '#5f8f3c' : '#7aa84a', r2(0.4 + R() * 0.2));
      }
      break;
    }
    case 'iron': {
      for (let k = 0; k < (big ? 2 : 1); k++) {
        const p = bil(q, 0.15 + R() * 0.7, 0.08 + R() * 0.2);
        B.fill([[p[0] - 1.5, p[1] - 1], [p[0] + 1.5, p[1] - 1], [p[0] + 1.5, p[1] + 1], [p[0] - 1.5, p[1] + 1]], '#272c3a', 0.22);
      }
      if (big) for (let k = 0; k < 3; k++) s += dot(bil(q, 0.15 + k * 0.35, 0.88), 1.6, 1.6, darken(base, 0.35), 0.8) + dot(bil(q, 0.13 + k * 0.35, 0.9), 0.8, 0.8, lighten(base, 0.5), 0.8);
      break;
    }
    default:
      break;
  }
  return B.out() + s;
}

/**
 * 面上的材质 + 光照。q：面的四个角（左下、右下、右上、左上）；base：这个面的底色；mat：材质类别（由 Mat.kind 给，不按面色猜）；
 * clip：面的轮廓（多边形点串或 path 的 d）；返回要直接拼进 SVG 的字符串（自带 clipPath）。
 * 面太小（面积 < 220）什么也不画。
 */
export function wear(q: Pt[], base: string, face: Face, mat: Material, clip?: { d: string } | { points: string }, seedExtra = 0): string {
  const a = area(q);
  if (a < 220) return '';
  const big = a > 900;
  const R = rng(h32(Math.round(q[0]![0] * 8), Math.round(q[0]![1] * 8), Math.round(q[2]![0] * 8) ^ (Math.round(q[2]![1] * 8) << 11), seedExtra + (face === 'L' ? 1 : face === 'R' ? 2 : 3)));
  const id = uid('wc');
  const gid = uid('wg');
  const shape = clip ? ('d' in clip ? `<path d="${clip.d}"/>` : `<polygon points="${clip.points}"/>`) : `<polygon points="${polyPts(q)}"/>`;
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  const x0 = Math.min(...xs) - 2;
  const y0 = Math.min(...ys) - 2;
  const w = Math.max(...xs) - x0 + 4;
  const h = Math.max(...ys) - y0 + 4;
  // 光照：左面迎光偏暖、檐下一条冷暗带；右面背光偏海天冷蓝、下沿 25% 有沙滩反上来的暖光；顶面最亮偏暖；立面下沿有冷色环境暗角
  const tint = face === 'L' ? '#ffd9a0' : face === 'R' ? '#1f456e' : '#fff0be';
  const tintOp = face === 'L' ? 0.08 : face === 'R' ? 0.15 : 0.12;
  // 立面下沿的冷色暗角和背光面下沿 25% 的沙滩暖反光合成一个渐变（暖光叠在暗角上的颜色直接算好：#6d6452 / 0.244），顶面不加
  const stops =
    face === 'L'
      ? '<stop offset="0" stop-color="#1f456e" stop-opacity="0.14"/><stop offset="0.15" stop-color="#1f456e" stop-opacity="0"/><stop offset="0.6" stop-color="#18263a" stop-opacity="0"/><stop offset="1" stop-color="#18263a" stop-opacity="0.16"/>'
      : face === 'R'
        ? '<stop offset="0.6" stop-color="#18263a" stop-opacity="0"/><stop offset="0.75" stop-color="#18263a" stop-opacity="0.06"/><stop offset="1" stop-color="#6d6452" stop-opacity="0.244"/>'
        : '';
  const defs = `<defs><clipPath id="${id}">${shape}</clipPath>${stops ? `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>` : ''}</defs>`;
  const body =
    `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" fill="${tint}" opacity="${tintOp}"/>` +
    (stops ? `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" fill="url(#${gid})"/>` : '') +
    detail(mat, q, base, face, R, big);
  return `${defs}<g clip-path="url(#${id})">${body}</g>`;
}
