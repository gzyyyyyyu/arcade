/**
 * 2.0 第一批法器的图标（全部程序画，32×32）：阵旗、勾魂锁、竹篙、长明灯和各自的进化，
 * 三个新被动（令旗、铁链、灯油），十个搭配图标。
 * 场上的特效不用图：旗、锁链、水纹、灯火都画在 Graphics 上（view/game/fx-arms.ts），大小和打到的范围一样。
 * 放在特色怪那张图集（atlas.ts 的 buildMobAtlas）：主图集在渲染倍数 3 时已近 2,048。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const RED = '#d8402f';
const RED_D = '#8a1f1a';
const GOLD = '#f2c94c';
const GOLD_D = '#b88a2a';
const IRON = '#5a6070';
const PAPER = '#f4ecd4';
const BAMBOO = '#7fb04a';
const BAMBOO_D = '#4a7a2a';
const WATER = '#4ab4ff';
const WATER_D = '#1f5fb8';
const FOAM = '#e8f8ff';
const FLAME = '#ffb02e';
const FLAME_D = '#d8601a';

/** 一面小旗：旗杆 (x, y) 起向上 h，旗面朝右 */
function flag(c: Ctx, x: number, y: number, h: number, fill: string, dark: string): void {
  stroke(c, (k) => { k.moveTo(x, y); k.lineTo(x, y - h); }, 2.6);
  stroke(c, (k) => { k.moveTo(x, y); k.lineTo(x, y - h); }, 1.1, '#c9a35a');
  blob(c, (k) => {
    k.moveTo(x + 0.6, y - h);
    k.quadraticCurveTo(x + h * 0.4, y - h - 2, x + h * 0.75, y - h + 1);
    k.quadraticCurveTo(x + h * 0.55, y - h * 0.75, x + h * 0.75, y - h * 0.5);
    k.quadraticCurveTo(x + h * 0.4, y - h * 0.55, x + 0.6, y - h * 0.46);
    k.closePath();
  }, fill, dark, 1.6, 1.4);
}

/** 一个锁链环（椭圆圈），在 (x, y)，朝向 rot */
function link(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, color: string, edge = INK): void {
  stroke(c, (k) => k.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), 4, edge);
  stroke(c, (k) => k.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), 2, color);
}

function iFlag(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#ffe0d4', 0.6);
  // 地上插着，一圈土
  blob(c, ellipse(16, 27, 8, 2.6), '#8a7a6a', '#5a4e44', 1.4, 1);
  flag(c, 14, 27, 22, RED, RED_D);
  c.font = '900 8px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = GOLD;
  c.fillText('阵', 21, 12.5);
}

function iFlagEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#ffd0b8', 0.6);
  // 四面小旗围着一块方阵
  stroke(c, (k) => { k.moveTo(16, 10); k.lineTo(26, 17); k.lineTo(16, 25); k.lineTo(6, 17); k.closePath(); }, 1.6, GOLD_D);
  flag(c, 6, 17, 11, '#3a8fe0', '#1f4f8a');
  flag(c, 26, 17, 11, '#3a9a5a', '#1f5a32');
  flag(c, 16, 10, 10, '#f2c94c', GOLD_D);
  flag(c, 16, 26, 12, RED, RED_D);
}

function iChain(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#dfe3ee', 0.65);
  // 一条斜着的链：黑白环交替，尾端一个钩
  const pts: [number, number][] = [[7, 24], [11, 19.5], [15, 15], [19, 10.5], [23, 6.5]];
  pts.forEach(([x, y], i) => link(c, x, y, 3.8, 2.4, -0.8 + (i % 2) * 1.57, i % 2 ? '#f4f6fb' : IRON));
  stroke(c, (k) => { k.moveTo(23, 6.5); k.quadraticCurveTo(29, 3, 28, 10); k.quadraticCurveTo(27, 13, 24.5, 11.5); }, 3.6);
  stroke(c, (k) => { k.moveTo(23, 6.5); k.quadraticCurveTo(29, 3, 28, 10); k.quadraticCurveTo(27, 13, 24.5, 11.5); }, 1.8, '#c9ced8');
}

function iChainEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#f0e0b0', 0.6);
  // 金边的粗链，围成半圈，索命
  const pts: [number, number][] = [[6, 22], [8, 14], [13, 8.5], [20, 7.5], [25, 12]];
  pts.forEach(([x, y], i) => {
    stroke(c, (k) => k.ellipse(x, y, 4.4, 2.9, i * 0.9, 0, Math.PI * 2), 5, INK);
    stroke(c, (k) => k.ellipse(x, y, 4.4, 2.9, i * 0.9, 0, Math.PI * 2), 3, i % 2 ? GOLD : '#2a2f3a');
  });
  // 链心一只勾魂的钩 + 小魂
  blob(c, (k) => { k.moveTo(26, 14); k.quadraticCurveTo(30, 20, 24, 25); k.quadraticCurveTo(20, 27, 20, 23); k.quadraticCurveTo(24, 22, 25, 19); k.closePath(); }, GOLD, GOLD_D, 1.4, 1);
  blob(c, (k) => { k.moveTo(10, 28); k.quadraticCurveTo(7, 22, 11, 20); k.quadraticCurveTo(15, 22, 12, 28); k.closePath(); }, '#cfeaff', '#8fb8e0', 1.2, 0.8);
}

/** 竹篙：斜插的竹竿，节上一圈深色，底下一圈水纹 */
function pole(c: Ctx, x0: number, y0: number, x1: number, y1: number, wd: number): void {
  stroke(c, (k) => { k.moveTo(x0, y0); k.lineTo(x1, y1); }, wd + 2.6);
  stroke(c, (k) => { k.moveTo(x0, y0); k.lineTo(x1, y1); }, wd, BAMBOO);
  stroke(c, (k) => { k.moveTo(x0 - 0.6, y0 - 0.6); k.lineTo(x1 - 0.6, y1 - 0.6); }, 0.9, '#c9e88a');
  for (const t of [0.25, 0.5, 0.75]) {
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    stroke(c, (k) => { k.moveTo(x - 1.8, y + 1.8); k.lineTo(x + 1.8, y - 1.8); }, 1.4, BAMBOO_D);
  }
}

function iPole(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#d6ecff', 0.6);
  blob(c, ellipse(16, 25, 11, 4), WATER, WATER_D, 1.6, 1.4);
  stroke(c, (k) => k.ellipse(16, 25, 6.5, 2.2, 0, 0, Math.PI * 2), 1.1, FOAM);
  pole(c, 24, 3, 12, 25, 3.2);
  dab(c, circle(8, 22, 1.2), FOAM);
  dab(c, circle(23, 21, 1.1), FOAM);
}

function iPoleEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#9fd0ff', 0.55);
  // 撑船破浪：竹篙压在一道大浪上，浪尖白沫
  blob(c, (k) => {
    k.moveTo(1, 28); k.quadraticCurveTo(4, 17, 14, 15); k.quadraticCurveTo(22, 14, 25, 19);
    k.quadraticCurveTo(21, 18, 19, 21); k.quadraticCurveTo(25, 24, 31, 28); k.closePath();
  }, '#2a8fe8', '#123a7a', 1.8, 1.8);
  blob(c, (k) => { k.moveTo(8, 17.5); k.quadraticCurveTo(14, 13.5, 22, 15.5); k.quadraticCurveTo(15, 16, 11, 20); k.closePath(); }, FOAM, null, 1);
  pole(c, 26, 2, 11, 24, 3.4);
  for (const [x, y] of [[5, 12], [27, 11], [29, 22]] as const) dab(c, circle(x, y, 1.4), FOAM);
}

/** 灯盏：小油灯，灯芯上一朵火 */
function flame(c: Ctx, x: number, y: number, s: number, inner = '#fff3b0'): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  blob(c, (k) => { k.moveTo(0, -11); k.quadraticCurveTo(7, -3, 4, 3); k.quadraticCurveTo(0, 6, -4, 3); k.quadraticCurveTo(-7, -3, 0, -11); k.closePath(); }, FLAME, FLAME_D, 1.5, 1.3);
  dab(c, (k) => { k.moveTo(0, -5); k.quadraticCurveTo(3, -1, 1.8, 2.4); k.quadraticCurveTo(0, 3.6, -1.8, 2.4); k.quadraticCurveTo(-3, -1, 0, -5); }, inner);
  c.restore();
}

function iLamp(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#fff0c8', 0.7);
  dab(c, circle(16, 12, 11), '#ffd96a', 0.35);
  // 灯盏 + 底座
  blob(c, (k) => { k.moveTo(6, 19); k.quadraticCurveTo(16, 31, 26, 19); k.closePath(); }, '#b8803a', '#7a4a20', 1.8, 1.6);
  blob(c, rrect(11, 26, 10, 3.4, 1.4), '#8a5a2a', null, 1.5);
  stroke(c, (k) => { k.moveTo(26, 19); k.quadraticCurveTo(30, 18, 29, 22); }, 1.8);
  stroke(c, (k) => { k.moveTo(16, 19); k.lineTo(16, 16); }, 1.8);
  flame(c, 16, 15, 0.95);
}

function iLampEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#ffe29a', 0.65);
  // 万家灯火：一盏大灯笼，周围三盏小的
  const lantern = (x: number, y: number, s: number): void => {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    stroke(c, (k) => { k.moveTo(0, -9); k.lineTo(0, -6); }, 1.6);
    blob(c, ellipse(0, 0, 7, 6.4), RED, RED_D, 1.7, 1.4);
    stroke(c, (k) => k.ellipse(0, 0, 3, 6.2, 0, 0, Math.PI * 2), 0.9, GOLD);
    dab(c, ellipse(0, 0.4, 3, 3.4), '#ffe48a', 0.85);
    blob(c, rrect(-3, -7.6, 6, 2, 1), GOLD_D, null, 1.2);
    blob(c, rrect(-3, 5.6, 6, 2, 1), GOLD_D, null, 1.2);
    stroke(c, (k) => { k.moveTo(0, 7.6); k.lineTo(0, 10.5); }, 1.2, GOLD);
    c.restore();
  };
  lantern(16, 15, 1.35);
  lantern(5.5, 7.5, 0.5);
  lantern(26.5, 7.5, 0.5);
  lantern(16, 4.5, 0.4);
}

// ───── 被动 ─────

function pQizhi(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#ffe0d4', 0.5);
  // 三角令旗，竖着的旗杆，旗尖朝上
  stroke(c, (k) => { k.moveTo(11, 29); k.lineTo(11, 4); }, 3.2);
  stroke(c, (k) => { k.moveTo(11, 29); k.lineTo(11, 4); }, 1.4, '#c9a35a');
  blob(c, poly(12, 5, 28, 12, 12, 20), RED, RED_D, 1.8, 1.6);
  stroke(c, (k) => { k.moveTo(13.5, 8); k.lineTo(24, 12.4); k.lineTo(13.5, 17); }, 1.1, GOLD);
  c.font = '900 8px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = GOLD;
  c.fillText('令', 17.5, 13);
}

function pTielian(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#dfe3ee', 0.6);
  // 两个相扣的粗铁环 + 一个小环
  link(c, 12, 12, 7, 4.4, -0.6, IRON);
  link(c, 20, 18, 7, 4.4, -0.6, '#c9ced8');
  link(c, 6, 21, 3.4, 2.4, 0.5, IRON);
  dab(c, circle(12, 10, 0.9), '#ffffff', 0.9);
}

function pDengyou(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#fff0c8', 0.65);
  // 一小瓶灯油：瓶塞、油面、一滴
  blob(c, rrect(11, 4, 10, 5, 1.6), '#8a5a2a', null, 1.6);
  blob(c, (k) => { k.moveTo(12, 9); k.lineTo(12, 12); k.quadraticCurveTo(6, 15, 7, 23); k.quadraticCurveTo(8, 29, 16, 29); k.quadraticCurveTo(24, 29, 25, 23); k.quadraticCurveTo(26, 15, 20, 12); k.lineTo(20, 9); k.closePath(); }, '#e8d8a0', '#b8a060', 1.8, 1.6);
  dab(c, (k) => { k.moveTo(8.6, 19); k.quadraticCurveTo(16, 16, 23.4, 19); k.quadraticCurveTo(25, 28, 16, 27.6); k.quadraticCurveTo(7, 28, 8.6, 19); }, FLAME, 0.9);
  dab(c, ellipse(12, 22, 1.6, 3, 0.3), '#fff3b0', 0.8);
  blob(c, (k) => { k.moveTo(28, 4); k.quadraticCurveTo(31, 9, 28, 11); k.quadraticCurveTo(25, 9, 28, 4); k.closePath(); }, FLAME, FLAME_D, 1.2, 0.8);
}

// ───── 搭配（圆章 + 图案，仿 m_leiyu：32×32、金环） ─────

function badge(c: Ctx, fill: string, dark: string): void {
  dab(c, circle(16, 16, 15.8), fill, 0.35);
  blob(c, circle(16, 16, 14.6), fill, dark, 2.1, 2.6);
  stroke(c, (k) => k.arc(16, 16, 13, 0, Math.PI * 2), 1.5, GOLD);
}

const bolt = (c: Ctx, x: number, y: number, s: number): void => {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  blob(c, poly(2, -8, -4, 1, 0, 1, -2.5, 9, 5, -1.5, 1, -1.5, 4, -8), '#ffe35a', '#d8a020', 1.1, 0.5);
  c.restore();
};

