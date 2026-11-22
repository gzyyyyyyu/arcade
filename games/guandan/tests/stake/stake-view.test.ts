/**
 * 单机实盘的页面这一半（src/view/guandan/stake.ts）：存档、结回和放弃的重试、钱包回各种话时存档怎么处理、实盘牌局的记分。
 * 不起浏览器：假的 localStorage 和 fetch。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decide } from '../../src/variants/guandan/ai/index.ts';
import { seatsToAct, viewFor } from '../../src/variants/guandan/core/index.ts';
import { RULES_V1, SOLO_DEALS, payout, pointValue } from '../../src/variants/guandan/stake/index.ts';
import { NET_DOWN, STAKE_ERROR, STAKE_TEXT, fillRows, fillSigned, roomLeaveText, roomWhy, settleNowText, fmtChips, fmtWan } from '../../src/view/common/stake-text.ts';
import { STAKE_KEY, StakeSession, buyinStake, clearStake, loadStake, refundStake, settleStake, stakeLeft, type StakeSave } from '../../src/view/guandan/stake.ts';
import { strayStake } from '../../src/view/stake-stray.ts';
import { transient } from '../../src/view/common/stake-api.ts';
import { KEYS } from '../../src/view/store.ts';

const REF = `solo-mid-${'cd'.repeat(16)}`;
const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

type Answer = { status?: number; body?: unknown } | Error;

/** 假 fetch：按顺序回话，记下请求 */
function fakeFetch(answers: Answer[]): typeof fetch & { calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const a = answers.shift() ?? { status: 500 };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as typeof fetch & { calls: typeof calls };
  f.calls = calls;
  return f;
}

const noSleep = async (): Promise<void> => undefined;

function started(): StakeSession {
  return StakeSession.start({ userId: 'u1', ref: REF, tier: 'mid', until: Date.now() + 3_600_000 }, 'stake-view');
}

/** 用电脑把实盘局往前推，直到一场结束 */
function playOut(ses: StakeSession): void {
  ses.autoplay = true;
  for (let guard = 0; guard < 60_000 && !ses.over; guard++) {
    const s = ses.state;
    if (s.phase === 'dealEnd') {
      ses.apply({ type: 'nextDeal' });
      continue;
    }
    const seat = seatsToAct(s)[0]!;
    const r = ses.apply(decide(viewFor(s, seat), { seed: 'x', difficulty: 'easy' })!);
    expect(r.error).toBeNull();
  }
}

describe('实盘牌局', () => {
  it('开局就存进 guandan.stake，不碰 guandan.save；规则用默认', () => {
    const ses = started();
    expect(mem.has(STAKE_KEY)).toBe(true);
    expect(mem.has(KEYS.save)).toBe(false);
    expect(loadStake()!.ref).toBe(REF);
    expect(ses.state.options.aFailLimit).toBe(3);
    expect(ses.scored).toBe(false);
  });

  it('打到一场结束：每副记分、记下要结的数，不写战绩；结束后不再接受动作', () => {
    const ses = started();
    playOut(ses);
    const s = loadStake()!;
    expect(s.settle).not.toBeNull();
    expect(s.settle!.deals).toBe(s.match.deals.length);
    expect(s.match.deals.length).toBeLessThanOrEqual(SOLO_DEALS);
    expect(s.settle!.points).toBe(ses.points);
    expect(mem.has(KEYS.stats)).toBe(false);
    expect(ses.apply({ type: 'nextDeal' }).error).not.toBeNull();
  }, 60_000);

  it('新开的存档带 rules: 2，一场 3 副', () => {
    const ses = started();
    expect(ses.stake.match.rules).toBe(2);
    expect(stakeLeft(ses.stake).dealsTotal).toBe(SOLO_DEALS);
  });

  it('旧存档（没有 rules，8 副、每分 1/20）读出来照旧：打满 8 副才结束，结回不带 rules', async () => {
    const ses = started();
    const old = { ...ses.stake, match: { tier: ses.stake.match.tier, deals: [3, 3, 3, 3] } };
    mem.set(STAKE_KEY, JSON.stringify(old));
    const loaded = loadStake()!;
    expect(loaded.match.rules).toBeUndefined();
    expect(stakeLeft(loaded)).toEqual({ dealsDone: 4, dealsTotal: 8, points: 12 });
    // 4 副 +12 分：新规则早就结束了，旧的还没（封顶 20、8 副）
    const again = new StakeSession(loaded);
    expect(again.over).toBe(false);
    again.finish();
    const f = fakeFetch([{ body: { ok: true, credited: 1, wallet: { balance: 5, stakes: [] } } }]);
    await settleStake(again.stake, { fetcher: f, sleep: noSleep });
    expect(f.calls[0]!.body).toMatchObject({ points: 12, deals: 4 });
    expect(f.calls[0]!.body).not.toHaveProperty('rules');
    // 同样的 12 分，旧规则结回 10,000 + 12 × 500，新规则每分只有 400
    expect(payout('mid', 12, RULES_V1)).toBe(16_000);
    expect(payout('mid', 12)).toBe(14_800);
  });

  it('从存档接着打：同一个 ref、同样的分', () => {
    const ses = started();
    ses.finish();
    const again = new StakeSession(loadStake()!);
    expect(again.stake.ref).toBe(REF);
    expect(again.over).toBe(true);
  });

});

