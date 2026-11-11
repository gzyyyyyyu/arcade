/**
 * 0.15.0 的四个新角色：纸匠、摆渡人、货郎、阴阳先生的立绘和头像（画法同 heroes.ts：大头 Q 版、墨色粗描边、平涂 + 阴影）。
 * 一人一个函数，各有一件认得出的东西：纸匠的剪刀和纸人串，摆渡人的斗笠蓑衣和长篙，货郎的扁担货担，阴阳先生的太极和罗盘。
 * 和 heroes.ts 一起装进角色小图集（atlas.ts 的 buildHeroAtlas）。
 */
import type { SpriteDef } from './sprites.ts';
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';
import { faceParts, feet, hand, head, heroDefs, robe, sleeves } from './heroes.ts';

// ───────────────────────── 纸匠：蓝布衫、白纸条头巾、剪刀、纸人串 ─────────────────────────

function paperDoll(c: Ctx, x: number, y: number, s = 1): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  blob(c, circle(0, -6, 3.2), '#f7f2e6', '#ddd3bb', 1.4, 1);
  blob(c, poly(-4.5, -2.5, 4.5, -2.5, 6, 8, -6, 8), '#f7f2e6', '#ddd3bb', 1.4, 1);
  blob(c, poly(-4.5, -2.5, -8, 2, -6.5, 4), '#f7f2e6', null, 1.2);
  blob(c, poly(4.5, -2.5, 8, 2, 6.5, 4), '#f7f2e6', null, 1.2);
  dab(c, circle(-1.2, -6.2, 0.6), INK);
  dab(c, circle(1.2, -6.2, 0.6), INK);
  dab(c, circle(0, 2, 1.2), '#c8402f');
  c.restore();
}

function zhijiang(c: Ctx): void {
  feet(c);
  robe(c, '#4a78b8', '#345a90', '#e8e2d2');
  // 腰带 + 一把白纸卷
  blob(c, rrect(18.5, 46, 23, 4, 1.5), '#c9a24a', null, 1.6);
  blob(c, rrect(31, 50, 6, 12, 2), '#f7f2e6', '#ddd3bb', 1.4, 1);
  // 左手举着一串纸人
  sleeves(c, '#4a78b8', '#345a90');
  paperDoll(c, 7, 34, 0.9);
  paperDoll(c, 7 + 11, 36, 0.8);
  stroke(c, (k) => { k.moveTo(11, 40); k.lineTo(15, 41); k.lineTo(19, 41); }, 1.2, '#c8402f');
  hand(c, 13.5, 53);
  // 右手一把大剪刀（两片刃交叉）
  c.save();
  c.translate(48, 50);
  c.rotate(-0.35);
  blob(c, poly(-1.5, -22, 1.5, -22, 2.2, 0, -2.2, 0), '#cfd6e0', '#9aa4b2', 1.4, 1);
  c.rotate(0.28);
  blob(c, poly(-1.5, -22, 1.5, -22, 2.2, 0, -2.2, 0), '#e6ebf2', '#aab4c2', 1.4, 1);
  blob(c, ellipse(-3.5, 4, 3.2, 4.2, 0.3), '#d0362e', null, 1.5);
  blob(c, ellipse(3.5, 4, 3.2, 4.2, -0.3), '#d0362e', null, 1.5);
  c.restore();
  hand(c, 46.5, 54);
  head(c);
  // 头发盖着：圆发髻 + 白纸条头巾，别一朵小纸花
  blob(c, circle(30, 5, 4.6), '#2a2632', '#17141d', 2, 1.4);
  blob(c, (k) => { k.moveTo(12.8, 24); k.quadraticCurveTo(11, 6, 30, 6); k.quadraticCurveTo(49, 6, 47.2, 24); k.quadraticCurveTo(45, 15, 38, 14.5); k.quadraticCurveTo(30, 18, 22, 14.5); k.quadraticCurveTo(15, 15, 12.8, 24); }, '#2a2632', '#17141d', 2.6, 2);
  blob(c, rrect(12, 11, 36, 3.8, 1.6), '#f7f2e6', '#ddd3bb', 1.6, 1);
  blob(c, circle(42, 9.5, 3.2), '#f7f2e6', null, 1.3);
  dab(c, circle(42, 9.5, 1.1), '#d0362e');
  faceParts(c, { blush: 0.8 });
  stroke(c, (k) => { k.moveTo(20.5, 20.5); k.quadraticCurveTo(23.5, 19, 26.5, 20.5); }, 1.4);
  stroke(c, (k) => { k.moveTo(39.5, 20.5); k.quadraticCurveTo(36.5, 19, 33.5, 20.5); }, 1.4);
}

