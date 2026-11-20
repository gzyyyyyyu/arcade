import { describe, expect, it } from 'vitest';
import {
  RANKS, armyFor, botActions, dailyBounty, donateRank, heroCap, heroLevel, rankLeft, rankOf, researchHero,
} from '../src/core/index.ts';
import type { Profile } from '../src/core/index.ts';
import { pvpSnapshot } from '../src/core/tdbase.ts';
import { raidSetup, replayRaid } from '../src/core/pvp.ts';
import { validateBase } from '../src/core/validate.ts';
import { liveSetup } from '../src/core/live.ts';
import { tdLiveSetup } from '../src/core/tdlive.ts';
import { reviveSave } from '../src/platform/sync.ts';
import { fullBase, sampleArmy } from '../tools/sample.ts';

/**
 * 海盗王阶和 9–12 级英雄研究（DESIGN 2.6、10.4）：所有者定"只给外观和展示，绝不加战力；攻防和悬赏里看到的岛，战力和以前逐位一致"。
 * 这里锁住：满 10 阶、攒了一半、英雄研究到 12 的岛，和同一座岛没有王阶、英雄 8 级时，进攻的 setup 和整场回放逐位一样；
 * 悬赏（每日悬赏、悬赏出海、悬赏守岛）的岛不看王阶。
 */
// fullBase(8) 的摆法会重叠、过不了校验：用满配的 7 级岛把主寨升到 8 级
const hq8 = (): Profile => {
  const p = fullBase(7, 'trap', true);
  return { ...p, base: { ...p.base, buildings: p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: 8 } : b)) }, research: { ...p.research, hero: 8 } };
};
const kingly = (p: Profile): Profile => ({ ...p, rank: RANKS.length, rankFund: { gold: 1, wood: 1 }, research: { ...p.research, hero: 12 } });

describe('海盗王阶不加战力', () => {
  it('攻防：王阶满、英雄 12 级的岛，快照校验后进攻的 setup 和回放和以前逐位一样', () => {
    const plain = hq8();
    const king = kingly(plain);
    const vp = validateBase(pvpSnapshot(plain));
    const vk = validateBase(pvpSnapshot(king));
    if (!vp.ok || !vk.ok) throw new Error('快照被拒');
    expect(vk.value.rank).toBe(RANKS.length);
    expect(vk.value).not.toHaveProperty('rankFund');
    expect(heroLevel(vk.value)).toBe(12);
    for (const seed of [1, 2, 3]) {
      const a = raidSetup(vp.value.base.buildings, 0, sampleArmy(8), seed, heroLevel(vp.value));
      const b = raidSetup(vk.value.base.buildings, 0, sampleArmy(8), seed, heroLevel(vk.value));
      expect(b).toEqual(a);
      const acts = botActions(a, 'normal');
      const ra = replayRaid(a, acts);
      const rb = replayRaid(b, acts);
      expect([rb.fingerprint, rb.result.stars, rb.result.destroyedPct]).toEqual([ra.fingerprint, ra.result.stars, ra.result.destroyedPct]);
    }
  }, 60_000);
  it('进攻方：王阶和英雄研究不改带出去的部队', () => {
    const p = hq8();
    expect(armyFor(kingly(p))).toEqual(armyFor(p));
  });
  it('悬赏：每日悬赏的岛不看王阶；悬赏出海、悬赏守岛只由档位和种子决定', () => {
    const p = hq8();
    for (const day of [20000, 20001, 20002]) expect(dailyBounty(day, kingly(p))).toEqual(dailyBounty(day, p));
    expect(liveSetup.length).toBe(2);
    expect(tdLiveSetup.length).toBe(2);
  });
});

