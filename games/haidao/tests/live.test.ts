import { describe, expect, it } from 'vitest';
import { EXCHANGE_CHIPS, EXCHANGE_GOLD, EXCHANGE_PER_DAY, EXCHANGE_WOOD, LIVE_MAX_BP, LIVE_TIERS, LIVE_TIER_IDS, liveBp, liveReturn, liveSetup } from '../src/core/live.ts';
import { RULES_VERSION } from '../src/core/types.ts';
import { replayRaid } from '../src/core/pvp.ts';
import { botActions, runBattle, battleFingerprint } from '../src/core/index.ts';
import { handleLive, beijingDay, kindDaily, LIVE_DAILY_DEFAULT, type LiveEnv, type WalletRpc } from '../worker/live.ts';
import { BaseCore } from '../worker/pvp/base.ts';
import { HarborCore } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';
import type { Ports } from '../worker/pvp/api.ts';

/**
 * 悬赏出海（实盘）和单向兑换。
 * 假钱包：arcade-kit/testing 的 FakeBank / WalletService 依赖 cloudflare:workers，Node 里的 vitest 加载不了，
 * 这里照它的关键规则写一个最小的：按 op 去重、余额不够回 no_funds、结回清掉桌上那一份。
 */
const ORIGIN = 'https://game.example.com';
const T0 = Date.UTC(2026, 9, 27, 4, 0, 0);

class Bank implements WalletRpc {
  balance = 10_000;
  stakes = new Map<string, number>();
  ops = new Map<string, unknown>();
  calls: Array<{ m: string; a: Record<string, unknown> }> = [];
  private once(op: string, f: () => unknown): Promise<never> {
    if (!this.ops.has(op)) this.ops.set(op, f());
    return Promise.resolve(this.ops.get(op) as never);
  }
  view = async () => ({ ok: true as const, wallet: { balance: this.balance, stakes: [...this.stakes].map(([ref, amount]) => ({ game: 'haidao', ref, amount })) } });
  buyin = (a: Parameters<WalletRpc['buyin']>[0]) => {
    this.calls.push({ m: 'buyin', a });
    return this.once(a.op, () => {
      if (this.balance < a.amount) return { ok: false, error: 'no_funds' };
      this.balance -= a.amount;
      this.stakes.set(a.ref, (this.stakes.get(a.ref) ?? 0) + a.amount);
      return { ok: true, wallet: { balance: this.balance } };
    });
  };
  settle = (a: Parameters<WalletRpc['settle']>[0]) => {
    this.calls.push({ m: 'settle', a });
    return this.once(a.op, () => {
      if (!this.stakes.has(a.ref)) return { ok: false, error: 'no_stake' };
      this.stakes.delete(a.ref);
      this.balance += a.amount;
      return { ok: true, wallet: { balance: this.balance }, credited: a.amount };
    });
  };
  refund = (a: Parameters<WalletRpc['refund']>[0]) => {
    this.calls.push({ m: 'refund', a });
    return this.once(a.op, () => {
      const v = this.stakes.get(a.ref);
      if (v === undefined) return { ok: false, error: 'no_stake' };
      this.stakes.delete(a.ref);
      this.balance += v;
      return { ok: true, wallet: { balance: this.balance } };
    });
  };
}

function world(): { env: LiveEnv; bank: Bank; ports: Ports; base: BaseCore } {
  const bank = new Bank();
  const base = new BaseCore(new MemKv(), 'u1');
  const ports = { base: () => base, harbor: () => new HarborCore(new MemKv()) } as unknown as Ports;
  const env: LiveEnv = { WALLET: bank, ARCADE: { fetch: async () => Response.json({ user: { id: 'u1', displayName: '小王' } }) } as unknown as LiveEnv['ARCADE'] };
  return { env, bank, ports, base };
}

