/** 五种兵 × 四个姿势（朝右，Q 版大头）。脚底是锚点。 */
import type { TroopKind } from '../../core/types.ts';
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { OUT, darken, ell, f, lighten, line, mix, path, piece, poly, rect, shadow, skull, tube } from './kit.ts';

type Pose = 'idle' | 'walk1' | 'walk2' | 'attack';

let BLINK = false;

export interface PoseData {
  bob: number;
  ff: Pt; // 前脚
  bf: Pt; // 后脚
  lean: number;
  fh: Pt; // 前手（持武器）相对肩
  bh: Pt; // 后手
}
const POSES: Record<Pose, PoseData> = {
  idle: { bob: 0, ff: [5, 0], bf: [-4, 0], lean: 0, fh: [6, 8], bh: [-5, 9] },
  walk1: { bob: -1.6, ff: [8, 0], bf: [-6, -3.5], lean: 1, fh: [-1, 9], bh: [6, 7] },
  walk2: { bob: -1.6, ff: [3, -3.5], bf: [-8, 0], lean: 1, fh: [10, 6], bh: [-6, 9] },
  attack: { bob: 0, ff: [9, 0], bf: [-6, 0], lean: 3, fh: [13, 1], bh: [-3, 8] },
};

export const limb = (a: Pt, b: Pt, w: number, c: string): string =>
  line(a, b, OUT, w + 2.6) + line(a, b, c, w);

export interface Look {
  scale: number;
  skin: string;
  pants: string;
  boot: string;
  shirt: string;
  half: number; // 躯干半宽
  top: number; // 躯干顶（负值）
  head: number; // 头半径
}

function body(look: Look, p: PoseData, deco: (x: number, y: number) => string): string {
  const b = p.bob;
  let o = '';
  const hipY = -11 + b;
  // 后腿、前腿
  o += limb([-2.5 + p.lean * 0.3, hipY], [p.bf[0], p.bf[1] - 1.5], 5, look.pants);
  o += ell(p.bf[0] + 1.2, p.bf[1] - 0.6, 4.6, 2.8, look.boot, { sw: 1.6 });
  o += limb([2.5 + p.lean * 0.3, hipY], [p.ff[0], p.ff[1] - 1.5], 5, look.pants);
  o += ell(p.ff[0] + 1.6, p.ff[1] - 0.6, 5, 3, look.boot, { sw: 1.6 });
  return o + torsoShape(look, p, deco);
}

/** 躯干（不含腿）：分件骨架的身体部件也用它 */
export function torsoShape(look: Look, p: PoseData, deco: (x: number, y: number) => string): string {
  const b = p.bob;
  let o = '';
  const hipY = -11 + b;
  const h = look.half;
  const x0 = p.lean - h;
  const x1 = p.lean + h;
  const yt = look.top + b;
  o += path(`M${f(x0)},${f(hipY + 1)} L${f(x0 - 0.5)},${f(yt + 3)} Q${f(p.lean)},${f(yt - 2)} ${f(x1 + 0.5)},${f(yt + 3)} L${f(x1)},${f(hipY + 1)} Q${f(p.lean)},${f(hipY + 4)} ${f(x0)},${f(hipY + 1)} Z`, look.shirt, { sw: 2 });
  o += path(`M${f(p.lean + h * 0.35)},${f(yt + 1)} L${f(x1 + 0.5)},${f(yt + 3)} L${f(x1)},${f(hipY + 1)} Q${f(p.lean + h * 0.6)},${f(hipY + 3)} ${f(p.lean + h * 0.35)},${f(hipY + 2)} Z`, darken(look.shirt, 0.25), { sw: 0, op: 0.9 });
  o += deco(p.lean, yt);
  return o;
}

export function head(look: Look, p: PoseData, hy: number, mouthOpen: boolean, extra = '', blink = BLINK): string {
  const r = look.head;
  const cx = p.lean + 1;
  const cy = hy + p.bob;
  let o = '';
  o += ell(cx - r + 1.5, cy + 1.5, 2.4, 3.2, look.skin, { sw: 1.6 }); // 后耳
  o += ell(cx, cy, r, r * 0.96, look.skin, { sw: 2 });
  o += `<path d="M${f(cx + r * 0.4)},${f(cy - r * 0.9)} A${f(r)},${f(r)} 0 0 1 ${f(cx + r * 0.5)},${f(cy + r * 0.85)} Q${f(cx + r * 0.9)},${f(cy)} ${f(cx + r * 0.4)},${f(cy - r * 0.9)}Z" fill="${darken(look.skin, 0.12)}" opacity="0.6"/>`;
  // 眼
  const ex = cx + r * 0.42;
  const ey = cy - r * 0.05;
  if (blink) {
    o += path(`M${f(ex - 2.8)},${f(ey + 0.6)} q2.8,2 5.6,0`, 'none', { stroke: '#241410', sw: 1.8 }) + path(`M${f(ex - r * 0.7 - 2.4)},${f(ey + 1.6)} q2.4,1.8 4.8,0`, 'none', { stroke: '#241410', sw: 1.6 });
  } else {
    o += ell(ex, ey, 2.7, 3.3, '#ffffff', { sw: 1.4 }) + ell(ex + 0.9, ey + 0.2, 1.4, 1.9, '#241410', { sw: 0 }) + ell(ex + 1.3, ey - 0.6, 0.5, 0.5, '#fff', { sw: 0 });
    o += ell(ex - r * 0.7, ey + 1, 2.4, 3, '#ffffff', { sw: 1.2 }) + ell(ex - r * 0.7 + 0.8, ey + 1.2, 1.1, 1.7, '#241410', { sw: 0 });
  }
  o += ell(cx + r * 0.55, cy + r * 0.42, 2.2, 1.3, '#f08a78', { sw: 0, op: 0.8 });
  if (mouthOpen) o += path(`M${f(cx + r * 0.25)},${f(cy + r * 0.5)} q${f(r * 0.3)},${f(r * 0.5)} ${f(r * 0.6)},0 z`, '#7a1f1f', { sw: 1.2 });
  else o += path(`M${f(cx + r * 0.2)},${f(cy + r * 0.52)} q${f(r * 0.3)},${f(r * 0.22)} ${f(r * 0.6)},-1`, 'none', { stroke: '#7a3a2a', sw: 1.4 });
  return o + extra;
}

function arm(from: Pt, to: Pt, sleeve: string, skin: string): string {
  return limb(from, to, 4.2, sleeve) + ell(to[0], to[1], 2.9, 2.9, skin, { sw: 1.5 });
}

