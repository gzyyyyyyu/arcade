/**
 * 悬赏出海（实盘）和兑换的钱包接口（DESIGN.md 第 4 节，照夜巡 worker/live.ts）：POST /games/haidao/api/live/{buyin,settle,refund,exchange,ingot}。
 *
 * 浏览器只给 ref / tier / bp（结回倍数，万分之几）；金额和到期时间都由 Worker 定：带入固定是这一档的一份，until = Worker 时钟 + 24 小时；
 * 结回前先看一眼钱包（view），按桌上那一份的金额算，不信浏览器报的档位。悬赏岛是电脑岛（src/core/live.ts），不涉及任何别的玩家。
 * 兑换：带入一份小档、立刻结回 0（筹码归庄家），换来的金币 / 木材记成这个人 Base 里的待领，浏览器同步时加进存档；每天的名额也记在 Base 那一行。
 * 金银锭换筹码（4.5）：直接调钱包 exchange（op `hx-i-<ref>`，钱包按 op 去重、按天管额度），回实际入账 credited，浏览器只扣入账对应的锭。
 *
 * 悬赏守岛（10.5）、护航（12.1）、寻宝航线（11.1）共用这份代码：POST /games/haidao/api/{td,escort,map}/{buyin,settle,refund}、GET <玩法>/today。
 * 区别只有三处（LIVE_KINDS）：钱包 ref 由 Worker 加各自的前缀、每日场次各自记（各自的 vars）、只有悬赏出海有兑换。
 *
 * 校验顺序：方法 / 路径 → 单独部署（501 no_wallet）→ CSRF → 请求体 → 认人（kit whoIs）→ 钱包。钱包的业务拒绝原样 200 给浏览器；连不上、超时回 503。
 */
import { whoIs } from 'arcade-kit/auth';
import { isStandalone, json } from 'arcade-kit/worker';
import { EXCHANGE_CHIPS, EXCHANGE_GOLD, EXCHANGE_PER_DAY, EXCHANGE_WOOD, LIVE_MAX_BP, LIVE_TIER_IDS, isLiveTier, liveReturn, type LiveTier } from '../src/core/live.ts';
import { tdLiveOpen } from '../src/core/tdlive.ts';
import { RULES_VERSION } from '../src/core/types.ts';
import { CHIP_SHOP, INGOT_CHIPS, LIVE_STAKE } from '../src/content/livetable.ts';
import type { Ports } from './pvp/api.ts';

type WalletTier = 'small' | 'mid' | 'big' | 'lux';
type WalletReply = { ok: true; wallet: unknown; credited?: number; capped?: number; left?: number; dup?: boolean; exchangeLeft?: number; exchangeCap?: number } | { ok: false; error: string; wallet?: unknown; left?: number };

export interface WalletRpc {
  view(userId: string): Promise<WalletReply>;
  buyin(req: { userId: string; game: 'haidao'; ref: string; tier: WalletTier; amount: number; until: number; mode: 'client'; op: string }): Promise<WalletReply>;
  settle(req: { userId: string; game: 'haidao'; ref: string; amount: number; mode: 'client'; op: string }): Promise<WalletReply>;
  refund(req: { userId: string; game: 'haidao'; ref: string; mode: 'client'; op: string }): Promise<WalletReply>;
  /** 游戏内货币换的筹码直接进余额（金银锭）；超出今天的额度只入剩下的，回 credited、left */
  exchange(req: { userId: string; game: 'haidao'; op: string; amount: number }): Promise<WalletReply>;
}

export interface LiveEnv {
  ARCADE?: Parameters<typeof whoIs>[1];
  GATE?: string;
  /** 平台钱包 RPC（服务绑定，props.game=haidao）；单独部署没有，接口回 501 no_wallet */
  WALLET?: WalletRpc;
  /** 每人每天最多打几场实盘（北京时间），wrangler.jsonc 的 vars；没设或不合法按 LIVE_DAILY_DEFAULT */
  HAIDAO_LIVE_DAILY?: string | number;
  /** 每人每天最多打几场悬赏守岛（北京时间），和悬赏出海分开记；没设或不合法按 8 */
  HAIDAO_TD_DAILY?: string | number;
  /** 每人每天最多打几场护航实盘；没设或不合法按 4 */
  HAIDAO_ESCORT_DAILY?: string | number;
  /** 每人每天最多跑几趟寻宝航线实盘；没设或不合法按 1 */
  HAIDAO_MAP_DAILY?: string | number;
}

/** 四种实盘：悬赏出海（live）、悬赏守岛（td）、护航（escort）、寻宝航线（map） */
export type LiveKind = 'live' | 'td' | 'escort' | 'map';

