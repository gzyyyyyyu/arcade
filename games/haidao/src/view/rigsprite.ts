import Phaser from 'phaser';
import type { ArtPiece } from './art/index.ts';
import { rigFrame, type RigFrame } from './art/rigparts.ts';
import { guardKick, lerpPlace, shieldPlace, type ShieldPlace } from './shieldlook.ts';
import { DEATH_MS as FALL_MS, attackFrame, deathPose, easeInOutSine, strideFrame, type DeathPose } from './motion.ts';
import {
  DEATH_CLIP, DEATH_MS, HIT, HIT_HEAVY, HIT_HEAVY_MS, HIT_MS, IDLE_MS, RIG_PARTS, SKEL, STYLE,
  addPose, arcLook, charLevel, stopK, copyPose, deathAlpha, hatDrop, mixPose, newXf, onRest, rigLod, sampleClip, solveRig, strideOf, zeroPose,
  type Clip, type DeathStyle, type Pose, type RigKind, type RigStyle, type RigXf, type Skel,
} from './rig.ts';
import { REDUCED } from './feel.ts';

/**
 * 分件骨架的 Phaser 一侧（数学和关键帧在 rig.ts，素材在 art/rigparts.ts）：
 * 一个 Rig = 一个 Container（影子、后腿、前腿、后臂、身体、头、帽子、前臂、武器、刀光共 10 张图，都取自同一张图集，不换贴图）
 * + 一张整帧图（远景 / 屏外时退化用，鹦鹉群这种不是人形的一直用它）。
 * 场景每帧调 update 传位置、动作、走过的距离、攻击进度；对象由 RigPool 复用，倒下演完放回池子，不销毁。
 */

/** 部件图集（不带皮肤）的贴图 key；皮肤的图集另一张，按需烘焙 */
export const RIG_TEX = 'rig';
/** 带皮肤的图集 key；tm 给了就先查烘好没有，没烘好退回默认图集 */
export function rigTex(kind: RigKind, skin?: string, tm?: Phaser.Textures.TextureManager): string {
  if (skin !== 'gold' && skin !== 'shadow' && skin !== 'royal') return RIG_TEX;
  const k = `${RIG_TEX}~${kind}~${skin}`;
  return !tm || tm.exists(k) ? k : RIG_TEX;
}

/** 整帧图的来源：远景退化、鹦鹉群用（anim = idle / walk / attack） */
export type FrameSrc = (anim: 'idle' | 'walk' | 'attack') => ArtPiece[] | null;

export interface RigIn {
  x: number;
  y: number;
  depth: number;
  /** 显示朝向 -1..1（场景用 turnStep 过渡好的） */
  face: number;
  mode: 'idle' | 'walk' | 'attack';
  /** 整个人晃的角度（弧度，被震晕时用；不传 = 不管） */
  wob?: number;
  /** 走过的世界距离（像素）：走路循环按它推进 */
  dist: number;
  /** 攻击进度 0..1；-1 = 攻击模式里两次出手之间（摆架势待机） */
  atk: number;
  /** 场景附加的上下偏移（跳下船的小弹跳）和压扁 */
  oy: number;
  sq: number;
  alpha: number;
  /** 0 = 完整骨架，1 = 整帧图，2 = 屏外（不画） */
  lod: 0 | 1 | 2;
  /** 这一帧要不要重算部件（同屏太多时隔帧算） */
  full: boolean;
  /** 盾兵：盾朝的方向（世界坐标，单位向量 × 100）；不是盾兵不传 */
  gx?: number;
  gy?: number;
  /** 盾放下（被震晕）：盾往下垂、不再算挡 */
  gdown?: boolean;
}

const PART_ORDER = ['shadow', 'legB', 'legF', 'armB', 'torso', 'head', 'hat', 'armF', 'wep', 'trail'] as const;
type Slot = (typeof PART_ORDER)[number];
/** 切换动作时的过渡（毫秒） */
const BLEND_MS = 140;

/**
 * 受击闪白：用加色（ADD）把灰度 g 加到每个部件上，g = 255 时 RGB 全部顶到 1，就是真白，贴图透明的地方不受影响。
 * 选加色而不是 setTintFill / 白色剪影精灵的原因：Phaser 4 的着色模式是每个顶点的属性，同一个 shader 里 MULTIPLY 和 ADD
 * 混着画不会断合批，也不用多一张精灵、多一次绘制；而 FILL 只能整块纯白，没法渐隐。
 * 曲线：出手快（第一帧就是满白，保持 hold 毫秒）、收手慢（之后按平方渐隐到 0）。重击保持更久、退得更慢。
 * 渐隐量化成 FLASH_STEPS 档，只在档位变时才重设着色，不每帧给十几个部件重设。
 */
