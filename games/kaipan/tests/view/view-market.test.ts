import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRun, dispatch, stockById, type GameState, type Segment } from '../../src/core/index.ts';
import { SENTIMENT_WORDS, sectorMoves, sentimentOf } from '../../src/view/trade/tape.ts';

/** 大盘屏右边三行：情绪五档、昨天领涨 / 领跌的板块，只读已收盘的那一天。 */
const index = JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')) as { segments: { file: string }[] };
const seg = (i: number): Segment => JSON.parse(readFileSync(`public/data/segments/${index.segments[i]?.file}`, 'utf8')) as Segment;
const themeOf = (id: string) => stockById(id).theme;

function days(s: GameState, n: number): GameState {
  let cur = s;
  for (let d = 0; d < n; ) {
    if (cur.phase === 'won' || cur.phase === 'lost') break;
    if (cur.phase !== 'premarket') {
      cur = dispatch(cur, cur.phase === 'event' ? { type: 'choose', option: 0 } : { type: 'skipReward' }).state;
      continue;
    }
    cur = dispatch(cur, { type: 'open' }).state;
    d++;
  }
  return cur;
}

describe('大盘情绪和板块涨跌榜', () => {
  it('开盘前：情绪看开局前的大环境、没有涨跌停；板块榜为空', () => {
    const s = createRun('mkt-0', null, { segment: seg(0) }).state;
    const senti = sentimentOf(s);
    expect(senti === null || (senti.ups === 0 && senti.downs === 0)).toBe(true);
    expect(sectorMoves(s, themeOf)).toEqual([]);
  });

  it('收盘后：涨停跌停家数和那天的结算一致；板块按平均涨跌从高到低，五档都会出现', () => {
    const seen = new Set<number>();
    for (let k = 0; k < 6; k++) {
      let s = createRun(`mkt-${k}`, null, { segment: seg(k * 7) }).state;
      for (let d = 0; d < 30; d++) {
        s = days(s, 1);
        const last = s.lastDay;
        if (!last) continue;
        const senti = sentimentOf(s);
        expect(senti).not.toBeNull();
        if (!senti) continue;
        seen.add(senti.level);
        expect(senti.level).toBeGreaterThanOrEqual(0);
        expect(senti.level).toBeLessThan(SENTIMENT_WORDS.length);
        expect(senti.ups).toBe(last.stocks.filter((m) => m.limitUp).length);
        expect(senti.downs).toBe(last.stocks.filter((m) => m.limitDown && !m.limitUp).length);
        const secs = sectorMoves(s, themeOf);
        expect(secs.length).toBeGreaterThan(1);
        for (let i = 1; i < secs.length; i++) expect(secs[i - 1]!.move).toBeGreaterThanOrEqual(secs[i]!.move);
        const top = secs[0]!;
        const own = last.stocks.filter((m) => themeOf(m.id) === top.id);
        expect(top.move).toBeCloseTo(own.reduce((a, m) => a + m.move, 0) / own.length, 6);
      }
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