interface KindDef {
  prefix: string;
  /**
   * 钱包 ref 的命名空间（浏览器只给不带前缀的 ref，前缀由 Worker 加；悬赏出海是最早的，没有前缀）：
   * 每种实盘的请求见到任何一种前缀（含兑换的 hx-）一律 400，钱包里的几种份子互不串
   * （否则拿一份的 ref 去别的接口结回，能按别的倍数表结）。
   */
  ns: string;
  /** 每日场次的 vars 和默认（DESIGN.md 4.0：四种合计小档普通玩家每天期望 ≤ 6.5 份） */
  daily: (env: LiveEnv) => string | number | undefined;
  dailyDefault: number;
}

export const LIVE_KINDS: Record<LiveKind, KindDef> = {
  live: { prefix: '/games/haidao/api/live/', ns: '', daily: (e) => e.HAIDAO_LIVE_DAILY, dailyDefault: 8 },
  td: { prefix: '/games/haidao/api/td/', ns: 'ht-', daily: (e) => e.HAIDAO_TD_DAILY, dailyDefault: 8 },
  escort: { prefix: '/games/haidao/api/escort/', ns: 'he-', daily: (e) => e.HAIDAO_ESCORT_DAILY, dailyDefault: 4 },
  map: { prefix: '/games/haidao/api/map/', ns: 'hm-', daily: (e) => e.HAIDAO_MAP_DAILY, dailyDefault: 1 },
};
const KIND_IDS = Object.keys(LIVE_KINDS) as LiveKind[];

/** 这条路径归哪种实盘；不是实盘接口为 null */
export function liveKindOf(path: string): LiveKind | null {
  return KIND_IDS.find((k) => path.startsWith(LIVE_KINDS[k].prefix)) ?? null;
}

/** 悬赏出海每日场次的默认（选档页的说明、测试用） */
export const LIVE_DAILY_DEFAULT = LIVE_KINDS.live.dailyDefault;
/** vars 里的每日场次：1–1000 的整数（字符串也认），别的按这种实盘的默认 */
export function kindDaily(env: LiveEnv, kind: LiveKind): number {
  const raw = LIVE_KINDS[kind].daily(env);
  const n = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 1000 ? n : LIVE_KINDS[kind].dailyDefault;
}

export const WALLET_TIMEOUT_MS = 5000;
const BODY_MAX = 2048;
const BUYIN_TTL_MS = 24 * 3600 * 1000;
/** 钱包只收 8–64 位；最长的后缀 -refund 占 7 位，加了三位前缀的再少 3 位 */
const REF_RE = /^[A-Za-z0-9_-]{8,57}$/;
const NS_REF_RE = /^[A-Za-z0-9_-]{8,54}$/;
/** 兑换的 ref 还要当待领的 id（ack 收 8–40 位） */
const EX_REF_RE = /^[A-Za-z0-9_-]{8,40}$/;
/**
 * 兑换在钱包里用自己的命名空间（hx- 前缀），实盘的 buyin / settle / refund 不收这个前缀：
 * 否则兑换 buyin 之后、settle 0 之前，浏览器拿同一个 ref 抢先发实盘 settle 高倍数，能把那一份按倍数结回；
 * 反过来兑换拿一个结过的实盘 ref 重发，钱包按 op 去重回 ok，等于白拿资源。只靠 Base 里当天的记录挡不住跨天的。
 */
const EX_NS = 'hx-';
const exWalletRef = (ref: string): string => `${EX_NS}${ref}`;
/** 浏览器给的 ref 不许以任何一种命名空间开头 */
/**
 * 筹码装饰（4.7）在钱包里也用自己的命名空间：和兑换一样是 buyin 后 settle 0，
 * 共用 hx- 的话浏览器能拿 `d-<ref>` 走兑换、再拿 `<ref>` 走装饰，钱包按 op 回 dup，等于不扣钱拿到装饰。
 */
const SHOP_NS = 'hd-';
const ALL_NS = [EX_NS, SHOP_NS, ...KIND_IDS.map((k) => LIVE_KINDS[k].ns).filter((ns) => ns !== '')];
/** 一次最多换多少锭（钱包每天的额度另管，管理页最多可调到 100 万筹码 = 1 万锭） */
const INGOT_MAX = 10_000;
const ACTIONS = ['buyin', 'settle', 'refund', 'exchange', 'ingot', 'shop', 'today'] as const;

const fail = (status: number, error: string, cookies: readonly string[] = []): Response => json({ ok: false, error }, status, cookies);

