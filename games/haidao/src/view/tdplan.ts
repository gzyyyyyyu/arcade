import Phaser from 'phaser';
import type { TdBarricade, TdRouteLine, WavePreview } from '../core/index.ts';
import type { TdState } from '../core/tdstate.ts';
import { cellX, cellY } from '../core/grid.ts';
import { UNIT } from '../core/types.ts';
import { tdE } from './art.ts';
import { iso } from './iso.ts';
import { EASE } from './motion.ts';
import { DEPTH } from './depth.ts';

/**
 * 守岛地图上的"作战计划"：下一波要用的登陆路画成路线（地面路 = 实线加往宝藏箱流动的箭头，全是飞的 = 虚线直飞），
 * 路口插一面旗写这一路的敌人头像和数量（雾里的加一只眼睛），首领波旗子变红；没用到的路画淡，关着的落潮路画虚线。
 * 再加场上的拒马（木栅栏 + 血条由 TdScene 的血条统一画）。
 *
 * 数据只在预告变了（开新的一波、墙破了 / 修好了）时由 set() 换一次；每帧 update() 只推箭头和旗子的摆动，
 * 箭头、旗子、旗上的头像和数字都是开场建好的对象池，换数据时复用，不在每帧或每波新建。
 */

/** 旗上最多列几种敌人（多的合并成"…"） */
const FLAG_KINDS = 3;
/** 一条路上最多几个流动箭头 */
const CHEV_MAX = 6;
/** 箭头每秒走几格 */
const CHEV_SPEED = 2.2;

interface Flag {
  c: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icons: Phaser.GameObjects.Image[];
  nums: Phaser.GameObjects.Text[];
  eyes: Phaser.GameObjects.Graphics[];
  x: number;
  y: number;
  ph: number;
}
interface Path {
  pts: Array<{ x: number; y: number }>;
  /** 每段的累计长度（屏幕像素） */
  acc: number[];
  len: number;
  boss: boolean;
}

export class TdPlan {
  private g: Phaser.GameObjects.Graphics;
  private barG: Phaser.GameObjects.Graphics;
  private chev: Phaser.GameObjects.Image[] = [];
  private flags: Flag[] = [];
  private paths: Path[] = [];
  private t = 0;
  private barSig = '';
  /** 上次给路线图设的整体透明度（没变不重设） */
  private lastDim = -1;
  flagCount = 0;
  routeCount = 0;

  private scene: Phaser.Scene;
  private r: number;

  constructor(scene: Phaser.Scene, r: number) {
    this.scene = scene;
    this.r = r;
    // 路线画在地面上、建筑和人下面；拒马按位置排在人中间
    this.g = scene.add.graphics().setDepth(DEPTH.floorOverlay);
    this.barG = scene.add.graphics();
    if (!scene.textures.exists('tdplan.chev')) {
      const k = scene.make.graphics({ x: 0, y: 0 }, false);
      const s = r;
      k.fillStyle(0x2b1a15, 0.9).fillTriangle(0, 0, 18 * s, 7 * s, 0, 14 * s);
      k.fillStyle(0xfff3b0, 1).fillTriangle(3 * s, 3 * s, 13 * s, 7 * s, 3 * s, 11 * s);
      k.generateTexture('tdplan.chev', Math.ceil(18 * s), Math.ceil(14 * s));
      k.destroy();
    }
    for (let i = 0; i < CHEV_MAX * 4; i++) this.chev.push(scene.add.image(0, 0, 'tdplan.chev').setScale(1 / r).setDepth(DEPTH.floorChevron).setVisible(false));
  }

