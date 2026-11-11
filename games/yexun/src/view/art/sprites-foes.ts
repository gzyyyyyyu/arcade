/**
 * 新首领、特色怪和夜探怪的精灵：千年竹母、水猴王、冰魄娘娘、无面佛（及小佛）、雪童子、棺钉鬼（及棺材、棺钉）、
 * 红衣戏子、戏班鬼影、硕鼠将军、鼠妖，以及米山、戏台、粮仓和出土特效（竹笋、冰刺、涟漪）。
 * 画法同 sprites-huapi：大头 Q 版、墨色粗描边、平涂 + 右下一层阴影；雪地很亮，主色用饱和色，边用深色。
 * 和特色怪一起画进特色怪图集（atlas.ts 的 MOB_TEX）。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const WHITE = '#fffaf0';

/** 地上的椭圆影子 */
function ground(c: Ctx, x: number, y: number, rx: number, ry = rx * 0.17): void {
  dab(c, ellipse(x, y, rx, ry), INK, 0.26);
}

// ───────────────────────── 千年竹母 ─────────────────────────
const BAM = '#5fb04a';
const BAM_SH = '#3a7d33';
const LEAF = '#7cc84e';
const LEAF_SH = '#4a9a3c';

function zhumu(c: Ctx): void {
  ground(c, 70, 143, 50);
  // 身子：一丛粗竹，三根主干
  for (const [x, w, top] of [[40, 18, 62], [100, 18, 66], [70, 30, 52]] as const) {
    blob(c, rrect(x - w / 2, top, w, 142 - top, 5), BAM, BAM_SH, 2.6, 3);
    for (let y = top + 22; y < 138; y += 24) {
      stroke(c, (k) => { k.moveTo(x - w / 2 - 1, y); k.lineTo(x + w / 2 + 1, y); }, 3.4, INK);
      stroke(c, (k) => { k.moveTo(x - w / 2 + 1, y - 1.6); k.lineTo(x + w / 2 - 1, y - 1.6); }, 1.4, '#a6dc78');
    }
  }
  // 竹节手臂：从两侧干上伸出，末端是竹叶指
  for (const s of [-1, 1]) {
    const bx = 70 + s * 14;
    const ex = 70 + s * 52;
    stroke(c, (k) => { k.moveTo(bx, 84); k.quadraticCurveTo(70 + s * 40, 90, ex, 66); }, 11, INK);
    stroke(c, (k) => { k.moveTo(bx, 84); k.quadraticCurveTo(70 + s * 40, 90, ex, 66); }, 7, BAM);
    stroke(c, (k) => { k.moveTo(70 + s * 30, 88); k.lineTo(70 + s * 33, 80); }, 3, INK);
    for (let i = 0; i < 3; i++) {
      blob(c, (k) => { k.moveTo(ex, 66); k.quadraticCurveTo(ex + s * (8 + i * 4), 52 - i * 6, ex + s * (18 + i * 6), 48 - i * 8); k.quadraticCurveTo(ex + s * (10 + i * 3), 64, ex, 66); }, LEAF, LEAF_SH, 1.8, 1.4);
    }
  }
  // 披散的竹叶长发（后层）
  for (let i = 0; i < 7; i++) {
    const a = -1 + i * 0.33;
    const x0 = 70 + a * 20;
    blob(c, (k) => { k.moveTo(x0, 22); k.quadraticCurveTo(x0 + a * 26, 54, x0 + a * 30, 90 - Math.abs(a) * 6); k.quadraticCurveTo(x0 + a * 12, 56, x0 + 3, 24); }, i % 2 ? LEAF : '#4f9d3c', LEAF_SH, 1.8, 1.4);
  }
  // 脸：淡青色女子面孔
  blob(c, ellipse(70, 38, 17, 21), '#d8efc0', '#a5cf8e', 2.6, 2.4);
  stroke(c, (k) => { k.moveTo(54, 31); k.quadraticCurveTo(60, 27, 66, 31); }, 1.8);
  stroke(c, (k) => { k.moveTo(74, 31); k.quadraticCurveTo(80, 27, 86, 31); }, 1.8);
  dab(c, ellipse(60, 36, 3.4, 2.4), INK);
  dab(c, ellipse(80, 36, 3.4, 2.4), INK);
  dab(c, circle(61, 35.4, 1), '#9cff7a');
  dab(c, circle(81, 35.4, 1), '#9cff7a');
  dab(c, circle(55, 45, 3.2), '#f08a8a', 0.55);
  dab(c, circle(85, 45, 3.2), '#f08a8a', 0.55);
  blob(c, (k) => { k.moveTo(65, 49); k.quadraticCurveTo(70, 46, 75, 49); k.quadraticCurveTo(70, 53, 65, 49); }, '#c4465a', null, 1.4);
  // 额前刘海 + 头顶竹叶冠
  blob(c, (k) => { k.moveTo(52, 36); k.quadraticCurveTo(52, 14, 70, 14); k.quadraticCurveTo(88, 14, 88, 36); k.quadraticCurveTo(80, 22, 70, 26); k.quadraticCurveTo(60, 22, 52, 36); }, '#4f9d3c', LEAF_SH, 2, 1.4);
  for (const [dx, r] of [[-16, -0.6], [0, 0], [16, 0.6]] as const) {
    blob(c, (k) => { k.moveTo(70 + dx, 16); k.quadraticCurveTo(70 + dx + r * 26, -2, 70 + dx + r * 40, 4); k.quadraticCurveTo(70 + dx + r * 20, 12, 70 + dx, 16); }, LEAF, LEAF_SH, 1.8, 1.2);
  }
}

// ───────────────────────── 水猴王 ─────────────────────────
const FUR = '#6f8c7a';
const FUR_SH = '#455f55';
const WEED = '#3f7a4a';

function shuihou(c: Ctx): void {
  ground(c, 64, 104, 48);
  // 水草（挂在背上、垂下）
  for (const [x, l] of [[80, 34], [92, 28], [52, 30]] as const) {
    blob(c, (k) => { k.moveTo(x, 40); k.quadraticCurveTo(x + 10, 40 + l, x + 2, 52 + l); k.quadraticCurveTo(x - 4, 40 + l * 0.5, x - 4, 42); }, WEED, '#2b5636', 1.8, 1.4);
  }
  // 后腿 + 身子（蹲姿）
  blob(c, ellipse(88, 92, 18, 12), FUR, FUR_SH, 2.6, 3);
  blob(c, ellipse(66, 72, 34, 28), FUR, FUR_SH, 2.8, 4);
  dab(c, ellipse(62, 80, 20, 16), '#9bb5a0', 0.8);
  // 后脚
  blob(c, ellipse(96, 100, 12, 5), FUR, FUR_SH, 2.2, 1.4);
  // 前爪臂：伸向左前，爪尖带利爪
  stroke(c, (k) => { k.moveTo(46, 70); k.quadraticCurveTo(26, 78, 16, 96); }, 14, INK);
  stroke(c, (k) => { k.moveTo(46, 70); k.quadraticCurveTo(26, 78, 16, 96); }, 10, FUR);
  blob(c, ellipse(14, 98, 10, 7), FUR, FUR_SH, 2.2, 1.6);
  for (const dx of [-7, -1, 5]) blob(c, poly(14 + dx, 100, 12 + dx, 108, 17 + dx, 102), WHITE, null, 1.4);
  // 另一只手搭在膝上
  blob(c, ellipse(54, 94, 10, 6), FUR, FUR_SH, 2.2, 1.6);
  // 头：圆、湿漉漉的毛贴着
  blob(c, circle(54, 40, 25), FUR, FUR_SH, 2.8, 3.2);
  blob(c, circle(33, 36, 8), FUR, FUR_SH, 2.2, 1.6);
  blob(c, circle(75, 36, 8), FUR, FUR_SH, 2.2, 1.6);
  dab(c, circle(33, 36, 4), '#c58f8a');
  dab(c, circle(75, 36, 4), '#c58f8a');
  // 湿毛尖
  blob(c, poly(40, 18, 46, 8, 52, 18, 58, 7, 64, 18, 70, 12, 70, 22, 40, 22), FUR_SH, null, 1.8);
  // 脸：浅色面罩 + 黄眼 + 尖牙
  blob(c, ellipse(54, 46, 16, 13), '#b8ccb4', '#8aa690', 1.8, 1.6);
  for (const x of [46, 62]) {
    blob(c, circle(x, 38, 5.4), '#ffe55a', null, 1.8);
    dab(c, ellipse(x, 38, 1.5, 4), INK);
  }
  dab(c, circle(51, 46, 1), INK);
  dab(c, circle(57, 46, 1), INK);
  blob(c, (k) => { k.moveTo(42, 52); k.quadraticCurveTo(54, 62, 66, 52); k.quadraticCurveTo(54, 56, 42, 52); }, '#7a2630', null, 1.8);
  blob(c, poly(45, 53, 47, 62, 50, 55), WHITE, null, 1.3);
  blob(c, poly(63, 53, 61, 62, 58, 55), WHITE, null, 1.3);
  // 水珠
  for (const [x, y] of [[100, 60], [20, 56], [78, 20]] as const) dab(c, ellipse(x, y, 2.4, 3.4), '#7fd0ff', 0.9);
}