describe('结回、放弃', () => {
  const over = (): StakeSave => {
    const ses = started();
    ses.finish();
    return loadStake()!;
  };

  it('成功：删存档，带回 credited / capped / 钱包余额', async () => {
    const s = over();
    const f = fakeFetch([{ body: { ok: true, credited: 10_000, capped: 0, wallet: { balance: 18_000, stakes: [] } } }]);
    expect(await settleStake(s, { fetcher: f, sleep: noSleep })).toEqual({ kind: 'done', points: 0, credited: 10_000, capped: 0, balance: 18_000 });
    expect(f.calls[0]).toEqual({ url: 'api/stake/settle', body: { ref: REF, tier: 'mid', points: 0, deals: 0, rules: 2, stats: { rounds: 0, wins: 0, best: 0, sum: { bombs: 0, firsts: 0 } } } });
    expect(loadStake()).toBeNull();
  });

  it('钱包忙（busy、internal、503、连不上）：同样的请求重试，最后成功就算成功', async () => {
    const s = over();
    const f = fakeFetch([{ body: { ok: false, error: 'internal' } }, new Error('net'), { body: { ok: true, credited: 1, wallet: { balance: 5, stakes: [] } } }]);
    const r = await settleStake(s, { fetcher: f, sleep: noSleep });
    expect(r.kind).toBe('done');
    expect(f.calls).toHaveLength(3);
    expect(new Set(f.calls.map((c) => JSON.stringify(c.body))).size).toBe(1);
  });

  it('一直忙：存档留着，下次接着结', async () => {
    const s = over();
    const f = fakeFetch([{ body: { ok: false, error: 'busy' } }, { status: 503 }, { body: { ok: false, error: 'internal' } }]);
    expect(await settleStake(s, { fetcher: f, sleep: noSleep })).toEqual({ kind: 'later' });
    expect(loadStake()?.ref).toBe(REF);
  });

  it('已经结过（no_stake）、过期退回过（expired）：当作办完，删存档，不重试', async () => {
    for (const error of ['no_stake', 'expired'] as const) {
      const s = over();
      const f = fakeFetch([{ body: { ok: false, error } }]);
      expect((await settleStake(s, { fetcher: f, sleep: noSleep })).kind).toBe(error === 'no_stake' ? 'gone' : 'expired');
      expect(f.calls).toHaveLength(1);
      expect(loadStake()).toBeNull();
    }
  });

  it('别的错误（代码写错）：不重试，存档留着', async () => {
    const s = over();
    const f = fakeFetch([{ status: 400 }]);
    expect(await settleStake(s, { fetcher: f, sleep: noSleep })).toEqual({ kind: 'failed', error: 'bad_request' });
    expect(f.calls).toHaveLength(1);
    expect(loadStake()).not.toBeNull();
  });

  it('放弃：退回那一份；忙就重试', async () => {
    const s = loadStake() ?? (() => {
      started();
      return loadStake()!;
    })();
    const f = fakeFetch([{ body: { ok: false, error: 'busy' } }, { body: { ok: true, credited: 10_000, wallet: { balance: 10_000, stakes: [] } } }]);
    expect((await refundStake(s, { fetcher: f, sleep: noSleep })).kind).toBe('done');
    expect(f.calls.map((c) => c.url)).toEqual(['api/stake/refund', 'api/stake/refund']);
    expect(loadStake()).toBeNull();
  });

  it('删存档只删同一场：别的标签页已经开了新的一场就不动', () => {
    started();
    clearStake('solo-mid-ffffffffffffffffffffffffffffffff');
    expect(loadStake()).not.toBeNull();
    clearStake(REF);
    expect(loadStake()).toBeNull();
  });

  it('哪些算暂时的', () => {
    expect(['busy', 'internal', 'unavailable'].every(transient)).toBe(true);
    expect(['no_stake', 'expired', 'no_funds', 'bad_request'].some(transient)).toBe(false);
  });
});

