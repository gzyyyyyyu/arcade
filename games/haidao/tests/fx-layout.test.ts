import { describe, expect, it } from 'vitest';
import { clampCenter, pickSlot, topBlame } from '../src/view/fxlayout.ts';

describe('pickSlot：伤害数字错开', () => {
  it('没有别的数字时原位', () => {
    expect(pickSlot([], 100, 100)).toEqual({ dx: 0, dy: 0 });
  });
  it('原位被占就挪到不冲突的位置', () => {
    const s = pickSlot([{ x: 100, y: 100 }], 100, 100);
    expect(Math.abs(s.dx) + Math.abs(s.dy)).toBeGreaterThan(0);
    expect(Math.abs(s.dx) >= 28 || Math.abs(s.dy) >= 15).toBe(true);
  });
  it('连着来几个，前几个互不压住', () => {
    const act: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 4; i++) {
      const s = pickSlot(act, 50, 50);
      const p = { x: 50 + s.dx, y: 50 + s.dy };
      for (const a of act) expect(Math.abs(a.x - p.x) >= 28 || Math.abs(a.y - p.y) >= 15).toBe(true);
      act.push(p);
    }
  });
});

describe('clampCenter：提示不出屏', () => {
  it('靠右边缘被拉回', () => {
    expect(clampCenter(390, 160, 390, 8)).toBe(390 - 8 - 80);
  });
  it('靠左边缘被拉回', () => {
    expect(clampCenter(0, 160, 390, 8)).toBe(8 + 80);
  });
  it('在中间不动；屏幕太窄就居中', () => {
    expect(clampCenter(200, 160, 390, 8)).toBe(200);
    expect(clampCenter(10, 400, 390, 8)).toBe(195);
  });
});

describe('topBlame：谁造成了大部分伤亡', () => {
  it('占一半以上且至少 3 个', () => {
    expect(topBlame(new Map([['mortar', 6], ['cannon', 2]]))).toEqual({ kind: 'mortar', n: 6, total: 8 });
  });
  it('太分散或太少不点名', () => {
    expect(topBlame(new Map([['mortar', 2], ['cannon', 2], ['musket', 2]]))).toBeNull();
    expect(topBlame(new Map([['mortar', 2]]))).toBeNull();
  });
});
