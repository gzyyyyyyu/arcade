import { beforeEach, describe, expect, it } from 'vitest';
import { resetKeepalive } from '../../src/platform/keepalive.ts';
import { DEBOUNCE_MS, FORCE_GAP_MS, META_KEY, NOTE, RECHECK_MS, loadMeta, preSwitchKey } from '../../src/platform/cloud.ts';
import { PROFILE_KEY, type Profile } from '../../src/platform/profile.ts';
import { tutorialSlot } from '../../src/view/cloudSync.ts';
import { TUTORIAL_KEY } from '../../src/view/tutorial.ts';
import { MemoryStore, json, platform, settle, setup, profileWith, putProfile, readProfile, S, } from './cloud-helpers.ts';

// 没回来的 keepalive 会一直占着记账（keepalive.ts），每个测试从零开始
beforeEach(() => resetKeepalive());

describe('上传带上确认过的账号（平台 0.7.1 的 wrong_user）', () => {
  it('每个 PUT 都带最近一次 /api/me 确认的 userId', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 1)));
    await s.cloud.start();
    s.cloud.touch('profile');
    s.cloud.hidden();
    await settle();
    expect(s.plat.puts().length).toBeGreaterThanOrEqual(2);
    expect(s.plat.puts().every((c) => c.body?.userId === 'u1')).toBe(true);
  });

  it('1 分钟内别的标签页换了账号（还没到重新确认的时候）：平台回 wrong_user，不写库，按换账号从头来', async () => {
    const s = setup();
    putProfile(s.store, profileWith((p) => (p.runs = 3)));
    await s.cloud.start();
    s.plat.user = { id: 'u2' };
    s.plat.slots = new Map([['profile', { rev: 1, data: profileWith((p) => (p.wins = 7)) }]]);
    putProfile(s.store, profileWith((p) => (p.runs = 8)));
    s.cloud.touch('profile');
    await s.clk.advance(DEBOUNCE_MS);
    await settle();
    expect(s.plat.of('u2').get('profile')!.data).toMatchObject({ runs: 0, wins: 7 });
    expect(loadMeta(s.store).userId).toBe('u2');
    expect(JSON.parse(s.store.getItem(preSwitchKey('profile', 'u1'))!)).toMatchObject({ runs: 8 });
  });
});

