import { describe, expect, it } from 'vitest';
import { LIVE_TIERS, liveReturn } from '../src/core/live.ts';
import { RULES_VERSION } from '../src/core/types.ts';
import { Bank } from '../tools/fake-bank.ts';
import { beijingDay, handleLive, kindDaily, liveKindOf, type LiveEnv } from '../worker/live.ts';
import { BaseCore } from '../worker/pvp/base.ts';
import { HarborCore } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';
import type { Ports } from '../worker/pvp/api.ts';

/** 护航（DESIGN.md 12.1）、寻宝航线（11.1）实盘：POST api/escort/*、api/map/*。和悬赏出海共用 handleLive，这里测它们各自不一样的地方 */
const ORIGIN = 'https://game.example.com';
const T0 = Date.UTC(2026, 10, 9, 4, 0, 0);
const REF = 'haidao-0123456789abcdef';
type Kind = 'live' | 'td' | 'escort' | 'map';

function world(env: Partial<LiveEnv> = {}): { env: LiveEnv; bank: Bank; ports: Ports; base: BaseCore } {
  const bank = new Bank();
  const base = new BaseCore(new MemKv(), 'u1');
  const ports = { base: () => base, harbor: () => new HarborCore(new MemKv()) } as unknown as Ports;
  return { bank, base, ports, env: { WALLET: bank, ARCADE: { fetch: async () => Response.json({ user: { id: 'u1', displayName: '小王' } }) } as unknown as LiveEnv['ARCADE'], ...env } };
}
function post(kind: Kind, action: string, body: Record<string, unknown>): Request {
  if (action === 'buyin' && !('rules' in body)) body = { ...body, rules: RULES_VERSION };
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/games/haidao/api/${kind}/${action}`, {
    method: 'POST',
    headers: { cookie: '__Host-sid=x', 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).length), 'X-Arcade': '1', Origin: ORIGIN },
    body: text,
  });
}
const call = (w: ReturnType<typeof world>, kind: Kind, action: string, body: Record<string, unknown>) => handleLive(post(kind, action, body), w.env, w.ports, T0);
const today = (w: ReturnType<typeof world>, kind: Kind) =>
  handleLive(new Request(`${ORIGIN}/games/haidao/api/${kind}/today`, { headers: { cookie: '__Host-sid=x' } }), w.env, w.ports, T0);

describe.each([
  ['escort', 'he-', 4],
  ['map', 'hm-', 1],
] as const)('%s 实盘接口', (kind, ns, daily) => {
  it(`buyin：钱包 ref 加 ${ns} 前缀，金额是这一档的一份，每天默认 ${daily} 场`, async () => {
    const w = world();
    const r = await call(w, kind, 'buyin', { ref: REF, tier: 'mid' });
    expect(await r.json()).toMatchObject({ ok: true, user: 'u1', left: daily - 1, max: daily });
    expect(w.bank.calls[0]!.a).toMatchObject({ ref: `${ns}${REF}`, amount: LIVE_TIERS.mid.stake, tier: 'mid', op: `${ns}${REF}-in` });
    expect(await (await today(w, kind)).json()).toEqual({ ok: true, [kind]: { left: daily - 1, max: daily } });
  });

  it('settle 按钱包里那一份的金额 × 倍数，refund 原样退回', async () => {
    const w = world();
    await call(w, kind, 'buyin', { ref: REF, tier: 'small' });
    expect(await (await call(w, kind, 'settle', { ref: REF, tier: 'lux', bp: 13_000 })).json()).toMatchObject({ ok: true, credited: liveReturn(LIVE_TIERS.small.stake, 13_000) });
    const w2 = world();
    await call(w2, kind, 'buyin', { ref: REF, tier: 'small' });
    await call(w2, kind, 'refund', { ref: REF });
    expect(w2.bank.balance).toBe(10_000);
  });

  it('场次满了 429、不碰钱包；同一个 ref 重发不重复计；vars 可调', async () => {
    const w = world();
    for (let i = 0; i < daily; i++) expect((await call(w, kind, 'buyin', { ref: `${REF}${i}`, tier: 'small' })).status).toBe(200);
    expect((await call(w, kind, 'buyin', { ref: `${REF}0`, tier: 'small' })).status).toBe(200);
    const full = await call(w, kind, 'buyin', { ref: `${REF}x`, tier: 'small' });
    expect([full.status, await full.json()]).toEqual([429, { ok: false, error: 'live_daily', max: daily }]);
    expect(w.bank.calls.filter((c) => c.m === 'buyin')).toHaveLength(daily + 1);
    const key = kind === 'escort' ? 'HAIDAO_ESCORT_DAILY' : 'HAIDAO_MAP_DAILY';
    expect(kindDaily({ [key]: '3' }, kind)).toBe(3);
    expect(kindDaily({ [key]: 'x' }, kind)).toBe(daily);
  });

  it('场次和别的实盘分开记：今天悬赏出海、守岛打满了也不影响', async () => {
    const w = world({ HAIDAO_LIVE_DAILY: 1, HAIDAO_TD_DAILY: 1 });
    await call(w, 'live', 'buyin', { ref: 'haidao-aaaaaaaa', tier: 'small' });
    await call(w, 'td', 'buyin', { ref: 'haidao-bbbbbbbb', tier: 'small' });
    expect((await call(w, kind, 'buyin', { ref: REF, tier: 'small' })).status).toBe(200);
    expect(await w.base.slotLeft(kind, beijingDay(T0), daily)).toBe(daily - 1);
    expect(await w.base.slotLeft('live', beijingDay(T0), 1)).toBe(0);
  });

  it('任何一种命名空间开头的 ref 一律 400，不能拿别家的份子来结；没有兑换', async () => {
    const w = world();
    for (const p of ['hx-', 'ht-', 'he-', 'hm-']) expect((await call(w, kind, 'settle', { ref: `${p}${REF}`, tier: 'small', bp: 30_000 })).status).toBe(400);
    expect((await call(w, kind, 'exchange', { ref: REF, into: 'gold' })).status).toBe(404);
    expect(w.bank.calls).toHaveLength(0);
  });
});

describe('四种实盘的路径', () => {
  it('liveKindOf 只认四个前缀', () => {
    expect(['live', 'td', 'escort', 'map'].map((k) => liveKindOf(`/games/haidao/api/${k}/buyin`))).toEqual(['live', 'td', 'escort', 'map']);
    expect(liveKindOf('/games/haidao/api/pvp/find')).toBeNull();
  });
  it('悬赏出海的请求也不收护航、航线的前缀', async () => {
    const w = world();
    for (const p of ['he-', 'hm-']) expect((await call(w, 'live', 'settle', { ref: `${p}${REF}`, tier: 'small', bp: 30_000 })).status).toBe(400);
  });
});
