/**
 * 交成绩到平台的每日榜（POST /api/scores，每日挑战、速判、何切共用）。只在登录时交；
 * 回 true 是平台收下了，榜没登记、断网、超时都回 false、不抛：榜是锦上添花，不挡成绩页。同一个榜同时只交一次
 */
import { GAME_ID } from '../game/id.ts';
import { apiFetch } from './http.ts';

const sending = new Set<string>();

export async function submitScore(boardId: string, score: number, userId: string): Promise<boolean> {
  if (sending.has(boardId)) return false;
  sending.add(boardId);
  try {
    const res = await apiFetch('/api/scores', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Arcade': '1' },
      body: JSON.stringify({ gameId: GAME_ID, boardId, score, userId }),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    sending.delete(boardId);
  }
}
