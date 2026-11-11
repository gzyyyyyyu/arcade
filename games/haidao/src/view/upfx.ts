import Phaser from 'phaser';
import { DROP_MS, WALL_RISE_MS, buildFrame, buildPlan, dropPose, upFrame, upPlan, type UpPlan } from './basefeel.ts';
import { riseScale } from './motion.ts';
import { fxA } from './art.ts';
import { scaffoldArt, scaffoldPieces } from './art/index.ts';
import { scaffoldH } from './art/scaffold.ts';
import { feelOn, vibrate } from './feel.ts';
import type { Particles } from './fx.ts';
import { bakeSome } from './textures.ts';
import { sfx } from './audio/sfx.ts';
import { upgradeSound } from './audio/pick.ts';
import { DEPTH } from './depth.ts';

/**
 * 基地的升级演出和落地演出（画面侧）：时间线是 basefeel.ts 的纯函数，这里每帧按 dt 推进、逐帧插值写到图像上，
 * 不用补间、不开定时器；脚手架、光柱、残影、文字都在固定大小的槽位里复用（最多同时 4 场，满了把最早那场直接播完）。
 * 演出不挡操作：期间照样能点别的建筑、开面板、再升级（同一座再升级会把上一场直接播完）。
 */

export interface UpStart {
  img: Phaser.GameObjects.Image;
  /** 占地边长（选脚手架尺寸） */
  size: number;
  plan: 'normal' | 'hq' | 'quick';
  /** 升级前的贴图（施工时保持旧样子，换外观时做残影）；外观没变时为 null */
  oldKey: string | null;
  oldLv: number;
  newLv: number;
  /** 大建筑：用 upgradeBig 的声音 */
  big: boolean;
  /** 建筑图不透明部分的顶（世界坐标），字贴着它 */
  top(): number;
  /** 可见区的上沿（世界坐标，顶栏下面）：字靠顶时往下夹，不出屏、不被顶栏挡 */
  minY?(): number;
  /** 换上新外观（场景按存档选当前该用的贴图） */
  morph(): void;
  /** 演出结束（主寨的解锁弹窗等它播完再出） */
  done?(): void;
}

interface Slot {
  id: number;
  /** 「升级!」字上次设的字号（没变不重设，设字号会让文字重画一遍） */
  wordPx: number;
  on: boolean;
  t: number;
  plan: UpPlan;
  s: UpStart;
  hit: number;
  morphed: boolean;
  chimed: boolean;
  bx: number;
  by: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  tint: number;
  back: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  beam: Phaser.GameObjects.Image;
  ghost: Phaser.GameObjects.Image;
  word: Phaser.GameObjects.Text;
  lv: Phaser.GameObjects.Text;
  scafH: number;
  /** 新建筑的施工（不是升级）：本体从地面长出来，不出“升级!”字 */
  build: boolean;
}

interface Drop {
  img: Phaser.GameObjects.Image;
  t: number;
  bx: number;
  by: number;
  sx: number;
  sy: number;
  size: number;
  landed: boolean;
  /** 城墙短版：从地面升起，不是落下 */
  rise: boolean;
}

const MAX_SLOTS = 4;
const FONT = 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif';

export interface BuildStart {
  img: Phaser.GameObjects.Image;
  size: number;
  /** 大建筑：金光、彩带和声音用大档 */
  big: boolean;
  top(): number;
}

export class UpgradeFx {
  private slots: Slot[] = [];
  private drops: Drop[] = [];
  private readonly scene: Phaser.Scene;
  private readonly r: number;
  private readonly pt: Particles;
  private readonly zoom: () => number;

  constructor(scene: Phaser.Scene, r: number, pt: Particles, zoom: () => number) {
    this.scene = scene;
    this.r = r;
    this.pt = pt;
    this.zoom = zoom;
    // 脚手架不进开局的 allArt，进基地时烘一次（很小；没烘好之前升级就不搭架子，其余照放）
    void bakeSome(scene.textures, scaffoldPieces(), r).catch(() => undefined);
    const fn = (_t: number, dt: number): void => this.update(Math.min(dt, 50));
    scene.events.on('update', fn);
    scene.events.once('shutdown', () => scene.events.off('update', fn));
  }

