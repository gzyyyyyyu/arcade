/** 特效：炮弹、子弹、臼炮弹、火、爆炸、烟、火花、废墟、信号弹、治疗。锚点 = 中心。 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { ell, f, line, path, pieceRaw as piece, poly, shadow, uid } from './kit.ts';
import { tube } from './kit.ts';

type FxKind = 'ball' | 'bullet' | 'shell' | 'flame' | 'boom' | 'smoke' | 'spark' | 'rubble' | 'flare' | 'heal' | 'rocket' | 'harpoon' | 'tar' | 'tentacle' | 'fog' | 'levelup' | 'coins' | 'grenade' | 'stars' | 'shock' | 'snipe';

function star(cx: number, cy: number, n: number, r1: number, r2: number, rot = 0): Pt[] {
  const a: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const an = rot + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    a.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]);
  }
  return a;
}

function make(kind: FxKind): ArtPiece {
  switch (kind) {
    case 'ball':
      return piece('fx.ball', 20, 20, 10, 10, ell(0, 0, 6.5, 6.5, '#2f3140', { sw: 2 }) + ell(-2.2, -2.4, 2.4, 1.8, '#8a8da2', { sw: 0 }));
    case 'bullet':
      return piece('fx.bullet', 20, 12, 10, 6, ell(-3, 0, 6, 1.8, '#fff2a8', { sw: 0, op: 0.7 }) + ell(2, 0, 3.4, 2.6, C.gold!, { sw: 1.4 }) + ell(1.4, -0.7, 1.2, 0.8, '#fff', { sw: 0 }));
    case 'snipe':
      // 狙击弹：长长一道白色弹迹（尾淡头亮）加一粒亮头；锚点在弹头，朝右
      return piece('fx.snipe', 84, 14, 76, 7, ell(-36, 0, 38, 2.2, '#ffffff', { sw: 0, op: 0.45 }) + ell(-18, 0, 20, 1.5, '#ffffff', { sw: 0, op: 0.85 }) + ell(0, 0, 4.4, 3.2, '#fff6c8', { sw: 0 }) + ell(0, 0, 2.2, 1.6, '#ffffff', { sw: 0 }));
    case 'shell': {
      const g = uid('sf');
      const b = `<defs><radialGradient id="${g}" cx="0.35" cy="0.3"><stop offset="0" stop-color="#6b6f85"/><stop offset="1" stop-color="#23242e"/></radialGradient></defs>` +
        ell(0, 0, 9, 9, `url(#${g})`, { sw: 2.2 }) + path('M3,-8 q3,-6 8,-5', 'none', { stroke: C.creamD!, sw: 2 }) +
        poly(star(12, -13, 4, 5, 2, 0.4), C.fireL!, { sw: 1 }) + ell(-3, -3, 2.6, 1.8, '#a9acc0', { sw: 0 });
      return piece('fx.shell', 32, 32, 16, 18, b);
    }
    case 'flame': {
      const b =
        path('M0,18 C-12,14 -14,2 -8,-8 C-8,-2 -4,-2 -3,-8 C-2,-18 4,-20 4,-28 C12,-18 14,-6 12,4 C12,12 6,18 0,18 Z', C.fire!, { sw: 2 }) +
        path('M1,16 C-6,12 -7,4 -3,-2 C-2,2 0,2 1,-4 C2,-10 5,-12 6,-16 C10,-8 10,2 9,6 C8,12 5,16 1,16 Z', C.fireL!, { sw: 0 }) +
        path('M1,14 C-2,12 -2,8 1,4 C3,8 5,9 4,12 C3,14 2,14 1,14 Z', '#fff6c8', { sw: 0 });
      return piece('fx.flame', 32, 44, 16, 32, b);
    }
    case 'boom': {
      const b =
        poly(star(0, 0, 12, 46, 26, 0.1), '#e8431a', { sw: 2.6 }) +
        poly(star(0, 0, 10, 36, 20, 0.3), C.orange!, { sw: 0 }) +
        poly(star(0, 0, 8, 26, 14, 0.5), C.fireL!, { sw: 0 }) +
        ell(0, 0, 11, 11, '#fff8d8', { sw: 0 }) +
        ell(-26, -20, 6, 6, C.smokeD!, { sw: 0, op: 0.6 }) + ell(28, 18, 5, 5, C.smokeD!, { sw: 0, op: 0.6 });
      return piece('fx.boom', 104, 104, 52, 52, b);
    }
    case 'smoke': {
      const b =
        ell(0, 14, 14, 9, C.smokeD!, { sw: 2, stroke: C.ink! }) +
        ell(-6, 4, 12, 9, C.smoke!, { sw: 2, stroke: C.ink! }) +
        ell(8, -2, 13, 10, C.smoke!, { sw: 2, stroke: C.ink! }) +
        ell(-2, -14, 11, 9, C.smokeL!, { sw: 2, stroke: C.ink! }) +
        ell(-6, -17, 4, 2.6, '#e6e7ec', { sw: 0 });
      return piece('fx.smoke', 40, 50, 20, 27, `<g opacity="0.5" transform="scale(0.82)">${b}</g>`);
    }
    case 'spark':
      return piece('fx.spark', 24, 24, 12, 12, poly(star(0, 0, 4, 10, 3), C.fireL!, { sw: 1.6 }) + ell(0, 0, 2.6, 2.6, '#fff', { sw: 0 }));
    case 'rubble': {
      let b = shadow(52, 22, 2, 8, 0.35);
      const dark = '#3c342e';
      b += poly([[-40, 10], [-36, -4], [-22, -10], [-10, -6], [-4, 6], [-14, 16], [-30, 18]], '#7a746c', { sw: 2.2 });
      b += poly([[-36, -4], [-22, -10], [-10, -6], [-24, 0]], '#aaa39a', { sw: 0 });
      b += poly([[4, 8], [8, -6], [24, -12], [38, -4], [40, 10], [24, 18]], '#6a655e', { sw: 2.2 });
      b += poly([[8, -6], [24, -12], [38, -4], [22, 0]], '#9a948b', { sw: 0 });
      b += poly([[-14, -4], [-8, -16], [6, -18], [10, -6], [0, 4], [-10, 4]], '#85807a', { sw: 2.2 });
      b += poly([[-8, -16], [6, -18], [8, -12], [-4, -9]], '#b4aea6', { sw: 0 });
      // 烧焦的木梁
      b += line([-30, 14], [-6, 20], dark, 6) + line([-30, 14], [-6, 20], '#6b4a2e', 3);
      b += line([10, 18], [34, 10], dark, 6) + line([10, 18], [34, 10], '#6b4a2e', 3);
      b += line([-14, -2], [14, -10], C.woodDD!, 5);
      b += ell(-4, 8, 8, 4, '#2a2420', { sw: 0, op: 0.55 });
      b += ell(24, 4, 3, 3, '#ff8a2a', { sw: 0, op: 0.9 });
      return piece('fx.rubble', 104, 60, 52, 34, b);
    }
    case 'flare': {
      const b =
        path('M0,0 Q-6,-24 -2,-44', 'none', { stroke: '#ffe0b0', sw: 3, op: 0.55 }) +
        poly(star(0, 0, 6, 15, 5, 0.2), '#ff3b2a', { sw: 2 }) + poly(star(0, 0, 6, 10, 4, 0.5), C.fireL!, { sw: 0 }) + ell(0, 0, 4, 4, '#fff', { sw: 0 });
      return piece('fx.flare', 44, 64, 22, 52, b);
    }
    case 'rocket': {
      let b = path('M-30,2 Q-18,-4 -8,0 Q-16,6 -30,2 Z', C.fire!, { sw: 0, op: 0.9 }) + path('M-22,1 Q-14,-2 -8,0 Q-14,3 -22,1Z', C.fireL!, { sw: 0 });
      b += ell(-34, 0, 5, 3, C.smokeL!, { sw: 0, op: 0.6 }) + ell(-42, 1, 4, 2.6, C.smokeL!, { sw: 0, op: 0.4 });
      b += tube([-8, 0], [10, 0], 9, 9, '#cfd5dc', '#fff');
      b += poly([[10, -4.5], [20, 0], [10, 4.5]], C.red!, { sw: 1.8 });
      b += poly([[-8, -4], [-14, -9], [-4, -4]], C.redD!, { sw: 1.4 }) + poly([[-8, 4], [-14, 9], [-4, 4]], C.redD!, { sw: 1.4 });
      return piece('fx.rocket', 64, 28, 44, 14, b);
    }
    case 'harpoon': {
      let b = line([-20, 0], [14, 0], C.ink!, 5) + line([-20, 0], [14, 0], C.woodL!, 2.6);
      b += poly([[22, 0], [12, -5], [12, 5]], C.ironL!, { sw: 1.8 }) + poly([[14, -3], [8, -9], [10, -2]], C.ironL!, { sw: 1.2 }) + poly([[14, 3], [8, 9], [10, 2]], C.ironL!, { sw: 1.2 });
      b += path('M-20,0 q-8,6 -16,2', 'none', { stroke: C.cream!, sw: 1.8 });
      return piece('fx.harpoon', 64, 24, 42, 12, b);
    }
    case 'tar': {
      let b = ell(0, 4, 26, 10, '#1a1620', { sw: 2, stroke: C.ink! }) + ell(-6, 2, 16, 5, '#2c2634', { sw: 0 });
      for (const [x, y, r] of [[-18, -12, 4], [-6, -18, 5], [8, -16, 4.4], [18, -8, 3.6], [0, -8, 3]] as const) b += ell(x, y, r, r * 1.2, '#1a1620', { sw: 1.6, stroke: C.ink! }) + ell(x - r * 0.3, y - r * 0.4, r * 0.3, r * 0.2, '#bdb4d6', { sw: 0 });
      b += path('M-22,2 q-4,-8 -8,-6 M20,2 q4,-8 8,-6', 'none', { stroke: '#1a1620', sw: 3 });
      return piece('fx.tar', 72, 48, 36, 30, b);
    }
    case 'tentacle': {
      let b = ell(0, 4, 40, 12, '#fff', { sw: 0, op: 0.4 }) + ell(0, 4, 32, 9, 'none', { sw: 4, stroke: '#fff', op: 0.85 }) + ell(0, 4, 20, 5.5, 'none', { sw: 3, stroke: C.seaLight!, op: 0.9 });
      for (const [x, y] of [[-34, -6], [30, -10], [-20, 14], [24, 16]] as const) b += ell(x, y, 3.2, 3.2, '#fff', { sw: 0, op: 0.9 });
      b += path('M-44,6 q10,-10 20,0 M24,10 q10,-10 20,0', 'none', { stroke: '#fff', sw: 2.4, op: 0.8 });
      return piece('fx.tentacle', 100, 44, 50, 24, b);
    }
    case 'fog': {
      const g = uid('fg');
      const b = `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#cfc7e6" stop-opacity="0.8"/><stop offset="1" stop-color="#9a90bd" stop-opacity="0"/></radialGradient></defs>` +
        ell(0, 0, 70, 34, `url(#${g})`, { sw: 0 }) + ell(-26, -4, 30, 16, `url(#${g})`, { sw: 0 }) + ell(28, 4, 32, 16, `url(#${g})`, { sw: 0 }) + ell(4, -10, 26, 14, `url(#${g})`, { sw: 0 });
      return piece('fx.fog', 150, 76, 75, 38, b);
    }
    case 'levelup': {
      const g = uid('lu');
      let b = `<defs><linearGradient id="${g}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe45e" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient></defs>`;
      b += ell(0, 0, 30, 13, '#ffe45e', { sw: 0, op: 0.5 }) + ell(0, 0, 30, 13, 'none', { sw: 3, stroke: '#fff6c8', op: 0.9 });
      b += poly([[-26, 0], [26, 0], [20, -120], [-20, -120]], `url(#${g})`, { sw: 0 });
      for (const [x, y, k] of [[-14, -40, 1], [12, -64, 1.3], [-6, -92, 1], [18, -24, 0.8]] as const) b += poly(star(x, y, 4, 7 * k, 2 * k), '#fffbe0', { sw: 1 });
      b += path('M-6,-10 l6,-14 l6,14 M0,-24 v-16', 'none', { stroke: '#fff', sw: 3, op: 0.0 });
      b += poly([[0, -108], [-9, -94], [-3, -94], [-3, -84], [3, -84], [3, -94], [9, -94]], '#fff', { sw: 1.6, stroke: '#c68a12' });
      return piece('fx.levelup', 80, 140, 40, 120, b);
    }
    case 'grenade': {
      // 抛出去的手雷：黑铁球 + 十字凹槽 + 引信火星
      const b = ell(0, 0, 5.6, 5.6, '#2a2b36', { sw: 2 }) + path('M-4.6,0 L4.6,0 M0,-4.6 L0,4.6', 'none', { stroke: '#4a4e5c', sw: 1.1 }) +
        ell(-1.8, -2, 1.7, 1.2, '#8a90a4', { sw: 0 }) + ell(0, -6.4, 1.8, 1.4, C.gold!, { sw: 0.9 }) + poly(star(4, -9, 4, 3.6, 1.4, 0.4), C.fireL!, { sw: 0.8 });
      return piece('fx.grenade', 24, 26, 12, 15, b);
    }
    case 'shock': {
      // 震荡弹：发蓝光的能量球 + 一圈亮环
      const b = ell(0, 0, 11, 11, '#4fb4ff', { sw: 0, op: 0.28 }) + ell(0, 0, 7.2, 7.2, '#8fe0ff', { sw: 1.6, stroke: '#2a7ac0', op: 0.95 }) + ell(0, 0, 3.6, 3.6, '#ffffff', { sw: 0 }) +
        path('M-10,0 A10,10 0 0 1 10,0', 'none', { stroke: '#d8f6ff', sw: 1.2, op: 0.8 });
      return piece('fx.shock', 28, 28, 14, 14, b);
    }
    case 'stars':
      // 头顶转的一颗小星（被震晕）：场景按三颗绕头转着摆
      return piece('fx.stars', 14, 14, 7, 7, poly(star(0, 0, 5, 5.6, 2.4, -Math.PI / 2), '#ffe36a', { sw: 1, stroke: '#c68a12' }));
    case 'coins': {
      let b = '';
      const cs: Array<[number, number, number]> = [[-26, -22, 6], [-10, -34, 5.4], [8, -36, 6], [24, -24, 5], [-34, -6, 4.6], [32, -6, 4.6], [0, -20, 6.4]];
      for (const [x, y, r] of cs) b += ell(x, y + 1.4, r, r * 0.82, C.goldD!, { sw: 1.4 }) + ell(x, y, r, r * 0.82, C.gold!, { sw: 1.6 }) + ell(x - r * 0.25, y - r * 0.2, r * 0.4, r * 0.25, C.goldL!, { sw: 0 });
      b += poly(star(0, -4, 6, 10, 4), '#fff6c8', { sw: 1.2 });
      for (const [x, y] of [[-20, -28], [18, -34], [-4, -44]] as const) b += poly(star(x, y, 4, 4, 1.4), '#fff', { sw: 0 });
      return piece('fx.coins', 84, 64, 42, 48, b);
    }
    default: {
      let b = ell(0, 0, 24, 12, '#7be08a', { sw: 0, op: 0.28 }) + ell(0, 0, 24, 12, 'none', { sw: 2, stroke: '#4fd07a', op: 0.7 });
      b += poly([[-4, -16], [4, -16], [4, -4], [16, -4], [16, 4], [4, 4], [4, 16], [-4, 16], [-4, 4], [-16, 4], [-16, -4], [-4, -4]], '#5fe083', { sw: 2.2 });
      b += poly([[-2, -13], [2, -13], [2, -2], [-2, -2]], '#c9ffd6', { sw: 0 });
      for (const [x, y] of [[-20, -10], [20, -12], [18, 12], [-18, 12]] as const) b += poly(star(x, y, 4, 4, 1.2), '#d8ffe0', { sw: 1 });
      return piece('fx.heal', 56, 48, 28, 24, b);
    }
  }
}
void f;

const cache = new Map<FxKind, ArtPiece>();
export function fxArt(kind: FxKind): ArtPiece {
  let a = cache.get(kind);
  if (!a) cache.set(kind, (a = make(kind)));
  return a;
}

// ================================================================= 多帧打击特效

type FrameKind = 'hit' | 'boom' | 'collapse' | 'slash' | 'muzzle';
const fcache = new Map<FrameKind, ArtPiece[]>();

function rnd(i: number, k: number): number {
  return (((Math.imul(i * 7919 + k * 104729, 2654435761) >>> 0) % 1000) / 1000);
}

/** 命中火花 4 帧：亮闪 → 火花四散 → 变小 → 消散 */
function hitFrames(): ArtPiece[] {
  return [0, 1, 2, 3].map((i) => {
    const t = i / 3;
    let b = '';
    if (i === 0) b += poly(star(0, 0, 8, 17, 6, 0.2), '#fff', { sw: 1.4, stroke: C.fireL! }) + ell(0, 0, 8, 8, '#fff8d0', { sw: 0 });
    for (let k = 0; k < 8; k++) {
      const an = (k / 8) * Math.PI * 2 + 0.3;
      const r0 = 6 + t * 14;
      const r1 = r0 + 8 - t * 4;
      b += line([Math.cos(an) * r0, Math.sin(an) * r0], [Math.cos(an) * r1, Math.sin(an) * r1], k % 2 ? C.fireL! : '#fff', Math.max(1, 3 - t * 2), 1 - t * 0.6);
    }
    if (i < 3) b += poly(star(0, 0, 6, 10 - i * 3, 4 - i), C.orange!, { sw: 0, op: 0.9 - i * 0.2 });
    return piece(`fx.hit.${i}`, 56, 56, 28, 28, b);
  });
}

