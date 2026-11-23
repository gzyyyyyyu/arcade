import { describe, expect, it } from 'vitest';
import { CAMPAIGN, REPLAY_PCT, income } from '../src/content/index.ts';
import { capacity, newProfile } from '../src/core/base.ts';
import { GOALS, GOAL_BOX, GOAL_KINDS, claimGoal, goalPicks, goalReward, goalState, goalTick, goalsClaimable } from '../src/core/goals.ts';
import type { GoalKind, Profile } from '../src/core/types.ts';
import { reviveSave } from '../src/platform/sync.ts';

const DAY = 20_400;
const roomy = (p: Profile): Profile => ({ ...p, res: { gold: 0, wood: 0 } });
const finish = (p: Profile, day: number, k: GoalKind): Profile => goalTick(p, day, k, GOALS[k].need);

describe('每日三件小事', () => {
  it('同一天抽到的三件相同、不重复；没平台不抽要平台的', () => {
    for (let d = DAY; d < DAY + 60; d++) {
      const a = goalPicks(d, true);
      expect(a).toEqual(goalPicks(d, true));
      expect(new Set(a).size).toBe(3);
      for (const k of goalPicks(d, false)) expect(GOALS[k].online).toBeFalsy();
    }
    // 60 天里每种都抽到过
    const seen = new Set<GoalKind>();
    for (let d = DAY; d < DAY + 60; d++) for (const k of goalPicks(d, true)) seen.add(k);
    expect([...seen].sort()).toEqual([...GOAL_KINDS].sort());
  });

  it('计数封顶到要求、跨天清零', () => {
    let p = newProfile();
    p = goalTick(p, DAY, 'star', 3);
    p = goalTick(p, DAY, 'star', 3);
    expect(goalState(p, DAY).prog.star).toBe(GOALS.star.need);
    expect(goalTick(p, DAY, 'star', 1)).toBe(p);
    expect(goalState(p, DAY + 1)).toEqual({ prog: {}, got: [] });
    p = goalTick(p, DAY + 1, 'sail');
    expect(p.goals).toEqual({ day: DAY + 1, prog: { sail: 1 }, got: [] });
  });

  it('领奖 = 同主寨最难那关三星重打掠夺的一半；没做完、没抽到、领过都不行', () => {
    const picks = goalPicks(DAY, true);
    const other = GOAL_KINDS.find((k) => !picks.includes(k))!;
    let p = roomy(newProfile());
    expect(claimGoal(p, DAY, true, picks[0]!)).toEqual({ ok: false, error: 'not_done' });
    p = finish(p, DAY, other);
    expect(claimGoal(p, DAY, true, other)).toEqual({ ok: false, error: 'not_today' });
    p = finish(p, DAY, picks[0]!);
    const r = claimGoal(p, DAY, true, picks[0]!);
    if (!r.ok) throw new Error(r.error);
    const lv = CAMPAIGN.filter((l) => l.hq <= 1).at(-1)!;
    const want = income({ gold: Math.floor((lv.loot.gold * REPLAY_PCT * 50) / 10000), wood: Math.floor((lv.loot.wood * REPLAY_PCT * 50) / 10000) });
    expect(r.value.reward).toEqual(want);
    expect(goalReward(p)).toEqual(want);
    expect(r.value.profile.res).toEqual(want);
    expect(claimGoal(r.value.profile, DAY, true, picks[0]!)).toEqual({ ok: false, error: 'got' });
  });

  it('仓库放不下就不领，留着', () => {
    const k = goalPicks(DAY, true)[0]!;
    const p0 = finish(newProfile(), DAY, k);
    const full = { ...p0, res: capacity(p0) };
    expect(claimGoal(full, DAY, true, k)).toEqual({ ok: false, error: 'full' });
    expect(goalsClaimable(full, DAY, true)).toBe(1);
  });

  it('三件都领了才能开箱，箱子确定性、只开一次', () => {
    const picks = goalPicks(DAY, false);
    let p = roomy(newProfile());
    expect(claimGoal(p, DAY, false, GOAL_BOX)).toEqual({ ok: false, error: 'not_done' });
    for (const k of picks) {
      p = finish(p, DAY, k);
      const r = claimGoal(p, DAY, false, k);
      if (!r.ok) throw new Error(r.error);
      p = r.value.profile;
    }
    expect(goalsClaimable(p, DAY, false)).toBe(1);
    const a = claimGoal(p, DAY, false, GOAL_BOX);
    const b = claimGoal(p, DAY, false, GOAL_BOX);
    expect(a).toEqual(b);
    if (!a.ok) throw new Error(a.error);
    expect(a.value.reward.gold + a.value.reward.wood).toBeGreaterThan(0);
    expect(goalsClaimable(a.value.profile, DAY, false)).toBe(0);
    expect(claimGoal(a.value.profile, DAY, false, GOAL_BOX)).toEqual({ ok: false, error: 'got' });
  });

  it('读存档只留认识的种类和领奖记号，次数卡在 0..要求', () => {
    const p = newProfile();
    const raw = { profile: { ...p, goals: { day: DAY, prog: { sail: 9, star: 2, nope: 1, raid: -1 }, got: ['sail', 'box', 'box', 'evil', 3] } }, lastSeen: 0 };
    expect(reviveSave(raw)!.profile.goals).toEqual({ day: DAY, prog: { star: 2 }, got: ['sail', 'box'] });
    expect(reviveSave({ profile: { ...p, goals: { day: -1, prog: {}, got: [] } }, lastSeen: 0 })!.profile.goals).toBeUndefined();
  });
});