  /** 正在施工（还没换外观）：场景先别把贴图换成新等级的 */
  holds(id: number): boolean {
    return this.slots.some((s) => s.on && s.id === id && !s.morphed);
  }

  /** 这张图正在被演出逐帧摆位置（场景同步存档时别去改它的位置和缩放） */
  busy(img: Phaser.GameObjects.Image): boolean {
    return this.slots.some((s) => s.on && s.s.img === img) || this.drops.some((d) => d.img === img);
  }

  get active(): number {
    return this.slots.filter((s) => s.on).length + this.drops.length;
  }

  start(id: number, st: UpStart): void {
    this.finish(id);
    // 刚放下还在落地的建筑：先落到位，再从站稳的位置开始
    for (const d of this.drops) if (d.img === st.img) d.img.setPosition(d.bx, d.by).setScale(d.sx, d.sy).setAlpha(1);
    this.drops = this.drops.filter((d) => d.img !== st.img);
    let slot = this.slots.find((s) => !s.on);
    if (!slot) {
      if (this.slots.length < MAX_SLOTS) slot = this.mkSlot();
      else {
        // 槽位满了：把最早开始的那场直接播完，腾出来
        const old = this.slots.reduce((a, b) => (a.t >= b.t ? a : b));
        this.end(old);
        slot = old;
      }
    }
    const im = st.img;
    Object.assign(slot, {
      id, on: true, t: 0, plan: upPlan(st.plan), s: st, hit: 0, morphed: false, chimed: false,
      bx: im.x, by: im.y, sx: im.scaleX, sy: im.scaleY, ox: im.originX, oy: im.originY, tint: im.tintTopLeft, scafH: scaffoldH(st.size), build: false,
    });
    const sz = Math.max(1, Math.min(4, st.size));
    const showScaf = st.plan !== 'quick' && this.scene.textures.exists(scaffoldArt(sz, 'back').key);
    for (const [im2, part] of [[slot.back, 'back'], [slot.front, 'front']] as const) {
      if (!showScaf) {
        im2.setVisible(false);
        continue;
      }
      const p = scaffoldArt(sz, part);
      im2.setTexture(p.key).setOrigin(p.ax / p.w, p.ay / p.h).setScale(1 / this.r).setPosition(im.x, im.y).setRotation(0).setAlpha(1).setVisible(true);
      im2.setDepth(im.depth + (part === 'back' ? -0.02 : 0.02));
    }
    slot.ghost.setVisible(false);
    slot.beam.setVisible(false);
    const wpx = (st.plan === 'hq' ? 34 : 26) * this.r;
    slot.word.setVisible(false).setText('升级!');
    if (slot.wordPx !== wpx) {
      slot.wordPx = wpx;
      slot.word.setFontSize(`${wpx}px`);
    }
    slot.lv.setVisible(false).setText(`${st.newLv} 级`);
    // 施工开场：脚下起一圈尘
    if (st.plan !== 'quick') this.pt.dust(im.x, im.y + 2, sz * 0.45);
    if (st.plan === 'quick') this.morph(slot);
  }

