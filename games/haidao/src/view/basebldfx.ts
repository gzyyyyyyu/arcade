import type Phaser from 'phaser';
import type { BuildingKind } from '../core/types.ts';
import type { ArtPiece } from './art/index.ts';
import { bldFxPoints, hangArt, sawSpinFrames, SAW_FRAMES } from './art/buildings.ts';
import { isTurret, isoVec, wrapPi } from './aim.ts';
import { BLD_ACT, type BldAct, beatGap, coinBeat, firstBeat, inView, patrolAim, sawFrame, swingAngle } from './bldact.ts';
import type { Particles } from './fx.ts';
import { bakeSome, isBaked } from './textures.ts';
import { Turret } from './turret.ts';
import { LOW_MEMORY } from './viewport.ts';
import { REDUCED } from './feel.ts';
import { DEPTH } from './depth.ts';

/**
 * 基地里建筑的标志动作（只在基地，战斗里的防御塔有自己的开火表演）：节奏和角度在 bldact.ts（纯函数），这里只摆对象、放粒子。
 * - 金矿 / 金库闪金光、蹦金币，军械所铁砧溅火星，焦油池冒泡，迷雾塔冒紫雾：都走场景的粒子池（总量吃紧就不放），不常驻对象；
 * - 伐木场主锯轮转：一张小叠图换 4 帧（art 的 sawSpinFrames，只画里圈，盖在静态图上）；
 * - 船坞的货箱、木料场的原木捆在吊钩下晃：一张小叠图，转轴就是吊点（hangArt），每帧只改角度；
 * - 会转的防御塔隔一阵转去看另一个方向：直接用 turret.ts 的 Turret（分件、角速度上限都沿用），给它一个巡视的假目标；
 *   只在镜头放大后才拆分件（全岛远景里炮管只有几像素，拆开反而每帧多几次绘制）。
 * 镜头外的不更新；建筑升级、搬家、拆掉由 BaseScene.refresh 调 sync / drop 同步；升级、落地演出期间炮台退回整张图，演完再拆开。
 * 系统开了「减弱动态效果」就全不做。
 */

interface Entry {
  id: number;
  kind: BuildingKind;
  level: number;
  key: string;
  img: Phaser.GameObjects.Image;
  act: BldAct;
  /** 占地中心的世界坐标（炮台的转轴脚下） */
  x: number;
  y: number;
  /** 放粒子的点（相对锚点）、下一下的时间、第几下 */
  pts: ReadonlyArray<readonly [number, number]>;
  next: number;
  n: number;
  /** 叠图（锯轮 / 吊着的东西）和它的帧、当前帧、相对锚点的位置 */
  ov: Phaser.GameObjects.Image | null;
  keys: string[];
  fi: number;
  at: readonly [number, number];
  tint: number;
  tu: Turret | null;
  home: number;
  /** 上一帧给炮台的巡视朝向：朝向没变、炮管也停稳了就不再逐帧摆（只隔几帧同步一次透明度和染色） */
  want: number;
}

/** 镜头放大到全岛远景的几倍以上炮台才拆分件巡视 */
export const BLD_NEAR_ZOOM = 1.3;
/**
 * 同时拆成分件巡视的炮台最多几座（离镜头中心最近的那几座）：实测（perf.ts 基地放大 2 倍看岛中间）每多拆一座，
 * 软件光栅化的帧时间就多 2–3 毫秒，拆 6 座就掉一档帧率；所以只让镜头中心附近一两座巡视
 */
const MAX_SPLIT = LOW_MEMORY ? 1 : 2;
/**
 * 同时做动作的其余建筑最多几座（离镜头中心最近的）：放大看岛中间时帧时间正卡在一档的边上，
 * 镜头里的全开（叠图加粒子）会多一两毫秒、掉一档；只留中心附近几座，看的那一片照样在动
 */
const MAX_LIVE = LOW_MEMORY ? 3 : 6;
/** 电脑上全岛远景时建筑小、每座占的像素少，镜头里的全开也不掉帧（实测），只在放大后限 MAX_LIVE 座 */
const liveCap = (near: boolean): number => (LOW_MEMORY || near ? MAX_LIVE : Number.POSITIVE_INFINITY);
/** 隔几帧重新挑一次离中心最近的炮台 */
const PICK_EVERY = 20;
/** 镜头外多留多少屏幕像素才算看不见 */
const MARGIN = 140;
/** 炮台停稳时隔几帧才同步一次（跟上悬停高亮、被挡住时的半透明） */
const IDLE_EVERY = 8;

