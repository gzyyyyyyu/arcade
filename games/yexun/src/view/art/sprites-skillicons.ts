/**
 * 十个技能按钮的专属图标（32×32，圆章底 + 一个认得出的图案；不借起手法器的图，免得和法器栏撞）。
 * 键名 sk_* 写在 core/skills.ts 的 SKILLS[..].icon 里；和角色一起装进角色小图集（atlas.ts 的 buildHeroAtlas）。
 * 圆章的颜色和技能特效（art/skills.ts）的主色一致，按钮和放出来的光一看就是一家。
 */
import type { SpriteDef } from './sprites.ts';
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';

/** 圆章底：深色边 + 主色 + 一道高光 */
function badge(c: Ctx, fill: string, shade: string): void {
  blob(c, circle(16, 16, 14), fill, shade, 2.4, 2);
  dab(c, ellipse(11, 8.5, 6, 2.4, -0.5), '#ffffff', 0.35);
}

const WHITE = '#f6f8ff';

/** 小道士·剑气纵横：两道弯弯的白色斩痕 */
function sweep(c: Ctx): void {
  badge(c, '#3f8fd8', '#2a62a0');
  for (const [r, w] of [[10, 3.2], [6, 2.4]] as const) {
    stroke(c, (k) => { k.arc(10, 16, r + 3, -0.95, 0.95); }, w + 2.2, INK);
    stroke(c, (k) => { k.arc(10, 16, r + 3, -0.95, 0.95); }, w, WHITE);
  }
  dab(c, circle(25, 16, 1.4), WHITE);
}

/** 符师·万符齐发：三张黄符扇开 */
function volley(c: Ctx): void {
  badge(c, '#8a5cc8', '#5e3a96');
  for (const a of [-0.55, 0, 0.55]) {
    c.save();
    c.translate(16, 24);
    c.rotate(a);
    blob(c, rrect(-3.6, -19, 7.2, 15, 0.8), '#f2d14a', '#d8b232', 1.4, 1);
    stroke(c, (k) => { k.moveTo(-1.3, -15); k.lineTo(1.3, -15); k.moveTo(0, -15); k.lineTo(0, -8); }, 0.9, '#c8402f');
    c.restore();
  }
}

/** 剑侠·御剑突进：一把飞剑加三道风线 */
function dash(c: Ctx): void {
  badge(c, '#2fb08c', '#1f7c63');
  for (const y of [11, 16, 21]) stroke(c, (k) => { k.moveTo(3 + (y === 16 ? 0 : 3), y); k.lineTo(12, y); }, 1.6, WHITE);
  c.save();
  c.translate(18, 16);
  blob(c, poly(-6, -2.4, 7, -2.4, 12, 0, 7, 2.4, -6, 2.4), '#e6ebf2', '#aab4c2', 1.6, 1);
  blob(c, rrect(-10, -3.6, 4.5, 7.2, 1.2), '#c9a24a', null, 1.5);
  c.restore();
}

/** 胖师叔·铁布衫：金色罩子里的一口钟 */
function iron(c: Ctx): void {
  badge(c, '#e0a63a', '#b07a1e');
  blob(c, (k) => { k.moveTo(8, 23); k.quadraticCurveTo(8, 8, 16, 7); k.quadraticCurveTo(24, 8, 24, 23); }, '#fff0b8', '#e8c868', 1.8, 1.4);
  blob(c, rrect(6.5, 22, 19, 3.4, 1.4), '#8a5a1a', null, 1.5);
  blob(c, circle(16, 27, 2), '#8a5a1a', null, 1.2);
  stroke(c, (k) => { k.arc(16, 17, 12, -2.6, -0.5); }, 1.4, WHITE);
}

/** 更夫·梆子声声：一根木梆和两道声波 */
function clap(c: Ctx): void {
  badge(c, '#a8672e', '#7a4818');
  blob(c, rrect(7, 12, 14, 8, 3), '#e0b070', '#b88a48', 1.8, 1.2);
  stroke(c, (k) => { k.moveTo(9, 16); k.lineTo(19, 16); }, 1, '#7a4818');
  blob(c, rrect(19, 8, 3.4, 16, 1.4), '#8a5a2a', null, 1.5);
  for (const r of [5, 9]) stroke(c, (k) => { k.arc(20, 16, r, -0.8, 0.8); }, 1.6, WHITE);
}

