import { describe, expect, it, vi } from 'vitest';
import { settleOnLeave, type Session } from '../../src/app/finish.ts';
import type { World } from '../../src/core/state.ts';

/** 只用到 settleOnLeave 读的几项 */
const sess = (seed: number | null, ended = false): Session => ({ liveRun: seed === null ? null : { seed, down: 0 }, ended }) as unknown as Session;
const world = (phase: World['phase']): World => ({ phase, tick: 4200, rushDown: 3 }) as unknown as World;
const rig = () => {
  const live = { progress: vi.fn(), leave: vi.fn(() => Promise.resolve()) };
  const finish = vi.fn(() => Promise.resolve());
  return { live, finish };
};

describe('离开页面时结实盘那一份（settleOnLeave）', () => {
  it('局已打完、结算页还没出：按终局结（finish 带 keepalive），不按中途离开结', async () => {
    const { live, finish } = rig();
    const w = world('over');
    await settleOnLeave(sess(5), w, live, finish);
    expect(finish).toHaveBeenCalledWith(w, false, true);
    expect(live.leave).not.toHaveBeenCalled();
  });

  it('还在打：先记下最新进度，再按中途离开结', async () => {
    const { live, finish } = rig();
    await settleOnLeave(sess(5), world('play'), live, finish);
    expect(live.progress).toHaveBeenCalledWith(5, 4200, 3);
    expect(live.leave).toHaveBeenCalledWith(5);
    expect(finish).not.toHaveBeenCalled();
  });

  it('不是实盘、已结算、没在对局：什么都不发', async () => {
    for (const [s, w] of [
      [sess(null), world('over')],
      [sess(5, true), world('over')],
      [sess(5), null],
    ] as const) {
      const { live, finish } = rig();
      await settleOnLeave(s, w, live, finish);
      expect(finish).not.toHaveBeenCalled();
      expect(live.leave).not.toHaveBeenCalled();
    }
  });
});
