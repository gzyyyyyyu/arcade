/**
 * 乱葬岗的精灵：守夜第八张图「乱葬岗」的坟包、掘墓鬼，和火区的火苗（content/maps.ts、enemies.ts；火区画法在 view/game/fire.ts）。
 * 画法同前：墨色粗描边、平涂 + 右下一层阴影。坟包是灰褐的土堆、顶上压着残雪，在偏灰绿的地面上压得住；
 * 掘墓鬼是一身沾土的寿衣、青灰脸，眼里两点磷火绿。火苗两种色：磷火青绿（乱葬岗）、窑火橙红（窑镇），都带深色边，雪地上也看得见。
 * 和特色怪一起画进特色怪图集（atlas.ts 的 MOB_TEX）：守夜、夜探都要用（窑镇的火苗、选图页的怪头像）。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const EARTH = '#7a6a56';
const EARTH_SH = '#54483a';
const EARTH_L = '#9a8a72';
const SNOW = '#f2f5fa';
const SNOW_SH = '#c6d0de';

/** 坟包的土堆和残雪（两种坟包共用） */
function mound(c: Ctx): void {
  dab(c, ellipse(40, 50, 38, 7), INK, 0.26);
  blob(c, (k) => { k.moveTo(4, 50); k.quadraticCurveTo(8, 22, 40, 20); k.quadraticCurveTo(72, 22, 76, 50); k.quadraticCurveTo(40, 56, 4, 50); }, EARTH, EARTH_SH, 2.4, 3);
  // 土里的碎石和草茬
  for (const [x, y, r] of [[18, 42, 2.2], [56, 44, 2.6], [34, 47, 1.8], [64, 36, 1.6]] as const) dab(c, circle(x, y, r), EARTH_L, 0.9);
  for (const x of [10, 26, 60, 70]) stroke(c, (k) => { k.moveTo(x, 50); k.lineTo(x - 2, 44); k.moveTo(x + 2, 50); k.lineTo(x + 3, 45); }, 1.2, '#5a5236');
  // 顶上一块残雪
  blob(c, (k) => { k.moveTo(20, 27); k.quadraticCurveTo(40, 16, 60, 27); k.quadraticCurveTo(54, 32, 46, 29); k.quadraticCurveTo(38, 34, 30, 29); k.quadraticCurveTo(24, 32, 20, 27); }, SNOW, SNOW_SH, 1.8, 1.4);
}

/** 坟包 A：土堆后面插一块歪斜的木牌，牌上墨字看不清；挂一条褪色的白幡 */
function grave(c: Ctx): void {
  // 木牌（先画，土堆压住下半截）
  blob(c, poly(46, 34, 50, 4, 62, 6, 58, 36), '#8a6a44', '#5e4428', 2.2, 1.6);
  stroke(c, (k) => { k.moveTo(53, 12); k.lineTo(52.4, 18); k.moveTo(52, 21); k.lineTo(51.4, 28); }, 1.6, '#3a2a1a');
  stroke(c, (k) => { k.moveTo(50, 6); k.quadraticCurveTo(40, 10, 36, 24); }, 1.2, '#b8b0a0');
  blob(c, poly(36, 22, 42, 20, 40, 32, 34, 30), '#e8e4da', '#b8b2a4', 1.2, 0.8);
  mound(c);
  // 坟前一撮纸钱
  blob(c, rrect(12, 46, 9, 5, 0.6), '#f0e8d6', '#b8b0a0', 1, 0.6);
  blob(c, rrect(16, 48, 9, 5, 0.6), '#f0e8d6', '#b8b0a0', 1, 0.6);
}

