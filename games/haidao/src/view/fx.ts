import Phaser from 'phaser';
import { BIG_EVENT, SHAKE, ShakeGate, StopGate, feelOn, type BigEvent, type ShakeLevel } from './feel.ts';
import { dmgFontPx, pickSlot } from './fxlayout.ts';
import { Bloom } from './post.ts';
import { DEPTH } from './depth.ts';

/** 打击感和飘字的公共件（基地、战斗两个场景共用） */

/** 屏幕上恒定大小的飘字：字号按 css 像素给 */
export function floatText(scene: Phaser.Scene, r: number, zoom: number, wx: number, wy: number, str: string, color = '#ffe885', size = 18): Phaser.GameObjects.Text {
  const t = scene.add
    .text(wx, wy, str, { fontFamily: 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif', fontStyle: '900', fontSize: `${size * r}px`, color, stroke: '#2b1a15', strokeThickness: 4 * r })
    .setOrigin(0.5)
    .setScale(1 / (r * zoom))
    .setDepth(DEPTH.fx);
  scene.tweens.add({ targets: t, y: wy - 56 / zoom, alpha: { from: 1, to: 0 }, delay: 0, duration: 1000, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  return t;
}

/** 正在闪的图：连续命中时不重复排"闪完恢复"的定时器（每次命中新建一个定时器对象，密集战斗里是一堆垃圾） */
const flashing = new WeakSet<Phaser.GameObjects.Image>();

/** 命中闪一下（约一帧）：往亮里加一点（不用纯白填充，免得整座建筑变成一团白） */
export function flash(scene: Phaser.Scene, img: Phaser.GameObjects.Image): void {
  if (flashing.has(img)) return;
  flashing.add(img);
  // 加色 0x2a：浅色建筑（岩洞金矿、石墙）原来加 0x4a 会整个变成一团白，看着像贴图丢了
  img.setTint(0x2a2a2a).setTintMode(Phaser.TintModes.ADD);
  scene.time.delayedCall(50, () => {
    flashing.delete(img);
    if (!img.active) return;
    img.clearTint();
    img.setTintMode(Phaser.TintModes.MULTIPLY);
  });
}

/** 升级完成的白闪：先亮得多再退（比命中闪更亮，但仍是加色，不会变成一团白） */
export function flashWhite(scene: Phaser.Scene, img: Phaser.GameObjects.Image): void {
  img.setTint(0xb4b4b4).setTintMode(Phaser.TintModes.ADD);
  scene.time.delayedCall(90, () => img.active && img.setTint(0x686868));
  scene.time.delayedCall(220, () => {
    if (!img.active) return;
    img.clearTint();
    img.setTintMode(Phaser.TintModes.MULTIPLY);
  });
}

/** 轻微抖动（左右 2 世界单位） */
export function shake(scene: Phaser.Scene, img: Phaser.GameObjects.Image, baseX: number): void {
  scene.tweens.killTweensOf(img);
  img.x = baseX;
  scene.tweens.add({ targets: img, x: baseX + 2.5, duration: 40, yoyo: true, repeat: 1, onComplete: () => (img.x = baseX) });
}

/** 一团火星/碎屑向四周飞 */
export function burst(scene: Phaser.Scene, r: number, key: string, w: number, h: number, wx: number, wy: number, n: number, spread: number, depth = DEPTH.chipBurst): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random();
    const d = spread * (0.5 + Math.random() * 0.8);
    const s = scene.add.image(wx, wy, key).setScale((0.5 + Math.random() * 0.5) / r).setDepth(depth);
    void w;
    void h;
    scene.tweens.add({
      targets: s,
      x: wx + Math.cos(a) * d,
      y: wy + Math.sin(a) * d * 0.55 - 8,
      alpha: 0,
      angle: Math.random() * 180,
      duration: 380 + Math.random() * 220,
      ease: 'Cubic.easeOut',
      onComplete: () => s.destroy(),
    });
  }
}

// ---------------------------------------------------------------- 震屏三档、命中停顿、粒子池、伤害数字

export type { ShakeLevel };
const gate = new ShakeGate();
const stop = new StopGate();

/**
 * 震屏：只给大事件，调用处用 bigEvent。闸门管三件事：设置里关了不震；冷却 300 毫秒；
 * 冷却里只有更高一档的能打断，所以同一时间只取最大的（规矩和测试在 feel.ts / tests/feel.test.ts）
 */
export function shakeCam(scene: Phaser.Scene, level: ShakeLevel): void {
  if (!gate.request(level, performance.now(), feelOn())) return;
  const { ms, k } = SHAKE[level];
  scene.cameras.main.shake(ms, k, true);
}

/** 命中停顿：只在画面层让规则推进暂停 40–80 毫秒（不改规则的拍数）；只给重击，不叠加，结束后留一小段冷却 */
export class HitStop {
  trigger(ms: number): void {
    stop.trigger(ms, performance.now());
  }
  get active(): boolean {
    return stop.active(performance.now());
  }
}

/** 一件大事：按 feel.ts 的表震屏、顿帧。表里没有的小事不要调这个，用局部反馈（闪白、火花、碎屑） */
export function bigEvent(scene: Phaser.Scene, hs: HitStop, ev: BigEvent): void {
  const e = BIG_EVENT[ev];
  shakeCam(scene, e.shake);
  hs.trigger(e.stop);
}

const PTEX = ['drop', 'splinter', 'chip', 'puff', 'ember', 'ring', 'dust', 'confetti', 'coin'] as const;
type PKey = (typeof PTEX)[number];
const INK = 0x2b1a15;
const TAU = Math.PI * 2;

/** 按坐标和序号取 0..1 的确定值（整数散列）：落点碎片的方向快慢用它，同一场回放画面完全一样，不用 Math.random */
export function hash01(a: number, b: number, c: number): number {
  let h = (Math.imul(Math.round(a * 8) | 0, 374761393) ^ Math.imul(Math.round(b * 8) | 0, 668265263) ^ Math.imul(c | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 粒子贴图用 Phaser 画一次（按渲染倍数 r 放大，轮廓约 2px@1×，统一深褐描边） */
function ensureParticleTextures(scene: Phaser.Scene, r: number): void {
  const tag = `fxp.${r}.`;
  if (scene.textures.exists(tag + 'drop')) return;
  const mk = (k: PKey, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
    const g = scene.make.graphics({}, false);
    g.setScale(r);
    draw(g);
    g.generateTexture(tag + k, Math.ceil(w * r), Math.ceil(h * r));
    g.destroy();
  };
  mk('drop', 10, 12, (g) => g.fillStyle(0xbff6ff, 1).lineStyle(1.6, 0x14233a, 1).fillCircle(5, 7, 3.4).strokeCircle(5, 7, 3.4));
  const V = (a: number[][]): Phaser.Math.Vector2[] => a.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  mk('splinter', 14, 6, (g) => {
    const p = V([[1.5, 3], [11, 1.4], [12.6, 3], [11, 4.6]]);
    g.fillStyle(0xb97a3d, 1).lineStyle(1.6, INK, 1).fillPoints(p, true).strokePoints(p, true);
  });
  mk('chip', 10, 10, (g) => {
    const p = V([[1.5, 6], [4, 1.6], [8.4, 3], [8, 8], [3, 8.4]]);
    g.fillStyle(0xaab1b8, 1).lineStyle(1.6, INK, 1).fillPoints(p, true).strokePoints(p, true);
  });
  mk('puff', 24, 24, (g) => g.fillStyle(0xc3c5cc, 1).lineStyle(2, 0x3c3d48, 1).fillCircle(12, 12, 9).strokeCircle(12, 12, 9));
  mk('ember', 10, 10, (g) => g.fillStyle(0xffffff, 1).lineStyle(1.4, INK, 1).fillCircle(5, 5, 3.2).strokeCircle(5, 5, 3.2));
  mk('ring', 64, 32, (g) => g.lineStyle(3, 0xeffcf7, 1).strokeEllipse(32, 16, 58, 28));
  mk('dust', 10, 10, (g) => g.fillStyle(0xfff6c8, 1).fillCircle(5, 5, 3));
  // 彩带：白色小纸片（发射时按颜色染），金币：金色扁圆带亮边
  mk('confetti', 10, 6, (g) => g.fillStyle(0xffffff, 1).lineStyle(1.2, INK, 1).fillRect(1, 1, 8, 4).strokeRect(1, 1, 8, 4));
  mk('coin', 12, 12, (g) => g.fillStyle(0xf8c630, 1).lineStyle(1.6, 0x7a4a0c, 1).fillEllipse(6, 6, 9, 8).strokeEllipse(6, 6, 9, 8).fillStyle(0xfff2a0, 1).fillEllipse(4.6, 4.8, 3, 2));
}

interface Part {
  im: Phaser.GameObjects.Image;
  on: boolean;
  vx: number;
  vy: number;
  g: number;
  life: number;
  age: number;
  s0: number;
  s1: number;
  a0: number;
  vr: number;
}

export interface Emit {
  vx?: number;
  vy?: number;
  g?: number;
  life?: number;
  s0?: number;
  s1?: number;
  a0?: number;
  vr?: number;
  tint?: number;
  rot?: number;
  depth?: number;
}

/** 粒子池：最多 max 个图像对象，循环复用，不在帧里新建；用完了就丢掉新的（宁可少一点） */
export class Particles {
  private pool: Part[] = [];
  private free: Part[] = [];
  /** 0 = 冻住（命中停顿时） */
  timeScale = 1;
  private tag: string;
  private offUpdate: () => void;
  private scene: Phaser.Scene;
  private r: number;
  private max: number;
  /** 泛光（火焰、爆炸、炮口的柔光；低端机自动关，见 post.ts） */
  readonly bloom: Bloom;

  constructor(scene: Phaser.Scene, r: number, max = 140) {
    this.scene = scene;
    this.bloom = new Bloom(scene, r);
    this.r = r;
    this.max = max;
    ensureParticleTextures(scene, r);
    this.tag = `fxp.${r}.`;
    const fn = (_t: number, dt: number): void => this.update(dt);
    scene.events.on('update', fn);
    this.offUpdate = () => scene.events.off('update', fn);
    scene.events.once('shutdown', () => this.offUpdate());
  }

  get size(): number {
    return this.pool.length;
  }
  get live(): number {
    return this.pool.length - this.free.length;
  }

  emit(k: PKey, x: number, y: number, o: Emit = {}): void {
    let p = this.free.pop();
    if (!p) {
      if (this.pool.length >= this.max) return;
      const im = this.scene.add.image(0, 0, this.tag + k).setVisible(false);
      p = { im, on: false, vx: 0, vy: 0, g: 0, life: 1, age: 0, s0: 1, s1: 1, a0: 1, vr: 0 };
      this.pool.push(p);
    }
    p.on = true;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.g = o.g ?? 0;
    p.life = o.life ?? 500;
    p.age = 0;
    p.s0 = o.s0 ?? 1;
    p.s1 = o.s1 ?? p.s0;
    p.a0 = o.a0 ?? 1;
    p.vr = o.vr ?? 0;
    const im = p.im;
    im.setTexture(this.tag + k).setPosition(x, y).setDepth(o.depth ?? DEPTH.particle).setScale(p.s0 / this.r).setAlpha(p.a0).setRotation(o.rot ?? 0).setVisible(true);
    if (o.tint !== undefined) im.setTint(o.tint);
    else im.clearTint();
  }

  private update(dt: number): void {
    const d = Math.min(dt, 50) * this.timeScale;
    if (d <= 0) return;
    const s = d / 1000;
    for (const p of this.pool) {
      if (!p.on) continue;
      p.age += d;
      if (p.age >= p.life) {
        p.on = false;
        p.im.setVisible(false);
        this.free.push(p);
        continue;
      }
      const t = p.age / p.life;
      p.vy += p.g * s;
      const im = p.im;
      im.x += p.vx * s;
      im.y += p.vy * s;
      im.rotation += p.vr * s;
      im.setScale((p.s0 + (p.s1 - p.s0) * t) / this.r);
      im.setAlpha(p.a0 * (1 - t * t));
    }
  }

  // ---- 预设（x,y 是世界坐标，速度单位 = 世界单位/秒）

  /** 爆炸：火星飞溅 + 几团烟往上飘 */
  explosion(x: number, y: number, size: number): void {
    this.bloom.flash(x, y - 6, 22 + size * 12, 0xff9a3c, 340, 0.6);
    const n = Math.min(14, 5 + Math.round(size * 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 0.7;
      const v = 50 + (i % 3) * 30 + size * 12;
      this.emit('ember', x, y - 6, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 40, g: 160, life: 380 + (i % 4) * 70, s0: 0.9, s1: 0.3, tint: i % 2 ? 0xffd23f : 0xff6a1f, depth: DEPTH.ember });
    }
    const m = Math.min(5, 2 + Math.round(size));
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      this.emit('puff', x + Math.cos(a) * 6, y - 4 + Math.sin(a) * 3, { vx: Math.cos(a) * 14, vy: -22 - (i % 2) * 10, life: 800 + i * 60, s0: 0.5, s1: 1.1 + size * 0.15, a0: 0.75, tint: i % 2 ? 0x8d8f99 : 0xc3c5cc, depth: DEPTH.fxHigh });
    }
  }

  /** 普通命中的局部反馈：几粒小火花（对象池里取，数量上限 3），不动镜头 */
  sparks(x: number, y: number, n = 2): void {
    const m = Math.min(3, n);
    for (let i = 0; i < m; i++) {
      const a = -Math.PI / 2 + (i - (m - 1) / 2) * 1.1 + ((x * 7 + y * 3 + i) % 5) * 0.12;
      const v = 55 + (i % 2) * 25;
      this.emit('ember', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 240, life: 240 + (i % 2) * 60, s0: 0.75, s1: 0.25, tint: i % 2 ? 0xffd23f : 0xfff2a0, depth: DEPTH.ember });
    }
  }

  /** 炮口火光：一团亮黄放大淡出 + 两粒火星 */
  muzzle(x: number, y: number): void {
    this.bloom.flash(x, y, 14, 0xffd070, 150, 0.45);
    this.emit('dust', x, y, { life: 150, s0: 1.6, s1: 4, a0: 0.95, tint: 0xfff2a0, depth: DEPTH.muzzle });
    this.sparks(x, y, 2);
  }

  /** 水花：水珠弧线抛起落回 + 一圈水纹 */
  splash(x: number, y: number, size = 1): void {
    const n = Math.min(10, 5 + Math.round(size * 3));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * 2.2;
      const v = 70 + (i % 3) * 22 + size * 10;
      this.emit('drop', x, y - 2, { vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v, g: 320, life: 520 + (i % 3) * 60, s0: 0.8 + size * 0.1, s1: 0.5, depth: DEPTH.dropChip });
    }
    this.emit('ring', x, y, { life: 560, s0: 0.3, s1: 0.9 + size * 0.3, a0: 0.9, depth: DEPTH.groundRing });
  }

  /** 建筑倒塌的烟尘：沙色的团往四周滚开、慢慢散 */
  dust(x: number, y: number, size: number): void {
    const n = Math.min(9, 4 + Math.round(size * 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 0.5;
      this.emit('puff', x + Math.cos(a) * 8, y - 2 + Math.sin(a) * 4, { vx: Math.cos(a) * 40, vy: Math.sin(a) * 16 - 14, life: 650 + (i % 3) * 90, s0: 0.5, s1: 1.2 + size * 0.2, a0: 0.8, tint: i % 2 ? 0xd9c49a : 0xe9ddc0, depth: DEPTH.puffHigh });
    }
  }

  /** 人倒在地上扬起的一小团土（比建筑倒塌的 dust 小得多，3 团） */
  bodyDust(x: number, y: number, n = 3): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.7;
      this.emit('puff', x + Math.cos(a) * 6, y - 3, { vx: Math.cos(a) * 32, vy: Math.sin(a) * 9 - 12, life: 520 + i * 70, s0: 0.35, s1: 0.85, a0: 0.7, tint: i % 2 ? 0xd9c49a : 0xe9ddc0, depth: DEPTH.puffHigh });
    }
  }

  /** 烧焦的人冒的黑烟：一缕往上飘，偶尔带一粒火星 */
  charSmoke(x: number, y: number, i: number): void {
    this.emit('puff', x + ((i % 3) - 1) * 4, y - 22, { vx: ((i % 5) - 2) * 4, vy: -30, life: 900, s0: 0.3, s1: 0.95, a0: 0.8, tint: 0x2b2a30, depth: DEPTH.smokePuff });
    if (i % 2 === 0) this.emit('ember', x + ((i % 3) - 1) * 5, y - 24, { vx: ((i % 4) - 1.5) * 14, vy: -36, g: 120, life: 420, s0: 0.6, s1: 0.2, tint: 0xff8a2a, depth: DEPTH.ember });
  }

  /** 焦油溅开：一圈黑色的粘滴往四周甩，落回地上 */
  tarSplat(x: number, y: number, size: number): void {
    const n = Math.min(12, 6 + Math.round(size * 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 0.37;
      const v = 55 + (i % 4) * 22;
      this.emit('drop', x, y - 4, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55 - 70, g: 340, life: 520 + (i % 3) * 70, s0: 0.9 + (i % 2) * 0.3, s1: 0.7, tint: 0x15151a, depth: DEPTH.dropChip });
    }
  }

  /** 木屑 */
  splinters(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i;
      const v = 55 + (i % 3) * 25;
      this.emit('splinter', x, y - 10, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 70, g: 280, life: 520 + (i % 3) * 80, s0: 0.9 + (i % 2) * 0.3, s1: 0.8, vr: (i % 2 ? 1 : -1) * 9, rot: i, depth: DEPTH.splinterLow });
    }
  }

  /** 石屑 */
  chips(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + i * 1.3;
      const v = 45 + (i % 3) * 22;
      this.emit('chip', x, y - 10, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 60, g: 300, life: 480 + (i % 3) * 70, s0: 0.8 + (i % 2) * 0.35, s1: 0.7, vr: (i % 2 ? 1 : -1) * 7, rot: i, depth: DEPTH.splinterLow });
    }
  }

  // ---- 炮弹落点（按材质，Shots.land 用）。tier：0 = 小弹（子弹、鱼叉），1 = 普通炮弹，2 = 臼炮重弹。
  // 随机性一律来自 hash01(落点, 序号)：同一场回放里每次落点的碎片方向、快慢完全一样，不用 Math.random。

  /** 同屏落点粒子的软上限：超了先把最老的几颗拉到尾声淡掉（不硬丢新的，也不拖到池子满） */
  fadeOldest(room: number, cap: number): void {
    for (let over = this.live + room - cap; over > 0; over--) {
      let best: Part | undefined;
      for (const p of this.pool) if (p.on && p.age < p.life * 0.75 && (!best || p.age > best.age)) best = p;
      if (!best) return;
      best.age = best.life * 0.75;
    }
  }

  /** 水面涟漪：一快一慢两圈水纹往外扩（水花本身由 splash 出，这里补外圈和内圈，0.65 秒内淡尽） */
  ripple(x: number, y: number, tier: number): void {
    this.emit('ring', x, y, { life: 650, s0: 0.2, s1: 0.8 + 0.45 * tier, a0: 0.8, tint: 0xdff8ff, depth: DEPTH.groundRing });
    if (tier > 0) this.emit('ring', x, y + 1, { life: 480, s0: 0.1, s1: 0.45 + 0.3 * tier, a0: 0.7, tint: 0xffffff, depth: DEPTH.groundRing });
  }

  /** 石头落点：石屑加橙黄火星（火星比石屑先落，0.3 秒），石屑 0.55 秒内落地淡出 */
  impactStone(x: number, y: number, tier: number, k: number): void {
    const nc = [1, 3, 4][tier]!;
    for (let i = 0; i < nc; i++) {
      const h = hash01(x, y, k * 8 + i);
      const a = (i / nc) * TAU + h * 1.4;
      const v = 40 + h * 40;
      this.emit('chip', x, y - 8, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 60 - h * 25, g: 300, life: 420 + h * 140, s0: 0.75 + h * 0.4, s1: 0.65, vr: (h < 0.5 ? -1 : 1) * (6 + h * 6), rot: h * TAU, depth: DEPTH.splinterLow });
    }
    const ne = [1, 3, 5][tier]!;
    for (let i = 0; i < ne; i++) {
      const h = hash01(x, y, k * 8 + 100 + i);
      const a = -Math.PI / 2 + ((i + 0.5) / ne - 0.5) * 2.6 + (h - 0.5) * 0.4;
      const v = 70 + h * 50;
      this.emit('ember', x, y - 6, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15, g: 260, life: 240 + h * 80, s0: 0.8, s1: 0.2, tint: h < 0.5 ? 0xffd23f : 0xff8a2a, depth: DEPTH.ember });
    }
  }

  /** 木头落点：几片长条木屑绕着转、划弧线落下（0.45–0.65 秒） */
  impactWood(x: number, y: number, tier: number, k: number): void {
    const n = [1, 4, 5][tier]!;
    for (let i = 0; i < n; i++) {
      const h = hash01(x, y, k * 8 + i);
      const a = (i / n) * TAU + h * 1.2;
      const v = 45 + h * 55;
      this.emit('splinter', x, y - 8, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.45 - 85 - h * 35, g: 300, life: 450 + h * 200, s0: 1.15 + h * 0.5, s1: 1, vr: (h < 0.5 ? -1 : 1) * (10 + h * 9), rot: h * TAU, tint: h < 0.5 ? 0xffd9a8 : 0xffffff, depth: DEPTH.splinterLow });
    }
    if (tier === 2) this.emit('puff', x, y - 4, { vx: 0, vy: -16, life: 520, s0: 0.3, s1: 0.8, a0: 0.5, tint: 0xd9c49a, depth: DEPTH.puffHigh });
  }

  /** 草地落点：深褐土块（沉、落得快）加浅绿草屑（轻、飘得高），重弹再扬一小团土（0.45–0.65 秒） */
  impactGrass(x: number, y: number, tier: number, k: number): void {
    const nc = [1, 3, 4][tier]!;
    for (let i = 0; i < nc; i++) {
      const h = hash01(x, y, k * 8 + i);
      const a = (i / nc) * TAU + h * 1.4;
      const v = 35 + h * 40;
      this.emit('chip', x, y - 4, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 65 - h * 20, g: 340, life: 430 + h * 120, s0: 0.8 + h * 0.4, s1: 0.7, vr: (h < 0.5 ? -1 : 1) * (5 + h * 6), rot: h * TAU, tint: h < 0.5 ? 0x8a5a32 : 0x6e4626, depth: DEPTH.splinterLow });
    }
    const nb = [1, 3, 5][tier]!;
    for (let i = 0; i < nb; i++) {
      const h = hash01(x, y, k * 8 + 50 + i);
      const a = (i / nb) * TAU + h * 2;
      const v = 25 + h * 45;
      this.emit('splinter', x, y - 3, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.45 - 80 - h * 30, g: 190, life: 500 + h * 150, s0: 0.6 + h * 0.25, s1: 0.5, vr: (h < 0.5 ? -1 : 1) * (7 + h * 7), rot: h * TAU, tint: h < 0.5 ? 0x7ed36a : 0xa6e07a, depth: DEPTH.splinterLow });
    }
    for (let i = 0; i < tier; i++) {
      const h = hash01(x, y, k * 8 + 90 + i);
      this.emit('puff', x + (h - 0.5) * 8, y - 3, { vx: (h - 0.5) * 40, vy: -14 - h * 8, life: 520, s0: 0.3, s1: 0.8, a0: 0.55, tint: 0x9b7a52, depth: DEPTH.puffHigh });
    }
  }

  /** 沙地落点：沙黄色的团往四周滚开、变大淡出，加几粒细沙飞散（重弹 0.7 秒，其余更短） */
  impactSand(x: number, y: number, tier: number, k: number): void {
    const n = [1, 3, 5][tier]!;
    for (let i = 0; i < n; i++) {
      const h = hash01(x, y, k * 8 + i);
      const a = (i / n) * TAU + 0.3 + h * 0.8;
      const v = [14, 30, 46][tier]!;
      this.emit('puff', x + Math.cos(a) * 4, y - 2 + Math.sin(a) * 2, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.45 - 8 - tier * 6, g: 20, life: 480 + tier * 100 + h * 60, s0: 0.22 + tier * 0.1, s1: 0.55 + tier * 0.35, a0: 0.75, tint: h < 0.5 ? 0xe6cf93 : 0xf0e0b0, depth: DEPTH.puffHigh });
    }
    const ng = [0, 3, 5][tier]!;
    for (let i = 0; i < ng; i++) {
      const h = hash01(x, y, k * 8 + 60 + i);
      const a = (i / ng) * TAU + h * 1.5;
      const v = 40 + h * 40;
      this.emit('dust', x, y - 3, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 40, g: 160, life: 420 + h * 100, s0: 0.7, s1: 0.4, a0: 0.9, tint: 0xf1dca0, depth: DEPTH.dropChip });
    }
  }

  /** 锤子敲一下：两粒火星、一片木屑、一小团尘（升级施工用，粒子池） */
  hammer(x: number, y: number, i: number): void {
    const dir = i % 2 ? 1 : -1;
    for (let j = 0; j < 2; j++) {
      const a = -Math.PI / 2 + dir * (0.5 + j * 0.45);
      this.emit('ember', x, y, { vx: Math.cos(a) * (90 + j * 30), vy: Math.sin(a) * (90 + j * 30), g: 320, life: 260 + j * 60, s0: 0.8, s1: 0.25, tint: j ? 0xffd23f : 0xfff2a0, depth: DEPTH.burstHigh });
    }
    this.emit('splinter', x, y, { vx: dir * 60, vy: -80, g: 300, life: 520, s0: 0.8, s1: 0.7, vr: dir * 10, rot: i, depth: DEPTH.splinter });
    this.emit('puff', x, y + 4, { vx: -dir * 12, vy: -10, life: 520, s0: 0.35, s1: 0.8, a0: 0.55, tint: 0xe9ddc0, depth: DEPTH.fxHigh });
  }

  /** 庆祝：彩带向上喷再飘落、几枚金币抛起（升级完成用；big = 主寨，更多更高） */
  confetti(x: number, y: number, big = false): void {
    const COL = [0xf56c55, 0xffd23f, 0x5fd6d8, 0x7be08a, 0xffffff, 0xc58cff];
    const n = big ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * 2.2;
      const v = (big ? 170 : 130) + (i % 4) * 22;
      this.emit('confetti', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 210, life: (big ? 1300 : 1000) + (i % 5) * 60, s0: 1, s1: 0.8, vr: (i % 2 ? 1 : -1) * (8 + (i % 3) * 4), rot: i, tint: COL[i % COL.length], depth: DEPTH.coinBurst });
    }
    const m = big ? 8 : 5;
    for (let i = 0; i < m; i++) {
      const a = -Math.PI / 2 + ((i / (m - 1)) - 0.5) * 1.6;
      const v = 120 + (i % 3) * 25;
      this.emit('coin', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 380, life: 800 + (i % 3) * 80, s0: 1.1, s1: 0.9, vr: (i % 2 ? 1 : -1) * 6, depth: DEPTH.coin });
    }
  }

  /** 升级：脚下一圈光点向外散开，加一圈扩大的光环 */
  ringBurst(x: number, y: number, size: number): void {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = 60 + size * 22;
      this.emit('dust', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, g: -30, life: 650, s0: 1.2, s1: 0.4, tint: i % 2 ? 0xffe885 : 0xffffff, depth: DEPTH.burstHigh });
    }
    this.emit('ring', x, y, { life: 600, s0: 0.5, s1: 1.4 + size * 0.5, a0: 1, tint: 0xffe885, depth: DEPTH.coinBurstLow });
  }
}