/** 爆炸 6 帧：白闪 → 火球膨胀 → 最大 → 烟升起 → 烟散 */
function boomFrames(): ArtPiece[] {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    let b = '';
    const grow = [0.35, 0.7, 1, 1.05, 1.1, 1.1][i]!;
    const fade = [1, 1, 1, 0.8, 0.5, 0.25][i]!;
    if (i < 5) {
      b += `<g opacity="${fade}">` + poly(star(0, 0, 12, 46 * grow, 26 * grow, 0.1 + i * 0.12), '#e8431a', { sw: 2.6 }) + poly(star(0, 0, 10, 36 * grow, 20 * grow, 0.3 + i * 0.1), C.orange!, { sw: 0 }) + poly(star(0, 0, 8, 26 * grow, 14 * grow, 0.5), C.fireL!, { sw: 0 });
      if (i < 3) b += ell(0, 0, 14 * grow, 14 * grow, '#fff8d8', { sw: 0 });
      b += '</g>';
    }
    if (i === 0) b += ell(0, 0, 30, 30, '#fff', { sw: 0, op: 0.7 });
    if (i >= 2) {
      const up = (i - 1) * 8;
      for (const [x, y, r] of [[-24, -14, 14], [8, -26, 16], [26, -6, 13], [-6, -4, 15]] as const) b += ell(x, y - up, r * (0.7 + i * 0.12), r * (0.6 + i * 0.1), i >= 4 ? C.smoke! : C.smokeD!, { sw: 1.6, stroke: C.ink!, op: i === 5 ? 0.3 : 0.6 });
    }
    return piece(`fx.boom.${i}`, 120, 120, 60, 62, b);
  });
}