function post(action: string, body: unknown, headers: Record<string, string> = { 'X-Arcade': '1', Origin: ORIGIN }): Request {
  // buyin 默认带当前规则版本（和浏览器一样）；要测没带或带旧的，请求体里显式写 rules（undefined 表示不带）
  if (action === 'buyin' && body && typeof body === 'object' && !('rules' in body)) body = { ...body, rules: RULES_VERSION };
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/games/haidao/api/live/${action}`, {
    method: 'POST',
    headers: { cookie: '__Host-sid=x', 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).length), ...headers },
    body: text,
  });
}
const REF = 'haidao-0123456789abcdef';

describe('倍数表', () => {
  it('同档星越多倍数越大，0 星按摧毁率线性且不超过 1 星；档越高三星不降；都不超过 3 份', () => {
    let prev3 = 0;
    for (const id of LIVE_TIER_IDS) {
      const t = LIVE_TIERS[id];
      expect(liveBp(id, { stars: 0, destroyedPct: 49 })).toBeLessThan(t.bp[1]);
      expect(liveBp(id, { stars: 0, destroyedPct: 0 })).toBe(0);
      expect(liveBp(id, { stars: 0, destroyedPct: 40 })).toBeGreaterThan(liveBp(id, { stars: 0, destroyedPct: 20 }));
      expect(t.bp[1]).toBeLessThan(t.bp[2]);
      expect(t.bp[2]).toBeLessThan(t.bp[3]);
      expect(t.bp[3]).toBeLessThanOrEqual(LIVE_MAX_BP);
      expect(t.bp[3]).toBeGreaterThanOrEqual(prev3);
      prev3 = t.bp[3];
    }
  });
  it('liveReturn 按桌上的金额算、封顶 3 份', () => {
    expect(liveReturn(2000, 15_000)).toBe(3000);
    expect(liveReturn(2000, 99_999)).toBe(6000);
  });
  it('悬赏岛只由档位和种子决定，同种子同操作结果一致（和重放指纹一致）', () => {
    const s = liveSetup('mid', 7);
    expect(liveSetup('mid', 7)).toEqual(s);
    const acts = botActions(s, 'normal');
    const a = runBattle(s, acts);
    expect(replayRaid(s, acts).fingerprint).toBe(battleFingerprint(a.state));
  });
});

describe('Worker 实盘接口', () => {
  it('buyin：金额是这一档的一份，until = Worker 时钟 + 24 小时，回带账号；浏览器报的金额不看', async () => {
    const w = world();
    const r = await handleLive(post('buyin', { ref: REF, tier: 'small', amount: 1 }), w.env, w.ports, T0);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, user: 'u1' });
    expect(w.bank.calls[0]!.a).toMatchObject({ amount: 2000, tier: 'small', mode: 'client', until: T0 + 24 * 3600_000, op: `${REF}-in` });
  });
  it('buyin：rules 没带、不是整数、低于当前版本 → 409 need_reload，不碰钱包、不占当天场次', async () => {
    const w = world();
    for (const rules of [undefined, RULES_VERSION - 1, 0, 2.5, String(RULES_VERSION), null]) {
      const r = await handleLive(post('buyin', { ref: REF, tier: 'small', rules }), w.env, w.ports, T0);
      expect([r.status, await r.json()], String(rules)).toEqual([409, { ok: false, error: 'need_reload' }]);
    }
    expect(w.bank.calls).toHaveLength(0);
    expect(w.bank.balance).toBe(10_000);
    expect(await w.base.slotLeft('live', beijingDay(T0), 8)).toBe(8);
    // 当前版本照常带入
    expect((await handleLive(post('buyin', { ref: REF, tier: 'small', rules: RULES_VERSION }), w.env, w.ports, T0)).status).toBe(200);
  });
  it('settle：先 view 取桌上那一份，按它算（报大档也不多给）', async () => {
    const w = world();
    await handleLive(post('buyin', { ref: REF, tier: 'small' }), w.env, w.ports, T0);
    const r = await handleLive(post('settle', { ref: REF, tier: 'lux', bp: 15_000, stars: 3 }), w.env, w.ports, T0);
    expect(await r.json()).toMatchObject({ ok: true, credited: 3000 });
    expect(w.bank.balance).toBe(10_000 - 2000 + 3000);
  });
  it('refund 原样退回；bp 超上限 400', async () => {
    const w = world();
    await handleLive(post('buyin', { ref: REF, tier: 'mid' }), w.env, w.ports, T0);
    expect((await handleLive(post('settle', { ref: REF, tier: 'mid', bp: 30_001 }), w.env, w.ports, T0)).status).toBe(400);
    await handleLive(post('refund', { ref: REF }), w.env, w.ports, T0);
    expect(w.bank.balance).toBe(10_000);
  });
  it('单独部署 501、CSRF 403、没登录 401、平台不可用 503、换了账号 409、请求体太大 413', async () => {
    const w = world();
    expect((await handleLive(post('buyin', { ref: REF, tier: 'small' }), { WALLET: w.bank }, w.ports, T0)).status).toBe(501);
    expect((await handleLive(post('buyin', { ref: REF, tier: 'small' }, { 'X-Arcade': '1', Origin: 'https://evil.example' }), w.env, w.ports, T0)).status).toBe(403);
    const out = { ...w.env, ARCADE: { fetch: async () => Response.json({ user: null }) } as unknown as LiveEnv['ARCADE'] };
    expect((await handleLive(post('buyin', { ref: REF, tier: 'small' }), out, w.ports, T0)).status).toBe(401);
    const down = { ...w.env, ARCADE: { fetch: async () => new Response('x', { status: 500 }) } as unknown as LiveEnv['ARCADE'] };
    expect((await handleLive(post('buyin', { ref: REF, tier: 'small' }), down, w.ports, T0)).status).toBe(503);
    expect((await handleLive(post('refund', { ref: REF, user: 'u2' }), w.env, w.ports, T0)).status).toBe(409);
    const big = post('buyin', { ref: REF, tier: 'small', pad: 'x'.repeat(3000) });
    expect((await handleLive(big, w.env, w.ports, T0)).status).toBe(413);
    expect(w.bank.calls).toHaveLength(0);
  });
  it('钱包超时回 503', async () => {
    const w = world();
    w.bank.buyin = () => new Promise(() => undefined);
    expect((await handleLive(post('buyin', { ref: REF, tier: 'small' }), w.env, w.ports, T0, 20)).status).toBe(503);
  });
});

describe('单向兑换', () => {
  it('兑换在钱包里用独立的 hx- 命名空间：实盘 settle / refund 打不到兑换那一份，兑换也不能借实盘结过的 ref 白拿', async () => {
    const w = world();
    // 兑换卡在 buyin 之后（settle 0 一直不回），浏览器抢先拿兑换的钱包 ref 发实盘 settle 三倍
    w.bank.settle = () => new Promise(() => undefined);
    void handleLive(post('exchange', { ref: 'hdx-racexxxxxxx', into: 'gold' }), w.env, w.ports, T0, 20);
    await new Promise((r) => setTimeout(r, 0));
    const wref = w.bank.calls.find((c) => c.m === 'buyin')!.a.ref as string;
    expect(wref).toBe('hx-hdx-racexxxxxxx');
    const before = w.bank.calls.length;
    for (const action of ['settle', 'refund', 'buyin'] as const) {
      const r = await handleLive(post(action, { ref: wref, tier: 'small', bp: 30_000 }), w.env, w.ports, T0);
      expect([r.status, ((await r.json()) as { error: string }).error], action).toEqual([400, 'bad_ref']);
    }
    expect(w.bank.calls.length).toBe(before);
    // 实盘的 ref 拿去兑换：钱包里是另一份（hx- 前缀），照样扣一份小档，不会因为 op 重复白拿资源
    const w2 = world();
    await handleLive(post('buyin', { ref: REF, tier: 'small' }), w2.env, w2.ports, T0);
    await handleLive(post('settle', { ref: REF, bp: 10_000 }), w2.env, w2.ports, T0);
    const bal = w2.bank.balance;
    const ex = await handleLive(post('exchange', { ref: REF.slice(0, 40), into: 'gold' }), w2.env, w2.ports, T0);
    expect(await ex.json()).toMatchObject({ ok: true });
    expect(w2.bank.balance).toBe(bal - EXCHANGE_CHIPS);
  });
  it('一次扣一份小档、结回 0，换来的资源记成待领；同一个 ref 重发只扣一次', async () => {
    const w = world();
    const r1 = await handleLive(post('exchange', { ref: 'hdx-aaaaaaaaaaaa', into: 'wood' }), w.env, w.ports, T0);
    expect(await r1.json()).toMatchObject({ ok: true, pending: { raidId: 'hdx-aaaaaaaaaaaa', gold: 0, wood: EXCHANGE_WOOD }, left: EXCHANGE_PER_DAY - 1 });
    expect(w.bank.balance).toBe(10_000 - EXCHANGE_CHIPS);
    const r2 = await handleLive(post('exchange', { ref: 'hdx-aaaaaaaaaaaa', into: 'wood' }), w.env, w.ports, T0);
    expect(await r2.json()).toMatchObject({ ok: true, dup: true });
    expect(w.bank.balance).toBe(10_000 - EXCHANGE_CHIPS);
    const me = (await w.base.me(T0)) as { pending: unknown[] };
    expect(me.pending).toEqual([{ raidId: 'hdx-aaaaaaaaaaaa', gold: 0, wood: EXCHANGE_WOOD }]);
    // 结回 0：筹码归庄家，桌上不留
    expect(w.bank.stakes.size).toBe(0);
  });
  it('每天上限：第 3 次回 limit、不碰钱包；北京时间第二天恢复', async () => {
    const w = world();
    for (let i = 0; i < EXCHANGE_PER_DAY; i++) {
      const r = await handleLive(post('exchange', { ref: `hdx-day1-${i}xxxxx`, into: 'gold' }), w.env, w.ports, T0);
      expect(await r.json()).toMatchObject({ ok: true, pending: { gold: EXCHANGE_GOLD } });
    }
    const calls = w.bank.calls.length;
    const r3 = await handleLive(post('exchange', { ref: 'hdx-day1-9xxxxx', into: 'gold' }), w.env, w.ports, T0);
    expect(await r3.json()).toMatchObject({ ok: false, error: 'limit' });
    expect(w.bank.calls.length).toBe(calls);
    const next = T0 + 24 * 3600_000;
    expect(beijingDay(next)).not.toBe(beijingDay(T0));
    expect(await (await handleLive(post('exchange', { ref: 'hdx-day2-0xxxxx', into: 'gold' }), w.env, w.ports, next)).json()).toMatchObject({ ok: true });
  });
  it('余额不够：名额退回，不记待领', async () => {
    const w = world();
    w.bank.balance = 100;
    const r = await handleLive(post('exchange', { ref: 'hdx-poorxxxxxxx', into: 'gold' }), w.env, w.ports, T0);
    expect(await r.json()).toMatchObject({ ok: false, error: 'no_funds' });
    expect(await w.base.exchangeLeft(beijingDay(T0), EXCHANGE_PER_DAY)).toBe(EXCHANGE_PER_DAY);
    expect(((await w.base.me(T0)) as { pending: unknown[] }).pending).toHaveLength(0);
  });
  it('兑换写入：每步 ≤ 2 行', async () => {
    const kv = new MemKv();
    const b = new BaseCore(kv, 'u');
    let before = kv.writes;
    await b.exchangeBegin('hdx-wwwwwwwwww', '2026-10-27', 2);
    expect(kv.writes - before).toBeLessThanOrEqual(2);
    before = kv.writes;
    await b.exchangeDone('hdx-wwwwwwwwww', 'gold', { gold: 1, wood: 0 });
    expect(kv.writes - before).toBeLessThanOrEqual(2);
    before = kv.writes;
    await b.exchangeDone('hdx-wwwwwwwwww', 'gold', { gold: 1, wood: 0 });
    expect(kv.writes - before).toBe(0);
  });
});

describe('实盘每天场次上限', () => {
  it('vars HAIDAO_LIVE_DAILY：数字、数字字符串都认，没设或不合法按 8', () => {
    expect(LIVE_DAILY_DEFAULT).toBe(8);
    expect(kindDaily({}, 'live')).toBe(8);
    expect(kindDaily({ HAIDAO_LIVE_DAILY: 3 }, 'live')).toBe(3);
    expect(kindDaily({ HAIDAO_LIVE_DAILY: ' 12 ' }, 'live')).toBe(12);
    for (const bad of [0, -1, 2.5, 'abc', '', 5000]) expect(kindDaily({ HAIDAO_LIVE_DAILY: bad }, 'live')).toBe(8);
  });
  it('超了回 429 live_daily、不碰钱包；同一个 ref 重发不重复计；北京时间第二天恢复', async () => {
    const w = world();
    w.env.HAIDAO_LIVE_DAILY = '2';
    w.bank.balance = 1e9;
    for (let i = 0; i < 2; i++) {
      const r = await handleLive(post('buyin', { ref: `haidao-day-${i}-xxxx`, tier: 'small' }), w.env, w.ports, T0);
      expect(await r.json()).toMatchObject({ ok: true, left: 1 - i, max: 2 });
    }
    // 重发第一场（回话丢了）：不算新的一场，钱包按 op 只扣一次
    const again = await handleLive(post('buyin', { ref: 'haidao-day-0-xxxx', tier: 'small' }), w.env, w.ports, T0);
    expect(again.status).toBe(200);
    const calls = w.bank.calls.length;
    const r3 = await handleLive(post('buyin', { ref: 'haidao-day-9-xxxx', tier: 'small' }), w.env, w.ports, T0);
    expect(r3.status).toBe(429);
    expect(await r3.json()).toMatchObject({ ok: false, error: 'live_daily', max: 2 });
    expect(w.bank.calls.length).toBe(calls);
    const r4 = await handleLive(post('buyin', { ref: 'haidao-day-9-xxxx', tier: 'small' }), w.env, w.ports, T0 + 24 * 3600_000);
    expect(r4.status).toBe(200);
  });
  it('钱包拒了带入（余额不够）：这一场退回，不占名额', async () => {
    const w = world();
    w.env.HAIDAO_LIVE_DAILY = 1;
    w.bank.balance = 0;
    expect(await (await handleLive(post('buyin', { ref: 'haidao-poor-xxxx', tier: 'small' }), w.env, w.ports, T0)).json()).toMatchObject({ ok: false, error: 'no_funds' });
    expect(await w.base.slotLeft('live', beijingDay(T0), 1)).toBe(1);
  });
  it('GET today 回今天剩几场、剩几次兑换；单独部署 501', async () => {
    const w = world();
    await handleLive(post('buyin', { ref: REF, tier: 'small' }), w.env, w.ports, T0);
    const req = new Request(`${ORIGIN}/games/haidao/api/live/today`, { headers: { cookie: '__Host-sid=x' } });
    expect(await (await handleLive(req, w.env, w.ports, T0)).json()).toMatchObject({ ok: true, live: { left: 7, max: 8 }, exchange: { left: EXCHANGE_PER_DAY, max: EXCHANGE_PER_DAY } });
    const req2 = new Request(`${ORIGIN}/games/haidao/api/live/today`, { headers: { cookie: '__Host-sid=x' } });
    expect((await handleLive(req2, { WALLET: w.bank }, w.ports, T0)).status).toBe(501);
  });
  it('场次写入：每步 ≤ 2 行，重发不写', async () => {
    const kv = new MemKv();
    const b = new BaseCore(kv, 'u');
    let before = kv.writes;
    await b.slotBegin('live', 'haidao-wwwwwwww', '2026-10-27', 8);
    expect(kv.writes - before).toBe(1);
    before = kv.writes;
    await b.slotBegin('live', 'haidao-wwwwwwww', '2026-10-27', 8);
    expect(kv.writes - before).toBe(0);
  });
});
