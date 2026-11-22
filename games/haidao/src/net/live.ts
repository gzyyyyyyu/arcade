/**
 * 悬赏出海（实盘）和筹码兑换的浏览器端（DESIGN.md 第 4 节，照夜巡 src/platform/live.ts 精简）：
 * 带入、结回、放弃、兑换都经海岛自己的 Worker（同域 POST api/live/*）转给平台钱包；本机记一条 `haidao.live`，管"这一份筹码走到哪一步了"。
 *
 * - 带入前先写成 buying：回话丢了也知道这个 ref 可能已经带入，下次 resume() 先 refund 收回（没带入则钱包回 no_stake，清掉）。
 * - 结回、放弃先写成 settling 再发，连不上就停在 settling，下次打开时重发；操作 id 按 ref 固定，钱包只算一次。
 * - 打到一半关页面算输：resume() 把 playing 的那一份按 0 倍结回（悬赏岛一场两三分钟，不存打到一半的局）。
 * - 带入时记下账号（Worker 回的 user）：结回、放弃时带上，换了账号 Worker 回 409 wrong_user，不动钱包。
 * - 501（单独部署，没有钱包）、没登录：off 为 true，实盘入口藏起来。
 */
import { RULES_VERSION } from '../core/types.ts';
import type { LiveTier } from '../core/live.ts';
import { loggedIn } from './pvp.ts';
import { netTimeout } from './timeout.ts';

export const LIVE_KEY = 'haidao.live';
/** 悬赏守岛（DESIGN.md 10.5）、护航（12.1）、寻宝航线（11.1）走同一套流程，本机进度和接口各用自己的 */
export const TDLIVE_KEY = 'haidao.tdlive';
const ESCORTLIVE_KEY = 'haidao.escortlive';
export const MAPLIVE_KEY = 'haidao.maplive';
const API = 'api/live/';
const TD_API = 'api/td/';
const ESCORT_API = 'api/escort/';
const MAP_API = 'api/map/';

type LiveStep = 'buying' | 'playing' | 'settling' | 'done';
export interface LiveRecord {
  ref: string;
  tier: LiveTier;
  seed: number;
  at: number;
  step: LiveStep;
  kind?: 'settle' | 'refund';
  bp?: number;
  /** 打到一半离开（关页面、断电）时按多少结：单场没有（按 0 结），悬赏连闯随进度更新 */
  floor?: number;
  user?: string;
  credited?: number;
  capped?: number;
}

export type Sent = { ok: true; body: Record<string, unknown> } | { ok: false; why: 'offline' | 'login' | 'off' | 'reject'; error: string };

export const liveState = { off: false };

async function post(api: string, action: string, body: Record<string, unknown>): Promise<Sent> {
  if (!liveState.off && !loggedIn()) liveState.off = true;
  if (liveState.off) return { ok: false, why: 'off', error: 'no_wallet' };
  try {
    const r = await fetch(api + action, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: netTimeout(),
      headers: { 'Content-Type': 'application/json', 'X-Arcade': '1' },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (r.status === 501) {
      liveState.off = true;
      return { ok: false, why: 'off', error: 'no_wallet' };
    }
    if (r.status === 401 || r.status === 409) return { ok: false, why: 'login', error: String(data?.error ?? 'login') };
    if (r.status >= 500 || !data) return { ok: false, why: 'offline', error: String(data?.error ?? 'unavailable') };
    if (r.status !== 200 || data.ok !== true) return { ok: false, why: 'reject', error: String(data.error ?? `http_${r.status}`) };
    return { ok: true, body: data };
  } catch {
    return { ok: false, why: 'offline', error: 'offline' };
  }
}

function load(key: string): LiveRecord | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as LiveRecord | null;
    return v && typeof v.ref === 'string' && typeof v.step === 'string' ? v : null;
  } catch {
    return null;
  }
}
function save(key: string, r: LiveRecord | null): void {
  try {
    if (r) localStorage.setItem(key, JSON.stringify(r));
    else localStorage.removeItem(key);
  } catch {
    // 存不上：最坏是回话丢了时这一份等到期（24 小时）自动退回
  }
}

const rand32 = (): number => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return (b[0]! & 0x3fffffff) | 1;
};

/**
 * 一条实盘流程：api 是接口前缀，key 是本机进度的 localStorage key。
 * keepPlaying：resume() 遇到 playing 时先问它，回 true 就不按输结（寻宝航线一趟跨好几站、刷新后接着跑，进度另存）。
 */
