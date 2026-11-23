/**
 * 守岛水手营（兵营塔，2×2）：1 阶木营房 + 茅草顶、2 阶石基木墙 + 瓦顶、3 阶石营房 + 垛口和镶金大旗；
 * 3 阶分叉「火枪队」门口换枪架和火药桶、蓝旗，「重盾队」墙上挂圆盾、门口立拒马、红旗。
 * 画布和锚点同 2×2 防御塔（锚点 = 占地菱形中心）；营房不转，所以只有整张图、没有分件。
 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { Lq, OUT, P, Rq, box, cyl, darken, ell, f, flag, hip, lighten, line, mat, piece, poly, rect, shadow } from './kit.ts';

export type TdBarracksTier = 1 | 2 | 3;
export type TdBarracksBranch = 'gun' | 'shield';

const SIZE = 2;
const UP = 145;
const PADX = 20;
/** 整体放大：营房比占地菱形画得小，放大后才不显得空（同 buildings.ts 的 SCALE） */
const SCALE = 1.2;

/** 营房墙体：[x0, y0, x1, y1, 墙高] */
const BODY: Record<TdBarracksTier, [number, number, number, number, number]> = {
  1: [-0.75, -0.6, 0.55, 0.6, 30],
  2: [-0.85, -0.7, 0.65, 0.7, 42],
  3: [-0.9, -0.75, 0.7, 0.75, 54],
};

/** 地上的操练场：沙地 → 木板 → 石板 */
function yard(t: TdBarracksTier): string {
  const c = [C.sandD!, C.woodL!, C.stoneL!][t - 1]!;
  const r = 0.98;
  let o = poly([P(-r, -r), P(r, -r), P(r, r), P(-r, r)], c, { sw: 1.6, stroke: OUT });
  if (t === 2) for (let i = -2; i <= 2; i++) o += line(P(-r, i * 0.4), P(r, i * 0.4), C.woodD!, 1, 0.5);
  if (t === 3) for (let i = -2; i <= 2; i++) o += line(P(-r, i * 0.4), P(r, i * 0.4), C.stoneD!, 1, 0.45) + line(P(i * 0.4, -r), P(i * 0.4, r), C.stoneD!, 1, 0.45);
  return o;
}

/** 门（左前面 y = y1 上）：木门 + 门框 */
function door(xc: number, y: number, z0: number, h: number, t: TdBarracksTier): string {
  const hw = t === 3 ? 0.24 : 0.2;
  let o = poly(Lq(xc - hw - 0.04, xc + hw + 0.04, y + 0.005, z0, z0 + h + 4), t === 1 ? C.woodDD! : C.stoneD!, { sw: 1.4, stroke: OUT });
  o += poly(Lq(xc - hw, xc + hw, y + 0.01, z0, z0 + h), C.woodD!, { sw: 1.2, stroke: OUT });
  o += line(P(xc, y + 0.012, z0), P(xc, y + 0.012, z0 + h), C.woodDD!, 1.2, 0.8);
  const k = P(xc + hw * 0.55, y + 0.015, z0 + h * 0.45);
  return o + ell(k[0], k[1], 1.6, 1.6, C.gold!, { sw: 0.8 });
}

/** 窗（右前面 x = x1 上）：亮灯的小窗 + 十字窗棂 */
function win(x: number, y0: number, y1: number, za: number, zb: number): string {
  const q = Rq(x + 0.01, y0, y1, za, zb);
  let o = poly(q, '#ffcf6a', { sw: 1.4, stroke: OUT });
  const ym = (y0 + y1) / 2;
  const zm = (za + zb) / 2;
  o += line(P(x + 0.012, ym, za), P(x + 0.012, ym, zb), C.woodDD!, 1.2) + line(P(x + 0.012, y0, zm), P(x + 0.012, y1, zm), C.woodDD!, 1.2);
  return o;
}