export function blade(h: Pt, tip: Pt, w: number, gold = false, curve = 0): string {
  const dx = tip[0] - h[0];
  const dy = tip[1] - h[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * w;
  const ny = (dx / l) * w;
  const cx = (h[0] + tip[0]) / 2 + (-dy / l) * curve * -1;
  const cy = (h[1] + tip[1]) / 2 + (dx / l) * curve * -1;
  let o = curve
    ? path(`M${f(h[0] + nx)},${f(h[1] + ny)} Q${f(cx + nx)},${f(cy + ny)} ${f(tip[0])},${f(tip[1])} Q${f(cx - nx)},${f(cy - ny)} ${f(h[0] - nx)},${f(h[1] - ny)} Z`, '#dfe8f0', { sw: 1.6 })
    : poly([[h[0] + nx, h[1] + ny], [tip[0], tip[1]], [h[0] - nx, h[1] - ny]], '#dfe8f0', { sw: 1.6 });
  o += line(h, [tip[0] - dx * 0.1, tip[1] - dy * 0.1], '#ffffff', 0.9, 0.9);
  const gx = (-dy / l) * (w + 2.4);
  const gy = (dx / l) * (w + 2.4);
  o += line([h[0] + gx, h[1] + gy], [h[0] - gx, h[1] - gy], gold ? C.gold! : C.goldD!, 2.6);
  return o;
}

export const LOOKS: Record<TroopKind, Look> = {
  sailor: { scale: 1.56, skin: '#f3b98a', pants: '#f0e8d4', boot: '#5a3a22', shirt: '#fefefe', half: 6.6, top: -24, head: 9.5 },
  gunner: { scale: 1.56, skin: '#f0b080', pants: '#5a4634', boot: '#3b2a1e', shirt: '#3fa34f', half: 6.8, top: -24, head: 9.5 },
  brute: { scale: 2.0, skin: '#b9773f', pants: '#6a4a2a', boot: '#3b2a1e', shirt: '#e0955e', half: 12.5, top: -28, head: 11 },
  bomber: { scale: 1.42, skin: '#f3b98a', pants: '#7a4a2a', boot: '#2e2430', shirt: '#ff8a1f', half: 6.2, top: -23, head: 10 },
  medic: { scale: 1.56, skin: '#f3b98a', pants: '#e8e2d0', boot: '#5a3a22', shirt: '#fdfdfd', half: 6.8, top: -24, head: 9.5 },
  cannoneer: { scale: 1.9, skin: '#e7a574', pants: '#2c3e6a', boot: '#2a1a14', shirt: '#3a5aa0', half: 9.2, top: -26, head: 10.2 },
  harpooner: { scale: 1.56, skin: '#f0b080', pants: '#3b5a7a', boot: '#2a2a30', shirt: '#f2c230', half: 7, top: -24, head: 9.5 },
  captain: { scale: 1.7, skin: '#f0b080', pants: '#2c3e6a', boot: '#2a1a14', shirt: '#ff3a2e', half: 7.8, top: -25, head: 9.5 },
  grenadier: { scale: 1.5, skin: '#f0b080', pants: '#3a4a3a', boot: '#2a1a14', shirt: '#5a7a4a', half: 6.8, top: -24, head: 9.5 },
  shield: { scale: 1.6, skin: '#e7a574', pants: '#7a6a52', boot: '#3a2a1e', shirt: '#9a6a3c', half: 7.4, top: -24, head: 9.6 },
};

/**
 * 大木盾（正面，中心在原点，宽 w 高 h）：竖木板拼成、两道铁箍、铁包边、中心一枚铁盔钉。
 * 整张帧里举在前手前面；分件骨架里是单独一个部件（rigparts.ts 的 shield），按 gx / gy 朝向换边。
 */
export function woodShield(w = 22, h = 28): string {
  const a = w / 2;
  const b = h / 2;
  const body = `M${f(-a)},${f(-b + 5)} Q${f(-a)},${f(-b)} ${f(-a + 5)},${f(-b)} L${f(a - 5)},${f(-b)} Q${f(a)},${f(-b)} ${f(a)},${f(-b + 5)} L${f(a)},${f(b - 8)} Q${f(a)},${f(b - 2)} 0,${f(b)} Q${f(-a)},${f(b - 2)} ${f(-a)},${f(b - 8)} Z`;
  let o = path(body, '#b07a3c', { sw: 2.4 });
  for (const x of [-a / 3, a / 3]) o += line([x, -b + 1.5], [x, b - 3], '#7a4f24', 1.2, 0.8);
  o += line([-a / 1.5, -b + 3], [-a / 1.5, b - 6], '#d6a05a', 1.1, 0.7);
  for (const y of [-b * 0.45, b * 0.4]) o += rect(-a + 0.6, y - 1.7, w - 1.2, 3.4, '#5a626e', { sw: 1.2 }) + ell(-a + 3, y, 0.9, 0.9, '#cfd6de', { sw: 0 }) + ell(a - 3, y, 0.9, 0.9, '#cfd6de', { sw: 0 });
  o += path(body, 'none', { stroke: '#6a7480', sw: 1.8 });
  o += ell(0, -b * 0.02, 4.6, 4.6, '#8f9aa8', { sw: 1.8 }) + ell(-1.2, -b * 0.02 - 1.4, 1.6, 1.2, '#e8eef4', { sw: 0 });
  return o;
}

/**
 * 每个兵种身上的装饰（和姿势无关的那部分）：背上的东西、衣服上的花样、长衣摆、脸上的胡子眼罩、帽子。
 * 整张帧（下面的 sailor()…，图标和远景用）和分件骨架的部件（rigparts.ts）共用这一份，改兵的外观只改这里和武器。
 * 坐标同整张帧：脚底为原点、朝右；lean、b 是身体的前倾和起伏，cx、cy 是头的中心。
 */
export interface TroopDeco {
  /** 头中心的高度 */
  headY: number;
  /** 背上的东西（画在身体后面）；swing = 披风往后飘的量 */
  back?: (lean: number, b: number, swing: number) => string;
  torso: (x: number, yt: number, b: number) => string;
  /** 盖在腿上的长衣摆（sk = 两脚张开的程度） */
  coat?: (lean: number, b: number, sk: number) => string;
  /** 脸上的东西（胡子、眉毛、眼罩、乱发），属于头 */
  face?: (cx: number, cy: number) => string;
  /** 帽子、头巾（倒下时会单独飞出去） */
  hat?: (cx: number, cy: number) => string;
}

export const DECO: Record<TroopKind, TroopDeco> = {
  sailor: {
    headY: -33,
    torso: (x, yt, b) => {
      let s = '';
      for (let i = 0; i < 3; i++) s += rect(x - 6.4, yt + 3.5 + i * 4.4, 12.8, 2.1, C.blue!, { sw: 0, op: 0.95 });
      s += rect(x - 7, -13 + b, 14, 3, '#7a4a28', { sw: 1.4 }) + rect(x - 1.5, -13.4 + b, 3, 3.6, C.gold!, { sw: 0.8 });
      return s;
    },
    hat: (cx, cy) => {
      let s = path(`M${f(cx - 9.6)},${f(cy - 2.2)} A9.6,9.4 0 0 1 ${f(cx + 9.6)},${f(cy - 2.4)} Q${f(cx)},${f(cy - 6)} ${f(cx - 9.6)},${f(cy - 2.2)} Z`, C.red!, { sw: 2 });
      s += path(`M${f(cx - 9)},${f(cy - 3)} q-8,-2 -9,5 q5,-2 7,-1 Z`, C.red!, { sw: 1.8 });
      s += ell(cx - 2, cy - 7.2, 1, 1, '#fff', { sw: 0 }) + ell(cx + 3, cy - 6.6, 1, 1, '#fff', { sw: 0 });
      return s;
    },
  },
  gunner: {
    headY: -33,
    torso: (x, _yt, b) => {
      let s = '';
      s += path(`M${f(x - 6)},${f(-23 + b)} L${f(x)},${f(-13 + b)} L${f(x + 6)},${f(-23 + b)}`, 'none', { stroke: '#f4e3b8', sw: 3 });
      for (let i = 0; i < 3; i++) s += ell(x + 0.5, -21 + i * 3 + b, 1, 1, C.gold!, { sw: 0 });
      s += rect(x - 7, -13 + b, 14, 3, '#3b2a1e', { sw: 1.4 });
      return s;
    },
    hat: (cx, cy) => {
      let s = path(`M${f(cx - 13)},${f(cy - 3)} Q${f(cx)},${f(cy - 8)} ${f(cx + 13)},${f(cy - 3)} L${f(cx + 7)},${f(cy - 9)} Q${f(cx)},${f(cy - 15)} ${f(cx - 8)},${f(cy - 9)} Z`, '#2c2c3a', { sw: 2 });
      s += path(`M${f(cx - 12)},${f(cy - 3.6)} Q${f(cx)},${f(cy - 8.6)} ${f(cx + 12)},${f(cy - 3.6)}`, 'none', { stroke: C.gold!, sw: 1.6 });
      s += ell(cx + 1, cy - 9, 1.8, 1.8, C.cream!, { sw: 0 });
      return s;
    },
  },
  brute: {
    headY: -37,
    torso: (x, yt, b) => {
      const L = LOOKS.brute;
      let s = path(`M${f(x - 5)},${f(yt + 6)} q5,4 10,0`, 'none', { stroke: darken(L.skin, 0.3), sw: 1.4 });
      s += rect(x - 10, -14 + b, 20, 4, '#5a3a22', { sw: 1.6 }) + rect(x - 2.5, -14.4 + b, 5, 4.8, C.gold!, { sw: 1 });
      s += ell(x + 3, yt + 8, 2, 1.2, darken(L.skin, 0.2), { sw: 0, op: 0.6 }) + ell(x - 3, yt + 8, 2, 1.2, darken(L.skin, 0.2), { sw: 0, op: 0.6 });
      // 宽阔的肩：皮质护肩 + 斜挎的胸带
      const sh: Pt = [x + 8.5, -24 + b];
      const bsh: Pt = [x - 8.5, -24 + b];
      // 胸带用浅皮色加深色描边：壮汉棕皮肤配棕衣，贴着棕红屋瓦时这一道亮斜线让人一眼认出（深棕会和衣服糊在一起）
      s += path(`M${f(x - 11)},${f(-27 + b)} L${f(x + 10)},${f(-12 + b)}`, 'none', { stroke: '#2a1a12', sw: 5.2 });
      s += path(`M${f(x - 11)},${f(-27 + b)} L${f(x + 10)},${f(-12 + b)}`, 'none', { stroke: '#f2dca8', sw: 3 });
      s += ell(bsh[0] - 1, bsh[1] + 0.5, 7.4, 5.4, '#5a3a22', { sw: 1.8 }) + ell(sh[0] + 1, sh[1] + 0.5, 8.2, 5.8, '#6a4528', { sw: 1.8 });
      for (const q of [sh, bsh]) s += ell(q[0], q[1] - 1, 1.2, 1.2, C.gold!, { sw: 0 });
      return s;
    },
    face: (cx, cy) => {
      // 光头 + 络腮胡 + 粗眉
      let s = path(`M${f(cx - 8)},${f(cy + 2)} Q${f(cx - 6)},${f(cy + 13)} ${f(cx + 2)},${f(cy + 13)} Q${f(cx + 10)},${f(cy + 12)} ${f(cx + 10)},${f(cy + 3)} Q${f(cx + 6)},${f(cy + 6)} ${f(cx + 2)},${f(cy + 5)} Q${f(cx - 4)},${f(cy + 6)} ${f(cx - 8)},${f(cy + 2)} Z`, '#2a1c14', { sw: 1.8 });
      s += path(`M${f(cx - 2)},${f(cy - 9)} q5,-2 9,2`, 'none', { stroke: '#fff', sw: 1.6, op: 0.6 });
      s += line([cx + 1, cy - 5.5], [cx + 8, cy - 3.4], '#2a1c14', 2.4);
      return s;
    },
  },
  bomber: {
    headY: -31,
    back: (lean, b) => {
      // 背后的火药桶：木桶 + 铁箍 + 骷髅，桶顶一根点着的引信
      const kx = lean - 11;
      const ky = -21 + b;
      let s = rect(kx - 6.4, ky - 8.4, 12.8, 16.8, '#8a5a30', { sw: 2, r: 3.4 }) + rect(kx - 6.4, ky - 4.6, 12.8, 2, '#2e2a30', { sw: 0 }) + rect(kx - 6.4, ky + 3, 12.8, 2, '#2e2a30', { sw: 0 });
      s += ell(kx, ky - 8.4, 6.4, 2.2, '#b07a46', { sw: 1.6 }) + skull(kx, ky, 3.6, false);
      s += path(`M${f(kx + 1)},${f(ky - 9.6)} q-1,-5 3,-7`, 'none', { stroke: C.creamD!, sw: 1.6 });
      s += poly([[kx + 4, ky - 21], [kx + 5.2, ky - 18], [kx + 8, ky - 17], [kx + 5.2, ky - 15.6], [kx + 4, ky - 13], [kx + 2.8, ky - 15.6], [kx, ky - 17], [kx + 2.8, ky - 18]], C.fireL!, { sw: 0.9 });
      return s;
    },
    torso: (x, _yt, b) => {
      let s = '';
      // 炸药捆
      for (let i = 0; i < 3; i++) s += rect(x - 6 + i * 4.2, -22 + b, 3.6, 9, C.red!, { sw: 1.3 }) + rect(x - 5.4 + i * 4.2, -22.6 + b, 2.4, 1.6, '#f5e1a6', { sw: 0 });
      s += rect(x - 7, -17 + b, 14, 2.6, '#3b2a1e', { sw: 1.3 });
      return s;
    },
    // 乱发
    face: (cx, cy) => poly([[cx - 9, cy - 2], [cx - 11, cy - 10], [cx - 5, cy - 8], [cx - 4, cy - 15], [cx + 1, cy - 9], [cx + 6, cy - 14], [cx + 7, cy - 7], [cx + 12, cy - 8], [cx + 9, cy - 1], [cx + 4, cy - 5], [cx - 4, cy - 5]], '#e8541c', { sw: 1.8 }),
    // 护目镜
    hat: (cx, cy) => rect(cx - 9.4, cy - 4.4, 19, 3, '#3b2a1e', { sw: 1.2 }) + ell(cx + 4, cy - 1.6, 4, 4, '#ffd23f', { sw: 1.8 }) + ell(cx + 5, cy - 2.4, 1.2, 1.2, '#fff', { sw: 0 }) + ell(cx - 3, cy - 1.6, 3.6, 3.6, '#ffb52a', { sw: 1.8 }),
  },
  grenadier: {
    headY: -33,
    torso: (x, _yt, b) => {
      // 斜挎的雷带：三颗手雷挂在胸前，腰上一条宽皮带
      let s = path(`M${f(x - 6.4)},${f(-23 + b)} L${f(x + 6.4)},${f(-13 + b)}`, 'none', { stroke: '#3b2a1e', sw: 3.4 });
      for (let i = 0; i < 3; i++) {
        const gx = x - 3.6 + i * 3.8;
        const gy = -20.4 + i * 2.9 + b;
        s += ell(gx, gy, 2.1, 2.3, '#2a2b36', { sw: 1.2 }) + rect(gx - 0.7, gy - 4, 1.4, 1.8, C.gold!, { sw: 0.6 });
      }
      s += rect(x - 7, -13 + b, 14, 3, '#3b2a1e', { sw: 1.4 }) + rect(x - 1.5, -13.4 + b, 3, 3.6, C.gold!, { sw: 0.8 });
      return s;
    },
    // 钢盔：圆顶 + 铜箍 + 护颈檐
    hat: (cx, cy) => {
      let s = path(`M${f(cx - 10.4)},${f(cy - 1.6)} A10.4,10 0 0 1 ${f(cx + 10.4)},${f(cy - 2)} L${f(cx + 12.6)},${f(cy - 0.4)} L${f(cx - 11.8)},${f(cy - 0.2)} Z`, '#6a7480', { sw: 2 });
      s += path(`M${f(cx - 10)},${f(cy - 2.8)} Q${f(cx)},${f(cy - 5.4)} ${f(cx + 10)},${f(cy - 3.2)}`, 'none', { stroke: '#c9893a', sw: 2 });
      s += ell(cx - 3, cy - 8, 3.4, 1.6, '#a9b4c0', { sw: 0, op: 0.8 });
      return s;
    },
  },
  shield: {
    headY: -33,
    torso: (x, yt, b) => {
      // 皮甲背心 + 胸前一块铁护心镜 + 宽皮带
      let s = path(`M${f(x - 5.4)},${f(yt + 2)} L${f(x - 5.4)},${f(-13 + b)} M${f(x + 5.4)},${f(yt + 2)} L${f(x + 5.4)},${f(-13 + b)}`, 'none', { stroke: '#4a3424', sw: 2.2 });
      s += ell(x + 0.5, yt + 8, 4.6, 4, '#a7b2bf', { sw: 1.6 }) + ell(x - 0.6, yt + 6.6, 1.5, 1, '#e8eef4', { sw: 0 });
      s += rect(x - 7.4, -13 + b, 14.8, 3.2, '#3b2a1e', { sw: 1.4 }) + rect(x - 1.5, -13.4 + b, 3, 3.8, '#cfd6de', { sw: 0.8 });
      // 肩上的铁护肩
      s += ell(x - 7, yt + 3, 3.8, 3, '#8f9aa8', { sw: 1.5 }) + ell(x + 7.4, yt + 3, 4, 3.2, '#a7b2bf', { sw: 1.5 });
      return s;
    },
    // 铁桶盔：直筒 + 鼻梁护条 + 额前一道铁箍
    hat: (cx, cy) => {
      let s = path(`M${f(cx - 10.2)},${f(cy + 2)} L${f(cx - 10.2)},${f(cy - 3)} A10.2,9.6 0 0 1 ${f(cx + 10.2)},${f(cy - 3.4)} L${f(cx + 10.2)},${f(cy + 2)} L${f(cx + 6)},${f(cy + 2)} L${f(cx + 6)},${f(cy - 1)} L${f(cx - 6)},${f(cy - 1)} L${f(cx - 6)},${f(cy + 2)} Z`, '#8f9aa8', { sw: 2 });
      s += rect(cx - 10.4, cy - 4.4, 20.8, 2.6, '#5a626e', { sw: 0 });
      s += rect(cx + 3.6, cy - 4, 3, 8.6, '#a7b2bf', { sw: 1.2 });
      s += ell(cx - 3.4, cy - 8.4, 3.2, 1.5, '#e8eef4', { sw: 0, op: 0.8 });
      return s;
    },
  },
  captain: {
    headY: -33,
    // 披风（背后，向左飘）
    back: (lean, b, wave) => path(`M${f(lean - 4)},${f(-24 + b)} Q${f(lean - 16 + wave)},${f(-18)} ${f(lean - 15 + wave)},${f(-3)} L${f(lean - 8)},${f(-6 + b)} L${f(lean - 2)},${f(-12 + b)} Z`, '#8f1f27', { sw: 2 }),
    torso: (x, yt, b) => {
      let s = '';
      s += path(`M${f(x - 1)},${f(yt + 2)} L${f(x - 1)},${f(-11 + b)}`, 'none', { stroke: C.goldD!, sw: 1.4 });
      for (let i = 0; i < 3; i++) s += ell(x + 2.4, yt + 4 + i * 3.8, 1.3, 1.3, C.gold!, { sw: 0.8 });
      s += path(`M${f(x - 7)},${f(yt + 2.5)} L${f(x + 7)},${f(yt + 2.5)}`, 'none', { stroke: C.gold!, sw: 1.8 });
      s += rect(x - 7.4, -14 + b, 14.8, 3.2, '#2a1a14', { sw: 1.4 }) + rect(x - 2, -14.4 + b, 4, 4, C.gold!, { sw: 1 });
      return s;
    },
    coat: (lean, b, sk) => {
      // 长外套下摆（盖到膝盖）+ 腰间佩剑的剑鞘
      let s = path(`M${f(lean - 8.6)},${f(-11.5 + b)} L${f(lean - 11.4 - sk)},${f(-2.4)} Q${f(lean)},${f(1.6)} ${f(lean + 11.8 + sk)},${f(-2.8)} L${f(lean + 8.6)},${f(-11.5 + b)} Z`, darken('#ff3a2e', 0.25), { sw: 1.8 });
      s += line([lean - 10.6 - sk, -3.4], [lean + 10.8 + sk, -3.6], C.gold!, 1.6) + line([lean + 1, -11 + b], [lean + 2, -3], darken('#ff3a2e', 0.5), 1.2, 0.7);
      s += line([lean - 5, -12.5 + b], [lean - 17, -1.5], OUT, 4.4) + line([lean - 5, -12.5 + b], [lean - 17, -1.5], '#3a2418', 2.4) + ell(lean - 17.4, -1.2, 1.8, 1.8, C.gold!, { sw: 0.8 });
      s += line([lean - 7, -15.5 + b], [lean - 3, -11 + b], C.gold!, 2.6);
      return s;
    },
    // 胡子、眼罩
    face: (cx, cy) =>
      path(`M${f(cx - 6)},${f(cy + 6)} Q${f(cx)},${f(cy + 13)} ${f(cx + 8)},${f(cy + 7)} Q${f(cx + 4)},${f(cy + 7)} ${f(cx + 1)},${f(cy + 8)} Q${f(cx - 3)},${f(cy + 7)} ${f(cx - 6)},${f(cy + 6)} Z`, '#2a1c14', { sw: 1.6 }) +
      ell(cx + 4.2, cy - 0.4, 3.6, 3.8, '#1a1a22', { sw: 1.2 }) + line([cx - 5, cy - 6], [cx + 4, cy - 2], '#1a1a22', 1.2),
    hat: (cx, cy) => {
      // 大三角帽 + 骷髅 + 羽毛
      let s = path(`M${f(cx - 17)},${f(cy - 4)} Q${f(cx - 4)},${f(cy - 8)} ${f(cx + 17)},${f(cy - 5)} L${f(cx + 10)},${f(cy - 13)} Q${f(cx)},${f(cy - 21)} ${f(cx - 10)},${f(cy - 13)} Z`, '#2c2c3a', { sw: 2 });
      s += path(`M${f(cx - 16)},${f(cy - 4.6)} Q${f(cx - 4)},${f(cy - 8.6)} ${f(cx + 16)},${f(cy - 5.6)}`, 'none', { stroke: C.gold!, sw: 2 });
      s += ell(cx, cy - 12, 3.3, 3, C.cream!, { sw: 0 }) + rect(cx - 1.6, cy - 10, 3.2, 2, C.cream!, { sw: 0 }) + ell(cx - 1.2, cy - 12.4, 0.8, 0.8, '#222', { sw: 0 }) + ell(cx + 1.2, cy - 12.4, 0.8, 0.8, '#222', { sw: 0 });
      s += path(`M${f(cx - 9)},${f(cy - 14)} q-6,-8 -2,-14 q2,6 6,8 Z`, C.red!, { sw: 1.6 });
      return s;
    },
  },
  medic: {
    headY: -33,
    back: (lean, b) => {
      // 背后的白色急救背包：红十字 + 肩带
      const bx0 = lean - 15;
      return rect(bx0, -30 + b, 10, 15, '#f2f2f2', { sw: 2, r: 2.4 }) + rect(bx0 + 4, -26.5 + b, 2, 8, C.red!, { sw: 0 }) + rect(bx0 + 1, -23.5 + b, 8, 2, C.red!, { sw: 0 }) + line([bx0 + 8, -29 + b], [lean - 3, -22 + b], '#c8b890', 1.8);
    },
    torso: (x, yt, b) => {
      let s = rect(x - 5.6, yt + 3, 11.2, 12, '#fdfdfd', { sw: 1.4 });
      s += rect(x - 1, yt + 5, 2, 7, C.red!, { sw: 0 }) + rect(x - 3.5, yt + 7.5, 7, 2, C.red!, { sw: 0 });
      s += rect(x - 7, -13 + b, 14, 3, '#7a4a28', { sw: 1.4 });
      return s;
    },
    // 绷带（脸颊）
    face: (cx, cy) => rect(cx + 3, cy + 2, 6, 2.6, '#f4ead0', { sw: 1 }) + line([cx + 5, cy + 2], [cx + 5, cy + 4.6], '#c8b890', 0.8),
    // 白头巾 + 红十字
    hat: (cx, cy) =>
      path(`M${f(cx - 9.6)},${f(cy - 2)} A9.6,9.4 0 0 1 ${f(cx + 9.6)},${f(cy - 2.4)} Q${f(cx)},${f(cy - 6)} ${f(cx - 9.6)},${f(cy - 2)} Z`, '#fdfdfd', { sw: 2 }) +
      rect(cx - 0.9, cy - 11, 1.8, 6, C.red!, { sw: 0 }) + rect(cx - 3, cy - 8.8, 6, 1.8, C.red!, { sw: 0 }),
  },
  cannoneer: {
    headY: -35,
    torso: (x, yt, b) => {
      let s = rect(x - 9, -13 + b, 18, 3.4, '#2a1a14', { sw: 1.4 }) + rect(x - 2, -13.4 + b, 4, 4.2, C.gold!, { sw: 1 });
      for (let i = 0; i < 3; i++) s += ell(x + 2.6, yt + 4 + i * 4, 1.3, 1.3, C.gold!, { sw: 0 });
      s += line([x - 8, yt + 3], [x + 8, yt + 3], '#f2f2f2', 2);
      return s;
    },
    // 大黑胡子 + 粗眉
    face: (cx, cy) =>
      path(`M${f(cx - 9)},${f(cy + 1)} Q${f(cx - 8)},${f(cy + 15)} ${f(cx + 2)},${f(cy + 15)} Q${f(cx + 11)},${f(cy + 13)} ${f(cx + 11)},${f(cy + 2)} Q${f(cx + 6)},${f(cy + 6)} ${f(cx + 2)},${f(cy + 5)} Q${f(cx - 4)},${f(cy + 6)} ${f(cx - 9)},${f(cy + 1)} Z`, '#1c1410', { sw: 1.8 }) +
      line([cx + 1, cy - 5.5], [cx + 8, cy - 3.4], '#1c1410', 2.4),
    // 蓝头巾
    hat: (cx, cy) => path(`M${f(cx - 10)},${f(cy - 2)} A10,9.6 0 0 1 ${f(cx + 10)},${f(cy - 2.4)} Q${f(cx)},${f(cy - 6)} ${f(cx - 10)},${f(cy - 2)} Z`, '#2f5fb0', { sw: 2 }),
  },
  harpooner: {
    headY: -33,
    torso: (x, yt, b) => {
      let s = path(`M${f(x - 5)},${f(yt + 2)} L${f(x - 5)},${f(-12 + b)} M${f(x + 5)},${f(yt + 2)} L${f(x + 5)},${f(-12 + b)}`, 'none', { stroke: '#2a3a56', sw: 2 });
      s += rect(x - 6, -13 + b, 12, 2.6, '#6a4a2a', { sw: 1.2 });
      s += ell(x, yt + 9, 2, 2, '#fff', { sw: 0, op: 0.7 });
      return s;
    },
    hat: (cx, cy) => {
      // 渔夫雨帽（宽檐黄色）
      let s = path(`M${f(cx - 15)},${f(cy - 3)} Q${f(cx)},${f(cy - 8)} ${f(cx + 15)},${f(cy - 3)} Q${f(cx + 8)},${f(cy + 1)} ${f(cx)},${f(cy)} Q${f(cx - 8)},${f(cy + 1)} ${f(cx - 15)},${f(cy - 3)} Z`, '#f2c230', { sw: 2 });
      s += path(`M${f(cx - 9)},${f(cy - 5)} Q${f(cx)},${f(cy - 18)} ${f(cx + 9)},${f(cy - 5)} Z`, '#f7d34a', { sw: 2 });
      s += line([cx - 9, cy - 6], [cx + 9, cy - 6], '#2a3a56', 2);
      return s;
    },
  },
};

/** 一整张帧的身子和头（武器、手臂另画）：背上的东西、腿、躯干、长衣摆、头、脸、帽子 */
function dressed(kind: TroopKind, p: PoseData, atk: boolean, wave = 0): { back: string; front: string; cx: number; cy: number } {
  const L = LOOKS[kind];
  const D = DECO[kind];
  const back = D.back ? D.back(p.lean, p.bob, wave) : '';
  let o = body(L, p, (x, yt) => D.torso(x, yt, p.bob));
  if (D.coat) o += D.coat(p.lean, p.bob, (p.ff[0] - p.bf[0]) * 0.12);
  o += head(L, p, D.headY, atk);
  const cx = p.lean + 1;
  const cy = D.headY + p.bob;
  if (D.face) o += D.face(cx, cy);
  if (D.hat) o += D.hat(cx, cy);
  return { back, front: o, cx, cy };
}

function sailor(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.sailor;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 4.6, -21 + p.bob];
  const bsh: Pt = [p.lean - 4.6, -21 + p.bob];
  const d = dressed('sailor', p, atk);
  let o = '';
  const bh: Pt = [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, '#fefefe', L.skin);
  o += d.front;
  // 武器
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.2, '#fefefe');
  o += blade(hd, atk ? [hd[0] + 15, hd[1] - 12] : pose === 'idle' ? [hd[0] + 6, hd[1] - 15] : [hd[0] + 8, hd[1] - 12], 2.4, false, 4);
  o += ell(hd[0], hd[1], 2.9, 2.9, L.skin, { sw: 1.5 });
  if (atk) o += path(`M${f(hd[0] + 6)},${f(hd[1] - 20)} q12,4 14,16`, 'none', { stroke: '#fff', sw: 2, op: 0.8 });
  return o;
}

