import { describe, expect, it } from 'vitest';
import { createRun, dispatch, dragonBoard, friendView, type GameState } from '../../src/core/index.ts';
import { segmentForSeed } from '../../tools/segments-disk.ts';

function afterDays(seed: string, n: number): GameState {
  let s = createRun(seed, { persona: 'newbie', difficulty: 2 }, { segment: segmentForSeed(seed), ext: true }).state;
  for (let d = 0; d < n; d++) s = dispatch(s, { type: 'open' }).state;
  return s;
}

describe('0.36 龙虎榜', () => {
  it('开局前没有；收盘后涨跌各最多 3 只，按涨跌排好，只用昨天的收盘报告', () => {
    const s0 = createRun('board-a', { persona: 'newbie', difficulty: 2 }, { segment: segmentForSeed('board-a'), ext: true }).state;
    expect(dragonBoard(s0)).toBeNull();
    const s = afterDays('board-a', 2);
    const b = dragonBoard(s);
    expect(b).not.toBeNull();
    if (!b || !s.lastDay) return;
    expect(b.up.length).toBeLessThanOrEqual(3);
    expect(b.down.length).toBeLessThanOrEqual(3);
    for (const e of b.up) expect(e.move).toBeGreaterThan(0);
    for (const e of b.down) expect(e.move).toBeLessThan(0);
    expect(b.up.map((e) => e.move)).toEqual([...b.up.map((e) => e.move)].sort((x, y) => y - x));
    const best = Math.max(...s.lastDay.stocks.map((m) => m.move));
    expect(b.up[0]?.move).toBe(best);
  });

  it('喊对的群友：当天说中了那个风口、方向一致；得意话只给上榜的人', () => {
    for (let i = 0; i < 12; i++) {
      const s = afterDays(`board-${i}`, 3);
      const b = dragonBoard(s);
      if (!b || !s.lastDay) continue;
      for (const e of [...b.up, ...b.down]) {
        for (const name of e.callers) {
          const ok = s.lastDay.messages.concat(s.lastDay.intel ?? []).some((j) => j.hit && j.theme === e.theme && j.claim === (e.move > 0 ? 'up' : 'down') && friendView(s, j.friendId).name === name);
          expect(ok, `${e.name} ${name}`).toBe(true);
        }
      }
      if (b.brag) expect([...b.up, ...b.down].some((e) => e.callers.includes(b.brag?.name ?? ''))).toBe(true);
      else expect([...b.up, ...b.down].every((e) => e.callers.length === 0)).toBe(true);
    }
  });
});
