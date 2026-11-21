/**
 * 炮台会转的部分：加农炮（炮架 + 轮子 + 炮管）、臼炮（炮筒）、喷火塔（喷嘴）、鱼叉炮（弩，装好 / 射出两种）、
 * 火箭塔（发射架，装好 / 打空两种）、火枪塔的火枪手（身子、端枪的手和枪、通条）。
 *
 * 每种按 DIRS 个地面方向各画一张（真透视：用等距投影算每个点，不是把一张侧视图转着贴），场景再按剩下的小角度转一点补齐，
 * 转起来连续（aim.ts 的 dirResidual）。锚点 = 转轴（建筑上的位置见 buildings.ts 的 TURRET_PIVOT）；已含建筑的整体放大倍数。
 * 同种同档的帧烘进一张图集 `tur.<种类>.<档>`（textures.ts 的 bakeAtlas），按需烘焙；分档见 turretTier。
 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { P, darken, ell, f, lighten, line, mat, path, piece, pieceRaw, poly, tube } from './kit.ts';
import { towerScale, towerTrim } from './buildings.ts';
import { DIRS, dirAngle, isoVec, type TurretKind } from '../aim.ts';

/** 每两级一档轮廓（spec 6.1）：0 = 1–2 级，1 = 3–4 级，2 = 5–6 级，3 = 7–8 级。炮台底座（buildings.ts）和炮头同一套分档 */
export const tier4 = (level: number): 0 | 1 | 2 | 3 => (level <= 2 ? 0 : level <= 4 ? 1 : level <= 6 ? 2 : 3);
/**
 * 等级 → 炮头图集的档：炮台每两级换一次轮廓，四档；火枪塔的火枪手只分三档（5 级起换深蓝制服、黑帽，7–8 级的变化在塔身和屋顶上）。
 * 每档一张图集，按需烘焙。
 */
export const turretTier = (kind: TurretKind, level: number): number => (kind === 'gunTower' ? Math.min(2, tier4(level)) : tier4(level));
/** 每档拿来画炮管的代表等级 */
const TIER_LV = [2, 4, 6, 8] as const;

/** 图集的贴图 key、帧名 */
export const turretTex = (kind: TurretKind, tier: number): string => `tur.${kind}.${tier}`;
export const turretFrame = (kind: TurretKind, tier: number, part: string): string => `tur.${kind}.${tier}.${part}`;

/**
 * 炮口（火光、炮弹出发点）相对转轴：沿炮管 len 格、高出 z 像素（未乘放大倍数 k）。
 * up：后坐沿哪个方向——臼炮的炮筒几乎朝天，后坐是往下沉，其余顺着炮管往后。
 */
export interface TurretGeom {
  len: number;
  z: number;
  k: number;
  up: boolean;
}
export function turretGeom(kind: TurretKind, level: number): TurretGeom {
  const L = TIER_LV[turretTier(kind, level)] ?? 6;
  const k = towerScale(kind);
  switch (kind) {
    case 'cannon':
      return { len: CANNON_LEN[turretTier(kind, level)] ?? 0.62, z: L >= 7 ? 18 : 15, k, up: false };
    case 'shock':
      return { len: 0.52, z: 16, k, up: false };
    case 'sniper':
      return { len: 1.12, z: 4, k, up: false };
    case 'mortar':
      return { len: 0.24, z: 34 + L * 3, k, up: true };
    case 'flame':
      return { len: 0.62, z: 2, k, up: false };
    case 'harpoon':
      return { len: 0.78, z: 8, k, up: false };
    case 'rocket':
      return { len: 0.32, z: 26, k, up: false };
    default:
      return { len: 0.62, z: 1, k, up: false };
  }
}

/** 地面方向 phi 上：沿炮管 along 格、往左右 side 格、高 z 像素的点（相对转轴，未放大） */
function Q(phi: number, along: number, side: number, z: number): Pt {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return P(c * along - s * side, s * along + c * side, z);
}

/** 按若干关键点估一张帧的包围盒，加上留边 m（画出来的粗细、描边） */
function boxOf(ps: Pt[], m: number): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  for (const p of ps) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
}

/** 一张帧：body 以转轴为原点画，按关键点 ps 的包围盒裁画布（乘放大倍数 k） */
function frame(key: string, body: string, ps: Pt[], m: number, k: number): ArtPiece {
  const b = boxOf(ps, m);
  const ax = Math.ceil(-b.x0 * k) + 2;
  const ay = Math.ceil(-b.y0 * k) + 2;
  const w = ax + Math.ceil(b.x1 * k) + 2;
  const h = ay + Math.ceil(b.y1 * k) + 2;
  return piece(key, w, h, ax, ay, k === 1 ? body : `<g transform="scale(${k})">${body}</g>`);
}

/** 炮口的黑洞：炮口朝向镜头（往屏幕下方或侧面）时才看得见 */
function muzzleHole(phi: number, tip: Pt, th: number): string {
  const v = isoVec(phi);
  if (v[1] < -8) return '';
  const open = Math.min(1, (v[1] + 8) / 20);
  return ell(tip[0], tip[1], th * 0.36 * (0.5 + 0.5 * Math.abs(v[0]) / 45), th * 0.5 * open + 0.6, '#14141c', { sw: 1.6 });
}

