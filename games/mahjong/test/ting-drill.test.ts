import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { dailyOf, emptyTing, finishDaily, markSent, noteDaily, parseTing, settleDaily, startDaily, tingBoard, type TingData } from '../src/game/ting.ts';
import { shanten } from '../src/core/hand/index.ts';
import {
  COMBO_CAP,
  ROUND_SECONDS,
  TIERS,
  answer,
  judge,
  scoreOf,
  startRound,
  tingKey,
  tingQuestion,
  tingTier,
  tingWaits,
} from '../src/core/puzzles/ting.ts';

const keyOf = (n: number): number[] => tingKey(`2026-01-${String(n).padStart(2, '0')}`);

describe('出题', () => {
  test('同一个 key 出同一套题，题和题互不影响', () => {
    const a = Array.from({ length: 12 }, (_, i) => tingQuestion(keyOf(1), i));
    const b = Array.from({ length: 12 }, (_, i) => tingQuestion(keyOf(1), i));
    expect(a).toEqual(b);
    // 单独算第 2 题（不先算第 0、1、3 题）也一样
    expect(tingQuestion(keyOf(1), 2)).toEqual(a[2]);
    expect(tingQuestion(keyOf(2), 2)).not.toEqual(a[2]);
  });

  test('tingKey 只依赖日期字符串', () => {
    expect(tingKey('2026-10-31')).toEqual(tingKey('2026-10-31'));
    expect(tingKey('2026-10-31')).not.toEqual(tingKey('2026-11-01'));
    expect(tingKey('2026-10-31')).toHaveLength(8);
    expect(tingKey('2026-10-31')).not.toEqual(tingKey('2026-10-31').map((x) => x ^ 1));
  });

  test('每题：13 张同一门、每种不超过 4 张，听牌和 core/hand 的算法一致', () => {
    for (let n = 1; n <= 40; n++) {
      for (let i = 0; i < 20; i++) {
        const q = tingQuestion(keyOf(n), i);
        expect(q.hand).toHaveLength(13);
        expect(q.hand.every((k) => Math.floor(k / 9) === q.suit)).toBe(true);
        const cnt = new Map<number, number>();
        for (const k of q.hand) cnt.set(k, (cnt.get(k) ?? 0) + 1);
        expect([...cnt.values()].every((c) => c <= 4)).toBe(true);
        expect(q.hand).toEqual([...q.hand].sort((a, b) => a - b));
        expect(q.waits.length).toBeGreaterThanOrEqual(1);
        expect(q.waits).toEqual(tingWaits(q.hand));
        // 手里 4 张的那种不在听牌里
        for (const k of q.waits) expect(cnt.get(k) ?? 0).toBeLessThan(4);
        // 逐个核对：摸到听的牌就和了，摸到别的牌（这一门里）不和
        const counts = new Array<number>(34).fill(0);
        for (const k of q.hand) counts[k]!++;
        for (let r = 0; r < 9; r++) {
          const k = q.suit * 9 + r;
          if (counts[k]! >= 4) continue;
          counts[k]!++;
          expect(shanten(counts, 0, { seven: true, sevenQuads: true, kokushi: false }) === -1, `${q.hand} +${k}`).toBe(q.waits.includes(k));
          counts[k]!--;
        }
      }
    }
  });

  test('三门都会出', () => {
    const suits = new Set(Array.from({ length: 60 }, (_, i) => tingQuestion(keyOf(3), i).suit));
    expect(suits.size).toBe(3);
  });

  test('档位：第一档的前几题在范围内，后面各档大多数达标', () => {
    expect(tingTier(0).id).toBe(0);
    expect(tingTier(1).id).toBe(0);
    expect(tingTier(100).id).toBe(TIERS.length - 1);
    const total = new Map<number, number>();
    const good = new Map<number, number>();
    const seen = new Set<number>();
    for (let n = 0; n < 200; n++) {
      const key = tingKey(`k${n}`);
      for (let i = 0; i < 14; i++) {
        const t = tingTier(i);
        const q = tingQuestion(key, i);
        total.set(t.id, (total.get(t.id) ?? 0) + 1);
        if (q.waits.length >= t.min && q.waits.length <= t.max) good.set(t.id, (good.get(t.id) ?? 0) + 1);
        if (i < 2) expect(q.waits.length).toBeLessThanOrEqual(2);
        seen.add(q.waits.length);
      }
    }
    for (const t of TIERS) expect(good.get(t.id)! / total.get(t.id)!, `档 ${t.id}`).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(7);
  });
});

describe('判题和计分', () => {
  test('全对、漏选、多选、空选', () => {
    expect(judge([1, 4], [4, 1])).toEqual({ ok: true, hit: [1, 4], missed: [], wrong: [] });
    expect(judge([1, 4], [1])).toEqual({ ok: false, hit: [1], missed: [4], wrong: [] });
    expect(judge([1, 4], [1, 4, 5])).toEqual({ ok: false, hit: [1, 4], missed: [], wrong: [5] });
    expect(judge([1, 4], [2, 4])).toEqual({ ok: false, hit: [4], missed: [1], wrong: [2] });
    expect(judge([1, 4], [])).toEqual({ ok: false, hit: [], missed: [1, 4], wrong: [] });
  });

  test('计分公式：10 × 种数 + 5 × min(连对数, 6)，整数', () => {
    expect(scoreOf(1, 0)).toBe(10);
    expect(scoreOf(3, 2)).toBe(40);
    expect(scoreOf(5, COMBO_CAP)).toBe(80);
    expect(scoreOf(5, 50)).toBe(80);
    expect(Number.isInteger(scoreOf(9, 3))).toBe(true);
  });

  test('一轮累加：答对加分连击涨，答错清零，最长连对保留', () => {
    let s = startRound();
    const w = [2, 5];
    const r1 = answer(s, w, [5, 2]);
    expect(r1.gain).toBe(20);
    s = r1.state;
    const r2 = answer(s, w, [2, 5]);
    expect(r2.gain).toBe(25);
    s = r2.state;
    const r3 = answer(s, w, [2]);
    expect(r3.gain).toBe(0);
    s = r3.state;
    expect(s).toEqual({ score: 45, answered: 3, correct: 2, streak: 0, bestStreak: 2 });
    expect(answer(s, w, [2, 5]).gain).toBe(20);
    expect(ROUND_SECONDS).toBe(60);
  });
});