/** 坟包 B：土堆前立一块缺了角的青石碑，碑前倒着一只破陶碗 */
function grave2(c: Ctx): void {
  mound(c);
  blob(c, (k) => { k.moveTo(28, 50); k.lineTo(28, 22); k.quadraticCurveTo(28, 15, 36, 14); k.lineTo(44, 15); k.lineTo(48, 21); k.lineTo(50, 50); }, '#8a92a0', '#5e6674', 2.4, 2);
  stroke(c, (k) => { k.moveTo(39, 22); k.lineTo(39, 44); }, 1.4, '#4a5260');
  stroke(c, (k) => { k.moveTo(44, 16); k.lineTo(41, 24); k.lineTo(46, 28); }, 1, '#4a5260');
  dab(c, ellipse(34, 15.6, 5, 1.6), SNOW, 0.95);
  blob(c, (k) => { k.moveTo(54, 50); k.quadraticCurveTo(56, 44, 64, 45); k.lineTo(66, 50); k.closePath(); }, '#a8603a', '#743e22', 1.6, 1);
}

const SHROUD = '#5e5848';
const SHROUD_SH = '#3e3a2e';
const SKIN = '#a8b8a4';
const SKIN_SH = '#748a74';
const PHOS = '#4ef0a8';

/** 掘墓鬼：佝偻的瘦鬼，一身沾满泥的旧寿衣，青灰脸、深眼窝里两点磷火绿；两只长爪往前探，肩上扛一把豁口的铁锹 */
function juemu(c: Ctx): void {
  dab(c, ellipse(28, 66, 18, 3.4), INK, 0.24);
  // 铁锹（在身后斜扛着）
  stroke(c, (k) => { k.moveTo(44, 8); k.lineTo(14, 52); }, 4.4, INK);
  stroke(c, (k) => { k.moveTo(44, 8); k.lineTo(14, 52); }, 2.4, '#8a6a44');
  blob(c, poly(42, 2, 54, 4, 52, 14, 44, 14), '#8a909a', '#5a606a', 1.8, 1);
  dab(c, poly(48, 4, 50, 8, 52, 4), '#5a606a');
  // 腿：两截细腿，裤脚沾土
  stroke(c, (k) => { k.moveTo(22, 52); k.lineTo(18, 64); k.moveTo(34, 52); k.lineTo(38, 64); }, 5, INK);
  stroke(c, (k) => { k.moveTo(22, 52); k.lineTo(18, 64); k.moveTo(34, 52); k.lineTo(38, 64); }, 2.8, SKIN_SH);
  // 身子：佝偻着往前探，寿衣下摆破成几条
  blob(c, (k) => { k.moveTo(16, 30); k.quadraticCurveTo(10, 44, 14, 56); k.lineTo(19, 52); k.lineTo(23, 58); k.lineTo(28, 52); k.lineTo(33, 58); k.lineTo(38, 52); k.lineTo(42, 55); k.quadraticCurveTo(44, 40, 38, 28); k.quadraticCurveTo(27, 24, 16, 30); }, SHROUD, SHROUD_SH, 2.4, 2.6);
  // 寿衣上的土块和襟线
  for (const [x, y, r] of [[20, 46, 2.6], [34, 42, 2.2], [26, 52, 1.8], [38, 50, 1.6]] as const) dab(c, circle(x, y, r), '#7a6a50', 0.95);
  stroke(c, (k) => { k.moveTo(28, 30); k.quadraticCurveTo(25, 40, 29, 50); }, 1.2, SHROUD_SH);
  // 两只长爪往前探
  stroke(c, (k) => { k.moveTo(36, 34); k.quadraticCurveTo(46, 38, 50, 46); }, 5, INK);
  stroke(c, (k) => { k.moveTo(36, 34); k.quadraticCurveTo(46, 38, 50, 46); }, 3, SKIN);
  stroke(c, (k) => { k.moveTo(18, 34); k.quadraticCurveTo(10, 40, 6, 48); }, 5, INK);
  stroke(c, (k) => { k.moveTo(18, 34); k.quadraticCurveTo(10, 40, 6, 48); }, 3, SKIN);
  for (const [x, y, dx] of [[50, 46, 1], [6, 48, -1]] as const) {
    stroke(c, (k) => { k.moveTo(x, y); k.lineTo(x + dx * 3, y + 5); k.moveTo(x, y); k.lineTo(x, y + 6); k.moveTo(x, y); k.lineTo(x - dx * 3, y + 5); }, 1.4);
  }
  // 头：往前耷拉的青灰脸，稀疏几根乱发
  blob(c, ellipse(30, 20, 12, 12.5), SKIN, SKIN_SH, 2.4, 2.2);
  stroke(c, (k) => { k.moveTo(22, 11); k.lineTo(18, 5); k.moveTo(28, 8); k.lineTo(27, 2); k.moveTo(34, 9); k.lineTo(38, 3); }, 1.4);
  // 深眼窝 + 磷火绿的眼珠（深底衬亮点，亮雪地上也看得见）
  dab(c, ellipse(25, 19, 4, 3.6), '#2a3428');
  dab(c, ellipse(35, 19, 4, 3.6), '#2a3428');
  dab(c, circle(25.6, 19.4, 1.8), PHOS);
  dab(c, circle(35.6, 19.4, 1.8), PHOS);
  // 咧着的嘴，几颗黄牙
  blob(c, (k) => { k.moveTo(24, 26); k.quadraticCurveTo(30, 30, 36, 26); k.quadraticCurveTo(30, 27.6, 24, 26); }, '#2a1a1a', null, 1.2);
  for (const x of [27, 30, 33]) dab(c, rrect(x - 0.8, 26.2, 1.6, 1.8, 0.4), '#e8d8a0');
}

