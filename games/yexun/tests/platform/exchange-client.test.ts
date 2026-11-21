import { describe, expect, it } from 'vitest';
import { ExchangeClient } from '../../src/platform/exchange.ts';
import { coins, exchangeLog, fresh, mergeSave, newXcOp, reviveSave, type Save } from '../../src/platform/save.ts';

/** 换筹码：铜钱和 op 绑在一起，重试不重扣、不漏扣（流水只追加） */
const OP = 'xc-test0001';
const rich = (n = 10_000): Save => {
  const s = fresh();
  s.ledger.push(['run:a', n]);
  return s;
};
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const client = (s: Save, f: (url: string, init: RequestInit) => Promise<Response>, op = OP) => new ExchangeClient({ save: s, fetch: f, newOp: () => op });

describe('换筹码的流水', () => {
  it('全额入账：扣 3 倍铜钱，待办清掉', async () => {
    const s = rich();
    const r = await client(s, reply(200, { ok: true, credited: 500, left: 1500 })).exchange(500);
    expect(r).toEqual({ kind: 'ok', credited: 500, left: 1500 });
    expect(coins(s)).toBe(10_000 - 1500);
    expect(s.xc).toEqual([]);
  });
  it('只入一部分：没入账的铜钱退回', async () => {
    const s = rich();
    await client(s, reply(200, { ok: true, credited: 200, left: 0 })).exchange(500);
    expect(coins(s)).toBe(10_000 - 600);
  });
  it('额度用完、关了：全额退回', async () => {
    const s = rich();
    const r = await client(s, reply(200, { ok: false, error: 'exchange_cap', left: 0 })).exchange(500);
    expect(r).toEqual({ kind: 'reject', error: 'exchange_cap', left: 0 });
    expect(coins(s)).toBe(10_000);
  });
  it('钱不够：不发、不扣', async () => {
    const s = rich(100);
    let sent = 0;
    const r = await client(s, async () => {
      sent++;
      return new Response('{}');
    }).exchange(100);
    expect(r).toEqual({ kind: 'skip', why: 'coins' });
    expect(sent).toBe(0);
    expect(coins(s)).toBe(100);
  });
  it('连不上、钱包忙：先扣着；重发同一个 op，回 dup 按第一次的结果结，只扣一次', async () => {
    const s = rich();
    expect((await client(s, async () => Promise.reject(new Error('net'))).exchange(500)).kind).toBe('pending');
    expect((await client(s, reply(200, { ok: false, error: 'busy' })).resume())).toBe(0);
    expect(coins(s)).toBe(8_500);
    const ops: unknown[] = [];
    const n = await client(s, async (_u, init) => {
      ops.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ ok: true, dup: true, credited: 500, left: 1500 }));
    }).resume();
    expect(n).toBe(1);
    expect(ops).toEqual([{ op: OP, amount: 500 }]);
    expect(coins(s)).toBe(8_500);
    expect(s.xc).toEqual([]);
  });
  it('两台设备：待办合并后各结一次，退款流水按 id 只算一次', async () => {
    const a = rich();
    await client(a, async () => Promise.reject(new Error('net'))).exchange(500);
    const b = mergeSave(fresh(), reviveSave(JSON.parse(JSON.stringify(a)))!);
    await client(a, reply(200, { ok: true, credited: 100, left: 0 })).resume();
    await client(b, reply(200, { ok: true, dup: true, credited: 100, left: 0 })).resume();
    const m = mergeSave(a, b);
    expect(m.xc).toEqual([]);
    expect(coins(m)).toBe(10_000 - 300);
  });
  it('额度查询：view 的两个数，拿不到是 null', async () => {
    expect(await client(rich(), reply(200, { ok: true, exchangeLeft: 1200, exchangeCap: 2000 })).quota()).toEqual({ left: 1200, cap: 2000 });
    const c = client(rich(), reply(501, { ok: false, error: 'no_wallet' }));
    expect(await c.quota()).toBeNull();
    expect(c.unavailable).toBe(true);
  });
});

describe('换筹码页的本机流水', () => {
  it('新的在前；部分入账按实际算，被拒的不列，没结的标出来，时间从兑换号读', async () => {
    const s = rich();
    const t = Date.UTC(2026, 10, 21, 6, 5);
    await client(s, reply(200, { ok: true, credited: 500, left: 1500 }), newXcOp(t, 'aaaaaaaaaaaaaaaaaaaa')).exchange(500);
    await client(s, reply(200, { ok: false, error: 'exchange_cap', left: 0 }), 'xc-rejected01').exchange(100);
    await client(s, reply(200, { ok: true, credited: 200, left: 0 }), 'xc-partial001').exchange(1000);
    await client(s, reply(503, {}), 'xc-pending001').exchange(100);
    expect(exchangeLog(s, 4)).toEqual([
      { at: null, chips: 100, coins: 300, pending: true },
      { at: null, chips: 200, coins: 600, pending: false },
      { at: t, chips: 500, coins: 1500, pending: false },
    ]);
    expect(exchangeLog(s, 1)).toHaveLength(1);
  });
  it('兑换号合钱包的格式（8–64 位）', () => {
    const op = newXcOp(Date.UTC(2099, 0, 1), 'f'.repeat(20));
    expect(op).toMatch(/^xc-[A-Za-z0-9_-]{5,61}$/);
  });
});
