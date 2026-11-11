/** room.ts 拆出去的纯函数（座位、限速、存储行）：不起 Durable Object 就能测，数字和顺序守住原来的行为。 */
import { describe, expect, it } from 'vitest';
import { loadPersist, NOBODY } from '../src/room-persist.ts';
import { busiestSender, chatAllow, emoteTake, hasEmotes, inboundOf, tokenTake, userInboundCap } from '../src/room-rate.ts';
import { aiSeat, emptySeat, humanSeat, randomSeats, releaseOf, sameGroup, validPlayers, validSeats } from '../src/room-seats.ts';

describe('room-seats', () => {
  it('sameGroup：出手的人离开、其余不变才算同一组', () => {
    const g = (seats: number[], group: string | null = null) => ({ seats, group });
    expect(sameGroup(g([0, 1, 2]), 1, g([0, 2]))).toBe(true);
    expect(sameGroup(g([0]), 0, g([]))).toBe(false);
    expect(sameGroup(g([0, 1], 'a'), 0, g([1], 'b'))).toBe(false);
  });

  it('validPlayers / validSeats / releaseOf', () => {
    const p = (userId: string) => ({ userId, name: userId });
    expect(validPlayers('123456', [p('a'), p('b')], 4)).toBe(true);
    expect(validPlayers('123456', [p('a'), p('a')], 4)).toBe(false);
    expect(validPlayers('ABCD', [p('a')], 4)).toBe(false);
    expect(validSeats([0, 2], 2, 4)).toBe(true);
    expect(validSeats([0, 0], 2, 4)).toBe(false);
    expect(releaseOf({ host: 'h', code: 'C' })).toEqual({ users: ['h'], code: 'C' });
    expect(releaseOf({ host: 'h', code: 'C', match: { users: ['a', 'b'] } }).users).toEqual(['a', 'b']);
  });

  it('randomSeats 不重复、在范围内；座位三种形态', () => {
    const s = randomSeats(3, 4);
    expect(new Set(s).size).toBe(3);
    expect(s.every((x) => x >= 0 && x < 4)).toBe(true);
    expect([emptySeat().kind, aiSeat().kind, humanSeat('u', 'n', null).kind]).toEqual(['empty', 'ai', 'human']);
  });
});

describe('room-rate', () => {
  it('chatAllow：间隔和每分钟条数', () => {
    const rate = { ms: 1000, perMin: 2 };
    const a = chatAllow(undefined, 10_000, rate);
    expect(a.ok).toBe(true);
    expect(chatAllow(a.times, 10_500, rate).ok).toBe(false);
    const b = chatAllow(a.times, 11_000, rate);
    expect(b.ok).toBe(true);
    expect(chatAllow(b.times, 12_000, rate).ok).toBe(false);
    expect(chatAllow(b.times, 80_000, rate).ok).toBe(true);
  });

  it('emoteTake / tokenTake：令牌桶按时间补', () => {
    let r = emoteTake(undefined, 0, { ms: 1000, burst: 2 });
    r = emoteTake(r.bucket, 0, { ms: 1000, burst: 2 });
    expect(r.ok).toBe(true);
    expect(emoteTake(r.bucket, 0, { ms: 1000, burst: 2 }).ok).toBe(false);
    expect(emoteTake(r.bucket, 1000, { ms: 1000, burst: 2 }).ok).toBe(true);
    const t = tokenTake(undefined, 0, 1, 1);
    expect(t.ok).toBe(true);
    expect(tokenTake(t.bucket, 500, 1, 1).ok).toBe(false);
    expect(tokenTake(t.bucket, 1500, 1, 1).ok).toBe(true);
  });

  it('入站份额：上限、已用、最多的人', () => {
    expect(userInboundCap(100, 0.4)).toBe(40);
    expect(userInboundCap(1, 0)).toBe(1);
    const pending = new Map([['b', 5]]);
    expect(inboundOf({ a: 3, b: 1 }, pending, 'b')).toBe(6);
    expect(busiestSender({ a: 3, b: 1 }, pending)).toEqual(['b', 6]);
    expect(hasEmotes(3)).toBe(true);
    expect(hasEmotes(0)).toBe(false);
  });
});

describe('room-persist', () => {
  it('loadPersist 给 0.1.0 的行补 owners / turnSeq', () => {
    const raw = JSON.stringify({ status: 'playing', gameSeq: 7, seats: [humanSeat('u', 'n', null), aiSeat()] });
    const st = loadPersist<unknown>(raw);
    expect(st.owners).toEqual(['u', NOBODY]);
    expect(st.turnSeq).toBe(7);
  });
});
