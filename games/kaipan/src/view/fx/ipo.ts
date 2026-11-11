import type Phaser from 'phaser';
import type { IpoOffer } from '../../core/index.ts';
import { COLOR } from '../theme.ts';
import { addText } from '../ui/text.ts';
import type { Animator } from './anim.ts';
import { sparkles } from './particles.ts';

/**
 * 打新的演出（docs/art-v3.md「打新」）：
 * 出签那天收盘，申购中的卡片上摇号约 1 秒，再翻出结果——中签是金卡，没中一行「没中签，现金退回」；
 * 上市首日收盘，溢价的卡片亮金光，破发的盖一层灰。
 * 「减少动态效果」时球不转、不放火花，只淡入淡出；动画关闭（instant）时什么也不画（结果由卡片和大屏的字交代）。
 */

const DEPTH = 410;
const BALLS = [0xff7a33, 0x3f6fe0, 0xd8342c, 0x59d68a, 0xa24fd0];
const GOLD_FILL = 0xffe08a;
const GREY = 0x6b6f78;

/** 摇号：在 rect（申购中那张卡）上转号码球，再翻出结果；返回时演出已收掉。 */
export async function ipoDraw(scene: Phaser.Scene, anim: Animator, rect: { x: number; y: number; w: number; h: number }, won: boolean, offer: IpoOffer): Promise<void> {
  if (anim.instant) return;
  const calm = anim.calm;
  const root = scene.add.container(rect.x + rect.w / 2, rect.y + rect.h / 2).setDepth(DEPTH).setAlpha(0);
  const bg = scene.add.rectangle(0, 0, rect.w, rect.h, COLOR.paper, 1).setRounded(12).setStrokeStyle(3, COLOR.ink, 1);
  const head = addText(scene, 0, -rect.h / 2 + 24, '摇号中…', { size: 16, bold: true, color: COLOR.ink, originX: 0.5, originY: 0.5 });
  const drum = scene.add.rectangle(0, 8, rect.w - 24, rect.h - 100, 0xffffff, 0.9).setRounded(14).setStrokeStyle(2, COLOR.edge, 1);
  root.add([bg, drum, head]);
  const balls = BALLS.map((c, i) => {
    const r = Math.max(9, Math.min(13, (rect.w - 40) / 9));
    const b = scene.add.circle(-((BALLS.length - 1) * r) + i * r * 2, 8, r, c).setStrokeStyle(2, COLOR.ink, 1);
    root.add(b);
    return b;
  });
  const fade = (targets: unknown, alpha: number, duration: number): void => anim.fx({ targets: targets as object, alpha, duration, ease: 'Quad.easeOut' });
  fade(root, 1, 160);
  if (!calm) {
    // 球在筒里乱跳：每个球一条自己的来回路线，错开节奏，约 1 秒
    const halfW = (rect.w - 24) / 2 - 16;
    const halfH = (rect.h - 100) / 2 - 12;
    balls.forEach((b, i) => {
      anim.fx({ targets: b, x: { from: -halfW + i * 6, to: halfW - i * 6 }, duration: 210 + i * 35, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
      anim.fx({ targets: b, y: { from: 8 - halfH, to: 8 + halfH }, duration: 170 + i * 28, yoyo: true, repeat: 3, ease: 'Quad.easeInOut' });
    });
  }
  await anim.wait(calm ? 600 : 1050);
  // 翻出结果
  for (const b of balls) b.destroy();
  drum.destroy();
  bg.setFillStyle(won ? GOLD_FILL : COLOR.paperLo, 1).setStrokeStyle(won ? 5 : 3, won ? COLOR.gold : COLOR.edge, 1);
  head.destroy();
  root.add(addText(scene, 0, -rect.h / 2 + 28, won ? '抽中了！' : '没抽中', { size: won ? 26 : 20, bold: true, color: won ? COLOR.accentDark : COLOR.muted, originX: 0.5, originY: 0.5 }));
  const detail = won ? `${offer.name}\n配到 1 份新股` : '没抽中，现金退回';
  const t = addText(scene, 0, 12, detail, { size: 14, bold: true, color: COLOR.ink, originX: 0.5, originY: 0.5, wrap: rect.w - 20, align: 'center', lineSpacing: 4 });
  root.add(t);
  if (won) {
    if (!calm) root.setScale(0.9);
    if (!calm) anim.fx({ targets: root, scale: 1, duration: 280, ease: 'Back.easeOut' });
    sparkles(scene, anim, root.x, root.y - 20, 16);
  }
  await anim.wait(calm ? 900 : 1200);
  fade(root, 0, calm ? 300 : 260);
  await anim.wait(calm ? 320 : 280);
  root.destroy();
}

/**
 * 上市首日收盘：溢价（>0）的卡片亮金光；破发（<0）的盖一层灰。和黑天鹅的 swanGlow 一个写法，
 * 「减少动态效果」时更短、不放火花。
 */
export function ipoGlow(scene: Phaser.Scene, anim: Animator, rect: { x: number; y: number; w: number; h: number }, premium: number): void {
  if (anim.instant) return;
  const up = premium > 0;
  const box = scene.add.rectangle(rect.x, rect.y, rect.w, rect.h, up ? COLOR.gold : GREY, up ? 0.3 : 0.5).setOrigin(0, 0).setRounded(12).setDepth(DEPTH - 10);
  if (up) box.setStrokeStyle(4, COLOR.gold, 1);
  if (up) sparkles(scene, anim, rect.x + rect.w / 2, rect.y + 60, 10);
  anim.fx({ targets: box, alpha: { from: 1, to: 0 }, duration: anim.calm ? 900 : 1700, ease: 'Sine.easeInOut' }, () => box.destroy());
}
