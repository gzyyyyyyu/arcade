/**
 * 掉落物（魂珠、铜钱、包子、符卷、炸弹、钱袋、宝箱）的画面：每个掉落槽位一张图，换了一个（dGen 变了）就重设外观；
 * 只读核心的状态，不影响规则。
 */
import type Phaser from 'phaser';
import { Drop, MAX_DROPS, type World } from '../../core/index.ts';
import type { Frame } from '../art/atlas.ts';

export interface DropsHost {
  scene: Phaser.Scene;
  frame: (key: string) => Frame;
}

export class DropsView {
  private readonly views: ({ gen: number; img: Phaser.GameObjects.Image; kind: number; key: string; big: boolean } | null)[] = new Array(MAX_DROPS).fill(null);

  private readonly h: DropsHost;

  constructor(h: DropsHost) {
    this.h = h;
  }

  draw(w: World, now: number, inter: (p: number, c: number) => number): void {
    for (let i = 0; i < MAX_DROPS; i++) {
      let d = this.views[i];
      if (!w.dAlive[i]) {
        if (d?.img.visible) d.img.setVisible(false);
        continue;
      }
      const kind = w.dKind[i]!;
      const v = w.dVal[i]!;
      const key = kind === Drop.Soul ? (v >= 5 ? 'bead3' : v >= 2 ? 'bead2' : 'bead1') : kind === Drop.Coin ? 'coin' : kind === Drop.Bun ? 'bun' : kind === Drop.Scroll ? 'scroll' : kind === Drop.Bomb ? 'drop_bomb' : kind === Drop.Purse ? 'drop_purse' : 'chest';
      // 魂珠比怪小一号、颜色淡，不抢眼；超过上限并成的大珠（经验 ≥ 20）放大、一闪一闪，看得出值得去捡
      const big = kind === Drop.Soul && v >= 20;
      const sc = kind === Drop.Chest ? 1.2 : kind === Drop.Soul ? (big ? 1.5 : 0.75) : kind === Drop.Bomb || kind === Drop.Purse ? 1.2 : 1;
      if (!d || d.gen !== w.dGen[i] || d.kind !== kind || d.key !== key || d.big !== big) {
        const f = this.h.frame(key);
        const img = d?.img ?? this.h.scene.add.image(0, 0, 'atlas', f.key);
        img.setFrame(f.key).setOrigin(f.ox, f.oy).setVisible(true).setScale(sc / f.res);
        d = this.views[i] = { gen: w.dGen[i]!, img, kind, key, big };
      }
      if (big) d.img.setScale((sc + Math.sin(now * 0.008 + i) * 0.12) / this.h.frame(key).res);
      const x = inter(w.dPX[i]!, w.dX[i]!);
      const y = inter(w.dPY[i]!, w.dY[i]!);
      // 炸弹和钱袋比别的掉落更值得捡：浮得高一点、跟着呼吸一胀一缩，带着自己的光晕，远远就认得
      const special = kind === Drop.Bomb || kind === Drop.Purse;
      if (special) d.img.setScale((sc + Math.sin(now * 0.008 + i) * 0.08) / this.h.frame(key).res);
      d.img.setPosition(x, y + (kind === Drop.Chest ? 0 : special ? -4 + Math.sin(now * 0.006 + i) * 4 : Math.sin(now * 0.006 + i) * 2)).setDepth(kind === Drop.Chest ? y : -300 + y * 0.0001);
    }
  }
}
