import type Phaser from 'phaser';
import { fxA } from './art.ts';
import { starOrbit } from './stunfx.ts';

/** 一批星的对象池：每帧 begin → 每个被震的人 mark → end（没用到的收起来）；不新建对象，用到才增长 */
export class StunMarks {
  private pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private scene: Phaser.Scene;
  private r: number;

  constructor(scene: Phaser.Scene, r: number) {
    this.scene = scene;
    this.r = r;
  }

  begin(): void {
    this.used = 0;
  }

  /** (x, y) = 头顶中心（世界坐标）；depth = 要盖过的单位深度 */
  mark(x: number, y: number, now: number, depth: number, leftMs = 1e9): void {
    // 震晕快结束时最后 200 毫秒星星缩小收掉
    const shrink = Math.max(0, Math.min(1, leftMs / 200));
    const p = fxA('stars');
    for (let i = 0; i < 3; i++) {
      let im = this.pool[this.used];
      if (!im) {
        im = this.scene.add.image(0, 0, p.key).setOrigin(p.ax / p.w, p.ay / p.h);
        this.pool.push(im);
      }
      this.used++;
      const o = starOrbit(i, now);
      im.setPosition(x + o.dx, y + o.dy).setScale((o.s * 2.7 * shrink) / this.r).setAlpha(o.a).setDepth(depth + (o.front ? 0.5 : -0.5)).setVisible(true);
    }
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.setVisible(false);
  }

  clear(): void {
    for (const im of this.pool) im.destroy();
    this.pool = [];
    this.used = 0;
  }
}
