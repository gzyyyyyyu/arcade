/**
 * 路由锁定：每条路由「方法 + 路径 → 谁处理、抽出什么参数、走哪档预算和认证」，以及打错的请求现在回什么。
 * 拆路由表（按功能放到各目录的 routes.ts）时这张表一条都不能改：改了就是改了行为。
 * 期望值是显式的表，不用快照文件。
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../worker/api/lib/http';
import { SAVE_BODY_LIMIT } from '../worker/api/scores/saves';
import { matchRoute, ROUTES } from '../worker/api/router';

/** [方法, 样例路径, 处理函数名, 抽出的路由参数, 预算类别/认证方式 + 特殊标记] */
const ROUTE_TABLE: [string, string, string, Record<string, string>, string][] = [
  ['GET', '/api/health', 'health', {}, 'mon/none alwaysOpen=true'],
  ['GET', '/api/monitor', 'monitorStatus', {}, 'mon/none alwaysOpen=true'],
  ['POST', '/api/client-error', 'clientError', {}, 'mon/none quiet=true beacon=true'],
  ['GET', '/api/me', 'getMe', {}, 'social/optional'],
  ['PATCH', '/api/me', 'patchMe', {}, 'social/user'],
  ['PUT', '/api/me/games', 'putGamePrefs', {}, 'social/user'],
  ['POST', '/api/auth/register', 'register', {}, 'reg/none growth=true'],
  ['POST', '/api/auth/login', 'login', {}, 'auth/none'],
  ['POST', '/api/auth/recover', 'recover', {}, 'auth/none'],
  ['POST', '/api/auth/logout', 'logout', {}, 'acct/none acct=always alwaysOpen=true'],
  ['POST', '/api/account/password', 'changePassword', {}, 'acct/user acct=capped'],
  ['POST', '/api/account/recovery-code', 'changeRecoveryCode', {}, 'acct/user acct=stop'],
  ['POST', '/api/account/logout-others', 'logoutOthers', {}, 'acct/user acct=capped'],
  ['POST', '/api/account/delete', 'deleteAccount', {}, 'acct/user acct=always'],
  ['POST', '/api/me/friend-code', 'changeFriendCode', {}, 'social/user'],
  ['GET', '/api/friends', 'listFriends', {}, 'social/user'],
  ['GET', '/api/friends/overtakes', 'overtakes', {}, 'board/user'],
  ['GET', '/api/friends/week/kaipan', 'friendsWeek', { 'gameId': 'kaipan' }, 'board/user'],
  ['POST', '/api/presence', 'postPresence', {}, 'live/user quiet=true'],
  ['POST', '/api/invites', 'sendInvite', {}, 'live/user'],
  ['GET', '/api/feed', 'listFeed', {}, 'live/user'],
  ['POST', '/api/feed', 'postMoment', {}, 'live/user quiet=true'],
  ['POST', '/api/feed/abcdefghiABCDEFGHIJK/react', 'react', { 'id': 'abcdefghiABCDEFGHIJK' }, 'live/user'],
  ['GET', '/api/invites', 'listInvites', {}, 'live/user'],
  ['POST', '/api/invites/ABCDEFGHIJKLMNOP/dismiss', 'dismissInvite', { 'id': 'ABCDEFGHIJKLMNOP' }, 'live/user'],
  ['PUT', '/api/meetup', 'putMeetup', {}, 'live/user'],
  ['DELETE', '/api/meetup', 'deleteMeetup', {}, 'live/user'],
  ['GET', '/api/stats/me', 'getStats', { 'userId': 'me' }, 'social/user'],
  ['GET', '/api/leaderboard', 'getLeaderboard', {}, 'board/user'],
  ['GET', '/api/friends/code/ABCD2345', 'lookupCode', { 'code': 'ABCD2345' }, 'social/user'],
  ['POST', '/api/friends/requests', 'sendRequest', {}, 'social/user'],
  ['POST', '/api/friends/AAAAAAAAAAAAAAAAAAAAAA/accept', 'acceptRequest', { 'userId': 'AAAAAAAAAAAAAAAAAAAAAA' }, 'social/user'],
  ['POST', '/api/friends/AAAAAAAAAAAAAAAAAAAAAA/decline', 'declineRequest', { 'userId': 'AAAAAAAAAAAAAAAAAAAAAA' }, 'social/user'],
  ['DELETE', '/api/friends/AAAAAAAAAAAAAAAAAAAAAA', 'removeFriend', { 'userId': 'AAAAAAAAAAAAAAAAAAAAAA' }, 'social/user'],
  ['GET', '/api/blocks', 'listBlocks', {}, 'social/user'],
  ['POST', '/api/blocks', 'block', {}, 'social/user'],
  ['DELETE', '/api/blocks/AAAAAAAAAAAAAAAAAAAAAA', 'unblock', { 'userId': 'AAAAAAAAAAAAAAAAAAAAAA' }, 'social/user'],
  ['GET', '/api/invite-codes', 'listMyCodes', {}, 'social/user'],
  ['POST', '/api/invite-codes', 'createCode', {}, 'social/user growth=true'],
  ['POST', '/api/invite-codes/abcdefghiABCDEFGHIJK/revoke', 'revokeCode', { 'id': 'abcdefghiABCDEFGHIJK' }, 'social/user'],
  ['GET', '/api/admin/settings/invites', 'getInviteRules', {}, 'acct/admin'],
  ['POST', '/api/admin/settings/invites', 'setInviteRules', {}, 'acct/admin acct=capped'],
  ['GET', '/api/admin/invite-codes', 'adminCodes', {}, 'acct/admin'],
  ['POST', '/api/admin/invite-codes', 'createMultiCode', {}, 'acct/admin acct=capped'],
  ['POST', '/api/admin/invite-codes/abcdefghiABCDEFGHIJK/revoke', 'adminRevokeCode', { 'id': 'abcdefghiABCDEFGHIJK' }, 'acct/admin acct=capped'],
  ['POST', '/api/admin/users/AAAAAAAAAAAAAAAAAAAAAA/invite-quota', 'setUserInviteQuota', { 'userId': 'AAAAAAAAAAAAAAAAAAAAAA' }, 'acct/admin acct=capped'],
  ['GET', '/api/admin/users', 'listUsers', {}, 'acct/admin'],
  ['GET', '/api/admin/settings/registration', 'getRegistration', {}, 'acct/admin'],
  ['POST', '/api/admin/settings/registration', 'setRegistration', {}, 'acct/admin acct=capped'],
  ['GET', '/api/admin/settings/notice', 'getNotice', {}, 'acct/admin'],
  ['POST', '/api/admin/settings/notice', 'setNotice', {}, 'acct/admin acct=capped'],
  ['GET', '/api/admin/settings/games', 'getHiddenGames', {}, 'acct/admin'],
  ['POST', '/api/admin/settings/games', 'setHiddenGames', {}, 'acct/admin acct=capped'],
  ['GET', '/api/admin/settings/wallet', 'getWalletRules', {}, 'acct/admin'],
  ['POST', '/api/admin/settings/wallet', 'setWalletRules', {}, 'acct/admin acct=capped'],
  ['POST', '/api/admin/users', 'createUser', {}, 'acct/admin acct=capped'],
  ['POST', '/api/admin/users/AAAAAAAAAAAAAAAAAAAAAA/password', 'resetPassword', { 'userId': 'AAAAAAAAAAAAAAAAAAAAAA' }, 'acct/admin acct=capped'],
  ['POST', '/api/admin/users/AAAAAAAAAAAAAAAAAAAAAA/delete', 'deleteUser', { 'userId': 'AAAAAAAAAAAAAAAAAAAAAA' }, 'acct/admin acct=capped'],
  ['POST', '/api/scores', 'submitScore', {}, 'board/user growth=true'],
  ['POST', '/api/challenges', 'createChallenge', {}, 'board/user growth=true'],
  ['GET', '/api/challenges/abcdefghiABCDEFGHIJK', 'getChallenge', { 'id': 'abcdefghiABCDEFGHIJK' }, 'board/user'],
  ['POST', '/api/challenges/abcdefghiABCDEFGHIJK/results', 'submitChallenge', { 'id': 'abcdefghiABCDEFGHIJK' }, 'board/user growth=true'],
  ['GET', '/api/boards/kaipan/daily-2026-11-01-classic', 'getBoard', { 'gameId': 'kaipan', 'boardId': 'daily-2026-11-01-classic' }, 'board/user'],
  ['GET', '/api/saves/kaipan', 'getSaves', { 'gameId': 'kaipan' }, 'save/user'],
  ['GET', '/api/wallet', 'getWallet', {}, 'wallet/user'],
  ['POST', '/api/wallet/relief', 'claimRelief', {}, 'wallet/user'],
  ['GET', '/api/admin/wallet-stats', 'listWalletStats', {}, 'acct/admin'],
  ['GET', '/api/admin/play-tally', 'adminPlayTally', {}, 'acct/admin'],
  ['GET', '/api/admin/overview', 'adminOverview', {}, 'acct/admin'],
  ['POST', '/api/admin/wallet/adjust', 'adminAdjust', {}, 'acct/admin acct=stop'],
  ['GET', '/api/admin/wallet-adjustments', 'adminRecentAdjustments', {}, 'acct/admin'],
  ['GET', '/api/admin/wallet/alice_1', 'adminLookup', { 'username': 'alice_1' }, 'acct/admin'],
  ['PUT', '/api/saves/kaipan/main', 'putSave', { 'gameId': 'kaipan', 'slot': 'main' }, 'save/user bodyLimit=SAVE_BODY_LIMIT'],
];

