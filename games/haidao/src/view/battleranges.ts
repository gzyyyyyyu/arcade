import type Phaser from 'phaser';
import { BUILDINGS } from '../content/index.ts';
import type { BBuilding } from '../core/types.ts';
import { flareTarget } from '../core/index.ts';
import type { BattleScene } from './BattleScene.ts';
import { DEPTH } from './depth.ts';
import { footCenter, iso } from './iso.ts';

/**
 * 登陆战看懂防御：射程圈（红）加盲区（臼炮一类打不到脚下，内圈压暗、画斜线）。
 * 用在三处：侦察期全岛的射程圈（开场俯瞰起一直留到出第一船）、点一座敌方防御看它的圈、信号弹标着的建筑头上一直挂准星。
 */

/** 一座建筑的射程和盲区（格）；不是会打人的防御返回 null。地雷、焦油是陷阱、墙不打人，不画 */
function defenseReach(b: BBuilding): { range: number; minRange: number } | null {
  if (b.kind === 'mine' || b.kind === 'tar' || b.kind === 'wall') return null;
  const lvl = BUILDINGS[b.kind]?.levels[b.level - 1] as { range?: number; minRange?: number; dmg?: number } | undefined;
  if (!lvl?.range || !lvl.dmg) return null;
  return { range: lvl.range, minRange: lvl.minRange ?? 0 };
}

/** 画一座防御的圈（世界坐标，1 格射程 = 椭圆宽 90、高 45） */
export function drawReach(g: Phaser.GameObjects.Graphics, b: BBuilding, strong: boolean): void {
  const r = defenseReach(b);
  if (!r) return;
  const f = footCenter(b.x, b.y, b.size);
  const w = iso(f.gx, f.gy);
  const W = r.range * 90;
  const H = r.range * 45;
  g.lineStyle(strong ? 4 : 3, 0xff5a4a, 0.9).fillStyle(0xff5a4a, strong ? 0.16 : 0.1).fillEllipse(w.x, w.y, W, H).strokeEllipse(w.x, w.y, W, H);
  if (r.minRange <= 0) return;
  // 盲区：压暗 + 斜线 + 虚一点的边，说清"贴脸它打不到"
  const w2 = r.minRange * 90;
  const h2 = r.minRange * 45;
  g.fillStyle(0x2b1a15, 0.32).fillEllipse(w.x, w.y, w2, h2);
  g.lineStyle(2, 0xfff2c8, 0.55);
  for (let i = -3; i <= 3; i++) {
    const t = i / 4;
    const hy = (h2 / 2) * Math.sqrt(Math.max(0, 1 - t * t));
    g.lineBetween(w.x + (t * w2) / 2 - hy * 0.6, w.y + hy, w.x + (t * w2) / 2 + hy * 0.6, w.y - hy);
  }
  g.lineStyle(2, 0xfff2c8, 0.9).strokeEllipse(w.x, w.y, w2, h2);
}

/** 侦察期的全岛射程圈：开场俯瞰时画好，一直留到出第一船（拍数离开 0）再淡掉 */
export function scoutRings(bs: BattleScene): Phaser.GameObjects.Graphics {
  const g = bs.add.graphics().setDepth(DEPTH.hudFx);
  for (const b of bs.st.buildings) if (!b.destroyed && b.revealed) drawReach(g, b, false);
  return g;
}

/** 点了一座敌方防御：只画它的圈，停 2.6 秒淡掉；再点别的换掉 */
const PICK_MS = 2600;
export function pickReach(bs: BattleScene, gx: number, gy: number): boolean {
  const b = bs.st.buildings.find((q) => !q.destroyed && q.revealed && gx >= q.x && gx < q.x + q.size && gy >= q.y && gy < q.y + q.size);
  if (!b || !defenseReach(b)) return false;
  bs.pickG?.destroy();
  const g = bs.add.graphics().setDepth(DEPTH.hudFx);
  drawReach(g, b, true);
  bs.pickG = g;
  bs.tweens.add({ targets: g, alpha: 0, delay: PICK_MS - 400, duration: 400, onComplete: () => {
    g.destroy();
    if (bs.pickG === g) bs.pickG = null;
  } });
  return true;
}

/** 信号弹标着的建筑：头上一个呼吸的金色准星，标多久挂多久 */
export function drawFlare(bs: BattleScene, g: Phaser.GameObjects.Graphics, time: number, z: number): void {
  const id = flareTarget(bs.st);
  if (id < 0) return;
  const b = bs.st.buildings.find((q) => q.id === id);
  if (!b || b.destroyed) return;
  const f = footCenter(b.x, b.y, b.size);
  const w = iso(f.gx, f.gy);
  const u = 1 / Math.max(0.6, z);
  const p = 1 + 0.08 * Math.sin(time / 180);
  const rx = b.size * 34 * p;
  const ry = b.size * 17 * p;
  g.lineStyle(4 * u, 0x2b1a15, 0.7).strokeEllipse(w.x, w.y, rx * 2 + 2 * u, ry * 2 + u);
  g.lineStyle(3 * u, 0xffd23f, 0.95).strokeEllipse(w.x, w.y, rx * 2, ry * 2);
  g.lineStyle(3 * u, 0xffd23f, 0.95);
  g.lineBetween(w.x - rx * 1.25, w.y, w.x - rx * 0.75, w.y).lineBetween(w.x + rx * 0.75, w.y, w.x + rx * 1.25, w.y);
  g.lineBetween(w.x, w.y - ry * 1.3, w.x, w.y - ry * 0.7).lineBetween(w.x, w.y + ry * 0.7, w.x, w.y + ry * 1.3);
}
