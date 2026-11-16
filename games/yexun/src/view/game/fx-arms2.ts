/**
 * 2.0 第二批法器（铜钱镖、算盘、招魂幡、判官笔、鞭炮）、聚财铜钱雨、幽冥鬼差和五个专属搭配的画面与声音。
 * 做法同 fx-arms.ts：只读核心发的 ArmEv 事件，登记一条"有寿命的特效"，每帧在地面层 / 空中层两个 Graphics 上重画。
 * 雪地很亮：饱和色 + 深色边、普通混合，不用 ADD。省内存模式（?lowmem）不放粒子。
 */
import type Phaser from 'phaser';
import { ArmEv, ArmFx } from '../../core/arms/events.ts';
import { sfx } from '../audio/sfx.ts';
import '../audio/sfx-arms2.ts';
import type { Fx } from './fx.ts';

const TICK = 1000 / 30;
const INK = 0x17131c;
const GOLD = 0xf2c94c;
const GOLD_D = 0x7a4a0a;
const RED = 0xd8402f;
const RED_D = 0x5a1410;
const GHOST = 0xcdf2ec;
const GHOST_D = 0x3a8a88;
const FLAME = 0xffb02e;
const TAU = Math.PI * 2;

type Kind = 'dart' | 'dartHit' | 'bead' | 'settle' | 'banner' | 'ghost' | 'puff' | 'brush' | 'burst' | 'rain' | 'yinlv' | 'seal' | 'coins' | 'yinbing' | 'baozhu' | 'caiyuan' | 'flash';

interface E {
  k: Kind;
  x: number;
  y: number;
  a: number;
  b: number;
  c: number;
  t: number;
  max: number;
  hx: number;
  hy: number;
  seed: number;
}

const MAX_LIVE = 260;
const ease = (p: number): number => 1 - (1 - p) * (1 - p);
const envelope = (p: number, inP: number, outP: number): number => (p < inP ? p / inP : p > 1 - outP ? Math.max(0, (1 - p) / outP) : 1);

export class Arms2FxView {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly air: Phaser.GameObjects.Graphics;
  private list: E[] = [];
  private clock = 0;
  private said = new Set<string>();
  private beadN = 0;
  private dartN = 0;
  private ghostN = 0;

  private readonly fx: Fx;
  private readonly lowMem: boolean;

  constructor(scene: Phaser.Scene, fx: Fx, lowMem: boolean) {
    this.fx = fx;
    this.lowMem = lowMem;
    this.ground = scene.add.graphics().setDepth(-289);
    this.air = scene.add.graphics().setDepth(7901);
  }

  destroy(): void {
    this.ground.destroy();
    this.air.destroy();
  }

  begin(): void {
    this.said.clear();
    this.beadN = 0;
    this.dartN = 0;
    this.ghostN = 0;
  }

  private say(name: Parameters<typeof sfx.play>[0], volume = 0.6): void {
    if (this.said.has(name)) return;
    this.said.add(name);
    sfx.play(name, { volume });
  }

  private add(k: Kind, x: number, y: number, a: number, b: number, c: number, max: number, hx: number, hy: number): E | null {
    if (this.list.length >= MAX_LIVE) return null;
    const e: E = { k, x, y, a, b, c, t: 0, max, hx, hy, seed: Math.random() };
    this.list.push(e);
    return e;
  }

