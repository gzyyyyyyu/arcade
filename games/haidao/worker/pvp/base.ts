/**
 * Base：每个玩家一个（idFromName(userId)），存这个人的基地快照、奖杯、护盾、被打的锁、待扣 / 待领、防守记录（DESIGN.md 5.2）。
 * 存储两行：`s`（状态，几 KB）和 `d`（最近 10 条防守记录，含回放要的布局、部队、种子、操作）。每个方法最多写这两行。
 * 内存里的 state 只是缓存，对象被回收后从存储重建。时间由调用方传进来（Worker 的时钟），方便测试。
 */
import { armyFor, heroLevel, hqLevel, islandExt, rankOf } from '../../src/core/index.ts';
import { raidGain, raidLoss, raidSetup, replayRaid, shieldMs, trophyDelta, wandererGain } from '../../src/core/pvp.ts';
import type { ArmySetup, BattleAction, BattleSetup, Placed, Profile, Res } from '../../src/core/types.ts';
import type { Kv } from './kv.ts';

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
/** 锁 4 分钟：3 分钟战斗 + 余量 */
export const LOCK_MS = 4 * 60_000;
/** 新号保护：第一次上传快照起 3 天 */
export const PROTECT_MS = 3 * DAY;
/**
 * 每人每小时最多找几次对手（含复仇、「换一个」）、上传几次快照。找对手只挡脚本：
 * 实测「换一个」不看卡连点每次约 1 秒（0.58.6，假服务端），真人看卡再点约 3 秒，一小时不停也到不了 1200
 */
export const FIND_PER_HOUR = 1200;
export const SNAP_PER_HOUR = 30;
/** 同一对玩家 24 小时内最多打几场（不分方向，含复仇、放弃、过期空打）：正常一场 + 复仇一场 */
export const PAIR_PER_DAY = 2;
const DEFENSES_MAX = 10;
const DONE_MAX = 20;
/** 兑换、实盘每日场次各记最近几个 ref（按 ref 幂等用：重发同一个 ref 不重复计） */
const REFS_MAX = 20;
export const PENDING_MAX = 50;
/** 并起来的那条最多留几笔明细；更早的只留在合计里（见 pieces） */
const MERGE_PARTS_MAX = 100;

/** 一场进攻的结果（服务端重放算的） */
export interface Outcome {
  raidId: string;
  stars: number;
  pct: number;
  /** 防守方掉的（流浪海盗岛为 0） */
  lost: Res;
  /** 进攻方拿到的（含系统赏金） */
  gain: Res;
  /** 双方奖杯变化 */
  attTrophies: number;
  defTrophies: number;
  /** 结算后防守方的奖杯、护盾到期（Harbor 用） */
  defTotal: number;
  defShield: number;
  wanderer: boolean;
  /** 过期没交、按空打结的 */
  expired: boolean;
}

export interface Defense {
  raidId: string;
  at: number;
  attackerId: string;
  attackerName: string;
  stars: number;
  pct: number;
  lost: Res;
  /** 防守方奖杯变化 */
  trophies: number;
  /** 进攻方奖杯变化（重复交时原样还原） */
  attTrophies: number;
  setup: BattleSetup;
  actions: BattleAction[];
  endTick: number;
  revenged?: boolean;
  /** 这场本身是复仇：不能再被复仇回去（免得两个号来回刷） */
  fromRevenge?: boolean;
}

interface Lock {
  raidId: string;
  attackerId: string;
  attackerName: string;
  attackerTrophies: number;
  until: number;
  setup: BattleSetup;
  stash: Res;
  /** 复仇：掠夺不加系统赏金 */
  revenge?: boolean;
}

export interface Active {
  raidId: string;
  /** 防守方 userId；流浪海盗岛为 null */
  defenderId: string | null;
  until: number;
  /** 进攻方这场带的部队（校验操作用；重放用的在防守方的锁里） */
  army: ArmySetup;
  /** 流浪海盗岛：结算要的布局和系统掠夺（真人岛的这些在防守方的锁里） */
  wander?: { setup: BattleSetup; loot: Res };
}

/**
 * 正数是进攻得的，负数是被打掉的；浏览器取回后加 / 扣进本地存档，再 ack 清掉。
 * parts：攒满 PENDING_MAX 条时并成的一条，gold / wood 是合计，parts 是每一场的明细（浏览器和 ack 都按明细的 raidId 去重）
 */
