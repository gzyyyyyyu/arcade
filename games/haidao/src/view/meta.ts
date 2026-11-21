import { CAMPAIGN } from '../content/index.ts';
import * as Core from '../core/index.ts';
import { totalStars } from '../core/index.ts';
import type { BattleSetup, Profile, Res } from '../core/types.ts';

/**
 * 每日悬赏、成就、称号的画面侧适配：直接用规则核心的 dailyBounty / ACHIEVEMENTS / checkAchievements；
 * 悬赏的岛不在战役表里时，用"按天轮流挑一座已解锁的岛"兜底。
 */

/** 北京时间的第几天（画面层可以用 Date） */
export function dayIndex(now = Date.now()): number {
  return Math.floor((now + 8 * 3600_000) / 86_400_000);
}

interface Bounty {
  levelId: string;
  name: string;
  done: boolean;
  day: number;
}

export function bountyOf(p: Profile): Bounty | null {
  const day = dayIndex();
  let id: string | undefined;
  id = Core.dailyBounty(day, p).levelId;
  if (!id) {
    const st = totalStars(p);
    const open = CAMPAIGN.filter((l) => st >= l.reqStars);
    id = open[day % Math.max(1, open.length)]?.id;
  }
  const lv = CAMPAIGN.find((l) => l.id === id);
  if (!lv) return null;
  return { levelId: lv.id, name: lv.name, done: p.daily?.day === day && p.daily.done, day };
}

function markBountyDone(p: Profile): Profile {
  return { ...p, daily: { day: dayIndex(), done: true }, stats: { ...p.stats, dailyDone: (p.stats.dailyDone ?? 0) + 1 } };
}

/**
 * 开悬赏战：打 dailyBounty 生成的那座岛（翻转后的布局），出海木材照战役规则扣。
 * 核心没有 startBounty，所以画面层用 armyFor / armyCost 自己组。
 */
export function startBounty(p: Profile): { ok: true; profile: Profile; setup: BattleSetup; levelId: string } | { ok: false; error: 'no_wood' | 'done' | 'none' } {
  const b = bountyOf(p);
  const d = Core.dailyBounty(dayIndex(), p);
  if (!b) return { ok: false, error: 'none' };
  if (b.done) return { ok: false, error: 'done' };
  const cost = Core.armyCost(p);
  if (p.res.wood < cost.wood) return { ok: false, error: 'no_wood' };
  const profile: Profile = { ...p, res: { gold: p.res.gold - cost.gold, wood: p.res.wood - cost.wood } };
  const setup: BattleSetup = Core.campaignSetup(d, Core.armyFor(p), d.seed);
  return { ok: true, profile, setup, levelId: d.levelId };
}

/** 悬赏结算：摧毁率 × dailyBounty.loot 进仓库（按仓库上限截断，cut 是截掉的）；至少 1 星才算完成，不动战役星数和连胜 */
export function settleBounty(p: Profile, res: { stars: number; destroyedPct: number }): { profile: Profile; loot: Res; cut: Res; done: boolean } {
  const d = Core.dailyBounty(dayIndex(), p);
  if (res.stars < 1) return { profile: p, loot: { gold: 0, wood: 0 }, cut: { gold: 0, wood: 0 }, done: false };
  const cap = Core.capacity(p);
  const raw = { gold: Math.floor((d.loot.gold * res.destroyedPct) / 100), wood: Math.floor((d.loot.wood * res.destroyedPct) / 100) };
  const loot = {
    gold: Math.max(0, Math.min(raw.gold, cap.gold - p.res.gold)),
    wood: Math.max(0, Math.min(raw.wood, cap.wood - p.res.wood)),
  };
  const paid: Profile = { ...p, res: { gold: p.res.gold + loot.gold, wood: p.res.wood + loot.wood } };
  return { profile: markBountyDone(paid), loot, cut: { gold: raw.gold - loot.gold, wood: raw.wood - loot.wood }, done: true };
}

export interface Ach {
  id: string;
  name: string;
  desc: string;
  tier: 'bronze' | 'silver' | 'gold';
  title?: string;
}

export function achievementList(): Ach[] {
  return Core.ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, tier: 'bronze' as const, title: a.title }));
}

export const hasAchievements = (): boolean => achievementList().length > 0;

/** 结算、升级之后调：返回更新后的存档和这次新拿到的成就 */
export function runAchievements(p: Profile): { profile: Profile; fresh: Ach[] } {
  const ids = Core.checkAchievements(p, p.stats);
  const byId = new Map(achievementList().map((a) => [a.id, a]));
  let profile = p;
  const have = new Set(p.achievements);
  const fresh = ids.filter((id) => !have.has(id) || profile.achievements.includes(id)).filter((id, i, a) => a.indexOf(id) === i && !have.has(id));
  if (fresh.length && !fresh.every((id) => profile.achievements.includes(id))) profile = { ...profile, achievements: [...new Set([...profile.achievements, ...fresh])] };
  return { profile, fresh: fresh.map((id) => byId.get(id) ?? { id, name: id, desc: '', tier: 'bronze' as const }) };
}
