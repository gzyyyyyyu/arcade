/** 海图用的素材：12 座关卡小岛（俯视斜 45°，约 128×96）和点缀（浪、海鸥、礁石、罗盘、小船）。锚点 = 岛中心。 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece } from './kit.ts';
import { darken, ell, f, inner, lighten, line, path, piece, poly, rect, skull, uid } from './kit.ts';
import { krakenArt } from './buildings.ts';

const W = 128;
const H = 96;
const AX = 64;
const AY = 56;

function base(rx = 44, ry = 21, sandy = false): string {
  const g = uid('mi');
  let s = `<defs><radialGradient id="${g}"><stop offset="0.55" stop-color="${C.shallowL}" stop-opacity="0.95"/><stop offset="1" stop-color="${C.shallow}" stop-opacity="0"/></radialGradient></defs>`;
  s += ell(4, 8, rx + 16, ry + 11, '#0b3a55', { sw: 0, op: 0.22 });
  s += ell(0, 4, rx + 15, ry + 9, `url(#${g})`, { sw: 0 });
  s += path(`M${-rx - 7},3 q${rx / 2},-${ry + 7} ${rx + 7},-${ry + 7} t${rx + 7},${ry + 7} q-6,${ry + 8} -${rx + 7},${ry + 8} t-${rx + 7},-${ry + 8}`, '#fff', { sw: 0, op: 0.5 });
  // 沙边厚度
  s += ell(0, 7, rx, ry, '#c79a52', { sw: 2, stroke: '#7a5424' });
  s += ell(0, 3, rx, ry, C.sand!, { sw: 2, stroke: '#a97c3c' });
  if (!sandy) s += ell(0, 1, rx * 0.78, ry * 0.74, C.grass!, { sw: 0 }) + ell(-rx * 0.2, -ry * 0.12, rx * 0.5, ry * 0.4, C.grassL!, { sw: 0, op: 0.5 });
  else s += ell(-4, 0, rx * 0.6, ry * 0.5, C.sandL!, { sw: 0, op: 0.8 });
  return s;
}

function pflag(x: number, y: number, h = 24, big = false): string {
  const w = big ? 20 : 15;
  return line([x, y], [x, y - h], C.woodDD!, 2.2) + path(`M${x + 1},${y - h} q${w * 0.5},-3 ${w},1 l-2,${w * 0.35} l2,${w * 0.35} q-${w * 0.5},-3 -${w},0 z`, C.black!, { sw: 1.5 }) + skull(x + w * 0.45, y - h + w * 0.36, w * 0.5, false);
}

function palm(x: number, y: number, k = 1): string {
  let s = `<g transform="translate(${x} ${y}) scale(${k})">`;
  s += path('M0,0 C3,-8 1,-16 -2,-24', 'none', { stroke: C.ink!, sw: 5.4 }) + path('M0,0 C3,-8 1,-16 -2,-24', 'none', { stroke: '#a8723d', sw: 3.4 });
  for (const [dx, dy] of [[-14, 2], [-9, 8], [8, 6], [14, 0], [0, -8]] as const) s += path(`M-2,-24 Q${-2 + dx * 0.6},${-24 + dy - 8} ${-2 + dx},${-24 + dy + 4} Q${-2 + dx * 0.5},${-24 + dy} -2,-23 Z`, dx < 0 ? C.grass! : C.grassD!, { sw: 1.4 });
  return s + '</g>';
}

function rockP(x: number, y: number, k = 1, c = '#9aa2a9'): string {
  return poly([[x - 10 * k, y + 3 * k], [x - 9 * k, y - 6 * k], [x - 1 * k, y - 11 * k], [x + 9 * k, y - 6 * k], [x + 11 * k, y + 3 * k], [x, y + 6 * k]], c, { sw: 1.8 }) + poly([[x - 9 * k, y - 6 * k], [x - 1 * k, y - 11 * k], [x + 2 * k, y - 5 * k], [x - 5 * k, y - 1 * k]], lighten(c, 0.3), { sw: 0 });
}

function tower(x: number, y: number, h: number, w: number, body: string, roof: string): string {
  return rect(x - w / 2, y - h, w, h, body, { sw: 1.8 }) + rect(x + w * 0.1, y - h, w * 0.4, h, darken(body, 0.2), { sw: 0 }) + poly([[x - w / 2 - 2, y - h], [x, y - h - w * 0.9], [x + w / 2 + 2, y - h]], roof, { sw: 1.8 });
}

function cannonP(x: number, y: number): string {
  return ell(x, y, 8, 4, C.stoneD!, { sw: 1.6 }) + line([x - 3, y - 3], [x + 8, y + 1], C.ironD!, 5.4) + ell(x + 8, y + 1, 1.8, 2.8, '#101018', { sw: 1 }) + ell(x - 3, y - 2, 3.4, 3.4, C.woodD!, { sw: 1.4 });
}

function variant(v: number): string {
  let s = '';
  switch (v) {
    case 0: // 沙洲 + 棕榈
      s += base(40, 19, true) + palm(-10, 2, 1.1) + palm(12, 5, 0.85) + ell(20, -2, 4, 2, C.sandD!, { sw: 0 }) + pflag(-24, 4, 20);
      break;
    case 1: // 红帆旗
      s += base() + pflag(-14, 2, 30, true);
      s += line([14, -4], [14, -34], C.woodDD!, 2.6) + path('M15,-34 Q34,-22 15,-8 Z', C.red!, { sw: 1.8 }) + path('M15,-34 Q26,-24 15,-8 Q20,-22 15,-34 Z', darken(C.red!, 0.2), { sw: 0 });
      s += path('M4,2 L30,2 L26,8 L8,8 Z', C.wood!, { sw: 1.6 });
      break;
    case 2: // 沉船残骸
      s += base(42, 20, true);
      s += path('M-30,4 Q-8,16 22,6 L26,-4 Q-6,6 -30,-2 Z', C.woodD!, { sw: 2 });
      for (let i = 0; i < 5; i++) s += path(`M${-24 + i * 11},${2 - i * 0.6} q2,-14 ${3},-20`, 'none', { stroke: C.ink!, sw: 5 }) + path(`M${-24 + i * 11},${2 - i * 0.6} q2,-14 ${3},-20`, 'none', { stroke: C.wood!, sw: 3 });
      s += line([2, -4], [10, -34], C.woodDD!, 4) + path('M9,-30 l16,6 l-14,8 z', C.creamD!, { sw: 1.4 }) + pflag(-30, -2, 18);
      break;
    case 3: { // 雾
      s += base();
      s += palm(-8, 0, 1) + pflag(14, 2, 22);
      for (const [x, y, rx, ry, o] of [[-26, -4, 26, 11, 0.7], [20, -10, 28, 12, 0.65], [0, 8, 34, 12, 0.6], [-8, -24, 24, 10, 0.55]] as const) s += ell(x, y, rx, ry, '#f1f6f8', { sw: 0, op: o });
      break;
    }
    case 4: // 骷髅礁石
      s += base(42, 20, true) + rockP(-18, 6, 1.4, '#7d858e') + rockP(18, 6, 1.2, '#8a929a');
      s += path('M-20,2 Q-22,-20 0,-26 Q22,-20 20,2 Q10,6 0,4 Q-10,6 -20,2 Z', '#b9bfc5', { sw: 2.2 }) + path('M0,-26 Q22,-20 20,2 Q10,6 0,4 Z', '#8e969d', { sw: 0, op: 0.7 });
      s += skull(0, -10, 20, false) + pflag(30, 2, 22);
      break;
    case 5: // 铁锚
      s += base() + path('M0,-34 L0,2 M-12,-22 L12,-22', 'none', { stroke: C.ink!, sw: 7 }) + path('M0,-34 L0,2 M-12,-22 L12,-22', 'none', { stroke: C.ironL!, sw: 4 });
      s += path('M-18,-8 Q-16,6 0,6 Q16,6 18,-8', 'none', { stroke: C.ink!, sw: 7 }) + path('M-18,-8 Q-16,6 0,6 Q16,6 18,-8', 'none', { stroke: C.ironL!, sw: 4 });
      s += poly([[-22, -12], [-18, -6], [-12, -10]], C.ironL!, { sw: 1.6 }) + poly([[22, -12], [18, -6], [12, -10]], C.ironL!, { sw: 1.6 });
      s += ell(0, -36, 4.4, 4.4, 'none', { sw: 3.4, stroke: C.ironL! }) + pflag(-30, 4, 20);
      break;
    case 6: { // 黑珍珠 + 宝箱
      s += base(42, 20, true);
      s += path('M-34,-2 Q-30,10 -8,10 L12,8 Q24,4 28,-8 Q8,0 -34,-2 Z', '#2c313c', { sw: 2 }) + line([-4, 0], [-4, -38], C.woodDD!, 3);
      s += path('M-2,-36 Q20,-24 -2,-6 Z', '#3a3a48', { sw: 1.8 }) + skull(5, -22, 10, false) + path('M-6,-34 Q-22,-22 -6,-8 Z', '#2c2c38', { sw: 1.8 });
      s += rect(18, -4, 20, 12, C.woodD!, { sw: 1.8 }) + path('M18,-4 Q28,-16 38,-4 Z', C.wood!, { sw: 1.8 }) + rect(26, -6, 4, 6, C.gold!, { sw: 1 }) + ell(24, -8, 3, 2, C.gold!, { sw: 0.8 }) + ell(33, -8, 2.6, 1.8, C.gold!, { sw: 0.8 });
      break;
    }
    case 7: { // 龟壳形堡垒
      s += base(44, 21);
      s += ell(0, -6, 30, 18, '#5c8f4a', { sw: 2.2 }) + path('M-30,-6 A30,22 0 0 1 30,-6 A30,16 0 0 1 -30,-6 Z', '#6aa65a', { sw: 2.2 });
      for (const [x, y] of [[0, -22], [-14, -14], [14, -14], [-8, -6], [8, -6], [0, -12]] as const) s += poly([[x - 7, y], [x - 3.5, y - 4.5], [x + 3.5, y - 4.5], [x + 7, y], [x + 3.5, y + 4.5], [x - 3.5, y + 4.5]], '#8cc66e', { sw: 1.4 });
      s += ell(36, -2, 8, 6, '#6aa65a', { sw: 2 }) + ell(39, -3, 1.8, 1.8, '#fff', { sw: 0 }) + ell(40, -3, 0.9, 0.9, '#222', { sw: 0 });
      s += tower(-14, -8, 14, 9, C.stone!, C.red!) + pflag(14, -6, 20);
      break;
    }
    case 8: // 成排炮台
      s += base(46, 20, true) + rect(-34, -12, 68, 9, '#a9b0b6', { sw: 2 }) + line([-34, -9], [34, -9], '#8b929a', 1, 1);
      for (const x of [-24, -2, 20]) s += cannonP(x, -14);
      s += pflag(36, -2, 24) + ell(-30, 4, 3, 3, '#3b3d49', { sw: 1.2 }) + ell(-24, 6, 3, 3, '#3b3d49', { sw: 1.2 });
      break;
    case 9: { // 蛇形礁
      s += ell(4, 8, 54, 24, '#0b3a55', { sw: 0, op: 0.2 }) + ell(0, 4, 56, 25, C.shallowL!, { sw: 0, op: 0.55 });
      const body = 'M-48,6 Q-34,-18 -18,-2 T14,-4 T44,-6';
      s += path(body, 'none', { stroke: C.ink!, sw: 18 }) + path(body, 'none', { stroke: '#2f9d6a', sw: 14 }) + path(body, 'none', { stroke: '#7fe0a0', sw: 4, op: 0.8 });
      for (let i = 0; i < 6; i++) s += ell(-40 + i * 17, -2 + (i % 2) * -6, 2.2, 2.2, '#1b6b48', { sw: 0 });
      s += ell(48, -8, 10, 8, '#2f9d6a', { sw: 2 }) + ell(51, -10, 2, 2, '#ffe14a', { sw: 0 }) + path('M56,-8 l8,-2 m-8,2 l8,4', 'none', { stroke: C.red!, sw: 1.4 }) + pflag(-8, 0, 22);
      break;
    }
    case 10: // 火山 / 火焰要塞
      s += base(44, 21, true);
      s += poly([[-30, 4], [-10, -36], [10, -36], [30, 4]], '#6b4a3a', { sw: 2.2 }) + poly([[10, -36], [30, 4], [8, 6], [4, -10]], '#4d3328', { sw: 0, op: 0.8 });
      s += path('M-8,-36 Q0,-30 8,-36 L10,-40 Q0,-46 -10,-40 Z', '#ff6a1f', { sw: 1.8 }) + path('M-4,-40 Q0,-52 4,-40 Q8,-58 12,-42 L-6,-42 Z', C.fire!, { sw: 1.4 }) + path('M-1,-42 Q1,-50 3,-42Z', C.fireL!, { sw: 0 });
      s += path('M0,-34 Q-4,-20 -10,-8 M2,-34 Q8,-18 6,-4', 'none', { stroke: '#ff8a2a', sw: 2.4, op: 0.9 });
      s += tower(-30, 2, 14, 10, '#5a5f68', '#7a2a1f') + tower(30, 2, 12, 9, '#5a5f68', '#7a2a1f') + pflag(0, -28, 12);
      break;
    default: // 王座城堡
      s += base(46, 22);
      s += rect(-24, -14, 48, 16, C.stone!, { sw: 2 }) + rect(0, -14, 24, 16, '#8b929a', { sw: 0 }) + path('M-8,2 L-8,-6 Q0,-14 8,-6 L8,2 Z', '#2a1a14', { sw: 1.6 });
      s += tower(-26, 0, 28, 12, '#b9bfc5', C.red!) + tower(26, 0, 28, 12, '#b9bfc5', C.red!) + tower(0, -12, 36, 16, '#c6cbd0', C.red!);
      s += poly([[-4, -50], [-2, -56], [0, -52], [2, -56], [4, -50]], C.gold!, { sw: 1.2 }) + pflag(0, -52, 16, true) + ell(0, 2, 5, 3, C.gold!, { sw: 1.2 });
      break;
  }
  return s;
}

/** 首领岛底座：更大、红金光环 */
function bossBase(): string {
  const g = uid('bb');
  let s = `<defs><radialGradient id="${g}"><stop offset="0.5" stop-color="#ffb3a0" stop-opacity="0.9"/><stop offset="1" stop-color="#ff6a5a" stop-opacity="0"/></radialGradient></defs>`;
  s += ell(6, 12, 82, 36, '#0b3a55', { sw: 0, op: 0.25 }) + ell(0, 6, 80, 34, `url(#${g})`, { sw: 0 });
  s += ell(0, 4, 74, 30, C.shallowL!, { sw: 0, op: 0.7 }) + ell(0, 9, 62, 27, '#c79a52', { sw: 2.2, stroke: '#7a5424' }) + ell(0, 4, 62, 27, C.sand!, { sw: 2.2, stroke: '#a97c3c' });
  s += ell(0, 4, 66, 29, 'none', { sw: 3, stroke: C.gold!, op: 0.85 });
  return s;
}
function bossFlag(x: number, y: number): string {
  return line([x, y], [x, y - 46], C.woodDD!, 3) + path(`M${x + 1},${y - 46} q15,-5 32,2 l-4,11 l4,11 q-16,-6 -32,0 z`, C.black!, { sw: 2 }) + skull(x + 15, y - 35, 12, false) + ell(x, y - 47, 3, 3, C.gold!, { sw: 1.2 });
}
function boss(k: number): string {
  let s = bossBase();
  switch (k) {
    case 0: { // 炮台阵
      s += ell(0, 0, 50, 21, C.grass!, { sw: 0 }) + rect(-46, -20, 92, 12, '#a9b0b6', { sw: 2 }) + rect(-34, 6, 68, 10, '#a9b0b6', { sw: 2 });
      for (const x of [-38, -19, 0, 19, 38]) s += cannonP(x, -24);
      for (const x of [-24, 0, 24]) s += cannonP(x, 2);
      s += tower(-50, -4, 24, 14, C.stone!, C.red!) + tower(50, -4, 24, 14, C.stone!, C.red!) + bossFlag(0, -26);
      break;
    }
    case 1: { // 海怪岛
      s += ell(-24, 0, 36, 16, C.grass!, { sw: 0 }) + palm(-36, 0, 1.1) + rockP(-10, 6, 1.1);
      s += `<g transform="translate(34 18) scale(0.58)">${inner(krakenArt('idle', 5).svg).replace(/^/, `<g transform="translate(${-krakenArt('idle', 5).ax} ${-krakenArt('idle', 5).ay})">`)}</g></g>`;
      s += bossFlag(-24, -4);
      break;
    }
    case 2: { // 迷雾岛
      s += ell(0, 0, 48, 20, '#6e8f6a', { sw: 0 });
      s += rect(-9, -46, 18, 46, '#8a82a8', { sw: 2 }) + rect(0, -46, 9, 46, '#6a6288', { sw: 0 }) + ell(0, -48, 13, 6, '#c9a8ff', { sw: 1.8 }) + bossFlag(-30, 2);
      for (const [x, y, rx, ry, o] of [[-40, -4, 30, 13, 0.8], [38, -10, 30, 13, 0.8], [0, 10, 46, 14, 0.75], [-14, -34, 24, 11, 0.7], [20, -44, 22, 10, 0.65], [0, -58, 20, 9, 0.6]] as const) s += ell(x, y, rx, ry, '#d6d0e8', { sw: 0, op: o });
      break;
    }
    case 3: { // 沥青沼泽
      s += ell(0, 0, 54, 22, '#2c2634', { sw: 2 }) + ell(-4, -2, 42, 15, '#1a1620', { sw: 0 });
      for (const [x, y, r] of [[-24, -4, 7], [0, 2, 9], [24, -2, 6], [-8, -10, 5], [14, -10, 4]] as const) s += ell(x, y, r, r * 0.7, '#3a3344', { sw: 1.6, stroke: C.ink! }) + ell(x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.2, '#bdb4d6', { sw: 0 });
      for (const x of [-44, 40]) s += path(`M${x},4 q2,-18 -4,-30 M${x},-12 q8,-8 12,-6 M${x},-20 q-8,-6 -12,-4`, 'none', { stroke: C.ink!, sw: 5 }) + path(`M${x},4 q2,-18 -4,-30 M${x},-12 q8,-8 12,-6 M${x},-20 q-8,-6 -12,-4`, 'none', { stroke: '#4a3a2e', sw: 2.6 });
      s += bossFlag(0, -6);
      break;
    }
    case 4: { // 火箭要塞
      s += ell(0, 0, 50, 21, '#8a8f98', { sw: 0 }) + rect(-34, -22, 68, 22, '#a9b0b6', { sw: 2 }) + rect(0, -22, 34, 22, '#8b929a', { sw: 0 });
      for (let i = 0; i < 6; i++) {
        const x = -30 + i * 12;
        s += rect(x - 3.6, -48 + (i % 2) * 6, 7.2, 30, '#4a5362', { sw: 1.8 }) + poly([[x - 3.6, -48 + (i % 2) * 6], [x, -60 + (i % 2) * 6], [x + 3.6, -48 + (i % 2) * 6]], C.red!, { sw: 1.6 });
      }
      s += tower(-48, 0, 26, 14, C.stone!, C.red!) + tower(48, 0, 26, 14, C.stone!, C.red!) + bossFlag(0, -20);
      break;
    }
    default: { // 骷髅王城
      s += ell(0, 0, 50, 21, C.grass!, { sw: 0 });
      s += path('M-34,0 L-34,-30 Q-34,-62 0,-66 Q34,-62 34,-30 L34,0 Z', '#d9d4c4', { sw: 2.6 }) + path('M10,-64 Q34,-60 34,-30 L34,0 L8,0 Z', '#a9a493', { sw: 0, op: 0.8 });
      s += ell(-14, -36, 11, 13, '#1a1620', { sw: 2 }) + ell(14, -36, 11, 13, '#1a1620', { sw: 2 }) + ell(-14, -36, 4, 6, C.red!, { sw: 0 }) + ell(14, -36, 4, 6, C.red!, { sw: 0 });
      s += poly([[0, -26], [-4, -16], [4, -16]], '#1a1620', { sw: 1.6 });
      for (let i = -3; i <= 3; i++) s += rect(i * 8 - 3, -10, 6, 10, '#f2eee0', { sw: 1.6 });
      s += tower(-44, 2, 34, 12, '#b9bfc5', C.red!) + tower(44, 2, 34, 12, '#b9bfc5', C.red!);
      s += path('M-22,-70 L-14,-88 L-6,-74 L0,-92 L6,-74 L14,-88 L22,-70 Z', C.gold!, { sw: 2.2 }) + bossFlag(0, -88 + 14);
      break;
    }
  }
  return s;
}