/** 建筑倒塌烟尘 5 帧：尘云涨开、碎块下落、尘落 */
function collapseFrames(): ArtPiece[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const t = i / 4;
    let b = '';
    for (let k = 0; k < 7; k++) {
      const ax = (rnd(k, 1) - 0.5) * 100 * (0.5 + t);
      const ay = (rnd(k, 2) - 0.5) * 24 - t * 18 - k % 2 * 6;
      const r = (12 + rnd(k, 3) * 12) * (0.6 + t * 0.8);
      b += ell(ax, ay, r, r * 0.72, k % 2 ? '#c9c2b2' : '#a79f8e', { sw: 1.6, stroke: '#5a5448', op: 0.9 - t * 0.6 });
    }
    for (let k = 0; k < 8; k++) {
      const x = (rnd(k, 4) - 0.5) * 80 * (0.4 + t);
      const y = -34 + rnd(k, 5) * 10 + t * t * 52 - (1 - t) * 20;
      b += poly([[x - 3, y], [x, y - 3.4], [x + 3.4, y + 1], [x, y + 3.4]], k % 3 ? '#8a847a' : C.woodD!, { sw: 1.2 });
    }
    if (i <= 1) b += poly(star(0, -6, 8, 26 - i * 6, 10), C.fireL!, { sw: 0, op: 0.6 });
    return piece(`fx.collapse.${i}`, 140, 100, 70, 62, b);
  });
}

