import { describe, expect, it } from 'vitest';
import { ESCORT_LEVELS } from '../src/content/index.ts';
import { escortRunReward, escortSetup, escortUnlocked, settleEscort, settleTd, tdDailyCap, TD_BONUS_PER_STAR } from '../src/core/index.ts';
import { newProfile } from '../src/core/base.ts';
import type { TdResult } from '../src/core/index.ts';
import type { Profile } from '../src/core/types.ts';

const res = (stars: number): TdResult => ({ over: true, stars, lost: 0, waves: 10, total: 10, ticks: 3000, goldEarned: 500 });

/** 主寨 8 级的档：每日上限有余量，方便看出差别 */
const rich = (): Profile => {
  const p = newProfile();
  return { ...p, base: { ...p.base, buildings: p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: 8 } : b)) } };
};
const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('escortSetup', () => {
  it('护航模式、全部塔开放、不读存档', () => {
    const s = escortSetup('strait-normal', 7);
    expect(s.mode).toBe('escort');
    expect(s.seed).toBe(7);
    expect(s.unlocked).toHaveLength(6);
    expect(s.level.escort).toBeDefined();
    expect(s.layout.some((b) => b.kind === 'treasure')).toBe(false);
    expect(() => escortSetup('nope', 1)).toThrow();
  });
});

describe('escortUnlocked', () => {
  it('第一张图三档开；后面的图要前一张任一难度 ≥ 1★', () => {
    let p = newProfile();
    for (const d of ['easy', 'normal', 'hard']) expect(escortUnlocked(p, `strait-${d}`)).toBe(true);
    expect(escortUnlocked(p, 'bays-easy')).toBe(false);
    expect(escortUnlocked(p, 'cape-easy')).toBe(false);
    expect(escortUnlocked(p, 'nope')).toBe(false);
    p = { ...p, escort: { stars: { 'strait-hard': 1 } } };
    expect(escortUnlocked(p, 'bays-hard')).toBe(true);
    expect(escortUnlocked(p, 'cape-easy')).toBe(false);
    p = { ...p, escort: { stars: { 'strait-hard': 1, 'bays-easy': 0 } } };
    expect(escortUnlocked(p, 'cape-easy')).toBe(false);
  });

  it('没解锁的关结算回 locked，没打完回 not_over', () => {
    const p = rich();
    const r = settleEscort(p, 'bays-easy', res(2), 5);
    expect(r).toEqual({ ok: false, error: 'locked' });
    expect(settleEscort(p, 'strait-easy', { ...res(2), over: false }, 5)).toEqual({ ok: false, error: 'not_over' });
    expect(settleEscort(p, 'zzz', res(2), 5)).toEqual({ ok: false, error: 'unknown' });
  });
});

describe('settleEscort', () => {
  it('写最高星、不覆盖更高的；给资源；解锁下一张图', () => {
    const p = rich();
    const a = ok(settleEscort(p, 'strait-easy', res(2), 5));
    expect(a.profile.escort!.stars['strait-easy']).toBe(2);
    expect(a.reward.newStars).toBe(2);
    expect(a.reward.unlocked).toBe('bays-easy');
    expect(a.profile.res.gold).toBeGreaterThan(p.res.gold);
    const lv = ESCORT_LEVELS.find((l) => l.id === 'strait-easy')!;
    expect(a.reward.gold).toBe(escortRunReward(lv, 2).gold);
    // 护航不跟守岛的战役掠夺表：3★ = 建议主寨等级下全部金矿 / 伐木场 15 分钟的产量
    expect(escortRunReward({ hq: 2 }, 3)).toEqual({ gold: Math.floor((2 * 340 * 100) / 400), wood: Math.floor((2 * 208 * 100) / 400) });
    const b = ok(settleEscort(a.profile, 'strait-easy', res(1), 5));
    expect(b.profile.escort!.stars['strait-easy']).toBe(2);
    expect(b.reward.newStars).toBe(0);
    expect(b.reward.unlocked).toBeNull();
    expect(p.escort).toBeUndefined();
  });

  it('0 星也记一次（星为 0），不给首次奖励', () => {
    const r = ok(settleEscort(rich(), 'strait-easy', res(0), 5));
    expect(r.profile.escort!.stars['strait-easy']).toBe(0);
    expect(r.reward.bonusGold).toBe(0);
    expect(r.reward.unlocked).toBeNull();
  });

  it('首次拿星的奖励另算，同一关重复打不重复给', () => {
    const p = rich();
    const a = ok(settleEscort(p, 'strait-normal', res(3), 5));
    const lv = ESCORT_LEVELS.find((l) => l.id === 'strait-normal')!;
    expect(a.reward.bonusGold).toBe(3 * lv.hq * TD_BONUS_PER_STAR.gold);
    const b = ok(settleEscort(a.profile, 'strait-normal', res(3), 5));
    expect(b.reward.bonusGold).toBe(0);
    expect(b.reward.bonusWood).toBe(0);
  });

  it('不碰守岛的星和战役星', () => {
    const p = rich();
    const a = ok(settleEscort(p, 'strait-easy', res(3), 5));
    expect(a.profile.stars).toEqual(p.stars);
    expect(a.profile.td!.stars).toEqual({});
  });
});