describe('海盗王阶：献上', () => {
  it('主寨 8 级才开；分几次献满升一阶，献多了不收', () => {
    const lv7 = { ...fullBase(7, 'trap', true), res: { gold: 90000, wood: 90000 } };
    expect(donateRank(lv7)).toEqual({ ok: false, error: 'locked' });
    const c = RANKS[0]!.cost;
    let p: Profile = { ...hq8(), res: { gold: c.gold - 1000, wood: 160000 } };
    const a = donateRank(p);
    if (!a.ok) throw new Error(a.error);
    expect(a.value.ranked).toBe(false);
    expect(a.value.profile.rankFund).toEqual({ gold: c.gold - 1000, wood: c.wood });
    expect(a.value.profile.res).toEqual({ gold: 0, wood: 160000 - c.wood });
    expect(rankLeft(a.value.profile)).toEqual({ gold: 1000, wood: 0 });
    expect(donateRank(a.value.profile)).toEqual({ ok: false, error: 'nothing' });
    p = { ...a.value.profile, res: { gold: 5000, wood: 0 } };
    const b = donateRank(p);
    if (!b.ok) throw new Error(b.error);
    expect(b.value.ranked).toBe(true);
    expect(rankOf(b.value.profile)).toBe(1);
    expect(b.value.profile).not.toHaveProperty('rankFund');
    expect(b.value.profile.res.gold).toBe(4000);
  });
  it('只献一部分（want）；满 10 阶回 max', () => {
    const p = { ...hq8(), res: { gold: 100000, wood: 100000 } };
    const r = donateRank(p, { gold: 300, wood: 0 });
    expect(r.ok && r.value.profile.rankFund).toEqual({ gold: 300, wood: 0 });
    expect(donateRank({ ...p, rank: RANKS.length })).toEqual({ ok: false, error: 'max' });
    expect(rankLeft({ ...p, rank: RANKS.length })).toBeNull();
  });
  it('十阶合计约 14 天收入：218.3 万金币、82 万木材；后几阶比 8 级仓库还贵所以要分次献', () => {
    const sum = RANKS.reduce((a, r) => ({ gold: a.gold + r.cost.gold, wood: a.wood + r.cost.wood }), { gold: 0, wood: 0 });
    expect(sum).toEqual({ gold: 2_183_000, wood: 820_000 });
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.cost.gold).toBeGreaterThan(RANKS[i - 1]!.cost.gold);
  });
  it('存档：王阶 0..10、攒的不超过下一阶的价，坏值丢掉', () => {
    const p = { ...hq8(), rank: 3, rankFund: { gold: 999_999_999, wood: 12 } };
    const s = reviveSave({ profile: p, lastSeen: 0 });
    expect(s?.profile.rank).toBe(3);
    expect(s?.profile.rankFund).toEqual({ gold: RANKS[3]!.cost.gold - 1, wood: 12 });
    expect(reviveSave({ profile: { ...p, rank: 11 }, lastSeen: 0 })?.profile.rank).toBeUndefined();
    const v = validateBase({ ...fullBase(7, 'trap', true), rank: 2 });
    expect(v.ok && v.value.rank).toBeUndefined();
  });
});

describe('英雄研究上限', () => {
  it('主寨 8 级前封顶主寨等级，8 级后到 12；校验跟着走', () => {
    expect([1, 5, 7, 8].map(heroCap)).toEqual([1, 5, 7, 12]);
    let p: Profile = { ...hq8(), res: { gold: 0, wood: 162000 } };
    for (let i = 0; i < 4; i++) {
      const r = researchHero(p);
      if (!r.ok) throw new Error(r.error);
      p = r.value;
    }
    expect(p.research.hero).toBe(12);
    expect(p.res.wood).toBe(162000 - 300 * (64 + 81 + 100 + 121));
    expect(researchHero(p)).toEqual({ ok: false, error: 'max' });
    const v7 = { ...fullBase(7, 'trap', true) };
    v7.research = { ...v7.research, hero: 8 };
    expect(validateBase(v7).ok).toBe(false);
    expect(validateBase(pvpSnapshot(p)).ok).toBe(true);
  });
});
