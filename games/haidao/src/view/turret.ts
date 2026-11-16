import type Phaser from 'phaser';
import { TURRET_PIVOT, gunTowerRoof, turretBaseArt } from './art/buildings.ts';
import { flameJetArt, turretFrame, turretGeom, turretPieces, turretTex, turretTier, type TurretGeom } from './art/turrets.ts';
import type { ArtPiece } from './art/index.ts';
import {
  SHOCK_CHARGE_MS, TURRET_SPEC, aimSnap, aimStep, dirIndex, dirResidual, flameReach, flameStep, groundAngle, idleAim, isTurret, isoVec, musketPose, recoilAt, screenAngle, shakeAt, tipOffset,
  type AimSpec, type AimState, type MusketPose, type TurretKind,
} from './aim.ts';
import { EASE, turnStep } from './motion.ts';
import { bakeAtlas, bakeSome, isBaked } from './textures.ts';
import type { Particles } from './fx.ts';
import { DEPTH } from './depth.ts';
import { REDUCED } from './feel.ts';

/**
 * 炮台的 Phaser 一侧（数学在 aim.ts，素材在 art/turrets.ts）：底座是场景原来那张建筑图（换成不带炮管的 `b.<种类>.<级>.ng`），
 * 炮管 / 喷嘴 / 发射架 / 火枪手各是一张图，每帧按转向、后坐、装填摆到底座的转轴上；喷火塔多一条火舌。
 * 分件素材按需烘焙（turretReady / ensureTurret），没烘好之前照旧显示整张建筑图，开火时整体后坐一下（老画法）。
 * 每帧只改已有对象的属性，不新建对象；离屏只推进角度不改图。
 */

// ---------------------------------------------------------------- 素材

/** 一座炮台要烘的普通纹理：不带炮管的底座、火枪塔的屋顶 */
function plainPieces(kind: TurretKind, level: number): ArtPiece[] {
  const out = [turretBaseArt(kind, level)];
  if (kind === 'gunTower') {
    const roof = gunTowerRoof(level);
    if (roof) out.push(roof);
  }
  return out;
}

export function turretReady(tm: Phaser.Textures.TextureManager, kind: TurretKind, level: number): boolean {
  return tm.exists(turretTex(kind, turretTier(level))) && plainPieces(kind, level).every((p) => isBaked(p.key)) && isBaked(flameJetArt().key);
}

const pending = new Map<string, Promise<void>>();
/** 同一张炮台图集（种类 + 档，几个等级共用一档）并发只烘一次：按等级去重不够，同档两个等级一起烘会报 "Texture key already in use" */
const atlasPending = new Map<string, Promise<void>>();
/** 火舌贴图所有炮台共用一张：只烘一次（并发的 ensureTurret 共用同一个承诺） */
let jetP: Promise<void> | null = null;
const bakeJet = (tm: Phaser.Textures.TextureManager, r: number): Promise<void> => (jetP ??= bakeSome(tm, [flameJetArt()], r));
/** 烘一座炮台的分件素材（同一种同一级并发只烘一次）；图集的帧设好转轴（setFrame 时自动用作原点） */
export function ensureTurret(tm: Phaser.Textures.TextureManager, kind: TurretKind, level: number, r: number): Promise<void> {
  const k = `${kind}.${level}`;
  let p = pending.get(k);
  if (!p) {
    const tex = turretTex(kind, turretTier(level));
    p = Promise.all([
      bakeSome(tm, plainPieces(kind, level), r),
      bakeJet(tm, r),
      tm.exists(tex)
        ? Promise.resolve()
        : (atlasPending.get(tex) ?? atlasPending.set(tex, bakeAtlas(tm, tex, turretPieces(kind, turretTier(level)), r).then(() => {
            const t = tm.get(tex);
            for (const name of t.getFrameNames()) {
              const fr = t.get(name);
              const cd = fr.customData as { ax?: number; ay?: number };
              fr.customPivot = true;
              fr.pivotX = (cd.ax ?? 0) / fr.width;
              fr.pivotY = (cd.ay ?? 0) / fr.height;
            }
          })).get(tex)!),
    ]).then(() => undefined).catch(() => undefined);
    pending.set(k, p);
  }
  return p;
}