describe('架构', () => {
  test('核心文件不用时间和 Math.random', () => {
    const src = readFileSync(new URL('../src/core/puzzles/ting.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(/Math\.random|Date\.now|new Date|performance\.now/.test(src)).toBe(false);
  });

  test('arch 测试的纯净检查范围包含 src/core 下的新目录', () => {
    const arch = readFileSync(new URL('./arch.test.ts', import.meta.url), 'utf8');
    expect(arch).toContain("files(join(ROOT, 'core'))");
  });
});

describe('本机最好成绩', () => {
  test('坏数据当没有，未知字段原样保留，只在破纪录时改', async () => {
    const { emptyTing, parseTing, recordTing } = await import('../src/game/ting.ts');
    expect(parseTing(null)).toEqual(emptyTing());
    expect(parseTing('不是 json')).toEqual(emptyTing());
    expect(parseTing('{"best":-3}')).toEqual(emptyTing());
    expect(parseTing('{"best":12.5}')).toEqual(emptyTing());
    expect(parseTing('{"v":1,"best":120,"daily":{"x":1}}')).toEqual({ v: 1, best: 120 });
    const d = parseTing('{"best":100}');
    expect(recordTing(d, 100)).toEqual({ data: d, record: false });
    expect(recordTing(d, 0).record).toBe(false);
    expect(recordTing(d, 130)).toEqual({ data: { v: 1, best: 130 }, record: true });
    expect(recordTing(emptyTing(), 10).record).toBe(true);
  });
});

describe('今日一轮的记账', () => {
  const T = '2026-10-31';
  const fresh = (): TingData => emptyTing();

  test('开始就记一笔 0 分，已有今天的记录不能重来', () => {
    const a = startDaily(fresh(), T);
    expect(a.daily).toEqual({ date: T, score: 0, correct: 0, bestStreak: 0, done: false, sent: false });
    const b = noteDaily(a, T, { score: 40, correct: 3, bestStreak: 2 });
    expect(startDaily(b, T)).toBe(b);
  });

  test('每题更新；打完（done）后不再改', () => {
    let d = noteDaily(startDaily(fresh(), T), T, { score: 55, correct: 4, bestStreak: 3 });
    expect(d.daily).toMatchObject({ score: 55, correct: 4, bestStreak: 3, done: false });
    d = finishDaily(d, T);
    expect(d.daily!.done).toBe(true);
    expect(noteDaily(d, T, { score: 99, correct: 9, bestStreak: 9 })).toBe(d);
  });

  test('中途离开：下次按已得分结束并要交，最好成绩也记上', () => {
    const d = noteDaily(startDaily(fresh(), T), T, { score: 70, correct: 5, bestStreak: 4 });
    const r = settleDaily(d, T);
    expect(r.data.daily!.done).toBe(true);
    expect(r.data.best).toBe(70);
    expect(r.submit).toMatchObject({ date: T, score: 70 });
  });

  test('done 没 sent 要再交，sent 之后不交', () => {
    const d = finishDaily(noteDaily(startDaily(fresh(), T), T, { score: 30, correct: 2, bestStreak: 1 }), T);
    expect(settleDaily(d, T).submit).toMatchObject({ score: 30 });
    const sent = markSent(d, T);
    expect(sent.daily!.sent).toBe(true);
    expect(settleDaily(sent, T).submit).toBeNull();
  });

  test('日期变了丢掉旧记录，不补交', () => {
    const d = finishDaily(noteDaily(startDaily(fresh(), '2026-10-30'), '2026-10-30', { score: 30, correct: 2, bestStreak: 1 }), '2026-10-30');
    const r = settleDaily(d, T);
    expect(r.submit).toBeNull();
    expect(r.data.daily).toBeUndefined();
    expect(dailyOf(d, T)).toBeNull();
    expect(markSent(d, T)).toBe(d);
  });

  test('坏数据当没有，好数据原样读回', () => {
    expect(parseTing({ v: 1, best: 5, daily: { date: 'x', score: 1 } }).daily).toBeUndefined();
    expect(parseTing({ v: 1, best: 5, daily: { date: T, score: -1, correct: 0, bestStreak: 0, done: true, sent: false } }).daily).toBeUndefined();
    expect(parseTing('{坏').daily).toBeUndefined();
    const ok = noteDaily(startDaily(fresh(), T), T, { score: 12, correct: 1, bestStreak: 1 });
    expect(parseTing(JSON.stringify(ok))).toEqual(ok);
  });

  test('榜名格式、今日一轮的题与 tingKey(date) 一致', () => {
    expect(tingBoard(T)).toBe('daily-2026-10-31-ting');
    expect(tingQuestion(tingKey(T), 0).hand).toEqual(tingQuestion(tingKey(T), 0).hand);
    expect(tingQuestion(tingKey(T), 0).hand).not.toEqual(tingQuestion(tingKey('2026-11-01'), 0).hand);
  });

  test('daily.json 登记了 ting 榜', () => {
    const j = JSON.parse(readFileSync(new URL('../public/daily.json', import.meta.url), 'utf8'));
    expect(j.boards.ting.score[0].text).toBe('{n} 分');
  });
});
