/**
 * 鬼市的精灵：守夜第七张图「鬼市」的特色怪和摊子（content/regions.ts、maps.ts）。画法同前：大头 Q 版、墨色粗描边、平涂 + 右下一层阴影。
 * 鬼市整体偏夜里的暗紫配灯笼红：皮影鬼是赭红的驴皮影人，鬼贩灰蓝，鬼市主暗金；在偏紫的地面上都跳得出来。
 * 和特色怪一起画进特色怪图集（atlas.ts 的 MOB_TEX）；摊子也放这里，守夜不加载夜探图集。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const HIDE = '#c0563a';
const HIDE_SH = '#8a3424';
const HIDE_L = '#e8a060';
const LANTERN = '#e8443a';
const LANTERN_SH = '#a82a26';

/** 皮影鬼：驴皮刻的侧身影人，镂空的花纹透光，关节是一颗颗铆钉，背后两根细竹签 */
function puppet(c: Ctx): void {
  dab(c, ellipse(23, 61, 13, 3), INK, 0.18);
  // 背后的竹签
  stroke(c, (k) => { k.moveTo(30, 34); k.lineTo(42, 62); k.moveTo(14, 40); k.lineTo(8, 62); }, 1.4, '#6a5a3a');
  // 身子：一片薄薄的侧身袍子，下摆尖
  blob(c, (k) => { k.moveTo(15, 26); k.quadraticCurveTo(8, 42, 10, 56); k.lineTo(18, 52); k.lineTo(24, 58); k.lineTo(30, 52); k.lineTo(36, 56); k.quadraticCurveTo(36, 40, 31, 26); k.closePath(); }, HIDE, HIDE_SH, 2.2, 2.4);
  // 镂空的云纹（透出底下的亮色）
  for (const [x, y, r] of [[19, 36, 2.6], [26, 40, 2.2], [21, 46, 2], [28, 49, 1.8], [16, 50, 1.6]] as const) dab(c, circle(x, y, r), HIDE_L, 0.9);
  stroke(c, (k) => { k.moveTo(14, 31); k.quadraticCurveTo(23, 34, 32, 30); }, 1.2, HIDE_SH);
  // 胳膊：两节，关节一颗铆钉
  stroke(c, (k) => { k.moveTo(30, 30); k.lineTo(38, 36); k.lineTo(44, 30); }, 3.6, INK);
  stroke(c, (k) => { k.moveTo(30, 30); k.lineTo(38, 36); k.lineTo(44, 30); }, 2, HIDE);
  dab(c, circle(38, 36, 1.4), '#f2d46a');
  dab(c, circle(30, 30, 1.4), '#f2d46a');
  // 侧脸：尖鼻子、一只细长的眼，头顶一顶高冠
  blob(c, (k) => { k.moveTo(16, 24); k.quadraticCurveTo(14, 12, 22, 9); k.quadraticCurveTo(30, 8, 31, 15); k.lineTo(35, 19); k.lineTo(31, 21); k.quadraticCurveTo(30, 26, 24, 27); k.closePath(); }, HIDE_L, HIDE, 2, 1.6);
  stroke(c, (k) => { k.moveTo(24, 16); k.quadraticCurveTo(27, 15, 30, 16.4); }, 1.6);
  dab(c, circle(28.6, 16.2, 0.9), '#fff4d0');
  stroke(c, (k) => { k.moveTo(27, 23); k.lineTo(30, 22.4); }, 1.2, LANTERN_SH);
  blob(c, poly(16, 11, 20, 1, 26, 3, 28, 9), '#2a2030', null, 1.6);
  dab(c, circle(22, 5, 1.4), LANTERN);
}

