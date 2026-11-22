/**
 * 0.4 开发期的旧存档、旧档案（防泄漏改造之前写下的）：
 * - 存档里 state.real 没有 track（个股不照搬真实走势），还带 from / to / year 和 { date, text } 的大事：提示一次后清掉，开新局；
 * - 档案 segments 的键是"1997-02-bull"这类旧 id，记录里带 year / from / to：照常读、丢掉年份字段，再记一局也合并到同一条。
 */
import { describe, expect, it } from 'vitest';
import { createRun, dispatch, runSummary, type Action, type GameState } from '../../src/core/index.ts';
import { emptyProfile, recordRun, reviveProfile } from '../../src/platform/profile.ts';
import type { KeyValueStore } from '../../src/platform/settings.ts';
import { SAVE_FORMAT, hasSave, loadSave, writeSave } from '../../src/platform/storage.ts';
import { loadSegment } from '../../tools/segments-disk.ts';

const YEAR = /(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/;

function step(s: GameState): GameState {
  const a: Action = s.phase === 'reward' ? { type: 'skipReward' } : s.phase === 'event' ? { type: 'choose', option: 0 } : { type: 'open' };
  const r = dispatch(s, a);
  if (r.error) throw new Error(r.error);
  return r.state;
}

/** 0.4 开发期写下的真实行情存档：state.real 没有 track，带真实起止日期和 { date, text } 格式的大事。 */
function asDevSave(s: GameState): Record<string, unknown> {
  const { track: _track, ...real } = s.real as NonNullable<GameState['real']>;
  return {
    ...s,
    real: { ...real, segId: '1997-02-bull', from: '1997-02-03', to: '1998-01-30', year: 1997, events: [{ date: '1997-03-27', text: 'Fed raises rates', sectors: ['bank'] }] },
  };
}

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** 打完一局真实行情、段 id 换成 0.4 开发期的旧 id（旧档案里记的是这种 id）。 */
function finishedOldIdRun(): GameState {
  let s = createRun('legacy-04dev', null, { ext: true, segment: loadSegment('1997-02-bull') }).state;
  while (s.phase !== 'won' && s.phase !== 'lost') s = step(s);
  return { ...s, real: { ...(s.real as NonNullable<GameState['real']>), segId: '1997-02-bull' } };
}

describe('0.4 开发期旧存档与旧档案', () => {
  it('旧的真实行情存档（没有 track）提示一次后清掉，不算可以继续的存档', () => {
    const state = asDevSave(createRun('legacy-04dev-mid', null, { ext: true, segment: loadSegment('1997-02-bull') }).state);
    const store = new MemoryStore();
    store.setItem('kaipan.save', JSON.stringify({ format: SAVE_FORMAT, appVersion: '0.4.9', savedAt: '2026-01-01', state }));
    expect(hasSave(store)).toBe(false);
    expect(loadSave(store)).toEqual({ state: null, notice: 'legacy' });
    expect(store.getItem('kaipan.save')).toBeNull();
    expect(loadSave(store)).toEqual({ state: null, notice: null });
  });

  it('现在的真实行情存档照常读回来', () => {
    const state = createRun('now-real', null, { ext: true, segment: loadSegment('1997-02-bull') }).state;
    const store = new MemoryStore();
    writeSave(state, store);
    expect(hasSave(store)).toBe(true);
    expect(loadSave(store).state?.real?.track).toBe(true);
  });

  it('旧档案的旧段 id 能读、丢掉年份字段；再记一局旧存档也合并到同一条', () => {
    const raw = {
      ...emptyProfile(),
      segments: {
        '1997-02-bull': { id: '1997-02-bull', year: 1997, from: '1997-02-03', to: '1998-01-30', regime: 'bull', title: '1997 年的慢牛', runs: 2, wins: 1 },
      },
    };
    const p = reviveProfile(JSON.parse(JSON.stringify(raw)));
    expect(p).not.toBeNull();
    const rec = p?.segments['1997-02-bull'];
    expect(rec).toMatchObject({ id: '1997-02-bull', regime: 'bull', runs: 2, wins: 1 });
    expect(rec && 'year' in rec).toBe(false);
    expect(rec && 'from' in rec).toBe(false);
    const r = recordRun(p as NonNullable<typeof p>, runSummary(finishedOldIdRun()), '2026-10-12');
    expect(r.ignored).toBeNull();
    const after = r.profile.segments['1997-02-bull'];
    expect(after?.runs).toBe(3);
    expect(JSON.stringify(after)).not.toMatch(/"(year|from|to)"/);
    expect((after?.story ?? []).join('')).not.toMatch(YEAR);
  });
});
