/**
 * 异步攻防的 HTTP 接口（DESIGN.md 5.3、5.7）：/games/haidao/api/pvp/*。只走 HTTP，不用 WebSocket。
 *
 * 校验顺序：路径 / 方法 → 单独部署（501 no_platform，游戏单机照常）→ CSRF（写接口查 X-Arcade: 1 和 Origin，照夜巡 live.ts）
 * → 请求体大小 → 认人（kit whoIs，经平台 /api/me；没登录 401、平台不可用 503）→ Base / Harbor。
 * 结算一律服务端重放：finish 只收 raidId、操作序列和结束拍，浏览器报的星数、摧毁率、掠夺字段一概不看。
 *
 * 两个对象之间不是一次原子写：以防守方 Base 记的结果为准，进攻方 credit 按 raidId 幂等（重复交、中途断了再交都只算一次）。
 */
import { meUrlOf, whoIs } from 'arcade-kit/auth';
import { isStandalone, json, readJson } from 'arcade-kit/worker';
import { validateBase } from '../../src/core/validate.ts';
import { raidGain, raidSetup, sanitizeActions, wandererIsland } from '../../src/core/pvp.ts';
import { islandExt } from '../../src/core/base.ts';
import { BATTLE_TICKS } from '../../src/core/types.ts';
import type { BattleAction } from '../../src/core/types.ts';
import { checkRules } from '../live.ts';
import type { Active, BaseCore, Outcome } from './base.ts';
import { LOCK_MS } from './base.ts';
import type { HarborCore } from './harbor.ts';

export const PVP_PREFIX = '/games/haidao/api/pvp/';
export const SNAPSHOT_MAX = 16 * 1024;
const FINISH_MAX = 16 * 1024;
const SMALL_MAX = 2048;
const RAID_RE = /^[A-Za-z0-9_-]{8,40}$/;
/** 找对手时最多试几个候选（候选可能刚被别人锁了、刚上了护盾） */
const PICK_TRIES = 3;

/** 浏览器能经 Worker 调到的 Base 方法（DO 的 RPC 入口按这份名单放行） */
export const BASE_METHODS = ['upload', 'me', 'ack', 'prepare', 'begin', 'revengeTarget', 'lock', 'settle', 'lookup', 'credit', 'finishWanderer', 'defense', 'release', 'exchangeBegin', 'exchangeDone', 'exchangeUndo', 'exchangeLeft', 'slotBegin', 'slotUndo', 'slotLeft'] as const;
export const HARBOR_METHODS = ['upsert', 'pick', 'tally', 'stats'] as const;

type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never };
export type BasePort = Async<Pick<BaseCore, (typeof BASE_METHODS)[number]>>;
export type HarborPort = Async<Pick<HarborCore, (typeof HARBOR_METHODS)[number]>>;
export interface Ports {
  base(userId: string): BasePort;
  harbor(): HarborPort;
  /** kit 的写入计量（meterLevel / meterReport），由 worker/do.ts 接上；arcade-kit/meter 依赖 cloudflare:workers，不在这里引，测试才能在 Node 里跑 */
  meter?: { level(): Promise<'ok' | 'busy' | 'stop'>; report(writes: number): Promise<unknown> };
}

export interface PvpEnv {
  ARCADE?: Parameters<typeof whoIs>[1];
  GATE?: string;
}

const fail = (status: number, error: string, cookies: readonly string[] = []): Response => json({ ok: false, error }, status, cookies);

const STATUS: Record<string, number> = {
  rate_limited: 429,
  no_snapshot: 409,
  not_found: 404,
  no_raid: 404,
  revenged: 409,
  too_late: 409,
  shield: 409,
  locked: 409,
  protected: 409,
  pair_limit: 409,
  self: 400,
};
const failErr = (e: { error: string }, cookies: readonly string[]): Response => fail(STATUS[e.error] ?? 400, e.error, cookies);

function randomId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 20);
}
function randomSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return (b[0]! & 0x3fffffff) | 1;
}

/** 计量只是记账：连不上不挡玩 */
async function report(ports: Ports, writes: number): Promise<void> {
  try {
    await ports.meter?.report(writes);
  } catch {
    // 计量连不上：这次不记
  }
}

/**
 * 结一场（进攻方交了操作；或者按放弃 forfeit 结：过了时间、点了放弃、没交就又找对手）。回结果和进攻方的奖杯。
 * 真人岛：防守方 settle（2 行）→ 进攻方 credit（1 行）→ Harbor 两行 → Harbor 汇总统计 tally（1 行，单独一个方法）；流浪海盗岛：进攻方自己结（1 行）。
 */
