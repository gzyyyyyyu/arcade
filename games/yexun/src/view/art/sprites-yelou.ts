/**
 * 终局首领「夜漏君」的精灵（design 第 6 节）：穿旧官袍的高大夜影，胸口嵌一只铜壶滴漏，头顶一弯缺了口的月，背后拖着挂熄灯笼的更绳。
 * 画法同 sprites-huapi：墨色粗描边、平涂 + 右下一层阴影；雪地亮，袍用深靛，铜壶和月用饱和金，边都加深。
 * 本体三帧：yelou（走 1）、yelou2（走 2）、yelouc（蓄力，壶发亮、双臂举起）；其余是小件，键名见 YELOU_KEYS。
 * 装进角色小图集（atlas.ts 的 buildHeroAtlas）：特色怪图集在倍数 3 下已经 2,034 / 2,048，装不下。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const ROBE = '#3b4286';
const ROBE_SH = '#222657';
const SKIN = '#2c2f5c';
const SKIN_SH = '#191b3c';
const BRONZE = '#e0a93c';
const BRONZE_SH = '#a56f1a';
const MOON = '#ffe08a';
const MOON_SH = '#d9a93a';
const EYE = '#ffd04a';
const LANTERN = '#9c3030';
const LANTERN_SH = '#5e1a1a';

const W = 96;
const H = 128;

/** 更绳：从背后垂下，挂三盏熄了的灯笼 */
function rope(c: Ctx, sway: number): void {
  const pts = [[66, 52], [84 + sway, 74], [76 + sway * 1.4, 92], [84 + sway, 108]] as const;
  const path = (k: Ctx): void => {
    k.moveTo(pts[0][0], pts[0][1]);
    k.quadraticCurveTo(pts[1][0] + 6, pts[1][1] - 6, pts[1][0], pts[1][1]);
    k.quadraticCurveTo(pts[2][0] + 8, pts[2][1] - 8, pts[2][0], pts[2][1]);
    k.quadraticCurveTo(pts[3][0] - 8, pts[3][1] - 8, pts[3][0], pts[3][1]);
  };
  stroke(c, path, 4.2, INK);
  stroke(c, path, 2, '#8a6a3a');
  for (const [x, y] of [pts[1], pts[2], pts[3]]) {
    blob(c, rrect(x - 5, y, 10, 13, 3.6), LANTERN, LANTERN_SH, 1.8, 1.6);
    stroke(c, (k) => { k.moveTo(x - 5, y + 6); k.lineTo(x + 5, y + 6); }, 1.2, LANTERN_SH);
  }
}

/** 头顶被啃缺的月：开口朝右的弯月，缺一个小口 */
function moon(c: Ctx): void {
  blob(c, (k) => {
    k.moveTo(60, 2);
    k.quadraticCurveTo(34, 14, 60, 30);
    k.quadraticCurveTo(54, 16, 60, 2);
  }, MOON, MOON_SH, 2.2, 1.6);
  dab(c, circle(48, 14, 2), INK, 0.35);
}

