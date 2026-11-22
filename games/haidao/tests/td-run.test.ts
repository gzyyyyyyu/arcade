import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, CAMPAIGN, INCOME_PCT, ISLAND, REPLAY_PCT, RULES_VERSION, TD2_HOME, TD2_LEVEL_BY_ID, TD2_LEVELS, TD_BONUS_PER_STAR, TD_BASE_BONUS, TD_CAP_RUNS, TD_RUN_RAIDS,
  TD_RUN_REWARD, TD_STAR_PCT, TD_TOWER_KINDS, baseBonusPct, capacity, createTd, garrisonTier, newProfile, nextTdUnlock, placeTdLevel, settleTd, startTd2, tdAutoPicks, tdBaseBonus, tdCampaign, tdDailyCap,
  tdGarrisonOptions, tdGrowthProfile, tdGrowthSetup, tdLevelUnlocked, tdRunReward, tdUnlockedTowers,
} from '../src/core/index.ts';
import type { Placed, Profile, TdPlacedLevel, TdResult } from '../src/core/index.ts';
import { reviveSave } from '../src/platform/sync.ts';

/** 守岛的出海和结算（src/core/tdrun.ts）：战役关表和解锁、驻守台、基地加成、能造的塔、养成档位、结算与每日上限、候选位置摆放、存档 */

const withHq = (hq: number, extra: Placed[] = []): Profile => {
  const p = newProfile();
  return { ...p, base: { buildings: [...p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: hq } : b)), ...extra], nextId: 300 } };
};
/** 仓库够大的存档（另放一座 8 级金库和木料仓）：结算测试只看每日上限时用，免得被仓库截 */
const STORE: Placed[] = [
  { id: 280, kind: 'vault', level: 8, x: 0, y: 0 },
  { id: 281, kind: 'woodyard', level: 8, x: 0, y: 3 },
];
const roomy = (hq: number): Profile => withHq(hq, STORE);
const res = (stars: number, over = true): TdResult => ({ over, stars, lost: 0, waves: 8, total: 8, ticks: 3000, goldEarned: 0 });
const withTd = (p: Profile, td: NonNullable<Profile['td']>): Profile => ({ ...p, td });
const SAMPLE = 'td2-sample';
const sampleLv = TD2_LEVEL_BY_ID.get(SAMPLE)!;
/** 战役前 n 关（各 1★）的存档 */
const cleared = (hq: number, n: number, day = 5): Profile => withTd(withHq(hq), { stars: Object.fromEntries(tdCampaign().slice(0, n).map((l) => [l.id, 1])), day, gotGold: 0, gotWood: 0 });
const tower = (id: number, kind: string, level: number, branch?: string[]): Placed => ({ id, kind: kind as Placed['kind'], level, x: 0, y: id % 20, ...(branch ? { branch } : {}) });

function cells(list: Array<{ x: number; y: number }>, size: number): string[] {
  return list.flatMap((c) => Array.from({ length: size * size }, (_, i) => `${c.x + (i % size)},${c.y + Math.floor(i / size)}`));
}

describe('战役关表和解锁', () => {
  it('战役 = TD2_LEVELS 里 td 加两位数的关，按 index 排；样板关不进战役但能打', () => {
    const list = tdCampaign();
    for (const l of list) expect(l.id).toMatch(/^td\d\d$/);
    for (let i = 1; i < list.length; i++) expect(list[i]!.index).toBeGreaterThan(list[i - 1]!.index);
    expect(list.some((l) => l.id === SAMPLE)).toBe(false);
    expect(TD2_LEVELS.some((l) => l.id === SAMPLE)).toBe(true);
    expect(tdLevelUnlocked(withHq(1), SAMPLE)).toBe(true);
    expect(tdLevelUnlocked(withHq(1), 'nope')).toBe(false);
  });
  it('第 n 关要第 n−1 关 ≥ 1★（0★ 不算，跨章也是一条线）；下一个解锁提示给还锁着的第一关', () => {
    const list = tdCampaign();
    const p = withHq(1);
    list.forEach((l, i) => expect(tdLevelUnlocked(p, l.id)).toBe(i === 0));
    for (let n = 0; n < list.length; n++) {
      const q = cleared(1, n);
      list.forEach((l, i) => expect(tdLevelUnlocked(q, l.id), `${n} ${l.id}`).toBe(i <= n));
      const next = nextTdUnlock(q);
      if (n + 1 < list.length) expect(next).toEqual({ id: list[n + 1]!.id, name: list[n + 1]!.name, after: list[n]!.id });
      else expect(next).toBeNull();
      if (n > 0) {
        const zero = withTd(q, { ...q.td!, stars: { ...q.td!.stars, [list[n - 1]!.id]: 0 } });
        expect(tdLevelUnlocked(zero, list[n]!.id)).toBe(false);
      }
    }
  });
});

