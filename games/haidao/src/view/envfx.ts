import type Phaser from 'phaser';
import type { BuildingKind } from '../core/types.ts';
import { CHIMNEY_AT, HQ_FLAG_AT } from './art/index.ts';
import { FLAG_SWEEP_FROM, FLAG_WAVE, RANK_FLAG_AT, rankFlagFrames } from './art/rankflag.ts';
import { hqFlagF, palmFrames } from './art.ts';
import type { Particles } from './fx.ts';
import { bakeSome, isBaked } from './textures.ts';
import { LOW_MEMORY } from './viewport.ts';

/** 王旗比主寨自带的骷髅旗大一号：它是这座岛上最显眼的展示 */
const RANK_FLAG_SCALE = 1.5;

/**
 * 岛上环境动画（装饰，不影响规则）：棕榈摇、主寨旗飘、烟囱冒烟。
 * 每个场景一个 EnvAnim，所有动画由一个 update 回调推进，不新建补间、不每帧新建对象：
 * - 棕榈：不旋转、不缩放（叶子会缺块 / 变形），而是 5 张烘好的"树冠错切"帧（art 的 palmSwayFrames），按 0-1-2-3-4-3-2-1 换纹理；
 * - 旗：主寨的静态图不带旗布（hqNoFlagArt），旗布 3 帧另贴在旗杆顶（跟着主寨的位置、缩放、显隐走）；
 * - 烟囱：隔一阵从烟口放一团小烟（走粒子池，总量吃紧时不放，手机间隔拉长）；
 * - 王旗（DESIGN 2.6）：有王阶（构造时给、或 setRank）时主寨旁立一面王旗，一张图贴在主寨精灵旁边，不改占地、不拦点击；
 *   6 帧波浪循环，4 阶起每隔几秒一道闪光扫过（art/rankflag.ts）。素材按阶按需烘焙。
 * 系统开了"减弱动态效果"就都不动（王旗仍立着，只停在第一帧）。
 */

const SEQ = [2, 3, 4, 3, 2, 1, 0, 1];
const STILL = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Palm {
  im: Phaser.GameObjects.Image;
  id: number;
  fi: number;
}
interface Flag {
  im: Phaser.GameObjects.Image;
  ov: Phaser.GameObjects.Image;
  level: number;
  id: number;
  fi: number;
  keys: string[];
  at: { dx: number; dy: number };
}
interface RankFlag {
  ov: Phaser.GameObjects.Image;
  rank: number;
  keys: string[];
  fi: number;
  /** 升阶新挂上的旗：从这个时刻起弹出来（毫秒，EnvAnim 的时钟）；-1 = 一直在，不演 */
  popAt: number;
}
interface Smoke {
  im: Phaser.GameObjects.Image;
  at: { dx: number; dy: number };
  next: number;
  id: number;
}

export class EnvAnim {
  private palms: Palm[] = [];
  private flags: Flag[] = [];
  private smokes: Smoke[] = [];
  private palmKeys: string[] | null = null;
  private time = 0;
  /** 王阶（0 = 没有）、主寨精灵、王旗、挂旗的代号（异步烘焙回来时核对还是不是同一次） */
  private rank: number;
  private hq: Phaser.GameObjects.Image | null = null;
  private rflag: RankFlag | null = null;
  private mountSeq = 0;
  /** 下一面旗是升阶新换的（setRank 升了阶），挂上时弹一下 */
  private popNext = false;

  private readonly scene: Phaser.Scene;
  private readonly r: number;
  private readonly pt: Particles | null;

  constructor(scene: Phaser.Scene, r: number, pt: Particles | null, rank = 0) {
    this.scene = scene;
    this.r = r;
    this.pt = pt;
    this.rank = rank;
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', () => scene.events.off('update', this.tick, this));
  }

  /** 场景里一座建筑的精灵建好（或换了纹理）之后调：按种类挂上它的环境动画 */
  dress(im: Phaser.GameObjects.Image, kind: BuildingKind, level: number, id: number): void {
    if (kind === 'hq' && this.hq !== im) {
      this.hq = im;
      this.mountRank();
    }
    if (STILL) return;
    this.strip(im);
    if (kind === 'palm') {
      if (!this.palmKeys?.length) {
        const ps = palmFrames();
        this.palmKeys = ps.every((p) => isBaked(p.key)) ? ps.map((p) => p.key) : [];
      }
      if (this.palmKeys.length === 5) this.palms.push({ im, id, fi: 2 });
      return;
    }
    if (kind === 'hq' && im.texture.key.startsWith('b.hqnf.')) {
      const frames = hqFlagF(level);
      if (frames.every((p) => isBaked(p.key))) {
        const f0 = frames[0]!;
        const ov = this.scene.add.image(im.x, im.y, f0.key).setOrigin(f0.ax / f0.w, f0.ay / f0.h).setScale(im.scaleX).setDepth(im.depth + 0.05);
        this.flags.push({ im, ov, level, id, fi: 0, keys: frames.map((p) => p.key), at: HQ_FLAG_AT(level) });
      }
    }
    const ch = CHIMNEY_AT(kind, level);
    if (ch && this.pt) this.smokes.push({ im, at: ch, next: (id * 397) % 1200, id });
  }

  /** 精灵不再是那座建筑了（倒塌换成瓦砾）：摘掉它的环境动画 */
  undress(im: Phaser.GameObjects.Image): void {
    this.strip(im);
    if (im === this.hq) {
      this.hq = null;
      this.dropRank();
    }
  }