const FLASH_STEPS = 5;
const FLASH_LIGHT = { hold: 40, total: 100 };
const FLASH_HEAVY = { hold: 70, total: 180 };
/** 受击闪白的档位（1..FLASH_STEPS，0 = 不闪）；el = 挨打后过了多少毫秒 */
export function flashStep(el: number, heavy: boolean): number {
  const f = heavy ? FLASH_HEAVY : FLASH_LIGHT;
  if (el < 0 || el >= f.total) return 0;
  if (el < f.hold) return FLASH_STEPS;
  const u = (el - f.hold) / (f.total - f.hold);
  return Math.ceil((1 - u) * (1 - u) * FLASH_STEPS);
}
/** 减速（焦油）的染色：比原来的灰更黑一点，远看就是一身黑油 */
const TINT_SLOW = 0x4c4a52;

export class Rig {
  readonly c: Phaser.GameObjects.Container;
  /** 整帧图（远景、鹦鹉群）：和容器同级，不在容器里 */
  readonly flat: Phaser.GameObjects.Image;
  private img: Record<Slot, Phaser.GameObjects.Image>;
  /** 挥砍的弧形残影（arcLook）：一张程序画的月牙，挂在肩上朝着手的方向，亮度跟刀光 */
  private arc: Phaser.GameObjects.Image;
  private arcSpec: ReturnType<typeof arcLook> = null;
  /** 盾兵的大木盾（单独一张图，挂在容器里，按盾朝向摆在身体前 / 后 / 左 / 右）；没有盾的兵种一直藏着 */
  private shield: Phaser.GameObjects.Image;
  private hasShield = false;
  /** 盾现在在哪（转身时从旧位置绕过去）、想去哪 */
  private readonly sPlace: ShieldPlace = shieldPlace(100, 50, { x: 0, y: 0, sx: 1, behind: false, nx: 0, ny: 0, rot: 0 });
  private readonly sWant: ShieldPlace = { x: 0, y: 0, sx: 1, behind: false, nx: 0, ny: 0, rot: 0 };
  private sBehind = false;
  private sInit = false;
  private sLower = 0;
  private sNow = 0;
  private guardT0 = -1e9;
  /** 盾心的世界位置（火花、格挡音挂在这里） */
  shX = 0;
  shY = 0;
  /** 最近一帧的动作（遮挡剪影取同一张整帧图用） */
  private gMode: RigIn['mode'] = 'idle';
  private gDist = 0;
  private gAtk = -1;
  private gFace = 1;
  kind: RigKind | null = null;
  private sk: Skel = SKEL['t.sailor'];
  private st: RigStyle = STYLE['t.sailor'];
  private frames: FrameSrc = () => null;
  private has = new Set<RigFrame>();
  private readonly pose = zeroPose();
  private readonly d = zeroPose();
  private readonly tmp = zeroPose();
  private readonly from = zeroPose();
  private readonly xf: RigXf = newXf();
  private mode = '';
  private blendT0 = -1e9;
  private headFrame: RigFrame = 'head';
  private blinkAt = 0;
  private extra: Clip | null = null;
  private extraT0 = 0;
  private nextExtra = 0;
  private hitT0 = -1e9;
  private hitHeavy = false;
  /** 减速时身上的黑点和油滴：挂在容器里，跟兵的深度走（被建筑挡住时一起被挡，不浮在屋顶上） */
  private readonly tar: Phaser.GameObjects.Graphics;
  private charQ = 0;
  private flashUntil = 0;
  private healUntil = 0;
  private slow = false;
  /** 焦油油滴上次画的那一格（-1 = 没画） */
  private tarStep = -1;
  /** tint() 要染的部件列表，第一次用时建好，之后不再每次拼数组 */
  private tintParts: Phaser.GameObjects.Image[] | null = null;
  private readonly tintFlat: Phaser.GameObjects.Image[];
  private tinted = 0;
  private lod: 0 | 1 | 2 = 0;
  private flatKey = '';
  /** 倒下：样式、倒向、帽子飞出去的起点 */
  private death: DeathStyle | null = null;
  private hat0 = { x: 0, y: 0, r: 0 };
  private readonly hatO = { x: 0, y: 0, r: 0 };
  private readonly fallPose: DeathPose = { angle: 0, dy: 0, sy: 1, alpha: 1 };
  private fallDir = 1;
  private flatY = 0;
  private flatSx = 1;
  /** 倒下 / 英雄倒地后保持的朝向 */
  private dFace = 1;
  /** 头顶（世界坐标）：血条、飘字挂在这里 */
  topY = 0;

