import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BOUNTY_LEVELS } from '../src/content/bountylevels.ts';
import { LIVE_TIERS, LIVE_TIER_IDS, liveSetup } from '../src/core/live.ts';

/**
 * 悬赏出海的三座岛从战役拆出来冻结（2026-11-06）：哈希是拆分前战役 c07、c10、c16 生成好的完整定义（JSON）的 sha256。
 * 这条挂了说明实盘数值变了——是有意改的就重跑 live-sim 四档、更新 DESIGN 4.3，再改这里的哈希。
 */
const FROZEN_SHA256 = '6c35617c3e77a5da2477d4b70cc450c64b28a406a81c4d21327240d3c46891e1';

describe('悬赏出海的岛', () => {
  it('三座岛的定义和拆分前逐字一样', () => {
    expect(createHash('sha256').update(JSON.stringify(BOUNTY_LEVELS)).digest('hex')).toBe(FROZEN_SHA256);
  });

  it('每档都从冻结副本取岛，不读战役', () => {
    for (const t of LIVE_TIER_IDS) {
      const lv = BOUNTY_LEVELS.find((l) => l.id === LIVE_TIERS[t].level);
      expect(lv).toBeDefined();
      expect(liveSetup(t, 2).layout).toEqual(lv!.layout);
    }
  });
});
