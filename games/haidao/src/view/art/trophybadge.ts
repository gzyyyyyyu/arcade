/**
 * 攻防段位徽章（7 档，按序号画，名字和分数线归内容表）：盾形底板 + 一艘船，船越来越大、桅越来越多：
 * 0 舢板（划桨小艇）、1 单桅、2 双桅、3 三桅、4 战舰（加一排炮窗）、5 旗舰（加炮窗和长燕尾旗）、6 海王（再加王冠）。
 * 底板颜色两档一换：铜 → 银 → 金 → 紫（海王）。不做配色分级（pieceRaw），金属色要和档位一一对应。
 */
import type { ArtPiece, Pt } from './kit.ts';
import { ell, f, line, path, pieceRaw, poly } from './kit.ts';
import { PALETTE as C } from './palette.ts';

export const TROPHY_TIERS = 7;
const S = 64;

/** 底板 [主色, 亮边, 暗边] */
const PLATE: ReadonlyArray<readonly [string, string, string]> = [
  ['#b4733c', '#e2a46a', '#6e3f1c'],
  ['#b4733c', '#e2a46a', '#6e3f1c'],
  ['#a9b4bf', '#e4ecf2', '#5d6873'],
  ['#a9b4bf', '#e4ecf2', '#5d6873'],
  ['#e0b23a', '#ffe08a', '#8a6414'],
  ['#e0b23a', '#ffe08a', '#8a6414'],
  ['#8a4fc8', '#c9a2f2', '#45207a'],
];

/** 盾形底板：上平、两肩圆、下面收成尖 */
function plate(tier: number): string {
  const [c, hi, lo] = PLATE[tier]!;
  const d = 'M8,8 h48 q2,0 2,2 v20 q0,16 -26,28 q-26,-12 -26,-28 v-20 q0,-2 2,-2 z';
  let o = path(d, lo, { sw: 2, stroke: C.ink! });
  o += `<path d="M11,11 h42 v19 q0,13 -21,23 q-21,-10 -21,-23 z" fill="${c}"/>`;
  o += `<path d="M11,11 h42 v5 h-42 z" fill="${hi}" opacity="0.7"/>`;
  return o;
}

/** 一面三角帆（左上角 (x, top)，宽 w、高 h） */
const sail = (x: number, top: number, w: number, h: number): string =>
  path(`M${f(x)},${f(top)} q${f(w * 0.9)},${f(h * 0.45)} ${f(w * 0.1)},${f(h)} z`, C.cream!, { sw: 1.2, stroke: C.ink! });

/** 船：中心 x = 32、吃水线 y，按档位长大 */
function ship(tier: number): string {
  const k = 0.85 + tier * 0.04;
  const wl = 39;
  const hw = 15 * k;
  const p = (dx: number, dy: number): Pt => [32 + dx * k, wl + dy * k];
  let o = '';
  // 海浪
  const n = Math.max(2, Math.round((hw * 2) / 6));
  o += path(`M${f(32 - n * 3)},${wl + 2} q1.5,-2.5 3,0${' t3,0'.repeat(n * 2 - 1)}`, 'none', { sw: 1.6, stroke: C.seaLight! });
  if (tier === 0) {
    // 舢板：小艇 + 一对桨
    o += line(p(-8, -10), p(-17, 2), C.cream!, 2) + line(p(8, -10), p(17, 2), C.cream!, 2);
    o += poly([p(-14, -8), p(14, -8), p(9, 0), p(-9, 0)], C.woodDD!, { sw: 1.4, stroke: C.ink! }) + line(p(-13, -7), p(13, -7), C.woodL!, 1.2);
    return o;
  }
  const masts = Math.min(3, tier);
  const mh = 22;
  const xs = masts === 1 ? [0] : masts === 2 ? [-5, 6] : [-8, 1, 9];
  for (const [i, dx] of xs.entries()) {
    const h = mh - (masts === 3 && i !== 1 ? 4 : 0);
    o += line(p(dx, -6), p(dx, -6 - h), C.woodDD!, 1.6);
    o += sail(p(dx, 0)[0] + 1, p(0, -5 - h)[1], 9 * k, (h - 4) * k);
  }
  if (tier >= 5) {
    const top = p(xs[1] ?? 0, -6 - mh);
    o += path(`M${f(top[0])},${f(top[1])} l12,2 l-4,2 l4,2 l-12,0 z`, C.red!, { sw: 0.8, stroke: C.ink! });
  }
  // 船身：船头在右、船尾高
  o += poly([p(-16, -10), p(-12, -6), p(16, -6), p(19, -9), p(12, 0), p(-12, 0)], tier >= 4 ? C.woodDD! : C.wood!, { sw: 1.4, stroke: C.ink! });
  if (tier >= 4) for (const dx of [-8, -2, 4, 10]) o += ell(p(dx, -3)[0], p(dx, -3)[1], 1.3, 1.3, C.gold!, { sw: 0 });
  return o;
}

/** 王冠（海王）：浮在底板顶上 */
function crown(): string {
  const p = (dx: number, dy: number): Pt => [32 + dx, 9 + dy];
  let o = poly([p(-9, 4), p(-9, -5), p(-4.5, 0), p(0, -8), p(4.5, 0), p(9, -5), p(9, 4)], C.gold!, { sw: 1.4, stroke: C.ink! });
  o += ell(32, 6, 1.6, 1.6, C.red!, { sw: 0.6 });
  return o;
}

/** 第 tier 档（0–6）的徽章，64×64、锚点在中心，key `trophy.<档>` */
export function trophyBadgeArt(tier: number): ArtPiece {
  const t = Math.max(0, Math.min(TROPHY_TIERS - 1, Math.floor(tier)));
  const body = plate(t) + ship(t) + (t === 6 ? crown() : '');
  return pieceRaw(`trophy.${t}`, S, S, S / 2, S / 2, `<g transform="translate(${-S / 2} ${-S / 2})">${body}</g>`);
}

export const trophyBadgeAll = (): ArtPiece[] => Array.from({ length: TROPHY_TIERS }, (_, i) => trophyBadgeArt(i));