  private scene: Phaser.Scene;
  private r: number;

  constructor(scene: Phaser.Scene, r: number) {
    this.scene = scene;
    this.r = r;
    const mk = (): Phaser.GameObjects.Image => new Phaser.GameObjects.Image(scene, 0, 0, '__DEFAULT').setScale(1 / r);
    this.img = Object.fromEntries(PART_ORDER.map((p) => [p, mk()])) as Record<Slot, Phaser.GameObjects.Image>;
    ensureArcTexture(scene, r);
    this.arc = new Phaser.GameObjects.Image(scene, 0, 0, `${ARC_TEX}.${r}`).setOrigin(1 / 3, 0.5).setVisible(false);
    const parts = PART_ORDER.map((p) => this.img[p]);
    parts.splice(PART_ORDER.indexOf('armF'), 0, this.arc);
    this.shield = new Phaser.GameObjects.Image(scene, 0, 0, '__DEFAULT').setScale(1 / r).setVisible(false);
    parts.splice(parts.indexOf(this.img.armF), 0, this.shield);
    this.tar = new Phaser.GameObjects.Graphics(scene).setVisible(false);
    this.c = scene.add.container(0, 0, [...parts, this.tar]);
    this.flat = scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    this.tintFlat = [this.flat];
  }

  /** 换成另一种单位（池子复用时）：tex = 部件图集，frames = 整帧图来源；kind 为 null 时只用整帧图（鹦鹉群） */
  setup(kind: RigKind | null, tex: string, frames: FrameSrc, now: number): this {
    this.kind = kind;
    this.frames = frames;
    this.has.clear();
    if (kind) {
      this.sk = SKEL[kind];
      this.st = STYLE[kind];
      const t = this.scene.textures.get(tex);
      for (const p of PART_ORDER) {
        const name = rigFrame(kind, p);
        const im = this.img[p];
        if (t.has(name)) {
          this.has.add(p);
          const fr = t.get(name);
          im.setTexture(tex, name);
          const cd = fr.customData as { ax?: number; ay?: number };
          im.setOrigin((cd.ax ?? 0) / fr.width, (cd.ay ?? 0) / fr.height);
          im.setVisible(p !== 'trail');
        } else im.setVisible(false);
        im.setAlpha(1).setRotation(0);
      }
      for (const h of ['headBlink', 'headAtk'] as const) if (t.has(rigFrame(kind, h))) this.has.add(h);
      const sn = rigFrame(kind, 'shield');
      this.hasShield = t.has(sn);
      if (this.hasShield) {
        const fr = t.get(sn);
        const cd = fr.customData as { ax?: number; ay?: number };
        this.shield.setTexture(tex, sn).setOrigin((cd.ax ?? 0) / fr.width, (cd.ay ?? 0) / fr.height).setAlpha(1).setRotation(0);
      }
    } else this.hasShield = false;
    this.shield.setVisible(false);
    this.sInit = false;
    this.sLower = 0;
    this.guardT0 = -1e9;
    this.sBehind = false;
    this.c.remove(this.shield, false);
    this.c.addAt(this.shield, this.c.getIndex(this.img.armF));
    this.arcSpec = kind ? arcLook(kind) : null;
    this.arc.setVisible(false);
    if (this.arcSpec) this.arc.setTint(this.arcSpec.tint);
    this.mode = '';
    this.blendT0 = -1e9;
    this.headFrame = 'head';
    this.blinkAt = now + 1500 + Math.random() * 3000;
    this.extra = null;
    this.nextExtra = now + 3000 + Math.random() * 5000;
    this.hitT0 = -1e9;
    this.flashUntil = this.healUntil = 0;
    this.slow = false;
    this.tar.setVisible(false);
    this.charQ = 0;
    this.clearTint();
    this.death = null;
    this.lod = kind ? 0 : 1;
    this.flatKey = '';
    this.c.setVisible(!!kind).setAlpha(1).setScale(1).setRotation(0);
    this.flat.setVisible(!kind).setAlpha(1).setRotation(0);
    return this;
  }

