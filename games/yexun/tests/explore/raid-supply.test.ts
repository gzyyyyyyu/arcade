import { describe, expect, it } from 'vitest';
import { CHEST, RAID_SUPPLY } from '../../src/content/explore.ts';
import { TREASURES } from '../../src/content/treasures.ts';
import { createWorld, step, type World } from '../../src/core/index.ts';
import type { Raid } from '../../src/explore/raid.ts';
import '../../src/explore/register.ts';

// 娱乐夜探的补给和成长（content/explore.ts RAID_SUPPLY）；实盘夜探不带
const fun = (): World => createWorld({ seed: 5, mode: 'raid', danger: 1, raid: { template: 'guzhen' } });
const live = (): World => createWorld({ seed: 5, mode: 'raid', danger: 1, raid: { template: 'guzhen', live: 'small' }, live: true, perks: {}, assist: false });
const raid = (w: World): Raid => w.raid as unknown as Raid;
const jue = TREASURES.findIndex((t) => t.tier === 'jue');
const zhen = TREASURES.findIndex((t) => t.tier === 'zhen');

describe('娱乐夜探的补给和成长', () => {
  it('开箱回血按血上限的比例', () => {
    const w = fun();
    w.hp = 10;
    raid(w).heals = CHEST.gold.heal;
    step(w, 0);
    expect(w.hp).toBe(10 + Math.round(w.stats.hpMax * CHEST.gold.heal));
  });

  it('铜箱、金箱的升级三选一，选卡标题算宝箱，不算等级', () => {
    const w = fun();
    raid(w).upgrades = 1;
    step(w, 0);
    expect(w.phase).toBe('choose');
    expect(w.chestPicks).toBe(1);
    expect(w.pendingLevels).toBe(1);
    step(w, 0, 0);
    expect(w.chestPicks).toBe(0);
    expect(w.level).toBe(1);
  });

  it('宝气：珍、绝宝物加伤害，有上限', () => {
    const w = fun();
    const might = w.stats.might;
    const add = (id: number): void => raid(w).addLoot(id);
    add(zhen);
    add(jue);
    step(w, 0);
    expect(w.raidBoost).toBeCloseTo(RAID_SUPPLY.boost[2]! + RAID_SUPPLY.boost[3]!);
    expect(w.stats.might).toBeCloseTo(might + w.raidBoost);
    for (let k = 0; k < 20; k++) add(jue);
    step(w, 0);
    expect(w.raidBoost).toBe(RAID_SUPPLY.boostMax);
  });

  it('实盘夜探不带：不回血、宝箱不给选、没有宝气、肉包不加量', () => {
    const w = live();
    raid(w).upgrades = 1;
    raid(w).addLoot(jue);
    step(w, 0);
    expect(w.chestPicks).toBe(0);
    expect(w.raidBoost).toBe(0);
    expect(w.raid!.bunMul).toBe(1);
    expect(fun().raid!.bunMul).toBe(RAID_SUPPLY.bun);
  });
});
