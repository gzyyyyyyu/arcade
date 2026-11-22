/** 监控、管理页的设置与账号管理接口的路由条目（router.ts 按功能拼成总表；通用检查在 router.ts）。 */
import type { Route } from '../core/route';
import { adminRevokeCode, createMultiCode, setMultiCodeUses, createUser, deleteUser, getHiddenGames, getNotice, getRegistration, getWalletRules, listUsers, resetPassword, setHiddenGames, setInviteRules, setNotice, setRegistration, setUserInviteQuota, setWalletRules } from './admin';
import { clientError, health, monitorStatus } from './monitor';
import { codeIdParams } from '../account/invite-codes';
import { userParams } from '../core/context';

export const OPS_ROUTES: Route[] = [
  // 监控（第 16 节）：健康检查和巡检状态公开只读，任何档位都答；报错上报写不了就静默 204
  { method: 'GET', path: '/api/health', cat: 'mon', auth: 'none', alwaysOpen: true, handler: health },
  { method: 'GET', path: '/api/monitor', cat: 'mon', auth: 'none', alwaysOpen: true, handler: monitorStatus },
  { method: 'POST', path: '/api/client-error', cat: 'mon', auth: 'none', quiet: true, beacon: true, handler: clientError },
  { method: 'POST', path: '/api/admin/settings/invites', cat: 'acct', auth: 'admin', acct: 'capped', handler: setInviteRules },
  { method: 'POST', path: '/api/admin/invite-codes', cat: 'acct', auth: 'admin', acct: 'capped', handler: createMultiCode },
  { method: 'POST', path: /^\/api\/admin\/invite-codes\/([^/]+)\/revoke$/, params: codeIdParams, cat: 'acct', auth: 'admin', acct: 'capped', handler: adminRevokeCode },
  { method: 'POST', path: /^\/api\/admin\/invite-codes\/([^/]+)\/uses$/, params: codeIdParams, cat: 'acct', auth: 'admin', acct: 'capped', handler: setMultiCodeUses },
  {
    method: 'POST',
    path: /^\/api\/admin\/users\/([^/]+)\/invite-quota$/,
    params: userParams,
    cat: 'acct',
    auth: 'admin',
    acct: 'capped',
    handler: setUserInviteQuota,
  },
  { method: 'GET', path: '/api/admin/users', cat: 'acct', auth: 'admin', handler: listUsers },
  { method: 'GET', path: '/api/admin/settings/registration', cat: 'acct', auth: 'admin', handler: getRegistration },
  { method: 'POST', path: '/api/admin/settings/registration', cat: 'acct', auth: 'admin', acct: 'capped', handler: setRegistration },
  { method: 'GET', path: '/api/admin/settings/notice', cat: 'acct', auth: 'admin', handler: getNotice },
  { method: 'POST', path: '/api/admin/settings/notice', cat: 'acct', auth: 'admin', acct: 'capped', handler: setNotice },
  // 默认隐藏的游戏（15.21）：每个人还能在设置 → 偏好里改
  { method: 'GET', path: '/api/admin/settings/games', cat: 'acct', auth: 'admin', handler: getHiddenGames },
  { method: 'POST', path: '/api/admin/settings/games', cat: 'acct', auth: 'admin', acct: 'capped', handler: setHiddenGames },
  // 钱包规则：补给额、单机每日净赢份数、新号筹码、单次调整上限，改了即时生效
  { method: 'GET', path: '/api/admin/settings/wallet', cat: 'acct', auth: 'admin', handler: getWalletRules },
  { method: 'POST', path: '/api/admin/settings/wallet', cat: 'acct', auth: 'admin', acct: 'capped', handler: setWalletRules },
  { method: 'POST', path: '/api/admin/users', cat: 'acct', auth: 'admin', acct: 'capped', handler: createUser },
  {
    method: 'POST',
    path: /^\/api\/admin\/users\/([^/]+)\/password$/,
    params: userParams,
    cat: 'acct',
    auth: 'admin',
    acct: 'capped',
    handler: resetPassword,
  },
  { method: 'POST', path: /^\/api\/admin\/users\/([^/]+)\/delete$/, params: userParams, cat: 'acct', auth: 'admin', acct: 'capped', handler: deleteUser },
];