/** 采药女·回春：一片绿叶托着个十字 */
function spring(c: Ctx): void {
  badge(c, '#4fb872', '#2f8a4c');
  blob(c, (k) => { k.moveTo(7, 24); k.quadraticCurveTo(5, 7, 24, 6); k.quadraticCurveTo(26, 22, 7, 24); }, '#c8f0c0', '#8ccc88', 1.8, 1.2);
  stroke(c, (k) => { k.moveTo(9, 22); k.quadraticCurveTo(14, 15, 21, 9); }, 1.2, '#3d7e4c');
  blob(c, poly(21, 17, 24, 17, 24, 20, 27, 20, 27, 23, 24, 23, 24, 26, 21, 26, 21, 23, 18, 23, 18, 20, 21, 20), '#ff9ad0', '#d86aa0', 1.4, 1);
}

/** 纸匠·剪纸成军：三个手拉手的纸人 */
function paper(c: Ctx): void {
  badge(c, '#d8503c', '#a02c1e');
  const doll = (x: number, y: number): void => {
    blob(c, circle(x, y - 6, 2.8), '#f7f2e6', '#ddd3bb', 1.3, 1);
    blob(c, poly(x - 3.4, y - 3, x + 3.4, y - 3, x + 4.4, y + 6, x - 4.4, y + 6), '#f7f2e6', '#ddd3bb', 1.3, 1);
  };
  stroke(c, (k) => { k.moveTo(7, 17); k.lineTo(25, 17); }, 2.4, '#f7f2e6');
  doll(8, 17);
  doll(24, 17);
  doll(16, 18);
  dab(c, circle(16, 20, 1), '#c8402f');
}

/** 摆渡人·横江一渡：一道水纹圈住一条小船 */
function ferry(c: Ctx): void {
  badge(c, '#2f8ac8', '#1d5f94');
  blob(c, (k) => { k.moveTo(6, 17); k.lineTo(26, 17); k.lineTo(22, 22); k.lineTo(10, 22); }, '#e2c26a', '#bc9a40', 1.8, 1.2);
  stroke(c, (k) => { k.moveTo(23, 5); k.lineTo(14, 20); }, 2.2, '#7fae5a');
  stroke(c, (k) => { k.moveTo(5, 25); k.quadraticCurveTo(9, 22, 13, 25); k.quadraticCurveTo(17, 28, 21, 25); k.quadraticCurveTo(24, 23, 27, 25); }, 1.8, WHITE);
}

/** 货郎·招财进宝：一枚铜钱，周围几点金光 */
function fortune(c: Ctx): void {
  badge(c, '#d8a21e', '#a87a10');
  blob(c, circle(16, 16, 8.4), '#ffe27a', '#e0b030', 1.8, 1.4);
  blob(c, rrect(12.6, 12.6, 6.8, 6.8, 0.8), '#a87a10', null, 1.5);
  for (const [x, y] of [[26, 7], [6, 8], [25, 25]] as const) {
    stroke(c, (k) => { k.moveTo(x - 2.4, y); k.lineTo(x + 2.4, y); k.moveTo(x, y - 2.4); k.lineTo(x, y + 2.4); }, 1.4, WHITE);
  }
}

/** 阴阳先生·定阵：八角阵里一个太极 */
function array(c: Ctx): void {
  badge(c, '#444a66', '#2a2e44');
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    pts.push(16 + Math.cos(a) * 11.5, 16 + Math.sin(a) * 11.5);
  }
  blob(c, poly(...pts), '#e6d8a0', '#c9b878', 1.6, 1);
  blob(c, circle(16, 16, 7), WHITE, null, 1.6);
  c.save();
  c.beginPath();
  c.arc(16, 16, 7, -Math.PI / 2, Math.PI / 2);
  c.arc(16, 19.5, 3.5, Math.PI / 2, -Math.PI / 2, true);
  c.arc(16, 12.5, 3.5, Math.PI / 2, -Math.PI / 2);
  c.closePath();
  c.fillStyle = INK;
  c.fill();
  c.restore();
  dab(c, circle(16, 12.5, 1.1), WHITE);
  dab(c, circle(16, 19.5, 1.1), INK);
}

const def = (key: string, draw: (c: Ctx) => void): SpriteDef => ({ key, w: 32, h: 32, ox: 0.5, oy: 0.5, draw });

export const SKILL_ICON_SPRITES: SpriteDef[] = [
  def('sk_sweep', sweep),
  def('sk_volley', volley),
  def('sk_dash', dash),
  def('sk_iron', iron),
  def('sk_clap', clap),
  def('sk_spring', spring),
  def('sk_paper', paper),
  def('sk_ferry', ferry),
  def('sk_fortune', fortune),
  def('sk_array', array),
];
