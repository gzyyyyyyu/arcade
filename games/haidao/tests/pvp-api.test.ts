import { describe, expect, it } from 'vitest';
import { battleFingerprint, botActions, newProfile, runBattle } from '../src/core/index.ts';
import type { BattleSetup, Profile } from '../src/core/index.ts';
import { replayRaid, wandererGain, wandererIsland } from '../src/core/pvp.ts';
import { RULES_VERSION } from '../src/core/types.ts';
import { BaseCore, FIND_PER_HOUR, HOUR, PAIR_PER_DAY, PROTECT_MS, SNAP_PER_HOUR, SPAR_PER_DAY } from '../worker/pvp/base.ts';
import { PVP_PREFIX, SNAPSHOT_MAX, handlePvp } from '../worker/pvp/api.ts';
import type { Ports, PvpEnv } from '../worker/pvp/api.ts';
import { HarborCore, MemHarbor } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';


const ORIGIN = 'https://game.test';
const T0 = 1_800_000_000_000;
const LATER = T0 + PROTECT_MS + 10 * 60_000;
const NAMES: Record<string, string> = { d: '小王', a: '小李', b: '小张' };

/** 假平台：cookie 里 __Host-sid=<userId> 就认成这个人；sid=anon 当没登录 */
function platform(mode: 'ok' | 'down' = 'ok'): PvpEnv['ARCADE'] {
  return {
    fetch: async (_url: string, init?: { headers?: { cookie?: string } }): Promise<Response> => {
      if (mode === 'down') return new Response('boom', { status: 500 });
      const id = /__Host-sid=([^;]+)/.exec(init?.headers?.cookie ?? '')?.[1] ?? '';
      if (id === 'anon') return Response.json({ user: null });
      return Response.json({ user: { id, displayName: NAMES[id] ?? id, ...(id === 'root' ? { isAdmin: true } : {}) } });
    },
  } as unknown as PvpEnv['ARCADE'];
}

class World {
  cores = new Map<string, BaseCore>();
  kvs = new Map<string, MemKv>();
  store = new MemHarbor();
  harbor = new HarborCore(this.store);
  ports = { base: (u: string) => this.core(u), harbor: () => this.harbor } as unknown as Ports;
  env: PvpEnv = { ARCADE: platform() };
  core(u: string): BaseCore {
    let c = this.cores.get(u);
    if (!c) {
      const kv = new MemKv();
      this.kvs.set(u, kv);
      c = new BaseCore(kv, u);
      this.cores.set(u, c);
    }
    return c;
  }
}

interface Opt {
  now?: number;
  headers?: Record<string, string>;
  noCsrf?: boolean;
  origin?: string;
  cookie?: string | null;
  contentLength?: number;
  ports?: Ports | null;
  env?: PvpEnv;
}
interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

async function call(w: World, uid: string, method: string, sub: string, body?: unknown, o: Opt = {}): Promise<Res> {
  // find / revenge 默认带当前规则版本（和浏览器一样）；要测没带或带旧的，请求体里显式写 rules（undefined 表示不带）
  if (method === 'POST' && (sub === 'find' || sub === 'revenge' || sub === 'challenge')) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (!('rules' in b)) body = { ...b, rules: RULES_VERSION };
  }
  const text = body === undefined ? undefined : JSON.stringify(body);
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.cookie !== null) headers.cookie = o.cookie ?? `__Host-sid=${uid}`;
  if (method !== 'GET' && !o.noCsrf) {
    headers['X-Arcade'] = '1';
    headers.Origin = o.origin ?? ORIGIN;
  }
  if (text !== undefined) headers['content-length'] = String(o.contentLength ?? new TextEncoder().encode(text).length);
  else if (o.contentLength !== undefined) headers['content-length'] = String(o.contentLength);
  const req = new Request(`${ORIGIN}${PVP_PREFIX}${sub}`, { method, headers, ...(text !== undefined ? { body: text } : {}) });
  const ports = o.ports === undefined ? w.ports : o.ports;
  const res = await handlePvp(req, o.env ?? w.env, ports, o.now ?? LATER);
  return { status: res.status, body: await res.json() };
}

const put = (w: World, uid: string, profile: unknown, o: Opt = {}): Promise<Res> => call(w, uid, 'PUT', 'snapshot', { profile }, { now: T0, ...o });
function attacker(): Profile {
  return { ...newProfile(), boats: [{ troop: 'sailor' }, { troop: 'gunner' }] };
}
function rich(): Profile {
  return { ...newProfile(), res: { gold: 3000, wood: 2500 } };
}
async function seeded(): Promise<World> {
  const w = new World();
  expect((await put(w, 'd', rich())).status).toBe(200);
  expect((await put(w, 'a', attacker())).status).toBe(200);
  return w;
}
/** uid 在港口名单里看到的、昵称为 name 的那一行的编号 */
async function refOf(w: World, uid: string, name: string): Promise<string> {
  const list = (await call(w, uid, 'GET', 'roster')).body.list as { ref: string; name: string }[];
  const e = list.find((x) => x.name === name);
  if (!e) throw new Error(`${uid} 的名单里没有 ${name}`);
  return e.ref;
}

