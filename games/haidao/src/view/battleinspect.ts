/**
 * 登陆战里选中一个兵或一座防御看它在干什么：射程圈（防御还画近处死角）、到它当前目标的连线，屏边贴一张小介绍卡（intelcard.ts 的 pinIntel）。
 * 选法：什么都没选时轻点、手机长按、电脑右键；Esc、点 ×、目标死了或塌了就取消。不暂停战斗，每帧跟着重画。
 */
import type Phaser from 'phaser';
import { TROOPS } from '../content/index.ts';
import type { BBuilding, BUnit } from '../core/types.ts';
import type { BattleScene } from './BattleScene.ts';
import { drawReach } from './battleranges.ts';
import { DEPTH } from './depth.ts';
import { DEFENSE_CARD_KINDS, defenseCard, troopCard } from './intel.ts';
import { pinIntel } from './intelcard.ts';
import { footCenter, iso, unIso } from './iso.ts';

export interface Inspect {
  kind: 'unit' | 'building';
  id: number;
  g: Phaser.GameObjects.Graphics;
  pin: ReturnType<typeof pinIntel>;
}

/** 点在兵身边多近算点中（世界坐标，约半格） */
const UNIT_PICK = 30;

function unitNear(bs: BattleScene, wx: number, wy: number): BUnit | undefined {
  let best: BUnit | undefined;
  let bd = UNIT_PICK * UNIT_PICK;
  for (const u of bs.st.units) {
    if (u.mode === 'dead') continue;
    const p = bs.W(u.x, u.y);
    // 兵画在脚底点上方一点：按身子中间算
    const d = (p.x - wx) ** 2 + (p.y - 14 - wy) ** 2;
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

function buildingAt(bs: BattleScene, wx: number, wy: number): BBuilding | undefined {
  const { gx, gy } = unIso(wx, wy);
  return bs.st.buildings.find((q) => !q.destroyed && q.revealed && DEFENSE_CARD_KINDS.includes(q.kind) && gx >= q.x && gx < q.x + q.size && gy >= q.y && gy < q.y + q.size);
}

/** 选中世界坐标处的兵（优先）或防御；什么都没点中返回 false（调用方照旧处理这一下） */
export function inspectAt(bs: BattleScene, wx: number, wy: number): boolean {
  const u = unitNear(bs, wx, wy);
  const b = u ? undefined : buildingAt(bs, wx, wy);
  if (!u && !b) return false;
  clearInspect(bs);
  const g = bs.add.graphics().setDepth(DEPTH.hudFx);
  const pin = pinIntel(() => clearInspect(bs));
  bs.inspect = u ? { kind: 'unit', id: u.id, g, pin } : { kind: 'building', id: b!.id, g, pin };
  inspectFrame(bs);
  return true;
}

export function clearInspect(bs: BattleScene): void {
  const it = bs.inspect;
  if (!it) return;
  bs.inspect = null;
  it.g.destroy();
  it.pin.close();
}

/** 每帧：重画圈和连线、卡片跟着等级换；选中的死了、塌了就取消 */
export function inspectFrame(bs: BattleScene): void {
  const it = bs.inspect;
  if (!it) return;
  const s = bs.st;
  const g = it.g.clear();
  const z = Math.max(0.5, bs.cc.z);
  if (it.kind === 'unit') {
    const u = s.units.find((q) => q.id === it.id);
    if (!u || u.mode === 'dead') return clearInspect(bs);
    const p = bs.W(u.x, u.y);
    const range = TROOPS[u.kind].levels[u.level - 1]?.range ?? 1;
    // 射程按格：1 格 = 椭圆宽 90、高 45（和防御的圈同一个比例）
    g.lineStyle(3 / z, 0x6fd3ff, 0.95).fillStyle(0x6fd3ff, 0.12).fillEllipse(p.x, p.y, range * 90, range * 45).strokeEllipse(p.x, p.y, range * 90, range * 45);
    g.lineStyle(3 / z, 0xffffff, 1).strokeEllipse(p.x, p.y, 22, 11);
    const t = u.target >= 0 ? s.buildings.find((q) => q.id === u.target && !q.destroyed) : undefined;
    if (t) {
      const f = footCenter(t.x, t.y, t.size);
      line(g, p, iso(f.gx, f.gy), z, 0x6fd3ff);
    }
    it.pin.update(troopCard(u.kind, u.level));
  } else {
    const b = s.buildings.find((q) => q.id === it.id);
    if (!b || b.destroyed) return clearInspect(bs);
    drawReach(g, b, true);
    const f = footCenter(b.x, b.y, b.size);
    const c = iso(f.gx, f.gy);
    const tu = b.aim >= 0 ? s.units.find((q) => q.id === b.aim && q.mode !== 'dead') : undefined;
    if (tu) line(g, c, bs.W(tu.x, tu.y), z, 0xff5a4a);
    it.pin.update(defenseCard(b.kind, b.level));
  }
}

/** 到目标的连线：深色描边 + 彩色芯 + 目标处一个小靶环 */
function line(g: Phaser.GameObjects.Graphics, a: { x: number; y: number }, b: { x: number; y: number }, z: number, color: number): void {
  g.lineStyle(6 / z, 0x2b1a15, 0.55).lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(3 / z, color, 1).lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(3 / z, color, 1).strokeEllipse(b.x, b.y, 30, 15);
}
