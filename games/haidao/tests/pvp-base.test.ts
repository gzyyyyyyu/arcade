import { describe, expect, it } from 'vitest';
import { botActions, newProfile } from '../src/core/index.ts';
import type { BattleAction, BattleSetup, Profile } from '../src/core/index.ts';
import { raidGain, raidLoot, raidSetup, replayRaid, wandererIsland } from '../src/core/pvp.ts';
import { sampleProfile } from '../tools/sample.ts';
import { BaseCore, FIND_PER_HOUR, HOUR, LOCK_MS, PENDING_MAX, PROTECT_MS, SNAP_PER_HOUR, capDefenses, pieces, pushPending } from '../worker/pvp/base.ts';
import type { BaseState, Defense, HarborEntry, Pending } from '../worker/pvp/base.ts';
import { finishRaid } from '../worker/pvp/api.ts';
import type { Ports } from '../worker/pvp/api.ts';
import { HarborCore, MemHarbor } from '../worker/pvp/harbor.ts';
import { MemKv } from '../worker/pvp/kv.ts';


const T0 = 1_800_000_000_000;
/** 过了新号保护、也过了"最近在线"的时刻 */
const LATER = T0 + PROTECT_MS + 10 * 60_000;

class World {
  kvs = new Map<string, MemKv>();
  cores = new Map<string, BaseCore>();
  harborStore = new MemHarbor();
  harbor = new HarborCore(this.harborStore);
  ports = { base: (u: string) => this.core(u), harbor: () => this.harbor } as unknown as Ports;
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
  kv(u: string): MemKv {
    this.core(u);
    return this.kvs.get(u)!;
  }
  /** 存储里的状态（已落盘的那份） */
  state(u: string): BaseState {
    return this.kv(u).data.get('s') as BaseState;
  }
  /** 直接改 BaseCore 内存里的缓存状态（测试造数据用；落盘要等下一次写） */
  edit(u: string, fn: (s: BaseState) => void): void {
    fn((this.core(u) as unknown as { s: BaseState }).s);
  }
}

function rich(): Profile {
  const p = newProfile();
  return { ...p, res: { gold: 10000, wood: 5000 } };
}

/** 防守方 d 用大仓库的新档，进攻方 a 用典型部队；都在 T0 上传 */
async function seed(w: World, def = 'd', att = 'a'): Promise<void> {
  await w.core(def).upload(rich(), '防守', T0);
  await w.core(att).upload(sampleProfile(1), '进攻', T0);
}

interface Started {
  raidId: string;
  setup: BattleSetup;
  actions: BattleAction[];
  until: number;
}
let counter = 0;
/** 绕开 Harbor 直接 prepare → lock → begin，返回这场的 setup 和机器人操作 */
async function start(w: World, att: string, def: string, now: number): Promise<Started> {
  const prep = await w.core(att).prepare(now);
  if (!prep.ok) throw new Error(prep.error);
  const raidId = `raid${String(++counter).padStart(6, '0')}x`;
  const seedN = 1000 + counter * 2;
  const l = await w.core(def).lock({ raidId, attackerId: att, attackerName: '进攻', attackerTrophies: prep.trophies, army: prep.army, seed: seedN }, now);
  if (!l.ok) throw new Error(l.error);
  await w.core(att).begin({ raidId, defenderId: def, until: l.until, army: prep.army }, now);
  const setup = raidSetup(l.layout, 0, prep.army, seedN);
  return { raidId, setup, actions: botActions(setup, 'normal'), until: l.until };
}

const gainOf = (p: Pending): { gold: number; wood: number } => ({ gold: p.gold, wood: p.wood });

