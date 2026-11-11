/**
 * 飞行物（弹幕）的画面：每个弹幕槽位一张图（sGen 变了就是换了一个，重设外观），按种类各自转、拖尾、落地；
 * 光波和桃花雨落点不用图，只把坐标记进 waves / petalMarks，由 GameScene.drawGfx 画；寒泉画在地面层的 Graphics 上。
 * 只读核心的状态，不影响规则。
 */
import type Phaser from 'phaser';
import { MAX_SHOTS, Shot, type World } from '../../core/index.ts';
import type { Frame } from '../art/atlas.ts';
import { LOW_MEMORY } from '../viewport.ts';
import type { Fx } from './fx.ts';

const SHOT_FRAME: Partial<Record<number, string>> = { [Shot.Talisman]: 'talisman', [Shot.Coin]: 'coin', [Shot.Fly]: 'flysword', [Shot.Fireball]: 'fireball', [Shot.Wave]: 'ring', [Shot.Petal]: 'petal', [Shot.Crane]: 'crane', [Shot.Burn]: 'burn', [Shot.Paper]: 'zhibing_s', [Shot.Tide]: 'tide_s', [Shot.SkillFu]: 'talisman' };

export interface ShotsHost {
  scene: Phaser.Scene;
  frame: (key: string) => Frame;
  hasFrame: (key: string) => boolean;
  fx: Fx;
}

export class ShotsView {
  private readonly views: ({ gen: number; img: Phaser.GameObjects.Image; trail: number } | null)[] = new Array(MAX_SHOTS).fill(null);
  /** 这一帧要画的光波：x, y, 半径, 最大半径, 样式（GameScene 每帧画前清空） */
  readonly waves: number[] = [];
  /** 桃花雨的落点标记：x、y、离落地多近（0–1） */
  readonly petalMarks: number[] = [];
  /** 寒泉画在地面层（怪脚下，depth −300），每帧重画 */
  private springG: Phaser.GameObjects.Graphics | null = null;
  private now = 0;

  private readonly h: ShotsHost;

  constructor(h: ShotsHost) {
    this.h = h;
  }