/** 刀光弧 4 帧：新月形白光从上往下扫，渐亮渐淡 */
function slashFrames(): ArtPiece[] {
  return [0, 1, 2, 3].map((i) => {
    const sweep = [0.35, 0.65, 1, 1][i]!;
    const op = [0.9, 1, 0.8, 0.35][i]!;
    const a0 = -2.4;
    const a1 = a0 + sweep * 2.8;
    const R = 26;
    const px = (a: number, r: number): string => `${f(Math.cos(a) * r)},${f(Math.sin(a) * r * 0.9)}`;
    const d = `M${px(a0, R)} A${R},${R * 0.9} 0 0 1 ${px(a1, R)} A${R - 9},${(R - 9) * 0.9} 0 0 0 ${px(a0 + 0.1, R - 9)} Z`;
    let b = path(d, '#fff', { sw: 1.6, stroke: '#bfe6ff', op });
    b += path(`M${px(a0 + 0.2, R - 3)} A${R - 3},${(R - 3) * 0.9} 0 0 1 ${px(a1 - 0.1, R - 3)}`, 'none', { stroke: '#e8f6ff', sw: 3, op });
    if (i >= 1) b += poly(star(Math.cos(a1) * R, Math.sin(a1) * R * 0.9, 4, 7, 2), '#fff', { sw: 0, op });
    return piece(`fx.slash.${i}`, 70, 70, 35, 35, b);
  });
}

