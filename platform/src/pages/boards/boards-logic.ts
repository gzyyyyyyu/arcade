/** 排行页的纯逻辑（docs/architecture.md 第 4 节"排行榜分两层"）：哪些游戏开页签、每个页签放哪些榜、领奖台怎么站。 */
import { type DailyTab, dailyTabs, type GameEntry } from '../../../shared/games.ts';

export interface BoardTab {
  /** 'total' 或游戏 id */
  id: string;
  name: string;
  /** 本周净赢小榜在 /api/leaderboard 的 boards[...] 里的键；总榜是 'total' */
  weekly: string | null;
  /** 这个游戏最能代表它的那一个每日榜（featuredDaily）；没有就 null */
  daily: DailyTab | null;
  game: GameEntry | null;
}

/**
 * 总榜 + 每个接了钱包或登记了 featuredDaily（代表性每日榜）的可玩游戏（docs/architecture.md 第 4 节）：海岛只有本周净赢；
 * 没接钱包、也没有代表性每日榜的（飞驰、弹里个弹）不开页签。其他每日、每周、固定榜不在排行页列出（数据和接口照旧）。
 */
export function boardTabs(games: readonly GameEntry[]): BoardTab[] {
  const playable = games.filter((g) => g.status === 'playable');
  const tabs: BoardTab[] = [{ id: 'total', name: '总榜', weekly: 'total', daily: null, game: null }];
  for (const g of playable) {
    const daily = g.featuredDaily ? (dailyTabs([g]).find((t) => t.sub?.id === g.featuredDaily) ?? null) : null;
    const weekly = g.wallet !== false ? g.id : null;
    if (daily || weekly) tabs.push({ id: g.id, name: g.name, weekly, daily, game: g });
  }
  return tabs;
}

/**
 * 领奖台：名单前三个名次都在 3 以内才站台子，站位第二在左、第一在中、第三在右；返回站位和剩下要进列表的人。
 * 一两个人不站台子、直接排列表：一个人的台子孤零零一块，两个人的缺一角，看着都像没排好。
 */
export function podiumSplit<T extends { rank: number | null }>(rows: readonly T[], compact: boolean): { stand: T[]; top: T[]; rest: T[] } {
  const top = rows.slice(0, 3).filter((r) => r.rank !== null && r.rank <= 3);
  if (compact || top.length < 3) return { stand: [], top: [], rest: [...rows] };
  return { stand: [top[1]!, top[0]!, top[2]!], top, rest: rows.slice(3) };
}
