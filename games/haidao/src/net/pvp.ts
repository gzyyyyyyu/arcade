/**
 * 异步攻防的浏览器端（DESIGN.md 第 5 节）：调 /games/haidao/api/pvp/*，上传基地快照，把服务端算好的待扣 / 待领加进本地存档。
 * 存档正本本期仍在浏览器（haidao.save）；这里不碰画面。
 *
 * 本机记一份 `haidao.pvp` = { applied: 已经加 / 扣过的 raidId（最近 200 个，含并成那条的明细）, seenAt: 上次看过防守记录的时间 }：
 * ack 没送达时下次同步还会拿到同一条待扣，靠它不重复扣；上传快照时一起带上，服务端据此知道快照的资源已经含了哪些，ack 时不再给快照加减第二次。
 */
import { capacity } from '../core/index.ts';
import { validateBase } from '../core/validate.ts';
import { pvpSnapshot } from '../core/tdbase.ts';
import { RULES_VERSION } from '../core/types.ts';
import type { BattleAction, BattleSetup, Profile, Res } from '../core/types.ts';
import type { Save } from '../platform/sync.ts';

export const PVP_KEY = 'haidao.pvp';
const API = 'api/pvp/';
/** 存档写完后多久上传一次快照（防抖），切后台时补一次 */
export const SNAPSHOT_DEBOUNCE_MS = 30_000;

export interface Pending {
  raidId: string;
  gold: number;
  wood: number;
  /** 服务端攒满时并成的一条：gold / wood 是合计，parts 是每一场的明细 */
  parts?: Pending[];
}

/**
 * 一条待扣 / 待领拆成按 raidId 去重的几笔（和 worker/pvp/base.ts 的 pieces 一致）：
 * 并成的那条按明细一笔笔算，明细之外的零头记在 raidId = 这一条 raidId 的那笔上
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
export interface DefenseBrief {
  raidId: string;
  at: number;
  attacker: string;
  stars: number;
  pct: number;
  lost: Res;
  trophies: number;
  revenge: boolean;
  rules: number;
}
export interface Me {
  trophies: number;
  shieldUntil: number;
  protectUntil: number;
  synced: boolean;
  pending: Pending[];
  defenses: DefenseBrief[];
}
export interface RaidStart {
  raidId: string;
  wanderer: boolean;
  opponent: { name: string; trophies: number; hq: number; rank?: number };
  setup: BattleSetup;
  until: number;
  maxGain: Res;
}
export interface RaidResult {
  raidId: string;
  stars: number;
  pct: number;
  gain: Res;
  lost: Res;
  trophies: number;
  total: number;
  wanderer: boolean;
  expired: boolean;
  dup: boolean;
}
export interface DefenseReplay {
  raidId: string;
  attacker: string;
  at: number;
  stars: number;
  pct: number;
  lost: Res;
  setup: BattleSetup;
  actions: BattleAction[];
  endTick: number;
}

export type Reply<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** 服务端发回的 setup 比本页的规则新：部署后还开着旧页面，按旧规则演会对不上，不开打、提示刷新 */
export const rulesTooNew = (setup: { rules?: number }): boolean => typeof setup.rules === 'number' && setup.rules > RULES_VERSION;

/** 没登录提示 cookie、501（单独部署）、401（没登录）之后不再打扰：入口藏起来、不上传 */
export const pvpState = { off: false };

/** 平台登录后给的提示 cookie（cloud.ts 同一个判断）：没有就是没登录或单独部署，不发请求（本地 dev / 冒烟不出 404） */
export const loggedIn = (): boolean => typeof document !== 'undefined' && /(?:^|;\s*)__Host-arcade_li=1(?:;|$)/.test(document.cookie);

/** 入口按钮显示不显示：登录了、也没被 501 / 401 关掉 */
export const pvpReady = (): boolean => !pvpState.off && loggedIn();

async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<Reply<T>> {
  if (!pvpState.off && !loggedIn()) pvpState.off = true;
  if (pvpState.off) return { ok: false, status: 501, error: 'no_platform' };
  try {
    const init: RequestInit = { method, credentials: 'same-origin', cache: 'no-store' };
    if (method !== 'GET') init.headers = { 'Content-Type': 'application/json', 'X-Arcade': '1' };
    if (body !== undefined) init.body = JSON.stringify(body);
    else if (method !== 'GET') init.body = '{}';
    const r = await fetch(API + path, init);
    const data = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
    if (r.status === 501 || r.status === 401) pvpState.off = true;
    if (!r.ok || !data || data.ok === false) return { ok: false, status: r.status, error: data?.error ?? 'unavailable' };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: 'offline' };
  }
}