/** 枪口火光 3 帧：大闪 → 缩小 → 一缕烟 */
function muzzleFrames(): ArtPiece[] {
  return [0, 1, 2].map((i) => {
    let b = '';
    if (i === 0) b += poly([[0, 0], [10, -10], [22, -3], [34, -5], [24, 1], [36, 6], [22, 5], [12, 12]], C.fireL!, { sw: 1.6 }) + poly([[2, 0], [12, -4], [24, 0], [12, 4]], '#fff', { sw: 0 });
    else if (i === 1) b += poly([[0, 0], [8, -6], [16, -2], [22, 0], [16, 3], [8, 6]], C.orange!, { sw: 1.4 }) + poly([[2, 0], [10, -2], [16, 0], [10, 2]], '#fff4b0', { sw: 0 });
    else b += ell(6, -4, 6, 4, C.smokeL!, { sw: 1.2, stroke: '#5d5f6b', op: 0.6 }) + ell(14, -8, 5, 3.4, C.smokeL!, { sw: 1, stroke: '#5d5f6b', op: 0.4 });
    return piece(`fx.muzzle.${i}`, 48, 32, 6, 16, b);
  });
}

/** 打击感特效的多帧版：hit 4 帧、boom 6 帧、collapse 5 帧、slash 4 帧、muzzle 3 帧；各帧画布和锚点一致 */
export function fxFrames(kind: FrameKind): ArtPiece[] {
  let r = fcache.get(kind);
  if (!r) {
    r = kind === 'hit' ? hitFrames() : kind === 'boom' ? boomFrames() : kind === 'collapse' ? collapseFrames() : kind === 'slash' ? slashFrames() : muzzleFrames();
    fcache.set(kind, r);
  }
  return r;
}
