/** 14 种建筑 × 外观档位（1–2 级木头、3–4 级加石头和铁、5 级以上加金边和更大的旗）。 */
import type { BuildingKind } from '../../core/types.ts';
import { isDecoKind } from '../../content/buildings.ts';
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { OUT, P, box, cone, cyl, darken, ell, f, flag, hip, lighten, line, Lq, mat, mix, path, piece, poly, rect, Rq, archL, shadow, skull, tube, uid } from './kit.ts';
import type { Mat } from './kit.ts';
import { tier4, turretHeadBody } from './turrets.ts';

/** 占地边长（格）：和规则表一致；规则表以后若有改动，只需改这里 */
export const BUILDING_SIZE: Record<BuildingKind, number> = {
  hq: 4, goldmine: 3, sawmill: 3, vault: 3, woodyard: 3, dock: 3, armory: 3,
  cannon: 2, gunTower: 2, mortar: 2, shock: 2, sniper: 2, mine: 1, flame: 2, palm: 1, rock: 1,
  harpoon: 2, tar: 2, rocket: 2, kraken: 3, fogTower: 2,
  wall: 1, statue: 1, flagpole: 1, chest: 1, wheel: 1, windmill: 1, lighthouse: 1, bonfire: 1, lookout: 1, treasure: 1,
};

const UP: Record<BuildingKind, number> = {
  hq: 300, goldmine: 135, sawmill: 120, vault: 130, woodyard: 100, dock: 125, armory: 150,
  cannon: 110, gunTower: 250, mortar: 110, shock: 110, sniper: 230, mine: 50, flame: 150, palm: 118, rock: 40,
  harpoon: 120, tar: 62, rocket: 150, kraken: 130, fogTower: 190,
  wall: 70, statue: 110, flagpole: 170, chest: 80, wheel: 120, windmill: 150, lighthouse: 170, bonfire: 70, lookout: 120, treasure: 80,
};
/** 小建筑的整体放大倍数：它们的占地菱形比画出来的大，放大后才不显得空 */
const SCALE: Partial<Record<BuildingKind, number>> = { bonfire: 1.3, cannon: 1.4, gunTower: 1.12, hq: 1.15, mortar: 1.35, shock: 1.4, sniper: 1.05, mine: 1.4, flame: 1.2, palm: 0.85, harpoon: 1.3, tar: 1.0, rocket: 1.15, fogTower: 1.1 };
/** 画布底下多留几像素（脚下伸出去的原木、矿车、金币堆）：不改锚点，只加高画布 */
const DOWN: Partial<Record<BuildingKind, number>> = { goldmine: 20, sawmill: 30, vault: 18, woodyard: 22 };
const PADX: Partial<Record<BuildingKind, number>> = { lookout: 30, lighthouse: 46, windmill: 12, bonfire: 14, woodyard: 14, palm: 44, hq: 40, harpoon: 10, rocket: 30, rock: 16, mine: 10, cannon: 24, mortar: 24, shock: 10, sniper: 14, flame: 14 };

/** 画炮台底座（不带会转的炮管 / 喷嘴 / 发射架 / 火枪手和屋顶）时置真：turretBaseArt 用，转的部分在 art/turrets.ts */
let NOGUN = false;

const M = {
  wood: mat(C.wood!),
  woodD: mat(C.woodD!),
  woodL: mat(C.woodL!),
  stone: mat(C.stone!, 'stone'),
  stoneD: mat(C.stoneD!, 'stone'),
  iron: mat(C.iron!),
  ironD: mat(C.ironD!),
  red: mat(C.red!),
  redD: mat(C.redD!),
  gold: mat(C.gold!),
  cream: mat(C.cream!),
  sand: mat(C.sand!),
  black: mat('#3a3a48'),
  blue: mat(C.blue!),
};

const DARK = '#241410';
/** 7–8 级的冷钢（和炮头 turrets.ts 的 STEEL 同色） */
const STEEL_C = '#3d4d63';
const GLOW = '#ffcf5a';

function nugget(x: number, y: number, s: number): string {
  return (
    poly([[x - s, y], [x - s * 0.5, y - s * 0.8], [x + s * 0.6, y - s * 0.7], [x + s, y + s * 0.1], [x + s * 0.2, y + s * 0.6]], C.gold!, { sw: 1.4 }) +
    poly([[x - s * 0.6, y - s * 0.1], [x - s * 0.3, y - s * 0.6], [x + s * 0.2, y - s * 0.5], [x - s * 0.1, y - s * 0.1]], C.goldL!, { sw: 0 })
  );
}
function coin(x: number, y: number, r: number): string {
  return ell(x, y + 1.2, r, r * 0.55, C.goldD!, { sw: 1 }) + ell(x, y, r, r * 0.55, C.gold!, { sw: 1.2 }) + ell(x - r * 0.2, y - r * 0.1, r * 0.4, r * 0.18, C.goldL!, { sw: 0 });
}
function goldPile(x: number, y: number, s: number): string {
  let o = '';
  o += ell(x, y + s * 0.2, s * 1.1, s * 0.5, C.goldD!, { sw: 1.4 });
  for (let i = 0; i < 6; i++) o += coin(x + (i % 3 - 1) * s * 0.55 + (i > 2 ? s * 0.25 : 0), y - Math.floor(i / 3) * s * 0.38, s * 0.42);
  o += nugget(x, y - s * 0.95, s * 0.5);
  return o;
}
/** 圆木：沿 gx 方向横放的一根，左端 (x, y)，长 len 像素 */
function log(x: number, y: number, len: number, r: number, c = C.wood!): string {
  const x2 = x + len;
  const y2 = y + len / 2;
  let o = tube([x, y], [x2, y2], r * 2, r * 2, c, lighten(c, 0.35));
  o += ell(x, y, r * 0.5, r, C.woodDD!, { sw: 1.4 });
  o += ell(x2, y2, r * 0.5, r, C.woodL!, { sw: 1.6 });
  o += ell(x2, y2, r * 0.22, r * 0.45, C.wood!, { sw: 0, op: 0.7 });
  return o;
}
function barrel(gx: number, gy: number, z: number, r: number, h: number, c = C.wood!): string {
  return cyl(gx, gy, r, z, z + h, mat(c), 1, 1.8);
}
function crate(gx: number, gy: number, z: number, s: number, h = s): string {
  const e = s / 64;
  return box(gx - e, gy - e, gx + e, gy + e, z, z + h, M.woodL, 'h', 1.8);
}
/** 小窗，亮黄色 */
function win(a: Pt[], glow = GLOW): string {
  return poly(a, glow, { sw: 1.6 });
}


/** 画布裁剪框 [x0, y0, x1, y1]：各建筑 1–8 级所有外观的包围盒（含阴影），同一种建筑所有等级同一尺寸、锚点一致；省纹理内存 */
const CROP: Partial<Record<BuildingKind, [number, number, number, number]>> = {
  hq: [18, 83, 342, 446],
  goldmine: [6, 75, 204, 267],
  sawmill: [15, 28, 208, 263],
  vault: [24, 70, 204, 261],
  woodyard: [32, 40, 221, 231],
  dock: [12, 45, 204, 232],
  armory: [15, 50, 204, 257],
  cannon: [2, 9, 186, 190],
  gunTower: [13, 32, 140, 325],
  mortar: [12, 40, 183, 188],
  shock: [8, 26, 154, 185],
  sniper: [39, 48, 154, 305],
  mine: [14, 15, 105, 99],
  flame: [24, 29, 177, 225],
  harpoon: [11, 56, 161, 195],
  tar: [14, 12, 140, 141],
  rocket: [33, 86, 208, 232],
  fogTower: [14, 43, 140, 272],
  statue: [11, 61, 78, 154],
  flagpole: [16, 44, 88, 214],
  chest: [2, 32, 86, 126],
  palm: [30, 27, 129, 162],
  rock: [17, 28, 103, 85],
};

/** 等级分三代（1–2 木、3–5 石、6–8 玄武岩），rank = 这一代里的第几级（1–2 级 1–2，3–5 级 1–3，6–8 级 1–3）。地坪垫和名次钉都按它画 */
function levelBand(level: number): { tier: 0 | 1 | 2; rank: number } {
  const tier = level <= 2 ? 0 : level <= 5 ? 1 : 2;
  return { tier, rank: level - [1, 3, 6][tier]! + 1 };
}

/**
 * 哪些建筑垫地坪（圆垫，数字 = 屏幕半径：塔身半径 × 放大倍数 + 一圈边）：只有细圆塔。
 * 其余不垫：主寨、锯木厂、木料场、船坞、军械所自带方底板，火箭塔自带方墩，炮台、电击塔、臼炮、喷火塔、鱼叉、焦油池、金库、地雷自带大圆盘，
 * 再垫一层就是双层底框、圆盘套方垫；金矿是天然石丘
 */
const PLINTH: Partial<Record<BuildingKind, number>> = { gunTower: 38, sniper: 42, fogTower: 38 };
/** 方底板半边长（格，已乘放大倍数）/ 圆盘屏幕半径（已乘放大倍数）→ 底座左前沿中点（屏幕坐标：左角 (−64h, 0) 和前角 (0, 32h) 的中点 / 椭圆 135° 那一点），名次钉排在这里 */
const sqFoot = (h: number): Pt => [-32 * h, 16 * h];
const rdFoot = (r: number): Pt => [-Math.SQRT1_2 * r, (Math.SQRT1_2 / 2) * r];
const FOOT: Partial<Record<BuildingKind, Pt>> = {
  hq: sqFoot(1.95 * 1.15), sawmill: sqFoot(1.4), woodyard: sqFoot(1.35), dock: sqFoot(1.45), armory: sqFoot(1.4), rocket: sqFoot(0.9 * 1.15),
  cannon: rdFoot(44 * 1.4), shock: rdFoot(44 * 1.4), mortar: rdFoot(44 * 1.35), harpoon: rdFoot(44 * 1.3), tar: rdFoot(58), vault: rdFoot(66), mine: rdFoot(26 * 1.4),
  gunTower: rdFoot(38), sniper: rdFoot(42), flame: rdFoot(36 * 1.2), fogTower: rdFoot(38), goldmine: [-56, 30],
};

/** 细圆塔脚下的圆地坪：tier 0/1/2 = 1–2 级压实沙土 / 3–5 级切石（厚 4）/ 6–8 级玄武岩石座（厚 7，带一道箍） */
function plinth(r: number, tier: 0 | 1 | 2): string {
  if (tier === 0) return ell(0, 1, r, r / 2, C.sandD!, { sw: 0, op: 0.55 });
  return cyl(0, 0, r, 0, tier === 1 ? 4 : 7, mat(tier === 1 ? C.stone! : C.wallDark!, 'stone'), tier === 2 ? 1 : 0, 1.6);
}

/**
 * 代内名次：底座左前沿外侧顺着边排 rank 颗暗铜方钉（每颗 9×9 像素，1× 下也数得清；不用白和金，免得又成满岛亮点）。
 * 进攻前看塔有多强靠它和材质：材质分代（木 / 石 / 玄武岩），钉数分代内第几级。画在建筑本体之上（本体放大后会盖住地面）
 */
/** 名次钉的中心（屏幕坐标，相对锚点）：沿左前边（屏幕方向 (2, 1)）排开，整体往边外（左下）让 2 像素，正好压在底座边上 */
export function rankPegSpots(kind: BuildingKind, level: number): Pt[] {
  const foot = FOOT[kind];
  if (!foot) return [];
  const { rank } = levelBand(level);
  const cx = foot[0] - 0.447 * 2;
  const cy = foot[1] + 0.894 * 2;
  return Array.from({ length: rank }, (_, i): Pt => {
    const d = (i - (rank - 1) / 2) * 14;
    return [cx + 0.894 * d, cy + 0.447 * d];
  });
}
/** 底座的半边长（格，已乘整体放大倍数）：钉子不能离它太远（测试用） */
export const baseHalf = (kind: BuildingKind): number => (BUILDING_SIZE[kind] / 2) * (SCALE[kind] ?? 1);
function rankPegs(spots: Pt[]): string {
  const m = mat(C.copperD!, 'iron');
  let o = '';
  for (const [x, y] of spots) {
    o += rect(x - 4.5, y - 6, 9, 6, m.l, { sw: 1.2, stroke: OUT }) + poly([[x - 4.5, y - 6], [x, y - 8.5], [x + 4.5, y - 6], [x, y - 3.5]], m.t, { sw: 1.2, stroke: OUT });
  }
  return o;
}
function shell(kind: BuildingKind, body: string, level: number, shadowK = 1): ArtPiece {
  const size = BUILDING_SIZE[kind];
  const up = UP[kind];
  const w = size * 64 + 24 + (PADX[kind] ?? 0) * 2;
  const ay = up + 8 + size * 16;
  const h = ay + size * 16 + 10 + (DOWN[kind] ?? 0);
  const ax = w / 2;
  const deco = isDecoKind(kind) || kind === 'treasure' || kind === 'wall';
  // 等级不再靠金框、等级点、四角小旗、金冠（满岛亮黄，把草地和剪影切碎），改由建筑本身的材质（LVC）和地坪垫分三代、名次钉分代内第几级
  const band = levelBand(level);
  const pl = PLINTH[kind];
  const base = deco || pl === undefined ? '' : plinth(pl, band.tier);
  const pegs = deco ? '' : rankPegs(rankPegSpots(kind, level));
  const scaled = SCALE[kind] ? `<g transform="scale(${SCALE[kind]})">${body}</g>` : body;
  // 光从左上来：一层偏向右下的长投影 + 脚下一圈更深更紧的接触阴影，建筑才像落在地上
  const bodyAll = shadow(size * 28, size * 14.5, size * 5, size * 2.8, 0.26 + (shadowK - 1) * 0.1) + shadow(size * 24, size * 12, size * 1, size * 1.2, 0.4 + (shadowK - 1) * 0.1) + base + scaled + pegs;
  const cr = CROP[kind];
  return cr ? piece('', cr[2] - cr[0], cr[3] - cr[1], ax - cr[0], ay - cr[1], bodyAll) : piece('', w, h, ax, ay, bodyAll);
}

// ================================================================= 等级外观（每一级都不同）

/**
 * 每级一种主材质，跟轮廓一样两级一档：1–2 亮木 / 中木 → 3–4 亮石 / 花岗岩 → 5–6 暖灰重石 → 7–8 蓝灰玄武岩。
 * 后两档靠冷暖分开、亮度相近：玄武岩受光面要亮到看得清体积，满级岛上才不是一坨近黑；7–8 级只在包边、箍圈上点铜金（trim）
 */
const LVC = ['', C.woodLight!, C.wood!, C.stone!, C.wallMid!, '#948c7e', '#8a8274', C.wallDark!, '#62759a'];
const lm = (lv: number): Mat => mat(LVC[lv] ?? LVC[1]!, lv <= 2 ? 'wood' : 'stone');
const trim = (lv: number): string => (lv <= 2 ? C.woodD! : lv === 3 ? C.ironD! : lv === 4 ? C.ironL! : lv <= 6 ? C.copper! : lv === 7 ? C.copperL! : C.gold!);
/**
 * 旗：主寨挂大旗；防御塔只在 7–8 级挂一面小红旗（镶金边），1–6 级防御塔和资源、生产建筑都不插。
 * 满级岛上几十栋建筑，旗一多就比建筑还抢眼、认不出谁是谁，所以旗只留给主寨和顶级防御
 */
const TOWER_FLAG_W = 22;
const towerFlag = (gx: number, gy: number, z: number, h: number, lv: number, skull = false, color = C.red!): string =>
  lv >= 7 ? flag(gx, gy, z, h, TOWER_FLAG_W, 14, color, skull, C.gold!) : '';

// ================================================================= 主寨

/** 只有旗杆（旗布由场景里的帧动画画） */
function poleOnly(gx: number, gy: number, z: number, h: number): string {
  const b = P(gx, gy, z);
  const t: Pt = [b[0], b[1] - h];
  return line(b, t, C.woodDD!, 2.6) + line(b, t, C.woodL!, 1, 0.7) + ell(t[0], t[1] - 1, 2.4, 2.4, C.gold!, { sw: 1.2 });
}

/** 小烟囱：砖砌细柱 + 加宽的顶圈 + 黑色烟口；烟口中心是 P(gx, gy, z1 + 2) */
function chimney(gx: number, gy: number, z0: number, z1: number): string {
  let o = box(gx - 0.17, gy - 0.17, gx + 0.17, gy + 0.17, z0, z1, mat('#a08f80', 'stone'), 'brick', 1.6);
  o += box(gx - 0.22, gy - 0.22, gx + 0.22, gy + 0.22, z1 - 3, z1 + 2, mat('#6e6258', 'stone'), '', 1.6);
  const m = P(gx, gy, z1 + 2);
  return o + ell(m[0], m[1], 5.2, 2.6, '#1a1210', { sw: 0 });
}
/** 伐木场的棚顶高（1 级露天为 0）和烟囱 [gx, gy, 底 z, 柱顶 z]：画图和 CHIMNEY_AT 都读它 */
function sawGeom(lv: number): { ph: number; chim: [number, number, number, number] } {
  const t = tier4(lv);
  const ph = lv === 1 ? 0 : [60, 74, 84, 92][t]!;
  return { ph, chim: ph ? [0.9, -1.15, ph + 2, ph + [22, 22, 30, 40][t]!] : [0.9, -1.15, 4, 40] };
}
/** 木料场的后棚檐高（1 级露天为 0）和吊杆 [立柱 gx, gy, 杆顶 z, 吊点 gx, gy, z]：画图和基地里晃的那捆木头（BLD_FX_AT）都读它 */
function woodGeom(lv: number): { ph: number; crane: [number, number, number, number, number, number] } {
  const t = tier4(lv);
  const ph = lv === 1 ? 0 : [44, 54, 62, 68][t]!;
  const top = [52, 66, 84, 96][t]!;
  const reach = [0.75, 0.95, 1.15, 1.3][t]!;
  return { ph, crane: [1.05, -0.55, top, 1.05 + reach, -0.55, top - 4] };
}

/**
 * 主寨四代剪影（spec 第 6.2 节）：1–2 级木桩地台上的船长木屋，3–4 级石基座木石大厅（4 级长出左前副仓、屋角望台），
 * 5–6 级双层海防石堡（下层带垛口的棱堡、上层指挥楼，6 级两角圆炮楼），7–8 级三阶金字塔要塞（棱堡 → 双翼回廊 → 八角指挥塔）。
 * 旗杆、烟囱的位置只在这里算一次：画图、HQ_FLAG_AT、CHIMNEY_AT 都读它，改外形不会对不上。
 */
interface HqGeom {
  /** 主体顶（屋檐或塔顶）的 z、屋顶高 */
  top: number;
  roof: number;
  /** 旗杆底 [gx, gy, z] 和杆高 */
  pole: [number, number, number, number];
  /** 烟囱 [gx, gy, 底 z, 柱顶 z] */
  chim: [number, number, number, number];
}
function hqGeom(lv: number): HqGeom {
  if (lv <= 2) {
    // 屋顶右坡上斜插一根杆；烟囱从屋后左坡冒出
    const top = 52 + lv * 5;
    const roof = 38;
    return { top, roof, pole: [0.95, -0.55, top + 10, 32 + lv * 4], chim: [-0.55, -0.35, top, top + 30] };
  }
  if (lv <= 4) {
    const top = 72 + (lv - 3) * 8;
    const roof = 40 + (lv - 3) * 5;
    return { top, roof, pole: [0, 0, top + roof, 40 + lv * 3], chim: [-0.6, -0.2, top, top + roof * 0.5 + 14] };
  }
  if (lv <= 6) {
    const top = 92 + (lv - 5) * 8;
    const roof = 42 + (lv - 5) * 5;
    return { top, roof, pole: [0, 0, top + roof, 42 + lv * 3], chim: [-0.55, -0.15, top, top + roof * 0.5 + 14] };
  }
  // 7–8 级：top 是八角塔顶（塔冠下沿），roof 是攒尖顶；烟囱在回廊左后角
  const top = 124 + (lv - 7) * 12;
  const roof = 38 + (lv - 7) * 6;
  return { top, roof, pole: [0, 0, top + 5 + roof, 36 + lv * 3], chim: [-0.95, 0.1, 66, 100] };
}
/** 主寨大旗：1–2 级红色小三角布标，3–4 级红底骷髅，5–6 级黑底大骷髅，7–8 级红底金边主帅旗；旗布帧（hqFlagFrames）和静态画用同一份 */
function hqFlagLook(lv: number): { fw: number; fh: number; color: string; skull: boolean; trim?: string } {
  if (lv <= 2) return { fw: 18 + lv * 2, fh: 11 + lv, color: C.red!, skull: false };
  if (lv <= 4) return { fw: 28 + (lv - 3) * 3, fh: 18 + (lv - 3) * 2, color: C.red!, skull: true };
  if (lv <= 6) return { fw: 36 + (lv - 5) * 4, fh: 23 + (lv - 5) * 2, color: C.black!, skull: true };
  return { fw: 42 + (lv - 7) * 4, fh: 26 + (lv - 7) * 2, color: C.red!, skull: true, trim: C.gold! };
}

/**
 * 宽垛口：四条边每边 n 个齿，齿宽约 6、缺口约 4（spec 6.1 第 3 条，1× 不糊成锯齿）。
 * back = 后两条边（y = y0、x = x0，要在里面的楼之前画），否则前两条边（y = y1、x = x1，楼之后画）。
 */