/** 轮子：轮面平行于炮管，侧着看是窄椭圆，正对着看是圆 */
function wheel(phi: number, at: Pt, R: number, lv: number): string {
  const v = isoVec(phi);
  const rx = R * Math.max(0.28, Math.abs(v[0]) / 45.3);
  const rim = lv >= 5 ? C.goldD! : C.woodDD!;
  return ell(at[0], at[1] - R, rx, R, rim, { sw: 2 }) + ell(at[0], at[1] - R, rx * 0.45, R * 0.45, lv >= 3 ? C.ironL! : C.woodL!, { sw: 1.2 });
}

/** 7–8 级装甲的冷钢色（spec 6.2：炮身主体是深冷钢，铜金只点在箍和边上） */
const STEEL = '#3d4d63';
/** 7 级铜、8 级赤金：只用在细箍、包边上 */
const brightTrim = (lv: number): string => (lv >= 8 ? C.gold! : C.copper!);

/** 前后排序后拼接（屏幕 y 小的先画） */
const sortCat = (parts: Array<[number, string]>): string => parts.sort((a, b) => a[0] - b[0]).map((p) => p[1]).join('');

// ---------------------------------------------------------------- 各种炮管

/** 加农炮每档炮管长（格，从转轴到炮口）：1–2 级短炮、3–4 级加长重炮、5–6 级双联、7–8 级装甲炮塔里伸出的双联重炮 */
const CANNON_LEN = [0.62, 0.86, 0.9, 1.0] as const;

/** 炮管一根：炮尾球、管身、炮口箍；rings 是管身上的箍（沿管的位置） */
function barrel(phi: number, off: number, z: number, len: number, th: number, iron: string, mouth: string, rings: Array<[number, string]>): { s: string; a: Pt; b: Pt } {
  const a = Q(phi, -0.32, off, z);
  const b = Q(phi, len, off, z + 2);
  let s = tube(Q(phi, -0.42, off, z), Q(phi, -0.3, off, z), th + 4, th + 4, C.ironD!);
  s += tube(a, b, th + 2, th, iron, C.ironL!);
  for (const [at, col] of rings) s += tube(Q(phi, at, off, z + 1), Q(phi, at + 0.06, off, z + 1), th + 3, th + 3, col);
  s += tube(Q(phi, len - 0.12, off, z + 2), Q(phi, len - 0.03, off, z + 2), th + 5, th + 5, mouth);
  s += muzzleHole(phi, b, th);
  return { s, a, b };
}

/** 7–8 级的楔形装甲炮塔壳：底面矩形，正面上半斜切成楔形；只画朝镜头的面（镜头看向地面 +x +y），顶面最后画 */
function wedgeShell(phi: number, lv: number, ps: Pt[]): string {
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const A0 = -0.42, A1 = 0.26, A2 = 0.08, S = 0.4, Z0 = 4, Z1 = 30, ZF = 12;
  // 顶点：后下、后上、前下、前上（斜面的上沿在 A2、下沿在 A1）
  const v = (al: number, sd: number, z: number): Pt => Q(phi, al, sd, z);
  const faces: Array<{ n: [number, number]; pts: Pt[]; fill: string }> = [];
  const steel = mat(STEEL, 'iron');
  const along: [number, number] = [c, sn];
  const side: [number, number] = [-sn, c];
  faces.push({ n: [-along[0], -along[1]], pts: [v(A0, -S, Z0), v(A0, S, Z0), v(A0, S, Z1), v(A0, -S, Z1)], fill: steel.r });
  faces.push({ n: [side[0], side[1]], pts: [v(A0, S, Z0), v(A1, S, Z0), v(A1, S, ZF), v(A2, S, Z1), v(A0, S, Z1)], fill: steel.l });
  faces.push({ n: [-side[0], -side[1]], pts: [v(A0, -S, Z0), v(A1, -S, Z0), v(A1, -S, ZF), v(A2, -S, Z1), v(A0, -S, Z1)], fill: steel.r });
  faces.push({ n: [along[0], along[1]], pts: [v(A1, -S, Z0), v(A1, S, Z0), v(A1, S, ZF), v(A1, -S, ZF)], fill: steel.l });
  let o = '';
  for (const fc of faces) if (fc.n[0] + fc.n[1] > -0.05) o += poly(fc.pts, fc.fill, { sw: 1.6 });
  // 楔形斜面（朝前上，几乎总看得见）和顶面
  o += poly([v(A1, -S, ZF), v(A1, S, ZF), v(A2, S, Z1), v(A2, -S, Z1)], lighten(steel.l, 0.08), { sw: 1.6 });
  o += poly([v(A0, -S, Z1), v(A2, -S, Z1), v(A2, S, Z1), v(A0, S, Z1)], lighten(steel.l, 0.18), { sw: 1.6 });
  // 顶脊一道铜条（8 级赤金）
  o += line(v(A0 + 0.04, 0, Z1), v(A2 - 0.02, 0, Z1), brightTrim(lv), 2.4);
  ps.push(v(A0, -S, Z0), v(A0, S, Z0), v(A1, -S, Z0), v(A1, S, Z0), v(A0, -S, Z1), v(A0, S, Z1), v(A2, -S, Z1), v(A2, S, Z1));
  return o;
}

