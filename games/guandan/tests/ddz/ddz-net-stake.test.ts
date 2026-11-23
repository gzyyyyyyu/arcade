/**
 * 斗地主好友房实盘的桌（src/variants/doudizhu/net/stake.ts）和它接进联机规则的地方：纯函数，不起房间。
 * 真房间里的带入、结回、重试、收场在 tests/room/ddz-stake.spec.ts；带入、离开这些通用规矩的细节在 tests/stake/net-stake.test.ts（掼蛋，同一份实现）。
 */
import { describe, expect, it } from 'vitest';
import type { DdzResult } from '../../src/variants/doudizhu/core/index.ts';
import { hallRoom as H } from '../../src/net/hall.ts';
import { ddzView } from '../../src/variants/doudizhu/net/rules.ts';
import { canRebuy, parseStake, shareRef, stakeBegin, stakeDeal, stakeFinish, stakeRebuy, stakeRef, stakeSeated, stakeSettled, stakeView, type DdzStakeTable } from '../../src/variants/doudizhu/net/stake.ts';
import { RULES_V1, RULES_V2, ROOM_DEALS, WALLET_ID, payout, roomRef, stakeOptions } from '../../src/variants/doudizhu/stake/index.ts';
import { testKey } from '../../src/variants/guandan/net/rules.ts';

const KEY = testKey('ddz-net-stake');
const HHA = ['human', 'human', 'ai'] as const;

/** 地主 0 号赢 s 分：地主 +2s，两个农民各 −s */
function deal(s: number, landlord = 0): DdzResult {
  const delta = [0, 1, 2].map((x) => (x === landlord ? 2 * s : -s));
  return { landlord, bid: 1, bombs: 0, spring: null, landlordWon: true, s, mult: 1, capped: false, delta };
}

const settleAll = (t: DdzStakeTable, result: (id: string) => unknown = () => ({ ok: true })): DdzStakeTable => t.pending.reduce((a, e) => stakeSettled(a, e.id, result(e.id)), t);

describe('开房选项', () => {
  it('斗地主的 stake：没带是娱乐，认得的档位带上，别的拒绝', () => {
    expect(parseStake(undefined)).toBeNull();
    expect(parseStake('mid')).toBe('mid');
    expect(parseStake('huge')).toBeUndefined();
    expect(H.options!({ variant: 'ddz', stake: 'lux' })).toEqual({ variant: 'ddz', stake: 'lux' });
    expect(H.options!({ variant: 'ddz' })).toEqual({ variant: 'ddz', stake: null });
    expect(H.options!({ variant: 'ddz', stake: 'huge' })).toBeNull();
  });

  it('实盘房间开局用实盘的核心选项（3 副、每副 24 封顶、一场 ±50）；娱乐开明牌', () => {
    const fun = H.begin!(KEY, H.rulesVersion, { opts: { variant: 'ddz', stake: null }, seats: ['human', 'human', 'human'] } as never) as { g: { opts: unknown }; stake?: unknown };
    expect(fun.stake).toBeUndefined();
    expect(fun.g.opts).toEqual({ deals: 6, dealCap: 0, cap: 0, mingpai: true }); // 娱乐房间开明牌（0.34.0），实盘不开
    const real = H.begin!(KEY, H.rulesVersion, { opts: { variant: 'ddz', stake: 'small' }, seats: ['human', 'human', 'ai'] } as never) as { g: { opts: unknown }; stake?: DdzStakeTable };
    expect(real.g.opts).toEqual(stakeOptions(ROOM_DEALS));
    expect(stakeOptions(ROOM_DEALS)).toEqual({ deals: 3, dealCap: 24, cap: 50 });
    expect(real.stake!.rules).toBe(2);
    expect(real.stake!.tier).toBe('small');
  });
});

