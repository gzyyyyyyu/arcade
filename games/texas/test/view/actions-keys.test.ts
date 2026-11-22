import { describe, expect, it } from 'vitest';
import { arrowDir, potLabel, raiseStep } from '../../src/view/actions.ts';

describe('加注滑杆的一步', () => {
  it('一步一个大盲，Shift 五个', () => {
    expect(raiseStep(20, false)).toBe(20);
    expect(raiseStep(20, true)).toBe(100);
  });
  it('大盲异常小时至少 1', () => {
    expect(raiseStep(0, false)).toBe(1);
    expect(raiseStep(0, true)).toBe(5);
  });
  it('方向键：→ ↑ 加，← ↓ 减，别的键不动', () => {
    expect(arrowDir('arrowright')).toBe(1);
    expect(arrowDir('arrowup')).toBe(1);
    expect(arrowDir('arrowleft')).toBe(-1);
    expect(arrowDir('arrowdown')).toBe(-1);
    expect(arrowDir('f')).toBe(0);
  });
});

describe('赔率条上池子的叫法', () => {
  it('桌心没有池子（翻牌前）叫底池', () => expect(potLabel({ pot: 30, pots: [0] })).toBe('底池'));
  it('桌心有池子、这一轮还有人下注：数和桌心不一样，叫总池', () => expect(potLabel({ pot: 640, pots: [460] })).toBe('总池'));
  it('这一轮没人下注：和桌心一样，叫底池', () => expect(potLabel({ pot: 460, pots: [400, 60] })).toBe('底池'));
});