// ───────────────────────── 摆渡人：斗笠、蓑衣、长竹篙 ─────────────────────────

function baidu(c: Ctx): void {
  // 背后斜扛的长竹篙：竹节 + 铁头
  c.save();
  c.translate(50, 66);
  c.rotate(0.12);
  blob(c, rrect(-2, -78, 4.4, 80, 1.6), '#7fae5a', '#5a8a3c', 1.6, 1);
  for (const y of [-60, -40, -20]) stroke(c, (k) => { k.moveTo(-2.2, y); k.lineTo(2.6, y); }, 1.4, '#3f6a28');
  blob(c, poly(-2, -78, 2.4, -78, 0.2, -86), '#8a94a2', null, 1.2);
  c.restore();
  feet(c);
  // 蓑衣：一层层草
  robe(c, '#b8924a', '#8a6a30', '#6a4a22', 3);
  for (let i = 0; i < 6; i++) {
    const y = 42 + i * 4;
    stroke(c, (k) => { k.moveTo(16 - i * 0.6, y); k.quadraticCurveTo(30, y + 3, 44 + i * 0.6, y); }, 1.1, '#6a4a22');
  }
  blob(c, rrect(17, 40, 26, 3.6, 1.5), '#8a3a2a', null, 1.5);
  sleeves(c, '#b8924a', '#8a6a30');
  for (let i = 0; i < 3; i++) {
    stroke(c, (k) => { k.moveTo(11 + i * 2, 50 + i); k.lineTo(10 + i * 2, 55 + i); }, 1.1, '#6a4a22');
    stroke(c, (k) => { k.moveTo(46 + i * 2, 51 - i); k.lineTo(47 + i * 2, 56 - i); }, 1.1, '#6a4a22');
  }
  hand(c, 13.5, 55);
  hand(c, 46.5, 55);
  // 胸前的水波纹护身符
  blob(c, circle(30, 49, 3.2), '#3e8ec0', null, 1.4);
  head(c);
  // 脸被斗笠遮一半；斗笠：宽锥顶 + 椭圆沿
  faceParts(c, { blush: 0.55 });
  stroke(c, (k) => { k.moveTo(20.5, 21); k.lineTo(26.5, 21.6); }, 1.4);
  stroke(c, (k) => { k.moveTo(39.5, 21); k.lineTo(33.5, 21.6); }, 1.4);
  blob(c, (k) => { k.moveTo(2, 15); k.quadraticCurveTo(10, 0, 30, -8); k.quadraticCurveTo(50, 0, 58, 15); k.quadraticCurveTo(30, 21, 2, 15); }, '#e2c26a', '#bc9a40', 2.6, 2);
  for (let i = 0; i < 4; i++) stroke(c, (k) => { k.moveTo(30, -7); k.lineTo(8 + i * 14.5, 15.5 - (i === 1 || i === 2 ? 1.5 : 0)); }, 0.9, '#9a7a30');
  stroke(c, (k) => { k.moveTo(14, 18); k.quadraticCurveTo(30, 22, 46, 18); }, 1.4, '#8a3a2a');
  // 一缕白胡
  blob(c, poly(27, 33.5, 33, 33.5, 30, 41), '#ecebe6', null, 1.2);
}

