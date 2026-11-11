/**
 * src/app/tour.ts 的好友房锦标赛结束页：娱乐赛的名次进成就墙（achRoomTour），实盘赛、没上场的不算。
 * 弹窗和结束页的画面是假的；只看结束时调了哪些 fn。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ dialog: vi.fn() }));
vi.mock('../../src/view/dialog.ts', () => ({ dialog: m.dialog, askTopUp: vi.fn(), closeDialog: vi.fn() }));
vi.mock('../../src/view/tourroom.ts', () => ({ tourEndBody: vi.fn(() => ({})), tourOutBody: vi.fn(() => ({})) }));

import { createTour } from '../../src/app/tour.ts';
import type { App } from '../../src/app/state.ts';
import type { OnlineState } from '../../src/online.ts';

let fn: Record<string, ReturnType<typeof vi.fn>>;
let c: App;

function build(): ReturnType<typeof createTour> {
  fn = {};
  for (const k of ['achRoomTour', 'stopCountdown', 'forgetRoom', 'exitRoom']) fn[k] = vi.fn();
  c = { fn, ui: {}, online: { close: vi.fn() }, myName: '我', roomTourEnded: '' } as unknown as App;
  return createTour(c);
}

/** 6 人桌打完：真人坐 0 号和 2 号，名次表 order[0] 是冠军；我坐 me 号 */
function ended(o: { fun: boolean; me: number | null; order?: number[] }): OnlineState {
  const order = o.order ?? [2, 4, 0, 1, 3, 5];
  return {
    code: 'ABCD',
    you: o.me === null ? null : { seat: o.me },
    room: { status: 'over', seats: [{ name: '我' }, null, { name: '阿明' }, null, null, null] },
    view: {
      seats: order.map(() => ({ persona: 0 })),
      tour: { over: true, fun: o.fun, order, humans: [0, 2], places: order.map(() => null), prizes: o.fun ? null : order.map(() => 0) },
    },
  } as unknown as OnlineState;
}

beforeEach(() => {
  m.dialog.mockReset().mockResolvedValue('ok');
});

describe('好友房锦标赛结束', () => {
  it('娱乐赛：按全桌名次（含电脑）记成就，房间号做场次', async () => {
    await build().roomTourEnd(ended({ fun: true, me: 0 }));
    expect(fn.achRoomTour).toHaveBeenCalledExactlyOnceWith('ABCD', 3);
  });

  it('同一个房间的结束页只出一次，成就也只记一次', async () => {
    const t = build();
    await t.roomTourEnd(ended({ fun: true, me: 0 }));
    await t.roomTourEnd(ended({ fun: true, me: 0 }));
    expect(fn.achRoomTour).toHaveBeenCalledTimes(1);
  });

  it('实盘赛不记', async () => {
    await build().roomTourEnd(ended({ fun: false, me: 0 }));
    expect(fn.achRoomTour).not.toHaveBeenCalled();
  });

  it('旁观的（没上场）不记', async () => {
    await build().roomTourEnd(ended({ fun: true, me: null }));
    expect(fn.achRoomTour).not.toHaveBeenCalled();
  });
});