function merlons(x0: number, y0: number, x1: number, y1: number, z: number, h: number, n: number, m: Mat, back: boolean): string {
  let o = '';
  const w = 0.34;
  const ey = back ? y0 + w : y1;
  const ex = back ? x0 + w : x1;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
    o += box(x - w / 2, ey - w, x + w / 2, ey, z, z + h, m, '', 1.4);
  }
  for (let i = 0; i < n; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / n;
    o += box(ex - w, y - w / 2, ex, y + w / 2, z, z + h, m, '', 1.4);
  }
  return o;
}
/** 右前面（gx = x）上的拱门轮廓（archL 的右面版） */
function archR(yc: number, hw: number, x: number, za: number, zs: number, ah: number): Pt[] {
  const a: Pt[] = [P(x, yc - hw, za)];
  for (let i = 0; i <= 8; i++) {
    const t = Math.PI - (Math.PI * i) / 8;
    a.push(P(x, yc + hw * Math.cos(t), zs + ah * Math.sin(t)));
  }
  a.push(P(x, yc + hw, za));
  return a;
}
/** 门楣上的小铁锚徽记 */
function anchorMark(c: Pt, s: number, color: string): string {
  return line([c[0], c[1] - s], [c[0], c[1] + s * 0.7], color, 1.8) + line([c[0] - s * 0.45, c[1] - s * 0.55], [c[0] + s * 0.45, c[1] - s * 0.55], color, 1.6)
    + path(`M${f(c[0] - s * 0.7)},${f(c[1] + s * 0.2)} Q${f(c[0])},${f(c[1] + s * 1.2)} ${f(c[0] + s * 0.7)},${f(c[1] + s * 0.2)}`, 'none', { sw: 1.8, stroke: color });
}
/** 火炬盆：暖光点（不闪） */
function brazier(c: Pt): string {
  return rect(c[0] - 1.2, c[1] - 6, 2.4, 6, C.ironD!, { sw: 0.8 }) + ell(c[0], c[1] - 7, 3.2, 1.6, C.ironD!, { sw: 0.8 }) + ell(c[0], c[1] - 9.5, 2.6, 3.2, C.fire!, { sw: 0 }) + ell(c[0], c[1] - 9, 1.4, 1.8, C.fireL!, { sw: 0 });
}
/** 大门：拱形黑洞 + 门板；z 是门槛高度，y 是左前墙面 */
function gate(y: number, z: number, hw: number, hh: number, plank: string): string {
  return poly(archL(0, hw, y, z, z + hh, hw * 22), DARK, { sw: 2 }) + poly(archL(0, hw * 0.8, y + 0.01, z, z + hh - 1, hw * 18), plank, { sw: 1.4 });
}
/** 右前面上的大门 */
function gateR(x: number, z: number, hw: number, hh: number, plank: string): string {
  return poly(archR(0, hw, x, z, z + hh, hw * 22), DARK, { sw: 2 }) + poly(archR(0, hw * 0.8, x + 0.01, z, z + hh - 1, hw * 18), plank, { sw: 1.4 });
}

function hq(lv: number, noFlag = false): string {
  const g = hqGeom(lv);
  const { top, roof } = g;
  let o = '';
  const chimney0 = (): string => chimney(g.chim[0], g.chim[1], g.chim[2], g.chim[3]);
  if (lv <= 2) {
    // 船长木屋：四根粗木桩托起的地台，单层木屋，倒扣船壳式的深木高坡顶
    const wood = mat(lv === 1 ? C.woodLight! : C.wood!, 'wood');
    for (const [x, y] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]] as const) o += cyl(x, y, 7, 0, 14, M.woodD, 0, 1.4);
    o += box(-1.75, -1.75, 1.75, 1.75, 12, 17, M.woodL, 'h');
    o += box(-1.2, -1.2, 1.2, 1.2, 17, top, wood, 'v');
    o += win(Lq(-0.9, -0.5, 1.2, 30, 42)) + win(Rq(1.2, -0.7, -0.25, 30, 42), darken(GLOW, 0.2)) + win(Rq(1.2, 0.25, 0.7, 30, 42), darken(GLOW, 0.2));
    o += gate(1.2, 17, 0.34, 18, C.woodD!);
    o += chimney0();
    o += hip(-1.2, -1.2, 1.2, 1.2, top, roof, mat(C.woodD!, 'wood'), 0.32);
    if (lv === 2) {
      // 门廊雨搭 + 外挂救生圈 + 屋脊上的观察天窗
      o += poly([P(-0.6, 1.2, 40), P(0.6, 1.2, 40), P(0.6, 1.75, 32), P(-0.6, 1.75, 32)], C.woodL!, { sw: 1.4 });
      o += line(P(-0.55, 1.72, 17), P(-0.55, 1.72, 32), C.woodDD!, 2.6) + line(P(0.55, 1.72, 17), P(0.55, 1.72, 32), C.woodDD!, 2.6);
      const r = P(1.21, 0.95, 34);
      o += ell(r[0], r[1], 5, 6, C.red!, { sw: 1.4 }) + ell(r[0], r[1], 2.2, 2.8, C.cream!, { sw: 1 });
    }
    o += barrel(-1.25, 1.55, 17, 6, 10) + crate(1.3, 1.55, 17, 11, 11);
  } else if (lv <= 4) {
    // 石基座 + 木石混筑大厅（下段石、上段木框）+ 暖红四坡瓦顶；4 级左前长出半高石副仓（不对称 L 形）
    const stone = mat(C.stone!, 'stone');
    o += box(-1.9, -1.9, 1.9, 1.9, 0, 16, stone, 'brick');
    o += box(-1.3, -1.3, 1.3, 1.3, 16, 42, mat(C.stoneL!, 'stone'), 'brick');
    o += box(-1.3, -1.3, 1.3, 1.3, 42, top, mat(C.woodLight!, 'wood'), 'v');
    o += line(P(-1.3, 1.3, 42), P(1.3, 1.3, 42), C.woodDD!, 2.8) + line(P(1.3, 1.3, 42), P(1.3, -1.3, 42), C.woodDD!, 2.8);
    o += win(Lq(-1.0, -0.6, 1.3, 50, 62)) + win(Lq(0.6, 1.0, 1.3, 50, 62)) + win(Rq(1.3, -0.85, -0.4, 50, 62), darken(GLOW, 0.2)) + win(Rq(1.3, 0.4, 0.85, 50, 62), darken(GLOW, 0.2));
    // 4 级左前长出副仓，大门挪到右前面，不被副仓挡住
    if (lv === 4) o += gateR(1.3, 16, 0.4, 20, C.ironD!) + anchorMark(P(1.31, 0, 44), 5.5, C.ironD!);
    else o += gate(1.3, 16, 0.4, 20, C.ironD!) + anchorMark(P(0, 1.31, 44), 5.5, C.ironD!);
    o += chimney0();
    o += hip(-1.3, -1.3, 1.3, 1.3, top, roof, mat(C.roofTile!, 'wood'), 0.32);
    if (lv === 4) o += box(-1.85, 0.4, -0.7, 1.85, 16, 40, stone, 'brick') + hip(-1.85, 0.4, -0.7, 1.85, 40, 16, mat(C.roofTileD!, 'wood'), 0.1);
    o += barrel(1.4, 1.6, 16, 5, 9, C.red!) + crate(lv === 4 ? 0.2 : -1.45, 1.66, 16, 11, 11);
  } else if (lv <= 6) {
    // 双层海防石堡：下层带宽垛口的花岗岩棱堡 + 拱门铁闸，上层内收的指挥楼盖深红高坡顶；6 级左右两角凸出圆炮楼
    const bast = mat(C.wallMid!, 'stone');
    o += box(-1.9, -1.9, 1.9, 1.9, 0, 36, bast, 'brick');
    o += merlons(-1.9, -1.9, 1.9, 1.9, 36, 10, 3, bast, true);
    o += box(-1.05, -1.05, 1.05, 1.05, 36, top, mat(C.stoneL!, 'stone'), 'brick');
    const cm = P(0, 1.06, top - 20);
    o += ell(cm[0], cm[1], 7, 8, C.ironD!, { sw: 1.4 }) + ell(cm[0], cm[1], 4.6, 5.6, GLOW, { sw: 0 }) + line([cm[0] - 4.6, cm[1]], [cm[0] + 4.6, cm[1]], C.ironD!, 1.2) + line([cm[0], cm[1] - 5.6], [cm[0], cm[1] + 5.6], C.ironD!, 1.2);
    o += win(Rq(1.05, -0.65, -0.2, top - 28, top - 14), darken(GLOW, 0.2)) + win(Rq(1.05, 0.2, 0.65, top - 28, top - 14), darken(GLOW, 0.2));
    o += gate(1.9, 0, 0.44, 24, C.ironD!);
    for (let i = 0; i < 4; i++) o += line(P(-0.3 + i * 0.2, 1.91, 2), P(-0.3 + i * 0.2, 1.91, 22), C.ironL!, 1.2, 0.8);
    o += chimney0();
    o += hip(-1.05, -1.05, 1.05, 1.05, top, roof, mat(C.redD!, 'wood'), 0.3);
    o += line(P(-1.35, 1.35, top), P(0, 0, top + roof), C.ironL!, 1.6, 0.8);
    o += merlons(-1.9, -1.9, 1.9, 1.9, 36, 10, 3, bast, false);
    if (lv === 6) {
      for (const [x, y] of [[-1.72, 1.72], [1.72, -1.72]] as const) {
        o += cyl(x, y, 22, 0, 50, bast, 2);
        o += cyl(x, y, 25, 50, 56, mat(C.wallMidD!, 'stone'), 0, 1.6);
        o += cone(x, y, 25, 56, 18, mat(C.roofTileD!, 'wood'), 3);
      }
    }
  } else {
    // 三阶金字塔要塞：底层宽厚斜坡玄武岩棱堡 → 中层双翼垛口回廊 → 顶层八角指挥塔，海防深蓝灰攒尖顶；铜金只点在脊冠、护角、风向标上
    const basalt = mat(C.wallDark!, 'stone');
    o += box(-1.95, -1.95, 1.95, 1.95, 0, 18, mat(C.wallDarkD!, 'stone'), 'brick');
    o += box(-1.75, -1.75, 1.75, 1.75, 18, 32, basalt, 'brick');
    if (lv === 8) for (const [x, y] of [[-1.95, 1.95], [1.95, -1.95], [1.95, 1.95]] as const) o += line(P(x, y, 3), P(x, y, 18), C.copper!, 3.4);
    o += box(-1.4, -1.4, 1.4, 1.4, 32, 66, mat(C.wallMid!, 'stone'), 'brick');
    o += merlons(-1.4, -1.4, 1.4, 1.4, 66, 10, 3, mat(C.wallMid!, 'stone'), true);
    o += gate(1.75, 18, 0.42, 20, C.ironD!);
    for (const q of [-0.66, 0.66]) o += brazier(P(q, 1.78, 32));
    o += chimney0();
    o += cyl(0, 0, 36, 66, top, mat(C.wallDarkL!, 'stone'), 3);
    o += win(Lq(-0.22, 0.22, 0.62, top - 30, top - 16)) + win(Rq(0.62, -0.22, 0.22, top - 30, top - 16), darken(GLOW, 0.2));
    o += cyl(0, 0, 40, top, top + 6, mat(lv === 8 ? C.copper! : C.wallDarkD!, 'stone'), 0, 1.6);
    o += cone(0, 0, 38, top + 5, roof, mat(C.roofSlate!, 'stone'), 4);
    const apex = P(0, 0, top + 5 + roof);
    o += ell(apex[0], apex[1], 5, 3.2, lv === 7 ? C.copperL! : C.gold!, { sw: 1.2 });
    o += merlons(-1.4, -1.4, 1.4, 1.4, 66, 10, 3, mat(C.wallMid!, 'stone'), false);
  }
  const fl = hqFlagLook(lv);
  const [px, py, pz, ph] = g.pole;
  o += noFlag ? poleOnly(px, py, pz, ph) : flag(px, py, pz, ph, fl.fw, fl.fh, fl.color, fl.skull, fl.trim);
  return o;
}

// ================================================================= 防御

/**
 * 加农炮底座四代（spec 6.2）：1–2 级沙袋半圈矮掩体 + 木转盘，3–4 级八角切石墩台 + 锻铁齿圈（4 级四角斜撑铁板），
 * 5–6 级暗石胸墙（正面留 U 形射界缺口）+ 后挂弹药箱，7–8 级玄武岩星形棱角炮座 + 红铜转盘圈。
 * 转盘面的高度 cannonDeck 同时是炮头转轴的高度（TURRET_PIVOT），一处定。
 */
const cannonDeck = (lv: number): number => (lv <= 2 ? 10 : lv <= 4 ? 16 : lv <= 6 ? 18 : 22);
/** 一圈石块 / 沙袋：从 a0 到 a1（弧度，0 = 右前），半径 r 格，块数 n */
function ringBlocks(r: number, a0: number, a1: number, n: number, z0: number, z1: number, m: Mat, w = 0.3): string {
  const items: Array<[number, string]> = [];
  for (let i = 0; i < n; i++) {
    const an = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const gx = Math.cos(an) * r;
    const gy = Math.sin(an) * r;
    items.push([gx + gy, box(gx - w / 2, gy - w / 2, gx + w / 2, gy + w / 2, z0, z1, m, '', 1.4)]);
  }
  // 远的（屏幕上方）先画
  return items.sort((x, y) => x[0] - y[0]).map((q) => q[1]).join('');
}
function cannonBallPile(gx: number, gy: number, z: number, n: number): string {
  let o = '';
  const c = P(gx, gy, z);
  const spots: Pt[] = [[-6, 0], [6, 0], [0, 1.5], [0, -7]];
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const [dx, dy] = spots[i]!;
    o += ell(c[0] + dx, c[1] + dy - 5, 5.6, 5.6, '#3b3d49', { sw: 1.5 }) + ell(c[0] + dx - 2, c[1] + dy - 7, 1.8, 1.8, '#7b7e90', { sw: 0 });
  }
  return o;
}

/** 整张图（图标、没烘好分件时）上的炮头：和开打后的分件炮头同一套画法、同一个代表等级（turrets.ts 的 turretHeadBody），摆在转轴上 */
function turretHead(kind: Exclude<TurretB, 'gunTower'>, lv: number, z: number): string {
  const c = P(0, 0, z);
  return `<g transform="translate(${f(c[0])},${f(c[1])})">${turretHeadBody(kind, lv)}</g>`;
}

function cannon(lv: number): string {
  const deck = cannonDeck(lv);
  let o = '';
  if (lv <= 2) {
    // 沙袋半圈（后半圈，前面敞开）+ 交叉木转盘
    o += ringBlocks(1.05, Math.PI * 0.75, Math.PI * 1.85, 6, 0, 9, mat('#d9c08a', 'wood'), 0.34);
    o += cyl(0, 0, 40, 0, 6, M.woodL, 0, 1.6);
    o += line(P(-0.8, 0, 6), P(0.8, 0, 6), C.woodD!, 2.4) + line(P(0, -0.8, 6), P(0, 0.8, 6), C.woodD!, 2.4);
    o += cyl(0, 0, 22, 6, deck, M.woodD, 0, 1.6);
    if (lv === 2) o += cannonBallPile(-0.95, 0.7, 0, 3);
  } else if (lv <= 4) {
    // 八角切石墩台（厚）+ 锻铁齿圈；4 级四角斜撑铁板
    o += cyl(0, 0, 46, 0, 12, mat(C.stone!, 'stone'), 1);
    if (lv === 4) for (const [x, y] of [[-0.95, 0], [0.95, 0], [0, -0.95], [0, 0.95]] as const) o += box(x - 0.16, y - 0.16, x + 0.16, y + 0.16, 0, 14, M.ironD, '', 1.4);
    o += cyl(0, 0, 30, 12, deck, M.ironD, 0, 1.6);
    const r = P(0, 0, deck);
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      if (Math.sin(an) > -0.2) o += ell(r[0] + Math.cos(an) * 28, r[1] + Math.sin(an) * 14, 2, 1.4, C.ironL!, { sw: 0 });
    }
    o += cannonBallPile(-1.0, 0.75, 0, 4);
  } else if (lv <= 6) {
    // 暗石胸墙：后面和两侧一圈石块，正面（屏幕下方）留 U 形射界缺口；后面挂铁皮弹药箱
    o += cyl(0, 0, 46, 0, 8, mat(C.wallMid!, 'stone'), 1);
    o += box(-1.05, -1.15, -0.45, -0.75, 8, 22, M.ironD, 'h') + line(P(-1.05, -0.75, 18), P(-0.45, -0.75, 18), C.ironL!, 1.4);
    o += ringBlocks(1.05, Math.PI * 0.62, Math.PI * 1.88, 7, 8, 26, mat(C.wallMidD!, 'stone'), 0.36);
    o += cyl(0, 0, 30, 8, deck, M.ironD, 0, 1.6);
  } else {
    // 玄武岩星形棱角炮座：圆台四个方向挑出尖棱，镶红铜转盘圈
    o += cyl(0, 0, 46, 0, 12, mat(C.wallDark!, 'stone'), 1);
    for (const [x, y] of [[-1.15, 0], [0, -1.15], [1.15, 0], [0, 1.15]] as const) o += box(x - 0.24, y - 0.24, x + 0.24, y + 0.24, 0, 16, mat(C.wallDarkD!, 'stone'), '', 1.4);
    o += cyl(0, 0, 32, 12, deck - 4, mat(C.wallDarkL!, 'stone'), 0, 1.6);
    // 铜圈只是一道窄边，上面压一层深色钢盘，不让整个盘面变成铜色
    o += cyl(0, 0, 34, deck - 4, deck - 1, mat(lv === 8 ? C.gold! : C.copper!, 'iron'), 0, 1.6);
    o += cyl(0, 0, 29, deck - 1, deck, M.ironD, 0, 1.4);
  }
  if (NOGUN) {
    // 分件版：炮架、轮子、炮管整体在转盘上转（art/turrets.ts）
    o += towerFlag(-1.1, -0.2, deck - 2, 22 + lv * 4, lv);
    return o;
  }
  // 整张图（图标、没烘好分件时）：朝右前的炮头（和分件版同一套画法）
  o += turretHead('cannon', lv, deck);
  o += towerFlag(-1.1, -0.2, deck - 2, 22 + lv * 4, lv);
  return o;
}


/** 7–8 级台面边上一道 4 像素宽的细铜（8 级金）环：铜圈里面再盖一层台面本身的材质，铜金只露一圈边（spec 6.1：占 10–15%），不铺满台面 */
const rim = (r: number, z: number, lv: number, inner: Mat): string => cyl(0, 0, r, z - 3, z, mat(trim(lv), 'iron'), 0, 1.4) + cyl(0, 0, r - 4, z - 3, z, inner, 0, 1);

/**
 * 臼炮（矮宽的炮坑：坑墙围着朝天的粗炮筒，越高级墙越厚越高）：1–2 级沙袋半圈围的浅土坑 + 木炮座，
 * 3–4 级切石圆坑（4 级坑边炮弹堆和弹药箱），5–6 级花岗岩高胸墙（正面留缺口），7–8 级玄武岩坑 + 四角挑出的棱 + 宽垛口、细铜箍。
 */
const MORTAR_DECK = [8, 12, 12, 14] as const;
function mortar(lv: number): string {
  const t = tier4(lv);
  const deck = MORTAR_DECK[t];
  const m = lm(lv);
  let o = '';
  if (t === 0) {
    o += ell(0, 2, 46, 23, C.sandD!, { sw: 1.6 });
    o += ringBlocks(1.0, Math.PI * 0.7, Math.PI * 1.95, 7, 0, 10, mat('#d9c08a', 'wood'), 0.34);
    o += cyl(0, 0, 26, 0, deck, m, 0, 1.6);
    if (lv === 2) o += cannonBallPile(-0.9, 0.7, 0, 3);
  } else if (t === 1) {
    o += cyl(0, 0, 46, 0, deck, m, 1);
    const c = P(0, 0, deck);
    o += ell(c[0], c[1], 34, 17, '#2b2020', { sw: 2 });
    o += cyl(0, 0, 22, deck - 4, deck, M.ironD, 0, 1.6);
    if (lv === 4) o += crate(0.85, -0.55, 0, 14, 12) + cannonBallPile(-0.9, 0.7, 0, 4);
  } else if (t === 2) {
    o += cyl(0, 0, 46, 0, 10, m, 1);
    o += box(-1.05, -1.15, -0.45, -0.75, 10, 24, M.ironD, 'h');
    o += ringBlocks(1.02, Math.PI * 0.62, Math.PI * 1.9, 8, 10, 28, mat(C.wallMidD!, 'stone'), 0.36);
    o += cyl(0, 0, 24, 8, deck, M.ironD, 0, 1.6);
  } else {
    o += cyl(0, 0, 46, 0, deck, m, 1);
    for (const [x, y] of [[-1.15, 0], [0, -1.15], [1.15, 0], [0, 1.15]] as const) o += box(x - 0.22, y - 0.22, x + 0.22, y + 0.22, 0, 20, mat(C.wallDarkD!, 'stone'), '', 1.4);
    o += ringBlocks(1.0, Math.PI * 0.62, Math.PI * 1.9, 6, deck, deck + 12, mat(C.wallDarkL!, 'stone'), 0.42);
    o += rim(26, deck, lv, M.ironD);
  }
  if (!NOGUN) o += turretHead('mortar', lv, deck);
  o += towerFlag(-1.1, 0.4, deck, 24 + lv * 3, lv);
  return o;
}

/**
 * 喷火塔（中高的油罐塔：一只立着的油罐托着喷嘴，越高级罐越高越粗、喷嘴越多）：1–2 级木架上的箍木油桶，
 * 3–4 级石脚上的铆铁立罐、侧挂红油桶，5–6 级砖台上的主罐 + 侧后副罐和油管，7–8 级玄武岩台四角扶壁、冷钢高压罐、细铜箍。
 */
const FLAME_DECK = [34, 38, 50, 54, 62, 66, 72, 76] as const;
function flameTower(lv: number): string {
  const t = tier4(lv);
  const deck = FLAME_DECK[lv - 1] ?? 34;
  const m = lm(lv);
  let o = '';
  if (t === 0) {
    o += cyl(0, 0, 30, 0, 6, M.woodD, 0);
    o += barrel(-0.6, 0.55, 6, 7, 14, C.red!);
    o += cyl(0, 0, 20, 6, deck - 4, m, 0);
    for (const z of [12, deck - 12]) o += cyl(0, 0, 21, z, z + 3, M.ironD, 0, 1.2);
  } else if (t === 1) {
    o += cyl(0, 0, 32, 0, 8, m, 0);
    o += barrel(-0.6, 0.55, 8, 7, 14, C.red!) + barrel(-0.35, 0.8, 8, 7, 14, C.redD!);
    o += cyl(0, 0, 22, 8, deck - 4, mat('#7a8798', 'iron'), 3);
    for (let i = 0; i < 5; i++) o += ell(-12 + i * 6, 24 - deck * 0.5 + Math.abs(i - 2) * 1.8, 1.2, 1.2, C.ironL!, { sw: 0 });
  } else if (t === 2) {
    o += box(-0.6, -0.6, 0.6, 0.6, 0, 14, m, 'brick');
    o += cyl(-0.8, 0.5, 11, 0, 34, mat('#7a8798', 'iron'), 2);
    o += line(P(-0.8, 0.5, 34), P(-0.2, 0.15, deck - 14), '#3a2a22', 4);
    o += cyl(0, 0, 24, 14, deck - 4, mat('#6a7788', 'iron'), 3);
  } else {
    o += cyl(0, 0, 34, 0, 16, m, 1);
    for (const [x, y] of [[-0.75, 0], [0, -0.75], [0.75, 0], [0, 0.75]] as const) o += box(x - 0.16, y - 0.16, x + 0.16, y + 0.16, 0, 26, mat(C.wallDarkD!, 'stone'), '', 1.4);
    o += cyl(0, 0, 26, 16, deck - 6, mat('#4a5a70', 'iron'), 2);
    o += rim(27, deck - 6, lv, mat('#4a5a70', 'iron'));
  }
  o += cyl(0, 0, 13, deck - 4, deck, mat(C.ironD!), 0, 1.6);
  if (!NOGUN) {
    o += turretHead('flame', lv, deck);
    // 整张图（建造菜单、图鉴）在喷嘴口画一团火舌，一眼认出是喷火塔；开打后火舌由场景按开火画（turret.ts 的 flameStep）
    const b = P(0.62, 0, deck + 2);
    const fx = b[0] + 4;
    const fy = b[1] - 2;
    const fl = 14 + lv * 4;
    o += path(`M${f(fx)},${f(fy + 8)} Q${f(fx + fl * 0.3)},${f(fy + 10)} ${f(fx + fl)},${f(fy - 2)} Q${f(fx + fl * 0.6)},${f(fy - 16)} ${f(fx + fl * 0.2)},${f(fy - 10)} Q${f(fx - 4)},${f(fy - 12)} ${f(fx)},${f(fy + 8)} Z`, C.fire!, { sw: 1.6 });
    o += path(`M${f(fx + 2)},${f(fy + 5)} Q${f(fx + fl * 0.4)},${f(fy + 6)} ${f(fx + fl * 0.7)},${f(fy - 1)} Q${f(fx + fl * 0.4)},${f(fy - 9)} ${f(fx + 2)},${f(fy - 5)} Z`, C.fireL!, { sw: 0 });
  }
  o += towerFlag(-0.55, -0.45, deck - 6, 18 + lv * 3, lv);
  return o;
}

