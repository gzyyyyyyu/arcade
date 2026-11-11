import { describe, expect, it } from 'vitest';
import { LADDER_KEY, type LadderData } from '../src/game/ladder.ts';
import { CLOUD_KEY, CloudSync, PRE_SYNC, preSwitch } from '../src/net/cloud.ts';

/** 假的平台：一个账号一个槽，按 docs/api.md 的 /api/me、/api/saves 回话 */
function fakePlatform(user: string | null, slot?: { rev: number; data: unknown }) {
  const p = { user, slot, puts: [] as { baseRev: number; data: LadderData; userId: string; keepalive: boolean }[], next: [] as Response[] };
  const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const f = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    if (u === '/api/me') return json(200, { user: p.user ? { id: p.user } : null, saves: 'ok' });
    if (u.startsWith('/api/saves/mahjong?')) {
      if (new URL(u, 'http://x').searchParams.get('userId') !== p.user) return json(409, { error: 'wrong_user' });
      return json(200, { saves: p.slot ? [{ slot: 'ladder', rev: p.slot.rev, updatedAt: 1, data: p.slot.data }] : [] });
    }
    if (u === '/api/saves/mahjong/ladder' && init?.method === 'PUT') {
      const b = JSON.parse(String(init.body)) as { baseRev: number; data: LadderData; userId: string };
      p.puts.push({ ...b, keepalive: init.keepalive === true });
      const forced = p.next.shift();
      if (forced) return forced;
      if (b.userId !== p.user) return json(409, { error: 'wrong_user' });
      if ((p.slot?.rev ?? 0) !== b.baseRev) return json(409, { error: 'conflict', current: p.slot ? { rev: p.slot.rev, updatedAt: 1, data: p.slot.data } : null });
      p.slot = { rev: b.baseRev + 1, data: b.data };
      return json(200, { rev: p.slot.rev, updatedAt: 2 });
    }
    return json(404, { error: 'not_found' });
  };
  return { p, f, json };
}

