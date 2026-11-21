/**
 * 窑镇的精灵：夜探第六个镇「窑镇」的陶俑和窑（content/explore.ts、enemies.ts；窑口的火区画法在 view/game/fire.ts）。
 * 陶俑是烧过的赭红泥胎，身上有裂纹和烟熏的黑；窑是青砖垒的馒头窑，窑口透出橙红的火光。
 * 陶俑要上选图页的镇子卡头像，跟特色怪进特色怪图集（SPRITES_YAOZHEN_MOB → atlas.ts 的 MOB_TEX）；
 * 窑只有夜探用，进夜探图集（SPRITES_YAOZHEN → RAID_TEX）。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const CLAY = '#b8643a';
const CLAY_SH = '#7e3e22';
const CLAY_L = '#d8895a';
const SOOT = '#3a2a24';

/** 陶俑：直挺挺的泥胎武士俑，双手拄在身前，甲片一排排，头顶发髻；身上几道裂纹、半边烟熏黑 */
function taoyong(c: Ctx): void {
  dab(c, ellipse(30, 74, 20, 3.6), INK, 0.26);
  // 底座：一块方陶板
  blob(c, rrect(12, 66, 36, 8, 2), '#8a5a3a', '#5a3a24', 2.2, 1.2);
  // 腿：粗短的两截
  blob(c, rrect(18, 54, 9, 13, 2), CLAY, CLAY_SH, 2.2, 1.4);
  blob(c, rrect(33, 54, 9, 13, 2), CLAY, CLAY_SH, 2.2, 1.4);
  // 身子：铠甲上衣，下摆外撇
  blob(c, (k) => { k.moveTo(16, 26); k.lineTo(12, 58); k.lineTo(48, 58); k.lineTo(44, 26); k.quadraticCurveTo(30, 21, 16, 26); }, CLAY, CLAY_SH, 2.6, 3);
  // 甲片：三排小方格
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) stroke(c, (k) => k.rect(17 + i * 7 - r * 0.6, 34 + r * 7, 6, 5), 1, CLAY_SH);
  // 烟熏：左半边一片黑
  dab(c, (k) => { k.moveTo(13, 40); k.quadraticCurveTo(20, 44, 18, 58); k.lineTo(12, 58); k.closePath(); }, SOOT, 0.55);
  // 双手拄在身前
  blob(c, ellipse(30, 48, 7, 5), CLAY_L, CLAY_SH, 2, 1.2);
  // 裂纹
  stroke(c, (k) => { k.moveTo(40, 28); k.lineTo(37, 34); k.lineTo(41, 39); k.lineTo(38, 45); }, 1.4);
  stroke(c, (k) => { k.moveTo(22, 54); k.lineTo(24, 60); }, 1.2);
  // 头：方下巴，眼是两道刻痕（不像活人），头顶一个偏髻
  blob(c, rrect(19, 6, 22, 21, 7), CLAY_L, CLAY, 2.4, 2);
  blob(c, ellipse(36, 5, 6, 4.4), CLAY, CLAY_SH, 2, 1);
  stroke(c, (k) => { k.moveTo(23, 15); k.lineTo(28, 15.6); k.moveTo(32, 15.6); k.lineTo(37, 15); }, 2);
  // 眼缝里一点余火（窑里烧出来的）
  dab(c, circle(25.6, 15.4, 1), '#ffb43a');
  dab(c, circle(34.4, 15.4, 1), '#ffb43a');
  stroke(c, (k) => { k.moveTo(27, 21.4); k.lineTo(33, 21.4); }, 1.4);
  stroke(c, (k) => { k.moveTo(21, 9); k.lineTo(24, 13); }, 1.1, SOOT);
}

const BRICK = '#7a7068';
const BRICK_SH = '#544a44';
const BRICK_L = '#958a80';
const SNOW = '#f2f5fa';
const SNOW_SH = '#c6d0de';

/** 窑顶的半球和砖缝（正面、背面共用）；fy 是窑脚的 y */
function dome(c: Ctx, fy: number): void {
  dab(c, ellipse(70, fy, 64, 9), INK, 0.3);
  // 后面的烟囱
  blob(c, rrect(98, 6, 18, 50, 2), BRICK, BRICK_SH, 2.4, 2);
  for (let y = 14; y < 54; y += 8) stroke(c, (k) => { k.moveTo(99, y); k.lineTo(115, y); }, 1, BRICK_SH);
  blob(c, rrect(95, 2, 24, 8, 2), '#5a524c', null, 2.2);
  dab(c, ellipse(107, 3, 10, 2.6), SNOW, 0.95);
  // 半球窑身
  blob(c, (k) => { k.moveTo(8, fy); k.quadraticCurveTo(6, 30, 70, 26); k.quadraticCurveTo(134, 30, 132, fy); k.closePath(); }, BRICK, BRICK_SH, 2.8, 4);
  for (const [y, w] of [[48, 54], [64, 60], [80, 62]] as const) stroke(c, (k) => { k.moveTo(70 - w, y); k.quadraticCurveTo(70, y - 6, 70 + w, y); }, 1.2, BRICK_SH);
  for (const [x, y] of [[30, 56], [96, 58], [46, 74], [108, 76], [24, 86], [118, 90]] as const) dab(c, rrect(x, y, 10, 4, 1), BRICK_L, 0.7);
  // 窑顶一层雪，烤化了一圈
  blob(c, (k) => { k.moveTo(30, 34); k.quadraticCurveTo(70, 20, 110, 34); k.quadraticCurveTo(96, 38, 84, 34); k.quadraticCurveTo(70, 40, 56, 34); k.quadraticCurveTo(42, 39, 30, 34); }, SNOW, SNOW_SH, 2, 1.4);
}