/**
 * 火苗：一簇三条火舌，外焰带深色边（亮雪地上也压得住），芯是亮的。tone 是外焰 / 内焰 / 描边。
 * 画在 40×52 里，锚点在底边中间；火区里一簇簇摆，每帧按拍子缩放、晃一点（view/game/fire.ts）。
 */
function flame(c: Ctx, outer: string, inner: string, core: string, edge: string): void {
  const tongue = (x: number, h: number, w: number, lean: number): ((k: Ctx) => void) => (k) => {
    k.moveTo(x - w, 50);
    k.quadraticCurveTo(x - w * 1.1, 50 - h * 0.5, x + lean, 50 - h);
    k.quadraticCurveTo(x + w * 1.1, 50 - h * 0.45, x + w, 50);
    k.closePath();
  };
  c.save();
  c.lineJoin = 'round';
  for (const [x, h, w, lean] of [[13, 30, 8, -4], [27, 34, 8, 4], [20, 46, 11, 1]] as const) blob(c, tongue(x, h, w, lean), outer, edge, 2.2, 1.6);
  blob(c, tongue(20, 30, 7, 1), inner, null, 0);
  blob(c, tongue(20, 16, 4, 0), core, null, 0);
  c.restore();
}

/** 磷火：青绿外焰、浅绿内焰、白芯，描边是深墨绿 */
function flameGhost(c: Ctx): void {
  flame(c, '#1fc48a', '#7af2c0', '#effff6', '#0e3a2e');
}

/** 窑火：橙红外焰、金黄内焰、浅黄芯，描边是深褐 */
function flameKiln(c: Ctx): void {
  flame(c, '#e8502a', '#ffb43a', '#fff2b0', '#4a1a10');
}

/** 一点飘着的火星（没烧时火区上零星几点）：小圆点带深边，着色由画面层 tint 决定，这里画成白芯 */
function ember(c: Ctx): void {
  blob(c, circle(6, 6, 3.6), '#ffffff', '#c8d4cc', 1.6, 1);
}

export const SPRITES_LUANZANG: SpriteDef[] = [
  { key: 'grave', w: 80, h: 58, ox: 0.5, oy: 0.86, draw: grave },
  { key: 'grave2', w: 80, h: 58, ox: 0.5, oy: 0.86, draw: grave2 },
  { key: 'juemu', w: 58, h: 70, ox: 0.5, oy: 0.95, draw: juemu },
  { key: 'flame_ghost', w: 40, h: 52, ox: 0.5, oy: 0.96, draw: flameGhost },
  { key: 'flame_kiln', w: 40, h: 52, ox: 0.5, oy: 0.96, draw: flameKiln },
  { key: 'ember', w: 12, h: 12, ox: 0.5, oy: 0.5, draw: ember },
];