/** 顶上的一圈垛口：每个齿一个小方块，按远近（gx + gy）从后往前画 */
function merlons(x0: number, y0: number, x1: number, y1: number, z: number, m: ReturnType<typeof mat>): string {
  const s = 0.18;
  const cells: Array<[number, number]> = [];
  for (let x = x0; x <= x1 - s + 1e-6; x += 0.4) {
    cells.push([x, y0], [x, y1 - s]);
  }
  for (let y = y0 + 0.4; y <= y1 - s - 0.2 + 1e-6; y += 0.4) {
    cells.push([x0, y], [x1 - s, y]);
  }
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  return cells.map(([x, y]) => box(x, y, x + s, y + s, z, z + 9, m, '', 1.3)).join('');
}

/** 兵器架（地上一点）：横木 + 三把弯刀 / 三杆火枪 */
function rack(at: Pt, kind: 'blade' | 'gun'): string {
  const [x, y] = at;
  let o = line([x - 14, y - 2], [x - 14, y - 26], C.woodDD!, 2.4) + line([x + 14, y - 2], [x + 14, y - 26], C.woodDD!, 2.4);
  o += line([x - 16, y - 22], [x + 16, y - 22], C.woodD!, 3);
  for (const dx of [-8, 0, 8]) {
    if (kind === 'blade') {
      o += `<path d="M${f(x + dx)},${f(y - 4)} q4,-10 1,-24" fill="none" stroke="${C.ironL}" stroke-width="2.6" stroke-linecap="round"/>`;
      o += line([x + dx - 3, y - 6], [x + dx + 3, y - 6], C.gold!, 2);
    } else {
      o += line([x + dx, y - 2], [x + dx + 1, y - 12], C.woodD!, 3.2) + line([x + dx + 1, y - 12], [x + dx + 2, y - 32], C.ironD!, 1.8);
    }
  }
  return o;
}

/** 火药桶 */
const keg = (gx: number, gy: number, z = 0): string => {
  const o = cyl(gx, gy, 7, z, z + 13, mat(C.woodD!, 'wood'), 2, 1.4);
  const t = P(gx, gy, z + 13);
  return o + ell(t[0], t[1], 3, 1.5, C.black!, { sw: 0, op: 0.7 });
};

/** 挂在墙上的圆盾（左前面上一点） */
const shieldOn = (gx: number, y: number, z: number): string => {
  const c = P(gx, y + 0.02, z);
  return ell(c[0], c[1], 8, 9, C.red!, { sw: 1.6 }) + ell(c[0], c[1], 3, 3.4, C.ironL!, { sw: 1.1 }) + line([c[0] - 7, c[1]], [c[0] + 7, c[1]], C.gold!, 1.2, 0.8);
};

/** 拒马：一根横木 + 三对交叉的尖桩 */
function cheval(gx: number, gy: number): string {
  const a = P(gx - 0.3, gy + 0.3, 6);
  const b = P(gx + 0.3, gy - 0.3, 6);
  let o = '';
  for (let i = 0; i < 3; i++) {
    const k = (i + 0.5) / 3;
    const m: Pt = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    o += line([m[0] - 7, m[1] + 6], [m[0] + 5, m[1] - 12], C.woodD!, 2.6) + line([m[0] + 7, m[1] + 6], [m[0] - 5, m[1] - 12], C.woodDD!, 2.6);
  }
  return o + line(a, b, C.woodDD!, 3.4);
}

