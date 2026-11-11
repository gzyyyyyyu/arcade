/**
 * 10-30 新流派「水府」的图（全部程序画）：寒泉、龙王令和它们的进化图标、双修「雷雨」图标、场上的浪头。
 * 场上的寒泉不用图，画在地面层的 Graphics 上（GameScene.drawSpring），大小和打到的范围一样。
 * 放在特色怪那张图集：主图集在渲染倍数 3 时已经 1,998 / 2,048，再加一行 32 的图标就超（atlas.ts）。
 */
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import type { SpriteDef } from './sprites.ts';

const DEEP = '#1f5fb8';
const WATER = '#4ab4ff';
const FOAM = '#e8f8ff';
const GOLD = '#f2c94c';

/** 一眼泉：深色石沿 + 蓝水面 + 两道涟漪 */
function pool(c: Ctx, x: number, y: number, rx: number, ry: number, water: string, deep: string): void {
  blob(c, ellipse(x, y, rx + 2.4, ry + 1.8), '#8a94a8', '#5a6278', 2, 1.2);
  blob(c, ellipse(x, y, rx, ry), water, deep, 1.6, 1.6);
  stroke(c, (k) => k.ellipse(x, y, rx * 0.62, ry * 0.6, 0, 0, Math.PI * 2), 1.2, FOAM);
  stroke(c, (k) => k.ellipse(x, y, rx * 0.3, ry * 0.28, 0, 0, Math.PI * 2), 1, FOAM);
}

/** 一道卷起来的浪（浪头朝右），(x, y) 是浪身中间，s 缩放 */
function wave(c: Ctx, x: number, y: number, s: number, body = WATER, dark = DEEP): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  blob(
    c,
    (k) => {
      k.moveTo(-14, 7);
      k.quadraticCurveTo(-10, -4, 0, -9);
      k.quadraticCurveTo(10, -13, 13, -5);
      k.quadraticCurveTo(9, -7, 6, -3);
      k.quadraticCurveTo(10, 2, 14, 7);
      k.closePath();
    },
    body,
    dark,
    1.8,
    1.8,
  );
  // 浪尖的白沫
  blob(c, (k) => { k.moveTo(1, -9.5); k.quadraticCurveTo(10, -13.5, 13.4, -5.4); k.quadraticCurveTo(9, -9, 3, -7.4); k.closePath(); }, FOAM, null, 1.1);
  stroke(c, (k) => { k.moveTo(-9, 3); k.quadraticCurveTo(-3, -3, 4, -2); }, 1.1, FOAM);
  c.restore();
}

/** 龙王令：金边的黑漆令牌，中间一个"令" */
function token(c: Ctx, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  blob(c, (k) => { k.moveTo(-6, -11); k.lineTo(0, -15); k.lineTo(6, -11); k.lineTo(6, 11); k.lineTo(-6, 11); k.closePath(); }, '#2a2f4a', '#141828', 1.8, 1.2);
  stroke(c, (k) => { k.moveTo(-4.4, -9.6); k.lineTo(0, -12.6); k.lineTo(4.4, -9.6); k.lineTo(4.4, 9.4); k.lineTo(-4.4, 9.4); k.closePath(); }, 1, GOLD);
  c.font = '900 10px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = GOLD;
  c.fillText('令', 0, 0.5);
  c.restore();
}

function iSpring(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#cfeaff', 0.6);
  pool(c, 16, 20, 11, 6.4, WATER, DEEP);
  // 往上冒的两股泉水
  stroke(c, (k) => { k.moveTo(13, 19); k.quadraticCurveTo(11, 11, 13.5, 6); }, 2.2, DEEP);
  stroke(c, (k) => { k.moveTo(13, 19); k.quadraticCurveTo(11, 11, 13.5, 6); }, 1.1, FOAM);
  stroke(c, (k) => { k.moveTo(19, 19); k.quadraticCurveTo(21.5, 12, 19.5, 8); }, 2.2, DEEP);
  stroke(c, (k) => { k.moveTo(19, 19); k.quadraticCurveTo(21.5, 12, 19.5, 8); }, 1.1, FOAM);
  for (const [x, y] of [[9, 9], [24, 6], [16, 4]] as const) dab(c, circle(x, y, 1.3), WATER);
}

function iSpringEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#9fc8ff', 0.55);
  pool(c, 16, 19, 13, 8, '#2a6fe8', '#123a7a');
  // 潭心一朵霜花
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    stroke(c, (p) => { p.moveTo(16 - Math.cos(a) * 6, 19 - Math.sin(a) * 4); p.lineTo(16 + Math.cos(a) * 6, 19 + Math.sin(a) * 4); }, 1.6, FOAM);
  }
  // 潭边的冰碴
  for (const [x, y] of [[4, 14], [28, 13], [9, 27], [24, 27]] as const) blob(c, poly(x, y - 3.6, x + 2, y + 1, x - 2, y + 1), FOAM, '#9fc8ff', 1, 0.6);
}

function iTide(c: Ctx): void {
  dab(c, circle(16, 16, 14.5), '#d6ecff', 0.6);
  wave(c, 18, 21, 0.9);
  token(c, 9, 13, 0.62);
}

function iTideEvo(c: Ctx): void {
  dab(c, circle(16, 16, 15), '#9fd0ff', 0.55);
  wave(c, 12, 23, 0.7, '#2a6fe8', '#123a7a');
  wave(c, 20, 15, 0.85);
  // 卷回来的那一道：反着的小浪
  c.save();
  c.translate(32, 0);
  c.scale(-1, 1);
  wave(c, 9, 27, 0.5, WATER, DEEP);
  c.restore();
}

function mLeiyu(c: Ctx): void {
  dab(c, circle(16, 16, 15.8), '#4aa8ff', 0.35);
  blob(c, circle(16, 16, 14.6), '#4aa8ff', '#1f5fb8', 2.1, 2.6);
  stroke(c, (k) => k.arc(16, 16, 13, 0, Math.PI * 2), 1.5, GOLD);
  // 乌云 + 一道雷劈进下面的泉
  blob(c, (k) => { k.ellipse(12, 10, 5, 3.6, 0, 0, Math.PI * 2); k.ellipse(19, 9, 5.6, 4.2, 0, 0, Math.PI * 2); }, '#5a6278', '#3a4058', 1.4, 1);
  pool(c, 16, 24, 8, 3.6, '#bfe6ff', DEEP);
  blob(c, poly(17, 11, 13, 18, 16, 18, 13.5, 24, 20, 16, 17, 16, 19.5, 11), '#ffe35a', '#d8a020', 1.2, 0.6);
  for (const [x, y] of [[7, 16], [25, 15], [24, 21]] as const) stroke(c, (k) => { k.moveTo(x, y); k.lineTo(x - 1, y + 3); }, 1.2, FOAM);
}

/** 场上的浪头（48×28，浪头朝右；GameScene 按速度方向转、按浪宽缩放） */
function tideSprite(c: Ctx): void {
  // 身后一道深色水影，让浪在雪地上压得住
  dab(c, ellipse(20, 16, 18, 8), INK, 0.18);
  wave(c, 26, 15, 1.45);
  wave(c, 13, 17, 0.9, '#2a6fe8', '#123a7a');
  dab(c, rrect(2, 20, 10, 2, 1), FOAM, 0.8);
}

const icon = (key: string, draw: (c: Ctx) => void): SpriteDef => ({ key, w: 32, h: 32, ox: 0.5, oy: 0.5, draw });

export const SPRITES14: SpriteDef[] = [
  icon('i_spring', iSpring),
  icon('i_spring_evo', iSpringEvo),
  icon('i_tide', iTide),
  icon('i_tide_evo', iTideEvo),
  icon('m_leiyu', mLeiyu),
  { key: 'tide_s', w: 48, h: 28, ox: 0.5, oy: 0.5, draw: tideSprite },
];
