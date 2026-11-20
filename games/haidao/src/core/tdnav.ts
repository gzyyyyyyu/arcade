/**
 * 守岛第二个英雄航海士（DESIGN 10.1）：不挡、不炸，靠放大塔和多挣钱。
 * - 急射旗：插在一点，圈里的塔一段时间攻速翻倍（stepTowers 读 flagOn）；
 * - 重赏：画一个圈，圈里倒下的敌人击杀金翻倍（tdevent.ts 的 killGold 读 hero.reward）；
 * - 精打细算（被动）：提前叫波的金币多一半（tdquery.ts 的 tdCallBonus）。
 * 两个技能的冷却复用船长的 barricadeReady（技能一）和 kegReady（技能二），叫波抵冷却、补给箱刷新照旧。
 * 只在战役和海盗来袭、setup 写了 heroKind 时有（navEnabled）。
 */
import { TD2_NAV_SKILL } from '../content/td2units.ts';
import { heroCd } from './tdevent.ts';
import { d2, tcx, tcy } from './tdstate.ts';
import type { TdState } from './tdstate.ts';
import type { TdEvent, TdSetup, TdTower } from './tdtypes.ts';

/** 这一局带的是航海士 */
export function navEnabled(setup: Pick<TdSetup, 'mode' | 'heroKind'>): boolean {
  return setup.heroKind === 'nav' && (setup.mode === 'campaign' || setup.mode === 'home');
}

/** 这座塔现在在急射旗的圈里（按塔中心算） */
export function flagOn(s: TdState, t: TdTower): boolean {
  const f = s.hero.flag;
  return !!f && s.tick < f.until && d2(tcx(t), tcy(t), f.x, f.y) <= TD2_NAV_SKILL.flag.r * TD2_NAV_SKILL.flag.r;
}

/** 急射旗：英雄活着、冷却好了、落点在英雄 range 内才插上；插新的就换掉旧的 */
export function castFlag(s: TdState, ev: TdEvent[], x: number, y: number): void {
  const h = s.hero;
  const sk = TD2_NAV_SKILL.flag;
  if (!h.kind || h.respawn >= 0 || s.tick < (h.barricadeReady ?? 0) || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const fx = Math.round(x);
  const fy = Math.round(y);
  if (d2(h.x, h.y, fx, fy) > sk.range * sk.range) return;
  h.barricadeReady = s.tick + heroCd(s, sk.cd);
  h.flag = { x: fx, y: fy, until: s.tick + sk.ticks };
  ev.push({ type: 'flag', x: fx, y: fy, r: sk.r, until: h.flag.until, ready: h.barricadeReady });
  ev.push({ type: 'hero', what: 'flag' });
}

/** 重赏：英雄活着、冷却好了、落点在英雄 range 内才画圈 */
export function castReward(s: TdState, ev: TdEvent[], x: number, y: number): void {
  const h = s.hero;
  const sk = TD2_NAV_SKILL.reward;
  if (!h.kind || h.respawn >= 0 || s.tick < h.kegReady || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (d2(h.x, h.y, rx, ry) > sk.range * sk.range) return;
  h.kegReady = s.tick + heroCd(s, sk.cd);
  h.reward = { x: rx, y: ry, until: s.tick + sk.ticks };
  ev.push({ type: 'reward', x: rx, y: ry, r: sk.r, until: h.reward.until, ready: h.kegReady });
  ev.push({ type: 'hero', what: 'reward' });
}
