/**
 * 竹林的竹丛：贴图拼成一张纹理，每丛一张图；主角走到竹丛后面时淡出、挨砍抖一抖、倒了留竹桩。
 * 只读核心的状态（allBlocks、blockHp），不影响规则。
 */
import type Phaser from 'phaser';
import type { World } from '../../core/index.ts';
import { BAMBOO_VARIANTS, BAMBOO_WIDTHS, bambooCanvas, bambooKey, stumpCanvas } from '../art/terrain.ts';
import { sfx } from '../audio/sfx.ts';
import { LOW_MEMORY } from '../viewport.ts';
import type { Fx } from './fx.ts';

export class BambooView {
  /** 第几块竹丛 → 它的图（倒了就删） */
  private readonly views = new Map<number, Phaser.GameObjects.Image>();

  private readonly scene: Phaser.Scene;
  private readonly w: World;

  constructor(scene: Phaser.Scene, w: World) {
    this.scene = scene;
    this.w = w;
  }

  /** 竹林：每丛竹子一张图（按宽度分三档贴图，横向拉伸到脚底宽），深度按脚底；血少了发黄 */
  build(): void {
    const all = this.w.allBlocks;
    if (!all.some((b) => b.look === 'bamboo')) return;
    const res = LOW_MEMORY ? 1 : 2;
    // 6 张竹丛贴图拼成一张纹理（每张是一个帧）：和竹桩一起只占一次纹理切换，同屏几十丛竹子不再每丛打断一次批处理
    if (!this.scene.textures.exists('bamboo_sheet')) {
      // 每个变体一行（一行三种宽度），竹桩接在第一行末尾：整张宽高都在 2,048 以内
      const parts: { key: string; cv: HTMLCanvasElement; x: number; y: number }[] = [];
      let y = 0;
      let width = 0;
      for (let v = 0; v < BAMBOO_VARIANTS; v++) {
        let x = 0;
        let rowH = 0;
        for (const wd of BAMBOO_WIDTHS) {
          const cv = bambooCanvas(wd, v, res);
          parts.push({ key: `bamboo_${wd}_${v}`, cv, x, y });
          x += cv.width;
          rowH = Math.max(rowH, cv.height);
        }
        if (v === 0) {
          const stump = stumpCanvas(res);
          parts.push({ key: 'bamboo_stump', cv: stump, x, y });
          x += stump.width;
        }
        width = Math.max(width, x);
        y += rowH;
      }
      const sheet = document.createElement('canvas');
      sheet.width = width;
      sheet.height = y;
      const sc = sheet.getContext('2d')!;
      for (const q of parts) sc.drawImage(q.cv, q.x, q.y);
      const tex = this.scene.textures.addCanvas('bamboo_sheet', sheet)!;
      for (const q of parts) tex.add(q.key, 0, q.x, q.y, q.cv.width, q.cv.height);
    }
    all.forEach((b, k) => {
      if (b.look !== 'bamboo') return;
      const { key, wd } = bambooKey(b, k);
      const img = this.scene.add.image(b.x + b.w / 2, b.y + b.h + 4, 'bamboo_sheet', key).setOrigin(0.5, 1 - 12 / 250).setDepth(b.y + b.h);
      img.setScale((b.w / wd) / res, 1 / res);
      this.views.set(k, img);
    });
    // 倒了的（回放、继续的局里可能一开始就有）
    this.w.allBlocks.forEach((b, k) => {
      if (b.look === 'bamboo' && this.w.blockHp[k]! <= 0) this.fell(k, false);
    });
  }

  /** 主角走到竹丛后面（脚比竹丛脚底靠上，身子和头落在竹丛图里）时，把那丛竹子淡到 0.35，离开恢复；每帧只过一遍竹丛，不新建对象 */
  fadeOverHero(hx: number, hy: number, dt: number): void {
    if (this.views.size === 0) return;
    const step = Math.min(1, dt / 120);
    for (const [k, img] of this.views) {
      const b = this.w.allBlocks[k]!;
      // 竹丛图的包围盒（原点在底边中心偏上 12/250）；两侧各让出 20%，只在竹子真挡在身前时才淡
      const hw = img.displayWidth * 0.3;
      const bottom = img.y + img.displayHeight * (12 / 250);
      const top = bottom - img.displayHeight;
      const behind = hy < b.y + b.h && hx > img.x - hw && hx < img.x + hw && hy > top && hy - 80 < bottom;
      const want = behind ? 0.35 : 1;
      if (img.alpha === want) continue;
      const a = img.alpha + (want - img.alpha) * step;
      img.setAlpha(Math.abs(a - want) < 0.02 ? want : a);
    }
  }

  /** 竹丛挨了一下：抖一抖，掉几片叶子；血过半发黄 */
  chop(k: number, x: number, y: number, left: number, fell: boolean, fx: Fx): void {
    if (fell) return this.fell(k, true);
    const img = this.views.get(k);
    if (!img) return;
    img.setTint(left < 0.5 ? 0xe6d47a : 0xf4f0b0);
    this.scene.tweens.add({ targets: img, x: { from: img.x - 4, to: img.x }, duration: 140, ease: 'Sine.easeOut' });
    sfx.play('propWood', { pitch: 1.4, volume: 0.5 });
    if (!LOW_MEMORY) for (let n = 0; n < 3; n++) fx.spawn({ frame: 'mote', x: x + (Math.random() - 0.5) * 50, y: y - 80 - Math.random() * 60, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 40, life: 520, s0: 0.9, s1: 0.4, tint: 0x5aa84c });
  }

  /** 竹丛倒了：整丛往一边砸下去、淡出，留一个竹桩 */
  private fell(k: number, animate: boolean): void {
    const b = this.w.allBlocks[k]!;
    const img = this.views.get(k);
    this.views.delete(k);
    const stump = this.scene.add.image(b.x + b.w / 2, b.y + b.h + 2, 'bamboo_sheet', 'bamboo_stump').setScale(1 / (LOW_MEMORY ? 1 : 2)).setDepth(-800);
    if (!img) return;
    if (!animate) {
      img.destroy();
      return;
    }
    stump.setAlpha(0);
    this.scene.tweens.add({ targets: stump, alpha: 1, duration: 300 });
    sfx.play('propWood', { pitch: 0.7 });
    this.scene.tweens.add({ targets: img, angle: b.x % 2 < 1 ? 80 : -80, alpha: 0, duration: 420, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }
}
