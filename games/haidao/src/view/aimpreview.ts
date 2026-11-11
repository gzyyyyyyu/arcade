import Phaser from 'phaser';
import type { BBuilding } from '../core/types.ts';
import { UNIT } from '../core/types.ts';
import { LAND_SPREAD, barrageHits, flareTarget, ringCells } from './aimcalc.ts';
import { iso } from './iso.ts';
import { DEPTH } from './depth.ts';

const v2 = (p: { x: number; y: number }): Phaser.Math.Vector2 => new Phaser.Math.Vector2(p.x, p.y);

/** 登陆战落点预览（鼠标悬停时画）：选着船画“这队兵会散在哪”，选着技能画作用圈、信号弹要标的建筑 / 炮击圈里的建筑 */
export class AimPreview {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    // 压在建筑和兵上面但低于血条、伤害数字
    this.g = scene.add.graphics().setDepth(DEPTH.aimPreview);
  }

  clear(): void {
    this.g.clear();
  }

  /** 选着船，指到一个能登陆的格：兵落下后散开的范围（比格子略大的方框） */
  squad(cx: number, cy: number): void {
    const g = this.g.clear();
    const x0 = cx + 0.5 - LAND_SPREAD;
    const x1 = cx + 0.5 + LAND_SPREAD;
    const y0 = cy + 0.5 - LAND_SPREAD;
    const y1 = cy + 0.5 + LAND_SPREAD;
    g.lineStyle(2, 0xffffff, 0.8).strokePoints([iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)].map(v2), true);
  }

  /** 选着技能，指在 (gx, gy)（格坐标，可带小数）：作用圈；信号弹没目标画红圈，有目标把建筑占地描亮；炮击把圈里的建筑描橙 */
  skill(kind: string, buildings: readonly BBuilding[], gx: number, gy: number, radius: number): void {
    const g = this.g.clear();
    const x = gx * UNIT;
    const y = gy * UNIT;
    const mark = kind === 'flare' ? flareTarget(buildings, x, y, radius) : undefined;
    const bad = kind === 'flare' && !mark;
    const col = bad ? 0xff5a4a : kind === 'medkit' ? 0x3fae52 : kind === 'flare' ? 0xffd23f : 0xff6a1f;
    const ring = ringCells(gx, gy, radius).map(([a, b]) => v2(iso(a, b)));
    g.fillStyle(col, bad ? 0.1 : 0.16).fillPoints(ring, true).lineStyle(3, col, 0.95).strokePoints(ring, true);
    const hi = kind === 'barrage' ? barrageHits(buildings, x, y, radius) : mark ? [mark] : [];
    for (const b of hi) {
      const p = [iso(b.x, b.y), iso(b.x + b.size, b.y), iso(b.x + b.size, b.y + b.size), iso(b.x, b.y + b.size)].map(v2);
      g.lineStyle(3, col, 1).strokePoints(p, true);
    }
    if (bad) {
      // 圈心画一个叉：这里放了也不会生效
      const c = iso(gx, gy);
      g.lineStyle(4, col, 1).lineBetween(c.x - 9, c.y - 5, c.x + 9, c.y + 5).lineBetween(c.x - 9, c.y + 5, c.x + 9, c.y - 5);
    }
  }
}
