/** 一张牌的显示对象：牌面（或牌背）+ 级牌/逢人配标识 + 选中高光。原点在牌中心。 */
import Phaser from 'phaser';
import { isWild, rankOf, type Card } from '../../variants/guandan/core/index.ts';
import { getSettings } from '../store.ts';
import { LIGHT } from '../common/theme.ts';
import { CARD_H, CARD_W, cardKey } from '../common/textures.ts';
import { bakeInto } from '../ui/kit.ts';

export const HAND_W = 92;
export const HAND_H = Math.round((HAND_W * CARD_H) / CARD_W);

export class CardView extends Phaser.GameObjects.Container {
  readonly card: Card;
  private face: Phaser.GameObjects.Image;
  private mark: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;
  private shade: Phaser.GameObjects.Image | null = null;
  private shadow: Phaser.GameObjects.Image;
  private rim: Phaser.GameObjects.Image | null = null;
  private faceUp: boolean;
  readonly cw: number;
  readonly ch: number;

  constructor(scene: Phaser.Scene, x: number, y: number, card: Card, level: number, width = HAND_W, faceUp = true) {
    super(scene, x, y);
    this.card = card;
    this.cw = width;
    this.ch = Math.round((width * CARD_H) / CARD_W);
    this.faceUp = faceUp;
    this.shadow = scene.add.image(0, 0, '__DEFAULT');
    this.drawShadow(false);
    this.add(this.shadow);
    this.face = scene.add.image(0, 0, faceUp ? cardKey(card) : `back:${getSettings().back}`).setDisplaySize(this.cw, this.ch);
    this.add(this.face);
    if (faceUp && level > 0) this.setLevel(level);
    this.setSize(this.cw, this.ch);
    scene.add.existing(this);
  }

