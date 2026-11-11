/**
 * 画面特效：斩痕、光圈、火星、碎片、墨点、拖尾、伤害数字、脚印……
 * 全部用对象池里的 Image，每帧自己推进（不建补间：满屏几百个特效时补间的开销和垃圾太多）。
 * 只读核心的事件来放，不影响规则（DESIGN.md 5.3）。
 */
import Phaser from 'phaser';
import type { Atlas, Frame } from '../art/atlas.ts';

interface P {
  img: Phaser.GameObjects.Image;
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 往下的加速度（碎片落地） */
  g: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  spin: number;
  /** 宽高各自缩放（斩痕要翻转） */
  sx: number;
  /** 跟着某个点走（光环跟主角） */
  follow: (() => { x: number; y: number }) | null;
  /** 不按 1/res 缩放的特殊图（Graphics 不在这里） */
  res: number;
  /** 地面层的东西：深度固定在地面 */
  ground: boolean;
}

export interface Spawn {
  frame: string;
  x: number;
  y: number;
  life: number;
  vx?: number;
  vy?: number;
  g?: number;
  s0?: number;
  s1?: number;
  a0?: number;
  a1?: number;
  rot?: number;
  spin?: number;
  tint?: number;
  /** 水平翻转（-1） */
  sx?: number;
  depth?: number;
  ground?: boolean;
  add?: boolean;
  follow?: () => { x: number; y: number };
}

export class Fx {
  private readonly free: Phaser.GameObjects.Image[] = [];
  private readonly live: P[] = [];
  private readonly frames: Map<string, Frame>;
  private readonly scene: Phaser.Scene;
  /** 同屏上限：超了丢新来的小东西（不会卡） */
  cap: number;

  constructor(scene: Phaser.Scene, atlas: Atlas, cap: number) {
    this.scene = scene;
    this.frames = atlas.frames;
    this.cap = cap;
  }

  get count(): number {
    return this.live.length;
  }

  spawn(o: Spawn): void {
    if (this.live.length >= this.cap) return;
    const f = this.frames.get(o.frame);
    if (!f) return;
    const img = this.free.pop() ?? this.scene.add.image(0, 0, 'atlas', o.frame);
    img.setFrame(o.frame).setOrigin(f.ox, f.oy).setVisible(true).setActive(true);
    img.setRotation(o.rot ?? 0).setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (o.tint !== undefined) img.setTint(o.tint);
    else img.clearTint();
    img.setDepth(o.depth ?? (o.ground ? -500 : o.y + 2000));
    this.live.push({
      img,
      life: 0,
      max: o.life,
      x: o.x,
      y: o.y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      g: o.g ?? 0,
      s0: o.s0 ?? 1,
      s1: o.s1 ?? o.s0 ?? 1,
      a0: o.a0 ?? 1,
      a1: o.a1 ?? 0,
      spin: o.spin ?? 0,
      sx: o.sx ?? 1,
      follow: o.follow ?? null,
      res: f.res,
      ground: !!o.ground,
    });
    this.place(this.live[this.live.length - 1]!, 0);
  }

  private place(p: P, t: number): void {
    // 缩放用"先快后慢"的缓动，透明度线性
    const e = 1 - (1 - t) * (1 - t);
    const s = (p.s0 + (p.s1 - p.s0) * e) / p.res;
    let x = p.x;
    let y = p.y;
    if (p.follow) {
      const q = p.follow();
      x += q.x;
      y += q.y;
    }
    p.img.setPosition(x, y).setScale(s * p.sx, s).setAlpha(p.a0 + (p.a1 - p.a0) * t);
  }

  update(dtMs: number): void {
    const live = this.live;
    let j = 0;
    for (let i = 0; i < live.length; i++) {
      const p = live[i]!;
      p.life += dtMs;
      if (p.life >= p.max) {
        p.img.setVisible(false).setActive(false);
        this.free.push(p.img);
        continue;
      }
      const dt = dtMs / 1000;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.img.rotation += p.spin * dt;
      this.place(p, p.life / p.max);
      live[j++] = p;
    }
    live.length = j;
  }
}

/** 一个伤害数字槽；slot = 挨打的怪（合并同一只怪连续几下用） */
interface NumSlot {
  c: Phaser.GameObjects.Container;
  life: number;
  x: number;
  y: number;
  crit: boolean;
  n: number;
  mob: number;
  tint: number | undefined;
  /** 合并了几个同值数字（一次技能打出十几个相同的 14，合成「14×N」） */
  cnt: number;
  /** 出生在第几帧：只合并同一帧里的，不把前后相隔的两下糊在一起 */
  born: number;
  times: Phaser.GameObjects.Text;
}

/**
 * 伤害数字：同屏最多 cap 个，满了普通的不出、暴击顶掉最老的。
 * 不挡人：落点离主角太近就往外推；同一只怪 120 毫秒内的几下合成一个数；暴击更大更黄；
 * 上浮用先快后慢的缓动，后 35% 淡出。
 */
export class DamageNumbers {
  private readonly pool: NumSlot[] = [];
  private next = 0;
  private readonly digitW: number;
  private readonly res: number;
  readonly cap: number;
  /** 手机上字放大一点（画面缩得小） */
  scaleK = 1;
  private hx = 0;
  private hy = 0;
  /** 帧计数，update 每帧加一 */
  private stamp = 0;

