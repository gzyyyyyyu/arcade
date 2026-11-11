import { describe, expect, it } from 'vitest';
import { arrowDir, raiseStep } from '../../src/view/actions.ts';

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
