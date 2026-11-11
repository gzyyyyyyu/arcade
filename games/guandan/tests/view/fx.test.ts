import { describe, expect, it } from 'vitest';
import { bombDrama } from '../../src/view/guandan/highlights.ts';
import { PACE, STRIKE_MS, strikeParams } from '../../src/view/common/pace.ts';

describe('炸弹落桌的强度', () => {
  const keys = ['lift', 'rise', 'ring', 'ringWidth', 'sparks', 'dust', 'shake'] as const;

  it('四档每一项随档位单调递增，压扁的倍数单调变小', () => {
    for (let t = 1; t < 4; t++) {
      const a = strikeParams(t);
      const b = strikeParams(t + 1);
      for (const k of keys) expect(b[k], `${k} 档 ${t}→${t + 1}`).toBeGreaterThan(a[k]);
      expect(b.dip).toBeLessThan(a.dip);
    }
  });

  it('档位越界按边界算', () => {
    expect(strikeParams(0)).toEqual(strikeParams(1));
    expect(strikeParams(9)).toEqual(strikeParams(4));
  });

  it('砸下去加回弹在 220 毫秒内，不比大字飞入长多少', () => {
    expect(STRIKE_MS.slam + STRIKE_MS.settle).toBeLessThanOrEqual(220);
    expect(STRIKE_MS.slam).toBeLessThanOrEqual(200);
  });

  it('掼蛋三档的炸弹大字停留没变（落桌和大字同时播，总时长不加）', () => {
    expect([1, 2, 3].map((t) => PACE.bomb(t))).toEqual([610, 700, 790]);
    expect(bombDrama({ type: 'bomb', cards: [1, 2, 3, 4] })).toBe(1);
  });

  it('春天大字停留 0.9 秒，整段 1.2–2 秒', () => {
    const total = PACE.word.in + PACE.ddz.spring + PACE.word.out;
    expect(total).toBeGreaterThanOrEqual(1200);
    expect(total).toBeLessThanOrEqual(2000);
  });
});
