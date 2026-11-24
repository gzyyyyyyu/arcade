/** 搭子战绩（docs/platform-backend.md 15.19）的文字和"最佳搭档"怎么挑：好友页和战绩页共用。 */
import type { Together } from '../api.ts';

/**
 * 两行："一起打了 23 场：你赢 12 场、对方赢 9 场"，做过搭档的再加"其中做搭档 8 场，赢了 6 场"。
 * 你赢、对方赢数的是这些场里各自赢了几场，做搭档时两人一起赢也各算一场，所以不写成"对打"。
 */
export function togetherLines(t: Together): string[] {
  const lines = [`一起打了 ${t.n} 场：你赢 ${t.wins} 场、对方赢 ${t.theirWins} 场`];
  if (t.teamN > 0) lines.push(`其中做搭档 ${t.teamN} 场，赢了 ${t.teamWins} 场`);
  return lines;
}

/** 做搭档至少几场才评"最佳搭档"：一两场看不出来 */
const BEST_MIN_TEAM = 3;

/** teamN ≥ 3 里 teamWins 最多的，平了取 teamN 多的；一个都不够就没有 */
export function bestPartner<T extends { userId: string; together?: Together }>(friends: T[]): string | null {
  let best: T | null = null;
  for (const f of friends) {
    const t = f.together;
    if (!t || t.teamN < BEST_MIN_TEAM) continue;
    const b = best?.together;
    if (!b || t.teamWins > b.teamWins || (t.teamWins === b.teamWins && t.teamN > b.teamN)) best = f;
  }
  return best?.userId ?? null;
}