describe('掠夺封顶与待扣 / ack', () => {
  it('结算后：防守方负数待扣、进攻方正数待领 = 掉的 ×1.5', async () => {
    const w = new World();
    await seed(w);
    const s = await start(w, 'a', 'd', LATER);
    const r = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, LATER + 1000);
    if (!r.ok) throw new Error(r.error);
    const { out } = r;
    expect(out.pct).toBeGreaterThan(0);
    expect(out.lost.gold).toBeLessThanOrEqual(2000);
    expect(out.lost.wood).toBeLessThanOrEqual(1000);
    const rec = (await w.core('d').defense(s.raidId))!;
    expect(out.lost).toEqual(raidLoot(rec.setup.layout, { gold: 10000, wood: 5000 }, replayRaid(rec.setup, rec.actions, rec.endTick).buildings));
    const d = (await w.core('d').me(LATER + 1000)) as { pending: Pending[] };
    const a = (await w.core('a').me(LATER + 1000)) as { pending: Pending[] };
    expect(d.pending).toHaveLength(1);
    expect(d.pending[0]!.gold).toBe(-out.lost.gold);
    expect(d.pending[0]!.wood).toBe(-out.lost.wood);
    expect(a.pending).toHaveLength(1);
    expect(gainOf(a.pending[0]!)).toEqual({ gold: Math.floor(out.lost.gold * 1.5), wood: Math.floor(out.lost.wood * 1.5) });
    expect(gainOf(a.pending[0]!)).toEqual(raidGain(out.lost));
  });

  it('pct=100：掉的正好是仓库的 20%（向下取整）', async () => {
    const w = new World();
    // 防守岛只有一座主寨：典型部队能拆光
    const p = rich();
    p.base.buildings = p.base.buildings.filter((b) => b.kind === 'hq');
    p.res = { gold: 10001, wood: 5003 };
    await w.core('d').upload(p, 'd', T0);
    await w.core('a').upload(sampleProfile(1), 'a', T0);
    const s = await start(w, 'a', 'd', LATER);
    const r = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, LATER + 1000);
    if (!r.ok) throw new Error(r.error);
    expect(r.out.pct).toBe(100);
    expect(r.out.lost).toEqual({ gold: 2000, wood: 1000 });
    expect(r.out.stars).toBeGreaterThanOrEqual(2);
    expect(w.state('d').shieldUntil).toBe(LATER + 1000 + 12 * HOUR);
  });

  it('ack：同一 raidIds 两次，第二次 cleared=0 且不写存储；快照资源减少且不为负', async () => {
    const w = new World();
    await seed(w);
    const s = await start(w, 'a', 'd', LATER);
    const r = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, LATER + 1000);
    if (!r.ok) throw new Error(r.error);
    const d = w.core('d');
    const kv = w.kv('d');
    const before = w.state('d').snap!.res;
    expect(before).toEqual({ gold: 10000, wood: 5000 });
    const w0 = kv.writes;
    expect(await d.ack([s.raidId])).toEqual({ ok: true, cleared: 1 });
    expect(kv.writes - w0).toBe(1);
    const after = w.state('d').snap!.res;
    expect(after.gold).toBe(10000 - r.out.lost.gold);
    expect(after.wood).toBe(5000 - r.out.lost.wood);
    expect(after.gold).toBeGreaterThanOrEqual(0);
    const w1 = kv.writes;
    expect(await d.ack([s.raidId])).toEqual({ ok: true, cleared: 0 });
    expect(await d.ack([])).toEqual({ ok: true, cleared: 0 });
    expect(kv.writes).toBe(w1);
    expect(w.state('d').snap!.res).toEqual(after);
    expect(w.state('d').pending).toHaveLength(0);
    // 进攻方 ack：快照里加上掠夺
    const a = w.core('a');
    const aBefore = { ...w.state('a').snap!.res };
    await a.ack([s.raidId]);
    const g = raidGain(r.out.lost);
    expect(w.state('a').snap!.res).toEqual({ gold: aBefore.gold + g.gold, wood: aBefore.wood + g.wood });
  });

  it('ack 把快照减成负数时夹到 0', async () => {
    const w = new World();
    const p = { ...newProfile(), res: { gold: 5, wood: 5 } };
    await w.core('d').upload(p, 'd', T0);
    w.edit('d', (s) => s.pending.push({ raidId: 'rrrrrrrr1', gold: -50, wood: -50 }));
    await w.core('d').ack(['rrrrrrrr1']);
    expect(w.state('d').snap!.res).toEqual({ gold: 0, wood: 0 });
  });

  it('没 ack 再被打一次：仓库按"快照 − 待扣"算', async () => {
    const w = new World();
    await seed(w);
    await w.core('b').upload(sampleProfile(1), '乙', T0);
    const s1 = await start(w, 'a', 'd', LATER);
    const r1 = await finishRaid(w.ports, 'a', s1.raidId, s1.actions, 3600, LATER + 1000);
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.out.lost.gold).toBeGreaterThan(0);
    // 护盾过了再打
    const later = LATER + 13 * HOUR;
    const s2 = await start(w, 'b', 'd', later);
    const lk = w.state('d').lock!;
    expect(lk.stash).toEqual({ gold: 10000 - r1.out.lost.gold, wood: 5000 - r1.out.lost.wood });
    const r2 = await finishRaid(w.ports, 'b', s2.raidId, s2.actions, 3600, later + 1000);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.out.lost).toEqual(raidLoot(lk.setup.layout, lk.stash, replayRaid(lk.setup, s2.actions, 3600).buildings));
    expect(w.state('d').pending).toHaveLength(2);
  });
});