function build(v: number): ArtPiece {
  if (v % 5 === 4) {
    const k = Math.min(5, Math.floor((v + 1) / 5) - 1);
    return piece(`m.boss.${k}`, 190, 170, 95, 112, boss(k));
  }
  const n = v - Math.floor(v / 5);
  const shape = n % 12;
  const pal = Math.floor(n / 12) % 3;
  const hue = pal === 0 ? 0 : pal === 1 ? 55 : -55;
  let body = variant(shape);
  if (hue) body = `<defs><filter id="hue${v}"><feColorMatrix type="hueRotate" values="${hue}"/></filter></defs><g filter="url(#hue${v})">${body}</g>`;
  return piece(`m.island.${v}`, W, H + 20, AX, AY + 6, body);
}

/** 造型编号（0–11，见 variant 的注释）和首领岛（boss 0–5）→ 序号 v；非首领 n = 造型 + 12 × 配色，v = n + ⌊n/4⌋（跳过每 5 个里的首领位） */
const vOf = (shape: number, pal: number): number => {
  const n = shape + 12 * pal;
  return n + Math.floor(n / 4);
};
/** 序号 v 是哪种造型：{ boss: true, k } 首领岛第 k 种，否则 { boss: false, k: 造型 } */
export function shapeOfVariant(v: number): { boss: boolean; k: number } {
  if (v % 5 === 4) return { boss: true, k: Math.min(5, Math.floor((v + 1) / 5) - 1) };
  return { boss: false, k: (v - Math.floor(v / 5)) % 12 };
}

