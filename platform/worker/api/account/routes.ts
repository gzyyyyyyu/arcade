/** 账号：登录注册、改密码、邀请码的路由条目（router.ts 按功能拼成总表；通用检查在 router.ts）。 */
import type { Route } from '../core/route';
import { adminCodes, codeIdParams, createCode, getInviteRules, listMyCodes, revokeCode } from './invite-codes';
import { changePassword, changeRecoveryCode, deleteAccount, logoutOthers } from './account';
import { getMe, login, logout, patchMe, recover, register } from './auth';

export const ACCOUNT_ROUTES: Route[] = [
  { method: 'GET', path: '/api/me', cat: 'social', auth: 'optional', handler: getMe },
  { method: 'PATCH', path: '/api/me', cat: 'social', auth: 'user', handler: patchMe },
  { method: 'POST', path: '/api/auth/register', cat: 'reg', auth: 'none', growth: true, handler: register },
  { method: 'POST', path: '/api/auth/login', cat: 'auth', auth: 'none', handler: login },
  { method: 'POST', path: '/api/auth/recover', cat: 'auth', auth: 'none', handler: recover },
  { method: 'POST', path: '/api/auth/logout', cat: 'acct', auth: 'none', acct: 'always', alwaysOpen: true, handler: logout },
  { method: 'POST', path: '/api/account/password', cat: 'acct', auth: 'user', acct: 'capped', handler: changePassword },
  { method: 'POST', path: '/api/account/recovery-code', cat: 'acct', auth: 'user', acct: 'stop', handler: changeRecoveryCode },
  { method: 'POST', path: '/api/account/logout-others', cat: 'acct', auth: 'user', acct: 'capped', handler: logoutOthers },
  { method: 'POST', path: '/api/account/delete', cat: 'acct', auth: 'user', acct: 'always', handler: deleteAccount },
  // 邀请码（15.20）：生成记在"好友与资料"类；新码会让库变大，停增长档停生成
  { method: 'GET', path: '/api/invite-codes', cat: 'social', auth: 'user', handler: listMyCodes },
  { method: 'POST', path: '/api/invite-codes', cat: 'social', auth: 'user', growth: true, handler: createCode },
  { method: 'POST', path: /^\/api\/invite-codes\/([^/]+)\/revoke$/, params: codeIdParams, cat: 'social', auth: 'user', handler: revokeCode },
  { method: 'GET', path: '/api/admin/settings/invites', cat: 'acct', auth: 'admin', handler: getInviteRules },
  { method: 'GET', path: '/api/admin/invite-codes', cat: 'acct', auth: 'admin', handler: adminCodes },
];