function crane(c: Ctx, x: number, y: number, s: number, flip = 1): void {
  c.save();
  c.translate(x, y);
  c.scale(s * flip, s);
  blob(c, poly(-8, 2, 0, -3, 8, -5, 4, 1, 8, 4, 0, 3), PAPER, '#c9bfa0', 1.3, 1);
  blob(c, poly(-1, -1, -5, -9, 2, -3), '#ffffff', '#c9bfa0', 1.1, 0.8);
  blob(c, poly(8, -5, 12, -9, 9, -3), PAPER, '#c9bfa0', 1, 0.6);
  dab(c, circle(11, -8, 0.9), RED);
  c.restore();
}

function bellShape(c: Ctx, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  blob(c, (k) => { k.moveTo(-8, 8); k.quadraticCurveTo(-7, -7, 0, -7); k.quadraticCurveTo(7, -7, 8, 8); k.closePath(); }, '#e2b54a', GOLD_D, 1.6, 1.3);
  blob(c, rrect(-9.5, 7, 19, 3, 1.3), '#c99a35', null, 1.4);
  blob(c, circle(0, 12, 2), '#7a4a20', null, 1.1);
  stroke(c, (k) => { k.moveTo(0, -7); k.lineTo(0, -10); }, 1.6);
  c.restore();
}

