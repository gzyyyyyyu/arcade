import { describe, expect, it } from 'vitest';
import { Cloud, DEBOUNCE_MS, HIDDEN_GAP_MS, META_KEY, NOTE, SESSION_PUTS, type CloudDeps, type KeyValueStore, type SlotDef, loadMeta, preSwitchKey, preSyncKey } from '../src/platform/cloud.ts';

/**
 * 云存档（platform/cloud.ts）：内存假存储、按路由回话的假平台、手动拨的钟和定时器。
 * 用一个简单的槽（一组字符串，合并取并集）代替真存档：这里锁的是同步流程（谁先谁后、记什么、什么时候停），存档怎么合并在 sync 的测试里。
 */
type Doc = { items: string[] };
const KEY = 'haidao.save';
const slot: SlotDef<Doc> = {
  name: 'profile',
  read: (st) => {
    const raw = st?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Doc) : null;
  },
  write: (st, v) => st?.setItem(KEY, JSON.stringify(v)),
  revive: (raw) => (raw && typeof raw === 'object' && Array.isArray((raw as Doc).items) ? { items: [...(raw as Doc).items] } : null),
  merge: (a, b) => ({ items: [...new Set([...a.items, ...b.items])].sort() }),
  payload: (v) => v,
  empty: () => ({ items: [] }),
};

class Mem implements KeyValueStore {
  m = new Map<string, string>();
  /** 写这些 key 时抛错（模拟配额满） */
  full = new Set<string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.full.has(k)) throw new Error('QuotaExceededError');
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
  keepalive: boolean;
}
type Reply = { status: number; body: unknown } | 'down';

/** 假平台：/api/me 回 who；GET 存档回 cloud；PUT 默认收下、rev + 1，可以先排几个特殊回话 */
function harness(o: { who?: string | null; cloud?: { data: Doc; rev: number } | null; local?: Doc; userId?: string | null; hint?: boolean } = {}) {
  const store = new Mem();
  if (o.local) store.setItem(KEY, JSON.stringify(o.local));
  if (o.userId !== undefined) store.setItem(META_KEY, JSON.stringify({ v: 1, userId: o.userId, rev: {}, dirty: [] }));
  const srv = { who: o.who === undefined ? 'u1' : o.who, cloud: o.cloud ?? null, me: [] as Reply[], put: [] as Reply[], get: [] as Reply[] };
  const calls: Call[] = [];
  let t = 1_000_000;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let tid = 0;
  const views: string[] = [];
  let applied = 0;
  const json = (status: number, body: unknown) => ({ status, json: async () => body }) as unknown as Response;
  const deps: CloudDeps = {
    store,
    slots: [slot as SlotDef],
    hasLoginHint: () => o.hint !== false,
    now: () => t,
    setTimer: (fn, ms) => {
      timers.set(++tid, { at: t + ms, fn });
      return tid;
    },
    clearTimer: (id) => timers.delete(id as number),
    onChange: (v) => views.push(v.state),
    onApplied: () => {
      applied++;
    },
    fetch: async (url, init) => {
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
      calls.push({ method: init.method ?? 'GET', url, body, keepalive: init.keepalive === true });
      const pick = (q: Reply[]): Reply | undefined => q.shift();
      if (url === '/api/me') {
        const r = pick(srv.me) ?? { status: 200, body: { user: srv.who === null ? null : { id: srv.who } } };
        if (r === 'down') throw new Error('offline');
        return json(r.status, r.body);
      }
      if (init.method === 'GET') {
        const r = pick(srv.get) ?? { status: 200, body: { saves: srv.cloud ? [{ slot: 'profile', rev: srv.cloud.rev, data: srv.cloud.data }] : [] } };
        if (r === 'down') throw new Error('offline');
        return json(r.status, r.body);
      }
      const r = pick(srv.put);
      if (r === 'down') throw new Error('offline');
      if (r) return json(r.status, r.body);
      srv.cloud = { data: body!.data as Doc, rev: (body!.baseRev as number) + 1 };
      return json(200, { rev: srv.cloud.rev });
    },
  };
  const cloud = new Cloud(deps);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  /** 拨钟 ms，到点的定时器依次跑 */
  const tick = async (ms: number): Promise<void> => {
    const end = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      t = Math.max(t, due[1].at);
      due[1].fn();
      await settle();
    }
    t = end;
  };
  const local = (): Doc | null => slot.read(store);
  const setLocal = (d: Doc): void => store.setItem(KEY, JSON.stringify(d));
  const puts = (): Call[] => calls.filter((c) => c.method === 'PUT');
  return { cloud, store, srv, calls, puts, views, applied: () => applied, tick, settle, local, setLocal, meta: () => loadMeta(store), timers };
}