/**
 * 鱼叉炮（矮宽的大弩台：横向张开的弩臂是主剪影，越高级弩臂越宽、台越厚）：1–2 级木板圆台 + 矛桶和绳圈，
 * 3–4 级石台 + 后面的木绞盘，5–6 级花岗岩台 + 后半圈矮墙和大绳鼓，7–8 级玄武岩台四方各一根系缆铁桩、细铜箍。
 */
const HARPOON_DECK = [18, 22, 24, 26] as const;
function harpoon(lv: number): string {
  const t = tier4(lv);
  const deck = HARPOON_DECK[t];
  const m = lm(lv);
  const top = t === 0 ? 8 : t === 3 ? 14 : 12;
  let o = '';
  o += cyl(0, 0, 44, 0, top, m, t >= 1 ? 1 : 0);
  if (t === 1) o += box(-1.0, -0.35, -0.7, 0.35, top, top + 12, M.woodD, 'v') + ell(P(-0.85, 0.4, top + 8)[0], P(-0.85, 0.4, top + 8)[1], 7, 7, C.woodL!, { sw: 1.6 });
  if (t === 2) o += ringBlocks(1.02, Math.PI * 0.75, Math.PI * 1.75, 5, top, top + 10, mat(C.wallMidD!, 'stone'), 0.36);
  if (t === 3) for (const [x, y] of [[-0.95, 0], [0, -0.95], [0.95, 0], [0, 0.95]] as const) o += cyl(x, y, 6, top, top + 12, M.ironD, 0, 1.4) + cyl(x, y, 7, top + 12, top + 14, mat(trim(lv), 'iron'), 0, 1.2);
  // 矛桶 / 绳圈（5–6 级换成大绳鼓）
  if (t <= 1) o += barrel(-0.7, 0.55, top, 7, 14, C.woodD!);
  const rc = P(0.5, 0.65, top + 1);
  o += t === 2 ? cyl(0.55, 0.6, 11, top, top + 12, M.cream, 1) : ell(rc[0], rc[1], 9, 4.5, C.cream!, { sw: 1.6 }) + ell(rc[0], rc[1], 4, 2, '#a9824f', { sw: 1.2 });
  if (t === 3) o += rim(30, top, lv, m);
  o += cyl(0, 0, 11, top, deck, t === 0 ? M.woodD : M.ironD, 0, 1.6);
  if (!NOGUN) o += turretHead('harpoon', lv, deck);
  o += towerFlag(-1.0, 0.5, top, 20 + lv * 4, lv);
  return o;
}

/**
 * 火箭塔（方墩发射台：一排斜指天的管子，越高级墩越高、管越多）：1–2 级木托盘，3–4 级砖墩（上下两层），
 * 5–6 级三层收分的花岗岩墩，7–8 级玄武岩堡（四边宽垛口）托着发射台、细铜边。
 */
const ROCKET_DECK = [14, 24, 32, 38] as const;
function rocket(lv: number): string {
  const t = tier4(lv);
  const deck = ROCKET_DECK[t];
  const m = lm(lv);
  let o = '';
  if (t === 0) {
    o += box(-0.9, -0.9, 0.9, 0.9, 0, 6, m, 'h');
    o += box(-0.55, -0.55, 0.55, 0.55, 6, deck, M.woodD, 'v');
  } else if (t === 1) {
    o += box(-0.9, -0.9, 0.9, 0.9, 0, 12, m, 'brick');
    o += box(-0.6, -0.6, 0.6, 0.6, 12, deck, m, 'brick');
  } else if (t === 2) {
    o += box(-0.95, -0.95, 0.95, 0.95, 0, 10, m, 'brick');
    o += box(-0.75, -0.75, 0.75, 0.75, 10, 22, m, 'brick');
    o += box(-0.55, -0.55, 0.55, 0.55, 22, deck, m, 'brick');
  } else {
    o += box(-0.95, -0.95, 0.95, 0.95, 0, 16, m, 'brick');
    o += merlons(-0.95, -0.95, 0.95, 0.95, 16, 8, 3, m, true);
    o += box(-0.6, -0.6, 0.6, 0.6, 16, deck, m, 'brick');
    o += merlons(-0.95, -0.95, 0.95, 0.95, 16, 8, 3, m, false);
    o += line(P(-0.6, 0.6, deck - 2), P(0.6, 0.6, deck - 2), trim(lv), 2.4) + line(P(0.6, 0.6, deck - 2), P(0.6, -0.6, deck - 2), darken(trim(lv), 0.25), 2.4);
  }
  o += cyl(0, 0, 16, deck, deck + 4, mat(C.ironD!), 0, 1.6);
  if (!NOGUN) o += turretHead('rocket', lv, deck + 4);
  o += barrel(-0.8, 0.8, 0, 6, 12, C.red!) + crate(0.8, 0.85, 0, 14, 13);
  if (t === 2) o += crate(0.95, 0.5, 0, 12, 11);
  o += towerFlag(0.6, -0.6, deck, 10 + lv * 3, lv);
  return o;
}

/** 震荡炮的放电线圈柱：铁芯 + 三片铜圈 + 顶上一颗蓝光电容球 */
function coilPost(gx: number, gy: number, z0: number, h: number): string {
  let o = cyl(gx, gy, 4.5, z0, z0 + h, M.ironD, 0, 1.4);
  for (let i = 0; i < 3; i++) {
    const z = z0 + h * (0.3 + i * 0.22);
    o += cyl(gx, gy, 8, z, z + 2.6, mat('#c9783a', 'iron'), 0, 1.2);
  }
  const b = P(gx, gy, z0 + h + 5);
  return o + ell(b[0], b[1], 6, 6, '#2f6fa8', { sw: 1.6 }) + ell(b[0] - 1.6, b[1] - 1.8, 2.4, 1.8, '#bfeaff', { sw: 0 });
}
/** 地上的电容球（1–4 级）：3–4 级立在矮铜柱上 */
function capBalls(n: number, post: boolean): string {
  let o = '';
  for (let i = 0; i < n; i++) {
    const x = -34 + i * 8 + (i % 2) * 2;
    const y = 15 - i * 3.4 - (post ? 6 : 0);
    if (post) o += rect(x - 1.6, y - 4, 3.2, 10, '#b0703a', { sw: 0.8 });
    o += ell(x, y - 10, 5.6, 5.6, '#2f6fa8', { sw: 1.6 }) + ell(x - 1.4, y - 11.6, 2.4, 1.8, '#bfeaff', { sw: 0 });
    if (!post) o += rect(x - 1.2, y - 5, 2.4, 5, '#b0703a', { sw: 0.8 });
  }
  return o;
}
/**
 * 震荡炮（矮圆台 + 喇叭口炮，台后立着放电线圈；越高级线圈越高越多）：1–2 级木圆台 + 地上两颗电容球，
 * 3–4 级石台 + 三颗立在铜柱上的球，5–6 级花岗岩台后两根高线圈柱，7–8 级玄武岩台后三根更高的线圈柱、细铜箍。
 */
const SHOCK_DECK = [12, 14, 14, 16] as const;
function shock(lv: number): string {
  const t = tier4(lv);
  const deck = SHOCK_DECK[t];
  const top = deck - 4;
  let o = '';
  // 线圈柱在台子后面，先画
  if (t === 2) o += coilPost(-0.95, 0.15, 0, 40) + coilPost(0.15, -0.95, 0, 40);
  if (t === 3) o += coilPost(-0.95, 0.25, 0, 50) + coilPost(-0.6, -0.6, 0, 56) + coilPost(0.25, -0.95, 0, 50);
  o += cyl(0, 0, 44, 0, top, lm(lv), t >= 1 ? 1 : 0);
  if (t <= 1) o += capBalls(t === 0 ? 2 : 3, t === 1);
  if (t === 3) o += rim(30, top, lv, lm(lv));
  o += cyl(0, 0, 20, top, deck, mat(C.ironD!), 0, 1.6);
  if (!NOGUN) o += turretHead('shock', lv, deck);
  // 旗插在左前，让开台后的线圈柱
  o += towerFlag(-1.0, 0.6, top, 22 + lv * 4, lv);
  return o;
}

/** 狙击塔转轴离地高度：平台面往上一点（炮管架在平台中央） */
const SNIPER_Z = (lv: number): number => 104 + lv * 4 + 10;

/**
 * 狙击塔（全岛最细最高的瞭望架，越高级越高越实）：1–2 级四根原木斜柱 + 横撑的透空架，3–4 级石脚加高、铁柱，
 * 5–6 级铁柱架、平台下一圈木板护裙（上重下轻的岗楼），7–8 级玄武岩实心细塔身、脚下四片扶壁、平台四边垛口和细铜箍。
 * 长炮管（会转的部分）在 turrets.ts，架在平台中央。
 */
function sniper(lv: number): string {
  const t = tier4(lv);
  const bodyM = lm(lv);
  const post = t === 0 ? C.woodD! : t === 1 ? C.ironD! : '#2a3042';
  const pz = 104 + lv * 4;
  const foot = t === 0 ? 8 : 20;
  let o = '';
  o += cyl(0, 0, 30, 0, foot, mat(t === 0 ? '#8a5a30' : t === 3 ? C.wallDarkD! : '#8c949c', 'stone'), 0);
  if (t <= 2) {
    const leg = (sx: number, sy: number): string => tube(P(sx * 0.62, sy * 0.62, foot - 2), P(sx * 0.4, sy * 0.4, pz), 7.5, 6, post, lighten(post, 0.3));
    o += leg(-1, -1) + leg(1, -1);
    for (const z of [pz * 0.34, pz * 0.66]) {
      const w = 0.62 - (z / pz) * 0.22;
      const ps = [P(-w, -w, z), P(w, -w, z), P(w, w, z), P(-w, w, z)];
      o += line(ps[0]!, ps[1]!, C.woodDD!, 2.6) + line(ps[1]!, ps[2]!, C.woodDD!, 2.6) + line(ps[3]!, ps[0]!, C.woodDD!, 2.6);
      if (lv >= 2) o += line(ps[0]!, ps[2]!, C.woodDD!, 2) + line(ps[1]!, ps[3]!, C.woodDD!, 2);
    }
    o += leg(-1, 1) + leg(1, 1);
    if (t === 2) o += box(-0.46, -0.46, 0.46, 0.46, pz - 24, pz, M.wood, 'v');
  } else {
    for (const [x, y] of [[-0.55, 0], [0, -0.55], [0.55, 0], [0, 0.55]] as const) o += box(x - 0.1, y - 0.1, x + 0.1, y + 0.1, foot, foot + 30, mat(C.wallDarkD!, 'stone'), '', 1.4);
    o += cyl(0, 0, 20, foot, pz, bodyM, 3);
  }
  const h = 0.5;
  o += box(-h, -h, h, h, pz, pz + 6, bodyM, 'h', 2);
  if (t === 3) {
    o += merlons(-h, -h, h, h, pz + 6, 8, 2, bodyM, true);
    o += line(P(-h, h, pz + 5), P(h, h, pz + 5), trim(lv), 2.2) + line(P(h, h, pz + 5), P(h, -h, pz + 5), darken(trim(lv), 0.25), 2.2);
  } else {
    const ring = [P(-h, -h, pz + 6), P(h, -h, pz + 6), P(h, h, pz + 6), P(-h, h, pz + 6)];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]] as const) {
      const a = ring[i]!;
      const b = ring[j]!;
      o += line([a[0], a[1] - 12], [b[0], b[1] - 12], C.woodDD!, 2.2, i === 0 || i === 3 ? 0.9 : 1);
      o += line(a, [a[0], a[1] - 12], C.woodDD!, 2.2) + line(b, [b[0], b[1] - 12], C.woodDD!, 2.2);
    }
  }
  if (t === 3) o += merlons(-h, -h, h, h, pz + 6, 8, 2, bodyM, false);
  if (!NOGUN) o += turretHead('sniper', lv, SNIPER_Z(lv));
  o += towerFlag(-0.42, -0.42, pz + 6, 26 + lv * 3, lv, true);
  return o;
}

/**
 * 火枪塔四代（spec 6.2，细高竖向剪影，和矮宽的加农炮拉开）：1–2 级四柱 X 撑的透空木哨架（2 级头顶斜帆布棚），
 * 3–4 级下石上木包铁的实心方塔（4 级四柱撑红色尖锥小顶），5–6 级下宽上窄的石塔 + 外挑铁托臂的大垛口平台（6 级蓝灰铁尖顶），
 * 7–8 级四角扶壁的玄武岩高塔 + 两层悬挑回廊 + 铜边盔式尖顶（8 级回廊前挂金色双枪盾徽）。
 * 火枪手（turrets.ts）站在平台上，屋顶是另一张图（gunTowerRoof）盖在他上面；平台高 gtPlat 是三张图共用的一处。
 */
const gtPlat = (lv: number): number => [50, 56, 62, 68, 76, 82, 90, 96][lv - 1] ?? 50;
/** 这一级有没有顶棚（没有的那几级旗插在平台后角） */
const gtRoofed = (lv: number): boolean => lv === 2 || lv === 4 || lv >= 6;
/** 顶棚：撑柱顶高、檐口半径（屏幕像素）、尖顶高 */
/** 火枪塔屋顶的檐高、半径、尖高（终极塔 tdults.ts 按它重画屋顶） */
export const gtRoof = (lv: number): { zr: number; rx: number; h: number } => {
  const zr = gtPlat(lv) + 40;
  if (lv === 2) return { zr, rx: 30, h: 8 };
  if (lv === 4) return { zr, rx: 33, h: 26 };
  if (lv === 6) return { zr, rx: 36, h: 40 };
  return { zr, rx: 38, h: 44 + (lv - 7) * 4 };
};
/** 四角撑柱（顶棚的柱子画在底座图里，在火枪手后面） */
function gtPosts(lv: number): string {
  if (!gtRoofed(lv)) return '';
  const plat = gtPlat(lv);
  const { zr } = gtRoof(lv);
  const e = lv === 2 ? 0.5 : 0.6;
  // 2 级帆布棚只在后面立两根高杆，前面两根矮
  const tall = (x: number, y: number): number => (lv === 2 && x + y > 0 ? zr - 10 : zr);
  let o = '';
  for (const [x, y] of [[-e, -e], [e, -e], [-e, e], [e, e]] as const) o += line(P(x, y, plat), P(x, y, tall(x, y)), lv >= 6 ? C.ironD! : C.woodDD!, 3.2);
  return o;
}

function gunTower(lv: number): string {
  const plat = gtPlat(lv);
  let o = '';
  if (lv <= 2) {
    // 透空木哨架：四根原木立柱 + 两个看得见的面上 X 形斜撑；顶上方木斗台、半高护栏
    o += cyl(0, 0, 26, 0, 6, M.woodD, 0, 1.6);
    const e = 0.42;
    const post = (x: number, y: number): string => box(x - 0.07, y - 0.07, x + 0.07, y + 0.07, 6, plat - 4, M.wood, '', 1.4);
    o += post(-e, -e) + post(e, -e) + post(-e, e);
    o += line(P(-e, e, 10), P(e, e, plat - 8), C.woodD!, 2.6) + line(P(e, e, 10), P(-e, e, plat - 8), C.woodD!, 2.6);
    o += line(P(e, -e, 10), P(e, e, plat - 8), C.woodD!, 2.6) + line(P(e, e, 10), P(e, -e, plat - 8), C.woodD!, 2.6);
    o += post(e, e);
    o += box(-0.62, -0.62, 0.62, 0.62, plat - 5, plat, M.woodL, 'h');
    for (const [x0, y0, x1, y1] of [[-0.62, 0.62, 0.62, 0.62], [0.62, 0.62, 0.62, -0.62]] as const) o += line(P(x0, y0, plat + 7), P(x1, y1, plat + 7), C.woodD!, 2.4);
  } else if (lv <= 4) {
    // 下石上木：切石方塔基 + 木框包铁皮的封闭塔身（竖条射击孔），顶上外挑射击台
    const mid = Math.round(plat * 0.45);
    o += box(-0.6, -0.6, 0.6, 0.6, 0, mid, mat(C.stone!, 'stone'), 'brick');
    o += box(-0.5, -0.5, 0.5, 0.5, mid, plat - 6, mat(C.ironL!, 'iron'), 'v');
    o += line(P(-0.5, 0.5, mid + 2), P(0.5, 0.5, mid + 2), C.woodDD!, 2.4) + line(P(0.5, 0.5, mid + 2), P(0.5, -0.5, mid + 2), C.woodDD!, 2.4);
    o += poly(Lq(-0.06, 0.06, 0.5, mid + 6, plat - 14), DARK, { sw: 1 }) + poly(Rq(0.5, -0.06, 0.06, mid + 6, plat - 14), DARK, { sw: 1 });
    o += box(-0.72, -0.72, 0.72, 0.72, plat - 6, plat, mat(C.woodL!, 'wood'), 'h');
  } else if (lv <= 6) {
    // 下宽上窄的石塔，腰线石箍、两道十字射击狭缝；外挑铁托臂托着宽垛口平台（每面 2 个大齿）
    const mid = Math.round(plat * 0.5);
    const st = mat(C.wallMid!, 'stone');
    o += box(-0.62, -0.62, 0.62, 0.62, 0, mid, st, 'brick');
    o += box(-0.52, -0.52, 0.52, 0.52, mid, plat - 8, mat(C.wallMidL!, 'stone'), 'brick');
    o += line(P(-0.62, 0.62, mid), P(0.62, 0.62, mid), C.wallMidD!, 3) + line(P(0.62, 0.62, mid), P(0.62, -0.62, mid), C.wallMidD!, 3);
    for (const z of [mid - 18, mid + 10]) {
      const c = P(0, 0.62, z);
      o += line([c[0], c[1] - 5], [c[0], c[1] + 5], DARK, 2) + line([c[0] - 3, c[1]], [c[0] + 3, c[1]], DARK, 2);
    }
    // 铁托臂：从塔身斜伸到外挑平台的下沿，两个前面各两根
    for (const q of [-0.3, 0.3]) o += line(P(q, 0.52, plat - 22), P(q, 0.8, plat - 8), C.ironD!, 3) + line(P(0.52, q, plat - 22), P(0.8, q, plat - 8), C.ironD!, 3);
    o += merlons(-0.8, -0.8, 0.8, 0.8, plat, 9, 2, st, true);
    o += box(-0.8, -0.8, 0.8, 0.8, plat - 8, plat, st, 'brick');
    o += merlons(-0.8, -0.8, 0.8, 0.8, plat, 9, 2, st, false);
  } else {
    // 玄武岩棱柱高塔：四角斜扶壁、竖向锻铁肋条，两层悬挑回廊
    const ba = mat(C.wallDark!, 'stone');
    for (const [x, y] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62]] as const) o += box(x - 0.16, y - 0.16, x + 0.16, y + 0.16, 0, Math.round(plat * 0.4), mat(C.wallDarkD!, 'stone'), '', 1.4);
    o += box(-0.55, -0.55, 0.55, 0.55, 0, plat - 8, ba, 'brick');
    for (const q of [-0.25, 0.25]) o += line(P(q, 0.55, 4), P(q, 0.55, plat - 10), C.ironD!, 2) + line(P(0.55, q, 4), P(0.55, q, plat - 10), C.ironD!, 2);
    o += box(0.46, 0.46, 0.78, 0.78, 0, Math.round(plat * 0.4), mat(C.wallDarkD!, 'stone'), '', 1.4);
    const g1 = Math.round(plat * 0.62);
    o += box(-0.72, -0.72, 0.72, 0.72, g1 - 5, g1, mat(C.wallDarkL!, 'stone'), 'brick');
    o += win(Lq(-0.12, 0.12, 0.55, g1 + 6, g1 + 18), lv === 8 ? C.fireL! : GLOW) + win(Rq(0.55, -0.12, 0.12, g1 + 6, g1 + 18), darken(lv === 8 ? C.fireL! : GLOW, 0.2));
    o += box(-0.82, -0.82, 0.82, 0.82, plat - 7, plat, mat(C.wallDarkL!, 'stone'), 'brick');
    o += line(P(-0.82, 0.82, plat), P(0.82, 0.82, plat), C.copper!, 2.4) + line(P(0.82, 0.82, plat), P(0.82, -0.82, plat), C.copperD!, 2.4);
    if (lv === 8) {
      // 回廊正前的金色双枪交叉盾徽
      const c = P(0, 0.83, g1 - 14);
      o += path(`M${f(c[0] - 6)},${f(c[1] - 7)} L${f(c[0] + 6)},${f(c[1] - 7)} L${f(c[0] + 6)},${f(c[1] + 1)} Q${f(c[0])},${f(c[1] + 8)} ${f(c[0] - 6)},${f(c[1] + 1)} Z`, C.gold!, { sw: 1.4 });
      o += line([c[0] - 4, c[1] + 3], [c[0] + 4, c[1] - 5], C.woodDD!, 1.6) + line([c[0] + 4, c[1] + 3], [c[0] - 4, c[1] - 5], C.woodDD!, 1.6);
    }
  }
  o += gtPosts(lv);
  // 没顶棚的几级：旗插在平台后角
  if (!gtRoofed(lv)) o += towerFlag(-0.55, -0.55, plat, 26 + lv * 3, lv, true);
  if (NOGUN) return o;
  // 整张图（图标、没烘好分件时）：平台上一个火枪手的剪影 + 顶棚
  const ring = P(0, 0, plat + 6);
  o += ell(ring[0] - 4, ring[1] - 22, 7.5, 7.5, C.skin!, { sw: 1.8 }) + path(`M${f(ring[0] - 12)},${f(ring[1] - 26)} Q${f(ring[0] - 4)},${f(ring[1] - 40)} ${f(ring[0] + 5)},${f(ring[1] - 26)} Z`, C.red!, { sw: 1.6 });
  o += tube([ring[0] - 2, ring[1] - 10], [ring[0] + 26, ring[1] + 4], 4.5, 4, C.ironD!, C.stoneL!);
  o += gtRoofBody(lv);
  return o;
}