/**
 * 航线图上每种风格的岛该用哪些造型（和岛的打法对得上）：金库厚 → 黑珍珠宝箱、王座城堡；炮台多 → 成排炮台、红帆旗、龟壳堡垒；
 * 有暗雷 → 骷髅礁石、沉船残骸；臼炮多 → 雾、火山要塞；终点 → 六种首领岛。
 */
export const STYLE_SHAPES = {
  vault: [6, 11],
  cannon: [8, 1, 7],
  mine: [4, 2],
  mortar: [3, 10],
  boss: [0, 1, 2, 3, 4, 5],
} as const satisfies Record<string, readonly number[]>;
export type IsleStyle = keyof typeof STYLE_SHAPES;

/** 岛 id + 风格 → 图的序号：先按风格挑一组造型，再按 id 散列选造型和配色（确定性，同一座岛永远同一张） */
export function isleLook(id: string, style: IsleStyle): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const group = STYLE_SHAPES[style];
  const k = group[h % group.length]!;
  if (style === 'boss') return 5 * k + 4;
  return vOf(k, (h >>> 8) % 2);
}

const cache = new Map<number, ArtPiece>();
/** v = 关卡序号 0–29：每 5 关（v%5==4）是首领岛，其余 24 个按 12 种造型循环、配色换两轮 */
export function mapIslandArt(v: number): ArtPiece {
  const k = Math.max(0, Math.min(29, Math.floor(v)));
  let a = cache.get(k);
  if (!a) cache.set(k, (a = build(k)));
  return a;
}

