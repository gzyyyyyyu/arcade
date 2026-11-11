import { beforeEach, describe, expect, it } from 'vitest';
import { resetKeepalive } from '../../src/platform/keepalive.ts';
import { KNOWLEDGE, PERSONAS } from '../../src/core/index.ts';
import { META_KEY, loadMeta, preSwitchKey, stable } from '../../src/platform/cloud.ts';
import { CLOUD_PROFILE_BYTES, cloudProfile, mergeProfile } from '../../src/platform/profile.ts';
import { tutorialSlot } from '../../src/view/cloudSync.ts';
import { EXT_TIPS_KEY } from '../../src/view/extTips.ts';
import { MemoryStore, platform, setup, profileWith, putProfile, readProfile, S, A } from './cloud-helpers.ts';

// 没回来的 keepalive 会一直占着记账（keepalive.ts），每个测试从零开始
beforeEach(() => resetKeepalive());

describe('换了账号', () => {
  it('本地是上一个账号的：不传给新账号；没传上去的改动存起来，上一个账号回来时补上', async () => {
    const plat = platform();
    const store = new MemoryStore();
    // 账号 A 同步过，又改了没来得及传
    putProfile(store, profileWith((p) => (p.runs = 1)));
    await setup({ plat, store }).cloud.start();
    putProfile(store, profileWith((p) => {
      p.runs = 9;
      p.seen.stocks = [S[3]!];
    }));
    store.setItem(META_KEY, JSON.stringify({ ...loadMeta(store), dirty: ['profile'] }));
    const aCloud = plat.slots.get('profile')!.data;
    // 换成账号 B 登录（B 云端有自己的进度）
    plat.user = { id: 'u2' };
    plat.slots = new Map([['profile', { rev: 5, data: profileWith((p) => (p.wins = 1)) }]]);
    expect(plat.of('u1').get('profile')!.data).toEqual(aCloud);
    plat.calls.length = 0;
    await setup({ plat, store }).cloud.start();
    // B 的云端没被 A 的东西污染，本地换成了 B 的
    expect(plat.puts()).toHaveLength(0);
    expect(plat.slots.get('profile')!.data).toMatchObject({ runs: 0, wins: 1 });
    expect(readProfile(store)).toMatchObject({ runs: 0, wins: 1 });
    expect(loadMeta(store).userId).toBe('u2');
    expect(JSON.parse(store.getItem(preSwitchKey('profile', 'u1'))!)).toMatchObject({ runs: 9 });
    // A 回来：云端是 A 的那份，加上存起来的改动
    plat.user = { id: 'u1' };
    expect(plat.slots.get('profile')!.data).toEqual(aCloud);
    await setup({ plat, store }).cloud.start();
    expect(plat.slots.get('profile')!.data).toMatchObject({ runs: 9, seen: { stocks: [S[3]] } });
    expect(store.getItem(preSwitchKey('profile', 'u1'))).toBeNull();
    // 改名留底，以后不再并
    expect(JSON.parse(store.getItem(`${preSwitchKey('profile', 'u1')}.restored`)!)).toMatchObject({ runs: 9 });
  });

  it('从没同步过（没登录时玩的）：算作这个账号的首次同步，并进去', async () => {
    const plat = platform();
    plat.slots.set('profile', { rev: 2, data: profileWith((p) => (p.wins = 4)) });
    const { cloud, store } = setup({ plat });
    putProfile(store, profileWith((p) => (p.runs = 6)));
    await cloud.start();
    expect(plat.slots.get('profile')!.data).toMatchObject({ runs: 6, wins: 4 });
  });
});