/** 打错的请求：[方法, 路径, 现在的结果]。「状态 错误码」是被拒的；「函数名 参数」是照样匹配上的（参数校验宽松的那条） */
const WRONG_TABLE: [string, string, string][] = [
  ['GET', '/api/nope', '404 not_found'],
  ['GET', '/', '404 not_found'],
  ['GET', '/health', '404 not_found'],
  ['POST', '/api', '404 not_found'],
  ['GET', '/api/', '404 not_found'],
  ['DELETE', '/api/health', '405 method_not_allowed'],
  ['POST', '/api/me', '405 method_not_allowed'],
  ['PUT', '/api/me', '405 method_not_allowed'],
  ['GET', '/api/auth/login', '405 method_not_allowed'],
  ['GET', '/api/scores', '405 method_not_allowed'],
  ['POST', '/api/leaderboard', '405 method_not_allowed'],
  ['GET', '/api/saves/kaipan/main', '405 method_not_allowed'],
  ['POST', '/api/saves/kaipan', '405 method_not_allowed'],
  ['DELETE', '/api/wallet', '405 method_not_allowed'],
  ['POST', '/api/admin/overview', '405 method_not_allowed'],
  ['GET', '/api/friends/AAAAAAAAAAAAAAAAAAAAAA', '405 method_not_allowed'],
  ['GET', '/api/friends/week', '405 method_not_allowed'],
  ['POST', '/api/friends/overtakes', '405 method_not_allowed'],
  ['GET', '/api/health/x', '404 not_found'],
  ['GET', '/api/friends/week/kaipan/x', '404 not_found'],
  ['GET', '/api/boards/kaipan', '404 not_found'],
  ['GET', '/api/boards/kaipan/daily-2026-11-01-classic/x', '404 not_found'],
  ['POST', '/api/feed/abcdefghiABCDEFGHIJK', '404 not_found'],
  ['POST', '/api/feed/react', '404 not_found'],
  ['POST', '/api/auth', '404 not_found'],
  ['GET', '/api/saves', '404 not_found'],
  ['GET', '/api/saves//main', '404 not_found'],
  ['PUT', '/api/saves/kaipan/main/x', '404 not_found'],
  ['GET', '/API/health', '404 not_found'],
  ['GET', '/api/Health', '404 not_found'],
  ['GET', '/Api/me', '404 not_found'],
  ['GET', '/api/friends/week/KAIPAN', '404 unknown_game'],
  ['PUT', '/api/saves/KAIPAN/main', '404 unknown_game'],
  ['GET', '/api/ME', '404 not_found'],
  ['GET', '/api/health/', '404 not_found'],
  ['GET', '/api/friends/', '404 not_found'],
  ['POST', '/api/auth/login/', '404 not_found'],
  ['GET', '/api/me/', '404 not_found'],
  ['PUT', '/api/saves/kaipan/main/', '404 not_found'],
  ['GET', '/api/stats/me/', '404 not_found'],
  ['GET', '/api/challenges/short', '404 not_found'],
  ['GET', '/api/challenges/abcdefghiABCDEFGHIJKx', '404 not_found'],
  ['DELETE', '/api/friends/short', '404 not_found'],
  ['DELETE', '/api/friends/overtakes', '404 not_found'],
  ['POST', '/api/friends/short/accept', '404 not_found'],
  ['DELETE', '/api/blocks/short', '404 not_found'],
  ['GET', '/api/stats/short', '404 not_found'],
  ['GET', '/api/stats/ME', '404 not_found'],
  ['GET', '/api/saves/nosuchgame', '404 unknown_game'],
  ['PUT', '/api/saves/kaipan/Bad_Slot', '422 invalid_slot'],
  ['PUT', '/api/saves/nosuchgame/main', '404 unknown_game'],
  ['GET', '/api/boards/kaipan/nope', '404 not_found'],
  ['GET', '/api/boards/nosuchgame/endless', '404 unknown_game'],
  ['GET', '/api/friends/code/!!!', '404 not_found'],
  ['GET', '/api/friends/code/%E0', '404 not_found'],
  ['GET', '/api/friends/week/racing', '404 not_found'],
  ['GET', '/api/friends/week/nosuchgame', '404 unknown_game'],
  ['POST', '/api/feed/short/react', '404 not_found'],
  ['POST', '/api/invites/short/dismiss', '404 not_found'],
  ['POST', '/api/invite-codes/short/revoke', '404 not_found'],
  ['POST', '/api/admin/invite-codes/short/revoke', '404 not_found'],
  ['POST', '/api/admin/users/short/password', '404 not_found'],
  ['GET', '/api/admin/wallet/bad-name', 'adminLookup {}'],
  ['GET', '/api/admin/wallet/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'adminLookup {}'],
];

/** 把匹配结果压成表里的写法。路径或方法不对、路径参数不合格都会抛 ApiError，记成「状态 错误码」。 */
function describeMatch(method: string, path: string) {
  try {
    const hit = matchRoute(method, path);
    const r = hit.route;
    const params = r.params ? r.params(hit.segments) : {};
    const flags = [
      r.growth && 'growth=true',
      r.acct && `acct=${r.acct}`,
      r.alwaysOpen && 'alwaysOpen=true',
      r.quiet && 'quiet=true',
      r.beacon && 'beacon=true',
      r.bodyLimit && `bodyLimit=${r.bodyLimit === SAVE_BODY_LIMIT ? 'SAVE_BODY_LIMIT' : r.bodyLimit}`,
    ].filter(Boolean);
    return { handler: r.handler.name, params, meta: `${r.cat}/${r.auth}${flags.length ? ` ${flags.join(' ')}` : ''}` };
  } catch (e) {
    if (e instanceof ApiError) return `${e.status} ${e.code}`;
    throw e;
  }
}

describe('路由锁定', () => {
  it('表里每条路由都在，数量对得上，没有多出来的', () => {
    expect(ROUTE_TABLE.length).toBe(ROUTES.length);
    const inTable = ROUTE_TABLE.map(([m, , h]) => `${m} ${h}`).sort();
    const inRouter = ROUTES.map((r) => `${r.method} ${r.handler.name}`).sort();
    expect(inTable).toEqual(inRouter);
  });

  it.each(ROUTE_TABLE)('%s %s → %s', (method, path, handler, params, meta) => {
    expect(describeMatch(method, path)).toEqual({ handler, params, meta });
  });

  it.each(WRONG_TABLE)('打错：%s %s → %s', (method, path, expected) => {
    const got = describeMatch(method, path);
    // 宽松的那几条照样匹配上了：写成「函数名 参数 JSON」
    const text = typeof got === 'string' ? got : `${got.handler} ${JSON.stringify(got.params)}`;
    expect(text).toBe(expected);
  });

  it('同一路径多种方法时，按方法挑对的那一条', () => {
    const u = 'AAAAAAAAAAAAAAAAAAAAAA';
    expect((describeMatch('DELETE', `/api/friends/${u}`) as { handler: string }).handler).toBe('removeFriend');
    expect((describeMatch('GET', '/api/feed') as { handler: string }).handler).toBe('listFeed');
    expect((describeMatch('POST', '/api/feed') as { handler: string }).handler).toBe('postMoment');
    expect((describeMatch('GET', '/api/me') as { handler: string }).handler).toBe('getMe');
    expect((describeMatch('PATCH', '/api/me') as { handler: string }).handler).toBe('patchMe');
  });
});