describe('每日上限和守岛共用', () => {
  // 把一天的上限先用掉大半，再让对方只能拿到剩下的
  const nearCap = (p: Profile, day: number): Profile => {
    const cap = tdDailyCap(p);
    return { ...p, td: { stars: {}, day, gotGold: cap.gold - 1, gotWood: cap.wood - 1 } };
  };

  it('先守岛拿满：护航不再给资源，只记星', () => {
    const p = rich();
    const cap = tdDailyCap(p);
    const full: Profile = { ...p, td: { stars: { td01: 1 }, day: 9, gotGold: cap.gold, gotWood: cap.wood } };
    const r = ok(settleEscort(full, 'strait-easy', res(2), 9));
    expect(r.reward.gold).toBe(0);
    expect(r.reward.wood).toBe(0);
    expect(r.reward.capped).toBe(true);
    expect(r.profile.escort!.stars['strait-easy']).toBe(2);
    expect(r.profile.td!.gotGold).toBe(cap.gold);
  });

  it('只剩 1 点额度：护航只给 1 点', () => {
    const r = ok(settleEscort(nearCap(rich(), 9), 'strait-easy', res(3), 9));
    expect(r.reward.gold).toBe(1);
    expect(r.reward.wood).toBe(1);
    expect(r.reward.capped).toBe(true);
  });

  it('先护航拿满：守岛同一天也不再给资源', () => {
    const p = rich();
    const cap = tdDailyCap(p);
    const full: Profile = { ...p, td: { stars: {}, day: 9, gotGold: cap.gold, gotWood: cap.wood }, escort: { stars: { 'strait-easy': 1 } } };
    const r = ok(settleTd(full, 'td01', res(2), 9));
    expect(r.reward.gold).toBe(0);
    expect(r.reward.capped).toBe(true);
    // 护航的星数还在
    expect(r.profile.escort!.stars['strait-easy']).toBe(1);
  });

  it('护航真的会累计到守岛的计数里，再被守岛读到', () => {
    const p = rich();
    const a = ok(settleEscort(p, 'strait-easy', res(3), 9));
    expect(a.profile.td!.gotGold).toBe(a.reward.gold);
    const t = ok(settleTd(a.profile, 'td01', res(3), 9));
    expect(t.profile.td!.gotGold).toBe(a.reward.gold + t.reward.gold);
    expect(t.profile.escort).toEqual(a.profile.escort);
  });

  it('换天重置', () => {
    const p = rich();
    const cap = tdDailyCap(p);
    const full: Profile = { ...p, td: { stars: {}, day: 9, gotGold: cap.gold, gotWood: cap.wood } };
    const r = ok(settleEscort(full, 'strait-easy', res(2), 10));
    expect(r.reward.gold).toBeGreaterThan(0);
    expect(r.profile.td!.day).toBe(10);
    expect(r.profile.td!.gotGold).toBe(r.reward.gold);
  });
});
