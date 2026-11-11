/**
 * 设置、存档里的难度兼容旧值：0.12.1 起是新手 / 普通 / 高手三档，以前存的四档换过来，认不得的按默认"新手"。
 * store.ts 的设置是模块级缓存，每个用例重新导入一份。不起浏览器：假的 localStorage。
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../../src/variants/guandan/core/index.ts';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  mem.clear();
  vi.resetModules();
});
const fresh = () => import('../../src/view/store.ts');
import { DEFAULT_SETTINGS, migrateSound } from '../../src/view/store.ts';

describe('难度兼容旧值', () => {
  it('现在的三档照用；0.12.0 以前的四档换过来：简单→新手、普通照旧、较强→普通、困难→高手', async () => {
    for (const [old, now] of [['novice', 'novice'], ['normal', 'normal'], ['pro', 'pro'], ['easy', 'novice'], ['good', 'normal'], ['hard', 'pro']]) {
      mem.set('guandan.settings', JSON.stringify({ v: 1, volume: 0.5, difficulty: old }));
      vi.resetModules();
      const s = (await fresh()).getSettings();
      expect(s.difficulty).toBe(now);
      expect(s.sfx).toBe(2);
    }
  });

  it('第一次玩、认不得的难度（以后的版本存的、手改坏的）都按默认"新手"，别的设置不丢', async () => {
    mem.set('guandan.settings', JSON.stringify({ v: 1, volume: 0.3, difficulty: 'insane' }));
    const s = (await fresh()).getSettings();
    expect(s.difficulty).toBe('novice');
    expect(s.sfx).toBe(1);
    mem.delete('guandan.settings');
    vi.resetModules();
    expect((await fresh()).getSettings().difficulty).toBe('novice');
  });

  it('存档里的难度同样：旧的四档换过来，认不得的按"新手"接着打', async () => {
    const state = createGame('store-compat').state;
    const save = (difficulty: string) => mem.set('guandan.save', JSON.stringify({ v: 1, state, difficulty, counted: false, dealsCounted: 0 }));
    const store = await fresh();
    save('good');
    expect(store.loadSave()?.difficulty).toBe('normal');
    save('pro');
    expect(store.loadSave()?.difficulty).toBe('pro');
    save('insane');
    expect(store.loadSave()?.difficulty).toBe('novice');
  });
});

describe('声音设置：音乐、音效各一档', () => {
  it('迁移是纯函数：老 volume 落到最近一档给音效，背景音关着音乐就是关，开着跟音效；muted 保留；坏数据用默认', () => {
    expect(migrateSound({ volume: 0.35, music: true })).toEqual({ sfx: 1, musicVol: 1, muted: false });
    expect(migrateSound({ volume: 0.65, music: false })).toEqual({ sfx: 2, musicVol: 0, muted: false });
    expect(migrateSound({ volume: 1, music: true, muted: true })).toEqual({ sfx: 3, musicVol: 3, muted: true });
    expect(migrateSound({ volume: 0 })).toMatchObject({ sfx: 0, musicVol: 0 });
    expect(migrateSound({})).toEqual({ sfx: DEFAULT_SETTINGS.sfx, musicVol: DEFAULT_SETTINGS.musicVol, muted: false });
    expect(migrateSound({ volume: '大声', music: 3, muted: 1 })).toEqual({ sfx: DEFAULT_SETTINGS.sfx, musicVol: DEFAULT_SETTINGS.musicVol, muted: false });
    expect(migrateSound({ volume: NaN, sfx: 9, musicVol: -1 })).toMatchObject({ sfx: DEFAULT_SETTINGS.sfx, musicVol: DEFAULT_SETTINGS.musicVol });
    // 新字段合法就以新字段为准，不被老字段盖掉
    expect(migrateSound({ sfx: 1, musicVol: 2, volume: 1, music: false })).toEqual({ sfx: 1, musicVol: 2, muted: false });
  });

  it('读老存档：volume / music 换成两档并丢掉老字段；音乐和音效分别改、刷新后各自保留', async () => {
    mem.set('guandan.settings', JSON.stringify({ v: 1, volume: 0.65, music: false, muted: true }));
    const store = await fresh();
    const s = store.getSettings() as unknown as Record<string, unknown>;
    expect(s.sfx).toBe(2);
    expect(s.musicVol).toBe(0);
    expect(s.muted).toBe(true);
    expect(s.volume).toBeUndefined();
    expect(s.music).toBeUndefined();
    store.updateSettings({ musicVol: 1, sfx: 3, muted: false });
    expect(JSON.parse(mem.get('guandan.settings')!)).toMatchObject({ sfx: 3, musicVol: 1, muted: false });
    expect(JSON.parse(mem.get('guandan.settings')!).volume).toBeUndefined();
    vi.resetModules();
    const again = (await fresh()).getSettings();
    expect([again.sfx, again.musicVol, again.muted]).toEqual([3, 1, false]);
  });

  it('没有设置、设置版本不对、字段坏了都是默认的一档', async () => {
    expect((await fresh()).getSettings()).toMatchObject({ sfx: DEFAULT_SETTINGS.sfx, musicVol: DEFAULT_SETTINGS.musicVol, muted: false });
    mem.set('guandan.settings', JSON.stringify({ v: 2, volume: 0.1 }));
    vi.resetModules();
    expect((await fresh()).getSettings().sfx).toBe(DEFAULT_SETTINGS.sfx);
    mem.set('guandan.settings', JSON.stringify({ v: 1, sfx: 'x', musicVol: 7 }));
    vi.resetModules();
    expect((await fresh()).getSettings()).toMatchObject({ sfx: DEFAULT_SETTINGS.sfx, musicVol: DEFAULT_SETTINGS.musicVol });
  });

  it('恢复默认：设置回初值（含地方规则、难度），战绩和存档不动', async () => {
    const store = await fresh();
    mem.set('guandan.stats', JSON.stringify({ v: 1, games: 9, wins: 5, streak: 1, bestStreak: 3, deals: 20, firsts: 4, dealWins: 11 }));
    store.updateSettings({ sfx: 0, musicVol: 1, muted: true, speed: 'fast', difficulty: 'pro', back: 1, chat: false, rules: { fullHouseJokerPair: false } });
    const s = store.resetSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(JSON.parse(mem.get('guandan.settings')!)).toEqual(DEFAULT_SETTINGS);
    expect(store.getSettings().rules).toEqual({});
    expect(store.getStats().games).toBe(9);
    // 重置后改返回的对象不会串到默认值
    s.rules.fullHouseJokerPair = true;
    expect(store.DEFAULT_SETTINGS.rules).toEqual({});
  });
});

describe('局长（0.25.0）', () => {
  it('默认短局；旧设置没有这一项、认不得的值都按短局；选了完整记住', async () => {
    expect((await fresh()).getSettings().length).toBe('short');
    mem.set('guandan.settings', JSON.stringify({ v: 1, volume: 0.4, difficulty: 'pro' }));
    vi.resetModules();
    expect((await fresh()).getSettings().length).toBe('short');
    mem.set('guandan.settings', JSON.stringify({ v: 1, length: 'forever' }));
    vi.resetModules();
    const store = await fresh();
    expect(store.getSettings().length).toBe('short');
    store.updateSettings({ length: 'full' });
    vi.resetModules();
    expect((await fresh()).getSettings().length).toBe('full');
  });

  it('娱乐单机按局长开：短局终点 10，完整是 A；实盘（stake.ts 用 createGame 默认）不受影响', async () => {
    const store = await fresh();
    const { Session } = await import('../../src/view/guandan/session.ts');
    expect(Session.fresh('len-1').view().options.endLevel).toBe(10);
    store.updateSettings({ length: 'full' });
    expect(Session.fresh('len-2').view().options.endLevel).toBe(14);
    expect(createGame('len-3').state.options.endLevel).toBe(14);
  });
});