export interface Pending {
  raidId: string;
  gold: number;
  wood: number;
  parts?: Pending[];
}

/**
 * 一条待扣 / 待领拆成按 raidId 去重的几笔（src/net/pvp.ts 有同样的一份，两边要一致）。
 * 并的那条：明细之外的零头（明细超过 MERGE_PARTS_MAX 被挤掉的老账）记在 raidId = 这一条 raidId 的那笔上。
 */
export function pieces(p: Pending): Pending[] {
  if (!p.parts) return [{ raidId: p.raidId, gold: p.gold, wood: p.wood }];
  const out = p.parts.map((x) => ({ raidId: x.raidId, gold: x.gold, wood: x.wood }));
  const gold = p.gold - out.reduce((a, x) => a + x.gold, 0);
  const wood = p.wood - out.reduce((a, x) => a + x.wood, 0);
  if (gold !== 0 || wood !== 0) {
    const own = out.find((x) => x.raidId === p.raidId);
    if (own) {
      own.gold += gold;
      own.wood += wood;
    } else out.push({ raidId: p.raidId, gold, wood });
  }
  return out;
}

/** 这一条里不在 skip 里的那些笔的合计 */
function unapplied(p: Pending, skip: readonly string[]): Res {
  let gold = 0;
  let wood = 0;
  for (const x of pieces(p)) {
    if (skip.includes(x.raidId)) continue;
    gold += x.gold;
    wood += x.wood;
  }
  return { gold, wood };
}

export interface BaseState {
  name: string;
  /** 第一次上传快照的时间；0 = 还没上传过 */
  created: number;
  snap: Profile | null;
  snapAt: number;
  trophies: number;
  shieldUntil: number;
  /** 新手保护提前结束的时刻：保护期里主动去打真人就到此为止（0 = 没提前结束，照 created + PROTECT_MS 算） */
  protectEnd: number;
  lock: Lock | null;
  active: Active | null;
  pending: Pending[];
  /** 24 小时内打过的人：userId → 时间 */
  attacked: Record<string, number>;
  /** 24 小时内和谁打过（不分谁打谁）：userId → 每场的时间。两边的 Base 各记一份，防守方 lock 时按自己这份封顶 */
  pair: Record<string, number[]>;
  /** 最近一次上传快照时浏览器说"已经加 / 扣进存档"的待扣 / 待领 raidId：快照里的资源已经含了它们，ack 时不再加减 */
  snapApplied: string[];
  /** 作为进攻方结过的（raidId 幂等） */
  done: Outcome[];
  /** 限流：hour = 第几个小时，计数在这一行里，不另加行 */
  rate: { hour: number; find: number; snap: number };
  /** 筹码单向换资源（DESIGN.md 4.4）：day = 北京时间日期，n = 当天换了几次；refs 记最近的兑换（ref → 进行中 / 换成了什么），按 ref 幂等 */
  ex: { day: string; n: number; refs: Record<string, 'wait' | 'gold' | 'wood'> };
  /** 悬赏出海（实盘）当天打了几场（北京时间），refs 是最近带入过的 ref（重发 buyin 不重复计） */
  live: { day: string; n: number; refs: string[] };
  /** 悬赏守岛、护航、寻宝航线（实盘）当天打了几场：各自分开记，字段同 live（旧存档没有这几项，state() 用默认值补） */
  td: { day: string; n: number; refs: string[] };
  escort: { day: string; n: number; refs: string[] };
  map: { day: string; n: number; refs: string[] };
}

/** 四种实盘的场次记录（worker/live.ts 的 LiveKind） */
type SlotKind = 'live' | 'td' | 'escort' | 'map';

/** 新手保护到什么时候：还没上传过快照按现在起算 3 天；保护期里主动打过真人就到那一刻为止 */
export function protectUntil(s: Pick<BaseState, 'created' | 'protectEnd'>, now: number): number {
  const end = s.created ? s.created + PROTECT_MS : now + PROTECT_MS;
  return s.protectEnd ? Math.min(end, s.protectEnd) : end;
}

function emptyState(): BaseState {
  return { name: '', created: 0, snap: null, snapAt: 0, trophies: 0, shieldUntil: 0, protectEnd: 0, lock: null, active: null, pending: [], attacked: {}, pair: {}, snapApplied: [], done: [], rate: { hour: 0, find: 0, snap: 0 }, ex: { day: '', n: 0, refs: {} }, live: { day: '', n: 0, refs: [] }, td: { day: '', n: 0, refs: [] }, escort: { day: '', n: 0, refs: [] }, map: { day: '', n: 0, refs: [] } };
}

