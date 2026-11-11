/**
 * 掼蛋每日挑战（src/view/guandan/daily.ts）：种子只看日期、榜名、8 副后结束、分数累计、交分请求体、daily.json 有 gd 子榜。
 * 不起浏览器：假的 fetch。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decide } from '../../src/variants/guandan/ai/index.ts';
import { seatsToAct, viewFor, type DealResult } from '../../src/variants/guandan/core/index.ts';
import { dealPoints } from '../../src/variants/guandan/stake/index.ts';
import { DailySession, GD_DAILY_DEALS, GD_DAILY_LEVEL, dailyAddDeal, dailyOver, dailyPoints, gdDailyBoard, gdDailySeed, submitGdDaily } from '../../src/view/guandan/daily.ts';

type Call = { url: string; body: unknown };

function fake(): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === '/api/me') return new Response(JSON.stringify({ user: { id: 'u1' } }), { status: 200 });
    return new Response(JSON.stringify({ best: 7, improved: true }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

function playOut(ses: DailySession): void {
  for (let guard = 0; guard < 60_000 && !ses.over; guard++) {
    const s = ses.state;
    if (s.phase === 'dealEnd') {
      ses.apply({ type: 'nextDeal' });
      continue;
    }
    const seat = seatsToAct(s)[0]!;
    expect(ses.apply(decide(viewFor(s, seat), { seed: 'x', difficulty: 'easy' })!).error).toBeNull();
  }
}

/** 只用到 dealNo、order 的假结果：order[0] 是头游，搭档的名次决定分 */
function deal(dealNo: number, order: number[]): DealResult {
  return { dealNo, order } as unknown as DealResult;
}

describe('掼蛋每日挑战', () => {
  it('种子只看日期，榜名带子榜 gd', () => {
    expect(gdDailySeed('2026-10-26')).toBe(gdDailySeed('2026-10-26'));
    expect(gdDailySeed('2026-10-26')).not.toBe(gdDailySeed('2026-10-27'));
    expect(gdDailyBoard('2026-10-26')).toBe('daily-2026-10-26-gd');
  });

  it('同一天开两次，发的牌一样；电脑是普通难度，不存档不计战绩', () => {
    const a = DailySession.start('2026-10-26');
    const b = DailySession.start('2026-10-26');
    expect(a.state.hands).toEqual(b.state.hands);
    expect(DailySession.start('2026-10-27').state.hands).not.toEqual(a.state.hands);
    expect(a.difficulty).toBe(GD_DAILY_LEVEL);
    expect(a.persist).toBe(false);
    expect(a.scored).toBe(false);
  });

  it('分数累计不封顶，同一副只记一次', () => {
    let m = { deals: [] as number[] };
    // 头游 0，搭档（2）第二名 +3；头游 1（对方），搭档 3 末游：-1
    m = dailyAddDeal(m, deal(1, [0, 2, 1, 3]));
    m = dailyAddDeal(m, deal(1, [0, 2, 1, 3]));
    m = dailyAddDeal(m, deal(2, [1, 0, 2, 3]));
    expect(m.deals).toEqual([3, -1]);
    expect(dailyPoints(m)).toBe(2);
    expect(dealPoints(deal(2, [1, 0, 2, 3]), 0)).toBe(-1);
    // 超过实盘的封顶（20）也照加
    const big = { deals: [3, 3, 3, 3, 3, 3, 3] };
    expect(dailyPoints(big)).toBe(21);
  });

  it('打满 8 副结束；整局提前结束（有一队过 A）也结束', () => {
    const seven = { deals: [3, 3, 3, 3, 3, 3, 3] };
    expect(dailyOver(seven, 'play')).toBe(false);
    const eight = dailyAddDeal(seven, deal(8, [0, 2, 1, 3]));
    expect(eight.deals.length).toBe(GD_DAILY_DEALS);
    expect(dailyOver(eight, 'dealEnd')).toBe(true);
    expect(dailyAddDeal(eight, deal(9, [0, 2, 1, 3]))).toBe(eight);
    expect(dailyOver({ deals: [3] }, 'gameOver')).toBe(true);
  });

  it('电脑打一场：不超过 8 副、结果等于每副累计，结束后不再接受动作', () => {
    const ses = DailySession.start('2026-10-26');
    playOut(ses);
    expect(ses.over).toBe(true);
    expect(ses.match.deals.length).toBeLessThanOrEqual(GD_DAILY_DEALS);
    expect(ses.result).toBe(dailyPoints(ses.match));
    expect(ses.apply({ type: 'nextDeal' }).error).not.toBeNull();
  }, 60_000);

  it('交分：gameId guandan、榜名 daily-<日期>-gd，负分照交', async () => {
    const f = fake();
    const r = await submitGdDaily('2026-10-26', -4, f.fetch);
    expect(r).toEqual({ kind: 'ok', best: 7, improved: true });
    expect(f.calls[1]).toEqual({ url: '/api/scores', body: { gameId: 'guandan', boardId: 'daily-2026-10-26-gd', score: -4, userId: 'u1' } });
  });

  it('daily.json 有 gd 子榜，也还有 ddz', () => {
    const d = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/daily.json', import.meta.url)), 'utf8')) as { note: string; boards: Record<string, { note: string; score: { text: string }[] }> };
    expect(d.boards.gd!.score[0]!.text).toBe('{n} 分');
    expect(d.boards.gd!.note).toContain('掼蛋 8 副');
    expect(d.boards.ddz).toBeDefined();
    expect(d.note).toContain('掼蛋');
    expect(d.note).toContain('斗地主');
  });
});