  get x(): number {
    return this.c.x;
  }
  get y(): number {
    return this.c.y;
  }
  get active(): boolean {
    return this.c.active;
  }

  /** 挨打：真白一闪再渐隐（flashStep）+ 叠一段后仰回正；重击（伤害占血量一大块）白得更久，后仰更大还踉跄退一步 */
  hit(now: number, heavy = false): void {
    this.flashUntil = now + (heavy ? FLASH_HEAVY.total : FLASH_LIGHT.total);
    this.hitT0 = now;
    this.hitHeavy = heavy;
  }
  /** 回血：染绿一下 */
  heal(now: number): void {
    this.healUntil = now + 220;
  }
  setSlow(on: boolean): void {
    this.slow = on;
  }

  /** 每帧：场景给位置和动作 */
  update(o: RigIn, now: number): void {
    const flatOnly = !this.kind;
    const lod = flatOnly ? (o.lod === 2 ? 2 : 1) : o.lod;
    if (lod !== this.lod) {
      this.lod = lod;
      this.c.setVisible(lod === 0);
      this.flat.setVisible(lod === 1);
      // 染色只染当时那一套（分件或整张），换套后要重染：远处踩上焦油、镜头拉近换成分件时，身上原来不会变黑
      this.tinted = -1;
    }
    this.topY = o.y + this.sk.top * this.sk.s;
    this.gMode = o.mode;
    this.gDist = o.dist;
    this.gAtk = o.atk;
    this.gFace = o.face;
    this.tint(now);
    if (lod === 2) {
      this.c.setPosition(o.x, o.y);
      this.flat.setPosition(o.x, o.y);
      return;
    }
    if (lod === 1) {
      this.drawFlat(o, now);
      return;
    }
    this.c.setPosition(o.x, o.y + o.oy).setDepth(o.depth).setAlpha(o.alpha);
    this.drawTar(now);
    if (o.wob !== undefined) this.c.setRotation(o.wob);
    if (!o.full && this.mode === o.mode) {
      this.c.setScale(o.face * this.turnSign() * (1 + this.pose.sq / 2), 1 - this.pose.sq);
      if (this.hasShield) this.shieldTick(o, now);
      return;
    }
    this.solve(o, now);
    const sq = this.pose.sq + o.sq;
    this.c.setScale(o.face * this.turnSign() * (1 + sq / 2), 1 - sq);
    this.place(true);
    if (this.hasShield) this.shieldTick(o, now);
  }

  private drawTar(now: number): void {
    const g = this.tar;
    if (!this.slow) {
      if (g.visible) g.setVisible(false);
      return;
    }
    const id = Math.round(this.c.x * 7 + this.c.y * 3);
    // 油滴一个循环 700 毫秒量化成 24 格（约 29 毫秒一格，看不出台阶），格没变就不重画
    const step = Math.floor((((now + id * 13) % 700) / 700) * 24);
    if (g.visible && step === this.tarStep) return;
    this.tarStep = step;
    const drip = step / 24;
    g.setVisible(true).clear().fillStyle(0x15151a, 0.95);
    for (let i = 0; i < 4; i++) g.fillCircle((i - 1.5) * 5, -2 - (i % 2) * 5, 2.8);
    g.fillCircle(-5, -14 + drip * 12, 1.8 * (1 - drip * 0.5));
    g.fillCircle(6, -20 + ((drip + 0.5) % 1) * 14, 1.6);
  }

  /** 挡住一发：盾晃一下（shieldlook.ts 的 guardKick，减弱动态时不晃） */
  guard(now: number): void {
    this.guardT0 = now;
  }

