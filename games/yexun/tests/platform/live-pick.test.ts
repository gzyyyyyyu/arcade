import type { CharacterId } from '../../src/content/meta.ts';
import type { MapId } from '../../src/content/maps.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_CHAR_BP, LIVE_COMBO_BP, LIVE_SKILL_COMBO_BP, LIVE_MAP_BP, LIVE_MAX_BP, LIVE_SKILL_BP, LIVE_SKILL_OPEN, LIVE_SKILL_SHAPE, liveSkillOpen, shapeBp, VIGIL_SHAPE, LIVE_TIER_IDS, LIVE_TIERS, VIGIL_BOSS_ADD_BP, vigilBp } from '../../src/content/live.ts';
import { RAID_LIVE } from '../../src/content/explore.ts';
import { liveBp } from '../../src/explore/settle.ts';
import { World } from '../../src/core/state.ts';
import { CHARACTER_IDS } from '../../src/content/meta.ts';
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
  it('不传角色、地图 = 小道士、雪原；小道士、雪原不在系数表里，别的没登记的角色、地图结果和它们一致', () => {
    expect(LIVE_CHAR_BP.xiaodao).toBeUndefined();
    expect(LIVE_MAP_BP.snow).toBeUndefined();
    for (const t of LIVE_TIER_IDS)
      for (const [ticks, won, boss] of SAMPLES) {
        const base = vigilBp(t, ticks, won, boss, 'xiaodao', 'snow', 53); // 规则 54 起小道士雪原大档进了组合表，这里钉在规则 53
        expect(vigilBp(t, ticks, won, boss, 'xiaodao', 'snow', 53)).toBe(base);
        for (const c of CHARACTER_IDS) if (liveSkillOpen(t, 'snow', undefined, c) === liveSkillOpen(t, 'snow') && (liveSkillOpen(t, 'snow') ? (LIVE_SKILL_BP.char[c]?.[t] ?? LIVE_CHAR_BP[c]?.[t]) : LIVE_CHAR_BP[c]?.[t]) === undefined) expect(vigilBp(t, ticks, won, boss, c, 'snow', 53)).toBe(base);
        for (const m of MAP_IDS) if (LIVE_MAP_BP[m]?.[t] === undefined && LIVE_SKILL_BP.map[m]?.[t] === undefined && liveSkillOpen(t, m) === liveSkillOpen(t, 'snow')) expect(vigilBp(t, ticks, won, boss, 'xiaodao', m, 53)).toBe(base);
      }
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
  it('（规则 44 及以前开的局，不放技能的格子）系数乘在这一档的天亮倍数上，中途倒下按同一比例，尸王的加成不缩放，结果始终封顶', () => {
    clearAll();
    LIVE_CHAR_BP.pang = { medium: 9_000 };
    LIVE_MAP_BP.riverbank = { medium: 11_000 };
    const dawn = LIVE_TIERS.medium.dawnBp;
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'icelake', 44)).toBe(Math.floor((dawn * 9_000) / 10_000));
    expect(vigilBp('medium', 27_000, true, false, 'xiaodao', 'riverbank', 44)).toBe(Math.floor((dawn * 11_000) / 10_000));
    expect(vigilBp('medium', 27_000, true, true, 'pang', 'icelake', 44)).toBe(Math.floor((dawn * 9_000) / 10_000) + VIGIL_BOSS_ADD_BP);
    expect(vigilBp('medium', 9_000, false, false, 'pang', 'icelake', 44)).toBeLessThan(vigilBp('medium', 9_000, false, false, 'xiaodao', 'icelake', 44));
    // 别的档不受影响（大档鬼市：处处不开技能，走不带技能那套）
    expect(vigilBp('large', 27_000, true, false, 'pang', 'guishi', 44)).toBe(vigilBp('large', 27_000, true, false, 'xiaodao', 'guishi', 44));
    // 系数大到超过上限：天亮、尸王、中途都封顶
    LIVE_MAP_BP.riverbank = { medium: 25_000 };
    LIVE_CHAR_BP.pang = { medium: 25_000 };
    for (const [ticks, won, boss] of SAMPLES) expect(vigilBp('medium', ticks, won, boss, 'pang', 'riverbank', 44)).toBeLessThanOrEqual(LIVE_MAX_BP);
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'riverbank', 44)).toBe(LIVE_MAX_BP);
  });
  it('（规则 44 及以前开的局）组合系数替换角色 × 地图的乘积，只管写了的那一档；系数在合理范围', () => {
    clearAll();
    LIVE_CHAR_BP.pang = { medium: 9_000 };
    LIVE_MAP_BP.riverbank = { medium: 14_000 };
    const dawn = LIVE_TIERS.medium.dawnBp;
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'riverbank', 44)).toBe(Math.floor((Math.floor((dawn * 9_000) / 10_000) * 14_000) / 10_000));
    LIVE_COMBO_BP.pang = { riverbank: { medium: 10_000 } };
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'riverbank', 44)).toBe(dawn);
    // 尸王加成不缩放，别的档、别的地图、别的角色仍按乘积（中档冰湖、河滩不开技能）
    expect(vigilBp('medium', 27_000, true, true, 'pang', 'riverbank', 44)).toBe(dawn + VIGIL_BOSS_ADD_BP);
    expect(vigilBp('large', 27_000, true, false, 'pang', 'guishi', 44)).toBe(vigilBp('large', 27_000, true, false, 'xiaodao', 'guishi', 44));
    expect(vigilBp('medium', 27_000, true, false, 'pang', 'icelake', 44)).toBe(Math.floor((dawn * 9_000) / 10_000));
    expect(vigilBp('medium', 27_000, true, false, 'xiaodao', 'riverbank', 44)).toBe(Math.floor((dawn * 14_000) / 10_000));
    for (const per of Object.values(saved.combo))
      for (const maps of Object.values(per!))
        for (const [t, c] of Object.entries(maps!)) {
          expect(LIVE_TIER_IDS).toContain(t);
          expect(c).toBeGreaterThanOrEqual(5_000);
          expect(c).toBeLessThanOrEqual(25_000);
        }
  });
  it('组合系数：规则 40 及以前的局不折算，和 0.17.2 逐位一致；41 起按小道士新旧地图系数同比折算', () => {
    // 义庄小档的地图系数：39 时 10,500、40 时 11,000、现行 10,200；组合系数是在 40 的系数上拟的
    LIVE_COMBO_BP.pang = { ...LIVE_COMBO_BP.pang, yizhuang: { ...LIVE_COMBO_BP.pang?.yizhuang, small: 12_000 } };
    const dawn = LIVE_TIERS.small.dawnBp;
    for (const [ticks, won, boss] of SAMPLES) {
      const at = (rules?: number) => vigilBp('small', ticks, won, boss, 'pang', 'yizhuang', rules);
      // 0.17.2：组合系数直接替换乘积
      const old = (() => {
        const d = Math.floor((dawn * 12_000) / 10_000);
        return boss ? Math.min(LIVE_MAX_BP, d + VIGIL_BOSS_ADD_BP) : won ? Math.min(LIVE_MAX_BP, d) : shapeBp(VIGIL_SHAPE, ticks, d);
      })();
      expect(at(39)).toBe(old);
      expect(at(40)).toBe(old);
      const d41 = Math.floor((dawn * Math.floor((12_000 * 10_200) / 11_000)) / 10_000);
      const now = boss ? Math.min(LIVE_MAX_BP, d41 + VIGIL_BOSS_ADD_BP) : won ? Math.min(LIVE_MAX_BP, d41) : shapeBp(VIGIL_SHAPE, ticks, d41);
      expect(at(41)).toBe(now);
      expect(at(42)).toBe(now);
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
  it('夜探：小道士只在大档山寺有系数（0.17.14），实盘结回经 settleRaid 带上所选角色', () => {
    expect(Object.keys(RAID_LIVE.charBp.xiaodao ?? {})).toEqual(['large']);
    const s = liveSetup('small', 3, 'guzhen', 'pang');
    expect(s.character).toBe('pang');
    expect(new World(s).raid!.setup.character).toBe('pang');
  });
});

describe('实盘技能开放的格子单独一套倍数（0.16.0）', () => {
  const dawn = (t: 'small' | 'medium', c: CharacterId, m: MapId): number => vigilBp(t, 0, true, false, c, m, 57); // 规则 58 起抬过的格子另锁在 live-58，这里看规则 57 的局
  const dawn44 = (t: 'small' | 'medium', c: CharacterId, m: MapId): number => vigilBp(t, 0, true, false, c, m, 44);
  it('小档 × 雪原：各角色天亮结算倍数（万分比），改前 → 改后', () => {
    // 改前：dawnBp 13,500 × 旧角色系数（小档）；改后：技能格子单独的 dawnBp 11,800 × 新角色系数
    const before = { xiaodao: 13_500, fushi: 13_500, jianxia: 13_365, pang: 13_365, gengfu: 13_635, caiyao: 13_365 } as const;
    const after = { xiaodao: 11_800, fushi: 12_390, jianxia: 11_682, pang: 11_092, gengfu: 11_564, caiyao: 11_210, zhijiang: 12_390, huolang: 12_036, yinyang: 12_036 } as const;
    // 规则 49（0.17.14）起胖师叔、采药女小档雪原另有组合系数（见下面 0.17.14 一节），这里按规则 48 看乘积
    for (const [c, v] of Object.entries(after)) expect(vigilBp('small', 0, true, false, c as CharacterId, 'snow', 48), c).toBe(v);
    for (const [c, v] of Object.entries(before)) expect(dawn('small', c as CharacterId, 'snow'), c).toBeLessThan(v);
  });
  it('规则 44 及以前开的局，当时不放技能的格子（小档冰湖、中档以上的鬼市）不用技能那套倍数', () => {
    expect(LIVE_TIERS.small.dawnBp).toBe(13_500);
    // 小档冰湖 0.17.5 按现在的机器人重拟：9,900 → 8,400
    expect(dawn44('small', 'xiaodao', 'icelake')).toBe(11_340);
    expect(dawn44('small', 'pang', 'icelake')).toBe(11_226);
    expect(dawn44('small', 'gengfu', 'icelake')).toBe(11_453);
    // 鬼市 0.17.7 开实盘，中档地图系数 9,600
    expect(dawn44('medium', 'xiaodao', 'guishi')).toBe(16_224);
    expect(dawn44('medium', 'pang', 'guishi')).toBe(13_628);
    // 小档的河滩、义庄、荒庙、鬼市 0.17.8（规则 43）开技能，用带技能那套：dawnBp 11,800 × 技能角色系数 × LIVE_SKILL_BP.map
    for (const m of ['riverbank', 'yizhuang', 'temple', 'guishi'] as const) expect(LIVE_SKILL_OPEN.small, m).toContain(m);
    expect(dawn('small', 'xiaodao', 'riverbank')).toBe(13_806);
    expect(dawn('small', 'xiaodao', 'yizhuang')).toBe(13_806);
    expect(dawn('small', 'xiaodao', 'temple')).toBe(13_452);
    expect(dawn('small', 'xiaodao', 'guishi')).toBe(13_688);
    // 剑侠河滩 0.17.9 起按组合 10,500（规则 43 开的局按乘积 13,667）
    expect(dawn('small', 'jianxia', 'riverbank')).toBe(12_390);
    expect(vigilBp('small', 0, true, false, 'jianxia', 'riverbank', 43)).toBe(13_667);
    // 0.17.9（规则 44）：符师技能系数 1.05 乘上这几张图的地图系数普通线超上限，改用 LIVE_SKILL_COMBO_BP 替换乘积；规则 43 开的局按乘积结
    for (const m of Object.keys(LIVE_SKILL_COMBO_BP.fushi!) as MapId[]) {
      const combo = LIVE_SKILL_COMBO_BP.fushi![m]!.small!;
      expect(dawn('small', 'fushi', m), m).toBe(Math.floor((11_800 * combo) / 10_000));
      expect(vigilBp('small', 0, true, false, 'fushi', m, 43), m).toBe(Math.floor((Math.floor((11_800 * 10_500) / 10_000) * LIVE_SKILL_BP.map[m]!.small!) / 10_000));
    }
    expect(vigilBp('small', 0, true, false, 'fushi', 'riverbank', 43)).toBe(14_496);
    // 规则 42 及以前开的局仍按不放技能那套结（和 0.17.7 线上逐位一致）
    const old = (c: CharacterId, m: MapId): number => vigilBp('small', 0, true, false, c, m, 42);
    for (const m of ['riverbank', 'yizhuang', 'temple', 'guishi'] as const) expect(liveSkillOpen('small', m, 42), m).toBe(false);
    expect(old('xiaodao', 'riverbank')).toBe(13_770);
    expect(old('xiaodao', 'yizhuang')).toBe(13_770);
    expect(old('xiaodao', 'temple')).toBe(13_500);
    expect(old('xiaodao', 'guishi')).toBe(13_770);
    expect(old('jianxia', 'riverbank')).toBe(13_632);
  });
});

describe('实盘技能的形状表 LIVE_SKILL_SHAPE（0.17.0 起中档以上开技能的格子用）', () => {
  // 中档以上没开技能的格子（鬼市）：倍数和加表之前逐位一致（期望数取自加表前的 vigilBp，原是雪原，鬼市没有地图系数所以相同）
  const BEFORE: [string, number, boolean, boolean, string, string, number][] = [
  ['medium', 0, false, false, 'xiaodao', 'guishi', 0],
  ['medium', 6000, false, false, 'xiaodao', 'guishi', 157],
  ['medium', 9000, false, false, 'xiaodao', 'guishi', 946],
  ['medium', 12000, false, false, 'xiaodao', 'guishi', 1869],
  ['medium', 18000, false, false, 'xiaodao', 'guishi', 3718],
  ['medium', 25000, false, false, 'xiaodao', 'guishi', 4835],
  ['medium', 27000, true, false, 'xiaodao', 'guishi', 16900],
  ['medium', 27000, true, true, 'xiaodao', 'guishi', 18900],
  ['medium', 20000, false, true, 'xiaodao', 'guishi', 18900],
  ['large', 0, false, false, 'xiaodao', 'guishi', 0],
  ['large', 6000, false, false, 'xiaodao', 'guishi', 163],
  ['large', 9000, false, false, 'xiaodao', 'guishi', 985],
  ['large', 12000, false, false, 'xiaodao', 'guishi', 1946],
  ['large', 18000, false, false, 'xiaodao', 'guishi', 3872],
  ['large', 25000, false, false, 'xiaodao', 'guishi', 5035],
  ['large', 27000, true, false, 'xiaodao', 'guishi', 17600],
  ['large', 27000, true, true, 'xiaodao', 'guishi', 19600],
  ['large', 20000, false, true, 'xiaodao', 'guishi', 19600],
  ['luxe', 0, false, false, 'xiaodao', 'guishi', 0],
  ['luxe', 6000, false, false, 'xiaodao', 'guishi', 178],
  ['luxe', 9000, false, false, 'xiaodao', 'guishi', 1075],
  ['luxe', 12000, false, false, 'xiaodao', 'guishi', 2123],
  ['luxe', 18000, false, false, 'xiaodao', 'guishi', 4224],
  ['luxe', 25000, false, false, 'xiaodao', 'guishi', 5493],
  ['luxe', 27000, true, false, 'xiaodao', 'guishi', 19200],
  ['luxe', 27000, true, true, 'xiaodao', 'guishi', 21200],
  ['luxe', 20000, false, true, 'xiaodao', 'guishi', 21200],
  ];
  it('规则 44 及以前开的局，当时不放技能的格子的 vigilBp 和改前逐位一致', () => {
    // 锁的是不开技能那套曲线和 dawnBp：鬼市 0.17.7 才有地图系数，这里拿掉按 1 倍比（afterEach 还原）
    delete LIVE_MAP_BP.guishi;
    for (const [t, k, w, b, c, m, v] of BEFORE) {
      expect(liveSkillOpen(t as 'medium', m as MapId, 44), `${t}/${m}`).toBe(false);
      expect(vigilBp(t as 'medium', k, w, b, c as CharacterId, m as MapId, 44), `${t} ${k} ${w} ${b} ${c} ${m}`).toBe(v);
    }
  });
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
  it('开了技能的格子不用组合系数（那是不带技能时拟的），按技能那套的角色 × 地图系数相乘', () => {
    expect(LIVE_COMBO_BP.gengfu?.snow?.medium).toBeDefined(); // 不带技能时拟的更夫 × 雪原中档组合
    expect(liveSkillOpen('medium', 'snow', undefined, 'gengfu')).toBe(true);
    const base = LIVE_SKILL_BP.dawn.medium!;
    const c = LIVE_SKILL_BP.char.gengfu?.medium ?? 10_000;
    expect(vigilBp('medium', 0, true, false, 'gengfu', 'snow')).toBe(Math.floor((base * c) / 10_000));
  });
  it('规则 40–44 开的局：当时关技能的角色照那时结（不放技能、不带技能那套倍数，含组合系数），和 0.16.0 逐位一致；0.17.10 起都放技能', () => {
    // 0.16.0 的值：大档 dawn 17,600 × 更夫雪原大档组合 11,400；豪华档 19,200 × 组合 11,800；中档胖师叔 16,900 × 8,400
    expect(liveSkillOpen('large', 'snow', 44, 'gengfu')).toBe(false);
    expect(vigilBp('large', 0, true, false, 'gengfu', 'snow', 44)).toBe(20_064);
    expect(vigilBp('luxe', 0, true, false, 'gengfu', 'snow', 44)).toBe(22_656);
    expect(vigilBp('medium', 0, true, false, 'pang', 'snow', 44)).toBe(14_196);
    expect(vigilBp('medium', 600 * 30, false, false, 'pang', 'snow', 44)).toBe(shapeBp(VIGIL_SHAPE, 600 * 30, 14_196));
    for (const c of ['gengfu', 'pang', 'zhijiang', 'yinyang', 'fushi', 'caiyao'] as const)
      for (const t of LIVE_TIER_IDS) for (const m of MAP_IDS) expect(liveSkillOpen(t, m, undefined, c), `${t} ${m} ${c}`).toBe(true);
    // 没单独写带技能系数的按不带技能那套补：更夫大档 = 技能 dawn × 不带技能的系数
    expect(vigilBp('large', 0, true, false, 'gengfu', 'snow')).toBe(Math.floor((LIVE_SKILL_BP.dawn.large! * (LIVE_SKILL_BP.char.gengfu?.large ?? LIVE_CHAR_BP.gengfu!.large!)) / 10_000));
  });
  it('开了技能的中档以上格子用表里的 shape 和 bossAdd', () => {
    for (const t of ['medium', 'large', 'luxe'] as const) {
      expect(liveSkillOpen(t, 'snow'), t).toBe(true);
      const e = LIVE_SKILL_SHAPE[t]!;
      const d = vigilBp(t, 0, true, false, 'xiaodao', 'snow', 53);
      expect(d, t).toBe(LIVE_SKILL_BP.dawn[t]);
      expect(vigilBp(t, 0, true, true, 'xiaodao', 'snow', 53), t).toBe(Math.min(LIVE_MAX_BP, d + e.bossAdd));
      expect(vigilBp(t, e.shape[0]![0] * 30, false, false, 'xiaodao', 'snow', 53), t).toBe(0);
      expect(vigilBp(t, 600 * 30, false, false, 'xiaodao', 'snow', 53), t).toBe(shapeBp(e.shape, 600 * 30, d));
      // 和不带技能那条曲线确实不同
      expect(vigilBp(t, 600 * 30, false, false, 'xiaodao', 'snow', 53), t).not.toBe(shapeBp(VIGIL_SHAPE, 600 * 30, d));
    }
  });
  it('小档不加条目，用原来的 VIGIL_SHAPE 和 VIGIL_BOSS_ADD_BP', () => {
    expect(LIVE_SKILL_SHAPE.small).toBeUndefined();
    const d = vigilBp('small', 0, true, false);
    expect(vigilBp('small', 0, true, true)).toBe(d + VIGIL_BOSS_ADD_BP);
    expect(vigilBp('small', 600 * 30, false, false)).toBe(shapeBp(VIGIL_SHAPE, 600 * 30, d));
  });
  it('形状表合法：首点倍数 0、秒数递增、末点 [900,10000]、倍数单调不减', () => {
    const all = [VIGIL_SHAPE, ...Object.values(LIVE_SKILL_SHAPE).map((e) => e.shape)];
    for (const sh of all) {
      expect(sh[0]![1]).toBe(0);
      expect(sh[sh.length - 1]).toEqual([900, 10_000]);
      for (let i = 1; i < sh.length; i++) {
        expect(sh[i]![0]).toBeGreaterThan(sh[i - 1]![0]);
        expect(sh[i]![1]).toBeGreaterThanOrEqual(sh[i - 1]![1]);
      }
    }
    for (const e of Object.values(LIVE_SKILL_SHAPE)) expect(e.bossAdd).toBeGreaterThanOrEqual(0);
  });
});

describe('0.17.11（规则 46）货郎带技能难图多发热修', () => {
  // [档, 图, 规则 45 天亮, 规则 45 第 10 分钟倒下, 规则 46 天亮]：前两列取自 0.17.10 线上（规则 45）的 vigilBp
  const CELLS = [
    ['medium', 'temple', 17_063, 7_507, 14_595],
    ['large', 'temple', 18_298, 8_051, 14_076],
    ['large', 'guishi', 15_061, 6_626, 13_248],
    ['luxe', 'icelake', 13_839, 10_503, 11_316],
    ['luxe', 'riverbank', 13_362, 10_141, 10_578],
    ['luxe', 'yizhuang', 13_959, 10_594, 11_070],
    ['luxe', 'temple', 17_180, 13_039, 11_439],
    ['luxe', 'guishi', 14_555, 11_047, 10_824],
  ] as const;
  it('规则 ≤45 开的局结算不变（和 0.17.10 逐位一致），规则 46 起按压过的组合系数', () => {
    for (const [t, m, dawn45, mid45, dawn46] of CELLS) {
      expect(vigilBp(t, 0, true, false, 'huolang', m, 45), `${t} ${m}`).toBe(dawn45);
      expect(vigilBp(t, 600 * 30, false, false, 'huolang', m, 45), `${t} ${m}`).toBe(mid45);
      expect(vigilBp(t, 0, true, false, 'huolang', m, 50), `${t} ${m}`).toBe(dawn46);
      expect(vigilBp(t, 0, true, false, 'huolang', m, 46), `${t} ${m}`).toBe(dawn46);
      expect(dawn46, `${t} ${m}`).toBeLessThan(dawn45);
    }
    // 别的角色、别的格子不受影响
    expect(vigilBp('luxe', 0, true, false, 'zhijiang', 'temple', 53)).toBe(vigilBp('luxe', 0, true, false, 'zhijiang', 'temple', 45));
    expect(vigilBp('medium', 0, true, false, 'huolang', 'guishi', 50)).toBe(vigilBp('medium', 0, true, false, 'huolang', 'guishi', 45));
  });
});

describe('0.17.12（规则 47）荒庙老角色带技能多发热修', () => {
  // [档, 角色, 规则 46 天亮, 规则 46 第 10 分钟倒下]：取自 0.17.11 线上（规则 46）的 vigilBp
  const CELLS = [
    ['medium', 'jianxia', 16_374, 7_204],
    ['medium', 'caiyao', 16_718, 7_355],
    ['large', 'xiaodao', 17_940, 7_893],
    ['large', 'jianxia', 16_325, 7_183],
    ['large', 'caiyao', 17_940, 7_893],
    ['luxe', 'jianxia', 14_878, 11_292],
    ['luxe', 'pang', 13_815, 10_485],
    ['luxe', 'gengfu', 17_357, 13_173],
    ['luxe', 'caiyao', 15_763, 11_964],
  ] as const;
  it('规则 ≤46 开的局结算不变（和 0.17.11 逐位一致），规则 47 起压低', () => {
    for (const [t, c, dawn46, mid46] of CELLS) {
      expect(vigilBp(t, 0, true, false, c, 'temple', 46), `${t} ${c}`).toBe(dawn46);
      expect(vigilBp(t, 600 * 30, false, false, c, 'temple', 46), `${t} ${c}`).toBe(mid46);
      expect(vigilBp(t, 0, true, false, c, 'temple', 57), `${t} ${c}`).toBe(vigilBp(t, 0, true, false, c, 'temple', 47));
      expect(vigilBp(t, 0, true, false, c, 'temple', 57), `${t} ${c}`).toBeLessThan(dawn46);
    }
    // 别的角色、别的档、别的图不受影响；货郎的规则 46 组合照用
    expect(vigilBp('luxe', 0, true, false, 'zhijiang', 'temple', 53)).toBe(vigilBp('luxe', 0, true, false, 'zhijiang', 'temple', 46));
    expect(vigilBp('medium', 0, true, false, 'xiaodao', 'temple', 49)).toBe(vigilBp('medium', 0, true, false, 'xiaodao', 'temple', 46)); // 规则 50 起这格另压了（0.17.15）
    expect(vigilBp('luxe', 0, true, false, 'jianxia', 'guishi', 49)).toBe(vigilBp('luxe', 0, true, false, 'jianxia', 'guishi', 46)); // 同上
    expect(vigilBp('luxe', 0, true, false, 'huolang', 'temple')).toBe(11_439);
  });
});

describe('0.17.14（规则 49）全覆盖测量后抬普通偏低的守夜格子', () => {
  // [档, 图, 角色, 规则 48 天亮, 规则 48 第 10 分钟倒下, 规则 49 天亮]：前两列取自 0.17.13 线上（规则 48）
  const CELLS = [
    ['small', 'bamboo', 'caiyao', 11_097, 2_441, 11_800],
    ['large', 'riverbank', 'gengfu', 12_962, 5_703, 15_318],
    ['luxe', 'temple', 'yinyang', 11_335, 8_603, 16_974],
    ['luxe', 'snow', 'zhijiang', 9_963, 7_561, 12_546],
  ] as const;
  it('规则 ≤48 开的局结算不变，规则 49 起抬高；冰湖不动', () => {
    for (const [t, m, c, dawn48, mid48, dawn49] of CELLS) {
      expect(vigilBp(t, 0, true, false, c, m, 48), `${t} ${m} ${c}`).toBe(dawn48);
      expect(vigilBp(t, 600 * 30, false, false, c, m, 48), `${t} ${m} ${c}`).toBe(mid48);
      expect(vigilBp(t, 0, true, false, c, m, 53), `${t} ${m} ${c}`).toBe(dawn49);
      expect(vigilBp(t, 0, true, false, c, m, 49), `${t} ${m} ${c}`).toBe(dawn49);
    }
    expect(vigilBp('luxe', 0, true, false, 'yinyang', 'icelake', 57)).toBe(vigilBp('luxe', 0, true, false, 'yinyang', 'icelake', 48));
    expect(vigilBp('luxe', 0, true, false, 'jianxia', 'temple')).toBe(vigilBp('luxe', 0, true, false, 'jianxia', 'temple', 48));
  });
});

describe('实盘选角色、地图：liveSetup 与记录', () => {
  it('不传 = 小道士、雪原；传了就带上，仍无咒印、加成', () => {
    expect(liveSetup('small', 1)).toMatchObject({ mode: 'vigil', character: 'xiaodao', map: 'snow', perks: {}, assist: false });
    expect(liveSetup('large', 1, undefined, 'fushi', 'icelake')).toMatchObject({ mode: 'vigil', danger: 3, character: 'fushi', map: 'icelake', perks: {}, assist: false });
    // 0.17.10 起新三人各档、各图、夜探都能带；摆渡人娱乐里也收着，退回小道士
    for (const c of ['zhijiang', 'huolang', 'yinyang'] as const)
      for (const t of LIVE_TIER_IDS) for (const m of MAP_IDS) expect(liveSetup(t, 1, undefined, c, m).character, `${t} ${m} ${c}`).toBe(c);
    expect(liveSetup('small', 1, 'guzhen', 'yinyang').character).toBe('yinyang');
    expect(liveSetup('small', 1, undefined, 'baidu').character).toBe('xiaodao');
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
