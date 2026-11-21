/**
 * 大潮无尽（DESIGN.md 10.6e）的浏览器端：本周最好成绩记在本机 `haidao.tide`，结算时往平台每周榜交一次分（POST /api/scores）。
 * 排行榜不防作弊（所有者定），所以只是把分报上去；没登录、单独部署（501 / 404 / 401）静默跳过，不报错。
 */
import { loggedIn } from './pvp.ts';

const TIDE_KEY = 'haidao.tide';

interface TideLocal {
  /** 哪一周（2026-W44） */
  week: string;
  best: number;
}

export function readTide(): TideLocal | null {
  try {
    const v = JSON.parse(localStorage.getItem(TIDE_KEY) ?? 'null') as Partial<TideLocal> | null;
    if (v && typeof v.week === 'string' && typeof v.best === 'number' && Number.isFinite(v.best) && v.best >= 0) return { week: v.week, best: v.best };
  } catch {
    // 坏数据当没有
  }
  return null;
}

/** 这一周的本机最好成绩；换周了或没打过为 0 */
export function tideBest(week: string): number {
  const v = readTide();
  return v && v.week === week ? v.best : 0;
}

/** 记本机最好：只在比这周原来的高时写；返回新的最好和是不是刷新了（第一次打也算） */
export function recordTide(week: string, score: number): { best: number; improved: boolean } {
  const old = tideBest(week);
  if (score <= old) return { best: old, improved: false };
  try {
    localStorage.setItem(TIDE_KEY, JSON.stringify({ week, best: score }));
  } catch {
    // 存不上：最坏是下次不认这次的纪录
  }
  return { best: score, improved: true };
}

export type TideSubmit =
  | { state: 'skip' }
  | { state: 'ok'; best: number; improved: boolean }
  | { state: 'busy' };

/**
 * 交分：登录状态下 POST /api/scores。同域根路径（游戏在 /games/haidao/ 下，平台接口在 /api/），不走游戏自己的 api/ 前缀。
 * 429（每天 200 次）、503（平台忙）是"榜单忙"；501 / 404 / 401（单独部署、没登录）、网断了、422（过期周）等一律静默跳过。
 */
export async function submitTide(boardId: string, score: number): Promise<TideSubmit> {
  if (!loggedIn()) return { state: 'skip' };
  try {
    const r = await fetch('/api/scores', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Arcade': '1' },
      body: JSON.stringify({ gameId: 'haidao', boardId, score }),
    });
    if (r.status === 429 || r.status === 503) return { state: 'busy' };
    if (!r.ok) return { state: 'skip' };
    const d = (await r.json().catch(() => null)) as { best?: unknown; improved?: unknown } | null;
    if (!d || typeof d.best !== 'number') return { state: 'skip' };
    return { state: 'ok', best: d.best, improved: d.improved === true };
  } catch {
    return { state: 'skip' };
  }
}
