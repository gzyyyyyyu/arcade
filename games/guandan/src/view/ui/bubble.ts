/**
 * 飘字和对话气泡：一句话短提示（toast，停一会儿淡出）、头像旁的说话气泡（bubble，尾巴指向说话人）。
 */
import type Phaser from 'phaser';
import { COLOR, TYPE } from '../common/theme.ts';
import { text } from './kit.ts';

/** 一句话短提示：在 (x,y) 浮出、停留、淡出。同一位置的旧提示先移除。 */
let lastToast: Phaser.GameObjects.Container | null = null;
export function toast(scene: Phaser.Scene, msg: string, x: number, y: number, color: number = COLOR.ink): void {
  if (lastToast?.scene) lastToast.destroy();
  const c = scene.add.container(x, y).setDepth(4000);
  const t = text(scene, 0, 0, msg, { size: TYPE.body, color: 0xfff6e0, bold: true });
  const w = t.width + 40;
  const g = scene.add.graphics();
  g.fillStyle(color === COLOR.ink ? 0x2a1a10 : color, 0.9).fillRoundedRect(-w / 2, -22, w, 44, 22);
  g.lineStyle(2, COLOR.gold, 0.8).strokeRoundedRect(-w / 2, -22, w, 44, 22);
  c.add([g, t]);
  c.setAlpha(0);
  lastToast = c;
  scene.tweens.add({ targets: c, alpha: 1, y: y - 8, duration: 160 });
  scene.tweens.add({ targets: c, alpha: 0, delay: 1500, duration: 300, onComplete: () => c.destroy() });
}

/** 对话气泡。dir 表示尾巴指向（说话人在哪边）。 */
/** 气泡的样子：plain 是平常说话；spicy 是嘲讽（红边、淡红底，一眼看出是在逗人） */
export type BubbleTone = 'plain' | 'spicy';
const BUBBLE: Record<BubbleTone, { fill: number; line: number; ink: number }> = {
  plain: { fill: 0xfffaf0, line: 0x5a3a20, ink: COLOR.ink },
  spicy: { fill: 0xffe4d8, line: 0xc8202a, ink: COLOR.redDark },
};

export function bubble(scene: Phaser.Scene, x: number, y: number, msg: string, dir: 'left' | 'right' | 'up' | 'down', tone: BubbleTone = 'plain'): Phaser.GameObjects.Container {
  const k = BUBBLE[tone];
  const c = scene.add.container(x, y).setDepth(3000);
  // 折行按整句平分到几行（每行 220 左右），不让最后一个字单独掉一行（"…赢回" / "来"）
  const style = { size: TYPE.label, color: k.ink, bold: true };
  let t = text(scene, 0, 0, msg, style);
  if (t.width > 220) {
    const full = t.width;
    const lines = Math.ceil(full / 220);
    t.destroy();
    t = text(scene, 0, 0, msg, { ...style, wrap: Math.ceil(full / lines + full / Array.from(msg).length) });
  }
  const w = Math.max(56, t.width + 28);
  const h = t.height + 20;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, 14);
  g.fillStyle(k.fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
  g.lineStyle(2.5, k.line, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
  g.fillStyle(k.fill, 1);
  const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void => {
    g.fillTriangle(ax, ay, bx, by, cx, cy);
    g.lineStyle(2.5, k.line, 1).lineBetween(ax, ay, cx, cy).lineBetween(bx, by, cx, cy);
  };
  if (dir === 'left') tri(-w / 2 + 1, -8, -w / 2 + 1, 8, -w / 2 - 14, 4);
  else if (dir === 'right') tri(w / 2 - 1, -8, w / 2 - 1, 8, w / 2 + 14, 4);
  else if (dir === 'up') tri(-10, -h / 2 + 1, 10, -h / 2 + 1, -4, -h / 2 - 14);
  else tri(-10, h / 2 - 1, 10, h / 2 - 1, -4, h / 2 + 14);
  c.add([g, t]);
  // 记下大小：调用方按边对齐要用（不开输入，不影响点击）
  c.setSize(w, h);
  c.setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
  return c;
}