/** 顶棚本体和顶上的旗（底座整张图和 gunTowerRoof 共用） */
function gtRoofBody(lv: number): string {
  if (!gtRoofed(lv)) return '';
  const { zr, rx, h } = gtRoof(lv);
  let o = '';
  let apex = zr + h;
  if (lv === 2) {
    // 斜帆布棚：后高前低的一块布
    const e = 0.5;
    o += poly([P(-e, -e, zr), P(e, -e, zr), P(e, e, zr - 10), P(-e, e, zr - 10)], C.cream!, { sw: 1.6 });
    o += line(P(-e, e, zr - 10), P(e, e, zr - 10), C.creamD!, 2);
    apex = zr;
  } else if (lv === 4) {
    o += cone(0, 0, rx, zr, h, mat(C.roofTile!, 'wood'), 5);
  } else if (lv === 6) {
    o += cyl(0, 0, rx - 4, zr - 4, zr, M.ironD, 0, 1.4) + cone(0, 0, rx, zr, h, mat(C.roofSlate!, 'stone'), 4);
  } else {
    o += cyl(0, 0, rx - 2, zr - 5, zr, mat(lv === 8 ? C.gold! : C.copper!, 'iron'), 0, 1.4) + cone(0, 0, rx, zr, h, mat(C.roofSlateD!, 'stone'), 4);
    const a = P(0, 0, zr + h);
    o += ell(a[0], a[1], 3.4, 3.4, C.copperL!, { sw: 1.2 });
  }
  o += towerFlag(0, 0, apex - 2, 18 + lv * 3, lv, true);
  return o;
}



function mine(lv: number): string {
  let o = '';
  o += ell(0, 2, 26, 13, C.sandD!, { sw: 1.6 }) + ell(0, 0, 23, 11.5, C.sand!, { sw: 0 });
  o += cyl(0, 0, 15, 0, 5 + lv, lm(lv), 0, 1.8);
  const n = 2 + lv;
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2;
    const x = Math.cos(an) * 13;
    const y = Math.sin(an) * 6.5 - 5;
    if (Math.sin(an) > -0.5) o += poly([[x - 2.2, y], [x + 2.2, y], [x, y - 4 - lv]], lv >= 5 ? C.gold! : C.ironL!, { sw: 1.3 });
  }
  if (lv >= 4) o += ell(0, -5, 17, 8.5, 'none', { sw: 2, stroke: trim(lv) });
  o += ell(0, -6 - lv, 5, 3, C.red!, { sw: 1.6 }) + ell(-1.2, -7 - lv, 1.6, 0.9, C.redL!, { sw: 0 });
  return o;
}


// ================================================================= 资源与仓库

/**
 * 金矿（矮宽的岩丘，丘前挖出矿洞，越高级洞口越大、井架越高）：1–2 级木框小洞口、一辆手推矿车；3–4 级切石门洞、旁边木吊架；
 * 5–6 级花岗岩门楼、木井架塔；7–8 级玄武岩门楼带宽垛口和铁闸、冷钢桁架井架、两辆冷钢矿车。
 */
const MINE_GATE = [0, 30, 42, 52] as const;
/** 金矿山顶金堆的位置（屏幕，相对锚点、未乘放大倍数）：画图和基地里的闪光共用 */
const MINE_TOP: Pt = [-8, -70];
function goldmine(lv: number): string {
  const t = tier4(lv);
  let o = '';
  const rock = '#a59077';
  o += path('M-80,22 C-86,-6 -66,-30 -42,-46 C-24,-76 22,-88 44,-56 C62,-40 84,-22 86,10 C60,40 -50,44 -80,22 Z', rock, { sw: 2.4 });
  o += path('M44,-56 C62,-40 84,-22 86,10 C60,40 20,44 -6,38 C30,18 42,-20 44,-56 Z', darken(rock, 0.28), { sw: 0 });
  o += path('M-80,22 C-86,-6 -66,-30 -42,-46 C-30,-60 -14,-70 0,-74 C-30,-46 -50,-10 -56,30 C-66,30 -74,28 -80,22 Z', lighten(rock, 0.22), { sw: 0 });
  o += path('M-80,22 C-86,-6 -66,-30 -42,-46 C-24,-76 22,-88 44,-56 C62,-40 84,-22 86,10 C60,40 -50,44 -80,22 Z', 'none', { sw: 2.4 });
  o += line([-30, -52], [-18, -30], darken(rock, 0.4), 1.4, 0.7) + line([10, -62], [18, -40], darken(rock, 0.45), 1.4, 0.7);
  const veins: Array<[number, number, number]> = [[-52, -14, 6], [18, -52, 7], [34, -22, 5], [-22, -62, 5], [58, -6, 6], [-6, -66, 6], [0, -40, 6], [-60, -30, 5], [66, -30, 5]];
  for (let i = 0; i < Math.min(veins.length, 2 + lv); i++) o += nugget(veins[i]![0], veins[i]![1], veins[i]![2]);
  // 井架（右后）：吊架 → 木井架塔 → 冷钢桁架，越高级越高
  if (t >= 1) {
    const hh = [0, 50, 72, 88][t]! + (lv % 2 === 0 ? 6 : 0);
    const leg = t === 3 ? STEEL_C : C.woodD!;
    if (t === 1) {
      o += line([46, -2], [54, -hh], leg, 4) + line([62, -4], [58, -hh], leg, 4);
      o += line([50, -hh - 2], [82, -hh + 6], C.woodDD!, 4.5);
      o += line([80, -hh + 6], [80, -hh + 30], C.cream!, 1.4) + rect(72, -hh + 30, 16, 12, C.woodD!, { sw: 1.8 });
    } else {
      // 两对斜腿收到顶上的滑轮台，中间几道横撑（7–8 级加交叉斜撑）
      const L: Pt[] = [[44, 4], [58, 10], [74, 2], [86, 6]];
      const top: Pt = [65, -hh];
      for (const q of L) o += line(q, [top[0] + (q[0] - 65) * 0.18, top[1] + 6], leg, t === 3 ? 3.6 : 4.2);
      for (let k = 1; k <= 3; k++) {
        const u = k / 4;
        const at = (q: Pt): Pt => [q[0] + (top[0] + (q[0] - 65) * 0.18 - q[0]) * u, q[1] + (top[1] + 6 - q[1]) * u];
        o += line(at(L[0]!), at(L[3]!), leg, 2.4);
        if (t === 3 && k < 3) o += line(at(L[0]!), [at(L[3]!)[0], at(L[3]!)[1] - (hh / 4)], leg, 1.6) + line(at(L[3]!), [at(L[0]!)[0], at(L[0]!)[1] - (hh / 4)], leg, 1.6);
      }
      o += rect(top[0] - 13, top[1] - 2, 26, 6, t === 3 ? STEEL_C : C.woodDD!, { sw: 1.6 });
      o += ell(top[0], top[1] - 9, 10, 10, t === 3 ? '#4b5a70' : C.ironD!, { sw: 2 }) + ell(top[0], top[1] - 9, 3, 3, t === 3 ? trim(lv) : C.ironL!, { sw: 1 });
      if (t === 3) o += ell(top[0], top[1] - 9, 10, 10, 'none', { stroke: trim(lv), sw: 1.6 });
      o += line([top[0] - 9, top[1] - 6], [-2, 2], C.cream!, 1.2, 0.8);
    }
  }
  // 矿洞口：木框 → 切石门洞 → 花岗岩门楼 → 玄武岩门楼（垛口、铁闸）
  if (t === 0) {
    o += path('M-26,24 L-26,-6 Q-10,-24 8,-6 L8,24 Z', DARK, { sw: 2 });
    o += line([-28, 26], [-28, -6], C.woodD!, 5) + line([10, 26], [10, -6], C.woodD!, 5) + line([-32, -5], [14, -5], C.woodD!, 5.5);
    o += line([-28, 26], [-28, -6], C.woodL!, 1.5) + line([-32, -6.5], [14, -6.5], C.woodL!, 1.5);
  } else {
    const H = MINE_GATE[t] + (lv % 2 === 0 ? 4 : 0);
    const g = t === 1 ? mat(C.stone!, 'stone') : t === 2 ? mat(C.wallMid!, 'stone') : mat(C.wallDark!, 'stone');
    const [x0, y0, x1, y1] = t === 1 ? [0.1, 0.55, 1.05, 1.1] : [-0.05, 0.5, 1.2, 1.2];
    o += box(x0, y0, x1, y1, 0, H, g, 'brick');
    const xc = (x0 + x1) / 2 - 0.05;
    o += poly(archL(xc, t === 1 ? 0.24 : 0.3, y1, 0, H * 0.42, H * 0.26), DARK, { sw: 2 });
    if (t === 1) o += poly(Lq(xc - 0.06, xc + 0.06, y1, H * 0.66, H * 0.8), C.stoneL!, { sw: 1.2 });
    if (t === 2) o += line(P(xc - 0.34, y1, H * 0.7), P(xc + 0.34, y1, H * 0.7), C.woodD!, 3.4);
    if (t === 3) {
      for (const dx of [-0.16, -0.05, 0.06, 0.17]) o += line(P(xc + dx, y1, 2), P(xc + dx, y1, H * 0.62), STEEL_C, 1.8);
      o += line(P(x0, y1, H - 6), P(x1, y1, H - 6), trim(lv), 2.2) + line(P(x1, y1, H - 6), P(x1, y0, H - 6), darken(trim(lv), 0.25), 2.2);
      o += merlons(x0, y0, x1, y1, H, 7, 3, g, true) + merlons(x0, y0, x1, y1, H, 7, 3, g, false);
    }
  }
  // 矿车轨道：从洞口斜着铺出来（木枕 → 铁枕 → 冷钢轨），矿车停在轨道上
  const g0: Pt = t === 0 ? [-9, 26] : [-17, 30];
  const g1: Pt = [-92, 66];
  const tie = t === 3 ? STEEL_C : t === 0 ? C.woodD! : C.ironD!;
  for (let k = 0; k <= 6; k++) {
    const u = k / 6;
    const c: Pt = [g0[0] + (g1[0] - g0[0]) * u, g0[1] + (g1[1] - g0[1]) * u];
    o += line([c[0] - 6, c[1] - 6], [c[0] + 6, c[1] + 6], tie, 3);
  }
  for (const s of [-4, 4]) o += line([g0[0] - s, g0[1] + s], [g1[0] - s, g1[1] + s], t === 3 ? trim(lv) : '#5b5f6a', 1.8);
  // 山顶的金堆：3 级起露头，越高级越大（基地里这里间歇闪光、蹦金币）
  if (t >= 1) o += goldPile(MINE_TOP[0], MINE_TOP[1], [0, 8, 11, 14][t]!);
  // 矿车：木轮手推车 → 铁车（4 级起两辆）→ 冷钢车（包边铜）
  const cart = (cx: number, cy: number, pile: number): string => {
    const body = t === 0 ? C.wood! : t === 3 ? STEEL_C : C.ironD!;
    let s = poly([[cx - 16, cy - 14], [cx + 16, cy - 14], [cx + 12, cy + 4], [cx - 12, cy + 4]], body, { sw: 2 });
    if (t === 3) s += line([cx - 16, cy - 13], [cx + 16, cy - 13], trim(lv), 1.6);
    s += goldPile(cx, cy - 18, pile);
    return s + ell(cx - 9, cy + 6, 4, 4, '#1a1a22', { sw: 1.4 }) + ell(cx + 9, cy + 6, 4, 4, '#1a1a22', { sw: 1.4 });
  };
  o += cart(t === 0 ? -40 : -52, t === 0 ? 40 : 44, 9 + lv);
  if (lv >= 4) o += cart(-80, 56, 8);
  if (lv >= 5) o += goldPile(36, 26, 12);
  if (lv >= 6) o += goldPile(-64, -4, 9);
  return o;
}

/** 大锯轮的里圈（实心盘 + 6 根辐条 + 轴心）：在 gy 为常数的竖直面上，圆会被压成斜椭圆。基地里转的那几帧（sawSpinFrames）只画这一圈，盖住静态图的里圈 */
function sawHub(gx: number, gy: number, z: number, R: number, hub: string, steel: string, spin: number): string {
  const c = P(gx, gy, z);
  let inner = ell(0, 0, R * 0.8, R * 0.8, steel, { sw: 0 });
  inner += ell(0, 0, R * 0.5, R * 0.5, darken(steel, 0.12), { sw: 1.4 });
  for (let i = 0; i < 6; i++) {
    const an = spin + (i * Math.PI) / 3;
    inner += line([Math.cos(an) * R * 0.2, Math.sin(an) * R * 0.2], [Math.cos(an) * R * 0.78, Math.sin(an) * R * 0.78], darken(steel, 0.3), 2.4);
  }
  inner += ell(0, 0, R * 0.2, R * 0.2, hub, { sw: 1.6 });
  return `<g transform="translate(${f(c[0])} ${f(c[1])}) matrix(0.894 0.447 0 1 0 0)">${inner}</g>`;
}
/** 大锯轮：一圈锯齿 + 里圈 */
function sawWheel(gx: number, gy: number, z: number, R: number, hub: string, steel: string, spin = 0): string {
  const c = P(gx, gy, z);
  const teeth: Pt[] = [];
  const n = 24;
  for (let i = 0; i < n * 2; i++) {
    const an = spin + (i * Math.PI) / n;
    const r = i % 2 ? R : R - 6;
    teeth.push([Math.cos(an) * r, Math.sin(an) * r]);
  }
  return `<g transform="translate(${f(c[0])} ${f(c[1])}) matrix(0.894 0.447 0 1 0 0)">${poly(teeth, steel, { sw: 2 })}</g>` + sawHub(gx, gy, z, R, hub, steel, spin);
}
/** 伐木场主锯轮的几何（画图和基地里转的帧共用）：中心 [gx, gy, z]、半径、轴心色、钢色 */
function sawMain(lv: number): { at: [number, number, number]; R: number; hub: string; steel: string } {
  const t = tier4(lv);
  const z0 = t === 0 ? 4 : 6;
  const R = [lv === 1 ? 24 : 28, 33, 37, 40][t]!;
  return { at: [0, 0.3, z0 + 8 + R], R, hub: t === 3 ? trim(lv) : C.gold!, steel: [C.ironL!, C.ironL!, '#c9d6e4', '#aebccc'][t]! };
}

/**
 * 伐木场（敞开的锯棚，大锯轮是主剪影，越高级棚越实、锯轮越多）：1–2 级露天木锯架、单锯轮（2 级茅草棚）；
 * 3–4 级石脚木柱、赤陶瓦棚，一大一小两锯轮；5–6 级后两面石墙的半封闭锯房、蓝灰板瓦、高烟囱；7–8 级玄武岩锯坊、冷钢双锯轮、前面一只蒸汽锅炉。
 */
function sawmill(lv: number): string {
  const t = tier4(lv);
  const g = sawGeom(lv);
  const wm = lm(lv);
  const floor = [mat('#a37a46', 'wood'), mat(C.stone!, 'stone'), mat(C.wallMid!, 'stone'), mat(C.wallDark!, 'stone')][t]!;
  let o = '';
  o += box(-1.4, -1.4, 1.4, 1.4, 0, t === 0 ? 4 : 6, floor, t === 0 ? 'h' : 'brick');
  const z0 = t === 0 ? 4 : 6;
  // 半封闭锯房：后两面墙（5 级起），只到棚檐一半高，大锯轮在前面高出墙头
  if (t >= 2) {
    o += box(-1.4, -1.4, 1.4, -1.12, z0, g.ph, wm, 'brick');
    o += box(-1.4, -1.12, -1.12, 1.0, z0, g.ph, wm, 'brick');
  }
  const post = (gx: number, gy: number, h: number): string => {
    const p = P(gx, gy, z0);
    let s = '';
    if (t === 1) s += box(gx - 0.12, gy - 0.12, gx + 0.12, gy + 0.12, z0, z0 + 10, mat(C.stoneD!, 'stone'), '', 1.4);
    return s + line(p, [p[0], p[1] - h], C.woodDD!, 5) + line([p[0] - 1, p[1]], [p[0] - 1, p[1] - h], wm.t, 1.6, 0.8);
  };
  if (t <= 1) o += post(-1.2, -1.2, g.ph - z0) + post(1.2, -1.2, g.ph - z0);
  // 棚顶：1 级没有，2 级茅草、3–4 级赤陶瓦、5–6 级蓝灰板瓦、7–8 级深板瓦镶铜边；只盖后半，大锯轮画在棚顶前面、顶出棚檐
  if (g.ph > 0 && lv >= 2) {
    const z = g.ph + 4;
    const fy = t === 0 ? 0.6 : -0.1;
    const A = P(-1.5, -1.5, z);
    const B = P(1.5, -1.5, z);
    const Cc = P(1.5, fy, z - (t === 0 ? 6 : 14));
    const D = P(-1.5, fy, z - (t === 0 ? 6 : 14));
    const roofC = ['#c9a24f', C.roofTile!, C.roofSlate!, C.roofSlateD!][t]!;
    o += poly([A, B, Cc, D], roofC);
    for (let i = 1; i < 6; i++) {
      const u = i / 6;
      o += line([A[0] + (D[0] - A[0]) * u, A[1] + (D[1] - A[1]) * u], [B[0] + (Cc[0] - B[0]) * u, B[1] + (Cc[1] - B[1]) * u], darken(roofC, 0.3), 1, 0.5);
    }
    o += poly([A, B, Cc, D], 'none');
    if (t === 3) o += line(D, Cc, trim(lv), 3) + line(Cc, B, darken(trim(lv), 0.25), 3);
  }
  const [cx, cy, c0, c1] = g.chim;
  o += chimney(cx, cy, c0, c1);
  if (t >= 1) o += post(-1.2, -0.1, g.ph - z0 - 14) + post(1.2, -0.1, g.ph - z0 - 14);
  // 锯轮机架：1–2 级两根木叉架，3 级起石墩，7–8 级冷钢；大锯轮是全岛最大的圆，3 级起左前再一只小锯轮
  const sw = sawMain(lv);
  const frame = t === 3 ? mat(STEEL_C, 'iron') : t >= 1 ? mat(C.stoneD!, 'stone') : wm;
  o += box(-0.95, 0.15, 0.95, 0.45, z0, z0 + 8, frame, t >= 1 ? 'brick' : 'h', 1.8);
  for (const dx of [-0.75, 0.75]) {
    const b = P(dx, 0.3, z0 + 8);
    const top = P(0, 0.3, sw.at[2]);
    o += line(b, top, OUT, 6) + line(b, top, t === 3 ? STEEL_C : C.woodD!, 4);
  }
  o += sawWheel(sw.at[0], sw.at[1], sw.at[2], sw.R, sw.hub, sw.steel, 0.2);
  if (t >= 1) o += sawWheel(-1.0, 0.75, z0 + 22, [0, 16, 20, 22][t]!, C.goldD!, sw.steel, 0.5);
  // 工作台 + 正在锯的原木（一头顶着锯齿，锯末堆在台下）
  o += box(-1.0, 0.55, 1.0, 0.9, z0, z0 + 8, M.woodL, 'h', 1.8);
  o += log(-34, 38 - lv, 38, 6, C.wood!) + log(-30, 27, 38, 5.5, C.woodL!);
  const dust = P(0.2, 1.0, z0);
  o += ell(dust[0], dust[1], 14, 5, '#e8c98a', { sw: 1.2 }) + ell(dust[0] - 3, dust[1] - 1.5, 6, 2, '#f6e2b0', { sw: 0 });
  if (t === 0 && lv === 2) o += post(-1.2, 1.2, g.ph - z0) + post(1.2, 1.2, g.ph - z0);
  // 蒸汽锅炉（7–8 级，右前）
  if (t === 3) {
    o += cyl(1.15, 0.45, 13, z0, z0 + 30, mat(STEEL_C, 'iron'), 2, 1.6);
    o += cyl(1.15, 0.45, 14, z0 + 26, z0 + 30, mat(trim(lv), 'iron'), 0, 1.2);
  }
  // 木板堆、圆木堆
  o += box(0.65, 1.0, 1.3, 1.3, z0, z0 + 10 + lv * 2, M.woodL, 'h', 1.8);
  o += log(-84, 50, 34, 6, C.wood!) + log(-80, 61, 34, 6, C.woodL!);
  if (lv >= 3) o += log(-60, 56, 34, 6, C.wood!);
  if (lv >= 4) o += log(-76, 40, 34, 6, C.woodL!);
  return o;
}

/** 圆柱正面的一道箍（前半圈的弧，z 处、半径 r 屏幕像素、宽 w） */
function hoopArc(r: number, z: number, color: string, w: number): string {
  const c = P(0, 0, z);
  return path(`M${f(c[0] - r)},${f(c[1])} A${r},${r / 2} 0 0 0 ${f(c[0] + r)},${f(c[1])}`, 'none', { stroke: OUT, sw: w + 2 }) + path(`M${f(c[0] - r)},${f(c[1])} A${r},${r / 2} 0 0 0 ${f(c[0] + r)},${f(c[1])}`, 'none', { stroke: color, sw: w });
}
/** 圆顶：底圆半径 r（屏幕像素）、高 dh，顶上一颗球 */
function dome(z: number, r: number, dh: number, color: string, knob: string): string {
  const c = P(0, 0, z);
  const ry = r / 2;
  let o = path(`M${f(c[0] - r)},${f(c[1])} A${r},${dh} 0 0 1 ${f(c[0] + r)},${f(c[1])} A${r},${ry} 0 0 1 ${f(c[0] - r)},${f(c[1])} Z`, color, { sw: 2.2 });
  o += path(`M${f(c[0] + r * 0.25)},${f(c[1] - dh + 3)} A${r},${dh} 0 0 1 ${f(c[0] + r)},${f(c[1])} A${r},${ry} 0 0 1 ${f(c[0])},${f(c[1] + ry)} Q${f(c[0] + r * 0.32)},${f(c[1] - 10)} ${f(c[0] + r * 0.25)},${f(c[1] - dh + 3)} Z`, darken(color, 0.25), { sw: 0, op: 0.85 });
  o += path(`M${f(c[0] - r * 0.7)},${f(c[1] - 8)} Q${f(c[0] - r * 0.53)},${f(c[1] - dh + 6)} ${f(c[0] - r * 0.1)},${f(c[1] - dh + 3)}`, 'none', { stroke: lighten(color, 0.5), sw: 3, op: 0.7 });
  return o + ell(c[0], c[1] - dh + 1, 5, 5, knob, { sw: 1.6 });
}