/** 本体。pose：0 走 1、1 走 2、2 蓄力 */
function body(c: Ctx, pose: 0 | 1 | 2): void {
  const charge = pose === 2;
  const lean = pose === 0 ? -3 : pose === 1 ? 3 : 0;
  dab(c, ellipse(48, 122, 31, 5), INK, 0.26);
  rope(c, lean * 0.6);
  // 脚：走路时一前一后
  const lf = pose === 0 ? 0 : -4;
  const rf = pose === 0 ? -4 : 0;
  blob(c, ellipse(36, 120 + lf, 8, 4.4), SKIN, SKIN_SH, 2, 1.2);
  blob(c, ellipse(60, 120 + rf, 8, 4.4), SKIN, SKIN_SH, 2, 1.2);
  // 官袍：上窄下宽，下摆参差，蓄力时撑开
  const flare = charge ? 6 : 0;
  blob(c, (k) => {
    k.moveTo(33 + lean, 46);
    k.quadraticCurveTo(48 + lean, 40, 63 + lean, 46);
    k.quadraticCurveTo(72 + flare, 84, 78 + flare, 119);
    k.lineTo(68, 113);
    k.lineTo(60, 121);
    k.lineTo(50, 114);
    k.lineTo(40, 121);
    k.lineTo(30, 113);
    k.lineTo(18 - flare, 119);
    k.quadraticCurveTo(26 - flare, 84, 33 + lean, 46);
  }, ROBE, ROBE_SH, 2.8, 3.4);
  // 袍上的旧补子和衣褶、腰带
  blob(c, rrect(41 + lean, 92, 14, 12, 1.4), '#4d559e', null, 1.4);
  stroke(c, (k) => { k.moveTo(34 + lean, 76); k.quadraticCurveTo(48 + lean, 82, 62 + lean, 76); }, 4.4, INK);
  stroke(c, (k) => { k.moveTo(34 + lean, 76); k.quadraticCurveTo(48 + lean, 82, 62 + lean, 76); }, 2.4, '#b88a2e');
  stroke(c, (k) => { k.moveTo(26, 110); k.lineTo(31, 90); k.moveTo(70, 110); k.lineTo(65, 90); }, 1.2, ROBE_SH);
  // 胸口铜壶滴漏：壶口露一圈深洞（浮箭是单独的小件，随血降），下面一只出水的嘴
  const cx = 48 + lean;
  if (charge) dab(c, circle(cx, 66, 26), '#ffd04a', 0.35);
  blob(c, rrect(cx - 11, 50, 22, 28, 4), BRONZE, BRONZE_SH, 2.4, 2.4);
  blob(c, rrect(cx - 8, 46, 16, 7, 2.4), BRONZE, BRONZE_SH, 2, 1.6);
  dab(c, ellipse(cx, 48.4, 5.6, 1.7), INK);
  for (const y of [57, 68]) stroke(c, (k) => { k.moveTo(cx - 11, y); k.lineTo(cx + 11, y); }, 1.4, BRONZE_SH);
  for (const x of [cx - 7, cx + 7]) dab(c, circle(x, 62, 1.5), '#fff0b0');
  blob(c, poly(cx - 2.4, 78, cx + 2.4, 78, cx, 84), BRONZE, BRONZE_SH, 1.4, 0.6);
  dab(c, ellipse(cx, 88, 1.8, 2.6), '#5fb4ff', 0.9);
  if (charge) {
    dab(c, ellipse(cx - 3, 60, 3, 6), '#ffffff', 0.55);
  }
  // 手臂：走路时垂在身侧，蓄力时举过头
  for (const s of [-1, 1]) {
    const sx = 48 + lean + s * 17;
    const hand = charge ? [48 + s * 34, 38] : [48 + s * 25, 82 + s * lean * 0.5];
    const arm = (k: Ctx): void => { k.moveTo(sx, 52); k.quadraticCurveTo(48 + s * (charge ? 38 : 30), charge ? 56 : 64, hand[0]!, hand[1]!); };
    stroke(c, arm, 11, INK);
    stroke(c, arm, 7.4, ROBE);
    blob(c, circle(hand[0]!, hand[1]!, 5.2), SKIN, SKIN_SH, 2, 1.2);
  }
  // 脑袋：一团夜影，只亮两只眼
  blob(c, ellipse(48 + lean, 32, 14, 16), SKIN, SKIN_SH, 2.6, 2.4);
  for (const s of [-1, 1]) {
    dab(c, ellipse(48 + lean + s * 6, 32, 3.6, charge ? 3.6 : 2.6), EYE);
    dab(c, circle(48 + lean + s * 6, 32, 1.2), INK);
  }
  stroke(c, (k) => { k.moveTo(43 + lean, 42); k.quadraticCurveTo(48 + lean, charge ? 47 : 43, 53 + lean, 42); }, 1.6, '#0d0e22');
  moon(c);
}

/** 滴漏的浮箭：独立小件，脚底在壶里，随血往下降（view 只改它的 y）；刻度 + 红色浮头 */
function arrow(c: Ctx): void {
  blob(c, rrect(5, 8, 6, 50, 2), BRONZE, BRONZE_SH, 1.8, 1.2);
  for (const y of [18, 28, 38, 48]) stroke(c, (k) => { k.moveTo(5, y); k.lineTo(11, y); }, 1.2, BRONZE_SH);
  blob(c, poly(8, 1, 14, 9, 2, 9), '#e04a3a', '#9a2418', 1.8, 1);
}

/** 鼓圈缺口的金色短弧：描边环上缺口处补一段，示意「从这儿穿过去」 */
function gap(c: Ctx): void {
  const a = (k: Ctx): void => { k.arc(20, 30, 22, -2.2, -0.94); };
  stroke(c, a, 7.2, INK);
  stroke(c, a, 4, '#ffcf3a');
  stroke(c, (k) => { k.arc(20, 30, 23.4, -2.0, -1.2); }, 1.2, '#fff3b0');
}