function ripple(c: Ctx): void {
  for (const [rx, ry, a] of [[36, 15, 0.95], [25, 10, 0.8], [14, 5.5, 0.65]] as const) {
    c.save();
    c.beginPath();
    ellipse(40, 18, rx, ry)(c);
    c.lineWidth = 3.4;
    c.strokeStyle = `rgba(24,70,130,${a * 0.55})`;
    c.stroke();
    c.lineWidth = 2;
    c.strokeStyle = `rgba(150,215,255,${a})`;
    c.stroke();
    c.restore();
  }
}

// ───────────────────────── 冰魄娘娘 ─────────────────────────
const ICE = '#a8d8f5';
const ICE_SH = '#6fa8d8';
const ICE_DK = '#1d3f7a';
const FROST = '#f2f9ff';

function binghun(c: Ctx): void {
  ground(c, 62, 144, 40);
  // 长发（后层）：深蓝黑，发梢结霜
  blob(c, (k) => { k.moveTo(36, 28); k.quadraticCurveTo(10, 80, 22, 130); k.lineTo(34, 112); k.lineTo(42, 100); k.lineTo(82, 100); k.lineTo(90, 112); k.lineTo(102, 130); k.quadraticCurveTo(114, 80, 88, 28); k.closePath(); }, '#33457a', '#1f2b52', 2.6, 3);
  // 袍：素白，下摆如冰裂
  blob(c, (k) => { k.moveTo(44, 58); k.quadraticCurveTo(24, 100, 20, 140); k.lineTo(34, 132); k.lineTo(44, 144); k.lineTo(56, 134); k.lineTo(66, 146); k.lineTo(78, 134); k.lineTo(90, 144); k.lineTo(102, 132); k.quadraticCurveTo(98, 100, 80, 58); k.quadraticCurveTo(62, 52, 44, 58); }, FROST, ICE_SH, 2.8, 4);
  // 蓝冰腰带与领口
  stroke(c, (k) => { k.moveTo(40, 82); k.quadraticCurveTo(62, 92, 84, 82); }, 7, ICE_DK);
  stroke(c, (k) => { k.moveTo(40, 82); k.quadraticCurveTo(62, 92, 84, 82); }, 4, ICE);
  stroke(c, (k) => { k.moveTo(50, 60); k.lineTo(62, 76); k.lineTo(74, 60); }, 3.4, ICE_DK);
  // 袖子：宽大，袖口冰雾
  for (const s of [-1, 1]) {
    const x0 = 62 + s * 18;
    blob(c, (k) => { k.moveTo(x0, 62); k.quadraticCurveTo(62 + s * 46, 74, 62 + s * 50, 108); k.lineTo(62 + s * 34, 104); k.quadraticCurveTo(62 + s * 28, 84, x0 - s * 4, 80); }, FROST, ICE_SH, 2.6, 3);
    for (let i = 0; i < 3; i++) dab(c, circle(62 + s * (44 + i * 4), 112 + i * 6, 7 - i * 1.4), '#cfe9ff', 0.7 - i * 0.15);
    stroke(c, (k) => { k.moveTo(62 + s * 50, 108); k.lineTo(62 + s * 34, 104); }, 3, ICE);
  }
  // 脸：苍白
  blob(c, ellipse(62, 38, 17, 20), '#eef4fb', '#b7c8e0', 2.6, 2.4);
  stroke(c, (k) => { k.moveTo(48, 34); k.quadraticCurveTo(54, 30, 59, 34); }, 1.6);
  stroke(c, (k) => { k.moveTo(65, 34); k.quadraticCurveTo(70, 30, 76, 34); }, 1.6);
  dab(c, ellipse(54, 38, 3.2, 2.4), '#2aa6ff');
  dab(c, ellipse(70, 38, 3.2, 2.4), '#2aa6ff');
  dab(c, circle(54, 38, 1.2), INK);
  dab(c, circle(70, 38, 1.2), INK);
  blob(c, (k) => { k.moveTo(57, 49); k.quadraticCurveTo(62, 46, 67, 49); k.quadraticCurveTo(62, 52, 57, 49); }, '#5a78b8', null, 1.4);
  // 刘海
  blob(c, (k) => { k.moveTo(44, 38); k.quadraticCurveTo(42, 14, 62, 13); k.quadraticCurveTo(82, 14, 80, 38); k.quadraticCurveTo(76, 26, 62, 24); k.quadraticCurveTo(48, 26, 44, 38); }, '#33457a', null, 2.2);
  // 冰冠：几根冰棱
  blob(c, poly(44, 18, 46, 4, 52, 14, 56, -1 + 4, 62, 14, 68, 3, 72, 14, 78, 4, 80, 18), '#d6efff', ICE_SH, 2.4, 1.6);
  dab(c, poly(60, 16, 62, 8, 64, 16), WHITE);
  // 发上的霜点
  for (const [x, y] of [[30, 90], [96, 96], [26, 120], [100, 122]] as const) dab(c, circle(x, y, 2.4), FROST);
}

// ───────────────────────── 无面佛 ─────────────────────────
const GOLD = '#d9a93a';
const GOLD_SH = '#a67a24';
const GOLD_DK = '#7a5518';
const GLOW = '#f5d77a';

function hand(c: Ctx, x: number, y: number, r = 6): void {
  blob(c, circle(x, y, r), GOLD, GOLD_SH, 2, 1.4);
  stroke(c, (k) => { k.moveTo(x - r * 0.4, y); k.lineTo(x + r * 0.4, y - r * 0.4); }, 1.1, GOLD_DK);
}