describe('finish 幂等、过期、忽略浏览器字段', () => {
  it('重复提交只算一次', async () => {
    const w = new World();
    await seed(w);
    const s = await start(w, 'a', 'd', LATER);
    const r1 = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, LATER + 1000);
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.dup).toBe(false);
    const snapA = structuredClone(w.state('a'));
    const snapD = structuredClone(w.state('d'));
    const r2 = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, LATER + 2000);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.dup).toBe(true);
    expect(r2.out.stars).toBe(r1.out.stars);
    expect(r2.out.pct).toBe(r1.out.pct);
    expect(w.state('a')).toEqual(snapA);
    expect(w.state('d')).toEqual(snapD);
    expect(w.state('a').trophies).toBeGreaterThan(0);
    // 防守方 settle 层面的重复（进攻方状态丢了也不会重复扣）
    const again = await w.core('d').settle(s.raidId, s.actions, 3600, LATER + 3000);
    expect(again.ok).toBe(true);
    expect(w.state('d').pending).toHaveLength(1);
    expect(w.state('d').trophies).toBe(snapD.trophies);
  });

  it('和本地 runBattle / replayRaid 的结果一致', async () => {
    const w = new World();
    await seed(w);
    const s = await start(w, 'a', 'd', LATER);
    const local = replayRaid(s.setup, s.actions, 3600);
    const r = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, LATER + 1000);
    if (!r.ok) throw new Error(r.error);
    expect(r.out.stars).toBe(local.result.stars);
    expect(r.out.pct).toBe(local.result.destroyedPct);
  });

  it('锁过期后 finish 按空打：0 星 0% 不掉东西，进攻方奖杯减少', async () => {
    const w = new World();
    await seed(w);
    w.edit('a', (s) => (s.trophies = 100));
    const s = await start(w, 'a', 'd', LATER);
    const r = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, s.until + 1);
    if (!r.ok) throw new Error(r.error);
    expect(r.out.expired).toBe(true);
    expect(r.out.stars).toBe(0);
    expect(r.out.pct).toBe(0);
    expect(r.out.lost).toEqual({ gold: 0, wood: 0 });
    expect(r.out.attTrophies).toBeLessThan(0);
    expect(w.state('a').trophies).toBeLessThan(100);
    expect(w.state('d').pending).toHaveLength(0);
    expect(w.state('a').pending).toHaveLength(0);
    expect(w.state('d').shieldUntil).toBe(0);
  });

  it('过期的锁被别人 lock 先结掉；旧进攻方再交拿到 expired 结果', async () => {
    const w = new World();
    await seed(w);
    await w.core('b').upload(sampleProfile(1), '乙', T0);
    w.edit('a', (s) => (s.trophies = 100));
    const s1 = await start(w, 'a', 'd', LATER);
    const t2 = s1.until + 1000;
    // 没过期时别人 lock 被拒
    const prepB = await w.core('b').prepare(LATER);
    if (!prepB.ok) throw new Error(prepB.error);
    const early = await w.core('d').lock({ raidId: 'earlyearly1', attackerId: 'b', attackerName: '乙', attackerTrophies: 0, army: prepB.army, seed: 3 }, LATER + 1000);
    expect(early).toEqual({ ok: false, error: 'locked' });
    const s2 = await start(w, 'b', 'd', t2);
    expect(w.state('d').lock!.raidId).toBe(s2.raidId);
    const rec = (w.kv('d').data.get('d') as Defense[]).find((x) => x.raidId === s1.raidId)!;
    expect(rec.stars).toBe(0);
    expect(rec.pct).toBe(0);
    expect(rec.actions).toEqual([]);
    const r = await finishRaid(w.ports, 'a', s1.raidId, s1.actions, 3600, t2 + 5);
    if (!r.ok) throw new Error(r.error);
    expect(r.out.expired).toBe(true);
    expect(r.out.stars).toBe(0);
    expect(r.out.lost).toEqual({ gold: 0, wood: 0 });
    expect(r.dup).toBe(false);
    expect(w.state('a').trophies).toBeLessThan(100);
    // 新的这一场不受影响
    const r2 = await finishRaid(w.ports, 'b', s2.raidId, s2.actions, 3600, t2 + 10);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.out.expired).toBe(false);
  });

  it('没有这场 / 被打自己 / 没上传快照', async () => {
    const w = new World();
    await seed(w);
    expect(await finishRaid(w.ports, 'a', 'nonexistent1', [], 0, LATER)).toEqual({ ok: false, error: 'no_raid' });
    const s = await start(w, 'a', 'd', LATER);
    expect(await finishRaid(w.ports, 'a', s.raidId, [{ t: 0, type: 'bad' }], 0, LATER)).toEqual({ ok: false, error: 'bad_actions' });
    const prep = await w.core('a').prepare(LATER);
    if (!prep.ok) throw new Error(prep.error);
    const me = await w.core('a').lock({ raidId: 'selfselfself', attackerId: 'a', attackerName: 'a', attackerTrophies: 0, army: prep.army, seed: 1 }, LATER);
    expect(me).toEqual({ ok: false, error: 'self' });
    expect(await w.core('zzz').prepare(LATER)).toEqual({ ok: false, error: 'no_snapshot' });
    expect(await w.core('zzz').lock({ raidId: 'xxxxxxxx1', attackerId: 'a', attackerName: 'a', attackerTrophies: 0, army: prep.army, seed: 1 }, LATER)).toEqual({ ok: false, error: 'no_snapshot' });
  });

  it('新号保护期间 lock 被拒，复仇也一样', async () => {
    const w = new World();
    await seed(w);
    const prep = await w.core('a').prepare(T0 + 1000);
    if (!prep.ok) throw new Error(prep.error);
    const req = { raidId: 'protprot1', attackerId: 'a', attackerName: 'a', attackerTrophies: 0, army: prep.army, seed: 1 };
    expect(await w.core('d').lock(req, T0 + 1000)).toEqual({ ok: false, error: 'protected' });
    expect(await w.core('d').lock({ ...req, revenge: true }, T0 + 1000)).toEqual({ ok: false, error: 'protected' });
  });

  it('保护期里打流浪海盗岛不结束保护，主动打真人就结束', async () => {
    const w = new World();
    await seed(w);
    w.edit('d', (s) => {
      s.created = T0 - PROTECT_MS - 1;
    });
    const now = T0 + 1000;
    const prep = await w.core('a').prepare(now);
    if (!prep.ok) throw new Error(prep.error);
    const wi = wandererIsland(0, 1, 7);
    await w.core('a').begin({ raidId: 'protwand1', defenderId: null, until: now + LOCK_MS, army: prep.army, wander: { setup: raidSetup(wi.layout, 0, prep.army, 7), loot: wi.loot } }, now);
    expect(((await w.core('a').me(now)) as { protectUntil: number }).protectUntil).toBe(T0 + PROTECT_MS);
    const l = await w.core('d').lock({ raidId: 'protreal1', attackerId: 'a', attackerName: 'a', attackerTrophies: 0, army: prep.army, seed: 1 }, now);
    if (!l.ok) throw new Error(l.error);
    await w.core('a').begin({ raidId: 'protreal1', defenderId: 'd', until: l.until, army: prep.army }, now);
    expect(((await w.core('a').me(now + 1)) as { protectUntil: number }).protectUntil).toBe(0);
    const prepD = await w.core('d').prepare(now + 1);
    if (!prepD.ok) throw new Error(prepD.error);
    const back = await w.core('a').lock({ raidId: 'protback1', attackerId: 'd', attackerName: 'd', attackerTrophies: 0, army: prepD.army, seed: 2 }, now + 1);
    expect(back.ok).toBe(true);
  });
});

