/**
 * 交分到平台的每日榜（同域 POST /api/scores，平台 9.2、15.5）：一局结束交一次。
 * 失败（没登录、网络不通、平台停写）一律返回 false，不抛错、不挡结果卡；单独部署没有平台，调用方不调。
 */
import { FETCH_TIMEOUT_MS } from './wallet.ts';

export async function submitScore(boardId: string, score: number, f: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await f('/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-arcade': '1' },
      credentials: 'same-origin',
      body: JSON.stringify({ gameId: 'texas', boardId, score }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