function wumian(c: Ctx): void {
  ground(c, 70, 144, 54);
  // 背后光轮：暗金圆环 + 放射光芒
  c.save();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    blob(c, poly(70 + Math.cos(a - 0.1) * 54, 62 + Math.sin(a - 0.1) * 54, 70 + Math.cos(a) * 68, 62 + Math.sin(a) * 68, 70 + Math.cos(a + 0.1) * 54, 62 + Math.sin(a + 0.1) * 54), GLOW, GOLD_SH, 1.8, 1);
  }
  c.restore();
  blob(c, circle(70, 62, 54), '#b88d2e', GOLD_DK, 3, 3.4);
  dab(c, circle(70, 62, 44), '#e8c461', 0.55);
  c.save();
  c.beginPath();
  circle(70, 62, 46)(c);
  c.lineWidth = 2;
  c.strokeStyle = GOLD_DK;
  c.stroke();
  c.restore();
  // 盘坐的腿 + 莲台
  blob(c, ellipse(70, 134, 56, 14), '#c9638a', '#8f3a60', 2.6, 3);
  for (const x of [28, 48, 92, 112]) blob(c, (k) => { k.moveTo(x - 8, 136); k.quadraticCurveTo(x, 118, x + 8, 136); }, '#e48aa8', '#b85c80', 1.8, 1.2);
  blob(c, ellipse(70, 118, 42, 16), GOLD, GOLD_SH, 2.8, 3.4);
  // 身子
  blob(c, (k) => { k.moveTo(46, 114); k.quadraticCurveTo(40, 70, 56, 52); k.quadraticCurveTo(70, 46, 84, 52); k.quadraticCurveTo(100, 70, 94, 114); }, GOLD, GOLD_SH, 2.8, 4);
  // 袈裟斜披
  blob(c, (k) => { k.moveTo(54, 54); k.lineTo(90, 100); k.lineTo(94, 112); k.lineTo(78, 112); k.lineTo(50, 74); k.closePath(); }, '#b5563a', '#7f3424', 2.2, 2.4);
  // 下面两只手结印在腹前
  blob(c, ellipse(70, 106, 14, 7), GOLD, GOLD_SH, 2, 1.4);
  // 四条侧臂，各结印
  for (const s of [-1, 1]) {
    for (const [dy, ex, ey] of [[0, 40, 40], [1, 54, 82]] as const) {
      const sx = 70 + s * 22;
      const sy = 62 + dy * 16;
      const x2 = 70 + s * ex;
      stroke(c, (k) => { k.moveTo(sx, sy); k.quadraticCurveTo(70 + s * (ex + 6), sy + 12, x2, ey); }, 11, INK);
      stroke(c, (k) => { k.moveTo(sx, sy); k.quadraticCurveTo(70 + s * (ex + 6), sy + 12, x2, ey); }, 7.4, GOLD);
      hand(c, x2, ey, 6.6);
    }
  }
  hand(c, 70, 104, 5);
  // 脑袋：光滑金色，无五官——只有浅浅的脸面弧和肉髻
  blob(c, circle(70, 38, 22), GOLD, GOLD_SH, 2.8, 3);
  blob(c, circle(70, 14, 7.4), GOLD, GOLD_SH, 2.2, 1.6);
  blob(c, ellipse(70, 42, 15, 16), '#ecd08a', '#c9a24c', 1.8, 1.8);
  dab(c, ellipse(63, 34, 5, 7), '#fff2c0', 0.55);
  for (const s of [-1, 1]) blob(c, ellipse(70 + s * 24, 44, 5, 12), GOLD, GOLD_SH, 2.2, 1.4);
}

function xiaofo(c: Ctx): void {
  const S = '#a9adb4';
  const S_SH = '#767a84';
  ground(c, 28, 62, 22);
  blob(c, ellipse(28, 56, 22, 8), S, S_SH, 2.4, 2);
  blob(c, (k) => { k.moveTo(12, 56); k.quadraticCurveTo(10, 34, 28, 30); k.quadraticCurveTo(46, 34, 44, 56); }, S, S_SH, 2.6, 3);
  blob(c, ellipse(28, 46, 9, 5), '#c4c8ce', S_SH, 1.8, 1.2);
  blob(c, circle(28, 22, 13), S, S_SH, 2.6, 2.6);
  blob(c, circle(28, 9, 3.6), S, S_SH, 1.8, 1);
  // 微笑
  stroke(c, (k) => { k.moveTo(22, 21); k.quadraticCurveTo(24, 19, 26, 21); }, 1.5);
  stroke(c, (k) => { k.moveTo(30, 21); k.quadraticCurveTo(32, 19, 34, 21); }, 1.5);
  stroke(c, (k) => { k.moveTo(23, 27); k.quadraticCurveTo(28, 31, 33, 27); }, 1.8);
  dab(c, circle(21, 25, 2), '#d99a9a', 0.6);
  dab(c, circle(35, 25, 2), '#d99a9a', 0.6);
  // 头顶金光点
  for (const [x, y, r] of [[28, 1.6, 2.4], [20, 3, 1.6], [37, 3.4, 1.6]] as const) dab(c, circle(x, y, r), '#ffd95a');
}

// ───────────────────────── 竹笋、冰刺 ─────────────────────────
function shoot(c: Ctx): void {
  dab(c, ellipse(22, 58, 20, 4), INK, 0.3);
  for (const [x, h, w] of [[12, 36, 8], [32, 40, 8], [22, 58, 11]] as const) {
    blob(c, poly(x - w, 58, x - w * 0.5, 58 - h * 0.45, x, 58 - h, x + w * 0.5, 58 - h * 0.45, x + w, 58), '#c8dc5a', '#7fa83a', 2.4, 2.6);
    stroke(c, (k) => { k.moveTo(x - w * 0.75, 58 - h * 0.28); k.lineTo(x + w * 0.75, 58 - h * 0.28); }, 1.6, '#5a7d28');
    dab(c, poly(x, 58 - h + 6, x + 1.6, 58 - h * 0.4, x - 1.4, 58 - h * 0.4), '#f1f8a8', 0.8);
  }
  // 土块
  blob(c, ellipse(22, 59, 20, 3.4), '#7a5a3a', '#4f3a26', 1.8, 1.2);
  dab(c, circle(6, 56, 2), '#4f3a26');
  dab(c, circle(40, 57, 1.6), '#4f3a26');
}

function icespike(c: Ctx): void {
  dab(c, ellipse(20, 61, 17, 3), INK, 0.25);
  for (const [x, h, w] of [[9, 36, 6], [31, 42, 7], [20, 62, 9]] as const) {
    blob(c, poly(x - w, 62, x - w * 0.6, 62 - h * 0.5, x + 1, 62 - h, x + w * 0.7, 62 - h * 0.45, x + w, 62), '#bfe6fa', '#6aa6d8', 2.4, 2.6);
    dab(c, poly(x - w * 0.3, 62 - 4, x - w * 0.1, 62 - h * 0.6, x + 1, 62 - h + 6, x - w * 0.6, 62 - h * 0.4), WHITE, 0.85);
    stroke(c, (k) => { k.moveTo(x + 2, 62 - 4); k.lineTo(x + 2.4, 62 - h * 0.5); }, 1, '#4f86c0');
  }
  blob(c, ellipse(20, 61, 17, 2.6), '#e6f4ff', '#9cc4e6', 1.8, 1);
}

// ───────────────────────── 雪童子、雪里黑眼 ─────────────────────────
function xuetong(c: Ctx): void {
  ground(c, 26, 69, 22);
  // 冲刺的速度线
  for (const [y, l] of [[38, 12], [50, 16], [60, 10]] as const) stroke(c, (k) => { k.moveTo(46, y); k.lineTo(46 + l, y); }, 2.4, '#9fb4d4');
  // 小短腿（前倾迈开）
  blob(c, ellipse(18, 66, 7, 4), '#e8eef8', '#9fb0cc', 2, 1.2);
  blob(c, ellipse(36, 62, 7, 4), '#e8eef8', '#9fb0cc', 2, 1.2);
  // 白毛披风小身子，向左前倾，披风向后飘
  blob(c, (k) => { k.moveTo(14, 36); k.quadraticCurveTo(10, 62, 26, 66); k.lineTo(44, 64); k.quadraticCurveTo(54, 60, 50, 44); k.quadraticCurveTo(48, 34, 38, 30); }, '#f4f8ff', '#9fb0cc', 2.8, 3.2);
  // 披风毛边
  for (let i = 0; i < 5; i++) blob(c, circle(18 + i * 7, 64 - (i % 2) * 2, 4.4), '#f4f8ff', null, 1.8);
  // 圆脑袋
  blob(c, circle(24, 26, 17), '#f4f8ff', '#9fb0cc', 2.8, 3);
  blob(c, (k) => { k.moveTo(8, 22); k.quadraticCurveTo(12, 6, 26, 6); k.quadraticCurveTo(40, 8, 42, 22); k.quadraticCurveTo(34, 14, 24, 16); k.quadraticCurveTo(14, 14, 8, 22); }, '#d8e2f2', null, 2);
  // 黑色眼窝 + 红脸颊
  dab(c, ellipse(17, 27, 4.4, 5.4), INK);
  dab(c, ellipse(31, 27, 4.4, 5.4), INK);
  dab(c, circle(18.6, 25.4, 1.1), '#e8f0ff');
  dab(c, circle(32.6, 25.4, 1.1), '#e8f0ff');
  dab(c, circle(10, 34, 4), '#ff5a5a', 0.85);
  dab(c, circle(38, 34, 4), '#ff5a5a', 0.85);
  blob(c, (k) => { k.moveTo(20, 36); k.quadraticCurveTo(24, 41, 28, 36); k.quadraticCurveTo(24, 38, 20, 36); }, '#7a2630', null, 1.4);
  // 前伸的小手
  blob(c, circle(8, 48, 4.6), '#f4f8ff', '#9fb0cc', 2, 1);
}