describe('重放一致性（完整服务端流程）', () => {
  it('find → 浏览器本地 runBattle → finish：星数、摧毁率、指纹都一致，防守方回放也一致', async () => {
    const w = await seeded();
    const f = await call(w, 'a', 'POST', 'find');
    expect(f.status).toBe(200);
    expect(f.body.wanderer).toBe(false);
    expect(f.body.opponent.name).toBe('小王');
    const setup = JSON.parse(JSON.stringify(f.body.setup)) as BattleSetup;
    const actions = botActions(setup, 'normal');
    const local = runBattle(setup, actions);
    // 带上一堆浏览器自报的字段：一概不看
    const r = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions, stars: 0, pct: 0, gain: { gold: 1, wood: 1 }, lost: { gold: 0, wood: 0 } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.stars).toBe(local.result.stars);
    expect(r.body.pct).toBe(local.result.destroyedPct);
    expect(r.body.dup).toBe(false);
    expect(r.body.expired).toBe(false);
    // 防守方取回放
    const d = await call(w, 'd', 'GET', `defense/${f.body.raidId}`);
    expect(d.status).toBe(200);
    expect(d.body.attacker).toBe('小李');
    expect(d.body.stars).toBe(r.body.stars);
    expect(d.body.pct).toBe(r.body.pct);
    expect(d.body).not.toHaveProperty('attackerId');
    const rp = replayRaid(d.body.setup, d.body.actions, d.body.endTick);
    expect(rp.result.stars).toBe(r.body.stars);
    expect(rp.result.destroyedPct).toBe(r.body.pct);
    expect(rp.fingerprint).toBe(battleFingerprint(local.state));
  });

  it('浏览器自报 stars:3 / pct:100 / gain 被忽略：空操作仍是 0 星', async () => {
    const w = await seeded();
    const f = await call(w, 'a', 'POST', 'find');
    const r = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: [], stars: 3, pct: 100, gain: { gold: 99999, wood: 99999 }, lost: { gold: 99999, wood: 99999 } });
    expect(r.status).toBe(200);
    expect(r.body.stars).toBe(0);
    expect(r.body.pct).toBe(0);
    expect(r.body.lost).toEqual({ gold: 0, wood: 0 });
    expect(r.body.gain).toEqual({ gold: 0, wood: 0 });
    const me = await call(w, 'a', 'GET', 'me');
    expect(me.body.pending).toEqual([]);
  });

  it('finish 重复提交：第二次 dup:true，奖杯和待领不重复', async () => {
    const w = await seeded();
    const f = await call(w, 'a', 'POST', 'find');
    const actions = botActions(f.body.setup, 'normal');
    const r1 = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions });
    const me1 = (await call(w, 'a', 'GET', 'me')).body;
    const dm1 = (await call(w, 'd', 'GET', 'me')).body;
    const r2 = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions });
    expect(r1.body.dup).toBe(false);
    expect(r2.body.dup).toBe(true);
    expect(r2.body.stars).toBe(r1.body.stars);
    expect((await call(w, 'a', 'GET', 'me')).body).toEqual(me1);
    expect((await call(w, 'd', 'GET', 'me')).body).toEqual(dm1);
    expect(me1.pending).toHaveLength(1);
    expect(dm1.pending).toHaveLength(1);
    expect(dm1.defenses).toHaveLength(1);
  });

  it('finish 参数检查', async () => {
    const w = await seeded();
    const f = await call(w, 'a', 'POST', 'find');
    expect((await call(w, 'a', 'POST', 'finish', { raidId: 'short', actions: [] })).body.error).toBe('bad_raid');
    expect((await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: [], endTick: -1 })).body.error).toBe('bad_request');
    expect((await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: [], endTick: 1e9 })).body.error).toBe('bad_request');
    expect((await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: [{ t: 0, type: 'x' }] })).body.error).toBe('bad_actions');
    expect((await call(w, 'a', 'POST', 'finish', { raidId: 'nonexistent12', actions: [] })).status).toBe(404);
    // 别人交我的 raidId：没有这场
    expect((await call(w, 'd', 'POST', 'finish', { raidId: f.body.raidId, actions: [] })).status).toBe(404);
    // 提前结束
    const r = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: botActions(f.body.setup, 'normal'), endTick: 100 });
    expect(r.status).toBe(200);
    const d = await call(w, 'd', 'GET', `defense/${f.body.raidId}`);
    expect(d.body.endTick).toBe(100);
    expect(replayRaid(d.body.setup, d.body.actions, 100).result.destroyedPct).toBe(r.body.pct);
  });
});

describe('匹配（接口层）', () => {
  it('找人两次：24 小时内打过的人不再匹配，回流浪海盗岛', async () => {
    const w = await seeded();
    const f1 = await call(w, 'a', 'POST', 'find', undefined, { now: LATER });
    expect(f1.body.wanderer).toBe(false);
    // 锁过期后第二次找：旧的一场按空打结掉，d 因为 24 小时内打过被排除
    const f2 = await call(w, 'a', 'POST', 'find', undefined, { now: LATER + 10 * 60_000 });
    expect(f2.status).toBe(200);
    // 真人档都排除了 d：落到影子岛（打 d 的最新快照，d 不掉东西）
    expect(f2.body.wanderer).toBe(true);
    expect(f2.body.shadow).toBe('shadow');
    expect(f2.body.opponent.name).toBe('影子·小王');
    const dm = (await call(w, 'd', 'GET', 'me', undefined, { now: LATER + 10 * 60_000 })).body;
    expect(dm.defenses[0].stars).toBe(0);
    // 流浪海盗岛也能结算：不扣任何人
    const actions = botActions(f2.body.setup, 'normal');
    const r = await call(w, 'a', 'POST', 'finish', { raidId: f2.body.raidId, actions }, { now: LATER + 10 * 60_000 + 1000 });
    expect(r.body.wanderer).toBe(true);
    expect(r.body.shadow).toBe('shadow');
    expect(r.body.lost).toEqual({ gold: 0, wood: 0 });
    const dm2 = (await call(w, 'd', 'GET', 'me')).body;
    expect(dm2.pending).toEqual([]);
    // d 的防守记录多一条影子战：不能复仇、能看回放，回放和结果逐位一致
    expect(dm2.defenses[0]).toMatchObject({ raidId: f2.body.raidId, shadow: 'shadow', revenge: false, lost: { gold: 0, wood: 0 }, trophies: 0 });
    const rp = await call(w, 'd', 'GET', `defense/${f2.body.raidId}`);
    expect(replayRaid(rp.body.setup, rp.body.actions, rp.body.endTick).result.destroyedPct).toBe(r.body.pct);
    // 同一对人一天 PAIR_PER_DAY 场已满（真人一场 + 影子一场）：再找只剩流浪海盗岛
    const f3 = await call(w, 'a', 'POST', 'find', undefined, { now: LATER + 20 * 60_000 });
    expect(f3.body.shadow).toBeUndefined();
    expect(f3.body.opponent.name).toContain('流浪海盗');
  });

  it('还在锁着时第二次找：同样不会再匹配到同一人', async () => {
    const w = await seeded();
    const f1 = await call(w, 'a', 'POST', 'find');
    expect(f1.body.wanderer).toBe(false);
    const f2 = await call(w, 'a', 'POST', 'find', undefined, { now: LATER + 1000 });
    expect(f2.body.wanderer).toBe(true);
  });

  it('新号保护期内不会被匹配；没快照的不能找人', async () => {
    const w = await seeded();
    const f = await call(w, 'a', 'POST', 'find', undefined, { now: T0 + HOUR });
    expect(f.body.wanderer).toBe(true);
    const n = await call(w, 'nobody', 'POST', 'find');
    expect(n.status).toBe(409);
    expect(n.body.error).toBe('no_snapshot');
  });

  it('复仇：被打的人 24 小时内可以打回去，只能一次', async () => {
    const w = await seeded();
    const f = await call(w, 'a', 'POST', 'find');
    await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: botActions(f.body.setup, 'normal') });
    const rv = await call(w, 'd', 'POST', 'revenge', { raidId: f.body.raidId }, { now: LATER + 2000 });
    expect(rv.status).toBe(200);
    expect(rv.body.wanderer).toBe(false);
    expect(rv.body.opponent.name).toBe('小李');
    const again = await call(w, 'd', 'POST', 'revenge', { raidId: f.body.raidId }, { now: LATER + 3000 });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('revenged');
    expect((await call(w, 'd', 'POST', 'revenge', { raidId: 'bad' })).body.error).toBe('bad_raid');
  });
});