function makeLive(api: string, key: string, keepPlaying: (r: LiveRecord) => boolean = () => false) {
  const L = {
    get record(): LiveRecord | null {
      return load(key);
    },
    /** 有一份没结完 */
    get busy(): boolean {
      const r = load(key);
      return !!r && r.step !== 'done';
    },

    async buyin(tier: LiveTier, now = Date.now()): Promise<{ ok: true; rec: LiveRecord } | { ok: false; why: string; error: string }> {
      await this.resume();
      if (this.busy) return { ok: false, why: 'reject', error: 'pending' };
      const rec: LiveRecord = { ref: `haidao-${crypto.randomUUID()}`, tier, seed: rand32(), at: now, step: 'buying' };
      save(key, rec);
      const r = await post(api, 'buyin', { ref: rec.ref, tier, rules: RULES_VERSION });
      if (!r.ok) {
        // 连不上：留在 buying，下次 resume 用 refund 收回；明确被拒（钱包拒绝等）就清掉
        if (r.why !== 'offline') save(key, null);
        return r;
      }
      const next: LiveRecord = { ...rec, step: 'playing', ...(typeof r.body.user === 'string' ? { user: r.body.user } : {}) };
      save(key, next);
      return { ok: true, rec: next };
    },

    /** 打完：按 bp 结回（倍数由 src/core/live.ts 的 liveBp 按星数和摧毁率算） */
    async settle(bp: number): Promise<Sent> {
      const r = load(key);
      if (!r) return { ok: false, why: 'reject', error: 'no_record' };
      save(key, { ...r, step: 'settling', kind: 'settle', bp });
      return this.flush();
    },

    /** 打的过程中更新"现在离开按多少结"（悬赏连闯每过一座、每次选再闯时调） */
    setFloor(bp: number): void {
      const r = load(key);
      if (r?.step === 'playing') save(key, { ...r, floor: bp });
    },

    /** 没开打就放弃：原样退回 */
    async refund(): Promise<Sent> {
      const r = load(key);
      if (!r) return { ok: false, why: 'reject', error: 'no_record' };
      save(key, { ...r, step: 'settling', kind: 'refund' });
      return this.flush();
    },

    async flush(): Promise<Sent> {
      const r = load(key);
      if (r?.step !== 'settling') return { ok: false, why: 'reject', error: 'no_record' };
      const base = { ref: r.ref, ...(r.user ? { user: r.user } : {}) };
      const res = r.kind === 'refund' ? await post(api, 'refund', base) : await post(api, 'settle', { ...base, tier: r.tier, bp: r.bp });
      if (res.ok || res.why === 'reject') {
        // 钱包拒了（已经退过、过期）也收尾：再发也不会变
        const credited = res.ok && typeof res.body.credited === 'number' ? res.body.credited : 0;
        const capped = res.ok && typeof res.body.capped === 'number' ? res.body.capped : 0;
        save(key, { ...r, step: 'done', credited, capped });
      }
      return res;
    },

    /** 打开页面时：buying 收回、playing 按输结（中途离开）、settling 重发 */
    async resume(): Promise<void> {
      const r = load(key);
      if (!r || r.step === 'done') return;
      if (r.step === 'buying') save(key, { ...r, step: 'settling', kind: 'refund' });
      else if (r.step === 'playing') {
        if (keepPlaying(r)) return;
        save(key, { ...r, step: 'settling', kind: 'settle', bp: r.floor ?? 0 });
      }
      await this.flush();
    },
  };
  return L;
}

