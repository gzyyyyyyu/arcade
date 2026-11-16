/**
 * 2.0 第二批法器的图标（全部程序画，32×32）：铜钱镖、算盘、招魂幡、判官笔、鞭炮和各自的进化，
 * 四个新被动（钱袋、白幡、朱笔、硫磺），五个专属搭配图标（规则 55 的搭配图标接在后面）。
 * 场上的特效不用图（view/game/fx-arms2.ts 画在 Graphics 上）。放进特色怪那张图集（atlas.ts buildMobAtlas）：
 * 主图集在渲染倍数 3 时已近 2,048；这张加上 sprites-arms 的 21 个和本文件的 19 个，res 3 约 1,400 / 2,048。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const RED = '#d8402f';
const RED_D = '#8a1f1a';
const GOLD = '#f2c94c';
const GOLD_D = '#b88a2a';
const WOOD_D = '#5a3a18';
const PAPER = '#f4ecd4';
const GHOST = '#bfe8e0';
const GHOST_D = '#4a9a98';
const FLAME = '#ffb02e';
const FLAME_D = '#d8601a';

/** 一枚方孔铜钱 */
function coin(c: Ctx, x: number, y: number, r: number, fill = GOLD, dark = GOLD_D): void {
  blob(c, circle(x, y, r), fill, dark, 1.4, 1);
  blob(c, rrect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6, 0.3), '#7a5410', null, 0.9);
}

function iDart(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#fff0c0', 0.6);
  // 一枚大钱，旁边两道回旋的弧
  stroke(c, (k) => k.arc(16, 16, 12.5, 3.6, 5.2), 2.2, GOLD_D);
  stroke(c, (k) => k.arc(16, 16, 12.5, 0.5, 2.1), 2.2, GOLD_D);
  coin(c, 16, 16, 8);
  dab(c, ellipse(13, 12, 2.4, 1.2, -0.6), '#fff6c8', 0.9);
}
function iDartEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#ffe8a0', 0.65);
  // 三枚钱呈扇形飞出
  coin(c, 9, 20, 5.4);
  coin(c, 16, 11, 6.2);
  coin(c, 23, 20, 5.4);
  for (const [x, y] of [[6, 11], [26, 11], [16, 25]] as const) stroke(c, (k) => { k.moveTo(x - 2, y + 2); k.lineTo(x + 2, y - 2); }, 1.4, GOLD_D);
}

function iAbacus(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#f4e4c8', 0.6);
  blob(c, rrect(4.5, 7, 23, 18, 1.8), '#b8803a', WOOD_D, 1.8, 1.6);
  dab(c, rrect(7, 9.5, 18, 13, 0.8), '#f4ecd4', 0.9);
  // 横梁和三根档，每根几颗珠
  stroke(c, (k) => { k.moveTo(7, 14); k.lineTo(25, 14); }, 1.6, WOOD_D);
  for (const [i, n] of [[0, 3], [1, 2], [2, 4]] as const) {
    const x = 10.5 + i * 5.5;
    stroke(c, (k) => { k.moveTo(x, 9.5); k.lineTo(x, 22.5); }, 1, WOOD_D);
    dab(c, circle(x, 11.8, 1.9), RED);
    for (let j = 0; j < n; j++) blob(c, ellipse(x, 21 - j * 2.2, 2, 1.1), RED, RED_D, 0.9, 0.5);
  }
}
function iAbacusEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#ffe8a0', 0.65);
  blob(c, rrect(3.5, 8, 25, 17, 1.8), '#d8a030', GOLD_D, 1.8, 1.6);
  dab(c, rrect(6, 10.5, 20, 12, 0.8), '#fff6d8', 0.9);
  stroke(c, (k) => { k.moveTo(6, 14.5); k.lineTo(26, 14.5); }, 1.6, GOLD_D);
  for (let i = 0; i < 4; i++) {
    const x = 9.5 + i * 4.6;
    stroke(c, (k) => { k.moveTo(x, 10.5); k.lineTo(x, 22.5); }, 1, GOLD_D);
    dab(c, circle(x, 12.5, 1.7), '#3a3f50');
    for (let j = 0; j < 2 + (i % 3); j++) blob(c, ellipse(x, 21.2 - j * 2, 1.8, 1, 0), '#3a3f50', '#17131c', 0.8, 0.4);
  }
  // 顶上一点光（天机）
  dab(c, circle(16, 4.5, 2.6), '#fff6c8', 0.9);
  stroke(c, (k) => { k.moveTo(16, 1.5); k.lineTo(16, 7.5); k.moveTo(13, 4.5); k.lineTo(19, 4.5); }, 1.1, GOLD);
}