describe('接口把关', () => {
  it('写接口缺 X-Arcade 或 Origin 不对 → 403 csrf', async () => {
    const w = await seeded();
    for (const [sub, body] of [['find', undefined], ['finish', { raidId: 'xxxxxxxx1' }], ['ack', { raidIds: [] }], ['revenge', { raidId: 'xxxxxxxx1' }], ['snapshot', { profile: newProfile() }]] as const) {
      const method = sub === 'snapshot' ? 'PUT' : 'POST';
      const a = await call(w, 'a', method, sub, body, { noCsrf: true });
      expect([a.status, a.body.error], sub).toEqual([403, 'csrf']);
      const b = await call(w, 'a', method, sub, body, { origin: 'https://evil.test' });
      expect([b.status, b.body.error], sub).toEqual([403, 'csrf']);
      const c = await call(w, 'a', method, sub, body, { noCsrf: true, headers: { Origin: ORIGIN } });
      expect([c.status, c.body.error], sub).toEqual([403, 'csrf']);
      const d = await call(w, 'a', method, sub, body, { noCsrf: true, headers: { 'X-Arcade': '1' } });
      expect([d.status, d.body.error], sub).toEqual([403, 'csrf']);
    }
  });
  it('没 cookie / 平台说没登录 → 401 login；平台 500 → 503；GET 不要 csrf 头', async () => {
    const w = await seeded();
    const a = await call(w, 'a', 'GET', 'me', undefined, { cookie: null });
    expect([a.status, a.body.error]).toEqual([401, 'login']);
    const b = await call(w, 'a', 'POST', 'find', undefined, { cookie: null });
    expect([b.status, b.body.error]).toEqual([401, 'login']);
    const c = await call(w, 'a', 'PUT', 'snapshot', { profile: newProfile() }, { cookie: null });
    expect(c.status).toBe(401);
    const d = await call(w, 'anon', 'GET', 'me');
    expect([d.status, d.body.error]).toEqual([401, 'login']);
    const e = await call(w, 'a', 'GET', 'me', undefined, { env: { ARCADE: platform('down') } });
    expect([e.status, e.body.error]).toEqual([503, 'unavailable']);
    const f = await call(w, 'a', 'POST', 'find', undefined, { env: { ARCADE: platform('down') } });
    expect(f.status).toBe(503);
    expect((await call(w, 'a', 'GET', 'me')).status).toBe(200);
  });
  it('单独部署（没有 ARCADE 且 GATE 不是 login）或没有 ports → 501 no_platform', async () => {
    const w = await seeded();
    const a = await call(w, 'a', 'GET', 'me', undefined, { env: {} });
    expect([a.status, a.body.error]).toEqual([501, 'no_platform']);
    const b = await call(w, 'a', 'POST', 'find', undefined, { env: { GATE: 'x' } as PvpEnv });
    expect(b.status).toBe(501);
    const c = await call(w, 'a', 'GET', 'me', undefined, { ports: null });
    expect([c.status, c.body.error]).toEqual([501, 'no_platform']);
    // GATE=login 但没绑平台：不算单独部署，认不了人 → 503
    const d = await call(w, 'a', 'GET', 'me', undefined, { env: { GATE: 'login' } as PvpEnv });
    expect(d.status).toBe(503);
  });
  it('计量说忙（level 非 ok）→ 503 busy，不开新一场', async () => {
    const w = await seeded();
    const ports = { base: (u: string) => w.core(u), harbor: () => w.harbor, meter: { level: async () => 'stop', report: async () => undefined } } as unknown as Ports;
    const r = await call(w, 'a', 'POST', 'find', undefined, { ports });
    expect([r.status, r.body.error]).toEqual([503, 'busy']);
  });
  it('未知路径 / 方法 → 404', async () => {
    const w = await seeded();
    expect((await call(w, 'a', 'GET', 'nope')).status).toBe(404);
    expect((await call(w, 'a', 'POST', 'me', {})).status).toBe(404);
    expect((await call(w, 'a', 'GET', 'find')).status).toBe(404);
  });
  it('snapshot 体 > 16KB → 413；缺 content-length → 400', async () => {
    const w = await seeded();
    const r = await call(w, 'a', 'PUT', 'snapshot', { profile: newProfile() }, { contentLength: 20000 });
    expect([r.status, r.body.error]).toEqual([413, 'too_large']);
    expect(SNAPSHOT_MAX).toBe(16 * 1024);
    const big = { profile: newProfile(), pad: 'x'.repeat(SNAPSHOT_MAX) };
    expect((await call(w, 'a', 'PUT', 'snapshot', big)).status).toBe(413);
    const small = await call(w, 'a', 'POST', 'ack', { raidIds: [] }, { contentLength: 3000 });
    expect(small.status).toBe(413);
    const noLen = await call(w, 'a', 'POST', 'ack', undefined);
    expect(noLen.status).toBe(400);
  });
  it('坏快照 → 400 bad_snapshot 带 reason', async () => {
    const w = await seeded();
    const cases: Array<[string, (p: Profile) => void]> = [
      ['no_hq', (p) => p.base.buildings.push({ id: 50, kind: 'hq', level: 1, x: 0, y: 0 })],
      ['overlap', (p) => (p.base.buildings[2]!.x = p.base.buildings[1]!.x + 1)],
      ['locked', (p) => p.base.buildings.push({ id: 51, kind: 'mortar', level: 1, x: 0, y: 20 })],
      ['level', (p) => (p.base.buildings[1]!.level = 3)],
      ['research', (p) => (p.research = { sailor: 3 })],
    ];
    for (const [reason, mut] of cases) {
      const p = structuredClone(newProfile());
      mut(p);
      const r = await put(w, 'a', p);
      expect([r.status, r.body.error, r.body.reason], reason).toEqual([400, 'bad_snapshot', reason]);
    }
    expect((await put(w, 'a', 'junk')).body.reason).toBe('shape');
    const bad = await call(w, 'a', 'PUT', 'snapshot', [1, 2]);
    expect([bad.status, bad.body.error]).toEqual([400, 'bad_request']);
  });
  it('限流：快照第 31 次、找人超过 FIND_PER_HOUR（同一小时）→ 429 rate_limited', async () => {
    const w = new World();
    for (let i = 0; i < SNAP_PER_HOUR; i++) expect((await put(w, 'a', attacker())).status).toBe(200);
    const r = await put(w, 'a', attacker());
    expect([r.status, r.body.error]).toEqual([429, 'rate_limited']);
    expect((await put(w, 'a', attacker(), { now: T0 + HOUR })).status).toBe(200);
    for (let i = 0; i < FIND_PER_HOUR; i++) expect((await call(w, 'a', 'POST', 'find')).status).toBe(200);
    const f = await call(w, 'a', 'POST', 'find');
    expect([f.status, f.body.error]).toEqual([429, 'rate_limited']);
    // 1200 次找人：机器忙（负载 30–40）时单跑也要 6–7 秒
  }, 30_000);
  it('ack 参数检查；defense 参数检查', async () => {
    const w = await seeded();
    expect((await call(w, 'a', 'POST', 'ack', { raidIds: 'x' })).status).toBe(400);
    expect((await call(w, 'a', 'POST', 'ack', { raidIds: ['bad id'] })).status).toBe(400);
    expect((await call(w, 'a', 'POST', 'ack', { raidIds: Array.from({ length: 51 }, () => 'abcdefgh1') })).status).toBe(400);
    expect((await call(w, 'a', 'POST', 'ack', { raidIds: ['abcdefgh1'] })).body).toEqual({ ok: true, cleared: 0 });
    expect((await call(w, 'a', 'GET', 'defense/bad')).status).toBe(400);
    expect((await call(w, 'a', 'GET', 'defense/abcdefgh1')).status).toBe(404);
  });
  it('me 与 ack 走一圈：待扣 / 待领，ack 后清空', async () => {
    const w = await seeded();
    const f = await call(w, 'a', 'POST', 'find');
    await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: botActions(f.body.setup, 'normal') });
    const dm = (await call(w, 'd', 'GET', 'me')).body;
    const am = (await call(w, 'a', 'GET', 'me')).body;
    expect(dm.pending[0].gold).toBeLessThanOrEqual(0);
    expect(am.pending[0].gold).toBeGreaterThanOrEqual(0);
    expect(am.pending[0].gold).toBe(-dm.pending[0].gold + Math.floor(-dm.pending[0].gold / 2));
    expect((await call(w, 'd', 'POST', 'ack', { raidIds: [f.body.raidId] })).body.cleared).toBe(1);
    expect((await call(w, 'd', 'POST', 'ack', { raidIds: [f.body.raidId] })).body.cleared).toBe(0);
    expect((await call(w, 'd', 'GET', 'me')).body.pending).toEqual([]);
    expect(dm.shieldUntil).toBeGreaterThan(LATER);
  });
});