/**
 * 加农炮炮头四档（spec 6.2）：1–2 级木轮车上的短灰铁炮；3–4 级锻铁炮车上的加长重炮、炮口粗箍（4 级两侧半高弧形护盾）；
 * 5–6 级宽肩炮架上的双联炮管 + 前斜护盾；7–8 级楔形装甲炮塔壳伸出双联重炮，炮口箍红铜（8 级赤金）。
 */
function cannonDir(phi: number, lv: number): { body: string; ps: Pt[] } {
  const tier = tier4(lv);
  const len = CANNON_LEN[tier];
  const ps: Pt[] = [];
  if (tier === 3) {
    const shell = wedgeShell(phi, lv, ps);
    const bars: Array<[number, string]> = [];
    for (const off of [-0.14, 0.14]) {
      const r = barrel(phi, off, 18, len, 13, STEEL, brightTrim(lv), [[0.62, brightTrim(lv)]]);
      ps.push(r.a, r.b);
      bars.push([r.a[1] + r.b[1], r.s]);
    }
    // 炮管朝镜头（屏幕下方）时盖在壳前面，背着镜头时被壳挡住
    const toward = isoVec(phi)[1] > 0;
    return { body: toward ? shell + sortCat(bars) : sortCat(bars) + shell, ps };
  }
  const th = tier === 0 ? 11 : tier === 1 ? 14 : 12;
  const parts: Array<[number, string]> = [];
  // 炮架：一根粗梁顺着炮管，两边各一个轮子（5 级起肩更宽）
  const wide = tier === 2 ? 0.38 : 0.3;
  const b0 = Q(phi, -0.38, 0, 5);
  const b1 = Q(phi, 0.22, 0, 5);
  const carriage = tube(b0, b1, tier === 2 ? 20 : 15, tier === 2 ? 18 : 13, tier >= 1 ? C.ironD! : C.woodD!) + tube(Q(phi, -0.38, 0, 9), Q(phi, 0.18, 0, 11), tier === 2 ? 15 : 11, tier === 2 ? 13 : 9, tier >= 1 ? C.iron! : C.wood!);
  ps.push(b0, b1);
  for (const sd of [-wide, wide]) {
    const at = Q(phi, 0.02, sd, 0);
    ps.push(at, [at[0], at[1] - 18]);
    parts.push([at[1] + 100, wheel(phi, at, tier === 0 ? 9 : 10, lv)]);
  }
  parts.sort((a, b) => a[0] - b[0]);
  const back = parts[0]![1];
  const front = parts[1]![1];
  // 护盾：4 级炮耳两侧半高弧形铁板，5–6 级正面一块斜装甲板
  let shield = '';
  if (lv === 4) {
    for (const sd of [-0.3, 0.3]) {
      const pts = [Q(phi, -0.12, sd, 6), Q(phi, 0.16, sd, 6), Q(phi, 0.16, sd, 22), Q(phi, -0.04, sd, 26)];
      ps.push(...pts);
      shield += poly(pts, C.iron!, { sw: 1.5 });
    }
  }
  if (tier === 2) {
    const pts = [Q(phi, 0.2, -0.4, 6), Q(phi, 0.2, 0.4, 6), Q(phi, 0.08, 0.4, 26), Q(phi, 0.08, -0.4, 26)];
    ps.push(...pts);
    shield += poly(pts, C.iron!, { sw: 1.6 }) + line(Q(phi, 0.08, -0.4, 26), Q(phi, 0.08, 0.4, 26), C.ironL!, 1.4, 0.8);
  }
  const bars: Array<[number, string]> = [];
  const iron = tier === 0 ? C.iron! : C.ironD!;
  const rings: Array<[number, string]> = tier === 0 ? [] : [[-0.05, towerTrim(lv)], [0.28, towerTrim(lv)]];
  for (const off of tier === 2 ? [-0.12, 0.12] : [0]) {
    const r = barrel(phi, off, 15, len, th, iron, tier === 0 ? C.ironL! : C.ironD!, rings);
    ps.push(r.a, r.b);
    bars.push([r.a[1] + r.b[1], r.s]);
  }
  return { body: back + carriage + shield + sortCat(bars) + front, ps };
}

/**
 * 震荡炮：短粗的炮管，炮口是向外张开的喇叭，按档加铜环（1–2 级光口，3–4 级一道，5 级以上两道加发光的口）；
 * 7–8 级喇叭口再张大一圈、炮身绕三道铜线圈（轮廓变成"大喇叭 + 线圈"）
 */
