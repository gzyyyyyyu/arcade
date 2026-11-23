/** 画图小工具：等距投影下的方盒、屋顶、圆柱、圆锥、炮管、旗子……所有素材共用。 */
import { PALETTE as C } from './palette.ts';
import { gradeSvg, materialOf, outlineOf, type Material } from './grade.ts';
import { wear } from './wear.ts';

export type Pt = [number, number];

export interface ArtPiece {
  key: string;
  svg: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export const OUT = C.ink!;
/** 默认线宽 = 内部结构线（门窗框、屋檐、分层）；外轮廓由图元自己按 OUTLINE 倍画，外重内轻（像积木的黑缝就是内外一样粗） */
export const SW = 1.4;
/** 外轮廓相对图元 sw 参数的倍数：box(…, 2) 的外轮廓是 2.2 */
const OUTLINE = 1.1;
/** 迎光倒角亮棱：顶面和立面交界的前两条边，按受光色向它混 */
const BEVEL = '#fff7dc';

export const f = (n: number): string => String(Math.round(n * 10) / 10);
export const pts = (a: Pt[]): string => a.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');

let uidN = 0;
export const uid = (p = 'g'): string => `${p}${++uidN}`;

// ---------------------------------------------------------------- 颜色

function hex2(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const x = hex2(a);
  const y = hex2(b);
  const r = x.map((v, i) => Math.round(v + (y[i]! - v) * t));
  return '#' + r.map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** 提亮向暖阳色混、压暗向海天冷蓝混：不向纯白（发粉）、紫黑（发脏）混 */
export const lighten = (c: string, t: number): string => mix(c, '#fff4d8', t);
export const darken = (c: string, t: number): string => mix(c, '#163250', t);
/** 各通道乘 k（封顶 255） */
function scale(c: string, k: number): string {
  return '#' + hex2(c).map((v) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, '0')).join('');
}

/**
 * 一种材质：光从左上来。顶面 = 基色 ×1.06 再向暖阳色混（金属多混一点）；左面 = 基色；
 * 右面（背光）= 基色 ×0.78 再向海天冷蓝混（金属最冷、石头次之、木头和其他最少），不是加黑；line = 内部结构线色。
 * kind 是材质类别，三个面共用、交给 wear() 画纹理：调用方知道画的是什么就明说（蓝灰的玄武岩按颜色会被猜成铁），
 * 不传才按基色猜一次。不能按混过冷暖的面色各猜各的，否则同一块石头的背光面会画成铁
 */
export interface Mat {
  t: string;
  l: string;
  r: string;
  line: string;
  kind: Material;
}
export function mat(base: string, kind: Material = materialOf(base)): Mat {
  const sun = kind === 'iron' ? 0.3 : 0.24;
  const cool = kind === 'iron' ? 0.35 : kind === 'stone' ? 0.32 : 0.28;
  return { t: mix(scale(base, 1.06), C.sunWarm!, sun), l: base, r: mix(scale(base, 0.78), C.shadowCool!, cool), line: mix(base, C.inkSoft!, 0.55), kind };
}

/** 外轮廓色：本体色向深褐靠拢，比内线重 */
const rim = (c: string): string => outlineOf(c, OUT, OUT, 0.62);
/** 闭合外轮廓（不填色） */
function outline(a: Pt[], c: string, sw: number): string {
  return `<polygon points="${pts(a)}" fill="none" stroke="${rim(c)}" stroke-width="${f(sw * OUTLINE)}" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------- 基本图元

/** 以占地中心为原点：格坐标 (gx, gy)（单位：格）、高度 z（像素）→ 屏幕坐标 */
export const P = (gx: number, gy: number, z = 0): Pt => [(gx - gy) * 32, (gx + gy) * 16 - z];

interface PolyOpt {
  sw?: number;
  stroke?: string;
  op?: number;
  extra?: string;
}
export function poly(a: Pt[], fill: string, o: PolyOpt = {}): string {
  const sw = o.sw ?? SW;
  const st = sw > 0 ? ` stroke="${o.stroke ?? outlineOf(fill, OUT)}" stroke-width="${sw}" stroke-linejoin="round"` : '';
  const op = o.op !== undefined ? ` opacity="${o.op}"` : '';
  return `<polygon points="${pts(a)}" fill="${fill}"${st}${op}${o.extra ?? ''}/>`;
}
export function line(a: Pt, b: Pt, stroke: string, sw = 1, op = 1): string {
  return `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${op < 1 ? ` opacity="${op}"` : ''}/>`;
}
/** 一组同色同宽的线段并成一条 path（纹线、板缝用；交叉处不叠两次透明度） */
export function lines(segs: Array<[Pt, Pt]>, stroke: string, sw = 1, op = 1): string {
  if (!segs.length) return '';
  const d = segs.map(([a, b]) => `M${f(a[0])},${f(a[1])}L${f(b[0])},${f(b[1])}`).join('');
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${op < 1 ? ` opacity="${op}"` : ''}/>`;
}
export function path(d: string, fill: string, o: PolyOpt = {}): string {
  const sw = o.sw ?? SW;
  const st = sw > 0 ? ` stroke="${o.stroke ?? outlineOf(fill, OUT)}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : '';
  const op = o.op !== undefined ? ` opacity="${o.op}"` : '';
  return `<path d="${d}" fill="${fill}"${st}${op}/>`;
}
export function ell(cx: number, cy: number, rx: number, ry: number, fill: string, o: PolyOpt = {}): string {
  const sw = o.sw ?? SW;
  const st = sw > 0 ? ` stroke="${o.stroke ?? outlineOf(fill, OUT)}" stroke-width="${sw}"` : '';
  const op = o.op !== undefined ? ` opacity="${o.op}"` : '';
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${st}${op}/>`;
}
export function rect(x: number, y: number, w: number, h: number, fill: string, o: PolyOpt & { r?: number } = {}): string {
  const sw = o.sw ?? SW;
  const st = sw > 0 ? ` stroke="${o.stroke ?? outlineOf(fill, OUT)}" stroke-width="${sw}" stroke-linejoin="round"` : '';
  const op = o.op !== undefined ? ` opacity="${o.op}"` : '';
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${o.r ? ` rx="${o.r}"` : ''} fill="${fill}"${st}${op}/>`;
}

// ---------------------------------------------------------------- 方盒、屋顶

type Tex = '' | 'h' | 'v' | 'brick';

/** 方盒：占 [x0,x1]×[y0,y1] 格、高度 z0..z1 像素；可见三面（左前、右前、顶） */
export function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, m: Mat, tex: Tex = '', sw = SW): string {
  const L = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
  const R = [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)];
  const T = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  let s = poly(R, m.r, { sw: 0 }) + poly(L, m.l, { sw: 0 }) + poly(T, m.t, { sw: 0 });
  // 材质（木纹、石头斑驳青苔、锈迹）和光照（左面偏暖、右面偏冷、下沿暗角）
  s += wear(R, m.r, 'R', m.kind) + wear(L, m.l, 'L', m.kind) + wear(T, m.t, 'T', m.kind);
  if (tex) {
    const lc = m.line;
    const lp = (u: number, z: number): Pt => P(x0 + (x1 - x0) * u, y1, z);
    const rp = (u: number, z: number): Pt => P(x1, y1 + (y0 - y1) * u, z);
    // 左右两面的纹线各并成一条 path（一面墙十几条线各成一个元素的话，烘焙时逐个光栅化）
    const L: Array<[Pt, Pt]> = [];
    const Rr: Array<[Pt, Pt]> = [];
    const step = tex === 'v' ? 0 : tex === 'brick' ? 8 : 7;
    if (step) {
      for (let z = z0 + step; z < z1 - 1; z += step) {
        L.push([lp(0, z), lp(1, z)]);
        Rr.push([rp(0, z), rp(1, z)]);
      }
    }
    if (tex === 'v') {
      const nl = Math.max(2, Math.round((x1 - x0) * 5));
      const nr = Math.max(2, Math.round((y1 - y0) * 5));
      for (let i = 1; i < nl; i++) L.push([lp(i / nl, z0 + 1), lp(i / nl, z1 - 1)]);
      for (let i = 1; i < nr; i++) Rr.push([rp(i / nr, z0 + 1), rp(i / nr, z1 - 1)]);
    }
    if (tex === 'brick') {
      const nl = Math.max(2, Math.round((x1 - x0) * 3));
      const nr = Math.max(2, Math.round((y1 - y0) * 3));
      let row = 0;
      for (let z = z0; z < z1 - 1; z += 8, row++) {
        const zt = Math.min(z + 8, z1);
        for (let i = 0; i < nl; i++) {
          const u = (i + (row % 2 ? 0.5 : 0)) / nl;
          if (u > 0 && u < 1) L.push([lp(u, z), lp(u, zt)]);
        }
        for (let i = 0; i < nr; i++) {
          const u = (i + (row % 2 ? 0.5 : 0)) / nr;
          if (u > 0 && u < 1) Rr.push([rp(u, z), rp(u, zt)]);
        }
      }
    }
    s += lines(L, lc, 1, tex === 'h' ? 0.45 : 0.4) + lines(Rr, lc, 1, tex === 'h' ? 0.55 : 0.5);
  }
  // 内部结构：左右立面交界的竖棱（暗、细），顶面前两条边（迎光亮棱）；最后一圈外轮廓（重）
  s += line(P(x1, y1, z0), P(x1, y1, z1), m.line, Math.min(1, sw), 0.85);
  const bev = mix(m.t, BEVEL, 0.48);
  s += line(P(x0, y1, z1), P(x1, y1, z1), bev, 1.1, 0.75) + line(P(x1, y1, z1), P(x1, y0, z1), bev, 1.1, 0.55);
  if (sw > 0) s += outline([P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), P(x0, y1, z1)], m.l, sw);
  return s;
}

/** 左前面（gy=y）上的矩形（门窗用） */
export function Lq(x0: number, x1: number, y: number, za: number, zb: number): Pt[] {
  return [P(x0, y, za), P(x1, y, za), P(x1, y, zb), P(x0, y, zb)];
}
/** 右前面（gx=x）上的矩形 */
export function Rq(x: number, y0: number, y1: number, za: number, zb: number): Pt[] {
  return [P(x, y0, za), P(x, y1, za), P(x, y1, zb), P(x, y0, zb)];
}
/** 左前面上的拱门轮廓 */
export function archL(xc: number, hw: number, y: number, za: number, zs: number, ah: number): Pt[] {
  const a: Pt[] = [P(xc - hw, y, za)];
  for (let i = 0; i <= 8; i++) {
    const t = Math.PI - (Math.PI * i) / 8;
    a.push(P(xc + hw * Math.cos(t), y, zs + ah * Math.sin(t)));
  }
  a.push(P(xc + hw, y, za));
  return a;
}

/** 四坡屋顶（金字塔形） */
export function hip(x0: number, y0: number, x1: number, y1: number, z: number, h: number, m: Mat, over = 0.12, tiles = true): string {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const a = P(x0 - over, y1 + over, z);
  const b = P(x1 + over, y1 + over, z);
  const c = P(x1 + over, y0 - over, z);
  const ap = P(cx, cy, z + h);
  let s = poly([b, c, ap], m.r, { sw: 0 }) + poly([a, b, ap], m.l, { sw: 0 });
  if (tiles) {
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const la = mixPt(a, ap, t);
      const lb = mixPt(b, ap, t);
      const lc = mixPt(c, ap, t);
      s += line(la, lb, m.line, 0.75, 0.4) + line(lb, lc, m.line, 0.75, 0.5);
    }
  }
  // 两坡交界的脊：迎光一侧，亮棱；外圈重轮廓
  s += line(b, ap, mix(m.l, BEVEL, 0.48), 1.1, 0.6);
  s += outline([a, b, c, ap], m.l, 2);
  return s;
}
function mixPt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 圆柱：中心格坐标 (gx, gy)、屏幕半径 rx，高度 z0..z1 */
export function cyl(gx: number, gy: number, rx: number, z0: number, z1: number, m: Mat, bands = 0, sw = SW): string {
  const c = P(gx, gy);
  const ry = rx / 2;
  const x = c[0];
  const yb = c[1] - z0;
  const yt = c[1] - z1;
  const g = uid('cy');
  let s = `<defs><linearGradient id="${g}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${lighten(m.l, 0.15)}"/><stop offset="0.45" stop-color="${m.l}"/><stop offset="1" stop-color="${m.r}"/></linearGradient></defs>`;
  const body = `M${f(x - rx)},${f(yt)} L${f(x - rx)},${f(yb)} A${f(rx)},${f(ry)} 0 0 0 ${f(x + rx)},${f(yb)} L${f(x + rx)},${f(yt)} Z`;
  s += path(body, `url(#${g})`, { sw: 0 });
  s += wear([[x - rx, yb + ry], [x + rx, yb + ry], [x + rx, yt], [x - rx, yt]], m.l, 'L', m.kind, { d: body });
  s += path(body, 'none', { sw: sw * OUTLINE, stroke: rim(m.l) });
  for (let i = 1; i <= bands; i++) {
    const yy = yt + ((yb - yt) * i) / (bands + 1);
    s += path(`M${f(x - rx)},${f(yy)} A${f(rx)},${f(ry)} 0 0 0 ${f(x + rx)},${f(yy)}`, 'none', { stroke: m.line, sw: 1, op: 0.55 });
  }
  // 顶面：前半圈是和侧面的交界（迎光亮棱），后半圈是外轮廓（重）
  s += ell(x, yt, rx, ry, m.t, { sw: 0 });
  // 木台顶面拼板：顺等距方向 (2, 1) 每 7 像素一道板缝（1× 下光滑平涂像塑料）。端点直接解到椭圆上（(d+2t)² + 4t² = rx²），不用 clipPath
  if (m.kind === 'wood' && rx >= 14) {
    const seg: Array<[Pt, Pt]> = [];
    for (let d = -rx + 7; d < rx - 2; d += 7) {
      const k = Math.sqrt(2 * rx * rx - d * d);
      const ta = (-d - k) / 4 + 0.6;
      const tb = (-d + k) / 4 - 0.6;
      seg.push([[x + d + 2 * ta, yt + ta], [x + d + 2 * tb, yt + tb]]);
    }
    s += lines(seg, m.line, 1, 0.4);
  }
  s += path(`M${f(x - rx)},${f(yt)} A${f(rx)},${f(ry)} 0 0 0 ${f(x + rx)},${f(yt)}`, 'none', { stroke: mix(m.t, BEVEL, 0.48), sw: 1.1, op: 0.75 });
  if (sw > 0) s += path(`M${f(x - rx)},${f(yt)} A${f(rx)},${f(ry)} 0 0 1 ${f(x + rx)},${f(yt)}`, 'none', { stroke: rim(m.l), sw: sw * OUTLINE });
  return s;
}

/** 圆锥顶（塔尖） */
export function cone(gx: number, gy: number, rx: number, z: number, h: number, m: Mat, over = 3): string {
  const c = P(gx, gy);
  const r = rx + over;
  const ry = r / 2;
  const x = c[0];
  const yb = c[1] - z;
  const ya = yb - h;
  let s = path(`M${f(x - r)},${f(yb)} L${f(x)},${f(ya)} L${f(x + r)},${f(yb)} A${f(r)},${f(ry)} 0 0 1 ${f(x - r)},${f(yb)} Z`, m.l, { sw: 0 });
  s += path(`M${f(x + r * 0.15)},${f(ya + h * 0.04)} L${f(x + r)},${f(yb)} A${f(r)},${f(ry)} 0 0 1 ${f(x)},${f(yb + ry)} Z`, m.r, { sw: 0 });
  // 迎光的左前一条亮面 + 两圈瓦缝，最后才是外轮廓（不然锥顶是一块平涂色板）
  s += path(`M${f(x)},${f(ya)} L${f(x - r * 0.7)},${f(yb + ry * 0.71)} L${f(x - r * 0.3)},${f(yb + ry * 0.95)} Z`, mix(m.t, BEVEL, 0.25), { sw: 0, op: 0.6 });
  s += line([x, ya + 1], [x - r * 0.3, yb + ry * 0.95], mix(m.t, BEVEL, 0.48), 1.1, 0.7);
  for (const t of [0.35, 0.68]) {
    const rr = r * (1 - t);
    s += path(`M${f(x - rr)},${f(yb - h * t)} A${f(rr)},${f(rr / 2)} 0 0 0 ${f(x + rr)},${f(yb - h * t)}`, 'none', { stroke: m.line, sw: 0.9, op: 0.45 });
  }
  s += path(`M${f(x - r)},${f(yb)} L${f(x)},${f(ya)} L${f(x + r)},${f(yb)} A${f(r)},${f(ry)} 0 0 1 ${f(x - r)},${f(yb)} Z`, 'none', { sw: 2 * OUTLINE, stroke: rim(m.l) });
  return s;
}

/** 一根粗管子（炮管、枪管）：从 a 到 b，粗细 w1→w2；fill 必须是 #rrggbb（要按它混出四段色带和外轮廓） */
export function tube(a: Pt, b: Pt, w1: number, w2: number, fill: string, hi?: string): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const p: Pt[] = [
    [a[0] + (nx * w1) / 2, a[1] + (ny * w1) / 2],
    [b[0] + (nx * w2) / 2, b[1] + (ny * w2) / 2],
    [b[0] - (nx * w2) / 2, b[1] - (ny * w2) / 2],
    [a[0] - (nx * w1) / 2, a[1] - (ny * w1) / 2],
  ];
  // 金属圆柱四段色带（受光一侧在 -n）：上沿受光 28% → 中调 32% → 核心暗带 25% → 下沿地面反光 15%；外轮廓最后画
  const band = (u0: number, u1: number, c: string): string => {
    const q = (pt: Pt, w: number, u: number): Pt => [pt[0] - nx * w * (0.5 - u), pt[1] - ny * w * (0.5 - u)];
    return poly([q(a, w1, u0), q(b, w2, u0), q(b, w2, u1), q(a, w1, u1)], c, { sw: 0 });
  };
  let s = poly(p, fill, { sw: 0 });
  s += band(0, 0.28, mix(fill, '#c4d4e2', 0.45)) + band(0.6, 0.85, mix(scale(fill, 0.78), C.shadowCool!, 0.35)) + band(0.85, 1, mix(fill, '#586b82', 0.5));
  if (hi) {
    // 高光反射窄带：沿受光一侧、只占管长的 65%，留断口
    const k = 0.32;
    const t0 = 0.12;
    const t1 = 0.77;
    const at = (t: number): Pt => [a[0] + dx * t - nx * (w1 + (w2 - w1) * t) * k, a[1] + dy * t - ny * (w1 + (w2 - w1) * t) * k];
    s += line(at(t0), at(t1), hi, Math.max(1, Math.min(w1, w2) * 0.2), 0.8);
  }
  s += outline(p, fill, 1.6);
  return s;
}

/** 骷髅头（白色头骨加两个黑眼窝），中心 (x, y)，大小 s（头宽） */
export function skull(x: number, y: number, s: number, bones = true): string {
  let o = '';
  if (bones) {
    o += line([x - s * 0.7, y + s * 0.55], [x + s * 0.7, y + s * 0.95], C.cream!, Math.max(1.2, s * 0.22));
    o += line([x + s * 0.7, y + s * 0.55], [x - s * 0.7, y + s * 0.95], C.cream!, Math.max(1.2, s * 0.22));
  }
  o += ell(x, y, s * 0.5, s * 0.46, C.cream!, { sw: 0 });
  o += rect(x - s * 0.26, y + s * 0.3, s * 0.52, s * 0.3, C.cream!, { sw: 0 });
  o += ell(x - s * 0.19, y - s * 0.02, s * 0.14, s * 0.15, C.black!, { sw: 0 });
  o += ell(x + s * 0.19, y - s * 0.02, s * 0.14, s * 0.15, C.black!, { sw: 0 });
  o += poly([[x, y + s * 0.12], [x - s * 0.06, y + s * 0.24], [x + s * 0.06, y + s * 0.24]], C.black!, { sw: 0 });
  return o;
}

/** 旗子：旗杆底 (gx, gy, z)，高度 h，旗面宽 fw、高 fh，可画骷髅 */
export function flag(gx: number, gy: number, z: number, h: number, fw: number, fh: number, color: string, withSkull = false, trim?: string): string {
  const b = P(gx, gy, z);
  const t: Pt = [b[0], b[1] - h];
  let s = line(b, t, C.woodDD!, 2.6);
  s += line(b, t, C.woodL!, 1, 0.7);
  const x0 = t[0] + 1;
  const y0 = t[1] + 1;
  const d = `M${f(x0)},${f(y0)} Q${f(x0 + fw * 0.3)},${f(y0 - fh * 0.2)} ${f(x0 + fw * 0.6)},${f(y0 + fh * 0.05)} T${f(x0 + fw)},${f(y0 + fh * 0.1)} L${f(x0 + fw * 0.9)},${f(y0 + fh * 0.55)} L${f(x0 + fw)},${f(y0 + fh)} Q${f(x0 + fw * 0.7)},${f(y0 + fh * 0.8)} ${f(x0 + fw * 0.5)},${f(y0 + fh * 0.97)} T${f(x0)},${f(y0 + fh)} Z`;
  s += path(d, color, { sw: 1.8 });
  if (trim) s += line([x0 + 1, y0 + fh - 1], [x0 + fw - 1, y0 + fh + 0], trim, 1.6, 0.9);
  if (withSkull) s += skull(x0 + fw * 0.45, y0 + fh * 0.45, Math.min(fw, fh) * 0.55, false);
  s += ell(t[0], t[1] - 1, 2.4, 2.4, C.gold!, { sw: 1.2 });
  return s;
}

/** 脚下柔和椭圆阴影（偏向右下，光从左上来） */
export function shadow(rx: number, ry: number, dx = 0, dy = 0, op = 0.38): string {
  const g = uid('sh');
  return (
    `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#0b1a2a" stop-opacity="${op}"/><stop offset="0.65" stop-color="#0b1a2a" stop-opacity="${op * 0.7}"/><stop offset="1" stop-color="#0b1a2a" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="${f(dx)}" cy="${f(dy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${g})"/>`
  );
}

/** 不分级的外壳（特效、图标：火焰、爆炸、技能要保持鲜艳） */
function wrapRaw(w: number, h: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}
/** 素材外壳：里面的颜色统一过一遍配色分级（降饱和、拉开明暗、亮面暖暗面冷，见 grade.ts） */
export function wrap(w: number, h: number, inner: string): string {
  return gradeSvg(wrapRaw(w, h, inner));
}

/** 把一张图放进可平移的 <g>（合成大图用）：去掉外层 svg 标签 */
export function inner(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

/** 标准化一张以原点为中心画的素材 */
export function piece(key: string, w: number, h: number, ax: number, ay: number, body: string): ArtPiece {
  return { key, svg: wrap(w, h, `<g transform="translate(${ax} ${ay})">${body}</g>`), w, h, ax, ay };
}
/** 同 piece，但不做配色分级 */
export function pieceRaw(key: string, w: number, h: number, ax: number, ay: number, body: string): ArtPiece {
  return { key, svg: wrapRaw(w, h, `<g transform="translate(${ax} ${ay})">${body}</g>`), w, h, ax, ay };
}