/**
 * 金库（矮胖的圆仓加圆顶，越高级越高越实）：1–2 级箍木圆仓、木瓦圆顶；3–4 级切石圆仓、铁皮圆顶；
 * 5–6 级两层收分的花岗岩圆堡、深铁圆顶；7–8 级玄武岩圆堡、四个扶壁、一圈宽垛口，冷钢圆顶尖上铜（8 级金）球。
 */
function vault(lv: number): string {
  const t = tier4(lv);
  const rank = lv % 2 === 0 ? 1 : 0;
  const sm = lm(lv);
  const hoop = mat(t === 3 ? trim(lv) : C.ironD!, 'iron');
  let o = '';
  o += cyl(0, 0, 66, 0, 6, [mat('#c49a62', 'wood'), mat('#8f979e', 'stone'), mat(C.wallMidD!, 'stone'), mat(C.wallDarkD!, 'stone')][t]!, 0);
  let top: number;
  let r: number;
  if (t <= 1) {
    r = t === 0 ? 50 : 56;
    top = (t === 0 ? 34 : 44) + rank * 4;
    o += cyl(0, 0, r, 6, top, t === 0 ? mat(lv === 1 ? C.woodLight! : C.wood!, 'wood') : sm, t === 0 ? 0 : 3);
    // 箍：只画前半圈的弧（画成矮圆柱的话，它的顶面会盖住圆仓的正面）；木仓两道细铁箍，石仓两道宽箍
    const hb = t === 0 ? 3 : 5;
    o += hoopArc(r, 12, hoop.l, hb) + hoopArc(r, top - 7, hoop.l, hb);
  } else {
    if (t === 3) for (const [x, y] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]] as const) {
      if (x + y < 0) o += box(x - 0.2, y - 0.2, x + 0.2, y + 0.2, 6, 34, mat(C.wallDarkD!, 'stone'), 'brick', 1.4);
    }
    o += cyl(0, 0, 60, 6, 36, sm, 2);
    if (t === 3) {
      for (const [x, y] of [[1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]] as const) o += box(x - 0.2, y - 0.2, x + 0.2, y + 0.2, 6, 34, mat(C.wallDarkD!, 'stone'), 'brick', 1.4);
      o += ringBlocks(1.25, Math.PI * 0.75, Math.PI * 1.75, 5, 36, 44, sm, 0.26);
    }
    r = 46;
    top = (t === 2 ? 60 : 68) + rank * 4;
    o += cyl(0, 0, r, 36, top, sm, 2);
    o += hoopArc(60, 30, hoop.l, 4) + hoopArc(r, top - 6, hoop.l, 5);
    if (t === 3) o += ringBlocks(1.25, Math.PI * -0.25, Math.PI * 0.75, 5, 36, 44, sm, 0.26);
  }
  const domeC = ['#a8703a', '#9aa6b4', '#6f7c8c', '#56667c'][t]!;
  o += dome(top, r, 24 + r * 0.12 + rank * 2, domeC, t === 3 ? trim(lv) : t === 0 ? C.woodD! : C.ironL!);
  // 铁门（前）：5 级起门上加一道石门罩
  const d0 = P(-0.3, 0.84, 6);
  const d1 = P(0.3, 0.84, 6);
  o += poly([[d0[0] - 12, d0[1] + 10], [d1[0] + 12, d1[1] + 12], [d1[0] + 12, d1[1] - 20], [d0[0] - 12, d0[1] - 26]], '#3b4150', { sw: 2.2 });
  o += poly([[d0[0] - 8, d0[1] + 8], [d1[0] + 8, d1[1] + 6], [d1[0] + 8, d1[1] - 17], [d0[0] - 8, d0[1] - 21]], t === 3 ? STEEL_C : C.ironD!, { sw: 1.4 });
  const mid: Pt = [(d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2 - 6];
  o += ell(mid[0], mid[1], 5, 5, t === 3 ? trim(lv) : C.ironL!, { sw: 1.6 }) + ell(mid[0], mid[1], 1.6, 1.6, DARK, { sw: 0 });
  for (const k of [-10, 8]) o += line([d0[0] - 8, d0[1] + k * 0.2 - 4 + k], [d1[0] + 8, d1[1] + k * 0.2 - 8 + k], C.iron!, 2.2);
  if (t >= 2) o += poly([[d0[0] - 16, d0[1] - 26], [d1[0] + 16, d1[1] - 20], [d1[0] + 12, d1[1] - 30], [d0[0] - 12, d0[1] - 36]], sm.t, { sw: 1.6 });
  // 金币堆：级别越高越多
  o += goldPile(-62, 52, 9 + lv);
  if (lv >= 3) o += goldPile(54, 48, 8 + lv / 2);
  if (lv >= 5) o += goldPile(-20, 66, 9) + goldPile(32, 64, 8);
  // 宝箱
  const cx = 64;
  const cy = 22;
  o += poly([[cx - 12, cy - 8], [cx + 12, cy - 8], [cx + 12, cy + 6], [cx - 12, cy + 6]], C.woodD!, { sw: 2 });
  o += path(`M${cx - 12},${cy - 8} Q${cx},${cy - 22} ${cx + 12},${cy - 8} Z`, C.wood!, { sw: 2 }) + rect(cx - 2.5, cy - 10, 5, 7, C.gold!, { sw: 1.4 });
  return o;
}

/**
 * 木料场（露天的原木场，左前一座三角原木垛是主剪影，右边一根吊杆，越高级垛越高、吊杆越高越长）：
 * 1–2 级麻绳捆的原木垛、木三脚吊杆（2 级后面一溜草棚）；3–4 级石脚木柱、赤陶瓦后棚，木吊杆加斜撑；
 * 5–6 级后半截矮石墙、蓝灰板瓦，原木垛箍铁带，高木吊架；7–8 级玄武岩矮墙、深板瓦镶铜边，冷钢桁架吊臂，垛上原木头包铜。
 * 吊杆下晃的那捆木头只在基地里画（basebldfx.ts），这里只画吊钩。
 */
function woodyard(lv: number): string {
  const t = tier4(lv);
  const g = woodGeom(lv);
  const wm = lm(lv);
  const z0 = t === 0 ? 3 : 6;
  let o = '';
  o += box(-1.35, -1.35, 1.35, 1.35, 0, z0, [mat('#b89258', 'wood'), mat(C.stone!, 'stone'), mat(C.wallMid!, 'stone'), mat(C.wallDark!, 'stone')][t]!, t === 0 ? 'h' : 'brick', 1.8);
  const post = (gx: number, gy: number, h: number): string => {
    const p = P(gx, gy, z0);
    let s = '';
    if (t >= 1) s += box(gx - 0.12, gy - 0.12, gx + 0.12, gy + 0.12, z0, z0 + 10, mat(C.stoneD!, 'stone'), '', 1.4);
    return s + rect(p[0] - 3, p[1] - h, 6, h, (t === 0 ? lm(2) : M.wood).l, { sw: 1.8 }) + ell(p[0], p[1] - h, 3, 1.5, wm.t, { sw: 1 });
  };
  // 后棚（2 级起）：只盖后面一溜，放锯好的板材
  if (g.ph) {
    if (t >= 2) o += box(-1.35, -1.35, 1.35, -1.12, z0, g.ph * 0.6, wm, 'brick') + box(-1.35, -1.12, -1.12, -0.25, z0, g.ph * 0.6, wm, 'brick');
    o += post(-1.25, -1.25, g.ph - z0) + post(1.25, -1.25, g.ph - z0);
    o += box(-1.0, -1.1, 1.0, -0.5, z0, z0 + 14 + t * 6, M.woodL, 'h', 1.8);
    const A = P(-1.4, -1.4, g.ph);
    const B = P(1.4, -1.4, g.ph);
    const Cc = P(1.4, -0.25, g.ph - 10);
    const D = P(-1.4, -0.25, g.ph - 10);
    const roofC = ['#c9a24f', C.roofTile!, C.roofSlate!, C.roofSlateD!][t]!;
    o += poly([A, B, Cc, D], roofC);
    for (let i = 1; i < 5; i++) {
      const u = i / 5;
      o += line([A[0] + (D[0] - A[0]) * u, A[1] + (D[1] - A[1]) * u], [B[0] + (Cc[0] - B[0]) * u, B[1] + (Cc[1] - B[1]) * u], darken(roofC, 0.3), 1, 0.5);
    }
    if (t === 3) o += line(D, Cc, trim(lv), 3) + line(Cc, B, darken(trim(lv), 0.25), 3);
    o += post(-1.25, -0.3, g.ph - z0 - 10) + post(1.25, -0.3, g.ph - z0 - 10);
  }
  // 吊杆：立柱 + 挑出去的臂 + 斜撑，吊钩在臂尖
  const [mx, my, mt, tx, ty, tz] = g.crane;
  const arm = t === 3 ? STEEL_C : t === 2 ? C.woodDD! : C.woodD!;
  const mb = P(mx, my, z0);
  const mtop = P(mx, my, mt);
  const tip = P(tx, ty, tz);
  if (t === 0) {
    // 三脚架：两根斜腿
    o += line(P(mx - 0.3, my - 0.25, z0), mtop, OUT, 6) + line(P(mx - 0.3, my - 0.25, z0), mtop, arm, 4);
    o += line(P(mx + 0.25, my - 0.3, z0), mtop, OUT, 6) + line(P(mx + 0.25, my - 0.3, z0), mtop, arm, 4);
  } else o += box(mx - 0.13, my - 0.13, mx + 0.13, my + 0.13, z0, z0 + 8, t === 3 ? mat(STEEL_C, 'iron') : mat(C.stoneD!, 'stone'), '', 1.4);
  o += line(mb, mtop, OUT, t === 0 ? 7 : 8) + line(mb, mtop, arm, t === 0 ? 5 : 6);
  o += line(mtop, tip, OUT, 7) + line(mtop, tip, arm, 5);
  if (t >= 1) {
    const br = P(mx, my, mt - [0, 26, 34, 40][t]!);
    const mid: Pt = [(mtop[0] + tip[0] * 2) / 3, (mtop[1] + tip[1] * 2) / 3];
    o += line(br, mid, OUT, 4.4) + line(br, mid, arm, 2.8);
  }
  if (t === 3) {
    // 桁架：臂上一排三角
    for (let k = 1; k < 4; k++) {
      const u = k / 4;
      const q: Pt = [mtop[0] + (tip[0] - mtop[0]) * u, mtop[1] + (tip[1] - mtop[1]) * u];
      o += line(q, [q[0] - 4, q[1] - 8], STEEL_C, 2) + line([q[0] - 4, q[1] - 8], [q[0] + 4, q[1] - 6], STEEL_C, 2);
    }
    o += line(mtop, tip, trim(lv), 1.4);
  }
  o += ell(tip[0], tip[1], 3.6, 3.6, t === 3 ? trim(lv) : C.ironD!, { sw: 1.4 });
  o += line(tip, [tip[0], tip[1] + 8], C.cream!, 1.4) + path(`M${f(tip[0] - 3)},${f(tip[1] + 8)} q3,6 6,0`, 'none', { stroke: C.ironD!, sw: 2 });
  // 三角原木垛（左前）：每层少一根，越高级层数越多、原木越粗
  const rows = [3, 4, 4, 5][t]! + (lv % 2 === 0 ? 1 : 0);
  const rr = [5.5, 6, 6.5, 6.5][t]!;
  const d = (rr * 2.05) / 35.8;
  const gx0 = -1.25;
  const span = 1.35;
  const gy0 = 0.95 - rows * d;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < rows - i; j++) {
      const gy = gy0 + (j + i / 2) * d;
      const q = P(gx0, gy, z0 + rr + i * rr * 1.72);
      o += log(q[0], q[1], span * 32, rr, (i + j) % 2 ? C.woodL! : C.wood!);
      if (t === 3) o += ell(q[0] + span * 32, q[1] + span * 16, rr * 0.5 + 1, rr + 1, 'none', { stroke: trim(lv), sw: 1.2 });
    }
  }
  // 捆垛：1–2 级麻绳、3–4 级不捆、5–8 级两道铁带
  if (t !== 1) {
    const band = t === 0 ? C.cream! : t === 3 ? STEEL_C : C.ironD!;
    for (const u of [0.3, 0.75]) {
      const a = P(gx0 + span * u, gy0 - d * 0.3, z0);
      const b = P(gx0 + span * u, gy0 + (rows - 1) * d / 2, z0 + rr * 2 + (rows - 1) * rr * 1.72);
      const c2 = P(gx0 + span * u, gy0 + rows * d, z0);
      o += path(`M${f(a[0])},${f(a[1])} L${f(b[0])},${f(b[1])} L${f(c2[0])},${f(c2[1])}`, 'none', { stroke: band, sw: t === 0 ? 1.8 : 2.4 });
    }
  }
  // 散在地上的两根
  o += log(20, 40, 30, 6, C.wood!) + log(24, 51, 30, 6, C.woodL!);
  return o;
}

// ================================================================= 船坞与军械所

/** 船坞吊钩（吊杆尖 / 门式吊架横梁上的滑车）的屏幕坐标：画图和基地里晃的货箱共用 */
function dockHook(lv: number): Pt {
  const t = tier4(lv);
  if (t <= 1) {
    const bp = P(-1.1, -0.9, 6);
    return t === 0 ? [bp[0] + 24, bp[1] - 26] : [bp[0] + 34, bp[1] - 32];
  }
  const H = t === 3 ? 92 : 80;
  const p0 = P(-1.05, -1.0, 6);
  const p1 = P(0.95, -1.0, 6);
  return [(p0[0] + p1[0]) / 2 + 12, (p0[1] + p1[1]) / 2 - H + 4];
}

/**
 * 船坞（平的码头加一条船，桅杆是主剪影，越高级船越大、桅越多）：1–2 级木栈桥、小舢板（2 级一根小桅）、矮木吊杆；3–4 级石码头、单桅船、高木吊杆；
 * 5–6 级石船台、双桅船、门式吊架；7–8 级玄武岩干船坞（后两面坞墙）、三桅深色船壳、冷钢吊架。
 */
function dock(lv: number): string {
  const t = tier4(lv);
  let o = '';
  const deck = [mat('#b98448', 'wood'), mat('#a8aeb4', 'stone'), mat(C.wallMid!, 'stone'), mat(C.wallDark!, 'stone')][t]!;
  o += box(-1.45, -1.45, 1.45, 1.45, 0, 6, deck, t === 0 ? 'h' : 'brick');
  o += box(-1.45, 0.9, 1.45, 1.45, 6, 7, mat(t === 0 ? '#8d5c2e' : '#7b858f'), 'h', 1.6);
  // 干船坞的后两面坞墙（7–8 级）
  if (t === 3) {
    o += box(-1.45, -1.45, 1.45, -1.15, 6, 20, deck, 'brick') + box(-1.45, -1.15, -1.15, 0.9, 6, 20, deck, 'brick');
    o += line(P(-1.15, -1.15, 20), P(1.45, -1.15, 20), trim(lv), 2) + line(P(-1.15, -1.15, 20), P(-1.15, 0.9, 20), darken(trim(lv), 0.2), 2);
  }
  for (const [gx, gy] of [[-1.2, 1.2], [1.2, 1.2], [1.2, -1.2]] as const) o += cyl(gx, gy, 5, 6, 16, t === 0 ? M.wood : mat(C.ironD!, 'iron'), 0, 1.6);
  const rc = P(-0.3, 0.3, 7);
  o += ell(rc[0], rc[1], 9, 4.5, C.cream!, { sw: 1.6 }) + ell(rc[0], rc[1], 4, 2, '#a9824f', { sw: 1.2 });
  // 吊杆 / 门式吊架（左后）：吊钩的位置在 dockHook，基地里晃的那只货箱（basebldfx.ts）挂在这里，静态图只画吊绳的头
  const hook = dockHook(lv);
  if (t <= 1) {
    const bp = P(-1.1, -0.9, 6);
    const H = t === 0 ? 38 : 50;
    o += line(bp, [bp[0], bp[1] - H], OUT, 6.4) + line(bp, [bp[0], bp[1] - H], C.woodD!, 4.6);
    o += line([bp[0], bp[1] - H + 2], hook, OUT, 5.4) + line([bp[0], bp[1] - H + 2], hook, C.woodD!, 3.6);
    o += line([bp[0], bp[1] - H * 0.55], [(bp[0] + hook[0]) / 2, (bp[1] - H + hook[1]) / 2], C.woodD!, 2.4);
  } else {
    const leg = t === 3 ? STEEL_C : C.woodD!;
    const H = t === 3 ? 92 : 80;
    const p0 = P(-1.05, -1.0, 6);
    const p1 = P(0.95, -1.0, 6);
    o += line(p0, [p0[0], p0[1] - H], leg, 5) + line(p1, [p1[0], p1[1] - H], leg, 5);
    o += line([p0[0] - 4, p0[1] - H + 2], [p1[0] + 4, p1[1] - H + 2], leg, 6);
    if (t === 3) o += line([p0[0] - 4, p0[1] - H - 1], [p1[0] + 4, p1[1] - H - 1], trim(lv), 1.8);
    // 滑车
    o += rect(hook[0] - 5, hook[1] - 5, 10, 6, t === 3 ? trim(lv) : C.ironD!, { sw: 1.4 });
  }
  o += line(hook, [hook[0], hook[1] + 6], C.cream!, 1.4);
  // 船：舢板 → 单桅 → 双桅 → 三桅，越高级船身越长
  const sc = P(0.5, 0.2, 7);
  const hl = [lv === 1 ? 18 : 26, 36, 44, 52][t]!;
  const hull: Pt[] = [[sc[0] - hl, sc[1] - 6], [sc[0] + hl, sc[1] - 20], [sc[0] + hl + 14 + t * 2, sc[1] - 24], [sc[0] + hl - 4, sc[1] + 14], [sc[0] - hl + 10, sc[1] + 20]];
  o += poly(hull, [C.wood!, C.woodD!, C.redD!, '#2c313c'][t]!, { sw: 2 });
  o += line([hull[0]![0] + 3, hull[0]![1] + 5], [hull[3]![0] - 3, hull[3]![1] - 5], C.woodL!, 2);
  o += line([hull[4]![0] + 4, hull[4]![1] - 4], [hull[3]![0] - 2, hull[3]![1] - 4], t === 3 ? trim(lv) : C.woodDD!, 2.2);
  const masts = lv === 1 ? 0 : [1, 1, 2, 3][t]!;
  const mh = [36, 56, 66, 76][t]! + (lv % 2 === 0 && lv > 2 ? 4 : 0);
  for (let k = 0; k < masts; k++) {
    const mx = sc[0] - (masts - 1) * 13 + k * 26;
    const my = sc[1] - 6 - k * 6;
    const h = k === Math.floor(masts / 2) ? mh : mh - 12;
    o += line([mx, my], [mx, my - h], C.woodDD!, 3.6);
    o += path(`M${f(mx + 2)},${f(my - h + 6)} Q${f(mx + 18 + t * 3)},${f(my - h * 0.55)} ${f(mx + 2)},${f(my - 12)} Z`, C.cream!, { sw: 1.8 });
    if (t >= 2 && k === Math.floor(masts / 2)) o += skull(mx + 9, my - h * 0.55, 9, false);
  }
  o += barrel(-0.8, 0.95, 7, 6.5, 12) + barrel(-0.5, 1.15, 7, 6.5, 12, C.woodD!);
  return o;
}

/** 军械所门口铁砧的脚（屏幕坐标）：画图和基地里的火星共用 */
const ANVIL: Pt = P(0.6, 1.4, 4);
/** 军械所的屋身高和烟囱 [gx, gy, 柱顶 z]（第一根是主烟囱，CHIMNEY_AT 读它） */
function armGeom(lv: number): { hgt: number; chims: Array<[number, number, number]> } {
  const t = tier4(lv);
  const r = lv % 2 === 0 ? 4 : 0;
  const hgt = [34, 40, 52, 60][t]! + r;
  const main = [70, 82, 96, 106][t]! + r;
  const chims: Array<[number, number, number]> = [[0.6, -0.8, main]];
  if (t >= 1) chims.push([-0.6, -0.8, main - 10]);
  if (t === 3) chims.push([0.0, -0.8, main - 16]);
  return { hgt, chims };
}

/**
 * 军械所（方的锻造房，烟囱是主剪影，越高级越像堡、烟囱越多）：1–2 级木墙草顶的铁匠棚、一根石烟囱；3–4 级切石作坊、赤陶瓦顶、两根烟囱；
 * 5–6 级花岗岩碉堡、宽垛口、两根更高的烟囱；7–8 级玄武岩堡、四角扶壁、三根烟囱、冷钢大门。
 */
