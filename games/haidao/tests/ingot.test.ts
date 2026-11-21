import { describe, expect, it } from 'vitest';
import { INGOT_EARN } from '../src/content/livetable.ts';
import { newProfile } from '../src/core/base.ts';
import { shopGrant } from '../src/core/live.ts';
import { claimIngot, ingotBalance, ingotEarned, ingotOwed, refundIngot, spendIngot } from '../src/core/ingot.ts';
import type { Profile } from '../src/core/types.ts';
import { mergeSave, reviveSave } from '../src/platform/sync.ts';

/** 金银锭（core/ingot.ts）：挣的从存档算，存档只记领了多少、换掉多少；筹码装饰（core/live.ts 的 shopGrant） */
function rich(): Profile {
  const p = newProfile();
  return {
    ...p,
    stars: { c01: 3, c02: 2, c03: 3 },
    td: { stars: { td01: 3 }, day: 0, gotGold: 0, gotWood: 0 },
    escort: { stars: { 'strait-easy': 3, 'bays-easy': 1 } },
    train: { done: ['t-sailor', 't-gunner'] },
    achievements: ['first_win'],
    stats: { ...p.stats, dailyDone: 2 },
  };
}

describe('金银锭', () => {
  it('挣的 = 三星关数（战役、守岛、护航）+ 训练营过的关 + 成就 + 每日悬赏次数，按 INGOT_EARN 计', () => {
    expect(ingotEarned(newProfile())).toBe(0);
    expect(ingotEarned(rich())).toBe(4 * INGOT_EARN.threeStar + 2 * INGOT_EARN.train + 1 * INGOT_EARN.badge + 2 * INGOT_EARN.daily);
  });
  it('领：待领全部进手里，再领没有；新挣的又成了待领', () => {
    const a = claimIngot(rich());
    expect(a.got).toBe(ingotEarned(rich()));
    expect(ingotBalance(a.profile)).toBe(a.got);
    expect(claimIngot(a.profile).got).toBe(0);
    const more = { ...a.profile, achievements: [...a.profile.achievements, 'second'] };
    expect(ingotOwed(more)).toBe(INGOT_EARN.badge);
  });
  it('换：不能超过手里的、要正整数；退回不会退到负的', () => {
    const p = claimIngot(rich()).profile;
    const have = ingotBalance(p);
    expect(spendIngot(p, have + 1)).toEqual({ ok: false, error: 'no_ingot' });
    expect(spendIngot(p, 0).ok).toBe(false);
    expect(spendIngot(p, 1.5).ok).toBe(false);
    const s = spendIngot(p, 3);
    expect(s.ok && ingotBalance(s.value)).toBe(have - 3);
    if (!s.ok) return;
    expect(ingotBalance(refundIngot(s.value, 2))).toBe(have - 1);
    expect(ingotBalance(refundIngot(s.value, 99))).toBe(have);
    // 换掉的锭不会变回待领
    expect(ingotOwed(s.value)).toBe(0);
  });
  it('读档：领的不超过挣的，换掉的不超过领的；坏值不写', () => {
    const p = rich();
    const earned = ingotEarned(p);
    const load = (ingot: unknown): Profile['ingot'] => reviveSave({ profile: { ...p, ingot }, lastSeen: 1 })?.profile.ingot;
    expect(load({ claimed: 999, spent: 2 })).toEqual({ claimed: earned, spent: 2 });
    expect(load({ claimed: 3, spent: 99 })).toEqual({ claimed: 3, spent: 3 });
    expect(load({ claimed: 'x', spent: 1 })).toBeUndefined();
  });
  it('云同步：别的进度都一样时留换得多的那份（旧档盖回来会把同一批锭再换一次）', () => {
    const a = { profile: { ...rich(), ingot: { claimed: 10, spent: 5 } }, lastSeen: 1 };
    const b = { profile: { ...rich(), ingot: { claimed: 10, spent: 0 } }, lastSeen: 9 };
    expect(mergeSave(b, a)).toBe(a);
    expect(mergeSave(a, b)).toBe(a);
  });
});

describe('筹码装饰', () => {
  it('shopGrant：价目表里的才加，已经有的不重复加', () => {
    const p = newProfile();
    const a = shopGrant(p, 'deco:statue');
    expect(a.cosmetics).toEqual(['deco:statue']);
    expect(shopGrant(a, 'deco:statue')).toBe(a);
    expect(shopGrant(p, 'deco:windmill')).toBe(p);
  });
});