  draw(w: World, now: number, inter: (p: number, c: number) => number): void {
    this.now = now;
    const sg = (this.springG ??= this.h.scene.add.graphics().setDepth(-300));
    sg.clear();
    for (let i = 0; i < MAX_SHOTS; i++) {
      let s = this.views[i];
      if (!w.sAlive[i]) {
        if (s?.img.visible) s.img.setVisible(false);
        continue;
      }
      const kind = w.sKind[i]!;
      const key = kind === Shot.Fireball && w.sState[i] !== 0 ? (w.sState[i] === 1 || w.sState[i] === 4 ? 'ice' : w.sState[i] === 5 ? 'nail' : 'money') : (SHOT_FRAME[kind] ?? 'fireball');
      if (!s || s.gen !== w.sGen[i]) {
        const f = this.h.frame(key);
        // 纸兵的图在特色怪那张图集（atlas.ts）：按帧所在的贴图换，不能只换帧
        const img = s?.img ?? this.h.scene.add.image(0, 0, f.tex ?? 'atlas', f.key);
        img.setTexture(f.tex ?? 'atlas', f.key).setOrigin(f.ox, f.oy).setVisible(true).clearTint();
        const sc = kind === Shot.Talisman ? 1.25 : kind === Shot.SkillFu ? 1.4 : kind === Shot.Coin ? 1.3 : kind === Shot.Fly ? 1.1 : kind === Shot.Petal ? 3 : kind === Shot.Crane ? (w.sIdx[i]! >= 1000 ? 0.8 : 1.3) : kind === Shot.Burn ? 1.6 : kind === Shot.Paper ? 1.5 : 1.2;
        img.setScale(sc / f.res);
        if (key === 'fireball' && !this.h.hasFrame('fireball')) img.setTint(0x7a3aa0);
        if (kind === Shot.SkillFu) img.setTint(0xb48cff);
        // 光波不用图，画在 Graphics 上（drawGfx）
        // 寒泉也不用图：画在地面层的 Graphics 上（怪脚下）
        img.setVisible(kind !== Shot.Wave && kind !== Shot.Spring);
        s = this.views[i] = { gen: w.sGen[i]!, img, trail: 0 };
      }
      const x = inter(w.sPX[i]!, w.sX[i]!);
      const y = inter(w.sPY[i]!, w.sY[i]!);
      if (kind === Shot.Spring) {
        this.drawSpring(sg, x, y, w.sR[i]!, w.sState[i] === 1, Math.min(1, w.sLife[i]! / 15), i);
        continue;
      }
      if (kind === Shot.Wave) {
        // 太极镜：单号白、双号黑
        if (w.sR[i]! > 0) this.waves.push(x, y, w.sR[i]!, w.sDist[i]!, w.sState[i] === 1 ? 1 + (w.sIdx[i]! & 1) : 0);
        continue;
      }
      s.img.setPosition(x, y).setDepth(y + 40);
      if (kind === Shot.Fireball && (w.sState[i] === 1 || w.sState[i] === 4 || w.sState[i] === 5)) s.img.setRotation(Math.atan2(w.sVY[i]!, w.sVX[i]!));
      else if (kind === Shot.Fireball && w.sState[i] === 2) s.img.rotation += 0.12;
      if (kind === Shot.Talisman || kind === Shot.SkillFu) {
        s.img.rotation += 0.35;
        if (!LOW_MEMORY && ++s.trail % 2 === 0) this.h.fx.spawn({ frame: 'mote', x, y, life: 320, s0: 1.1, s1: 0.2, tint: 0xffb42e, rot: Math.random() * 3 });
      } else if (kind === Shot.Coin) {
        s.img.rotation += 0.25;
        if (!LOW_MEMORY && ++s.trail % 3 === 0) this.h.fx.spawn({ frame: 'coin', x, y, life: 160, s0: 1.1, s1: 0.9, a0: 0.4, a1: 0 });
      } else if (kind === Shot.Fly) {
        const st = w.sState[i]!;
        const vx = st === 0 ? 0 : w.sVX[i]!;
        const vy = st === 0 ? -1 : w.sVY[i]!;
        // 剑尖朝飞的方向（图是剑尖朝上）；待命时微微晃
        s.img.setRotation(st === 0 ? Math.sin(this.now * 0.005 + i) * 0.2 : Math.atan2(vy, vx) + Math.PI / 2);
        if (st !== 0 && !LOW_MEMORY) this.h.fx.spawn({ frame: 'flysword', x, y, life: 140, s0: 1.1, s1: 1, a0: 0.35, a1: 0, rot: s.img.rotation, tint: 0x9fd8ff });
      } else if (kind === Shot.Burn) {
        // 地上的火：贴地、一跳一跳，快灭时淡出
        const f = this.h.frame('burn');
        s.img
          .setDepth(y - 30)
          .setScale((1.5 + Math.sin(this.now * 0.03 + i) * 0.1) / f.res, (1.6 + Math.sin(this.now * 0.04 + i * 2) * 0.15) / f.res)
          .setAlpha(Math.min(1, w.sLife[i]! / 20));
      } else if (kind === Shot.Petal) {
        // 从上面飘下来：还剩几拍就离地多高，边落边转
        const left = w.sLife[i]!;
        s.img.setPosition(x + Math.sin(left * 0.7 + i) * 6, y - left * 12).setRotation(left * 0.4 + i).setDepth(y + 40);
        // 地上先亮一圈粉色落点，落地时再迸一小撮花瓣：雪地上也看得见
        this.petalMarks.push(x, y, 1 - Math.min(1, left / 14));
        if (!LOW_MEMORY && left <= 1 && s.trail === 0) {
          s.trail = 1;
          for (let k = 0; k < 4; k++) this.h.fx.spawn({ frame: 'petal', x, y: y - 4, vx: (Math.random() - 0.5) * 200, vy: -70 - Math.random() * 70, g: 320, life: 460, s0: 1.8, s1: 0.8, rot: Math.random() * 6, spin: 9 });
        }
      } else if (kind === Shot.Paper) {
        // 纸兵：朝走的方向，走路一晃一晃；火兵染成橙红，快到寿时变淡
        const dx = w.sX[i]! - w.sPX[i]!;
        if (Math.abs(dx) > 0.2) s.img.setFlipX(dx < 0);
        s.img.setRotation(Math.sin(this.now * 0.018 + i * 1.7) * 0.12).setAlpha(Math.min(1, w.sLife[i]! / 30));
        if (w.merges.includes('huobing')) s.img.setTint(0xffb070);
      } else if (kind === Shot.Tide) {
        // 龙王令的浪：浪头朝走的方向，按浪宽缩放；回程（翻江倒海）颜色深一点；身后甩水花
        const f = this.h.frame('tide_s');
        const back = w.sState[i] === 1;
        // 浪刚出手和卷回来时正压在主角身上：离主角一个浪宽以内淡到 0.4，不把人整个盖住
        const near = Math.hypot(w.sX[i]! - w.x, w.sY[i]! - w.y) < w.sR[i]! * 1.2;
        s.img.setRotation(Math.atan2(w.sVY[i]!, w.sVX[i]!)).setScale((w.sR[i]! / 22) / f.res).setDepth(y + 40).setAlpha(near ? 0.4 : 0.9);
        if (back) s.img.setTint(0x9fc8ff);
        else s.img.clearTint();
        if (!LOW_MEMORY && ++s.trail % 2 === 0) this.h.fx.spawn({ frame: 'mote', x: x + (Math.random() - 0.5) * w.sR[i]!, y: y + (Math.random() - 0.5) * w.sR[i]!, vx: -w.sVX[i]! * 6, vy: -w.sVY[i]! * 6 - 30, life: 300, s0: 1.2, s1: 0.2, tint: 0x3aa8ff });
      } else if (kind === Shot.Crane) {
        const dx = w.sX[i]! - w.sPX[i]!;
        if (Math.abs(dx) > 0.3) s.img.setFlipX(dx < 0);
        const diving = w.sState[i] === 1;
        s.img.setRotation(diving ? Math.atan2(w.sVY[i]!, Math.abs(w.sVX[i]!)) * (dx < 0 ? -1 : 1) * 0.6 : Math.sin(this.now * 0.006 + i) * 0.12).setDepth(y + 200);
        if (diving && !LOW_MEMORY && ++s.trail % 2 === 0) this.h.fx.spawn({ frame: 'crane', x, y, life: 160, s0: 1.3, s1: 1.2, a0: 0.3, a1: 0, sx: s.img.flipX ? -1 : 1, tint: 0xbfd8ff });
      } else {
        s.img.setScale((1.2 + Math.sin(this.now * 0.02 + i) * 0.15) / this.h.frame('fireball').res);
      }
    }
  }