function armory(lv: number): string {
  const t = tier4(lv);
  const g = armGeom(lv);
  const sm = lm(lv);
  let o = '';
  o += box(-1.4, -1.4, 1.4, 1.4, 0, 4, t === 0 ? mat('#b89258', 'wood') : mat('#9aa1a8', 'stone'), t === 0 ? 'h' : 'brick');
  const chim = (gx: number, gy: number, h: number): string => {
    let s = box(gx - 0.22, gy - 0.22, gx + 0.22, gy + 0.22, 4, h, mat('#a08f80', 'stone'), 'brick');
    s += box(gx - 0.27, gy - 0.27, gx + 0.27, gy + 0.27, h - 4, h + 4, mat('#6e6258', 'stone'), 'brick', 1.8);
    const q = P(gx, gy, h + 4);
    s += path(`M${f(q[0] - 7)},${f(q[1] - 2)} q3,-14 7,-4 q4,-10 8,2 q-8,6 -15,2z`, C.fire!, { sw: 1.4 }) + path(`M${f(q[0] - 3)},${f(q[1] - 3)} q2,-8 4,-2 q2,-5 4,1 q-4,3 -8,1z`, C.fireL!, { sw: 0 });
    return s + ell(q[0] + 6, q[1] - 22, 7, 5, C.smokeL!, { sw: 1.4, op: 0.55 });
  };
  // 烟囱在屋后：从远到近画（gy 相同，gx 小的在左后）
  for (const [gx, gy, h] of [...g.chims].sort((a, b) => a[0] - b[0])) o += chim(gx, gy, h);
  const hgt = g.hgt;
  if (t === 3) for (const [x, y] of [[-1.15, -1.0], [1.1, -1.0], [-1.15, 1.0]] as const) o += box(x - 0.2, y - 0.2, x + 0.2, y + 0.2, 4, hgt - 10, mat(C.wallDarkD!, 'stone'), 'brick', 1.4);
  o += box(-1.15, -1.0, 1.1, 1.0, 4, hgt, t === 0 ? mat(lv === 1 ? C.woodLight! : C.wood!, 'wood') : sm, t === 0 ? 'h' : 'brick');
  if (t <= 1) {
    o += hip(-1.15, -1.0, 1.1, 1.0, hgt, t === 0 ? 20 : 24, mat(t === 0 ? '#c9a24f' : C.roofTile!, t === 0 ? 'wood' : 'stone'), 0.14, t === 1);
  } else {
    o += line(P(-1.15, 1.0, hgt - 8), P(1.1, 1.0, hgt - 8), t === 3 ? trim(lv) : C.ironD!, 2.2) + line(P(1.1, 1.0, hgt - 8), P(1.1, -1.0, hgt - 8), darken(t === 3 ? trim(lv) : C.ironD!, 0.25), 2.2);
    o += merlons(-1.15, -1.0, 1.1, 1.0, hgt, 8, 4, sm, true) + merlons(-1.15, -1.0, 1.1, 1.0, hgt, 8, 4, sm, false);
  }
  if (t === 3) o += box(1.1 - 0.2, 1.0 - 0.2, 1.1 + 0.2, 1.0 + 0.2, 4, hgt - 10, mat(C.wallDarkD!, 'stone'), 'brick', 1.4);
  // 大熔炉拱门：橙色火光（7–8 级包冷钢门框）
  const ah = Math.min(14, hgt - 22);
  if (t === 3) o += poly(archL(-0.35, 0.58, 1.0, 4, 20, 15), STEEL_C, { sw: 2 });
  o += poly(archL(-0.35, 0.5, 1.0, 4, 18, ah), '#3a1d10', { sw: 2 });
  o += poly(archL(-0.35, 0.38, 1.01, 4, 17, ah - 3), '#ff7a1c', { sw: 0 });
  o += poly(archL(-0.35, 0.22, 1.02, 4, 15, ah - 7), C.fireL!, { sw: 0 });
  o += ell(P(-0.35, 1.04, 8)[0], P(-0.35, 1.04, 8)[1], 22, 6, '#ffa94a', { sw: 0, op: 0.28 });
  o += win(Rq(1.1, -0.4, 0.1, 18, Math.min(32, hgt - 4)), '#ff9a3a');
  // 铁砧、武器架、盾牌
  // 铁砧（树墩上，比旁边的武器架高一截，基地里这里间歇溅火星）
  const ap = ANVIL;
  o += rect(ap[0] - 9, ap[1] - 12, 18, 12, C.woodD!, { sw: 1.6 }) + ell(ap[0], ap[1] - 12, 9, 3, C.woodL!, { sw: 1.2 });
  o += rect(ap[0] - 6, ap[1] - 20, 12, 8, t === 3 ? STEEL_C : C.ironD!, { sw: 1.6 });
  o += poly([[ap[0] - 19, ap[1] - 27], [ap[0] + 17, ap[1] - 27], [ap[0] + 11, ap[1] - 20], [ap[0] - 11, ap[1] - 20]], t === 3 ? STEEL_C : C.ironD!, { sw: 1.8 }) + line([ap[0] - 15, ap[1] - 26], [ap[0] + 14, ap[1] - 26], C.ironL!, 1.6);
  o += poly([[ap[0] + 17, ap[1] - 27], [ap[0] + 27, ap[1] - 25], [ap[0] + 17, ap[1] - 23]], t === 3 ? STEEL_C : C.ironD!, { sw: 1.4 });
  o += line([ap[0] - 4, ap[1] - 29], [ap[0] + 10, ap[1] - 40], C.woodD!, 2.6) + rect(ap[0] + 6, ap[1] - 45, 9, 6, C.ironD!, { sw: 1.2 });
  const wr = P(-1.0, 1.35, 4);
  o += rect(wr[0] - 12, wr[1] - 4, 24, 4, C.woodD!, { sw: 1.4 });
  for (const dx of [-8, 0, 8]) o += line([wr[0] + dx, wr[1] - 3], [wr[0] + dx + 2, wr[1] - 26], C.ironL!, 2.4);
  const sp = P(0.45, 1.0, Math.max(26, hgt - 14));
  o += path(`M${f(sp[0] - 8)},${f(sp[1] - 6)} h16 v8 q0,8 -8,12 q-8,-4 -8,-12 Z`, C.red!, { sw: 1.8 }) + line([sp[0] - 10, sp[1] + 8], [sp[0] + 10, sp[1] - 12], t === 3 ? trim(lv) : C.ironL!, 2.4);
  return o;
}

// ================================================================= 第二期：新建筑


/**
 * 焦油池（矮的黑坑，越高级坑沿越高越硬）：1–2 级木板围的土坑、一只漏油木桶；3–4 级切石坑沿、骷髅警示牌；
 * 5–6 级铆铁锅沿（一圈铆钉）、两只桶接铁管往坑里灌、左右两块警示牌；7–8 级玄武岩高坑沿镶铜箍、坑上冒紫烟，坑后一根冷钢烟管。
 * 坑里冒泡在基地里由 basebldfx.ts 放（bldFxPoints）。
 */
function tar(lv: number): string {
  const t = tier4(lv);
  const h = [2, 6, 10, 14][t]!;
  let o = '';
  // 坑沿：木板 → 切石 → 铆铁 → 玄武岩
  const rim = [mat(C.woodD!, 'wood'), mat(C.stone!, 'stone'), mat(C.ironD!, 'iron'), mat(C.wallDark!, 'stone')][t]!;
  o += cyl(0, 0, 58, 0, h, rim, t === 3 ? 1 : 0, 2.2);
  const top = P(0, 0, h);
  const cy = top[1] + 3;
  if (t === 0) for (let i = 0; i < 12; i++) {
    const an = (i / 12) * Math.PI * 2;
    o += line([Math.cos(an) * 47, cy + Math.sin(an) * 22], [Math.cos(an) * 57, cy + Math.sin(an) * 27], C.woodDD!, 1.4, 0.8);
  }
  if (t === 1) for (let i = 0; i < 10; i++) {
    const an = (i / 10) * Math.PI * 2 + 0.3;
    o += line([Math.cos(an) * 47, cy + Math.sin(an) * 22], [Math.cos(an) * 57, cy + Math.sin(an) * 27], darken(C.stone!, 0.35), 1.4, 0.8);
  }
  if (t === 2) for (let i = 0; i < 14; i++) {
    const an = (i / 14) * Math.PI * 2;
    o += ell(Math.cos(an) * 52, cy + Math.sin(an) * 24.5, 1.8, 1.4, C.ironL!, { sw: 0 });
  }
  if (t === 3) o += ell(0, cy, 56, 26.5, 'none', { stroke: trim(lv), sw: 2.4 });
  o += ell(0, cy, 47, 22, '#1a1620', { sw: 2 });
  o += ell(-6, cy - 2, 40, 16, '#2c2634', { sw: 0 });
  o += path(`M-30,${f(cy - 7)} Q-10,${f(cy - 17)} 14,${f(cy - 11)}`, 'none', { stroke: '#6a5f80', sw: 3, op: 0.7 });
  const nb = 2 + lv;
  for (let i = 0; i < Math.min(nb, 9); i++) {
    const x = -30 + ((i * 37) % 60);
    const y = cy - 9 + ((i * 23) % 22);
    o += ell(x, y, 4 + (i % 3), 3 + (i % 2), '#3a3344', { sw: 1.4, stroke: C.ink! }) + ell(x - 1, y - 1, 1.2, 0.8, '#bdb4d6', { sw: 0 });
  }
  // 冷钢烟管（7–8 级，坑后）
  if (t === 3) {
    o += cyl(-0.5, -1.0, 6, h, h + 46, mat(STEEL_C, 'iron'), 1, 1.4);
    const q = P(-0.5, -1.0, h + 46);
    o += ell(q[0], q[1], 7, 3.5, '#1a1620', { sw: 1.2 });
    for (const x of [-20, 22]) o += ell(x, cy - 13, 6, 8, '#6a5f80', { sw: 0, op: 0.55 });
  }
  // 漏油的桶：1–4 级一只，5 级起两只接铁管
  o += barrel(1.0, 0.75, 0, 9, 16 + t * 2, t === 3 ? STEEL_C : C.woodD!);
  const bp = P(1.0, 0.75, 16 + t * 2);
  o += ell(bp[0], bp[1], 9, 4, '#1a1620', { sw: 1.4 }) + path(`M${f(bp[0] - 6)},${f(bp[1] + 3)} q-2,14 -8,20`, 'none', { stroke: '#1a1620', sw: 4 });
  if (t >= 2) {
    o += barrel(1.25, 0.25, 0, 9, 20 + t * 2, t === 3 ? STEEL_C : C.woodD!);
    const b2 = P(1.25, 0.25, 20 + t * 2);
    const end = P(0.7, 0.15, h + 2);
    o += line([b2[0], b2[1] - 2], [b2[0], b2[1] - 10], OUT, 6) + line([b2[0], b2[1] - 10], end, OUT, 6);
    o += line([b2[0], b2[1] - 2], [b2[0], b2[1] - 10], C.iron!, 4) + line([b2[0], b2[1] - 10], end, C.iron!, 4);
  }
  // 骷髅警示牌：3 级起左边一块，5 级起右边再一块（7–8 级镶金）
  if (t >= 1) o += line([-46, 14], [-46, -22 - h], C.woodDD!, 3) + rect(-56, -34 - h, 20, 16, '#e8dcc0', { sw: 1.8 }) + skull(-46, -26 - h, 11, false);
  if (t >= 2) o += line([-20, 26], [-20, -12 - h], C.woodDD!, 3) + rect(-29, -24 - h, 18, 14, t === 3 ? C.gold! : '#e8dcc0', { sw: 1.8 }) + skull(-20, -17 - h, 10, false);
  return o;
}

/**
 * 迷雾塔（细的雾灯塔，顶上一盏紫雾灯，越高级越高、冠越重）：1–2 级木桩塔身、木圈灯座；3–4 级切石塔、石圈；
 * 5–6 级四片扶壁的高石塔、垛口灯座；7–8 级玄武岩尖塔、铜冠托着一颗紫水晶、紫旗。雾灯冒的雾在基地里由 basebldfx.ts 放。
 */
function fogTower(lv: number): string {
  const t = tier4(lv);
  let o = '';
  const body = t === 0 ? mat(lv === 1 ? C.woodLight! : C.wood!, 'wood') : mat(mix('#8a82a8', LVC[Math.min(lv, 8)]!, t === 3 ? 0.55 : 0.25), 'stone');
  const th = 52 + lv * 5;
  o += ell(0, 8, 54, 22, '#bfb6d8', { sw: 0, op: 0.35 });
  o += cyl(0, 0, 25, 0, 10, t === 0 ? mat(C.woodD!, 'wood') : mat('#7b7494', 'stone'), 0);
  if (t >= 2) for (const [x, y] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]] as const) {
    if (x + y <= 0) o += box(x - 0.1, y - 0.1, x + 0.1, y + 0.1, 8, th * 0.5, mat(t === 3 ? C.wallDarkD! : C.wallMid!, 'stone'), '', 1.4);
  }
  o += cyl(0, 0, 19 + (t >= 2 ? 2 : 0), 8, th, body, t === 0 ? 0 : 3);
  if (t === 0) for (const z of [20, th - 18]) o += hoopArc(19, z, C.ironD!, 2.4);
  if (t >= 2) for (const [x, y] of [[0.42, 0.42]] as const) o += box(x - 0.1, y - 0.1, x + 0.1, y + 0.1, 8, th * 0.5, mat(t === 3 ? C.wallDarkD! : C.wallMid!, 'stone'), '', 1.4);
  o += cyl(0, 0, 21, th - 10, th - 4, mat(trim(lv)), 0, 1.5);
  o += poly(archL(0, 0.18, 0.55, 8, 20, 8), DARK, { sw: 1.8 }) + win(Lq(-0.12, 0.12, 0.62, 34, 46), '#c9a8ff');
  // 灯座：木圈 → 石圈 → 垛口 → 铜冠
  o += cyl(0, 0, 27, th, th + 10, t === 0 ? mat(C.woodD!, 'wood') : mat('#5e5878', 'stone'), 1);
  const c = P(0, 0, th + 10);
  o += ell(c[0], c[1], 20, 10, '#3a3350', { sw: 1.6 }) + ell(c[0], c[1], 14, 7, '#c9a8ff', { sw: 0, op: 0.85 });
  if (t === 2) o += ringBlocks(0.62, Math.PI * 0.75, Math.PI * 1.75, 4, th + 10, th + 18, mat('#5e5878', 'stone'), 0.2) + ringBlocks(0.62, Math.PI * -0.25, Math.PI * 0.75, 4, th + 10, th + 18, mat('#5e5878', 'stone'), 0.2);
  if (t === 3) {
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * Math.PI * 2 + 0.3;
      const bx = c[0] + Math.cos(an) * 22;
      const by = c[1] + Math.sin(an) * 11;
      o += poly([[bx - 3, by], [bx, by - 14], [bx + 3, by]], trim(lv), { sw: 1.2 });
    }
    o += poly([[c[0], c[1] - 40], [c[0] + 9, c[1] - 24], [c[0], c[1] - 10], [c[0] - 9, c[1] - 24]], '#a77bff', { sw: 1.8 }) + poly([[c[0], c[1] - 38], [c[0] - 7, c[1] - 24], [c[0], c[1] - 14]], '#e2ccff', { sw: 0 });
  }
  // 雾团：数量和大小随级（7–8 级水晶从雾里露出来，雾团压低）
  const puffs = 3 + Math.ceil(lv / 2);
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2;
    const x = c[0] + Math.cos(a) * (12 + (i % 3) * 6);
    const y = c[1] - (t === 3 ? 4 : 14) - (i % 4) * (t === 3 ? 4 : 9) + Math.sin(a) * 5;
    o += ell(x, y, 11 + (i % 3) * 2, 8 + (i % 2) * 2, i % 2 ? '#c6bedc' : '#a79fc4', { sw: 1.6, stroke: '#5e5878', op: t === 3 ? 0.6 : 0.82 });
  }
  o += ell(-30, 22, 18, 7, '#c6bedc', { sw: 0, op: 0.7 }) + ell(30, 26, 20, 8, '#c6bedc', { sw: 0, op: 0.7 }) + ell(2, 34, 24, 8, '#d6d0e8', { sw: 0, op: 0.6 });
  o += towerFlag(-0.3, -0.3, th + 10 + 14, 14 + lv * 3, lv, false, '#6a4bbf');
  return o;
}

/** 海怪：海里冒出的巨型章鱼（3×3）。pose：idle 待机，slam 拍打。level 1–8 越高越凶（颜色、触手数、眼光、冠） */
export function krakenArt(pose: 'idle' | 'slam', level = 1): ArtPiece {
  const lv = Math.max(1, Math.min(8, Math.floor(level)));
  const key = `kraken.${pose}.${lv}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const col = mix('#8a4bbf', '#c0392b', Math.min(1, (lv - 1) / 8));
  const dark = darken(col, 0.3);
  let o = '';
  // 海水
  o += ell(4, 14, 96, 38, '#0b3a55', { sw: 0, op: 0.3 }) + ell(0, 10, 88, 33, '#1b5c88', { sw: 0, op: 0.9 }) + ell(0, 8, 70, 25, '#0f4a73', { sw: 0, op: 0.9 });
  const tent = (x0: number, y0: number, pts: Array<[number, number]>, w: number): string => {
    let d = `M${x0},${y0}`;
    for (const [x, y] of pts) d += ` L${x},${y}`;
    let s = path(d.replace(/L/g, 'L'), 'none', { stroke: C.ink!, sw: w + 5 });
    s += path(d, 'none', { stroke: col, sw: w });
    s += path(d, 'none', { stroke: lighten(col, 0.3), sw: Math.max(1.5, w * 0.25), op: 0.55 });
    for (const [x, y] of pts) s += ell(x, y + w * 0.3, w * 0.18, w * 0.18, '#f3d2e8', { sw: 0 });
    return s;
  };
  const curve = (x0: number, y0: number, x1: number, y1: number, bend: number, w: number): string => {
    const mx = (x0 + x1) / 2 + bend;
    const my = (y0 + y1) / 2 - Math.abs(bend) * 0.4;
    const d = `M${x0},${y0} Q${mx},${my} ${x1},${y1}`;
    let s = path(d, 'none', { stroke: C.ink!, sw: w + 5 }) + path(d, 'none', { stroke: col, sw: w }) + path(d, 'none', { stroke: lighten(col, 0.3), sw: 2, op: 0.55 });
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
      s += ell(x, y + w * 0.25, 2, 2, '#f3d2e8', { sw: 0 });
    }
    return s;
  };
  void tent;
  const extra = Math.floor(lv / 3);
  // 后排触手
  o += curve(-40, 0, -78, -64 - (pose === 'slam' ? 30 : 0), -22, 12) + curve(40, 0, 80, -58 - (pose === 'slam' ? 34 : 0), 24, 12);
  if (extra >= 1) o += curve(-20, 6, -52, -30, -16, 9);
  if (extra >= 2) o += curve(22, 6, 56, -26, 16, 9);
  // 头
  o += ell(0, -34, 40, 40, col, { sw: 2.6 });
  o += path('M12,-70 Q40,-50 36,-18 Q20,0 0,2 Q24,-30 12,-70Z', dark, { sw: 0, op: 0.7 });
  o += path('M-30,-52 Q-22,-66 -8,-68', 'none', { stroke: lighten(col, 0.5), sw: 4, op: 0.7 });
  for (const [x, y] of [[-16, -56], [8, -62], [20, -46], [-6, -44]] as const) o += ell(x, y, 3.4, 2.6, dark, { sw: 0, op: 0.8 });
  if (lv >= 4) for (let i = 0; i < 5; i++) o += poly([[-24 + i * 12, -70 + Math.abs(i - 2) * 3], [-20 + i * 12, -84 + Math.abs(i - 2) * 4], [-16 + i * 12, -70 + Math.abs(i - 2) * 3]], lv >= 7 ? C.gold! : '#4a2d6a', { sw: 1.6 });
  if (lv >= 7) o += path('M-18,-76 L-12,-92 L-4,-80 L0,-96 L4,-80 L12,-92 L18,-76 Z', C.gold!, { sw: 2 });
  // 眼
  const eye = pose === 'slam' ? C.red! : '#ffe14a';
  for (const x of [-15, 15]) {
    o += ell(x, -34, 11, 12, '#fff', { sw: 2.2 }) + ell(x + 1, -33, 5, 9, lv >= 6 ? '#ff3b2a' : eye === C.red ? C.red! : '#222', { sw: 0 }) + ell(x + 3, -36, 1.6, 2, '#fff', { sw: 0 });
    o += line([x - 12, x < 0 ? -52 : -44], [x + 10, x < 0 ? -44 : -52], dark, 4);
  }
  o += path(pose === 'slam' ? 'M-14,-12 q14,10 28,0 q-14,-4 -28,0z' : 'M-12,-12 q12,5 24,0', pose === 'slam' ? '#4a0f1f' : 'none', { stroke: C.ink!, sw: 2 });
  // 前排触手：待机卷曲在水面，拍打时高举/重击
  if (pose === 'idle') {
    o += curve(-48, 8, -92, 6, -10, 14) + curve(46, 10, 94, 4, 12, 14) + curve(-6, 12, -34, 26, -8, 12);
  } else {
    o += curve(-46, 6, -84, -92, -34, 14);
    o += curve(48, 8, 70, 26, 22, 15) + ell(72, 30, 24, 8, '#fff', { sw: 0, op: 0.7 }) + path('M50,30 q10,-14 22,-4 q10,-14 22,0', 'none', { stroke: '#fff', sw: 3, op: 0.85 });
    o += path('M-100,22 q14,-10 28,0 t28,0', 'none', { stroke: '#fff', sw: 3, op: 0.8 });
  }
  o += path('M-90,26 q10,-6 20,0 t20,0 M40,40 q10,-6 20,0 t20,0', 'none', { stroke: C.foam!, sw: 2.6, op: 0.8 });
  const w = 3 * 64 + 60;
  // 裁到 [21,25]-[232,185]
  const a = piece(`b.${key}`, 211, 160, w / 2 - 21, 130 - 25, o);
  cache.set(key, a);
  return a;
}

// ================================================================= 城墙与掉宝装饰

/** 城墙一段：mask 4 位 = 上(gy-1)、右(gx+1)、下(gy+1)、左(gx-1) 是否有墙（bit0 上、bit1 右、bit2 下、bit3 左）。画面按邻接选。
 *  屏幕方向：右(gx+1)朝右下，下(gy+1)朝左下，上朝右上，左朝左上。 */
export function wallArt(level: number, mask = 0): ArtPiece {
  const lv = Math.max(1, Math.min(8, Math.floor(level)));
  const m4 = mask & 15;
  const key = `b.wall.${lv}.${m4}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = 18 + lv * 2;
  const wm = lv <= 2 ? mat(lv === 1 ? '#b57a3f' : '#d19a5c') : lm(lv);
  const tex = lv <= 2 ? 'v' : 'brick';
  const t = 0.1;
  let o = shadow(26, 12, 4, 3, 0.3);
  const seg = (x0: number, y0: number, x1: number, y1: number): string => {
    return box(x0, y0, x1, y1, 0, h - 3, wm, tex, 1.8);
  };
  // 包边压暗一档：满岛的墙沿是长长一圈，用建筑那样的亮铜金会比建筑还抢眼
  const wt = darken(trim(lv), 0.3);
  const trimLine = (x0: number, y0: number, x1: number, y1: number): string => (lv >= 4 ? line(P(x0, y1, h - 5), P(x1, y1, h - 5), wt, 2) + line(P(x1, y1, h - 5), P(x1, y0, h - 5), darken(wt, 0.25), 2) : '');
  // 后两段（上、左）先画
  if (m4 & 1) o += seg(-t, -0.5, t, 0) + trimLine(-t, -0.5, t, 0);
  if (m4 & 8) o += seg(-0.5, -t, 0, t) + trimLine(-0.5, -t, 0, t);
  // 墙墩
  const pw = 0.19;
  const ph = h + 12;
  o += box(-pw, -pw, pw, pw, 0, ph, wm, tex, 2);
  o += box(-pw - 0.04, -pw - 0.04, pw + 0.04, pw + 0.04, ph - 3, ph + 3, mat(wt), '', 1.8);
  if (lv <= 2) {
    // 木尖桩
    o += poly([P(-pw, pw, ph + 3), P(pw, pw, ph + 3), P(pw, -pw, ph + 3), P(0, 0, ph + 16)], wm.l, { sw: 1.8 });
  } else if (lv <= 4) {
    for (const [dx, dy] of [[-0.16, -0.16], [0.16, 0.16]] as const) o += box(dx - 0.07, dy - 0.07, dx + 0.07, dy + 0.07, ph + 3, ph + 9, wm, '', 1.4);
  } else {
    // 墙是背景：墩顶只压一顶矮帽（5–6 铁、7–8 暗铜），不用金尖，满墙一排排才不比建筑抢眼
    o += cone(0, 0, 8, ph + 3, 6, mat(lv >= 7 ? C.copperD! : C.ironL!), 1);
  }
  // 前两段（右、下）
  if (m4 & 2) o += seg(0, -t, 0.5, t) + trimLine(0, -t, 0.5, t);
  if (m4 & 4) o += seg(-t, 0, t, 0.5) + trimLine(-t, 0, t, 0.5);
  // 垛口：3 级起，沿段顶一排
  if (lv >= 3) {
    if (m4 & 2) for (const x of [0.15, 0.37]) o += box(x - 0.05, -t, x + 0.05, t, h, h + 5, wm, '', 1.4);
    if (m4 & 4) for (const y of [0.15, 0.37]) o += box(-t, y - 0.05, t, y + 0.05, h, h + 5, wm, '', 1.4);
  }
  // 画布只裁到内容：宽 60、从尖顶上方到阴影下方
  const a = piece(key, 60, ph + 34, 30, ph + 22, o);
  cache.set(key, a);
  return a;
}

