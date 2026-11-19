/**
 * 锚钩（规则版本 20，core/tdhook.ts）的画面：瞄准时的黄圈和可钩敌人的金圈、点敌人放钩、钩子甩出去的弧线、链条、拖回来、收链。
 * 敌人被拖着走是规则里一拍挪半格（画面按帧插值，不瞬移），头顶的转星沿用震晕那一套（tdsync 按 stunUntil 画）。只读核心状态和事件，不算规则。
 */
import type Phaser from 'phaser';
import { TD2_ENEMIES, TD2_HERO_SKILL, hookable } from '../core/index.ts';
import type { TdEnemy, TdEvent } from '../core/index.ts';
import { UNIT } from '../core/types.ts';
import type { TdScene } from './TdScene.ts';
import { STEP_MS, hookPhase } from './motion.ts';
import { isoRing } from './tdfx.ts';
import { SKILL, W } from './tdcommon.ts';
import { sfx } from './audio/sfx.ts';

const HOOK = TD2_HERO_SKILL.hook;
/** 甩出去时弧线的最高点（世界像素） */
const ARC_PX = 34;
/** 链环间距（世界像素） */
const LINK_PX = 7;

/** 一次放出的锚钩：t0 甩出、t1 钩上、t2 拉完，t2 + REEL_TICKS 收完 */
export interface HookFx {
  id: number;
  t0: number;
  t1: number;
  t2: number;
  caught: boolean;
}

/** 事件 hook：记下一次锚钩的时间点，甩出去的声音 */
export function startHook(bs: TdScene, e: Extract<TdEvent, { type: 'hook' }>): void {
  const t0 = bs.s.tick - 1;
  bs.hooks.push({ id: e.id, t0, t1: e.t1, t2: e.t1 + (e.path.length / 2) * HOOK.perCell, caught: false });
  sfx('harpoon');
}

/** 这个敌人还在被钩着（钩子在飞、正被拖回来）：这段不画转星、不晃，拖完定住了才转星 */
export function hookHeld(bs: TdScene, id: number): boolean {
  if (bs.hooks.length === 0) return false;
  const ft = bs.s.tick + bs.acc / STEP_MS;
  return bs.hooks.some((fx) => fx.id === id && ft < fx.t2);
}

/** 英雄手的位置（世界像素）：身高的四成处 */
function hand(bs: TdScene): { x: number; y: number } {
  return { x: bs.hero.x, y: bs.hero.y + (bs.hero.topY - bs.hero.y) * 0.45 };
}

/** 敌人身上挂钩的点：身高的一半处 */
function body(bs: TdScene, id: number): { x: number; y: number } | null {
  const sp = bs.esp.get(id);
  return sp ? { x: sp.rig.x, y: sp.rig.y + (sp.rig.topY - sp.rig.y) * 0.5 } : null;
}

/** 每帧：画所有在飞、在拉、在收的锚钩；演完、目标没了的删掉 */
export function drawHooks(bs: TdScene, f: Phaser.GameObjects.Graphics, z: number): void {
  if (bs.hooks.length === 0) return;
  const ft = bs.s.tick + bs.acc / STEP_MS;
  const a = hand(bs);
  bs.hooks = bs.hooks.filter((fx) => {
    const ph = hookPhase(fx, ft);
    const b = body(bs, fx.id);
    if (ph.kind === 'done' || !b) return false;
    if (ph.kind !== 'fly' && !fx.caught) {
      fx.caught = true;
      sfx('stun');
    }
    let hx = b.x;
    let hy = b.y;
    let lift = 0;
    if (ph.kind === 'fly') {
      // 甩出去：钩头沿抛物线飞，链子跟在后面松松地垂着
      const k = 1 - (1 - ph.k) * (1 - ph.k);
      hx = a.x + (b.x - a.x) * k;
      hy = a.y + (b.y - a.y) * k;
      lift = ARC_PX * 4 * ph.k * (1 - ph.k);
      hy -= lift;
    } else if (ph.kind === 'reel') {
      hx = b.x + (a.x - b.x) * ph.k;
      hy = b.y + (a.y - b.y) * ph.k;
    }
    chain(f, a.x, a.y, hx, hy, ph.kind === 'fly' ? lift * 0.5 : 0, z);
    claw(f, hx, hy, Math.atan2(hy - a.y, hx - a.x), z, ph.kind === 'pull');
    return true;
  });
}

