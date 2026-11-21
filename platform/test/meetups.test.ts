/**
 * 约局（docs/social.md 1.6，platform-backend.md 15.22）：PUT/DELETE /api/meetup 的格式、写入行数、每天次数，
 * 好友经 GET /api/invites 看到（只读）、不是好友看不到、过了就不给、删号和 Cron 清理；同一次轮询带的在线好友数。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runCleanup } from '../worker/api/ops/cron';
import { advance, call, count, env, errorOf, registerUser, resetAll, rowsBy, rowsWritten } from './helpers';

beforeEach(() => resetAll());

let ipSeq = 0;
const newUser = () => registerUser(undefined, undefined, `198.51.100.${++ipSeq % 250}`);
type U = Awaited<ReturnType<typeof newUser>>;
interface Poll {
  meetups: { host: { id: string; name: string }; game: string; at: number }[];
  mine: { game: string; at: number } | null;
  online: number;
}

const HALF = 1_800_000;
/** 现在之后第 n 个半点 */
const slot = (n = 1) => Math.ceil((Date.now() + 1) / HALF) * HALF + (n - 1) * HALF;
const meet = (u: U, game: string, at: number) => call('/api/meetup', { method: 'PUT', body: { game, at }, cookie: u.cookie });
const cancel = (u: U) => call('/api/meetup', { method: 'DELETE', cookie: u.cookie });
const poll = async (u: U) => (await (await call('/api/invites', { cookie: u.cookie })).json()) as Poll;
async function befriend(a: U, b: U): Promise<void> {
  expect((await call('/api/friends/requests', { body: { friendCode: b.user.friendCode }, cookie: a.cookie })).status).toBe(200);
  expect((await call(`/api/friends/${a.user.id}/accept`, { body: {}, cookie: b.cookie })).status).toBe(200);
}
async function pair(): Promise<[U, U]> {
  const a = await newUser();
  const b = await newUser();
  await befriend(a, b);
  return [a, b];
}

describe('约一局', () => {
  it('好友之间：回 {meetup}，写 1 行（live 类）；好友的轮询里有谁、哪个游戏、几点，我自己的在 mine；读 0 行写入', async () => {
    const [a, b] = await pair();
    const at = slot(2);
    const res = await meet(a, 'texas', at);
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(1);
    expect(rowsBy('live')).toBe(1);
    expect(await res.json()).toEqual({ meetup: { game: 'texas', at } });
    const got = await poll(b);
    expect(rowsWritten()).toBe(0);
    expect(got.meetups).toEqual([{ host: { id: a.user.id, name: expect.stringMatching(/^玩家/) }, game: 'texas', at }]);
    expect(got.mine).toBeNull();
    const own = await poll(a);
    expect(own.meetups).toEqual([]);
    expect(own.mine).toEqual({ game: 'texas', at });
  });

  it('再约就覆盖：一人同时只有一个', async () => {
    const [a, b] = await pair();
    await meet(a, 'texas', slot(2));
    expect((await meet(a, 'guandan', slot(4))).status).toBe(200);
    expect(rowsWritten()).toBe(1);
    expect((await poll(b)).meetups.map((m) => [m.game, m.at])).toEqual([['guandan', slot(4)]]);
  });

  it('格式不对 400、0 行：没登记的、不能开好友房的游戏，不在整点半点、已经过了、比明天还远、缺字段', async () => {
    const [a] = await pair();
    const tomorrowEnd = Date.parse(`${new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+08:00`) + 2 * 86_400_000;
    for (const [game, at] of [
      ['nope', slot()],
      ['kaipan', slot()],
      ['texas', slot() + 60_000],
      ['texas', slot() - HALF],
      ['texas', tomorrowEnd],
      ['texas', -HALF],
      ['texas', String(slot())],
    ] as const) {
      const res = await meet(a, game, at as number);
      expect(res.status, `${game} ${at}`).toBe(400);
      expect(rowsWritten()).toBe(0);
    }
    expect((await call('/api/meetup', { method: 'PUT', body: { game: 'texas' }, cookie: a.cookie })).status).toBe(400);
    expect((await meet(a, 'texas', tomorrowEnd - HALF)).status).toBe(200);
  });

  it('每天 3 次：第 4 次 429（Retry-After 到北京时间明天 0 点）、0 行，原来的约局不变；取消不还次数；第二天又能约', async () => {
    const [a, b] = await pair();
    for (let i = 1; i <= 3; i++) expect((await meet(a, 'texas', slot(i))).status, `第 ${i} 次`).toBe(200);
    expect((await cancel(a)).status).toBe(204);
    const over = await meet(a, 'guandan', slot(5));
    expect(over.status).toBe(429);
    expect(await errorOf(over)).toBe('rate_limited');
    expect(rowsWritten()).toBe(0);
    const midnight = Date.parse(`${new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+08:00`) + 86_400_000;
    expect(Number(over.headers.get('retry-after'))).toBe(Math.ceil((midnight - Date.now()) / 1000));
    expect((await poll(b)).meetups).toEqual([]);
    advance(midnight - Date.now());
    expect((await meet(a, 'guandan', slot(2))).status).toBe(200);
  });

  it('同时约好几次也冲不破上限：次数和覆盖在同一条语句里', async () => {
    await resetAll({ meetupsPerDay: 1 });
    const [a] = await pair();
    const rs = await Promise.all([meet(a, 'texas', slot()), meet(a, 'texas', slot(2)), meet(a, 'texas', slot(3))]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 429, 429]);
  });

  it('取消：204、1 行，好友那边没了；没有约局时再取消 204、0 行', async () => {
    const [a, b] = await pair();
    await meet(a, 'texas', slot(2));
    expect((await cancel(a)).status).toBe(204);
    expect(rowsWritten()).toBe(1);
    expect((await poll(b)).meetups).toEqual([]);
    expect((await poll(a)).mine).toBeNull();
    expect((await cancel(a)).status).toBe(204);
    expect(rowsWritten()).toBe(0);
  });

  it('要登录、要 CSRF', async () => {
    const [a] = await pair();
    expect((await call('/api/meetup', { method: 'PUT', body: { game: 'texas', at: slot() } })).status).toBe(401);
    expect((await call('/api/meetup', { method: 'PUT', body: { game: 'texas', at: slot() }, cookie: a.cookie, csrf: false })).status).toBe(403);
    expect((await call('/api/meetup', { method: 'DELETE', cookie: a.cookie, csrf: false })).status).toBe(403);
    expect(await count('SELECT COUNT(*) AS n FROM meetups')).toBe(0);
  });
});

