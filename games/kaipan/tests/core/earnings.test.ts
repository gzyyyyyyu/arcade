import { describe, expect, it } from 'vitest';
import { createRun, dailySetup, dispatch, earningsPlan, earningsView, liveSetup, shortSetup, type Action, type GameState, type RunSetup } from '../../src/core/index.ts';
import { segmentForSeed } from '../../tools/segments-disk.ts';

function start(seed: string, setup: RunSetup = { persona: 'newbie', difficulty: 3 }): GameState {
  return createRun(seed, setup, { segment: segmentForSeed(seed), ext: true }).state;
}

function step(s: GameState): GameState {
  const a: Action = s.phase === 'reward' ? { type: 'skipReward' } : s.phase === 'event' ? { type: 'choose', option: 1 } : { type: 'open' };
  return dispatch(s, a).state;
}

describe('0.36 财报周', () => {
  it('普通局 3/6/9/12 月各一次，出财报那天在本月第 2 天起；短局只有 3 月', () => {
    const s = start('earn-a');
    for (const m of [3, 6, 9, 12]) {
      const p = earningsPlan(s, m);
      expect(p, `${m} 月`).not.toBeNull();
      expect(p?.nth).toBeGreaterThanOrEqual(2);
      expect(p?.day).toBe((p?.announce ?? 0) + (p?.nth ?? 0) - 1);
    }
    for (const m of [1, 2, 4, 5, 7, 8, 10, 11]) expect(earningsPlan(s, m)).toBeNull();
    const short = start('earn-a', shortSetup('newbie', 1));
    expect(earningsPlan(short, 3)).not.toBeNull();
  });

  it('合成行情、每日挑战、实盘都没有', () => {
    const synth = createRun('earn-syn', { persona: 'newbie', difficulty: 3 }).state;
    expect(earningsPlan(synth, 3)).toBeNull();
    const d = dailySetup('2026-10-27');
    expect(earningsPlan(createRun(d.seed, d.setup, { segment: segmentForSeed(d.seed) }).state, 3)).toBeNull();
    expect(earningsPlan(start('earn-live', liveSetup('small')), 3)).toBeNull();
  });

  it('预告 → 今天出 → 揭晓；揭晓读公开的涨跌，押对的标出来；全程不改局面', () => {
    let s = start('earn-b');
    const plan = earningsPlan(s, 3);
    expect(plan).not.toBeNull();
    const seen: string[] = [];
    for (let k = 0; k < 200 && s.dayIndex <= (plan?.day ?? 0) + 1 && s.phase !== 'won' && s.phase !== 'lost'; k++) {
      const before = JSON.stringify(s);
      const v = earningsView(s);
      expect(JSON.stringify(s)).toBe(before);
      if (v) {
        seen.push(v.stage);
        expect(v.bets.length).toBeGreaterThan(0);
        if (v.stage === 'done') {
          expect(v.move).toBe(s.stocks[plan?.stockId ?? '']?.move);
          expect(v.beat).toBe((v.move ?? 0) > 0);
          for (const b of v.bets) expect(b.right).toBe(b.up === v.beat);
        } else {
          expect(v.move).toBeUndefined();
          for (const b of v.bets) expect(b.right).toBeUndefined();
        }
      }
      s = step(s);
    }
    expect(seen[0]).toBe('soon');
    expect(seen).toContain('today');
    expect(seen.at(-1)).toBe('done');
  });

  it('同种子押注不变', () => {
    const a = start('earn-c');
    const b = start('earn-c');
    expect(earningsPlan(a, 6)).toEqual(earningsPlan(b, 6));
  });
});