/**
 * 开打 / 带入类请求（pvp find、revenge，live buyin，以后的悬赏守岛 buyin 也用）的规则版本闸门：
 * 部署后还开着旧页面的人，本地按旧规则演、服务端按新规则结，结果对不上；所以请求体必须带 rules，
 * 没带、不是整数或低于当前 RULES_VERSION 一律回 409 need_reload，页面提示刷新。
 * 要在钱包调用、扣奖杯、写存储之前调；通过回 null。
 */
export function checkRules(body: Record<string, unknown>, cookies: readonly string[] = []): Response | null {
  const r = body.rules;
  if (typeof r === 'number' && Number.isInteger(r) && r >= RULES_VERSION) return null;
  return fail(409, 'need_reload', cookies);
}

/** 北京时间的日期（钱包的"天"也按北京时间） */
export function beijingDay(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 钱包里海岛桌上 ref 这一份带入了多少（平台 WalletView.stakes）；没有或形状不对为 null */
function stakeAmount(wallet: unknown, ref: string): number | null {
  const stakes = (wallet as { stakes?: unknown } | null)?.stakes;
  if (!Array.isArray(stakes)) return null;
  const st = stakes.find((x): x is { game: string; ref: string; amount: number } => !!x && typeof x === 'object' && x.game === 'haidao' && x.ref === ref);
  return st && Number.isSafeInteger(st.amount) && st.amount > 0 ? st.amount : null;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([p, t]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const okShape = (r: unknown): r is WalletReply => r !== null && typeof r === 'object' && typeof (r as { ok?: unknown }).ok === 'boolean';

export async function handleLive(req: Request, env: LiveEnv, ports: Ports | null, now = Date.now(), timeoutMs = WALLET_TIMEOUT_MS): Promise<Response> {
  const url = new URL(req.url);
  const kind = liveKindOf(url.pathname);
  const prefix = kind ? LIVE_KINDS[kind].prefix : '';
  const action = kind ? ACTIONS.find((a) => a === url.pathname.slice(prefix.length)) : undefined;
  if (!kind || !action || (kind !== 'live' && (action === 'exchange' || action === 'ingot' || action === 'shop'))) return fail(404, 'not_found');
  if (req.method !== (action === 'today' ? 'GET' : 'POST')) return fail(405, 'method');
  // 单独部署没有平台钱包：说清楚是"这里没有"（501），页面把实盘入口藏起来
  if (isStandalone(env)) return fail(501, 'no_wallet');
  // GET today：今天还能打几场实盘、还能换几次（只读，选档页灰不灰用）
  if (action === 'today') {
    if (!ports) return fail(501, 'no_wallet');
    const who = await whoIs(req, env.ARCADE);
    if ('error' in who) return who.error === 'anonymous' ? fail(401, 'login', who.setCookie) : fail(503, 'unavailable');
    const me = ports.base(who.user.userId);
    const day = beijingDay(now);
    const max = kindDaily(env, kind);
    const slots = { left: await me.slotLeft(kind, day, max), max };
    if (kind !== 'live') return json({ ok: true, [kind]: slots }, 200, who.setCookie);
    const exchange = { left: await me.exchangeLeft(day, EXCHANGE_PER_DAY), max: EXCHANGE_PER_DAY };
    // 金银锭今天还能换多少筹码（钱包管的额度）；看不了钱包就不带，页面写"额度暂时看不到"
    const v = env.WALLET ? await withTimeout(env.WALLET.view(who.user.userId), timeoutMs).catch(() => 'timeout' as const) : 'timeout';
    const ingot = v !== 'timeout' && okShape(v) && v.ok && Number.isSafeInteger(v.exchangeLeft) && Number.isSafeInteger(v.exchangeCap) ? { left: v.exchangeLeft, cap: v.exchangeCap } : undefined;
    return json({ ok: true, live: slots, exchange, ...(ingot ? { ingot } : {}) }, 200, who.setCookie);
  }
  if (req.headers.get('X-Arcade') !== '1' || req.headers.get('Origin') !== url.origin) return fail(403, 'csrf');

  const len = Number(req.headers.get('content-length') ?? NaN);
  if (!(len > 0 && len <= BODY_MAX)) return fail(len > BODY_MAX ? 413 : 400, len > BODY_MAX ? 'too_large' : 'bad_request');
  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > BODY_MAX) return fail(413, 'too_large');
    const v: unknown = JSON.parse(text);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return fail(400, 'bad_request');
    body = v as Record<string, unknown>;
  } catch {
    return fail(400, 'bad_request');
  }
  if (action === 'buyin') {
    const stale = checkRules(body);
    if (stale) return stale;
  }
  const ref = body.ref;
  const ns = LIVE_KINDS[kind].ns;
  if (typeof ref !== 'string' || !(action === 'exchange' || action === 'ingot' || action === 'shop' ? EX_REF_RE : ns ? NS_REF_RE : REF_RE).test(ref) || ALL_NS.some((p) => ref.startsWith(p))) return fail(400, 'bad_ref');
  // 钱包里的 ref 加这种实盘的前缀，Base 里的场次记录仍按浏览器给的 ref
  const wref = `${ns}${ref}`;
  // 浏览器记着带入的账号：结回、放弃时带上，现在登录的不是他就不动钱包
  const expect = body.user;
  if (expect !== undefined && (typeof expect !== 'string' || expect === '' || expect.length > 128)) return fail(400, 'bad_user');

  // 先校验完参数再认人：不合格的请求不去问平台
  let tierId: LiveTier | null = null;
  let bp = 0;
  let into: 'gold' | 'wood' = 'gold';
  if (action === 'buyin' || action === 'settle') {
    if (!isLiveTier(body.tier)) return fail(400, 'bad_tier');
    if (kind === 'td' && action === 'buyin' && !tdLiveOpen(body.tier)) return fail(400, 'tier_closed');
    tierId = body.tier;
  }
  if (action === 'settle') {
    const b = body.bp;
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > LIVE_MAX_BP) return fail(400, 'bad_bp');
    bp = b;
  }
  if (action === 'exchange') {
    if (body.into !== 'gold' && body.into !== 'wood') return fail(400, 'bad_into');
    into = body.into;
  }
  let price = 0;
  if (action === 'shop') {
    const item = body.item;
    if (typeof item !== 'string' || !Object.hasOwn(CHIP_SHOP, item)) return fail(400, 'bad_item');
    price = CHIP_SHOP[item]!;
  }
  let ingots = 0;
  if (action === 'ingot') {
    const n = body.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > INGOT_MAX) return fail(400, 'bad_amount');
    ingots = n;
  }
  // 兑换名额、实盘每日场次都记在 Base：没有 DO 绑定就当没有这个功能
  if ((action === 'exchange' || action === 'buyin') && !ports) return fail(501, 'no_wallet');

  const who = await whoIs(req, env.ARCADE);
  if ('error' in who) return who.error === 'anonymous' ? fail(401, 'login', who.setCookie) : fail(503, 'unavailable');
  const { userId } = who.user;
  const ck = who.setCookie;
  if (expect !== undefined && expect !== userId) return fail(409, 'wrong_user', ck);
  const w = env.WALLET;
  if (!w) return fail(503, 'unavailable', ck);

  try {
    if (action === 'exchange') return await exchange(w, ports!, userId, ref, into, now, timeoutMs, ck);
    if (action === 'shop') return await shop(w, userId, ref, price, now, timeoutMs, ck);
    if (action === 'ingot') {
      // 金银锭换筹码：钱包按 op 去重、按天管额度，Base 不记（和筹码换资源的 hx-<ref>-in / -out 用不同的 op，撞不上）
      const res = await withTimeout(w.exchange({ userId, game: 'haidao', op: `${EX_NS}i-${ref}`, amount: ingots * INGOT_CHIPS }), timeoutMs);
      if (res === 'timeout' || !okShape(res)) return fail(503, 'unavailable', ck);
      return json({ ...res, user: userId }, 200, ck);
    }
    let call: Promise<WalletReply>;
    if (action === 'buyin') {
      // 每天场次上限：先占一场（按 ref 幂等），满了 429、不碰钱包；钱包拒了再退回这一场
      const max = kindDaily(env, kind);
      const me = ports!.base(userId);
      const slot = await me.slotBegin(kind, ref, beijingDay(now), max);
      if (!slot.ok) return json({ ok: false, error: 'live_daily', max }, 429, ck);
      const res = await withTimeout(w.buyin({ userId, game: 'haidao', ref: wref, tier: tierId!, amount: LIVE_STAKE[tierId!], until: now + BUYIN_TTL_MS, mode: 'client', op: `${wref}-in` }), timeoutMs);
      if (res === 'timeout' || !okShape(res)) return fail(503, 'unavailable', ck);
      if (!res.ok) await me.slotUndo(kind, ref);
      return json({ ...res, left: res.ok ? slot.left : slot.left + 1, max, user: userId }, 200, ck);
    } else if (action === 'refund') {
      call = w.refund({ userId, game: 'haidao', ref: wref, mode: 'client', op: `${wref}-refund` });
    } else {
      call = (async () => {
        const v = await w.view(userId);
        // 看不了钱包就当连不上（503，浏览器过会儿重发），不退回去按浏览器报的档位算
        if (!okShape(v) || !v.ok) throw new Error('view');
        const base = stakeAmount(v.wallet, wref) ?? LIVE_STAKE[tierId!];
        return w.settle({ userId, game: 'haidao', ref: wref, amount: liveReturn(base, bp), mode: 'client', op: `${wref}-out` });
      })();
    }
    const res = await withTimeout(call, timeoutMs);
    if (res === 'timeout' || !okShape(res)) return fail(503, 'unavailable', ck);
    // 带上是谁：浏览器记进 haidao.live，之后结回、放弃时带回来对账号
    return json({ ...res, user: userId }, 200, ck);
  } catch {
    return fail(503, 'unavailable', ck);
  }
}