  /** 读一条事件；是本批的返回 true */
  handle(type: number, x: number, y: number, a: number, b: number, c: number, hx: number, hy: number): boolean {
    switch (type) {
      case ArmEv.Dart:
        if (b === 7) {
          this.say('armDartHit', 0.45);
          this.add('dartHit', x, y, a, 0, c, 320, hx, hy);
          if (!this.lowMem) this.sparks(x, y, a ? 7 : 4, 0xffe27a);
        } else if (b === 9) {
          this.say('armDart', a ? 0.7 : 0.55);
          this.add('flash', x, y, 0, a ? 46 : 32, 0, 260, hx, hy);
        } else if (b === 8) this.add('flash', x, y, 0, 26, 0, 240, hx, hy);
        else if (this.dartN++ < 60) this.add('dart', x, y, a, b, c, 110, hx, hy);
        return true;
      case ArmEv.Abacus:
        if (a === 0) {
          if (this.beadN++ < 14) this.add('bead', x, y, 0, b, 0, 520, hx, hy);
        } else {
          this.say('armAbacus', 0.6);
          this.add('settle', x, y, c, b, 0, 800, hx, hy);
        }
        return true;
      case ArmEv.Banner:
        this.say('armBanner', 0.6);
        this.add('banner', x, y, a, b, c, Math.max(30, c) * TICK, hx, hy);
        return true;
      case ArmEv.Ghost:
        if (a === 1) {
          if (this.ghostN++ < 50) this.add('ghost', x, y, c, b, 0, 110, hx, hy);
        } else if (a === 3) {
          this.say('armChai', 0.7);
          this.add('puff', x, y, 1, 90, 0, 700, hx, hy);
        } else if (a === 2) {
          this.say('armDartHit', 0.3);
          this.add('puff', x, y, 0, 36, 0, 320, hx, hy);
        } else {
          this.say('armGhost', 0.5);
          this.add('puff', x, y, 0, 40, 0, 520, hx, hy);
        }
        return true;
      case ArmEv.Brush:
        this.say(c === 1 ? 'armBrushEvo' : 'armBrush', c === 1 ? 0.75 : 0.55);
        this.add('brush', x, y, a, b, c, c === 1 ? 700 : 460, hx, hy);
        if (!this.lowMem) this.inkSplat(x, y, c === 1 ? 10 : 4);
        return true;
      case ArmEv.Cracker:
        this.say(a === 1 ? 'armCrackerEvo' : 'armCracker', a === 1 ? 0.6 : 0.5);
        this.add('burst', x, y, a, b, c, 280, hx, hy);
        if (!this.lowMem) this.paperBits(x, y, a ? 6 : 3);
        return true;
      case ArmEv.Rain:
        this.say('armRain', 0.65);
        this.add('rain', x, y, 0, b, 0, 950, hx, hy);
        return true;
      case ArmEv.Combo:
        return this.combo(x, y, a, b, c, hx, hy);
      default:
        return false;
    }
  }

  private combo(x: number, y: number, fxId: number, b: number, c: number, hx: number, hy: number): boolean {
    switch (fxId) {
      case ArmFx.Yinlv: this.say('armYinlv'); this.add('yinlv', x, y, 0, 0, 0, 420, hx, hy); return true;
      case ArmFx.Maibu:
        this.say('armMaibu', 0.6);
        if (c === 1) {
          this.add('coins', x, y, 0, b, 0, 800, hx, hy);
          if (!this.lowMem) this.sparks(x, y, 8, GOLD);
        } else this.add('seal', x, y, 0, 0, 0, 520, hx, hy);
        return true;
      case ArmFx.Yinbing: this.say('armYinbing'); this.add('yinbing', x, y, 0, 0, 0, 700, hx, hy); return true;
      case ArmFx.Baozhu: this.say('armBaozhu', 0.7); this.add('baozhu', x, y, 0, b, 0, 750, hx, hy); return true;
      case ArmFx.Caiyuan: this.say('armCaiyuan'); this.add('caiyuan', x, y, 0, 0, 0, 480, hx, hy); return true;
      // 规则 55 的搭配：只补一圈淡光（触发很勤，不配音效，不占特效位太多）
      case ArmFx.Fuhuo: this.add('flash', x, y, 0, b, 0, 260, hx, hy); return true;
      case ArmFx.Linfu: this.add('flash', x, y, 0, 24, 0, 200, hx, hy); return true;
      case ArmFx.Lingyan: this.add('flash', x, y, 0, b, 0, 260, hx, hy); return true;
      case ArmFx.Zhonggu: this.add('flash', x, y, 0, Math.min(b, 120), 0, 240, hx, hy); return true;
      // 规则 62 的搭配：笔一类借阴律斩的一笔，锁魂借阴兵借道的升魂；剑走偏锋、寒钟触发勤，只给淡光
      case ArmFx.Jianzou: this.add('flash', x, y, 0, 18, 0, 180, hx, hy); return true;
      case ArmFx.Longshe:
      case ArmFx.Panzhen: this.say('armYinlv', 0.6); this.add('yinlv', x, y, 0, 0, 0, 420, hx, hy); return true;
      case ArmFx.Suohun: this.say('armYinbing', 0.6); this.add('yinbing', x, y, 0, 0, 0, 700, hx, hy); return true;
      case ArmFx.Hanzhong: this.add('flash', x, y, 0, Math.min(b, 140), 0, 260, hx, hy); return true;
      default: return false;
    }
  }