function statue(): string {
  let o = '';
  o += box(-0.4, -0.4, 0.4, 0.4, 0, 14, mat('#b9bfc5'), 'brick');
  o += box(-0.46, -0.46, 0.46, 0.46, 10, 16, mat('#9aa2a9'), '', 1.8);
  const g = mat(C.gold!);
  const c = P(0, 0, 16);
  // 金色船长：腿、大衣、披风、头、三角帽、高举的剑
  o += poly([[c[0] - 9, c[1] - 2], [c[0] + 9, c[1] - 2], [c[0] + 6, c[1] - 26], [c[0] - 6, c[1] - 26]], g.l, { sw: 2 }) + poly([[c[0] + 1, c[1] - 2], [c[0] + 9, c[1] - 2], [c[0] + 6, c[1] - 26], [c[0] + 1, c[1] - 26]], g.r, { sw: 0, op: 0.85 });
  o += path(`M${f(c[0] - 6)},${f(c[1] - 26)} Q${f(c[0] - 18)},${f(c[1] - 16)} ${f(c[0] - 14)},${f(c[1] - 2)} L${f(c[0] - 8)},${f(c[1] - 4)} Z`, darken(C.gold!, 0.25), { sw: 1.8 });
  o += ell(c[0], c[1] - 33, 8, 8.4, g.t, { sw: 2 });
  o += path(`M${f(c[0] - 14)},${f(c[1] - 36)} Q${f(c[0])},${f(c[1] - 42)} ${f(c[0] + 14)},${f(c[1] - 36)} L${f(c[0] + 8)},${f(c[1] - 44)} Q${f(c[0])},${f(c[1] - 52)} ${f(c[0] - 8)},${f(c[1] - 44)} Z`, g.l, { sw: 2 });
  o += line([c[0] + 5, c[1] - 22], [c[0] + 18, c[1] - 46], C.ink!, 5) + line([c[0] + 5, c[1] - 22], [c[0] + 18, c[1] - 46], C.goldL!, 2.6) + line([c[0] + 2, c[1] - 24], [c[0] + 9, c[1] - 22], C.goldD!, 3);
  o += path(`M${f(c[0] - 4)},${f(c[1] - 28)} Q${f(c[0])},${f(c[1] - 24)} ${f(c[0] + 4)},${f(c[1] - 28)}`, 'none', { stroke: C.goldD!, sw: 1.4 });
  o += poly([[c[0] - 5, c[1] - 30], [c[0] - 3, c[1] - 38], [c[0] - 1, c[1] - 30]], '#fff6c8', { sw: 0, op: 0.8 });
  for (const [x, y] of [[-16, -50], [22, -34], [-20, -22]] as const) o += poly([[c[0] + x, c[1] + y - 4], [c[0] + x + 1.2, c[1] + y - 1.2], [c[0] + x + 4, c[1] + y], [c[0] + x + 1.2, c[1] + y + 1.2], [c[0] + x, c[1] + y + 4], [c[0] + x - 1.2, c[1] + y + 1.2], [c[0] + x - 4, c[1] + y], [c[0] + x - 1.2, c[1] + y - 1.2]], '#fff6c8', { sw: 0.8 });
  return o;
}

function flagpole(): string {
  let o = box(-0.28, -0.28, 0.28, 0.28, 0, 10, mat('#8c949c'), 'brick');
  const b = P(0, 0, 10);
  o += line(b, [b[0], b[1] - 130], C.ink!, 6.4) + line(b, [b[0], b[1] - 130], C.woodL!, 3.4) + line([b[0] - 1, b[1]], [b[0] - 1, b[1] - 130], lighten(C.woodL!, 0.4), 1, 0.7);
  for (const y of [30, 60, 90]) o += rect(b[0] - 3.4, b[1] - y, 6.8, 4, C.goldD!, { sw: 1.2 });
  o += flag(0, 0, 10 + 130 - 78, 78, 70, 50, C.black!, true, C.gold!);
  o += ell(b[0], b[1] - 132, 4, 4, C.gold!, { sw: 1.6 });
  return o;
}

/**
 * 海盗王的舵轮（守岛第四章全部过关的纪念）：石墩上竖着一只深色木舵轮，八根辐条、外圈八个握把，
 * 轮毂和外圈包金，顶上一顶小金冠（海盗王的），脚下摆一枚炮弹
 */
function wheel(rot = 0): string {
  let o = box(-0.32, -0.32, 0.32, 0.32, 0, 12, mat('#8c949c'), 'brick');
  const b = P(0, 0, 12);
  const cx = b[0];
  const cy = b[1] - 52;
  // 支架
  o += poly([[cx - 6, b[1]], [cx + 6, b[1]], [cx + 3, cy + 6], [cx - 3, cy + 6]], C.woodD!, { sw: 2 });
  // 握把和辐条（先画在外圈下面）
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + rot;
    const ex = cx + Math.cos(a) * 44;
    const ey = cy + Math.sin(a) * 44;
    o += line([cx, cy], [ex, ey], C.ink!, 6) + line([cx, cy], [ex, ey], '#7a4a26', 3.4);
    o += ell(ex, ey, 4.4, 4.4, '#7a4a26', { sw: 1.8 });
  }
  // 外圈：深色木 + 一圈金边
  o += ell(cx, cy, 34, 34, 'none', { stroke: C.ink!, sw: 10 }) + ell(cx, cy, 34, 34, 'none', { stroke: '#5a2f1c', sw: 7 }) + ell(cx, cy, 34, 34, 'none', { stroke: C.gold!, sw: 2 });
  // 轮毂
  o += ell(cx, cy, 9, 9, C.gold!, { sw: 2 }) + ell(cx - 2, cy - 2, 3, 3, C.goldL!, { sw: 0 });
  // 小金冠
  o += poly([[cx - 12, cy - 40], [cx - 10, cy - 52], [cx - 4, cy - 45], [cx, cy - 56], [cx + 4, cy - 45], [cx + 10, cy - 52], [cx + 12, cy - 40]], C.gold!, { sw: 2 });
  o += ell(cx, cy - 46, 2.2, 2.2, '#c8382e', { sw: 0 });
  // 一枚炮弹
  o += ell(b[0] + 18, b[1] - 4, 6, 6, '#2f3140', { sw: 1.6 }) + ell(b[0] + 16, b[1] - 6, 1.6, 1.2, '#8a8da2', { sw: 0 });
  return o;
}

/**
 * 小风车（守岛第一章全部过关的纪念）：石脚、木身、红瓦尖顶，正面一只轮毂挂四片帆布叶。
 * spin 是叶片转过的角度（弧度）；四片叶 90° 一循环，所以只烘 DECO_FRAMES.windmill 帧就能无缝转。
 */
function windmill(spin = 0): string {
  let o = box(-0.32, -0.32, 0.32, 0.32, 0, 8, mat('#8c949c'), 'brick');
  o += cyl(0, 0, 15, 8, 64, mat(C.woodLight!), 3);
  o += cone(0, 0, 15, 64, 26, mat(C.roofTile!));
  const b = P(0, 0, 0);
  // 门和小窗
  o += path(`M${f(b[0] - 5)},${f(b[1] - 8)} L${f(b[0] - 5)},${f(b[1] - 20)} Q${f(b[0])},${f(b[1] - 26)} ${f(b[0] + 5)},${f(b[1] - 20)} L${f(b[0] + 5)},${f(b[1] - 8)} Z`, C.woodDD!, { sw: 1.4 });
  o += rect(b[0] - 3, b[1] - 46, 6, 7, '#2a2f3a', { sw: 1.2 });
  // 轮毂在塔身前面偏上，叶片绕它转
  const hx = b[0] + 3;
  const hy = b[1] - 62;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // 叶片的法向（帆布挂在桅杆一侧）
    const nx = -uy;
    const ny = ux;
    const q = (t: number, w: number): Pt => [hx + ux * t + nx * w, hy + uy * t + ny * w];
    o += poly([q(8, 1), q(44, 1), q(44, 11), q(10, 8)], C.cream!, { sw: 1.6 });
    o += line(q(20, 1), q(20, 9.6), C.creamD!, 1.2) + line(q(32, 1), q(32, 10.6), C.creamD!, 1.2);
    o += line([hx, hy], q(46, 0), C.ink!, 4.4) + line([hx, hy], q(46, 0), C.woodD!, 2.4);
  }
  o += ell(hx, hy, 5, 5, C.woodDD!, { sw: 1.6 }) + ell(hx - 1, hy - 1, 1.6, 1.6, C.woodL!, { sw: 0 });
  return o;
}

/**
 * 小灯塔（守岛第二章全部过关的纪念）：红白相间的圆塔、深色灯室、红顶，灯室里一盏灯往外打一束光。
 * frame 是光束朝向（共 DECO_FRAMES.lighthouse 个方向）：朝里的半圈光束画在塔后面，朝外的半圈画在前面，朝着人的那几帧灯最亮
 */
function lighthouse(frame = 0): string {
  const a = (frame / DECO_FRAMES.lighthouse) * Math.PI * 2;
  let o = box(-0.34, -0.34, 0.34, 0.34, 0, 8, mat('#8c949c'), 'brick');
  const b = P(0, 0, 0);
  const lamp: Pt = [b[0], b[1] - 87];
  // 光束：从灯往外一条渐淡的楔形，等距里横向长、纵向压一半
  const g = uid('lb');
  const ex = Math.cos(a) * 78;
  const ey = Math.sin(a) * 39;
  const wx = -Math.sin(a) * 20;
  const wy = Math.cos(a) * 10;
  const beam = `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${f(lamp[0])}" y1="${f(lamp[1])}" x2="${f(lamp[0] + ex)}" y2="${f(lamp[1] + ey)}"><stop offset="0" stop-color="#fffbe0" stop-opacity="0.95"/><stop offset="0.6" stop-color="#ffe27a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffe27a" stop-opacity="0"/></linearGradient></defs>`
    + poly([lamp, [lamp[0] + ex + wx, lamp[1] + ey + wy], [lamp[0] + ex - wx, lamp[1] + ey - wy]], `url(#${g})`, { sw: 0 });
  const front = Math.sin(a) >= 0;
  if (!front) o += beam;
  const red = mat(C.red!);
  const white = mat(C.cream!);
  for (let i = 0; i < 4; i++) o += cyl(0, 0, 13 - i, 8 + i * 16, 24 + i * 16, i % 2 ? white : red);
  o += cyl(0, 0, 13, 72, 76, mat('#3a3f4c'));
  // 灯室：深色框、玻璃里一盏灯，朝着人时最亮
  const glow = 0.45 + 0.55 * Math.max(0, Math.sin(a));
  o += rect(lamp[0] - 8, lamp[1] - 11, 16, 22, '#2f3542', { sw: 1.6 });
  o += ell(lamp[0], lamp[1] - 1, 6, 5, '#ffe27a', { sw: 0, op: 0.6 + 0.4 * glow }) + ell(lamp[0], lamp[1] - 1, 11 * glow + 4, 9 * glow + 3, '#fff6c8', { sw: 0, op: 0.35 * glow });
  o += line([lamp[0] - 3, lamp[1] - 10], [lamp[0] - 3, lamp[1] + 10], '#2f3542', 1.4) + line([lamp[0] + 3, lamp[1] - 10], [lamp[0] + 3, lamp[1] + 10], '#2f3542', 1.4);
  o += cone(0, 0, 10, 98, 14, red, 2);
  if (front) o += beam;
  return o;
}

/**
 * 瞭望台（守岛第五章「断崖海岸」全部过关的纪念）：一块和断崖同色的红褐岩墩，上面木三脚架架着一支黄铜望远镜，
 * 旁边插一面小三角旗。frame 是望远镜的朝向（DECO_FRAMES.lookout 档，envfx 来回扫），镜头朝着人的那几帧闪一下光
 */
function lookout(frame = 0): string {
  const a = ((frame - 2) * 16 * Math.PI) / 180;
  let o = box(-0.36, -0.36, 0.36, 0.36, 0, 22, mat('#a86a45', 'stone'), 'brick');
  o += line(P(-0.36, 0.36, 11), P(0.36, 0.36, 11), '#6e3b23', 1.4) + line(P(0.36, 0.36, 9), P(0.36, -0.36, 9), '#542b19', 1.4);
  const top = P(0, 0, 22);
  const piv: Pt = [top[0] - 4, top[1] - 40];
  // 三脚架：两条腿在前、一条在后
  o += line([top[0] - 2, top[1] - 4], piv, C.ink!, 5) + line([top[0] - 2, top[1] - 4], piv, C.woodD!, 3);
  for (const dx of [-14, 14]) o += line([top[0] + dx, top[1] + 4], piv, C.ink!, 5) + line([top[0] + dx, top[1] + 4], piv, C.wood!, 3);
  // 望远镜：朝 a 方向（等距里纵向压一半），目镜一头粗、物镜一头细加金箍
  const ux = Math.cos(a);
  const uy = Math.sin(a) * 0.5 - 0.18;
  const back: Pt = [piv[0] - ux * 20, piv[1] - uy * 20];
  const front: Pt = [piv[0] + ux * 38, piv[1] + uy * 38];
  o += tube(back, front, 8, 12, '#c9963a', '#f1cf7a');
  o += line([piv[0] + ux * 8, piv[1] + uy * 8 - 5], [piv[0] + ux * 8, piv[1] + uy * 8 + 5], C.goldD!, 2.4);
  o += ell(front[0], front[1], 4, 6.4, '#2f3542', { sw: 1.4 });
  o += ell(piv[0], piv[1], 3, 3, C.woodDD!, { sw: 1.2 });
  // 镜头朝着人时一点闪光
  const glint = Math.max(0, Math.cos(a) - 0.9) * 10;
  if (glint > 0) o += ell(front[0] + 1, front[1] - 1, 4 * glint + 1, 4 * glint + 1, '#fffbe0', { sw: 0, op: 0.85 });
  return flag(0.3, -0.3, 22, 30, 14, 9, C.red!) + o;
}

const FIRE_H = [[1, 0.8, 0.9], [0.85, 1, 0.75], [0.95, 0.75, 1], [0.8, 0.95, 0.85]] as const;
const FIRE_SWAY = [0, 2, -1.5, 1] as const;
/**
 * 篝火（守岛第三章全部过关的纪念）：一圈石头围着交叉的木柴，三股火苗；frame 换火苗的高低和摆向，地上一圈暖光跟着明暗。
 * 烟从 CHIMNEY_AT 的火口冒（envfx 的烟囱烟）
 */
function bonfire(frame = 0): string {
  const [h0, h1, h2] = FIRE_H[frame % DECO_FRAMES.bonfire]!;
  const sway = FIRE_SWAY[frame % DECO_FRAMES.bonfire]!;
  const c = P(0, 0, 0);
  const g = uid('bf');
  let o = `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient></defs>`;
  o += ell(c[0], c[1] - 2, 34 + h0 * 4, 17 + h0 * 2, `url(#${g})`, { sw: 0 });
  // 后半圈石头 → 木柴 → 火 → 前半圈石头
  const stone = (k: number): string => {
    const t = (k / 8) * Math.PI * 2;
    return ell(c[0] + Math.cos(t) * 20, c[1] + Math.sin(t) * 10 - 2, 6, 4.4, k % 2 ? C.stone! : C.stoneD!, { sw: 1.4 });
  };
  for (const k of [4, 5, 6, 7, 0]) o += stone(k);
  o += line([c[0] - 14, c[1] + 2], [c[0] + 12, c[1] - 10], C.ink!, 7) + line([c[0] - 14, c[1] + 2], [c[0] + 12, c[1] - 10], C.woodD!, 4.6);
  o += line([c[0] + 14, c[1] + 2], [c[0] - 12, c[1] - 10], C.ink!, 7) + line([c[0] + 14, c[1] + 2], [c[0] - 12, c[1] - 10], C.wood!, 4.6);
  const tongue = (dx: number, h: number, w: number, fill: string): string =>
    path(`M${f(c[0] + dx - w)},${f(c[1] - 4)} Q${f(c[0] + dx - w * 0.9)},${f(c[1] - 4 - h * 0.55)} ${f(c[0] + dx + sway)},${f(c[1] - 4 - h)} Q${f(c[0] + dx + w * 0.9)},${f(c[1] - 4 - h * 0.55)} ${f(c[0] + dx + w)},${f(c[1] - 4)} Z`, fill, { sw: 0 });
  o += tongue(-6, 24 * h0, 7, C.fire!) + tongue(6, 22 * h2, 7, C.fire!) + tongue(0, 34 * h1, 9, C.orange!);
  o += tongue(-1, 20 * h1, 5, C.fireL!) + tongue(0, 10 * h0, 3, '#fff6c8');
  for (const k of [1, 2, 3]) o += stone(k);
  return o;
}

function chest(): string {
  let o = '';
  const g = uid('cg');
  o += `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#fff6a0" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient></defs>`;
  o += ell(0, -14, 40, 34, `url(#${g})`, { sw: 0 });
  o += poly([[-12, -42], [-6, -64], [-2, -42]], '#fff6a0', { sw: 0, op: 0.55 }) + poly([[2, -42], [8, -70], [12, -42]], '#fff6a0', { sw: 0, op: 0.55 }) + poly([[14, -40], [22, -58], [22, -38]], '#fff6a0', { sw: 0, op: 0.45 });
  // 箱体（等距方盒）
  o += box(-0.34, -0.26, 0.34, 0.26, 0, 14, M.woodD, 'h', 2);
  o += line(P(-0.34, 0.26, 4), P(0.34, 0.26, 4), C.gold!, 2) + line(P(0.34, 0.26, 4), P(0.34, -0.26, 4), C.goldD!, 2);
  // 金币堆在敞开的箱口
  const top = P(0, 0, 14);
  o += ell(top[0], top[1], 17, 8, '#3a2012', { sw: 1.6 });
  for (let i = 0; i < 9; i++) o += ell(top[0] - 12 + (i % 5) * 6, top[1] - 4 - Math.floor(i / 5) * 4 + (i % 2), 4, 2.6, i % 2 ? C.gold! : C.goldL!, { sw: 1 });
  o += nugget(top[0], top[1] - 12, 5) + nugget(top[0] + 10, top[1] - 7, 4);
  // 掀开的盖子（靠后）
  o += poly([P(-0.34, -0.26, 14), P(0.34, -0.26, 14), P(0.34, -0.26, 40), P(-0.34, -0.26, 40)], C.wood!, { sw: 2 }) + line(P(-0.34, -0.26, 36), P(0.34, -0.26, 36), C.goldD!, 2);
  // 散落的金币
  o += coin(-26, 6, 5) + coin(24, 10, 5) + coin(-14, 14, 4);
  return o;
}

// ================================================================= 宝藏箱（守岛里敌人来抢的目标）