/** 24 小时外的配对记录清掉（改 s，不存） */
function prunePair(s: BaseState, now: number): void {
  for (const [k, list] of Object.entries(s.pair)) {
    const keep = list.filter((t) => now - t < DAY);
    if (keep.length > 0) s.pair[k] = keep;
    else delete s.pair[k];
  }
}

const sign = (p: Pending): number => (p.gold + p.wood < 0 ? -1 : 1);

/**
 * 加一条待扣 / 待领。满了不丢：把和新这条同方向（都是扣或都是领）的全部（含新这条）并成一条，合计相加、明细带着各自的 raidId；
 * 同方向只有新这条自己时并反方向的。并成的那条用新这条的 raidId（浏览器还没见过），放在被并的最早那条的位置。
 */
export function pushPending(list: Pending[], p: Pending): Pending[] {
  const out: Pending[] = [...list.map((x) => structuredClone(x)), structuredClone(p)];
  if (out.length <= PENDING_MAX) return out;
  let dir = sign(p);
  if (out.filter((x) => sign(x) === dir).length < 2) dir = -dir;
  const group = out.filter((x) => sign(x) === dir);
  const parts = group.flatMap((x) => x.parts ?? [{ raidId: x.raidId, gold: x.gold, wood: x.wood }]);
  const merged: Pending = {
    raidId: group.includes(out[out.length - 1]!) ? p.raidId : group[group.length - 1]!.raidId,
    gold: group.reduce((a, x) => a + x.gold, 0),
    wood: group.reduce((a, x) => a + x.wood, 0),
    parts: parts.slice(-MERGE_PARTS_MAX),
  };
  const at = out.indexOf(group[0]!);
  const rest = out.filter((x) => sign(x) !== dir);
  rest.splice(out.slice(0, at).filter((x) => sign(x) !== dir).length, 0, merged);
  return rest;
}

/** Harbor 里这个人的一行 */
export interface HarborEntry {
  id: string;
  trophies: number;
  hq: number;
  shieldUntil: number;
  protectUntil: number;
  lockUntil: number;
  activeAt: number;
}

type Err = { ok: false; error: string };
const err = (error: string): Err => ({ ok: false, error });

interface Opponent {
  name: string;
  trophies: number;
  hq: number;
  /** 王阶（只给对面看王旗，不进任何数值；没有就不写） */
  rank?: number;
}

export class BaseCore {
  private s: BaseState | null = null;
  private d: Defense[] | null = null;
  private kv: Kv;
  private userId: string;
  constructor(kv: Kv, userId: string) {
    this.kv = kv;
    this.userId = userId;
  }

  private async state(): Promise<BaseState> {
    if (!this.s) this.s = { ...emptyState(), ...((await this.kv.get<BaseState>('s')) ?? {}) };
    return this.s;
  }
  private async defenses(): Promise<Defense[]> {
    if (!this.d) this.d = (await this.kv.get<Defense[]>('d')) ?? [];
    return this.d;
  }
  private async save(s: BaseState, d?: Defense[]): Promise<void> {
    this.s = s;
    await this.kv.put('s', s);
    if (d) {
      this.d = d;
      await this.kv.put('d', d);
    }
  }

  private entry(s: BaseState, now: number): HarborEntry {
    return {
      id: this.userId,
      trophies: s.trophies,
      hq: s.snap ? hqLevel(s.snap) : 1,
      shieldUntil: s.shieldUntil,
      protectUntil: protectUntil(s, now),
      lockUntil: s.lock?.until ?? 0,
      activeAt: s.snapAt,
    };
  }

  /** 限流计数：超了回 false，不写；没超在 s 上加一（调用方负责存） */
  private bump(s: BaseState, kind: 'find' | 'snap', now: number): boolean {
    const hour = Math.floor(now / HOUR);
    if (s.rate.hour !== hour) s.rate = { hour, find: 0, snap: 0 };
    const max = kind === 'find' ? FIND_PER_HOUR : SNAP_PER_HOUR;
    if (s.rate[kind] >= max) return false;
    s.rate[kind]++;
    return true;
  }