/** 火枪（端平时的样子，手在原点）：分件骨架的武器部件也用它 */
export function musket(hd: Pt, flash: boolean): string {
  let o = line([hd[0] - 10, hd[1] + 1.5], [hd[0] + 6, hd[1] - 0.5], C.woodDD!, 5.4) + line([hd[0] - 10, hd[1] + 1.5], [hd[0] + 6, hd[1] - 0.5], C.woodL!, 2.8);
  o += line([hd[0] + 4, hd[1] - 0.5], [hd[0] + 26, hd[1] - 2.5], OUT, 4.6) + line([hd[0] + 4, hd[1] - 0.5], [hd[0] + 26, hd[1] - 2.5], C.ironL!, 2.2);
  if (flash) o += poly([[hd[0] + 26, hd[1] - 2.5], [hd[0] + 30, hd[1] - 8], [hd[0] + 32, hd[1] - 3], [hd[0] + 37, hd[1] - 3], [hd[0] + 32, hd[1] - 0.5], [hd[0] + 33, hd[1] + 5], [hd[0] + 28, hd[1] + 0.5]], C.fireL!, { sw: 1.2 });
  else o += poly([[hd[0] + 33, hd[1] - 3.2], [hd[0] + 26, hd[1] - 4], [hd[0] + 26.4, hd[1] - 0.8]], '#dfe8f0', { sw: 1 });
  return o;
}

