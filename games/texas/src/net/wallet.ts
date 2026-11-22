/**
 * 钱包（平台的，docs/economy.md 第 3、4 节，仓库根 docs/platform-backend.md 5.9、15.9）。
 * - 看钱包、领补给：平台的 /api/wallet、/api/wallet/relief（同域，绝对路径）；
 * - 单机带入、结回：德州 Worker 的 api/solo/*（相对路径，页面在 /games/texas/ 下），Worker 再经服务绑定调平台（client 模式）。
 * 连不上、回来的不是 JSON（网关出错页、开发时 vite 的首页）都按 offline：钱包那边可能根本没收到，调用方留着操作 id 下次重发。
 */
import type { SettleStats } from '../core/fame.ts';
import type { StakesId } from '../core/stakes.ts';

export type Mode = 'server' | 'client';

/** 某个游戏"桌上那一份"：单机是 client，好友房是 server */
export interface Stake {
  game: string;
  ref: string;
  tier: StakesId;
  amount: number;
  mode: Mode;
  at: number;
  until: number;
}

export interface WalletView {
  balance: number;
  stakes: Stake[];
  /** 今天能不能领补给 */
  canRelief: boolean;
  writesLeft: number;
  /** client 模式今天的净赢和上限（只列今天带入过的游戏） */
  caps: Record<string, { net: number; cap: number }>;
  /** 还没有钱包（看到的是新号的 10,000） */
  fresh: boolean;
}

/** credited：进了钱包的；capped：今天这个游戏的进账到顶了、没进钱包的 */
export type WalletReply = { ok: true; wallet: WalletView; credited?: number; capped?: number } | { ok: false; error: string; wallet?: WalletView; retryAfter?: number };

/** 钱包里德州的那几份（同一个游戏可以同时有好几份：单机一份、每个好友房各一份）；mode 不给就是全部 */
export const texasStakes = (w: WalletView | null, mode?: Mode): Stake[] => w?.stakes.filter((s) => s.game === 'texas' && (!mode || s.mode === mode)) ?? [];

/**
 * 本机记着的带入（buyin）/结回（cashout）没办成时，要不要留着下次用同一个操作 id 重办（单机现金桌和单机锦标赛共用）：
 * 连不上、平台出错要留；结回回 busy（平台停服档）留着再办，带入回 busy 是平台停了带入、钱没扣，当明确拒了
 * （原来也当连不上，一整天每 15 秒重试，这期间连娱乐局都开不了）；
 * 结回时登录过期、没过 CSRF：钱包没收到，留在本机，登录后再结（原来当明确拒了，整桌筹码就丢了）
 */
export function retryable(error: string, kind: 'buyin' | 'cashout'): boolean {
  if (error === 'offline' || error === 'unavailable' || error === 'internal') return true;
  return kind === 'cashout' && (error === 'busy' || error === 'login' || error === 'forbidden');
}

/**
 * 德州自己发的请求（钱包、云存档、交榜）最多等这么久：挂住的连接不让按钮一直转圈。超时按连不上处理——
 * 钱包的带入、结回先记在本机（pending），同一个操作 id 重发、平台去重，不会多扣多给
 */
export const FETCH_TIMEOUT_MS = 15_000;

async function call(url: string, init: RequestInit): Promise<WalletReply> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 401) return { ok: false, error: 'login' };
    const data = (await res.json()) as { ok?: boolean; wallet?: WalletView; error?: unknown; credited?: number; capped?: number; retryAfter?: unknown };
    if (res.ok && data.wallet) return { ok: true, wallet: data.wallet, credited: data.credited, capped: data.capped };
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : 'offline',
      ...(data.wallet ? { wallet: data.wallet } : {}),
      ...(typeof data.retryAfter === 'number' ? { retryAfter: data.retryAfter } : {}),
    };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

// keepalive：关页面时离桌的结回也要发出去（浏览器的 RequestInit 有它，Worker 的类型里没有，这个文件两边都编译）
const post = (body: unknown, keepalive = false): RequestInit =>
  ({ method: 'POST', headers: { 'content-type': 'application/json', 'x-arcade': '1' }, body: JSON.stringify(body), keepalive }) as RequestInit;

export const getWallet = (): Promise<WalletReply> => call('/api/wallet', { headers: { accept: 'application/json' } });
export const relief = (): Promise<WalletReply> => call('/api/wallet/relief', post({}));

export interface WalletApi {
  buyin(op: string, session: string, stakes: StakesId, amount: number): Promise<WalletReply>;
  /** stats：这一份的小结（平台 settle.stats），worker 原样转给平台 */
  cashout(op: string, session: string, amount: number, keepalive?: boolean, stats?: SettleStats): Promise<WalletReply>;
}

export const walletApi: WalletApi = {
  buyin: (op, session, stakes, amount) => call('api/solo/buyin', post({ op, session, stakes, amount })),
  cashout: (op, session, amount, keepalive = false, stats) => call('api/solo/cashout', post({ op, session, amount, ...(stats ? { stats } : {}) }, keepalive)),
};

/**
 * 给玩家看的一句话：照仓库根 docs/platform-backend.md 15.10 的对照表，出了什么事、怎么办，不只回一个错误码。
 * retryAfter：/api 限次（rate_limited）时平台给的秒数。限次只防刷、对玩家无感：说法不提"频繁""太快"，只说忙、筹码没动、多久后再试。
 * where：在哪收到的。单机的钱包 RPC 照表说"娱乐局照常玩"；好友房里没有娱乐模式，不提它；
 * 看钱包、领补给走的是 /api，busy 按 /api 那张表说"先只能看、不能改"
 */
export function walletError(e: string, retryAfter?: number, where: 'solo' | 'room' | 'api' = 'solo'): string {
  switch (e) {
    case 'no_funds':
      return '钱包不够，少带一点，或者去大厅领补给';
    case 'limit':
      return where === 'room' ? '今天开局太多了，明早 0 点恢复；桌上的照常结回' : '今天开局太多了，明早 0 点恢复；桌上的照常结回，娱乐模式照常玩';
    case 'busy':
      if (where === 'api') return '服务器今天有点忙，先只能看、不能改，明早恢复';
      return where === 'room' ? '服务器今天有点忙，先不能带筹码上桌，明早恢复' : '服务器今天有点忙，先不能带筹码开局；娱乐模式照常玩，明早恢复';
    case 'login':
      return '登录过期了，刷新一下页面';
    case 'at_table':
      return '这一桌带的是别的档，换一桌再开';
    case 'relief_used':
      return '今天的补给已经领过了，明早 0 点再来';
    case 'relief_not_needed':
      return '筹码还够用：钱包加桌上的不到补给额才能领';
    case 'no_stake':
      return '这一份已经结过了';
    case 'expired':
      return '这一份放太久了，已经原样退回钱包';
    case 'rate_limited':
      return `钱包这会儿忙，筹码没动，过一会儿再试${retryAfter ? `（${Math.max(1, Math.ceil(retryAfter / 60))} 分钟后）` : ''}`;
    case 'internal':
      return '出了点问题，筹码没动，过一会儿再试';
    case 'offline':
    case 'unavailable':
      return '钱包连不上，筹码没动，连上了再试';
    default:
      // bad_request、bad_amount 这类是程序写错了：筹码没动
      return '出了点问题，这一份筹码没动，刷新一下再试';
  }
}
