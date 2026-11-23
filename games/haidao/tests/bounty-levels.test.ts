import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BOUNTY_LEVELS } from '../src/content/bountylevels.ts';
import { LIVE_TIER_IDS, livePick, liveSetup } from '../src/core/live.ts';

/**
 * 悬赏出海池里各关的冻结副本（src/content/bountylevels.ts）：哈希是整份定义（JSON）的 sha256。
 * 这条挂了说明实盘数值变了——是有意改的就重跑 live-sim 四档、更新 docs/balance-haidao.md 第 2 节，再改这里的哈希。
 */
const FROZEN_SHA256 = 'a948abe6d6b0d53d52fbcdb4e94658632856b9439e13d0ba2e3a7cccc2e6c79b';

describe('悬赏出海的岛', () => {
  it('冻结的岛逐字不变', () => {
    expect(createHash('sha256').update(JSON.stringify(BOUNTY_LEVELS)).digest('hex')).toBe(FROZEN_SHA256);
  });

  it('每档都从冻结副本取岛，不读战役', () => {
    for (const t of LIVE_TIER_IDS) {
      const lv = BOUNTY_LEVELS.find((l) => l.id === livePick('live', t, 2).level);
      expect(lv).toBeDefined();
      expect(liveSetup(t, 2).layout).toEqual(lv!.layout);
    }
  });
});