/** 鬼贩：灰蓝短褂的瘦鬼，肩上一根扁担挑着两只竹筐（筐里冒着纸钱），白脸、眯眼笑；腿是一团烟 */
function peddler(c: Ctx): void {
  const COAT = '#5a6a8a';
  const COAT_SH = '#3a4660';
  dab(c, ellipse(32, 58, 18, 3.4), INK, 0.2);
  // 扁担
  stroke(c, (k) => { k.moveTo(4, 24); k.quadraticCurveTo(32, 18, 60, 24); }, 3.6, INK);
  stroke(c, (k) => { k.moveTo(4, 24); k.quadraticCurveTo(32, 18, 60, 24); }, 2, '#c8a060');
  // 两只竹筐和吊绳
  for (const x of [8, 56]) {
    stroke(c, (k) => { k.moveTo(x, 24); k.lineTo(x - 6, 40); k.moveTo(x, 24); k.lineTo(x + 6, 40); }, 1.1, '#3a2a1c');
    blob(c, rrect(x - 8, 40, 16, 13, 3), '#b08a4a', '#7a5a2a', 2, 1.4);
    stroke(c, (k) => { k.moveTo(x - 7, 45); k.lineTo(x + 7, 45); k.moveTo(x - 7, 49); k.lineTo(x + 7, 49); }, 0.9, '#7a5a2a');
    blob(c, rrect(x - 5, 36, 6, 6, 0.6), '#f0e8d6', '#b8b0a0', 1.1, 0.6);
    blob(c, rrect(x, 37, 6, 6, 0.6), '#f0e8d6', '#b8b0a0', 1.1, 0.6);
  }
  // 腿是一团烟
  dab(c, ellipse(32, 54, 9, 4), '#8a90a8', 0.6);
  // 身子：短褂
  blob(c, (k) => { k.moveTo(24, 26); k.quadraticCurveTo(20, 40, 24, 52); k.lineTo(40, 52); k.quadraticCurveTo(44, 40, 40, 26); k.quadraticCurveTo(32, 23, 24, 26); }, COAT, COAT_SH, 2.2, 2.2);
  stroke(c, (k) => { k.moveTo(32, 27); k.lineTo(32, 51); }, 1.2, COAT_SH);
  for (const y of [32, 38, 44]) dab(c, circle(32, y, 1), '#e8d8a0');
  // 头：白脸、眯眼笑，一顶瓜皮帽
  blob(c, circle(32, 16, 9.5), '#ece8f0', '#b8b4c8', 2.2, 1.8);
  stroke(c, (k) => { k.moveTo(26, 16); k.quadraticCurveTo(28, 14, 30, 16); k.moveTo(34, 16); k.quadraticCurveTo(36, 14, 38, 16); }, 1.6);
  stroke(c, (k) => { k.moveTo(28, 20.4); k.quadraticCurveTo(32, 23.6, 36, 20.4); }, 1.4);
  dab(c, circle(26.4, 19.4, 1.6), '#f0a0a0', 0.6);
  dab(c, circle(37.6, 19.4, 1.6), '#f0a0a0', 0.6);
  blob(c, (k) => { k.moveTo(22.6, 12); k.quadraticCurveTo(32, 2, 41.4, 12); k.closePath(); }, '#2a2030', null, 1.6);
  dab(c, circle(32, 5.4, 1.6), LANTERN);
}

/** 鬼市主：胖胖的鬼东家，一身缀满铜钱的暗金褂子，一手托着算盘，一手攥着一串钱；戴一顶高高的掌柜帽，青白脸、八字胡 */
function marketboss(c: Ctx): void {
  const GOLD = '#b8902e';
  const GOLD_SH = '#7a5a1a';
  dab(c, ellipse(43, 92, 30, 5), INK, 0.24);
  // 身子：圆滚滚的长褂，下摆拖地
  blob(c, (k) => { k.moveTo(24, 40); k.quadraticCurveTo(8, 64, 14, 90); k.lineTo(72, 90); k.quadraticCurveTo(78, 64, 62, 40); k.quadraticCurveTo(43, 34, 24, 40); }, GOLD, GOLD_SH, 2.8, 3.6);
  // 褂子上的铜钱
  for (const [x, y] of [[28, 56], [44, 52], [58, 58], [24, 74], [40, 70], [56, 76], [34, 84], [50, 86]] as const) {
    blob(c, circle(x, y, 4), '#e8c050', '#a07a20', 1.2, 0.8);
    dab(c, rrect(x - 1.3, y - 1.3, 2.6, 2.6, 0.3), '#5a3a12');
  }
  // 左手的算盘
  blob(c, rrect(4, 52, 22, 15, 2), '#5a3424', '#3a1e14', 2, 1.2);
  for (let k = 0; k < 4; k++) {
    stroke(c, (p) => { p.moveTo(6 + k * 5.4, 54); p.lineTo(6 + k * 5.4, 65); }, 0.8, '#c8a060');
    for (const y of [56, 60.4, 63.4]) dab(c, ellipse(6 + k * 5.4, y, 2, 1.3), '#e8d8b0');
  }
  // 右手攥着的一串钱
  stroke(c, (p) => { p.moveTo(70, 50); p.lineTo(78, 70); }, 1.2, '#5a3a12');
  for (let k = 0; k < 5; k++) blob(c, circle(70.8 + k * 1.7, 52 + k * 4, 3), '#e8c050', '#a07a20', 1, 0.6);
  // 头：青白大脸
  blob(c, circle(43, 26, 15), '#d8e0e8', '#9aa4b4', 2.6, 2.4);
  // 眯眼、八字胡、一点笑
  stroke(c, (k) => { k.moveTo(34, 25); k.quadraticCurveTo(37, 22.6, 40, 25); k.moveTo(46, 25); k.quadraticCurveTo(49, 22.6, 52, 25); }, 2);
  stroke(c, (k) => { k.moveTo(42, 31); k.quadraticCurveTo(36, 31, 32, 35); k.moveTo(44, 31); k.quadraticCurveTo(50, 31, 54, 35); }, 1.8);
  stroke(c, (k) => { k.moveTo(39, 35); k.quadraticCurveTo(43, 37.4, 47, 35); }, 1.4, '#8a2a2a');
  dab(c, circle(35, 30, 2), '#e07a7a', 0.5);
  dab(c, circle(51, 30, 2), '#e07a7a', 0.5);
  // 掌柜帽：高高的黑帽子，正中一颗红珠
  blob(c, rrect(31, 2, 24, 12, 3), '#2a2030', '#120e18', 2.2, 1.4);
  blob(c, rrect(27, 12, 32, 5, 2), '#2a2030', null, 2);
  dab(c, circle(43, 8, 2.4), LANTERN);
}