export class BldFx {
  private readonly map = new Map<number, Entry>();
  private time = 0;
  private frame = 0;
  private nearNow = false;
  /** 这一轮挑中拆分件巡视的炮台编号 */
  private picked = new Set<number>();
  /** 这一轮挑中做动作的其余建筑 */
  private lively = new Set<number>();
  private readonly scene: Phaser.Scene;
  private readonly r: number;
  private readonly pt: Particles;
  private readonly busy: (img: Phaser.GameObjects.Image) => boolean;
  private readonly near: () => boolean;

  /** near = 镜头放大到看得清炮管了没有（全岛远景时炮台不拆分件：几十座炮台多出的分件和图集让每帧多几次绘制，远景里又看不出在转） */
  constructor(scene: Phaser.Scene, r: number, pt: Particles, busy: (img: Phaser.GameObjects.Image) => boolean, near: () => boolean) {
    this.scene = scene;
    this.r = r;
    this.pt = pt;
    this.busy = busy;
    this.near = near;
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', () => {
      scene.events.off('update', this.tick, this);
      this.map.clear();
    });
  }

  /** 场景按存档同步完一座建筑后调（x, y = 占地中心的世界坐标，key = 这座现在该贴的整张图） */
  sync(id: number, img: Phaser.GameObjects.Image, kind: BuildingKind, level: number, x: number, y: number, key: string): void {
    const act = BLD_ACT[kind];
    if (REDUCED || !act) return;
    const e = this.map.get(id);
    if (e && e.img === img && e.kind === kind && e.level === level && e.x === x && e.y === y && e.key === key) return;
    if (e) this.clear(e);
    const ne: Entry = {
      id, kind, level, key, img, act, x, y, pts: bldFxPoints(kind, level), next: this.time + firstBeat(id), n: 0,
      ov: null, keys: [], fi: -1, at: [0, 0], tint: -1, tu: null, home: 0, want: Number.NaN,
    };
    this.map.set(id, ne);
    if (act === 'spin') this.mount(ne, sawSpinFrames(level), [0, 0]);
    else if (act === 'swing' && (kind === 'dock' || kind === 'woodyard')) {
      const h = hangArt(kind, level);
      this.mount(ne, [h.art], h.at);
    }
  }

  /** 建筑没了（拆掉、换存档）：在图销毁之前调 */
  drop(id: number): void {
    const e = this.map.get(id);
    if (!e) return;
    this.clear(e);
    this.map.delete(id);
  }

  /** 叠图的帧没烘过先烘（烘好前不画），烘完这座还是同一个条目才挂上 */
  private mount(e: Entry, frames: ArtPiece[], at: readonly [number, number]): void {
    const go = (): void => {
      if (this.map.get(e.id) !== e || !e.img.active || !frames.every((p) => isBaked(p.key))) return;
      const f0 = frames[0]!;
      e.keys = frames.map((p) => p.key);
      e.at = at;
      e.fi = 0;
      e.ov = this.scene.add.image(e.img.x, e.img.y, f0.key).setOrigin(f0.ax / f0.w, f0.ay / f0.h).setVisible(false);
    };
    if (frames.every((p) => isBaked(p.key))) go();
    else void bakeSome(this.scene.textures, frames, this.r).catch(() => undefined).then(() => this.scene.sys.isActive() && go());
  }

  private clear(e: Entry): void {
    e.ov?.destroy();
    e.ov = null;
    this.unturret(e);
  }

  /** 收掉分件炮台：底座换回整张图（只在还贴着不带炮管的底座时换，升级时场景已经换上新图的不动） */
  private unturret(e: Entry): void {
    if (!e.tu) return;
    e.tu.destroy();
    e.tu = null;
    if (e.img.active && e.img.texture.key.endsWith('.ng')) e.img.setTexture(e.key);
  }

  private tick(_t: number, dt: number): void {
    const d = Math.min(dt, 100);
    this.time += d;
    this.frame++;
    this.nearNow = this.near();
    const t = this.time;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    if (this.frame % PICK_EVERY === 1) this.pick(view);
    const m = MARGIN / cam.zoom;
    const k = this.r;
    for (const e of this.map.values()) {
      const im = e.img;
      if (!im.active) continue;
      const vis = im.visible && inView(im.x, im.y, view, m + 120);
      if (e.act === 'patrol') {
        this.patrol(e, vis, d);
        continue;
      }
      const seen = vis && this.lively.has(e.id);
      if (e.ov) {
        const ov = e.ov;
        if (!seen) {
          ov.setVisible(false);
          continue;
        }
        ov.setPosition(im.x + e.at[0] * im.scaleX * k, im.y + e.at[1] * im.scaleY * k)
          .setScale(im.scaleX, im.scaleY)
          .setDepth(im.depth + 0.02)
          .setAlpha(im.alpha)
          .setVisible(true);
        if (im.tintTopLeft !== e.tint) {
          e.tint = im.tintTopLeft;
          ov.setTint(e.tint).setTintMode(im.tintMode);
        }
        if (e.act === 'spin') {
          const fi = sawFrame(t, e.id, SAW_FRAMES, LOW_MEMORY);
          if (fi !== e.fi) {
            e.fi = fi;
            ov.setTexture(e.keys[fi]!);
          }
        } else ov.setRotation(swingAngle(t, e.id));
        continue;
      }
      if (!e.pts.length || t < e.next) continue;
      e.next = t + beatGap(e.act as 'glint' | 'sparks' | 'bubble' | 'mist', e.id, e.n, LOW_MEMORY);
      e.n++;
      // 看不见、半透明（被挡着、搬家中）、粒子池吃紧时这一下跳过，节奏照走
      if (!seen || im.alpha < 0.6 || this.pt.live > 80) continue;
      const q = e.pts[e.n % e.pts.length]!;
      this.burst(e, im.x + q[0] * im.scaleX * k, im.y + q[1] * im.scaleY * k, DEPTH.bldFx);
    }
  }

  private burst(e: Entry, x: number, y: number, depth: number): void {
    const pt = this.pt;
    switch (e.act) {
      case 'glint':
        pt.emit('dust', x, y, { life: 420, s0: 0.6, s1: 2.8, a0: 0.95, tint: 0xfff2a0, depth });
        if (coinBeat(e.id, e.n)) pt.emit('coin', x, y - 2, { vx: e.n % 2 ? 16 : -16, vy: -75, g: 230, life: 640, s0: 1.1, s1: 0.9, vr: 7, depth: depth + 0.01 });
        break;
      case 'sparks':
        for (let i = 0; i < 4; i++) {
          pt.emit('ember', x, y, { vx: (i - 1.5) * 34, vy: -55 - (i % 2) * 25, g: 260, life: 360 + (i % 2) * 80, s0: 0.65, s1: 0.2, tint: i % 2 ? 0xffd23f : 0xff8a2a, depth });
        }
        pt.emit('dust', x, y, { life: 120, s0: 1, s1: 1.8, a0: 0.8, tint: 0xffe2a0, depth });
        break;
      case 'bubble':
        pt.emit('puff', x, y, { vy: -5, life: 520, s0: 0.1, s1: 0.32, a0: 0.9, tint: 0x4a4258, depth });
        break;
      case 'mist':
        pt.emit('smoke', x, y - 4, { vx: 5, vy: -14, drag: 0.4, life: 1800, s0: 0.35, s1: 0.95, a0: 0.5, fade: 1, tint: 0xb9a8e8, depth });
        break;
      default:
        break;
    }
  }

  /** 挑离镜头中心最近的几座：炮台（放大了才挑）和手机上做动作的其余建筑，只看在镜头里的 */
  private pick(view: Phaser.Geom.Rectangle): void {
    this.picked.clear();
    this.lively.clear();
    const cx = view.centerX;
    const cy = view.centerY;
    const tur: Array<[number, number]> = [];
    const rest: Array<[number, number]> = [];
    for (const e of this.map.values()) {
      if (!e.img.active || !e.img.visible || !inView(e.img.x, e.img.y, view, 0)) continue;
      (e.act === 'patrol' ? tur : rest).push([(e.x - cx) ** 2 + (e.y - cy) ** 2, e.id]);
    }
    const take = (list: Array<[number, number]>, n: number, out: Set<number>): void => {
      list.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < Math.min(n, list.length); i++) out.add(list[i]![1]);
    };
    if (this.nearNow) take(tur, MAX_SPLIT, this.picked);
    take(rest, liveCap(this.nearNow), this.lively);
  }

  /** 炮台巡视：看得见、没在演升级 / 落地时拆成分件慢慢转；演出期间收回整张图 */
  private patrol(e: Entry, seen: boolean, dt: number): void {
    if (this.busy(e.img) || !this.nearNow || !this.picked.has(e.id)) {
      this.unturret(e);
      return;
    }
    if (!e.tu) {
      if (!seen || !isTurret(e.kind)) return;
      e.tu = new Turret(this.scene, this.r, this.pt, e.kind, e.level, e.id, e.img, e.x, e.y);
      e.home = e.tu.st.a;
    }
    if (!seen) return;
    const want = patrolAim(e.home, this.time, e.id);
    // 停着看同一个方向时（巡视大部分时间如此）不用逐帧摆：每帧几十座炮台的摆位是基地里最贵的一块脚本
    const st = e.tu.st;
    if (want === e.want && st.v === 0 && Math.abs(wrapPi(st.a - want)) < 1e-3 && (this.frame + e.id) % IDLE_EVERY !== 0) return;
    e.want = want;
    const v = isoVec(want);
    e.tu.update({ now: this.time, dt, has: true, tx: e.x + v[0], ty: e.y + v[1], aiming: false, until: Infinity });
  }
}
