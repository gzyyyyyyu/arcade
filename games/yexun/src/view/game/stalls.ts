/**
 * 摊子的画法（守夜夜市和夜探鬼市共用）：摊、货的图标、价钱、底下的光晕。GameScene 每帧把这一帧的摊子列表传给 sync。
 */
import type Phaser from 'phaser';
import type { MarketGood } from '../../content/market.ts';
import type { Frame } from '../art/atlas.ts';

export interface StallItem {
  x: number;
  y: number;
  icon: string;
  price: number;
  sold: boolean;
  /** 预告阶段：半透明、不写价钱 */
  ghost: boolean;
  name?: string;
}

/** 夜市货的图标：从现有图集里挑意思接近的帧 */
export const MARKET_ICON: Record<MarketGood, string> = { heal: 'bun', reroll: 'p_luopan', ban: 'p_lingpai', might: 'p_zhusha', speed: 'p_caoxie', vacuum: 'scroll', upgrade: 'chest', omen: 'talisman' };

export interface StallHost {
  scene: Phaser.Scene;
  img(key: string, x: number, y: number, scale?: number): Phaser.GameObjects.Image;
  frame(key: string): Frame;
  /** 身上的铜钱：买不起的价钱标红 */
  coins(): number;
  /** 场景时钟（毫秒）：光晕呼吸 */
  now(): number;
}

interface StallView {
  img: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  price: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Image;
  sig: string;
}

export class StallsView {
  private readonly views: StallView[] = [];
  private readonly h: StallHost;

  constructor(host: StallHost) {
    this.h = host;
  }

  /** items 为 null 就全收起；有就按需建、按内容刷新 */
  sync(items: StallItem[] | null): void {
    if (items && this.views.length === 0) {
      for (const it of items) {
        const glow = this.h.img('haze', it.x, it.y - 52, 3).setTint(0xff9a4a).setDepth(it.y - 1).setAlpha(0.5);
        const img = this.h.img('mstall', it.x, it.y).setDepth(it.y);
        const icon = this.h.img('shadow', it.x, it.y - 46).setDepth(it.y + 1).setVisible(false);
        const price = this.h.scene.add
          .text(it.x, it.y + 10, '', { fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffe08a', stroke: '#17131c', strokeThickness: 6, align: 'center' })
          .setOrigin(0.5, 0)
          .setResolution(2)
          .setDepth(it.y + 2);
        this.views.push({ img, icon, price, glow, sig: '' });
      }
    } else if (!items && this.views.length > 0) {
      for (const v of this.views) {
        v.img.destroy();
        v.icon.destroy();
        v.price.destroy();
        v.glow.destroy();
      }
      this.views.length = 0;
    }
    if (!items) return;
        this.views.forEach((v, k) => {
      const it = items[k];
      if (!it) return;
      const afford = this.h.coins() >= it.price;
      const sig = `${it.sold ? 1 : 0}${afford ? 1 : 0}${it.ghost ? 1 : 0}${it.icon}`;
      if (sig !== v.sig) {
        v.sig = sig;
        // 预告时只摆虚影：半透明、不写价钱，让人知道往哪走；卖掉的整摊变暗
        const al = it.ghost ? 0.5 : 1;
        v.img.setAlpha(al).setTint(it.sold ? 0x707078 : 0xffffff);
        v.icon.setAlpha(al);
        v.price.setAlpha(al);
        if (it.sold) {
          v.icon.setVisible(false);
          v.price.setText('售罄').setColor('#9aa0b0');
        } else {
          const f = this.h.frame(it.icon);
          v.icon.setTexture(f.tex ?? 'atlas', f.key).setOrigin(f.ox, f.oy).setScale(1.5 / f.res).setVisible(true);
          const cost = it.ghost ? '' : `${it.price} 钱`;
          v.price.setText(it.name ? `${it.name}\n${cost}`.trim() : cost).setColor(afford ? '#ffe08a' : '#ff5a4a');
        }
      }
      v.glow.setAlpha((it.ghost ? 0.25 : 0.42) + Math.sin(this.h.now() * 0.005 + k * 1.7) * 0.12);
    });
  }
}
