import { beforeEach, describe, expect, it } from 'vitest';
import { resetKeepalive } from '../../src/platform/keepalive.ts';
import { DEBOUNCE_MS, MAX_WAIT_MS, NOTE, SESSION_PUTS, loadMeta, preSyncKey } from '../../src/platform/cloud.ts';
import type { Profile } from '../../src/platform/profile.ts';
import { TUTORIAL_KEY } from '../../src/view/tutorial.ts';
import { MemoryStore, json, platform, settle, setup, profileWith, putProfile, readProfile, S, A } from './cloud-helpers.ts';

// 没回来的 keepalive 会一直占着记账（keepalive.ts），每个测试从零开始
beforeEach(() => resetKeepalive());

describe('启动：先问登录，再取存档', () => {
  it('没有提示 cookie：一个请求都不发，云朵是未登录', async () => {
    const { cloud, plat } = setup({ hint: false });
    await cloud.start();
    expect(plat.calls).toHaveLength(0);
    expect(cloud.view.state).toBe('out');
  });

  it('先调 /api/me（存档接口不续 last_seen），再 GET 存档', async () => {
    const { cloud, plat } = setup();
    await cloud.start();
    expect(plat.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/me', 'GET /api/saves/kaipan?userId=u1']);
    expect(plat.calls[0]!.init.credentials).toBe('same-origin');
    expect(cloud.view.state).toBe('synced');
  });

  it('cookie 还在但会话失效（user 为 null）：未登录，不取存档', async () => {
    const plat = platform();
    plat.user = null;
    const { cloud } = setup({ plat });
    await cloud.start();
    expect(plat.calls).toHaveLength(1);
    expect(cloud.view.state).toBe('out');
  });

  it('/api/me 说 saves: paused：暂停同步，不取存档，本地照常', async () => {
    const plat = platform();
    plat.saves = 'paused';
    const { cloud, store } = setup({ plat });
    putProfile(store, profileWith((p) => (p.runs = 3)));
    await cloud.start();
    expect(plat.calls).toHaveLength(1);
    expect(cloud.view).toEqual({ state: 'pending', note: NOTE.paused });
    cloud.touch('profile');
    expect(plat.puts()).toHaveLength(0);
  });

  it('连不上：待上传、说明连不上；下次打开再传', async () => {
    const plat = platform();
    plat.offline = true;
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 2)));
    const first = setup({ plat, store });
    await first.cloud.start();
    expect(first.cloud.view).toEqual({ state: 'pending', note: NOTE.offline });
    plat.offline = false;
    const second = setup({ plat, store });
    await second.cloud.start();
    expect(plat.slots.get('profile')?.data).toMatchObject({ runs: 2 });
    expect(second.cloud.view.state).toBe('synced');
  });
});