/** 能出兵、也有东西可抢的号（资源在 1 级主寨的仓库容量以内） */
function fighter(): Profile {
  return { ...rich(), boats: [{ troop: 'sailor' }, { troop: 'gunner' }] };
}
/** 先打一场流浪海盗岛攒点奖杯（从 0 起输不掉奖杯，看不出"记输"） */
async function warm(w: World, uid: string, now: number): Promise<number> {
  const f = await call(w, uid, 'POST', 'find', undefined, { now });
  expect(f.body.wanderer).toBe(true);
  await call(w, uid, 'POST', 'finish', { raidId: f.body.raidId, actions: botActions(f.body.setup, 'normal') }, { now: now + 1000 });
  const t = (await call(w, uid, 'GET', 'me', undefined, { now: now + 2000 })).body.trophies as number;
  expect(t).toBeGreaterThan(0);
  return t;
}
async function raid(w: World, att: string, now: number, idle = false): Promise<{ raidId: string; body: Res['body'] }> {
  const f = await call(w, att, 'POST', 'find', undefined, { now });
  expect(f.status).toBe(200);
  const r = await call(w, att, 'POST', 'finish', { raidId: f.body.raidId, actions: idle ? [] : botActions(f.body.setup, 'normal') }, { now: now + 1000 });
  expect(r.status).toBe(200);
  return { raidId: f.body.raidId, body: { ...r.body, opponent: f.body.opponent } };
}