// ───────────────────────── 货郎：红头巾、青褂、扁担挑两只货担 ─────────────────────────

function basket(c: Ctx, x: number, y: number, goods: string[]): void {
  stroke(c, (k) => { k.moveTo(x - 7, y - 12); k.lineTo(x - 8, y); }, 1.1, '#7a4a20');
  stroke(c, (k) => { k.moveTo(x + 7, y - 12); k.lineTo(x + 8, y); }, 1.1, '#7a4a20');
  blob(c, (k) => { k.moveTo(x - 10, y); k.lineTo(x + 10, y); k.lineTo(x + 7.5, y + 10); k.quadraticCurveTo(x, y + 12, x - 7.5, y + 10); }, '#b08a4a', '#8a6a32', 1.8, 1.4);
  goods.forEach((g, i) => blob(c, circle(x - 5 + i * 5, y - 0.5, 2.6), g, null, 1.2));
  stroke(c, (k) => { k.moveTo(x - 8, y + 4); k.lineTo(x + 8, y + 4); }, 0.9, '#6a4a22');
}

function huolang(c: Ctx): void {
  // 扁担横在肩上，两头各挂一只货担，担头系铃铛
  stroke(c, (k) => { k.moveTo(0, 35); k.quadraticCurveTo(30, 32, 60, 36); }, 3.4, '#7a4a20');
  stroke(c, (k) => { k.moveTo(0, 35); k.quadraticCurveTo(30, 32, 60, 36); }, 1.6, '#c89a5a');
  basket(c, 7, 46, ['#d0362e', '#f2c94c', '#3e8ec0']);
  basket(c, 53, 47, ['#f2c94c', '#58a868', '#d0362e']);
  blob(c, circle(60, 38, 2.2), '#f2c94c', null, 1.2);
  feet(c);
  robe(c, '#2f9a8a', '#1f7466', '#f3efe6');
  blob(c, rrect(18.5, 46, 23, 4, 1.5), '#d0362e', null, 1.6);
  // 胸前挂一串铜钱
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    blob(c, circle(21 + t * 18, 40 + 6 * (1 - (2 * t - 1) * (2 * t - 1)), 2.3), '#f2c94c', '#c89a2a', 1.2, 0.8);
    dab(c, circle(21 + t * 18, 40 + 6 * (1 - (2 * t - 1) * (2 * t - 1)), 0.7), INK);
  }
  sleeves(c, '#2f9a8a', '#1f7466');
  hand(c, 14, 40);
  hand(c, 46, 40);
  head(c);
  // 红头巾，脑后打个结；两撇小胡子
  blob(c, (k) => { k.moveTo(12.6, 22); k.quadraticCurveTo(11, 3, 30, 3.5); k.quadraticCurveTo(49, 3, 47.4, 22); k.quadraticCurveTo(44, 12, 30, 12.5); k.quadraticCurveTo(16, 12, 12.6, 22); }, '#d0362e', '#a32619', 2.6, 2);
  blob(c, poly(44, 9, 54, 4, 52, 11, 56, 15, 46, 14), '#d0362e', '#a32619', 1.6, 1);
  stroke(c, (k) => { k.moveTo(18, 11); k.quadraticCurveTo(30, 8, 42, 11); }, 1.2, '#f2c94c');
  faceParts(c, { happy: true, blush: 0.9 });
  stroke(c, (k) => { k.moveTo(24, 33); k.quadraticCurveTo(19, 33, 17, 37); }, 1.4);
  stroke(c, (k) => { k.moveTo(36, 33); k.quadraticCurveTo(41, 33, 43, 37); }, 1.4);
}

// ───────────────────────── 阴阳先生：黑袍、方巾、胸前太极、手托罗盘 ─────────────────────────