  /** 王阶变了（献上升阶）：换一面新旗 */
  setRank(rank: number): void {
    if (rank === this.rank) return;
    this.popNext = rank > this.rank && this.hq !== null && !STILL;
    this.rank = rank;
    this.mountRank();
  }

  private dropRank(): void {
    this.mountSeq++;
    this.rflag?.ov.destroy();
    this.rflag = null;
  }

  /** 按当前王阶在主寨旁挂王旗：该阶的帧没烘过先烘（不弹"装船中"，王旗晚几十毫秒出来无所谓） */
  private mountRank(): void {
    this.dropRank();
    const hq = this.hq;
    const frames = hq && this.rank > 0 ? rankFlagFrames(this.rank) : [];
    if (!hq || !frames.length) return;
    const seq = this.mountSeq;
    const rank = this.rank;
    void bakeSome(this.scene.textures, frames, this.r)
      .catch(() => undefined)
      .then(() => {
        if (seq !== this.mountSeq || !this.scene.sys.isActive() || !frames.every((p) => isBaked(p.key))) return;
        const f0 = frames[0]!;
        const ov = this.scene.add.image(hq.x, hq.y, f0.key).setOrigin(f0.ax / f0.w, f0.ay / f0.h).setScale(hq.scaleX);
        this.rflag = { ov, rank, keys: frames.map((p) => p.key), fi: 0, popAt: this.popNext ? this.time : -1 };
        this.popNext = false;
        this.followRank(hq);
      });
  }

  /** 王旗跟着主寨的位置、缩放、显隐、透明度走（升级演出里主寨会弹、会缩） */
  private followRank(hq: Phaser.GameObjects.Image): void {
    const rf = this.rflag;
    if (!rf) return;
    const at = RANK_FLAG_AT();
    const k = this.r;
    // 新升的旗：0.55 秒里从旗杆脚下"长"出来（回弹缩放加淡入）
    const pk = rf.popAt < 0 ? 1 : Math.min(1, (this.time - rf.popAt) / 550);
    if (pk >= 1) rf.popAt = -1;
    const grow = pk >= 1 ? 1 : 1 + 2.2 * (pk - 1) ** 3 + 1.2 * (pk - 1) ** 2;
    rf.ov
      .setPosition(hq.x + at.dx * hq.scaleX * k, hq.y + at.dy * hq.scaleY * k)
      .setScale(hq.scaleX * grow * RANK_FLAG_SCALE, hq.scaleY * grow * RANK_FLAG_SCALE)
      .setDepth(hq.depth + 0.07)
      .setAlpha(hq.alpha * Math.min(1, pk * 3))
      .setVisible(hq.active && hq.visible);
  }

  private strip(im: Phaser.GameObjects.Image): void {
    this.palms = this.palms.filter((p) => p.im !== im);
    this.smokes = this.smokes.filter((s) => s.im !== im);
    this.flags = this.flags.filter((f) => {
      if (f.im !== im) return true;
      f.ov.destroy();
      return false;
    });
  }

  private tick(_t: number, dt: number): void {
    this.time += Math.min(dt, 100);
    const t = this.time;
    if (this.rflag && this.hq) {
      const rf = this.rflag;
      this.followRank(this.hq);
      if (!STILL) {
        // 6 帧波浪循环；4 阶起每 5 个循环有一个循环换成带闪光扫过的帧（相位对得上，不跳）
        const ws = LOW_MEMORY ? 200 : 130;
        const i = Math.floor(t / ws) % FLAG_WAVE;
        const sweep = rf.rank >= FLAG_SWEEP_FROM && Math.floor(t / (ws * FLAG_WAVE)) % 5 === 0;
        const fi = sweep ? FLAG_WAVE + i : i;
        if (fi !== rf.fi && rf.keys[fi]) {
          rf.fi = fi;
          rf.ov.setTexture(rf.keys[fi]!);
        }
      }
    }
    if (STILL) return;
    const step = LOW_MEMORY ? 260 : 200;
    for (const p of this.palms) {
      if (!p.im.active) continue;
      const fi = SEQ[Math.floor(t / step + p.id * 3) % SEQ.length]!;
      if (fi !== p.fi) {
        p.fi = fi;
        p.im.setTexture(this.palmKeys![fi]!);
      }
    }
    for (const f of this.flags) {
      if (!f.im.active) {
        f.ov.setVisible(false);
        continue;
      }
      const k = this.r;
      f.ov
        .setPosition(f.im.x + f.at.dx * f.im.scaleX * k, f.im.y + f.at.dy * f.im.scaleY * k)
        .setScale(f.im.scaleX, f.im.scaleY)
        .setDepth(f.im.depth + 0.05)
        .setAlpha(f.im.alpha)
        .setVisible(f.im.visible);
      const fi = [0, 1, 2, 1][Math.floor(t / 150 + f.id) % 4]!;
      if (fi !== f.fi) {
        f.fi = fi;
        f.ov.setTexture(f.keys[fi]!);
      }
    }
    if (!this.pt) return;
    const gap = LOW_MEMORY ? 1500 : 900;
    for (const s of this.smokes) {
      if (!s.im.active || !s.im.visible || s.im.alpha < 0.6 || t < s.next) continue;
      s.next = t + gap + ((s.id * 131) % 400);
      if (this.pt.live > 80) continue;
      const k = this.r;
      this.pt.emit('puff', s.im.x + s.at.dx * s.im.scaleX * k, s.im.y + s.at.dy * s.im.scaleY * k, {
        vx: 7,
        vy: -17,
        life: 1500,
        s0: 0.22,
        s1: 0.75,
        a0: 0.5,
        tint: 0xd2d3da,
        depth: s.im.depth + 0.6,
      });
    }
  }
}