/** 船长的燧发手枪（hd 是握把上的手心，枪口朝 +x）：短木柄斜向后下，铁枪管带一道金箍；flash = 枪口火 */
export function pistol(hd: Pt, flash: boolean): string {
  let o = line([hd[0] + 0.5, hd[1] - 0.5], [hd[0] - 4.5, hd[1] + 6], C.woodDD!, 5.4) + line([hd[0] + 0.5, hd[1] - 0.5], [hd[0] - 4.5, hd[1] + 6], C.woodL!, 2.6);
  // 枪管短而粗（比火枪短一半多），一眼看出是手枪不是剑
  o += line([hd[0] - 1, hd[1] - 1.2], [hd[0] + 10, hd[1] - 1.8], OUT, 5.4) + line([hd[0] - 1, hd[1] - 1.2], [hd[0] + 10, hd[1] - 1.8], C.ironL!, 2.8);
  o += ell(hd[0] + 10.2, hd[1] - 1.8, 1.6, 2, C.ironD!, { sw: 1 });
  o += line([hd[0] + 4.5, hd[1] - 4], [hd[0] + 4.5, hd[1] + 0.4], C.gold!, 1.8);
  if (flash) o += poly([[hd[0] + 11, hd[1] - 1.8], [hd[0] + 14, hd[1] - 6], [hd[0] + 16, hd[1] - 2.4], [hd[0] + 20, hd[1] - 2.2], [hd[0] + 16, hd[1] - 0.2], [hd[0] + 17, hd[1] + 3.8], [hd[0] + 13, hd[1] + 0.2]], C.fireL!, { sw: 1.2 });
  return o;
}