  /**
   * 盾：按盾朝向摆在身体前 / 后 / 左 / 右，转身时绕过去；挡住时晃一下；被震晕垂下来。
   * 盾挂在容器里，容器朝右时 x 正向 = 屏幕右，朝左时整个容器镜像，所以位置和倾角都乘容器的朝向符号。
   */
  private shieldTick(o: RigIn, now: number): void {
    const sh = this.shield;
    if (o.gx === undefined || o.gy === undefined) {
      sh.setVisible(false);
      return;
    }
    shieldPlace(o.gx, o.gy, this.sWant);
    const dtMs = this.sInit ? Math.min(100, Math.max(0, now - this.sNow)) : 1000;
    this.sNow = now;
    this.sInit = true;
    // 转身的绕行速度：约 120 毫秒转完一大半
    lerpPlace(this.sPlace, this.sWant, 1 - Math.exp(-dtMs / 70));
    this.sLower += ((o.gdown ? 1 : 0) - this.sLower) * (1 - Math.exp(-dtMs / 90));
    const P = this.sPlace;
    const k = guardKick(now - this.guardT0, REDUCED);
    const sgn = this.c.scaleX < 0 ? -1 : 1;
    const s = this.sk.s;
    const lx = (P.x - P.nx * k.push) * s;
    const ly = (P.y - P.ny * k.push * 0.5 + this.sLower * 7) * s;
    sh.setPosition(lx * sgn, ly).setRotation((P.rot + k.rot - this.sLower * 0.45) * sgn).setScale((P.sx * k.scale) / this.r, k.scale / this.r).setVisible(true);
    if (P.behind !== this.sBehind) {
      this.sBehind = P.behind;
      // 朝屏幕上方的盾在后臂后面（被身体挡住），其余在前臂前面
      this.c.remove(sh, false);
      this.c.addAt(sh, this.c.getIndex(P.behind ? this.img.armB : this.img.armF));
    }
    this.shX = this.c.x + lx * Math.abs(this.c.scaleX);
    this.shY = this.c.y + ly * this.c.scaleY;
    sh.setAlpha(P.behind ? 0.95 : 1);
  }

  private turnSign(): number {
    return 1 - 2 * Math.min(1, Math.max(0, this.pose.turn));
  }

  /** 姿势：动作采样（相对站姿）→ 动作切换时过渡 → 叠受击 */
  private solve(o: RigIn, now: number): void {
    const st = this.st;
    if (o.mode !== this.mode) {
      if (this.mode) {
        copyPose(this.from, this.pose);
        this.blendT0 = now;
      }
      this.mode = o.mode;
      this.extra = null;
    }
    let clip: Clip;
    let k: number;
    if (o.mode === 'walk') {
      clip = st.walk;
      k = o.dist / strideOf(this.sk, st.legScale);
    } else if (o.mode === 'attack' && o.atk >= 0) {
      clip = st.attack;
      // 出手那一下这个兵自己顿 2–3 帧再追回（stopK），不顿全屏
      k = stopK(o.atk, clip.hit ?? 0.42, clip.ms ?? 640);
    } else {
      clip = st.idle;
      k = (now + (this.c.x * 7 + this.c.y * 3)) / IDLE_MS;
    }
    sampleClip(this.d, clip, k);
    onRest(this.tmp, st.rest, this.d, clip);
    // 待机：隔一阵随机来一个小动作（东张西望、船长指挥），只是画面
    if (o.mode === 'idle' && st.extras.length) {
      if (!this.extra && now >= this.nextExtra) {
        this.extra = st.extras[Math.floor(Math.random() * st.extras.length)]!;
        this.extraT0 = now;
      }
      if (this.extra) {
        const ek = (now - this.extraT0) / (this.extra.ms ?? 1000);
        if (ek >= 1) {
          this.extra = null;
          this.nextExtra = now + 4000 + Math.random() * 6000;
        } else addPose(this.tmp, sampleClip(this.d, this.extra, ek));
      }
    }
    const bk = (now - this.blendT0) / BLEND_MS;
    if (bk < 1) mixPose(this.pose, this.from, this.tmp, easeInOutSine(bk));
    else copyPose(this.pose, this.tmp);
    const hk = (now - this.hitT0) / (this.hitHeavy ? HIT_HEAVY_MS : HIT_MS);
    if (hk >= 0 && hk < 1) addPose(this.pose, sampleClip(this.d, this.hitHeavy ? HIT_HEAVY : HIT, hk), st.hitScale);
    // 减速（焦油）：走得吃力，身子压低、往前探，腿拖着走（走路按走过的距离推进，所以脚步自然跟着慢下来）
    if (this.slow && o.mode === 'walk') {
      this.pose.hipY += 1.3;
      this.pose.lean += 4;
      this.pose.sq += 0.025;
      this.pose.head += 4;
    }
    // 头：攻击出手前后张嘴，平时偶尔眨眼
    let hf: RigFrame = 'head';
    const hit = st.attack.hit ?? 0.42;
    if (o.mode === 'attack' && o.atk >= hit - 0.1 && o.atk <= hit + 0.22 && this.has.has('headAtk')) hf = 'headAtk';
    else if (this.has.has('headBlink')) {
      if (now >= this.blinkAt + 130) this.blinkAt = now + 2200 + Math.random() * 3500;
      if (now >= this.blinkAt) hf = 'headBlink';
    }
    if (hf !== this.headFrame) {
      this.headFrame = hf;
      this.img.head.setFrame(rigFrame(this.kind!, hf));
    }
  }

