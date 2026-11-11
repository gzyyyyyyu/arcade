import { describe, expect, it } from 'vitest';
import { closeInStack, isTop, nextFocusIndex, openInStack } from '../src/features/modal/modal-logic.ts';

describe('弹窗栈：同一时间只开一个', () => {
  it('打开新的会要求关掉旧的', () => {
    expect(openInStack([], 'a')).toEqual({ stack: ['a'], toClose: [] });
    expect(openInStack(['a'], 'b')).toEqual({ stack: ['b'], toClose: ['a'] });
    expect(openInStack(['a'], 'a')).toEqual({ stack: ['a'], toClose: [] });
  });
  it('关闭和栈顶判断', () => {
    expect(closeInStack(['a', 'b'], 'b')).toEqual(['a']);
    expect(closeInStack(['a'], 'x')).toEqual(['a']);
    expect(isTop(['a', 'b'], 'b')).toBe(true);
    expect(isTop(['a', 'b'], 'a')).toBe(false);
    expect(isTop([], 'a')).toBe(false);
  });
});

describe('Tab 锁在弹窗里', () => {
  it('到头回绕', () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, 1, false)).toBe(2);
    expect(nextFocusIndex(3, 1, true)).toBe(0);
  });
  it('焦点在列表外时拉回头或尾，没有可聚焦元素返回 null', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(0, -1, false)).toBeNull();
  });
});
