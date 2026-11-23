import { afterEach, describe, expect, it, vi } from 'vitest';

/** 假 localStorage：记下所有写入，平台的 key 一碰就抛（锁住只读） */
function fakeStore(init: Record<string, string>): { writes: string[] } {
  const data = new Map(Object.entries(init));
  const writes: string[] = [];
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k.startsWith('arcade.')) throw new Error(`写了平台的 key ${k}`);
      writes.push(k);
      data.set(k, v);
    },
  });
  return { writes };
}

/** sfx.ts 启动时读一次大厅开关：每条测试带不同查询串重新加载一份 */
let n = 0;
async function freshSfx(): Promise<typeof import('../src/view/audio/sfx.ts')> {
  return import(/* @vite-ignore */ `../src/view/audio/sfx.ts?case=${++n}`);
}

afterEach(() => vi.unstubAllGlobals());

describe('大厅静音带进海岛（arcade-kit platformSoundOn）', () => {
  it('大厅关了声音：这次打开音乐、音效都关；在海岛里再打开只管这一次，不写自己的设置', async () => {
    const st = fakeStore({ 'arcade.sound': 'off', 'haidao.settings': JSON.stringify({ music: true, sfx: true }) });
    const s = await freshSfx();
    expect(s.isMusicOn()).toBe(false);
    expect(s.isSfxOn()).toBe(false);
    s.setSfxOn(true);
    s.setMusicOn(true);
    expect(s.isSfxOn()).toBe(true);
    expect(s.isMusicOn()).toBe(true);
    expect(st.writes).toEqual([]);
  });
  it('大厅没静音：照自己存的开关，改了记下', async () => {
    const st = fakeStore({ 'haidao.settings': JSON.stringify({ music: false, sfx: true }) });
    const s = await freshSfx();
    expect(s.isMusicOn()).toBe(false);
    expect(s.isSfxOn()).toBe(true);
    s.setSfxOn(false);
    expect(s.isSfxOn()).toBe(false);
    expect(st.writes).toEqual(['haidao.settings']);
  });
});
