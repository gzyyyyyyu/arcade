import { describe, expect, it } from 'vitest';
import { capacity, newProfile } from '../src/core/index.ts';
import { RULES_VERSION } from '../src/core/types.ts';
import { applyPending, rulesTooNew } from '../src/net/pvp.ts';
import { BaseCore, PROTECT_MS } from '../worker/pvp/base.ts';
import { HarborCore, MemHarbor } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';
import { handlePvp, type Ports, type PvpEnv } from '../worker/pvp/api.ts';

/** 浏览器侧把待扣 / 待领加进存档，和"没开打就放弃"（cancel） */
describe('待扣 / 待领进本地存档', () => {
  it('扣不到负数、领不超过仓库上限、处理过的跳过', () => {
    const p = newProfile();
    const cap = capacity(p);
    const r = applyPending(p, [
      { raidId: 'aaaaaaaa1', gold: -99999, wood: -10 },
      { raidId: 'aaaaaaaa2', gold: 10 ** 7, wood: 5 },
      { raidId: 'aaaaaaaa3', gold: 1, wood: 1 },
    ], ['aaaaaaaa3']);
    expect(r.fresh.map((x) => x.raidId)).toEqual(['aaaaaaaa1', 'aaaaaaaa2']);
    expect(r.profile.res.gold).toBe(cap.gold);
    expect(r.profile.res.wood).toBe(p.res.wood - 10 + 5);
    expect(p.res.gold).toBe(600);
  });
  it('并成一条的：明细里处理过的跳过，没处理过的各加一次，fresh 带明细的 raidId', () => {
    const p = { ...newProfile(), res: { gold: 1000, wood: 1000 } };
    const merged = {
      raidId: 'mmmmmmmm3',
      gold: -60,
      wood: -6,
      parts: [
        { raidId: 'mmmmmmmm1', gold: -10, wood: -1 },
        { raidId: 'mmmmmmmm2', gold: -20, wood: -2 },
        { raidId: 'mmmmmmmm3', gold: -30, wood: -3 },
      ],
    };
    const r = applyPending(p, [merged], ['mmmmmmmm1']);
    expect(r.fresh.map((x) => x.raidId)).toEqual(['mmmmmmmm2', 'mmmmmmmm3']);
    expect(r.profile.res).toEqual({ gold: 950, wood: 995 });
    expect(applyPending(r.profile, [merged], ['mmmmmmmm1', 'mmmmmmmm2', 'mmmmmmmm3']).fresh).toHaveLength(0);
  });
  it('仓库已经超上限时领东西不往下压', () => {
    const p = { ...newProfile(), res: { gold: 10 ** 6, wood: 0 } };
    expect(applyPending(p, [{ raidId: 'bbbbbbbb1', gold: 5, wood: 0 }], []).profile.res.gold).toBe(10 ** 6);
  });
});

describe('cancel：没开打就放弃', () => {
  const ORIGIN = 'https://game.example.com';
  const T0 = 1_800_000_000_000;
  function world(): { ports: Ports; env: PvpEnv; bases: Map<string, BaseCore> } {
    const bases = new Map<string, BaseCore>();
    const harbor = new HarborCore(new MemHarbor());
    const base = (id: string): BaseCore => {
      let b = bases.get(id);
      if (!b) bases.set(id, (b = new BaseCore(new MemKv(), id)));
      return b;
    };
    const ports = { base, harbor: () => harbor } as unknown as Ports;
    const env: PvpEnv = { ARCADE: { fetch: async () => Response.json({ user: { id: 'att', displayName: '小王' } }) } as unknown as PvpEnv['ARCADE'] };
    return { ports, env, bases };
  }
  const post = (path: string, body: unknown): Request => {
    const text = JSON.stringify(body);
    return new Request(`${ORIGIN}/games/haidao/api/pvp/${path}`, {
      method: 'POST',
      headers: { cookie: '__Host-sid=x', 'X-Arcade': '1', Origin: ORIGIN, 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).length) },
      body: text,
    });
  };

  it('放弃按空打结：防守方解锁、不掉东西，进攻方记一场输；放弃过的再交 finish 只回原结果，再放弃一次什么都不变', async () => {
    const w = world();
    const t1 = T0 + PROTECT_MS + 3600_000;
    const up = await w.ports.base('def').upload(newProfile(), '老李', T0);
    if (up.ok) await w.ports.harbor().upsert([up.entry]);
    await w.ports.base('att').upload(newProfile(), '小王', t1 - 3600_000);
    const f = await handlePvp(post('find', { rules: RULES_VERSION }), w.env, w.ports, t1);
    const start = (await f.json()) as { raidId: string; wanderer: boolean };
    expect(start.wanderer).toBe(false);
    const c = await handlePvp(post('cancel', { raidId: start.raidId }), w.env, w.ports, t1 + 1000);
    expect(await c.json()).toMatchObject({ ok: true, cancelled: true });
    const me = (await w.bases.get('def')!.me(t1 + 2000)) as { defenses: { stars: number; lost: { gold: number; wood: number } }[]; pending: unknown[] };
    expect(me.defenses).toHaveLength(1);
    expect(me.defenses[0]).toMatchObject({ stars: 0, lost: { gold: 0, wood: 0 } });
    expect(me.pending).toHaveLength(0);
    // 防守方又能被锁了（别人来打不会撞上 locked）
    const l = await w.bases.get('def')!.lock({ raidId: 'other00001', attackerId: 'x', attackerName: 'x', attackerTrophies: 0, army: { boats: [], skills: [], energy: 0 }, seed: 1 }, t1 + 3000);
    expect(l.ok).toBe(true);
    // 放弃过的再交 finish：回放弃时的结果（0 星），不能重打
    const fin = await handlePvp(post('finish', { raidId: start.raidId, actions: [], endTick: 0 }), w.env, w.ports, t1 + 4000);
    expect(await fin.json()).toMatchObject({ ok: true, stars: 0, dup: true, expired: true });
    const again = await handlePvp(post('cancel', { raidId: start.raidId }), w.env, w.ports, t1 + 5000);
    expect(await again.json()).toMatchObject({ ok: true, cancelled: false });
  });
});

describe('rulesTooNew：服务端的规则比本页新就不开打', () => {
  it('高于本页版本才算；相等、更低、没写都不算', () => {
    expect(rulesTooNew({ rules: RULES_VERSION + 1 })).toBe(true);
    expect(rulesTooNew({ rules: RULES_VERSION })).toBe(false);
    expect(rulesTooNew({ rules: RULES_VERSION - 1 })).toBe(false);
    expect(rulesTooNew({})).toBe(false);
  });
});
