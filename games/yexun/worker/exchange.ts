/**
 * 铜钱换筹码（DESIGN 3.8a）：POST /games/yexun/api/exchange/{view,do}，转给平台钱包（服务绑定 WALLET，props.game=yexun）。浏览器从不直接碰钱包。
 *
 * - view：今天还能换多少（exchangeLeft）、今天上限（exchangeCap，0 = 关了）。只回这两个数，不回钱包别的内容。
 * - do：{ op, amount }。op 是浏览器生成的幂等号（`xc-` 前缀，和实盘的 ref 分开，钱包去重窗口共用），amount 是要换进的筹码数。
 *   铜钱存在浏览器里，Worker 验不了余额（账号策略不防作弊）：每天的额度由钱包管，是唯一的兜底。
 * 校验顺序和实盘一样：方法/路径 → 单独部署（501）→ CSRF → 请求体 → 认人 → 钱包。
 */
import { fail, readBody, reply, standalone, walletCall, WALLET_TIMEOUT_MS, type LiveEnv } from './live.ts';

export const EXCHANGE_PREFIX = '/games/yexun/api/exchange/';
/** 钱包收 8–64 位；夜巡的兑换号固定 `xc-` 开头 */
const OP_RE = /^xc-[A-Za-z0-9_-]{5,61}$/;
/** 一次最多换这么多（钱包每天默认 2,000，管理页能调高；这里只挡明显的坏数） */
const AMOUNT_MAX = 1_000_000;

export async function handleExchange(req: Request, env: LiveEnv, timeoutMs = WALLET_TIMEOUT_MS): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.slice(EXCHANGE_PREFIX.length);
  if (action !== 'view' && action !== 'do') return fail(404, 'not_found');
  if (req.method !== 'POST') return fail(405, 'method');
  if (standalone(env)) return fail(501, 'no_wallet');
  if (req.headers.get('X-Arcade') !== '1' || req.headers.get('Origin') !== url.origin) return fail(403, 'csrf');
  const body = await readBody(req);
  if (!body) return fail(400, 'bad_request');
  const expect = body.user;
  if (expect !== undefined && (typeof expect !== 'string' || expect === '' || expect.length > 128)) return fail(400, 'bad_user');

  if (action === 'view') {
    const res = await walletCall(req, env, timeoutMs, expect, 'view', (w, userId) => w.view(userId));
    if (res.status !== 200) return res;
    // 只转额度两个数（余额、桌上的份不给兑换页）
    const v = (await res.json()) as Record<string, unknown>;
    const cookies = res.headers.getSetCookie();
    if (v.ok !== true) return reply(200, { ok: false, error: v.error, user: v.user }, cookies);
    return reply(200, { ok: true, exchangeLeft: v.exchangeLeft, exchangeCap: v.exchangeCap, user: v.user }, cookies);
  }
  const op = body.op;
  const amount = body.amount;
  if (typeof op !== 'string' || !OP_RE.test(op)) return fail(400, 'bad_op');
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > AMOUNT_MAX) return fail(400, 'bad_amount');
  return walletCall(req, env, timeoutMs, expect, 'exchange', (w, userId) => w.exchange({ userId, game: 'yexun', op, amount }));
}