describe('一层一层的保护各自都管用（没有 wrong_user 兜底时）', () => {
  /** u1 同步过；标签页 A 以 u1 启动；标签页 B 换成 u2（本地换成 u2 的进度） */
  async function twoTabs() {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => {
      p.runs = 5;
      p.seen.stocks = [S[0]!];
    }));
    const a = setup({ plat, store });
    await a.cloud.start();
    plat.user = { id: 'u2' };
    plat.slots = new Map([['profile', { rev: 3, data: profileWith((p) => (p.wins = 8)) }]]);
    await setup({ plat, store }).cloud.start();
    expect(readProfile(store).wins).toBe(8);
    return { plat, store, a };
  }

  it('切后台补传来不及问 /api/me：磁盘上已是别的账号就不传（cookie 又换回 u1 也不行）', async () => {
    const { plat, a } = await twoTabs();
    plat.user = { id: 'u1' };
    a.cloud.touch('profile');
    a.cloud.hidden();
    await settle();
    expect((plat.of('u1').get('profile')!.data as Profile).wins).toBe(0);
  });

  it('cookie 换回 u1、磁盘还是 u2：回到前台后本页按换号处理（u2 的本地进度存起来，拉 u1 的）', async () => {
    const { plat, store, a } = await twoTabs();
    plat.user = { id: 'u1' };
    await a.clk.advance(RECHECK_MS);
    a.cloud.visible();
    await settle();
    expect(loadMeta(store).userId).toBe('u1');
    expect(JSON.parse(store.getItem(preSwitchKey('profile', 'u2'))!)).toMatchObject({ wins: 8 });
    expect(readProfile(store)).toMatchObject({ runs: 5, wins: 0 });
  });

  it('页面打开后、启动前别的页换了号：启动时以磁盘为准，不把 u2 的进度当成 u1 的备份', async () => {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 5)));
    await setup({ plat, store }).cloud.start();
    const late = setup({ plat, store });
    plat.user = { id: 'u2' };
    plat.slots = new Map([['profile', { rev: 3, data: profileWith((p) => (p.wins = 8)) }]]);
    await setup({ plat, store }).cloud.start();
    const backup = store.getItem(preSwitchKey('profile', 'u1'));
    await late.cloud.start();
    expect(store.getItem(preSwitchKey('profile', 'u1'))).toBe(backup);
    expect(JSON.parse(backup!)).toMatchObject({ runs: 5, wins: 0 });
  });

  it('换号时清本地没写上（存储报错但被吞掉）：不换号，u1 的进度不进 u2', async () => {
    const plat = platform();
    const store = new (class extends MemoryStore {
      broken = false;
      override setItem(k: string, v: string): void {
        if (this.broken && k === PROFILE_KEY) throw new Error('QuotaExceededError');
        super.setItem(k, v);
      }
    })();
    putProfile(store, profileWith((p) => (p.runs = 5)));
    await setup({ plat, store }).cloud.start();
    store.broken = true;
    plat.user = { id: 'u2' };
    const { cloud } = setup({ plat, store });
    await cloud.start();
    expect(plat.of('u2').get('profile')).toBeUndefined();
    expect(cloud.view.note).toBe(NOTE.storage);
  });

  for (const check of [true, false]) {
    const tag = check ? '平台校验 userId' : '平台不校验 userId';
    it(`（${tag}）过了 1 分钟上传前先确认账号，u1 的进度不传给 u2`, async () => {
      const s = setup();
      s.plat.checkUser = check;
      putProfile(s.store, profileWith((p) => (p.runs = 3)));
      await s.cloud.start();
      s.plat.user = { id: 'u2' };
      s.plat.slots = new Map([['profile', { rev: 1, data: profileWith((p) => (p.wins = 7)) }]]);
      putProfile(s.store, profileWith((p) => (p.runs = 8)));
      await s.clk.advance(RECHECK_MS);
      s.cloud.touch('profile');
      await s.clk.advance(DEBOUNCE_MS);
      await settle();
      expect(s.plat.of('u2').get('profile')!.data).toMatchObject({ runs: 0, wins: 7 });
    });

    it(`（${tag}）409 之后先确认账号，不用 0 重交`, async () => {
      const s = setup();
      s.plat.checkUser = check;
      putProfile(s.store, profileWith((p) => (p.runs = 3)));
      await s.cloud.start();
      s.plat.user = { id: 'u2' };
      s.cloud.touch('profile');
      await s.clk.advance(DEBOUNCE_MS);
      await settle();
      const u2 = s.plat.of('u2').get('profile');
      expect(u2 === undefined || (u2.data as Profile).runs !== 3).toBe(true);
    });
  }

  it('拉取时 cookie 换成了别人（GET 回 wrong_user）：不用回来的数据，按换号从头来', async () => {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 5)));
    await setup({ plat, store }).cloud.start();
    plat.of('u2');
    plat.hooks.push(() => null, (c) => {
      // /api/me 刚说完 u1，拉取前 cookie 换成 u2
      if (c.url.startsWith('/api/saves/kaipan?')) plat.user = { id: 'u2' };
      return null;
    });
    const { cloud } = setup({ plat, store });
    await cloud.start();
    await settle();
    expect(plat.calls.some((c) => c.url === '/api/saves/kaipan?userId=u1')).toBe(true);
    expect(loadMeta(store).userId).toBe('u2');
    expect(JSON.parse(store.getItem(preSwitchKey('profile', 'u1'))!)).toMatchObject({ runs: 5 });
    const u2 = plat.of('u2').get('profile');
    expect(u2 === undefined || (u2.data as Profile).runs !== 5).toBe(true);
  });
});

