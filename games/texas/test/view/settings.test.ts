/** 设置的存取（src/store.ts）：默认值、旧存档能读、恢复默认只动设置面板管的那几项 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, KEYS, patchSettings, readPrefs, readSettings, resetSettings, savePrefs } from '../../src/store.ts';

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('设置面板的存取', () => {
  it('什么都没存过：音效开、音量 0.8、正常速度、不自动下一手', () => {
    expect(readPrefs()).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toEqual({ sound: true, volume: 0.8, fast: false, autoNext: false });
  });

  it('旧存档（只有 sound / volume 0.35 / fast）照读，缺的字段补默认', () => {
    mem.set(KEYS.settings, JSON.stringify({ sound: false, volume: 0.35, fast: true, stakes: 'mid' }));
    expect(readPrefs()).toEqual({ sound: false, volume: 0.35, fast: true, autoNext: false });
  });

  it('音量是滑条上的任意值：夹在 0–1，坏值回默认', () => {
    for (const [raw, want] of [[0.55, 0.55], [7, 1], [-1, 0], ['loud', 0.8], [null, 0.8]] as const) {
      mem.set(KEYS.settings, JSON.stringify({ volume: raw }));
      expect(readPrefs().volume).toBe(want);
    }
  });

  it('存档坏了当没有', () => {
    mem.set(KEYS.settings, '{坏的');
    expect(readPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('存了刷新后还在，且不覆盖大厅记住的字段', () => {
    patchSettings({ stakes: 'big', players: 9 });
    savePrefs({ sound: false, volume: 0.45, fast: true, autoNext: true });
    expect(readPrefs()).toEqual({ sound: false, volume: 0.45, fast: true, autoNext: true });
    expect(readSettings()).toMatchObject({ stakes: 'big', players: 9 });
  });

  it('恢复默认：开关、聊天、止盈回默认，大厅记住的档位和人数不动', () => {
    patchSettings({ stakes: 'big', chatOff: true, strangerChat: false, takeProfit: { kind: 'pct', pct: 100 } });
    savePrefs({ sound: false, volume: 0.2, fast: true, autoNext: true });
    resetSettings();
    expect(readPrefs()).toEqual(DEFAULT_PREFS);
    const left = readSettings();
    expect(left).toMatchObject({ stakes: 'big' });
    expect(left).not.toHaveProperty('chatOff');
    expect(left).not.toHaveProperty('strangerChat');
    expect(left).not.toHaveProperty('takeProfit');
  });
});