/**
 * 筹码装饰：带入价钱（放进装得下的最低一档）→ 结回 0（筹码归庄家）。钱包按 op 去重，重发同一个 ref 只扣一次；
 * 收藏由浏览器在扣成之后加进存档（纯外观，不防作弊）。
 */
async function shop(w: WalletRpc, userId: string, ref: string, price: number, now: number, timeoutMs: number, ck: readonly string[]): Promise<Response> {
  const tier = LIVE_TIER_IDS.find((t) => LIVE_STAKE[t] >= price) ?? 'lux';
  const wref = `${SHOP_NS}${ref}`;
  const buy = await withTimeout(w.buyin({ userId, game: 'haidao', ref: wref, tier, amount: price, until: now + BUYIN_TTL_MS, mode: 'client', op: `${wref}-in` }), timeoutMs);
  if (buy === 'timeout' || !okShape(buy)) return fail(503, 'unavailable', ck);
  if (!buy.ok) return json({ ok: false, error: buy.error, user: userId }, 200, ck);
  const out = await withTimeout(w.settle({ userId, game: 'haidao', ref: wref, amount: 0, mode: 'client', op: `${wref}-out` }), timeoutMs);
  if (out === 'timeout' || !okShape(out)) return fail(503, 'unavailable', ck);
  return json({ ...out, user: userId }, 200, ck);
}