  private sparks(x: number, y: number, n: number, tint: number): void {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * TAU;
      const v = 80 + Math.random() * 120;
      this.fx.spawn({ frame: 'mote', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 70, g: 380, life: 360, s0: 0.7, s1: 0.2, a0: 1, a1: 0, tint });
    }
  }
  private inkSplat(x: number, y: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * TAU;
      const v = 60 + Math.random() * 130;
      this.fx.spawn({ frame: 'mote', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 40, g: 300, life: 420, s0: 0.9, s1: 0.3, a0: 1, a1: 0, tint: k % 3 ? RED : INK });
    }
  }
  private paperBits(x: number, y: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * TAU;
      const v = 70 + Math.random() * 130;
      this.fx.spawn({ frame: 'mote', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 80, g: 360, life: 480, s0: 0.8, s1: 0.5, a0: 1, a1: 0, tint: k % 2 ? RED : FLAME, rot: Math.random() * TAU, spin: 8 });
    }
  }

  update(dt: number): void {
    const gg = this.ground;
    const ag = this.air;
    gg.clear();
    ag.clear();
    this.clock += dt;
    if (this.list.length === 0) return;
    let w = 0;
    for (const e of this.list) {
      e.t += dt;
      if (e.t >= e.max) continue;
      this.list[w++] = e;
      const p = e.t / e.max;
      switch (e.k) {
        case 'dart': this.drawDart(ag, e, p); break;
        case 'dartHit': this.drawRing(ag, e, p, GOLD, GOLD_D, 22 + e.a * 14); break;
        case 'bead': this.drawBead(ag, e, p); break;
        case 'settle': this.drawSettle(gg, ag, e, p); break;
        case 'banner': this.drawBanner(gg, ag, e, p); break;
        case 'ghost': this.drawGhost(ag, e, p); break;
        case 'puff': this.drawPuff(gg, ag, e, p); break;
        case 'brush': this.drawBrush(gg, ag, e, p); break;
        case 'burst': this.drawBurst(ag, e, p); break;
        case 'rain': this.drawRain(gg, ag, e, p); break;
        case 'yinlv': this.drawStroke(ag, e, p, 0x7a5aa0, RED, -0.7, 70); break;
        case 'seal': this.drawSeal(ag, e, p); break;
        case 'coins': this.drawCoins(gg, ag, e, p); break;
        case 'yinbing': this.drawYinbing(ag, e, p); break;
        case 'baozhu': this.drawBaozhu(gg, ag, e, p); break;
        case 'caiyuan': this.drawRing(ag, e, p, GOLD, GOLD_D, 40); break;
        case 'flash': this.drawRing(ag, e, p, 0xfff0a0, GOLD_D, e.b); break;
      }
    }
    this.list.length = w;
  }

  // ───────────────────────── 小零件 ─────────────────────────

  private coin(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, spin: number, alpha: number): void {
    // 旋转：横向压扁成椭圆（铜钱立着转）
    const sx = Math.abs(Math.cos(spin)) * 0.85 + 0.15;
    g.fillStyle(GOLD, alpha);
    g.fillEllipse(x, y, r * 2 * sx, r * 2);
    g.lineStyle(2, GOLD_D, alpha);
    g.strokeEllipse(x, y, r * 2 * sx, r * 2);
    g.fillStyle(INK, alpha * 0.85);
    g.fillRect(x - r * 0.28 * sx, y - r * 0.28, r * 0.56 * sx, r * 0.56);
  }

  private drawRing(ag: Phaser.GameObjects.Graphics, e: E, p: number, fill: number, edge: number, r: number): void {
    const k = 1 - p;
    const rr = r * (0.3 + ease(p) * 0.9);
    ag.lineStyle(5, edge, 0.6 * k);
    ag.strokeCircle(e.x, e.y - 10, rr);
    ag.lineStyle(2.4, fill, 0.95 * k);
    ag.strokeCircle(e.x, e.y - 10, rr);
  }

  // ───────────────────────── 铜钱镖 ─────────────────────────

  private drawDart(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    const r = (e.a ? 10 : 8) * (0.7 + 0.3 * k);
    // 旋转残影：金色的弧
    ag.lineStyle(3, e.c === 2 ? 0xffe27a : GOLD, 0.35 * k);
    ag.strokeCircle(e.x, e.y - 16, r + 5);
    this.coin(ag, e.x, e.y - 16, r, this.clock * 0.03 + e.seed * 6, k);
  }

  // ───────────────────────── 算盘 ─────────────────────────

  private drawBead(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    // 怪头上记账：一列小珠，现在几层亮几颗，新记的那颗闪一下
    const n = Math.min(12, e.b);
    const rise = ease(Math.min(1, p * 3)) * 6;
    const k = envelope(p, 0.1, 0.35);
    const top = e.y - 44 - rise;
    for (let i = 0; i < n; i++) {
      const cx = e.x - 18 + (i % 6) * 7;
      const cy = top - Math.floor(i / 6) * 8;
      const fresh = i === n - 1;
      ag.fillStyle(fresh ? 0xfff0a0 : RED, 0.95 * k);
      ag.fillCircle(cx, cy, fresh ? 3.6 : 3);
      ag.lineStyle(1.6, RED_D, 0.9 * k);
      ag.strokeCircle(cx, cy, fresh ? 3.6 : 3);
    }
  }

  private drawSettle(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = envelope(p, 0.08, 0.4);
    const r = e.b * ease(Math.min(1, p * 2.2));
    gg.fillStyle(GOLD, 0.1 * k);
    gg.fillCircle(e.x, e.y, r);
    gg.lineStyle(6, GOLD_D, 0.5 * k);
    gg.strokeCircle(e.x, e.y, r);
    gg.lineStyle(2.5, 0xfff0a0, 0.95 * k);
    gg.strokeCircle(e.x, e.y, r);
    // 主角头上升起一架算盘：木框、横梁、三排珠子拨过去
    const ax = e.x;
    const ay = e.y - 70 - ease(p) * 16;
    const w = 46;
    const h = 30;
    ag.fillStyle(0xb8803a, k);
    ag.fillRect(ax - w / 2, ay - h / 2, w, h);
    ag.lineStyle(3, INK, k);
    ag.strokeRect(ax - w / 2, ay - h / 2, w, h);
    ag.fillStyle(0xf4ecd4, 0.92 * k);
    ag.fillRect(ax - w / 2 + 4, ay - h / 2 + 4, w - 8, h - 8);
    ag.lineStyle(2, 0x5a3a18, k);
    ag.lineBetween(ax - w / 2 + 4, ay - 3, ax + w / 2 - 4, ay - 3);
    const slide = Math.min(1, p * 4);
    for (let i = 0; i < 5; i++) {
      const bx = ax - w / 2 + 8 + i * 7.6;
      ag.lineStyle(1.2, 0x5a3a18, k);
      ag.lineBetween(bx, ay - h / 2 + 4, bx, ay + h / 2 - 4);
      ag.fillStyle(RED, k);
      ag.fillEllipse(bx, ay - 8, 6, 4.4);
      for (let j = 0; j < 3; j++) ag.fillEllipse(bx, ay + 10 - j * 4.4 - (1 - slide) * (3 + j * 2), 6, 4.4);
    }
    // 珠子飞向被结算的方向：一圈金点
    const n = this.lowMem ? 6 : 12;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + e.seed;
      const rr = r * (0.55 + 0.45 * ((i * 7) % 5) / 5);
      ag.fillStyle(GOLD, 0.9 * k);
      ag.fillCircle(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr * 0.8, 3);
    }
  }

  // ───────────────────────── 招魂幡 ─────────────────────────

  private drawBanner(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = envelope(p, 0.04, 0.12);
    const evo = e.a === 1;
    // 地面：幽冥色的圈（死在里面才变冤魂）
    gg.fillStyle(GHOST_D, 0.1 * k);
    gg.fillCircle(e.x, e.y, e.b);
    gg.lineStyle(4, GHOST_D, 0.45 * k);
    gg.strokeCircle(e.x, e.y, e.b);
    gg.lineStyle(2, GHOST, 0.9 * k);
    gg.strokeCircle(e.x, e.y, e.b);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + this.clock * 0.0006;
      gg.fillStyle(GHOST, 0.8 * k);
      gg.fillCircle(e.x + Math.cos(ang) * e.b, e.y + Math.sin(ang) * e.b * 0.8, 3);
    }
    // 幡：插在地上，幡面随风飘，尾巴撕成条
    const drop = Math.max(0, 1 - e.t / 180);
    const h = evo ? 72 : 58;
    const x = e.x;
    const y = e.y - drop * 50;
    ag.lineStyle(5, INK, k);
    ag.lineBetween(x, y, x, y - h);
    ag.lineStyle(2.4, 0xc9a35a, k);
    ag.lineBetween(x, y, x, y - h);
    const fl = Math.sin(this.clock * 0.008 + x * 0.1) * 6;
    const wd = h * 0.62;
    ag.fillStyle(evo ? 0xffffff : GHOST, 0.92 * k);
    ag.beginPath();
    ag.moveTo(x + 1, y - h);
    ag.lineTo(x + wd, y - h + fl * 0.3);
    ag.lineTo(x + wd * 0.8, y - h * 0.8 + fl);
    ag.lineTo(x + wd, y - h * 0.62 + fl * 0.6);
    ag.lineTo(x + wd * 0.7, y - h * 0.46 + fl * 1.2);
    ag.lineTo(x + 1, y - h * 0.5);
    ag.closePath();
    ag.fillPath();
    ag.lineStyle(2.4, GHOST_D, k);
    ag.strokePath();
    // 幡上的符痕
    ag.lineStyle(2, GHOST_D, 0.8 * k);
    ag.lineBetween(x + 8, y - h + 8, x + 8, y - h * 0.62);
    ag.lineBetween(x + 16, y - h + 8, x + 16, y - h * 0.7);
    // 飘上去的魂火
    if (!this.lowMem) {
      for (let i = 0; i < 3; i++) {
        const t2 = ((this.clock * 0.0005 + i / 3 + e.seed) % 1);
        ag.fillStyle(0xffffff, 0.7 * (1 - t2) * k);
        ag.fillCircle(x + Math.sin(t2 * 9 + i) * 8, y - h - t2 * 34, 3.4 * (1 - t2) + 1);
      }
    }
  }

  private drawGhost(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    const big = e.b === 1;
    const s = big ? 1.9 : 1;
    const back = e.c === 1;
    ag.fillStyle(big ? 0x5a6a8a : GHOST, 0.85 * k);
    ag.fillCircle(e.x, e.y - 16 * s, 8 * s);
    // 拖尾：三个渐小的圆往后
    ag.fillStyle(big ? 0x3a4a6a : 0xe8faf8, 0.5 * k);
    ag.fillCircle(e.x - 8 * s, e.y - 11 * s, 5.4 * s);
    ag.fillCircle(e.x - 14 * s, e.y - 7 * s, 3.4 * s);
    ag.lineStyle(2, big ? INK : GHOST_D, 0.85 * k);
    ag.strokeCircle(e.x, e.y - 16 * s, 8 * s);
    ag.fillStyle(big ? 0xff4a3a : INK, k);
    ag.fillCircle(e.x - 2.6 * s, e.y - 17 * s, 1.5 * s);
    ag.fillCircle(e.x + 2.6 * s, e.y - 17 * s, 1.5 * s);
    if (back) {
      ag.lineStyle(2, 0xffffff, 0.5 * k);
      ag.strokeCircle(e.x, e.y - 16 * s, 12 * s);
    }
  }

  private drawPuff(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    const r = e.b * (0.3 + ease(p) * 0.9);
    const dark = e.a === 1;
    gg.lineStyle(dark ? 8 : 5, dark ? INK : GHOST_D, 0.5 * k);
    gg.strokeCircle(e.x, e.y, r);
    ag.lineStyle(3, dark ? 0xff6a5a : GHOST, 0.95 * k);
    ag.strokeCircle(e.x, e.y - 6, r);
    if (dark) {
      // 鬼差出场：脚下一圈幽火
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU;
        ag.fillStyle(0x6ac8ff, 0.8 * k);
        ag.fillCircle(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r * 0.8 - 6, 5 * k + 1);
      }
    }
  }

  // ───────────────────────── 判官笔 ─────────────────────────

  /** 一笔：从 (x, y) 沿 rot 方向的一条粗线，朱砂红（可换色），头尾尖、带墨边 */
  private drawStroke(ag: Phaser.GameObjects.Graphics, e: E, p: number, edge: number, fill: number, rot: number, len: number): void {
    const grow = ease(Math.min(1, p * 3));
    const k = envelope(p, 0.05, 0.4);
    const dx = Math.cos(rot);
    const dy = Math.sin(rot);
    const x0 = e.x - dx * len * 0.5;
    const y0 = e.y - 14 - dy * len * 0.5;
    const x1 = x0 + dx * len * grow;
    const y1 = y0 + dy * len * grow;
    ag.lineStyle(14, edge, 0.5 * k);
    ag.lineBetween(x0, y0, x1, y1);
    ag.lineStyle(9, INK, 0.9 * k);
    ag.lineBetween(x0, y0, x1, y1);
    ag.lineStyle(6, fill, k);
    ag.lineBetween(x0, y0, x1, y1);
    ag.fillStyle(fill, k);
    ag.fillCircle(x1, y1, 6);
  }

  private drawBrush(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const evo = e.b === 1;
    // 三下三个方向：撇、捺、竖（竖最重）；生死簿是金边黑墨
    const rots = [-0.9, 0.9, 1.5708];
    const len = e.a === 2 ? 92 : 74;
    this.drawStroke(ag, e, p, evo ? GOLD_D : RED_D, evo ? 0x2a2430 : RED, rots[e.a % 3]!, len);
    if (e.c === 1) {
      // 勾销：红圈一收 + 叉
      const k = envelope(p, 0.1, 0.5);
      const r = 36 * (1.2 - ease(Math.min(1, p * 2)) * 0.5);
      ag.lineStyle(7, INK, 0.8 * k);
      ag.strokeCircle(e.x, e.y - 14, r);
      ag.lineStyle(4, RED, k);
      ag.strokeCircle(e.x, e.y - 14, r);
      ag.lineBetween(e.x - r * 0.6, e.y - 14 - r * 0.6, e.x + r * 0.6, e.y - 14 + r * 0.6);
      ag.lineBetween(e.x - r * 0.6, e.y - 14 + r * 0.6, e.x + r * 0.6, e.y - 14 - r * 0.6);
    }
    // 地上的墨点
    gg.fillStyle(evo ? INK : RED_D, 0.3 * (1 - p));
    gg.fillEllipse(e.x, e.y, 30, 14);
  }

  // ───────────────────────── 鞭炮 ─────────────────────────

  private drawBurst(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    const r = Math.max(18, e.b) * (0.5 + ease(p) * 0.7);
    // 八角星爆
    const n = 8;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + e.seed;
      const a1 = ang + 0.2;
      const a2 = ang - 0.2;
      ag.fillStyle(i % 2 ? 0xfff0a0 : FLAME, 0.95 * k);
      ag.fillTriangle(e.x + Math.cos(a1) * r * 0.3, e.y + Math.sin(a1) * r * 0.3, e.x + Math.cos(a2) * r * 0.3, e.y + Math.sin(a2) * r * 0.3, e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r);
    }
    ag.lineStyle(2.4, RED_D, 0.8 * k);
    ag.strokeCircle(e.x, e.y, r * 0.8);
    ag.fillStyle(0xfff6c8, k);
    ag.fillCircle(e.x, e.y, r * 0.28);
    if (e.a === 1) {
      ag.lineStyle(3, RED, 0.7 * k);
      ag.strokeCircle(e.x, e.y, r * 1.1);
    }
  }

  // ───────────────────────── 聚财铜钱雨 ─────────────────────────

  private drawRain(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const r = e.b;
    const k = envelope(p, 0.05, 0.35);
    gg.fillStyle(GOLD, 0.1 * k);
    gg.fillCircle(e.x, e.y, r);
    gg.lineStyle(5, GOLD_D, 0.5 * k);
    gg.strokeCircle(e.x, e.y, r);
    gg.lineStyle(2.4, 0xfff0a0, 0.9 * k);
    gg.strokeCircle(e.x, e.y, r);
    const n = this.lowMem ? 10 : 22;
    for (let i = 0; i < n; i++) {
      const ang = i * 2.399 + e.seed * 6;
      const rr = r * Math.sqrt(((i * 37) % 100) / 100);
      const delay = ((i * 13) % 50) / 100;
      const q = Math.min(1, Math.max(0, (p - delay * 0.5) * 2));
      if (q <= 0 || q >= 1) continue;
      const fall = (1 - q) * (1 - q) * 160;
      this.coin(ag, e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr * 0.8 - fall, 7, this.clock * 0.02 + i, Math.min(1, q * 4) * k);
    }
  }

  // ───────────────────────── 搭配 ─────────────────────────

  private drawSeal(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = envelope(p, 0.1, 0.4);
    const x = e.x;
    const y = e.y - 44 - ease(Math.min(1, p * 3)) * 6;
    ag.fillStyle(0xffe060, 0.95 * k);
    ag.fillRect(x - 7, y - 11, 14, 22);
    ag.lineStyle(2.2, INK, k);
    ag.strokeRect(x - 7, y - 11, 14, 22);
    ag.lineStyle(1.8, RED, k);
    ag.lineBetween(x - 4, y - 5, x + 4, y - 5);
    ag.lineBetween(x - 4, y, x + 4, y);
    ag.lineBetween(x - 4, y + 5, x + 2, y + 5);
  }

  private drawCoins(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = envelope(p, 0.04, 0.4);
    gg.lineStyle(4, GOLD_D, 0.5 * (1 - p));
    gg.strokeCircle(e.x, e.y, e.b * ease(Math.min(1, p * 2)));
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i - 2.5) * 0.45;
      const t = p;
      const vx = Math.cos(ang) * 90;
      const vy = Math.sin(ang) * 150;
      const px = e.x + vx * t * 1.4;
      const py = e.y + vy * t * 1.4 + 260 * t * t;
      this.coin(ag, px, py - 10, 6, this.clock * 0.02 + i, k);
    }
  }

  private drawYinbing(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = envelope(p, 0.1, 0.4);
    const rise = ease(p) * 46;
    ag.fillStyle(0xe8f8f8, 0.85 * k);
    ag.fillCircle(e.x, e.y - 18 - rise, 9);
    ag.fillTriangle(e.x - 8, e.y - 14 - rise, e.x + 8, e.y - 14 - rise, e.x, e.y + 2 - rise * 0.6);
    ag.lineStyle(2, GHOST_D, k);
    ag.strokeCircle(e.x, e.y - 18 - rise, 9);
    ag.fillStyle(INK, k);
    ag.fillCircle(e.x - 3, e.y - 19 - rise, 1.5);
    ag.fillCircle(e.x + 3, e.y - 19 - rise, 1.5);
    // 底下一小片纸屑
    ag.fillStyle(0xf4ecd4, 0.7 * (1 - p));
    ag.fillRect(e.x - 10, e.y - 4, 20, 8);
  }

  private drawBaozhu(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    const r = e.b * ease(Math.min(1, p * 1.6));
    gg.lineStyle(14, RED_D, 0.35 * k);
    gg.strokeCircle(e.x, e.y, r);
    ag.lineStyle(6, RED, 0.8 * k);
    ag.strokeCircle(e.x, e.y, r);
    ag.lineStyle(2.4, 0xfff0a0, 0.95 * k);
    ag.strokeCircle(e.x, e.y, r);
    // 近处一圈红纸屑（粒子之外的一圈小块）
    const n = this.lowMem ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + e.seed;
      const rr = Math.min(r, 160 + p * 260);
      ag.fillStyle(i % 2 ? RED : FLAME, 0.9 * k);
      ag.fillRect(e.x + Math.cos(ang) * rr - 3, e.y + Math.sin(ang) * rr * 0.8 - 3, 6, 6);
    }
  }
}