export async function finishRaid(
  ports: Ports,
  userId: string,
  raidId: string,
  rawActions: unknown,
  endTick: number,
  now: number,
  forfeit = false,
): Promise<{ ok: true; out: Outcome; trophies: number; dup: boolean } | { ok: false; error: string }> {
  const me = ports.base(userId);
  const st = await me.lookup(raidId);
  if (!st) return { ok: false, error: 'no_raid' };
  if ('done' in st) return { ok: true, out: st.done, trophies: -1, dup: true };
  const a = st.active;
  const actions = forfeit ? [] : sanitizeActions(rawActions, a.army);
  if (!actions) return { ok: false, error: 'bad_actions' };
  if (!a.defenderId) {
    const r = await me.finishWanderer(raidId, actions, endTick, now, forfeit);
    if (!r.ok) return r;
    await ports.harbor().upsert([r.entry], now);
    return { ok: true, out: r.out, trophies: r.entry.trophies, dup: false };
  }
  return settleAt(ports, userId, a.defenderId, raidId, actions, endTick, now, forfeit);
}

async function settleAt(
  ports: Ports,
  userId: string,
  defenderId: string,
  raidId: string,
  actions: BattleAction[],
  endTick: number,
  now: number,
  forfeit: boolean,
): Promise<{ ok: true; out: Outcome; trophies: number; dup: boolean } | { ok: false; error: string }> {
  const s = await ports.base(defenderId).settle(raidId, actions, endTick, now, forfeit);
  if (!s.ok) return s;
  const c = await ports.base(userId).credit(s.out, now);
  await ports.harbor().upsert([s.entry, c.entry], now);
  // 汇总统计（DESIGN.md 5.9）：真人对真人，每场只记一次；Harbor 的 upsert 已写满 2 行，所以单独一个方法（1 行）。只是记账，记不上不挡结算
  if (!c.dup) {
    try {
      await ports.harbor().tally({ diff: s.entry.hq - c.entry.hq, attHq: c.entry.hq, stars: s.out.stars, pct: s.out.pct, cancelled: forfeit || s.out.expired }, now);
    } catch {
      // 统计连不上：这场不记
    }
  }
  return { ok: true, out: s.out, trophies: c.trophies, dup: c.dup };
}

/**
 * 记下这场（进攻方 begin）。begin 发现还挂着另一场真人岛（同一个人并发找了两次）：去防守方按放弃结掉，锁当场解开，不让对方白白锁 4 分钟。
 * 复仇的那条防守记录已经被另一个请求用掉：解掉刚加的锁，回 revenged。
 */
async function beginRaid(ports: Ports, userId: string, a: Active, now: number, revengeOf?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await ports.base(userId).begin(a, now, revengeOf);
  if (!b.ok) {
    if (a.defenderId) {
      const r = await ports.base(a.defenderId).release(a.raidId, now);
      if (r.entry) await ports.harbor().upsert([r.entry], now);
    }
    return b;
  }
  const old = b.replaced;
  if (old?.defenderId) await settleAt(ports, userId, old.defenderId, old.raidId, [], 0, now, true);
  return { ok: true };
}

interface Start {
  raidId: string;
  wanderer: boolean;
  opponent: { name: string; trophies: number; hq: number; rank?: number };
  setup: ReturnType<typeof raidSetup>;
  until: number;
  maxGain: { gold: number; wood: number };
}