  /**
   * 一眼寒泉：贴地的蓝色圆（大小就是打到的范围），深藏青粗边 + 白色内沿，雪地上一眼分得出；
   * 泉面上两圈涟漪往外荡。玄冥寒潭颜色更深、多一圈霜白。a 是快干时的淡出
   */
  private drawSpring(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, evolved: boolean, a: number, i: number): void {
    g.fillStyle(evolved ? 0x2a6fe8 : 0x4ab4ff, a * 0.3);
    g.fillCircle(x, y, r);
    g.lineStyle(7, 0x0f2a5a, a * 0.85);
    g.strokeCircle(x, y, r);
    g.lineStyle(3, evolved ? 0x9fdcff : 0x3a9cff, a);
    g.strokeCircle(x, y, r - 1);
    g.lineStyle(2, 0xffffff, a * 0.9);
    g.strokeCircle(x, y, r - 5);
    for (let k = 0; k < 2; k++) {
      const t = (this.now * 0.0011 + i * 0.37 + k * 0.5) % 1;
      g.lineStyle(2, 0x1f5fb8, a * (1 - t) * 0.8);
      g.strokeCircle(x, y, r * (0.2 + t * 0.7));
    }
    if (evolved) {
      g.lineStyle(2, 0xe8f8ff, a * 0.7);
      g.strokeCircle(x, y, r * 0.55);
    }
  }
}