function shockDir(phi: number, lv: number): { body: string; ps: Pt[] } {
  const ps: Pt[] = [];
  const th = 15 + lv * 1.2;
  const len = 0.5;
  const copper = '#e08a3a';
  const copperL = '#ffd09a';
  const a = Q(phi, -0.3, 0, 15);
  const b = Q(phi, len, 0, 16);
  ps.push(a, b, Q(phi, 0, -0.3, 0), Q(phi, 0, 0.3, 0));
  let s = tube(Q(phi, -0.4, 0, 15), Q(phi, -0.28, 0, 15), th + 4, th + 4, C.ironD!);
  s += tube(a, Q(phi, len - 0.16, 0, 16), th + 2, th + 1, lv >= 5 ? '#2c313c' : C.ironD!, C.ironL!);
  const big = lv >= 7 ? 7 : 0;
  // 喇叭口
  s += tube(Q(phi, len - 0.17, 0, 16), b, th + 2, th + 13 + big, lv >= 7 ? STEEL : C.iron!, C.ironL!);
  if (lv >= 7) for (const at of [-0.24, -0.16, -0.08]) s += tube(Q(phi, at, 0, 15.5), Q(phi, at + 0.035, 0, 15.5), th + 6, th + 6, brightTrim(lv));
  const rings = lv >= 5 ? 2 : lv >= 3 ? 1 : 0;
  for (let i = 0; i < rings; i++) {
    const at = len - 0.04 - i * 0.12;
    s += tube(Q(phi, at - 0.05, 0, 16), Q(phi, at, 0, 16), th + 16 + big - i * 5, th + 16 + big - i * 5, copper, copperL);
  }
  // 炮身中段一道细铁箍（所有档都有，一眼看出是震荡炮）
  s += tube(Q(phi, -0.1, 0, 15.5), Q(phi, -0.06, 0, 15.5), th + 4, th + 4, C.ironL!);
  s += muzzleHole(phi, b, th + 12 + big);
  const hr = (th + 18 + big) / 2;
  ps.push([b[0] - hr, b[1] - hr], [b[0] + hr, b[1] + hr]);
  const v = isoVec(phi);
  if (v[1] >= -8) s += ell(b[0], b[1], (th + 12 + big) * 0.2, (th + 12 + big) * 0.28, lv >= 5 ? '#bff0ff' : '#7fd8ff', { sw: 0, op: 0.85 });
  return { body: s, ps };
}

/**
 * 狙击塔：全岛最长的炮管（1.1 格），细而直，管上架一支瞄准镜，炮口有消焰口；按档：1–2 级铁管 + 木托，
 * 3–4 级加铜箍和黄铜镜筒，5 级以上乌铁加金箍、镜筒带发红的镜片；7–8 级枪身前立一块冷钢护盾（铜边），轮廓多一块方板。
 */
function sniperDir(phi: number, lv: number): { body: string; ps: Pt[] } {
  const ps: Pt[] = [];
  const th = 8 + lv * 0.5;
  const len = 1.12;
  const iron = lv >= 5 ? '#2c313c' : C.ironD!;
  const brass = lv >= 5 ? C.gold! : '#d29a45';
  const a = Q(phi, -0.3, 0, 4);
  const b = Q(phi, len, 0, 5);
  ps.push(a, b, Q(phi, -0.62, 0, 2));
  // 木托在后、座箍在中间
  let s = tube(Q(phi, -0.62, 0, 2), Q(phi, -0.28, 0, 4), th + 6, th + 3, lv >= 5 ? '#4a3524' : C.woodD!, C.woodL!);
  s += tube(Q(phi, -0.3, 0, 4), Q(phi, -0.1, 0, 4), th + 6, th + 5, C.ironD!, C.ironL!);
  // 长管
  s += tube(a, b, th + 1, th - 1, iron, C.ironL!);
  if (lv >= 3) for (const at of [0.2, 0.55, 0.9]) s += tube(Q(phi, at, 0, 4.6), Q(phi, at + 0.04, 0, 4.6), th + 3, th + 3, brass);
  // 瞄准镜：架在管上方，前后两个支脚
  const s0 = Q(phi, 0.08, 0, 4 + th * 0.6 + 7);
  const s1 = Q(phi, 0.56, 0, 4 + th * 0.6 + 7);
  ps.push(s0, s1);
  s += tube(Q(phi, 0.14, 0, 5), Q(phi, 0.14, 0, 4 + th * 0.6 + 6), 3, 3, C.ironL!);
  s += tube(Q(phi, 0.5, 0, 5), Q(phi, 0.5, 0, 4 + th * 0.6 + 6), 3, 3, C.ironL!);
  s += tube(s0, s1, 7.4, 6.4, lv >= 3 ? brass : C.ironD!, C.ironL!);
  s += tube(Q(phi, 0.54, 0, 4 + th * 0.6 + 7), Q(phi, 0.62, 0, 4 + th * 0.6 + 7), 9, 9, '#1c1c24');
  if (lv >= 5) {
    const v0 = isoVec(phi);
    if (v0[1] >= -8) s += ell(s1[0] + v0[0] * 0.14, s1[1] + v0[1] * 0.14, 2.3, 3, '#ff6a5a', { sw: 0, op: 0.9 });
  }
  // 消焰口：炮口前一小段加粗带两道缝
  const m0 = Q(phi, len - 0.14, 0, 5);
  s += tube(m0, b, th + 5, th + 5, lv >= 5 ? '#3a4050' : C.iron!, C.ironL!);
  s += tube(Q(phi, len - 0.09, 0, 5), Q(phi, len - 0.075, 0, 5), th + 6, th + 6, '#14141c');
  s += tube(Q(phi, len - 0.04, 0, 5), Q(phi, len - 0.025, 0, 5), th + 6, th + 6, '#14141c');
  s += muzzleHole(phi, b, th + 5);
  if (lv >= 7) {
    // 护盾垂直于枪管、套在座箍前面；枪口朝镜头时盾在枪后（先画），背着镜头时盾挡在枪前
    const pts = [Q(phi, -0.02, -0.24, 0), Q(phi, -0.02, 0.24, 0), Q(phi, -0.02, 0.22, 20), Q(phi, -0.02, -0.22, 20)];
    ps.push(...pts);
    const shield = poly(pts, STEEL, { sw: 1.6 }) + line(pts[3]!, pts[2]!, brightTrim(lv), 2.2);
    s = isoVec(phi)[1] > 0 ? shield + s : s + shield;
  }
  return { body: s, ps };
}

