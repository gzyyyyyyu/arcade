import { beforeEach, describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, HIDDEN_GAP_MS, META_KEY, RECHECK_MS, loadMeta, preSwitchKey, preSyncKey } from '../../src/platform/cloud.ts';
import type { Profile } from '../../src/platform/profile.ts';
import { KEEPALIVE_BYTES, keepaliveLeft, keepaliveSend, resetKeepalive } from '../../src/platform/keepalive.ts';
import { TUTORIAL_KEY } from '../../src/view/tutorial.ts';
import { MemoryStore, json, type Call, platform, settle, setup, profileWith, putProfile, readProfile, S } from './cloud-helpers.ts';

// 没回来的 keepalive 会一直占着记账（keepalive.ts），每个测试从零开始
beforeEach(() => resetKeepalive());

describe('换账号和多标签页的坑（掼蛋审出来的，旧仓库 PR 28）', () => {
  /** u1 同步过、又有没传上去的改动的一台设备 */
  async function deviceOfU1() {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 1)));
    await setup({ plat, store }).cloud.start();
    putProfile(store, profileWith((p) => {
      p.runs = 9;
      p.seen.stocks = [S[3]!];
    }));
    store.setItem(META_KEY, JSON.stringify({ ...loadMeta(store), dirty: ['profile'] }));
    plat.calls.length = 0;
    return { plat, store };
  }

  for (const [why, hook] of [
    ['取存档时连不上', (c: Call) => (c.url.startsWith('/api/saves/kaipan?') ? (() => { throw new TypeError('fetch failed'); })() : null)],
    ['取存档时 401', (c: Call) => (c.url.startsWith('/api/saves/kaipan?') ? json({ error: 'unauthorized' }, 401) : null)],
    ['取存档时 429', (c: Call) => (c.url.startsWith('/api/saves/kaipan?') ? json({ error: 'rate_limited', retryAfter: 5 }, 429) : null)],
  ] as const) {
    it(`换账号到一半断了（${why}）：下次打开不会把旧账号的东西当成首次同步传给新账号`, async () => {
      const { plat, store } = await deviceOfU1();
      plat.user = { id: 'u2' };
      plat.hooks.push(() => null, hook as (c: Call) => Response | null);
      const first = setup({ plat, store });
      await first.cloud.start().catch(() => undefined);
      expect(first.cloud.view.state).not.toBe('synced');
      // 一认出换了账号就落盘：元数据已是 u2、本地是空档、u1 的那份存起来了
      expect(loadMeta(store).userId).toBe('u2');
      expect(readProfile(store).runs).toBe(0);
      expect(JSON.parse(store.getItem(preSwitchKey('profile', 'u1'))!)).toMatchObject({ runs: 9 });
      await setup({ plat, store }).cloud.start();
      const u2 = plat.of('u2').get('profile');
      expect(u2 === undefined || (u2.data as Profile).runs === 0).toBe(true);
      expect(plat.puts().every((c) => (c.body?.data as Profile | undefined)?.runs !== 9)).toBe(true);
    });
  }

  it('合并前的备份和换账号的备份分开存，不互相覆盖', async () => {
    const { plat, store } = await deviceOfU1();
    plat.user = { id: 'u2' };
    plat.slots = new Map([['profile', { rev: 2, data: profileWith((p) => (p.wins = 5)) }]]);
    // 新账号在这台设备上以前存过一份（会并回来，和云端合并 → 写 pre-sync）
    store.setItem(preSwitchKey('profile', 'u2'), JSON.stringify(profileWith((p) => (p.runs = 4))));
    await setup({ plat, store }).cloud.start();
    expect(JSON.parse(store.getItem(preSwitchKey('profile', 'u1'))!)).toMatchObject({ runs: 9 });
    expect(JSON.parse(store.getItem(preSyncKey('profile'))!)).toMatchObject({ runs: 4 });
    expect(plat.slots.get('profile')!.data).toMatchObject({ runs: 4, wins: 5 });
  });

  it('页面开着时别的标签页换了账号：过了 1 分钟上传前先确认，不拿 u1 的数据传给 u2', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 3)));
    await s.cloud.start();
    s.plat.user = { id: 'u2' };
    s.plat.slots = new Map([['profile', { rev: 1, data: profileWith((p) => (p.wins = 7)) }]]);
    putProfile(s.store, profileWith((p) => (p.runs = 8)));
    await s.clk.advance(RECHECK_MS);
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    await settle();
    // u2 的云端没被 u1 的进度覆盖（rev 碰巧一样也不行）
    expect(s.plat.of('u2').get('profile')!.data).toMatchObject({ runs: 0, wins: 7 });
    expect(loadMeta(s.store).userId).toBe('u2');
    expect(JSON.parse(s.store.getItem(preSwitchKey('profile', 'u1'))!)).toMatchObject({ runs: 8 });
  });

  it('换账号后收到 409（current 为 null）：先确认账号，不用 baseRev 0 把 u1 的整份写进 u2', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 3)));
    await s.cloud.start();
    s.plat.user = { id: 'u2' };
    const before = s.plat.puts().length;
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    await settle();
    const u2 = s.plat.of('u2').get('profile');
    expect(u2 === undefined || (u2.data as Profile).runs !== 3).toBe(true);
    // 换账号之后只发过那一次撞上 409 的 PUT，没有用 0 重交
    expect(s.plat.puts().slice(before).map((c) => c.body?.baseRev)).toEqual([1]);
  });

  it('切回前台隔 1 分钟以上才重新问 /api/me', async () => {
    const s = setup();
    await s.cloud.start();
    const me = (): number => s.plat.calls.filter((c) => c.url === '/api/me').length;
    s.cloud.visible();
    await settle();
    expect(me()).toBe(1);
    await s.clk.advance(RECHECK_MS);
    s.cloud.visible();
    await settle();
    expect(me()).toBe(2);
  });

  it('连不上或停服时不显示"未登录"；只有平台明确说没登录才是', async () => {
    for (const reply of [() => { throw new TypeError('fetch failed'); }, () => json({ error: 'busy' }, 503), () => json({ hello: 1 })]) {
      const plat = platform();
      plat.hooks.push(reply);
      const { cloud } = setup({ plat });
      await cloud.start();
      expect(cloud.view.state).toBe('pending');
      expect(cloud.view.note).not.toBeNull();
    }
  });

  it('429 的 retryAfter 不会被之后的改动提前', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    s.plat.hooks.push(() => json({ error: 'too_soon', retryAfter: 30 }, 429));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    expect(s.plat.puts()).toHaveLength(2);
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    expect(s.plat.puts()).toHaveLength(2);
    await s.clk.advance(30_000 - DEBOUNCE_MS);
    expect(s.plat.puts()).toHaveLength(3);
  });

  it('切到后台补传两次之间至少隔 3 分钟', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    const kept = (): number => s.plat.puts().filter((c) => c.init.keepalive === true).length;
    s.cloud.touch('profile');
    s.cloud.hidden();
    await settle();
    s.cloud.touch('profile');
    s.cloud.hidden();
    await settle();
    expect(kept()).toBe(1);
    await s.clk.advance(HIDDEN_GAP_MS);
    s.cloud.touch('profile');
    s.cloud.hidden();
    await settle();
    expect(kept()).toBe(2);
  });

  it('点了「大厅」要离开（0.5.8）：刚补传过也再补传一次；紧接着离开页面的 visibilitychange 不重复传', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    const kept = (): number => s.plat.puts().filter((c) => c.init.keepalive === true).length;
    s.cloud.touch('profile');
    s.cloud.hidden();
    await settle();
    s.cloud.touch('profile');
    s.cloud.hidden(true);
    await settle();
    expect(kept()).toBe(2);
    expect(s.cloud.view.state).toBe('synced');
    s.cloud.touch('profile');
    s.cloud.hidden();
    await settle();
    expect(kept()).toBe(2);
  });

  it('离开时档案和教程都待上传：两个都补传（keepalive，档案在前）', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    putProfile(s.store, profileWith((p) => (p.runs = 2)));
    s.store.setItem(TUTORIAL_KEY, JSON.stringify({ v: 1, off: false, done: ['goal'] }));
    s.cloud.touch('profile');
    s.cloud.touch('tutorial');
    s.plat.calls.length = 0;
    s.cloud.hidden(true);
    await settle();
    expect(s.plat.puts().map((c) => [c.url, c.init.keepalive])).toEqual([
      ['/api/saves/kaipan/profile', true],
      ['/api/saves/kaipan/tutorial', true],
    ]);
    expect(s.cloud.view.state).toBe('synced');
  });

  it('离开时档案正有普通请求在途（页面一走会被取消）：再补一个 keepalive；已经是 keepalive 在途的不重复', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    let release: (() => void) | null = null;
    s.plat.hooks.push((c) => (c.method === 'PUT' ? (new Promise<Response>((r) => (release = () => r(json({ rev: 2, updatedAt: 2 })))) as unknown as Response) : null));
    putProfile(s.store, profileWith((p) => (p.runs = 2)));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    expect(s.plat.puts().map((c) => c.init.keepalive)).toEqual([false, false]);
    s.cloud.hidden(true);
    await settle();
    const puts = s.plat.puts().slice(1);
    expect(puts.map((c) => c.init.keepalive)).toEqual([false, true]);
    expect(puts[1]!.body).toEqual(puts[0]!.body);
    // 先发的回来了：照常记下 rev，不再待上传
    release!();
    await settle();
    expect(s.cloud.view.state).toBe('synced');
    // keepalive 在途时再离开：不再补
    s.plat.hooks.push((c) => (c.method === 'PUT' ? (new Promise<Response>(() => undefined) as unknown as Response) : null));
    putProfile(s.store, profileWith((p) => (p.runs = 3)));
    s.cloud.touch('profile');
    s.cloud.hidden(true);
    await settle();
    const n = s.plat.puts().length;
    s.cloud.hidden(true);
    await settle();
    expect(s.plat.puts().length).toBe(n);
  });

  it('补过 keepalive 的槽（0.5.11）：再点一次「大厅」不再补；补的那份回来了、页面还在，再离开才再补', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    const pending: (() => void)[] = [];
    const hang = (c: { method: string }): Response | null => (c.method === 'PUT' ? (new Promise<Response>((r) => pending.push(() => r(json({ error: 'conflict' }, 409))))) as unknown as Response : null);
    s.plat.hooks.push(hang, hang);
    putProfile(s.store, profileWith((p) => (p.runs = 2)));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    s.cloud.hidden(true);
    await settle();
    s.cloud.hidden(true);
    await settle();
    const kept = (): number => s.plat.puts().filter((c) => c.init.keepalive === true).length;
    expect(kept()).toBe(1);
    // 补的那份回来了（普通的还在途）：这时再离开可以再补
    pending[1]!();
    await settle();
    s.cloud.hidden(true);
    await settle();
    expect(kept()).toBe(2);
  });

  it('离开时的额度扣掉已经在途的 keepalive（0.5.11，比如交分）：剩的不够就不补', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    putProfile(s.store, profileWith((p) => (p.runs = 2)));
    s.cloud.touch('profile');
    s.plat.calls.length = 0;
    let release: () => void = () => undefined;
    const other = keepaliveSend('x'.repeat(KEEPALIVE_BYTES - 100), () => new Promise<void>((r) => (release = r)));
    expect(keepaliveLeft()).toBe(100);
    s.cloud.hidden(true);
    await settle();
    expect(s.plat.puts()).toHaveLength(0);
    // 在途的回来了，额度还回去：再离开就补上（补的这份自己也记账，回来后还回去）
    release();
    await other;
    expect(keepaliveLeft()).toBe(KEEPALIVE_BYTES);
    s.cloud.hidden(true);
    await settle();
    expect(s.plat.puts().map((c) => c.init.keepalive)).toEqual([true]);
    expect(keepaliveLeft()).toBe(KEEPALIVE_BYTES);
  });

  it('离开时额度不够、没补成（0.5.12）：原来排好的普通上传不清掉；没排的给排一个', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    let release: () => void = () => undefined;
    const other = keepaliveSend('x'.repeat(KEEPALIVE_BYTES - 100), () => new Promise<void>((r) => (release = r)));
    // 已经排好了普通上传，过了一半时离开：补不成，原来那个照常到点就传（不是从头再等）
    putProfile(s.store, profileWith((p) => (p.runs = 2)));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS / 2);
    s.plat.calls.length = 0;
    s.cloud.hidden(true);
    await settle();
    expect(s.plat.puts()).toHaveLength(0);
    await s.clk.advance(DEBOUNCE_MS / 2);
    expect(s.plat.puts().map((c) => c.init.keepalive)).toEqual([false]);
    // 上一次普通上传连不上（不再排），这时离开又补不成：给排一个，页面没走成照样传上
    putProfile(s.store, profileWith((p) => (p.runs = 3)));
    s.cloud.touch('profile');
    s.plat.offline = true;
    await s.clk.advance(DEBOUNCE_MS);
    s.plat.offline = false;
    expect(s.clk.pending()).toHaveLength(0);
    s.plat.calls.length = 0;
    s.cloud.hidden(true);
    await settle();
    expect(s.plat.puts()).toHaveLength(0);
    expect(s.clk.pending()).toEqual([DEBOUNCE_MS]);
    await s.clk.advance(DEBOUNCE_MS);
    expect(s.plat.puts().map((c) => c.init.keepalive)).toEqual([false]);
    expect(s.cloud.view.state).toBe('synced');
    release();
    await other;
  });

  it('多标签页：别的页传完的槽，本页记下新 rev、不再显示待上传，也不重复上传', async () => {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 1)));
    const a = setup({ plat, store });
    const b = setup({ plat, store });
    await a.cloud.start();
    await b.cloud.start();
    putProfile(store, profileWith((p) => (p.runs = 2)));
    a.cloud.touch('profile');
    b.cloud.touch('profile');
    await a.clk.advance(DEBOUNCE_MS);
    expect(plat.puts()).toHaveLength(2);
    b.cloud.absorb();
    expect(b.cloud.view.state).toBe('synced');
    await b.clk.advance(DEBOUNCE_MS);
    expect(plat.puts()).toHaveLength(2);
  });

  it('多标签页：别的页认出换了账号，本页也跟着重来', async () => {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 1)));
    const a = setup({ plat, store });
    const b = setup({ plat, store });
    await a.cloud.start();
    await b.cloud.start();
    plat.user = { id: 'u2' };
    await setup({ plat, store }).cloud.start();
    a.cloud.absorb();
    await settle();
    const me = plat.calls.filter((c) => c.url === '/api/me').length;
    expect(me).toBeGreaterThanOrEqual(4);
    expect(loadMeta(store).userId).toBe('u2');
  });
});
