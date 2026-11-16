import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/core/index.ts';
import { BOUNTY_PCT, LOOT_PCT, WANDER_LOOT_PCT, wandererGain, wandererIsland } from '../src/core/pvp.ts';
import { EXCHANGE_CHIPS, EXCHANGE_GOLD, EXCHANGE_PER_DAY, EXCHANGE_WOOD, LIVE_MAX_BP, LIVE_TIERS } from '../src/core/live.ts';
import { TD_LIVE_TIERS, TD_LIVE_ZERO_MAX_BP } from '../src/core/tdlive.ts';
import { ESCORT_LIVE_TIERS, ESCORT_LIVE_ZERO_MAX_BP } from '../src/core/escortlive.ts';
import { MAP_LIVE_TIERS, MAP_LIVE_ZERO_MAX_BP } from '../src/core/maplive.ts';
import { hash32 } from '../src/core/rng.ts';

/**
 * 收益上调（content/income.ts、content/tdreward.ts）只动娱乐的金币木材。这里锁住不许跟着变的：
 * 四种实盘的档位表和兑换比例（筹码结回，钱包期望按它们配平过，见 docs/balance-haidao.md），以及异步攻防的掠夺（服务端重放，改了要升 RULES_VERSION）。
 * 指纹变了先确认是不是有意改实盘；是的话重跑对应的实盘模拟、更新 balance 文档，再改这里的数。
 */
describe('收益上调不碰实盘和异步攻防', () => {
  it('实盘档位表、结回上限、兑换比例逐项不变', () => {
    const tables = {
      LIVE_TIERS, LIVE_MAX_BP, EXCHANGE: [EXCHANGE_CHIPS, EXCHANGE_PER_DAY, EXCHANGE_GOLD, EXCHANGE_WOOD],
      TD_LIVE_TIERS, TD_LIVE_ZERO_MAX_BP, ESCORT_LIVE_TIERS, ESCORT_LIVE_ZERO_MAX_BP, MAP_LIVE_TIERS, MAP_LIVE_ZERO_MAX_BP,
    };
    expect([EXCHANGE_CHIPS, EXCHANGE_PER_DAY, EXCHANGE_GOLD, EXCHANGE_WOOD]).toEqual([2000, 2, 2000, 1200]);
    expect(hash32(JSON.stringify(tables), 0)).toBe(1681540931);
  });
  it('攻防掠夺比例不变；流浪海盗岛按关卡原始 loot 算，不乘收入倍率', () => {
    expect([LOOT_PCT, BOUNTY_PCT, WANDER_LOOT_PCT]).toEqual([20, 50, 50]);
    const w = wandererIsland(100, 6, 7);
    expect(w.loot).toEqual(CAMPAIGN.find((l) => l.id === w.levelId)!.loot);
    expect(wandererGain({ gold: 1000, wood: 400 }, 80)).toEqual({ gold: 400, wood: 160 });
  });
});