  /** 已经扣过还没确认的（负数）合计：防守方仓库按"快照 − 待扣"算，免得没上线的人被反复按原数抢 */
  private stash(s: BaseState): Res {
    const res = s.snap?.res ?? { gold: 0, wood: 0 };
    let gold = res.gold;
    let wood = res.wood;
    for (const p of s.pending) {
      // 已经进了快照的不再减（快照的资源里已经扣过）
      const u = unapplied(p, s.snapApplied);
      if (u.gold < 0) gold += u.gold;
      if (u.wood < 0) wood += u.wood;
    }
    return { gold: Math.max(0, gold), wood: Math.max(0, wood) };
  }

  /**
   * PUT /pvp/snapshot：快照已经由 Worker 用 validateBase 校验过。applied = 浏览器已经加 / 扣进这份存档的待扣 / 待领 raidId，
   * 只留现在还挂着的（ack 时这些不再改快照的资源）。1 行
   */
  async upload(profile: Profile, name: string, now: number, applied: readonly string[] = []): Promise<{ ok: true; entry: HarborEntry } | Err> {
    const s = structuredClone(await this.state());
    if (!this.bump(s, 'snap', now)) return err('rate_limited');
    s.snapApplied = s.pending.flatMap(pieces).map((x) => x.raidId).filter((id) => applied.includes(id));
    s.snap = profile;
    s.snapAt = now;
    s.name = name;
    if (!s.created) s.created = now;
    await this.save(s);
    return { ok: true, entry: this.entry(s, now) };
  }

  /** GET /pvp/me：只读 */
  async me(now: number): Promise<unknown> {
    const s = await this.state();
    const d = await this.defenses();
    return {
      trophies: s.trophies,
      shieldUntil: s.shieldUntil > now ? s.shieldUntil : 0,
      protectUntil: protectUntil(s, now) > now ? protectUntil(s, now) : 0,
      synced: s.created > 0,
      pending: s.pending,
      defenses: d.map((x) => ({
        raidId: x.raidId,
        at: x.at,
        attacker: x.attackerName,
        stars: x.stars,
        pct: x.pct,
        lost: x.lost,
        trophies: x.trophies,
        revenge: !x.revenged && !x.fromRevenge && now - x.at < DAY,
        rules: x.setup.rules,
      })),
    };
  }

  /**
   * POST /pvp/ack：浏览器已经把这些加 / 扣进本地存档。快照里的资源同步加减（下一次上传前别人看到的是对的数），
   * 但上一份快照已经含了的（upload 时带的 applied）跳过，不加减第二次。最多 1 行，没有要清的不写。
   * 浏览器取走后、ack 到之前这几条被并进了一条（攒满时）：ack 的 raidId 落在并成那条的明细里，就只把那几笔从明细里拿掉
   */
  async ack(raidIds: string[]): Promise<{ ok: true; cleared: number }> {
    const cur = await this.state();
    const s = structuredClone(cur);
    let cleared = 0;
    const credit = (r: Res): void => {
      if (!s.snap) return;
      s.snap.res.gold = Math.max(0, s.snap.res.gold + r.gold);
      s.snap.res.wood = Math.max(0, s.snap.res.wood + r.wood);
    };
    const keep: Pending[] = [];
    for (const p of s.pending) {
      if (raidIds.includes(p.raidId)) {
        credit(unapplied(p, cur.snapApplied));
        cleared++;
        continue;
      }
      const ps = pieces(p);
      const gone = ps.filter((x) => raidIds.includes(x.raidId));
      if (p.parts && gone.length > 0) {
        for (const x of gone) {
          if (!cur.snapApplied.includes(x.raidId)) credit(x);
          p.gold -= x.gold;
          p.wood -= x.wood;
        }
        p.parts = p.parts.filter((x) => !raidIds.includes(x.raidId));
        cleared++;
        if (p.parts.length === 0 && p.gold === 0 && p.wood === 0) continue;
      }
      keep.push(p);
    }
    if (cleared === 0) return { ok: true, cleared: 0 };
    s.pending = keep;
    s.snapApplied = s.snapApplied.filter((id) => !raidIds.includes(id));
    await this.save(s);
    return { ok: true, cleared };
  }