function gunner(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.gunner;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 4.6, -21 + p.bob];
  const bsh: Pt = [p.lean - 4.6, -21 + p.bob];
  const d = dressed('gunner', p, false);
  let o = '';
  const bh: Pt = atk ? [bsh[0] + 15, bsh[1] + 3] : [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, '#3a8f48', L.skin);
  o += d.front;
  // 火枪
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.2, '#3a8f48');
  if (atk) {
    o += musket(hd, true);
  } else {
    const a: Pt = [hd[0] - 9, hd[1] + 7];
    const b: Pt = [hd[0] + 27, hd[1] - 15];
    o += line(a, [a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4], C.woodDD!, 5.4) + line(a, [a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4], C.woodL!, 2.8);
    o += line([a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4], b, OUT, 4.6) + line([a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4], b, C.ironL!, 2.2);
    o += poly([[b[0] + 6, b[1] - 3.6], [b[0] - 0.5, b[1] - 2.4], [b[0] + 0.5, b[1] + 1.2]], '#dfe8f0', { sw: 1 });
  }
  o += ell(hd[0], hd[1], 2.9, 2.9, L.skin, { sw: 1.5 });
  return o;
}

/** 大锤（锤柄朝上立着，手在 hd、锤头中心在 tip） */
export function hammer(hd: Pt, tip: Pt): string {
  let o = line(hd, tip, OUT, 6) + line(hd, tip, C.woodL!, 3);
  const hdW = 15;
  // 锤头用亮钢色加白高光（深铁色在棕红屋瓦前看不出锤子）
  o += poly([[tip[0] - hdW / 2, tip[1] - 4], [tip[0] + hdW / 2 + 1, tip[1] - 8], [tip[0] + hdW / 2 + 1, tip[1] + 6], [tip[0] - hdW / 2, tip[1] + 9]], '#c3ced8', { sw: 2 });
  o += line([tip[0] - 5, tip[1] - 3], [tip[0] + 5, tip[1] - 6], '#ffffff', 1.8);
  for (const dy of [-4, 2]) o += poly([[tip[0] + hdW / 2 + 1, tip[1] + dy - 2], [tip[0] + hdW / 2 + 6, tip[1] + dy], [tip[0] + hdW / 2 + 1, tip[1] + dy + 2.5]], C.ironL!, { sw: 1.2 });
  return o;
}

