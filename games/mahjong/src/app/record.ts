/**
 * 单机的战绩和连输记录（主页的战绩卡、结算页的"连输了"一句）：存在 localStorage，存不上就不记。
 */
import { readJson, writeJson } from '../storage.ts';
import { nextStreak, type Streak } from '../view/text.ts';

const STREAK_KEY = 'mahjong.streak';
/** 单机打完了几场、赢了几场（主页的战绩卡）；last 同 mahjong.streak，刷新后结算页再弹一遍不重复记 */
const RECORD_KEY = 'mahjong.record';

export function readRecord(): { played: number; won: number; lost: number } | null {
  const r = readJson<{ played?: unknown; won?: unknown } | null>(RECORD_KEY, null);
  if (!r || typeof r.played !== 'number' || typeof r.won !== 'number' || r.played <= 0) return null;
  const st = readJson<Streak | null>(STREAK_KEY, null);
  return { played: r.played, won: r.won, lost: typeof st?.n === 'number' ? st.n : 0 };
}

export function bumpRecord(id: string, net: number): void {
  const r = readJson<{ played: number; won: number; last: string } | null>(RECORD_KEY, null);
  const prev = r && typeof r.played === 'number' && typeof r.won === 'number' ? r : { played: 0, won: 0, last: '' };
  if (prev.last === id) return;
  // 存不了（隐私模式满了）就不记，战绩卡显示"还没打过"，不看返回值
  writeJson(RECORD_KEY, { played: prev.played + 1, won: prev.won + (net > 0 ? 1 : 0), last: id });
}

/** 记下这一场的输赢，返回连输的情况；存储读写失败是 null（结算页就不说那一句） */
export function recordStreak(id: string, net: number): Streak | null {
  const prev = readJson<Streak | null>(STREAK_KEY, null);
  const streak = nextStreak(prev && typeof prev.n === 'number' && typeof prev.last === 'string' ? prev : null, id, net);
  return writeJson(STREAK_KEY, streak) ? streak : null;
}