  /** 把正解的结果写到各部件上；hatOn = 帽子跟着头（倒下时帽子另算） */
  private place(hatOn: boolean): void {
    const xf = solveRig(this.xf, this.sk, this.pose);
    for (const p of RIG_PARTS) {
      const t = xf[p];
      this.img[p].setPosition(t.x, t.y).setRotation(t.r);
    }
    if (hatOn) this.img.hat.setPosition(xf.head.x, xf.head.y).setRotation(xf.head.r);
    this.img.shadow.setPosition(this.pose.x * this.sk.s * 0.9, 0);
    const as = this.arcSpec;
    if (as) {
      const a = this.mode === 'attack' ? this.pose.trail : 0;
      if (a > 0.03) {
        const sx = xf.armF.x;
        const sy = xf.armF.y;
        const R = Math.hypot(xf.wep.x - sx, xf.wep.y - sy) + as.len * this.sk.s;
        this.arc.setVisible(true).setPosition(sx, sy).setRotation(Math.atan2(xf.wep.y - sy, xf.wep.x - sx)).setScale(R / ARC_R / this.r).setAlpha(Math.min(1, a) * as.alpha);
      } else if (this.arc.visible) this.arc.setVisible(false);
    }
    const tr = this.img.trail;
    if (this.has.has('trail')) {
      const a = this.pose.trail;
      if (a > 0.03) tr.setVisible(true).setAlpha(Math.min(1, a) * 0.85).setPosition(xf.armF.x, xf.armF.y).setRotation(xf.armF.r);
      else if (tr.visible) tr.setVisible(false);
    }
  }

  /**
   * 遮挡剪影：被建筑挡住时，场景在建筑上面画一张这个兵当前动作的整帧图（实心浅色、半透明），人本身不变透明。
   * 把 im 设成和这个兵一样的位置、朝向、帧；没有整帧图（或在屏外）返回 false。
   */
  ghost(im: Phaser.GameObjects.Image, now: number): boolean {
    if (this.lod === 2 || !this.c.visible) return false;
    const anim = this.gMode === 'attack' && this.gAtk >= 0 ? 'attack' : this.gMode === 'walk' ? 'walk' : 'idle';
    const fs = this.frames(anim) ?? this.frames('walk');
    if (!fs?.length) return false;
    const i = anim === 'attack' ? attackFrame(this.gAtk, fs.length) : anim === 'walk' ? strideFrame(this.gDist, 9, fs.length) : Math.floor(now / 160) % fs.length;
    const f = fs[i]!;
    if (im.texture.key !== f.key) im.setTexture(f.key).setOrigin(f.ax / f.w, f.ay / f.h);
    const s = 1 / this.r;
    im.setPosition(this.c.x, this.c.y).setScale(s * (this.gFace >= 0 ? 1 : -1), s);
    return true;
  }

  private drawFlat(o: RigIn, now: number): void {
    const anim = o.mode === 'attack' && o.atk >= 0 ? 'attack' : o.mode === 'walk' ? 'walk' : 'idle';
    const fs = this.frames(anim) ?? this.frames('walk');
    if (fs?.length) {
      const i = anim === 'attack' ? attackFrame(o.atk, fs.length) : anim === 'walk' ? strideFrame(o.dist, 9, fs.length) : Math.floor(now / 160) % fs.length;
      const f = fs[i]!;
      if (f.key !== this.flatKey) {
        this.flatKey = f.key;
        this.flat.setTexture(f.key).setOrigin(f.ax / f.w, f.ay / f.h);
      }
    }
    const s = 1 / this.r;
    this.flat.setPosition(o.x, o.y + o.oy).setDepth(o.depth).setAlpha(o.alpha).setScale(s * o.face * (1 + o.sq), s * (1 - o.sq));
  }