describe('开局和 ref', () => {
  it('每个真人座位记一笔带入（ddz-<hex>-s<座位>-in），电脑座位不记；ref 从密钥另一条流来，和掼蛋、单机的格式区分得开', () => {
    const t = stakeBegin(KEY, 'mid', HHA);
    expect(t.ref).toMatch(/^ddz-[0-9a-f]{16}$/);
    expect(stakeRef(KEY)).toBe(t.ref);
    expect(stakeRef(testKey('other'))).not.toBe(t.ref);
    expect(t.pending.map((e) => [e.id, e.seat, e.kind, e.amount])).toEqual([[`${t.ref}-s0-in`, 0, 'in', 10_000], [`${t.ref}-s1-in`, 1, 'in', 10_000]]);
    for (const e of t.pending) expect(e.id).toMatch(WALLET_ID);
    expect(t.book.seats.map((s) => s.paid)).toEqual(['pending', 'pending', 'no']);
    expect(() => roomRef('xyz')).toThrow();
    expect(/^(gd-|solo-)/.test(t.ref)).toBe(false);
  });

  it('真人不到 2 个：整场不计输赢，不带入，后来坐下的也不带入', () => {
    let t = stakeBegin(KEY, 'small', ['human', 'ai', 'ai']);
    expect(t.pending).toEqual([]);
    expect(t.book.seats.map((s) => s.paid)).toEqual(['refused', 'no', 'no']);
    expect(t.why[0]).toBe('need_two');
    t = stakeSeated(t, 1, 'human', 'bid');
    expect(t.pending).toEqual([]);
    expect(canRebuy(t, 0)).toBe(false);
    expect(stakeView(t, 0).why).toBe('need_two');
  });
});

describe('记账', () => {
  it('零和：电脑那家的分归庄家，庄家 + 到账座位 = 0；封顶多出来的也归庄家', () => {
    let t = settleAll(stakeBegin(KEY, 'small', HHA));
    expect(t.book.seats.map((s) => s.paid)).toEqual(['yes', 'yes', 'no']);
    t = stakeDeal(t, deal(3), 1, 'dealEnd');
    expect(t.book.seats.map((s) => s.points)).toEqual([6, -3, 0]);
    expect(t.book.house).toBe(-3);
    expect(t.book.house + t.book.seats.reduce((a, s) => a + s.points, 0)).toBe(0);
    // 同一副只记一次
    expect(stakeDeal(t, deal(3), 1, 'dealEnd')).toBe(t);
    // 0 号已经到 +48：再赢 s=2 → +52 夹到 +50，多出来的 2 分归庄家
    t = { ...t, book: { ...t.book, seats: t.book.seats.map((s, i) => (i === 0 ? { ...s, points: 48 } : s)), house: t.book.house - 42 } };
    t = stakeDeal(t, deal(2), 2, 'dealEnd');
    expect(t.book.seats[0]!.points).toBe(50);
    expect(t.book.house + t.book.seats.reduce((a, s) => a + s.points, 0)).toBe(0);
  });

  it('打满 3 副或牌局本身结束（一家到 ±50）就收场：每个到账的座位记一笔结回，结回额 = 一份 + 分 × 每分', () => {
    let t = settleAll(stakeBegin(KEY, 'small', HHA));
    for (let d = 1; d < ROOM_DEALS; d++) {
      t = stakeDeal(t, deal(1), d, 'dealEnd');
      expect(t.over).toBe(false);
    }
    t = stakeDeal(t, deal(1), ROOM_DEALS, 'gameOver');
    expect(t.over).toBe(true);
    expect(t.pending.map((e) => [e.id, e.kind, e.amount])).toEqual([
      [`${t.ref}-s0-out`, 'out', payout('small', 6)],
      [`${t.ref}-s1-out`, 'out', payout('small', -3)],
    ]);
    // 提前结束：牌局 gameOver
    const early = stakeDeal(settleAll(stakeBegin(KEY, 'small', HHA)), deal(20), 1, 'gameOver');
    expect(early.over).toBe(true);
  });
});

