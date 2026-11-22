import type Phaser from 'phaser';

/**
 * 一次性的地上图形（技能落点圈、集结圈、援军预警旗）：用完收回，下次清空重画，不每个事件新建再销毁。
 * 同时在场的最多几个，空闲表跟着最多同时在场的数走，场景关掉时随场景一起销毁。
 */
export class GfxPool {
  private readonly free: Phaser.GameObjects.Graphics[] = [];
  private readonly scene: Phaser.Scene;
  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 拿一个干净的：清空、可见、透明度和缩放复位、原点归零 */
  get(depth: number): Phaser.GameObjects.Graphics {
    const g = this.free.pop() ?? this.scene.add.graphics();
    return g.clear().setVisible(true).setActive(true).setAlpha(1).setScale(1).setPosition(0, 0).setDepth(depth);
  }

  /** 收回：停掉它身上的动画、藏起来 */
  put(g: Phaser.GameObjects.Graphics): void {
    this.scene.tweens.killTweensOf(g);
    g.clear().setVisible(false).setActive(false);
    this.free.push(g);
  }
}