  /**
   * 进攻第一步（进攻方）：限流计数、取进攻要的东西。1 行。
   * prev：上一场还挂着（过期没交，或者没交就又来找对手），Worker 先把它按放弃结掉再开新的。
   * attacked：匹配要排除的人（24 小时内打过的、24 小时内对打已到上限的）。
   */
  async prepare(now: number): Promise<
    { ok: true; name: string; trophies: number; hq: number; army: ArmySetup; attacked: string[]; prev: Active | null; entry: HarborEntry } | Err
  > {
    const s = structuredClone(await this.state());
    if (!s.snap) return err('no_snapshot');
    if (!this.bump(s, 'find', now)) return err('rate_limited');
    for (const [k, t] of Object.entries(s.attacked)) if (now - t >= DAY) delete s.attacked[k];
    prunePair(s, now);
    await this.save(s);
    // 去打别人就丢掉自己的护盾：Harbor 那一行在 pick 时一起改
    const entry = { ...this.entry(s, now), shieldUntil: 0 };
    const full = Object.entries(s.pair).filter(([, l]) => l.length >= PAIR_PER_DAY).map(([k]) => k);
    const attacked = [...new Set([...Object.keys(s.attacked), ...full])];
    return { ok: true, name: s.name, trophies: s.trophies, hq: hqLevel(s.snap), army: armyFor(s.snap), attacked, prev: s.active, entry };
  }

  /**
   * 进攻第二步（进攻方）：记下这场、丢掉护盾、记"24 小时打过谁"、复仇记已用。1 行（复仇时 2 行）。
   * 复仇在这里再查一次"用过没有"（两个复仇请求同时进来时只有一个能记上），用过了回 revenged，Worker 解掉刚加的锁。
   * 还挂着别的一场（同一个人同时找了两次对手）：不覆盖成没人管的锁——流浪海盗岛的当场按放弃结掉，真人岛的回 replaced 由 Worker 去防守方按放弃结。
   */
  async begin(a: Active, now: number, revengeOf?: string): Promise<{ ok: true; replaced: Active | null } | Err> {
    const s = structuredClone(await this.state());
    let d: Defense[] | undefined;
    if (revengeOf) {
      d = structuredClone(await this.defenses());
      const rec = d.find((x) => x.raidId === revengeOf);
      if (!rec || rec.revenged || rec.fromRevenge) return err('revenged');
      rec.revenged = true;
    }
    let replaced: Active | null = null;
    const old = s.active;
    if (old && old.raidId !== a.raidId) {
      if (old.wander) this.applyCredit(s, this.wandererOutcome(s, old, [], 0, now, true));
      else replaced = old;
    }
    s.active = a;
    s.shieldUntil = 0;
    // 保护期里主动打真人：保护到此为止（界面开打前写清「抢别人会结束你的保护」）；打流浪海盗岛不算
    if (a.defenderId && protectUntil(s, now) > now) s.protectEnd = now;
    if (a.defenderId) {
      s.attacked[a.defenderId] = now;
      prunePair(s, now);
      s.pair[a.defenderId] = [...(s.pair[a.defenderId] ?? []), now];
    }
    await this.save(s, d);
    return { ok: true, replaced };
  }

  /** 复仇对象：24 小时内、没复仇过、本身不是复仇的防守记录里的进攻方。只读 */
  async revengeTarget(raidId: string, now: number): Promise<{ ok: true; attackerId: string } | Err> {
    const rec = (await this.defenses()).find((x) => x.raidId === raidId);
    if (!rec) return err('not_found');
    if (rec.revenged || rec.fromRevenge) return err('revenged');
    if (now - rec.at >= DAY) return err('too_late');
    return { ok: true, attackerId: rec.attackerId };
  }

  /** 把锁按"布局 + 部队 + 种子 + 操作"结掉，改 s、d（不存）。expired = 过期按空打 */
  private settleLock(s: BaseState, d: Defense[], actions: BattleAction[], endTick: number, now: number, expired: boolean): Outcome {
    const lock = s.lock!;
    const acts = expired ? [] : actions;
    const end = expired ? 0 : endTick;
    const { result } = replayRaid(lock.setup, acts, end);
    const lost = raidLoss(lock.stash, result.destroyedPct);
    // 复仇不给系统赏金：拿回来的只有对方掉的，两个号来回复仇刷不出新资源
    const gain = lock.revenge ? { ...lost } : raidGain(lost);
    const tr = trophyDelta(lock.attackerTrophies, s.trophies, result.stars);
    s.trophies += tr.def;
    const shield = shieldMs(result.destroyedPct);
    if (shield > 0) s.shieldUntil = Math.max(s.shieldUntil, now + shield);
    if (lost.gold > 0 || lost.wood > 0) s.pending = pushPending(s.pending, { raidId: lock.raidId, gold: -lost.gold, wood: -lost.wood });
    s.lock = null;
    d.unshift({
      raidId: lock.raidId,
      at: now,
      attackerId: lock.attackerId,
      attackerName: lock.attackerName,
      stars: result.stars,
      pct: result.destroyedPct,
      lost,
      trophies: tr.def,
      attTrophies: tr.att,
      setup: lock.setup,
      actions: acts,
      endTick: end,
      ...(lock.revenge ? { fromRevenge: true } : {}),
    });
    d.length = Math.min(d.length, DEFENSES_MAX);
    return {
      raidId: lock.raidId,
      stars: result.stars,
      pct: result.destroyedPct,
      lost,
      gain,
      attTrophies: tr.att,
      defTrophies: tr.def,
      defTotal: s.trophies,
      defShield: s.shieldUntil,
      wanderer: false,
      expired,
    };
  }

