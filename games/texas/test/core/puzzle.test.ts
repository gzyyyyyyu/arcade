/**
 * 每日牌局谜题（src/puzzle/，docs/features.md 13.11）：同一天同样的 5 道、不同天不同、每道题的答案经得起复算、计分封顶、本机进度读到坏数据不抛错。
 */
import { stream } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';
import { parseCards } from '../../src/core/cards.ts';
import { evalCards } from '../../src/core/eval.ts';
import { dateOfDay, dayNumber, prevDay } from '../../src/puzzle/date.ts';
import { combosWithout, exactEquity, sampleEquity } from '../../src/puzzle/equity.ts';
import { buildPuzzle, decide, MARGIN, PER_DAY, puzzlesFor, RAISE_EQ, TEMPLATES, templatesFor } from '../../src/puzzle/index.ts';
import { dayStatus, DAY_SIZE, emptySave, liveStreak, markSent, parseSave, record, type PuzzleSave } from '../../src/puzzle/progress.ts';
import { DAY_FULL, dayTotal, evs, puzzleBoardId, scoreOf } from '../../src/puzzle/score.ts';
import { chen } from '../../src/puzzle/spots.ts';
import { puzzleCard } from '../../src/view/share.ts';

const day = (n: number): string => dateOfDay(dayNumber('2026-01-01')! + n);
const YEAR = Array.from({ length: 365 }, (_, i) => day(i));
/** 一整年每天 5 道，算一次大家共用 */
const days = YEAR.map((d) => puzzlesFor(d));
const puzzles = days.flat();

describe('日期运算（规则核心不能碰 Date）', () => {
  it('天数和日期互相换算，闰年、月底、年底都对', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-10-30')! - dayNumber('2026-10-29')!).toBe(1);
    expect(dayNumber('2027-01-01')! - dayNumber('2026-01-01')!).toBe(365);
    expect(dayNumber('2028-03-01')! - dayNumber('2028-02-01')!).toBe(29);
    expect(prevDay('2026-03-01')).toBe('2026-02-28');
    expect(prevDay('2028-03-01')).toBe('2028-02-29');
    expect(prevDay('2026-01-01')).toBe('2025-12-31');
    for (let n = -800; n < 30000; n += 37) expect(dayNumber(dateOfDay(n))).toBe(n);
  });

  it('格式或日历不对给 null', () => {
    for (const bad of ['', '2026-2-3', '2026-02-30', '2026-13-01', '2026-00-10', 'abcd-ef-gh', '20261030', '2026-10-30 ']) expect(dayNumber(bad), bad).toBeNull();
  });
});

describe('赢面', () => {
  it('翻牌后穷举：对子对对子、河牌只剩输赢平', () => {
    const e = exactEquity(parseCards('As Ah'), parseCards('2c 7d 9h'), [parseCards('Kc Kd') as [number, number]]);
    expect(e).toBeGreaterThan(0.9);
    expect(e).toBeLessThan(0.93);
    const river = parseCards('2c 7d 9h Jc 3s');
    expect(exactEquity(parseCards('As Ah'), river, [parseCards('Kc Kd') as [number, number]])).toBe(1);
    expect(exactEquity(parseCards('Ks Qh'), river, [parseCards('Ac Ad') as [number, number]])).toBe(0);
    // 公共牌就是最大的牌：双方平分
    expect(exactEquity(parseCards('2s 3h'), parseCards('Ac Kc Qc Jc Tc'), [parseCards('4s 5h') as [number, number]])).toBe(0.5);
  });

  it('被我的牌挡住的组合不算', () => {
    const range = combosWithout([]);
    const all = exactEquity(parseCards('As Ah'), parseCards('2c 7d 9h Jc 3s'), range);
    const n = combosWithout(parseCards('As Ah 2c 7d 9h Jc 3s')).length;
    expect(n).toBe(990);
    expect(all).toBeGreaterThan(0.8);
  });

  it('翻牌前抽样：AA 对 KK 约 82%，同一种子同一结果', () => {
    const range = [parseCards('Kc Kd') as [number, number]];
    const a = sampleEquity(parseCards('As Ah'), range, stream([1, 2, 3, 4, 5, 6, 7, 8], 'puzzle', 0), 12_000);
    const b = sampleEquity(parseCards('As Ah'), range, stream([1, 2, 3, 4, 5, 6, 7, 8], 'puzzle', 0), 12_000);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0.8);
    expect(a).toBeLessThan(0.84);
  });

  it('陈氏分的几个已知值', () => {
    const c = (s: string): number => chen(...(parseCards(s) as [number, number]));
    expect(c('As Ah')).toBe(20);
    expect(c('As Ks')).toBe(12);
    expect(c('7s 2h')).toBe(-1);
    expect(c('Ts 9s')).toBe(8);
    expect(c('2s 2h')).toBe(5);
  });
});