function xuetongeyes(c: Ctx): void {
  dab(c, ellipse(22, 22, 20, 3), INK, 0.2);
  blob(c, (k) => { k.moveTo(2, 22); k.quadraticCurveTo(4, 6, 22, 5); k.quadraticCurveTo(40, 6, 42, 22); k.quadraticCurveTo(22, 25, 2, 22); }, '#f6f9ff', '#a9bad6', 2.2, 2.4);
  dab(c, ellipse(14, 12, 6, 2), WHITE, 0.9);
  dab(c, ellipse(14, 14.4, 3.2, 3.8), INK);
  dab(c, ellipse(30, 14.4, 3.2, 3.8), INK);
  dab(c, circle(15, 13, 0.9), '#cfe0ff');
  dab(c, circle(31, 13, 0.9), '#cfe0ff');
}

// ───────────────────────── 棺钉鬼、棺材、棺钉 ─────────────────────────
const SHROUD = '#7d9a98';
const SHROUD_SH = '#4f6d6d';
const WOOD = '#3a2a24';
const WOOD_SH = '#241914';
const WOOD_LT = '#5a4034';

function nailShape(c: Ctx, x: number, y: number, len: number, w: number): void {
  blob(c, poly(x, y, x + len, y + w * 0.3, x + len, y - w * 0.3), '#4a4650', '#2c2a30', 1.4, 1);
  blob(c, ellipse(x, y, w * 0.5, w * 0.9), '#6a4a42', '#3c2a26', 1.4, 1);
}

function guandingui(c: Ctx): void {
  ground(c, 28, 70, 24);
  // 棺沿（前半截）
  blob(c, (k) => { k.moveTo(2, 56); k.lineTo(54, 56); k.lineTo(52, 71); k.lineTo(4, 71); }, WOOD, WOOD_SH, 2.4, 2.6);
  dab(c, rrect(8, 60, 40, 2, 1), WOOD_LT, 0.7);
  // 僵直的身子：寿衣青灰
  blob(c, (k) => { k.moveTo(14, 58); k.lineTo(16, 30); k.quadraticCurveTo(28, 24, 40, 30); k.lineTo(42, 58); }, SHROUD, SHROUD_SH, 2.6, 3);
  stroke(c, (k) => { k.moveTo(28, 30); k.lineTo(28, 58); }, 1.6, SHROUD_SH);
  stroke(c, (k) => { k.moveTo(18, 40); k.lineTo(38, 44); }, 1.6, SHROUD_SH);
  // 僵直前伸的手臂，一手捏着棺钉
  stroke(c, (k) => { k.moveTo(40, 34); k.lineTo(52, 36); }, 8, INK);
  stroke(c, (k) => { k.moveTo(40, 34); k.lineTo(52, 36); }, 5, SHROUD);
  blob(c, circle(53, 36, 4.2), '#a9bdb4', '#7a948a', 1.8, 1);
  nailShape(c, 49, 34, 10, 5);
  stroke(c, (k) => { k.moveTo(16, 34); k.lineTo(6, 40); }, 8, INK);
  stroke(c, (k) => { k.moveTo(16, 34); k.lineTo(6, 40); }, 5, SHROUD);
  blob(c, circle(5, 41, 4), '#a9bdb4', '#7a948a', 1.8, 1);
  // 头：青白尸脸，眼眶发黑
  blob(c, circle(28, 18, 14), '#b4cbc2', '#80998f', 2.6, 2.6);
  dab(c, ellipse(22.5, 19, 3.2, 3.6), INK);
  dab(c, ellipse(33.5, 19, 3.2, 3.6), INK);
  dab(c, circle(23, 18.6, 0.9), '#ff5a4a');
  dab(c, circle(34, 18.6, 0.9), '#ff5a4a');
  stroke(c, (k) => { k.moveTo(23, 27); k.lineTo(33, 27); }, 1.6);
  for (const x of [25, 28, 31]) stroke(c, (k) => { k.moveTo(x, 26); k.lineTo(x, 28.4); }, 1);
  // 额头符纸：黄底红字
  blob(c, rrect(23, 2, 10, 16, 1), '#f2d85a', '#c9a830', 1.6, 1);
  stroke(c, (k) => { k.moveTo(26, 6); k.lineTo(30, 6); k.moveTo(28, 6); k.lineTo(28, 15); k.moveTo(25.6, 10); k.lineTo(30.4, 10); }, 1.1, '#c0262c');
  // 帽子：黑色瓜皮帽
  blob(c, (k) => { k.moveTo(15, 12); k.quadraticCurveTo(28, -6, 41, 12); k.quadraticCurveTo(28, 8, 15, 12); }, '#2c2a36', null, 2);
}

function coffinBody(c: Ctx): void {
  // 前立面 + 盖面（微透视），黑木
  blob(c, (k) => { k.moveTo(6, 22); k.lineTo(70, 22); k.lineTo(68, 44); k.lineTo(8, 44); }, WOOD, WOOD_SH, 2.6, 3);
  dab(c, rrect(10, 26, 54, 2, 1), WOOD_LT, 0.6);
  for (const x of [20, 38, 56]) { dab(c, circle(x, 36, 1.6), '#8a8088'); stroke(c, (k) => { k.moveTo(x, 22); k.lineTo(x, 44); }, 1.2, WOOD_SH); }
  // 铁箍
  stroke(c, (k) => { k.moveTo(29, 22); k.lineTo(28, 44); k.moveTo(47, 22); k.lineTo(48, 44); }, 2.6, '#6a6068');
}

function coffin(c: Ctx): void {
  ground(c, 38, 44, 36);
  coffinBody(c);
  // 盖板：盖严，梯形盖面
  blob(c, (k) => { k.moveTo(2, 24); k.lineTo(10, 3); k.lineTo(66, 3); k.lineTo(74, 24); k.closePath(); }, WOOD_LT, '#3a2a24', 2.6, 3);
  dab(c, rrect(14, 7, 48, 2, 1), '#7a5a4a', 0.7);
  // 盖面上的钉子
  for (const x of [14, 28, 38, 48, 62]) {
    blob(c, circle(x, 14, 2.4), '#8a8088', '#4c4650', 1.4, 0.8);
  }
  blob(c, circle(38, 14, 3), '#b04a3a', null, 1.4);
}

function coffinopen(c: Ctx): void {
  ground(c, 38, 44, 36);
  // 开口：黑洞洞
  blob(c, (k) => { k.moveTo(2, 24); k.lineTo(10, 3); k.lineTo(66, 3); k.lineTo(74, 24); k.closePath(); }, '#0c080a', null, 2.6);
  dab(c, ellipse(38, 14, 22, 6), '#1b1416');
  dab(c, ellipse(30, 11, 10, 2.2), '#2c2024', 0.8);
  coffinBody(c);
  // 盖板：斜斜翻开搭在右后，露出板底
  blob(c, (k) => { k.moveTo(48, 6); k.lineTo(74, 0); k.lineTo(75, 26); k.lineTo(52, 30); k.closePath(); }, WOOD_LT, WOOD_SH, 2.6, 3);
  dab(c, rrect(54, 6, 18, 2, 1), '#7a5a4a', 0.6);
  for (const y of [8, 22]) blob(c, circle(70, y, 2), '#8a8088', null, 1.2);
}

function nail(c: Ctx): void {
  // 头朝右：圆钉帽 + 向左收尖的钉身，带点锈红
  blob(c, poly(2, 6, 24, 3.4, 24, 8.6), '#55505c', '#2c2a30', 1.6, 1.2);
  blob(c, (k) => { k.moveTo(24, 6); k.ellipse(26, 6, 3, 5, 0, 0, Math.PI * 2); }, '#7a4a42', '#4a2c28', 1.6, 1);
  dab(c, poly(6, 5.4, 22, 4.4, 22, 5.6), '#9a9aa4', 0.8);
  dab(c, circle(15, 7, 1.4), '#b04a3a', 0.8);
  dab(c, circle(9, 6.4, 1), '#b04a3a', 0.7);
}

