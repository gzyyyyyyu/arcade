import { afterEach, describe, expect, it, vi } from 'vitest';

/** 假 localStorage：记下写了什么 */
const fake = (init: Record<string, string>) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: vi.fn((k: string, v: string) => void m.set(k, v)), removeItem: (k: string) => void m.delete(k), m };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('大厅静音带进夜巡（kit platformSoundOn，见 arcade-kit README）', () => {
  it('大厅关了声音：这次打开音效先关；在游戏里打开只管这一次，不写 yexun.settings', async () => {
    const ls = fake({ 'arcade.sound': 'off', 'yexun.settings': JSON.stringify({ sfx: true }) });
    vi.stubGlobal('localStorage', ls);
    const { sfx } = await import('../../src/view/audio/sfx.ts');
    expect(sfx.enabled).toBe(false);
    sfx.setEnabled(true);
    expect(sfx.enabled).toBe(true);
    expect(ls.setItem).not.toHaveBeenCalled();
    expect(ls.m.get('arcade.sound')).toBe('off');
  });

  it('大厅开着：照自己存的偏好，开关照常写存档', async () => {
    const ls = fake({ 'yexun.settings': JSON.stringify({ sfx: true }) });
    vi.stubGlobal('localStorage', ls);
    const { sfx } = await import('../../src/view/audio/sfx.ts');
    expect(sfx.enabled).toBe(true);
    sfx.setEnabled(false);
    expect(ls.setItem).toHaveBeenCalled();
    expect(JSON.parse(ls.m.get('yexun.settings')!).sfx).toBe(false);
  });
});
