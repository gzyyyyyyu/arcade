import { describe, expect, it } from 'vitest';
import { LIVE_BANDS, lineVerdict, meanSe2, replayStop, stopWhy, tierOf } from '../../tools/early-stop.ts';

// 造一条线：n 局，均值 m，两个值来回（标准差 = d）
const line = (n: number, m: number, d: number): number[] => Array.from({ length: n }, (_, i) => (i % 2 ? m + d : m - d));

describe('模拟提前停（tools/early-stop.ts）', () => {
  it('带和 balance.md 4.4 一致', () => {
    expect(LIVE_BANDS.small.normal).toEqual([0.6, 0.75]);
    expect(LIVE_BANDS.luxe.novice).toEqual([-0.1, 0]);
    expect(tierOf(false, 3)).toBe('large');
    expect(tierOf(true, 1)).toBe('medium');
    expect(tierOf(false, 1)).toBeUndefined();
  });

  it('一条线按要不要动系数定：超上限 +0.15 压、普通低于下限 0.10 以上抬、其余不用动；区间跨区不算定', () => {
    const band = LIVE_BANDS.medium.normal; // 0.45 ～ 0.60（11-07 起整体 +0.15）：压 > 0.75，抬 < 0.35
    expect(lineVerdict(line(200, 0.525, 0.1), band, 'normal')).toBe('keep');
    expect(lineVerdict(line(200, 0.67, 0.1), band, 'normal')).toBe('keep'); // 贴上限也不用动
    expect(lineVerdict(line(200, 0.42, 0.1), band, 'normal')).toBe('keep'); // 低于下限但不到 0.10
    expect(lineVerdict(line(200, 0.95, 0.1), band, 'normal')).toBe('over');
    expect(lineVerdict(line(200, 0.25, 0.1), band, 'normal')).toBe('under');
    expect(lineVerdict(line(200, 0.75, 0.1), band, 'normal')).toBeNull(); // 跨着上限 +0.15
    expect(lineVerdict(line(200, 0.35, 0.1), band, 'normal')).toBeNull(); // 跨着下限 −0.10
    // 小白偏低不管：多低都算不用动，只看会不会多发
    expect(lineVerdict(line(200, -0.35, 0.1), LIVE_BANDS.medium.novice, 'novice')).toBe('keep');
    expect(lineVerdict(line(200, 0.65, 0.1), LIVE_BANDS.medium.novice, 'novice')).toBe('over');
    expect(lineVerdict(line(10, 0.525, 1), band, 'normal')).toBeNull(); // 区间太宽
    const [m, s] = meanSe2([1, 1, 1]);
    expect([m, s]).toEqual([1, 0]);
  });

  it('两条线都定了才停，理由按多发 > 偏低 > 不用动；不到最少局数不停，到最多局数算跑满', () => {
    const ok = { novice: line(100, 0.225, 0.1), normal: line(100, 0.525, 0.1) };
    expect(stopWhy(ok, 'medium', 100, 100, 300)).toBe('不用动');
    expect(stopWhy(ok, 'medium', 50, 100, 300)).toBeNull();
    expect(stopWhy({ novice: ok.novice, normal: line(100, 0.95, 0.1) }, 'medium', 100, 100, 300)).toBe('多发');
    expect(stopWhy({ novice: ok.novice, normal: line(100, 0.2, 0.1) }, 'medium', 100, 100, 300)).toBe('偏低');
    expect(stopWhy({ novice: line(100, -0.15, 0.1), normal: ok.normal }, 'medium', 100, 100, 300)).toBe('不用动'); // 小白偏低不管
    const edge = { novice: ok.novice, normal: line(100, 0.75, 0.1) };
    expect(stopWhy(edge, 'medium', 100, 100, 300)).toBeNull();
    expect(stopWhy(edge, 'medium', 300, 100, 300)).toBe('跑满');
  });

  it('按批回放：停在第一个定了的批次，贴边的跑满', () => {
    expect(replayStop({ novice: line(300, 0.225, 0.1), normal: line(300, 0.525, 0.1) }, 'medium')).toEqual({ n: 100, why: '不用动' });
    expect(replayStop({ novice: line(300, 0.225, 0.1), normal: line(300, 0.75, 0.1) }, 'medium')).toEqual({ n: 300, why: '跑满' });
    expect(replayStop({ novice: line(120, 0.225, 0.1), normal: line(120, 0.75, 0.1) }, 'medium')).toEqual({ n: 120, why: '跑满' });
  });
});