describe('云存档：打开时对一下', () => {
  it('没有登录提示 cookie：不调任何接口，算未登录', async () => {
    const h = harness({ hint: false, local: { items: ['a'] } });
    await h.cloud.start();
    expect(h.calls).toEqual([]);
    expect(h.cloud.view.state).toBe('out');
  });

  it('平台说没登录：停在未登录，不拉存档', async () => {
    const h = harness({ who: null, local: { items: ['a'] } });
    await h.cloud.start();
    expect(h.calls.map((c) => c.url)).toEqual(['/api/me']);
    expect(h.cloud.view.state).toBe('out');
  });

  it('云端没有、本地有：带 baseRev 0 和确认过的账号传上去，记下 rev', async () => {
    const h = harness({ local: { items: ['a'] } });
    await h.cloud.start();
    await h.settle();
    const p = h.puts();
    expect(p).toHaveLength(1);
    expect(p[0]!.body).toMatchObject({ baseRev: 0, userId: 'u1', data: { items: ['a'] } });
    expect(h.meta()).toMatchObject({ userId: 'u1', rev: { profile: 1 }, dirty: [] });
    expect(h.cloud.view.state).toBe('synced');
    expect(h.cloud.userId).toBe('u1');
  });

  it('GET 存档带上刚确认的账号（平台据此回 wrong_user）', async () => {
    const h = harness({ local: { items: ['a'] } });
    await h.cloud.start();
    expect(h.calls[1]!.url).toBe('/api/saves/haidao?userId=u1');
  });

  it('本地没有、云端有：写进本地、通知画面，不回传', async () => {
    const h = harness({ cloud: { data: { items: ['c'] }, rev: 5 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    expect(h.local()).toEqual({ items: ['c'] });
    expect(h.applied()).toBe(1);
    expect(h.puts()).toHaveLength(0);
    expect(h.meta().rev.profile).toBe(5);
  });

  it('两边各有对方没有的：先备份本地再合并，合并结果传上去，状态是「合在一起了」', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['c'] }, rev: 3 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    expect(JSON.parse(h.store.getItem(preSyncKey('profile'))!)).toEqual({ items: ['a'] });
    expect(h.local()).toEqual({ items: ['a', 'c'] });
    expect(h.puts()[0]!.body).toMatchObject({ baseRev: 3, data: { items: ['a', 'c'] } });
    expect(h.cloud.view).toEqual({ state: 'merged', note: NOTE.merged });
  });

  it('云端的数据读不懂：本地有就覆盖上去', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { nope: 1 } as unknown as Doc, rev: 2 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    expect(h.puts()[0]!.body).toMatchObject({ baseRev: 2, data: { items: ['a'] } });
  });
});

