/**
 * /api 的入口：便宜的检查在前，碰 D1 的在后（docs/platform-backend.md 15.1）。
 * Host → 路径和方法 → 熔断档位与类别预算 → X-Arcade 与 Origin → 路径参数 → 请求体 → 会话 → 各接口（内存限流、持久限流、业务）。
 */
import type { Env } from '../env';
import { BODY_LIMIT, readJsonBody } from './lib/body';
import { bearerAuth, sessionAdmin } from './ops/admin';
import { ACCOUNT_ROUTES } from './account/routes';
import { OPS_ROUTES } from './ops/routes';
import { SCORES_ROUTES } from './scores/routes';
import { SOCIAL_ROUTES } from './social/routes';
import { WALLET_ROUTES } from './wallet/routes';
import { limitsOf } from './lib/config';
import type { Ctx } from './core/context';
import type { Route } from './core/route';
import { hashIp, MissingSecretError } from './lib/crypto';
import { d1Trouble, Db, newStats, type RequestStats } from './lib/db';
import { ApiError, clearCookies, errorResponse, noContent, readCookie, SID_COOKIE, unavailable } from './lib/http';
import { effectiveTier, meter } from './lib/meter';
import { loadSession } from './account/session';

/** 路由总表：各功能目录的 routes.ts 拼起来。同一方法下没有两条路径会同时匹配同一个请求，所以拼接顺序不影响匹配（test/routes-lock.test.ts 锁着）。 */
export const ROUTES: Route[] = [...OPS_ROUTES, ...ACCOUNT_ROUTES, ...SOCIAL_ROUTES, ...SCORES_ROUTES, ...WALLET_ROUTES];

function matchPath(route: Route, pathname: string): string[] | null {
  if (typeof route.path === 'string') return route.path === pathname ? [] : null;
  const m = route.path.exec(pathname);
  return m ? m.slice(1) : null;
}

/** 路径和方法找路由：路径没有任何路由认 404，路径认但方法不对 405。纯函数，路由锁定测试直接调它。 */
export function matchRoute(method: string, pathname: string): { route: Route; segments: string[] } {
  const candidates = ROUTES.map((route) => ({ route, segments: matchPath(route, pathname) })).filter(
    (x): x is { route: Route; segments: string[] } => x.segments !== null,
  );
  if (!candidates.length) throw new ApiError(404, 'not_found');
  const hit = candidates.find((x) => x.route.method === method);
  if (!hit) throw new ApiError(405, 'method_not_allowed');
  return hit;
}

/** 最近一个请求的写入统计。只给测试断言写入行数用（同一 isolate 里读得到）。 */
export let lastStats: RequestStats = newStats();

export async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const now = Date.now();
  const limits = limitsOf(env);
  const stats = newStats();
  lastStats = stats;
  try {
    return await dispatch(request, env, now, limits, stats);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    if (e instanceof MissingSecretError) {
      console.error('missing secret', e.message);
      return errorResponse(new ApiError(503, 'busy'));
    }
    // 只记错误类型和路径，不记请求体和 cookie（5.2）
    const trouble = d1Trouble(e);
    console.error(trouble ? `d1 ${trouble}` : 'api error', new URL(request.url).pathname, e instanceof Error ? e.name : 'unknown');
    // D1 一时不行：503 加 Retry-After，和 500（我们的 bug）分开，玩家看到的是"过几秒再试"
    if (trouble) return errorResponse(unavailable(trouble === 'overloaded' ? 5 : 2));
    return errorResponse(new ApiError(500, 'internal'));
  } finally {
    if (meter.shouldFlush(limits, now, effectiveTier(env, meter.tier(limits, now)))) ctx.waitUntil(meter.flush(env.DB, limits, now));
  }
}

/** 本站地址：SITE_ORIGIN 设了按它，没设按请求自己的 origin（跨站请求的 Origin 头照样对不上，写请求照样挡得住） */
export function siteOrigin(env: Pick<Env, 'SITE_ORIGIN'>, url: URL): string {
  return env.SITE_ORIGIN || url.origin;
}

async function dispatch(
  request: Request,
  env: Env,
  now: number,
  limits: ReturnType<typeof limitsOf>,
  stats: RequestStats,
): Promise<Response> {
  const url = new URL(request.url);
  const site = siteOrigin(env, url);
  // 设了 SITE_ORIGIN 就只认那个主机名：workers.dev 之类的别的地址不经过网关限速（5.4）
  if (url.host !== new URL(site).host) throw new ApiError(404, 'not_found');
  const hit = matchRoute(request.method, url.pathname);
  const route = hit.route;
  const write = route.method !== 'GET';

  // 熔断档位与类别预算（内存里；本 isolate 第一次、跨了 UTC 天或上报失败后到了重试时间，先同步上报一次）
  await meter.ensureFresh(env.DB, limits, now);
  const tier = effectiveTier(env, meter.tier(limits, now));
  if (!route.alwaysOpen) {
    if (tier === 'off') throw meter.unreachable() ? unavailable(Math.ceil(limits.meterRetryMs / 1000)) : new ApiError(503, 'busy');
    if (write && route.quiet && (tier === 'readonly' || meter.exhausted(route.cat, limits, now))) return noContent();
    if (write && tier === 'readonly') throw new ApiError(503, 'busy');
    if (route.growth && tier === 'noGrowth') throw new ApiError(503, 'busy');
    if (write && meter.exhausted(route.cat, limits, now)) {
      const policy = route.acct;
      const allowed = policy === 'always' || (policy === 'capped' && !meter.acctOverflowExhausted(limits, now));
      if (!allowed) throw new ApiError(503, 'busy');
    }
  }

  // 管理接口带了 Authorization 就按命令行工具的令牌认证，不看 X-Arcade 和 Origin：浏览器跨站请求带不了这个头（要预检，我们不答应）
  const bearer = route.auth === 'admin' && request.headers.has('authorization');
  // 写请求：X-Arcade 和 Origin（只挡浏览器里的跨站请求，脚本能伪造，5.2）
  if (write && !bearer && ((!route.beacon && request.headers.get('x-arcade') !== '1') || request.headers.get('origin') !== site)) {
    throw new ApiError(403, 'forbidden');
  }
  const params = route.params ? route.params(hit.segments) : {};
  const body = write ? await readJsonBody(request, route.bodyLimit ?? BODY_LIMIT) : {};

  const db = new Db(env.DB, stats, route.cat);
  const sidCookie = readCookie(request, SID_COOKIE);
  let ipHash: Promise<string> | null = null;
  const c: Ctx = {
    request, env, limits, now, db, tier, body, params, sidCookie,
    session: null,
    admin: null,
    ipHash: () => (ipHash ??= hashIp(env, request.headers.get('cf-connecting-ip') ?? 'unknown')),
  };
  if (bearer) {
    await bearerAuth(c);
    return route.handler(c);
  }
  if (route.auth !== 'none' && sidCookie) {
    c.session = await loadSession(request, env, db, now);
  }
  if ((route.auth === 'user' || route.auth === 'admin') && !c.session) {
    // 带着失效的会话来的（改了密码、退出其他设备、过期）：顺手清掉两个 cookie，游戏和平台页就不会再拿它来调接口（15.1）
    throw new ApiError(401, 'unauthorized', {}, sidCookie ? clearCookies().map((v): [string, string] => ['set-cookie', v]) : {});
  }
  if (route.auth === 'admin') sessionAdmin(c);
  return route.handler(c);
}