describe('第一次同步和合并', () => {
  it('云端是空的：把本地的进度传上去（baseRev 0），记下 userId 和 rev', async () => {
    const { cloud, plat, store } = setup();
    putProfile(store, profileWith((p) => {
      p.runs = 5;
      p.seen.stocks = [S[0]!];
      p.last = 'seed|99';
    }));
    store.setItem(TUTORIAL_KEY, JSON.stringify({ v: 1, off: false, done: ['goal', 'chat'] }));
    await cloud.start();
    const puts = plat.puts();
    expect(puts.map((c) => c.url).sort()).toEqual(['/api/saves/kaipan/profile', '/api/saves/kaipan/tutorial']);
    expect(puts.every((c) => c.body?.baseRev === 0)).toBe(true);
    // 写请求带 X-Arcade、是 JSON
    const h = puts[0]!.init.headers as Record<string, string>;
    expect(h['X-Arcade']).toBe('1');
    expect(h['Content-Type']).toBe('application/json');
    // last 只在本机有意义，不上传
    expect((plat.slots.get('profile')!.data as Profile).last).toBe('');
    expect(loadMeta(store)).toEqual({ v: 1, userId: 'u1', rev: { profile: 1, tutorial: 1 }, dirty: [] });
    expect(cloud.view.state).toBe('synced');
  });

  it('本地什么都没有、云端有：直接用云端的，不上传，通知画面重画', async () => {
    const plat = platform();
    plat.slots.set('profile', { rev: 4, data: profileWith((p) => (p.wins = 2)) });
    const { cloud, store, applied } = setup({ plat });
    await cloud.start();
    expect(readProfile(store).wins).toBe(2);
    expect(plat.puts()).toHaveLength(0);
    expect(applied()).toBe(1);
    expect(loadMeta(store).rev.profile).toBe(4);
  });

  it('两边各有对方没有的：并集 / 取大，合并前备份本地，用云端的 rev 交上去，云朵是"已合并"', async () => {
    const plat = platform();
    const cloudP = profileWith((p) => {
      p.runs = 10;
      p.seen.stocks = [S[1]!];
      p.achievements[A[0]!] = 7;
    });
    plat.slots.set('profile', { rev: 3, data: cloudP });
    const { cloud, store } = setup({ plat });
    const localP = profileWith((p) => {
      p.runs = 4;
      p.wins = 3;
      p.seen.stocks = [S[0]!];
      p.achievements[A[0]!] = 2;
    });
    putProfile(store, localP);
    await cloud.start();
    const merged = readProfile(store);
    expect(merged.runs).toBe(10);
    expect(merged.wins).toBe(3);
    expect(merged.seen.stocks).toEqual([S[0], S[1]]);
    expect(merged.achievements[A[0]!]).toBe(2);
    expect(JSON.parse(store.getItem(preSyncKey('profile'))!)).toEqual(JSON.parse(JSON.stringify(localP)));
    const put = plat.puts()[0]!;
    expect(put.body?.baseRev).toBe(3);
    expect(plat.slots.get('profile')!.rev).toBe(4);
    expect(cloud.view.state).toBe('merged');
  });

  it('两边一样：不上传；再打开一次也不上传（不会每次打开都写一遍）', async () => {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 1)));
    await setup({ plat, store }).cloud.start();
    expect(plat.puts()).toHaveLength(1);
    await setup({ plat, store }).cloud.start();
    await setup({ plat, store }).cloud.start();
    expect(plat.puts()).toHaveLength(1);
  });

  it('云端的数据读不懂（不是档案）：用本地的覆盖', async () => {
    const plat = platform();
    plat.slots.set('profile', { rev: 2, data: { hello: 'x' } });
    const { cloud, store } = setup({ plat });
    putProfile(store, profileWith((p) => (p.runs = 1)));
    await cloud.start();
    expect(plat.puts()[0]!.body?.baseRev).toBe(2);
    expect(plat.slots.get('profile')!.data).toMatchObject({ runs: 1 });
  });
});