describe('限流', () => {
  it('上传第 31 次、找人第 21 次被限，换一小时重置', async () => {
    const w = new World();
    const c = w.core('u');
    for (let i = 0; i < SNAP_PER_HOUR; i++) expect((await c.upload(newProfile(), 'u', T0)).ok).toBe(true);
    expect(await c.upload(newProfile(), 'u', T0)).toEqual({ ok: false, error: 'rate_limited' });
    expect((await c.upload(newProfile(), 'u', T0 + HOUR)).ok).toBe(true);
    const f = w.core('f');
    await f.upload(newProfile(), 'f', T0);
    for (let i = 0; i < FIND_PER_HOUR; i++) expect((await f.prepare(T0)).ok).toBe(true);
    expect(await f.prepare(T0)).toEqual({ ok: false, error: 'rate_limited' });
  });
});

describe('每步写入行数 ≤ 2', () => {
  async function rows<T>(kv: { writes: number }, fn: () => Promise<T>): Promise<number> {
    const b = kv.writes;
    await fn();
    return kv.writes - b;
  }
  it('BaseCore 每个写方法', async () => {
    const w = new World();
    const worst: Record<string, number> = {};
    const note = (k: string, n: number): void => {
      worst[k] = Math.max(worst[k] ?? 0, n);
    };
    note('upload', await rows(w.kv('d'), () => w.core('d').upload(rich(), 'd', T0)));
    await w.core('a').upload(sampleProfile(1), 'a', T0);
    await w.core('b').upload(sampleProfile(1), 'b', T0);
    note('prepare', await rows(w.kv('a'), () => w.core('a').prepare(LATER)));
    const prep = await w.core('a').prepare(LATER);
    if (!prep.ok) throw new Error(prep.error);
    const req = { raidId: 'writes001', attackerId: 'a', attackerName: 'a', attackerTrophies: 0, army: prep.army, seed: 5 };
    let lk: Awaited<ReturnType<BaseCore['lock']>> | null = null;
    note('lock', await rows(w.kv('d'), async () => {
      lk = await w.core('d').lock(req, LATER);
    }));
    if (!lk || !(lk as { ok: boolean }).ok) throw new Error('lock failed');
    note('begin', await rows(w.kv('a'), () => w.core('a').begin({ raidId: 'writes001', defenderId: 'd', until: LATER + LOCK_MS, army: prep.army }, LATER)));
    const setup = raidSetup((lk as unknown as { layout: never }).layout, 0, prep.army, 5);
    const acts = botActions(setup, 'normal');
    let out: Awaited<ReturnType<BaseCore['settle']>> | null = null;
    note('settle', await rows(w.kv('d'), async () => {
      out = await w.core('d').settle('writes001', acts, 3600, LATER + 5000);
    }));
    if (!out || !(out as { ok: boolean }).ok) throw new Error('settle failed');
    note('credit', await rows(w.kv('a'), () => w.core('a').credit((out as unknown as { out: never }).out, LATER + 5000)));
    note('ack', await rows(w.kv('d'), () => w.core('d').ack(['writes001'])));
    note('ack2', await rows(w.kv('a'), () => w.core('a').ack(['writes001'])));
    // 复仇的 begin：改 s 和 d 两行
    note('begin-revenge', await rows(w.kv('d'), () => w.core('d').begin({ raidId: 'writes002', defenderId: 'a', until: LATER + LOCK_MS, army: prep.army }, LATER + 6000, 'writes001')));
    // lock 先结掉过期的锁：s + d 两行
    const t3 = LATER + 13 * HOUR;
    const prepB = await w.core('b').prepare(t3);
    if (!prepB.ok) throw new Error(prepB.error);
    await w.core('d').lock({ ...req, raidId: 'writes003', attackerId: 'b' }, t3);
    note('lock-settle-old', await rows(w.kv('d'), () => w.core('d').lock({ ...req, raidId: 'writes004', attackerId: 'b' }, t3 + LOCK_MS + 1)));
    expect(w.state('d').lock!.raidId).toBe('writes004');
    // 流浪海盗岛
    const wi = wandererIsland(0, 1, 7);
    const wsetup = raidSetup(wi.layout, 0, prep.army, 7);
    await w.core('b').begin({ raidId: 'writes005', defenderId: null, until: t3 + LOCK_MS, army: prepB.army, wander: { setup: wsetup, loot: wi.loot } }, t3);
    note('finishWanderer', await rows(w.kv('b'), () => w.core('b').finishWanderer('writes005', botActions(wsetup, 'normal'), 3600, t3 + 1000)));
    for (const [k, n] of Object.entries(worst)) expect(n, k).toBeLessThanOrEqual(2);
    expect(worst.upload).toBe(1);
    expect(worst.settle).toBe(2);
    expect(worst['lock-settle-old']).toBe(2);
    expect(worst['begin-revenge']).toBe(2);
    expect(w.state('b').done.some((o) => o.raidId === 'writes005' && o.wanderer)).toBe(true);
  });
  it('HarborCore upsert / pick', async () => {
    const kv = new MemHarbor();
    const h = new HarborCore(kv);
    const e = (id: string): HarborEntry => ({ id, name: '', trophies: 0, hq: 1, shieldUntil: 0, protectUntil: 0, lockUntil: 0, activeAt: T0 - HOUR });
    expect(await rows(kv, () => h.upsert([e('a')], T0))).toBe(1);
    expect(await rows(kv, () => h.upsert([e('b'), e('c')], T0))).toBe(2);
    expect(await rows(kv, () => h.upsert([e('d'), e('e'), e('f')], T0))).toBeLessThanOrEqual(2);
    const q = { attackerId: 'me', trophies: 0, hq: 1, exclude: [], now: T0, rand: 0 };
    expect(await rows(kv, () => h.pick({ ...q, self: e('me') }, LOCK_MS))).toBe(2);
    expect(await rows(kv, () => h.pick(q, LOCK_MS))).toBe(1);
    expect(await rows(kv, () => h.pick({ ...q, exclude: ['a', 'b', 'c', 'd', 'e', 'f'] }, LOCK_MS))).toBe(0);
  });
});

