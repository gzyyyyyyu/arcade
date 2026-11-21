import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_CHAR_BP, LIVE_COMBO_BP, LIVE_MAP_BP, LIVE_MAX_BP, shapeBp, LIVE_TIER_IDS, LIVE_TIERS, vigilBp } from '../../src/content/live.ts';
import { RAID_LIVE } from '../../src/content/explore.ts';
import { liveBp } from '../../src/explore/settle.ts';
import { World } from '../../src/core/state.ts';
import { MAP_IDS } from '../../src/content/maps.ts';
import { LIVE_KEY, LiveClient, liveSetup, reviveLive } from '../../src/platform/live.ts';

const SAMPLES: [number, boolean, boolean][] = [[0, false, false], [4_000, false, false], [9_000, false, false], [20_000, false, false], [27_000, true, false], [27_000, true, true]];

/** 测试里临时改系数表，用完还原 */
const saved = { char: structuredClone(LIVE_CHAR_BP), map: structuredClone(LIVE_MAP_BP), combo: structuredClone(LIVE_COMBO_BP), raid: structuredClone(RAID_LIVE.charBp) };
const restore = (t: Record<string, unknown>, from: Record<string, unknown>): void => {
  for (const k of Object.keys(t)) delete t[k];
  Object.assign(t, structuredClone(from));
};
afterEach(() => {
  restore(LIVE_CHAR_BP, saved.char);
  restore(LIVE_MAP_BP, saved.map);
  restore(LIVE_COMBO_BP, saved.combo);
  restore(RAID_LIVE.charBp, saved.raid);
});
const clearAll = (): void => {
  restore(LIVE_CHAR_BP, {});
  restore(LIVE_MAP_BP, {});
  restore(LIVE_COMBO_BP, {});
  restore(RAID_LIVE.charBp, {});
};

