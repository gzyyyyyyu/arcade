import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_WIN_BASE, dailyScore, dailyScoreView, flashScore } from '../../src/core/index.ts';

/**
 * public/daily.json：平台的每日榜怎么显示开盘的分数（平台起不再写死开盘的规则，照 titles.json 的路子读这个文件）。
 * 每日榜按子榜分：boards.classic 是经典每日挑战，boards.flash 是闪电盘，和 daily-日期-<子榜> 的榜名一一对应。
 * 平台的规则：score 从上往下取第一条能用的；没写 from 的总能用，写了 from 的要分数 ≥ from；
 * {n} = 分数 − from（没 from 就是分数本身），按千分位显示。note 可选 ≤ 80 字，text ≤ 30 字，文件 ≤ 32 KB。
 */
interface Board {
  note?: string;
  score: { from?: number; text: string }[];
}
interface DailyJson {
  boards: Record<string, Board>;
}

const raw = readFileSync('public/daily.json', 'utf8');
const json = JSON.parse(raw) as DailyJson;

/** 照平台的规则显示一个分数 */
function show(board: Board, score: number): string | null {
  const rule = board.score.find((r) => r.from === undefined || score >= r.from);
  if (!rule) return null;
  const n = score - (rule.from ?? 0);
  return rule.text.replace('{n}', String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}

const classic = json.boards.classic as Board;
const flash = json.boards.flash as Board;

describe('public/daily.json（每日榜的分数怎么显示）', () => {
  it('两个子榜，格式和大小合平台的限制', () => {
    expect(Object.keys(json.boards).sort()).toEqual(['classic', 'flash']);
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(32 * 1024);
    for (const b of [classic, flash]) {
      expect(b.note === undefined || Array.from(b.note).length <= 80).toBe(true);
      expect(b.score.length).toBeGreaterThan(0);
      for (const r of b.score) {
        expect(Array.from(r.text).length).toBeLessThanOrEqual(30);
        expect(r.from === undefined || Number.isSafeInteger(r.from)).toBe(true);
      }
      // 最后一条不带 from，什么分数都有得显示
      expect(b.score.at(-1)?.from).toBeUndefined();
    }
  });

  it('经典：和开盘的分数编码一致：通关 = 1e11 + 账户元数，没通关 = 还上了几个月', () => {
    expect(classic.score[0]?.from).toBe(DAILY_WIN_BASE);
    expect(show(classic, dailyScore(true, 88_000, 12))).toBe('通关 · ¥88,000');
    expect(show(classic, dailyScore(true, 54_687_100, 12))).toBe('通关 · ¥54,687,100');
    expect(show(classic, dailyScore(true, 0, 12))).toBe('通关 · ¥0');
    expect(show(classic, dailyScore(false, 0, 7))).toBe('还清 7 个月');
    expect(show(classic, dailyScore(false, 0, 0))).toBe('还清 0 个月');
    expect(show(classic, dailyScore(false, 0, 12))).toBe('还清 12 个月');
  });

  it('经典：显示出来的数和游戏自己还原的一致', () => {
    for (const score of [0, 5, 12, DAILY_WIN_BASE, DAILY_WIN_BASE + 1_234_567]) {
      const v = dailyScoreView(score);
      expect(show(classic, score)).toBe(v.won ? `通关 · ¥${v.account.toLocaleString('en-US')}` : `还清 ${v.months} 个月`);
    }
  });

  it('闪电盘：分数就是最后的资产（元，取整）', () => {
    expect(flash.score).toEqual([{ text: '¥{n}' }]);
    expect(show(flash, flashScore({ account: 123_456.4 }))).toBe('¥123,456');
    expect(show(flash, flashScore({ account: 0 }))).toBe('¥0');
    expect(show(flash, flashScore({ account: 54_687_100.6 }))).toBe('¥54,687,101');
  });
});