/** 一批建筑里的炮台都烘好（开战前调；不是炮台的跳过） */
export async function ensureTurrets(tm: Phaser.Textures.TextureManager, list: ReadonlyArray<{ kind: string; level: number }>, r: number): Promise<void> {
  const seen = new Set<string>();
  const todo: Array<Promise<void>> = [];
  for (const b of list) {
    if (!isTurret(b.kind) || seen.has(`${b.kind}.${b.level}`)) continue;
    seen.add(`${b.kind}.${b.level}`);
    todo.push(ensureTurret(tm, b.kind, Math.max(1, Math.min(8, b.level)), r));
  }
  await Promise.all(todo);
}

// ---------------------------------------------------------------- 统计（perf / 冒烟看）

/** 开火时炮管还差多少没对准、补了几次：越少越好（大多数应在开火前转到位） */
export const turretStats = { shots: 0, snaps: 0, maxSnap: 0 };

// ---------------------------------------------------------------- 炮台

export interface TurretIn {
  /** 游戏时钟（毫秒）和这一帧的时长（冻住时传 0） */
  now: number;
  dt: number;
  /** 目标脚下的屏幕位置；has = 有没有要瞄的（规则正瞄着的，或快进射程的） */
  has: boolean;
  tx: number;
  ty: number;
  /** 规则正瞄着人（喷火塔据此持续喷） */
  aiming: boolean;
  /** 离规则的下一次开火还有多少毫秒（不知道 = Infinity） */
  until: number;
}

/** 开火时炮口在哪（屏幕）、炮口正下方的地面点、炮口离地多高 */
export interface Muzzle {
  x: number;
  y: number;
  gx: number;
  gy: number;
  z: number;
}

const LOD_MARGIN = 90;
const tmpV = { x: 0, y: 0 };
const pose: MusketPose = { lift: 0, ram: 0, lean: 0 };

export class Turret {
  readonly kind: TurretKind;
  level: number;
  readonly id: number;
  readonly base: Phaser.GameObjects.Image;
  private scene: Phaser.Scene;
  private r: number;
  private pt: Particles;
  private footX: number;
  private footY: number;
  private sp: AimSpec;
  private geom: TurretGeom;
  private piv = { dx: 0, dy: 0 };
  private tex = '';
  private fullKey: string;
  split = false;
  private dead = false;
  private gun: Phaser.GameObjects.Image | null = null;
  private body: Phaser.GameObjects.Image | null = null;
  private rod: Phaser.GameObjects.Image | null = null;
  private roof: Phaser.GameObjects.Image | null = null;
  private jet: Phaser.GameObjects.Image | null = null;
  private frameName = '';
  readonly st: AimState = { a: 0, v: 0 };
  private home = 0;
  private lastShot = -1e9;
  private reload = 1000;
  /** 射出去还没收回的鱼叉数（鱼叉炮显示空弩）；火箭打空到什么时候 */
  out = 0;
  private emptyUntil = 0;
  private face = 1;
  private flame = 0;
  private flameUp = true;
  private jetLen = 60;
  private nextEmber = 0;
  private tint = -1;
  private tintMode = -1;
  private requested = false;
  /** 震荡炮这一轮的蓄力光圈放出来了没有（开火后清零） */
  private charged = false;

  constructor(scene: Phaser.Scene, r: number, pt: Particles, kind: TurretKind, level: number, id: number, base: Phaser.GameObjects.Image, footX: number, footY: number) {
    this.scene = scene;
    this.r = r;
    this.pt = pt;
    this.kind = kind;
    this.level = level;
    this.id = id;
    this.base = base;
    this.footX = footX;
    this.footY = footY;
    this.sp = TURRET_SPEC[kind];
    this.geom = turretGeom(kind, level);
    this.fullKey = base.texture.key;
    // 素材画的默认朝向是屏幕右下（地面 +x）；没目标时在这附近按编号错开慢慢扫
    this.home = 0.6 + ((id * 37) % 7) * 0.12;
    this.st.a = this.home;
    this.trySplit();
  }

  /** 升级换了等级：换底座和炮管（没烘好就先用整张图，烘好下一帧自动换） */
  setLevel(level: number, fullKey: string): void {
    if (level === this.level && this.split) return;
    this.level = level;
    this.geom = turretGeom(this.kind, level);
    this.fullKey = fullKey;
    this.split = false;
    this.requested = false;
    this.tex = '';
    this.frameName = '';
    this.hideParts();
    this.trySplit();
  }

