/**
 * 画皮的精灵：新首领「画皮」（content/enemies.ts 的 huapi / huapiskin）。画法同前：大头 Q 版、墨色粗描边、平涂 + 右下一层阴影。
 * 色板：青面獠牙的青绿 + 披着的人皮（淡粉）+ 一缕红丝；雪地上青绿和粉都跳得出来，红丝用饱和的朱红加深色边。
 * 混迹时画皮借常规怪的图放大画（GameScene），这里只有现形后的样子、分身、红丝。
 * 和特色怪一起画进特色怪图集（atlas.ts 的 MOB_TEX）。
 */
import { INK, blob, circle, dab, ellipse, poly, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const HAIR = '#2a2434';
const HAIR_SH = '#171320';
const GREEN = '#79b9a2';
const GREEN_SH = '#4f8a78';
const ROBE = '#46585a';
const ROBE_SH = '#2a383c';
const SKIN = '#f6cfc4';
const SKIN_SH = '#d9a0a0';
const RED = '#e02a3a';
const RED_SH = '#9a1624';

/** 画皮：披散黑发，半张人皮挂在身上，脸一半是画出来的美人、一半是青面獠牙，手里提着卷起来的人皮 */
function huapi(c: Ctx): void {
  dab(c, ellipse(56, 122, 36, 6), INK, 0.26);
  // 披散的长发，垂到脚边，发梢参差
  blob(c, (k) => {
    k.moveTo(38, 22);
    k.quadraticCurveTo(12, 52, 18, 118);
    k.lineTo(32, 100);
    k.lineTo(38, 124);
    k.lineTo(50, 104);
    k.lineTo(58, 126);
    k.lineTo(70, 104);
    k.lineTo(80, 124);
    k.lineTo(90, 100);
    k.quadraticCurveTo(100, 52, 74, 22);
    k.closePath();
  }, HAIR, HAIR_SH, 2.6, 3.2);
  // 破旧的长袍
  blob(c, (k) => {
    k.moveTo(38, 56);
    k.quadraticCurveTo(28, 90, 33, 116);
    k.lineTo(43, 111);
    k.lineTo(50, 119);
    k.lineTo(58, 111);
    k.lineTo(66, 119);
    k.lineTo(74, 111);
    k.lineTo(80, 116);
    k.quadraticCurveTo(86, 90, 74, 56);
    k.quadraticCurveTo(56, 50, 38, 56);
  }, ROBE, ROBE_SH, 2.6, 3);
  stroke(c, (k) => { k.moveTo(56, 58); k.lineTo(56, 112); }, 1.2, ROBE_SH);
  // 腰上一道红丝带
  stroke(c, (k) => { k.moveTo(36, 82); k.quadraticCurveTo(56, 88, 78, 82); }, 4.4, INK);
  stroke(c, (k) => { k.moveTo(36, 82); k.quadraticCurveTo(56, 88, 78, 82); }, 2.4, RED);
  // 挂在左半边身上的人皮：参差的下沿，上面两个空眼眶、一张小嘴
  blob(c, (k) => {
    k.moveTo(32, 54);
    k.lineTo(60, 56);
    k.quadraticCurveTo(62, 78, 52, 92);
    k.lineTo(56, 106);
    k.lineTo(46, 99);
    k.lineTo(42, 112);
    k.lineTo(36, 92);
    k.quadraticCurveTo(28, 72, 32, 54);
    k.closePath();
  }, SKIN, SKIN_SH, 2.4, 2.6);
  dab(c, ellipse(40, 70, 2.6, 3.4), INK);
  dab(c, ellipse(50, 70, 2.6, 3.4), INK);
  dab(c, ellipse(45, 79, 2.2, 3), INK);
  stroke(c, (k) => { k.moveTo(36, 60); k.quadraticCurveTo(40, 58, 44, 60); k.moveTo(48, 60); k.quadraticCurveTo(52, 58, 56, 60); }, 1.2, SKIN_SH);
  // 提着人皮的那只手：青色的爪，攥着一卷人皮，红丝系口
  stroke(c, (k) => { k.moveTo(74, 60); k.quadraticCurveTo(86, 66, 88, 80); }, 7, INK);
  stroke(c, (k) => { k.moveTo(74, 60); k.quadraticCurveTo(86, 66, 88, 80); }, 4.4, ROBE);
  blob(c, poly(86, 58, 100, 62, 104, 102, 90, 100), SKIN, SKIN_SH, 2.2, 2.4);
  blob(c, ellipse(93, 59, 7.2, 3.2), '#e8b4a8', SKIN_SH, 2, 0.8);
  blob(c, ellipse(97, 101, 7.2, 3.2), '#e8b4a8', SKIN_SH, 2, 0.8);
  stroke(c, (k) => { k.moveTo(88, 78); k.lineTo(103, 82); }, 3.6, INK);
  stroke(c, (k) => { k.moveTo(88, 78); k.lineTo(103, 82); }, 1.8, RED);
  blob(c, circle(88, 82, 4.6), GREEN, GREEN_SH, 2, 1.2);
  // 脑袋：青面
  blob(c, circle(56, 38, 17), GREEN, GREEN_SH, 2.6, 2.6);
  // 左半张脸换成画出来的美人：粉白的皮、细眉、一点红唇
  blob(c, (k) => { k.moveTo(56, 22); k.arc(56, 38, 15.6, -Math.PI / 2, Math.PI / 2, true); k.closePath(); }, SKIN, SKIN_SH, 1.8, 1.6);
  stroke(c, (k) => { k.moveTo(42, 32); k.quadraticCurveTo(47, 29, 52, 32); }, 1.5);
  stroke(c, (k) => { k.moveTo(43, 37); k.quadraticCurveTo(47, 34.6, 51, 37); }, 1.4);
  dab(c, circle(47, 37.4, 1.1), INK);
  dab(c, circle(43, 43, 2.4), '#f08a9a', 0.7);
  blob(c, (k) => { k.moveTo(48, 47); k.quadraticCurveTo(52, 45, 56, 47); k.quadraticCurveTo(52, 50, 48, 47); }, RED, null, 1.2);
  // 右半边：血红的眼、翻出来的獠牙
  blob(c, circle(63, 36, 4.4), '#fff4d0', null, 1.8);
  dab(c, circle(63.4, 36.4, 2.6), RED);
  dab(c, circle(63.4, 36.4, 1.1), INK);
  stroke(c, (k) => { k.moveTo(58, 29); k.lineTo(69, 33); }, 2.2);
  stroke(c, (k) => { k.moveTo(56, 40); k.lineTo(58, 45); }, 1.2, GREEN_SH);
  stroke(c, (k) => { k.moveTo(56, 47); k.quadraticCurveTo(63, 50, 70, 45); }, 2);
  blob(c, poly(60, 47.6, 62.6, 56, 65, 48.6), '#fffaf0', null, 1.4);
  blob(c, poly(66, 46.6, 68.4, 54, 70.4, 45.4), '#fffaf0', null, 1.4);
  // 额前的乱发和遮住半边脸的几缕
  blob(c, (k) => {
    k.moveTo(38, 38);
    k.quadraticCurveTo(36, 17, 56, 16);
    k.quadraticCurveTo(76, 17, 74, 40);
    k.quadraticCurveTo(70, 28, 62, 26);
    k.quadraticCurveTo(52, 30, 46, 27);
    k.quadraticCurveTo(40, 30, 38, 38);
  }, HAIR, null, 2.2);
  stroke(c, (k) => { k.moveTo(72, 30); k.quadraticCurveTo(76, 44, 71, 60); }, 2.4, HAIR);
  // 头顶一缕红丝
  stroke(c, (k) => { k.moveTo(54, 17); k.quadraticCurveTo(50, 8, 56, 2); }, 3.6, INK);
  stroke(c, (k) => { k.moveTo(54, 17); k.quadraticCurveTo(50, 8, 56, 2); }, 1.8, RED);
}

/** 人皮分身：一张飘着的人皮，空眼眶、张着的嘴；淡粉带深色描边，下沿是飘动的碎条，轻一点 */
function huapiskin(c: Ctx): void {
  dab(c, ellipse(26, 62, 13, 2.6), INK, 0.16);
  // 展开的人皮：圆脑袋、窄肩、两条垂下来的袖、飘摇的下摆
  blob(c, (k) => {
    k.moveTo(26, 4);
    k.quadraticCurveTo(38, 4, 38, 16);
    k.quadraticCurveTo(38, 22, 34, 25);
    k.lineTo(46, 30);
    k.quadraticCurveTo(50, 42, 44, 52);
    k.lineTo(40, 44);
    k.lineTo(41, 58);
    k.lineTo(34, 50);
    k.lineTo(30, 64);
    k.lineTo(25, 50);
    k.lineTo(19, 60);
    k.lineTo(17, 46);
    k.lineTo(10, 54);
    k.quadraticCurveTo(4, 42, 8, 30);
    k.lineTo(18, 25);
    k.quadraticCurveTo(14, 22, 14, 16);
    k.quadraticCurveTo(14, 4, 26, 4);
    k.closePath();
  }, SKIN, SKIN_SH, 2.2, 2.4);
  // 空眼眶 + 张开的嘴
  dab(c, ellipse(21, 15, 3, 4.2), INK);
  dab(c, ellipse(31, 15, 3, 4.2), INK);
  dab(c, circle(21.6, 16.4, 0.9), RED);
  dab(c, circle(31.6, 16.4, 0.9), RED);
  dab(c, ellipse(26, 24, 2.4, 3.2), INK);
  stroke(c, (k) => { k.moveTo(18, 36); k.quadraticCurveTo(26, 40, 34, 36); }, 1.1, SKIN_SH);
  stroke(c, (k) => { k.moveTo(20, 43); k.quadraticCurveTo(26, 47, 32, 43); }, 1.1, SKIN_SH);
}

/** 一缕红丝：给混迹中的画皮头顶飘着用；雪地上看得见，所以画成饱和朱红加墨边，打一个小结 */
function redsilk(c: Ctx): void {
  const wave = (k: CanvasRenderingContext2D): void => {
    k.moveTo(10, 46);
    k.bezierCurveTo(4, 36, 16, 30, 10, 20);
    k.bezierCurveTo(5, 12, 12, 8, 11, 2);
  };
  stroke(c, wave, 4.6, INK);
  stroke(c, wave, 2.4, RED);
  blob(c, circle(10, 28, 2.8), RED, RED_SH, 1.6, 0.8);
}

export const SPRITES_HUAPI: SpriteDef[] = [
  { key: 'huapi', w: 112, h: 128, ox: 0.5, oy: 0.95, draw: huapi },
  { key: 'huapiskin', w: 52, h: 66, ox: 0.5, oy: 0.9, draw: huapiskin },
  { key: 'redsilk', w: 20, h: 50, ox: 0.5, oy: 1, draw: redsilk },
];