/** 窑口：拱门里透出橙红火光，门前散着几块柴 */
function mouth(c: Ctx, fy: number): void {
  dab(c, ellipse(70, fy - 20, 30, 26), '#ff7a3a', 0.22);
  blob(c, (k) => { k.moveTo(50, fy); k.lineTo(50, fy - 24); k.quadraticCurveTo(70, fy - 46, 90, fy - 24); k.lineTo(90, fy); k.closePath(); }, '#e8502a', '#8a2a14', 2.6, 3);
  dab(c, (k) => { k.moveTo(56, fy); k.lineTo(56, fy - 20); k.quadraticCurveTo(70, fy - 36, 84, fy - 20); k.lineTo(84, fy); k.closePath(); }, '#ffb43a');
  dab(c, ellipse(70, fy - 8, 9, 7), '#fff2b0');
  // 拱券砖
  stroke(c, (k) => { k.moveTo(46, fy); k.lineTo(46, fy - 26); k.quadraticCurveTo(70, fy - 52, 94, fy - 26); k.lineTo(94, fy); }, 3.4, INK);
  // 门前的柴
  for (const [x, y, a] of [[28, fy + 2, -0.2], [40, fy + 4, 0.15], [108, fy + 3, 0.1]] as const) {
    blob(c, (k) => { k.save(); k.translate(x, y); k.rotate(a); k.rect(-10, -3, 20, 6); k.restore(); }, '#8a6a44', '#5e4428', 1.8, 1);
  }
}

/** 窑（正面）：靠北墙、窑口朝南冲着院子 */
function kiln(c: Ctx): void {
  dome(c, 112);
  mouth(c, 112);
}

/** 窑（背面）：靠南墙、窑口朝北（看不见），背后码一垛柴、透出一点火光 */
function kilnBack(c: Ctx): void {
  dome(c, 112);
  dab(c, ellipse(70, 30, 40, 12), '#ff7a3a', 0.25);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) blob(c, circle(46 + i * 14 + r * 7, 104 - r * 9, 5.4), '#a07a4a', '#6a4a2a', 1.8, 1);
}

/** 窑（侧面）：靠东西墙的一座长龙窑，一节节拱顶往北排，窑口在右边（靠西墙的翻过来画） */
function kilnSide(c: Ctx): void {
  dab(c, ellipse(56, 120, 50, 8), INK, 0.3);
  // 长身：从下往上一节节拱
  for (let k = 3; k >= 0; k--) {
    const y = 26 + k * 24;
    blob(c, (p) => { p.moveTo(14, y + 30); p.quadraticCurveTo(12, y, 56, y - 4); p.quadraticCurveTo(100, y, 98, y + 30); p.closePath(); }, BRICK, BRICK_SH, 2.6, 3);
    stroke(c, (p) => { p.moveTo(24, y + 14); p.quadraticCurveTo(56, y + 6, 88, y + 14); }, 1.1, BRICK_SH);
    dab(c, (p) => { p.moveTo(30, y + 4); p.quadraticCurveTo(56, y - 6, 82, y + 4); p.quadraticCurveTo(56, y + 2, 30, y + 4); }, SNOW, 0.9);
  }
  // 右侧的窑口
  blob(c, (p) => { p.moveTo(96, 118); p.lineTo(96, 92); p.quadraticCurveTo(110, 86, 112, 100); p.lineTo(112, 118); p.closePath(); }, '#e8502a', '#8a2a14', 2.4, 2);
  dab(c, ellipse(103, 108, 5, 7), '#ffd070');
  blob(c, poly(14, 118, 98, 118, 98, 124, 14, 124), '#5a524c', null, 2);
}

export const SPRITES_YAOZHEN_MOB: SpriteDef[] = [{ key: 'taoyong', w: 60, h: 78, ox: 0.5, oy: 0.95, draw: taoyong }];

/**
 * 窑按 0.75 倍细度画进夜探图集（夜探图集 res 3 已 1,768，三张窑按原细度要 2,132，超过 2,048）。
 * SpriteDef 的 scale 会同时放大显示尺寸，所以摆窑时要按 1 / KILN_DETAIL 放回原大小（town.ts drawKiln）。
 */
export const KILN_DETAIL = 0.75;

export const SPRITES_YAOZHEN: SpriteDef[] = [
  { key: 'kiln', w: 140, h: 124, ox: 0.5, oy: 0.92, scale: KILN_DETAIL, draw: kiln },
  { key: 'kilnback', w: 140, h: 124, ox: 0.5, oy: 0.92, scale: KILN_DETAIL, draw: kilnBack },
  { key: 'kilnside', w: 116, h: 128, ox: 0.5, oy: 0.95, scale: KILN_DETAIL, draw: kilnSide },
];
