import type Phaser from 'phaser';
import { fxF } from './art.ts';
import type { ArtPiece } from './art/index.ts';
import { DEPTH } from './depth.ts';

/** 序列帧特效的种类（art/fx.ts 的 fxFrames）：命中火花 4 帧、爆炸 6 帧、倒塌烟尘 5 帧、刀光 4 帧、枪口火光 3 帧 */
export type FrameKind = 'hit' | 'boom' | 'collapse' | 'slash' | 'muzzle';

/** 每帧停多久（毫秒） */
const FRAME_MS = 70;

interface Slot {
  im: Phaser.GameObjects.Image;
  frames: ArtPiece[];
  t0: number;
  i: number;
  on: boolean;
}

/**
 * 序列帧特效（登陆战、守岛共用）：图像对象池复用，场景每帧调 update 按时间换帧，不在每次爆炸时新建图像、开定时器。
 * 素材开局和别的素材一起烘焙（art/index.ts 的 FX_FRAME_KINDS）。
 */
export class FrameFx {
  private readonly pool: Slot[] = [];
  private readonly scene: Phaser.Scene;
  private readonly r: number;

  constructor(scene: Phaser.Scene, r: number) {
    this.scene = scene;
    this.r = r;
  }

  play(kind: FrameKind, x: number, y: number, size: number, now: number, depth = DEPTH.impactFx): void {
    const frames = fxF(kind);
    const f = frames[0]!;
    let s = this.pool.find((q) => !q.on);
    if (!s) {
      s = { im: this.scene.add.image(0, 0, f.key), frames, t0: 0, i: -1, on: false };
      this.pool.push(s);
    }
    s.frames = frames;
    s.t0 = now;
    s.i = -1;
    s.on = true;
    s.im.setPosition(x, y).setDepth(depth).setScale(size / this.r).setAlpha(1).setVisible(true);
    this.show(s, 0);
  }

  update(now: number): void {
    for (const s of this.pool) {
      if (!s.on) continue;
      const i = Math.floor((now - s.t0) / FRAME_MS);
      if (i >= s.frames.length) {
        s.on = false;
        s.im.setVisible(false);
      } else if (i !== s.i) this.show(s, i);
    }
  }

  private show(s: Slot, i: number): void {
    const f = s.frames[i]!;
    s.i = i;
    s.im.setTexture(f.key).setOrigin(f.ax / f.w, f.ay / f.h);
  }
}