describe('快照已含的待领不重复加、攒满不丢', () => {
  const id = (i: number): string => `debit${String(i).padStart(4, '0')}x`;

  it('浏览器已经加进存档并带着 raidId 上传：ack 不再改快照；没带的照样加一次', async () => {
    const w = new World();
    const d = w.core('d');
    await d.upload(rich(), 'd', T0);
    w.edit('d', (s) => {
      s.pending.push({ raidId: 'income0001', gold: 300, wood: 100 });
      s.pending.push({ raidId: 'income0002', gold: 50, wood: 20 });
    });
    // 浏览器把 income0001 加进了存档（10000+300、5000+100）再上传，带上 applied
    await d.upload({ ...rich(), res: { gold: 10300, wood: 5100 } }, 'd', T0 + 1000, ['income0001', 'nothere001']);
    expect(w.state('d').snapApplied).toEqual(['income0001']);
    expect(await d.ack(['income0001', 'income0002'])).toEqual({ ok: true, cleared: 2 });
    expect(w.state('d').snap!.res).toEqual({ gold: 10350, wood: 5120 });
    expect(w.state('d').pending).toHaveLength(0);
    expect(w.state('d').snapApplied).toEqual([]);
  });

  it('推 60 条待扣：条数不超上限，合计和明细一条不少，ack 后快照扣的正好是 60 条之和', async () => {
    let list: Pending[] = [];
    let gold = 0;
    let wood = 0;
    for (let i = 0; i < 60; i++) {
      const p = { raidId: id(i), gold: -(i + 1), wood: -2 * (i + 1) };
      gold += p.gold;
      wood += p.wood;
      list = pushPending(list, p);
      expect(list.length).toBeLessThanOrEqual(PENDING_MAX);
    }
    expect(list.reduce((a, p) => a + p.gold, 0)).toBe(gold);
    expect(list.reduce((a, p) => a + p.wood, 0)).toBe(wood);
    expect(list.flatMap(pieces).map((x) => x.raidId).sort()).toEqual(Array.from({ length: 60 }, (_, i) => id(i)));

    const w = new World();
    const d = w.core('d');
    await d.upload({ ...rich(), res: { gold: 100000, wood: 100000 } }, 'd', T0);
    w.edit('d', (s) => (s.pending = list));
    await d.ack(list.map((p) => p.raidId));
    expect(w.state('d').snap!.res).toEqual({ gold: 100000 + gold, wood: 100000 + wood });
    expect(w.state('d').pending).toHaveLength(0);
  });

  it('取走后被并进一条再 ack 旧 raidId：只拿掉那几笔，剩下的还在、快照只扣一次', async () => {
    let list: Pending[] = [];
    for (let i = 0; i < 50; i++) list = pushPending(list, { raidId: id(i), gold: -10, wood: 0 });
    const w = new World();
    const d = w.core('d');
    await d.upload({ ...rich(), res: { gold: 100000, wood: 0 } }, 'd', T0);
    // 浏览器看到的是这 50 条；ack 到之前又被结了一场，50 条并成一条
    const seen = list.map((p) => p.raidId);
    w.edit('d', (s) => (s.pending = pushPending(list, { raidId: id(50), gold: -10, wood: 0 })));
    await d.ack(seen);
    const left = w.state('d').pending;
    expect(left.flatMap(pieces).map((x) => x.raidId)).toEqual([id(50)]);
    expect(left.reduce((a, p) => a + p.gold, 0)).toBe(-10);
    expect(w.state('d').snap!.res.gold).toBe(100000 - 500);
  });
});

