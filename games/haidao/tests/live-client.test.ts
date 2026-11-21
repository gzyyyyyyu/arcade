import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES_VERSION } from '../src/core/types.ts';
import { LIVE_KEY, MAPLIVE_KEY, TDLIVE_KEY, live, liveState, mapLive, mapLiveHooks, tdLive, type LiveRecord } from '../src/net/live.ts';

/**
 * 实盘的浏览器端（net/live.ts 的 makeLive）：本机记一条进度，管"这一份筹码走到哪一步"，回话丢了、页面关了下次打开要能收尾。
 * 服务端那一半在 tests/live.test.ts、tdlive-api.test.ts；这里用假 fetch 和内存 localStorage 锁浏览器这一半的状态机。
 */
type Reply = { status: number; body: unknown } | 'down';
let store: Map<string, string>;
let replies: Reply[];
let sent: Array<{ url: string; body: Record<string, unknown>; stepAtSend: string | undefined; key: string }>;
let watchKey = LIVE_KEY;

const rec = (key: string): LiveRecord | null => JSON.parse(store.get(key) ?? 'null') as LiveRecord | null;
const put = (key: string, r: Partial<LiveRecord>): void => {
  store.set(key, JSON.stringify({ ref: 'haidao-r1', tier: 'small', seed: 3, at: 1, step: 'playing', ...r }));
};