  private outcomeOf(rec: Defense, s: BaseState): Outcome {
    // 重复交：从防守记录还原（奖杯变化按记下来的；进攻方那边按 raidId 幂等，不会再加一次）
    return {
      raidId: rec.raidId,
      stars: rec.stars,
      pct: rec.pct,
      lost: rec.lost,
      gain: rec.fromRevenge ? { ...rec.lost } : raidGain(rec.lost),
      attTrophies: rec.attTrophies,
      defTrophies: rec.trophies,
      defTotal: s.trophies,
      defShield: s.shieldUntil,
      wanderer: false,
      expired: rec.actions.length === 0 && rec.endTick === 0,
    };
  }

  /**
   * 防守方：给一场进攻加锁，回布局快照。被锁着（没过期）、有护盾、新号保护（复仇也看）、24 小时内和这个人已经打满 PAIR_PER_DAY 场、打自己都拒绝。
   * 原来的锁过期了就先按空打结掉。最多 2 行（状态 + 过期那场的防守记录）。
   */
  async lock(
    req: { raidId: string; attackerId: string; attackerName: string; attackerTrophies: number; army: ArmySetup; seed: number; revenge?: boolean },
    now: number,
  ): Promise<{ ok: true; layout: Placed[]; hero: number; opponent: Opponent; stash: Res; until: number; entry: HarborEntry } | Err> {
    if (req.attackerId === this.userId) return err('self');
    const cur = await this.state();
    if (!cur.snap) return err('no_snapshot');
    if (cur.lock && cur.lock.until >= now) return err('locked');
    if (cur.shieldUntil > now) return err('shield');
    if (protectUntil(cur, now) > now) return err('protected');
    if ((cur.pair[req.attackerId] ?? []).filter((t) => now - t < DAY).length >= PAIR_PER_DAY) return err('pair_limit');
    const s = structuredClone(cur);
    prunePair(s, now);
    s.pair[req.attackerId] = [...(s.pair[req.attackerId] ?? []), now];
    let d: Defense[] | undefined;
    if (s.lock) {
      d = structuredClone(await this.defenses());
      this.settleLock(s, d, [], 0, now, true);
    }
    // 分叉、驻岛英雄等级跟着布局进这一场；锁里存的 setup 带着 rules，回放按那一场的版本放
    const layout = s.snap!.base.buildings.map((b) => ({ id: b.id, kind: b.kind, level: b.level, x: b.x, y: b.y, ...(b.branch ? { branch: [...b.branch] } : {}) }));
    const hero = heroLevel(s.snap!);
    const stash = this.stash(s);
    const until = now + LOCK_MS;
    s.lock = {
      raidId: req.raidId,
      attackerId: req.attackerId,
      attackerName: req.attackerName,
      attackerTrophies: req.attackerTrophies,
      until,
      setup: raidSetup(layout, islandExt(layout), req.army, req.seed, hero),
      stash,
      ...(req.revenge ? { revenge: true } : {}),
    };
    await this.save(s, d);
    return { ok: true, layout, hero, opponent: { name: s.name, trophies: s.trophies, hq: hqLevel(s.snap!), ...(rankOf(s.snap!) > 0 ? { rank: rankOf(s.snap!) } : {}) }, stash, until, entry: this.entry(s, now) };
  }