describe('合并规则', () => {
  const a = profileWith((p) => {
    p.runs = 5;
    p.wins = 1;
    p.seen.stocks = [S[0]!, S[2]!];
    p.achievements[A[0]!] = 3;
    p.achievements[A[1]!] = 4;
    p.personas = [...p.personas, PERSONAS.at(-1)!.id];
    p.maxDifficulty = 2;
    p.best['newbie:1'] = { runs: 3, wins: 1, bestAccount: 500, bestMonths: 12 };
    p.daily['2026-10-01'] = { persona: 'newbie', difficulty: 1, attempts: 2, won: false, bestAccount: 0, bestMonths: 5 };
    p.segments.s1 = { id: 's1', regime: 'bull', title: '牛', runs: 2, wins: 0, story: ['本地的故事'] };
    p.knowledge = [KNOWLEDGE[0]!.id];
    p.last = 'local';
  });
  const b = profileWith((p) => {
    p.runs = 7;
    p.wins = 0;
    p.seen.stocks = [S[1]!, S[2]!];
    p.achievements[A[0]!] = 1;
    p.maxDifficulty = 4;
    p.best['newbie:1'] = { runs: 2, wins: 2, bestAccount: 900, bestMonths: 8 };
    p.best['newbie:2'] = { runs: 1, wins: 0, bestAccount: 0, bestMonths: 3 };
    p.daily['2026-10-01'] = { persona: 'newbie', difficulty: 1, attempts: 1, won: true, bestAccount: 800, bestMonths: 12 };
    p.daily['2026-10-02'] = { persona: 'newbie', difficulty: 1, attempts: 1, won: false, bestAccount: 0, bestMonths: 2 };
    p.segments.s1 = { id: 's1', regime: 'bull', title: '牛', runs: 1, wins: 1 };
    p.segments.s2 = { id: 's2', regime: 'bear', title: '熊', runs: 1, wins: 0 };
    p.knowledge = [KNOWLEDGE[1]!.id];
    p.last = 'cloud';
  });

  it('集合取并集、计数取较大、成就取较早的那局', () => {
    const m = mergeProfile(a, b);
    expect(m.runs).toBe(7);
    expect(m.wins).toBe(1);
    expect(m.seen.stocks).toEqual([S[0], S[1], S[2]]);
    expect(m.achievements).toEqual({ [A[0]!]: 1, [A[1]!]: 4 });
    expect(m.personas).toContain(PERSONAS.at(-1)!.id);
    expect(m.maxDifficulty).toBe(4);
    expect(m.best['newbie:1']).toEqual({ runs: 3, wins: 2, bestAccount: 900, bestMonths: 12 });
    expect(m.best['newbie:2']).toEqual(b.best['newbie:2']);
    expect(m.daily['2026-10-01']).toEqual({ persona: 'newbie', difficulty: 1, attempts: 2, won: true, bestAccount: 800, bestMonths: 12 });
    expect(Object.keys(m.daily).sort()).toEqual(['2026-10-01', '2026-10-02']);
    expect(m.segments.s1).toEqual({ id: 's1', regime: 'bull', title: '牛', runs: 2, wins: 1, story: ['本地的故事'] });
    expect(m.segments.s2).toEqual(b.segments.s2);
    expect(m.knowledge).toEqual([KNOWLEDGE[0]!.id, KNOWLEDGE[1]!.id]);
    expect(m.last).toBe('local');
  });

  it('换个顺序结果一样（last 除外）；和自己合并不变；不改传入的档案', () => {
    const before = JSON.stringify(a);
    const ab = { ...mergeProfile(a, b), last: '' };
    const ba = { ...mergeProfile(b, a), last: '' };
    // 行情段的小故事两边都有时取前者的，这里只有 a 有，所以顺序无关
    expect(stable(ab)).toBe(stable(ba));
    expect(stable(mergeProfile(a, a))).toBe(stable(a));
    expect(JSON.stringify(a)).toBe(before);
  });

  it('教程：看过的步骤和提示取并集，任何一边关掉就算关掉', () => {
    const m = tutorialSlot.merge({ tutorial: { v: 1, off: false, done: ['chat', 'goal'] }, tips: ['bank'] }, { tutorial: { v: 1, off: true, done: ['open'] }, tips: ['size', 'bank'] });
    expect(m).toEqual({ tutorial: { v: 1, off: true, done: ['goal', 'chat', 'open'] }, tips: ['size', 'bank'] });
  });

  it('云端来的教程数据不认识的步骤丢掉', () => {
    expect(tutorialSlot.revive({ tutorial: { off: 'yes', done: ['goal', 'hack', 1] }, tips: ['bank', '<x>'] })).toEqual({ tutorial: { v: 1, off: false, done: ['goal'] }, tips: ['bank'] });
    expect(tutorialSlot.revive('nope')).toBeNull();
  });

  it('教程槽：本地没有任何记录时算没有；只有提示记录也算有', () => {
    const s = new MemoryStore();
    expect(tutorialSlot.read(s)).toBeNull();
    s.setItem(EXT_TIPS_KEY, '["bank"]');
    expect(tutorialSlot.read(s)).toEqual({ tutorial: { v: 1, off: false, done: [] }, tips: ['bank'] });
  });
});

describe('上传的档案不超过 48 KB', () => {
  it('不大时原样（只去掉 last）', () => {
    const p = profileWith((x) => (x.last = 'abc'));
    expect(cloudProfile(p)).toEqual({ ...p, last: '' });
  });

  it('太大时先去掉行情段的小故事，再从最早的日子删每日挑战；本地那份不动', () => {
    const p = profileWith((x) => {
      for (let i = 0; i < 300; i++) x.segments[`seg${i}`] = { id: `seg${i}`, regime: 'bull', title: '一段行情', runs: 1, wins: 0, story: Array.from({ length: 12 }, () => '这是一句很长很长的小故事，讲这一局赚了谁亏了谁') };
      for (let d = 1; d <= 400; d++) {
        const day = `2025-${String(Math.ceil(d / 31)).padStart(2, '0')}-${String(((d - 1) % 31) + 1).padStart(2, '0')}`;
        x.daily[day] = { persona: 'newbie', difficulty: 1, attempts: 1, won: false, bestAccount: 0, bestMonths: 1 };
      }
    });
    const before = JSON.stringify(p);
    const c = cloudProfile(p);
    expect(new TextEncoder().encode(JSON.stringify(c)).length).toBeLessThanOrEqual(CLOUD_PROFILE_BYTES);
    expect(Object.values(c.segments).every((s) => s.story === undefined)).toBe(true);
    expect(Object.keys(c.segments)).toHaveLength(300);
    const kept = Object.keys(c.daily).sort();
    const all = Object.keys(p.daily).sort();
    expect(kept.length).toBeLessThan(all.length);
    // 删的是最早的
    expect(kept).toEqual(all.slice(all.length - kept.length));
    expect(JSON.stringify(p)).toBe(before);
  });
});