describe('每天的题', () => {
  it('同一天同样的 5 道，哪次算都一样', () => {
    for (const d of YEAR.slice(0, 20)) expect(JSON.stringify(puzzlesFor(d))).toBe(JSON.stringify(puzzlesFor(d)));
    expect(days[0]).toHaveLength(PER_DAY);
  });

  it('每天 5 道互不重样（模板不同，手牌偶尔撞一手不算），三大类都有', () => {
    for (const [i, ps] of days.entries()) {
      expect(new Set(ps.map((p) => p.tpl)).size, YEAR[i]).toBe(PER_DAY);
      expect(new Set(ps.map((p) => p.kind)).size, YEAR[i]).toBe(3);
      expect(ps.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(ps.map((p) => p.hero.join(','))).size).toBeGreaterThanOrEqual(PER_DAY - 1);
    }
  });

  it('不同的天不同：一年 365 天的 5 道题不会整天重样', () => {
    const keys = new Set(days.map((ps) => ps.map((p) => `${p.tpl}|${p.hero.join(',')}|${p.board.join(',')}`).join(';')));
    expect(keys.size).toBe(365);
    expect(days[0]!.map((p) => p.hero)).not.toEqual(days[1]!.map((p) => p.hero));
  });

  it('模板轮着来：一整年每个模板都出，出得差不多一样多', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(20);
    const n = new Map<string, number>();
    for (const p of puzzles) n.set(p.tpl, (n.get(p.tpl) ?? 0) + 1);
    expect(n.size).toBe(TEMPLATES.length);
    const counts = [...n.values()];
    expect(Math.min(...counts)).toBeGreaterThan(40);
    expect(Math.max(...counts)).toBeLessThan(130);
    expect(templatesFor('2026-10-30')).toHaveLength(PER_DAY);
  });

  it('日期不对就抛错，不静默出一道乱题', () => {
    expect(() => puzzlesFor('2026-02-30')).toThrow();
    expect(() => puzzlesFor('')).toThrow();
  });

  it('每个模板在 20 个不同日子都能发出题（不靠顺延）', () => {
    for (const t of TEMPLATES) for (let i = 0; i < 20; i++) expect(buildPuzzle(t, day(i * 13), i % PER_DAY), `${t.id} ${day(i * 13)}`).not.toBeNull();
  }, 120_000);

  it('一年里的答案前后一致：没有平手和模糊局面，对错站得住', () => {
    const seen = new Set<string>();
    for (const p of puzzles) {
      seen.add(p.answer);
      const ids = p.choices.map((c) => c.id);
      expect(ids, p.date).toContain(p.answer);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids[0]).toBe('fold');
      const all = [...p.hero, ...p.board, ...p.sample.villain, ...p.sample.runout];
      expect(new Set(all).size, p.date).toBe(all.length);
      expect(p.hero).toHaveLength(2);
      expect(p.board.length + p.sample.runout.length).toBe(5);
      expect(p.board.length).toBe({ pre: 0, flop: 3, turn: 4, river: 5 }[p.stage]);
      expect(Math.abs(p.equity - p.need), `${p.date} ${p.tpl}`).toBeGreaterThanOrEqual(Math.round(MARGIN * 100) - 1);
      expect(p.equity).not.toBe(p.need);
      if (p.answer === 'fold') expect(p.equity).toBeLessThan(p.need);
      else expect(p.equity).toBeGreaterThan(p.need);
      if (p.answer === 'raise') {
        expect(p.allIn).toBe(false);
        expect(p.equity).toBeGreaterThanOrEqual(Math.round((RAISE_EQ + MARGIN) * 100) - 1);
      } else if (p.choices.some((c) => c.id === 'raise') && p.answer === 'call') expect(p.equity).toBeLessThanOrEqual(Math.round((RAISE_EQ - MARGIN) * 100) + 1);
      if (p.allIn) expect(ids).not.toContain('raise');
      if (p.stage !== 'pre') expect(p.need).toBe(Math.round((100 * p.call) / (p.pot + p.call)));
      expect(p.why.length).toBeGreaterThan(10);
      expect(p.why).toContain(`${p.equity}%`);
    }
    for (const a of ['fold', 'call', 'raise', 'shove']) expect(seen.has(a), a).toBe(true);
    const n = (a: string): number => puzzles.filter((p) => p.answer === a).length;
    expect(n('fold')).toBeGreaterThan(300);
    expect(n('call')).toBeGreaterThan(300);
  }, 120_000);

  it('抽一次看看的输赢和牌面对得上（只是演示，不参与对错）', () => {
    for (const p of puzzles) {
      const full = [...p.board, ...p.sample.runout];
      const mine = evalCards([...p.hero, ...full]);
      const his = evalCards([...p.sample.villain, ...full]);
      expect(p.sample.result, p.date).toBe(mine > his ? 'win' : mine < his ? 'lose' : 'tie');
    }
  });

  it('decide 的边界：差不到 MARGIN 是模糊，全下没有加注，推牌叫全下', () => {
    expect(decide(0.3, 0.3, true, false)).toBeNull();
    expect(decide(0.3 + MARGIN - 0.001, 0.3, true, false)).toBeNull();
    expect(decide(0.3 - MARGIN, 0.3, true, false)).toBe('fold');
    expect(decide(0.4, 0.3, true, false)).toBe('call');
    expect(decide(0.9, 0.3, true, false)).toBe('raise');
    expect(decide(0.9, 0.3, false, false)).toBe('call');
    expect(decide(RAISE_EQ, 0.3, true, false)).toBeNull();
    expect(decide(0.5, 0.3, false, true)).toBe('shove');
    expect(decide(0.2, 0.3, false, true)).toBe('fold');
  });
});

