import { afterEach, describe, expect, it, vi } from 'vitest';

/** 假 localStorage：碰 arcade.sound 的写入就抛，锁住「大厅的 key 只读不写」 */
function fakeStore(init: Record<string, string>): Storage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    key: (i: number) => Object.keys(data)[i] ?? null,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      if (k === 'arcade.sound') throw new Error('游戏不该写 arcade.sound');
      data[k] = v;
    },
    removeItem: (k: string) => {
      if (k === 'arcade.sound') throw new Error('游戏不该删 arcade.sound');
      delete data[k];
    },
    clear: () => {
      throw new Error('不该清空');
    },
  };
}

async function freshSettings(store: Storage): Promise<typeof import('../../src/platform/settings.ts')> {
  vi.stubGlobal('localStorage', store);
  vi.resetModules();
  return import('../../src/platform/settings.ts');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('大厅静音带进游戏（kit platformSoundOn）', () => {
  it('大厅关了：这一次先静音；游戏里打开只管这次，存档的静音偏好和 arcade.sound 都不动', async () => {
    const store = fakeStore({ 'arcade.sound': 'off', 'kaipan.settings': JSON.stringify({ version: 1, muted: false, musicVolume: 0.4 }) });
    const m = await freshSettings(store);
    expect(m.getSettings().muted).toBe(true);
    // 静音时改别的设置：存下去的静音仍是原来的 false
    m.updateSettings({ musicVolume: 0.2 });
    expect(JSON.parse(store.data['kaipan.settings'] as string)).toMatchObject({ muted: false, musicVolume: 0.2 });
    // 玩家打开声音：这次有声，存档不变，大厅的 key 还是 off
    expect(m.updateSettings({ muted: false }).muted).toBe(false);
    expect(JSON.parse(store.data['kaipan.settings'] as string).muted).toBe(false);
    expect(store.data['arcade.sound']).toBe('off');
    // 下次打开大厅仍关着：又是先静音
    const again = await freshSettings(store);
    expect(again.getSettings().muted).toBe(true);
  });

  it('大厅开着或没有平台：照游戏自己存的偏好', async () => {
    const on = await freshSettings(fakeStore({ 'kaipan.settings': JSON.stringify({ version: 1, muted: false }) }));
    expect(on.getSettings().muted).toBe(false);
    const mine = await freshSettings(fakeStore({ 'arcade.sound': 'on', 'kaipan.settings': JSON.stringify({ version: 1, muted: true }) }));
    expect(mine.getSettings().muted).toBe(true);
    const store = fakeStore({ 'kaipan.settings': JSON.stringify({ version: 1, muted: false }) });
    const m = await freshSettings(store);
    m.updateSettings({ muted: true });
    expect(JSON.parse(store.data['kaipan.settings'] as string).muted).toBe(true);
  });
});