  /** 换一份预告和路线（开新的一波、墙变了时调） */
  set(s: TdState, pv: readonly WavePreview[], routes: readonly TdRouteLine[]): void {
    const g = this.g;
    g.clear();
    this.paths = [];
    const next = pv[0];
    const used = new Set(next?.lanes.filter((l) => !l.fly).map((l) => l.lane) ?? []);
    const boss = !!next?.boss;
    const col = boss ? 0xd93b32 : 0xffb43c;
    this.routeCount = 0;
    for (const rt of routes) {
      const pts = [iso(rt.x + 0.5, rt.y + 0.5), ...rt.cells.map((c) => iso(cellX(c) / UNIT, cellY(c) / UNIT))].map((q) => new Phaser.Math.Vector2(q.x, q.y));
      if (pts.length < 2) continue;
      if (!rt.open) {
        dashed(g, pts, 3, 0xeffcf7, 0.3, 10, 9);
        continue;
      }
      if (!used.has(rt.lane)) {
        g.lineStyle(3, 0xffffff, 0.22).strokePoints(pts, false);
        continue;
      }
      // 下一波要走的路：深色描边 + 亮色实线，箭头往宝藏箱流
      g.lineStyle(10, 0x2b1a15, 0.32).strokePoints(pts, false);
      g.lineStyle(5, col, 0.85).strokePoints(pts, false);
      const acc = [0];
      for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
      this.paths.push({ pts, acc, len: acc[acc.length - 1]!, boss });
      this.routeCount++;
    }
    // 全是飞的那一路：虚线直飞最近的宝藏箱
    const lv = s.level;
    for (const l of next?.lanes ?? []) {
      if (!l.fly) continue;
      const from = l.lane === lv.lanes.length ? lv.tide?.lane : lv.lanes[l.lane];
      if (!from) continue;
      let best = s.treasures[0];
      let bd = Infinity;
      for (const t of s.treasures) {
        const d = (t.x - from.x) ** 2 + (t.y - from.y) ** 2;
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (!best) continue;
      const a = iso(from.x + 0.5, from.y + 0.5);
      const b = iso(best.x + 0.5, best.y + 0.5);
      dashed(g, [a, b], 4, 0x8fd8ff, 0.9, 14, 10);
      this.routeCount++;
    }
    // 旗子：每一路一面，复用对象池
    const lanes = next?.lanes ?? [];
    while (this.flags.length < lanes.length) this.flags.push(this.makeFlag());
    this.flagCount = lanes.length;
    this.flags.forEach((f, i) => {
      const l = lanes[i];
      if (!l) {
        f.c.setVisible(false);
        return;
      }
      const at = l.lane === lv.lanes.length ? lv.tide?.lane : lv.lanes[l.lane];
      if (!at) {
        f.c.setVisible(false);
        return;
      }
      const p = iso(at.x + 0.5, at.y + 0.5);
      this.fillFlag(f, l.enemies, boss);
      f.x = p.x;
      f.y = p.y;
      f.c.setPosition(p.x, p.y).setVisible(true).setScale(0.3);
      this.scene.tweens.killTweensOf(f.c);
      this.scene.tweens.add({ targets: f.c, scale: 1, duration: 360, delay: i * 90, ease: EASE.land });
    });
  }

  /** 每帧：箭头沿路线流动（按帧时间插值），旗子轻轻摆；dim 时（场上正在打）整体淡一点，不抢敌人的眼 */
  update(dt: number, dim: boolean): void {
    this.t += dt / 1000;
    const a = dim ? 0.55 : 1;
    if (a !== this.lastDim) {
      this.lastDim = a;
      this.g.setAlpha(a);
    }
    let k = 0;
    for (const p of this.paths) {
      const n = Math.max(2, Math.min(CHEV_MAX, Math.round(p.len / 120)));
      const v = CHEV_SPEED * 45;
      for (let j = 0; j < n && k < this.chev.length; j++, k++) {
        const d = ((this.t * v + (j * p.len) / n) % p.len + p.len) % p.len;
        const im = this.chev[k]!;
        let i = 1;
        while (i < p.acc.length - 1 && p.acc[i]! < d) i++;
        const a0 = p.pts[i - 1]!;
        const a1 = p.pts[i]!;
        const seg = p.acc[i]! - p.acc[i - 1]! || 1;
        const u = (d - p.acc[i - 1]!) / seg;
        // 两头淡入淡出，箭头不会在路口和箱子边突然冒出 / 消失
        const edge = Math.min(1, d / 40, (p.len - d) / 40);
        im.setPosition(a0.x + (a1.x - a0.x) * u, a0.y + (a1.y - a0.y) * u).setRotation(Math.atan2(a1.y - a0.y, a1.x - a0.x)).setAlpha(edge * a).setVisible(true);
      }
    }
    for (; k < this.chev.length; k++) this.chev[k]!.setVisible(false);
    for (let i = 0; i < this.flagCount; i++) {
      const f = this.flags[i]!;
      f.c.y = f.y - 4 * Math.abs(Math.sin(this.t * 1.6 + f.ph));
      const fa = dim ? 0.8 : 1;
      if (f.c.alpha !== fa) f.c.setAlpha(fa);
    }
  }

  /** 拒马（x、y 是格子）：几根交叉的尖木桩，按剩余血量变暗；只在拒马有变化时重画 */
  barricades(list: readonly TdBarricade[], tick: number): void {
    // 没有拒马、也没有要擦的：不拼签名串
    if (list.length === 0 && this.barSig === '') return;
    const sig = list.map((b) => `${b.id}:${b.x},${b.y}:${Math.ceil((b.hp / Math.max(1, b.maxHp)) * 4)}:${b.until - tick > 40 ? 1 : 0}`).join(';');
    if (sig === this.barSig) return;
    this.barSig = sig;
    const g = this.barG;
    g.clear();
    let depth = 0;
    for (const b of list) {
      const p = iso(b.x + 0.5, b.y + 0.5);
      const f = Math.max(0.25, b.hp / Math.max(1, b.maxHp));
      const wood = Phaser.Display.Color.GetColor(Math.round(150 * f + 60), Math.round(98 * f + 40), Math.round(52 * f + 25));
      const fade = b.until - tick > 40 ? 1 : 0.55;
      g.fillStyle(0x2b1a15, 0.28 * fade).fillEllipse(p.x, p.y + 4, 64, 22);
      for (let k = -2; k <= 2; k++) {
        const x = p.x + k * 11;
        const y = p.y + k * 5.5;
        g.lineStyle(6, 0x2b1a15, fade).lineBetween(x - 7, y + 2, x + 7, y - 22);
        g.lineStyle(6, 0x2b1a15, fade).lineBetween(x + 7, y + 2, x - 7, y - 22);
        g.lineStyle(3.5, wood, fade).lineBetween(x - 7, y + 2, x + 7, y - 22);
        g.lineStyle(3.5, wood, fade).lineBetween(x + 7, y + 2, x - 7, y - 22);
      }
      g.lineStyle(4, 0x2b1a15, fade).lineBetween(p.x - 26, p.y - 4, p.x + 26, p.y + 9);
      g.lineStyle(2.5, 0xc89a5c, fade).lineBetween(p.x - 26, p.y - 4, p.x + 26, p.y + 9);
      depth = Math.max(depth, b.x + b.y + 1);
    }
    g.setDepth(depth + 0.15);
  }

  private makeFlag(): Flag {
    const sc = this.scene;
    const c = sc.add.container(0, 0).setDepth(DEPTH.tdOverlay);
    const pole = sc.add.graphics();
    pole.lineStyle(4, 0x2b1a15, 1).lineBetween(0, 0, 0, -92);
    pole.fillStyle(0x2b1a15, 0.3).fillEllipse(0, 2, 26, 10);
    const bg = sc.add.graphics();
    const icons: Phaser.GameObjects.Image[] = [];
    const nums: Phaser.GameObjects.Text[] = [];
    const eyes: Phaser.GameObjects.Graphics[] = [];
    c.add([pole, bg]);
    for (let i = 0; i < FLAG_KINDS; i++) {
      const im = sc.add.image(0, 0, '__DEFAULT').setVisible(false);
      const tx = sc.add.text(0, 0, '', { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${19 * this.r}px`, color: '#2b1a15' }).setOrigin(0, 0.5).setScale(1 / this.r).setVisible(false);
      const eye = sc.add.graphics().setVisible(false);
      eye.fillStyle(0xffffff, 1).fillEllipse(0, 0, 14, 8).lineStyle(2, 0x2b1a15, 1).strokeEllipse(0, 0, 14, 8).fillStyle(0x2b1a15, 1).fillCircle(0, 0, 2.4);
      icons.push(im);
      nums.push(tx);
      eyes.push(eye);
      c.add([im, tx, eye]);
    }
    return { c, bg, icons, nums, eyes, x: 0, y: 0, ph: this.flags.length * 1.3 };
  }

  private fillFlag(f: Flag, enemies: WavePreview['lanes'][number]['enemies'], boss: boolean): void {
    const shown = enemies.slice(0, FLAG_KINDS);
    const slot = 60;
    const w = Math.max(1, shown.length) * slot + 10;
    const top = -92;
    const h = 44;
    f.bg.clear();
    f.bg.fillStyle(0x2b1a15, 1).fillRoundedRect(-2, top - 2, w + 4, h + 4, 7);
    f.bg.fillStyle(boss ? 0xff8f7a : 0xfff1c4, 1).fillRoundedRect(0, top, w, h, 6);
    // 旗尾的小三角
    f.bg.fillStyle(boss ? 0xd93b32 : 0xffb43c, 1).fillTriangle(w, top + 4, w + 12, top + h / 2, w, top + h - 4);
    for (let i = 0; i < FLAG_KINDS; i++) {
      const e = shown[i];
      const im = f.icons[i]!;
      const tx = f.nums[i]!;
      const eye = f.eyes[i]!;
      if (!e) {
        im.setVisible(false);
        tx.setVisible(false);
        eye.setVisible(false);
        continue;
      }
      const fr = tdE(e.kind, 'walk')[0];
      const x = 6 + i * slot;
      if (fr && this.scene.textures.exists(fr.key)) {
        // 素材按渲染倍数烘焙：1 倍尺寸是 fr.h，缩到 36 像素高
        im.setTexture(fr.key).setOrigin(0.5, 1).setScale(Math.min(1.4, 36 / fr.h) / this.r).setPosition(x + 14, top + h - 3).setVisible(true);
      } else im.setVisible(false);
      tx.setText(`×${e.n}`).setPosition(x + 26, top + h / 2 + 5).setVisible(true);
      eye.setPosition(x + 6, top + 6).setVisible(e.fog);
    }
  }
}

/** 虚线（屏幕像素：实 on、空 off） */
function dashed(g: Phaser.GameObjects.Graphics, pts: ReadonlyArray<{ x: number; y: number }>, w: number, col: number, a: number, on: number, off: number): void {
  g.lineStyle(w, col, a);
  let carry = 0;
  let draw = true;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    let d = 0;
    while (d < len) {
      const step = Math.min((draw ? on : off) - carry, len - d);
      if (draw) {
        const u0 = d / len;
        const u1 = (d + step) / len;
        g.lineBetween(p0.x + (p1.x - p0.x) * u0, p0.y + (p1.y - p0.y) * u0, p0.x + (p1.x - p0.x) * u1, p0.y + (p1.y - p0.y) * u1);
      }
      d += step;
      carry += step;
      if (carry >= (draw ? on : off)) {
        carry = 0;
        draw = !draw;
      }
    }
  }
}