describe('云存档：本地改了以后', () => {
  it('静下来 10 秒才传；一直在改最多等 60 秒', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    expect(h.puts()).toHaveLength(0);
    h.setLocal({ items: ['a', 'b'] });
    h.cloud.touch('profile');
    expect(h.cloud.view.state).toBe('pending');
    await h.tick(DEBOUNCE_MS - 1);
    expect(h.puts()).toHaveLength(0);
    await h.tick(1);
    expect(h.puts()).toHaveLength(1);
    // 每 5 秒改一次：60 秒到了照样传
    for (let i = 0; i < 12; i++) {
      h.cloud.touch('profile');
      await h.tick(5_000);
    }
    expect(h.puts()).toHaveLength(2);
  });

  it('传的途中又改了：传完仍算待上传', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    h.cloud.touch('profile');
    await h.tick(DEBOUNCE_MS - 1);
    // 先排一个慢的回话：在途时再 touch
    h.srv.put.push({ status: 200, body: { rev: 2 } });
    const p = h.tick(1);
    h.cloud.touch('profile');
    await p;
    await h.settle();
    expect(h.meta().dirty).toEqual(['profile']);
  });

  it('409 冲突：确认还是这个账号后，拿云端的合并、用它的 rev 重交', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    h.setLocal({ items: ['a', 'b'] });
    h.cloud.touch('profile');
    h.srv.put.push({ status: 409, body: { error: 'conflict', current: { rev: 7, data: { items: ['a', 'z'] } } } });
    await h.tick(DEBOUNCE_MS);
    await h.settle();
    const p = h.puts();
    expect(p).toHaveLength(2);
    expect(p[1]!.body).toMatchObject({ baseRev: 7, data: { items: ['a', 'b', 'z'] } });
    expect(h.local()).toEqual({ items: ['a', 'b', 'z'] });
    expect(h.meta().rev.profile).toBe(8);
  });

  it('409 wrong_user：这份数据不交，从头确认账号', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    const me0 = h.calls.filter((c) => c.url === '/api/me').length;
    h.cloud.touch('profile');
    h.srv.put.push({ status: 409, body: { error: 'wrong_user' } });
    await h.tick(DEBOUNCE_MS);
    await h.settle();
    expect(h.calls.filter((c) => c.url === '/api/me').length).toBeGreaterThan(me0);
  });

  it('429：按 retryAfter 等，之后的改动不能把它提前', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    h.cloud.touch('profile');
    h.srv.put.push({ status: 429, body: { retryAfter: 120 } });
    await h.tick(DEBOUNCE_MS);
    expect(h.puts()).toHaveLength(1);
    h.cloud.touch('profile');
    await h.tick(60_000);
    expect(h.puts()).toHaveLength(1);
    await h.tick(61_000);
    expect(h.puts()).toHaveLength(2);
  });

  it('413 或超过 48 KB：不再传，提示空间满了', async () => {
    const h = harness({ local: { items: ['x'.repeat(50 * 1024)] }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    expect(h.puts()).toHaveLength(0);
    expect(h.cloud.view).toEqual({ state: 'pending', note: NOTE.tooLarge });
  });

  it('一次打开最多传 SESSION_PUTS 次', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    for (let i = 0; i < SESSION_PUTS + 5; i++) {
      h.cloud.touch('profile');
      await h.tick(DEBOUNCE_MS);
    }
    expect(h.puts()).toHaveLength(SESSION_PUTS);
  });

  it('切到后台：用 keepalive 补传一次，3 分钟内再切不重复传', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    h.cloud.touch('profile');
    h.cloud.hidden();
    await h.settle();
    expect(h.puts().map((c) => c.keepalive)).toEqual([true]);
    h.cloud.touch('profile');
    await h.tick(1_000);
    h.cloud.hidden();
    await h.settle();
    expect(h.puts()).toHaveLength(1);
    await h.tick(HIDDEN_GAP_MS);
    // 3 分钟里普通的定时上传已经传过了，没东西可补
    expect(h.puts().filter((c) => c.keepalive)).toHaveLength(1);
  });
});

