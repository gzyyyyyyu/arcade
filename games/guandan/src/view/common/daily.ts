/**
 * 每日挑战里玩法无关的部分（掼蛋 guandan/daily.ts、斗地主 doudizhu/daily.ts 共用）：北京时间的日期、榜名、交到平台每日榜、结束页上的一句话。
 * 日期按北京时间（平台只收北京时间昨天、今天、明天的每日榜）；平台按每人取最好的一次，所以可以重打，每打完一场交一次、不自动重试。
 * 每日挑战不写存档、不记战绩（和自己练的局分开），排行榜不防作弊（榜只为好玩，防刷额度在平台做）。
 */
import { currentUserId } from './room-link.ts';
import { standalone, timed } from './platform.ts';

/** 北京时间的日期 YYYY-MM-DD */
/** 每日挑战打到一半点"←"回首页：先问一句：这一场不保存，说清楚免得以为今天的机会用掉了 */
export const DAILY_LEAVE = '回首页？今天的挑战这一场不保存，再进来从头打（能重打，榜上记最好的一次）';

export function beijingDate(nowMs: number): string {
  const t = new Date(nowMs + 8 * 3600_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** 榜名：daily-<日期>-<子榜>，规则版本 rules > 0 时带 -v<n>（发牌、计分大改时加一，改前改后不在一个榜上比） */
export function dailyBoard(date: string, sub: string, rules = 0): string {
  return rules > 0 ? `daily-${date}-${sub}-v${rules}` : `daily-${date}-${sub}`;
}

export type DailySubmit =
  | { kind: 'ok'; best: number; improved: boolean }
  /** 没登录、单独部署（没有平台） */
  | { kind: 'out' }
  /** 交得太多了（平台每人每天的交分次数所有游戏合计） */
  | { kind: 'limit' }
  /** 平台在省额度、连不上 */
  | { kind: 'offline' }
  /** 别的拒绝（榜名、分数不合格）：游戏这边的错，不重试 */
  | { kind: 'bug'; status: number };

/** 交一次分：POST /api/scores（平台 15.5）。账号现问 /api/me，带上 userId，页面上的账号换了平台回 409 */
export async function submitDaily(board: string, score: number, fetcher: typeof fetch = fetch): Promise<DailySubmit> {
  if (standalone()) return { kind: 'out' };
  const userId = await currentUserId(fetcher);
  if (!userId) return { kind: 'out' };
  try {
    const r = await fetcher('/api/scores', timed({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      // 结算页马上点"回首页"也交得上
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Arcade': '1' },
      body: JSON.stringify({ gameId: 'guandan', boardId: board, score, userId }),
    }));
    if (r.status === 401) return { kind: 'out' };
    if (r.status === 429) return { kind: 'limit' };
    if (r.status === 200) {
      const b = (await r.json().catch(() => null)) as { best?: unknown; improved?: unknown } | null;
      if (typeof b?.best === 'number' && typeof b.improved === 'boolean') return { kind: 'ok', best: b.best, improved: b.improved };
      return { kind: 'ok', best: score, improved: false };
    }
    if (r.status >= 500 || r.status === 0) return { kind: 'offline' };
    return { kind: 'bug', status: r.status };
  } catch {
    return { kind: 'offline' };
  }
}

/** 结束页上的一句话 */
export function dailySubmitText(r: DailySubmit, score: number): string {
  switch (r.kind) {
    case 'ok':
      return r.improved ? `今天的最好成绩：${r.best} 分，已上榜` : `这次 ${score} 分，今天最好还是 ${r.best} 分`;
    case 'out':
      return '登录后打的每日挑战才上榜';
    case 'limit':
      return '今天交分次数用完了，明天再来';
    case 'offline':
      return '没交上（平台连不上），这次的分没记';
    case 'bug':
      return '没交上，这次的分没记';
  }
}
