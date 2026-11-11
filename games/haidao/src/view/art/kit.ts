/** 画图小工具：等距投影下的方盒、屋顶、圆柱、圆锥、炮管、旗子……所有素材共用。 */
import { PALETTE as C } from './palette.ts';
import { gradeSvg, outlineOf } from './grade.ts';
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
export const SW = 2;

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
export const lighten = (c: string, t: number): string => mix(c, '#ffffff', t);
export const darken = (c: string, t: number): string => mix(c, '#1a0f2a', t);

/** 一种材质：顶面最亮、左面居中、右面最暗（光从左上来） */
export interface Mat {
  t: string;
  l: string;
  r: string;
  line: string;
}
export function mat(base: string): Mat {
  return { t: lighten(base, 0.28), l: base, r: darken(base, 0.3), line: darken(base, 0.55) };
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

export type Tex = '' | 'h' | 'v' | 'brick';

/** 方盒：占 [x0,x1]×[y0,y1] 格、高度 z0..z1 像素；可见三面（左前、右前、顶） */
export function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, m: Mat, tex: Tex = '', sw = SW): string {
  const L = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
  const R = [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)];
  const T = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  let s = poly(R, m.r, { sw }) + poly(L, m.l, { sw }) + poly(T, m.t, { sw });
  // 材质（木纹、石头斑驳青苔、锈迹）和光照（左面偏暖、右面偏冷、下沿暗角）
  s += wear(R, m.r, 'R') + wear(L, m.l, 'L') + wear(T, m.t, 'T');
  if (tex) {
    const lc = m.line;
    const lp = (u: number, z: number): Pt => P(x0 + (x1 - x0) * u, y1, z);
    const rp = (u: number, z: number): Pt => P(x1, y1 + (y0 - y1) * u, z);
    const step = tex === 'v' ? 0 : tex === 'brick' ? 8 : 7;
    if (step) {
      for (let z = z0 + step; z < z1 - 1; z += step) {
        s += line(lp(0, z), lp(1, z), lc, 1, 0.45) + line(rp(0, z), rp(1, z), lc, 1, 0.55);
      }
    }
    if (tex === 'v') {
      const nl = Math.max(2, Math.round((x1 - x0) * 5));
      const nr = Math.max(2, Math.round((y1 - y0) * 5));
      for (let i = 1; i < nl; i++) s += line(lp(i / nl, z0 + 1), lp(i / nl, z1 - 1), lc, 1, 0.4);
      for (let i = 1; i < nr; i++) s += line(rp(i / nr, z0 + 1), rp(i / nr, z1 - 1), lc, 1, 0.5);
    }
    if (tex === 'brick') {
      const nl = Math.max(2, Math.round((x1 - x0) * 3));
      const nr = Math.max(2, Math.round((y1 - y0) * 3));
      let row = 0;
      for (let z = z0; z < z1 - 1; z += 8, row++) {
        const zt = Math.min(z + 8, z1);
        for (let i = 0; i < nl; i++) {
          const u = (i + (row % 2 ? 0.5 : 0)) / nl;
          if (u > 0 && u < 1) s += line(lp(u, z), lp(u, zt), lc, 1, 0.4);
        }
        for (let i = 0; i < nr; i++) {
          const u = (i + (row % 2 ? 0.5 : 0)) / nr;
          if (u > 0 && u < 1) s += line(rp(u, z), rp(u, zt), lc, 1, 0.5);
        }
      }
    }
  }
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
export function archR(x: number, yc: number, hw: number, za: number, zs: number, ah: number): Pt[] {
  const a: Pt[] = [P(x, yc + hw, za)];
  for (let i = 0; i <= 8; i++) {
    const t = Math.PI - (Math.PI * i) / 8;
    a.push(P(x, yc - hw * Math.cos(t), zs + ah * Math.sin(t)));
  }
  a.push(P(x, yc - hw, za));
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
  let s = poly([b, c, ap], m.r) + poly([a, b, ap], m.l);
  if (tiles) {
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const la = mixPt(a, ap, t);
      const lb = mixPt(b, ap, t);
      const lc = mixPt(c, ap, t);
      s += line(la, lb, m.line, 1, 0.35) + line(lb, lc, m.line, 1, 0.45);
    }
  }
  return s;
}
function mixPt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 两坡屋顶：屋脊沿 gx 方向 */
export function gable(x0: number, y0: number, x1: number, y1: number, z: number, h: number, m: Mat, wall: Mat, over = 0.1): string {
  const cy = (y0 + y1) / 2;
  const gEnd = poly([P(x1, y0, z), P(x1, y1, z), P(x1, cy, z + h)], wall.r);
  const front = [P(x0 - over, y1 + over, z), P(x1 + over, y1 + over, z), P(x1 + over, cy, z + h), P(x0 - over, cy, z + h)];
  let s = gEnd + poly(front, m.l);
  const n = Math.max(3, Math.round((x1 - x0) * 5));
  for (let i = 1; i < n; i++) {
    const x = x0 - over + ((x1 - x0 + over * 2) * i) / n;
    s += line(P(x, y1 + over, z), P(x, cy, z + h), m.line, 1, 0.4);
  }
  s += line(P(x0 - over, cy, z + h), P(x1 + over, cy, z + h), m.t, 2);
  return s;
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
  s += wear([[x - rx, yb + ry], [x + rx, yb + ry], [x + rx, yt], [x - rx, yt]], m.l, 'L', { d: body });
  s += path(body, 'none', { sw, stroke: outlineOf(m.l, OUT) });
  for (let i = 1; i <= bands; i++) {
    const yy = yt + ((yb - yt) * i) / (bands + 1);
    s += path(`M${f(x - rx)},${f(yy)} A${f(rx)},${f(ry)} 0 0 0 ${f(x + rx)},${f(yy)}`, 'none', { stroke: m.line, sw: 1.2, op: 0.55 });
  }
  s += ell(x, yt, rx, ry, m.t, { sw });
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
  let s = path(`M${f(x - r)},${f(yb)} L${f(x)},${f(ya)} L${f(x + r)},${f(yb)} A${f(r)},${f(ry)} 0 0 1 ${f(x - r)},${f(yb)} Z`, m.l);
  s += path(`M${f(x + r * 0.15)},${f(ya + h * 0.04)} L${f(x + r)},${f(yb)} A${f(r)},${f(ry)} 0 0 1 ${f(x)},${f(yb + ry)} Z`, m.r, { sw: 0 });
  s += path(`M${f(x - r)},${f(yb)} L${f(x)},${f(ya)} L${f(x + r)},${f(yb)} A${f(r)},${f(ry)} 0 0 1 ${f(x - r)},${f(yb)} Z`, 'none');
  return s;
}

/** 一根粗管子（炮管、枪管）：从 a 到 b，粗细 w1→w2 */
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
  let s = poly(p, fill);
  if (hi) {
    const k = 0.25;
    s += line(
      [a[0] + nx * w1 * k * -1 - nx * 0, a[1] + ny * w1 * k * -1],
      [b[0] + nx * w2 * k * -1, b[1] + ny * w2 * k * -1],
      hi,
      Math.max(1, Math.min(w1, w2) * 0.22),
      0.85,
    );
  }
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
export function wrapRaw(w: number, h: number, inner: string): string {
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