// ───────────────────────── 红衣戏子 ─────────────────────────
const RED = '#e0222e';
const RED_SH = '#9a1220';
const OPERA_GOLD = '#f2c444';

function hongyi(c: Ctx): void {
  ground(c, 50, 124, 34);
  // 水袖（后层）：长长飘开
  for (const s of [-1, 1]) {
    blob(c, (k) => { k.moveTo(50 + s * 14, 54); k.quadraticCurveTo(50 + s * 52, 40, 50 + s * 48, 82); k.quadraticCurveTo(50 + s * 44, 106, 50 + s * 30, 112); k.quadraticCurveTo(50 + s * 38, 84, 50 + s * 24, 70); }, '#ff5a62', '#c01e30', 2.6, 3);
    stroke(c, (k) => { k.moveTo(50 + s * 49, 82); k.quadraticCurveTo(50 + s * 44, 104, 50 + s * 31, 111); }, 2.4, OPERA_GOLD);
  }
  // 戏服：大红，金边
  blob(c, (k) => { k.moveTo(34, 52); k.quadraticCurveTo(22, 94, 24, 122); k.lineTo(40, 116); k.lineTo(50, 126); k.lineTo(60, 116); k.lineTo(76, 122); k.quadraticCurveTo(78, 94, 66, 52); k.quadraticCurveTo(50, 46, 34, 52); }, RED, RED_SH, 2.8, 4);
  stroke(c, (k) => { k.moveTo(34, 52); k.quadraticCurveTo(22, 94, 24, 122); k.lineTo(40, 116); k.lineTo(50, 126); k.lineTo(60, 116); k.lineTo(76, 122); k.quadraticCurveTo(78, 94, 66, 52); }, 1.8, OPERA_GOLD);
  // 金色腰封与领口花纹
  blob(c, rrect(32, 76, 36, 8, 3), OPERA_GOLD, '#b88a24', 2, 1.4);
  stroke(c, (k) => { k.moveTo(40, 54); k.lineTo(50, 70); k.lineTo(60, 54); }, 3, OPERA_GOLD);
  for (const [x, y] of [[40, 98], [60, 98], [50, 108]] as const) dab(c, circle(x, y, 2.6), OPERA_GOLD);
  // 脸：白脸红妆
  blob(c, ellipse(50, 34, 15, 18), '#fff4ec', '#e0c0b8', 2.6, 2.2);
  stroke(c, (k) => { k.moveTo(36, 30); k.quadraticCurveTo(42, 22, 48, 29); }, 3, RED);
  stroke(c, (k) => { k.moveTo(64, 30); k.quadraticCurveTo(58, 22, 52, 29); }, 3, RED);
  dab(c, ellipse(42, 33, 3.6, 2.2), INK);
  dab(c, ellipse(58, 33, 3.6, 2.2), INK);
  dab(c, circle(42.6, 32.6, 0.9), WHITE);
  dab(c, circle(58.6, 32.6, 0.9), WHITE);
  dab(c, circle(37, 41, 4), RED, 0.7);
  dab(c, circle(63, 41, 4), RED, 0.7);
  blob(c, (k) => { k.moveTo(45, 44); k.quadraticCurveTo(50, 41, 55, 44); k.quadraticCurveTo(50, 49, 45, 44); }, RED, null, 1.4);
  // 乌黑的发髻与头饰
  blob(c, (k) => { k.moveTo(34, 34); k.quadraticCurveTo(32, 10, 50, 9); k.quadraticCurveTo(68, 10, 66, 34); k.quadraticCurveTo(62, 20, 50, 20); k.quadraticCurveTo(38, 20, 34, 34); }, '#241830', null, 2.2);
  blob(c, (k) => { k.moveTo(32, 18); k.quadraticCurveTo(50, -6, 68, 18); k.quadraticCurveTo(50, 6, 32, 18); }, OPERA_GOLD, '#b88a24', 2.2, 1.4);
  for (const [x, y] of [[40, 8], [50, 4], [60, 8]] as const) {
    blob(c, circle(x, y, 3.4), RED, RED_SH, 1.6, 1);
    dab(c, circle(x, y, 1.2), OPERA_GOLD);
  }
  // 两侧垂下的珠串
  for (const s of [-1, 1]) {
    stroke(c, (k) => { k.moveTo(50 + s * 18, 14); k.lineTo(50 + s * 20, 38); }, 1.4, OPERA_GOLD);
    dab(c, circle(50 + s * 20, 39, 2.4), RED);
  }
}

// ───────────────────────── 戏班鬼影 ─────────────────────────
const SPEC = '#a89cc8';
const SPEC_SH = '#6c6296';

function troupe(c: Ctx): void {
  c.save();
  c.globalAlpha = 0.92;
  ground(c, 28, 70, 18);
  // 飘着的下摆（没有脚）
  blob(c, (k) => { k.moveTo(12, 38); k.quadraticCurveTo(8, 60, 10, 68); k.lineTo(18, 62); k.lineTo(24, 71); k.lineTo(31, 62); k.lineTo(38, 70); k.lineTo(44, 62); k.quadraticCurveTo(48, 56, 44, 38); k.quadraticCurveTo(28, 32, 12, 38); }, SPEC, SPEC_SH, 2.6, 3);
  dab(c, ellipse(26, 52, 8, 10), '#d8d0f0', 0.5);
  // 小手 + 小锣
  stroke(c, (k) => { k.moveTo(40, 44); k.lineTo(48, 50); }, 7, INK);
  stroke(c, (k) => { k.moveTo(40, 44); k.lineTo(48, 50); }, 4.2, SPEC);
  blob(c, circle(48, 54, 7.4), '#e6c24a', '#a8842a', 2.2, 1.6);
  dab(c, circle(48, 54, 3.2), '#f8e68a');
  stroke(c, (k) => { k.moveTo(48, 46); k.lineTo(48, 42); }, 1.2);
  // 头
  blob(c, circle(26, 24, 15), '#d8d0ec', '#9a90c0', 2.6, 2.6);
  dab(c, ellipse(20.5, 25, 2.8, 3.6), INK);
  dab(c, ellipse(31.5, 25, 2.8, 3.6), INK);
  dab(c, circle(21, 24, 0.8), '#c8f0ff');
  dab(c, circle(32, 24, 0.8), '#c8f0ff');
  dab(c, circle(16, 31, 2.8), '#d86aa0', 0.6);
  dab(c, circle(36, 31, 2.8), '#d86aa0', 0.6);
  blob(c, (k) => { k.moveTo(21, 33); k.quadraticCurveTo(26, 38, 31, 33); k.quadraticCurveTo(26, 35, 21, 33); }, '#4a3a68', null, 1.4);
  // 戏帽：小乌纱帽，两翅
  blob(c, (k) => { k.moveTo(12, 16); k.quadraticCurveTo(14, 0, 26, 0); k.quadraticCurveTo(38, 0, 40, 16); k.closePath(); }, '#3c3052', '#251c38', 2.2, 2);
  blob(c, ellipse(6, 11, 6, 2.6, -0.2), '#3c3052', null, 1.8);
  blob(c, ellipse(46, 11, 6, 2.6, 0.2), '#3c3052', null, 1.8);
  dab(c, circle(26, 8, 2.6), '#e6c24a');
  c.restore();
}

// ───────────────────────── 硕鼠将军、鼠妖 ─────────────────────────
const RAT = '#9a8272';
const RAT_SH = '#6a5646';
const RAT_LT = '#c8b09c';