describe('实盘选角色、地图：vigilBp', () => {
  it('不传角色、地图 = 小道士、雪原；小道士、雪原是基准，不在角色、地图系数表里', () => {
    expect(LIVE_CHAR_BP.xiaodao).toBeUndefined();
    expect(LIVE_MAP_BP.snow).toBeUndefined();
    for (const t of LIVE_TIER_IDS) for (const [ticks, won, boss] of SAMPLES) expect(vigilBp(t, ticks, won, boss)).toBe(vigilBp(t, ticks, won, boss, 'xiaodao', 'snow'));
  });
  it('系数都在合理范围（0.5–2.5 倍），按档写', () => {
    for (const tbl of [LIVE_CHAR_BP, LIVE_MAP_BP])
      for (const per of Object.values(tbl))
        for (const [t, c] of Object.entries(per!)) {
          expect(LIVE_TIER_IDS).toContain(t);
          expect(c).toBeGreaterThanOrEqual(5_000);
          expect(c).toBeLessThanOrEqual(25_000);
        }
  });
  it('系数乘在这一档的天亮倍数上，中途倒下按同一比例，尸王的加成不缩放，结果始终封顶', () => {
    clearAll();
    LIVE_CHAR_BP.pang = { medium: 9_000 };
    LIVE_MAP_BP.riverbank = { medium: 11_000 };
    const { dawnBp: dawn, bossAdd } = LIVE_TIERS.medium;
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'icelake')).toBe(Math.floor((dawn * 9_000) / 10_000));
    expect(vigilBp('medium', 27_000, true, false, 'xiaodao', 'riverbank')).toBe(Math.floor((dawn * 11_000) / 10_000));
    expect(vigilBp('medium', 27_000, true, true, 'pang', 'icelake')).toBe(Math.floor((dawn * 9_000) / 10_000) + bossAdd);
    expect(vigilBp('medium', 18_000, false, false, 'pang', 'icelake')).toBeLessThan(vigilBp('medium', 18_000, false, false, 'xiaodao', 'icelake'));
    // 别的档不受影响
    expect(vigilBp('large', 27_000, true, false, 'pang', 'guishi')).toBe(vigilBp('large', 27_000, true, false, 'xiaodao', 'guishi'));
    // 系数大到超过上限：天亮、尸王、中途都封顶
    LIVE_MAP_BP.riverbank = { medium: 25_000 };
    LIVE_CHAR_BP.pang = { medium: 25_000 };
    for (const [ticks, won, boss] of SAMPLES) expect(vigilBp('medium', ticks, won, boss, 'pang', 'riverbank')).toBeLessThanOrEqual(LIVE_MAX_BP);
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'riverbank')).toBe(LIVE_MAX_BP);
  });
  it('组合系数替换角色 × 地图的乘积，只管写了的那一档；系数在合理范围', () => {
    clearAll();
    LIVE_CHAR_BP.pang = { medium: 9_000 };
    LIVE_MAP_BP.riverbank = { medium: 14_000 };
    const { dawnBp: dawn, bossAdd } = LIVE_TIERS.medium;
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'riverbank')).toBe(Math.floor((Math.floor((dawn * 9_000) / 10_000) * 14_000) / 10_000));
    LIVE_COMBO_BP.pang = { riverbank: { medium: 10_000 } };
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'riverbank')).toBe(dawn);
    // 尸王加成不缩放，别的档、别的地图、别的角色仍按乘积
    expect(vigilBp('medium', 27_000, true, true, 'pang', 'riverbank')).toBe(dawn + bossAdd);
    expect(vigilBp('large', 27_000, true, false, 'pang', 'guishi')).toBe(vigilBp('large', 27_000, true, false, 'xiaodao', 'guishi'));
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'icelake')).toBe(Math.floor((dawn * 9_000) / 10_000));
    expect(vigilBp('medium', 27_000, true, false, 'xiaodao', 'riverbank')).toBe(Math.floor((dawn * 14_000) / 10_000));
    for (const per of Object.values(saved.combo))
      for (const maps of Object.values(per!))
        for (const [t, c] of Object.entries(maps!)) {
          expect(LIVE_TIER_IDS).toContain(t);
          expect(c).toBeGreaterThanOrEqual(5_000);
          expect(c).toBeLessThanOrEqual(25_000);
        }
  });

  it('夜探角色系数乘在算好的倍数上：至少 1 份、封顶照旧、没登记的角色和档位不变', () => {
    clearAll();
    const base = RAID_LIVE.base.small.guzhen;
    const ramp = RAID_LIVE.floorRamp.small;
    const plain = (v: number, t: 'small' | 'medium' = 'small') => liveBp(v, t, 'guzhen', RAID_LIVE.floorRamp[t]);
    expect(liveBp(base * 2, 'small', 'guzhen', ramp, 'pang')).toBe(plain(base * 2));
    RAID_LIVE.charBp.pang = { small: 8_000 };
    expect(liveBp(base * 2, 'small', 'guzhen', ramp, 'pang')).toBe(16_000);
    // 打折以后最低也是 1 份：撤出不会比不进更亏
    RAID_LIVE.charBp.pang = { small: 5_000 };
    expect(liveBp(0, 'small', 'guzhen', ramp, 'pang')).toBe(10_000);
    expect(liveBp(base * 100, 'small', 'guzhen', ramp, 'pang')).toBe(15_000);
    // 系数大于 1 也封顶
    RAID_LIVE.charBp.pang = { small: 20_000 };
    expect(liveBp(base * 2, 'small', 'guzhen', ramp, 'pang')).toBe(RAID_LIVE.cap * 10_000);
    // 按镇子分的系数：没写的镇子 = 不调
    RAID_LIVE.charBp.pang = { small: { dukou: 5_000 } };
    expect(liveBp(base * 2, 'small', 'dukou', ramp, 'pang')).toBeLessThan(liveBp(base * 2, 'small', 'dukou', ramp));
    expect(liveBp(base * 2, 'small', 'guzhen', ramp, 'pang')).toBe(plain(base * 2));
    RAID_LIVE.charBp.pang = { small: 20_000 };
    // 别的角色、别的档不变
    expect(liveBp(base * 2, 'small', 'guzhen', ramp, 'fushi')).toBe(plain(base * 2));
    const mv = RAID_LIVE.base.medium.guzhen * 2;
    expect(liveBp(mv, 'medium', 'guzhen', RAID_LIVE.floorRamp.medium, 'pang')).toBe(plain(mv, 'medium'));
  });
  it('夜探：小道士只在中档渡口（0.27.0）、大档山寺（0.17.14）有系数，实盘结回经 settleRaid 带上所选角色', () => {
    expect(Object.keys(RAID_LIVE.charBp.xiaodao ?? {})).toEqual(['medium', 'large']);
    const s = liveSetup('small', 3, 'guzhen', 'pang');
    expect(s.character).toBe('pang');
    expect(new World(s).raid!.setup.character).toBe('pang');
  });
});