  /** 防守方：结算一场。重复交回原结果；锁过期了、进攻方放弃（forfeit）都按空打。2 行 */
  async settle(raidId: string, actions: BattleAction[], endTick: number, now: number, forfeit = false): Promise<{ ok: true; out: Outcome; entry: HarborEntry } | Err> {
    const cur = await this.state();
    const prev = (await this.defenses()).find((x) => x.raidId === raidId);
    if (prev) return { ok: true, out: this.outcomeOf(prev, cur), entry: this.entry(cur, now) };
    if (!cur.lock || cur.lock.raidId !== raidId) return err('no_raid');
    const s = structuredClone(cur);
    const d = structuredClone(await this.defenses());
    const out = this.settleLock(s, d, actions, endTick, now, forfeit || cur.lock.until < now);
    await this.save(s, d);
    return { ok: true, out, entry: this.entry(s, now) };
  }

  /** 进攻方：这场现在是什么状态（只读）。done = 已经结过（重复交）；active = 正在打 */
  async lookup(raidId: string): Promise<{ done: Outcome } | { active: Active } | null> {
    const s = await this.state();
    const done = s.done.find((o) => o.raidId === raidId);
    if (done) return { done };
    if (s.active?.raidId === raidId) return { active: s.active };
    return null;
  }

  /** 记下一场的结果（奖杯、待领、结过的、清掉正在打的），改 s，不存 */
  private applyCredit(s: BaseState, out: Outcome): void {
    s.trophies = Math.max(0, s.trophies + out.attTrophies);
    if (out.gain.gold > 0 || out.gain.wood > 0) s.pending = pushPending(s.pending, { raidId: out.raidId, gold: out.gain.gold, wood: out.gain.wood });
    s.done = [out, ...s.done].slice(0, DONE_MAX);
    if (s.active?.raidId === out.raidId) s.active = null;
  }

  /** 进攻方：记下结果（奖杯、待领的掠夺），按 raidId 幂等。1 行 */
  async credit(out: Outcome, now: number): Promise<{ ok: true; trophies: number; entry: HarborEntry; dup: boolean }> {
    const cur = await this.state();
    if (cur.done.some((o) => o.raidId === out.raidId)) return { ok: true, trophies: cur.trophies, entry: this.entry(cur, now), dup: true };
    const s = structuredClone(cur);
    this.applyCredit(s, out);
    await this.save(s);
    return { ok: true, trophies: s.trophies, entry: this.entry(s, now), dup: false };
  }

  /** 流浪海盗岛这一场的结果（掠夺来自系统，奖杯减半）；过期、放弃都按空打 */
  private wandererOutcome(s: BaseState, a: Active, actions: BattleAction[], endTick: number, now: number, forfeit: boolean): Outcome {
    const expired = forfeit || a.until < now;
    const { result } = replayRaid(a.wander!.setup, expired ? [] : actions, expired ? 0 : endTick);
    const tr = trophyDelta(s.trophies, s.trophies, result.stars, true);
    return {
      raidId: a.raidId,
      stars: result.stars,
      pct: result.destroyedPct,
      lost: { gold: 0, wood: 0 },
      gain: wandererGain(a.wander!.loot, result.destroyedPct),
      attTrophies: tr.att,
      defTrophies: 0,
      defTotal: 0,
      defShield: 0,
      wanderer: true,
      expired,
    };
  }

  /** 进攻方：流浪海盗岛在自己这里重放结算。1 行 */
  async finishWanderer(raidId: string, actions: BattleAction[], endTick: number, now: number, forfeit = false): Promise<{ ok: true; out: Outcome; entry: HarborEntry } | Err> {
    const cur = await this.state();
    const a = cur.active;
    if (!a || a.raidId !== raidId || !a.wander) return err('no_raid');
    const out = this.wandererOutcome(cur, a, actions, endTick, now, forfeit);
    const r = await this.credit(out, now);
    return { ok: true, out, entry: r.entry };
  }

  /**
   * 防守方：解掉一把锁、不记防守记录。只在复仇的 begin 失败（同一条防守记录被另一个请求抢先用了）时用：这场根本没开始。
   * 1 行，锁不是这场的不写。进攻方自己放弃走 settle(forfeit)，不走这里。
   */
  async release(raidId: string, now: number): Promise<{ ok: true; entry: HarborEntry | null }> {
    const cur = await this.state();
    if (cur.lock?.raidId !== raidId) return { ok: true, entry: null };
    const s = structuredClone(cur);
    // 这场没开始：lock 时记的那次配对也撤掉
    const list = s.pair[cur.lock.attackerId];
    if (list) {
      list.pop();
      if (list.length === 0) delete s.pair[cur.lock.attackerId];
    }
    s.lock = null;
    await this.save(s);
    return { ok: true, entry: this.entry(s, now) };
  }

