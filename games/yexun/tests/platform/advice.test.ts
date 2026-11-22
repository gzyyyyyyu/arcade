import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/content/enemies.ts';
import { adviceFor } from '../../src/app/finish.ts';
import { Ev } from '../../src/core/index.ts';
import type { World } from '../../src/core/state.ts';
import { RunTally } from '../../src/meta/records.ts';

const code = (k: string): number => ENEMIES.findIndex((e) => e.kind === k);
/** 一拍里挨了一下：hurtBy 是谁、掉多少血 */
function hurt(t: RunTally, by: number, dmg: number): void {
  t.feed({ tick: 1, hurtBy: by, ev: { n: 1, type: [Ev.Hurt], a: [dmg], b: [0] } } as unknown as World);
}

describe('新手倒下时的「下次试试」', () => {
  it('按怪的种类记掉了多少血，远程弹不记', () => {
    const t = new RunTally();
    hurt(t, code('jiangshi'), 9);
    hurt(t, code('jiangshi'), 9);
    hurt(t, code('paper'), 5);
    hurt(t, 1000 + 2, 30);
    expect(t.hurtByKind).toEqual({ jiangshi: 18, paper: 5 });
    expect(t.hurts).toBe(4);
    expect(t.worstFoe).toBe('jiangshi');
    expect(new RunTally().worstFoe).toBeNull();
  });

  it('前三局：跳尸打得最狠就讲跳尸，否则照第几局讲；第四局起不讲', () => {
    expect(adviceFor(1, 'jiangshi')).toMatch(/^跳尸打你最狠：.*怕火怕铃/);
    expect(adviceFor(3, 'jiangshi')).toMatch(/^跳尸打你最狠/);
    expect(adviceFor(1, 'paper')).toMatch(/走位/);
    expect(adviceFor(2, null)).toMatch(/新」法器/);
    expect(adviceFor(4, 'jiangshi')).toBeUndefined();
  });
});
