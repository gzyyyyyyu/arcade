import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BOUNTY_LEVELS } from '../src/content/bountylevels.ts';
import { LIVE_TIER_IDS, livePick, liveSetup } from '../src/core/live.ts';

/**
 * 悬赏出海的三座岛从战役拆出来冻结（2026-11-06）：哈希是拆分前战役 c07、c10、c16 生成好的完整定义（JSON）的 sha256。
 * 这条挂了说明实盘数值变了——是有意改的就重跑 live-sim 四档、更新 DESIGN 4.3，再改这里的哈希。
 * 改过的：0.53.2（2026-11-20）c10 的岛名和首领换成和战役第 10 关一致（name 章鱼湾，captain、bossName、blurb 章鱼船长；
 * 布局、数值都没动），live-sim 四档每格 500 局改前改后输出一字不差；之前的哈希是 6c35617c…91e1。
 * 0.58.0（2026-11-21）关卡池加冻结 c06、c08、c09、c14、c15，原来三座逐字没动（只取 c07、c10、c16 算出来仍是 b16fa7d6…dead）。
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
