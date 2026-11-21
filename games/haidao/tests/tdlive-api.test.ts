import { describe, expect, it } from 'vitest';
import { LIVE_STAKE } from '../src/content/livetable.ts';
import { liveReturn } from '../src/core/tdlive.ts';
import { RULES_VERSION } from '../src/core/types.ts';
import { Bank } from '../tools/fake-bank.ts';
import { beijingDay, handleLive, kindDaily, type LiveEnv } from '../worker/live.ts';
import { BaseCore } from '../worker/pvp/base.ts';
import { HarborCore } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';
import type { Ports } from '../worker/pvp/api.ts';

/** 悬赏守岛（DESIGN.md 10.5）：POST api/td/*。和悬赏出海共用 handleLive，这里测它们不一样的地方 */
const ORIGIN = 'https://game.example.com';
const T0 = Date.UTC(2026, 9, 28, 4, 0, 0);
const REF = 'haidao-0123456789abcdef';

function world(env: Partial<LiveEnv> = {}): { env: LiveEnv; bank: Bank; ports: Ports; base: BaseCore } {
  const bank = new Bank();
  const base = new BaseCore(new MemKv(), 'u1');
  const ports = { base: () => base, harbor: () => new HarborCore(new MemKv()) } as unknown as Ports;
  return { bank, base, ports, env: { WALLET: bank, ARCADE: { fetch: async () => Response.json({ user: { id: 'u1', displayName: '小王' } }) } as unknown as LiveEnv['ARCADE'], ...env } };
}
function post(kind: 'td' | 'live', action: string, body: Record<string, unknown>): Request {
  // buyin 默认带当前规则版本；要测没带，显式写 rules: undefined
  if (action === 'buyin' && !('rules' in body)) body = { ...body, rules: RULES_VERSION };
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/games/haidao/api/${kind}/${action}`, {
    method: 'POST',
    headers: { cookie: '__Host-sid=x', 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).length), 'X-Arcade': '1', Origin: ORIGIN },
    body: text,
  });
}
const td = (w: ReturnType<typeof world>, action: string, body: Record<string, unknown>, now = T0) => handleLive(post('td', action, body), w.env, w.ports, now);
const lv = (w: ReturnType<typeof world>, action: string, body: Record<string, unknown>, now = T0) => handleLive(post('live', action, body), w.env, w.ports, now);

describe('悬赏守岛接口', () => {
  it('buyin：钱包 ref 加 ht- 前缀，金额是这一档的一份，回带账号', async () => {
    const w = world();
    const r = await td(w, 'buyin', { ref: REF, tier: 'small' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, user: 'u1', left: 7, max: 8 });
    expect(w.bank.calls[0]!.a).toMatchObject({ ref: `ht-${REF}`, amount: LIVE_STAKE.small, tier: 'small', op: `ht-${REF}-in` });
    expect([...w.bank.stakes.keys()]).toEqual([`ht-${REF}`]);
  });
  it('四档都能带入守岛：钱包里按各档的一份扣', async () => {
    for (const tier of ['small', 'mid', 'big', 'lux'] as const) {
      const w = world();
      const r = await td(w, 'buyin', { ref: REF, tier });
      expect(r.status).toBe(200);
      expect(w.bank.calls[0]!.a).toMatchObject({ tier, amount: LIVE_STAKE[tier] });
    }
  });

  it('settle：按钱包里那一份的实际金额 × 倍数算，报大档也不多给；refund 原样退回', async () => {
    const w = world();
    await td(w, 'buyin', { ref: REF, tier: 'small' });
    const r = await td(w, 'settle', { ref: REF, tier: 'lux', bp: 12_000 });
    expect(await r.json()).toMatchObject({ ok: true, credited: liveReturn(LIVE_STAKE.small, 12_000) });
    expect(w.bank.balance).toBe(10_000 - LIVE_STAKE.small + liveReturn(LIVE_STAKE.small, 12_000));
    expect((await td(w, 'settle', { ref: REF, tier: 'small', bp: 30_001 })).status).toBe(400);
    const w2 = world();
    await td(w2, 'buyin', { ref: REF, tier: 'small' });
    expect(await (await td(w2, 'refund', { ref: REF })).json()).toMatchObject({ ok: true });
    expect(w2.bank.balance).toBe(10_000);
  });
  it('旧页面（rules 没带 / 太旧）→ 409 need_reload，不碰钱包、不占场次', async () => {
    const w = world();
    for (const rules of [undefined, RULES_VERSION - 1]) {
      const r = await td(w, 'buyin', { ref: REF, tier: 'small', rules });
      expect([r.status, await r.json()]).toEqual([409, { ok: false, error: 'need_reload' }]);
    }
    expect(w.bank.calls).toHaveLength(0);
    expect(await w.base.slotLeft('td', beijingDay(T0), 8)).toBe(8);
  });
  it('ref 命名空间三向互拒：出海见 ht- / hx-、守岛见 ht- / hx-、兑换见 ht- 都是 400 bad_ref', async () => {
    const w = world();
    for (const prefix of ['ht-', 'hx-']) {
      for (const action of ['buyin', 'settle', 'refund']) {
        const body = { ref: `${prefix}abcdefgh1234`, tier: 'small', bp: 0 };
        expect([action, (await lv(w, action, body)).status, (await td(w, action, body)).status]).toEqual([action, 400, 400]);
      }
    }
    expect((await lv(w, 'exchange', { ref: 'ht-abcdefgh1234', into: 'gold' })).status).toBe(400);
    expect(w.bank.calls).toHaveLength(0);
    // 守岛的 ref 不会撞上出海的：同一个浏览器 ref 两边各开一份，钱包里是两条不同的桌
    expect((await lv(w, 'buyin', { ref: REF, tier: 'small' })).status).toBe(200);
    expect((await td(w, 'buyin', { ref: REF, tier: 'small' })).status).toBe(200);
    expect([...w.bank.stakes.keys()].sort()).toEqual([REF, `ht-${REF}`].sort());
    // 出海的 settle 结不了守岛那一份，反过来也一样
    expect((await lv(w, 'settle', { ref: `ht-${REF}`, tier: 'small', bp: 30_000 })).status).toBe(400);
  });
  it('守岛用 54 位以内的 ref（加了 ht- 钱包才收）；没有 exchange', async () => {
    const w = world();
    expect((await td(w, 'buyin', { ref: 'a'.repeat(55), tier: 'small' })).status).toBe(400);
    expect((await td(w, 'buyin', { ref: 'a'.repeat(54), tier: 'small' })).status).toBe(200);
    expect((await td(w, 'exchange', { ref: REF, into: 'gold' })).status).toBe(404);
  });
  it('每日场次单独记：守岛打满不挡出海，反过来也一样；vars 可调；ref 重发不重复计', async () => {
    const w = world({ HAIDAO_TD_DAILY: '2' });
    expect(kindDaily(w.env, 'td')).toBe(2);
    for (let i = 0; i < 2; i++) expect((await td(w, 'buyin', { ref: `haidao-td-day-${i}-xxxx`, tier: 'small' })).status).toBe(200);
    expect((await td(w, 'buyin', { ref: 'haidao-td-day-0-xxxx', tier: 'small' })).status).toBe(200);
    const full = await td(w, 'buyin', { ref: 'haidao-td-day-9-xxxx', tier: 'small' });
    expect([full.status, await full.json()]).toEqual([429, { ok: false, error: 'live_daily', max: 2 }]);
    expect((await lv(w, 'buyin', { ref: 'haidao-live-day-xxxx', tier: 'small' })).status).toBe(200);
    const today = await handleLive(new Request(`${ORIGIN}/games/haidao/api/td/today`, { headers: { cookie: '__Host-sid=x' } }), w.env, w.ports, T0);
    expect(await today.json()).toEqual({ ok: true, td: { left: 0, max: 2 } });
    const liveToday = await handleLive(new Request(`${ORIGIN}/games/haidao/api/live/today`, { headers: { cookie: '__Host-sid=x' } }), w.env, w.ports, T0);
    expect(await liveToday.json()).toMatchObject({ live: { left: 7, max: 8 } });
    // 钱包拒了带入：这一场退回去
    const poor = world();
    poor.bank.balance = 0;
    expect((await (await td(poor, 'buyin', { ref: REF, tier: 'small' })).json())).toMatchObject({ ok: false, error: 'no_funds' });
    expect(await poor.base.slotLeft('td', beijingDay(T0), 8)).toBe(8);
  });
  it('没设 HAIDAO_TD_DAILY 按 8；单独部署（没有钱包）501', async () => {
    expect(kindDaily({}, 'td')).toBe(8);
    expect(kindDaily({ HAIDAO_TD_DAILY: 'x' }, 'td')).toBe(8);
    const out = world({ GATE: undefined });
    expect((await handleLive(post('td', 'buyin', { ref: REF, tier: 'small' }), { WALLET: out.bank }, out.ports, T0)).status).toBe(501);
  });
});