function ratHead(c: Ctx, cx: number, cy: number, s: number, eyeColor = INK): void {
  // 耳、头、尖嘴、大门牙
  blob(c, circle(cx - 17 * s, cy - 14 * s, 9 * s), RAT, RAT_SH, 2.2, 1.6);
  blob(c, circle(cx + 3 * s, cy - 16 * s, 9 * s), RAT, RAT_SH, 2.2, 1.6);
  dab(c, circle(cx - 17 * s, cy - 14 * s, 5 * s), '#e4a8a0');
  dab(c, circle(cx + 3 * s, cy - 16 * s, 5 * s), '#e4a8a0');
  blob(c, (k) => { k.moveTo(cx - 24 * s, cy - 2 * s); k.quadraticCurveTo(cx - 14 * s, cy - 24 * s, cx + 4 * s, cy - 8 * s); k.quadraticCurveTo(cx + 6 * s, cy + 6 * s, cx - 24 * s, cy + 6 * s); }, RAT, RAT_SH, 2.6, 2.4);
  // 鼻、眼、须
  blob(c, circle(cx - 25 * s, cy + 1 * s, 3.4 * s), '#e08a8a', null, 1.6);
  dab(c, circle(cx - 8 * s, cy - 6 * s, 3 * s), WHITE);
  dab(c, circle(cx - 8.4 * s, cy - 6 * s, 2 * s), eyeColor);
  for (const dy of [-1, 3]) stroke(c, (k) => { k.moveTo(cx - 24 * s, cy + dy * s); k.lineTo(cx - 36 * s, cy + (dy - 3) * s); }, 1 * s, INK);
  blob(c, rrect(cx - 22 * s, cy + 5 * s, 4 * s, 7 * s, 1), WHITE, null, 1.4);
  blob(c, rrect(cx - 17.4 * s, cy + 5 * s, 4 * s, 7 * s, 1), WHITE, null, 1.4);
}

function shuoshu(c: Ctx): void {
  ground(c, 62, 106, 50);
  // 长尾
  stroke(c, (k) => { k.moveTo(96, 92); k.quadraticCurveTo(122, 90, 118, 62); }, 7, INK);
  stroke(c, (k) => { k.moveTo(96, 92); k.quadraticCurveTo(122, 90, 118, 62); }, 3.6, '#d9a09a');
  // 肥硕的肚子 + 铠甲
  blob(c, ellipse(66, 74, 38, 32), RAT, RAT_SH, 2.8, 4);
  dab(c, ellipse(60, 80, 22, 18), RAT_LT, 0.7);
  blob(c, (k) => { k.moveTo(38, 66); k.quadraticCurveTo(66, 56, 94, 66); k.lineTo(92, 96); k.quadraticCurveTo(66, 106, 40, 96); }, '#8c4a3a', '#5a2c24', 2.6, 3.4);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) blob(c, circle(46 + i * 12 + (r % 2) * 6, 74 + r * 9, 5.4), '#c9a45a', '#8a6a2a', 1.6, 1);
  blob(c, rrect(38, 90, 56, 6, 3), '#2f2a38', null, 1.8);
  dab(c, rrect(60, 90, 10, 6, 1), '#e6c24a');
  // 脚
  blob(c, ellipse(44, 104, 12, 5), RAT, RAT_SH, 2.2, 1.4);
  blob(c, ellipse(84, 104, 12, 5), RAT, RAT_SH, 2.2, 1.4);
  // 长刀与小旗（右手握杆，旗在杆顶）
  stroke(c, (k) => { k.moveTo(100, 100); k.lineTo(100, 8); }, 5.4, INK);
  stroke(c, (k) => { k.moveTo(100, 100); k.lineTo(100, 8); }, 2.6, '#6a4a2a');
  blob(c, (k) => { k.moveTo(100, 10); k.lineTo(124, 14); k.lineTo(116, 24); k.lineTo(124, 34); k.lineTo(100, 34); }, '#d8302e', '#8e1a22', 2.2, 1.6);
  dab(c, circle(109, 22, 3.6), '#f2c444');
  blob(c, poly(98, 8, 100, -2, 102, 8), '#c8ccd4', null, 1.6);
  blob(c, circle(100, 70, 6), RAT, RAT_SH, 2, 1.2);
  // 另一只手叉腰
  blob(c, circle(36, 74, 6), RAT, RAT_SH, 2, 1.2);
  // 头：偏左，带将军盔
  ratHead(c, 56, 44, 1.2);
  blob(c, (k) => { k.moveTo(34, 38); k.quadraticCurveTo(40, 8, 62, 12); k.quadraticCurveTo(76, 16, 74, 34); k.quadraticCurveTo(54, 24, 34, 38); }, '#6a7080', '#444a58', 2.6, 2.4);
  blob(c, poly(54, 14, 58, 0, 62, 14), '#d8302e', null, 1.8);
  stroke(c, (k) => { k.moveTo(36, 36); k.quadraticCurveTo(54, 26, 74, 34); }, 2.4, '#e6c24a');
}

function ratdemon(c: Ctx): void {
  const G = '#8a8690';
  const G_SH = '#5a5660';
  dab(c, ellipse(22, 33, 18, 2.6), INK, 0.25);
  // 长尾翘在身后
  stroke(c, (k) => { k.moveTo(34, 24); k.quadraticCurveTo(46, 30, 44, 10); }, 4.6, INK);
  stroke(c, (k) => { k.moveTo(34, 24); k.quadraticCurveTo(46, 30, 44, 10); }, 2, '#d99a9a');
  // 奔跑：身子压低，四肢前后摆
  blob(c, ellipse(26, 22, 14, 8.6, -0.1), G, G_SH, 2.4, 2.4);
  for (const [x, y, r] of [[12, 30, -0.5], [36, 30, 0.5], [18, 31, 0.2], [30, 31, -0.2]] as const) blob(c, ellipse(x, y, 5, 2.6, r), G, G_SH, 1.8, 1);
  // 头：尖脸朝左，红眼
  blob(c, (k) => { k.moveTo(14, 18); k.quadraticCurveTo(6, 22, 1, 22); k.quadraticCurveTo(8, 28, 16, 28); k.quadraticCurveTo(20, 20, 14, 18); }, G, G_SH, 2.2, 1.6);
  blob(c, circle(16, 14, 5.4), G, G_SH, 2, 1.2);
  dab(c, circle(16, 14, 2.8), '#f2a0a0');
  dab(c, circle(10.4, 21, 2.4), '#ff2a3a');
  dab(c, circle(10.4, 21, 1), INK);
  dab(c, circle(1.8, 22.4, 1.6), '#e08a8a');
  blob(c, rrect(4, 24.4, 2.4, 3.6, 0.6), WHITE, null, 1.1);
  // 速度线
  for (const y of [14, 24]) stroke(c, (k) => { k.moveTo(40, y); k.lineTo(46, y); }, 1.2, '#7a7480');
}

// ───────────────────────── 米山、戏台、粮仓 ─────────────────────────
function ricepile(c: Ctx): void {
  dab(c, ellipse(48, 58, 44, 4), INK, 0.25);
  blob(c, (k) => { k.moveTo(4, 58); k.quadraticCurveTo(14, 34, 34, 22); k.quadraticCurveTo(48, 12, 62, 22); k.quadraticCurveTo(82, 34, 92, 58); k.quadraticCurveTo(48, 64, 4, 58); }, '#ebdcb4', '#bca978', 2.8, 4);
  dab(c, ellipse(40, 32, 14, 6, -0.4), '#fff6dc', 0.8);
  // 米粒纹理
  for (const [x, y, r] of [[30, 46, 0.4], [48, 40, -0.5], [60, 50, 0.3], [72, 44, -0.2], [22, 54, 0.1], [44, 54, 0.6]] as const) dab(c, ellipse(x, y, 2.6, 1.2, r), '#fffaf0', 0.9);
  // 滚落的几粒
  for (const [x, y, r] of [[2, 60, 0.3], [94, 60, -0.3], [88, 56, 0.5]] as const) blob(c, ellipse(x, y, 2.6, 1.4, r), '#fffaf0', null, 1);
  // 插着的草
  stroke(c, (k) => { k.moveTo(52, 22); k.lineTo(54, 4); }, 3.2, INK);
  stroke(c, (k) => { k.moveTo(52, 22); k.lineTo(54, 4); }, 1.4, '#c8b04a');
  blob(c, (k) => { k.moveTo(54, 6); k.quadraticCurveTo(66, 2, 72, 12); k.quadraticCurveTo(62, 8, 54, 10); }, '#9bc04a', '#6a8a30', 1.6, 1);
  blob(c, (k) => { k.moveTo(54, 8); k.quadraticCurveTo(44, 2, 38, 10); k.quadraticCurveTo(46, 8, 54, 11); }, '#9bc04a', '#6a8a30', 1.6, 1);
}

