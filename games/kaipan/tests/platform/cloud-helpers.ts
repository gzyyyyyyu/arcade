import { ACHIEVEMENTS, STOCKS } from '../../src/core/index.ts';
import { Cloud, type CloudDeps } from '../../src/platform/cloud.ts';
import { PROFILE_KEY, emptyProfile, type Profile } from '../../src/platform/profile.ts';
import type { KeyValueStore } from '../../src/platform/settings.ts';
import { SLOTS } from '../../src/view/cloudSync.ts';

/** 云存档测试共用：假平台按仓库根 docs/api-account.md 15.3 的规矩回话，计时器手动拨。 */

export class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

export const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export interface Call {
  method: string;
  url: string;
  body: { baseRev: number; userId?: string | null; data: unknown } | undefined;
  init: RequestInit;
}

/**
 * 假平台：存档按账号、按槽存 {rev, data}（cookie 是谁就记在谁名下），PUT 按 baseRev 判冲突
 * （baseRev 0 而云端已有、baseRev > 0 而云端没有，都是 409）。p.slots 是当前账号的那一份。
 */
export function platform() {
  const byUser = new Map<string, Map<string, { rev: number; data: unknown }>>();
  const mine = (): Map<string, { rev: number; data: unknown }> => {
    const id = p.user?.id ?? '-';
    if (!byUser.has(id)) byUser.set(id, new Map());
    return byUser.get(id)!;
  };
  const p = {
    user: { id: 'u1' } as { id: string } | null,
    saves: 'ok' as 'ok' | 'paused',
    get slots(): Map<string, { rev: number; data: unknown }> {
      return mine();
    },
    set slots(m: Map<string, { rev: number; data: unknown }>) {
      byUser.set(p.user?.id ?? '-', m);
    },
    of: (id: string): Map<string, { rev: number; data: unknown }> => byUser.get(id) ?? new Map(),
    calls: [] as Call[],
    /** 下一次请求先问它；返回 Response 就用它的 */
    hooks: [] as ((c: Call) => Response | null)[],
    offline: false,
    checkUser: true,
    fetch: async (url: string, init: RequestInit): Promise<Response> => {
      const c: Call = { method: init.method ?? 'GET', url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, init };
      p.calls.push(c);
      const hook = p.hooks.shift();
      const r = hook?.(c);
      if (r) return r;
      if (p.offline) throw new TypeError('fetch failed');
      if (url === '/api/me') return json({ user: p.user, service: 'ok', saves: p.saves });
      if (!p.user) return json({ error: 'unauthorized' }, 401);
      const q = new URL(url, 'http://x');
      // 平台：拉取带了 userId 而和会话不是同一个人，409 wrong_user、不给数据
      if (c.method === 'GET' && q.pathname === '/api/saves/kaipan' && p.checkUser && q.searchParams.has('userId') && q.searchParams.get('userId') !== p.user.id) return json({ error: 'wrong_user' }, 409);
      if (c.method === 'GET' && q.pathname === '/api/saves/kaipan') return json({ saves: [...p.slots].map(([slot, v]) => ({ slot, rev: v.rev, updatedAt: 1, data: v.data })) });
      const m = /^\/api\/saves\/kaipan\/([a-z0-9-]+)$/.exec(url);
      if (c.method === 'PUT' && m && c.body) {
        // 平台：带了 userId 而和会话不是同一个人，409 wrong_user、不写库
        if (p.checkUser && c.body.userId !== undefined && c.body.userId !== p.user.id) return json({ error: 'wrong_user' }, 409);
        const cur = p.slots.get(m[1]!);
        if ((cur?.rev ?? 0) !== c.body.baseRev) return json({ error: 'conflict', current: cur ? { rev: cur.rev, updatedAt: 1, data: cur.data } : null }, 409);
        const rev = (cur?.rev ?? 0) + 1;
        p.slots.set(m[1]!, { rev, data: c.body.data });
        return json({ rev, updatedAt: 2 });
      }
      return json({ error: 'not_found' }, 404);
    },
    puts: (): Call[] => p.calls.filter((c) => c.method === 'PUT'),
  };
  return p;
}

export function clock() {
  let t = 1_000_000;
  let n = 0;
  let q: { at: number; fn: () => void; id: number }[] = [];
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number): unknown => {
      q.push({ at: t + ms, fn, id: ++n });
      return n;
    },
    clearTimer: (id: unknown): void => {
      q = q.filter((x) => x.id !== id);
    },
    pending: (): number[] => q.map((x) => x.at - t),
    async advance(ms: number): Promise<void> {
      t += ms;
      const due = q.filter((x) => x.at <= t).sort((a, b) => a.at - b.at);
      q = q.filter((x) => x.at > t);
      for (const x of due) x.fn();
      await settle();
    },
  };
}

/** 等所有已排队的 fetch / json 回来 */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

export function setup(o: { store?: MemoryStore; hint?: boolean; plat?: ReturnType<typeof platform> } = {}) {
  const store = o.store ?? new MemoryStore();
  const plat = o.plat ?? platform();
  const clk = clock();
  let applied = 0;
  const deps: CloudDeps = {
    store,
    fetch: plat.fetch,
    slots: SLOTS,
    hasLoginHint: () => o.hint ?? true,
    now: clk.now,
    setTimer: clk.setTimer,
    clearTimer: clk.clearTimer,
    onApplied: () => {
      applied += 1;
    },
  };
  const cloud = new Cloud(deps);
  return { store, plat, clk, cloud, applied: () => applied };
}

export function profileWith(f: (p: Profile) => void): Profile {
  const p = emptyProfile();
  f(p);
  return p;
}
export const putProfile = (store: KeyValueStore, p: Profile): void => store.setItem(PROFILE_KEY, JSON.stringify(p));
export const readProfile = (store: KeyValueStore): Profile => JSON.parse(store.getItem(PROFILE_KEY)!) as Profile;
export const S = STOCKS.map((s) => s.id);
export const A = ACHIEVEMENTS.map((a) => a.id);