/** 链条：从 (x0,y0) 到 (x1,y1) 一串交替横竖的铁环；sag > 0 时中间往上拱（甩出去时） */
function chain(f: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, sag: number, z: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.min(80, Math.round(len / LINK_PX)));
  const lw = Math.max(1, 1.4 / z);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
    const wide = i % 2 === 0;
    const rw = wide ? 5.2 : 2.6;
    const rh = wide ? 2.8 : 4.4;
    f.lineStyle(lw * 2.2, 0x2b1a15, 0.9).strokeEllipse(x, y, rw + 1, rh + 1);
    f.lineStyle(lw, 0xb8c6d4, 1).strokeEllipse(x, y, rw, rh);
  }
}

/** 钩头：一个环、一截柄、朝前的三只爪；钩住时爪收拢一点 */
function claw(f: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, z: number, shut: boolean): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (fw: number, side: number): [number, number] => [x + c * fw - s * side, y + s * fw + c * side];
  const spread = shut ? 4 : 7;
  const lw = Math.max(1.2, 2.4 / z);
  const tips: Array<[[number, number], [number, number]]> = [
    [P(0, 0), P(8, 0)],
    [P(3, 0), P(-1, -spread)],
    [P(3, 0), P(-1, spread)],
  ];
  for (const [p, q] of tips) f.lineStyle(lw * 2, 0x2b1a15, 1).lineBetween(p[0], p[1], q[0], q[1]);
  for (const [p, q] of tips) f.lineStyle(lw, 0x9fb4c7, 1).lineBetween(p[0], p[1], q[0], q[1]);
  const back = P(-4, 0);
  f.lineStyle(lw, 0x2b1a15, 1).strokeCircle(back[0], back[1], 2.6);
}

/** 瞄准锚钩时：英雄身边的黄圈，圈里钩得动的敌人脚下一圈金色 */
export function drawHookAim(bs: TdScene, f: Phaser.GameObjects.Graphics, now: number): void {
  const h = bs.s.hero;
  const w = W(h.x, h.y);
  const R = isoRing(SKILL.hook.range / UNIT);
  f.lineStyle(3, 0xffe885, 0.85).strokeEllipse(w.x, w.y, R.w, R.h);
  f.fillStyle(0xffe885, 0.12).fillEllipse(w.x, w.y, R.w, R.h);
  const pulse = 0.55 + 0.35 * Math.sin(now / 160);
  for (const e of inReach(bs)) {
    const sp = bs.esp.get(e.id);
    if (!sp) continue;
    f.lineStyle(3, 0xf8c630, pulse).strokeEllipse(sp.rig.x, sp.rig.y, 44, 22);
  }
}

/** 英雄够得着、钩得动的敌人 */
function inReach(bs: TdScene): TdEnemy[] {
  const h = bs.s.hero;
  const r2 = SKILL.hook.range * SKILL.hook.range;
  return bs.s.enemies.filter((e) => (e.x - h.x) ** 2 + (e.y - h.y) ** 2 <= r2 && hookable(bs.s, e));
}

/**
 * 瞄准锚钩时点了 (wx, wy)（世界像素）：点中的敌人（脚下到头顶这一竖条，左右各放宽 30 像素；点中好几个取离手指最近的）。
 * 返回 { e } 是点中了能钩的；{ far } 是点中了但在黄圈外或钩不动；null 是没点到敌人
 */
export function pickHookTarget(bs: TdScene, wx: number, wy: number): { e: TdEnemy } | { far: true; boss: boolean } | null {
  let best: TdEnemy | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const e of bs.s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    const sp = bs.esp.get(e.id);
    if (!sp) continue;
    const dx = Math.abs(wx - sp.rig.x);
    if (dx > 30 || wy < sp.rig.topY - 10 || wy > sp.rig.y + 14) continue;
    const d = dx * dx + (wy - (sp.rig.y + sp.rig.topY) / 2) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) return null;
  if (inReach(bs).includes(best)) return { e: best };
  const def = TD2_ENEMIES[best.kind];
  return { far: true, boss: !!(def.shell || def.aura) };
}