describe('审阅修复①：两个号来回复仇刷资源', () => {
  async function pair(): Promise<World> {
    const w = new World();
    expect((await put(w, 'd', fighter())).status).toBe(200);
    expect((await put(w, 'a', fighter())).status).toBe(200);
    return w;
  }

  it('复仇不给系统赏金：拿到的不超过对方掉的；复仇的那一场不能再被复仇回去', async () => {
    const w = await pair();
    // 剧本：a 打 d（正常一场有系统赏金），d 复仇 a，a 再想"复仇的复仇"，来回刷
    const r1 = await raid(w, 'a', LATER);
    expect(r1.body.opponent.name).toBe('小王');
    expect(r1.body.lost.gold).toBeGreaterThan(0);
    expect(r1.body.gain.gold).toBeGreaterThan(r1.body.lost.gold);
    const rv = await call(w, 'd', 'POST', 'revenge', { raidId: r1.raidId }, { now: LATER + 5000 });
    expect(rv.status).toBe(200);
    // 预计掠夺也按"最多拿回对方掉的"给
    expect(rv.body.maxGain.gold).toBeLessThanOrEqual(Math.floor(3000 / 5));
    const r2 = await call(w, 'd', 'POST', 'finish', { raidId: rv.body.raidId, actions: botActions(rv.body.setup, 'normal') }, { now: LATER + 6000 });
    expect(r2.status).toBe(200);
    expect(r2.body.lost.gold).toBeGreaterThan(0);
    expect(r2.body.gain.gold).toBeLessThanOrEqual(r2.body.lost.gold);
    expect(r2.body.gain.wood).toBeLessThanOrEqual(r2.body.lost.wood);
    expect(r2.body.gain).toEqual(r2.body.lost);
    // 两边待领 / 待扣相加为零：没凭空多出资源
    const dp = (await call(w, 'd', 'GET', 'me', undefined, { now: LATER + 7000 })).body.pending.find((x: { raidId: string }) => x.raidId === rv.body.raidId);
    const ap = (await call(w, 'a', 'GET', 'me', undefined, { now: LATER + 7000 })).body.pending.find((x: { raidId: string }) => x.raidId === rv.body.raidId);
    expect(dp.gold + ap.gold).toBe(0);
    expect(dp.wood + ap.wood).toBe(0);
    // 重复交也按复仇算（不补发赏金）
    const dup = await call(w, 'd', 'POST', 'finish', { raidId: rv.body.raidId, actions: [] }, { now: LATER + 8000 });
    expect(dup.body.dup).toBe(true);
    expect(dup.body.gain).toEqual(r2.body.lost);
    // a 的防守记录里这一场标成不能复仇，硬调接口也被拒
    const am = (await call(w, 'a', 'GET', 'me', undefined, { now: LATER + 9000 })).body;
    expect(am.defenses.find((x: { raidId: string }) => x.raidId === rv.body.raidId).revenge).toBe(false);
    const back = await call(w, 'a', 'POST', 'revenge', { raidId: rv.body.raidId }, { now: LATER + 9000 });
    expect([back.status, back.body.error]).toEqual([409, 'revenged']);
  });

  it(`同一对人 24 小时内最多对打 ${PAIR_PER_DAY} 场，两个方向合计；超了 409 pair_limit`, async () => {
    expect(PAIR_PER_DAY).toBe(2);
    const w = await pair();
    // 剧本：a 找人打 d，d 找人打 a（都不是复仇，都能复仇），然后双方各自拿复仇再打一轮
    const r1 = await raid(w, 'a', LATER);
    expect(r1.body.opponent.name).toBe('小王');
    // d 这场不拆东西：a 不拿护盾，复仇时挡下它的只能是对打上限
    const r2 = await raid(w, 'd', LATER + 10_000, true);
    expect(r2.body.opponent.name).toBe('小李');
    const t = LATER + 20_000;
    const x = await call(w, 'a', 'POST', 'revenge', { raidId: r2.raidId }, { now: t });
    expect([x.status, x.body.error]).toEqual([409, 'pair_limit']);
    const y = await call(w, 'd', 'POST', 'revenge', { raidId: r1.raidId }, { now: t });
    expect([y.status, y.body.error]).toEqual([409, 'pair_limit']);
    // 匹配也不再配到对方
    expect((await call(w, 'a', 'POST', 'find', undefined, { now: t + 1000 })).body.wanderer).toBe(true);
    // 被 pair_limit 挡下的复仇没被用掉：仍在防守记录里显示可复仇
    const dm = (await call(w, 'd', 'GET', 'me', undefined, { now: t + 2000 })).body;
    expect(dm.defenses.find((z: { raidId: string }) => z.raidId === r1.raidId).revenge).toBe(true);
  });

  it('新号保护期里主动打人，保护马上结束，对方能复仇', async () => {
    const w = new World();
    expect((await put(w, 'd', fighter())).status).toBe(200);
    // a 是刚注册的新号，保护期内主动去打老号 d
    expect((await put(w, 'a', fighter(), { now: LATER })).status).toBe(200);
    expect((await call(w, 'a', 'GET', 'me', undefined, { now: LATER + 500 })).body.protectUntil).toBeGreaterThan(LATER);
    const r1 = await raid(w, 'a', LATER + 1000);
    expect(r1.body.opponent.name).toBe('小王');
    expect((await call(w, 'a', 'GET', 'me', undefined, { now: LATER + 4000 })).body.protectUntil).toBe(0);
    // 匹配索引在结算时（credit 回的 entry）就跟上，不等 a 下次上传快照
    expect(w.store.rows.get('a')!.protectUntil).toBeLessThanOrEqual(LATER + 4000);
    const rv = await call(w, 'd', 'POST', 'revenge', { raidId: r1.raidId }, { now: LATER + 5000 });
    expect(rv.status).toBe(200);
  });
});

