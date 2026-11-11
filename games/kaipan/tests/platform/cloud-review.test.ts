import { beforeEach, describe, expect, it } from 'vitest';
import { resetKeepalive } from '../../src/platform/keepalive.ts';
import { DEBOUNCE_MS, NOTE, RECHECK_MS, loadMeta, preSwitchKey } from '../../src/platform/cloud.ts';
import type { Profile } from '../../src/platform/profile.ts';
import { MemoryStore, json, platform, settle, setup, profileWith, putProfile, readProfile, S, } from './cloud-helpers.ts';

// 没回来的 keepalive 会一直占着记账（keepalive.ts），每个测试从零开始
beforeEach(() => resetKeepalive());

describe('独立审阅（旧仓库 PR 31）：旧标签页、备份失败、重试', () => {
  /** u1（alice）同步过的设备 */
  async function synced(runs = 5) {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => {
      p.runs = runs;
      p.seen.stocks = [S[0]!];
    }));
    await setup({ plat, store }).cloud.start();
    return { plat, store };
  }

  it('没启动的旧标签页（已退出）在别的页换成 u2 之后改了档案：不把磁盘元数据改回 u1，也不覆盖 u1 的备份', async () => {
    const { plat, store } = await synced();
    // 标签页 A：打开时已退出（没有提示 cookie），内存里的元数据是 u1
    const a = setup({ plat, store, hint: false });
    await a.cloud.start();
    expect(a.cloud.view.state).toBe('out');
    // 标签页 B：u2 登录
    plat.user = { id: 'u2' };
    plat.slots = new Map([['profile', { rev: 3, data: profileWith((p) => (p.wins = 2)) }]]);
    await setup({ plat, store }).cloud.start();
    const backup = store.getItem(preSwitchKey('profile', 'u1'));
    expect(JSON.parse(backup!)).toMatchObject({ runs: 5 });
    // A 里打完一局
    putProfile(store, { ...readProfile(store), runs: 1 });
    a.cloud.touch('profile');
    expect(loadMeta(store).userId).toBe('u2');
    // 下次以 u2 打开：不再走换账号，u1 的备份原样
    await setup({ plat, store }).cloud.start();
    expect(store.getItem(preSwitchKey('profile', 'u1'))).toBe(backup);
    // u1 回来：拿回的是 u1 自己的进度，没有 u2 的
    plat.user = { id: 'u1' };
    await setup({ plat, store }).cloud.start();
    const u1 = plat.of('u1').get('profile')!.data as Profile;
    expect(u1.runs).toBe(5);
    expect(u1.wins).toBe(0);
  });

  it('已启动的旧标签页（u1）在别的页换成 u2 之后改了档案：不改回磁盘元数据，不把本地传给任何人', async () => {
    const { plat, store } = await synced();
    const a = setup({ plat, store });
    await a.cloud.start();
    plat.user = { id: 'u2' };
    await setup({ plat, store }).cloud.start();
    const backup = store.getItem(preSwitchKey('profile', 'u1'));
    const u1Before = JSON.stringify(plat.of('u1').get('profile'));
    putProfile(store, { ...readProfile(store), runs: 2 });
    a.cloud.touch('profile');
    expect(loadMeta(store).userId).toBe('u2');
    await a.clk.advance(DEBOUNCE_MS);
    a.cloud.hidden();
    await settle();
    expect(JSON.stringify(plat.of('u1').get('profile'))).toBe(u1Before);
    expect(store.getItem(preSwitchKey('profile', 'u1'))).toBe(backup);
    expect(loadMeta(store).userId).toBe('u2');
  });

  it('换账号的备份已有一份时合并进去，不覆盖', async () => {
    const { plat, store } = await synced();
    store.setItem(preSwitchKey('profile', 'u1'), JSON.stringify(profileWith((p) => (p.seen.stocks = [S[4]!]))));
    plat.user = { id: 'u2' };
    await setup({ plat, store }).cloud.start();
    expect((JSON.parse(store.getItem(preSwitchKey('profile', 'u1'))!) as Profile).seen.stocks).toEqual([S[0], S[4]]);
  });

  it('换账号时备份存不上（存储满了）：本地不清、元数据不改，云朵说明原因', async () => {
    const { plat, store } = await synced();
    const full = new (class extends MemoryStore {
      override setItem(k: string, v: string): void {
        if (k.includes('.pre-switch.')) throw new Error('QuotaExceededError');
        super.setItem(k, v);
      }
    })();
    full.data = new Map(store.data);
    plat.user = { id: 'u2' };
    const { cloud } = setup({ plat, store: full });
    await cloud.start();
    expect(readProfile(full).runs).toBe(5);
    expect(loadMeta(full).userId).toBe('u1');
    expect(cloud.view).toEqual({ state: 'pending', note: NOTE.storage });
    expect(plat.puts().filter((c) => c.body?.userId === 'u2')).toHaveLength(0);
  });

  it('合并前的备份存不上：本地不动，rev 不记成云端的（不会拿没合进去的本地覆盖云端）', async () => {
    const plat = platform();
    plat.slots.set('profile', { rev: 6, data: profileWith((p) => (p.wins = 9)) });
    const full = new (class extends MemoryStore {
      override setItem(k: string, v: string): void {
        if (k.endsWith('.pre-sync')) throw new Error('QuotaExceededError');
        super.setItem(k, v);
      }
    })();
    putProfile(full, profileWith((p) => (p.runs = 3)));
    const { cloud } = setup({ plat, store: full });
    await cloud.start();
    expect(readProfile(full)).toMatchObject({ runs: 3, wins: 0 });
    expect(loadMeta(full).rev.profile ?? 0).not.toBe(6);
    expect(plat.puts()).toHaveLength(0);
    expect(cloud.view.note).toBe(NOTE.storage);
  });

  it('429 之后切到后台也不抢跑 keepalive', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    s.plat.hooks.push(() => json({ error: 'too_soon', retryAfter: 30 }, 429));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    const n = s.plat.puts().length;
    s.cloud.hidden();
    await settle();
    expect(s.plat.puts()).toHaveLength(n);
  });

  it('不是 busy 的 503（网关、不是 JSON）按连不上，不当停服', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    s.plat.hooks.push(() => new Response('<html>bad gateway</html>', { status: 503 }));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    expect(s.cloud.view).toEqual({ state: 'pending', note: NOTE.offline });
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    expect(s.cloud.view.state).toBe('synced');
  });

  it('打开时连不上：回到前台隔 1 分钟以上再从头试；未登录的页登录后同理', async () => {
    const plat = platform();
    plat.offline = true;
    const s = setup({ plat });
    putProfile(s.store, profileWith((p) => (p.runs = 4)));
    await s.cloud.start();
    expect(s.cloud.view.state).toBe('pending');
    plat.offline = false;
    s.cloud.visible();
    await settle();
    expect(plat.puts()).toHaveLength(0);
    await s.clk.advance(RECHECK_MS);
    s.cloud.visible();
    await settle();
    expect(plat.slots.get('profile')?.data).toMatchObject({ runs: 4 });
    expect(s.cloud.view.state).toBe('synced');

    const plat2 = platform();
    plat2.user = null;
    const t = setup({ plat: plat2 });
    await t.cloud.start();
    expect(t.cloud.view.state).toBe('out');
    plat2.user = { id: 'u9' };
    await t.clk.advance(RECHECK_MS);
    t.cloud.visible();
    await settle();
    expect(t.cloud.view.state).toBe('synced');
  });

  it('wrong_user 回包里就算带了 current 也不合并、不重交', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 3)));
    await s.cloud.start();
    const n = s.plat.puts().length;
    s.plat.hooks.push(() => json({ error: 'wrong_user', current: { rev: 9, updatedAt: 1, data: profileWith((p) => (p.runs = 77)) } }, 409));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    await settle();
    const after = s.plat.puts().slice(n);
    expect(after).toHaveLength(1);
    expect(readProfile(s.store).runs).not.toBe(77);
  });
});