function brute(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.brute;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 8.5, -24 + p.bob];
  const bsh: Pt = [p.lean - 8.5, -24 + p.bob];
  const d = dressed('brute', p, atk);
  let o = '';
  const bh: Pt = [bsh[0] + p.bh[0] - 2, bsh[1] + p.bh[1]];
  o += limb(bsh, bh, 8.4, L.skin) + ell(bh[0], bh[1], 5, 5, L.skin, { sw: 1.6 });
  o += d.front;
  // 大锤
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  const tip: Pt = atk ? [hd[0] + 12, hd[1] - 22] : pose === 'idle' ? [hd[0] - 1, hd[1] - 26] : [hd[0] + 2, hd[1] - 24];
  o += limb(sh, hd, 8.4, L.skin);
  o += hammer(hd, tip);
  o += ell(hd[0], hd[1], 5, 5, L.skin, { sw: 1.6 });
  return o;
}

/** 炸药兵手里的小火药桶（bp 是桶的中心，桶顶一根冒火星的引信） */
export function keg(bp: Pt): string {
  let o = rect(bp[0] - 6.5, bp[1] - 7.5, 13, 15, '#9a5a2a', { sw: 2, r: 2.5 }) + rect(bp[0] - 6.5, bp[1] - 4, 13, 2.6, '#3b2a1e', { sw: 0 }) + rect(bp[0] - 6.5, bp[1] + 2.4, 13, 2.6, '#3b2a1e', { sw: 0 });
  o += ell(bp[0], bp[1] - 7.5, 6.5, 2.4, '#c98a4b', { sw: 1.6 }) + rect(bp[0] - 2.4, bp[1] - 2, 4.8, 4.4, C.red!, { sw: 1 });
  o += path(`M${f(bp[0] + 1)},${f(bp[1] - 9)} q3,-5 7,-4`, 'none', { stroke: C.creamD!, sw: 1.8 });
  const spark: Pt = [bp[0] + 8.4, bp[1] - 14];
  o += poly([[spark[0], spark[1] - 5], [spark[0] + 1.6, spark[1] - 1.6], [spark[0] + 5, spark[1]], [spark[0] + 1.6, spark[1] + 1.6], [spark[0], spark[1] + 5], [spark[0] - 1.6, spark[1] + 1.6], [spark[0] - 5, spark[1]], [spark[0] - 1.6, spark[1] - 1.6]], C.fireL!, { sw: 1 });
  return o;
}

function bomber(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.bomber;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 4.4, -20 + p.bob];
  const bsh: Pt = [p.lean - 4.4, -20 + p.bob];
  const d = dressed('bomber', p, atk);
  let o = '';
  const bh: Pt = [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, '#ff8a1f', L.skin);
  o += d.back + d.front;
  // 炸弹
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.2, '#ff8a1f');
  o += keg(atk ? [hd[0] + 4, hd[1] - 6] : [hd[0] + 1, hd[1] - 6]);
  o += ell(hd[0], hd[1], 2.9, 2.9, L.skin, { sw: 1.5 });
  return o;
}

/** 手雷：黑铁圆球 + 十字凹槽 + 短引信冒火星（bp 是球心） */
export function grenadeBall(bp: Pt, r = 5.6): string {
  let o = ell(bp[0], bp[1], r, r, '#2a2b36', { sw: 2 });
  o += path(`M${f(bp[0] - r + 0.8)},${f(bp[1])} L${f(bp[0] + r - 0.8)},${f(bp[1])} M${f(bp[0])},${f(bp[1] - r + 0.8)} L${f(bp[0])},${f(bp[1] + r - 0.8)}`, 'none', { stroke: '#4a4e5c', sw: 1.1 });
  o += ell(bp[0] - r * 0.32, bp[1] - r * 0.36, r * 0.3, r * 0.22, '#8a90a4', { sw: 0 });
  o += rect(bp[0] - 1.6, bp[1] - r - 2.2, 3.2, 3, C.gold!, { sw: 0.9 });
  o += path(`M${f(bp[0] + 1)},${f(bp[1] - r - 2)} q3,-3 5,-2`, 'none', { stroke: C.creamD!, sw: 1.4 });
  o += poly([[bp[0] + 6, bp[1] - r - 6.5], [bp[0] + 7, bp[1] - r - 4.4], [bp[0] + 9.4, bp[1] - r - 4], [bp[0] + 7, bp[1] - r - 3.2], [bp[0] + 6, bp[1] - r - 1.4], [bp[0] + 5, bp[1] - r - 3.2], [bp[0] + 2.6, bp[1] - r - 4], [bp[0] + 5, bp[1] - r - 4.4]], C.fireL!, { sw: 0.7 });
  return o;
}

function grenadier(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.grenadier;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 4.6, -21 + p.bob];
  const bsh: Pt = [p.lean - 4.6, -21 + p.bob];
  const d = dressed('grenadier', p, atk);
  let o = '';
  const bh: Pt = [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, '#5a7a4a', L.skin);
  o += d.back + d.front;
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.2, '#5a7a4a');
  // 出手时手雷已经脱手，只留空拳；其余时候举在手上
  if (!atk) o += grenadeBall([hd[0] + 1, hd[1] - 6]);
  o += ell(hd[0], hd[1], 2.9, 2.9, L.skin, { sw: 1.5 });
  return o;
}

/** 盾兵整张帧：前手把大木盾竖在身前，后手一把短刀；盾画在身体前面（整张帧只看得到正面） */
function shieldman(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.shield;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 4.8, -21 + p.bob];
  const bsh: Pt = [p.lean - 4.8, -21 + p.bob];
  const d = dressed('shield', p, atk);
  let o = d.back;
  const bh: Pt = [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, '#9a6a3c', L.skin);
  o += blade(bh, [bh[0] + 10, bh[1] - (atk ? 4 : 9)], 2, false, 2);
  o += d.front;
  const hd: Pt = [sh[0] + p.fh[0] * 0.5 + 2, sh[1] + p.fh[1] * 0.5];
  o += limb(sh, hd, 4.2, '#9a6a3c');
  o += `<g transform="translate(${f(hd[0] + 4 + (atk ? 4 : 0))} ${f(hd[1] - 5)})">${woodShield(19, 25)}</g>`;
  o += ell(hd[0], hd[1], 2.9, 2.9, L.skin, { sw: 1.5 });
  return o;
}

