import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, rngFor } from '../../src/core/rng.ts';

// 换成 arcade-kit/prng 之前用原来的实现算出的数（0.31.9）：存档续玩、每日题、电脑种子都靠同一个种子出同一串数，
// 包装换了底下的实现也得逐位一样。kit 那边另有四个游戏的黄金向量（arcade-kit test/prng.test.ts）。
describe('core/rng：换成 kit 的 prng 前后逐位一样', () => {
  it('hashSeed', () => {
    expect(hashSeed('guandan', 7, 'bot')).toBe(334093298);
  });

  it('rngFor 一条流：next、int、pick、原地 shuffle 接着取', () => {
    const r = rngFor('golden', 'deal', 1);
    expect([r.next(), r.next()]).toEqual([0.30187408649362624, 0.45879062660969794]);
    expect(r.int(108)).toBe(56);
    expect(r.pick(['a', 'b', 'c'])).toBe('c');
    const deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(r.shuffle(deck)).toBe(deck);
    expect(deck).toEqual([6, 1, 2, 3, 0, 8, 7, 9, 5, 4]);
  });

  it('createRng(hashSeed(…)) 和 rngFor(…) 是同一条流', () => {
    const a = createRng(hashSeed('x', 1));
    const b = rngFor('x', 1);
    expect([a.next(), a.int(1000)]).toEqual([b.next(), b.int(1000)]);
  });
});