/** 鬼摊子：一张矮木案，后面撑着一块暗红的布篷，两头各挂一盏红灯笼；案上摆着纸钱、面具和几只小坛子 */
function gstall(c: Ctx): void {
  dab(c, ellipse(70, 88, 64, 6), INK, 0.28);
  // 两根撑篷的竹竿
  stroke(c, (k) => { k.moveTo(12, 86); k.lineTo(12, 18); k.moveTo(128, 86); k.lineTo(128, 18); }, 3.4, INK);
  stroke(c, (k) => { k.moveTo(12, 86); k.lineTo(12, 18); k.moveTo(128, 86); k.lineTo(128, 18); }, 1.8, '#a0844a');
  // 布篷：一块往下垂的暗红布，下沿剪成波浪
  blob(c, (k) => {
    k.moveTo(6, 16);
    k.quadraticCurveTo(70, 8, 134, 16);
    k.lineTo(134, 34);
    for (let x = 134; x > 6; x -= 16) k.quadraticCurveTo(x - 8, 42, x - 16, 34);
    k.closePath();
  }, '#8a2a34', '#5a1820', 2.4, 2.4);
  stroke(c, (k) => { k.moveTo(8, 22); k.quadraticCurveTo(70, 15, 132, 22); }, 1.2, '#c8a060');
  // 木案
  blob(c, rrect(16, 56, 108, 12, 2), '#7a5434', '#4e3220', 2.2, 1.6);
  blob(c, rrect(20, 68, 100, 18, 2), '#5a3a24', '#3a2416', 2.2, 1.2);
  stroke(c, (k) => { k.moveTo(24, 77); k.lineTo(116, 77); }, 1, '#3a2416');
  // 案上的货：一叠纸钱、一张傩面、两只小坛子
  for (let k = 0; k < 3; k++) blob(c, rrect(26 + k * 2, 49 - k * 2.4, 18, 7, 1), '#f0e8d6', '#b8b0a0', 1.2, 0.8);
  blob(c, ellipse(66, 48, 10, 9), '#e8d8a0', '#b8a060', 1.8, 1.2);
  dab(c, ellipse(62, 46, 2.4, 1.6), INK);
  dab(c, ellipse(70, 46, 2.4, 1.6), INK);
  stroke(c, (k) => { k.moveTo(61, 52); k.quadraticCurveTo(66, 55, 71, 52); }, 1.4, LANTERN_SH);
  blob(c, (k) => { k.moveTo(90, 56); k.quadraticCurveTo(86, 46, 92, 42); k.lineTo(100, 42); k.quadraticCurveTo(106, 46, 102, 56); k.closePath(); }, '#4a5a6a', '#2e3a46', 1.8, 1.2);
  blob(c, (k) => { k.moveTo(106, 56); k.quadraticCurveTo(103, 49, 108, 46); k.lineTo(114, 46); k.quadraticCurveTo(119, 49, 116, 56); k.closePath(); }, '#7a4a3a', '#4e2e24', 1.8, 1.2);
  // 两盏红灯笼：先画一圈光晕
  for (const x of [12, 128]) {
    dab(c, circle(x, 50, 18), '#ff7a4a', 0.22);
    stroke(c, (k) => { k.moveTo(x, 36); k.lineTo(x, 42); }, 1.2);
    blob(c, ellipse(x, 52, 9, 10), LANTERN, LANTERN_SH, 2, 1.6);
    dab(c, ellipse(x, 52, 5, 6.4), '#ffb070');
    blob(c, rrect(x - 5, 41, 10, 3, 1), '#2a1e16', null, 1.2);
    blob(c, rrect(x - 5, 61, 10, 3, 1), '#2a1e16', null, 1.2);
    stroke(c, (k) => { k.moveTo(x, 64); k.lineTo(x, 70); }, 1.4, '#f2c744');
  }
}

export const SPRITES_GUISHI: SpriteDef[] = [
  { key: 'puppet', w: 46, h: 64, ox: 0.5, oy: 0.95, draw: puppet },
  { key: 'peddler', w: 64, h: 62, ox: 0.5, oy: 0.93, draw: peddler },
  { key: 'marketboss', w: 86, h: 98, ox: 0.5, oy: 0.95, draw: marketboss },
  { key: 'gstall', w: 140, h: 94, ox: 0.5, oy: 0.93, draw: gstall },
];
