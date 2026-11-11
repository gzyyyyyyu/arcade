import { describe, expect, it } from 'vitest';
import { ghostAlpha, trailStep } from '../src/view/shiplook.ts';
import { DmgClusters, DMG_RADIUS, DMG_WINDOW_MS } from '../src/view/tddmg.ts';
import { dyingDim, DYING_DEPTH_DROP } from '../src/view/dyinglook.ts';

describe('船血条残段和剪影', () => {
  it('掉血后残段按时间收回、涨血直接跟上', () => {
    expect(trailStep(100, 60, 500)).toBeCloseTo(80);
    expect(trailStep(100, 60, 5000)).toBe(60);
    expect(trailStep(50, 80, 16)).toBe(80);
  });
  it('剪影按时间淡入淡出，减弱动态直接到位', () => {
    expect(ghostAlpha(0, true, 75, false)).toBeCloseTo(0.3);
    expect(ghostAlpha(0.6, false, 75, false)).toBeCloseTo(0.3);
    expect(ghostAlpha(0, true, 1, false)).toBeGreaterThan(0);
    expect(ghostAlpha(0, true, 16, true)).toBe(0.6);
    expect(ghostAlpha(0.6, false, 16, true)).toBe(0);
  });
});

describe('伤害数字扎堆合并', () => {
  it('窗口内附近的别的目标并进同一个键，远的和过期的各自一个', () => {
    const c = new DmgClusters();
    expect(c.keyFor(1, 0, 0, 1000)).toBe('e1');
    expect(c.keyFor(2, DMG_RADIUS - 5, 0, 1100)).toBe('e1');
    expect(c.keyFor(3, DMG_RADIUS * 3, 0, 1100)).toBe('e3');
    expect(c.keyFor(4, 10, 10, 1100 + DMG_WINDOW_MS + 1)).toBe('e4');
  });
  it('同一目标沿用自己第一次的键，时间倒退时清掉', () => {
    const c = new DmgClusters();
    c.keyFor(1, 0, 0, 1000);
    c.keyFor(2, 10, 0, 1050);
    expect(c.keyFor(2, 400, 0, 1100)).toBe('e1');
    expect(c.keyFor(9, 5, 5, 10)).toBe('e9');
  });
});

describe('倒下的单位压暗压低', () => {
  it('系数一开始压暗、后半段更快淡掉、到头为 0', () => {
    expect(dyingDim(0)).toBeLessThan(1);
    expect(dyingDim(0.5)).toBeLessThan(dyingDim(0.2));
    expect(dyingDim(0.95)).toBe(0);
    expect(DYING_DEPTH_DROP).toBeGreaterThan(0);
    expect(DYING_DEPTH_DROP).toBeLessThan(1);
  });
});