describe('审阅修复③：同一个人并发找两次', () => {
  it('第一场的防守方马上解锁（别人能立刻锁），旧的一场按放弃结：进攻方记输、不能再交', async () => {
    const w = new World();
    expect((await put(w, 'd', rich())).status).toBe(200);
    expect((await put(w, 'a', attacker())).status).toBe(200);
    // b 是保护期内的新号：能去打人，但自己不会被匹配到（保证 a 第一次只会配到 d）
    expect((await put(w, 'b', attacker(), { now: T0 + PROTECT_MS - HOUR })).status).toBe(200);
    const t0 = await warm(w, 'a', T0 + HOUR);
    const f1 = await call(w, 'a', 'POST', 'find');
    expect(f1.body.opponent.name).toBe('小王');
    // 并发：第二个 find 的 prepare 在第一个 begin 之前读状态，看不到上一场（prev = null），只能靠 begin 发现
    const racing = {
      ...w.ports,
      base: (u: string) => {
        const c = w.core(u);
        if (u !== 'a') return c;
        return new Proxy(c, {
          get(target, k, recv) {
            if (k === 'prepare') return async (now: number) => ({ ...(await target.prepare(now)), prev: null });
            const v = Reflect.get(target, k, recv);
            return typeof v === 'function' ? v.bind(target) : v;
          },
        });
      },
      harbor: () => w.harbor,
    } as unknown as Ports;
    const f2 = await call(w, 'a', 'POST', 'find', undefined, { now: LATER + 1000, ports: racing });
    expect(f2.status).toBe(200);
    expect(f2.body.raidId).not.toBe(f1.body.raidId);
    // d 不用白白锁 4 分钟：b 马上就能锁到 d（匹配时把 a 排除掉，只看 d 能不能被锁）
    const onlyD = {
      ...w.ports,
      base: (u: string) => w.core(u),
      harbor: () => ({ upsert: w.harbor.upsert.bind(w.harbor), pick: (q: Parameters<HarborCore['pick']>[0], ms: number) => w.harbor.pick({ ...q, exclude: [...q.exclude, 'a'] }, ms) }),
    } as unknown as Ports;
    const fb = await call(w, 'b', 'POST', 'find', undefined, { now: LATER + 2000, ports: onlyD });
    expect(fb.body.wanderer).toBe(false);
    expect(fb.body.opponent.name).toBe('小王');
    // d 的防守记录：第一场按空打结了
    const dm = (await call(w, 'd', 'GET', 'me', undefined, { now: LATER + 3000 })).body;
    expect(dm.defenses.find((x: { raidId: string }) => x.raidId === f1.body.raidId)).toMatchObject({ stars: 0, pct: 0 });
    // a 记了一场输
    const am = (await call(w, 'a', 'GET', 'me', undefined, { now: LATER + 3000 })).body;
    expect(am.trophies).toBeLessThan(t0);
    // 旧的一场再交好操作也只回原来的 0 星，不重放、不改奖杯
    const late = await call(w, 'a', 'POST', 'finish', { raidId: f1.body.raidId, actions: botActions(f1.body.setup, 'normal') }, { now: LATER + 4000 });
    expect(late.status).toBe(200);
    expect(late.body).toMatchObject({ dup: true, stars: 0, pct: 0, gain: { gold: 0, wood: 0 } });
    expect(late.body.trophies).toBeLessThan(0);
    expect((await call(w, 'a', 'GET', 'me', undefined, { now: LATER + 5000 })).body.trophies).toBe(am.trophies);
    // 第二场照常能打
    const r2 = await call(w, 'a', 'POST', 'finish', { raidId: f2.body.raidId, actions: [] }, { now: LATER + 6000 });
    expect([r2.status, r2.body.dup]).toEqual([200, false]);
  });
});

describe('审阅修复⑦：取消 = 放弃', () => {
  it('取消后用同一个 raidId 交好操作：回原来的 0 星，不能重放；进攻方掉奖杯', async () => {
    const w = await seeded();
    const t0 = await warm(w, 'a', T0 + HOUR);
    // 剧本：开打看了一眼布局 / 打得不好就取消，再拿同一个种子交一份"最好的"操作
    const f = await call(w, 'a', 'POST', 'find');
    expect(f.body.wanderer).toBe(false);
    const c = await call(w, 'a', 'POST', 'cancel', { raidId: f.body.raidId }, { now: LATER + 1000 });
    expect(c.status).toBe(200);
    expect(c.body.cancelled).toBe(true);
    expect(c.body.trophies).toBeLessThan(0);
    expect(c.body.total).toBe(t0 + c.body.trophies);
    const best = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: botActions(f.body.setup, 'normal') }, { now: LATER + 2000 });
    expect(best.status).toBe(200);
    expect(best.body).toMatchObject({ dup: true, stars: 0, pct: 0, gain: { gold: 0, wood: 0 }, lost: { gold: 0, wood: 0 }, trophies: c.body.trophies });
    const am = (await call(w, 'a', 'GET', 'me', undefined, { now: LATER + 3000 })).body;
    expect(am.trophies).toBe(t0 + c.body.trophies);
    expect(am.pending.find((x: { raidId: string }) => x.raidId === f.body.raidId)).toBeUndefined();
    // 防守方：解锁、不掉东西，记一场 0 星
    const dm = (await call(w, 'd', 'GET', 'me', undefined, { now: LATER + 3000 })).body;
    expect(dm.pending).toEqual([]);
    expect(dm.defenses[0]).toMatchObject({ raidId: f.body.raidId, stars: 0, pct: 0 });
    // 再取消一次：不再算
    expect((await call(w, 'a', 'POST', 'cancel', { raidId: f.body.raidId }, { now: LATER + 4000 })).body.cancelled).toBe(false);
  });
});

