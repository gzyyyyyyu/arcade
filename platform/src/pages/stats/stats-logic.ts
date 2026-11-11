/** 战绩页的纯逻辑：页签（总览 + 玩过的每个游戏）、胜率文字。 */
import type { CareerView } from '../../api.ts';

export interface StatsTab {
  /** 'all' 或游戏 id */
  id: string;
  game: string | null;
}

/** 总览排第一，后面是玩过的游戏，按 order 给的顺序（大厅顺序）排 */
export function statsTabs(games: Record<string, CareerView>, order: (id: string) => number): StatsTab[] {
  const ids = Object.keys(games).sort((a, b) => order(a) - order(b));
  return [{ id: 'all', game: null }, ...ids.map((game) => ({ id: game, game }))];
}

/** 胜率：没打过显示破折号 */
export function rateText(c: Pick<CareerView, 'rounds' | 'wins'>): string {
  return c.rounds > 0 ? `${Math.round((c.wins / c.rounds) * 100)}%` : '—';
}