describe('云存档：换账号和出错', () => {
  it('换了账号：旧账号的本地进度存到 pre-switch、本地清空、不带给新账号', async () => {
    const h = harness({ who: 'u2', local: { items: ['old'] }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    expect(JSON.parse(h.store.getItem(preSwitchKey('profile', 'u1'))!)).toEqual({ items: ['old'] });
    expect(h.local()).toEqual({ items: [] });
    expect(h.meta().userId).toBe('u2');
    expect(h.puts().some((c) => JSON.stringify(c.body).includes('old'))).toBe(false);
  });

  it('旧账号在这台设备上登录回来：存着的那份并回去，并完改名为 .restored', async () => {
    const h = harness({ who: 'u1', local: { items: ['new'] }, userId: 'u2' });
    h.store.setItem(preSwitchKey('profile', 'u1'), JSON.stringify({ items: ['mine'] }));
    await h.cloud.start();
    await h.settle();
    expect(h.local()).toEqual({ items: ['mine'] });
    expect(h.store.getItem(preSwitchKey('profile', 'u1'))).toBeNull();
    expect(h.store.getItem(`${preSwitchKey('profile', 'u1')}.restored`)).not.toBeNull();
    // u2 的那份也存好了
    expect(JSON.parse(h.store.getItem(preSwitchKey('profile', 'u2'))!)).toEqual({ items: ['new'] });
  });

  it('平台忙（503 busy）：暂停，提示明早恢复', async () => {
    const h = harness({ local: { items: ['a'] } });
    h.srv.me.push({ status: 503, body: { error: 'busy' } });
    await h.cloud.start();
    expect(h.cloud.view).toEqual({ state: 'pending', note: NOTE.paused });
  });

  it('/api/me 回 saves: paused：暂停，不拉存档', async () => {
    const h = harness({ local: { items: ['a'] } });
    h.srv.me.push({ status: 200, body: { user: { id: 'u1' }, saves: 'paused' } });
    await h.cloud.start();
    expect(h.calls.map((c) => c.url)).toEqual(['/api/me']);
    expect(h.cloud.view.note).toBe(NOTE.paused);
  });

  it('连不上：算待上传（不叫人去登录），1 分钟后回到前台再试', async () => {
    const h = harness({ local: { items: ['a'] } });
    h.srv.me.push('down');
    await h.cloud.start();
    expect(h.cloud.view).toEqual({ state: 'pending', note: NOTE.offline });
    h.cloud.visible();
    await h.settle();
    expect(h.calls).toHaveLength(1);
    await h.tick(60_000);
    h.cloud.visible();
    await h.settle();
    expect(h.cloud.view.state).toBe('synced');
  });

  it('401：停在未登录', async () => {
    const h = harness({ local: { items: ['a'] } });
    h.srv.me.push({ status: 401, body: null });
    await h.cloud.start();
    expect(h.cloud.view.state).toBe('out');
  });

  it('备份写不进去（存储满了）：不动本地、不记 rev，暂停并提示', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['c'] }, rev: 3 }, userId: 'u1' });
    h.store.full.add(preSyncKey('profile'));
    await h.cloud.start();
    await h.settle();
    expect(h.local()).toEqual({ items: ['a'] });
    expect(h.meta().rev.profile ?? 0).toBe(0);
    expect(h.puts()).toHaveLength(0);
    expect(h.cloud.view.note).toBe(NOTE.storage);
  });

  it('别的标签页换了账号（storage 事件）：从头确认，不把本页的元数据写回旧账号', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    h.srv.who = 'u2';
    h.store.setItem(META_KEY, JSON.stringify({ v: 1, userId: 'u2', rev: {}, dirty: [] }));
    await h.tick(10_000);
    h.cloud.absorb();
    await h.settle();
    expect(h.meta().userId).toBe('u2');
    expect(h.cloud.userId).toBe('u2');
  });

  it('别的标签页传完了（rev 更新、不在待上传里）：本页不再重复传', async () => {
    const h = harness({ local: { items: ['a'] }, cloud: { data: { items: ['a'] }, rev: 1 }, userId: 'u1' });
    await h.cloud.start();
    await h.settle();
    h.cloud.touch('profile');
    h.store.setItem(META_KEY, JSON.stringify({ v: 1, userId: 'u1', rev: { profile: 9 }, dirty: [] }));
    h.cloud.absorb();
    await h.tick(DEBOUNCE_MS);
    expect(h.puts()).toHaveLength(0);
    expect(h.cloud.view.state).toBe('synced');
  });
});