describe('规则版本闸门：部署后还开着旧页面的人', () => {
  it('find / revenge 不带、带旧的、不是整数的 rules → 409 need_reload，什么都不扣不写', async () => {
    const w = await seeded();
    const f0 = await call(w, 'a', 'POST', 'find');
    await call(w, 'a', 'POST', 'finish', { raidId: f0.body.raidId, actions: botActions(f0.body.setup, 'normal') });
    const bad: unknown[] = [undefined, RULES_VERSION - 1, 0, 1.5, '6', null, true];
    // 被挡的请求不写存储：连发超过每小时次数上限也不会 429（429 说明 prepare 已经记了一次）
    for (let i = 0; i < FIND_PER_HOUR + 2; i++) {
      const a = await call(w, 'a', 'POST', 'find', { rules: bad[i % bad.length] }, { now: LATER + 9000 });
      expect([a.status, a.body], String(bad[i % bad.length])).toEqual([409, { ok: false, error: 'need_reload' }]);
    }
    for (const rules of bad) {
      const b = await call(w, 'd', 'POST', 'revenge', { raidId: f0.body.raidId, rules }, { now: LATER + 9000 });
      expect([b.status, b.body], String(rules)).toEqual([409, { ok: false, error: 'need_reload' }]);
    }
    // 复仇没被消耗：带对版本还能复仇
    const rv = await call(w, 'd', 'POST', 'revenge', { raidId: f0.body.raidId }, { now: LATER + 2000 });
    expect(rv.status).toBe(200);
  });
  it('rules 高于当前也放行（新页面连旧服务端的过渡期不被挡）', async () => {
    const w = await seeded();
    const r = await call(w, 'a', 'POST', 'find', { rules: RULES_VERSION + 1 });
    expect(r.status).toBe(200);
  });
});

describe('GET stats：真人攻防汇总，只给平台管理员', () => {
  it('没登录 401、普通玩家 403、平台连不上 403 不泄露、单独部署 501', async () => {
    const w = await seeded();
    expect((await call(w, 'a', 'GET', 'stats', undefined, { cookie: null })).status).toBe(401);
    const b = await call(w, 'a', 'GET', 'stats');
    expect([b.status, b.body]).toEqual([403, { ok: false, error: 'forbidden' }]);
    expect((await call(w, 'root', 'GET', 'stats', undefined, { env: { ARCADE: platform('down') } })).status).toBe(503);
    expect((await call(w, 'root', 'GET', 'stats', undefined, { env: {} })).status).toBe(501);
    expect((await call(w, 'root', 'GET', 'stats', undefined, { ports: null })).status).toBe(501);
  });

  it('一开始是空汇总；打一场记一场，放弃单独计数，汇总里没有 userId、昵称、raidId', async () => {
    const w = await seeded();
    const e = await call(w, 'root', 'GET', 'stats');
    expect(e.status).toBe(200);
    expect(e.body).toMatchObject({ ok: true, total: 0, cancelled: 0, counted: 0, cells: [] });
    const f = await call(w, 'a', 'POST', 'find');
    const actions = botActions(f.body.setup as BattleSetup, 'normal');
    const r = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions });
    // 重复交同一场不重复记
    await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions });
    // 另一场放弃（老王被打后有护盾，另找一个防守方）
    expect((await put(w, 'b', rich())).status).toBe(200);
    const f2 = await call(w, 'a', 'POST', 'find', {}, { now: LATER + 1000 });
    expect(f2.body.wanderer).toBe(false);
    await call(w, 'a', 'POST', 'cancel', { raidId: f2.body.raidId }, { now: LATER + 2000 });
    const s = await call(w, 'root', 'GET', 'stats');
    expect(s.body.total).toBe(2);
    expect(s.body.cancelled).toBe(1);
    expect(s.body.counted).toBe(1);
    expect(s.body.cells).toHaveLength(1);
    const c = s.body.cells[0];
    expect([c.diff, c.attHq, c.n]).toEqual([0, 1, 1]);
    expect(c.stars[r.body.stars]).toBe(1);
    expect(c.ge1).toBe(r.body.stars > 0 ? 1 : 0);
    expect(c.avgPct).toBeCloseTo(r.body.pct, 0);
    const text = JSON.stringify(s.body);
    for (const x of ['小王', '小李', f.body.raidId, '"a"', '"d"']) expect(text).not.toContain(x);
  });

  it('流浪海盗岛不进统计', async () => {
    const w = new World();
    expect((await put(w, 'a', attacker())).status).toBe(200);
    const f = await call(w, 'a', 'POST', 'find');
    expect(f.body.wanderer).toBe(true);
    await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: botActions(f.body.setup as BattleSetup, 'normal') });
    expect((await call(w, 'root', 'GET', 'stats')).body).toMatchObject({ total: 0, cells: [] });
  });
});

