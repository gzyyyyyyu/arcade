import Phaser from 'phaser';
import type { SwanNotice } from '../../core/index.ts';
import { SWAN_DEFS, themeById } from '../../core/index.ts';
import { COLOR, FS } from '../theme.ts';
import { addText } from '../ui/text.ts';
import { coverOf, viewOf } from '../viewport.ts';
import type { Animator } from './anim.ts';
import { shake } from './effects.ts';

/**
 * 黑天鹅 Boss 日的演出（docs/art-v3.md「黑天鹅」）：
 * 最后一天开盘全屏黑幕 + 闪电，大字报名字；收盘时躲过的持仓亮绿光，被砸的震屏变灰。
 * 「减少动态效果」时没有闪电、缩放和震屏，只剩黑幕和字的淡入淡出。
 */

const DEPTH = 420;
const UP = 0x59d68a;

/** 一道锯齿闪电：从顶上折下来，白色加粗描边。 */
function bolt(scene: Phaser.Scene, x: number, h: number, seed: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH + 1);
  const rnd = new Phaser.Math.RandomDataGenerator([String(seed)]);
  const pts: { x: number; y: number }[] = [{ x, y: 0 }];
  let cx = x;
  for (let y = 0; y < h; ) {
    y += rnd.between(40, 90);
    cx += rnd.between(-60, 60);
    pts.push({ x: cx, y: Math.min(h, y) });
  }
  for (const [w, c, a] of [[10, 0x9bb8ff, 0.5], [4, 0xffffff, 1]] as const) {
    g.lineStyle(w, c, a);
    g.beginPath();
    g.moveTo(pts[0]?.x ?? x, 0);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
  }
  return g;
}

/** 开盘报幕：返回时幕已经收掉。动画关闭（instant）时什么也不画。 */
export async function swanCurtain(scene: Phaser.Scene, anim: Animator, notice: SwanNotice): Promise<void> {
  if (anim.instant) return;
  const r = coverOf(scene);
  const v = viewOf(scene);
  const down = SWAN_DEFS[notice.kind].down;
  const cx = v.w / 2;
  const cy = v.h / 2;
  const shade = scene.add.rectangle(r.x, r.y, r.w, r.h, 0x05060c, 1).setOrigin(0, 0).setDepth(DEPTH).setAlpha(0).setInteractive();
  const title = addText(scene, cx, cy - 36, `黑天鹅 · ${notice.name}`, { size: 56, bold: true, color: down ? 0xffffff : COLOR.gold, originX: 0.5, originY: 0.5, stroke: 0x000000, strokeWidth: 8 }).setDepth(DEPTH + 2).setAlpha(0);
  const theme = notice.theme ? themeById(notice.theme).name : '';
  const sub = addText(scene, cx, cy + 28, SWAN_DEFS[notice.kind].shout + (theme ? `：${theme}` : ''), { size: FS.xl, bold: true, color: 0xdfe6ff, originX: 0.5, originY: 0.5, stroke: 0x000000, strokeWidth: 5 }).setDepth(DEPTH + 2).setAlpha(0);
  const hint = addText(scene, cx, cy + 74, `避险：${notice.hedge}`, { size: FS.md, color: 0xaab4d6, originX: 0.5, originY: 0.5, stroke: 0x000000, strokeWidth: 4 }).setDepth(DEPTH + 2).setAlpha(0);
  const parts = [title, sub, hint];
  const calm = anim.calm;
  const fade = (targets: unknown, alpha: number, duration: number, delay = 0): void => anim.fx({ targets: targets as object, alpha, duration, delay, ease: 'Quad.easeOut' });
  fade(shade, calm ? 0.8 : 0.9, calm ? 350 : 220);
  if (!calm) {
    title.setScale(1.6);
    anim.fx({ targets: title, scale: 1, duration: 360, delay: 260, ease: 'Back.easeOut' });
    // 两道闪电，闪一下全屏白光
    const flashes: Phaser.GameObjects.GameObject[] = [];
    for (const [i, at] of [200, 520].entries()) {
      anim.fx({
        targets: {},
        duration: 1,
        delay: at,
        onComplete: () => {
          const b = bolt(scene, cx + (i ? 220 : -240), v.h, i + 7);
          const w = scene.add.rectangle(r.x, r.y, r.w, r.h, 0xffffff, 0.55).setOrigin(0, 0).setDepth(DEPTH + 1);
          flashes.push(b, w);
          anim.fx({ targets: [b, w], alpha: { from: 1, to: 0 }, duration: 260, ease: 'Quad.easeIn' }, () => {
            b.destroy();
            w.destroy();
          });
        },
      });
    }
    shake(scene, anim, 380, 0.012);
  }
  for (const [i, p] of parts.entries()) fade(p, 1, calm ? 350 : 200, calm ? 0 : 260 + i * 140);
  await anim.wait(calm ? 1400 : 2100);
  fade([shade, ...parts], 0, calm ? 350 : 380);
  await anim.wait(calm ? 360 : 400);
  shade.destroy();
  for (const p of parts) p.destroy();
}

/**
 * 收盘：一格持仓的结果光效。good 为躲过或受益——绿光呼吸；bad 为被砸——灰色盖一层并震一下屏。
 * 「减少动态效果」只做一次淡入淡出，不震。
 */
export function swanGlow(scene: Phaser.Scene, anim: Animator, rect: { x: number; y: number; w: number; h: number }, good: boolean): void {
  if (anim.instant) return;
  const color = good ? UP : 0x6b6f78;
  const box = scene.add.rectangle(rect.x, rect.y, rect.w, rect.h, color, good ? 0.28 : 0.5).setOrigin(0, 0).setDepth(DEPTH - 10);
  if (good) box.setStrokeStyle(4, UP, 1);
  else shake(scene, anim, 260, 0.01);
  // 躲过的绿光亮一下慢慢退；被砸的灰一下，同样退掉（动态效果关了就更短）
  anim.fx({ targets: box, alpha: { from: 1, to: 0 }, duration: anim.calm ? 900 : 1700, ease: 'Sine.easeInOut' }, () => box.destroy());
}