describe('谁看得到、看到什么时候', () => {
  it('不是好友看不到；删了好友、屏蔽之后也看不到', async () => {
    const [a, b] = await pair();
    const c = await newUser();
    const d = await newUser();
    await befriend(a, d);
    await meet(a, 'texas', slot(2));
    expect((await poll(c)).meetups).toEqual([]);
    expect((await call(`/api/friends/${a.user.id}`, { method: 'DELETE', cookie: b.cookie })).status).toBe(204);
    expect((await poll(b)).meetups).toEqual([]);
    expect((await call('/api/blocks', { body: { userId: a.user.id }, cookie: d.cookie })).status).toBe(204);
    expect((await poll(d)).meetups).toEqual([]);
  });

  it('开局后 30 分钟以内还给（到点了，"去"），再往后就不给了；先开的在前', async () => {
    const [a, b] = await pair();
    const c = await newUser();
    await befriend(c, b);
    await meet(a, 'texas', slot(1));
    await meet(c, 'guandan', slot(3));
    expect((await poll(b)).meetups.map((m) => m.game)).toEqual(['texas', 'guandan']);
    advance(slot(1) - Date.now() + HALF - 1);
    expect((await poll(b)).meetups.map((m) => m.game)).toEqual(['texas', 'guandan']);
    advance(1);
    expect((await poll(b)).meetups.map((m) => m.game)).toEqual(['guandan']);
    expect((await poll(a)).mine).toBeNull();
  });
});

describe('在线好友数', () => {
  it('只数好友、5 分钟内报过位置、没关"让好友看到我在哪"的', async () => {
    const [a, b] = await pair();
    const c = await newUser();
    const d = await newUser();
    await befriend(a, c);
    advance(11_000);
    for (const u of [b, c, d]) expect((await call('/api/presence', { body: { place: 'lobby' }, cookie: u.cookie })).status).toBe(204);
    expect((await poll(a)).online).toBe(2);
    expect((await call('/api/me', { method: 'PATCH', body: { showWhere: false }, cookie: c.cookie })).status).toBe(200);
    expect((await poll(a)).online).toBe(1);
    advance(300_000);
    expect((await poll(a)).online).toBe(0);
  });
});

describe('清理', () => {
  it('删号：自己的约局删掉', async () => {
    const [a] = await pair();
    await meet(a, 'texas', slot(2));
    expect((await call('/api/account/delete', { body: { currentPassword: a.password }, cookie: a.cookie })).status).toBe(204);
    expect(await count('SELECT COUNT(*) AS n FROM meetups')).toBe(0);
  });

  it('Cron 删开局过了 1 天的和取消了的，没过的留着', async () => {
    const [a, b] = await pair();
    const c = await newUser();
    await meet(a, 'texas', slot());
    await meet(b, 'texas', slot());
    await cancel(b);
    advance(slot() - Date.now() + 86_400_000 + 1);
    await meet(c, 'guandan', slot());
    await runCleanup(env, Date.now());
    expect(await count('SELECT COUNT(*) AS n FROM meetups')).toBe(1);
  });
});
