/** 好友、屏蔽、动态、邀请、挑战、在线的路由条目（router.ts 按功能拼成总表；通用检查在 router.ts）。 */
import type { Route } from '../core/route';
import { acceptRequest, block, changeFriendCode, codeParams, declineRequest, listBlocks, listFriends, lookupCode, removeFriend, sendRequest, unblock } from './friends';
import { challengeParams, createChallenge, getChallenge, submitChallenge } from './challenges';
import { dismissInvite, inviteParams, listInvites, sendInvite } from './invites';
import { feedParams, listFeed, postMoment, react } from './feed';
import { friendsWeek, overtakes, weekParams } from './friends-week';
import { postPresence } from './presence';
import { deleteMeetup, putMeetup } from './meetups';
import { userParams } from '../core/context';

export const SOCIAL_ROUTES: Route[] = [
  { method: 'POST', path: '/api/me/friend-code', cat: 'social', auth: 'user', handler: changeFriendCode },
  { method: 'GET', path: '/api/friends', cat: 'social', auth: 'user', handler: listFriends },
  { method: 'GET', path: '/api/friends/overtakes', cat: 'board', auth: 'user', handler: overtakes },
  { method: 'GET', path: /^\/api\/friends\/week\/([^/]+)$/, params: weekParams, cat: 'board', auth: 'user', handler: friendsWeek },
  // 好友在线（15.13）：每人每 2 分钟最多写 1 行；写不了就静默 204
  { method: 'POST', path: '/api/presence', cat: 'live', auth: 'user', quiet: true, handler: postPresence },
  { method: 'POST', path: '/api/invites', cat: 'live', auth: 'user', handler: sendInvite },
  { method: 'GET', path: '/api/feed', cat: 'live', auth: 'user', handler: listFeed },
  { method: 'POST', path: '/api/feed', cat: 'live', auth: 'user', quiet: true, handler: postMoment },
  { method: 'POST', path: /^\/api\/feed\/([^/]+)\/react$/, params: feedParams, cat: 'live', auth: 'user', handler: react },
  { method: 'GET', path: '/api/invites', cat: 'live', auth: 'user', handler: listInvites },
  { method: 'POST', path: /^\/api\/invites\/([^/]+)\/dismiss$/, params: inviteParams, cat: 'live', auth: 'user', handler: dismissInvite },
  // 约局（15.22）：每人每天最多 meetupsPerDay 次
  { method: 'PUT', path: '/api/meetup', cat: 'live', auth: 'user', handler: putMeetup },
  { method: 'DELETE', path: '/api/meetup', cat: 'live', auth: 'user', handler: deleteMeetup },
  { method: 'GET', path: /^\/api\/friends\/code\/([^/]+)$/, params: codeParams, cat: 'social', auth: 'user', handler: lookupCode },
  { method: 'POST', path: '/api/friends/requests', cat: 'social', auth: 'user', handler: sendRequest },
  { method: 'POST', path: /^\/api\/friends\/([^/]+)\/accept$/, params: userParams, cat: 'social', auth: 'user', handler: acceptRequest },
  { method: 'POST', path: /^\/api\/friends\/([^/]+)\/decline$/, params: userParams, cat: 'social', auth: 'user', handler: declineRequest },
  { method: 'DELETE', path: /^\/api\/friends\/([^/]+)$/, params: userParams, cat: 'social', auth: 'user', handler: removeFriend },
  { method: 'GET', path: '/api/blocks', cat: 'social', auth: 'user', handler: listBlocks },
  { method: 'POST', path: '/api/blocks', cat: 'social', auth: 'user', handler: block },
  { method: 'DELETE', path: /^\/api\/blocks\/([^/]+)$/, params: userParams, cat: 'social', auth: 'user', handler: unblock },
  { method: 'POST', path: '/api/challenges', cat: 'board', auth: 'user', growth: true, handler: createChallenge },
  { method: 'GET', path: /^\/api\/challenges\/([^/]+)$/, params: challengeParams, cat: 'board', auth: 'user', handler: getChallenge },
  { method: 'POST', path: /^\/api\/challenges\/([^/]+)\/results$/, params: challengeParams, cat: 'board', auth: 'user', growth: true, handler: submitChallenge },
];
