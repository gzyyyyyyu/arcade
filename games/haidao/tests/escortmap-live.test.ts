import { describe, expect, it } from 'vitest';
import { ESCORT_LEVEL_BY_ID } from '../src/content/index.ts';
import { LIVE_TABLE } from '../src/content/livetable.ts';
import { escortLiveBp, escortLiveSetup } from '../src/core/escortlive.ts';
import { runEscortBot } from '../src/core/escortbot.ts';
import { LIVE_TIER_IDS, livePick } from '../src/core/live.ts';
import { MAP_STAR_PTS } from '../src/core/map.ts';
import { mapLiveBp } from '../src/core/maplive.ts';

/** 护航、寻宝航线实盘的结回规则（DESIGN.md 12.1、11.1）；表的形状在 livetable.test.ts */
describe('护航实盘', () => {
  it('每档用的是现成的护航关，开局只由档位和种子决定（不读存档）', () => {
    for (const t of LIVE_TIER_IDS) {
      for (const { level } of LIVE_TABLE.escort[t].pool) expect(ESCORT_LEVEL_BY_ID.has(level)).toBe(true);
      expect(escortLiveSetup(t, 7)).toEqual(escortLiveSetup(t, 7));
      expect(escortLiveSetup(t, 7).level.id).toBe(livePick('escort', t, 7).level);
    }
  });
  it('到港按星查表；没到港按走过的格数线性折算，走完全程也到不了 1 星', () => {
    const bp = livePick('escort', 'small', 0).bp;
    for (const s of [1, 2, 3]) expect(escortLiveBp('small', 0, { arrived: true, stars: s, cells: 30, total: 30 })).toBe(bp[s]);
    expect(escortLiveBp('small', 0, { arrived: false, stars: 0, cells: 0, total: 30 })).toBe(0);
    expect(escortLiveBp('small', 0, { arrived: false, stars: 0, cells: 15, total: 30 })).toBe(Math.floor(bp[0] / 2));
    expect(escortLiveBp('small', 0, { arrived: false, stars: 0, cells: 99, total: 30 })).toBe(bp[0]);
    // 沉了即使记着星也不算
    expect(escortLiveBp('small', 0, { arrived: false, stars: 3, cells: 30, total: 30 })).toBe(bp[0]);
  });
  it('同一档同一种子，机器人打出来的结回倍数一样（可复现）', () => {
    const a = runEscortBot('normal', escortLiveSetup('mid', 11)).escort;
    const b = runEscortBot('normal', escortLiveSetup('mid', 11)).escort;
    expect(escortLiveBp('mid', 11, a)).toBe(escortLiveBp('mid', 11, b));
  });
});

describe('航线实盘', () => {
  it('1–3 星按表；0 星按宝分占 1 星线的比例线性折算', () => {
    const bp = LIVE_TABLE.map.mid.pool[0]!.bp;
    for (const s of [1, 2, 3]) expect(mapLiveBp('mid', { stars: s, pts: 999 })).toBe(bp[s]);
    expect(mapLiveBp('mid', { stars: 0, pts: 0 })).toBe(0);
    expect(mapLiveBp('mid', { stars: 0, pts: MAP_STAR_PTS[0] / 2 })).toBe(Math.floor(bp[0] / 2));
    expect(mapLiveBp('mid', { stars: 0, pts: MAP_STAR_PTS[0] - 1 })).toBeLessThan(bp[0]);
  });
});
