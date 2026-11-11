import { describe, expect, it } from 'vitest';
import { screenKind, shouldEnter } from '../src/view/motion.ts';
import { banNote, swappedInHand } from '../src/view/variants/sichuan-xuezhan/marks.ts';
import { tileOf } from '../src/core/tiles/index.ts';

describe('换页动效', () => {
  it('认出页面种类', () => {
    expect(screenKind('screen front')).toBe('front');
    expect(screenKind('screen game enter')).toBe('game');
    expect(screenKind('screen')).toBeNull();
  });
  it('只有种类变了才演，第一页不演', () => {
    expect(shouldEnter(null, 'front')).toBe(false);
    expect(shouldEnter('front', 'front')).toBe(false);
    expect(shouldEnter('front', 'lobby')).toBe(true);
    expect(shouldEnter('game', null)).toBe(false);
  });
});

describe('川麻手牌提示', () => {
  const w1 = tileOf(0, 0);
  const w2 = tileOf(1, 0);
  const t1 = tileOf(9, 0);
  it('换进来的牌：还在手里、且我打得不多才标', () => {
    expect(swappedInHand([w1, t1], [w1, w2], 0)).toEqual([w1]);
    expect(swappedInHand([w1, t1], [w1, t1], 2)).toEqual([w1, t1]);
    expect(swappedInHand([w1, t1], [w1, t1], 3)).toEqual([]);
    expect(swappedInHand(null, [w1], 0)).toEqual([]);
  });
  it('有缺先打缺的说明', () => {
    expect(banNote(0, [w1, t1])).toBe('先把缺的那门（万）打完才能打别的');
    expect(banNote(1, [t1])).toBe('先把缺的那门（筒）打完才能打别的');
    expect(banNote(0, [t1])).toBeNull();
    expect(banNote(-1, [w1])).toBeNull();
  });
});
