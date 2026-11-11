import type Phaser from 'phaser';
import { ROPE_BACK_MS, arcLift, arcSlope, flightK, ropeBack, shadowLook, onSand, type LandMat } from './aim.ts';
import { fxA, type ArtPiece } from './art.ts';
import type { Particles } from './fx.ts';
import type { Muzzle, Turret } from './turret.ts';
import { DEPTH } from './depth.ts';

/**
 * 弹道（登陆战和守岛共用）：炮弹、子弹、鱼叉、火箭按规则的发射拍 / 命中拍逐帧插值，弧线（aim.ts 的 arcLift）
 * 加地面阴影（随高度变小变淡）；落点按材质出尘土 / 水花 / 木屑 / 石屑；鱼叉拖一根绳，命中后收回炮台。
 * 图像对象池复用（不在开火时新建图像），阴影和绳子画在两张每帧清空重画的 Graphics 上。
 */

export type ShotFx = 'ball' | 'bullet' | 'shell' | 'flame' | 'rocket' | 'harpoon' | 'tar' | 'shock' | 'grenade' | 'snipe';
/** 落地的分量：决定尘土多少、要不要冲击圈 */
export type LandKind = 'ball' | 'shell' | 'bullet' | 'harpoon' | 'rocket' | 'shock' | 'grenade' | 'snipe' | 'none';

export interface ShotIn {
  fx: ShotFx;
  /** 出发点（炮口，屏幕）和它正下方的地面点、目标脚下的地面点 */
  sx: number;
  sy: number;
  gx: number;
  gy: number;
  tx: number;
  ty: number;
  /** 命中时离地多高（打在人身上 ≈ 12） */
  e1: number;
  /** 规则的发射拍、命中拍 */
  t0: number;
  t1: number;
  /** 弧顶高度（像素，aim.ts 的 arcHeight） */
  arc: number;
  /** 朝飞行方向转（火箭、鱼叉、子弹） */
  aimed: boolean;
  land: LandKind;
  mat: LandMat;
  /** 鱼叉：拖绳子、命中后收回这座炮台 */
  rope?: Turret | null;
  /** 不画（喷火塔的火团：火舌由炮台画） */
  hidden?: boolean;
  /** 直射：飞行中跟着这个敌人的实时位置更新落点（-1 / 不填 = 飞向 tx,ty 不变） */
  tid?: number;
  /** 落点的作用范围（屏幕上椭圆的横向半径，像素）：手雷在落地前把它画成地上的范围圈，震荡波落地时扩成这么大 */
  ring?: number;
}

/** 减少动效：范围圈不脉动、冲击波只画一帧淡出的圈 */
const STILL = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 各弹种阴影的大小（像素，贴地时） */
const SHADOW: Record<ShotFx, number> = { ball: 11, shell: 15, bullet: 5, harpoon: 9, rocket: 9, tar: 12, flame: 0, shock: 7, grenade: 7, snipe: 4 };

interface Slot extends ShotIn {
  im: Phaser.GameObjects.Image;
  on: boolean;
  /** 0 = 飞行中，1 = 鱼叉收回中 */
  phase: 0 | 1;
  back: number;
  top: number;
  e0: number;
  key: string;
  /** 落点（鱼叉收回的起点） */
  lx: number;
  ly: number;
}

/** 地面冲击波：一圈粗的、带亮边的椭圆从落点扩到作用范围，再淡出（震荡波、手雷爆炸共用；画在每帧重画的 Graphics 上） */
interface Wave {
  x: number;
  y: number;
  R: number;
  age: number;
  grow: number;
  life: number;
  color: number;
  edge: number;
  /** 起手那一下整个范围亮一闪 */
  flash: number;
}

/** 狙击弹迹：开火后从炮口到命中点留一道白线，几十毫秒内淡掉（减弱动态时短一点、不拖尾） */
interface Streak {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
  on: boolean;
}
export const STREAK_MS = 260;
const STREAK_POOL = 6;

/** 落点粒子的同屏软上限（粒子池本身 140，火箭尾烟等另用） */
const IMPACT_CAP = 96;

const tmpM: Muzzle = { x: 0, y: 0, gx: 0, gy: 0, z: 0 };