/** 臼炮：粗短朝天的炮筒；5 级起三联；7–8 级三联筒脚下套一圈冷钢装甲护环（铜边），轮廓从"三根管"变成"一圈盔甲里伸出三根管" */
function mortarDir(phi: number, lv: number): { body: string; ps: Pt[] } {
  const ps: Pt[] = [];
  const tubes: Array<[number, string]> = [];
  const mk = (side: number, k: number): void => {
    const a = Q(phi, -0.02, side, 2);
    const b = Q(phi, 0.24 * k, side, (34 + lv * 3) * k);
    ps.push(Q(phi, -0.3, side, 0), Q(phi, 0.3, side, 0), b);
    const w0 = (24 + lv * 2) * k;
    const w1 = (20 + lv * 2) * k;
    let s = ell(a[0], a[1], w0 * 0.55, w0 * 0.3, C.ironD!, { sw: 1.6 });
    // 三阶三根炮管挤在一起：主炮管提亮一档、两侧保持深铁色，不然缩小后连成一团黑（试玩反馈）
    s += tube(a, b, w0, w1, lv >= 5 && k === 1 ? C.iron! : C.ironD!, C.ironL!);
    const m1: Pt = [a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3];
    const m2: Pt = [a[0] + (b[0] - a[0]) * 0.36, a[1] + (b[1] - a[1]) * 0.36];
    s += tube(m1, m2, w0 + 1, w0 + 1, towerTrim(lv));
    if (lv >= 3) {
      const n1: Pt = [a[0] + (b[0] - a[0]) * 0.72, a[1] + (b[1] - a[1]) * 0.72];
      const n2: Pt = [a[0] + (b[0] - a[0]) * 0.78, a[1] + (b[1] - a[1]) * 0.78];
      s += tube(n1, n2, w1 + 2, w1 + 2, towerTrim(lv));
    }
    const rx = (10 + lv * 1.3) * k;
    const ry = (5 + lv * 0.7) * k;
    s += ell(b[0], b[1], rx, ry, '#101018', { sw: 2 });
    // 炮口、炮脚的椭圆比炮管中线宽，外沿也算进帧的包围盒
    ps.push([b[0] - w1 / 2, b[1] - ry], [b[0] + w1 / 2, b[1] + ry], [a[0] - w0 * 0.55, a[1] - w0 * 0.3], [a[0] + w0 * 0.55, a[1] + w0 * 0.3]);
    tubes.push([a[1], s]);
  };
  mk(0, 1);
  if (lv >= 5) mk(-0.42, 0.7);
  if (lv >= 6) mk(0.42, 0.7);
  let collar = '';
  if (lv >= 7) {
    const c0 = Q(phi, 0, 0, 2);
    ps.push([c0[0] - 40, c0[1]], [c0[0] + 40, c0[1]], [c0[0], c0[1] - 26], [c0[0], c0[1] + 24]);
    collar = ell(c0[0], c0[1] + 5, 38, 19, darken(STEEL, 0.15), { sw: 1.8 }) + ell(c0[0], c0[1], 38, 19, STEEL, { sw: 1.8 }) + ell(c0[0], c0[1], 38, 19, 'none', { stroke: brightTrim(lv), sw: 2.4 });
  }
  return { body: collar + sortCat(tubes), ps };
}