  private trySplit(): void {
    const tm = this.scene.textures;
    if (!turretReady(tm, this.kind, this.level)) {
      if (!this.requested) {
        this.requested = true;
        void ensureTurret(tm, this.kind, this.level, this.r);
      }
      return;
    }
    const b = turretBaseArt(this.kind, this.level);
    this.base.setTexture(b.key).setOrigin(b.ax / b.w, b.ay / b.h);
    this.piv = TURRET_PIVOT(this.kind, this.level);
    this.tex = turretTex(this.kind, turretTier(this.level));
    const mk = (): Phaser.GameObjects.Image => this.scene.add.image(0, 0, this.tex, turretFrame(this.kind, turretTier(this.level), 'd0'));
    this.gun ??= mk();
    this.gun.setTexture(this.tex, turretFrame(this.kind, turretTier(this.level), 'd0')).setVisible(true);
    this.frameName = '';
    if (this.kind === 'gunTower') {
      const tier = turretTier(this.level);
      this.body ??= mk();
      this.body.setTexture(this.tex, turretFrame(this.kind, tier, 'body')).setVisible(true);
      this.rod ??= mk();
      this.rod.setTexture(this.tex, turretFrame(this.kind, tier, 'rod')).setVisible(false);
      const roof = gunTowerRoof(this.level);
      if (roof) {
        this.roof ??= this.scene.add.image(0, 0, roof.key);
        this.roof.setTexture(roof.key).setOrigin(roof.ax / roof.w, roof.ay / roof.h).setVisible(true);
      } else this.roof?.setVisible(false);
    }
    if (this.kind === 'flame' && !this.jet) {
      const j = flameJetArt();
      this.jet = this.scene.add.image(0, 0, j.key).setOrigin(j.ax / j.w, j.ay / j.h).setVisible(false);
    }
    this.split = true;
  }

  private hideParts(): void {
    for (const o of [this.gun, this.body, this.rod, this.roof, this.jet]) o?.setVisible(false);
  }

  /** 建筑被打掉：收起会转的部分，底座交还场景（倒塌、瓦砾由场景管） */
  down(): void {
    this.dead = true;
    this.hideParts();
  }

  /** 开火（规则的 shoot 事件）：转到目标（还差太多就这一帧补完），起后坐、火光、烟；返回炮口位置给弹道当起点 */
  fire(now: number, reloadMs: number, tx: number, ty: number, out: Muzzle): Muzzle {
    const again = now - this.lastShot < 1;
    const want = groundAngle(tx - this.footX, ty - this.footY);
    if (!again) {
      turretStats.shots++;
      const d = Math.abs(aimSnap(this.st, want));
      if (d > 0) {
        turretStats.snaps++;
        turretStats.maxSnap = Math.max(turretStats.maxSnap, d);
      }
      this.lastShot = now;
      this.reload = Math.max(120, reloadMs);
    }
    this.muzzle(out, this.split ? this.st.a : want);
    if (this.dead) return out;
    if (!this.split) {
      // 老画法：整张图朝反方向顶一下、微微鼓起，EASE.recoil 回位
      if (!again) {
        const dl = Math.hypot(tx - this.footX, ty - this.footY) || 1;
        const b = this.base;
        this.scene.tweens.killTweensOf(b);
        const s0 = 1 / this.r;
        const sy = b.scaleY;
        b.setScale(s0 * 1.05, sy * 1.05).setPosition(this.footX - ((tx - this.footX) / dl) * 3, this.footY - ((ty - this.footY) / dl) * 1.5);
        this.scene.tweens.add({ targets: b, scaleX: s0, scaleY: sy, x: this.footX, y: this.footY, duration: 200, ease: EASE.recoil });
      }
      if (this.kind !== 'flame' && this.kind !== 'harpoon') this.pt.muzzle(out.x, out.y);
      return out;
    }
    this.fireFx(out, again);
    if (this.kind === 'harpoon') this.out++;
    if (this.kind === 'rocket') this.emptyUntil = now + this.reload * 0.45;
    return out;
  }

  /** 鱼叉收回来了 */
  reeled(): void {
    this.out = Math.max(0, this.out - 1);
  }