  constructor(scene: Phaser.Scene, atlas: Atlas, cap = 30) {
    this.cap = cap;
    const f = atlas.frames.get('d0')!;
    this.res = f.res;
    this.digitW = (f.w / f.res) * 0.74;
    for (let i = 0; i < cap; i++) {
      const c = scene.add.container(0, 0).setVisible(false).setDepth(9000);
      for (let k = 0; k < 6; k++) c.add(scene.add.image(0, 0, 'atlas', 'd0').setVisible(false));
      const times = scene.add
        .text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#fff6d8', stroke: '#17131c', strokeThickness: 5 })
        .setOrigin(0, 0.5)
        .setResolution(2)
        .setVisible(false);
      c.add(times);
      this.pool.push({ c, life: -1, x: 0, y: 0, crit: false, n: 0, mob: -1, tint: undefined, cnt: 1, born: -1, times });
    }
  }

  get visible(): number {
    let n = 0;
    for (const p of this.pool) if (p.life >= 0) n++;
    return n;
  }

  /** 主角的位置（每帧告诉一次）：数字不往他身上落 */
  setHero(x: number, y: number): void {
    this.hx = x;
    this.hy = y - 30;
  }

  private render(slot: NumSlot): void {
    const s = String(Math.round(slot.n));
    // 容器里前 6 个是数字图，最后一个是「×N」文字
    const imgs = slot.c.list.slice(0, 6) as Phaser.GameObjects.Image[];
    slot.times.setVisible(slot.cnt > 1);
    if (slot.cnt > 1) slot.times.setText(`×${slot.cnt}`).setPosition((s.length / 2) * this.digitW + 2, 2);
    for (let k = 0; k < imgs.length; k++) {
      const im = imgs[k]!;
      if (k < s.length) {
        im.setFrame(`d${s[k]}`)
          .setVisible(true)
          .setScale(1 / this.res)
          .setPosition((k - (s.length - 1) / 2) * this.digitW, 0);
        if (slot.tint !== undefined) im.setTint(slot.tint);
        else if (slot.crit) im.setTint(0xffcf2e);
        else im.clearTint();
      } else im.setVisible(false);
    }
  }

  show(x: number, y: number, n: number, crit: boolean, tint?: number, mob = -1): void {
    // 同一只怪刚挨过一下：加在那个数字上，不再多冒一个
    if (mob >= 0) {
      for (const p of this.pool) {
        if (p.life >= 0 && p.life < 120 && p.mob === mob && !p.crit && !crit && p.tint === tint) {
          p.n += n;
          p.life = Math.min(p.life, 40);
          this.render(p);
          return;
        }
      }
    }
    // 同一帧里别的怪挨了同样的数（技能一次打一片）：合成「14×N」，不叠成一团
    if (!crit) {
      for (const p of this.pool) {
        if (p.life >= 0 && p.born === this.stamp && !p.crit && p.n === n && p.tint === tint) {
          p.cnt++;
          this.render(p);
          return;
        }
      }
    }
    let slot = this.pool.find((p) => p.life < 0);
    if (!slot) {
      if (!crit) return;
      slot = this.pool[this.next]!;
      this.next = (this.next + 1) % this.cap;
    }
    slot.n = n;
    slot.crit = crit;
    slot.mob = mob;
    slot.tint = tint;
    slot.cnt = 1;
    slot.born = this.stamp;
    this.render(slot);
    slot.life = 0;
    let px = x + (Math.random() - 0.5) * 18;
    let py = y;
    // 离主角胸口不到 70 的往外推到 70（上方留得多一点，数字是往上飘的）
    const dx = px - this.hx;
    const dy = py - this.hy;
    const d2 = dx * dx + dy * dy;
    if (d2 < 70 * 70) {
      const d = Math.sqrt(d2) || 1;
      const ux = d2 < 1 ? 0 : dx / d;
      const uy = d2 < 1 ? -1 : dy / d;
      px = this.hx + ux * 70;
      py = this.hy + uy * 70;
    }
    slot.x = px;
    slot.y = py;
    slot.c.setVisible(true).setAlpha(1);
  }

  update(dtMs: number): void {
    this.stamp++;
    for (const p of this.pool) {
      if (p.life < 0) continue;
      p.life += dtMs;
      const t = p.life / 700;
      if (t >= 1) {
        p.life = -1;
        p.mob = -1;
        p.c.setVisible(false);
        continue;
      }
      const u = 1 - t;
      const rise = 1 - u * u * u;
      // 先弹大再落回（暴击弹得更高），往上飘，后 35% 淡出
      const base = (p.crit ? 1.3 : 0.72) * this.scaleK;
      const pop = t < 0.18 ? 1 + (1 - t / 0.18) * (1 - t / 0.18) * (p.crit ? 0.6 : 0.4) : 1;
      const fade = t > 0.65 ? 1 - ((t - 0.65) / 0.35) * ((t - 0.65) / 0.35) : 1;
      p.c.setPosition(p.x, p.y - (p.crit ? 52 : 38) * rise).setScale(base * pop).setAlpha(fade);
    }
  }
}