beforeEach(() => {
  store = new Map();
  replies = [];
  sent = [];
  watchKey = LIVE_KEY;
  liveState.off = false;
  mapLiveHooks.keep = () => false;
  vi.stubGlobal('document', { cookie: '__Host-arcade_li=1' });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    // 记下发请求那一刻本机记的是哪一步：「先写再发」是断线能收尾的前提
    sent.push({ url, body, stepAtSend: rec(watchKey)?.step, key: watchKey });
    const r = replies.shift() ?? { status: 200, body: { ok: true } };
    if (r === 'down') throw new TypeError('Failed to fetch');
    return { status: r.status, json: async () => r.body } as unknown as Response;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('实盘带入', () => {
  it('先写成 buying 再发；成功后是 playing，记下账号，请求带规则版本', async () => {
    replies.push({ status: 200, body: { ok: true, user: 'u1' } });
    const r = await live.buyin('small');
    expect(r.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('api/live/buyin');
    expect(sent[0]!.stepAtSend).toBe('buying');
    expect(sent[0]!.body).toMatchObject({ tier: 'small', rules: RULES_VERSION });
    expect(rec(LIVE_KEY)).toMatchObject({ step: 'playing', user: 'u1', tier: 'small' });
    expect(live.busy).toBe(true);
  });

  it('连不上：留在 buying；下次打开先 refund 收回，收回后清干净', async () => {
    replies.push('down');
    const r = await live.buyin('small');
    expect(r).toMatchObject({ ok: false, why: 'offline' });
    expect(rec(LIVE_KEY)?.step).toBe('buying');
    const ref = rec(LIVE_KEY)!.ref;
    await live.resume();
    expect(sent[1]!.url).toBe('api/live/refund');
    expect(sent[1]!.body.ref).toBe(ref);
    expect(rec(LIVE_KEY)?.step).toBe('done');
    expect(live.busy).toBe(false);
  });

  it('钱包明确拒了（余额不够等）：本机记录清掉，不留待收回', async () => {
    replies.push({ status: 200, body: { ok: false, error: 'insufficient' } });
    const r = await live.buyin('small');
    expect(r).toMatchObject({ ok: false, why: 'reject', error: 'insufficient' });
    expect(rec(LIVE_KEY)).toBeNull();
  });

  it('上一份没结完时再带入：先收尾上一份，收尾失败就不带入新的', async () => {
    put(LIVE_KEY, { step: 'settling', kind: 'settle', bp: 120 });
    replies.push('down');
    const r = await live.buyin('mid');
    expect(r).toMatchObject({ ok: false, error: 'pending' });
    expect(sent.map((s) => s.url)).toEqual(['api/live/settle']);
  });
});

describe('实盘结回和放弃', () => {
  it('结回：先写成 settling 再发，带档位、倍数和带入时的账号；成功记下入账', async () => {
    put(LIVE_KEY, { user: 'u1' });
    replies.push({ status: 200, body: { ok: true, credited: 2400, capped: 0 } });
    const r = await live.settle(150);
    expect(r.ok).toBe(true);
    expect(sent[0]).toMatchObject({ url: 'api/live/settle', stepAtSend: 'settling', body: { ref: 'haidao-r1', tier: 'small', bp: 150, user: 'u1' } });
    expect(rec(LIVE_KEY)).toMatchObject({ step: 'done', credited: 2400, capped: 0 });
  });

  it('结回连不上：停在 settling，下次打开用同一个 ref、同一个倍数重发', async () => {
    put(LIVE_KEY, {});
    replies.push('down');
    await live.settle(80);
    expect(rec(LIVE_KEY)?.step).toBe('settling');
    await live.resume();
    expect(sent.map((s) => [s.url, s.body.ref, s.body.bp])).toEqual([
      ['api/live/settle', 'haidao-r1', 80],
      ['api/live/settle', 'haidao-r1', 80],
    ]);
    expect(rec(LIVE_KEY)?.step).toBe('done');
  });

  it('钱包拒了（已经退过、过期）：也收尾，再发不会变', async () => {
    put(LIVE_KEY, {});
    replies.push({ status: 200, body: { ok: false, error: 'no_stake' } });
    await live.settle(100);
    expect(rec(LIVE_KEY)).toMatchObject({ step: 'done', credited: 0 });
  });

  it('换了账号（409 wrong_user）：不收尾，留着等原账号回来', async () => {
    put(LIVE_KEY, { user: 'u1' });
    replies.push({ status: 409, body: { error: 'wrong_user' } });
    const r = await live.settle(100);
    expect(r).toMatchObject({ ok: false, why: 'login', error: 'wrong_user' });
    expect(rec(LIVE_KEY)?.step).toBe('settling');
  });

  it('没开打就放弃：原样退回', async () => {
    put(LIVE_KEY, { user: 'u1' });
    await live.refund();
    expect(sent[0]).toMatchObject({ url: 'api/live/refund', body: { ref: 'haidao-r1', user: 'u1' } });
    expect(sent[0]!.body.bp).toBeUndefined();
    expect(rec(LIVE_KEY)?.step).toBe('done');
  });

  it('打到一半关了页面：下次打开按 0 倍结回（算输）', async () => {
    put(LIVE_KEY, {});
    await live.resume();
    expect(sent[0]).toMatchObject({ url: 'api/live/settle', body: { bp: 0 } });
    expect(rec(LIVE_KEY)?.step).toBe('done');
  });

  it('悬赏连闯打到一半关了页面：按记下的 floor 结（setFloor 只在 playing 时记）', async () => {
    put(LIVE_KEY, {});
    live.setFloor(8_000);
    await live.resume();
    expect(sent[0]).toMatchObject({ url: 'api/live/settle', body: { bp: 8_000 } });
  });

  it('没有记录、已经结完：resume 什么都不发', async () => {
    await live.resume();
    put(LIVE_KEY, { step: 'done' });
    await live.resume();
    expect(sent).toHaveLength(0);
  });
});

describe('各玩法各走各的', () => {
  it('悬赏守岛走 api/td/*、记在 haidao.tdlive，不碰悬赏出海的记录', async () => {
    watchKey = TDLIVE_KEY;
    put(LIVE_KEY, { step: 'playing' });
    replies.push({ status: 200, body: { ok: true, user: 'u1' } });
    await tdLive.buyin('big');
    expect(sent[0]!.url).toBe('api/td/buyin');
    expect(rec(TDLIVE_KEY)).toMatchObject({ step: 'playing', tier: 'big' });
    expect(rec(LIVE_KEY)?.step).toBe('playing');
  });

  it('寻宝航线：画面说"还能接着跑"时，刷新后不按输结', async () => {
    watchKey = MAPLIVE_KEY;
    put(MAPLIVE_KEY, {});
    mapLiveHooks.keep = () => true;
    await mapLive.resume();
    expect(sent).toHaveLength(0);
    expect(rec(MAPLIVE_KEY)?.step).toBe('playing');
    mapLiveHooks.keep = () => false;
    await mapLive.resume();
    expect(sent[0]).toMatchObject({ url: 'api/map/settle', body: { bp: 0 } });
  });
});

describe('没有钱包、没登录', () => {
  it('单独部署（501）：关掉实盘，之后不再发请求', async () => {
    replies.push({ status: 501, body: { error: 'no_wallet' } });
    const r = await live.buyin('small');
    expect(r).toMatchObject({ ok: false, why: 'off' });
    expect(liveState.off).toBe(true);
    expect(rec(LIVE_KEY)).toBeNull();
    await live.buyin('small');
    expect(sent).toHaveLength(1);
  });

  it('没有登录提示 cookie：不发请求，直接关掉', async () => {
    vi.stubGlobal('document', { cookie: '' });
    const r = await live.buyin('small');
    expect(r).toMatchObject({ ok: false, why: 'off' });
    expect(sent).toHaveLength(0);
    expect(rec(LIVE_KEY)).toBeNull();
  });
});