describe('守夜中途倒下的形状', () => {
  it('shapeBp：拍点插值、封顶', () => {
    const shape = [[300, 0], [420, 1_400], [600, 5_500], [840, 7_200], [900, 10_000]] as const;
    const at = (sec: number, dawn = 20_000): number => shapeBp(shape, sec * 30, dawn);
    expect(at(0)).toBe(0);
    expect(at(300)).toBe(0);
    expect(at(360)).toBe(1_400); // 300→420 秒占 0→1400，中点 700 × 20000 / 10000
    expect(at(420)).toBe(2_800);
    expect(at(510)).toBe(6_900); // 1400→5500 的中点 3450 × 2
    expect(at(600)).toBe(11_000);
    expect(at(840)).toBe(14_400);
    expect(at(870)).toBe(17_200); // 7200→10000 的中点 8600 × 2
    expect(at(899)).toBe(shapeBp(shape, 899 * 30, 20_000));
    expect(shapeBp(shape, 900 * 30 + 5, 20_000)).toBe(20_000);
    expect(shapeBp(shape, -5, 20_000)).toBe(0);
    expect(shapeBp(shape, 600 * 30, 40_000)).toBe(22_000);
    expect(shapeBp(shape, 899 * 30, 100_000)).toBe(LIVE_MAX_BP);
  });
  it('每档用自己的 shape 和 bossAdd', () => {
    for (const t of LIVE_TIER_IDS) {
      const { shape, bossAdd } = LIVE_TIERS[t];
      const d = vigilBp(t, 0, true, false);
      expect(vigilBp(t, 0, true, true), t).toBe(Math.min(LIVE_MAX_BP, d + bossAdd));
      expect(vigilBp(t, shape[0]![0] * 30, false, false), t).toBe(0);
      expect(vigilBp(t, 600 * 30, false, false), t).toBe(shapeBp(shape, 600 * 30, d));
    }
  });
  it('形状表合法：首点倍数 0、秒数递增、末点 [900,10000]、倍数单调不减；尸王加成不为负', () => {
    for (const t of LIVE_TIER_IDS) {
      const sh = LIVE_TIERS[t].shape;
      expect(sh[0]![1]).toBe(0);
      expect(sh[sh.length - 1]).toEqual([900, 10_000]);
      for (let i = 1; i < sh.length; i++) {
        expect(sh[i]![0]).toBeGreaterThan(sh[i - 1]![0]);
        expect(sh[i]![1]).toBeGreaterThanOrEqual(sh[i - 1]![1]);
      }
      expect(LIVE_TIERS[t].bossAdd).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('实盘选角色、地图：liveSetup 与记录', () => {
  it('不传 = 小道士、雪原；传了就带上，仍无咒印、加成', () => {
    expect(liveSetup('small', 1)).toMatchObject({ mode: 'vigil', character: 'xiaodao', map: 'snow', perks: {}, assist: false });
    expect(liveSetup('large', 1, undefined, 'fushi', 'icelake')).toMatchObject({ mode: 'vigil', danger: 3, character: 'fushi', map: 'icelake', perks: {}, assist: false });
    // 0.17.10 起新三人、0.30.0 起摆渡人各档、各图、夜探都能带
    for (const c of ['zhijiang', 'baidu', 'huolang', 'yinyang'] as const)
      for (const t of LIVE_TIER_IDS) for (const m of MAP_IDS) expect(liveSetup(t, 1, undefined, c, m).character, `${t} ${m} ${c}`).toBe(c);
    expect(liveSetup('small', 1, 'guzhen', 'yinyang').character).toBe('yinyang');
    expect(liveSetup('small', 1, 'guzhen', 'baidu').character).toBe('baidu');
    expect(liveSetup('large', 1, undefined, 'gengfu').character).toBe('gengfu');
    expect(liveSetup('medium', 1, 'dukou', 'caiyao')).toMatchObject({ mode: 'raid', character: 'caiyao', perks: {}, assist: false });
  });
  it('旧记录没有角色、地图字段按小道士、雪原算；新字段原样读回，乱写的丢掉', () => {
    const base = { ref: 'yexun-aaaaaaaa', tier: 'small', stake: 2000, seed: 1, at: 1, until: 2, step: 'playing' };
    const old = reviveLive(base)!;
    expect(old.character).toBeUndefined();
    expect(old.map).toBeUndefined();
    const nu = reviveLive({ ...base, character: 'pang', map: 'bamboo' })!;
    expect(nu).toMatchObject({ character: 'pang', map: 'bamboo' });
    const bad = reviveLive({ ...base, character: 'nope', map: 'nope' })!;
    expect(bad.character).toBeUndefined();
    expect(bad.map).toBeUndefined();
  });
  it('结回和中途离开按记录里的角色、地图算 bp', async () => {
    clearAll();
    LIVE_CHAR_BP.pang = { small: 9_000 };
    LIVE_MAP_BP.bamboo = { small: 10_500 };
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    const bodies: { bp: number }[] = [];
    const c = new LiveClient({
      store,
      now: () => 1_000,
      fetch: async (_u, init) => {
        const b = JSON.parse(String(init.body));
        if (b.bp !== undefined) bodies.push(b);
        return new Response(JSON.stringify({ ok: true, credited: 0, capped: 0, user: 'u1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    expect((await c.buyin('small', 5, undefined, 'pang', 'bamboo')).ok).toBe(true);
    expect(JSON.parse(m.get(LIVE_KEY)!)).toMatchObject({ character: 'pang', map: 'bamboo' });
    await c.finish(5, { ticks: 27_000, won: true, bossKilled: false });
    expect(bodies[0]!.bp).toBe(vigilBp('small', 27_000, true, false, 'pang', 'bamboo'));
    c.clearFinished();
    // 中途离开：重开页面 resume 按 progress 记下的拍数结回
    await c.buyin('small', 6, undefined, 'pang', 'snow');
    c.progress(6, 9_000);
    const c2 = new LiveClient({ store, now: () => 1_000, fetch: async (_u, init) => { const b = JSON.parse(String(init.body)); if (b.bp !== undefined) bodies.push(b); return new Response(JSON.stringify({ ok: true, credited: 0, capped: 0 }), { status: 200 }); } });
    await c2.resume();
    expect(bodies[1]!.bp).toBe(vigilBp('small', 9_000, false, false, 'pang', 'snow'));
  });
});