describe('换人、再带入', () => {
  it('被拒的重新带入：新 ref（<ref>s<座位>n2），再被拒也不卡', () => {
    let t = settleAll(stakeBegin(KEY, 'big', HHA), (id) => (id.endsWith('s0-in') ? { ok: false, error: 'no_funds' } : { ok: true }));
    expect(t.book.seats.map((s) => s.paid)).toEqual(['refused', 'yes', 'no']);
    expect(stakeView(t, 0).why).toBe('no_funds');
    expect(stakeView(t, 1).why).toBeNull();
    expect(canRebuy(t, 0)).toBe(true);
    expect(canRebuy(t, 1)).toBe(false);
    t = stakeRebuy(t, 0);
    expect(shareRef(t, 0)).toBe(`${t.ref}s0n2`);
    expect(t.pending.map((e) => e.id)).toEqual([`${t.ref}s0n2-s0-in`]);
    expect(canRebuy(t, 0)).toBe(false);
    t = settleAll(t);
    expect(t.book.seats[0]!.paid).toBe('yes');
  });

  it('两副之间离开：当场按现在的分结回；一副打到一半（叫分、出牌）离开：这副打完再结回；回来再带入一份', () => {
    let t = settleAll(stakeBegin(KEY, 'small', HHA));
    t = stakeDeal(t, deal(2), 1, 'dealEnd');
    const gone = stakeSeated(t, 0, 'ai', 'dealEnd');
    expect(gone.book.seats[0]!.paid).toBe('left');
    expect(gone.pending.map((e) => [e.kind, e.amount])).toEqual([['out', payout('small', 4)]]);
    // 打到一半
    const mid = stakeSeated(t, 1, 'ai', 'play');
    expect(mid.leaving?.[1]).toBe(true);
    expect(mid.pending).toEqual([]);
    const after = stakeDeal(mid, deal(1), 2, 'dealEnd');
    expect(after.book.seats[1]!.paid).toBe('left');
    expect(after.pending).toHaveLength(1);
    expect(after.pending[0]!.amount).toBe(payout('small', -2 - 1));
    // 回来
    const back = stakeSeated(settleAll(after), 1, 'human', 'dealEnd');
    expect(back.pending.map((e) => e.id)).toEqual([`${t.ref}s1n2-s1-in`]);
    // 关房：每个到账的座位结回
    expect(stakeFinish(settleAll(t)).pending.map((e) => e.kind)).toEqual(['out', 'out']);
  });
});

describe('视图', () => {
  it('旁观者和各座位看到每个座位的分和到账，被拒的原因只给本人', () => {
    const real = H.begin!(KEY, H.rulesVersion, { opts: { variant: 'ddz', stake: 'small' }, seats: ['human', 'human', 'ai'] } as never) as Parameters<typeof ddzView>[0];
    const v0 = ddzView(real, 0);
    expect(v0.stake!.seats.map((s) => s.paid)).toEqual(['pending', 'pending', 'no']);
    expect(v0.stake!.tier).toBe('small');
    expect(ddzView(real, null).stake!.why).toBeNull();
    expect(JSON.stringify(v0)).not.toContain('pending":[');
  });
});

describe('老房间（没有 rules 字段）按老数打完', () => {
  /** 现行规则出的桌去掉 rules 字段，就是 3 副之前开的房间；它的核心选项是老的 6 副、封顶 24、±40 */
  const legacy = (): DdzStakeTable => {
    const { rules: _drop, ...old } = settleAll(stakeBegin(KEY, 'small', HHA));
    return old;
  };

  it('新开的桌记着版本 2；老桌没有这个字段，规则回版本 1', () => {
    expect(stakeBegin(KEY, 'small', HHA).rules).toBe(RULES_V2.v);
    expect('rules' in legacy()).toBe(false);
    expect(stakeOptions(RULES_V1.roomDeals, RULES_V1)).toEqual({ deals: 6, dealCap: 24, cap: 40 });
  });

  it('6 副才收场：新规则 3 副就收，老桌打了 3 副还在继续', () => {
    let t = legacy();
    for (let d = 1; d <= 3; d++) t = stakeDeal(t, deal(1), d, 'dealEnd');
    expect(t.over).toBe(false);
    for (let d = 4; d < 6; d++) t = stakeDeal(t, deal(1), d, 'dealEnd');
    expect(t.over).toBe(false);
    t = stakeDeal(t, deal(1), 6, 'dealEnd');
    expect(t.over).toBe(true);
  });

  it('每分按老的 1/40：结回额 = 一份 + 分 × 50；分的封顶是 ±40 不是 ±50', () => {
    let t = legacy();
    t = { ...t, book: { ...t.book, seats: t.book.seats.map((s, i) => (i === 0 ? { ...s, points: 36 } : s)), house: t.book.house - 36 } };
    t = stakeDeal(t, deal(10), 1, 'gameOver');
    expect(t.book.seats[0]!.points).toBe(40);
    expect(t.pending.map((e) => [e.id, e.amount])[0]).toEqual([`${t.ref}-s0-out`, 2_000 + 40 * 50]);
    expect(payout('small', 40, RULES_V1)).toBe(4_000);
    expect(payout('small', 50, RULES_V2)).toBe(4_000);
  });

  it('老桌离开 / 关房的结回也按老的每分', () => {
    const t = stakeDeal(legacy(), deal(2), 1, 'dealEnd');
    expect(stakeFinish(t).pending.map((e) => e.amount)).toEqual([payout('small', 4, RULES_V1), payout('small', -2, RULES_V1)]);
    expect(payout('small', 4, RULES_V1)).toBe(2_200);
  });
});