describe('进场', () => {
  it('先问是谁，再带入；成功开一场', async () => {
    const f = fakeFetch([{ body: { user: { id: 'u9' } } }, { body: { ok: true, ref: REF, tier: 'small', share: 2000, until: Date.now() + 1000, wallet: { balance: 8000, stakes: [] } } }]);
    const r = await buyinStake('small', f);
    expect(r.ok).toBe(true);
    expect(f.calls.map((c) => c.url)).toEqual(['/api/me', 'api/stake/buyin']);
    expect(loadStake()).toMatchObject({ userId: 'u9', ref: REF, tier: 'small', share: 2000 });
  });

  it('被拒原样带回；没登录不带入', async () => {
    const f = fakeFetch([{ body: { user: { id: 'u9' } } }, { body: { ok: false, error: 'no_funds', wallet: { balance: 100, stakes: [] } } }]);
    expect(await buyinStake('big', f)).toEqual({ ok: false, error: 'no_funds', wallet: { balance: 100, stakes: [] } });
    const g = fakeFetch([{ body: { user: null } }]);
    expect(await buyinStake('big', g)).toEqual({ ok: false, error: 'login' });
    expect(g.calls).toHaveLength(1);
    expect(loadStake()).toBeNull();
  });

  it('钱包里有一份掼蛋、本机没有它的存档：单机的能退回，好友房的不能', () => {
    const w = (ref: string) => ({ balance: 0, stakes: [{ game: 'guandan', ref, tier: 'mid' }] });
    expect(strayStake(w(REF), null)).toEqual({ ref: REF, solo: true });
    expect(strayStake(w('gd-0123456789abcdef'), null)).toEqual({ ref: 'gd-0123456789abcdef', solo: false });
    expect(strayStake({ balance: 0, stakes: [{ game: 'texas', ref: REF, tier: 'mid' }] }, null)).toBeNull();
    expect(strayStake(w(`solo-ddz-mid-${'ab'.repeat(16)}`), null)).toBeNull(); // 斗地主单机的归 doudizhu/stake.ts
    const ses = started();
    expect(strayStake(w(REF), ses.stake)).toBeNull();
  });
});

describe('中途结算的话写明数字（0.11.2）', () => {
  it('单机：按现在的分结回多少（带入一份加输赢，封顶）', () => {
    // 小档一份 2,000、每分 80：+6 分 → 结回 2,480
    expect(fillSigned(settleNowText(payout('small', 6)), [6, 6 * pointValue('small')])).toBe('现在结回：按 +6 分（+480）结回 2,480 筹码');
    expect(fillSigned(settleNowText(payout('small', -3)), [-3, -3 * pointValue('small')])).toContain('结回 1,760 筹码');
  });
  it('好友房离开：同样写出分、筹码和结回额', () => {
    const back = payout('mid', 2);
    expect(fillRows(roomLeaveText(2, 2 * pointValue('mid'), back))).toBe(
      `离开房间？按现在的 +2 分（+${fmtChips(2 * pointValue('mid'))}）马上结回 ${fmtChips(back)} 筹码，之后电脑接着打，输赢不再算你的；回来会重新带入一份`,
    );
    // 一副打到一半（0.12.4）：这副打完才结回，不写结回额（还不知道）
    const midRows = roomLeaveText(-2, -2 * pointValue('mid'), payout('mid', -2), true);
    const mid = fillRows(midRows);
    expect(mid).toBe(`离开房间？这一副电脑替你打完、输赢照算，打完按那时的分结回（现在 −2 分，${fmtChips(-2 * pointValue('mid'))}）；之后输赢不再算你的，回来会重新带入一份`);
    // 确认框一行约 16 个汉字宽（460/28）：汉字算 1、数字和符号算 0.55，数字行按最大的 7 位筹码留余量，每行 ≤16
    const em = (t: string): number => Array.from(t).reduce((n, c) => n + (/[\u2e80-\u9fff\uff00-\uffef]/.test(c) ? 1 : 0.55), 0);
    for (const r of [...midRows, ...roomLeaveText(2, 100, 2_000_000)]) expect(em(fillSigned(r.tpl, [-20, -1_600_000]))).toBeLessThanOrEqual(16);
    expect(mid).not.toContain('马上');
  });
});

describe('手机上的短数（选档页第一行）', () => {
  it('整万写成"万"，不整万的照写千分位，不丢精度', () => {
    expect(fmtWan(200_000)).toBe('20万');
    expect(fmtWan(10_000)).toBe('1万');
    expect(fmtWan(2_500)).toBe('2,500');
    expect(fmtWan(12_500)).toBe('12,500');
  });
});

describe('实盘文案用词统一（带入 / 结回；断网一句话）', () => {
  const all = [...Object.values(STAKE_ERROR), ...(Object.values(STAKE_TEXT).filter((v) => typeof v === 'string') as string[]), ...['no_funds', 'limit', 'busy', 'x'].map(roomWhy)].join('\n');
  it('没有"带上""结算过""没带"的别名', () => {
    expect(all).not.toMatch(/带上|结算过|接着结算|没带[^入]/);
  });
  it('补给后面写明从哪领；断网三处同一句', () => {
    expect(STAKE_ERROR.no_funds).toContain('补给（大厅每日领取）');
    expect(STAKE_ERROR.unavailable).toBe(NET_DOWN);
    expect(STAKE_TEXT.walletDown.startsWith(NET_DOWN)).toBe(true);
    expect(STAKE_TEXT.settleLater.startsWith(NET_DOWN)).toBe(true);
    expect(NET_DOWN).toBe('网络不通，检查后重试');
  });
});