  private tint(now: number): void {
    const fq = now < this.flashUntil ? flashStep(now - this.hitT0, this.hitHeavy) : 0;
    // 闪白的每一档各算一个状态（10 + 档位），其余沿用 0 / 2 / 3
    const want = fq > 0 ? 10 + fq : now < this.healUntil ? 2 : this.slow ? 3 : 0;
    if (want === this.tinted) return;
    this.tinted = want;
    const g = Math.round((fq * 255) / FLASH_STEPS);
    const white = (g << 16) | (g << 8) | g;
    if (!this.tintParts) this.tintParts = [...PART_ORDER.filter((p) => p !== 'shadow' && p !== 'trail').map((p) => this.img[p]), this.shield, this.flat];
    const list = this.lod === 1 || !this.kind ? this.tintFlat : this.tintParts;
    for (const im of list) {
      if (fq > 0) im.setTint(white).setTintMode(Phaser.TintModes.ADD);
      else if (want === 0) im.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      else im.setTint(want === 2 ? 0xa8ffb0 : TINT_SLOW).setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  private clearTint(): void {
    this.tinted = 0;
    for (const p of PART_ORDER) this.img[p].clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.shield.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.flat.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  // ---------------------------------------------------------------- 倒下

  /** 开始倒下（之后由 DyingList 每帧调 stepDeath）；face = 倒下那一刻的显示朝向 */
  die(style: DeathStyle, face: number): void {
    this.death = style;
    this.dFace = face >= 0 ? 1 : -1;
    this.fallDir = face >= 0 ? -1 : 1;
    this.flatY = this.flat.y;
    this.flatSx = this.flat.scaleX;
    this.flashUntil = 0;
    this.healUntil = 0;
    this.slow = false;
    this.tar.setVisible(false);
    this.tint(0);
    if (this.lod !== 0 || !this.kind) return;
    const h = this.img.hat;
    this.hat0 = { x: h.x, y: h.y, r: h.rotation };
    this.img.trail.setVisible(false);
    this.c.setScale(this.dFace, 1);
  }

  /** 整个倒下演完要多久（骨架的动作更长，整帧图沿用原来的倒下） */
  get deathMs(): number {
    return this.lod === 0 && this.kind ? DEATH_MS : FALL_MS;
  }

  /** k = 倒下进度 0..1 */
  stepDeath(k: number): void {
    if (this.lod !== 0 || !this.kind) {
      deathPose(this.fallPose, k);
      this.flat.setRotation(this.fallPose.angle * this.fallDir).setY(this.flatY + this.fallPose.dy).setAlpha(this.fallPose.alpha).setScale(this.flatSx, Math.abs(this.flatSx) * this.fallPose.sy);
      return;
    }
    this.deathPoseAt(k);
    this.place(false);
    if (this.death === 'burn') this.charTo(charLevel(k));
    if (this.has.has('hat')) {
      hatDrop(this.hatO, this.death!, k, (this.hat0.y / this.sk.s));
      this.img.hat.setPosition(this.hat0.x + this.hatO.x * this.sk.s, this.hat0.y + this.hatO.y * this.sk.s).setRotation(this.hat0.r + (this.hatO.r * Math.PI) / 180);
    }
    this.c.setAlpha(deathAlpha(k)).setScale(this.dFace * (1 + this.pose.sq / 2), 1 - this.pose.sq);
  }

  /** 烧焦：各部件的染色从原色渐变成焦黑（量化成 10 档，只在档位变时才重设） */
  private charTo(lv: number): void {
    const q = Math.round(lv * 10);
    if (q === this.charQ) return;
    this.charQ = q;
    const c = Math.round(255 - (255 - 0x26) * (q / 10));
    const col = (c << 16) | (c << 8) | Math.max(0x22, c - 4);
    for (const p of PART_ORDER) if (p !== 'shadow' && p !== 'trail') this.img[p].setTint(col);
    this.shield.setTint(col);
  }

  /** 倒下时身体（躺倒后）所在的世界坐标：尘土、烟从这里冒 */
  deathSpot(out: { x: number; y: number }): { x: number; y: number } {
    out.x = this.c.x + this.pose.x * this.sk.s * this.dFace;
    out.y = this.c.y;
    return out;
  }

  get deathKind(): DeathStyle | null {
    return this.death;
  }

  private deathPoseAt(k: number): void {
    const clip = DEATH_CLIP[this.death ?? 'kneel'];
    sampleClip(this.d, clip, k);
    onRest(this.pose, this.st.rest, this.d, clip);
  }

  /** 英雄倒地（不消失）：演跪倒、停在地上半透明；revive 回到站立 */
  downed(k: number): void {
    if (!this.kind) return;
    if (!this.death) {
      this.death = 'kneel';
      const h = this.img.hat;
      this.hat0 = { x: h.x, y: h.y, r: h.rotation };
      this.img.trail.setVisible(false);
    }
    const kk = Math.min(0.6, k);
    this.deathPoseAt(kk);
    this.place(false);
    if (this.has.has('hat')) {
      hatDrop(this.hatO, 'kneel', kk, this.hat0.y / this.sk.s);
      this.img.hat.setPosition(this.hat0.x + this.hatO.x * this.sk.s, this.hat0.y + this.hatO.y * this.sk.s).setRotation(this.hat0.r + (this.hatO.r * Math.PI) / 180);
    }
  }
  revive(): void {
    this.death = null;
    this.mode = '';
  }
  get isDown(): boolean {
    return this.death !== null;
  }

  /** 收进池子：藏起来，不销毁 */
  park(): void {
    this.c.setVisible(false);
    this.shield.setVisible(false);
    this.flat.setVisible(false);
    this.death = null;
    this.kind = null;
  }
}

/** 骨架对象池：同一个场景里复用 Container 和部件图，倒下演完放回来 */
export class RigPool {
  private free: Rig[] = [];
  /** 全部建过的个数（含在用的），报帧率时看对象数用 */
  made = 0;
  private scene: Phaser.Scene;
  private r: number;
  constructor(scene: Phaser.Scene, r: number) {
    this.scene = scene;
    this.r = r;
  }

  get(kind: RigKind | null, tex: string, frames: FrameSrc, now: number): Rig {
    let rig = this.free.pop();
    if (!rig) {
      this.made++;
      rig = new Rig(this.scene, this.r);
    }
    return rig.setup(kind, tex, frames, now);
  }

  put(rig: Rig): void {
    rig.park();
    this.free.push(rig);
  }
}

/** 细节层级：按相机算单位在屏幕上多高、在不在屏里（rig.ts 的 rigLod） */
export function lodOf(cam: Phaser.Cameras.Scene2D.Camera, r: number, x: number, y: number, heightWorld: number, margin: number): 0 | 1 | 2 {
  const v = cam.worldView;
  const m = margin / cam.zoom;
  const on = x >= v.x - m && x <= v.right + m && y >= v.y - m && y - heightWorld <= v.bottom + m;
  return rigLod((heightWorld * cam.zoom) / r, on);
}

export type { Pose };

/** 弧形残影的贴图：一段约 120° 的月牙（前沿最亮最宽、往后渐淡渐细），半径 ARC_R，圆心在 (0.5·ARC_R, ARC_R)、0° 是前沿 */
const ARC_TEX = 'rig.arc';
const ARC_R = 48;
function ensureArcTexture(scene: Phaser.Scene, r: number): void {
  const key = `${ARC_TEX}.${r}`;
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  g.setScale(r);
  const N = 14;
  const span = (120 * Math.PI) / 180;
  for (let i = 0; i < N; i++) {
    // 第 i 段：从前沿往后数，越往后越淡、内径越大（越细）
    const a0 = -span * (i / N);
    const a1 = -span * ((i + 1) / N);
    const w0 = 0.5 + 0.38 * (i / N);
    const w1 = 0.5 + 0.38 * ((i + 1) / N);
    const pts = [
      new Phaser.Math.Vector2(ARC_R * (0.5 + Math.cos(a0)), ARC_R + ARC_R * Math.sin(a0)),
      new Phaser.Math.Vector2(ARC_R * (0.5 + Math.cos(a1)), ARC_R + ARC_R * Math.sin(a1)),
      new Phaser.Math.Vector2(ARC_R * (0.5 + w1 * Math.cos(a1)), ARC_R + ARC_R * w1 * Math.sin(a1)),
      new Phaser.Math.Vector2(ARC_R * (0.5 + w0 * Math.cos(a0)), ARC_R + ARC_R * w0 * Math.sin(a0)),
    ];
    g.fillStyle(0xffffff, 0.85 * (1 - i / N) ** 1.6).fillPoints(pts, true);
  }
  g.generateTexture(key, Math.ceil(ARC_R * 1.5 * r) + 2, Math.ceil(ARC_R * 2 * r));
  g.destroy();
}

/** 显示对象总数（容器里的部件也算）：perf.ts 报对象数用 */
export function countObjects(scene: Phaser.Scene): number {
  let n = 0;
  for (const o of scene.children.list) n += 1 + (o instanceof Phaser.GameObjects.Container ? o.length : 0);
  return n;
}
