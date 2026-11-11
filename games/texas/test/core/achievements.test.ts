/** 成就（src/achievements.ts）：每一类的判定、重复不给、坏存档整理 */
import { describe, expect, it } from 'vitest';
import { DEFS, emptyAch, noteHandAch, noteTour, parseAch, PERSONA_NAMES, progressOf, riverBluffWin, type AchState, type HandFacts } from '../../src/achievements.ts';
import { parseCards } from '../../src/core/cards.ts';
import { evalCards } from '../../src/core/eval.ts';
import { PERSONAS } from '../../src/ai/personas.ts';
import type { HandResult, LogEntry } from '../../src/core/table.ts';

const e = (seat: number, act: LogEntry['act'], amount = 0, allin = false): LogEntry => ({ seat, act, amount, ...(allin ? { allin: true as const } : {}) });
const MK = (board: string) => (seat: number, hole: string) => {
  const h = parseCards(hole);
  return { seat, hole: h, value: evalCards([...h, ...parseCards(board)]) };
};

function facts(over: Partial<HandFacts> & { r: HandResult }): HandFacts {
  return { log: [e(0, 'sb', 10), e(1, 'bb', 20), e(0, 'call', 10)], me: 0, hole: [], endStack: 1000, base: 1000, personaAt: () => -1, ...over };
}
const res = (board: string, shown: ReturnType<ReturnType<typeof MK>>[], winner: number, over: Partial<HandResult> = {}): HandResult => ({
  handNo: 1,
  board: parseCards(board),
  shown,
  pots: [{ amount: 400, winners: [{ seat: winner, won: 400 }] }],
  uncalled: null,
  byFold: false,
  ...over,
});
const ids = (x: { fresh: string[] }) => x.fresh;

