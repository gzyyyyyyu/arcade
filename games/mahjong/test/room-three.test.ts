/**
 * 三人两房好友房（src/room/rules.ts 的 seatCount、opts.three）：3 个座位、娱乐实盘都能开、坐下换座、打完一场、视图不漏手牌。
 */
import type { SeatKind } from 'arcade-kit/protocol';
import { describe, expect, test } from 'vitest';
import type { XzView } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { mahjongRoom as G, type RoomAction, type RoomState } from '../src/room/rules.ts';
import { KEY } from './helpers.ts';

const RULES = { rounds: 4, cap: 3, swap: true, zimo: 'di', transfer: true, three: true };
const opts = () => G.options!({ variant: 'sichuan-xuezhan', stakes: 'fun', rules: RULES })!;
const begin = (seats: SeatKind[]): RoomState => G.begin!(KEY, 1, { opts: opts(), seats });
const must = (x: RoomState | { error: string }): RoomState => {
  if ('error' in x && typeof x.error === 'string') throw new Error(`unexpected error ${x.error}`);
  return x as RoomState;
};
const act = (s: RoomState, seat: number, a: RoomAction) => must(G.apply(s, seat, a));
const seatsOf = (s: RoomState) => {
  const a = G.actors!(s);
  return Array.isArray(a) ? a : a.seats;
};
const gv = (s: RoomState, seat: number | null) => G.view(s, seat).g as XzView;

function drive(s0: RoomState): RoomState {
  let s = s0;
  for (let k = 0; k < 100_000 && !G.over(s); k++) {
    const seats = seatsOf(s);
    if (!seats.length) {
      s = G.resume!(s);
      continue;
    }
    const seat = seats[0]!;
    s = act(s, seat, s.kinds[seat] === 'ai' ? G.ai(s, seat) : G.timeout!(s, seat));
  }
  return s;
}

describe('三人两房好友房', () => {
  test('选项：三人局 3 个座位，四人局不变，实盘也能开', () => {
    expect(G.seatCount!(opts())).toBe(3);
    expect(G.seatCount!(G.options!({ stakes: 'fun', rules: { ...RULES, three: false } })!)).toBe(4);
    expect(G.seatCount!(undefined)).toBe(4);
    for (const st of ['small', 'mid', 'big', 'lux']) expect(G.seatCount!(G.options!({ variant: 'sichuan-xuezhan', stakes: st, rules: RULES })!), st).toBe(3);
    expect(G.options!({ variant: 'sichuan-xuezhan', stakes: 'fun', rules: { ...RULES, flow: true } })).not.toBeNull();
  });

  test('开局只有 3 个座位，真人坐下、离座、再坐下都按 3 座', () => {
    let s = begin(['human', 'ai', 'ai']);
    expect(s.kinds).toHaveLength(3);
    expect(s.own).toEqual([true, false, false]);
    expect(gv(s, 0).seats).toHaveLength(3);
    s = must(G.seated!(s, 1, 'human'));
    expect(s.own).toEqual([true, true, false]);
    s = must(G.seated!(s, 0, 'ai'));
    expect(s.own).toEqual([false, true, false]);
    const v = G.view(s, null);
    expect(v.buying).toHaveLength(3);
    expect(v.own).toHaveLength(3);
  });

  test('一个真人加两个电脑打完一场，并停在再来一场', () => {
    const s = drive(begin(['human', 'ai', 'ai']));
    expect(s.done).toBe(true);
    expect(G.pause!(s)).not.toBeNull();
    expect(gv(s, 0).seats).toHaveLength(3);
  });

  test('kit 按房间的 4 个座位挨个要视图（othersSee）：桌上没有的第 4 个座位按旁观给，不抛错', () => {
    // 11-02：真人在声明窗口里回碰 / 过时，kit 要算"别人看到的有没有变"，会要座位 3 的视图；以前读到不存在的玩家，房间断开
    let s = begin(['human', 'ai', 'ai']);
    for (let k = 0; k < 2_000 && !G.over(s); k++) {
      expect(() => G.view(s, 3)).not.toThrow();
      expect(G.view(s, 3)).toEqual(G.view(s, null));
      const seats = seatsOf(s);
      if (!seats.length) {
        s = G.resume!(s);
        continue;
      }
      const seat = seats[0]!;
      s = act(s, seat, s.kinds[seat] === 'ai' ? G.ai(s, seat) : G.timeout!(s, seat));
    }
  });

  test('视图不漏别人的手牌', () => {
    let s = begin(['human', 'human', 'ai']);
    // 换三张阶段和摸打阶段各看一次
    for (let k = 0; k < 3; k++) {
      for (const seat of [0, 1, 2]) {
        const v = gv(s, seat);
        v.seats.forEach((x, i) => {
          if (i !== seat) expect(x.hand).toBeNull();
        });
        expect(v.me?.seat).toBe(seat);
      }
      const seats = seatsOf(s);
      if (!seats.length) break;
      s = act(s, seats[0]!, s.kinds[seats[0]!] === 'ai' ? G.ai(s, seats[0]!) : G.timeout!(s, seats[0]!));
    }
    expect(gv(s, null).me).toBeNull();
    gv(s, null).seats.forEach((x) => expect(x.hand).toBeNull());
  });
});
