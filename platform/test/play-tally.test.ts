/** 真人对局统计（docs/platform-backend.md 5.11）：分段函数、结回和交分带 tally 的写入、管理接口、清理。 */
import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { runCleanup } from '../worker/api/ops/cron';
import { durBucket, parseTally, scoreOutcome, settleOutcome } from '../worker/api/wallet/tally';
import type { WalletReply } from '../worker/api/wallet/store';
import { lastWalletStats } from '../worker/api/wallet/service';
import { call, count, env, registerUser, resetAll, rowsWritten } from './helpers';

beforeEach(() => resetAll());

type Stub = { buyin(req: unknown): Promise<WalletReply>; settle(req: unknown): Promise<WalletReply> };
const stub = (game: string) => (exports as unknown as { WalletService: (o: { props: { game: string } }) => Stub }).WalletService({ props: { game } });
let n = 0;
const id = (p: string) => `${p}-${String(++n).padStart(6, '0')}`;

async function round(userId: string, o: { amount?: number; back: number; tally?: unknown; op?: string; mode?: string; game?: string }) {
  const game = o.game ?? 'kaipan';
  const base = { userId, game, ref: id('ref'), mode: o.mode ?? 'client' };
  await stub(game).buyin({ ...base, tier: 'small', amount: o.amount ?? 2_000, until: Date.now() + 3_600_000, op: id('op') });
  const r = await stub(game).settle({ ...base, amount: o.back, op: o.op ?? id('op'), ...(o.tally !== undefined && { tally: o.tally }) });
  return { r, wrote: lastWalletStats.rowsWritten };
}
const rows = () => env.DB.prepare('SELECT * FROM play_tally ORDER BY outcome').all<Record<string, unknown>>().then((x) => x.results);
async function admin() {
  const a = await registerUser();
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(a.user.id).run();
  return a;
}

describe('分段函数', () => {
  it('时长：边界落在后一段', () => {
    expect([0, 59, 60, 299, 300, 899, 900, 1799, 1800, 3599, 3600, 86_400].map(durBucket)).toEqual([
      'lt1m', 'lt1m', '1-5m', '1-5m', '5-15m', '5-15m', '15-30m', '15-30m', '30-60m', '30-60m', 'ge60m', 'ge60m',
    ]);
  });

  it('结回的结果：拿回 0 输光、净值负输、0 持平、不到一份赢、一份以上大赢；带入是 0 看 result', () => {
    expect([settleOutcome(2_000, 0), settleOutcome(2_000, 1_500), settleOutcome(2_000, 2_000), settleOutcome(2_000, 3_999), settleOutcome(2_000, 4_000)]).toEqual([
      'bust', 'lose', 'even', 'win', 'big',
    ]);
    expect([settleOutcome(0, 100, 'win'), settleOutcome(0, 0, 'lose'), settleOutcome(0, 0, 'draw'), settleOutcome(0, 0)]).toEqual(['win', 'lose', 'even', 'even']);
  });

  it('交分的结果：win / lose / draw → win / lose / even，没报是 na', () => {
    expect([scoreOutcome('win'), scoreOutcome('lose'), scoreOutcome('draw'), scoreOutcome()]).toEqual(['win', 'lose', 'even', 'na']);
  });

  it('校验：玩法默认 main；玩法、时长、结果不合格整个当没带', () => {
    expect(parseTally({ durSec: 90 })).toEqual({ variant: 'main', durSec: 90 });
    expect(parseTally({ variant: 'riichi', durSec: 0, result: 'draw' })).toEqual({ variant: 'riichi', durSec: 0, result: 'draw' });
    for (const bad of [null, 5, [], {}, { durSec: -1 }, { durSec: 86_401 }, { durSec: 1.5 }, { durSec: '5' }, { variant: 'Bad', durSec: 1 }, { variant: '1a', durSec: 1 },
      { variant: 'a'.repeat(17), durSec: 1 }, { variant: 3, durSec: 1 }, { durSec: 1, result: 'won' }]) {
      expect(parseTally(bad)).toBeNull();
    }
  });
});