describe('改了之后上传', () => {
  async function started() {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    s.plat.calls.length = 0;
    return s;
  }

  it('静下来 10 秒才传；10 秒内再改就重新等', async () => {
    const { cloud, plat, clk, store } = await started();
    putProfile(store, profileWith((p) => (p.runs = 2)));
    cloud.touch('profile');
    expect(cloud.view.state).toBe('pending');
    await clk.advance(DEBOUNCE_MS - 1);
    expect(plat.puts()).toHaveLength(0);
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS - 1);
    expect(plat.puts()).toHaveLength(0);
    await clk.advance(1);
    expect(plat.puts()).toHaveLength(1);
    expect(plat.slots.get('profile')!.data).toMatchObject({ runs: 2 });
    expect(cloud.view.state).toBe('synced');
  });

  it('一直在改也最多等 60 秒', async () => {
    const { cloud, plat, clk } = await started();
    for (let t = 0; t < MAX_WAIT_MS; t += 5_000) {
      cloud.touch('profile');
      await clk.advance(5_000);
    }
    expect(plat.puts()).toHaveLength(1);
  });

  it('上传途中又改了：传完仍是待上传', async () => {
    const { cloud, plat, clk } = await started();
    cloud.touch('profile');
    plat.hooks.push(() => {
      cloud.touch('profile');
      return null;
    });
    await clk.advance(DEBOUNCE_MS);
    expect(cloud.view.state).toBe('pending');
  });

  it('冲突（别的设备先写了）：合并云端的，拿它的 rev 重交，两边的东西都在', async () => {
    const { cloud, plat, clk, store } = await started();
    // 另一台设备写了一版：多见过一只股票
    plat.slots.set('profile', { rev: 2, data: profileWith((p) => {
      p.runs = 1;
      p.seen.stocks = [S[2]!];
    }) });
    putProfile(store, profileWith((p) => {
      p.runs = 3;
      p.seen.stocks = [S[0]!];
    }));
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    const puts = plat.puts();
    expect(puts.map((c) => c.body?.baseRev)).toEqual([1, 2]);
    const final = plat.slots.get('profile')!.data as Profile;
    expect(final.runs).toBe(3);
    expect(final.seen.stocks).toEqual([S[0], S[2]]);
    expect(store.getItem(preSyncKey('profile'))).not.toBeNull();
    // 两边各有对方没有的：传完显示"已合并"，下次本地再改就回到平常
    expect(cloud.view.state).toBe('merged');
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    expect(cloud.view.state).toBe('synced');
  });

  it('冲突但云端没有这个槽（被清理过）：改用 baseRev 0 重交', async () => {
    const { cloud, plat, clk } = await started();
    plat.slots.delete('profile');
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    expect(plat.puts().map((c) => c.body?.baseRev)).toEqual([1, 0]);
    expect(plat.slots.get('profile')!.rev).toBe(1);
  });

  it('429 too_soon：按 retryAfter 再传', async () => {
    const { cloud, plat, clk } = await started();
    plat.hooks.push(() => json({ error: 'too_soon', message: '慢点', retryAfter: 7 }, 429));
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    expect(plat.puts()).toHaveLength(1);
    expect(clk.pending()).toEqual([7_000]);
    await clk.advance(7_000);
    expect(plat.puts()).toHaveLength(2);
    expect(cloud.view.state).toBe('synced');
  });

  it('413：不再重试，说明太大', async () => {
    const { cloud, plat, clk } = await started();
    plat.hooks.push(() => json({ error: 'too_large', message: '太大' }, 413));
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS * 10);
    expect(plat.puts()).toHaveLength(1);
    expect(cloud.view).toEqual({ state: 'pending', note: NOTE.tooLarge });
  });

  it('503 busy：暂停同步，这次打开里不再传', async () => {
    const { cloud, plat, clk } = await started();
    plat.hooks.push(() => json({ error: 'busy', message: '忙' }, 503));
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS * 10);
    expect(plat.puts()).toHaveLength(1);
    expect(cloud.view).toEqual({ state: 'pending', note: NOTE.paused });
  });

  it('401：当作已退出', async () => {
    const { cloud, plat, clk } = await started();
    plat.hooks.push(() => json({ error: 'unauthorized', message: '' }, 401));
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    expect(cloud.view.state).toBe('out');
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    expect(plat.puts()).toHaveLength(1);
  });

  it('连不上：留着待上传，下次改了再试', async () => {
    const { cloud, plat, clk } = await started();
    plat.offline = true;
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    expect(cloud.view).toEqual({ state: 'pending', note: NOTE.offline });
    plat.offline = false;
    cloud.touch('profile');
    await clk.advance(DEBOUNCE_MS);
    expect(cloud.view.state).toBe('synced');
  });

  it('切到后台：用 keepalive 只补传一个槽，档案排前面', async () => {
    const { cloud, plat, store } = await started();
    store.setItem(TUTORIAL_KEY, JSON.stringify({ v: 1, off: false, done: ['goal'] }));
    cloud.touch('tutorial');
    cloud.touch('profile');
    cloud.hidden();
    await settle();
    const puts = plat.puts();
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url).toBe('/api/saves/kaipan/profile');
    expect(puts[0]!.init.keepalive).toBe(true);
  });

  it('一次打开里 PUT 有上限（平台每天 100 次）', async () => {
    const { cloud, plat, clk } = await started();
    for (let i = 0; i < SESSION_PUTS + 10; i++) {
      cloud.touch('profile');
      await clk.advance(DEBOUNCE_MS);
    }
    expect(plat.puts().length).toBeLessThanOrEqual(SESSION_PUTS);
  });
});
