// 大厅静音带进来（kit docs/sound.md）：大厅关了声音，这一次先静音；在游戏里打开只管这一次，不写 arcade.sound、不改存着的 mahjong.prefs
import { afterEach, describe, expect, test, vi } from 'vitest';

function fakeStorage(init: Record<string, string>) {
  const data: Record<string, string> = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k]! : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

async function open(init: Record<string, string>) {
  const ls = fakeStorage(init);
  vi.stubGlobal('localStorage', ls);
  vi.resetModules();
  const m = await import('../src/app/prefs.ts');
  return { ls, ...m };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('大厅静音', () => {
  test('大厅关了声音：这一次先静音，存着的偏好不动', async () => {
    const { live, prefs, ls } = await open({ 'arcade.sound': 'off', 'mahjong.prefs': JSON.stringify({ sound: true }) });
    expect(live.sound).toBe(false);
    expect(prefs.sound).toBe(true);
    expect(ls.data['arcade.sound']).toBe('off');
  });

  test('大厅静音进来后在游戏里打开：这一次有声，不写 arcade.sound，也不改 mahjong.prefs 的 sound', async () => {
    const { live, setLiveSound, savePrefs, prefs, ls } = await open({ 'arcade.sound': 'off', 'mahjong.prefs': JSON.stringify({ sound: true, volume: 0.5 }) });
    setLiveSound(true);
    savePrefs();
    expect(live.sound).toBe(true);
    expect(ls.data['arcade.sound']).toBe('off');
    expect(JSON.parse(ls.data['mahjong.prefs']!).sound).toBe(true);
    setLiveSound(false);
    expect(prefs.sound).toBe(true);
    expect(JSON.parse(ls.data['mahjong.prefs']!).sound).toBe(true);
  });

  test('大厅没关：按游戏自己的设置，开关照常存', async () => {
    const { live, setLiveSound, ls } = await open({ 'mahjong.prefs': JSON.stringify({ sound: false }) });
    expect(live.sound).toBe(false);
    setLiveSound(true);
    expect(live.sound).toBe(true);
    expect(JSON.parse(ls.data['mahjong.prefs']!).sound).toBe(true);
    expect('arcade.sound' in ls.data).toBe(false);
  });

  test('恢复默认：这一次也跟着回有声', async () => {
    const { live, resetSettings } = await open({ 'arcade.sound': 'off' });
    resetSettings();
    expect(live.sound).toBe(true);
  });
});

describe('换三张一次性修（0.47.10）', () => {
  test('以前切过三人两房、存着不换三张的：读进来改回换，记下修过；修过以后自己再关的不动', async () => {
    const { prefs, savePrefs, ls } = await open({ 'mahjong.prefs': JSON.stringify({ opts: { rounds: 4, cap: 4, swap: false, zimo: 'di', transfer: true, flow: false, three: false } }) });
    expect(prefs.opts.swap).toBe(true);
    expect(prefs.opts.rounds).toBe(4);
    prefs.opts = { ...prefs.opts, swap: false };
    savePrefs();
    const again = await open({ 'mahjong.prefs': ls.data['mahjong.prefs']! });
    expect(again.prefs.opts.swap).toBe(false);
  });
});
