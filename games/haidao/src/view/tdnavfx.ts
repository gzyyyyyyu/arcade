/**
 * 航海士（core/tdnav.ts）的画面：急射旗的深青圈、圈心的小三角旗和圈里塔脚下的金圈，重赏的金色虚线圈，
 * 瞄准时英雄身边的范围和场上的塔。每帧画在场景的 fxG 上（和号令、锚钩同一块 Graphics），不新建对象。只读核心状态，不算规则。
 */
import type Phaser from 'phaser';
import { TD2_NAV_SKILL, flagOn } from '../core/index.ts';
import type { TdEvent } from '../core/index.ts';
import { TICKS_PER_SEC, UNIT } from '../core/types.ts';
import type { TdScene } from './TdScene.ts';
import { sfx } from './audio/sfx.ts';
import { forEachEllipseDash, isoRing } from './tdfx.ts';
import { W } from './tdcommon.ts';

const FLAG = TD2_NAV_SKILL.flag;
const REWARD = TD2_NAV_SKILL.reward;
/** 航海士的主色（深青外套），旗面同色，金边 */
const NAV_TEAL = 0x1f7a8c;
const GOLD = 0xffe885;

/** 塔中心（单位）：和核心 tcx / tcy 一样 */
const center = (t: { x: number; y: number; size: number }): { x: number; y: number } => ({ x: (t.x + t.size / 2) * UNIT, y: (t.y + t.size / 2) * UNIT });

/** 一个圈：很淡的填充 + 流动的虚线边，最后 1 秒淡出（急射旗深青边、重赏金边） */
function zone(f: Phaser.GameObjects.Graphics, x: number, y: number, r: number, left: number, line: number, fill: number, u: number, now: number): void {
  const a = Math.min(1, left / TICKS_PER_SEC);
  const c = W(x, y);
  const R = isoRing(r / UNIT);
  f.fillStyle(fill, 0.1 * a).fillEllipse(c.x, c.y, R.w, R.h);
  f.lineStyle(3 * u, line, 0.9 * a);
  forEachEllipseDash(c.x, c.y, R.w, R.h, 14 * u, 9 * u, now * 0.03, (ax, ay, bx, by) => f.lineBetween(ax, ay, bx, by));
}

/** 每帧：急射旗（圈 + 圈心一面会飘的深青三角旗 + 圈里的塔脚下金圈）、重赏圈 */
export function drawNav(bs: TdScene, f: Phaser.GameObjects.Graphics, now: number, z: number): void {
  const s = bs.s;
  const h = s.hero;
  if (!h.kind) return;
  const u = 1 / z;
  const fl = h.flag;
  if (fl && s.tick < fl.until) {
    zone(f, fl.x, fl.y, FLAG.r, fl.until - s.tick, NAV_TEAL, NAV_TEAL, u, now);
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    for (const t of s.towers) {
      if (!flagOn(s, t)) continue;
      const c = W(center(t).x, center(t).y);
      f.lineStyle(3, GOLD, 0.55 + 0.4 * pulse).strokeEllipse(c.x, c.y + 8, 72, 36);
    }
    // 旗杆立在圈心，旗面朝右飘、随时间摆一点
    const c = W(fl.x, fl.y);
    const wave = Math.sin(now / 120) * 3;
    f.lineStyle(2.6, 0x3a2a1c, 1).lineBetween(c.x, c.y, c.x, c.y - 44);
    f.fillStyle(NAV_TEAL, 1).fillTriangle(c.x, c.y - 44, c.x, c.y - 26, c.x + 26 + wave, c.y - 35 + wave * 0.4);
    f.lineStyle(1.8, GOLD, 1).strokeTriangle(c.x, c.y - 44, c.x, c.y - 26, c.x + 26 + wave, c.y - 35 + wave * 0.4);
  }
  const rw = h.reward;
  if (rw && s.tick < rw.until) zone(f, rw.x, rw.y, REWARD.r, rw.until - s.tick, 0xf8c630, GOLD, u, now);
}

/** 瞄准（急射旗 / 重赏）：英雄身边能放的黄圈；急射旗另把场上的塔脚下描一圈金（看得出往哪插能圈住几座） */
export function drawNavAim(bs: TdScene, f: Phaser.GameObjects.Graphics, now: number): void {
  const h = bs.s.hero;
  const flag = bs.mode === 'flag';
  const range = flag ? FLAG.range : REWARD.range;
  const w = W(h.x, h.y);
  const R = isoRing(range / UNIT);
  f.lineStyle(3, GOLD, 0.85).strokeEllipse(w.x, w.y, R.w, R.h);
  f.fillStyle(GOLD, 0.12).fillEllipse(w.x, w.y, R.w, R.h);
  if (!flag) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  for (const t of bs.s.towers) {
    const p = W(center(t).x, center(t).y);
    f.lineStyle(3, GOLD, 0.35 + 0.35 * pulse).strokeEllipse(p.x, p.y + 8, 66, 33);
  }
}

/** 事件：插旗响一声「rally」、画重赏圈响金币声，落点冒一圈光 */
export function navEvent(bs: TdScene, e: Extract<TdEvent, { type: 'flag' | 'reward' }>): void {
  sfx(e.type === 'flag' ? 'rally' : 'coin');
  const c = W(e.x, e.y);
  bs.pt.ringBurst(c.x, c.y, e.type === 'flag' ? 1.4 : 1.6);
}