// Object.assign 而不是展开：展开会把 record / busy 这两个 getter 固化成当时的值
export const live = Object.assign(makeLive(API, LIVE_KEY), {
  /** 兑换一份小档的筹码成金币或木材；ref 由调用方生成，失败重发时用同一个 */
  exchange: (ref: string, into: 'gold' | 'wood'): Promise<Sent> => post(API, 'exchange', { ref, into }),
  newExchangeRef: (): string => `hdx-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
});

/**
 * 发出去还没确认的一笔（金银锭换筹码、筹码买装饰）：先记下 ref 再发，回话丢了下次打开用同一个 ref 重发，钱包按 op 只算一次。
 * 存不上、清不掉都只会让这一笔少算或重发一次（重发回 dup），不会多扣。
 */
function pendingOp<R extends { ref: string }>(key: string, action: string, prefix: string, valid: (v: R) => boolean) {
  return {
    pending(): R | null {
      try {
        const v = JSON.parse(localStorage.getItem(key) ?? 'null') as R | null;
        return v && typeof v.ref === 'string' && valid(v) ? v : null;
      } catch {
        return null;
      }
    },
    begin(fields: Omit<R, 'ref'>): R {
      const rec = { ...fields, ref: `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}` } as R;
      try {
        localStorage.setItem(key, JSON.stringify(rec));
      } catch {
        // 存不上：回话丢了这一笔就当没成
      }
      return rec;
    },
    send: (rec: R): Promise<Sent> => post(API, action, { ...rec }),
    done(): void {
      try {
        localStorage.removeItem(key);
      } catch {
        // 清不掉：下次打开重发，钱包回 dup
      }
    },
  };
}

/** 金银锭换筹码（存档里的锭在发之前已经扣了） */
const INGOT_KEY = 'haidao.ingotx';
export interface IngotRecord {
  ref: string;
  n: number;
}
export const ingotX = pendingOp<IngotRecord>(INGOT_KEY, 'ingot', 'hdi-', (v) => Number.isInteger(v.n) && v.n > 0);

/** 筹码买装饰（扣成了才把收藏加进存档） */
const SHOP_KEY = 'haidao.shopx';
export interface ShopRecord {
  ref: string;
  item: string;
}
export const shopX = pendingOp<ShopRecord>(SHOP_KEY, 'shop', 'hds-', (v) => typeof v.item === 'string');

/** 悬赏守岛（实盘）：同一套流程，走 api/td/*，本机进度记在 haidao.tdlive */
export const tdLive = makeLive(TD_API, TDLIVE_KEY);
/** 护航（实盘）：走 api/escort/*，本机进度记在 haidao.escortlive；一趟几分钟，中途离开按输结 */
export const escortLive = makeLive(ESCORT_API, ESCORTLIVE_KEY);
/**
 * 寻宝航线（实盘）：走 api/map/*，本机进度记在 haidao.maplive。一趟跨好几站，刷新后接着跑：
 * mapLiveHooks.keep 由画面层设（航线进度还在、还是同一天就回 true），resume() 这时不按输结；画面层负责到终局时 settle。
 */
export const mapLiveHooks: { keep: (r: LiveRecord) => boolean } = { keep: () => false };
export const mapLive = makeLive(MAP_API, MAPLIVE_KEY, (r) => mapLiveHooks.keep(r));

/** 悬赏守岛、护航、航线今天还能打几场（GET api/<玩法>/today）；拿不到为 null */
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

async function todayOf(kind: 'td' | 'escort' | 'map'): Promise<{ left: number; max: number } | null> {
  if (liveState.off || !loggedIn()) return null;
  try {
    const r = await fetch(`api/${kind}/today`, { credentials: 'same-origin', cache: 'no-store', signal: netTimeout() });
    if (r.status === 501) liveState.off = true;
    if (!r.ok) return null;
    const v = ((await r.json()) as Record<string, { left?: unknown; max?: unknown } | undefined>)[kind];
    // 字段不对就当拿不到（界面写「暂时看不到」），不当 0 场显示
    return isNum(v?.left) && isNum(v?.max) ? { left: v.left, max: v.max } : null;
  } catch {
    return null;
  }
}
export const tdToday = (): Promise<{ left: number; max: number } | null> => todayOf('td');
export const escortToday = (): Promise<{ left: number; max: number } | null> => todayOf('escort');
export const mapToday = (): Promise<{ left: number; max: number } | null> => todayOf('map');

/** 今天还能打几场实盘、还能换几次、金银锭还能换多少筹码（GET api/live/today）；拿不到为 null */
export async function liveToday(): Promise<{ live: { left: number; max: number }; exchange: { left: number; max: number }; ingot: { left: number; cap: number } | null } | null> {
  if (liveState.off || !loggedIn()) return null;
  try {
    const r = await fetch(`${API}today`, { credentials: 'same-origin', cache: 'no-store', signal: netTimeout() });
    if (r.status === 501) liveState.off = true;
    if (!r.ok) return null;
    const v = (await r.json()) as { live?: { left?: unknown; max?: unknown }; exchange?: { left?: unknown; max?: unknown }; ingot?: { left?: unknown; cap?: unknown } };
    if (!isNum(v.live?.left) || !isNum(v.live?.max) || !isNum(v.exchange?.left) || !isNum(v.exchange?.max)) return null;
    if (v.ingot && (!isNum(v.ingot.left) || !isNum(v.ingot.cap))) return null;
    return {
      live: { left: v.live.left, max: v.live.max },
      exchange: { left: v.exchange.left, max: v.exchange.max },
      ingot: v.ingot ? { left: v.ingot.left as number, cap: v.ingot.cap as number } : null,
    };
  } catch {
    return null;
  }
}

/** 钱包余额（平台 GET /api/wallet，只读）；拿不到为 null */
export async function walletBalance(): Promise<number | null> {
  if (liveState.off || !loggedIn()) return null;
  try {
    const r = await fetch('/api/wallet', { credentials: 'same-origin', cache: 'no-store', signal: netTimeout() });
    if (!r.ok) return null;
    const v = (await r.json()) as { wallet?: { balance?: unknown } };
    return typeof v.wallet?.balance === 'number' ? v.wallet.balance : null;
  } catch {
    return null;
  }
}
