/**
 * 斗地主「不洗牌」玩法：成团发牌是 54 张的一个排列、同种子同结果、炸弹明显比经典多；
 * 整局能打完，被每副封顶截了的那副记 capped；经典玩法（不带 noShuffle）的结果没有变（ddz-mingpai 的整局哈希另外钉着）。
 */
import { describe, expect, it } from 'vitest';
import { rankOf } from '../../src/core/cards.ts';
import { rngFor } from '../../src/core/rng.ts';
import { decideDdz } from '../../src/variants/doudizhu/ai/index.ts';
import { DDZ_FUN, DDZ_NOSHUFFLE, type DdzAction, type DdzState, clumpDeck, createDdz, dispatchDdz, viewDdz } from '../../src/variants/doudizhu/core/index.ts';

function bombs(hand: readonly number[]): number {
  const n = new Map<number, number>();
  for (const c of hand) n.set(rankOf(c), (n.get(rankOf(c)) ?? 0) + 1);
  return [...n].filter(([r, k]) => k === 4 && r < 16).length + (n.has(16) && n.has(17) ? 1 : 0);
}

function playOut(s0: DdzState, seed: string): DdzState {
  let s = s0;
  for (let g = 0; g < 5000 && s.phase !== 'gameOver'; g++) {
    const a: DdzAction = s.phase === 'dealEnd' ? { type: 'next' } : decideDdz(viewDdz(s, s.turn), 'normal', `${seed}/${g}`)!;
    const r = dispatchDdz(s, a);
    expect(r.error).toBeNull();
    s = r.state;
  }
  return s;
}

describe('clumpDeck（不洗牌的一副牌）', () => {
  it('是 54 张的一个排列；同一条流两次一样', () => {
    const a = clumpDeck(rngFor('ns', 1));
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 54 }, (_, i) => i));
    expect(clumpDeck(rngFor('ns', 1))).toEqual(a);
    expect(clumpDeck(rngFor('ns', 2))).not.toEqual(a);
  });

  it('三家手里的炸弹平均比经典洗牌多得多（经典约 0.6，不洗牌 2–3）', () => {
    const N = 2000;
    let classic = 0;
    let clump = 0;
    for (let i = 0; i < N; i++) {
      const c = rngFor('cl', i).shuffle(Array.from({ length: 54 }, (_, k) => k));
      const d = clumpDeck(rngFor('ns', i));
      for (let s = 0; s < 3; s++) {
        classic += bombs(c.slice(s * 17, s * 17 + 17));
        clump += bombs(d.slice(s * 17, s * 17 + 17));
      }
    }
    expect(classic / N).toBeLessThan(0.8);
    expect(clump / N).toBeGreaterThan(2);
    expect(clump / N).toBeLessThan(3);
  });
});

describe('不洗牌的一局', () => {
  it('发的就是 clumpDeck 的牌（按种子、第几副、重发次数分流）', () => {
    const s = createDdz('ns-deal', { ...DDZ_FUN, ...DDZ_NOSHUFFLE }).state;
    const d = clumpDeck(rngFor('ns-deal', 'ddz-clump', s.dealNo, s.redeal));
    expect(new Set(s.hands.flat().concat(s.bottom))).toEqual(new Set(d));
    for (let i = 0; i < 3; i++) expect([...s.hands[i]!].sort((x, y) => x - y)).toEqual([...d.slice(i * 17, i * 17 + 17)].sort((x, y) => x - y));
  });

  it('整局打得完，同种子同操作结果一样，零和', () => {
    for (let i = 0; i < 5; i++) {
      const seed = `ns-game-${i}`;
      const a = playOut(createDdz(seed, { ...DDZ_FUN, ...DDZ_NOSHUFFLE }).state, seed);
      const b = playOut(createDdz(seed, { ...DDZ_FUN, ...DDZ_NOSHUFFLE }).state, seed);
      expect(a.scores).toEqual(b.scores);
      expect(a.results.length).toBe(DDZ_FUN.deals);
      expect(a.scores.reduce((x, y) => x + y, 0)).toBe(0);
    }
  });

  // 普通档电脑攥着炸弹不爱出，倍数很少到 48（真人乱炸时才常碰，ddz-stake-sim --fun --noshuffle 量）：这里把封顶压到 4 来验"截了就记"
  it('每副分不过封顶，截到的那副记 capped，没截到的不记', () => {
    let cappedSeen = 0;
    const cap = 4;
    for (let i = 0; i < 4; i++) {
      const seed = `ns-cap-${i}`;
      const s = playOut(createDdz(seed, { ...DDZ_FUN, ...DDZ_NOSHUFFLE, dealCap: cap }).state, seed);
      for (const r of s.results) {
        expect(r.s).toBeLessThanOrEqual(cap);
        expect(r.capped).toBe(r.bid * r.mult > cap);
        if (r.capped) cappedSeen++;
      }
    }
    expect(cappedSeen).toBeGreaterThan(0);
  });

  it('经典玩法照旧：每副封顶截了也不记 capped（实盘靠它判断一场封顶）', () => {
    const s = playOut(createDdz('ns-classic', { deals: 6, dealCap: 1, cap: 0 }).state, 'ns-classic');
    expect(s.results.some((r) => r.bid * r.mult > 1)).toBe(true);
    expect(s.results.every((r) => r.capped === false)).toBe(true);
  });
});