type DecoKind = 'wave' | 'gull' | 'rock' | 'compass' | 'ship';
function deco(kind: DecoKind): ArtPiece {
  switch (kind) {
    case 'wave':
      return piece('m.wave', 48, 16, 24, 8, path('M-20,2 q5,-6 10,0 t10,0 t10,0 t10,0', 'none', { stroke: '#fff', sw: 2.4, op: 0.85 }) + path('M-12,8 q4,-4 8,0 t8,0', 'none', { stroke: '#fff', sw: 1.8, op: 0.55 }));
    case 'gull':
      return piece('m.gull', 36, 20, 18, 10, path('M-14,2 q7,-9 14,0 q7,-9 14,0', 'none', { stroke: C.ink!, sw: 4 }) + path('M-14,2 q7,-9 14,0 q7,-9 14,0', 'none', { stroke: '#fff', sw: 2.4 }));
    case 'rock':
      return piece('m.rock', 52, 40, 26, 26, ell(2, 6, 20, 7, '#0b3a55', { sw: 0, op: 0.22 }) + ell(0, 5, 20, 8, C.foam!, { sw: 0, op: 0.6 }) + rockP(-6, 2, 1.3, '#8a929a') + rockP(10, 5, 0.9, '#9aa2a9') + path('M-22,10 q5,-4 10,0 t10,0 t10,0', 'none', { stroke: '#fff', sw: 2, op: 0.8 }));
    case 'compass': {
      let s = ell(0, 0, 38, 38, '#f4e3b0', { sw: 2.6, stroke: '#7a5424', op: 0.9 }) + ell(0, 0, 30, 30, 'none', { sw: 1.4, stroke: '#a97c3c' });
      for (let i = 0; i < 8; i++) {
        const an = (i * Math.PI) / 4;
        const r = i % 2 ? 22 : 34;
        const nx = Math.cos(an - Math.PI / 2);
        const ny = Math.sin(an - Math.PI / 2);
        const px = -ny * 5;
        const py = nx * 5;
        s += poly([[nx * r, ny * r], [px, py], [0, 0]], i % 2 ? '#b98a4a' : C.red!, { sw: 1.4 }) + poly([[nx * r, ny * r], [-px, -py], [0, 0]], i % 2 ? '#8c542a' : C.redD!, { sw: 1.4 });
      }
      return piece('m.compass', 84, 84, 42, 42, s + ell(0, 0, 4, 4, C.gold!, { sw: 1.6 }) + path('M0,-38 l-5,-8 h10z', C.ink!, { sw: 0 }));
    }
    default: {
      let s = ell(2, 8, 34, 10, '#0b3a55', { sw: 0, op: 0.22 });
      s += path('M-26,2 Q-22,14 -4,14 L16,12 Q28,8 32,-4 Q10,2 -26,2 Z', C.woodD!, { sw: 2 }) + path('M-26,2 Q10,2 32,-4 Q26,-8 16,-8 L-22,-6 Z', C.wood!, { sw: 2 });
      s += line([-2, -4], [-2, -34], C.woodDD!, 3) + path('M0,-32 Q18,-20 0,-8 Z', C.cream!, { sw: 1.6 }) + path('M0,-32 Q10,-20 0,-8 Q4,-20 0,-32 Z', darken(C.cream!, 0.16), { sw: 0 }) + path('M-4,-30 Q-16,-20 -4,-10 Z', '#f0e6c8', { sw: 1.6 });
      s += path('M-30,12 q5,-4 10,0 t10,0', 'none', { stroke: '#fff', sw: 2, op: 0.8 });
      return piece('m.ship', 80, 64, 38, 44, `<g transform="matrix(0.894 0.447 0 1 0 0)">${s}</g>`);
    }
  }
}
const dcache = new Map<string, ArtPiece>();
export function mapDecoArt(kind: DecoKind): ArtPiece {
  let a = dcache.get(kind);
  if (!a) dcache.set(kind, (a = deco(kind)));
  return a;
}
void f;