  /** 开火的火光、烟、后焰：全部走粒子池 */
  private fireFx(m: Muzzle, again: boolean): void {
    const pt = this.pt;
    const v = isoVec(this.st.a);
    const ux = v[0] / 45.3;
    const uy = v[1] / 45.3;
    const d = this.base.depth + 0.5;
    switch (this.kind) {
      case 'cannon':
      case 'gunTower': {
        const big = this.kind === 'cannon';
        pt.bloom.flash(m.x, m.y, big ? 16 : 9, 0xffd070, 140, big ? 0.5 : 0.35);
        // 炮口火舌：两团顺着炮管喷出去的亮光（快进快出）
        pt.emit('dust', m.x + ux * 4, m.y + uy * 4, { vx: ux * 120, vy: uy * 120, life: 90, s0: big ? 2.2 : 1.2, s1: big ? 3.6 : 2, a0: 1, tint: 0xfff2a0, depth: DEPTH.muzzle });
        pt.emit('dust', m.x, m.y, { life: 120, s0: big ? 1.8 : 1, s1: big ? 3 : 1.6, a0: 0.9, tint: 0xffb347, depth: DEPTH.muzzleLow });
        if (!again) {
          // 烟团：先顺着炮管冲出去，再慢慢往上飘散
          const n = big ? 3 : 1;
          for (let i = 0; i < n; i++) pt.emit('puff', m.x + ux * (6 + i * 5), m.y + uy * (6 + i * 5), { vx: ux * (46 - i * 12), vy: uy * (46 - i * 12) - 14, g: -14, life: 700 + i * 140, s0: big ? 0.5 : 0.3, s1: big ? 1.3 : 0.75, a0: 0.62, tint: i % 2 ? 0xc9ccd3 : 0xb3b7c0, depth: d });
          if (big) pt.sparks(m.x, m.y, 2);
        }
        break;
      }
      case 'mortar': {
        pt.bloom.flash(m.x, m.y - 4, 22, 0xffc060, 200, 0.6);
        pt.emit('dust', m.x, m.y - 6, { vy: -90, life: 120, s0: 2.6, s1: 4.2, a0: 1, tint: 0xfff2a0, depth: DEPTH.muzzle });
        if (!again) {
          // 一大团烟柱往上冲，再加一圈压出去的烟环
          for (let i = 0; i < 3; i++) pt.emit('puff', m.x + (i - 1) * 5, m.y - 6 - i * 4, { vx: (i - 1) * 10, vy: -60 + i * 12, g: 30, life: 900 + i * 120, s0: 0.6, s1: 1.6, a0: 0.7, tint: i % 2 ? 0xc9ccd3 : 0xa9adb6, depth: d });
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            pt.emit('puff', m.x, this.footY + this.piv.dy * 0.4, { vx: Math.cos(a) * 34, vy: Math.sin(a) * 15, life: 520, s0: 0.35, s1: 0.8, a0: 0.45, tint: 0xd9cfb2, depth: this.base.depth - 0.05 });
          }
        }
        break;
      }
      case 'rocket': {
        pt.bloom.flash(m.x, m.y, 12, 0xffa040, 160, 0.45);
        pt.emit('dust', m.x, m.y, { vx: ux * 80, vy: uy * 80 - 30, life: 110, s0: 1.4, s1: 2.4, a0: 1, tint: 0xffd070, depth: DEPTH.muzzle });
        // 后焰：发射架后面喷出一股烟
        const bx = m.x - ux * 34;
        const by = m.y - uy * 34 + 14;
        pt.emit('puff', bx, by, { vx: -ux * 60, vy: -uy * 60 - 6, g: -10, life: 620, s0: 0.4, s1: 1.1, a0: 0.6, tint: 0xc3c5cc, depth: d });
        break;
      }
      case 'harpoon':
        // 弦一响：弩前一点木屑似的小尘
        pt.emit('dust', m.x, m.y, { vx: ux * 50, vy: uy * 50, life: 120, s0: 1, s1: 1.6, a0: 0.7, tint: 0xf9f0da, depth: DEPTH.muzzle });
        break;
      case 'flame':
        break;
      case 'sniper': {
        // 长炮口闪光：一大团白黄亮光，三团顺着炮管拉出去的长焰（越往外越小越快），再冒一缕烟；弹迹由弹道（shots.ts）画
        pt.bloom.flash(m.x, m.y, 34, 0xfff2c0, 240, 0.9);
        for (let i = 0; i < 3; i++) {
          pt.emit('dust', m.x + ux * (4 + i * 10), m.y + uy * (4 + i * 10), { vx: ux * (240 - i * 50), vy: uy * (240 - i * 50), life: 130 - i * 14, s0: 2.8 - i * 0.5, s1: 4.8 - i * 0.9, a0: 1, tint: i ? 0xffe9a8 : 0xffffff, depth: DEPTH.muzzle });
        }
        if (!again) {
          pt.emit('puff', m.x + ux * 6, m.y + uy * 6, { vx: ux * 40, vy: uy * 40 - 16, g: -14, life: 800, s0: 0.4, s1: 1.1, a0: 0.55, tint: 0xc3c5cc, depth: d });
          pt.sparks(m.x, m.y, 3);
        }
        break;
      }
      case 'shock': {
        // 放出去：炮口一团蓝白亮光，一圈冲击圈从炮口扩开，地上扬起一圈灰
        this.charged = false;
        pt.bloom.flash(m.x, m.y, 24, 0x9fe8ff, 200, 0.7);
        pt.emit('ring', m.x, m.y + 4, { life: REDUCED ? 300 : 420, s0: REDUCED ? 0.9 : 0.2, s1: 0.9, a0: 0.95, tint: 0xbff0ff, depth: DEPTH.muzzle });
        if (REDUCED) break;
        pt.emit('dust', m.x + ux * 4, m.y + uy * 4, { vx: ux * 150, vy: uy * 150, life: 110, s0: 2.4, s1: 4.2, a0: 1, tint: 0xe8fbff, depth: DEPTH.muzzle });
        if (!again) {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.3;
            pt.emit('puff', m.x, this.footY + this.piv.dy * 0.3, { vx: Math.cos(a) * 40, vy: Math.sin(a) * 18, life: 520, s0: 0.35, s1: 0.85, a0: 0.45, tint: 0xd9d2c0, depth: this.base.depth - 0.05 });
          }
          pt.sparks(m.x, m.y, 2);
        }
        break;
      }
    }
  }

  /**
   * 震荡炮开火前蓄力 0.3 秒：炮口收拢的一圈光从大变小，同时炮身往后缩（recoilAt 的预备段）、炮口亮度一点点涨。
   * 蓄力光只在规则确实要开火（有目标、离下一发不到 SHOCK_CHARGE_MS）时出；一发一次。
   */
  private chargeTick(o: TurretIn): void {
    const on = o.has && o.until >= 0 && o.until < SHOCK_CHARGE_MS;
    if (!on) {
      if (o.until > SHOCK_CHARGE_MS * 1.5) this.charged = false;
      return;
    }
    if (this.dead || !this.split || !this.base.visible) return;
    const pt = this.pt;
    const m = this.muzzle({ x: 0, y: 0, gx: 0, gy: 0, z: 0 });
    if (!this.charged) {
      this.charged = true;
      // 一圈光收进炮口：收拢的速度刚好在开火那一拍合上
      pt.emit('ring', m.x, m.y, { life: Math.max(120, o.until), s0: REDUCED ? 0.5 : 1.1, s1: 0.2, a0: 0.8, tint: 0x8fe0ff, depth: DEPTH.muzzleLow });
    }
    // 炮口越攒越亮
    const k = 1 - Math.max(0, o.until) / SHOCK_CHARGE_MS;
    if (!REDUCED && pt.live < 110) pt.emit('dust', m.x, m.y, { life: 70, s0: 0.6 + k * 1.6, s1: 0.8 + k * 1.8, a0: 0.5 + k * 0.5, tint: 0xbff0ff, depth: DEPTH.muzzle });
  }

  /** 炮口位置（按地面角 a，含现在的后坐）写进 out */
  muzzle(out: Muzzle, a = this.st.a): Muzzle {
    const rel = (this.base.scaleY || 1 / this.r) * this.r;
    const px = this.base.x + this.piv.dx * rel;
    const py = this.base.y + this.piv.dy * rel;
    const g = this.geom;
    tipOffset(tmpV, a, g.len, g.z, g.k * rel);
    out.x = px + tmpV.x;
    out.y = py + tmpV.y;
    // 炮口正下方的地面：转轴在建筑上的高度换成地面上的点
    const v = isoVec(a);
    out.gx = this.footX + (v[0] * g.len * g.k) * 0.8;
    out.gy = this.footY + (v[1] * g.len * g.k) * 0.8;
    out.z = Math.max(4, out.gy - out.y);
    return out;
  }

  /** 每帧：转向、后坐、震动、装填、喷火，把各部件摆到底座的转轴上 */
  update(o: TurretIn): void {
    if (this.dead) return;
    if (!this.split) {
      this.trySplit();
      if (!this.split) return;
    }
    const since = o.now - this.lastShot;
    // 转向：有目标就朝目标（要开火了按剩余时间加急），没有就在家附近慢慢扫
    let want: number;
    if (o.has) {
      want = groundAngle(o.tx - this.footX, o.ty - this.footY);
      this.home = want;
    } else want = idleAim(this.home, o.now, this.id);
    aimStep(this.st, want, o.dt, this.sp, o.has ? o.until : Infinity);
    if (this.kind === 'shock') this.chargeTick(o);
    if (this.kind === 'flame') this.flameTick(o, since);
    const b = this.base;
    if (!b.visible) {
      this.hideParts();
      return;
    }
    // 底座震动：开火后往下压一下再弹回（只动 y，x 留给命中时的抖动补间）
    b.y = this.footY + shakeAt(since, this.sp);
    const cam = this.scene.cameras.main;
    const vw = cam.worldView;
    const m = LOD_MARGIN / cam.zoom;
    if (b.x < vw.x - m || b.x > vw.right + m || b.y < vw.y - m || b.y - 200 > vw.bottom + m) {
      this.hideParts();
      return;
    }
    const rel = (b.scaleY || 1 / this.r) * this.r;
    const relX = Math.abs(b.scaleX || 1 / this.r) * this.r;
    const px = b.x + this.piv.dx * relX;
    const py = b.y + this.piv.dy * rel;
    const a = this.st.a;
    const i = dirIndex(a);
    const tier = turretTier(this.level);
    const empty = (this.kind === 'harpoon' && this.out > 0) || (this.kind === 'rocket' && o.now < this.emptyUntil);
    const fn = turretFrame(this.kind, tier, `${empty ? 'e' : 'd'}${i}`);
    const gun = this.gun!;
    if (fn !== this.frameName) {
      this.frameName = fn;
      gun.setFrame(fn);
    }
    // 后坐：顺着炮管往后（臼炮是往下沉）
    const rc = recoilAt(since, o.until, this.sp);
    const v = isoVec(a);
    let ox: number;
    let oy: number;
    if (this.geom.up) {
      ox = (v[0] / 45.3) * rc * 0.3;
      oy = -rc;
    } else {
      ox = (v[0] / 45.3) * rc;
      oy = (v[1] / 45.3) * rc;
    }
    let rot = dirResidual(a, i);
    const dep = b.depth;
    const s = relX / this.r;
    const sy = rel / this.r;
    if (this.kind === 'gunTower') {
      musketPose(pose, since, this.reload);
      const sx = Math.cos(a) - Math.sin(a);
      if (Math.abs(sx) > 0.15) this.face = turnStep(this.face, sx >= 0 ? 1 : -1, o.dt);
      else this.face = turnStep(this.face, this.face >= 0 ? 1 : -1, o.dt);
      const fsg = sx >= 0 ? 1 : -1;
      rot -= fsg * pose.lift;
      const body = this.body!;
      body.setPosition(px + pose.lean * this.face, py).setScale(this.face * s, sy).setDepth(dep + 0.011).setVisible(true).setAlpha(b.alpha);
      gun.setDepth(dep + (v[1] < -6 ? 0.0105 : 0.012));
      // 通条：装填时插在枪口上，上下捅
      const rod = this.rod!;
      if (pose.ram > 0) {
        const ang = screenAngle(a) - fsg * pose.lift;
        const L = Math.hypot(v[0], v[1]) * this.geom.len * this.geom.k * s;
        const tx = px + ox + Math.cos(ang) * L;
        const ty = py + oy + Math.sin(ang) * L;
        rod.setPosition(tx - Math.cos(ang) * pose.ram * 9, ty - Math.sin(ang) * pose.ram * 9).setRotation(ang + Math.PI / 2).setScale(s, sy).setDepth(dep + 0.0115).setVisible(true).setAlpha(b.alpha);
      } else rod.setVisible(false);
      this.roof?.setPosition(b.x, b.y).setScale(s, sy).setDepth(dep + 0.02).setVisible(true).setAlpha(b.alpha);
    } else gun.setDepth(dep + 0.01);
    gun.setPosition(px + ox, py + oy).setRotation(rot).setScale(s, sy).setVisible(true).setAlpha(b.alpha);
    // 命中闪白、号令染金、被炸哑发灰：跟着底座
    if (b.tintTopLeft !== this.tint || b.tintMode !== this.tintMode) {
      this.tint = b.tintTopLeft;
      this.tintMode = b.tintMode;
      for (const p of [gun, this.body, this.rod, this.roof]) p?.setTint(this.tint).setTintMode(this.tintMode);
    }
    if (this.jet) this.drawJet(px + ox, py + oy, dep, s);
  }

  /** 喷火：规则瞄着人就持续喷（起势 RISE、收尾 FALL），停了冒两团烟 */
  private flameTick(o: TurretIn, since: number): void {
    const on = o.aiming || since < 260;
    const was = this.flame;
    if (on && was === 0) this.flameUp = true;
    if (!on && was > 0 && this.flameUp) {
      this.flameUp = false;
      // 收尾：喷嘴冒两团烟
      const m = this.muzzle({ x: 0, y: 0, gx: 0, gy: 0, z: 0 });
      for (let i = 0; i < 2; i++) this.pt.emit('puff', m.x, m.y - 2, { vx: (i - 0.5) * 16, vy: -26, g: -10, life: 760, s0: 0.35, s1: 0.9, a0: 0.55, tint: 0x6d6f78, depth: this.base.depth + 0.5 });
    }
    this.flame = flameStep(was, on, o.dt);
    if (o.has) this.jetLen = Math.max(36, Math.min(190, Math.hypot(o.tx - this.footX, o.ty - this.footY) * 0.92));
  }

  private drawJet(nx: number, ny: number, dep: number, s: number): void {
    const jet = this.jet!;
    const g = this.geom;
    tipOffset(tmpV, this.st.a, g.len, g.z, g.k * s);
    const x = nx + tmpV.x;
    const y = ny + tmpV.y;
    if (this.flame <= 0.001) {
      jet.setVisible(false);
      return;
    }
    const now = this.scene.time.now;
    const reach = flameReach(this.flame, this.flameUp);
    const flick = 0.86 + 0.14 * Math.sin(now / 37 + this.id) + 0.06 * Math.sin(now / 13);
    const ang = screenAngle(this.st.a);
    jet.setPosition(x, y).setRotation(ang).setScale(((this.jetLen * reach) / 100) * (0.94 + 0.06 * flick) / this.r, (0.7 + 0.35 * this.flame) * flick * s).setAlpha(Math.min(1, this.flame * 1.6)).setDepth(dep + 0.03).setVisible(true);
    // 火星：持续喷的时候隔一阵沿火舌飞出一粒（对象池，总量吃紧就不放）
    if (this.flame > 0.4 && now >= this.nextEmber && this.pt.live < 100) {
      this.nextEmber = now + 70;
      const L = this.jetLen * reach;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      this.pt.emit('ember', x + c * 6, y + sn * 6, { vx: c * L * 2.6, vy: sn * L * 2.6 - 10, g: -40, life: 300, s0: 0.75, s1: 0.25, a0: 0.95, tint: (now >> 6) % 2 ? 0xffd23f : 0xff7a1f, depth: dep + 0.04 });
      if (this.flame >= 1 && (now >> 7) % 3 === 0) this.pt.bloom.flash(x + c * L * 0.5, y + sn * L * 0.5, 14, 0xff7a1f, 160, 0.3);
    }
  }

  destroy(): void {
    for (const o of [this.gun, this.body, this.rod, this.roof, this.jet]) o?.destroy();
    this.gun = this.body = this.rod = this.roof = this.jet = null;
  }

  /** 整张图（老画法）的贴图 key：场景退回时用 */
  get full(): string {
    return this.fullKey;
  }
}