  /**
   * 兑换第一步：占一个当天的名额（按 ref 幂等）。state：'new' 新占的，'wait' 以前占过还没换完（重发钱包动作，钱包按 op 只算一次），
   * 'gold' / 'wood' 已经换完（回原结果）。名额满了回 limit。新占才写 1 行。
   */
  async exchangeBegin(ref: string, day: string, perDay: number): Promise<{ ok: true; state: 'new' | 'wait' | 'gold' | 'wood' } | Err> {
    const cur = await this.state();
    const had = cur.ex.refs[ref];
    if (had) return { ok: true, state: had };
    const s = structuredClone(cur);
    if (s.ex.day !== day) s.ex = { day, n: 0, refs: s.ex.refs };
    if (s.ex.n >= perDay) return err('limit');
    s.ex.n++;
    const keep = Object.entries(s.ex.refs).slice(-(REFS_MAX - 1));
    s.ex.refs = Object.fromEntries([...keep, [ref, 'wait']]);
    await this.save(s);
    return { ok: true, state: 'new' };
  }

  /** 兑换第二步：钱包那边扣完了，记成待领（浏览器同步时加进存档）。1 行；已经记过不写 */
  async exchangeDone(ref: string, into: 'gold' | 'wood', got: Res): Promise<{ ok: true; pending: Pending }> {
    const cur = await this.state();
    const pending: Pending = { raidId: ref, gold: got.gold, wood: got.wood };
    if (cur.ex.refs[ref] !== 'wait') return { ok: true, pending };
    const s = structuredClone(cur);
    s.ex.refs[ref] = into;
    s.pending = [...s.pending, pending].slice(-PENDING_MAX);
    await this.save(s);
    return { ok: true, pending };
  }

  /** 钱包拒了（余额不够等）：退回名额。1 行 */
  async exchangeUndo(ref: string): Promise<{ ok: true }> {
    const cur = await this.state();
    if (cur.ex.refs[ref] !== 'wait') return { ok: true };
    const s = structuredClone(cur);
    delete s.ex.refs[ref];
    s.ex.n = Math.max(0, s.ex.n - 1);
    await this.save(s);
    return { ok: true };
  }

  /** 实盘带入前占一场（按 ref 幂等：同一个 ref 重发不重复计）。今天满了回 live_daily。四种实盘各记各的。新占才写 1 行 */
  async slotBegin(k: SlotKind, ref: string, day: string, max: number): Promise<{ ok: true; left: number } | Err> {
    const cur = await this.state();
    const c = cur[k];
    const n = c.day === day ? c.n : 0;
    if (c.day === day && c.refs.includes(ref)) return { ok: true, left: Math.max(0, max - n) };
    if (n >= max) return err('live_daily');
    const s = structuredClone(cur);
    s[k] = { day, n: n + 1, refs: [...(c.day === day ? c.refs : []), ref].slice(-REFS_MAX) };
    await this.save(s);
    return { ok: true, left: Math.max(0, max - n - 1) };
  }
  /** 钱包拒了带入（余额不够等）：把这一场退回去。1 行 */
  async slotUndo(k: SlotKind, ref: string): Promise<{ ok: true }> {
    const cur = await this.state();
    if (!cur[k].refs.includes(ref)) return { ok: true };
    const s = structuredClone(cur);
    s[k] = { day: s[k].day, n: Math.max(0, s[k].n - 1), refs: s[k].refs.filter((r) => r !== ref) };
    await this.save(s);
    return { ok: true };
  }
  /** 今天还能打几场（只读） */
  async slotLeft(k: SlotKind, day: string, max: number): Promise<number> {
    const s = await this.state();
    return Math.max(0, max - (s[k].day === day ? s[k].n : 0));
  }

  /** 今天还能换几次（只读） */
  async exchangeLeft(day: string, perDay: number): Promise<number> {
    const s = await this.state();
    return s.ex.day === day ? Math.max(0, perDay - s.ex.n) : perDay;
  }

  /** GET /pvp/defense/<raidId>：回放数据（只读） */
  async defense(raidId: string): Promise<Defense | null> {
    return (await this.defenses()).find((x) => x.raidId === raidId) ?? null;
  }
}