/** 一面三角幡：旗杆 (x, y) 向上 h，旗面朝右下垂 */
function banner(c: Ctx, x: number, y: number, h: number, fill: string, dark: string): void {
  stroke(c, (k) => { k.moveTo(x, y); k.lineTo(x, y - h); }, 3);
  stroke(c, (k) => { k.moveTo(x, y); k.lineTo(x, y - h); }, 1.2, '#c9a35a');
  blob(c, (k) => {
    k.moveTo(x + 0.6, y - h);
    k.lineTo(x + h * 0.7, y - h);
    k.quadraticCurveTo(x + h * 0.55, y - h * 0.7, x + h * 0.7, y - h * 0.45);
    k.quadraticCurveTo(x + h * 0.4, y - h * 0.5, x + h * 0.5, y - h * 0.15);
    k.lineTo(x + 0.6, y - h * 0.3);
    k.closePath();
  }, fill, dark, 1.6, 1.4);
}
function iBanner(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#d8f0ec', 0.65);
  banner(c, 11, 28, 24, GHOST, GHOST_D);
  stroke(c, (k) => { k.moveTo(14, 8); k.lineTo(14, 17); k.moveTo(17, 8); k.lineTo(17, 15); }, 1, GHOST_D);
  // 一缕冤魂
  dab(c, (k) => { k.moveTo(24, 22); k.quadraticCurveTo(22, 14, 26, 12); k.quadraticCurveTo(29, 14, 27, 19); k.quadraticCurveTo(28, 23, 24, 22); }, '#ffffff', 0.9);
  dab(c, circle(25.3, 15, 0.7), INK);
}
function iBannerEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#c0e8e4', 0.7);
  banner(c, 8, 28, 22, '#8fd8d0', GHOST_D);
  banner(c, 20, 28, 26, '#f4f8f8', '#8aa8a8');
  for (const [x, y] of [[26, 8], [15, 6], [27, 18]] as const) {
    dab(c, (k) => { k.moveTo(x, y + 4); k.quadraticCurveTo(x - 2, y, x + 1, y - 2); k.quadraticCurveTo(x + 4, y, x + 2, y + 3); k.closePath(); }, '#ffffff', 0.9);
    dab(c, circle(x + 0.8, y, 0.55), INK);
  }
}

function iBrush(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#f0e0e8', 0.6);
  c.save();
  c.translate(16, 16);
  c.rotate(0.7);
  // 笔杆、金箍、笔锋（朱砂）
  blob(c, rrect(-1.8, -13, 3.6, 17, 1.2), '#3a2a2a', null, 1.5);
  blob(c, rrect(-2.4, 3, 4.8, 2.4, 0.8), GOLD, GOLD_D, 1, 0.5);
  blob(c, (k) => { k.moveTo(-3, 5.4); k.quadraticCurveTo(-4, 11, 0, 14.5); k.quadraticCurveTo(4, 11, 3, 5.4); k.closePath(); }, RED, RED_D, 1.5, 1.2);
  c.restore();
  stroke(c, (k) => { k.moveTo(5, 27); k.quadraticCurveTo(12, 25, 20, 28); }, 2.4, RED);
}
function iBrushEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#f4d8e0', 0.65);
  // 生死簿：一本黑册子 + 朱笔点
  blob(c, rrect(7, 5, 18, 22, 1.8), '#2a2430', '#0a0810', 1.8, 1.6);
  dab(c, rrect(9, 7, 14, 18, 0.8), PAPER, 0.92);
  stroke(c, (k) => { k.moveTo(11, 11); k.lineTo(21, 11); k.moveTo(11, 14.5); k.lineTo(19, 14.5); k.moveTo(11, 18); k.lineTo(21, 18); }, 1, '#8a7a6a');
  stroke(c, (k) => { k.moveTo(12, 22); k.lineTo(20, 9); }, 2.6, RED);
  dab(c, circle(21, 22, 2.2), RED);
}