describe('驻守台、基地加成、能造的塔', () => {
  it('折阶：基地 1–3 级 1 阶、4–6 级 2 阶、7–8 级 3 阶，再封顶驻守台的上限', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((l) => garrisonTier(l, 3))).toEqual([1, 1, 1, 2, 2, 2, 3, 3]);
    expect([1, 4, 8].map((l) => garrisonTier(l, 2))).toEqual([1, 2, 2]);
    expect(garrisonTier(8, 1)).toBe(1);
  });
  it('基地加成：同类塔最高等级每级 +2%，封顶 +10%', () => {
    expect([0, 1, 3, 5, 6, 8].map(baseBonusPct)).toEqual([0, 2, 6, 10, 10, 10]);
    expect(TD_BASE_BONUS.maxPct).toBe(10);
    expect(tdBaseBonus(withHq(8, [tower(101, 'cannon', 2), tower(102, 'cannon', 7), tower(103, 'flame', 1)]))).toEqual({ cannon: 10, flame: 2 });
  });
  it('选塔面板：基地里有的每种塔一项，按那种塔最高的一座折阶、带它的分叉', () => {
    const p = withHq(8, [tower(101, 'cannon', 4, ['cannon.grape']), tower(102, 'cannon', 2), tower(103, 'gunTower', 8, ['gunTower.marksman', 'gunTower.keen'])]);
    expect(tdGarrisonOptions(p, 3)).toEqual([
      { kind: 'cannon', baseLevel: 4, tier: 2, branch: ['cannon.grape'], bonusPct: 8 },
      { kind: 'gunTower', baseLevel: 8, tier: 3, branch: ['gunTower.marksman', 'gunTower.keen'], bonusPct: 10 },
    ]);
    expect(tdGarrisonOptions(p, 2).map((o) => o.tier)).toEqual([2, 2]);
    expect(tdAutoPicks(p, SAMPLE)).toEqual([{ spot: 0, kind: 'gunTower' }]);
    expect(tdAutoPicks(tdGrowthProfile(sampleLv, 'zero'), SAMPLE)).toEqual([]);
  });
  it('能造的塔 = 主寨等级到了 unlockHq 的守岛塔（不要求基地里已经造了）', () => {
    for (let hq = 1; hq <= 8; hq++) expect(tdUnlockedTowers(withHq(hq))).toEqual(TD_TOWER_KINDS.filter((k) => BUILDINGS[k].unlockHq <= hq));
    expect(tdUnlockedTowers(withHq(1)).length).toBeLessThan(tdUnlockedTowers(withHq(8)).length);
  });
});