  /**
   * 新建筑的施工：放下后先围脚手架、锤几下，本体从地面升起，完工时金光（升级演出的光柱、彩带、声音，按大小分档）。
   * 规则已经立即完成，演出不挡操作；减弱动态（feelOn 关）时不演，直接站着。槽位、逐帧插值、holds / busy 和升级共用。
   */
  build(id: number, st: BuildStart): void {
    if (!feelOn()) return;
    this.finish(id);
    this.drops = this.drops.filter((d) => d.img !== st.img);
    let slot = this.slots.find((s) => !s.on);
    if (!slot) {
      if (this.slots.length < MAX_SLOTS) slot = this.mkSlot();
      else {
        const old = this.slots.reduce((a, b) => (a.t >= b.t ? a : b));
        this.end(old);
        slot = old;
      }
    }
    const im = st.img;
    const sz = Math.max(1, Math.min(4, st.size));
    const up: UpStart = {
      img: im, size: st.size, plan: st.big ? 'hq' : 'normal', oldKey: null, oldLv: 1, newLv: 1, big: st.big, top: st.top, morph: () => undefined,
    };
    Object.assign(slot, {
      id, on: true, t: 0, plan: buildPlan(st.big), s: up, hit: 0, morphed: false, chimed: false, build: true,
      bx: im.x, by: im.y, sx: im.scaleX, sy: im.scaleY, ox: im.originX, oy: im.originY, tint: im.tintTopLeft, scafH: scaffoldH(st.size),
    });
    const showScaf = this.scene.textures.exists(scaffoldArt(sz, 'back').key);
    for (const [im2, part] of [[slot.back, 'back'], [slot.front, 'front']] as const) {
      if (!showScaf) {
        im2.setVisible(false);
        continue;
      }
      const p = scaffoldArt(sz, part);
      im2.setTexture(p.key).setOrigin(p.ax / p.w, p.ay / p.h).setScale(1 / this.r).setPosition(im.x, im.y).setRotation(0).setAlpha(1).setVisible(true);
      im2.setDepth(im.depth + (part === 'back' ? -0.02 : 0.02));
    }
    slot.ghost.setVisible(false);
    slot.beam.setVisible(false);
    slot.word.setVisible(false);
    slot.lv.setVisible(false);
    im.setScale(0, 0).setAlpha(0);
    this.pt.dust(im.x, im.y + 2, sz * 0.5);
  }

  /** 城墙的短版：不搭架子，从地面升起一下，起点一小圈尘 */
  rise(img: Phaser.GameObjects.Image): void {
    if (!feelOn()) return;
    this.drops = this.drops.filter((d) => d.img !== img);
    this.drops.push({ img, t: 0, bx: img.x, by: img.y, sx: img.scaleX, sy: img.scaleY, size: 1, landed: true, rise: true });
    img.setScale(img.scaleX, img.scaleY * 0.05).setAlpha(0);
    this.pt.dust(img.x, img.y + 2, 0.4);
  }

  /** 这座建筑的演出直接播到结束（移动它、它被拆掉时） */
  finish(id: number): void {
    for (const s of this.slots) if (s.on && s.id === id) this.end(s);
  }

  /** 放下建筑的落地：落下、压扁回弹、着地一圈尘 */
  drop(img: Phaser.GameObjects.Image, size: number): void {
    this.drops = this.drops.filter((d) => d.img !== img);
    this.drops.push({ img, t: 0, bx: img.x, by: img.y, sx: img.scaleX, sy: img.scaleY, size, landed: false, rise: false });
    const [lift, kx, ky, a] = dropPose(0);
    img.setPosition(img.x, img.y - lift).setScale(img.scaleX * kx, img.scaleY * ky).setAlpha(a);
  }

  private mkSlot(): Slot {
    const sc = this.scene;
    const lu = fxA('levelup');
    const mkText = (color: string): Phaser.GameObjects.Text =>
      sc.add.text(0, 0, '', { fontFamily: FONT, fontStyle: '900', fontSize: `${24 * this.r}px`, color, stroke: '#2b1a15', strokeThickness: 5 * this.r }).setOrigin(0.5, 1).setDepth(DEPTH.upgradeText).setVisible(false);
    // plan / s 在 start() 里才有，空槽先不带；起播时整体覆盖
    const s: Omit<Slot, 'plan' | 's'> = {
      id: -1, wordPx: -1, on: false, t: 0, hit: 0, morphed: false, chimed: false, bx: 0, by: 0, sx: 1, sy: 1, ox: 0.5, oy: 1, tint: 0xffffff, scafH: 40, build: false,
      back: sc.add.image(0, 0, '__DEFAULT').setVisible(false),
      front: sc.add.image(0, 0, '__DEFAULT').setVisible(false),
      beam: sc.add.image(0, 0, lu.key).setOrigin(lu.ax / lu.w, lu.ay / lu.h).setVisible(false),
      ghost: sc.add.image(0, 0, '__DEFAULT').setVisible(false),
      word: mkText('#ffe885'),
      lv: mkText('#ffffff'),
    };
    const slot = s as Slot;
    this.slots.push(slot);
    return slot;
  }