function iCracker(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#ffe4d0', 0.6);
  // 三根并排的红爆竹，捻子冒火星
  for (const [x, h] of [[9, 15], [16, 18], [23, 14]] as const) {
    blob(c, rrect(x - 3, 27 - h, 6, h, 1.4), RED, RED_D, 1.6, 1.2);
    dab(c, rrect(x - 3, 27 - h + 3, 6, 2, 0), GOLD, 0.9);
    stroke(c, (k) => { k.moveTo(x, 27 - h); k.quadraticCurveTo(x + 1, 27 - h - 3, x + 3, 27 - h - 4); }, 1.1);
    dab(c, circle(x + 3, 27 - h - 4.4, 1.5), FLAME);
  }
}
function iCrackerEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#ffd8b8', 0.7);
  // 一串爆竹挂成一线，每个都在炸
  stroke(c, (k) => { k.moveTo(16, 2); k.lineTo(16, 29); }, 1.6);
  for (let i = 0; i < 4; i++) {
    const y = 5 + i * 6.4;
    const x = 16 + (i % 2 ? 3 : -3);
    blob(c, rrect(x - 2, y, 4, 5.4, 1), RED, RED_D, 1.3, 1);
    dab(c, circle(x + (i % 2 ? 5 : -5), y + 2.5, 2.4), FLAME, 0.9);
    dab(c, circle(x + (i % 2 ? 5 : -5), y + 2.5, 1.2), '#fff3b0');
  }
}

// ───── 被动 ─────

function pQiandai(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#fff0c8', 0.65);
  // 鼓鼓的钱袋，扎口，一枚钱冒出来
  blob(c, (k) => { k.moveTo(11, 11); k.quadraticCurveTo(3, 18, 6, 25); k.quadraticCurveTo(16, 31, 26, 25); k.quadraticCurveTo(29, 18, 21, 11); k.closePath(); }, '#c9302c', RED_D, 1.8, 1.8);
  blob(c, rrect(10, 9, 12, 3.4, 1.4), GOLD, GOLD_D, 1.3, 0.8);
  c.font = '900 10px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = GOLD;
  c.fillText('财', 16, 20);
  coin(c, 22, 6, 3.4);
}
function pBaifan(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#e4f0f0', 0.65);
  banner(c, 12, 29, 25, '#ffffff', '#9ab8b8');
  stroke(c, (k) => { k.moveTo(15, 8); k.lineTo(15, 17); k.moveTo(18, 8); k.lineTo(18, 14); }, 1, '#8aa8a8');
  dab(c, circle(24, 24, 3.4), '#ffffff', 0.8);
  dab(c, circle(23.4, 23.6, 0.6), INK);
}
function pZhubi(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#fbe0e0', 0.6);
  c.save();
  c.translate(16, 16);
  c.rotate(-0.6);
  blob(c, rrect(-1.6, -13, 3.2, 17, 1.1), RED, RED_D, 1.4, 1);
  blob(c, rrect(-2.2, 3, 4.4, 2.2, 0.8), GOLD, GOLD_D, 1, 0.5);
  blob(c, (k) => { k.moveTo(-2.8, 5.2); k.quadraticCurveTo(-3.8, 11, 0, 14); k.quadraticCurveTo(3.8, 11, 2.8, 5.2); k.closePath(); }, '#ffffff', '#c9bfa0', 1.4, 1);
  dab(c, ellipse(0, 12, 1.6, 2.2), RED);
  c.restore();
  dab(c, circle(8, 26, 2.4), RED);
  dab(c, circle(12.5, 27.6, 1.3), RED);
}
function pLiuhuang(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#fff4c0', 0.7);
  // 一堆黄色的硫磺块，冒一缕火
  blob(c, poly(5, 25, 9, 15, 15, 14, 18, 25), '#f2d84a', '#b8a020', 1.6, 1.4);
  blob(c, poly(14, 25, 17, 17, 24, 16, 27, 25), '#ffe860', '#c0a820', 1.6, 1.4);
  blob(c, (k) => { k.moveTo(16, 5); k.quadraticCurveTo(21, 10, 18, 14); k.quadraticCurveTo(16, 11, 14, 14); k.quadraticCurveTo(11, 10, 16, 5); k.closePath(); }, FLAME, FLAME_D, 1.3, 0.8);
  dab(c, ellipse(16, 11.6, 1.4, 2), '#fff3b0');
}