/** 一个正在飘的数字 */
interface DNum {
  t: Phaser.GameObjects.Text;
  on: boolean;
  key: string;
  /** 淡出计时：合并新伤害时拉回一点，这样持续挨打的目标只有一个往上滚的数字 */
  age: number;
  /** 出现后的时间：只管弹出和上升，合并不重置，数字不会掉回去 */
  born: number;
  x0: number;
  y0: number;
  /** 现在的 y（含上升），排布时用它 */
  cy: number;
  big: boolean;
  unit: boolean;
  sum: number;
  shown: number;
  bump: number;
  /** 文字现在是什么样式（大小 / 颜色 / 描边）；样式没变只换字，不重设样式（每次设样式 Phaser 都重画一遍文字贴图） */
  look: string;
}

/** 淡出从 FADE_AT 开始、到 life 结束；合并时 age 拉回到 HOLD_AT */
const FADE_AT = 560;
const HOLD_AT = 200;
/** 同一个目标的数字最多合并这么久（毫秒）：再挨打就让旧的飘走、另起一个，持续挨打的建筑旁边不会钉着一个越滚越大的总数 */
export const MERGE_MAX = 700;

/**
 * 飘在目标上的伤害数字。同一个目标正在飘着数字时，新伤害直接累加进去（数字往上滚、轻轻一跳），不另起一个；
 * 不同目标的数字按候选位置错开（fxlayout.pickSlot）；同屏最多 max 个，满了只让更大的顶掉最小的。文字对象池复用。
 */
