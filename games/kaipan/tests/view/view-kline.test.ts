import { describe, expect, it } from 'vitest';
import { buyPower, candles, intraday, volumes } from '../../src/view/trade/kline.ts';

/** K 线页的示意数据：收盘照真实涨跌，开高低、分时按「股票 + 交易日」稳定生成。 */
describe('K 线示意', () => {
  const moves = [1.2, -3.4, 0, 9.8, -8.1, 2.5, -0.4, 4.4];

  it('收盘照真实涨跌复利，开盘在昨收附近，最高最低包住开收；同一个 key 每次一样', () => {
    const cs = candles(moves, 'seed:ai_meme', 3);
    expect(cs).toEqual(candles(moves, 'seed:ai_meme', 3));
    expect(cs).not.toEqual(candles(moves, 'seed:gm_meme', 3));
    let prev = 100;
    cs.forEach((c, i) => {
      const m = moves[i] ?? 0;
      expect(c.c).toBeCloseTo(prev * (1 + m / 100), 9);
      expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c));
      expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c));
      expect(Math.abs(c.o - prev)).toBeLessThanOrEqual(Math.abs(c.c - prev) * 0.6 + 1e-9);
      prev = c.c;
    });
    // 封板：大涨没有上影线，大跌没有下影线
    expect(cs[3]!.h).toBe(Math.max(cs[3]!.o, cs[3]!.c));
    expect(cs[4]!.l).toBe(Math.min(cs[4]!.o, cs[4]!.c));
  });

  it('分时从 0 走到收盘；大涨封板后横着', () => {
    for (const m of [2.3, -1.7, 0, 9.9, -9.5]) {
      const p = intraday(m, `k:${m}`);
      expect(p[0]).toBeCloseTo(0, 9);
      expect(p.at(-1)).toBeCloseTo(m, 9);
      expect(intraday(m, `k:${m}`)).toEqual(p);
    }
    const sealed = intraday(9.9, 'k:seal');
    expect(Math.max(...sealed)).toBeLessThanOrEqual(9.9);
    const at = sealed.findIndex((v) => v >= 9.9);
    expect(sealed.slice(at).every((v) => v === 9.9)).toBe(true);
  });

  it('买卖力量封在 15%–85%，涨多偏买；量柱按涨跌幅、最大的为 1', () => {
    expect(buyPower([5, 6, 8])).toBeGreaterThan(0.5);
    expect(buyPower([-5, -6, -8])).toBeLessThan(0.5);
    expect(buyPower([40, 40, 40])).toBe(0.85);
    expect(buyPower([-40, -40, -40])).toBe(0.15);
    expect(buyPower([])).toBe(0.5);
    const v = volumes(moves);
    expect(Math.max(...v)).toBe(1);
    expect(v[3]).toBe(1);
  });
});
