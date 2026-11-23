/**
 * 单机实盘的页面接口（两个玩法共用，docs/stake.md 第 2 节）：钱包余额、和 Worker 的三个实盘接口（带入 / 结回 / 放弃）打交道、
 * 钱包忙时重试、结回和放弃的公共流程。存档和实盘的牌局会话在各玩法的 stake.ts。
 */
import { STAKE_REL } from '../../net/version.ts';
import { timed } from './platform.ts';
import type { TierId } from '../../core/stake.ts';

export interface WalletView {
  balance: number;
  stakes: { game: string; ref: string; tier: string }[];
}

export type StakeReply =
  | { ok: true; wallet?: WalletView; credited?: number; capped?: number; dup?: boolean; ref?: string; tier?: TierId; share?: number; until?: number }
  | { ok: false; error: string; wallet?: WalletView };

/** 平台浏览器接口 GET /api/wallet（15.9）。连不上、没登录都回 null：选档页把实盘灰掉 */
export async function fetchWallet(fetcher: typeof fetch = fetch): Promise<WalletView | null> {
  try {
    const res = await fetcher('/api/wallet', timed({ credentials: 'same-origin' }));
    if (res.status !== 200) return null;
    const body = (await res.json()) as { wallet?: { balance?: unknown; stakes?: unknown } };
    const w = body.wallet;
    if (!w || typeof w.balance !== 'number' || !Array.isArray(w.stakes)) return null;
    return { balance: w.balance, stakes: w.stakes as WalletView['stakes'] };
  } catch {
    return null;
  }
}

/** 调掼蛋 Worker 的实盘接口。HTTP 出错、连不上都折成 { ok: false, error }：401 → login，其余 → unavailable */
export async function postStake(action: 'buyin' | 'settle' | 'refund', body: unknown, fetcher: typeof fetch = fetch): Promise<StakeReply> {
  try {
    const res = await fetcher(
      `${STAKE_REL}/${action}`,
      timed({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    );
    if (res.status === 401) return { ok: false, error: 'login' };
    if (res.status === 400) return { ok: false, error: 'bad_request' };
    if (res.status !== 200) return { ok: false, error: 'unavailable' };
    return (await res.json()) as StakeReply;
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/** 钱包暂时的毛病：busy（预算、并发）、internal（D1 一时出错）、没连上。结回、放弃遇到这些要重试（旧仓库 PR 75 审阅） */
export function transient(error: string): boolean {
  return error === 'busy' || error === 'internal' || error === 'unavailable';
}

/** 重试的间隔（毫秒）：第一次失败后等 1 秒、再失败等 3 秒，共试 3 次 */
const RETRY_MS = [1_000, 3_000];

async function withRetry(call: () => Promise<StakeReply>, sleep: (ms: number) => Promise<void>): Promise<StakeReply> {
  let r = await call();
  for (const ms of RETRY_MS) {
    if (r.ok || !transient(r.error)) return r;
    await sleep(ms);
    r = await call();
  }
  return r;
}

const realSleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

export type SettleOutcome =
  | { kind: 'done'; points: number; credited: number; capped: number; balance: number | null }
  /** 已经结过（同一份只能结回一次，钱包回 no_stake）或者过期退回了（expired）：存档删掉 */
  | { kind: 'gone' }
  | { kind: 'expired' }
  /** 钱包一直忙：存档留着，下次接着结 */
  | { kind: 'later' }
  | { kind: 'failed'; error: string };

export interface Deps {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * 结回的公共部分（掼蛋和斗地主共用）：发请求、钱包忙就重试，再按回话处理存档（clear 删存档）。
 * 成功、结过（no_stake）、过期（expired）都删存档，一直忙就留着下次再结
 */
export async function settleWith(body: Record<string, unknown>, points: number, clear: () => void, deps: Deps = {}): Promise<SettleOutcome> {
  const r = await withRetry(() => postStake('settle', body, deps.fetcher), deps.sleep ?? realSleep);
  if (r.ok) {
    clear();
    return { kind: 'done', points, credited: r.credited ?? 0, capped: r.capped ?? 0, balance: r.wallet?.balance ?? null };
  }
  if (r.error === 'no_stake' || r.error === 'expired') {
    clear();
    return r.error === 'expired' ? { kind: 'expired' } : { kind: 'gone' };
  }
  return transient(r.error) ? { kind: 'later' } : { kind: 'failed', error: r.error };
}

/** 放弃的公共部分：那一份原样退回。和结回一样，退过、过期都算办完 */
export async function refundWith(body: Record<string, unknown>, clear: () => void, deps: Deps = {}): Promise<SettleOutcome> {
  const r = await withRetry(() => postStake('refund', body, deps.fetcher), deps.sleep ?? realSleep);
  if (r.ok || r.error === 'no_stake' || r.error === 'expired') {
    clear();
    return r.ok ? { kind: 'done', points: 0, credited: r.credited ?? 0, capped: 0, balance: r.wallet?.balance ?? null } : r.error === 'expired' ? { kind: 'expired' } : { kind: 'gone' };
  }
  return transient(r.error) ? { kind: 'later' } : { kind: 'failed', error: r.error };
}

/** 退回不在这台设备上的那一份单机实盘（extra：斗地主带 variant），忙就重试 */
export async function refundStray(ref: string, extra: Record<string, unknown> = {}, deps: Deps = {}): Promise<StakeReply> {
  return withRetry(() => postStake('refund', { ...extra, ref }, deps.fetcher), deps.sleep ?? realSleep);
}

/** 实盘局的种子：浏览器里用 crypto 生成（2.1），不用 Math.random */
export function stakeSeed(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return `s${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
