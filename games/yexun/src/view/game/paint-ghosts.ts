/**
 * 怪的死亡余势：原图在原地被白闪后往上弹一下、压扁着淡掉（一只怪死只占一个特效格），精灵用完放回池里复用。
 */
import Phaser from 'phaser';
import type { Frame } from '../art/atlas.ts';
import { LOW_MEMORY } from '../viewport.ts';

export class DeathGhosts {
  private readonly ghosts: { img: Phaser.GameObjects.Image; x: number; y: number; t: number; size: number; res: number; flip: number }[] = [];
  private readonly free: Phaser.GameObjects.Image[] = [];

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 死亡余势：原图在原地被白闪后往上弹一下、压扁着淡掉（一只怪死只占一个特效格） */
  spawn(f: Frame, x: number, y: number, size: number, heroX: number): void {
    if (LOW_MEMORY || this.ghosts.length >= 24) return;
    const img = this.free.pop() ?? this.scene.add.image(0, 0, f.tex ?? 'atlas', f.key);
    img.setTexture(f.tex ?? 'atlas', f.key).setOrigin(f.ox, f.oy).setVisible(true).setActive(true).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.ghosts.push({ img, x, y, t: 0, size, res: f.res, flip: heroX < x ? -1 : 1 });
  }

  update(dt: number): void {
    const g = this.ghosts;
    let j = 0;
    for (let i = 0; i < g.length; i++) {
      const o = g[i]!;
      o.t += dt;
      const t = o.t / 220;
      if (t >= 1) {
        o.img.setVisible(false).setActive(false);
        this.free.push(o.img);
        continue;
      }
      // 先弹起（缓出），横向撑开、纵向压扁，同时淡掉；前 40% 保持白色
      const e = 1 - (1 - t) * (1 - t);
      o.img
        .setPosition(o.x, o.y - e * 14)
        .setScale((o.flip * o.size * (1 + e * 0.35)) / o.res, (o.size * (1 - e * 0.55)) / o.res)
        .setAlpha(1 - t * t)
        .setDepth(o.y);
      if (t > 0.4) o.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      g[j++] = o;
    }
    g.length = j;
  }
}
