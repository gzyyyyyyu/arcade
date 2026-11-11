/**
 * 登陆战放兵的画面编排：木筏滑到浅水，兵一个个跳下、涉水上岸，兵全下完筏再退走淡掉。
 * 时间线和位移在 disembark.ts（纯函数）；这里管木筏图像（对象池）、水纹水花（粒子池）和每个兵的状态。
 * 只动画面：兵在规则里出现的拍和位置不变，显示位置在约 1 秒内从筏上收敛到规则位置。
 * 系统"减弱动态"（或设置里关了手感）时：兵不走下船那一套，木筏只做短淡入淡出。
 */
import type Phaser from 'phaser';
import { ISLAND, UNIT, type BattleEvent } from '../core/types.ts';
import { shipA } from './art.ts';
import { isBaked } from './textures.ts';
import { DEPTH } from './depth.ts';
import { RAFT_OFFSHORE, SLIDE_MS, disembark, endOf, raftAlpha, raftPos, totalMs, type Disp, type V2 } from './disembark.ts';
import { feelOn } from './feel.ts';
import { put } from './ground.ts';
import { depthOf } from './iso.ts';
import { easeOutCubic } from './motion.ts';
import { sfx } from './audio/sfx.ts';
import { LOW_MEMORY } from './viewport.ts';
import type { BattleScene } from './BattleScene.ts';

/** 一只正在用的木筏 */
interface Raft {
  im: Phaser.GameObjects.Image;
  on: boolean;
  t0: number;
  n: number;
  from: V2;
  to: V2;
  away: V2;
  sc0: number;
  arrived: boolean;
}

/** 一个正在下船的兵 */
interface Walker {
  raft: Raft;
  i: number;
  hopped: boolean;
  lastFx: number;
}

class LandFx {
  readonly rafts: Raft[] = [];
  readonly walkers = new Map<number, Walker>();
  private readonly disp: Disp = { x: 0, y: 0, oy: 0, sq: 0, hold: false, wading: false, done: false };
  private readonly nowPos: V2 = { x: 0, y: 0 };
  private readonly off: () => void;

  private readonly bs: BattleScene;

  constructor(bs: BattleScene) {
    this.bs = bs;
    const fn = (): void => this.update();
    bs.events.on('update', fn);
    this.off = () => bs.events.off('update', fn);
  }

  destroy(): void {
    this.off();
    this.walkers.clear();
    this.rafts.length = 0;
  }

  private takeRaft(): Raft {
    let r = this.rafts.find((q) => !q.on);
    if (!r) {
      // 自己的王阶涂装：带涂装的木筏烘好了才用，没烘好先用原样的（只是慢一两帧，不缺图）
      let p = shipA('raft');
      if (this.bs.sailRank > 0) {
        const rp = shipA('raft', this.bs.sailRank);
        if (isBaked(rp.key)) p = rp;
      }
      const im = put(this.bs, this.bs.r, p, 0, 0).setVisible(false);
      r = { im, on: false, t0: 0, n: 1, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, away: { x: 0, y: 0 }, sc0: im.scaleX, arrived: false };
      this.rafts.push(r);
    }
    return r;
  }

  start(e: Extract<BattleEvent, { type: 'land' }>): void {
    const bs = this.bs;
    const w = bs.W(e.x, e.y);
    // 朝海里的方向：从岛心到落点，换成屏幕方向
    const cx = (ISLAND * UNIT) / 2;
    const l = Math.max(1, Math.hypot(e.x - cx, e.y - cx));
    const o = bs.W(((e.x - cx) / l) * 380, ((e.y - cx) / l) * 380);
    const ol = Math.max(1, Math.hypot(o.x, o.y));
    const reduced = !feelOn();
    const r = this.takeRaft();
    r.on = true;
    r.t0 = bs.nowT;
    r.n = reduced ? 1 : Math.max(1, e.units.length);
    r.away.x = o.x / ol;
    r.away.y = o.y / ol;
    r.to.x = w.x + r.away.x * RAFT_OFFSHORE;
    r.to.y = w.y + r.away.y * RAFT_OFFSHORE;
    r.from.x = reduced ? r.to.x : w.x + o.x;
    r.from.y = reduced ? r.to.y : w.y + o.y;
    r.arrived = false;
    r.im.setFlipX(o.x > 0).setDepth(depthOf(e.x / UNIT, e.y / UNIT) + 0.2).setPosition(r.from.x, r.from.y).setAlpha(1).setScale(r.sc0 * 0.85).setVisible(true);
    bs.pt.emit('ring', w.x, w.y + 4, { life: 520, s0: 0.3, s1: 1.3, a0: 0.9, depth: DEPTH.groundRing });
    if (reduced) return;
    e.units.forEach((id, i) => this.walkers.set(id, { raft: r, i, hopped: false, lastFx: -1e9 }));
  }