describe('结回带 tally', () => {
  it('带了：钱包 1 行 + 统计 1 行 = 2 行，同一类（钱包）；再来一局同一格加 1', async () => {
    const u = await registerUser();
    const a = await round(u.user.id, { back: 5_000, tally: { variant: 'riichi', durSec: 400 } });
    expect(a.r).toMatchObject({ ok: true, credited: 5_000 });
    expect(a.wrote).toBe(2);
    expect(lastWalletStats.byCategory.wallet).toBe(2);
    expect(await rows()).toEqual([{ day: '2026-10-14', game: 'kaipan', variant: 'riichi', mode: 'client', tier: 'small', dur: '5-15m', outcome: 'big', n: 1 }]);
    await round(u.user.id, { back: 5_000, tally: { variant: 'riichi', durSec: 500 } });
    expect((await rows())[0]!.n).toBe(2);
  });

  it('没带：只写 1 行，不记统计', async () => {
    const u = await registerUser();
    const a = await round(u.user.id, { back: 0 });
    expect(a.wrote).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM play_tally')).toBe(0);
  });

  it('不合格的 tally 忽略：结回照常成功，只写 1 行', async () => {
    const u = await registerUser();
    for (const bad of ['x', { durSec: 999_999 }, { variant: 'BAD', durSec: 5 }]) {
      const a = await round(u.user.id, { back: 1_000, tally: bad });
      expect(a.r).toMatchObject({ ok: true, credited: 1_000 });
      expect(a.wrote).toBe(1);
    }
    expect(await count('SELECT COUNT(*) AS n FROM play_tally')).toBe(0);
  });

  it('重发同一个 op 是 dup：不写、不重复计数；被拒的结回（没有这一份）也不记', async () => {
    const u = await registerUser();
    const op = id('op');
    const base = { userId: u.user.id, game: 'kaipan', ref: id('ref'), mode: 'server' };
    await stub('kaipan').buyin({ ...base, tier: 'mid', amount: 5_000, until: Date.now() + 3_600_000, op: id('op') });
    const req = { ...base, amount: 0, op, tally: { durSec: 30 } };
    expect(await stub('kaipan').settle(req)).toMatchObject({ ok: true });
    expect(await stub('kaipan').settle(req)).toMatchObject({ ok: true, dup: true });
    expect(lastWalletStats.rowsWritten).toBe(0);
    expect(await stub('kaipan').settle({ ...req, op: id('op') })).toMatchObject({ ok: false, error: 'no_stake' });
    expect(lastWalletStats.rowsWritten).toBe(0);
    expect(await rows()).toEqual([{ day: '2026-10-14', game: 'kaipan', variant: 'main', mode: 'server', tier: 'mid', dur: 'lt1m', outcome: 'bust', n: 1 }]);
  });
});