function stage(c: Ctx): void {
  const R = '#c8222c';
  const R_SH = '#8a141e';
  ground(c, 110, 142, 100);
  // 台基：木台 + 台阶
  blob(c, (k) => { k.moveTo(14, 118); k.lineTo(206, 118); k.lineTo(210, 142); k.lineTo(10, 142); }, '#8a5a3a', '#5a3822', 2.8, 3.4);
  for (const x of [50, 90, 130, 170]) stroke(c, (k) => { k.moveTo(x, 118); k.lineTo(x - 2, 142); }, 1.6, '#4a2e1c');
  blob(c, rrect(96, 128, 28, 14, 1), '#a8744a', '#6a4428', 2, 1.4);
  // 后墙（幕布后）
  blob(c, rrect(30, 54, 160, 64, 2), '#2c1a2a', null, 2.4);
  // 红幕布：左右拉开，中间露出暗处
  for (const s of [-1, 1]) {
    blob(c, (k) => { k.moveTo(110 + s * 72, 52); k.lineTo(110 + s * 10, 52); k.quadraticCurveTo(110 + s * 32, 84, 110 + s * 22, 118); k.lineTo(110 + s * 72, 118); }, R, R_SH, 2.4, 3);
    for (const dx of [26, 44, 60]) stroke(c, (k) => { k.moveTo(110 + s * dx, 54); k.quadraticCurveTo(110 + s * (dx - 4), 86, 110 + s * (dx - 6), 116); }, 1.4, R_SH);
  }
  dab(c, ellipse(110, 96, 12, 18), '#5a3a52', 0.5);
  stroke(c, (k) => { k.moveTo(38, 54); k.lineTo(182, 54); }, 4, '#f2c444');
  // 红柱 + 柱础
  for (const x of [24, 196]) {
    blob(c, rrect(x - 8, 40, 16, 80, 2), R, R_SH, 2.6, 3);
    blob(c, rrect(x - 11, 112, 22, 10, 2), '#a8a090', '#74705e', 2, 1.4);
  }
  // 飞檐屋顶：深色瓦顶，两端上翘
  blob(c, (k) => { k.moveTo(0, 36); k.quadraticCurveTo(14, 34, 30, 20); k.lineTo(190, 20); k.quadraticCurveTo(206, 34, 220, 36); k.quadraticCurveTo(200, 46, 188, 42); k.lineTo(32, 42); k.quadraticCurveTo(20, 46, 0, 36); }, '#3c4a5c', '#222c3a', 2.8, 3.4);
  for (let x = 40; x < 190; x += 14) stroke(c, (k) => { k.moveTo(x, 22); k.lineTo(x - 2, 40); }, 1.4, '#222c3a');
  blob(c, (k) => { k.moveTo(60, 20); k.lineTo(75, 4); k.lineTo(145, 4); k.lineTo(160, 20); }, '#46566a', '#2a3444', 2.6, 3);
  blob(c, rrect(94, 8, 32, 10, 2), '#f2c444', '#b88a24', 1.8, 1);
  blob(c, poly(66, 4, 70, -2 + 2, 76, 4), '#3c4a5c', null, 1.8);
  // 屋檐下的横梁
  blob(c, rrect(16, 42, 188, 8, 2), '#a8742a', '#6a4418', 2, 1.6);
  // 台口两盏灯笼
  for (const x of [48, 172]) {
    stroke(c, (k) => { k.moveTo(x, 50); k.lineTo(x, 62); }, 1.6);
    dab(c, circle(x, 78, 20), '#ffb43a', 0.22);
    blob(c, ellipse(x, 78, 11, 14), '#e8352e', '#a01c22', 2.4, 2.4);
    dab(c, ellipse(x - 3, 74, 3, 6), '#ff9a6a', 0.6);
    blob(c, rrect(x - 6, 62, 12, 4, 1), '#f2c444', null, 1.6);
    blob(c, rrect(x - 6, 90, 12, 4, 1), '#f2c444', null, 1.6);
    stroke(c, (k) => { k.moveTo(x, 94); k.lineTo(x, 104); }, 2, '#f2c444');
  }
}

function granary(c: Ctx): void {
  ground(c, 70, 106, 64);
  // 夯土厚墙
  blob(c, (k) => { k.moveTo(24, 106); k.lineTo(30, 44); k.lineTo(110, 44); k.lineTo(116, 106); }, '#b8905a', '#8a6a3c', 2.8, 4);
  for (const [x, y, w] of [[36, 60, 26], [70, 70, 22], [44, 90, 24], [84, 96, 18]] as const) stroke(c, (k) => { k.moveTo(x, y); k.lineTo(x + w, y); }, 1.6, '#8a6a3c');
  dab(c, rrect(34, 48, 6, 54, 2), '#d8b27a', 0.5);
  // 尖顶茅草
  blob(c, (k) => { k.moveTo(14, 52); k.lineTo(70, 4); k.lineTo(126, 52); k.quadraticCurveTo(70, 58, 14, 52); }, '#d8b44a', '#a07e22', 2.8, 4);
  for (let i = 0; i < 6; i++) stroke(c, (k) => { k.moveTo(70, 8); k.lineTo(26 + i * 18, 52); }, 1.2, '#a07e22');
  blob(c, poly(68, 6, 70, -3, 72, 6), '#8a6a2a', null, 1.4);
  // 小门
  blob(c, (k) => { k.moveTo(86, 106); k.lineTo(86, 78); k.quadraticCurveTo(98, 68, 108, 78); k.lineTo(108, 104); }, '#5a3a24', '#3a2416', 2.4, 2);
  dab(c, circle(103, 92, 1.6), '#e6c24a');
  // 墙上的「粮」字：红底方块
  blob(c, rrect(38, 56, 34, 34, 3), '#c8222c', '#8a141e', 2.2, 1.6);
  c.save();
  c.font = '900 26px "Songti SC", "Noto Serif CJK SC", "SimSun", serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#fff2c8';
  c.fillText('粮', 55, 74);
  c.restore();
  // 旁边几个麻袋
  for (const [x, y, s] of [[14, 104, 1], [38, 108, 0.9], [26, 90, 0.9]] as const) {
    blob(c, (k) => { k.moveTo(x - 10 * s, y); k.quadraticCurveTo(x - 14 * s, y - 14 * s, x - 6 * s, y - 24 * s); k.lineTo(x + 6 * s, y - 24 * s); k.quadraticCurveTo(x + 14 * s, y - 14 * s, x + 10 * s, y); k.closePath(); }, '#e0cc98', '#b09c68', 2.2, 2);
    stroke(c, (k) => { k.moveTo(x - 6 * s, y - 20 * s); k.lineTo(x + 6 * s, y - 20 * s); }, 2, '#8a6a3c');
  }
}

// ───────────────────────── 纸弩手、催命鬼（规则 55，河滩、荒庙） ─────────────────────────
const PAPER = '#efe4c8';
const PAPER_SH = '#b9a97e';