describe('影子岛 + 港口点名切磋（base.md 第①批）', () => {
  it('新号保护期里的人也能当影子：掠夺按流浪海盗岛公式、奖杯减半，防守方什么都不变', async () => {
    const w = await seeded();
    const now = T0 + HOUR;
    const before = (await call(w, 'd', 'GET', 'me', undefined, { now })).body;
    const f = await call(w, 'a', 'POST', 'find', undefined, { now });
    expect(f.body.shadow).toBe('shadow');
    const actions = botActions(f.body.setup, 'normal');
    const r = await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions }, { now: now + 1000 });
    const seed = f.body.setup.seed as number;
    expect(r.body.gain).toEqual(wandererGain(wandererIsland(0, 1, seed).loot, f.body.setup.layout, replayRaid(f.body.setup, actions).buildings));
    expect(r.body.trophies).toBe(r.body.stars > 0 ? Math.floor((10 + 5 * r.body.stars) / 2) : -5);
    const after = (await call(w, 'd', 'GET', 'me', undefined, { now: now + 2000 })).body;
    expect(after.trophies).toBe(before.trophies);
    expect(after.pending).toEqual([]);
    expect(after.protectUntil).toBe(before.protectUntil);
    // 进攻方打影子不结束自己的新手保护
    expect((await call(w, 'a', 'GET', 'me', undefined, { now: now + 2000 })).body.protectUntil).toBeGreaterThan(0);
  });

  it('自己不当自己的影子；只有自己时给流浪海盗岛', async () => {
    const w = new World();
    await put(w, 'a', attacker());
    const f = await call(w, 'a', 'POST', 'find');
    expect(f.body.shadow).toBeUndefined();
    expect(f.body.opponent.name).toContain('流浪海盗');
  });

  it('港口名单：不含自己，带昵称、主寨、奖杯和随机编号，不带 userId；14 天没上传的不在', async () => {
    const w = await seeded();
    await put(w, 'b', attacker(), { now: T0 - 15 * 24 * HOUR });
    const r = await call(w, 'a', 'GET', 'roster');
    expect(r.status).toBe(200);
    expect(r.body.list).toEqual([{ ref: expect.stringMatching(/^[0-9a-f]{16}$/), name: '小王', hq: 1, trophies: 0 }]);
    expect(JSON.stringify(r.body)).not.toMatch(/"id"|"userId"|"d"/);
    // 编号跟着这一行走：再上传一次不变
    const ref = r.body.list[0].ref;
    await put(w, 'd', rich());
    expect((await call(w, 'a', 'GET', 'roster')).body.list[0].ref).toBe(ref);
  });

  it(`点名切磋：拿名单编号切磋；不掠夺、不动奖杯、不丢护盾；对方记一条能切磋回去；同一对人每天 ${SPAR_PER_DAY} 场`, async () => {
    const w = await seeded();
    const ref = await refOf(w, 'a', '小王');
    for (let i = 0; i < SPAR_PER_DAY; i++) {
      const t = LATER + i * 10 * 60_000;
      const c = await call(w, 'a', 'POST', 'challenge', { ref }, { now: t });
      expect(c.status).toBe(200);
      expect(c.body.shadow).toBe('spar');
      expect(c.body.opponent.name).toBe('切磋·小王');
      expect(c.body.maxGain).toEqual({ gold: 0, wood: 0 });
      const r = await call(w, 'a', 'POST', 'finish', { raidId: c.body.raidId, actions: botActions(c.body.setup, 'normal') }, { now: t + 1000 });
      expect(r.body.gain).toEqual({ gold: 0, wood: 0 });
      expect(r.body.trophies).toBe(0);
    }
    const over = await call(w, 'a', 'POST', 'challenge', { ref }, { now: LATER + 40 * 60_000 });
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('spar_limit');
    const dm = (await call(w, 'd', 'GET', 'me')).body;
    expect(dm.defenses).toHaveLength(SPAR_PER_DAY);
    expect(dm.defenses[0].shadow).toBe('spar');
    expect(dm.trophies).toBe(0);
    expect(dm.pending).toEqual([]);
    // 切磋回去：按防守记录的 raidId，不需要知道对方 userId
    const back = await call(w, 'd', 'POST', 'challenge', { raidId: dm.defenses[0].raidId });
    expect(back.status).toBe(200);
    expect(back.body.opponent.name).toBe('切磋·小李');
    // 放弃的切磋不进对方记录
    await call(w, 'd', 'POST', 'cancel', { raidId: back.body.raidId });
    expect((await call(w, 'a', 'GET', 'me')).body.defenses).toEqual([]);
  });

  it('切磋参数和把关：乱填编号 400、不在名单里（含自己的编号）404、只给 userId 400、没带 rules 409 need_reload', async () => {
    const w = await seeded();
    const ref = await refOf(w, 'a', '小王');
    const own = await refOf(w, 'd', '小李');
    for (const bad of ['xyz', 'D'.repeat(16), `${ref}0`, '']) {
      const r = await call(w, 'a', 'POST', 'challenge', { ref: bad });
      expect([r.status, r.body.error]).toEqual([400, 'bad_ref']);
    }
    for (const gone of ['0123456789abcdef', own]) {
      const r = await call(w, 'a', 'POST', 'challenge', { ref: gone });
      expect([r.status, r.body.error]).toEqual([404, 'not_in_roster']);
    }
    expect((await call(w, 'a', 'POST', 'challenge', { userId: 'd' })).body.error).toBe('bad_request');
    expect((await call(w, 'a', 'POST', 'challenge', { ref, rules: undefined })).body.error).toBe('need_reload');
    expect((await call(w, 'a', 'POST', 'challenge', {})).body.error).toBe('bad_request');
    expect((await call(w, 'a', 'POST', 'challenge', { raidId: 'nonexistent12' })).status).toBe(404);
  });

  it('计量说忙 → 切磋也 503 busy，不开新一场', async () => {
    const w = await seeded();
    const ref = await refOf(w, 'a', '小王');
    const ports = { base: (u: string) => w.core(u), harbor: () => w.harbor, meter: { level: async () => 'busy', report: async () => undefined } } as unknown as Ports;
    const r = await call(w, 'a', 'POST', 'challenge', { ref }, { ports });
    expect([r.status, r.body.error]).toEqual([503, 'busy']);
    expect((await call(w, 'd', 'GET', 'me')).body.defenses).toEqual([]);
  });

  it('切磋时开着的护盾不丢', async () => {
    const w = await seeded();
    // d 先被 a 打一场拿到护盾（拆了东西给 8 小时）
    const f = await call(w, 'a', 'POST', 'find');
    await call(w, 'a', 'POST', 'finish', { raidId: f.body.raidId, actions: botActions(f.body.setup, 'normal') });
    const sh = (await call(w, 'd', 'GET', 'me')).body.shieldUntil;
    expect(sh).toBeGreaterThan(0);
    const c = await call(w, 'd', 'POST', 'challenge', { ref: await refOf(w, 'd', '小李') }, { now: LATER + 1000 });
    expect(c.status).toBe(200);
    expect((await call(w, 'd', 'GET', 'me', undefined, { now: LATER + 2000 })).body.shieldUntil).toBe(sh);
  });
});
