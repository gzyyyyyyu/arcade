/**
 * 船：登陆用的小木船和旗舰。侧视图的船（弧形船底、舷弧、鼓起的帆）整体按等距斜切，
 * 船头朝右下（等距 45°）。锚点 = 水线上的船中心。
 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece } from './kit.ts';
import { darken, ell, f, lighten, line, path, piece, poly, rect, skull } from './kit.ts';
import { rankColors } from './rankflag.ts';

/** 侧视图 (u, v) → 等距：u 沿船身（屏幕右下），v 竖直 */
const ISO = 'matrix(0.894 0.447 0 1 0 0)';

/** rank > 0：自己的船挂王阶涂装（帆用该阶主色、镶边用 trim；0 阶保持原样，DESIGN 2.6） */
function raft(rank = 0): ArtPiece {
  const rc = rankColors(rank);
  let b = ell(4, 8, 50, 20, '#0b3a55', { sw: 0, op: 0.22 }) + ell(0, 6, 44, 15, '#fff', { sw: 0, op: 0.25 });
  let s = '';
  s += path('M-34,-4 Q-30,14 -4,16 L22,14 Q38,8 46,-10 Q20,-2 -34,-4 Z', C.woodD!, { sw: 2.2 });
  s += path('M-34,-4 Q20,-2 46,-10 Q40,-14 30,-14 L-30,-12 Q-34,-10 -34,-4 Z', C.wood!, { sw: 2.2 });
  s += path('M-30,-12 L30,-14 Q40,-14 46,-10', 'none', { stroke: C.woodL!, sw: 1.6, op: 0.8 });
  s += path('M-28,6 Q0,12 36,2', 'none', { stroke: C.gold!, sw: 2 });
  s += poly([[-26, -10], [24, -12], [22, -8], [-24, -6]], '#4a2d17', { sw: 1.2, op: 0.8 });
  s += rect(-16, -17, 5, 6, C.woodL!, { sw: 1.4 }) + rect(4, -18, 5, 6, C.woodL!, { sw: 1.4 });
  s += line([-8, -10], [-18, 12], C.woodDD!, 2.6) + ell(-19, 14, 4, 2, C.woodL!, { sw: 1.4 });
  s += line([14, -12], [8, 14], C.woodDD!, 2.6) + ell(7.5, 16, 4, 2, C.woodL!, { sw: 1.4 });
  if (rc) {
    // 小木船也撑一面小帆：主色加镶边，旗尖用镶边色
    s += line([-30, -10], [-30, -50], C.woodDD!, 2.2) + sail(-29, -46, 20, 24, 4, rc.color, rc.trim);
    s += path('M-29,-52 l12,3 l-12,5z', rc.trim, { sw: 1.2 });
  } else s += line([-30, -10], [-30, -30], C.woodDD!, 2) + path('M-29,-30 l14,3 l-14,5z', C.red!, { sw: 1.4 });
  b += `<g transform="${ISO}">${s}</g>`;
  b += path('M-44,16 q6,-4 12,0 t12,0 M14,26 q6,-4 12,0 t12,0', 'none', { stroke: C.foam!, sw: 2, op: 0.9 });
  return piece(rank ? `s.raft.r${rank}` : 's.raft', 120, 90, 56, 50, b);
}

/** 鼓起的帆：弧形边加一块阴影面 */
function sail(x0: number, y0: number, w: number, h: number, bulge: number, c: string, trim?: string): string {
  const d = `M${f(x0)},${f(y0)} L${f(x0 + w)},${f(y0 + 3)} Q${f(x0 + w + bulge)},${f(y0 + h * 0.5)} ${f(x0 + w - 2)},${f(y0 + h)} Q${f(x0 + w * 0.5)},${f(y0 + h + bulge * 0.7)} ${f(x0 + 2)},${f(y0 + h)} Q${f(x0 - bulge)},${f(y0 + h * 0.5)} ${f(x0)},${f(y0)} Z`;
  let s = path(d, c, { sw: 2.2 });
  s += path(`M${f(x0 + w * 0.55)},${f(y0 + 2)} Q${f(x0 + w + bulge)},${f(y0 + h * 0.5)} ${f(x0 + w - 2)},${f(y0 + h)} Q${f(x0 + w * 0.5)},${f(y0 + h + bulge * 0.7)} ${f(x0 + w * 0.5)},${f(y0 + h)} Q${f(x0 + w * 0.7)},${f(y0 + h * 0.5)} ${f(x0 + w * 0.55)},${f(y0 + 2)} Z`, darken(c, 0.16), { sw: 0, op: 0.85 });
  s += path(`M${f(x0 + 3)},${f(y0 + 4)} Q${f(x0 + w * 0.2)},${f(y0 + h * 0.5)} ${f(x0 + 4)},${f(y0 + h - 3)}`, 'none', { stroke: lighten(c, 0.5), sw: 2, op: 0.7 });
  s += line([x0 - 3, y0], [x0 + w + 3, y0 + 3], C.woodDD!, 3.2);
  // 王阶涂装的镶边：下缘一道、帆面上方一道横带
  if (trim) {
    s += path(`M${f(x0 + 2)},${f(y0 + h - 1)} Q${f(x0 + w * 0.5)},${f(y0 + h + bulge * 0.7 - 1)} ${f(x0 + w - 2)},${f(y0 + h - 1)}`, 'none', { stroke: trim, sw: 2.4 });
    s += line([x0 + 2, y0 + h * 0.2], [x0 + w - 1, y0 + h * 0.2 + 2], trim, 2, 0.9);
  }
  return s;
}

