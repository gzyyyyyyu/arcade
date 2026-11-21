import type Phaser from 'phaser';
import { UNIT } from '../core/types.ts';
import { DEPTH } from './depth.ts';

/**
 * 焦油的地面痕迹（登陆战的焦油陷阱和守岛的减速都用）：
 * - 陷阱被踩：溅开一摊黑油，地上留几秒再慢慢淡掉（puddle）；
 * - 被减速的兵脚下一直有一小摊粘油（feet），跟着人走。
 * 一张共用的 Graphics 每帧重画（地面层，在兵和建筑下面），水洼是固定大小的池子，不新建对象、不用补间。
 * tests/tarfx.test.ts 锁住纯函数部分。
 */

/** 水洼停留多久、再用多久淡掉（毫秒） */
export const PUDDLE_HOLD = 3500;
export const PUDDLE_FADE = 2500;
const PUDDLE_MAX = 10;

/** 水洼的样子：age = 出现多久；a = 不透明度系数，grow = 大小系数（刚溅开时从 0.4 很快铺到 1） */
export function puddleLook(age: number): { a: number; grow: number } {
  if (age < 0 || age >= PUDDLE_HOLD + PUDDLE_FADE) return { a: 0, grow: 1 };
  const u = Math.min(1, age / 220);
  const grow = 0.4 + 0.6 * (1 - (1 - u) * (1 - u));
  const a = age < PUDDLE_HOLD ? 1 : 1 - (age - PUDDLE_HOLD) / PUDDLE_FADE;
  return { a, grow };
}

/** 这个点是不是一座焦油陷阱的中心（陷阱被踩的 explode 事件落在它的中心，踩完建筑已标毁但还在列表里） */
export function tarAt(bs: ReadonlyArray<{ kind: string; x: number; y: number; size: number }>, x: number, y: number): boolean {
  for (const b of bs) {
    if (b.kind !== 'tar') continue;
    const cx = b.x * UNIT + (b.size * UNIT) / 2;
    const cy = b.y * UNIT + (b.size * UNIT) / 2;
    if (Math.abs(cx - x) <= 2 && Math.abs(cy - y) <= 2) return true;
  }
  return false;
}

export function isTarTrap(bs: { st: { buildings: ReadonlyArray<{ kind: string; x: number; y: number; size: number }> } }, x: number, y: number): boolean {
  return tarAt(bs.st.buildings, x, y);
}

interface Puddle {
  x: number;
  y: number;
  rx: number;
  t0: number;
  seed: number;
}

/** 1 格在等距屏幕上的横向半径（像素） */
const CELL_RX = 45.25;

class TarGround {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly pool: Puddle[] = [];
  private n = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.floorHover);
  }

  /** 场景重开后旧的 Graphics 已随场景销毁 */
  get alive(): boolean {
    return this.g.active;
  }

  /** 每帧开头：清掉上一帧的画 */
  begin(): void {
    this.g.clear();
  }

  /** 减速的兵脚下：一小摊粘油，边上有两个小鼓包（按 id 错开，不整齐） */
  feet(x: number, y: number, id: number, now: number): void {
    const g = this.g;
    const w = Math.sin((now + id * 97) / 380) * 0.8;
    g.fillStyle(0x101014, 0.62).fillEllipse(x, y + 1, 30 + w, 12 + w * 0.4);
    g.fillStyle(0x101014, 0.55).fillEllipse(x + 11 + (id % 3), y + 3, 10, 5).fillEllipse(x - 12 - (id % 2), y + 2, 9, 4.5);
    g.fillStyle(0x52526a, 0.35).fillEllipse(x - 4, y - 0.5, 12, 3.4);
  }

  /** 陷阱被踩：在 (x, y) 溅开一摊半径 cells 格的黑油 */
  splat(x: number, y: number, cells: number, now: number): void {
    let p = this.pool[this.n % PUDDLE_MAX];
    if (!p) {
      p = { x: 0, y: 0, rx: 0, t0: 0, seed: 0 };
      this.pool[this.n % PUDDLE_MAX] = p;
    }
    p.x = x;
    p.y = y;
    p.rx = Math.max(0.6, cells) * CELL_RX * 0.9;
    p.t0 = now;
    p.seed = this.n++;
  }

  /** 每帧末：画还活着的水洼 */
  end(now: number): void {
    const g = this.g;
    for (const p of this.pool) {
      const { a, grow } = puddleLook(now - p.t0);
      if (a <= 0) continue;
      const rx = p.rx * grow;
      const ry = rx * 0.5;
      g.fillStyle(0x101014, 0.82 * a).fillEllipse(p.x, p.y, rx * 2, ry * 2);
      // 边上几个不规则的鼓包（按 seed 定，别太圆）
      for (let i = 0; i < 5; i++) {
        const ang = p.seed * 1.3 + i * 1.26;
        g.fillStyle(0x101014, 0.78 * a).fillEllipse(p.x + Math.cos(ang) * rx * 0.78, p.y + Math.sin(ang) * ry * 0.78, rx * (0.5 + (i % 3) * 0.1), ry * (0.5 + (i % 2) * 0.12));
      }
      g.fillStyle(0x50506a, 0.3 * a).fillEllipse(p.x - rx * 0.25, p.y - ry * 0.25, rx * 0.8, ry * 0.45);
    }
  }
}

const grounds = new WeakMap<object, TarGround>();
/** 每个场景一份（场景重开是新对象，旧的随它回收） */
export function tarGroundOf(scene: Phaser.Scene): TarGround {
  let t = grounds.get(scene);
  if (!t?.alive) {
    t = new TarGround(scene);
    grounds.set(scene, t);
  }
  return t;
}