/** 月牙镰的红线预警：横向半透明红带，两端渐隐；view 按冲刺长度拉伸 */
function scythe(c: Ctx): void {
  const g = c.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(224,42,58,0)');
  g.addColorStop(0.12, 'rgba(224,42,58,0.62)');
  g.addColorStop(0.88, 'rgba(224,42,58,0.62)');
  g.addColorStop(1, 'rgba(224,42,58,0)');
  c.fillStyle = g;
  c.fillRect(0, 2, 128, 20);
  c.fillStyle = 'rgba(122,16,28,0.8)';
  c.fillRect(8, 2, 112, 2);
  c.fillRect(8, 20, 112, 2);
  for (let x = 20; x < 110; x += 22) dab(c, poly(x, 12, x + 8, 6, x + 8, 18), '#ffffff', 0.55);
}

/** 漏珠：一滴水珠，深蓝带白高光，雪地上看得清 */
function bead(c: Ctx): void {
  blob(c, (k) => {
    k.moveTo(10, 1.5);
    k.quadraticCurveTo(18, 11, 17, 14);
    k.quadraticCurveTo(10, 19, 3, 14);
    k.quadraticCurveTo(2, 11, 10, 1.5);
  }, '#2f7fd8', '#1a4a9a', 1.8, 1.6);
  dab(c, ellipse(7, 11, 1.8, 3, 0.4), '#ffffff', 0.85);
}

/** 夜潮的边缘：深靛的一排浪头，往上渐隐，贴着圈边平铺 */
function tide(c: Ctx): void {
  const g = c.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, 'rgba(34,38,87,0)');
  g.addColorStop(0.55, 'rgba(34,38,87,0.7)');
  g.addColorStop(1, 'rgba(24,26,64,0.92)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 32);
  c.fillStyle = 'rgba(34,38,87,0.92)';
  c.beginPath();
  c.moveTo(0, 32);
  for (let x = 0; x <= 128; x += 32) {
    c.quadraticCurveTo(x + 8, 6, x + 20, 12);
    c.quadraticCurveTo(x + 28, 16, x + 32, 32);
  }
  c.closePath();
  c.fill();
  stroke(c, (k) => { k.moveTo(0, 26); for (let x = 0; x < 128; x += 32) { k.quadraticCurveTo(x + 8, 6, x + 20, 12); k.quadraticCurveTo(x + 28, 18, x + 32, 26); } }, 1.6, '#6f78d8');
}

/** 月蚀段亮起的灯笼：站在旁边伤害 +20%、看得见半径恢复 */
function lantern(c: Ctx): void {
  dab(c, circle(16, 22, 20), '#ffd04a', 0.28);
  stroke(c, (k) => { k.moveTo(16, 2); k.lineTo(16, 8); }, 2.4, INK);
  blob(c, rrect(8, 8, 16, 4, 1.4), '#5e3a14', null, 1.6);
  blob(c, ellipse(16, 24, 11, 13), '#ff7a30', '#d44a14', 2.4, 2.2);
  dab(c, ellipse(16, 24, 5, 8), '#ffe27a', 0.95);
  blob(c, rrect(10, 36, 12, 3.6, 1.4), '#5e3a14', null, 1.6);
  stroke(c, (k) => { k.moveTo(16, 39); k.lineTo(16, 46); }, 2, '#c43a2a');
}

/** 天亮转场用的暖光团：圆形渐变，view 放大盖在场上 */
function dawn(c: Ctx): void {
  const g = c.createRadialGradient(80, 80, 0, 80, 80, 80);
  g.addColorStop(0, 'rgba(255,244,196,0.95)');
  g.addColorStop(0.45, 'rgba(255,214,128,0.55)');
  g.addColorStop(1, 'rgba(255,190,100,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 160, 160);
}

export const SPRITES_YELOU: SpriteDef[] = [
  { key: 'yelou', w: W, h: H, ox: 0.5, oy: 0.95, draw: (c) => body(c, 0) },
  { key: 'yelou2', w: W, h: H, ox: 0.5, oy: 0.95, draw: (c) => body(c, 1) },
  { key: 'yelouc', w: W, h: H, ox: 0.5, oy: 0.95, draw: (c) => body(c, 2) },
  { key: 'yelou_arrow', w: 16, h: 60, ox: 0.5, oy: 1, draw: arrow },
  { key: 'yelou_gap', w: 40, h: 40, ox: 0.5, oy: 0.5, draw: gap },
  { key: 'yelou_scythe', w: 128, h: 24, ox: 0.5, oy: 0.5, draw: scythe },
  { key: 'yelou_bead', w: 20, h: 20, ox: 0.5, oy: 0.5, draw: bead },
  { key: 'yelou_tide', w: 128, h: 32, ox: 0.5, oy: 1, draw: tide },
  { key: 'yelou_lantern', w: 32, h: 48, ox: 0.5, oy: 0.95, draw: lantern },
  { key: 'yelou_dawn', w: 160, h: 160, ox: 0.5, oy: 0.5, draw: dawn },
];
