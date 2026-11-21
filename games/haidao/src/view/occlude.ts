import Phaser from 'phaser';
import { artBox } from './textures.ts';
import type { Rig } from './rigsprite.ts';
import { boxOf, OCC_CELL, occludes, type OccBox } from './fxlayout.ts';

/**
 * 遮挡剪影（部落冲突那种）：兵走到建筑后面被挡住时，人本身照常不透明，在挡住他的建筑上面另画一张他当前动作的整帧图，
 * 实心浅蓝、半透明，玩家知道他在那儿。建筑的不透明外框（artBox，向里收一圈去掉透明的角）按屏幕格子分桶，
 * 每个兵只查它身体中点所在那一格里的几座建筑，不两两全比；剪影图走对象池，每帧只改属性。
 */

/** 同屏最多画几个剪影：人一多，再多的剪影也看不出来，对象数和每帧改属性的次数封顶 */
const MAX_GHOSTS = 14;

const key = (cx: number, cy: number): number => (cx + 2048) * 4096 + (cy + 2048);

export class Occluder {
  private grid = new Map<number, OccBox[]>();
  private boxes = new Map<number, OccBox>();
  private pool: Phaser.GameObjects.Image[] = [];
  private used = 0;
  private scene: Phaser.Scene;
  /** 测试 / perf：这一帧画了几个剪影 */
  shown = 0;
  /** 测试钩子：画过剪影的帧数累计 */
  frames = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 登记一座会挡人的建筑（开局一次；临时塔造好时再加） */
  add(id: number, img: Phaser.GameObjects.Image): void {
    // 图集里的帧（炮台底座）没扫过外框：按整帧算，boxOf 会再往里收一圈
    const ab = artBox(img.texture.key) ?? { l: 0, t: 0, r: img.width, b: img.height };
    const r = boxOf(img, ab);
    const b: OccBox = { id, ...r, depth: img.depth, img };
    this.remove(id);
    this.boxes.set(id, b);
    for (let cx = Math.floor(b.x0 / OCC_CELL); cx <= Math.floor(b.x1 / OCC_CELL); cx++) {
      for (let cy = Math.floor(b.y0 / OCC_CELL); cy <= Math.floor(b.y1 / OCC_CELL); cy++) {
        const k = key(cx, cy);
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(b);
      }
    }
  }

  /** 建筑倒了：不再挡人 */
  remove(id: number): void {
    const b = this.boxes.get(id);
    if (!b) return;
    this.boxes.delete(id);
    for (const l of this.grid.values()) {
      const i = l.indexOf(b);
      if (i >= 0) l.splice(i, 1);
    }
  }

  begin(): void {
    this.used = 0;
  }

  /** 挡住 (x, y)、深度 du 的最上面那座建筑（没有就 null）；护航商船这种不是 Rig 的东西自己画剪影时用 */
  blocker(x: number, y: number, du: number): OccBox | null {
    const l = this.grid.get(key(Math.floor(x / OCC_CELL), Math.floor(y / OCC_CELL)));
    if (!l || l.length === 0) return null;
    let top: OccBox | null = null;
    for (const b of l) if (occludes(b, x, y, du) && b.img?.visible !== false && (!top || b.depth > top.depth)) top = b;
    return top;
  }

  /** 一个单位：被挡住就在挡它的建筑上面画剪影；depth = 单位的深度 */
  check(rig: Rig, depth: number, now: number): void {
    if (this.used >= MAX_GHOSTS) return;
    const top = this.blocker(rig.x, (rig.y + rig.topY) / 2, depth);
    if (!top) return;
    let im = this.pool[this.used];
    if (!im) {
      im = this.scene.add.image(0, 0, '__DEFAULT').setTint(0xd8ecff).setTintMode(Phaser.TintModes.FILL).setAlpha(0.42).setVisible(false);
      this.pool.push(im);
    }
    if (!rig.ghost(im, now)) return;
    this.used++;
    // 深度没变就不重设（setDepth 会让显示列表重排）
    const d = top.depth + 0.05;
    if (im.depth !== d) im.setDepth(d);
    if (!im.visible) im.setVisible(true);
  }

  end(): void {
    this.shown = this.used;
    if (this.used > 0) this.frames++;
    for (let i = this.used; i < this.pool.length; i++) {
      const im = this.pool[i]!;
      if (im.visible) im.setVisible(false);
    }
  }
}