export const pvpApi = {
  me: () => call<Me>('GET', 'me'),
  // rules：服务端据此挡住还开着旧页面的人（worker/live.ts 的 checkRules）
  find: () => call<RaidStart>('POST', 'find', { rules: RULES_VERSION }),
  revenge: (raidId: string) => call<RaidStart>('POST', 'revenge', { raidId, rules: RULES_VERSION }),
  /** 只交操作和结束拍；结果以服务端重放为准 */
  finish: (raidId: string, actions: BattleAction[], endTick: number) => call<RaidResult>('POST', 'finish', { raidId, actions, endTick }),
  /** 放弃（换一个、不打了）：按空打结，记一场输（扣奖杯），防守方解锁、不掉东西 */
  cancel: (raidId: string) => call<{ cancelled: boolean; trophies?: number; total?: number }>('POST', 'cancel', { raidId }),
  ack: (raidIds: string[]) => call<{ cleared: number }>('POST', 'ack', { raidIds }),
  defense: (raidId: string) => call<DefenseReplay>('GET', `defense/${encodeURIComponent(raidId)}`),
  /** applied：这份存档已经加 / 扣过的待扣 / 待领 raidId（readLocal().applied）；服务端最多收 100 个，带最近的 */
  snapshot: (profile: Profile, applied: readonly string[] = []) => call<unknown>('PUT', 'snapshot', { profile, applied: applied.slice(-100) }),
};

interface Local {
  applied: string[];
  seenAt: number;
}
export function readLocal(): Local {
  try {
    const v = JSON.parse(localStorage.getItem(PVP_KEY) ?? 'null') as Partial<Local> | null;
    return { applied: Array.isArray(v?.applied) ? v.applied.filter((x): x is string => typeof x === 'string') : [], seenAt: typeof v?.seenAt === 'number' ? v.seenAt : 0 };
  } catch {
    return { applied: [], seenAt: 0 };
  }
}
export function writeLocal(l: Local): void {
  try {
    localStorage.setItem(PVP_KEY, JSON.stringify({ applied: l.applied.slice(-200), seenAt: l.seenAt }));
  } catch {
    // 存不上：最坏是 ack 没送达时同一条再加 / 扣一次
  }
}

/**
 * 把待扣 / 待领加进存档（纯函数）：已经处理过的跳过；扣不到负数，领不超过仓库上限（和战役掠夺一样）。
 * 回新存档、这次新处理的那几笔（并成的那条拆成明细，每笔一个 raidId，调用方把它们记进 applied；
 * 要 ack 的是 pending 里的全部，包括以前处理过但 ack 没送达的）。
 */
export function applyPending(p: Profile, pending: Pending[], applied: readonly string[]): { profile: Profile; fresh: Pending[] } {
  const cap = capacity(p);
  let gold = p.res.gold;
  let wood = p.res.wood;
  const fresh: Pending[] = [];
  for (const x of pending.flatMap(pieces)) {
    if (applied.includes(x.raidId)) continue;
    fresh.push(x);
    gold = x.gold < 0 ? Math.max(0, gold + x.gold) : Math.max(gold, Math.min(cap.gold, gold + x.gold));
    wood = x.wood < 0 ? Math.max(0, wood + x.wood) : Math.max(wood, Math.min(cap.wood, wood + x.wood));
  }
  if (fresh.length === 0) return { profile: p, fresh };
  return { profile: { ...p, res: { gold, wood } }, fresh };
}

/**
 * 快照上传：存档写完后防抖 30 秒传一次，切后台立刻补传。本地先用 validateBase 自检，过不了就不传（服务端也会拒）。
 * getSave 每次取最新的存档。
 */
export function startSnapshotSync(getSave: () => Save): { touch(): void; flush(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = true;
  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty || pvpState.off) return;
    // 宝藏箱、分叉、英雄研究都进攻防（规则版本 6），pvpSnapshot 只去掉本机进度
    const v = validateBase(pvpSnapshot(getSave().profile));
    if (!v.ok) return;
    dirty = false;
    // 存档和 applied 是同一次 syncPending 里一起写的，这里一起读，服务端才知道快照的资源含了哪些
    void pvpApi.snapshot(v.value, readLocal().applied).then((r) => {
      // 限流、网断了：下次写档再试
      if (!r.ok && r.status !== 400) dirty = true;
    });
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  return {
    touch(): void {
      dirty = true;
      if (!timer) timer = setTimeout(flush, SNAPSHOT_DEBOUNCE_MS);
    },
    flush,
  };
}