function captain(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.captain;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 5.6, -22 + p.bob];
  const bsh: Pt = [p.lean - 5.6, -22 + p.bob];
  const d = dressed('captain', p, atk, pose === 'idle' ? 0 : pose === 'attack' ? -4 : -2);
  let o = d.back;
  const bh: Pt = [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, C.red!, L.skin);
  o += d.front;
  // 手枪（英雄在登陆战和守岛里都是开枪打远处）：开火时平端朝前，待机、走路时枪口朝上举着指挥
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.6, C.red!);
  const tilt = atk ? -6 : pose === 'idle' ? -68 : -52;
  o += `<g transform="rotate(${tilt} ${f(hd[0])} ${f(hd[1])})">${pistol(hd, false)}</g>`;
  o += ell(hd[0], hd[1], 3, 3, L.skin, { sw: 1.5 });
  return o;
}

/** 药箱（bx、by 是箱子中心，提手在上） */
export function medkit(bx: number, by: number): string {
  return rect(bx - 8, by - 6, 16, 12, '#f2f2f2', { sw: 2, r: 2 }) + rect(bx - 1.6, by - 4, 3.2, 8, C.red!, { sw: 0 }) + rect(bx - 4, by - 1.6, 8, 3.2, C.red!, { sw: 0 }) + path(`M${f(bx - 4)},${f(by - 6)} q4,-5 8,0`, 'none', { stroke: C.ink!, sw: 1.8 });
}

function medic(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.medic;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 4.6, -21 + p.bob];
  const bsh: Pt = [p.lean - 4.6, -21 + p.bob];
  const d = dressed('medic', p, atk);
  let o = '';
  const bh: Pt = [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, '#4a8fd0', L.skin);
  o += d.back + d.front;
  // 药箱
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.2, '#4a8fd0');
  const bx = atk ? hd[0] + 3 : hd[0] + 1;
  const by = atk ? hd[1] - 7 : hd[1] + 3;
  o += medkit(bx, by);
  if (atk) o += poly([[bx + 10, by - 10], [bx + 12, by - 6], [bx + 16, by - 4], [bx + 12, by - 2], [bx + 10, by + 2], [bx + 8, by - 2], [bx + 4, by - 4], [bx + 8, by - 6]], '#7be08a', { sw: 1 });
  o += ell(hd[0], hd[1], 2.9, 2.9, L.skin, { sw: 1.5 });
  return o;
}

/** 推着的小炮（cp 是炮车中心；lift = 炮口抬高多少） */
export function cart(cp: Pt, lift: number): string {
  let o = poly([[cp[0] - 10, cp[1] - 4], [cp[0] + 12, cp[1] + 2], [cp[0] + 12, cp[1] + 7], [cp[0] - 10, cp[1] + 1]], C.woodD!, { sw: 1.8 });
  o += tube([cp[0] - 6, cp[1] - 8], [cp[0] + 15, cp[1] - 8 - lift], 8, 7, C.ironD!, C.ironL!);
  o += ell(cp[0] + 15, cp[1] - 8 - lift, 2.4, 4, '#101018', { sw: 1.2 });
  o += ell(cp[0] - 1, cp[1] + 7, 6.4, 6.4, C.woodDD!, { sw: 1.8 }) + ell(cp[0] - 1, cp[1] + 7, 2.4, 2.4, C.woodL!, { sw: 0.8 });
  return o;
}

function cannoneer(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.cannoneer;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 7.4, -22 + p.bob];
  const bsh: Pt = [p.lean - 7.4, -22 + p.bob];
  const d = dressed('cannoneer', p, atk);
  let o = '';
  const bh: Pt = [bsh[0] + p.bh[0] + 2, bsh[1] + p.bh[1] - 2];
  o += limb(bsh, bh, 5.6, '#3a5aa0') + ell(bh[0], bh[1], 3.6, 3.6, L.skin, { sw: 1.6 });
  o += d.front;
  // 推着的小炮：炮车 + 炮管（在身前）
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 5.6, '#3a5aa0');
  const cp: Pt = [hd[0] + 8, hd[1] + 6];
  o += cart(cp, atk ? 4 : 0);
  if (atk) o += poly([[cp[0] + 18, cp[1] - 12], [cp[0] + 23, cp[1] - 18], [cp[0] + 25, cp[1] - 12], [cp[0] + 31, cp[1] - 14], [cp[0] + 34, cp[1] - 11], [cp[0] + 36, cp[1] - 6], [cp[0] + 30, cp[1] - 10]], C.fireL!, { sw: 1.2 });
  o += ell(hd[0], hd[1], 4, 4, L.skin, { sw: 1.6 });
  return o;
}

/** 鱼叉：杆从 a 到 b，b 往外是三叉头，杆尾拖一截绳 */
export function harpoon(a: Pt, b: Pt): string {
  let o = tube(a, b, 3.6, 3.6, C.woodL!, '#fff');
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  const ux = dx / l;
  const uy = dy / l;
  const tip: Pt = [b[0] + ux * 9, b[1] + uy * 9];
  o += line(b, tip, C.ironL!, 2.6) + line([b[0] - uy * 5, b[1] + ux * 5], [b[0] - uy * 5 + ux * 8, b[1] + ux * 5 + uy * 8], C.ironL!, 2) + line([b[0] + uy * 5, b[1] - ux * 5], [b[0] + uy * 5 + ux * 8, b[1] - ux * 5 + uy * 8], C.ironL!, 2);
  o += poly([[tip[0] + ux * 3, tip[1] + uy * 3], [tip[0] - uy * 2.4, tip[1] + ux * 2.4], [tip[0] + uy * 2.4, tip[1] - ux * 2.4]], C.ironL!, { sw: 1.2 });
  o += path(`M${f(a[0] + ux * 6)},${f(a[1] + uy * 6)} q-4,10 -10,12`, 'none', { stroke: C.cream!, sw: 1.8 });
  return o;
}

function harpooner(pose: Pose, pd?: PoseData): string {
  const p = pd ?? POSES[pose];
  const L = LOOKS.harpooner;
  const atk = pose === 'attack';
  const sh: Pt = [p.lean + 4.6, -21 + p.bob];
  const bsh: Pt = [p.lean - 4.6, -21 + p.bob];
  const d = dressed('harpooner', p, atk);
  let o = '';
  const bh: Pt = atk ? [bsh[0] + 6, bsh[1] + 3] : [bsh[0] + p.bh[0], bsh[1] + p.bh[1]];
  o += arm(bsh, bh, '#f2c230', L.skin);
  o += d.front;
  // 鱼叉（长杆 + 三叉头 + 绳）
  const hd: Pt = [sh[0] + p.fh[0], sh[1] + p.fh[1]];
  o += limb(sh, hd, 4.2, '#f2c230');
  o += harpoon(atk ? [hd[0] - 14, hd[1] + 2] : [hd[0] - 6, hd[1] + 10], atk ? [hd[0] + 26, hd[1] - 4] : [hd[0] + 8, hd[1] - 26]);
  o += ell(hd[0], hd[1], 2.9, 2.9, L.skin, { sw: 1.5 });
  return o;
}

const DRAW: Record<TroopKind, (p: Pose, pd?: PoseData) => string> = { sailor, gunner, brute, bomber, captain, medic, cannoneer, harpooner, grenadier, shield: shieldman };

/** 每个兵种的画布裁剪框（原 160×180、脚底锚点 (72,158) 坐标系里的包围盒，含全部帧、全部皮肤）：同一个兵所有帧同一尺寸 */
const BOX: Record<TroopKind, [number, number, number, number]> = {
  sailor: [37, 65, 146, 171],
  gunner: [40, 61, 172, 171],
  brute: [21, 26, 184, 174],
  bomber: [43, 69, 135, 170],
  captain: [35, 29, 163, 172],
  medic: [40, 65, 144, 171],
  cannoneer: [34, 35, 211, 175],
  harpooner: [40, 54, 173, 171],
  grenadier: [38, 58, 150, 171],
  shield: [30, 50, 168, 172],
};
function boxed(kind: TroopKind, key: string, body: string): ArtPiece {
  const [x0, y0, x1, y1] = BOX[kind];
  return { ...piece(key, x1 - x0, y1 - y0, 72 - x0, 158 - y0, body), key };
}

