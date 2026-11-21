import type Phaser from 'phaser';
import { snipeLook, warnK } from './snipelook.ts';
import { DEPTH } from './depth.ts';
import { REDUCED } from './feel.ts';

/**
 * 狙击预警（登陆战和守岛共用）：每座正在锁定的狙击塔一条记录（对象池里取，不在每个事件新建），
 * 每帧在一张 Graphics 上重画：炮口到目标一条红线、目标脚下一个红色等距准星。
 * 谁画在哪由场景用回调给（炮口位置、目标位置），这里只管时间和样子（snipelook.ts）。
 */


interface SnipeAim {
  /** 塔的编号 */
  tower: number;
  /** 目标的编号（登陆战的兵 / 守岛的敌人；英雄用 -1 并看 hero） */
  target: number;
  hero: boolean;
  /** 开火拍（规则时间）；过了这一拍再多一拍就收掉 */
  fireAt: number;
  on: boolean;
}

/** 回调：把塔的炮口、目标的身高中点和脚下位置（世界坐标）写进 out，目标没了返回 false */
interface SnipeEnds {
  mx: number;
  my: number;
  tx: number;
  ty: number;
  fx: number;
  fy: number;
}

export class SnipeLines {
  private pool: SnipeAim[] = [];
  private g: Phaser.GameObjects.Graphics;
  private readonly ends: SnipeEnds = { mx: 0, my: 0, tx: 0, ty: 0, fx: 0, fy: 0 };
  /** 最近一帧第一条线的炮口—目标中点（世界坐标；取证连拍用来对镜头），没有线为 null */
  mid: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, depth = DEPTH.hitFx) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  /** 规则的 aim 事件：这座塔锁定了一个目标（同一座塔的旧预警直接换掉） */
  start(tower: number, target: number, hero: boolean, fireAt: number): void {
    let a = this.pool.find((q) => q.on && q.tower === tower) ?? this.pool.find((q) => !q.on);
    if (!a) {
      a = { tower, target, hero, fireAt, on: true };
      this.pool.push(a);
    }
    a.tower = tower;
    a.target = target;
    a.hero = hero;
    a.fireAt = fireAt;
    a.on = true;
  }

  /** 开火了 / 塔没了：这座塔的预警收掉 */
  stop(tower: number): void {
    for (const a of this.pool) if (a.on && a.tower === tower) a.on = false;
  }

  /** 这座塔现在在预警谁（炮管据此提前转过去） */
  of(tower: number): SnipeAim | null {
    for (const a of this.pool) if (a.on && a.tower === tower) return a;
    return null;
  }

  /** 上一帧 Graphics 上画了东西 */
  private drawn = false;

  get live(): number {
    let n = 0;
    for (const a of this.pool) if (a.on) n++;
    return n;
  }

  /** 每帧：vt = 规则时间（上一个处理过的拍 + 帧内比例）；resolve 查炮口和目标位置，查不到（目标倒下 / 逃走）就收掉这条 */
  draw(vt: number, now: number, resolve: (a: SnipeAim, out: SnipeEnds) => boolean): void {
    const g = this.g;
    this.mid = null;
    // 没有预警、上一帧也没画东西：不白清
    const any = this.live > 0;
    if (!any && !this.drawn) return;
    g.clear();
    this.drawn = any;
    for (const a of this.pool) {
      if (!a.on) continue;
      if (vt > a.fireAt + 1 || !resolve(a, this.ends)) {
        a.on = false;
        continue;
      }
      const L = snipeLook(warnK(a.fireAt, vt), now, REDUCED);
      const e = this.ends;
      this.mid ??= { x: (e.mx + e.tx) / 2, y: (e.my + e.ty) / 2 };
      // 红线：外层柔光 + 内层红 + 临近开火的白芯
      g.lineStyle(L.lineW + 4, L.color, L.lineA * 0.22).lineBetween(e.mx, e.my, e.tx, e.ty);
      g.lineStyle(L.lineW, L.color, L.lineA).lineBetween(e.mx, e.my, e.tx, e.ty);
      if (L.coreA > 0.02) g.lineStyle(Math.max(1, L.lineW * 0.4), 0xffffff, L.coreA).lineBetween(e.mx, e.my, e.tx, e.ty);
      // 准星：脚下的等距椭圆圈 + 十字 + 中心点，朝里收
      g.lineStyle(2.4, L.color, L.ringA).strokeEllipse(e.fx, e.fy, L.ringR * 2, L.ringR);
      g.lineStyle(1.6, L.color, L.ringA);
      g.lineBetween(e.fx - L.cross, e.fy, e.fx - L.ringR * 0.5, e.fy);
      g.lineBetween(e.fx + L.ringR * 0.5, e.fy, e.fx + L.cross, e.fy);
      g.lineBetween(e.fx, e.fy - L.cross * 0.5, e.fx, e.fy - L.ringR * 0.25);
      g.lineBetween(e.fx, e.fy + L.ringR * 0.25, e.fx, e.fy + L.cross * 0.5);
      g.fillStyle(L.color, Math.min(1, L.ringA + 0.1)).fillCircle(e.fx, e.fy, 2.2 + 1.4 * warnK(a.fireAt, vt));
    }
  }

  clear(): void {
    for (const a of this.pool) a.on = false;
    this.g.clear();
    this.drawn = false;
  }
}