/** 敞开的铁箍宝箱，坐在小石台上，金币堆得冒尖，角上一点闪光；和装饰宝宝箱（木箱、光芒）区分开 */
function treasure(): string {
  let o = '';
  // 石台（略大于箱子的矮方盒）
  o += ell(3, 4, 34, 15, '#000', { sw: 0, op: 0.2 });
  o += box(-0.46, -0.46, 0.46, 0.46, 0, 6, M.stone, 'brick', 2);
  // 铁箍箱体
  o += box(-0.32, -0.24, 0.32, 0.24, 6, 22, M.iron, '', 2);
  for (const x of [-0.2, 0.2]) {
    o += poly([P(x - 0.05, 0.24, 6), P(x + 0.05, 0.24, 6), P(x + 0.05, 0.24, 22), P(x - 0.05, 0.24, 22)], M.ironD.l, { sw: 1.2 });
  }
  o += poly([P(0.32, 0.12, 6), P(0.32, 0.0, 6), P(0.32, 0.0, 22), P(0.32, 0.12, 22)], M.ironD.r, { sw: 1.2 });
  for (const [gx, z] of [[-0.26, 9], [-0.26, 19], [0.26, 9], [0.26, 19], [0, 14]] as Array<[number, number]>) {
    const q = P(gx, 0.24, z);
    o += ell(q[0], q[1], 1.5, 1.5, C.ironL!, { sw: 0.8 });
  }
  // 锁扣
  const lk = P(0, 0.24, 15);
  o += rect(lk[0] - 3.5, lk[1] - 4, 7, 8, C.gold!, { sw: 1.4 }) + ell(lk[0], lk[1] - 0.5, 1.1, 1.1, DARK, { sw: 0 });
  // 掀开的盖子（靠后，铁箍加木板）
  o += poly([P(-0.32, -0.24, 22), P(0.32, -0.24, 22), P(0.32, -0.34, 44), P(-0.32, -0.34, 44)], C.woodD!, { sw: 2 });
  for (const x of [-0.2, 0.2]) o += poly([P(x - 0.05, -0.24, 22), P(x + 0.05, -0.24, 22), P(x + 0.05, -0.34, 44), P(x - 0.05, -0.34, 44)], C.ironD!, { sw: 1.2 });
  // 箱口深色 + 金币堆成小山
  const top = P(0, 0, 22);
  o += ell(top[0], top[1], 20, 10, '#3a2012', { sw: 1.8 });
  o += ell(top[0], top[1] - 5, 18, 8, C.goldD!, { sw: 1.4 });
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 4);
    o += coin(top[0] - 12 + (i % 4) * 8 + (row % 2) * 4, top[1] - 5 - row * 5, 4.6);
  }
  o += nugget(top[0] - 2, top[1] - 24, 6) + nugget(top[0] + 9, top[1] - 17, 4.4);
  // 宝石
  o += poly([[top[0] - 12, top[1] - 14], [top[0] - 8, top[1] - 14], [top[0] - 6, top[1] - 18], [top[0] - 10, top[1] - 22], [top[0] - 14, top[1] - 18]], '#e0405a', { sw: 1.2 });
  o += poly([[top[0] + 13, top[1] - 8], [top[0] + 17, top[1] - 8], [top[0] + 19, top[1] - 12], [top[0] + 15, top[1] - 15], [top[0] + 11, top[1] - 12]], '#46b8f0', { sw: 1.2 });
  // 散落的金币
  o += coin(-30, 8, 4.4) + coin(28, 12, 4.4) + coin(-18, 17, 3.8);
  // 闪光（四角星）
  const star = (x: number, y: number, r: number): string =>
    poly([[x, y - r], [x + r * 0.22, y - r * 0.22], [x + r, y], [x + r * 0.22, y + r * 0.22], [x, y + r], [x - r * 0.22, y + r * 0.22], [x - r, y], [x - r * 0.22, y - r * 0.22]], '#ffffff', { sw: 1, stroke: C.goldL!, op: 0.95 });
  o += star(top[0] + 2, top[1] - 30, 9) + star(top[0] - 22, top[1] - 12, 5) + star(top[0] + 24, top[1] - 20, 5);
  return o;
}

// ================================================================= 装饰

/** tilt：整棵树以树干底部为基点的错切角（度，帧间摆动用）；ph：叶尖摆动的相位。tilt 和 ph 都是 0 时就是静态外观 */
function palm(tilt = 0, ph = 0): string {
  let o = '';
  o += ell(0, 2, 22, 11, C.sandD!, { sw: 0, op: 0.5 });
  const swayOn = tilt !== 0 || ph !== 0;
  if (swayOn) o += `<g transform="translate(2 6) skewX(${f(tilt)}) translate(-2 -6)">`;
  const trunk = 'M2,6 C8,-20 -2,-50 -8,-84';
  o += path(trunk, 'none', { stroke: OUTc, sw: 11 });
  o += path(trunk, 'none', { stroke: '#a8723d', sw: 7.4 });
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const x = 2 - 10 * t - 6 * t * t;
    const y = 6 - 90 * t;
    o += line([x - 4.4, y], [x + 4.4, y - 2], C.woodDD!, 1.4, 0.7);
  }
  o += path(trunk, 'none', { stroke: lighten('#a8723d', 0.35), sw: 1.6, op: 0.6 });
  const top: Pt = [-8, -84];
  const fronds: Array<[number, number, number]> = [[-56, -16, -14], [-46, 14, 4], [-18, -30, -34], [20, -34, -34], [52, -10, -14], [44, 18, 4], [4, 22, 18]];
  fronds.forEach(([dx, cy, ey], k) => {
    const ex = top[0] + dx + (ph ? Math.cos(ph + k * 1.7) * 1.6 : 0);
    const eyy = top[1] + ey + 30 + (ph ? Math.sin(ph + k * 2.3) * 2.2 : 0);
    const mx = top[0] + dx * 0.5;
    const my = top[1] + cy - 18;
    const d = `M${top[0]},${top[1]} Q${f(mx)},${f(my - 10)} ${f(ex)},${f(eyy)} Q${f(mx + 2)},${f(my + 8)} ${top[0]},${top[1] + 2} Z`;
    o += path(d, dx < 0 ? C.grass! : C.grassD!, { sw: 2 });
    o += path(`M${top[0]},${top[1] + 1} Q${f(mx)},${f(my - 2)} ${f(ex)},${f(eyy)}`, 'none', { stroke: lighten(C.grassL!, 0.1), sw: 1.2, op: 0.8 });
  });
  o += ell(top[0] - 3, top[1] + 4, 4.6, 4.6, '#7a4a26', { sw: 1.6 }) + ell(top[0] + 4, top[1] + 5, 4.6, 4.6, '#6a3e20', { sw: 1.6 }) + ell(top[0] + 1, top[1] + 9, 4.4, 4.4, '#7a4a26', { sw: 1.6 });
  if (swayOn) o += '</g>';
  return o;
}
const OUTc = C.ink!;

function rock(): string {
  let o = '';
  o += ell(4, 4, 28, 12, '#000', { sw: 0, op: 0.2 });
  const big: Pt[] = [[-24, 4], [-26, -10], [-14, -26], [4, -32], [20, -22], [26, -6], [22, 6], [0, 10]];
  o += poly(big, '#9aa2a9', { sw: 2.2 });
  o += poly([[4, -32], [20, -22], [26, -6], [22, 6], [8, 8], [10, -10]], darken('#9aa2a9', 0.28), { sw: 0 });
  o += poly([[-26, -10], [-14, -26], [4, -32], [-6, -14], [-16, 0], [-24, 4]], lighten('#9aa2a9', 0.28), { sw: 0 });
  o += poly(big, 'none', { sw: 2.2 });
  o += line([-4, -12], [2, 0], '#6a7279', 1.4, 0.8);
  const sm: Pt[] = [[-40, 12], [-38, 4], [-28, 0], [-20, 6], [-24, 14]];
  o += poly(sm, '#a7afb6', { sw: 2 }) + poly([[-38, 4], [-28, 0], [-34, 8]], lighten('#a7afb6', 0.3), { sw: 0 });
  o += poly([[22, 14], [24, 8], [34, 6], [40, 12], [36, 18]], '#8a929a', { sw: 2 });
  // 青苔
  o += path('M-12,-4 q6,-4 12,0 q-6,3 -12,0z', C.grass!, { sw: 0, op: 0.9 });
  return o;
}

// ================================================================= 对外

const DRAW: Record<BuildingKind, (lv: number) => string> = {
  hq, goldmine, sawmill, vault, woodyard, dock, armory, cannon, gunTower, mortar, shock, sniper, mine, flame: flameTower, harpoon, tar, rocket, fogTower, kraken: () => '', wall: () => '', statue: () => statue(), flagpole: () => flagpole(), chest: () => chest(), wheel: () => wheel(), windmill: () => windmill(), lighthouse: () => lighthouse(), bonfire: () => bonfire(), lookout: () => lookout(2),
  treasure: () => treasure(),
  palm: () => palm(), rock: () => rock(),
};

const cache = new Map<string, ArtPiece>();
export function buildingArt(kind: BuildingKind, level: number): ArtPiece {
  const lv = isDecoKind(kind) || kind === 'treasure' ? 1 : Math.max(1, Math.min(8, Math.floor(level)));
  const key = `${kind}.${lv}`;
  if (kind === 'kraken') return krakenArt('idle', lv);
  if (kind === 'wall') return wallArt(lv, 0);
  let p = cache.get(key);
  if (!p) {
    const base = shell(kind, DRAW[kind](lv), lv, kind === 'hq' ? 1.2 : 1);
    p = { ...base, key: `b.${key}` };
    cache.set(key, p);
  }
  return p;
}

// ================================================================= 给场景动画准备的素材

const clampLv = (level: number): number => Math.max(1, Math.min(8, Math.floor(level)));

/** 会转的塔（加农炮、火枪塔、臼炮、喷火塔、鱼叉炮、火箭塔） */
type TurretB = 'cannon' | 'gunTower' | 'mortar' | 'flame' | 'harpoon' | 'rocket' | 'shock' | 'sniper';
const tbCache = new Map<string, ArtPiece>();
/** 炮台底座：同 buildingArt 的尺寸、锚点，只是不画会转的部分（炮管等在 turrets.ts 按方向另画，场景叠在 TURRET_PIVOT 上） */
export function turretBaseArt(kind: TurretB, level: number): ArtPiece {
  const lv = clampLv(level);
  const key = `${kind}.${lv}`;
  let p = tbCache.get(key);
  if (!p) {
    NOGUN = true;
    try {
      p = { ...shell(kind, DRAW[kind](lv), lv), key: `b.${kind}.${lv}.ng` };
    } finally {
      NOGUN = false;
    }
    tbCache.set(key, p);
  }
  return p;
}

/** 炮台转轴（炮管等的锚点）相对建筑锚点的偏移（已含整体放大倍数）；火枪塔是火枪手的肩膀 */
export function TURRET_PIVOT(kind: TurretB, level: number): { dx: number; dy: number } {
  const lv = clampLv(level);
  const k = SCALE[kind] ?? 1;
  let q: Pt;
  if (kind === 'cannon') q = P(0, 0, cannonDeck(lv));
  else if (kind === 'shock') q = P(0, 0, SHOCK_DECK[tier4(lv)]);
  else if (kind === 'mortar') q = P(0, 0, MORTAR_DECK[tier4(lv)]);
  else if (kind === 'flame') q = P(0, 0, FLAME_DECK[lv - 1] ?? 34);
  else if (kind === 'harpoon') q = P(0, 0, HARPOON_DECK[tier4(lv)]);
  else if (kind === 'rocket') q = P(0, 0, ROCKET_DECK[tier4(lv)] + 4);
  else if (kind === 'sniper') q = P(0, 0, SNIPER_Z(lv));
  else {
    const ring = P(0, 0, gtPlat(lv) + 6);
    q = [ring[0] - 4, ring[1] - 7];
  }
  return { dx: q[0] * k, dy: q[1] * k };
}

/** 炮台的放大倍数和镶边色（turrets.ts 画炮管要和底座一致） */
export const towerScale = (kind: BuildingKind): number => SCALE[kind] ?? 1;
export const towerTrim = (lv: number): string => trim(clampLv(lv));

const roofCache = new Map<number, ArtPiece>();
/** 火枪塔的屋顶（2 级起有）和顶上的旗：单独一张图盖在火枪手上面；锚点 = 建筑锚点，和底座叠在同一个位置 */
export function gunTowerRoof(level: number): ArtPiece | null {
  const lv = clampLv(level);
  if (!gtRoofed(lv)) return null;
  let p = roofCache.get(lv);
  if (!p) {
    const k = SCALE.gunTower ?? 1;
    const { zr, rx, h } = gtRoof(lv);
    const apex = lv === 2 ? zr : zr + h;
    // 包围盒：檐口（半径 rx、半高 rx/2）到旗尖、旗面右沿
    const top = (apex - 2 + 18 + lv * 3 + 6) * k;
    const bot = (zr - 10 - rx / 2 - 6) * k;
    const ax = (rx + 10) * k;
    const w = Math.ceil(ax + (Math.max(rx, TOWER_FLAG_W + 4) + 10) * k);
    p = piece(`b.gunTower.${lv}.roof`, w, Math.ceil(top - bot), ax, top, `<g transform="scale(${k})">${gtRoofBody(lv)}</g>`);
    roofCache.set(lv, p);
  }
  return p;
}

const swayCache: ArtPiece[] = [];
/** 棕榈摇：5 帧（-2..+2 档，每档 1.2°，整棵以树干底部为基点 skewX 错切，叶尖各自轻摆），尺寸、锚点同 buildingArt('palm', 1)。场景按 0,1,2,3,4,3,2,1 循环 */
export function palmSwayFrames(): ArtPiece[] {
  if (swayCache.length) return swayCache;
  for (let i = 0; i < 5; i++) {
    const step = i - 2;
    const base = shell('palm', palm(step * 1.2, step === 0 ? 0.6 : step * 0.9 + 1.3), 1);
    swayCache.push({ ...base, key: `b.palm.sw${i + 1}` });
  }
  return swayCache;
}

/** 会动的章节纪念装饰：每种烘几帧（envfx 按 DECO_LOOP 轮换）。风车四片叶 90° 一循环；舵轮、瞭望台的望远镜来回摆 5 档 */
export const DECO_FRAMES = { windmill: 6, lighthouse: 8, bonfire: 4, wheel: 5, lookout: 5 } as const;
export type DecoAnimKind = keyof typeof DECO_FRAMES;
export const isDecoAnim = (k: BuildingKind): k is DecoAnimKind => k in DECO_FRAMES;
const decoCache = new Map<DecoAnimKind, ArtPiece[]>();
/** 帧和静态图（buildingArt(kind, 1)）同一个画布、同一个锚点，换纹理不跳；舵轮、瞭望台的第 2 帧就是静态图的样子 */
export function decoFrames(kind: DecoAnimKind): ArtPiece[] {
  let r = decoCache.get(kind);
  if (r) return r;
  const draw = (i: number): string =>
    kind === 'windmill' ? windmill((i / DECO_FRAMES.windmill) * (Math.PI / 2))
      : kind === 'lighthouse' ? lighthouse(i)
        : kind === 'bonfire' ? bonfire(i)
          : kind === 'lookout' ? lookout(i)
            : wheel(((i - 2) * 8 * Math.PI) / 180);
  r = Array.from({ length: DECO_FRAMES[kind] }, (_, i) => ({ ...shell(kind, draw(i), 1), key: `b.${kind}.f${i}` }));
  decoCache.set(kind, r);
  return r;
}

const nfCache = new Map<number, ArtPiece>();
/** 主寨不画旗布的版本（旗杆保留），尺寸、锚点同 buildingArt('hq', level)；旗布由 hqFlagFrames 在 HQ_FLAG_AT 处叠上 */
export function hqNoFlagArt(level: number): ArtPiece {
  const lv = clampLv(level);
  let p = nfCache.get(lv);
  if (!p) {
    p = { ...shell('hq', hq(lv, true), lv, 1.2), key: `b.hqnf.${lv}` };
    nfCache.set(lv, p);
  }
  return p;
}

/** 主寨旗布挂点（旗杆顶 flag() 画布的左上角）相对精灵锚点的偏移，已含主寨整体放大倍数 */
export function HQ_FLAG_AT(level: number): { dx: number; dy: number } {
  const [gx, gy, z, h] = hqGeom(clampLv(level)).pole;
  const t = P(gx, gy, z);
  const k = SCALE.hq ?? 1;
  return { dx: (t[0] + 1) * k, dy: (t[1] - h + 1) * k };
}

const flCache = new Map<number, ArtPiece[]>();
/** 主寨旗布 3 帧（只含旗布，波浪相位不同）；锚点是旗杆挂点（旗布左上角），和 HQ_FLAG_AT 对上 */
export function hqFlagFrames(level: number): ArtPiece[] {
  const lv = clampLv(level);
  let r = flCache.get(lv);
  if (r) return r;
  const { fw, fh, color, skull: withSkull, trim: edge } = hqFlagLook(lv);
  const k = SCALE.hq ?? 1;
  const ax = 4;
  const ay = Math.ceil(fh * 0.4 * k) + 4;
  const w = Math.ceil(fw * k) + 12;
  const h = ay + Math.ceil(fh * 1.3 * k) + 4;
  r = [0, 1, 2].map((i) => {
    const ph = i * 2.09;
    const w1 = Math.sin(ph) * fh * 0.1;
    const w2 = Math.sin(ph + 2.1) * fh * 0.08;
    const d = `M0,0 Q${f(fw * 0.3)},${f(-0.2 * fh + w1)} ${f(fw * 0.6)},${f(0.05 * fh)} T${f(fw)},${f(0.1 * fh + w2)} L${f(fw * 0.9)},${f(0.55 * fh + w2 * 0.5)} L${f(fw)},${f(fh + w2)} Q${f(fw * 0.7)},${f(0.8 * fh - w1)} ${f(fw * 0.5)},${f(0.97 * fh)} T0,${f(fh)} Z`;
    let body = path(d, color, { sw: 1.8 });
    if (edge) body += line([1, fh - 1], [fw - 1, fh - 0.5 + w2], edge, 1.6, 0.9);
    if (withSkull) body += skull(fw * 0.45, fh * 0.45 + w1 * 0.5, Math.min(fw, fh) * 0.55, false);
    const p = piece(`b.hqfl.${lv}.${i}`, w, h, ax, ay, `<g transform="scale(${k})">${body}</g>`);
    return p;
  });
  flCache.set(lv, r);
  return r;
}

/** 烟囱口相对精灵锚点的偏移（场景在这里冒烟）；没有烟囱的建筑返回 null */
export function CHIMNEY_AT(kind: BuildingKind, level: number): { dx: number; dy: number } | null {
  const lv = clampLv(level);
  const k = SCALE[kind] ?? 1;
  let q: Pt;
  if (kind === 'hq') {
    const [gx, gy, , z1] = hqGeom(lv).chim;
    q = P(gx, gy, z1 + 2);
  }
  else if (kind === 'sawmill') {
    const [gx, gy, , z1] = sawGeom(lv).chim;
    q = P(gx, gy, z1 + 2);
  }
  else if (kind === 'armory') {
    const [gx, gy, h] = armGeom(lv).chims[0]!;
    q = P(gx, gy, h + 4);
  }
  // 篝火的火尖
  else if (kind === 'bonfire') q = P(0, 0, 34);
  else return null;
  return { dx: q[0] * k, dy: q[1] * k };
}
// ================================================================= 基地里的标志动作（basebldfx.ts 用）

/** 一个点（相对锚点、已乘放大倍数） */
const scaled = (kind: BuildingKind, q: Pt): Pt => [q[0] * (SCALE[kind] ?? 1), q[1] * (SCALE[kind] ?? 1)];

/**
 * 基地里放粒子的点（相对精灵锚点、已乘放大倍数）：金矿 = 山顶金堆（1–2 级是矿车里的金）、金库 = 门锁和门口金堆、军械所 = 铁砧面、
 * 焦油池 = 坑里几处冒泡的点、迷雾塔 = 塔顶的雾灯。没有就是空数组。和画图读同一份几何
 */
export function bldFxPoints(kind: BuildingKind, level: number): Pt[] {
  const lv = clampLv(level);
  const t = tier4(lv);
  if (kind === 'goldmine') return [scaled(kind, t >= 1 ? [MINE_TOP[0], MINE_TOP[1] - 6] : [-40, 18]), scaled(kind, [-52, 22])];
  if (kind === 'vault') {
    const d0 = P(-0.3, 0.84, 6);
    const d1 = P(0.3, 0.84, 6);
    return [scaled(kind, [(d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2 - 6]), scaled(kind, [-62, 44])];
  }
  if (kind === 'armory') return [scaled(kind, [ANVIL[0], ANVIL[1] - 27])];
  if (kind === 'tar') {
    const cy = P(0, 0, [2, 6, 10, 14][t]!)[1] + 3;
    return ([[-22, cy - 3], [10, cy + 3], [20, cy - 7], [-4, cy - 9]] as Pt[]).map((q) => scaled(kind, q));
  }
  if (kind === 'fogTower') return [scaled(kind, P(0, 0, 52 + lv * 5 + 10))];
  return [];
}

/** 伐木场主锯轮转起来的帧：只画里圈（实心盘、辐条、轴心），盖在静态图的里圈上；4 帧转 60°（辐条 6 根，正好一个循环），锚点和建筑图一致 */
export const SAW_FRAMES = 4;
const sawCache = new Map<string, ArtPiece[]>();
export function sawSpinFrames(level: number): ArtPiece[] {
  const lv = clampLv(level);
  const sw = sawMain(lv);
  const key = `${tier4(lv)}.${lv === 1 ? 1 : 2}`;
  let ps = sawCache.get(key);
  if (!ps) {
    const c = P(sw.at[0], sw.at[1], sw.at[2]);
    const hw = Math.ceil(sw.R * 0.8 + 4);
    const hh = Math.ceil(sw.R + 4);
    ps = Array.from({ length: SAW_FRAMES }, (_, i) =>
      piece(`bfx.saw.${key}.${i}`, hw * 2, hh * 2, hw - c[0], hh - c[1], sawHub(sw.at[0], sw.at[1], sw.at[2], sw.R, sw.hub, sw.steel, 0.2 + (i * Math.PI) / 3 / SAW_FRAMES)),
    );
    sawCache.set(key, ps);
  }
  return ps;
}

/** 吊着晃的东西：船坞是一只货箱、木料场是一捆原木。图的锚点就是吊点（绳头），at 是吊点相对建筑锚点的偏移（已乘放大倍数） */
const hangCache = new Map<string, ArtPiece>();
export function hangArt(kind: 'dock' | 'woodyard', level: number): { art: ArtPiece; at: Pt } {
  const lv = clampLv(level);
  const t = tier4(lv);
  let at: Pt;
  if (kind === 'dock') at = dockHook(lv);
  else {
    const c = woodGeom(lv).crane;
    at = P(c[3], c[4], c[5]);
  }
  const key = `${kind}.${t}`;
  let art = hangCache.get(key);
  if (!art) {
    const L = kind === 'dock' ? [16, 18, 30, 34][t]! : [14, 18, 24, 28][t]!;
    let o = line([0, 0], [0, L], C.cream!, 1.6);
    if (kind === 'dock') {
      const s = [11, 12, 13, 14][t]!;
      o += box(-s / 64, -s / 64, s / 64, s / 64, -(L + s), -L, t === 3 ? mat(STEEL_C, 'iron') : M.woodL, t === 3 ? '' : 'h', 1.6);
      if (t >= 2) o += line([-s * 0.5, L + s * 0.3], [s * 0.5, L + s * 0.3], t === 3 ? trim(lv) : C.ironD!, 1.6);
    } else {
      o += line([0, L], [-10, L + 6], C.cream!, 1.4) + line([0, L], [10, L + 9], C.cream!, 1.4);
      o += log(-16, L + 4, 26, 4.5, C.wood!) + log(-12, L + 11, 26, 4.5, C.woodL!);
      if (t >= 2) o += log(-20, L + 10, 26, 4.5, C.wood!);
    }
    const w = 48;
    const h = L + 30;
    art = piece(`bfx.hang.${key}`, w, h, w / 2, 3, o);
    hangCache.set(key, art);
  }
  return { art, at: scaled(kind, at) };
}

void mix;
void M.black;
void M.blue;
void M.cream;
void M.sand;
void M.stoneD;
void M.iron;
void M.ironD;
void M.gold;
void M.woodL;
void M.woodD;
void cone;
void hip;
void rect;
export type { Mat };