describe('成就', () => {
  it('名字和电脑性格对得上，id 不重复', () => {
    expect(PERSONA_NAMES).toEqual(PERSONAS.map((p) => p.name));
    expect(new Set(DEFS.map((d) => d.id)).size).toBe(DEFS.length);
    expect(DEFS.length).toBeGreaterThanOrEqual(20);
    expect(DEFS.length).toBeLessThanOrEqual(30);
  });

  it('第一次赢 + 同花；再赢不重复给', () => {
    const board = '2h 7h Kh 9c 3d';
    const mk = MK(board);
    const r = res(board, [mk(0, 'Ah 5h'), mk(1, 'Ad Ac')], 0);
    const a = noteHandAch(emptyAch(), facts({ r }));
    expect(ids(a)).toEqual(expect.arrayContaining(['first_win', 'cat_flush']));
    expect(a.state.hands).toBe(1);
    expect(a.state.streak).toBe(1);
    expect(ids(noteHandAch(a.state, facts({ r })))).toEqual([]);
  });

  it('没发到牌（log 里没有我）不算', () => {
    const r = res('2h 7h Kh 9c 3d', [], 1, { byFold: true });
    const s = emptyAch();
    expect(noteHandAch(s, facts({ r, log: [e(1, 'sb', 10), e(2, 'bb', 20)] }))).toEqual({ state: s, fresh: [] });
  });

  it('输了不给牌型成就，连胜归零', () => {
    const board = '2h 7h Kh 9c 3d';
    const mk = MK(board);
    const r = res(board, [mk(0, 'Ah 5h'), mk(1, 'Ad Ac')], 1);
    const s: AchState = { ...emptyAch(), streak: 2 };
    const a = noteHandAch(s, facts({ r }));
    expect(a.fresh).toEqual([]);
    expect(a.state.streak).toBe(0);
  });

  it('葫芦、四条、同花顺、皇家同花顺', () => {
    const cases: [string, string, string][] = [
      ['2h 2d 9c 9s 3d', 'Ah 2c', 'cat_full'],
      ['2h 2d 9c 9s 3d', '2c 2s', 'cat_quads'],
      ['2h 3h 4h Kc Kd', '5h 6h', 'cat_sf'],
      ['Th Jh Qh Kc 2d', 'Ah Kh', 'cat_royal'],
    ];
    for (const [board, hole, id] of cases) {
      const mk = MK(board);
      const r = res(board, [mk(0, hole), mk(1, '3c 4s')], 0);
      const got = ids(noteHandAch(emptyAch(), facts({ r })));
      expect(got, id).toContain(id);
      // 同花顺和皇家互斥
      if (id === 'cat_sf') expect(got).not.toContain('cat_royal');
      if (id === 'cat_royal') expect(got).not.toContain('cat_sf');
    }
  });

  it('A 到 5 的同花顺不是皇家', () => {
    const board = '2h 3h 4h Kc Kd';
    const mk = MK(board);
    const r = res(board, [mk(0, 'Ah 5h'), mk(1, '3c 4s')], 0);
    expect(ids(noteHandAch(emptyAch(), facts({ r })))).toContain('cat_sf');
  });

  it('三人以上全下并赢主池；两人全下、盲注全下不算', () => {
    const board = '2h 7d Kc 9s 3d';
    const mk = MK(board);
    const r = res(board, [mk(0, 'Ah Ad'), mk(1, 'Qc Qd'), mk(2, 'Jc Jd')], 0);
    const three = [e(0, 'raise', 500, true), e(1, 'call', 500, true), e(2, 'call', 300, true)];
    expect(ids(noteHandAch(emptyAch(), facts({ r, log: three })))).toContain('allin3');
    expect(ids(noteHandAch(emptyAch(), facts({ r, log: three.slice(0, 2) })))).not.toContain('allin3');
    const blind = [e(0, 'sb', 10, true), e(1, 'bb', 20, true), e(2, 'call', 20, true)];
    expect(ids(noteHandAch(emptyAch(), facts({ r, log: blind })))).not.toContain('allin3');
    // 三人全下但我输了
    const lost = res(board, [mk(0, 'Ah Ad'), mk(1, 'Qc Qd'), mk(2, 'Jc Jd')], 1);
    expect(ids(noteHandAch(emptyAch(), facts({ r: lost, log: three })))).not.toContain('allin3');
  });

  describe('河牌诈唬', () => {
    const board = '2h 7d Kc 9s 3d';
    const log = [e(0, 'sb', 10), e(1, 'bb', 20), e(-1, 'flop'), e(-1, 'turn'), e(-1, 'river'), e(0, 'bet', 100), e(1, 'fold')];
    const r = res(board, [], 0, { byFold: true });
    it('河牌下注、牌没靠底牌、对手全弃：算', () => {
      const f = facts({ r, log, hole: parseCards('Jc 4s') });
      expect(riverBluffWin(f)).toBe(true);
      const a = noteHandAch(emptyAch(), f);
      expect(ids(a)).toEqual(expect.arrayContaining(['bluff_1']));
      expect(a.state.bluffs).toBe(1);
    });
    it('有一对（靠底牌）不算', () => {
      expect(riverBluffWin(facts({ r, log, hole: parseCards('Kd 4s') }))).toBe(false);
    });
    it('一对在公共牌上（底牌没用）还算', () => {
      const b2 = '7h 7d Kc 9s 3d';
      expect(riverBluffWin(facts({ r: res(b2, [], 0, { byFold: true }), log, hole: parseCards('Jc 4s') }))).toBe(true);
    });
    it('没在河牌下注、或者没赢、或者摊牌了：不算', () => {
      const early = [e(0, 'bet', 100), e(-1, 'flop'), e(-1, 'turn'), e(-1, 'river'), e(1, 'fold')];
      expect(riverBluffWin(facts({ r, log: early, hole: parseCards('Jc 4s') }))).toBe(false);
      expect(riverBluffWin(facts({ r: res(board, [], 1, { byFold: true }), log, hole: parseCards('Jc 4s') }))).toBe(false);
      expect(riverBluffWin(facts({ r: { ...r, byFold: false }, log, hole: parseCards('Jc 4s') }))).toBe(false);
      expect(riverBluffWin(facts({ r, log, hole: [] }))).toBe(false);
    });
    it('累计 10 次拿影帝', () => {
      const s: AchState = { ...emptyAch(), bluffs: 9, got: ['bluff_1'] };
      const a = noteHandAch(s, facts({ r, log, hole: parseCards('Jc 4s') }));
      expect(ids(a)).toContain('bluff_10');
    });
  });

  it('摊牌赢过电脑：记性格，十个都赢过拿霸主；平局/输的不记', () => {
    const board = '2h 7d Kc 9s 3d';
    const mk = MK(board);
    const r = res(board, [mk(0, 'Ah Ad'), mk(1, 'Qc Qd')], 0);
    const a = noteHandAch(emptyAch(), facts({ r, personaAt: (i) => (i === 1 ? 4 : -1) }));
    expect(ids(a)).toContain('beat_4');
    expect(a.state.beat).toEqual([4]);
    // 我输了：不记
    const lost = res(board, [mk(0, 'Qc Qd'), mk(1, 'Ah Ad')], 1);
    expect(noteHandAch(emptyAch(), facts({ r: lost, personaAt: () => 4 })).state.beat).toEqual([]);
    // 对手没亮牌（弃了）：不记
    const fold = res(board, [], 0, { byFold: true });
    expect(noteHandAch(emptyAch(), facts({ r: fold, personaAt: () => 4 })).state.beat).toEqual([]);
    // 只差一个
    const near: AchState = { ...emptyAch(), beat: [0, 1, 2, 3, 4, 5, 6, 7, 8] };
    const last = noteHandAch(near, facts({ r, personaAt: (i) => (i === 1 ? 9 : -1) }));
    expect(ids(last)).toEqual(expect.arrayContaining(['beat_9', 'beat_all']));
  });

  it('连胜：3、5、8；弃牌（没拿到池子）归零', () => {
    const board = '2h 7d Kc 9s 3d';
    const mk = MK(board);
    const win = facts({ r: res(board, [mk(0, 'Ah Ad'), mk(1, 'Qc Qd')], 0) });
    let s = emptyAch();
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = noteHandAch(s, win);
      s = a.state;
      seen.push(...a.fresh);
    }
    expect(seen).toEqual(expect.arrayContaining(['streak_3', 'streak_5', 'streak_8']));
    const lose = facts({ r: res(board, [], 1, { byFold: true }), log: [e(0, 'sb', 10), e(1, 'bb', 20), e(0, 'fold')] });
    expect(noteHandAch(s, lose).state.streak).toBe(0);
  });

  it('手数里程碑', () => {
    const r = res('2h 7d Kc 9s 3d', [], 1, { byFold: true });
    const s: AchState = { ...emptyAch(), hands: 99 };
    const a = noteHandAch(s, facts({ r }));
    expect(ids(a)).toContain('hands_100');
    expect(progressOf(a.state, DEFS.find((d) => d.id === 'hands_500')!)).toBe(100);
  });

  it('绝地反击：开局筹码不到一成还赢；一成以上、输了、没有筹码都不算', () => {
    const board = '2h 7d Kc 9s 3d';
    const mk = MK(board);
    const r = res(board, [mk(0, 'Ah Ad'), mk(1, 'Qc Qd')], 0);
    // 投了 40（sb 10 + call 10 → 其实记录里是 20；用 invested 的口径）：end − won + invested
    const log = [e(0, 'sb', 10), e(1, 'bb', 20), e(0, 'call', 10)];
    // 开局 = endStack − 400 + 20 = 60 < 100：算
    expect(ids(noteHandAch(emptyAch(), facts({ r, log, endStack: 440, base: 1000 })))).toContain('comeback');
    // 开局 = 140：不算
    expect(ids(noteHandAch(emptyAch(), facts({ r, log, endStack: 520, base: 1000 })))).not.toContain('comeback');
    const lost = res(board, [mk(0, 'Qc Qd'), mk(1, 'Ah Ad')], 1);
    expect(ids(noteHandAch(emptyAch(), facts({ r: lost, log, endStack: 40, base: 1000 })))).not.toContain('comeback');
  });

  it('锦标赛：打完、前三、冠军', () => {
    expect(ids(noteTour(emptyAch(), 5))).toEqual(['tour_play']);
    expect(ids(noteTour(emptyAch(), 3))).toEqual(['tour_play', 'tour_top3']);
    expect(ids(noteTour(emptyAch(), 1))).toEqual(['tour_play', 'tour_top3', 'tour_win']);
    const s = noteTour(emptyAch(), 1).state;
    expect(noteTour(s, 1).fresh).toEqual([]);
  });

  it('读存档：坏的当没有，多余的 id 和越界性格丢掉', () => {
    expect(parseAch(null)).toEqual(emptyAch());
    expect(parseAch({ v: 2 })).toEqual(emptyAch());
    const s = parseAch({ v: 1, got: ['first_win', 'nope', 'first_win', 3], hands: -5, streak: 2.5, bluffs: 4, beat: [1, 1, 99, -1, 'x'] });
    expect(s).toEqual({ v: 1, got: ['first_win'], hands: 0, streak: 0, bluffs: 4, beat: [1] });
  });
});