describe('计分（整数，每道 100，一天 500）', () => {
  it('最优答案 100 分，其余按 EV 亏损给部分分，范围 0–99；最优确实是 EV 最大的', () => {
    for (const p of puzzles) {
      const ev = evs(p);
      const best = Math.max(...Object.values(ev));
      expect(ev[p.answer], `${p.date} ${p.tpl}`).toBe(best);
      expect(scoreOf(p, p.answer)).toBe(100);
      for (const c of p.choices) {
        const s = scoreOf(p, c.id);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
        if (c.id !== p.answer) expect(s, `${p.date} ${p.tpl} ${c.id}`).toBeLessThan(100);
      }
      expect(scoreOf(p, '不是选项')).toBe(0);
    }
  });

  it('差得多的选错接近 0 分：赢面和要的差 20 个点以上，弃牌和跟注选反了都不到 20 分', () => {
    const wide = puzzles.filter((p) => Math.abs(p.equity - p.need) >= 20 && p.answer !== 'raise');
    expect(wide.length).toBeGreaterThan(300);
    for (const p of wide) {
      const wrong = p.answer === 'fold' ? p.choices.find((c) => c.id === 'call' || c.id === 'shove')!.id : 'fold';
      expect(scoreOf(p, wrong), `${p.date} ${p.tpl}`).toBeLessThanOrEqual(20);
    }
    // 刚好够出题的差距（4 个点）选错还剩大半分
    const edge = { equity: 34, need: 30, scale: 0.12, choices: [{ id: 'fold', label: '' }, { id: 'call', label: '' }] };
    expect(scoreOf(edge as never, 'fold')).toBe(67);
  });

  it('365 天复算：每天总分 0–500，全对 500；一律弃牌、一律跟注都拿不到高分', () => {
    const fold: number[] = [];
    const go: number[] = [];
    for (const ps of days) {
      expect(dayTotal(ps.map((p) => scoreOf(p, p.answer)))).toBe(DAY_FULL);
      const f = dayTotal(ps.map((p) => scoreOf(p, 'fold')));
      const g = dayTotal(ps.map((p) => scoreOf(p, p.choices.find((c) => c.id === 'call' || c.id === 'shove')!.id)));
      for (const t of [f, g]) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(DAY_FULL);
      }
      fold.push(f);
      go.push(g);
    }
    const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    const p90 = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.9)]!;
    expect(avg(fold)).toBeLessThanOrEqual(310);
    expect(p90(fold)).toBeLessThanOrEqual(450);
    expect(avg(go)).toBeLessThanOrEqual(380);
    expect(p90(go)).toBeLessThanOrEqual(470);
    // 会算的人明显更高：满分比最强的死板打法的平均高出一大截
    expect(DAY_FULL - Math.max(avg(fold), avg(go))).toBeGreaterThanOrEqual(100);
  });

  it('榜名带北京日期', () => {
    expect(puzzleBoardId('2026-10-31')).toBe('daily-2026-10-31-puzzle');
  });
});

