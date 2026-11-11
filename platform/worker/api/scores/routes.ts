/** 战绩、排行榜、分数榜、云存档的路由条目（router.ts 按功能拼成总表；通用检查在 router.ts）。 */
import type { Route } from '../core/route';
import { SAVE_BODY_LIMIT, getSaves, putSave, saveParams } from './saves';
import { boardParams, getBoard, submitScore } from './boards';
import { getLeaderboard } from './leaderboard';
import { getStats, statsParams } from './stats';

export const SCORES_ROUTES: Route[] = [
  // 战绩（5.10）：对登录的人公开，只读
  { method: 'GET', path: /^\/api\/stats\/([^/]+)$/, params: statsParams, cat: 'social', auth: 'user', handler: getStats },
  // 排行榜页（15.12）：本周净赢、称号收集，读走缓存
  { method: 'GET', path: '/api/leaderboard', cat: 'board', auth: 'user', handler: getLeaderboard },
  // 新上榜会让库变大：停增长档停交分（和新建存档槽一样）
  { method: 'POST', path: '/api/scores', cat: 'board', auth: 'user', growth: true, handler: submitScore },
  { method: 'GET', path: /^\/api\/boards\/([^/]+)\/([^/]+)$/, params: boardParams, cat: 'board', auth: 'user', handler: getBoard },
  { method: 'GET', path: /^\/api\/saves\/([^/]+)$/, params: saveParams, cat: 'save', auth: 'user', handler: getSaves },
  {
    method: 'PUT',
    path: /^\/api\/saves\/([^/]+)\/([^/]+)$/,
    params: saveParams,
    bodyLimit: SAVE_BODY_LIMIT,
    cat: 'save',
    auth: 'user',
    handler: putSave,
  },
];
