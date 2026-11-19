import { describe, expect, it } from 'vitest';
import {
  RULES_SINCE, TD2_ENEMY_POINTS, TD2_HOME, TD2_LOSE_AT, createTd, hqLevel, newProfile, runTd, runTdBot, settleTdHome, tdDailyCap, tdFingerprint, tdGrowthProfile,
  tdHomeGen, tdHomeHardOpen, tdHomeRawReward, tdHomeSetup, tdHomeSnapshot, tdHomeWave, tdRunReward, tdUnlockedTowers, waveBudget,
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
    expect(r.value.reward).toEqual({ waves: 6, hard: false, gold: raw.gold, wood: raw.wood, capped: false, full: false });
    expect(r.value.profile.res).toEqual({ gold: p.res.gold + raw.gold, wood: p.res.wood + raw.wood });
    expect(r.value.profile.td).toEqual({ stars: { td01: 2 }, day: 3, gotGold: raw.gold, gotWood: raw.wood });
    expect(p.td!.gotGold).toBe(0); // 不改入参
    const cap = tdDailyCap(p);
    const near: Profile = { ...p, td: { ...p.td!, gotGold: cap.gold - 10, gotWood: cap.wood } };
    const c = settleTdHome(near, res(6), 3);
    if (!c.ok) throw new Error(c.error);
    expect(c.value.reward).toEqual({ waves: 6, hard: false, gold: 10, wood: 0, capped: true, full: false });
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

describe('海盗来袭：加难档（规则版本 20）', () => {
  it('主寨 6 级起才能开；不选时生成参数里没有 hard 字段，波次和普通档逐位一样', () => {
    expect(tdHomeHardOpen(TD2_HOME.hard.hq - 1)).toBe(false);
    expect(tdHomeHardOpen(TD2_HOME.hard.hq)).toBe(true);
    expect(tdHomeSetup(player(TD2_HOME.hard.hq - 1), 2, true)).toEqual({ ok: false, error: 'hard_locked' });
    const st = tdHomeSetup(player(6), 2);
    if (!st.ok) throw new Error(st.error);
    expect('hard' in st.value.home!).toBe(false);
    const snap = tdHomeSnapshot(player(6));
    for (let w = 0; w < TD2_HOME.maxWaves; w++) expect(tdHomeWave(tdHomeGen(snap, 4, false), w)).toEqual(tdHomeWave(tdHomeGen(snap, 4), w));
  });

  it('加难：等效关 +levelPlus、记进 home.hard；精英按 hard.elite 的波数进来，普通档一个精英都没有', () => {
    const st = tdHomeSetup(player(8), 2, true);
    if (!st.ok) throw new Error(st.error);
    expect(st.value.home).toMatchObject({ hard: true, levelIndex: TD2_HOME.levelByHq[7]! + TD2_HOME.hard.levelPlus });
    expect(st.value.rules).toBeGreaterThanOrEqual(RULES_SINCE.tdHook);
    const snap = tdHomeSnapshot(player(8));
    const elites = new Set(['bosun', 'macaw', 'mate']);
    const firstAt = new Map<string, number>();
    let normalElite = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (let w = 0; w < TD2_HOME.maxWaves; w++) {
        for (const g of tdHomeWave(tdHomeGen(snap, seed, true), w).groups) if (elites.has(g.enemy) && !firstAt.has(g.enemy)) firstAt.set(g.enemy, w);
        for (const g of tdHomeWave(tdHomeGen(snap, seed), w).groups) if (elites.has(g.enemy)) normalElite++;
      }
    }
    expect(normalElite).toBe(0);
    for (const [k, from] of TD2_HOME.hard.elite) {
      expect(firstAt.has(k)).toBe(true);
      expect(firstAt.get(k)!).toBeGreaterThanOrEqual(from);
    }
  });

  it('同种子同操作逐位可复现', () => {
    const st = tdHomeSetup(player(7), 5, true);
    if (!st.ok) throw new Error(st.error);
    const a = runTdBot(st.value, 'normal');
    const b = runTdBot(st.value, 'normal');
    expect(tdFingerprint(a.state)).toBe(tdFingerprint(b.state));
  });

  it('奖励按 hard.perWavePct 给，结果写明加难；照样受每日上限截', () => {
    const p = player(6);
    const full = tdRunReward({ hq: 6 }, 3);
    expect(tdHomeRawReward(6, 5, true)).toEqual({ gold: Math.floor((full.gold * TD2_HOME.hard.perWavePct * 5) / 100), wood: Math.floor((full.wood * TD2_HOME.hard.perWavePct * 5) / 100) });
    const r = settleTdHome(p, res(5), 3, { hard: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.reward).toMatchObject({ hard: true, ...tdHomeRawReward(6, 5, true) });
    const cap = tdDailyCap(p);
    const near: Profile = { ...p, td: { ...p.td!, gotGold: cap.gold - 10, gotWood: cap.wood } };
    const c = settleTdHome(near, res(20), 3, { hard: true });
    if (!c.ok) throw new Error(c.error);
    expect(c.value.reward).toEqual({ waves: 20, hard: true, gold: 10, wood: 0, capped: true, full: false });
  });
});
