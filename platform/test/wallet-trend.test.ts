import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../src/api.ts';
import { weekBalances, weekTrend } from '../src/features/wallet/wallet-trend.ts';

const H = 3_600_000;
// 北京时间 2026-10-28（周三）12:00；本周一是 10-26
const NOW = Date.UTC(2026, 9, 28, 4, 0, 0);
const at = (day: number, hour: number) => Date.UTC(2026, 9, day, hour - 8, 0, 0);
const e = (t: number, a: number): LedgerEntry => ({ at: t, t: 'settle', a });

describe('weekTrend', () => {
  it('正常：按天倒推，第一点是第一笔之前的余额', () => {
    const ledger = [e(at(26, 10), -500), e(at(27, 9), 300), e(at(27, 20), 100), e(at(28, 9), 50)];
    // 周三结束 1000；周二结束 950；周一结束 550；周一开始前 1050
    expect(weekBalances(1000, ledger, NOW)).toEqual([1050, 550, 950, 1000]);
    const t = weekTrend(1000, ledger, NOW);
    expect(t.points).toHaveLength(4);
    expect(t.points[0]!.x).toBe(0);
    expect(t.points[3]!.x).toBe(100);
    expect(t.points[0]!.y).toBeLessThan(t.points[1]!.y); // 1050 比 550 高
    expect(t.change).toBe(-50);
    expect(t.path.startsWith('M0 ')).toBe(true);
  });

  it('空流水：不画线', () => {
    const t = weekTrend(1000, [], NOW);
    expect(t.points).toEqual([]);
    expect(t.path).toBe('');
  });

  it('上周的流水不算', () => {
    expect(weekTrend(1000, [e(at(25, 23), 200)], NOW).path).toBe('');
  });

  it('只有一天：开头和今天两个点', () => {
    const t = weekTrend(900, [e(at(28, 1), -100)], NOW);
    expect(weekBalances(900, [e(at(28, 1), -100)], NOW)).toEqual([1000, 900]);
    expect(t.points).toHaveLength(2);
    expect(t.change).toBe(-100);
  });

  it('余额为 0：点都在范围内，不出 NaN', () => {
    const t = weekTrend(0, [e(at(27, 10), -400)], NOW);
    expect(weekBalances(0, [e(at(27, 10), -400)], NOW)).toEqual([400, 0, 0]);
    for (const p of t.points) {
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(48);
    }
    // 全是 0 的平线画在中线
    expect(weekTrend(0, [e(at(28, 1), 0)], NOW).points.every((p) => p.y === 24)).toBe(true);
  });

  it('跨 0 点按北京时间分天', () => {
    // UTC 周二 16:30 = 北京周三 00:30
    const ledger = [e(Date.UTC(2026, 9, 27, 16, 30), 10)];
    expect(weekBalances(110, ledger, NOW)).toEqual([100, 110]);
    expect(H).toBeGreaterThan(0);
  });
});