// ───── 搭配 ─────

function badge(c: Ctx, fill: string, dark: string): void {
  dab(c, circle(16, 16, 15.8), fill, 0.35);
  blob(c, circle(16, 16, 14.6), fill, dark, 2.1, 2.6);
  stroke(c, (k) => k.arc(16, 16, 13, 0, Math.PI * 2), 1.5, GOLD);
}

function mYinlv(c: Ctx): void {
  badge(c, '#7a5aa0', '#3a2260');
  // 剑光一道，朱笔一点
  blob(c, poly(7, 24, 21, 8, 24, 11, 10, 27), '#e6f0ff', '#9fb4d0', 1.3, 1);
  stroke(c, (k) => { k.moveTo(9, 10); k.quadraticCurveTo(15, 12, 24, 22); }, 3, RED);
  dab(c, circle(24.4, 22.6, 2), RED);
}
function mMaibu(c: Ctx): void {
  badge(c, '#e8b830', '#8a6a14');
  // 黄符上压一枚钱
  blob(c, rrect(8, 5, 11, 20, 1), '#ffe060', '#c8a020', 1.4, 1);
  stroke(c, (k) => { k.moveTo(10.5, 10); k.lineTo(16.5, 10); k.moveTo(10.5, 14); k.lineTo(16.5, 14); k.moveTo(10.5, 18); k.lineTo(15, 18); }, 1.2, RED);
  coin(c, 21.5, 21, 5.6);
}
function mYinbing(c: Ctx): void {
  badge(c, '#6a8aa8', '#2a4060');
  // 纸兵身子里升起一缕魂
  blob(c, rrect(10, 14, 12, 12, 1.6), PAPER, '#c9bfa0', 1.5, 1.2);
  blob(c, circle(16, 10.4, 4), PAPER, '#c9bfa0', 1.5, 1.1);
  dab(c, circle(14.6, 10, 0.7), INK);
  dab(c, circle(17.6, 10, 0.7), INK);
  dab(c, (k) => { k.moveTo(24, 22); k.quadraticCurveTo(22, 14, 25, 8); k.quadraticCurveTo(29, 12, 27, 18); k.quadraticCurveTo(28, 22, 24, 22); }, '#e8f8f8', 0.9);
}
function mBaozhu(c: Ctx): void {
  badge(c, '#e8503a', '#7a1a10');
  // 金钟罩罩着一串爆竹
  blob(c, (k) => { k.moveTo(5, 26); k.quadraticCurveTo(6, 6, 16, 6); k.quadraticCurveTo(26, 6, 27, 26); k.closePath(); }, '#ffe08a', '#d8a020', 1.6, 1.4);
  for (const x of [11.5, 16, 20.5]) {
    blob(c, rrect(x - 1.8, 13, 3.6, 10, 0.9), RED, RED_D, 1.2, 0.8);
    dab(c, circle(x + 1, 11.8, 1.1), FLAME);
  }
}
function mCaiyuan(c: Ctx): void {
  badge(c, '#c8a020', '#6a4a08');
  blob(c, rrect(5.5, 17, 21, 9, 1.4), '#b8803a', WOOD_D, 1.4, 1);
  dab(c, rrect(7.5, 19, 17, 5, 0.6), PAPER, 0.9);
  for (const x of [10, 14, 18, 22]) dab(c, circle(x, 21.5, 1.3), RED);
  coin(c, 12, 10, 4.2);
  coin(c, 20, 8.5, 4.2);
}
function mFuhuo(c: Ctx): void {
  badge(c, '#ff6a3a', '#8a2a10');
  // 黄符下面烧着一团火
  blob(c, rrect(10, 4, 10, 16, 1), '#ffe060', '#c8a020', 1.4, 1);
  stroke(c, (k) => { k.moveTo(12, 8); k.lineTo(18, 8); k.moveTo(12, 12); k.lineTo(18, 12); }, 1.2, RED);
  blob(c, (k) => { k.moveTo(8, 27); k.quadraticCurveTo(7, 20, 15, 14); k.quadraticCurveTo(14, 19, 18, 21); k.quadraticCurveTo(21, 18, 20, 16); k.quadraticCurveTo(27, 21, 24, 27); k.closePath(); }, FLAME, FLAME_D, 1.3, 1);
}
function mLinfu(c: Ctx): void {
  badge(c, '#e8b04a', '#8a5a14');
  // 铃下垂着一张符
  blob(c, (k) => { k.moveTo(8, 15); k.quadraticCurveTo(9, 6, 16, 6); k.quadraticCurveTo(23, 6, 24, 15); k.closePath(); }, '#ffe08a', '#d8a020', 1.4, 1.2);
  blob(c, rrect(12.5, 16, 7, 12, 0.8), '#ffe060', '#c8a020', 1.2, 1);
  stroke(c, (k) => { k.moveTo(14, 19); k.lineTo(18, 19); k.moveTo(14, 22.5); k.lineTo(18, 22.5); }, 1, RED);
}
function mLingyan(c: Ctx): void {
  badge(c, '#ff8a4a', '#8a3010');
  // 铃上烧着火苗
  blob(c, (k) => { k.moveTo(8, 27); k.quadraticCurveTo(9, 15, 16, 15); k.quadraticCurveTo(23, 15, 24, 27); k.closePath(); }, '#ffe08a', '#d8a020', 1.4, 1.2);
  blob(c, (k) => { k.moveTo(11, 15); k.quadraticCurveTo(10, 9, 16, 4); k.quadraticCurveTo(15, 9, 18, 10); k.quadraticCurveTo(21, 8, 20.5, 6); k.quadraticCurveTo(24, 11, 21, 15); k.closePath(); }, FLAME, FLAME_D, 1.2, 1);
}
function mZhonggu(c: Ctx): void {
  badge(c, '#d89a50', '#6a4418');
  // 方阵的框里挂着一只铃
  stroke(c, (k) => { k.moveTo(5, 8); k.lineTo(27, 8); k.lineTo(27, 27); k.lineTo(5, 27); k.closePath(); }, 1.3, '#8c6a30');
  blob(c, (k) => { k.moveTo(10.5, 23); k.quadraticCurveTo(11, 12, 16, 12); k.quadraticCurveTo(21, 12, 21.5, 23); k.closePath(); }, '#ffe08a', '#d8a020', 1.3, 1.1);
  dab(c, circle(16, 24.4, 1.5), '#7a5410');
}
// 规则 62 的五个搭配
function mJianzou(c: Ctx): void {
  badge(c, '#d8b04a', '#7a5a14');
  // 一把飞剑斜着飞，剑尖甩出一枚铜钱
  blob(c, poly(5, 26, 19, 12, 22, 15, 8, 29), '#e6f0ff', '#9fb4d0', 1.3, 1);
  stroke(c, (k) => { k.moveTo(6, 22); k.lineTo(11, 27); }, 2, WOOD_D);
  coin(c, 23.5, 9, 4.6);
}
function mLongshe(c: Ctx): void {
  badge(c, '#4a8ad8', '#1a3a70');
  // 一道浪头，浪尖上一笔朱砂
  blob(c, (k) => { k.moveTo(4, 26); k.quadraticCurveTo(8, 14, 16, 16); k.quadraticCurveTo(12, 19, 15, 22); k.quadraticCurveTo(22, 14, 28, 18); k.lineTo(28, 26); k.closePath(); }, '#8ad0ff', '#2a6aa8', 1.4, 1.1);
  stroke(c, (k) => { k.moveTo(17, 5); k.quadraticCurveTo(21, 9, 23, 13); }, 3, RED);
  dab(c, circle(23.4, 13.6, 1.8), RED);
}
function mPanzhen(c: Ctx): void {
  badge(c, '#8a5ad8', '#3a1a70');
  // 方阵的框，框里一个朱笔圈
  stroke(c, (k) => { k.moveTo(5, 6); k.lineTo(27, 6); k.lineTo(27, 27); k.lineTo(5, 27); k.closePath(); }, 1.3, '#c8b0f0');
  stroke(c, (k) => { k.moveTo(11, 13); k.quadraticCurveTo(16, 8, 21, 13); k.quadraticCurveTo(24, 19, 16, 22); k.quadraticCurveTo(9, 21, 11, 15); }, 2.4, RED);
  dab(c, circle(16, 16.5, 1.6), RED);
}
function mSuohun(c: Ctx): void {
  badge(c, '#5a6a9a', '#1e2a4a');
  // 一截锁链，链尾升起一缕魂
  for (const [x, y] of [[7, 24], [11.5, 19.5], [16, 15]] as const) stroke(c, (k) => { k.ellipse(x, y, 3.2, 2, -0.8, 0, Math.PI * 2); }, 1.6, '#c8ccd8');
  dab(c, (k) => { k.moveTo(21, 16); k.quadraticCurveTo(19, 9, 23, 4); k.quadraticCurveTo(28, 8, 26, 13); k.quadraticCurveTo(27, 17, 21, 16); }, GHOST, 0.95);
  dab(c, circle(22.6, 9.5, 0.7), GHOST_D);
  dab(c, circle(25, 9.5, 0.7), GHOST_D);
}
function mHanzhong(c: Ctx): void {
  badge(c, '#6ac8e8', '#1a5a7a');
  // 铃下一汪泉，泉上结着冰花
  blob(c, ellipse(16, 24, 11, 4), '#bfefff', '#4aa8d0', 1.3, 1);
  blob(c, (k) => { k.moveTo(9.5, 21); k.quadraticCurveTo(10, 8, 16, 8); k.quadraticCurveTo(22, 8, 22.5, 21); k.closePath(); }, '#ffe08a', '#d8a020', 1.4, 1.2);
  stroke(c, (k) => { k.moveTo(24, 6); k.lineTo(28, 10); k.moveTo(28, 6); k.lineTo(24, 10); k.moveTo(26, 5); k.lineTo(26, 11); }, 1.1, '#ffffff');
}
const icon = (key: string, draw: (c: Ctx) => void): SpriteDef => ({ key, w: 32, h: 32, ox: 0.5, oy: 0.5, draw });