  /** 换外观那一下：残影、光柱、光圈、彩带金币、声音、振动 */
  private morph(s: Slot): void {
    s.morphed = true;
    const im = s.s.img;
    if (!im.active) return;
    s.s.morph();
    const key = s.s.oldKey;
    if (key && key !== im.texture.key && this.scene.textures.exists(key)) {
      s.ghost.setTexture(key).setOrigin(s.ox, s.oy).setFlipX(im.flipX).setScale(s.sx, s.sy).setPosition(s.bx, s.by).setDepth(im.depth + 0.03).setAlpha(1).setVisible(true);
      s.ghost.setTint(s.tint);
    }
    const hq = s.s.plan === 'hq';
    const w = 0.55 + s.s.size * 0.32 + (hq ? 0.3 : 0);
    s.beam.setPosition(s.bx, s.by + 2).setDepth(im.depth + 0.5).setScale(w / this.r, 0.4 / this.r).setAlpha(0).setVisible(true);
    this.pt.ringBurst(s.bx, s.by + 2, s.s.size + (hq ? 1 : 0));
    this.pt.confetti(s.bx, s.s.top() + 6, hq);
    if (s.s.plan !== 'quick') this.pt.splinters(s.bx, s.by - s.scafH * 0.5, hq ? 8 : 5);
    this.pt.bloom.flash(s.bx, s.by - s.scafH * 0.4, 30 + s.s.size * 14, 0xffd86a, 420, 0.55);
    sfx(upgradeSound(s.s.big));
    vibrate('upgrade');
  }

  private end(s: Slot): void {
    if (!s.morphed) this.morph(s);
    s.on = false;
    const im = s.s.img;
    if (im.active) {
      im.setPosition(s.bx, s.by).setScale(s.sx, s.sy);
      im.setTintMode(Phaser.TintModes.MULTIPLY).setTint(s.tint);
      if (s.build) im.setAlpha(1);
    }
    for (const o of [s.back, s.front, s.beam, s.ghost, s.word, s.lv]) o.setVisible(false);
    const done = s.s.done;
    s.s = { ...s.s, done: undefined };
    done?.();
  }

  private update(dt: number): void {
    for (const s of this.slots) if (s.on) this.step(s, dt);
    if (this.drops.length) this.stepDrops(dt);
  }