describe('本机进度', () => {
  const D = '2026-10-30';
  const answerAll = (s: PuzzleSave, date: string, n = DAY_SIZE): PuzzleSave => {
    let x = s;
    for (let i = 0; i < n; i++) x = record(x, date, 'call', 80);
    return x;
  };

  it('读到坏数据不抛错，旧版存档丢掉，丢掉查不过的字段', () => {
    for (const bad of [null, undefined, 1, 'x', [], [1], true, { days: 5 }, { v: 2, days: [] }, { v: 1, days: { '2026-10-30': { pick: 'call', ok: true } }, streak: 3, right: 3, total: 3, last: '2026-10-30' }, { v: 2, streak: -1, done: 'a', last: 7 }]) {
      const s = parseSave(bad);
      expect(s.v).toBe(2);
      expect(s.streak).toBe(0);
      expect(s.done).toBe(0);
      expect(s.last).toBeNull();
      expect(Object.keys(s.days)).toHaveLength(0);
    }
    const s = parseSave({
      v: 2,
      days: {
        '2026-10-29': { picks: ['call', 'fold', 'raise', 'shove', 'call', 'extra'], scores: [100, 0, 50, 80, 100, 100], sent: true },
        '2026-10-30': { picks: ['call', 'hack', 'fold'], scores: [100, 100, 100], sent: true },
        '2026-10-28': { picks: ['call', 'fold'], scores: [100, 1.5] },
        '2026-13-01': { picks: ['fold'], scores: [0] },
        '2026-10-27': { picks: ['fold'] },
      },
      streak: 9,
      best: 2,
      done: 3,
      last: '2026-10-29',
    });
    expect(Object.keys(s.days).sort()).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
    expect(s.days['2026-10-29']).toEqual({ picks: ['call', 'fold', 'raise', 'shove', 'call'], scores: [100, 0, 50, 80, 100], sent: true });
    expect(s.days['2026-10-30']!.picks).toEqual(['call']);
    expect(s.days['2026-10-30']!.sent).toBeNull();
    expect(s.days['2026-10-28']!.picks).toEqual(['call']);
    expect(s.streak).toBe(3);
    expect(s.done).toBe(3);
  });

  it('按顺序答，每道一次；5 道答完才算完成，连续天数累计、隔天断', () => {
    let s = emptySave();
    s = record(s, '2026-10-28', 'call', 100);
    expect(dayStatus(s, '2026-10-28')).toEqual({ answered: 1, total: 100, complete: false });
    expect(s.done).toBe(0);
    s = answerAll(s, '2026-10-28', 4);
    expect(dayStatus(s, '2026-10-28')).toMatchObject({ answered: 5, complete: true });
    expect(s).toMatchObject({ streak: 1, done: 1, last: '2026-10-28' });
    // 答完以后再答不算
    expect(record(s, '2026-10-28', 'fold', 100)).toBe(s);
    s = answerAll(s, '2026-10-29');
    expect(s.streak).toBe(2);
    expect(liveStreak(s, '2026-10-30')).toBe(2);
    expect(liveStreak(s, '2026-11-01')).toBe(0);
    s = answerAll(s, '2026-11-02');
    expect(s).toMatchObject({ streak: 1, best: 2, done: 3, last: '2026-11-02' });
    expect(record(s, '不是日期', 'call', 1)).toBe(s);
    expect(record(s, '2026-11-03', 'bogus', 1)).toBe(s);
    expect(parseSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('答到一半的天不算完成，接着答下一道；分数夹在 0–100', () => {
    let s = record(emptySave(), D, 'call', 250);
    s = record(s, D, 'fold', -5);
    expect(s.days[D]!.scores).toEqual([100, 0]);
    expect(s.done).toBe(0);
    expect(s.last).toBeNull();
    expect(liveStreak(s, D)).toBe(0);
  });

  it('交榜结果只在答完后记，且一天只交一次（记下的结果会存下来）', () => {
    let s = answerAll(emptySave(), D, 3);
    expect(markSent(s, D, true)).toBe(s);
    s = answerAll(s, D);
    expect(s.days[D]!.sent).toBeNull();
    s = markSent(s, D, false);
    expect(s.days[D]!.sent).toBe(false);
    s = markSent(s, D, true);
    expect(parseSave(JSON.parse(JSON.stringify(s))).days[D]!.sent).toBe(true);
    expect(markSent(s, '2026-01-01', true)).toBe(s);
  });

  it('只留最近 60 天的记录', () => {
    let s = emptySave();
    for (let i = 0; i < 100; i++) s = answerAll(s, day(i));
    expect(Object.keys(s.days)).toHaveLength(60);
    expect(s.done).toBe(100);
    expect(s.streak).toBe(100);
    expect(s.days[day(99)]).toBeDefined();
    expect(s.days[day(0)]).toBeUndefined();
  });
});

describe('分享卡', () => {
  it('只放总分、答对几道、连续天数和每道对错，不画牌、不放题目', () => {
    const c = puzzleCard(420, [true, true, false, true, true], 3, '10月30日');
    expect(c.big).toEqual({ value: '420 分', label: '5 道题，满分 500' });
    expect(c.stats).toEqual([
      { label: '答对', value: '4 / 5' },
      { label: '连续完成', value: '3 天' },
    ]);
    expect(c.line).toBe('每道对错：对 对 错 对 对');
    expect(c.art).toBeUndefined();
    expect(puzzleCard(0, [false, false, false, false, false], 1, '10月30日').stats).toEqual([{ label: '答对', value: '0 / 5' }]);
  });
});