export const SPRITES_ARMS2: SpriteDef[] = [
  icon('i_dart', iDart),
  icon('i_dart_evo', iDartEvo),
  icon('i_abacus', iAbacus),
  icon('i_abacus_evo', iAbacusEvo),
  icon('i_banner', iBanner),
  icon('i_banner_evo', iBannerEvo),
  icon('i_brush', iBrush),
  icon('i_brush_evo', iBrushEvo),
  icon('i_cracker', iCracker),
  icon('i_cracker_evo', iCrackerEvo),
  icon('p_qiandai', pQiandai),
  icon('p_baifan', pBaifan),
  icon('p_zhubi', pZhubi),
  icon('p_liuhuang', pLiuhuang),
  icon('m_yinlv', mYinlv),
  icon('m_maibu', mMaibu),
  icon('m_yinbing', mYinbing),
  icon('m_baozhu', mBaozhu),
  icon('m_caiyuan', mCaiyuan),
  icon('m_fuhuo', mFuhuo),
  icon('m_linfu', mLinfu),
  icon('m_lingyan', mLingyan),
  icon('m_zhonggu', mZhonggu),
  icon('m_jianzou', mJianzou),
  icon('m_longshe', mLongshe),
  icon('m_panzhen', mPanzhen),
  icon('m_suohun', mSuohun),
  icon('m_hanzhong', mHanzhong),
];