function body(t: TdBarracksTier, branch?: TdBarracksBranch): string {
  const [x0, y0, x1, y1, hgt] = BODY[t];
  const wall = t === 1 ? mat(C.woodLight!, 'wood') : t === 2 ? mat(C.wood!, 'wood') : mat(C.wallMid!, 'stone');
  const flagColor = branch === 'gun' ? C.blue! : C.red!;
  let o = yard(t);
  // 后角的旗杆（在营房后面，先画）
  o += flag(x0 + 0.05, y0 - 0.15, 0, [70, 92, 108][t - 1]!, [20, 24, 30][t - 1]!, [13, 15, 19][t - 1]!, flagColor, false, t === 3 ? C.gold! : undefined);
  if (t >= 2) o += box(x0 - 0.06, y0 - 0.06, x1 + 0.06, y1 + 0.06, 0, 8, mat(C.stone!, 'stone'), 'brick');
  o += box(x0, y0, x1, y1, t >= 2 ? 8 : 0, hgt, wall, t === 3 ? 'brick' : 'h');
  if (t === 1) {
    o += hip(x0, y0, x1, y1, hgt, 22, mat('#c9a24f', 'wood'), 0.16, false);
  } else if (t === 2) {
    o += hip(x0, y0, x1, y1, hgt, 26, mat(C.roofTile!, 'stone'), 0.14, true);
  } else {
    o += line(P(x0, y1, hgt - 4), P(x1, y1, hgt - 4), C.gold!, 2.2) + line(P(x1, y1, hgt - 4), P(x1, y0, hgt - 4), darken(C.gold!, 0.25), 2.2);
    o += merlons(x0, y0, x1, y1, hgt, mat(C.wallMid!, 'stone'));
    // 垛口中间一座小瞭望顶
    o += box(-0.35, -0.3, 0.15, 0.2, hgt, hgt + 16, mat(C.wallMidD!, 'stone'), 'brick', 1.4);
    o += hip(-0.35, -0.3, 0.15, 0.2, hgt + 16, 16, mat(C.roofSlate!, 'stone'), 0.16, true);
  }
  // 门、窗
  const z0 = t >= 2 ? 8 : 0;
  o += door((x0 + x1) / 2 - 0.1, y1, z0, [18, 22, 26][t - 1]!, t);
  o += win(x1, -0.3, 0.05, z0 + 10, z0 + 22);
  if (t >= 2) o += win(x1, y0 + 0.15, y0 + 0.45, z0 + 10, z0 + 22);
  // 门口的东西
  if (branch === 'shield') {
    o += shieldOn(x0 + 0.2, y1, hgt - 14) + shieldOn(x1 - 0.2, y1, hgt - 14);
    o += cheval(0.6, 0.95);
  } else {
    o += rack(P(0.85, 0.75), branch === 'gun' ? 'gun' : 'blade');
  }
  if (branch === 'gun') o += keg(-0.85, 0.75) + keg(-0.6, 0.92) + keg(-0.72, 0.82, 13);
  else if (t >= 2) o += keg(-0.85, 0.8);
  if (t === 3) o += rect(P(x1, y1, hgt)[0] - 3, P(x1, y1, hgt)[1] - 4, 6, 4, lighten(C.gold!, 0.2), { sw: 1 });
  return o;
}

/** 水手营整张图（tier 1–3；branch 只在 3 阶有意义），key `b.barracks.<阶>[.<分叉>]` */
export function tdBarracksArt(tier: TdBarracksTier, branch?: TdBarracksBranch): ArtPiece {
  const w = SIZE * 64 + 24 + PADX * 2;
  const ay = UP + 8 + SIZE * 16;
  const h = ay + SIZE * 16 + 10;
  const b = tier === 3 ? branch : undefined;
  const all = shadow(SIZE * 28, SIZE * 14.5, SIZE * 5, SIZE * 2.8, 0.26) + `<g transform="scale(${SCALE})">${body(tier, b)}</g>`;
  return piece(`b.barracks.${tier}${b ? `.${b}` : ''}`, w, h, w / 2, ay, all);
}

/** 水手营全部外观：1、2、3 阶 + 3 阶两种分叉 */
export const tdBarracksAll = (): ArtPiece[] => [tdBarracksArt(1), tdBarracksArt(2), tdBarracksArt(3), tdBarracksArt(3, 'gun'), tdBarracksArt(3, 'shield')];
