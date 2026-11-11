import { describe, expect, it } from 'vitest';
import {
  TD2_ENEMY_POINTS, TD2_HOME, TD2_LOSE_AT, createTd, hqLevel, newProfile, runTd, runTdBot, settleTdHome, tdDailyCap, tdFingerprint, tdGrowthProfile,
  tdHomeGen, tdHomeRawReward, tdHomeSetup, tdHomeSnapshot, tdHomeWave, tdRunReward, tdUnlockedTowers, waveBudget,
} from '../src/core/index.ts';
import type { Profile, TdResult, TdWave } from '../src/core/index.ts';

/** 海盗来袭（src/core/tdhome.ts）：自己的岛、按预算现生成的波次、打到丢 TD2_LOSE_AT 枚或打满、按撑住的波数给奖励、和战役共用每日上限、不记星 */

const player = (hq: number): Profile => {
  const p = tdGrowthProfile({ hq }, 'suggest');
  return { ...p, td: { stars: { td01: 2 }, day: 3, gotGold: 0, gotWood: 0 } };
};
const points = (w: TdWave): number => w.groups.reduce((n, g) => n + TD2_ENEMY_POINTS[g.enemy] * g.n, 0);
const res = (waves: number, over = true): TdResult => ({ over, stars: 0, lost: 11, waves, total: TD2_HOME.maxWaves, ticks: 3000, goldEarned: 0 });

describe('海盗来袭：开局', () => {
  it('快照是存档的深拷贝；等效关按主寨等级查表', () => {
    const p = player(5);
    const snap = tdHomeSnapshot(p);
    expect(snap.layout).toEqual(p.base.buildings);
    expect(snap.layout[0]).not.toBe(p.base.buildings[0]);
    expect(snap.hq).toBe(hqLevel(p));
    for (let hq = 1; hq <= 8; hq++) expect(tdHomeGen({ ...snap, hq }, 9).levelIndex).toBe(TD2_HOME.levelByHq[hq - 1]);
    expect(tdHomeGen(snap, 9)).toMatchObject({ seed: 9, gold: TD2_HOME.gold, first: TD2_HOME.first, waveTicks: TD2_HOME.waveTicks });
  });

  it('波次只由参数和波数决定；花的点数不超过预算；敌人种类随波数加；每 10 波最后一波是首领波', () => {
    const gen = tdHomeGen(tdHomeSnapshot(player(4)), 3);
    for (let w = 0; w < 20; w++) {
      const a = tdHomeWave(gen, w);
      expect(tdHomeWave({ ...gen }, w)).toEqual(a);
      expect(points(a), `w${w}`).toBeLessThanOrEqual(Math.max(waveBudget(gen.levelIndex, w), TD2_ENEMY_POINTS.captain));
      expect(a.groups.length).toBeGreaterThan(0);
      expect(!!a.boss).toBe((w + 1) % 10 === 0);
      for (const g of a.groups) expect(g.lane).toBeLessThanOrEqual(TD2_HOME.lanes.length);
    }
    expect(new Set(tdHomeWave(gen, 0).groups.map((g) => g.enemy))).toEqual(new Set(['sailor']));
    const kinds = new Set(Array.from({ length: 20 }, (_, w) => tdHomeWave(gen, w)).flatMap((x) => x.groups.map((g) => g.enemy)));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
    expect(tdHomeWave({ ...gen, seed: 4 }, 12)).not.toEqual(tdHomeWave(gen, 12));
  });

  it('setup：自己的岛（常驻塔照常开火）、mode home、maxWaves 波、基地加成和能造的塔；种子不是整数拒绝', () => {
    const p = player(5);
    const r = tdHomeSetup(p, 11);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const st = r.value;
    expect(st).toMatchObject({ mode: 'home', seed: 11, hero: tdHomeSnapshot(p).hero, unlocked: tdUnlockedTowers(p) });
    expect(st.level.waves).toHaveLength(TD2_HOME.maxWaves);
    expect(st.layout).toEqual(p.base.buildings);
    const s = createTd(st);
    expect(s.towers.filter((t) => t.slot < 0).length).toBe(p.base.buildings.filter((b) => ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock'].includes(b.kind)).length);
    expect(s.slots.length).toBeGreaterThan(0);
    expect(tdHomeSetup(p, 1.5)).toEqual({ ok: false, error: 'bad_seed' });
  });
});

describe('海盗来袭：打一局', () => {
  it('机器人能打到结束（丢到 TD2_LOSE_AT 枚或打满），同一个 setup 重放逐位一样', () => {
    for (const hq of [2, 6]) {
      const r = tdHomeSetup(player(hq), 2);
      if (!r.ok) throw new Error(r.error);
      const bot = runTdBot(r.value, 'normal');
      expect(bot.result.over).toBe(true);
      expect(bot.result.lost >= TD2_LOSE_AT || bot.result.waves === TD2_HOME.maxWaves || bot.result.ticks >= 9600).toBe(true);
      const again = tdHomeSetup(player(hq), 2);
      if (!again.ok) throw new Error(again.error);
      expect(tdFingerprint(runTd(again.value, bot.actions).state)).toBe(tdFingerprint(bot.state));
    }
  }, 60_000);
});

describe('海盗来袭：结算', () => {
  it('原始奖励 = 主寨的 3★ 一局 × perWavePct% × 撑住的波数（最多 maxWaves）', () => {
    const full = tdRunReward({ hq: 4 }, 3);
    expect(tdHomeRawReward(4, 0)).toEqual({ gold: 0, wood: 0 });
    expect(tdHomeRawReward(4, 5)).toEqual({ gold: Math.floor((full.gold * TD2_HOME.perWavePct * 5) / 100), wood: Math.floor((full.wood * TD2_HOME.perWavePct * 5) / 100) });
    expect(tdHomeRawReward(4, 999)).toEqual(tdHomeRawReward(4, TD2_HOME.maxWaves));
  });

  it('给资源、不记星；和战役共用当天已拿；上限满了 capped', () => {
    const p = player(3);
    const r = settleTdHome(p, res(6), 3);
    if (!r.ok) throw new Error(r.error);
    const raw = tdHomeRawReward(3, 6);
    expect(r.value.reward).toEqual({ waves: 6, gold: raw.gold, wood: raw.wood, capped: false });
    expect(r.value.profile.res).toEqual({ gold: p.res.gold + raw.gold, wood: p.res.wood + raw.wood });
    expect(r.value.profile.td).toEqual({ stars: { td01: 2 }, day: 3, gotGold: raw.gold, gotWood: raw.wood });
    expect(p.td!.gotGold).toBe(0); // 不改入参
    const cap = tdDailyCap(p);
    const near: Profile = { ...p, td: { ...p.td!, gotGold: cap.gold - 10, gotWood: cap.wood } };
    const c = settleTdHome(near, res(6), 3);
    if (!c.ok) throw new Error(c.error);
    expect(c.value.reward).toEqual({ waves: 6, gold: 10, wood: 0, capped: true });
    // 换天清零
    const d = settleTdHome(near, res(6), 4);
    if (!d.ok) throw new Error(d.error);
    expect(d.value.reward.gold).toBe(raw.gold);
  });

  it('没有 td 字段的新档也能结；没打完、天数不对拒绝', () => {
    const p = newProfile();
    const r = settleTdHome(p, res(2), 0);
    expect(r.ok && r.value.profile.td).toMatchObject({ stars: {}, day: 0 });
    expect(settleTdHome(p, res(2, false), 0)).toEqual({ ok: false, error: 'not_over' });
    expect(settleTdHome(p, res(2), -1)).toEqual({ ok: false, error: 'bad_day' });
  });
});