function mLeijie(c: Ctx): void {
  badge(c, '#6a5aa8', '#352a6a');
  stroke(c, (k) => { k.moveTo(9, 22); k.lineTo(23, 22); }, 1.2, FOAM);
  // 一圈锁链环 + 雷
  for (const [x, y, r] of [[9, 9, 0.3], [23, 9, -0.3], [9, 20, -0.3], [23, 20, 0.3]] as const) link(c, x, y, 3, 2, r, '#c9ced8');
  bolt(c, 16, 15, 1.45);
}
function mHejin(c: Ctx): void {
  badge(c, '#e0b84a', '#8a6a1a');
  // 金钟罩罩着纸鹤
  blob(c, (k) => { k.moveTo(6, 25); k.quadraticCurveTo(7, 6, 16, 6); k.quadraticCurveTo(25, 6, 26, 25); k.closePath(); }, '#ffe08a', '#d8a020', 1.6, 1.4);
  crane(c, 16, 17, 0.9);
}
function mQiankun(c: Ctx): void {
  badge(c, '#3a4a8a', '#1a2450');
  // 八卦圈 + 中间太极
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = 16 + Math.cos(a) * 9.4;
    const y = 16 + Math.sin(a) * 9.4;
    stroke(c, (p) => { p.moveTo(x - Math.sin(a) * 2.4, y + Math.cos(a) * 2.4); p.lineTo(x + Math.sin(a) * 2.4, y - Math.cos(a) * 2.4); }, 1.8, GOLD);
  }
  blob(c, circle(16, 16, 5.2), '#ffffff', null, 1.4);
  dab(c, (k) => { k.arc(16, 16, 5.2, -Math.PI / 2, Math.PI / 2); k.arc(16, 18.6, 2.6, Math.PI / 2, -Math.PI / 2, true); k.arc(16, 13.4, 2.6, Math.PI / 2, -Math.PI / 2); }, INK);
}
function mQianjian(c: Ctx): void {
  badge(c, '#d8a030', '#8a5a14');
  // 剑穿过一串铜钱
  c.save();
  c.translate(16, 16);
  c.rotate(0.78);
  blob(c, poly(-1.6, 11, -1.6, -8, 0, -12, 1.6, -8, 1.6, 11), '#e6f0ff', '#9fb4d0', 1.3, 1);
  blob(c, rrect(-4, 9, 8, 2, 1), GOLD_D, null, 1.2);
  c.restore();
  for (const [x, y] of [[8, 9], [12, 13], [20, 19], [24, 23]] as const) {
    blob(c, circle(x, y, 3.4), GOLD, GOLD_D, 1.3, 1);
    blob(c, rrect(x - 1, y - 1, 2, 2, 0.3), '#8a5a14', null, 0.8);
  }
}
function mHeling(c: Ctx): void {
  badge(c, '#4aa8a0', '#1f5f60');
  bellShape(c, 15, 17, 0.85);
  crane(c, 21, 9, 0.62);
}
function mYiwei(c: Ctx): void {
  badge(c, '#4aa8ff', '#1f5fb8');
  // 一片芦苇叶浮在水上，下面水纹
  stroke(c, (k) => { k.moveTo(7, 20); k.quadraticCurveTo(16, 12, 26, 14); }, 4, INK);
  stroke(c, (k) => { k.moveTo(7, 20); k.quadraticCurveTo(16, 12, 26, 14); }, 2.4, '#6ac04a');
  stroke(c, (k) => { k.moveTo(9, 23); k.quadraticCurveTo(13, 21, 17, 23); k.quadraticCurveTo(21, 25, 25, 23); }, 1.5, FOAM);
  stroke(c, (k) => { k.moveTo(6, 26.5); k.quadraticCurveTo(10, 24.5, 14, 26.5); k.quadraticCurveTo(18, 28.5, 22, 26.5); }, 1.3, FOAM);
  // 一把小剑斜在上
  blob(c, poly(18, 5, 20, 5, 15, 12, 13.5, 11), '#e6f0ff', '#9fb4d0', 1.1, 0.6);
}
function mChenzhong(c: Ctx): void {
  badge(c, '#b8683a', '#6a3418');
  bellShape(c, 12, 16, 0.78);
  // 一面鼓
  blob(c, ellipse(22, 19, 5.6, 6.6), '#c9302c', '#7a1a18', 1.6, 1.3);
  blob(c, ellipse(22, 12.6, 5.6, 2), '#f4ecd4', '#c9bfa0', 1.3, 0.8);
  for (const y of [16, 20, 24]) dab(c, circle(17.2, y, 0.7), GOLD);
}
function mHuadeng(c: Ctx): void {
  badge(c, '#e87aa8', '#8a2a5a');
  blob(c, ellipse(16, 15, 6.6, 6), RED, RED_D, 1.7, 1.4);
  dab(c, ellipse(16, 15.4, 3, 3.6), '#ffe48a', 0.85);
  blob(c, rrect(12.6, 7.6, 6.8, 2, 1), GOLD_D, null, 1.2);
  // 花瓣飘落
  for (const [x, y, r] of [[7, 22, 0.5], [14, 26, -0.4], [22, 24, 0.9], [26, 18, -0.6]] as const) blob(c, ellipse(x, y, 2.6, 1.4, r), '#ffd0e0', '#e87aa8', 1, 0.6);
}
function mDudeng(c: Ctx): void {
  badge(c, '#2f6fb0', '#143a66');
  // 水面上漂着一盏小灯
  stroke(c, (k) => { k.moveTo(5, 23); k.quadraticCurveTo(10, 21, 16, 23); k.quadraticCurveTo(22, 25, 27, 23); }, 1.5, FOAM);
  stroke(c, (k) => { k.moveTo(8, 27); k.quadraticCurveTo(13, 25, 18, 27); k.quadraticCurveTo(23, 29, 26, 27); }, 1.3, FOAM);
  blob(c, (k) => { k.moveTo(9, 20); k.quadraticCurveTo(16, 28, 23, 20); k.closePath(); }, '#b8803a', '#7a4a20', 1.6, 1.4);
  flame(c, 16, 13.5, 0.85);
}
function mLiangyi(c: Ctx): void {
  badge(c, '#8a8fa0', '#3a3f50');
  blob(c, circle(16, 16, 9), '#ffffff', null, 1.6);
  dab(c, (k) => { k.arc(16, 16, 9, -Math.PI / 2, Math.PI / 2); k.arc(16, 20.5, 4.5, Math.PI / 2, -Math.PI / 2, true); k.arc(16, 11.5, 4.5, Math.PI / 2, -Math.PI / 2); }, INK);
  dab(c, circle(16, 20.5, 1.5), '#ffffff');
  dab(c, circle(16, 11.5, 1.5), INK);
}

const icon = (key: string, draw: (c: Ctx) => void): SpriteDef => ({ key, w: 32, h: 32, ox: 0.5, oy: 0.5, draw });

export const SPRITES_ARMS: SpriteDef[] = [
  icon('i_flag', iFlag),
  icon('i_flag_evo', iFlagEvo),
  icon('i_chain', iChain),
  icon('i_chain_evo', iChainEvo),
  icon('i_pole', iPole),
  icon('i_pole_evo', iPoleEvo),
  icon('i_lamp', iLamp),
  icon('i_lamp_evo', iLampEvo),
  icon('p_qizhi', pQizhi),
  icon('p_tielian', pTielian),
  icon('p_dengyou', pDengyou),
  icon('m_leijie', mLeijie),
  icon('m_hejin', mHejin),
  icon('m_qiankun', mQiankun),
  icon('m_qianjian', mQianjian),
  icon('m_heling', mHeling),
  icon('m_yiwei', mYiwei),
  icon('m_chenzhong', mChenzhong),
  icon('m_huadeng', mHuadeng),
  icon('m_dudeng', mDudeng),
  icon('m_liangyi', mLiangyi),
];
