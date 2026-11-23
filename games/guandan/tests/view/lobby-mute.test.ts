/**
 * 大厅静音带进来（kit docs/sound.md，0.40.10）：大厅关了声音就这一次先静音；在设置里打开只管这一次，不改自己存的设置。
 * 平台探测和存储换成假的，只看送进声音的 muted 和存下的设置
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(lobbyOn: boolean, storedMuted: boolean) {
  vi.resetModules();
  const stored = { sfx: 2, musicVol: 2, muted: storedMuted };
  const writes: unknown[] = [];
  vi.doMock('arcade-kit/client', () => ({ platformSoundOn: () => lobbyOn }));
  vi.doMock('../../src/view/store.ts', () => ({
    SOUND_GAIN: [0, 0.4, 0.7, 1],
    getSettings: () => ({ ...stored }),
    updateSettings: (p: Partial<typeof stored>) => {
      writes.push(p);
      Object.assign(stored, p);
      return { ...stored };
    },
  }));
  const m = await import('../../src/view/common/audio.ts');
  const sent: boolean[] = [];
  vi.spyOn(m.audio, 'apply').mockImplementation((s) => void sent.push(s.muted));
  return { ...m, stored, writes, sent };
}

afterEach(() => {
  vi.doUnmock('arcade-kit/client');
  vi.doUnmock('../../src/view/store.ts');
});

describe('大厅静音带进来', () => {
  it('大厅关了：这次先静音、开关显示静音；打开只解这一次，不写设置', async () => {
    const a = await load(false, false);
    a.applyAudio();
    expect(a.sent).toEqual([true]);
    expect(a.mutedNow(a.stored as never)).toBe(true);
    a.pickMuted(false);
    expect(a.sent.at(-1)).toBe(false);
    expect(a.writes).toEqual([]);
    expect(a.mutedNow(a.stored as never)).toBe(false);
  });

  it('大厅开着：照自己存的；自己点静音照常存', async () => {
    const a = await load(true, false);
    a.applyAudio();
    expect(a.sent).toEqual([false]);
    a.pickMuted(true);
    expect(a.writes).toEqual([{ muted: true }]);
    expect(a.sent.at(-1)).toBe(true);
  });

  it('自己存的是静音、大厅也关了：在设置里打开，存的改成开（这是玩家自己的选择）', async () => {
    const a = await load(false, true);
    a.pickMuted(false);
    expect(a.writes).toEqual([{ muted: false }]);
    expect(a.sent.at(-1)).toBe(false);
  });
});