/** 喷火塔的喷嘴：1 / 2 / 3 根（3–4 级两根、5 级起三根）；7–8 级三根喷嘴后面包一个冷钢护罩（铜边），轮廓变成一个厚实的炮头 */
function flameDir(phi: number, lv: number): { body: string; ps: Pt[] } {
  const ps: Pt[] = [];
  const nz: Array<[number, string]> = [];
  const n = lv >= 6 ? 3 : lv >= 4 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const side = (i - (n - 1) / 2) * 0.2;
    const a = Q(phi, -0.12, side, 0);
    const b = Q(phi, 0.62, side, 2);
    ps.push(a, b);
    let s = tube(a, b, 9 + lv, 12 + lv, darken(C.ironD!, 0.1), C.ironL!);
    s += tube(Q(phi, 0.54, side, 2), Q(phi, 0.62, side, 2), 14 + lv, 14 + lv, lv >= 5 ? C.gold! : C.ironL!);
    s += muzzleHole(phi, b, 12 + lv);
    nz.push([a[1] + b[1], s]);
  }
  // 喷嘴后面接的油管
  const h0 = Q(phi, -0.3, 0, -2);
  ps.push(h0);
  const hose = path(`M${f(h0[0])},${f(h0[1])} Q${f(h0[0])},${f(h0[1] + 8)} ${f(Q(phi, -0.1, 0, 0)[0])},${f(Q(phi, -0.1, 0, 0)[1])}`, 'none', { stroke: '#3a2a22', sw: 4 });
  let shroud = '';
  if (lv >= 7) {
    const a = Q(phi, -0.28, 0, 3);
    const b = Q(phi, 0.2, 0, 4);
    ps.push([a[0] - 22, a[1] - 22], [a[0] + 22, a[1] + 22], [b[0] - 22, b[1] - 22], [b[0] + 22, b[1] + 22]);
    shroud = tube(a, b, 40, 34, STEEL, C.ironL!) + tube(Q(phi, 0.16, 0, 4), b, 37, 37, brightTrim(lv));
  }
  return { body: hose + shroud + sortCat(nz), ps };
}

/** 鱼叉炮弩臂的半展宽（格）：每两级张开一截，横向张开的弩臂是鱼叉炮的主剪影 */
const BOW_SPAN = [0.46, 0.56, 0.64, 0.74] as const;
/**
 * 鱼叉炮：横着张开的大弩；1–2 级木弩，3–4 级弩臂加宽、木臂包铁，5–6 级两层弩臂（复合弩），
 * 7–8 级冷钢弩臂、两头铜（8 级金）弩尖。鱼叉 1 / 2 / 2 / 3 支
 */
function harpoonDir(phi: number, lv: number, loaded: boolean): { body: string; ps: Pt[] } {
  const ps: Pt[] = [];
  const tier = tier4(lv);
  const span = BOW_SPAN[tier];
  const bowC = tier === 3 ? STEEL : tier >= 1 ? C.ironD! : C.woodD!;
  const z = 6;
  const s0 = Q(phi, -0.3, 0, z);
  const s1 = Q(phi, 0.4, 0, z);
  const e0 = Q(phi, 0.12, -span, z);
  const e1 = Q(phi, 0.12, span, z);
  const mid = Q(phi, 0.42, 0, z);
  const nock = loaded ? Q(phi, -0.2, 0, z) : Q(phi, 0.1, 0, z);
  ps.push(s0, s1, e0, e1, mid);
  let o = tube(s0, s1, 7, 6, tier >= 1 ? C.ironD! : C.woodD!, C.woodL!);
  const arc = (a: Pt, m: Pt, b: Pt): string => `M${f(a[0])},${f(a[1])} Q${f(m[0])},${f(m[1])} ${f(b[0])},${f(b[1])}`;
  const bow = arc(e0, mid, e1);
  // 复合弩：主臂后面再一层短一点的副臂
  if (tier >= 2) {
    const back = arc(Q(phi, 0.02, -span * 0.82, z + 6), Q(phi, 0.3, 0, z + 6), Q(phi, 0.02, span * 0.82, z + 6));
    o += path(back, 'none', { stroke: C.ink!, sw: 7 }) + path(back, 'none', { stroke: bowC, sw: 4 });
  }
  // 弦：装好时拉到后面绷紧，射出后弹回去
  o += line(e0, nock, C.cream!, 1.3) + line(e1, nock, C.cream!, 1.3);
  o += path(bow, 'none', { stroke: C.ink!, sw: 8 }) + path(bow, 'none', { stroke: bowC, sw: 5 });
  if (tier === 3) for (const e of [e0, e1]) o += ell(e[0], e[1], 3.6, 3.6, brightTrim(lv), { sw: 1.4 });
  if (loaded) {
    const n = lv >= 7 ? 3 : lv >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const side = (i - (n - 1) / 2) * 0.1;
      const a = Q(phi, -0.22, side, z + 2);
      const b = Q(phi, 0.78, side, z + 2);
      ps.push(b);
      o += tube(a, b, 4, 3.4, C.woodL!, '#fff');
      o += harpoonHead(b, a, lv);
    }
  }
  o += ell(nock[0], nock[1], 2.6, 2.2, C.ironD!, { sw: 1 });
  return { body: o, ps };
}

/** 鱼叉头：三角形矛尖加一个倒钩，朝 from → tip 的方向 */
function harpoonHead(tip: Pt, from: Pt, lv: number): string {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const p = (a: number, b: number): Pt => [tip[0] + ux * a + nx * b, tip[1] + uy * a + ny * b];
  return poly([p(9, 0), p(-2, -4.5), p(-2, 4.5)], lv >= 5 ? C.gold! : C.ironL!, { sw: 1.5 }) + poly([p(-3, -3), p(-8, -7.5), p(0, -4.5)], C.ironL!, { sw: 1.1 });
}