describe('复审（旧仓库 PR 31）：拉取回来时、换号恢复途中、教程重开、确认节流', () => {
  /** u1 同步过（本地 runs 5），之后别的设备往 u1 的云端加了 S[7] */
  async function u1Device() {
    const plat = platform();
    const store = new MemoryStore();
    putProfile(store, profileWith((p) => (p.runs = 5)));
    await setup({ plat, store }).cloud.start();
    plat.slots.set('profile', { rev: 2, data: profileWith((p) => {
      p.runs = 6;
      p.seen.stocks = [S[7]!];
    }) });
    return { plat, store };
  }

  it('拉取回来之前别的标签页换成了 u2：不把 u1 的云端合进 u2 的本地，也不传', async () => {
    const { plat, store } = await u1Device();
    plat.hooks.push(() => null, () => {
      // 回包路上：别的标签页认出 u2、把本地换成了 u2 的进度；这次回来的仍是 u1 的数据
      const u1 = json({ saves: [...plat.of('u1')].map(([slot, v]) => ({ slot, rev: v.rev, updatedAt: 1, data: v.data })) });
      plat.user = { id: 'u2' };
      store.setItem(META_KEY, JSON.stringify({ v: 1, userId: 'u2', rev: {}, dirty: ['profile'] }));
      putProfile(store, profileWith((p) => (p.wins = 8)));
      return u1;
    });
    const { cloud } = setup({ plat, store });
    await cloud.start();
    await settle();
    const local = readProfile(store);
    expect(local).toMatchObject({ wins: 8, runs: 0 });
    expect(local.seen.stocks).not.toContain(S[7]);
    expect(loadMeta(store).userId).toBe('u2');
    expect(plat.of('u1').get('profile')!.rev).toBe(2);
    const u2 = plat.of('u2').get('profile')!.data as Profile;
    expect(u2.seen.stocks).not.toContain(S[7]);
    expect(u2.wins).toBe(8);
    // 磁盘上不留 u2 名下的"u1 备份"
    expect(store.getItem(preSwitchKey('profile', 'u2'))).toBeNull();
  });

  it('换号后并回这个账号以前的进度时存储满了：先记成新账号；下次打开接着并完再改名，旧账号的备份不混进新账号的东西', async () => {
    const plat = platform();
    const store = new (class extends MemoryStore {
      broken = false;
      override setItem(k: string, v: string): void {
        if (this.broken && k === TUTORIAL_KEY && v.includes('goal')) throw new Error('QuotaExceededError');
        super.setItem(k, v);
      }
    })();
    putProfile(store, profileWith((p) => (p.runs = 5)));
    await setup({ plat, store }).cloud.start();
    // u2 以前在这台设备上被换走时存下的
    const pk = preSwitchKey('profile', 'u2');
    const tk = preSwitchKey('tutorial', 'u2');
    store.setItem(pk, JSON.stringify(profileWith((p) => (p.wins = 4))));
    store.setItem(tk, JSON.stringify({ tutorial: { v: 1, off: false, done: ['goal'] }, tips: ['bank'] }));
    store.setItem(`${pk}.restored`, '"更早的一份"');
    store.broken = true;
    plat.user = { id: 'u2' };
    const first = setup({ plat, store });
    await first.cloud.start();
    expect(first.cloud.view.note).toBe(NOTE.storage);
    expect(loadMeta(store).userId).toBe('u2');
    expect(store.getItem(pk)).not.toBeNull();
    expect(store.getItem(tk)).not.toBeNull();
    // 没全并完就不改名（改了名的那槽以后就不会再并）
    expect(store.getItem(`${pk}.restored`)).toBe('"更早的一份"');
    expect(JSON.parse(store.getItem(preSwitchKey('profile', 'u1'))!)).toMatchObject({ runs: 5, wins: 0 });
    expect(plat.puts().filter((c) => c.url.endsWith('/profile') && (c.body?.data as Profile | undefined)?.wins === 4)).toEqual([]);
    // 存储好了，下次打开：不再走换号（u1 的备份原样），把剩下的并完、改名
    store.broken = false;
    const u1Backup = store.getItem(preSwitchKey('profile', 'u1'));
    await setup({ plat, store }).cloud.start();
    expect(store.getItem(preSwitchKey('profile', 'u1'))).toBe(u1Backup);
    expect(readProfile(store)).toMatchObject({ wins: 4, runs: 0 });
    expect(JSON.parse(store.getItem(TUTORIAL_KEY)!).done).toEqual(['goal']);
    expect(store.getItem(pk)).toBeNull();
    expect(store.getItem(tk)).toBeNull();
    // 每个账号每个槽只留最近一份
    expect(JSON.parse(store.getItem(`${pk}.restored`)!)).toMatchObject({ wins: 4 });
    expect(store.getItem(`${tk}.restored`)).not.toBeNull();
    expect((plat.of('u2').get('profile')!.data as Profile).wins).toBe(4);
  });

  it('教程：重新开启过的次数多的一边整个说了算；次数一样才取并集', () => {
    const reset = { tutorial: { v: 1 as const, off: false, done: [], reset: 2 }, tips: ['bank' as const] };
    const old = { tutorial: { v: 1 as const, off: true, done: ['goal' as const, 'chat' as const], reset: 1 }, tips: ['size' as const] };
    for (const m of [tutorialSlot.merge(reset, old), tutorialSlot.merge(old, reset)]) {
      expect(m.tutorial).toEqual({ v: 1, off: false, done: [], reset: 2 });
      expect([...m.tips].sort()).toEqual(['bank', 'size']);
    }
    const same = tutorialSlot.merge({ ...reset, tutorial: { ...reset.tutorial, done: ['chat'] } }, { ...old, tutorial: { ...old.tutorial, reset: 2 } });
    expect(same.tutorial).toEqual({ v: 1, off: true, done: ['goal', 'chat'], reset: 2 });
    expect(tutorialSlot.revive({ tutorial: { done: [], reset: 3 }, tips: [] })!.tutorial.reset).toBe(3);
  });

  it('本机重新开启了教程：云端旧的看过步骤不会把它抹掉，交上去的是重开后的', async () => {
    const plat = platform();
    plat.slots = new Map([['tutorial', { rev: 4, data: { tutorial: { v: 1, off: false, done: ['goal', 'chat'] }, tips: [] } }]]);
    const store = new MemoryStore();
    store.setItem(TUTORIAL_KEY, JSON.stringify({ v: 1, off: false, done: [], reset: 1 }));
    await setup({ plat, store }).cloud.start();
    expect(JSON.parse(store.getItem(TUTORIAL_KEY)!)).toEqual({ v: 1, off: false, done: [], reset: 1 });
    expect(plat.slots.get('tutorial')!.data).toMatchObject({ tutorial: { done: [], reset: 1 } });
  });

  for (const offline of [true, false]) {
    it(`账号对不上期间连着改（${offline ? '连不上' : '连得上'}）：几秒内不反复问 /api/me`, async () => {
      const plat = platform();
      const store = new MemoryStore();
      putProfile(store, profileWith((p) => (p.runs = 5)));
      const a = setup({ plat, store });
      await a.cloud.start();
      plat.user = { id: 'u2' };
      await setup({ plat, store }).cloud.start();
      plat.offline = offline;
      await a.clk.advance(FORCE_GAP_MS);
      const me = (): number => plat.calls.filter((c) => c.url === '/api/me').length;
      const before = me();
      for (let i = 0; i < 10; i++) {
        putProfile(store, { ...readProfile(store), runs: i });
        a.cloud.touch('profile');
        await settle();
      }
      expect(me() - before).toBeLessThanOrEqual(offline ? 1 : 2);
      if (offline) {
        await a.clk.advance(FORCE_GAP_MS);
        a.cloud.touch('profile');
        await settle();
        expect(me() - before).toBe(2);
      } else expect(loadMeta(store).userId).toBe('u2');
      expect((plat.of('u1').get('profile')!.data as Profile).runs).toBe(5);
    });
  }
});
