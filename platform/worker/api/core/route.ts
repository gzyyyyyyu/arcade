import type { Category } from '../lib/meter';
import type { Ctx } from './context';

/**
 * 账号安全类预算用完后各接口怎么办（6.6）：
 * always：照做（退出、注销）；capped：只要超额封顶没用完就照做（改密码、退出其他设备，另有每人每天上限）；stop：停（换恢复码）。
 */
type AcctPolicy = 'always' | 'capped' | 'stop';

export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** 固定路径，或带捕获组的正则（捕获到的路径段交给 params）。 */
  path: string | RegExp;
  /** 校验路径段，不合格就抛错（在读请求体和会话之前，不碰 D1）。 */
  params?: (segments: string[]) => Record<string, string>;
  /** 请求体上限，默认 BODY_LIMIT。 */
  bodyLimit?: number;
  cat: Category;
  /** user：必须登录；optional：有会话就带上；admin：命令行工具的 Bearer 令牌，或者管理员的会话（admin.ts）。 */
  auth: 'none' | 'optional' | 'user' | 'admin';
  /** 停增长档要停的接口（注册、交分）；存档槽变多、变大在 saves.ts 里按档位自己判断。 */
  growth?: boolean;
  acct?: AcctPolicy;
  /** 退出：任何档位都能用。 */
  alwaysOpen?: boolean;
  /** 可丢的写（报位置）：只读档、这一类预算用完时不写、直接 204，不打扰玩家（docs/social.md 0："超了静默丢弃"） */
  quiet?: boolean;
  /** 浏览器用 sendBeacon 发的（报错上报）：带不了 X-Arcade，只查 Origin */
  beacon?: boolean;
  handler: (c: Ctx) => Promise<Response>;
}