/** 兑换：占名额 → 带入一份小档 → 结回 0 → 记待领。钱包按 op 去重，中途断了浏览器用同一个 ref 重发只扣一次 */
async function exchange(w: WalletRpc, ports: Ports, userId: string, ref: string, into: 'gold' | 'wood', now: number, timeoutMs: number, ck: readonly string[]): Promise<Response> {
  const me = ports.base(userId);
  const got = into === 'gold' ? { gold: EXCHANGE_GOLD, wood: 0 } : { gold: 0, wood: EXCHANGE_WOOD };
  const b = await me.exchangeBegin(ref, beijingDay(now), EXCHANGE_PER_DAY);
  if (!b.ok) return json({ ok: false, error: b.error }, 200, ck);
  if (b.state === 'gold' || b.state === 'wood') {
    const g = b.state === 'gold' ? { gold: EXCHANGE_GOLD, wood: 0 } : { gold: 0, wood: EXCHANGE_WOOD };
    return json({ ok: true, dup: true, pending: { raidId: ref, ...g }, user: userId }, 200, ck);
  }
  const wref = exWalletRef(ref);
  const buy = await withTimeout(w.buyin({ userId, game: 'haidao', ref: wref, tier: 'small', amount: EXCHANGE_CHIPS, until: now + BUYIN_TTL_MS, mode: 'client', op: `${wref}-in` }), timeoutMs);
  if (buy === 'timeout' || !okShape(buy)) return fail(503, 'unavailable', ck);
  if (!buy.ok) {
    // 余额不够之类：名额退回，原样告诉浏览器
    await me.exchangeUndo(ref);
    return json({ ok: false, error: buy.error, user: userId }, 200, ck);
  }
  const out = await withTimeout(w.settle({ userId, game: 'haidao', ref: wref, amount: 0, mode: 'client', op: `${wref}-out` }), timeoutMs);
  if (out === 'timeout' || !okShape(out)) return fail(503, 'unavailable', ck);
  if (!out.ok) return json({ ok: false, error: out.error, user: userId }, 200, ck);
  const d = await me.exchangeDone(ref, into, got);
  return json({ ok: true, wallet: out.wallet, pending: d.pending, left: await me.exchangeLeft(beijingDay(now), EXCHANGE_PER_DAY), user: userId }, 200, ck);
}