/** 火箭塔发射架：管数随级别 3 / 4 / 5 / 7（按档的代表等级）；7–8 级两侧各立一块冷钢装甲板（铜边），轮廓从一排管子变成"装甲箱里的一排管子" */
function rocketDir(phi: number, lv: number, loaded: boolean): { body: string; ps: Pt[] } {
  const ps: Pt[] = [];
  const n = Math.min(7, 2 + Math.ceil(lv / 2) + (lv >= 8 ? 1 : 0));
  // 底板：顺着方向的一块铁板
  const p0 = Q(phi, -0.22, 0, 0);
  const p1 = Q(phi, 0.2, 0, 0);
  ps.push(Q(phi, 0, -0.5, 0), Q(phi, 0, 0.5, 0));
  let o = tube(p0, p1, 34, 30, C.ironD!);
  const tubes: Array<[number, string]> = [];
  for (let i = 0; i < n; i++) {
    const side = -0.36 + (0.72 * i) / Math.max(1, n - 1);
    const zz = 4 + (i % 2) * 5;
    const a = Q(phi, -0.14, side, zz);
    const b = Q(phi, 0.3, side, zz + 22 + lv);
    ps.push(a, b);
    let s = tube(a, b, 9, 8, '#4a5362', C.ironL!);
    s += ell(b[0], b[1], 4, 2.6, '#14141c', { sw: 1.4 });
    if (loaded) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const t: Pt = [b[0] + (dx / l) * 9, b[1] + (dy / l) * 9];
      const nx = -dy / l;
      const ny = dx / l;
      s += poly([[b[0] + nx * 3.2, b[1] + ny * 3.2], t, [b[0] - nx * 3.2, b[1] - ny * 3.2]], C.red!, { sw: 1.3 });
      ps.push(t);
    }
    tubes.push([a[1] + b[1], s]);
  }
  if (lv >= 7) {
    // 板子收在管排宽度以内（管排两端在 ±0.36 格），不撑大帧的画布
    for (const sd of [-0.42, 0.42]) {
      const pts = [Q(phi, -0.22, sd, 0), Q(phi, 0.24, sd, 0), Q(phi, 0.24, sd, 22), Q(phi, -0.22, sd, 14)];
      ps.push(...pts);
      const y = pts.reduce((n, q) => n + q[1], 0) / 2;
      tubes.push([y, poly(pts, STEEL, { sw: 1.6 }) + line(pts[3]!, pts[2]!, brightTrim(lv), 2.2)]);
    }
  }
  o += sortCat(tubes);
  return { body: o, ps };
}

// ---------------------------------------------------------------- 火枪手

/** 火枪（连着端枪的两只手）：转轴是肩膀，枪托抵在肩前、枪管顺着方向 */
function musketDir(phi: number, lv: number): { body: string; ps: Pt[] } {
  const a = Q(phi, -0.12, 0, 0);
  const g = Q(phi, 0.08, 0, 0);
  const b = Q(phi, 0.62, 0, 1);
  const ps: Pt[] = [a, b, [0, -4], [0, 6]];
  let o = '';
  const v = isoVec(phi);
  // 后手（托着护木）在枪后面，前手（扣扳机）在枪前面；枪口朝里（屏幕上方）时手挡在枪前
  const hand2 = Q(phi, 0.3, 0, 0);
  const sleeve = line([v[0] >= 0 ? -3 : 3, 2], hand2, C.redD!, 4.4) + ell(hand2[0], hand2[1], 2.6, 2.4, C.skin!, { sw: 1.2 });
  const gun = tube(a, g, 7, 6.5, C.woodD!) + tube(g, b, 4.2, 3.6, lv >= 5 ? C.ironL! : C.ironD!, C.stoneL!) + ell(b[0], b[1], 1.6, 1.6, '#14141c', { sw: 0 });
  const hand1 = line([v[0] >= 0 ? 3 : -3, 1], g, C.red!, 4.6) + ell(g[0], g[1], 2.8, 2.6, C.skin!, { sw: 1.2 });
  o += v[1] < -6 ? gun + sleeve + hand1 : sleeve + gun + hand1;
  return { body: o, ps };
}

/** 火枪手的身子（朝右；朝左时场景按 turnStep 翻）：锚点是肩膀 */
function gunnerBody(lv: number): { body: string; ps: Pt[] } {
  let o = '';
  // 身子、腰带
  o += path('M-7,-1 Q-8,12 -6,17 L6,17 Q8,12 7,-1 Q0,-4 -7,-1 Z', lv >= 5 ? C.blueD! : C.red!, { sw: 1.6 });
  o += line([-7, 10], [7, 10], C.woodDD!, 2.2) + ell(0, 10, 1.6, 1.4, C.gold!, { sw: 0 });
  // 头、帽子
  o += ell(1, -8, 6.5, 6.5, C.skin!, { sw: 1.6 });
  o += ell(4, -8.6, 1.1, 1.3, C.ink!, { sw: 0 });
  o += path('M-7,-10 Q1,-21 9,-11 Q1,-13 -7,-10 Z', lv >= 5 ? C.black! : C.redD!, { sw: 1.5 });
  o += path('M-9,-10.5 Q1,-8 11,-11', 'none', { stroke: lv >= 5 ? C.gold! : C.ink!, sw: 1.6 });
  o += path('M-4,-3 q5,3 9,0', 'none', { stroke: C.woodDD!, sw: 1.4 });
  return { body: o, ps: [[-10, -22], [12, 19]] };
}