describe('出海 startTd2', () => {
  it('关卡岛 + 驻守台（阶、分叉按存档算，不信界面）+ 基地加成 + 能造的塔；不改存档', () => {
    const p = { ...withHq(5, [tower(101, 'cannon', 8, ['cannon.pierce', 'cannon.heavy'])]), research: { hero: 3 as const } };
    const before = JSON.stringify(p);
    const r = startTd2(p, SAMPLE, 7, [{ spot: 0, kind: 'cannon' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(p)).toBe(before);
    const cap = sampleLv.garrison[0]!.cap;
    expect(r.value).toMatchObject({ seed: 7, hero: 3, mode: 'campaign', bonus: { cannon: 10 }, unlocked: tdUnlockedTowers(p) });
    expect(r.value.garrison).toEqual([{ spot: 0, kind: 'cannon', tier: garrisonTier(8, cap), branch: ['cannon.pierce', 'cannon.heavy'] }]);
    expect(r.value.layout).toEqual(sampleLv.layout);
    expect(r.value.layout).not.toBe(sampleLv.layout);
    // 规则核心把它摆上去
    const s = createTd(r.value);
    expect(s.towers.find((t) => t.garrison)).toMatchObject({ kind: 'cannon', tier: garrisonTier(8, cap) });
  });
  it('拒绝：没有这关、驻守台下标越界、同一个台挑两次、挑基地里没有的塔', () => {
    const p = withHq(5, [tower(101, 'cannon', 3)]);
    expect(startTd2(p, 'nope', 1, [])).toEqual({ ok: false, error: 'unknown' });
    expect(startTd2(p, SAMPLE, 1, [{ spot: 5, kind: 'cannon' }])).toEqual({ ok: false, error: 'bad_garrison' });
    expect(startTd2(p, SAMPLE, 1, [{ spot: 0, kind: 'cannon' }, { spot: 0, kind: 'cannon' }])).toEqual({ ok: false, error: 'bad_garrison' });
    expect(startTd2(p, SAMPLE, 1, [{ spot: 0, kind: 'flame' }])).toEqual({ ok: false, error: 'bad_garrison' });
    const empty = startTd2(p, SAMPLE, 1, []);
    expect(empty.ok && empty.value.garrison).toEqual([]);
  });
  it('没解锁的战役关拒绝（locked）', () => {
    const list = tdCampaign();
    for (let i = 1; i < list.length; i++) {
      expect(startTd2(withHq(8), list[i]!.id, 1, [])).toEqual({ ok: false, error: 'locked' });
      expect(startTd2(cleared(8, i), list[i]!.id, 1, []).ok).toBe(true);
    }
  });
});

describe('养成档位（配平用）', () => {
  it('零养成：没有防御塔、英雄 1 级；建议养成：建议主寨，能造的塔各一座在主寨等级；满养成：主寨 8 级、六种塔 8 级带分叉、英雄 8 级', () => {
    const zero = tdGrowthProfile(sampleLv, 'zero');
    const sug = tdGrowthProfile(sampleLv, 'suggest');
    const max = tdGrowthProfile(sampleLv, 'max');
    expect(tdGarrisonOptions(zero, 3)).toEqual([]);
    expect(zero.research.hero).toBe(1);
    expect(tdGarrisonOptions(sug, 3).map((o) => [o.kind, o.baseLevel])).toEqual(tdUnlockedTowers(sug).map((k) => [k, Math.min(BUILDINGS[k].maxLevel, sampleLv.hq)]));
    expect(sug.research.hero).toBe(sampleLv.hq);
    expect(tdGarrisonOptions(max, 3).map((o) => [o.kind, o.tier, o.branch.length])).toEqual(TD_TOWER_KINDS.map((k) => [k, 3, 2]));
    expect(max.research.hero).toBe(8);
    for (const l of tdCampaign()) expect(tdLevelUnlocked(zero, l.id)).toBe(true);
  });
  it('tdGrowthSetup 给出能直接跑的 setup，驻守台按推荐挑', () => {
    const r = tdGrowthSetup(SAMPLE, 'max', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.garrison).toHaveLength(sampleLv.garrison.length);
    expect(r.value.garrison![0]!.tier).toBe(sampleLv.garrison[0]!.cap);
    expect(tdGrowthSetup('nope', 'zero', 1)).toEqual({ ok: false, error: 'unknown' });
  });
});

describe('每日上限和一局奖励', () => {
  it('3★ 一局 = 同主寨等级战役关满 3★ 重打 TD_RUN_RAIDS 场的掠夺（loot 平均 × REPLAY_PCT × INCOME_PCT），取整到 10', () => {
    expect([TD_RUN_RAIDS, REPLAY_PCT, INCOME_PCT, TD_STAR_PCT, TD_CAP_RUNS]).toEqual([2, 30, { gold: 170, wood: 130 }, [0, 40, 70, 100], 6]);
    TD_RUN_REWARD.forEach((r, i) => {
      const lv = CAMPAIGN.filter((l) => l.hq === i + 1);
      for (const k of ['gold', 'wood'] as const) {
        const avg = lv.reduce((s, l) => s + l.loot[k], 0) / lv.length;
        expect(r[k]).toBe(Math.round((avg * REPLAY_PCT * INCOME_PCT[k] * TD_RUN_RAIDS) / 10000 / 10) * 10);
      }
    });
    // DESIGN 10.4 的表：改了战役掠夺或倍率，这里和文档一起改
    expect(TD_RUN_REWARD.map((r) => r.gold)).toEqual([950, 1430, 3110, 6120, 9280, 15860, 27540, 50800]);
    expect(TD_RUN_REWARD.map((r) => r.wood)).toEqual([440, 550, 1190, 2280, 3510, 5110, 8420, 15530]);
  });
  it('每日上限 = 当前主寨等级 3★ 一局 × TD_CAP_RUNS', () => {
    for (let hq = 1; hq <= 8; hq++) {
      const r = TD_RUN_REWARD[hq - 1]!;
      expect(tdDailyCap(withHq(hq))).toEqual({ gold: r.gold * TD_CAP_RUNS, wood: r.wood * TD_CAP_RUNS });
    }
  });
  it('一局奖励按星数折（40% / 70% / 100%），0★ 不给；按关卡的建议主寨等级取', () => {
    expect(tdRunReward({ hq: 2 }, 0)).toEqual({ gold: 0, wood: 0 });
    expect(tdRunReward({ hq: 2 }, 3)).toEqual(TD_RUN_REWARD[1]);
    expect(tdRunReward({ hq: 2 }, 1).gold).toBe(Math.floor((1430 * 40) / 100));
    expect(tdRunReward({ hq: 2 }, 2).gold).toBe(Math.floor((1430 * 70) / 100));
    for (const l of [...tdCampaign(), sampleLv]) expect(tdRunReward(l, 3)).toEqual(TD_RUN_REWARD[l.hq - 1]);
  });
});

describe('结算 settleTd', () => {
  const hq = sampleLv.hq;
  const full = tdRunReward(sampleLv, 3);
  it('第一局：按星数给金币木材，另有首次拿星的奖励（每颗新星 × 关卡建议主寨等级），记星数和当天已拿', () => {
    const p = roomy(2);
    const r = settleTd(p, SAMPLE, res(2), 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { profile, reward } = r.value;
    const two = tdRunReward(sampleLv, 2);
    expect(reward).toMatchObject({ gold: two.gold, wood: two.wood, newStars: 2, capped: false, full: false, unlocked: null });
    expect(reward.bonusGold).toBe(2 * hq * TD_BONUS_PER_STAR.gold);
    expect(reward.bonusWood).toBe(2 * hq * TD_BONUS_PER_STAR.wood);
    expect(reward.next).toEqual(nextTdUnlock(profile));
    expect(profile.res.gold).toBe(p.res.gold + reward.gold + reward.bonusGold);
    expect(profile.res.wood).toBe(p.res.wood + reward.wood + reward.bonusWood);
    expect(profile.td).toEqual({ stars: { [SAMPLE]: 2 }, day: 10, gotGold: two.gold, gotWood: two.wood });
    expect(p.td).toBeUndefined();
  });
  it('再打：没有新星就没有首次奖励；星数只升不降', () => {
    const a = settleTd(roomy(2), SAMPLE, res(3), 10);
    if (!a.ok) throw new Error('settle');
    const b = settleTd(a.value.profile, SAMPLE, res(1), 10);
    if (!b.ok) throw new Error('settle');
    expect(b.value.reward.newStars).toBe(0);
    expect(b.value.reward.bonusGold + b.value.reward.bonusWood).toBe(0);
    expect(b.value.reward.gold).toBe(tdRunReward(sampleLv, 1).gold);
    expect(b.value.profile.td!.stars[SAMPLE]).toBe(3);
  });
  it('0★ 不给资源，只记 0 星', () => {
    const r = settleTd(roomy(2), SAMPLE, res(0), 3);
    if (!r.ok) throw new Error('settle');
    expect(r.value.reward).toMatchObject({ gold: 0, wood: 0, bonusGold: 0, bonusWood: 0, newStars: 0, unlocked: null });
    expect(r.value.profile.res).toEqual(roomy(2).res);
    expect(r.value.profile.td!.stars[SAMPLE]).toBe(0);
  });
  it('上限边界：差一点满就只给剩下的；刚好满之后只拿星、不拿资源；首次星奖励照给、不计入上限', () => {
    const cap = tdDailyCap(roomy(2));
    const near = withTd(roomy(2), { stars: {}, day: 4, gotGold: cap.gold - 30, gotWood: cap.wood - 100 });
    const a = settleTd(near, SAMPLE, res(3), 4);
    if (!a.ok) throw new Error('settle');
    expect(a.value.reward.gold).toBe(30);
    expect(a.value.reward.wood).toBe(Math.min(100, full.wood));
    expect(a.value.reward.capped).toBe(true);
    expect(a.value.profile.td!.gotGold).toBe(cap.gold);
    expect(a.value.reward.bonusGold).toBe(3 * hq * TD_BONUS_PER_STAR.gold);
    const b = settleTd(a.value.profile, SAMPLE, res(3), 4);
    if (!b.ok) throw new Error('settle');
    expect(b.value.reward.gold).toBe(0);
    expect(b.value.reward.capped).toBe(true);
    expect(b.value.reward.newStars).toBe(0);
    expect(b.value.profile.res.gold).toBe(a.value.profile.res.gold);
  });
  it('换天（dayIndex 变了）当天已拿清零；主寨升级后上限跟着涨', () => {
    const cap2 = tdDailyCap(roomy(2));
    const fullDay = withTd(roomy(2), { stars: { [SAMPLE]: 3 }, day: 9, gotGold: cap2.gold, gotWood: cap2.wood });
    const same = settleTd(fullDay, SAMPLE, res(3), 9);
    const next = settleTd(fullDay, SAMPLE, res(3), 10);
    if (!same.ok || !next.ok) throw new Error('settle');
    expect(same.value.reward.gold).toBe(0);
    expect(next.value.reward.gold).toBe(full.gold);
    expect(next.value.profile.td).toMatchObject({ day: 10, gotGold: full.gold });
    const up = withTd(roomy(3), { stars: { [SAMPLE]: 3 }, day: 9, gotGold: cap2.gold, gotWood: cap2.wood });
    const r = settleTd(up, SAMPLE, res(3), 9);
    if (!r.ok) throw new Error('settle');
    expect(r.value.reward.gold).toBe(full.gold); // 3 级上限比 2 级高出一局以上
  });
  it('仓库装不下：先装首次星奖励，本局奖励截到装满为止，full；截掉的不计入当天已拿，资源不超过仓库', () => {
    const p0 = withHq(2);
    const room = capacity(p0);
    const p = { ...p0, res: { gold: room.gold - 700, wood: room.wood - 10 } };
    const r = settleTd(p, SAMPLE, res(3), 7);
    if (!r.ok) throw new Error('settle');
    const { reward, profile } = r.value;
    expect(reward.bonusGold).toBe(3 * hq * TD_BONUS_PER_STAR.gold);
    expect(reward.gold).toBe(700 - reward.bonusGold);
    expect(reward.bonusWood).toBe(10);
    expect(reward.wood).toBe(0);
    expect(reward).toMatchObject({ full: true, capped: false });
    expect(profile.res).toEqual(room);
    expect(profile.td).toMatchObject({ gotGold: reward.gold, gotWood: 0 });
    const again = settleTd(profile, SAMPLE, res(3), 7);
    if (!again.ok) throw new Error('settle');
    expect(again.value.reward).toMatchObject({ gold: 0, wood: 0, full: true });
    expect(again.value.profile.res).toEqual(room);
  });
  it('拒绝：没有这关、没打完、天数不对；没解锁的战役关', () => {
    expect(settleTd(withHq(8), 'nope', res(3), 1)).toEqual({ ok: false, error: 'unknown' });
    expect(settleTd(roomy(2), SAMPLE, res(3, false), 1)).toEqual({ ok: false, error: 'not_over' });
    expect(settleTd(roomy(2), SAMPLE, res(3), -1)).toEqual({ ok: false, error: 'bad_day' });
    expect(settleTd(roomy(2), SAMPLE, res(3), 1.5)).toEqual({ ok: false, error: 'bad_day' });
    const list = tdCampaign();
    if (list.length > 1) expect(settleTd(withHq(8), list[1]!.id, res(3), 1)).toEqual({ ok: false, error: 'locked' });
  });
  it('战役关打出第一颗星：解锁下一关', () => {
    const list = tdCampaign();
    for (let i = 0; i + 1 < list.length; i++) {
      const r = settleTd(cleared(8, i), list[i]!.id, res(1), 5);
      if (!r.ok) throw new Error('settle');
      expect(r.value.reward.unlocked).toBe(list[i + 1]!.id);
    }
    if (list.length > 0) {
      const last = settleTd(cleared(8, list.length - 1), list.at(-1)!.id, res(1), 5);
      if (!last.ok) throw new Error('settle');
      expect(last.value.reward.unlocked).toBeNull();
      expect(last.value.reward.next).toBeNull();
    }
  });
});

describe('候选位置摆放（海盗来袭用）：避开建筑、不重叠、确定性', () => {
  const level: TdPlacedLevel = {
    id: 'home', name: 'home', hq: 3, hpPct: 100, gold: 0, first: 0, waveTicks: 300, lanes: TD2_HOME.lanes.map((l) => ({ ...l })), waves: [],
    kegs: TD2_HOME.kegs.map((k) => ({ ...k })), obstacles: [], slots: TD2_HOME.slots.map((s) => ({ ...s })),
    place: { slots: TD2_HOME.slots.length, kegs: TD2_HOME.kegs.length, wrecks: 0, barrels: 0 },
  };
  const layouts: Array<[string, Placed[]]> = [
    ['新档', newProfile().base.buildings],
    ['满养成', tdGrowthProfile({ hq: 8 }, 'max').base.buildings],
  ];
  for (const [name, layout] of layouts) {
    it(`${name}：木台、火药桶不压建筑也不互压，数量不超过要的，引擎一个不丢`, () => {
      const placed = placeTdLevel(level, layout, 0);
      const own = layout.flatMap((b) => cells([b], BUILDINGS[b.kind].size));
      const mine = [...cells(placed.slots, 2), ...cells(placed.kegs, 1)];
      expect(new Set(mine).size).toBe(mine.length);
      for (const c of mine) expect(own).not.toContain(c);
      for (const c of [...placed.slots, ...placed.kegs]) expect(c.x >= 0 && c.y >= 0 && c.x < ISLAND && c.y < ISLAND).toBe(true);
      expect(placed.slots.length).toBe(level.place.slots);
      expect(placeTdLevel(level, layout, 0)).toEqual(placed);
      const s = createTd({ layout, level: placed, hero: 1, seed: 1, rules: RULES_VERSION, mode: 'campaign' });
      expect(s.slots).toHaveLength(placed.slots.length);
      expect(s.kegs).toHaveLength(placed.kegs.length);
    });
  }
  it('岛上没地方：少摆、不重叠、不抛错', () => {
    const full: Placed[] = [];
    for (let x = 0; x < ISLAND; x += 3) for (let y = 0; y < ISLAND; y += 3) full.push({ id: full.length + 1, kind: 'goldmine', level: 1, x: Math.min(x, ISLAND - 3), y: Math.min(y, ISLAND - 3) });
    const placed = placeTdLevel(level, full, 0);
    expect(placed.slots.length).toBe(0);
    const own = new Set(full.flatMap((b) => cells([b], 3)));
    for (const c of cells(placed.kegs, 1)) expect(own.has(c)).toBe(false);
  });
  it('没写 place 的关原样返回（战役关卡岛不挪）', () => {
    expect(placeTdLevel(sampleLv, newProfile().base.buildings, 0)).toBe(sampleLv);
  });
});

describe('reviveSave：守岛进度', () => {
  const wrap = (p: Profile): unknown => JSON.parse(JSON.stringify({ profile: p, lastSeen: 5 }));
  it('好档原样认回；旧档没有 td 字段就不补', () => {
    const p = withTd(withHq(3), { stars: { td01: 1, td02: 3 }, day: 8, gotGold: 0, gotWood: 0 });
    expect(reviveSave(wrap(p))!.profile.td).toEqual(p.td);
    expect(reviveSave(wrap(withHq(1)))!.profile.td).toBeUndefined();
  });
  it('只留认识的关、0..3 的整数星数；天数和已拿的资源收回合法范围', () => {
    const raw = wrap(withHq(2)) as { profile: { td?: unknown } };
    raw.profile.td = { stars: { td01: 3, td02: 4, td03: 1.5, tdt1: 2, toString: 1, td04: '3' }, day: -3, gotGold: 99999, gotWood: -5 };
    const td = reviveSave(raw)!.profile.td!;
    expect(td.stars).toEqual({ td01: 3 });
    expect(td.day).toBe(0);
    expect(td.gotGold).toBe(tdDailyCap(withHq(2)).gold);
    expect(td.gotWood).toBe(0);
  });
  it('td 形状不对：丢掉', () => {
    for (const bad of [null, 5, 'x', [1]]) {
      const raw = wrap(withHq(2)) as { profile: { td?: unknown } };
      raw.profile.td = bad;
      expect(reviveSave(raw)!.profile.td).toBeUndefined();
    }
    const raw = wrap(withHq(2)) as { profile: { td?: unknown } };
    raw.profile.td = { stars: 7, day: 'a', gotGold: NaN, gotWood: null };
    expect(reviveSave(raw)!.profile.td).toEqual({ stars: {}, day: 0, gotGold: 0, gotWood: 0 });
  });
});