const cache = new Map<string, ArtPiece>();
export function troopArt(kind: TroopKind, pose: Pose): ArtPiece {
  const key = `${kind}.${pose}`;
  let a = cache.get(key);
  if (!a) {
    const L = LOOKS[kind];
    const inner = shadow(14 * L.scale + 2, 5.5 * L.scale, 2, 1, 0.42) + `<g transform="scale(${L.scale})">${DRAW[kind](pose)}</g>`;
    a = boxed(kind, `t.${key}`, inner);
    cache.set(key, a);
  }
  return a;
}
void lighten;


// ================================================================= 动画帧与皮肤

type Anim = 'idle' | 'walk' | 'attack';
export type TroopSkin = 'gold' | 'shadow' | 'royal';

const P0 = POSES.idle;
const FRAMES: Record<Anim, Array<{ pose: Pose; pd: PoseData; blink?: boolean }>> = {
  idle: [
    { pose: 'idle', pd: { ...P0 } },
    { pose: 'idle', pd: { ...P0, bob: -0.9, fh: [6.5, 7.5], bh: [-5, 8.5] } },
    { pose: 'idle', pd: { ...P0, bob: -0.9, fh: [7, 7], bh: [-5, 8.6] }, blink: true },
    { pose: 'idle', pd: { ...P0, bob: 0, fh: [5.2, 8.6], bh: [-5, 9.4] } },
  ],
  walk: [
    { pose: 'walk1', pd: { ...POSES.walk1 } },
    { pose: 'walk1', pd: { bob: -2.6, ff: [2.5, -1.2], bf: [-2.5, -1.2], lean: 1, fh: [4, 8], bh: [0, 8.5] } },
    { pose: 'walk2', pd: { ...POSES.walk2 } },
    { pose: 'walk2', pd: { bob: -2.6, ff: [2.5, -1.2], bf: [-2.5, -1.2], lean: 1, fh: [3, 8.5], bh: [1, 8] } },
  ],
  attack: [
    { pose: 'idle', pd: { bob: 0.6, ff: [3, 0], bf: [-6, 0], lean: -2.5, fh: [4, -6], bh: [-6, 7] } },
    { pose: 'attack', pd: { ...POSES.attack } },
    { pose: 'attack', pd: { bob: -0.4, ff: [11, 0], bf: [-6, 0], lean: 4.5, fh: [15, 3], bh: [-2, 9] } },
    { pose: 'walk1', pd: { bob: 0, ff: [5, 0], bf: [-4, 0], lean: 1, fh: [8, 5], bh: [-5, 9] } },
  ],
};

/** 每个兵种的"衣甲色"：换皮肤时只替换这些颜色（连同它们的暗面），肤色、描边、武器金属不动 */
const COSTUME: Record<TroopKind, string[]> = {
  sailor: ['#fefefe', C.blue!, C.red!, '#f0e8d4'],
  gunner: ['#3fa34f', '#3a8f48', '#5a4634'],
  brute: ['#6a4a2a'],
  bomber: ['#ff8a1f', '#7a4a2a'],
  captain: ['#ff3a2e', '#8f1f27', '#2c3e6a', C.red!],
  medic: ['#fdfdfd', '#4a8fd0', '#e8e2d0'],
  cannoneer: ['#3a5aa0', '#2c3e6a', '#2f5fb0'],
  harpooner: ['#f2c230', '#3b5a7a', '#f7d34a', '#2a3a56'],
  grenadier: ['#5a7a4a', '#3a4a3a', '#6a7480'],
  shield: ['#9a6a3c', '#7a6a52', '#8f9aa8'],
};
const HEAD_TOP: Record<TroopKind, number> = { sailor: -47, gunner: -50, brute: -52, bomber: -50, captain: -64, medic: -47, cannoneer: -53, harpooner: -50, grenadier: -50, shield: -51 };

function lum(c: string): number {
  const n = parseInt(c.slice(1), 16);
  return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
}
function skinColor(c: string, skin: TroopSkin): string {
  const l = Math.max(0, Math.min(1, lum(c)));
  if (skin === 'gold') return mix('#8a5a08', '#ffe27a', Math.min(1, l * 1.05));
  if (skin === 'shadow') return mix('#120a22', '#6a54a8', l);
  return l < 0.5 ? mix('#6e0f1c', '#d83a32', l * 2) : mix('#e8b020', '#fff0a0', (l - 0.5) * 2);
}
export function skinify(svg: string, kind: TroopKind, skin: TroopSkin): string {
  let out = svg;
  for (const c of COSTUME[kind]) {
    for (const src of [c, darken(c, 0.25)]) out = out.split(src).join(skinColor(src, skin));
  }
  return out;
}
export function skinDeco(kind: TroopKind, skin: TroopSkin, bob: number): string {
  const y = HEAD_TOP[kind] + bob;
  const x = kind === 'captain' ? 2 : 1;
  if (skin === 'gold') {
    const st = (cx: number, cy: number, r: number): string => poly([[cx, cy - r], [cx + r * 0.3, cy - r * 0.3], [cx + r, cy], [cx + r * 0.3, cy + r * 0.3], [cx, cy + r], [cx - r * 0.3, cy + r * 0.3], [cx - r, cy], [cx - r * 0.3, cy - r * 0.3]], '#fff6c8', { sw: 1, stroke: '#c68a12' });
    return st(x - 12, y + 6, 4) + st(x + 12, y + 2, 5) + st(x + 2, y - 4, 3);
  }
  if (skin === 'shadow') {
    const w = (cx: number, h: number): string => path(`M${f(cx)},${f(y + 12)} q-4,-${h / 2} 0,-${h} q1,${h * 0.35} 4,${h * 0.4} q-3,${h * 0.3} -4,${h * 0.6} z`, '#6fb4ff', { sw: 1, stroke: '#2a5cd0', op: 0.9 });
    return w(x - 9, 14) + w(x + 9, 12) + w(x, 17);
  }
  // royal：小王冠
  return path(`M${f(x - 7)},${f(y + 6)} L${f(x - 8)},${f(y - 3)} L${f(x - 3.5)},${f(y + 1)} L${f(x)},${f(y - 6)} L${f(x + 3.5)},${f(y + 1)} L${f(x + 8)},${f(y - 3)} L${f(x + 7)},${f(y + 6)} Z`, C.gold!, { sw: 1.6 }) + ell(x, y - 4.6, 1.5, 1.5, C.red!, { sw: 0 }) + ell(x - 5.5, y - 0.6, 1.1, 1.1, '#6fb4ff', { sw: 0 });
}

/** 暗影皮肤的蓝色外发光（用的地方套 filter="url(#sg)"） */
export const SKIN_GLOW = '<defs><filter id="sg" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b"/><feFlood flood-color="#4a8cff" flood-opacity="0.95"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

const fcache = new Map<string, ArtPiece[]>();
/** 动画帧：idle 4 帧、walk 4 帧、attack 4 帧（蓄力、出手、收招…）。锚点（脚底）各帧一致；skin 套配色 + 小饰物 */
export function troopFrames(kind: TroopKind, anim: Anim, skin?: string): ArtPiece[] {
  const sk = skin === 'gold' || skin === 'shadow' || skin === 'royal' ? skin : undefined;
  const key = `${kind}.${anim}.${sk ?? ''}`;
  let r = fcache.get(key);
  if (r) return r;
  const L = LOOKS[kind];
  r = FRAMES[anim].map((fr, i) => {
    BLINK = !!fr.blink;
    let body = DRAW[kind](fr.pose, fr.pd);
    BLINK = false;
    if (sk) body = skinify(body, kind, sk) + skinDeco(kind, sk, fr.pd.bob);
    const glow = sk === 'shadow' ? ' filter="url(#sg)"' : '';
    const defs = sk === 'shadow' ? SKIN_GLOW : '';
    const lustre = sk === 'gold' ? ell(-2, -26, 16, 22, '#fff4b0', { sw: 0, op: 0.12 }) : '';
    const inner = shadow(14 * L.scale + 2, 5.5 * L.scale, 2, 1, 0.42) + defs + `<g transform="scale(${L.scale})"${glow}>${lustre}${body}</g>`;
    return boxed(kind, `t.${key}.${i}`, inner);
  });
  fcache.set(key, r);
  return r;
}