function memStore(init: Record<string, unknown> = {}): Storage {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

function setup(store: Storage, fp: ReturnType<typeof fakePlatform>, cookie = true) {
  let now = 1_000_000;
  const timers: { at: number; f: () => void }[] = [];
  const sync = new CloudSync({
    fetch: fp.f as typeof fetch,
    store,
    now: () => now,
    loggedIn: () => cookie,
    later: (f, ms) => {
      const t = { at: now + ms, f };
      timers.push(t);
      return t;
    },
    cancel: (t) => void timers.splice(timers.indexOf(t as (typeof timers)[number]), 1),
  });
  /** 时间往前走，到点的定时器跑掉（等它们的 fetch 回来） */
  const tick = async (ms: number): Promise<void> => {
    now += ms;
    for (const t of timers.filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.f();
    }
    for (let i = 0; i < 10; i++) await Promise.resolve().then(() => new Promise((r) => setTimeout(r, 0)));
  };
  return { sync, tick, setNow: (n: number) => (now = n) };
}

const ladder = (store: Storage): LadderData => JSON.parse(store.getItem(LADDER_KEY)!) as LadderData;
const KEY = [1, 2, 3, 4, 5, 6, 7, 8];

describe('云存档', () => {
  it('没有登录标记：不发请求，云朵是未登录', async () => {
    const fp = fakePlatform('u1');
    const { sync } = setup(memStore(), fp, false);
    await sync.start();
    expect(sync.state).toBe('out');
    expect(fp.p.puts).toEqual([]);
  });

  it('这台设备第一次登录：本机的并进账号，上传只带称号和最远，不带没打完的一轮', async () => {
    const store = memStore({ [LADDER_KEY]: { v: 1, titles: ['xz'], best: { xz: 3 }, run: { mode: 'rc', key: KEY, table: 1, retried: 0 } } });
    const fp = fakePlatform('u1', { rev: 4, data: { v: 1, titles: ['rc'], best: { rc: 3, xz: 1 } } });
    const { sync, tick } = setup(store, fp);
    await sync.start();
    // 合并：并集、较大；合并前的本机那份备份了；没打完的一轮还在本机
    expect(ladder(store)).toMatchObject({ titles: ['xz', 'rc'], best: { xz: 3, rc: 3 }, run: { mode: 'rc' } });
    expect(JSON.parse(store.getItem(PRE_SYNC)!).titles).toEqual(['xz']);
    expect(sync.state).toBe('pending');
    await tick(10_000);
    expect(fp.p.puts).toHaveLength(1);
    expect(fp.p.puts[0]).toMatchObject({ baseRev: 4, userId: 'u1', data: { v: 1, titles: ['xz', 'rc'], best: { xz: 3, rc: 3 } } });
    expect(fp.p.puts[0]!.data).not.toHaveProperty('run');
    expect(JSON.parse(store.getItem(CLOUD_KEY)!)).toMatchObject({ userId: 'u1', rev: 5, dirty: false });
    // 并进了云端的东西：传完云朵写"已合并"
    expect(sync.state).toBe('merged');
  });

  it('改了以后 10 秒防抖，同一个槽两次上传至少隔 5 分钟', async () => {
    const store = memStore();
    const fp = fakePlatform('u1');
    const { sync, tick } = setup(store, fp);
    await sync.start();
    store.setItem(LADDER_KEY, JSON.stringify({ v: 1, titles: [], best: { xz: 1 } }));
    sync.touched();
    await tick(10_000);
    expect(fp.p.puts).toHaveLength(1);
    store.setItem(LADDER_KEY, JSON.stringify({ v: 1, titles: [], best: { xz: 2 } }));
    sync.touched();
    await tick(10_000);
    expect(fp.p.puts).toHaveLength(1);
    await tick(5 * 60_000);
    expect(fp.p.puts).toHaveLength(2);
    expect(fp.p.puts[1]).toMatchObject({ baseRev: 1, data: { best: { xz: 2 } } });
  });

  it('409 conflict：合并云端当前的那份，用它的 rev 只重交一次', async () => {
    const store = memStore();
    const fp = fakePlatform('u1');
    const { sync, tick } = setup(store, fp);
    await sync.start();
    // 别的设备在这期间传了一份
    fp.p.slot = { rev: 7, data: { v: 1, titles: ['xl'], best: { xl: 3 } } };
    store.setItem(LADDER_KEY, JSON.stringify({ v: 1, titles: ['xz'], best: { xz: 3 } }));
    sync.touched();
    await tick(10_000);
    expect(fp.p.puts.map((p) => p.baseRev)).toEqual([0, 7]);
    expect(fp.p.slot!.data).toEqual({ v: 1, titles: ['xz', 'xl'], best: { xz: 3, xl: 3 } });
    expect(ladder(store).titles).toEqual(['xz', 'xl']);
    expect(sync.state).toBe('merged');
    // 第二次还冲突就不再重交，留着待传
    fp.p.next.push(fp.json(409, { error: 'conflict', current: { rev: 9, updatedAt: 1, data: {} } }), fp.json(409, { error: 'conflict', current: { rev: 10, updatedAt: 1, data: {} } }));
    store.setItem(LADDER_KEY, JSON.stringify({ v: 1, titles: ['xz', 'xl', 'rc'], best: { xz: 3, xl: 3, rc: 3 } }));
    sync.touched();
    await tick(5 * 60_000);
    expect(fp.p.puts).toHaveLength(4);
    expect(sync.state).toBe('pending');
    expect(JSON.parse(store.getItem(CLOUD_KEY)!).dirty).toBe(true);
  });

  it('换号：旧账号那份备份、本机清空、不传旧数据；登录回旧账号再并回来，传完改名 .restored', async () => {
    const store = memStore({ [LADDER_KEY]: { v: 1, titles: ['xz'], best: { xz: 3 } }, [CLOUD_KEY]: { userId: 'u1', rev: 2, dirty: false, at: 0 } });
    const fp = fakePlatform('u2');
    const a = setup(store, fp);
    await a.sync.start();
    expect(JSON.parse(store.getItem(preSwitch('u1'))!)).toEqual({ v: 1, titles: ['xz'], best: { xz: 3 } });
    expect(ladder(store)).toEqual({ v: 1, titles: [], best: {} });
    expect(JSON.parse(store.getItem(CLOUD_KEY)!)).toMatchObject({ userId: 'u2', rev: 0, dirty: false });
    await a.tick(60_000);
    expect(fp.p.puts).toEqual([]);
    // 登录回 u1：云端已有 rev 2 的一份（这里是空的称号），备份并回来再传
    const fp1 = fakePlatform('u1', { rev: 2, data: { v: 1, titles: [], best: { xz: 1 } } });
    const b = setup(store, fp1);
    await b.sync.start();
    expect(ladder(store)).toMatchObject({ titles: ['xz'], best: { xz: 3 } });
    await b.tick(10_000);
    expect(fp1.p.puts[0]).toMatchObject({ baseRev: 2, userId: 'u1', data: { titles: ['xz'] } });
    expect(store.getItem(preSwitch('u1'))).toBeNull();
    expect(store.getItem(`${preSwitch('u1')}.restored`)).not.toBeNull();
  });

  it('409 wrong_user：不合并、不重试，按换号处理后拉新账号的', async () => {
    const store = memStore({ [LADDER_KEY]: { v: 1, titles: ['rc'], best: { rc: 3 } } });
    const fp = fakePlatform('u1');
    const { sync, tick } = setup(store, fp);
    await sync.start();
    // 别的标签页换成了 u3：PUT 带的还是 u1
    fp.p.user = 'u3';
    await tick(10_000);
    expect(fp.p.puts).toHaveLength(1);
    expect(JSON.parse(store.getItem(preSwitch('u1'))!).titles).toEqual(['rc']);
    expect(ladder(store).titles).toEqual([]);
    expect(JSON.parse(store.getItem(CLOUD_KEY)!).userId).toBe('u3');
  });

  it('切后台补传走 keepalive，离上次上传不到 3 分钟就留到下次', async () => {
    const store = memStore();
    const fp = fakePlatform('u1');
    const { sync, tick } = setup(store, fp);
    await sync.start();
    store.setItem(LADDER_KEY, JSON.stringify({ v: 1, titles: [], best: { rc: 1 } }));
    sync.touched();
    sync.flush();
    await tick(0);
    expect(fp.p.puts).toEqual([expect.objectContaining({ keepalive: true, baseRev: 0 })]);
    store.setItem(LADDER_KEY, JSON.stringify({ v: 1, titles: [], best: { rc: 2 } }));
    sync.touched();
    sync.flush();
    await tick(0);
    expect(fp.p.puts).toHaveLength(1);
  });
});