describe('每周奖杯、守住次数', () => {
  it('赢了把加的奖杯记进本周，换周清零；输了不扣本周；对方 0 星防守方守住 +1', async () => {
    const w = new World();
    await seed(w);
    const s = await start(w, 'a', 'd', LATER);
    const r = await finishRaid(w.ports, 'a', s.raidId, s.actions, 3600, LATER + 1000);
    if (!r.ok) throw new Error(r.error);
    const a = (await w.core('a').me(LATER + 1000)) as { week: number; holds: number };
    expect(a.week).toBe(Math.max(0, r.out.attTrophies));
    expect(((await w.core('a').me(LATER + 8 * 86_400_000)) as { week: number }).week).toBe(0);
    const d = (await w.core('d').me(LATER + 1000)) as { holds: number };
    expect(d.holds).toBe(r.out.stars === 0 ? 1 : 0);
    // 过期空打（0 星）不算守住，进攻方输了本周分不变
    const w2 = new World();
    await seed(w2);
    const s2 = await start(w2, 'a', 'd', LATER);
    const r2 = await finishRaid(w2.ports, 'a', s2.raidId, s2.actions, 3600, s2.until + 1);
    if (!r2.ok) throw new Error(r2.error);
    expect(((await w2.core('d').me(s2.until + 2)) as { holds: number }).holds).toBe(0);
    expect(((await w2.core('a').me(s2.until + 2)) as { week: number }).week).toBe(0);
  });
});

