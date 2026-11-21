import { describe, expect, it } from 'vitest';
import { handleExchange } from '../../worker/exchange.ts';
import type { LiveEnv } from '../../worker/live.ts';

/** 铜钱换筹码的 Worker 接口：平台 /api/me 和钱包 RPC 都是假的，记录调用参数。 */
const ORIGIN = 'https://game.example.com';
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const LOGGED_IN = { user: { id: 'u1', username: 'zy', displayName: 'zy' } };
const OP = 'xc-abcdef1234';

function env(reply: unknown = { ok: true, wallet: { balance: 1 }, credited: 500, left: 1500 }, me: unknown = LOGGED_IN) {
  const calls: { method: string; args: unknown }[] = [];
  const rpc = {
    view: async (userId: string) => {
      calls.push({ method: 'view', args: userId });
      return { ok: true, wallet: { balance: 99, stakes: [] }, exchangeLeft: 1200, exchangeCap: 2000 };
    },
    exchange: async (args: unknown) => {
      calls.push({ method: 'exchange', args });
      return reply;
    },
  };
  const e: LiveEnv = { ARCADE: { fetch: async () => json(me) }, WALLET: rpc as unknown as LiveEnv['WALLET'], GATE: 'login' };
  return { e, calls };
}
function post(action: string, body: unknown, headers: Record<string, string> = { 'X-Arcade': '1', Origin: ORIGIN }): Request {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/games/yexun/api/exchange/${action}`, { method: 'POST', headers: { ...headers, 'content-length': String(new TextEncoder().encode(text).length) }, body: text });
}

describe('兑换接口', () => {
  it('do：按登录的人调 exchange，game 固定 yexun，回话原样带上账号', async () => {
    const { e, calls } = env();
    const res = await handleExchange(post('do', { op: OP, amount: 500, userId: 'evil', game: 'texas' }), e);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, credited: 500, left: 1500, user: 'u1' });
    expect(calls).toEqual([{ method: 'exchange', args: { userId: 'u1', game: 'yexun', op: OP, amount: 500 } }]);
  });
  it('view：只回今天的额度，不回钱包余额', async () => {
    const { e } = env();
    const body = await (await handleExchange(post('view', {}), e)).json();
    expect(body).toEqual({ ok: true, exchangeLeft: 1200, exchangeCap: 2000, user: 'u1' });
  });
  it('钱包的业务拒绝原样 200 转回', async () => {
    const { e } = env({ ok: false, error: 'exchange_cap', left: 0 });
    const res = await handleExchange(post('do', { op: OP, amount: 10 }), e);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, error: 'exchange_cap', left: 0 });
  });
  it('坏的 op、金额不去问钱包', async () => {
    for (const [op, amount] of [['abc-12345678', 10], ['xc-1', 10], [OP, 0], [OP, 1.5], [OP, -3], [OP, '10']] as const) {
      const { e, calls } = env();
      const res = await handleExchange(post('do', { op, amount }), e);
      expect(res.status).toBe(400);
      expect(calls).toEqual([]);
    }
  });
  it('跨站、没登录、单独部署、换了账号', async () => {
    expect((await handleExchange(post('do', { op: OP, amount: 1 }, { 'X-Arcade': '1', Origin: 'https://evil.example' }), env().e)).status).toBe(403);
    expect((await handleExchange(post('do', { op: OP, amount: 1 }), env(undefined, { user: null }).e)).status).toBe(401);
    expect((await handleExchange(post('do', { op: OP, amount: 1 }), {} as LiveEnv)).status).toBe(501);
    expect((await handleExchange(post('do', { op: OP, amount: 1, user: 'u2' }), env().e)).status).toBe(409);
  });
  it('钱包超时回 503（浏览器用同一个 op 重发）', async () => {
    const { e } = env();
    (e.WALLET as unknown as { exchange: () => Promise<unknown> }).exchange = () => new Promise(() => undefined);
    expect((await handleExchange(post('do', { op: OP, amount: 1 }), e, 20)).status).toBe(503);
  });
});
