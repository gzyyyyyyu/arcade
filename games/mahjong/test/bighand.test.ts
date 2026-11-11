/** 结算的大牌判定和动画节奏（game/bighand.ts）：多大算大牌、各种设置下放多少 */
import { describe, expect, test } from 'vitest';
import { bestOf, celebrationOf, pacingOf, rcTier, xzTier, type FxEnv } from '../src/game/bighand.ts';

const ENV: FxEnv = { turbo: false, fast: false, lite: false, reduced: false };

describe('大牌判定', () => {
  test('川麻：3 番起算大牌，封顶或 5 番起特大', () => {
    expect([0, 1, 2].map((f) => xzTier(f, false))).toEqual([0, 0, 0]);
    expect(xzTier(3, false)).toBe(1);
    expect(xzTier(4, false)).toBe(1);
    expect(xzTier(5, false)).toBe(2);
    expect(xzTier(3, true)).toBe(2); // 封顶 3 番的桌，3 番就是封顶
    expect(xzTier(2, true)).toBe(2); // 天胡地胡按封顶算
  });
  test('立直：满贯以下不算，跳满以上大牌，役满特大', () => {
    expect(rcTier('none')).toBe(0);
    expect(rcTier('mangan')).toBe(0);
    expect(['haneman', 'baiman', 'sanbaiman'].map((l) => rcTier(l as 'haneman'))).toEqual([1, 1, 1]);
    expect(rcTier('yakuman')).toBe(2);
  });
  test('一局最大的牌：有自己的大牌按自己的，否则看别人的', () => {
    expect(bestOf([])).toEqual({ tier: 0, mine: false });
    expect(bestOf([{ tier: 2, mine: false }, { tier: 1, mine: true }])).toEqual({ tier: 1, mine: true });
    expect(bestOf([{ tier: 2, mine: false }, { tier: 0, mine: true }])).toEqual({ tier: 2, mine: false });
    expect(bestOf([{ tier: 1, mine: false }, { tier: 2, mine: false }])).toEqual({ tier: 2, mine: false });
  });
});

describe('庆祝分档', () => {
  test('自己：役满/封顶最隆重，大牌次之；别人只放轻的', () => {
    const grand = celebrationOf(2, true, ENV)!;
    const big = celebrationOf(1, true, ENV)!;
    const soft = celebrationOf(2, false, ENV)!;
    expect([grand.sound, big.sound, soft.sound]).toEqual(['fanGrand', 'fanBig', 'fanSoft']);
    expect(grand.particles).toBeGreaterThan(big.particles);
    expect(big.particles).toBeGreaterThan(soft.particles);
    expect(grand.ms).toBeLessThanOrEqual(1500); // 1.5 秒内放完
    expect(grand.particles).toBeLessThanOrEqual(60);
  });
  test('不是大牌不放', () => {
    expect(celebrationOf(0, true, ENV)).toBeNull();
    expect(celebrationOf(0, false, ENV)).toBeNull();
  });
  test('加速（?turbo）不放；快速档粒子减半', () => {
    expect(celebrationOf(2, true, { ...ENV, turbo: true })).toBeNull();
    expect(celebrationOf(2, true, { ...ENV, fast: true })!.particles).toBe(celebrationOf(2, true, ENV)!.particles / 2);
  });
  test('省内存设备没有粒子；减少动态效果没有粒子也没有光圈，声音还在', () => {
    const lite = celebrationOf(2, true, { ...ENV, lite: true })!;
    expect(lite.particles).toBe(0);
    expect(lite.ring).toBe(true);
    const calm = celebrationOf(2, true, { ...ENV, reduced: true })!;
    expect(calm.particles).toBe(0);
    expect(calm.ring).toBe(false);
    expect(calm.sound).toBe('fanGrand');
  });
});

describe('番型亮起的节奏', () => {
  test('每条 120–180 毫秒，条数越多越快，总数 0.6 秒滚完', () => {
    expect(pacingOf(3, ENV)).toEqual({ reveal: true, stepMs: 180, rollMs: 600 });
    expect(pacingOf(8, ENV).stepMs).toBe(150);
    expect(pacingOf(12, ENV).stepMs).toBe(120);
  });
  test('快速档、省内存减半；turbo 不亮；减少动态效果只滚数字', () => {
    expect(pacingOf(3, { ...ENV, fast: true }).stepMs).toBe(90);
    expect(pacingOf(3, { ...ENV, lite: true }).stepMs).toBe(90);
    expect(pacingOf(3, { ...ENV, turbo: true }).reveal).toBe(false);
    const calm = pacingOf(3, { ...ENV, reduced: true });
    expect(calm.stepMs).toBe(0);
    expect(calm.rollMs).toBeGreaterThan(0);
  });
});