describe('防守记录截断', () => {
  const rec = (i: number, shadow?: 'spar'): Defense => ({ raidId: `r${i}`, ...(shadow ? { shadow } : {}) }) as unknown as Defense;
  it('超过上限先淘汰最旧的切磋 / 影子记录，不挤掉真人记录', () => {
    const d = [rec(0, 'spar'), ...Array.from({ length: 9 }, (_, i) => rec(i + 1)), rec(10, 'spar'), rec(11)];
    capDefenses(d);
    expect(d.map((x) => x.raidId)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r11']);
  });
  it('全是真人记录时淘汰最旧的；新来的切磋挤不进满是真人的记录', () => {
    const real = Array.from({ length: 11 }, (_, i) => rec(i));
    capDefenses(real);
    expect(real.map((x) => x.raidId)).toEqual(Array.from({ length: 10 }, (_, i) => `r${i}`));
    const d = [rec(99, 'spar'), ...Array.from({ length: 10 }, (_, i) => rec(i))];
    capDefenses(d);
    expect(d.some((x) => x.raidId === 'r99')).toBe(false);
    expect(d).toHaveLength(10);
  });
  it('note：一堆切磋记录挤不掉真人被抢的那条', async () => {
    const kv = new MemKv();
    const core = new BaseCore(kv, 'd');
    // 没有 shadow 字段的算真人记录
    await core.note({ raidId: 'real', at: T0 } as unknown as Defense);
    for (let i = 0; i < 15; i++) await core.note({ raidId: `s${i}`, at: T0 + i, shadow: 'spar' } as unknown as Defense);
    const d = (await kv.get<Defense[]>('d'))!;
    expect(d).toHaveLength(10);
    expect(d.some((x) => x.raidId === 'real')).toBe(true);
    expect(d[0]!.raidId).toBe('s14');
  });
});