/** 找对手（target 给了就是复仇：直接锁那个人，不经匹配，仍尊重护盾和锁） */
async function startRaid(ports: Ports, userId: string, now: number, target?: { id: string; revengeOf: string }): Promise<{ ok: true; start: Start } | { ok: false; error: string }> {
  try {
    if (ports.meter && (await ports.meter.level()) !== 'ok') return { ok: false, error: 'busy' };
  } catch {
    // 计量连不上不挡（只是记账）
  }
  const me = ports.base(userId);
  const prep = await me.prepare(now);
  if (!prep.ok) return prep;
  // 上一场没交（过期了，或者又来找对手）：按放弃结掉，进攻方记输、这场算用过，防守方解锁
  if (prep.prev) await finishRaid(ports, userId, prep.prev.raidId, [], 0, now, true);
  const raidId = randomId();
  const seed = randomSeed();
  const lockReq = { raidId, attackerId: userId, attackerName: prep.name, attackerTrophies: prep.trophies, army: prep.army, seed };
  const until = now + LOCK_MS;

  if (target) {
    const l = await ports.base(target.id).lock({ ...lockReq, revenge: true }, now);
    if (!l.ok) return l;
    await ports.harbor().upsert([l.entry, prep.entry], now);
    const b = await beginRaid(ports, userId, { raidId, defenderId: target.id, until: l.until, army: prep.army }, now, target.revengeOf);
    if (!b.ok) return b;
    // 复仇不给系统赏金：最多拿回对方掉的
    return { ok: true, start: { raidId, wanderer: false, opponent: l.opponent, setup: raidSetup(l.layout, islandExt(l.layout), prep.army, seed, l.hero), until: l.until, maxGain: lossCap(l.stash) } };
  }

  const exclude = [...prep.attacked];
  for (let i = 0; i < PICK_TRIES; i++) {
    const rand = randomSeed() / 0x40000000;
    const { id } = await ports.harbor().pick({ attackerId: userId, trophies: prep.trophies, hq: prep.hq, exclude, now, rand, ...(i === 0 ? { self: prep.entry } : {}) }, LOCK_MS);
    if (!id) break;
    const l = await ports.base(id).lock(lockReq, now);
    if (l.ok) {
      const b = await beginRaid(ports, userId, { raidId, defenderId: id, until: l.until, army: prep.army }, now);
      if (!b.ok) return b;
      return { ok: true, start: { raidId, wanderer: false, opponent: l.opponent, setup: raidSetup(l.layout, islandExt(l.layout), prep.army, seed, l.hero), until: l.until, maxGain: raidGain(lossCap(l.stash)) } };
    }
    exclude.push(id);
  }
  // 没有合适的真人：流浪海盗岛（标明不是真人，掠夺来自系统）
  const w = wandererIsland(prep.trophies, prep.hq, seed);
  const setup = raidSetup(w.layout, 0, prep.army, seed);
  const b = await beginRaid(ports, userId, { raidId, defenderId: null, until, army: prep.army, wander: { setup, loot: w.loot } }, now);
  if (!b.ok) return b;
  return { ok: true, start: { raidId, wanderer: true, opponent: { name: w.name, trophies: prep.trophies, hq: w.hq }, setup, until, maxGain: { gold: Math.floor(w.loot.gold / 2), wood: Math.floor(w.loot.wood / 2) } } };
}

/** 摧毁 100% 时防守方最多掉多少（给"预计掠夺"显示用） */
function lossCap(stash: { gold: number; wood: number }): { gold: number; wood: number } {
  return { gold: Math.floor(stash.gold / 5), wood: Math.floor(stash.wood / 5) };
}

/** 平台 /api/me 的 user.isAdmin 为 true 才算管理员；平台连不上一律不算（fail-closed） */
async function isAdmin(req: Request, env: PvpEnv): Promise<boolean> {
  if (!env.ARCADE) return false;
  try {
    const res = await env.ARCADE.fetch(meUrlOf(req), { headers: { cookie: req.headers.get('cookie') ?? '' }, signal: AbortSignal.timeout(3_000) });
    if (res.status !== 200) return false;
    const body = (await res.json()) as { user?: { isAdmin?: unknown } | null };
    return body?.user?.isAdmin === true;
  } catch {
    return false;
  }
}

