/** 钱包与管理页的钱包统计的路由条目（router.ts 按功能拼成总表；通用检查在 router.ts）。 */
import type { Route } from '../core/route';
import { adminAdjust, adminLookup, adminOverview, adminPlayTally, adminRecentAdjustments, claimRelief, getWallet, listWalletStats } from './api';

export const WALLET_ROUTES: Route[] = [
  // 钱包（5.9）：浏览器只能看和领补给；带入、结回、放弃只有游戏的服务端经 RPC 能调（service.ts），这里没有这几条路
  { method: 'GET', path: '/api/wallet', cat: 'wallet', auth: 'user', handler: getWallet },
  { method: 'POST', path: '/api/wallet/relief', cat: 'wallet', auth: 'user', handler: claimRelief },
  // 管理页的统计和别的管理接口一样记在账号安全类（令牌认证的那几行也在那里）
  { method: 'GET', path: '/api/admin/wallet-stats', cat: 'acct', auth: 'admin', handler: listWalletStats },
  // 今日概况：今天现算，加前 6 天的统计
  // 真人对局统计：只读汇总
  { method: 'GET', path: '/api/admin/play-tally', cat: 'acct', auth: 'admin', handler: adminPlayTally },
  { method: 'GET', path: '/api/admin/overview', cat: 'acct', auth: 'admin', handler: adminOverview },
  // 管理员调整筹码：只认管理员会话（handler 里拒令牌），写 1 行；账号安全类预算用完就停
  { method: 'POST', path: '/api/admin/wallet/adjust', cat: 'acct', auth: 'admin', acct: 'stop', handler: adminAdjust },
  { method: 'GET', path: '/api/admin/wallet-adjustments', cat: 'acct', auth: 'admin', handler: adminRecentAdjustments },
  {
    method: 'GET',
    path: /^\/api\/admin\/wallet\/([^/]+)$/,
    params: (seg): Record<string, string> => (seg[0] && /^[A-Za-z0-9_]{1,32}$/.test(seg[0]) ? { username: seg[0] } : {}),
    cat: 'acct',
    auth: 'admin',
    handler: adminLookup,
  },
];
