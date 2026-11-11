import { describe, expect, it } from 'vitest';
import { ESCORT_LEVEL_BY_ID } from '../src/content/index.ts';
import { ESCORT_LIVE_TIERS, ESCORT_LIVE_ZERO_MAX_BP, escortLiveBp, escortLiveSetup } from '../src/core/escortlive.ts';
import { runEscortBot } from '../src/core/escortbot.ts';
import { LIVE_MAX_BP, LIVE_TIERS, LIVE_TIER_IDS } from '../src/core/live.ts';
import { MAP_STAR_PTS } from '../src/core/map.ts';
import { MAP_LIVE_TIERS, MAP_LIVE_ZERO_MAX_BP, mapLiveBp } from '../src/core/maplive.ts';

/** 护航、寻宝航线实盘的档位表（DESIGN.md 12.1、11.1）：形状和 economy.md 第 2 节的边界 */
describe.each([
  ['护航', ESCORT_LIVE_TIERS, ESCORT_LIVE_ZERO_MAX_BP],
  ['航线', MAP_LIVE_TIERS, MAP_LIVE_ZERO_MAX_BP],
] as const)('%s实盘档位表', (_name, tiers, zeroMax) => {
  it('一份和悬赏出海同额；同档星越多越高；1 星以上不超过 3 份；0 星满值不超过 0.79 份', () => {
    for (const t of LIVE_TIER_IDS) {
      const bp = tiers[t].bp;
      expect(tiers[t].stake).toBe(LIVE_TIERS[t].stake);
      expect(bp[0]).toBeLessThanOrEqual(zeroMax);
      expect(bp[1]).toBeGreaterThan(zeroMax);
      expect(bp[2]).toBeGreaterThan(bp[1]);
      expect(bp[3]).toBeGreaterThan(bp[2]);
      expect(bp[3]).toBeLessThanOrEqual(LIVE_MAX_BP);
    }
  });
  it('档越高 3 星倍数不降', () => {
    for (let i = 1; i < LIVE_TIER_IDS.length; i++) expect(tiers[LIVE_TIER_IDS[i]!].bp[3]).toBeGreaterThanOrEqual(tiers[LIVE_TIER_IDS[i - 1]!].bp[3]);
  });
});

describe('护航实盘', () => {
  it('每档用的是现成的护航关，开局只由档位和种子决定（不读存档）', () => {
    for (const t of LIVE_TIER_IDS) {
      expect(ESCORT_LEVEL_BY_ID.has(ESCORT_LIVE_TIERS[t].level)).toBe(true);
      expect(escortLiveSetup(t, 7)).toEqual(escortLiveSetup(t, 7));
      expect(escortLiveSetup(t, 7).level.id).toBe(ESCORT_LIVE_TIERS[t].level);
    }
  });
  it('到港按星查表；没到港按走过的格数线性折算，走完全程也到不了 1 星', () => {
    const bp = ESCORT_LIVE_TIERS.small.bp;
    for (const s of [1, 2, 3]) expect(escortLiveBp('small', { arrived: true, stars: s, cells: 30, total: 30 })).toBe(bp[s]);
    expect(escortLiveBp('small', { arrived: false, stars: 0, cells: 0, total: 30 })).toBe(0);
    expect(escortLiveBp('small', { arrived: false, stars: 0, cells: 15, total: 30 })).toBe(Math.floor(bp[0] / 2));
    expect(escortLiveBp('small', { arrived: false, stars: 0, cells: 99, total: 30 })).toBe(bp[0]);
    // 沉了即使记着星也不算
    expect(escortLiveBp('small', { arrived: false, stars: 3, cells: 30, total: 30 })).toBe(bp[0]);
  });
  it('同一档同一种子，机器人打出来的结回倍数一样（可复现）', () => {
    const a = runEscortBot('normal', escortLiveSetup('mid', 11)).escort;
    const b = runEscortBot('normal', escortLiveSetup('mid', 11)).escort;
    expect(escortLiveBp('mid', a)).toBe(escortLiveBp('mid', b));
  });
});

describe('航线实盘', () => {
  it('1–3 星按表；0 星按宝分占 1 星线的比例线性折算', () => {
    const bp = MAP_LIVE_TIERS.mid.bp;
    for (const s of [1, 2, 3]) expect(mapLiveBp('mid', { stars: s, pts: 999 })).toBe(bp[s]);
    expect(mapLiveBp('mid', { stars: 0, pts: 0 })).toBe(0);
    expect(mapLiveBp('mid', { stars: 0, pts: MAP_STAR_PTS[0] / 2 })).toBe(Math.floor(bp[0] / 2));
    expect(mapLiveBp('mid', { stars: 0, pts: MAP_STAR_PTS[0] - 1 })).toBeLessThan(bp[0]);
  });
});
