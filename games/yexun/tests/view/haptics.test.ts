import { describe, expect, it } from 'vitest';
import { createHaptics, HURT_GAP_MS } from '../../src/view/haptics.ts';

function make(over: { vibrate?: boolean; active?: boolean; enabled?: boolean; throws?: boolean } = {}) {
  const calls: unknown[] = [];
  const clock = { t: 1000 };
  const h = createHaptics({
    vibrate: over.vibrate === false ? undefined : (p) => {
      if (over.throws) throw new Error('blocked');
      calls.push(p);
      return true;
    },
    now: () => clock.t,
    active: () => over.active ?? true,
    enabled: () => over.enabled ?? true,
  });
  return { h, calls, clock };
}

describe('haptics', () => {
  it('挨打至少隔 400ms 才再震', () => {
    const { h, calls, clock } = make();
    h.hurt();
    clock.t += HURT_GAP_MS - 1;
    h.hurt();
    clock.t += 1;
    h.hurt();
    expect(calls).toEqual([20, 20]);
  });
  it('各档时长', () => {
    const { h, calls } = make();
    h.alert();
    h.big();
    h.down();
    expect(calls).toEqual([[40, 60, 40], 60, 120]);
  });
  it('开关关、非触屏或页面不可见、没有 API 时都不震，也不抛错', () => {
    for (const o of [{ enabled: false }, { active: false }, { vibrate: false }]) {
      const { h, calls } = make(o);
      h.hurt();
      h.down();
      expect(calls).toEqual([]);
    }
  });
  it('vibrate 抛错时吞掉', () => {
    const { h } = make({ throws: true });
    expect(() => h.down()).not.toThrow();
  });
});