/** 纸弩手：糊纸的小人，侧身端着一把木弩往右前方瞄；画朝右 */
function crossbow(c: Ctx): void {
  ground(c, 28, 70, 18);
  // 纸袍下摆（两道折）
  blob(c, (k) => { k.moveTo(14, 38); k.lineTo(10, 68); k.lineTo(24, 64); k.lineTo(32, 70); k.lineTo(42, 64); k.lineTo(40, 38); k.quadraticCurveTo(27, 32, 14, 38); }, PAPER, PAPER_SH, 2.6, 3);
  stroke(c, (k) => { k.moveTo(27, 40); k.lineTo(27, 64); }, 1.4, PAPER_SH);
  // 红腰带
  blob(c, rrect(13, 47, 28, 5, 2), '#c8412e', '#8a2a1e', 1.8, 1);
  // 弩：木臂横着，弩弓向外弯，一支箭搭在上面
  stroke(c, (k) => { k.moveTo(24, 44); k.lineTo(52, 40); }, 7, INK);
  stroke(c, (k) => { k.moveTo(24, 44); k.lineTo(52, 40); }, 4, '#8a5a3a');
  stroke(c, (k) => { k.moveTo(44, 30); k.quadraticCurveTo(52, 41, 46, 52); }, 5, INK);
  stroke(c, (k) => { k.moveTo(44, 30); k.quadraticCurveTo(52, 41, 46, 52); }, 2.6, '#6a4228');
  stroke(c, (k) => { k.moveTo(44, 30); k.lineTo(37, 41); k.lineTo(46, 52); }, 1.2, '#f4ecd8');
  stroke(c, (k) => { k.moveTo(30, 42); k.lineTo(55, 40); }, 2, '#4a4650');
  blob(c, poly(55, 37, 60, 40, 55, 43), '#9aa4b0', '#4a4650', 1.4, 0.6);
  // 手
  blob(c, circle(26, 45, 4.4), PAPER, PAPER_SH, 1.8, 1);
  // 头：纸糊的圆脸，眯眼瞄准，腮红
  blob(c, circle(26, 24, 15), PAPER, PAPER_SH, 2.6, 2.6);
  stroke(c, (k) => { k.moveTo(27, 23); k.lineTo(36, 23); }, 2.2);
  dab(c, circle(32, 23, 1.4), '#ff5a4a');
  dab(c, circle(16, 30, 3), '#e06a5a', 0.7);
  dab(c, circle(35, 31, 3), '#e06a5a', 0.7);
  blob(c, (k) => { k.moveTo(21, 33); k.quadraticCurveTo(26, 36, 31, 33); k.quadraticCurveTo(26, 34.4, 21, 33); }, '#7a2630', null, 1.2);
  // 尖斗笠
  blob(c, (k) => { k.moveTo(6, 16); k.lineTo(26, 0); k.lineTo(46, 16); k.quadraticCurveTo(26, 12, 6, 16); }, '#c8a050', '#8a6c2c', 2.4, 2);
}

/** 催命鬼：矮胖的纸扎小鬼，抱着一只沙漏；rage 时通身发红、眼冒火（主角站着不动超过两秒） */
function hurrierDraw(c: Ctx, rage: boolean): void {
  const body = rage ? '#f06a52' : PAPER;
  const sh = rage ? '#a8321f' : PAPER_SH;
  ground(c, 28, 70, 18);
  // 小短腿，奔跑时迈开
  blob(c, ellipse(18, 67, 6, 3.6), body, sh, 2, 1.2);
  blob(c, ellipse(36, 65, 6, 3.6), body, sh, 2, 1.2);
  // 圆滚滚的纸身子
  blob(c, ellipse(27, 48, 17, 19), body, sh, 2.8, 3);
  // 沙漏：两个三角，上头一点沙
  blob(c, (k) => { k.moveTo(20, 40); k.lineTo(34, 40); k.lineTo(29, 50); k.lineTo(34, 60); k.lineTo(20, 60); k.lineTo(25, 50); }, '#f4ecd8', '#b8a880', 1.8, 1);
  dab(c, (k) => { k.moveTo(23, 58); k.lineTo(31, 58); k.lineTo(27, 52); }, rage ? '#d8321f' : '#c89a3a');
  stroke(c, (k) => { k.moveTo(19, 40); k.lineTo(35, 40); }, 2.6, INK);
  stroke(c, (k) => { k.moveTo(19, 60); k.lineTo(35, 60); }, 2.6, INK);
  // 小手抱着沙漏
  blob(c, circle(13, 48, 4.4), body, sh, 1.8, 1);
  blob(c, circle(41, 48, 4.4), body, sh, 1.8, 1);
  // 头：尖耳朵，眉毛倒竖
  blob(c, (k) => { k.moveTo(10, 18); k.lineTo(6, 4); k.lineTo(18, 10); k.closePath(); }, body, sh, 2, 1);
  blob(c, (k) => { k.moveTo(44, 18); k.lineTo(48, 4); k.lineTo(36, 10); k.closePath(); }, body, sh, 2, 1);
  blob(c, circle(27, 22, 15), body, sh, 2.6, 2.6);
  stroke(c, (k) => { k.moveTo(16, 15); k.lineTo(24, 19); }, 2.4);
  stroke(c, (k) => { k.moveTo(38, 15); k.lineTo(30, 19); }, 2.4);
  dab(c, ellipse(20.5, 24, 3, 3.6), INK);
  dab(c, ellipse(33.5, 24, 3, 3.6), INK);
  dab(c, circle(21, 23.4, 1), rage ? '#ffe04a' : '#fff');
  dab(c, circle(34, 23.4, 1), rage ? '#ffe04a' : '#fff');
  blob(c, (k) => { k.moveTo(20, 31); k.quadraticCurveTo(27, rage ? 40 : 35, 34, 31); k.quadraticCurveTo(27, 32, 20, 31); }, '#7a2630', null, 1.4);
}
function hurrier(c: Ctx): void {
  hurrierDraw(c, false);
}
function hurrierrage(c: Ctx): void {
  hurrierDraw(c, true);
}

export const SPRITES_FOES: SpriteDef[] = [
  { key: 'zhumu', w: 140, h: 150, ox: 0.5, oy: 0.95, draw: zhumu },
  { key: 'shuihou', w: 128, h: 112, ox: 0.5, oy: 0.95, draw: shuihou },
  { key: 'ripple', w: 80, h: 36, ox: 0.5, oy: 0.5, draw: ripple },
  { key: 'binghun', w: 124, h: 150, ox: 0.5, oy: 0.95, draw: binghun },
  { key: 'wumian', w: 140, h: 150, ox: 0.5, oy: 0.95, draw: wumian },
  { key: 'xiaofo', w: 56, h: 66, ox: 0.5, oy: 0.95, draw: xiaofo },
  { key: 'shoot', w: 44, h: 62, ox: 0.5, oy: 1, draw: shoot },
  { key: 'icespike', w: 40, h: 64, ox: 0.5, oy: 1, draw: icespike },
  { key: 'xuetong', w: 56, h: 72, ox: 0.5, oy: 0.95, draw: xuetong },
  { key: 'xuetongeyes', w: 44, h: 26, ox: 0.5, oy: 0.9, draw: xuetongeyes },
  { key: 'guandingui', w: 56, h: 74, ox: 0.5, oy: 0.95, draw: guandingui },
  { key: 'coffin', w: 76, h: 46, ox: 0.5, oy: 0.9, draw: coffin },
  { key: 'coffinopen', w: 76, h: 46, ox: 0.5, oy: 0.9, draw: coffinopen },
  { key: 'nail', w: 32, h: 12, ox: 0.5, oy: 0.5, draw: nail },
  { key: 'hongyi', w: 100, h: 132, ox: 0.5, oy: 0.95, draw: hongyi },
  { key: 'troupe', w: 56, h: 74, ox: 0.5, oy: 0.95, draw: troupe },
  { key: 'shuoshu', w: 124, h: 112, ox: 0.5, oy: 0.95, draw: shuoshu },
  { key: 'ratdemon', w: 46, h: 36, ox: 0.5, oy: 0.95, draw: ratdemon },
  { key: 'ricepile', w: 96, h: 62, ox: 0.5, oy: 0.95, draw: ricepile },
  { key: 'stage', w: 220, h: 150, ox: 0.5, oy: 0.95, draw: stage },
  { key: 'crossbow', w: 62, h: 74, ox: 0.5, oy: 0.95, draw: crossbow },
  { key: 'hurrier', w: 54, h: 74, ox: 0.5, oy: 0.95, draw: hurrier },
  { key: 'hurrierrage', w: 54, h: 74, ox: 0.5, oy: 0.95, draw: hurrierrage },
  { key: 'granary', w: 140, h: 112, ox: 0.5, oy: 0.95, draw: granary },
];