export class DamageNumbers {
  private pool: DNum[] = [];
  timeScale = 1;
  private offUpdate: () => void;
  private scene: Phaser.Scene;
  private r: number;
  private zoom: () => number;
  private max: number;

  /** 小兵在世界里的身高（像素）：字号按它在屏幕上的高度封顶（dmgFontPx） */
  private unitH: number;

  /** zoom = 世界像素到 CSS 像素的缩放（镜头的 zoom ÷ 渲染倍数，录像跟拍时也对） */
  constructor(scene: Phaser.Scene, r: number, zoom: () => number, max = 8, unitH = 70) {
    this.scene = scene;
    this.unitH = unitH;
    this.r = r;
    this.zoom = zoom;
    this.max = max;
    const fn = (_t: number, dt: number): void => this.update(dt);
    scene.events.on('update', fn);
    this.offUpdate = () => scene.events.off('update', fn);
    scene.events.once('shutdown', () => this.offUpdate());
  }

  get live(): number {
    return this.pool.filter((q) => q.on).length;
  }

  /** big：这一下本身就很重（炮击、暴击）；累加到够大也算大数字 */
  add(key: string, dmg: number, x: number, y: number, unit: boolean, big: boolean): void {
    if (dmg <= 0) return;
    const e = this.pool.find((q) => q.on && q.key === key);
    // 合并太久的放手：清掉 key，让它照常往上飘、淡出
    if (e && e.born > MERGE_MAX) e.key = '';
    else if (e) {
      e.sum += dmg;
      e.big = e.big || big || e.sum >= 120;
      e.age = Math.min(e.age, HOLD_AT);
      e.bump = 1;
      // 直接显示新的总数、只重画一次文字；原来逐帧往上滚，每帧都重画一张文字贴图（perf：传贴图次数）
      e.shown = e.sum;
      this.paint(e);
      return;
    }
    let p = this.pool.find((q) => !q.on);
    if (!p) {
      if (this.pool.length < this.max) {
        const t = this.scene.add.text(0, 0, '', { fontFamily: 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif', fontStyle: '900', fontSize: `${16 * this.r}px`, color: '#fff', stroke: '#2b1a15', strokeThickness: 3.5 * this.r }).setOrigin(0.5).setDepth(DEPTH.fogMist).setVisible(false);
        p = { t, on: false, key: '', age: 0, born: 0, x0: 0, y0: 0, cy: 0, big: false, unit: false, sum: 0, shown: 0, bump: 0, look: '' };
        this.pool.push(p);
      } else {
        // 满了：只有更大的才能顶掉屏上最小的那个，小数字直接并掉（它的伤害不重要）
        let small = this.pool[0]!;
        for (const q of this.pool) if (q.sum < small.sum) small = q;
        if (small.sum >= dmg) return;
        p = small;
      }
    }
    const z = this.zoom();
    const dims = (q: { sum: number; big: boolean }): { w: number; h: number } => {
      const sz = q.big ? 19 : 12;
      return { w: (String(Math.round(q.sum)).length + 1) * sz * 0.62, h: sz * 1.15 };
    };
    const act = this.pool.filter((q) => q.on && q !== p).map((q) => ({ x: q.x0 * z, y: q.cy * z, ...dims(q) }));
    const nd = dims({ sum: dmg, big: big || dmg >= 120 });
    const o = pickSlot(act, x * z, y * z, nd.w, nd.h);
    p.key = key;
    p.on = true;
    p.age = 0;
    p.born = 0;
    p.x0 = x + o.dx / z;
    p.y0 = y + o.dy / z;
    p.cy = p.y0;
    p.big = big || dmg >= 120;
    p.unit = unit;
    p.sum = dmg;
    p.shown = dmg;
    p.bump = 1;
    // 第一帧就按镜头定好大小（update 要到下一帧，录像逐帧推时第一张会按原始大小画出来）
    const sz0 = p.big ? 19 : 12;
    p.t.setPosition(p.x0, p.y0).setVisible(true).setAlpha(1).setScale(dmgFontPx(sz0, this.unitH * z) / sz0 / (this.r * z));
    this.paint(p);
  }

  private paint(p: DNum): void {
    const sz = p.big ? 19 : 12;
    const look = `${sz}|${p.big ? 'g' : p.unit ? 'u' : 'w'}`;
    if (p.look !== look) {
      p.look = look;
      p.t.setStyle({ fontSize: `${sz * this.r}px`, color: p.big ? '#ffd23f' : p.unit ? '#ff9a8a' : '#ffffff', stroke: '#2b1a15', strokeThickness: (p.big ? 4.5 : 3.5) * this.r });
    }
    p.t.setText(`-${p.shown}`);
  }

  private update(dt: number): void {
    const d = Math.min(dt, 50) * this.timeScale;
    if (d <= 0) return;
    const z = this.zoom();
    const uh = this.unitH * z;
    for (const p of this.pool) {
      if (!p.on) continue;
      const sz = p.big ? 19 : 12;
      const sc = dmgFontPx(sz, uh) / sz / (this.r * z);
      p.age += d;
      p.born += d;
      const life = p.big ? 900 : 720;
      if (p.age >= life) {
        p.on = false;
        p.key = '';
        p.sum = 0;
        p.t.setVisible(false);
        continue;
      }
      p.bump = Math.max(0, p.bump - d / 180);
      const k = Math.min(1, p.born / 400);
      const rise = ((p.big ? 34 : 22) * (1 - (1 - k) * (1 - k))) / z;
      // 出现和合并时 back 式弹一下：1 + 0.35 * bump
      const pop = 1 + (p.big ? 0.35 : 0.25) * p.bump;
      const fade = p.age < FADE_AT ? 1 : 1 - (p.age - FADE_AT) / (life - FADE_AT);
      p.cy = p.y0 - rise;
      p.t.setScale(sc * pop).setY(p.cy).setAlpha(fade);
    }
  }
}

/** 图标沿弧线飞向 DOM 目标（顶栏计数）；from 是屏幕坐标，落点用 to 的中心，飞完 onLand 一次 */
export function flyIcons(root: HTMLElement, from: { x: number; y: number }, to: HTMLElement, mkIcon: () => HTMLElement, n: number, onLand?: () => void): void {
  const rr = root.getBoundingClientRect();
  const tr = to.getBoundingClientRect();
  const x0 = from.x - rr.left;
  const y0 = from.y - rr.top;
  const dx = tr.left + tr.width * 0.3 - rr.left - x0;
  const dy = tr.top + tr.height / 2 - rr.top - y0;
  let left = n;
  for (let i = 0; i < n; i++) {
    const ic = mkIcon();
    ic.style.cssText += `;position:absolute;left:${x0 - 11}px;top:${y0 - 11}px;z-index:60;pointer-events:none`;
    root.appendChild(ic);
    const side = (i % 2 ? 1 : -1) * (14 + i * 6);
    const an = ic.animate(
      [
        { transform: 'translate(0,0) scale(1.1)', opacity: 1, offset: 0, easing: 'cubic-bezier(.2,.7,.4,1)' },
        { transform: `translate(${dx * 0.35 + side}px,${Math.min(dy * 0.35, 0) - 56}px) scale(1.2)`, opacity: 1, offset: 0.4, easing: 'cubic-bezier(.5,0,.9,.6)' },
        { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0.9, offset: 1 },
      ],
      { duration: 700 + i * 70, delay: i * 55, fill: 'forwards' },
    );
    an.onfinish = () => {
      ic.remove();
      if (--left === 0) onLand?.();
    };
  }
}
