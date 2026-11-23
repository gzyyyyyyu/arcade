import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  QUESTIONS,
  POINTS,
  emptyHekiri,
  evaluate,
  hekiriBoard,
  hekiriStreak,
  markOf,
  marksString,
  parseHekiri,
  puzzleFits,
  puzzlesOf,
  recordHekiri,
  scoreOf,
  type Puzzle,
} from '../src/game/hekiri.ts';
import { dayNo } from '../src/game/daily.ts';
import { hekiriCardOf } from '../src/view/share.ts';

/** "123m 456p" 之类的写法 → 牌种数组 */
function kinds(s: string): number[] {
  const out: number[] = [];
  for (const g of s.trim().split(/\s+/)) {
    const suit = 'mps'.indexOf(g.slice(-1));
    for (const d of g.slice(0, -1)) out.push(suit * 9 + Number(d) - 1);
  }
  return out;
}

const dates = (n: number, from = '2026-10-31'): string[] =>
  Array.from({ length: n }, (_, i) => new Date((dayNo(from) + i) * 86_400_000).toISOString().slice(0, 10));

describe('出题', () => {
  test('同一天出同样的五题，不同的天不同', () => {
    const a = puzzlesOf('2026-10-31');
    expect(a).toHaveLength(QUESTIONS);
    expect(JSON.stringify(puzzlesOf('2026-10-31'))).toBe(JSON.stringify(a));
    expect(JSON.stringify(puzzlesOf('2026-11-01'))).not.toBe(JSON.stringify(a));
  });

  test('连着 60 天的题都合格：14 张两门数牌、桌上的牌不超过四张、出题条件成立', () => {
    for (const d of dates(60)) {
      puzzlesOf(d).forEach((p, i) => {
        const ctx = `${d} 第 ${i + 1} 题`;
        expect(p.hand, ctx).toHaveLength(14);
        expect(new Set(p.hand.map((k) => (k / 9) | 0)).size, ctx).toBeLessThanOrEqual(2);
        expect(p.visible.length, ctx).toBeGreaterThanOrEqual(6);
        expect(p.visible.length, ctx).toBeLessThanOrEqual(10);
        for (let k = 0; k < 27; k++) {
          const n = p.hand.filter((x) => x === k).length + p.visible.filter((x) => x === k).length;
          expect(n, `${ctx} ${k}`).toBeLessThanOrEqual(4);
        }
        expect(puzzleFits(p, i), ctx).toBe(true);
        const list = evaluate(p);
        expect(list.length, ctx).toBeGreaterThanOrEqual(3);
        expect(list[0]!.shanten, ctx).toBeLessThanOrEqual(2);
        expect(list[0]!.ukeire, ctx).toBeGreaterThan(list[2]!.shanten === list[0]!.shanten ? list[2]!.ukeire : -1);
        // 有一个向听一样、进张更少的诱人错误选项
        expect(list.some((c) => c !== list[0] && c.shanten === list[0]!.shanten && c.ukeire < list[0]!.ukeire), ctx).toBe(true);
      });
    }
  });

  test('难度往上走：前两题一向听、后面有两向听', () => {
    const shantens = puzzlesOf('2026-10-31').map((p) => evaluate(p)[0]!.shanten);
    expect(shantens.slice(0, 2)).toEqual([1, 1]);
    expect(Math.max(...shantens)).toBe(2);
  });
});

describe('算牌效', () => {
  // 三组面子 + 12p + 55s + 9s：打掉孤张 9s 听 3p
  const p: Puzzle = { hand: kinds('123m 456m 789m 12p 55s 9s'), visible: kinds('3p 3p 9s') };

  test('打孤张 9s 听 3p，其余打法都拆了面子；桌上已经看见的扣掉', () => {
    const list = evaluate(p);
    expect(list[0]).toMatchObject({ kind: kinds('9s')[0], shanten: 0 });
    expect(list[0]!.kinds).toEqual(kinds('3p'));
    // 3p 手里没有，桌上两张 → 还剩 2 张
    expect(list[0]!.ukeire).toBe(2);
    expect(list.slice(1).every((c) => c.shanten > 0)).toBe(true);
    expect(scoreOf(p, kinds('9s')[0]!)).toBe(POINTS);
    expect(scoreOf(p, kinds('1p')[0]!)).toBe(0);
  });

  test('桌上多看见一张，进张就少一张；刚打出的这张也算看见', () => {
    const more = evaluate({ ...p, visible: [...p.visible, ...kinds('3p')] });
    expect(more[0]!.ukeire).toBe(1);
    // 孤张 9s 打出去以后它自己不再是进张，也不重复扣：桌上本来就有一张 9s，这里只看 9s 不在有效牌里
    expect(evaluate(p)[0]!.kinds).not.toContain(kinds('9s')[0]);
  });

  test('结果从好到差排序', () => {
    const list = evaluate(puzzlesOf('2026-10-31')[3]!);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]!;
      const b = list[i]!;
      expect(a.shanten < b.shanten || (a.shanten === b.shanten && a.ukeire >= b.ukeire)).toBe(true);
    }
  });
});