export async function handlePvp(req: Request, env: PvpEnv, ports: Ports | null, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  const sub = url.pathname.slice(PVP_PREFIX.length);
  const m = req.method;
  const route =
    m === 'GET' && sub === 'me' ? 'me'
    : m === 'GET' && sub === 'stats' ? 'stats'
    : m === 'GET' && sub.startsWith('defense/') ? 'defense'
    : m === 'POST' && (sub === 'find' || sub === 'finish' || sub === 'ack' || sub === 'revenge' || sub === 'cancel') ? sub
    : m === 'PUT' && sub === 'snapshot' ? 'snapshot'
    : null;
  if (!route) return fail(404, 'not_found');
  // 单独部署没有平台认人：说清楚是"这里没有"（501），页面把入口藏起来，单机照常
  if (isStandalone(env) || !ports) return fail(501, 'no_platform');
  const write = m !== 'GET';
  if (write && (req.headers.get('X-Arcade') !== '1' || req.headers.get('Origin') !== url.origin)) return fail(403, 'csrf');

  let body: Record<string, unknown> = {};
  if (write) {
    const max = route === 'snapshot' ? SNAPSHOT_MAX : route === 'finish' ? FINISH_MAX : SMALL_MAX;
    const len = Number(req.headers.get('content-length') ?? NaN);
    if (len > max) return fail(413, 'too_large');
    const raw = await readJson(req, max);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) body = raw as Record<string, unknown>;
    // find 以前不带请求体：读不出来就当空对象，交给规则版本闸门回 need_reload；别的接口仍要求是对象
    else if (route !== 'find') return fail(400, 'bad_request');
    // 开打前先对规则版本（在认人、写存储之前）：旧页面按旧规则演，服务端按新规则结会对不上
    if (route === 'find' || route === 'revenge') {
      const stale = checkRules(body);
      if (stale) return stale;
    }
  }

  const who = await whoIs(req, env.ARCADE);
  if ('error' in who) return who.error === 'anonymous' ? fail(401, 'login', who.setCookie) : fail(503, 'unavailable');
  const { userId, name } = who.user;
  const ck = who.setCookie;
  const me = ports.base(userId);

  switch (route) {
    case 'stats': {
      // 只给平台管理员：再问一次平台 /api/me 看 user.isAdmin（whoIs 只回 id 和昵称）
      if (!(await isAdmin(req, env))) return fail(403, 'forbidden', ck);
      return json(await ports.harbor().stats(now), 200, ck);
    }
    case 'me':
      return json({ ok: true, ...((await me.me(now)) as object) }, 200, ck);
    case 'defense': {
      const raidId = sub.slice('defense/'.length);
      if (!RAID_RE.test(raidId)) return fail(400, 'bad_raid', ck);
      const d = await me.defense(raidId);
      if (!d) return fail(404, 'not_found', ck);
      // 回放数据：只给自己（防守方）看，不带进攻方的 userId
      return json({ ok: true, raidId: d.raidId, attacker: d.attackerName, at: d.at, stars: d.stars, pct: d.pct, lost: d.lost, setup: d.setup, actions: d.actions, endTick: d.endTick }, 200, ck);
    }
    case 'snapshot': {
      const v = validateBase(body.profile);
      if (!v.ok) return json({ ok: false, error: 'bad_snapshot', reason: v.error }, 400, ck);
      // applied：这份存档已经含了哪些待扣 / 待领（ack 时不再改服务端快照的资源）；格式不对就当没带
      const ap = body.applied;
      const applied = Array.isArray(ap) && ap.length <= 100 ? ap.filter((x): x is string => typeof x === 'string' && RAID_RE.test(x)) : [];
      const r = await me.upload(v.value, name, now, applied);
      if (!r.ok) return failErr(r, ck);
      await ports.harbor().upsert([r.entry], now);
      await report(ports, 2);
      return json({ ok: true }, 200, ck);
    }
    case 'ack': {
      const ids = body.raidIds;
      if (!Array.isArray(ids) || ids.length > 50 || !ids.every((x) => typeof x === 'string' && RAID_RE.test(x))) return fail(400, 'bad_request', ck);
      const r = await me.ack(ids as string[]);
      if (r.cleared > 0) await report(ports, 1);
      return json(r, 200, ck);
    }
    case 'find':
    case 'revenge': {
      let target: { id: string; revengeOf: string } | undefined;
      if (route === 'revenge') {
        const raidId = body.raidId;
        if (typeof raidId !== 'string' || !RAID_RE.test(raidId)) return fail(400, 'bad_raid', ck);
        const t = await me.revengeTarget(raidId, now);
        if (!t.ok) return failErr(t, ck);
        target = { id: t.attackerId, revengeOf: raidId };
      }
      const r = await startRaid(ports, userId, now, target);
      if (!r.ok) return r.error === 'busy' ? fail(503, 'busy', ck) : failErr(r, ck);
      await report(ports, 5);
      return json({ ok: true, ...r.start }, 200, ck);
    }
    case 'cancel': {
      // 放弃（换一个 / 不打了）：按空打结，进攻方记一场输、这场算用过，防守方解锁、不掉东西。
      // 服务端核实不了有没有开打：要是放弃不算数，打得不好就放弃、拿同一个种子反复重来挑最好的结果都不花代价
      const raidId = body.raidId;
      if (typeof raidId !== 'string' || !RAID_RE.test(raidId)) return fail(400, 'bad_raid', ck);
      const r = await finishRaid(ports, userId, raidId, [], 0, now, true);
      if (!r.ok) return r.error === 'no_raid' ? json({ ok: true, cancelled: false }, 200, ck) : failErr(r, ck);
      if (!r.dup) await report(ports, 6);
      return json({ ok: true, cancelled: !r.dup, trophies: r.out.attTrophies, total: r.trophies }, 200, ck);
    }
    case 'finish': {
      const raidId = body.raidId;
      if (typeof raidId !== 'string' || !RAID_RE.test(raidId)) return fail(400, 'bad_raid', ck);
      const end = body.endTick === undefined ? BATTLE_TICKS : body.endTick;
      if (typeof end !== 'number' || !Number.isInteger(end) || end < 0 || end > BATTLE_TICKS) return fail(400, 'bad_request', ck);
      // 只取 raidId、actions、endTick：浏览器报的 stars / pct / loot 之类一律不看
      const r = await finishRaid(ports, userId, raidId, body.actions, end, now);
      if (!r.ok) return failErr(r, ck);
      if (!r.dup) await report(ports, 6);
      const o = r.out;
      return json(
        { ok: true, raidId, stars: o.stars, pct: o.pct, gain: o.gain, lost: o.lost, trophies: o.attTrophies, total: r.trophies, wanderer: o.wanderer, expired: o.expired, dup: r.dup },
        200,
        ck,
      );
    }
  }
  return fail(404, 'not_found', ck);
}