function flagship(rank = 0): ArtPiece {
  const rc = rankColors(rank);
  const sc = (c: string): string => rc?.color ?? c;
  const tm = rc?.trim;
  let b = ell(6, 16, 150, 46, '#0b3a55', { sw: 0, op: 0.22 }) + ell(0, 10, 130, 36, '#fff', { sw: 0, op: 0.2 });
  let s = '';
  const mast = (x: number, top: number): string => line([x, -24], [x, top], '#2f1a0e', 6) + line([x - 1, -24], [x - 1, top], C.woodL!, 1.4, 0.7);
  s += mast(-62, -118) + mast(52, -132) + mast(-4, -168);
  s += sail(-84, -112, 44, 44, 7, sc(C.cream!), tm);
  s += sail(34, -126, 36, 40, 6, sc(C.cream!), tm) + sail(36, -80, 34, 28, 5, sc('#f0e6c8'), tm);
  s += sail(-30, -158, 52, 56, 9, sc(C.cream!), tm);
  s += skull(-4, -132, 24, false);
  s += sail(-26, -96, 46, 38, 7, sc('#f3e9cb'), tm);
  s += path('M-112,-30 Q-118,6 -80,20 L70,22 Q112,16 134,-20 L118,-24 L-100,-34 Z', C.woodD!, { sw: 2.6 });
  s += path('M-112,-30 L-100,-34 L118,-24 L134,-20 Q128,-8 118,-4 L-110,-6 Q-114,-14 -112,-30 Z', C.wood!, { sw: 2.2 });
  s += path('M-110,-8 L120,-6 L126,-10', 'none', { stroke: C.gold!, sw: 3.4 });
  s += path('M-108,0 Q-90,16 -60,19 M-40,20 L60,21', 'none', { stroke: darken(C.woodD!, 0.3), sw: 1.4, op: 0.6 });
  for (let i = 0; i < 5; i++) {
    const x = -78 + i * 38;
    s += rect(x, -20, 14, 11, '#1b110d', { sw: 1.6 }) + rect(x + 10, -17, 10, 5, C.ironD!, { sw: 1.4 });
  }
  s += line([-100, -34], [118, -24], lighten(C.woodL!, 0.1), 2.4);
  s += path('M-112,-30 L-110,-62 L-66,-62 L-62,-32 Z', C.woodD!, { sw: 2.4 });
  s += path('M-114,-62 L-62,-62 L-60,-68 L-116,-68 Z', C.woodL!, { sw: 2 });
  s += rect(-104, -56, 10, 10, '#ffd45a', { sw: 1.6 }) + rect(-88, -56, 10, 10, '#ffd45a', { sw: 1.6 }) + rect(-72, -56, 8, 10, '#ffd45a', { sw: 1.6 });
  for (let x = -56; x < 112; x += 16) s += line([x, -33 + (x + 56) * 0.04], [x, -42 + (x + 56) * 0.04], C.woodDD!, 2);
  s += line([-56, -42], [112, -33], C.woodDD!, 2.2);
  s += line([112, -26], [160, -48], '#2f1a0e', 5);
  s += path('M52,-110 Q120,-96 158,-50 Q110,-72 58,-64 Z', sc('#f6ecd0'), { sw: 2 });
  s += poly([[130, -22], [140, -30], [144, -22], [136, -14]], C.gold!, { sw: 2 });
  s += path('M-14,-160 h20 l-3,9 h-14 Z', C.woodD!, { sw: 1.8 });
  s += line([-4, -168], [-4, -190], C.woodDD!, 2.4) + path('M-3,-190 l30,4 q-6,8 -2,14 l-28,-3 Z', C.black!, { sw: 2 }) + skull(10, -182, 11, false);
  s += line([52, -132], [52, -148], C.woodDD!, 2) + path('M53,-148 l20,3 l-20,6 Z', tm ?? C.red!, { sw: 1.6 });
  s += line([-62, -118], [-62, -134], C.woodDD!, 2) + path('M-61,-134 l-20,3 l20,6 Z', tm ?? C.red!, { sw: 1.6 });
  b += `<g transform="${ISO}">${s}</g>`;
  b += path('M-130,30 q10,-8 20,0 t20,0 t20,0 M60,56 q10,-8 20,0 t20,0 t20,-2', 'none', { stroke: C.foam!, sw: 3, op: 0.95 });
  return piece(rank ? `s.flagship.r${rank}` : 's.flagship', 340, 360, 150, 290, b);
}

const cache = new Map<string, ArtPiece>();
/** rank：王阶涂装（1..10，0 或没写 = 原样）。带涂装的另存一张，key 带 .r<阶>，用到才烘焙 */
export function shipArt(kind: 'raft' | 'flagship', rank = 0): ArtPiece {
  const k = `${kind}.${rank}`;
  let a = cache.get(k);
  if (!a) cache.set(k, (a = kind === 'raft' ? raft(rank) : flagship(rank)));
  return a;
}