function yinyang(c: Ctx): void {
  feet(c);
  robe(c, '#2e3040', '#1c1e2a', '#c9a24a');
  // 袍上的白领口 + 胸前太极
  blob(c, poly(22.5, 37, 30, 47, 37.5, 37, 34, 37, 30, 42, 26, 37), '#f3efe6', null, 1.6);
  blob(c, circle(30, 53, 6.4), '#f6f2e8', null, 1.6);
  c.save();
  c.beginPath();
  c.arc(30, 53, 6.4, -Math.PI / 2, Math.PI / 2);
  c.arc(30, 56.2, 3.2, Math.PI / 2, -Math.PI / 2, true);
  c.arc(30, 49.8, 3.2, Math.PI / 2, -Math.PI / 2);
  c.closePath();
  c.fillStyle = INK;
  c.fill();
  c.restore();
  dab(c, circle(30, 49.8, 1), '#f6f2e8');
  dab(c, circle(30, 56.2, 1), INK);
  blob(c, rrect(18.5, 45, 23, 3.2, 1.4), '#c9a24a', null, 1.5);
  sleeves(c, '#2e3040', '#1c1e2a');
  // 右手托着一只罗盘
  blob(c, circle(50, 46, 8.5), '#d9ad46', '#b08a2a', 2, 1.4);
  blob(c, circle(50, 46, 5.6), '#f3e6b8', null, 1.3);
  stroke(c, (k) => { k.moveTo(50, 40.8); k.lineTo(50, 51.2); k.moveTo(44.8, 46); k.lineTo(55.2, 46); }, 0.8, '#8a6a22');
  blob(c, poly(50, 41, 51.8, 46, 50, 47, 48.2, 46), '#d0362e', null, 1);
  hand(c, 46, 53);
  hand(c, 13.5, 54);
  // 左手夹一张黄符
  c.save();
  c.translate(10, 44);
  c.rotate(-0.25);
  blob(c, rrect(-3.5, -10, 7, 16, 0.8), '#f2d14a', '#d8b232', 1.4, 1);
  stroke(c, (k) => { k.moveTo(-1.2, -6); k.lineTo(1.2, -6); k.moveTo(0, -6); k.lineTo(0, 2); }, 0.9, '#c8402f');
  c.restore();
  head(c);
  // 头发盖在脸两侧，戴方巾（四方平定巾）
  blob(c, (k) => { k.moveTo(12.6, 25); k.quadraticCurveTo(11, 10, 30, 8.5); k.quadraticCurveTo(49, 10, 47.4, 25); k.quadraticCurveTo(45, 17, 40, 15.5); k.lineTo(20, 15.5); k.quadraticCurveTo(15, 17, 12.6, 25); }, '#2a2632', '#17141d', 2.6, 2);
  blob(c, (k) => { k.moveTo(16, 13); k.lineTo(19, -1); k.lineTo(41, -1); k.lineTo(44, 13); }, '#2e3040', '#1c1e2a', 2.4, 2);
  blob(c, rrect(14.5, 9.5, 31, 4.4, 1.5), '#c9a24a', null, 1.8);
  blob(c, circle(30, 2.5, 2.2), '#d0362e', null, 1.3);
  faceParts(c, { sharp: true, blush: 0.4 });
  stroke(c, (k) => { k.moveTo(19.5, 20.5); k.lineTo(26.5, 20.5); }, 1.8);
  stroke(c, (k) => { k.moveTo(40.5, 20.5); k.lineTo(33.5, 20.5); }, 1.8);
  // 细长的八字胡 + 一缕长须
  stroke(c, (k) => { k.moveTo(29, 31); k.quadraticCurveTo(22, 31, 19, 35); }, 1.3);
  stroke(c, (k) => { k.moveTo(31, 31); k.quadraticCurveTo(38, 31, 41, 35); }, 1.3);
  blob(c, poly(27.5, 34, 32.5, 34, 30.5, 45, 29.5, 45), '#2a2632', null, 1.1);
}

export const CHARS2_SPRITES: SpriteDef[] = [...heroDefs('zhijiang', zhijiang), ...heroDefs('baidu', baidu), ...heroDefs('huolang', huolang), ...heroDefs('yinyang', yinyang)];