  /**
   * 投影（光从上方来，影子往下偏）：一层贴着牌的深影加几圈越来越淡的晕。晕比牌大出几像素，叠放时压在下面那张的边上，
   * 看起来是上面的牌把影子投到了下面的牌上（后画的在上，所以每张牌自己的晕都落在它压住的那一张上）。
   * 选中的牌被举起：牌本身上移了 24，影子留在原来的桌面位置再往下一点（偏下 30），所以更靠下、更淡更软（晕只往下长，不横着压到邻牌），
   * 一眼看得出牌和桌面之间有一段空气。宽度小的牌（桌上出的牌）按宽度缩。
   * 按（牌宽, 举没举起）烘成一张图共用：以前每张牌一个 Graphics，几十张牌的圆角每帧重新三角化，占了牌桌上大半的脚本时间。
   */
  private drawShadow(lifted: boolean): void {
    const { cw, ch } = this;
    const k = cw / HAND_W;
    const dy = (lifted ? 30 : 3) * k;
    const x0 = -cw / 2;
    const y0 = -ch / 2;
    const r = cw * 0.07;
    // 外框：举起时晕最大往外 4k、往下 dy + 19.2k；平放时往外 3.2k
    const box = lifted ? { x: x0 - 4 * k, y: y0 + dy, w: cw + 8 * k, h: ch + 19.2 * k + 1 } : { x: x0 - 3.2 * k, y: y0 - 2 * k + dy * 0.6, w: cw + 6.4 * k, h: ch + 4.8 * k + dy };
    bakeInto(this.shadow, `cardShadow:${cw}x${ch}:${lifted ? 1 : 0}`, { x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, (g) => {
      if (lifted) {
        // 由大到小、由淡到深，层间差很小（不出台阶）；晕只往下长、左右几乎不出牌宽，免得横着压到左右两张没选的牌上发脏
        const rings = [[16, 0.05], [12, 0.06], [8, 0.07], [4, 0.09]] as const;
        for (const [sp, a] of rings) {
          const s = sp * k;
          g.fillStyle(LIGHT.shadow, a).fillRoundedRect(x0 - s * 0.25, y0 + dy, cw + s * 0.5, ch + s * 1.2, r + s * 0.5);
        }
        g.fillStyle(LIGHT.shadow, 0.3).fillRoundedRect(x0 + 2 * k, y0 + dy + 1 * k, cw - 4 * k, ch - 1 * k, r);
        return;
      }
      const spread = 2 * k;
      g.fillStyle(LIGHT.shadow, 0.09).fillRoundedRect(x0 - spread * 1.6, y0 - spread + dy * 0.6, cw + spread * 3.2, ch + spread * 2.4, r + spread);
      g.fillStyle(LIGHT.shadow, 0.13).fillRoundedRect(x0 - spread, y0 - spread * 0.5 + dy * 0.6, cw + spread * 2, ch + spread * 1.6, r + spread * 0.6);
      g.fillStyle(LIGHT.shadow, 0.26).fillRoundedRect(x0 + 1, y0 + dy, cw, ch, r);
    });
  }

  /** 贴在牌上的一层（选中高光、悬停描边、压暗），按牌宽烘一次共用 */
  private overlay(kind: string, draw: (g: Phaser.GameObjects.Graphics) => void): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, '__DEFAULT');
    bakeInto(img, `cardFx:${kind}:${this.cw}x${this.ch}`, { x: -this.cw / 2 - 4, y: -this.ch / 2 - 4, w: this.cw + 8, h: this.ch + 8 }, draw);
    this.add(img);
    return img;
  }

  /** 按本副级数加标识：逢人配（红桃级牌）更醒目，其余级牌金色角标。 */
  setLevel(level: number): void {
    this.mark?.destroy();
    this.mark = null;
    if (!this.faceUp) return;
    const key = isWild(this.card, level) ? 'mark:wild' : rankOf(this.card) === level ? 'mark:level' : null;
    if (key) {
      this.mark = this.scene.add.image(0, 0, key).setDisplaySize(this.cw, this.ch);
      this.add(this.mark);
    }
  }

  flip(up: boolean, level: number): void {
    this.faceUp = up;
    this.face.setTexture(up ? cardKey(this.card) : `back:${getSettings().back}`).setDisplaySize(this.cw, this.ch);
    this.setLevel(level);
  }

  /** 选中：金色描边高光。 */
  setSelected(on: boolean): void {
    if (on !== !!this.glow) this.drawShadow(on);
    if (on && !this.glow) {
      this.glow = this.overlay('glow', (g) => {
        g.lineStyle(4, 0xffd25a, 1).strokeRoundedRect(-this.cw / 2 - 1, -this.ch / 2 - 1, this.cw + 2, this.ch + 2, this.cw * 0.08);
        g.fillStyle(0xffe08a, 0.16).fillRoundedRect(-this.cw / 2, -this.ch / 2, this.cw, this.ch, this.cw * 0.07);
      });
    } else if (!on && this.glow) {
      this.glow.destroy();
      this.glow = null;
    }
  }

  /** 鼠标停在上面（只电脑）：浅色描边，位置上浮由 HandView 管。 */
  setHover(on: boolean): void {
    if (on && !this.rim) {
      this.rim = this.overlay('rim', (g) => g.lineStyle(3, 0xfff6d8, 0.95).strokeRoundedRect(-this.cw / 2 - 1, -this.ch / 2 - 1, this.cw + 2, this.ch + 2, this.cw * 0.08));
    } else if (!on && this.rim) {
      this.rim.destroy();
      this.rim = null;
    }
  }

  /** 不能点（进贡时不允许交的牌）：压暗。 */
  setDim(on: boolean): void {
    if (on && !this.shade) {
      this.shade = this.overlay('dim', (g) => g.fillStyle(0x1a120c, 0.5).fillRoundedRect(-this.cw / 2, -this.ch / 2, this.cw, this.ch, this.cw * 0.07));
    } else if (!on && this.shade) {
      this.shade.destroy();
      this.shade = null;
    }
  }
}