describe('打分', () => {
  test('最好的 20 分，同向听按进张比例，更差的向听 0 分', () => {
    for (const d of dates(10)) {
      for (const pz of puzzlesOf(d)) {
        const list = evaluate(pz);
        const best = list[0]!;
        let total = 0;
        for (const c of list) {
          const s = scoreOf(pz, c.kind, list);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(POINTS);
          if (c.shanten > best.shanten) expect(s).toBe(0);
          else if (c.ukeire >= best.ukeire) expect(s).toBe(POINTS);
          else expect(s).toBe(Math.round((POINTS * c.ukeire) / best.ukeire));
          total = Math.max(total, s);
        }
        expect(total).toBe(POINTS);
        // 手里没有的牌种不得分
        const missing = Array.from({ length: 27 }, (_, k) => k).find((k) => !pz.hand.includes(k))!;
        expect(scoreOf(pz, missing, list)).toBe(0);
      }
    }
  });

  test('一天最多 100 分；评价符号', () => {
    expect(QUESTIONS * POINTS).toBe(100);
    expect([20, 9, 0].map(markOf)).toEqual(['ok', 'near', 'bad']);
    expect(marksString([20, 9, 0, 20, 1])).toBe('onxon');
  });
});

describe('成绩和连续天数', () => {
  const day = [20, 20, 12, 0, 20];

  test('第一次做完记下；同一天再做是练习，不改任何东西', () => {
    const r = recordHekiri(emptyHekiri(), '2026-10-31', day);
    expect(r.first).toBe(true);
    expect(r.data).toMatchObject({ best: 72, last: '2026-10-31', run: 1 });
    expect(r.data.days['2026-10-31']).toEqual({ score: 72, marks: 'oonxo' });
    const again = recordHekiri(r.data, '2026-10-31', [20, 20, 20, 20, 20]);
    expect(again.first).toBe(false);
    expect(again.data).toBe(r.data);
  });

  test('连续：前一天 +1，隔天从 1 重来，补记旧日期不倒改；只留最近 7 天', () => {
    let d = emptyHekiri();
    for (const x of dates(9, '2026-10-20')) d = recordHekiri(d, x, day).data;
    expect(d.run).toBe(9);
    expect(Object.keys(d.days)).toHaveLength(7);
    expect(hekiriStreak(d, '2026-10-28')).toBe(9);
    expect(hekiriStreak(d, '2026-10-29')).toBe(9);
    expect(hekiriStreak(d, '2026-10-30')).toBe(0);
    const gap = recordHekiri(d, '2026-11-02', [0, 0, 0, 0, 0]).data;
    expect(gap.run).toBe(1);
    expect(gap.best).toBe(72);
    const old = recordHekiri(gap, '2026-10-10', day).data;
    expect(old.run).toBe(1);
    expect(old.last).toBe('2026-11-02');
  });

  test('坏数据当空；好数据读回来', () => {
    expect(parseHekiri('不是 JSON')).toEqual(emptyHekiri());
    expect(parseHekiri({ days: { '2026-10-31': { score: 999, marks: 'ooooo' } } }).days).toEqual({});
    expect(parseHekiri({ days: { '2026-10-31': { score: 50, marks: 'oo' } } }).days).toEqual({});
    const d = recordHekiri(emptyHekiri(), '2026-10-31', day).data;
    expect(parseHekiri(JSON.stringify(d))).toEqual(d);
  });

  test('榜名', () => {
    expect(hekiriBoard('2026-10-31')).toBe('daily-2026-10-31-hekiri');
  });
});

describe('架构', () => {
  test('出题是纯函数：不用 Math.random、Date.now、new Date 和依赖平台的数学函数，不碰画面和存储', () => {
    const src = readFileSync(new URL('../src/game/hekiri.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/Math\.(random|exp|log|pow|sin|cos|tan|sqrt)|Date\.now|new Date|performance\.now|localStorage|document\.|window\./.test(src)).toBe(false);
  });
});

describe('分享卡', () => {
  test('写日期、分数、五题符号、最好和连续；练习写明不计成绩；不含牌', () => {
    const c = hekiriCardOf('2026-10-31', 72, [20, 20, 12, 0, 20], true, 80, 3);
    expect(c.title).toBe('每日何切 · 2026-10-31');
    expect(c.big).toEqual({ value: '72 分', label: '满分 100 · 今日成绩' });
    expect(c.stats).toEqual([
      { label: '五题', value: '✓✓△✗✓' },
      { label: '最好', value: '80 分' },
      { label: '连续', value: '3 天' },
    ]);
    expect(hekiriCardOf('2026-10-31', 72, [20, 20, 12, 0, 20], false, 80, 3).big.label).toBe('练习 · 不计成绩');
  });
});