describe('交分带 tally', () => {
  const submit = (u: Awaited<ReturnType<typeof registerUser>>, body: Record<string, unknown>) =>
    call('/api/scores', { body: { gameId: 'kaipan', boardId: 'daily-2026-10-14-classic', ...body }, cookie: u.cookie });

  it('带了：首次上榜 3 + 1 行，没刷新最好成绩 1 + 1 行；没带照旧（没刷新 1 行）', async () => {
    const u = await registerUser();
    expect((await submit(u, { score: 100, tally: { durSec: 700, result: 'win' } })).status).toBe(200);
    expect(rowsWritten()).toBe(3 + 1);
    expect((await submit(u, { score: 50, tally: { durSec: 700, result: 'win' } })).status).toBe(200);
    expect(rowsWritten()).toBe(1 + 1);
    expect((await submit(u, { score: 40 })).status).toBe(200);
    expect(rowsWritten()).toBe(1);
    expect(await rows()).toEqual([{ day: '2026-10-14', game: 'kaipan', variant: 'main', mode: 'none', tier: 'none', dur: '5-15m', outcome: 'win', n: 2 }]);
  });

  it('不合格的 tally 忽略，交分照常；被拒的请求不记', async () => {
    const u = await registerUser();
    expect((await submit(u, { score: 100, tally: { durSec: -3 } })).status).toBe(200);
    expect(rowsWritten()).toBe(3);
    expect((await submit(u, { score: 1.5, tally: { durSec: 3 } })).status).toBe(422);
    expect(rowsWritten()).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM play_tally')).toBe(0);
  });

  it('没写结果记 na', async () => {
    const u = await registerUser();
    await submit(u, { score: 1, tally: { variant: 'endless', durSec: 10 } });
    expect(await rows()).toMatchObject([{ variant: 'endless', outcome: 'na', dur: 'lt1m' }]);
  });
});

describe('管理接口 GET /api/admin/play-tally', () => {
  it('没登录 401，普通用户 403', async () => {
    expect((await call('/api/admin/play-tally')).status).toBe(401);
    const u = await registerUser();
    expect((await call('/api/admin/play-tally', { cookie: u.cookie })).status).toBe(403);
  });

  it('按天数汇总：日期范围、跨天合并、各桶相加；days 不合格 400；写 0 行', async () => {
    const a = await admin();
    const ins = (day: string, game: string, tier: string, dur: string, outcome: string, c: number) =>
      env.DB.prepare("INSERT INTO play_tally (day, game, variant, mode, tier, dur, outcome, n) VALUES (?1, ?2, 'main', 'client', ?3, ?4, ?5, ?6)").bind(day, game, tier, dur, outcome, c);
    await env.DB.batch([
      ins('2026-10-14', 'kaipan', 'small', 'lt1m', 'win', 3),
      ins('2026-10-14', 'kaipan', 'small', '1-5m', 'win', 2),
      ins('2026-10-10', 'kaipan', 'small', 'lt1m', 'lose', 4),
      ins('2026-10-14', 'texas', 'big', 'ge60m', 'big', 1),
      ins('2026-09-01', 'kaipan', 'small', 'lt1m', 'win', 100),
    ]);
    const get = async (q = '') => {
      const res = await call(`/api/admin/play-tally${q}`, { cookie: a.cookie });
      return { status: res.status, body: (await res.json()) as { from: string; to: string; rows: unknown[] } };
    };
    const r7 = await get('?days=7');
    expect(rowsWritten()).toBe(0);
    expect(r7.body).toEqual({
      from: '2026-10-08',
      to: '2026-10-14',
      rows: [
        { game: 'kaipan', variant: 'main', mode: 'client', tier: 'small', n: 9, dur: { lt1m: 7, '1-5m': 2 }, outcome: { win: 5, lose: 4 } },
        { game: 'texas', variant: 'main', mode: 'client', tier: 'big', n: 1, dur: { ge60m: 1 }, outcome: { big: 1 } },
      ],
    });
    expect((await get()).body.from).toBe('2026-09-15');
    expect((await get('?days=90')).body.rows).toHaveLength(2);
    for (const q of ['?days=0', '?days=91', '?days=x', '?days=1.5']) expect((await get(q)).status).toBe(400);
  });
});

describe('清理', () => {
  it('删 tallyKeepDays（默认 180）天前的，留着新的', async () => {
    const ins = (day: string) => env.DB.prepare("INSERT INTO play_tally VALUES (?1, 'kaipan', 'main', 'client', 'small', 'lt1m', 'win', 1)").bind(day);
    await env.DB.batch([ins('2026-04-01'), ins('2026-04-10'), ins('2026-10-13')]);
    await runCleanup(env, Date.now());
    expect((await rows()).map((r) => r.day)).toEqual(['2026-10-13']);
  });
});