export class Shots {
  private pool: Slot[] = [];
  private scene: Phaser.Scene;
  private r: number;
  private pt: Particles;
  private shadowG: Phaser.GameObjects.Graphics;
  private ropeG: Phaser.GameObjects.Graphics;
  private art = new Map<string, ArtPiece>();
  private trail = 0;
  /** 落点序号：和落点坐标一起喂散列，同一处连着落两发也不会长一个样；每局从 0 数起，所以回放一致 */
  private seq = 0;
  private waves: Wave[] = [];
  private streaks: Streak[] = Array.from({ length: STREAK_POOL }, () => ({ x0: 0, y0: 0, x1: 0, y1: 0, age: 0, on: false }));
  /** 查敌人的实时脚下位置（屏幕），写进 out；敌人没了返回 false。由场景设置 */
  follow: ((id: number, out: { x: number; y: number }) => boolean) | null = null;
  private readonly fp = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, r: number, pt: Particles, shadowDepth: number) {
    this.scene = scene;
    this.r = r;
    this.pt = pt;
    this.shadowG = scene.add.graphics().setDepth(shadowDepth);
    this.ropeG = scene.add.graphics().setDepth(DEPTH.shotRope);
  }

  /** 上一帧两张 Graphics 上画了东西（空了要清一次） */
  private drawn = false;

  private anyOn(): boolean {
    for (const s of this.pool) if (s.on) return true;
    for (const t of this.streaks) if (t.on) return true;
    return false;
  }

  get live(): number {
    let n = 0;
    for (const s of this.pool) if (s.on) n++;
    return n;
  }

  start(o: ShotIn): void {
    let s = this.pool.find((q) => !q.on);
    if (!s) {
      const im = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false).setDepth(DEPTH.shot);
      s = { ...o, im, on: false, phase: 0, back: 0, top: 0, e0: 0, key: '', lx: 0, ly: 0 };
      this.pool.push(s);
    }
    Object.assign(s, o);
    s.on = true;
    s.phase = 0;
    s.back = 0;
    s.e0 = Math.max(0, o.gy - o.sy);
    s.top = Math.max(s.e0, o.e1) + o.arc;
    s.rope = o.rope ?? null;
    s.hidden = o.hidden ?? false;
    s.tid = o.tid ?? -1;
    s.ring = o.ring ?? 0;
    let p = this.art.get(o.fx);
    if (!p) this.art.set(o.fx, (p = fxA(o.fx)));
    if (s.key !== p.key) {
      s.key = p.key;
      s.im.setTexture(p.key).setOrigin(p.ax / p.w, p.ay / p.h);
    }
    s.im.setScale((o.fx === 'grenade' ? 2 : 1) / this.r).setRotation(0).setAlpha(1).setVisible(false);
  }

  /** 每帧：now = 规则拍 + 帧内比例；dt 毫秒（冻住时 0） */
  update(now: number, dt: number): void {
    const sg = this.shadowG;
    const rg = this.ropeG;
    // 空场：上一帧也没画东西就什么都不做（不白清两张 Graphics）
    const active = this.waves.length > 0 || this.anyOn();
    if (!active && !this.drawn) return;
    this.drawn = active;
    sg.clear();
    rg.clear();
    if (!active) return;
    this.drawWaves(sg, dt);
    this.drawStreaks(rg, dt);
    for (const s of this.pool) {
      if (!s.on) continue;
      if (s.phase === 1) {
        this.reel(s, dt);
        continue;
      }
      const k = flightK(now, s.t0, s.t1);
      if (k < 1 && s.tid !== undefined && s.tid >= 0 && this.follow) {
        // 目标倒下了就保持上一个落点
        if (this.follow(s.tid, this.fp)) {
          s.tx = this.fp.x;
          s.ty = this.fp.y;
        }
      }
      const lift = arcLift(k, s.e0, s.e1, s.arc);
      // 手雷：落地前地上先亮出爆炸范围圈（越近越实、轻轻脉动），一眼看出要炸到哪
      if (s.fx === 'grenade' && s.ring && !s.hidden) this.zone(sg, s, k, now);
      const gx = s.gx + (s.tx - s.gx) * k;
      const gy = s.gy + (s.ty - s.gy) * k;
      const x = gx + (s.sx - s.gx) * (1 - k);
      const y = gy - lift;
      if (!s.hidden) {
        s.im.setPosition(x, y).setVisible(true);
        if (s.aimed) {
          const dx = s.tx - s.gx - (s.sx - s.gx);
          const dy = s.ty - s.gy - arcSlope(k, s.e0, s.e1, s.arc);
          s.im.setRotation(Math.atan2(dy, dx));
        } else if (s.fx === 'ball' || s.fx === 'shell') s.im.setRotation(s.im.rotation + dt * 0.012);
        else if (s.fx === 'grenade') s.im.setRotation(s.im.rotation + dt * (STILL ? 0 : 0.016));
        // 火箭尾烟：隔几帧留一团
        if (s.fx === 'rocket' && ++this.trail % 3 === 0 && this.pt.live < 110) this.pt.emit('puff', x, y, { life: 380, s0: 0.3, s1: 0.75, a0: 0.65, tint: 0xc3c5cc, depth: DEPTH.rocketTrail });
        const sz = SHADOW[s.fx];
        if (sz > 0) {
          const [sc, a] = shadowLook(lift, s.top);
          sg.fillStyle(0x0b1a2a, a).fillEllipse(gx, gy, sz * 2 * sc, sz * sc);
        }
        if (s.rope) {
          s.rope.muzzle(tmpM);
          this.line(tmpM.x, tmpM.y, x, y, 0);
        }
      }
      if (k >= 1) {
        if (s.fx === 'snipe' && !s.hidden) this.streak(s.sx, s.sy, x, y);
        this.land(s, x, gy);
        if (s.rope && !s.hidden) {
          s.phase = 1;
          s.lx = x;
          s.ly = y;
        } else {
          s.on = false;
          s.im.setVisible(false);
        }
      }
    }
  }

  /** 画并推进地面冲击波：0→grow 毫秒扩到满（先快后慢），之后到 life 毫秒淡出 */
  private drawWaves(g: Phaser.GameObjects.Graphics, dt: number): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.age += dt;
      if (w.age >= w.life) {
        this.waves.splice(i, 1);
        continue;
      }
      const e = STILL ? 1 : 1 - (1 - Math.min(1, w.age / w.grow)) ** 3;
      const fade = w.age <= w.grow ? 1 : 1 - (w.age - w.grow) / (w.life - w.grow);
      if (fade < 0.02) continue;
      const rx = w.R * (0.15 + 0.85 * e);
      if (w.flash > 0 && w.age < 220) g.fillStyle(w.color, w.flash * (1 - w.age / 220)).fillEllipse(w.x, w.y, rx * 2, rx);
      g.fillStyle(w.color, 0.18 * fade).fillEllipse(w.x, w.y, rx * 2, rx);
      g.lineStyle(7, w.color, 0.55 * fade).strokeEllipse(w.x, w.y, rx * 2, rx);
      g.lineStyle(3, w.edge, 0.95 * fade).strokeEllipse(w.x, w.y, rx * 2 - 2, rx - 1);
    }
    if (this.waves.length > 12) this.waves.splice(0, this.waves.length - 12);
  }

  /** 记一道弹迹（对象池里取一个空的，满了就顶掉最老的） */
  private streak(x0: number, y0: number, x1: number, y1: number): void {
    let t = this.streaks.find((q) => !q.on);
    if (!t) t = this.streaks.reduce((a, b) => (a.age > b.age ? a : b));
    t.x0 = x0;
    t.y0 = y0;
    t.x1 = x1;
    t.y1 = y1;
    t.age = 0;
    t.on = true;
  }

  private drawStreaks(g: Phaser.GameObjects.Graphics, dt: number): void {
    const life = STILL ? 140 : STREAK_MS;
    for (const t of this.streaks) {
      if (!t.on) continue;
      t.age += dt;
      if (t.age >= life) {
        t.on = false;
        continue;
      }
      const f = 1 - t.age / life;
      // 外一层柔光、内一条白芯；尾（炮口一端）比头先淡
      g.lineStyle(5, 0xffffff, 0.22 * f).lineBetween(t.x0, t.y0, t.x1, t.y1);
      g.lineStyle(2, 0xffffff, 0.95 * f).lineBetween(t.x0 + (t.x1 - t.x0) * (1 - f) * 0.6, t.y0 + (t.y1 - t.y0) * (1 - f) * 0.6, t.x1, t.y1);
    }
  }

  private wave(x: number, y: number, R: number, color: number, edge: number, flash = 0): void {
    this.waves.push({ x, y, R, age: 0, grow: STILL ? 1 : 420, life: STILL ? 700 : 800, color, edge, flash });
  }

  /** 手雷的落点范围圈：着色的椭圆（等距地面上的圆）+ 外沿描边，k 越大越实 */
  private zone(g: Phaser.GameObjects.Graphics, s: Slot, k: number, now: number): void {
    // 抛出去就亮着淡淡的圈，越飞越近越实：最后半秒左右填充到 0.4、描边到满
    const pulse = STILL ? 1 : 0.94 + 0.06 * Math.sin(now / 80);
    const rx = s.ring! * pulse;
    const t = k * k;
    g.fillStyle(0xe8431a, 0.1 + 0.3 * t).fillEllipse(s.tx, s.ty, rx * 2, rx);
    g.lineStyle(2, 0xff7a3a, 0.45 + 0.55 * t).strokeEllipse(s.tx, s.ty, rx * 2, rx);
    g.lineStyle(1.5, 0xfff0b0, 0.3 + 0.6 * t).strokeEllipse(s.tx, s.ty, rx * 1.2, rx * 0.6);
  }

  /** 鱼叉收回：绳子先一松再被拉紧，叉头尾巴朝前被拖回炮口 */
  private reel(s: Slot, dt: number): void {
    s.back += dt;
    const k = s.back / ROPE_BACK_MS;
    const t = s.rope!;
    t.muzzle(tmpM);
    if (k >= 1) {
      s.on = false;
      s.im.setVisible(false);
      t.reeled();
      return;
    }
    const [rest, sag] = ropeBack(k);
    const x = tmpM.x + (s.lx - tmpM.x) * rest;
    const y = tmpM.y + (s.ly - tmpM.y) * rest;
    s.im.setPosition(x, y).setRotation(Math.atan2(y - tmpM.y, x - tmpM.x));
    this.line(tmpM.x, tmpM.y, x, y, sag);
  }

  private line(x0: number, y0: number, x1: number, y1: number, sag: number): void {
    const g = this.ropeG;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2 + sag;
    for (const [w, c] of [[2.6, 0x2b1a15], [1.3, 0xe8dcc0]] as const) {
      g.lineStyle(w, c, 1);
      if (sag < 0.5) g.lineBetween(x0, y0, x1, y1);
      else {
        g.beginPath();
        g.moveTo(x0, y0);
        // 两段折线近似下垂的绳子
        g.lineTo((x0 + mx) / 2, (y0 + my) / 2 + sag * 0.5);
        g.lineTo(mx, my);
        g.lineTo((mx + x1) / 2, (my + y1) / 2 + sag * 0.5);
        g.lineTo(x1, y1);
        g.strokePath();
      }
    }
  }

  /** 落地：水 = 水花加涟漪，石 = 石屑加火星，木 = 长条木屑，草地 = 土块草屑，沙地 = 沙尘；各 0.4–0.7 秒，粒子走池子、总量封顶 */
  private land(s: Slot, x: number, gy: number): void {
    if (s.land === 'none' || s.hidden) return;
    const pt = this.pt;
    if (s.land === 'shock') {
      this.landShock(s, x, gy);
      return;
    }
    if (s.land === 'grenade') {
      this.landGrenade(s, x, gy);
      return;
    }
    if (s.land === 'snipe') {
      // 命中点一团白亮闪（只有一发，不怕多）
      pt.bloom.flash(x, gy - 10, 12, 0xffffff, 120, 0.5);
      if (s.mat !== 'water' && !STILL) pt.sparks(x, gy - 10, 2);
    }
    const heavy = s.land === 'shell';
    const small = s.land === 'bullet' || s.land === 'harpoon' || s.land === 'snipe';
    if (STILL) {
      // 减弱动态：只一帧淡淡的闪光，不放粒子
      if (s.land !== 'snipe') this.flick(x, gy, s.mat);
      return;
    }
    const tier = heavy ? 2 : small ? 0 : 1;
    const k = ++this.seq;
    // 落点粒子的总量封顶：超了先把最老的淡掉（最多一次出 14 颗左右）
    pt.fadeOldest(8 + tier * 3, IMPACT_CAP);
    switch (s.mat) {
      case 'water':
        pt.splash(x, gy, heavy ? 1.2 : small ? 0.35 : 0.7);
        pt.ripple(x, gy, tier);
        return;
      case 'wood':
        pt.impactWood(x, gy, tier, k);
        return;
      case 'stone':
        pt.impactStone(x, gy, tier, k);
        return;
      default:
        if (onSand(x, gy)) pt.impactSand(x, gy, tier, k);
        else pt.impactGrass(x, gy, tier, k);
        // 臼炮再压出一圈冲击环
        if (heavy) pt.emit('ring', x, gy, { life: 420, s0: 0.3, s1: 1.4, a0: 0.75, tint: 0xf3e3b8, depth: DEPTH.groundRing });
    }
  }

  /** 减弱动态时的落点：一颗停 0.1 秒的淡闪，颜色跟材质（不依赖泛光，低端机也有） */
  private flick(x: number, gy: number, mat: LandMat): void {
    this.pt.emit('dust', x, gy - 4, { life: 100, s0: 1.4, s1: 2, a0: 0.8, tint: mat === 'water' ? 0xbff6ff : mat === 'wood' ? 0xffd9a8 : mat === 'stone' ? 0xffffff : 0xf3e3b8, depth: DEPTH.muzzle });
  }

  /** 震荡波落地：一圈蓝白冲击圈扩到作用范围（再套一圈小的），地上扬一圈灰；减少动效只留一圈淡出 */
  private landShock(s: Slot, x: number, gy: number): void {
    const pt = this.pt;
    pt.bloom.flash(x, gy - 4, 20, 0x9fe8ff, 200, 0.5);
    this.wave(x, gy, Math.max(20, s.ring || 45), 0x6fd0ff, 0xeaffff, 0.35);
    if (STILL) return;
    if (pt.live < 100) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        pt.emit('puff', x + Math.cos(a) * 6, gy - 2 + Math.sin(a) * 3, { vx: Math.cos(a) * 58, vy: Math.sin(a) * 26 - 6, life: 520, s0: 0.3, s1: 0.8, a0: 0.55, tint: i % 2 ? 0xd9d2c0 : 0xc8e8f4, depth: DEPTH.puffHigh });
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.5;
        pt.emit('ember', x, gy - 6, { vx: Math.cos(a) * 70, vy: Math.sin(a) * 40 - 50, g: 200, life: 260, s0: 0.7, s1: 0.2, a0: 0.95, tint: 0xbff0ff, depth: DEPTH.ember });
      }
    }
  }

  /** 手雷落地：爆点（亮闪 + 火星 + 烟团）加一圈冲击环，范围就是落地前画的那个圈 */
  private landGrenade(s: Slot, x: number, gy: number): void {
    const pt = this.pt;
    pt.bloom.flash(x, gy - 6, 44, 0xffb050, 320, 1);
    this.wave(x, gy, Math.max(20, s.ring || 45), 0xff6a2a, 0xfff0b0, 0.55);
    if (STILL) {
      this.flick(x, gy, 'ground');
      return;
    }
    if (s.mat === 'water') {
      pt.splash(x, gy, 0.9);
      return;
    }
    pt.sparks(x, gy - 6, 9);
    if (pt.live < 120) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        pt.emit('puff', x + Math.cos(a) * 5, gy - 6 + Math.sin(a) * 2, { vx: Math.cos(a) * 46, vy: Math.sin(a) * 20 - 34, g: 8, life: 900, s0: 0.8, s1: 1.9, a0: 0.7, tint: i % 2 ? 0x8d8f99 : 0xc3c5cc, depth: DEPTH.puffHigh });
      }
    }
    if (s.mat === 'wood') pt.splinters(x, gy, 4);
    else if (s.mat === 'stone') pt.chips(x, gy, 3);
  }

  clear(): void {
    for (const s of this.pool) {
      s.on = false;
      s.im.setVisible(false);
    }
    for (const t of this.streaks) t.on = false;
    this.shadowG.clear();
    this.ropeG.clear();
    this.seq = 0;
  }
}