  /** 每帧：推木筏（位置、透明度、靠岸溅水）、收掉演完的筏和兵 */
  private update(): void {
    const bs = this.bs;
    const now = bs.nowT;
    for (const r of this.rafts) {
      if (!r.on) continue;
      const t = now - r.t0;
      if (t > totalMs(r.n) + 200) {
        r.on = false;
        r.im.setVisible(false);
        continue;
      }
      raftPos(this.nowPos, t, r.from, r.to, r.n, r.away);
      r.im.setPosition(this.nowPos.x, this.nowPos.y).setAlpha(raftAlpha(t, r.n)).setScale(r.sc0 * (0.85 + 0.15 * easeOutCubic(t / 180)));
      if (!r.arrived && t >= SLIDE_MS) {
        r.arrived = true;
        sfx('splash');
        bs.pt.splash(r.to.x, r.to.y + 4, 1.2);
      }
    }
    for (const [id, wk] of this.walkers) if (now - wk.raft.t0 > endOf(wk.raft.n - 1, wk.raft.n) + 200) this.walkers.delete(id);
  }

  /** 兵的显示位置：改 w（屏幕世界坐标）；返回 null 表示这个兵不在下船（交给规则位置） */
  shift(id: number, w: V2, time: number): Disp | null {
    const wk = this.walkers.get(id);
    if (!wk) return null;
    const r = wk.raft;
    const t = time - r.t0;
    const shore = this.shore(r);
    raftPos(this.nowPos, t, r.from, r.to, r.n, r.away);
    const d = disembark(this.disp, t, wk.i, r.n, this.nowPos, shore, r.away, w);
    if (d.done) {
      this.walkers.delete(id);
      return null;
    }
    w.x = d.x;
    w.y = d.y;
    // 落水：溅一下；涉水：脚下隔一小会儿一圈水纹和几滴水（手机上减半）
    const odd = LOW_MEMORY && wk.i % 2 === 1;
    if (!wk.hopped && (d.wading || d.sq > 0)) {
      wk.hopped = true;
      if (!odd) this.bs.pt.splash(w.x, w.y + 2, LOW_MEMORY ? 0.4 : 0.6);
    }
    if (d.wading && time - wk.lastFx > (LOW_MEMORY ? 220 : 120) && !odd) {
      wk.lastFx = time;
      this.bs.pt.emit('ring', w.x, w.y + 2, { life: 420, s0: 0.2, s1: 0.65, a0: 0.8, depth: DEPTH.groundRing });
    }
    return d;
  }

  private readonly shoreV: V2 = { x: 0, y: 0 };
  /** 落点（岸边）：筏停靠点往岸上退回去 */
  private shore(r: Raft): V2 {
    this.shoreV.x = r.to.x - r.away.x * RAFT_OFFSHORE;
    this.shoreV.y = r.to.y - r.away.y * RAFT_OFFSHORE;
    return this.shoreV;
  }
}

const fxOf = new WeakMap<BattleScene, LandFx>();

function get(bs: BattleScene): LandFx {
  let f = fxOf.get(bs);
  if (!f) {
    f = new LandFx(bs);
    fxOf.set(bs, f);
    const fx = f;
    bs.events.once('shutdown', () => {
      fx.destroy();
      fxOf.delete(bs);
    });
  }
  return f;
}

/** 规则给出"登陆"事件：开始一次下船（battleevents.ts 调） */
export function startLanding(bs: BattleScene, e: Extract<BattleEvent, { type: 'land' }>): void {
  get(bs).start(e);
}

/** 兵的显示位置交给下船位移（battleunits.ts 调）；不在下船的兵返回 null、w 不动 */
export function landShift(bs: BattleScene, id: number, w: V2, time: number): Disp | null {
  const f = fxOf.get(bs);
  return f ? f.shift(id, w, time) : null;
}