  private step(s: Slot, dt: number): void {
    const im = s.s.img;
    if (!im.active) {
      this.end(s);
      return;
    }
    s.t += dt;
    const p = s.plan;
    // 锤子：每一下火星木屑落在脚手架上不同的位置
    while (s.hit < p.hits.length && s.t >= p.hits[s.hit]!) {
      const i = s.hit++;
      const span = s.s.size * 26;
      const hx = s.bx + (((i * 37) % 100) / 100 - 0.5) * span;
      const hy = s.by - s.scafH * (0.35 + (i % 2) * 0.45);
      this.pt.hammer(hx, hy, i);
      sfx('hitWood', { pitch: 1 + (i % 3) * 0.08, gap: 60 });
    }
    if (!s.morphed && s.t >= p.morph) this.morph(s);
    if (s.morphed && !s.chimed && s.t >= p.morph + 260) {
      s.chimed = true;
      sfx(s.s.plan === 'hq' ? 'star' : 'coin');
    }
    const f = s.build ? buildFrame(p as ReturnType<typeof buildPlan>, s.t) : upFrame(p, s.t);
    if (f.done) {
      this.end(s);
      return;
    }
    // 本体：颤动、压扁回弹、换外观那一下加亮（加色，不变成一团白）
    im.setPosition(s.bx + f.dx, s.by).setScale(s.sx * f.sx, s.sy * f.sy);
    if ('alpha' in f) im.setAlpha(f.alpha as number);
    if (f.glow > 0.02) {
      const g = Math.round(0xb0 * f.glow);
      im.setTintMode(Phaser.TintModes.ADD).setTint((g << 16) | (g << 8) | g);
    } else if (im.tintMode !== Phaser.TintModes.MULTIPLY) im.setTintMode(Phaser.TintModes.MULTIPLY).setTint(s.tint);
    // 脚手架：从地面往上露出来（裁剪），完成后往外倒、往下落、淡掉
    for (const [o, dir] of [[s.back, -1], [s.front, 1]] as const) {
      if (!o.visible) continue;
      const fw = o.frame.width;
      const fh = o.frame.height;
      const k = Math.max(0.001, Math.min(1, f.fall > 0 ? 1 : f.scaf));
      o.setCrop(0, fh * (1 - k), fw, fh * k);
      o.setPosition(s.bx + (f.fall > 0 ? 0 : f.dx * 0.6), s.by + (f.fall > 0 ? 22 * f.fall * f.fall : (1 - Math.min(1, f.scaf)) * 6));
      o.setRotation(dir * 0.07 * f.fall);
      o.setAlpha(f.fall > 0 ? 1 - f.fall : 1);
    }
    if (s.ghost.visible) {
      s.ghost.setAlpha(f.ghostA).setScale(s.sx * f.ghostS, s.sy * f.ghostS);
      if (f.ghostA <= 0.01) s.ghost.setVisible(false);
    }
    if (s.beam.visible) {
      const hq = s.s.plan === 'hq' ? 1.4 : 1;
      s.beam.setScale(s.beam.scaleX, ((0.5 + 0.9 * f.beam) * hq) / this.r).setAlpha(f.beamA * 0.95).setY(s.by + 2 - 10 * f.beam);
    }
    // 字：屏幕上大小不变（按镜头缩放反算），"升级!" 弹出后往上飘；等级数字换成新等级那一下跳一下
    const z = this.zoom();
    const ts = 1 / (this.r * z);
    if (f.wordA > 0 && !s.build) {
      // "升级!" 的底边在建筑顶上 40 屏幕像素，等级在它下面；整组的上沿（字高 + 6）不能高过可见区上沿
      const fs = s.s.plan === 'hq' ? 34 : 26;
      let wy = s.s.top() - (40 + f.wordUp) / z;
      const lim = s.s.minY?.();
      if (lim !== undefined && Number.isFinite(lim)) wy = Math.max(wy, lim + (fs + 10) / z);
      s.word.setVisible(true).setAlpha(f.wordA).setScale(ts * Math.max(0.01, f.word)).setPosition(s.bx, wy);
      s.lv.setVisible(true).setAlpha(f.wordA).setScale(ts * f.lvPop * Math.max(0.01, f.word)).setPosition(s.bx, wy + 32 / z);
    } else {
      s.word.setVisible(false);
      s.lv.setVisible(false);
    }
  }

  private stepDrops(dt: number): void {
    const keep: Drop[] = [];
    for (const d of this.drops) {
      if (!d.img.active) continue;
      d.t += dt;
      const k = d.rise ? d.t / WALL_RISE_MS : d.t / DROP_MS;
      const [lift, kx, ky, a] = d.rise ? ([0, riseScale(k)[1], riseScale(k)[0], riseScale(k)[2]] as const) : dropPose(k);
      d.img.setPosition(d.bx, d.by - lift).setScale(d.sx * kx, d.sy * ky).setAlpha(a);
      if (!d.landed && lift <= 0) {
        d.landed = true;
        this.pt.dust(d.bx, d.by + 2, d.size * 0.7);
        vibrate('land');
      }
      if (k >= 1) d.img.setPosition(d.bx, d.by).setScale(d.sx, d.sy).setAlpha(1);
      else keep.push(d);
    }
    this.drops = keep;
  }
}
