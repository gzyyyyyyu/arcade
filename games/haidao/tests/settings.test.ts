import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings, SETTINGS_KEY } from '../src/view/settings.ts';

const memStore = (init?: string) => {
  const m = new Map<string, string>();
  if (init !== undefined) m.set(SETTINGS_KEY, init);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: () => m.get(SETTINGS_KEY) };
};

describe('settings', () => {
  it('没存过：音乐音效都开', () => {
    expect(loadSettings(memStore())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('字段类型不对当作没存', () => {
    expect(parseSettings({ music: true, sfx: false })).toEqual({ music: true, sfx: false });
    expect(parseSettings({ music: 'no', sfx: 1 })).toEqual(DEFAULT_SETTINGS);
  });

  it('坏数据不抛错', () => {
    expect(loadSettings(memStore('{oops'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memStore('[1,2]'))).toEqual(DEFAULT_SETTINGS);
  });

  it('音乐、音效分开存，刷新（重新读）后保持', () => {
    const st = memStore();
    saveSettings({ music: false, sfx: true }, st);
    expect(loadSettings(st)).toEqual({ music: false, sfx: true });
    saveSettings({ music: true, sfx: false }, st);
    expect(loadSettings(st)).toEqual({ music: true, sfx: false });
  });

  it('写回保留不认识的字段', () => {
    const st = memStore(JSON.stringify({ other: 7 }));
    saveSettings({ music: false, sfx: true }, st);
    expect(JSON.parse(st.raw()!)).toEqual({ other: 7, music: false, sfx: true });
  });

  it('恢复默认写回后读出来是全开', () => {
    const st = memStore();
    saveSettings({ music: false, sfx: false }, st);
    saveSettings({ ...DEFAULT_SETTINGS }, st);
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
  });
});