/** 通条：一根细铁条，锚点在下端 */
function ramrod(): { body: string; ps: Pt[] } {
  return { body: line([0, 0], [0, -15], C.ironL!, 1.6) + ell(0, -15, 1.4, 1.4, C.ironD!, { sw: 0 }), ps: [[0, 0], [0, -16]] };
}

/**
 * 整张图（图标、没烘好分件时）上的炮头：朝右前（phi = 0），画法和分件图集同一套、同一个代表等级，所以图标和开打后的炮头一致。
 * 画在转轴上（相对转轴、未乘放大倍数），火枪塔不走这里（火枪手和屋顶在 buildings.ts）。
 */
export function turretHeadBody(kind: Exclude<TurretKind, 'gunTower'>, level: number): string {
  const lv = TIER_LV[turretTier(kind, level) as 0 | 1 | 2 | 3];
  switch (kind) {
    case 'cannon':
      return cannonDir(0, lv).body;
    case 'mortar':
      return mortarDir(0, lv).body;
    case 'shock':
      return shockDir(0, lv).body;
    case 'sniper':
      return sniperDir(0, lv).body;
    case 'flame':
      return flameDir(0, lv).body;
    case 'harpoon':
      return harpoonDir(0, lv, true).body;
    case 'rocket':
      return rocketDir(0, lv, true).body;
  }
}

// ---------------------------------------------------------------- 图集

const cache = new Map<string, ArtPiece[]>();
/** 一种炮台一档的全部帧（进图集）：d0..d15 各方向；鱼叉炮、火箭塔另有 e0..e15（射出 / 打空）；火枪塔另有 body、rod */
export function turretPieces(kind: TurretKind, tier: number): ArtPiece[] {
  const key = `${kind}.${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lv = TIER_LV[tier as 0 | 1 | 2 | 3] ?? 2;
  const k = towerScale(kind);
  const out: ArtPiece[] = [];
  const fr = (part: string, d: { body: string; ps: Pt[] }, m: number, kk = k): void => void out.push(frame(turretFrame(kind, tier, part), d.body, d.ps, m, kk));
  for (let i = 0; i < DIRS; i++) {
    const phi = dirAngle(i);
    if (kind === 'cannon') fr(`d${i}`, cannonDir(phi, lv), 14);
    else if (kind === 'mortar') fr(`d${i}`, mortarDir(phi, lv), 16);
    else if (kind === 'shock') fr(`d${i}`, shockDir(phi, lv), 16);
    else if (kind === 'sniper') fr(`d${i}`, sniperDir(phi, lv), 12);
    else if (kind === 'flame') fr(`d${i}`, flameDir(phi, lv), 12);
    else if (kind === 'harpoon') {
      fr(`d${i}`, harpoonDir(phi, lv, true), 12);
      fr(`e${i}`, harpoonDir(phi, lv, false), 12);
    } else if (kind === 'rocket') {
      fr(`d${i}`, rocketDir(phi, lv, true), 12);
      fr(`e${i}`, rocketDir(phi, lv, false), 12);
    } else fr(`d${i}`, musketDir(phi, lv), 6);
  }
  if (kind === 'gunTower') {
    fr('body', gunnerBody(lv), 3);
    fr('rod', ramrod(), 3);
  }
  cache.set(key, out);
  return out;
}

/** 喷火塔的火舌（不分级、不分档）：从左边的喷口往右喷，锚点在喷口；场景按强度拉长、按方向转 */
export function flameJetArt(): ArtPiece {
  const L = 100;
  const body =
    path(`M0,0 C${L * 0.25},-9 ${L * 0.6},-15 ${L},-4 C${L * 0.9},4 ${L * 0.6},14 ${L * 0.25},9 C${L * 0.1},6 0,3 0,0 Z`, C.fire!, { sw: 0, op: 0.85 }) +
    path(`M0,0 C${L * 0.2},-5 ${L * 0.5},-8 ${L * 0.82},-2 C${L * 0.5},5 ${L * 0.2},5 0,0 Z`, C.fireL!, { sw: 0, op: 0.95 }) +
    path(`M0,0 C${L * 0.1},-2 ${L * 0.3},-3 ${L * 0.45},-0.5 C${L * 0.3},2 ${L * 0.1},2 0,0 Z`, lighten(C.fireL!, 0.6), { sw: 0 });
  return pieceRaw('fx.flamejet', L + 4, 34, 2, 17, body);
}

