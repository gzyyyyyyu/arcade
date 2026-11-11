/** 徽章亮相记录（src/features/badges/badge-seen.ts）：谁算新拿到的、坏数据容忍 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newlyEarned, readSeen, writeSeen } from '../src/features/badges/badge-seen';

describe('newlyEarned', () => {
  it('新拿到的算', () => {
    expect(newlyEarned({}, { a: 1, b: 0 })).toEqual(['a']);
  });
  it('升档的算', () => {
    expect(newlyEarned({ a: 1, b: 2 }, { a: 2, b: 2 })).toEqual(['a']);
  });
  it('降档不算', () => {
    expect(newlyEarned({ a: 3 }, { a: 2 })).toEqual([]);
  });
  it('没变化不算', () => {
    expect(newlyEarned({ a: 1, b: 0 }, { a: 1, b: 0 })).toEqual([]);
  });
});

describe('readSeen / writeSeen', () => {
  const store = new Map<string, string>();
  const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  });
  afterEach(() => {
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('没有记录返回 null，写了能读回', () => {
    expect(readSeen('u1')).toBeNull();
    writeSeen('u1', { a: 2 });
    expect(store.has('arcade.badgesSeen.u1')).toBe(true);
    expect(readSeen('u1')).toEqual({ a: 2 });
    expect(readSeen('u2')).toBeNull();
  });
  it('坏 JSON 和形状不对当没有', () => {
    store.set('arcade.badgesSeen.u1', '{坏');
    expect(readSeen('u1')).toBeNull();
    store.set('arcade.badgesSeen.u1', '[1,2]');
    expect(readSeen('u1')).toBeNull();
  });
  it('混着脏值时只留数字', () => {
    store.set('arcade.badgesSeen.u1', JSON.stringify({ a: 1, b: 'x', c: null }));
    expect(readSeen('u1')).toEqual({ a: 1 });
  });
  it('存不了不抛', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => null, setItem: () => { throw new Error('quota'); } },
    });
    expect(() => writeSeen('u1', { a: 1 })).not.toThrow();
  });
});
