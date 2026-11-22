/**
 * 大厅"最近玩过"一行的纯逻辑（不碰 DOM、不发请求，方便测）。
 * 两个来源合并：大厅登录时本来就问过的钱包（流水和桌上筹码里带游戏 id 和时间），加浏览器本地记的"点过进入游戏"
 * （localStorage `arcade.recent.<用户 id>`，按账号分开，覆盖不用钱包的游戏，如飞驰、弹里个弹）。
 */
import type { GameEntry } from '../../../shared/games.ts';

export const RECENT_KEY = 'arcade.recent';
/** 本地最多记几条 */
export const LOCAL_MAX = 6;
/** 一行最多显示几个 */
const SHOW_MAX = 4;

interface Recent {
  id: string;
  /** 毫秒时间戳 */
  at: number;
}

/** 本地存的是用户浏览器里的东西，什么都可能有：坏 JSON、不是数组、字段类型不对都当没有 */
export function parseLocal(raw: string | null): Recent[] {
  if (!raw) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: Recent[] = [];
  for (const e of v) {
    if (e && typeof e === 'object' && typeof (e as Recent).id === 'string' && Number.isFinite((e as Recent).at)) out.push({ id: (e as Recent).id, at: (e as Recent).at });
  }
  return out.slice(0, LOCAL_MAX);
}

/** 记一次进入：同一个游戏只留最新一条，新的在前，最多 LOCAL_MAX 条 */
export function pushLocal(list: readonly Recent[], id: string, at: number): Recent[] {
  return [{ id, at }, ...list.filter((e) => e.id !== id)].slice(0, LOCAL_MAX);
}

/** 合并两个来源：每个游戏取最晚的时间，只留目录里能玩的，新的在前（同时间保持来源顺序），最多 limit 个 */
export function mergeRecent(
  games: readonly GameEntry[],
  ledger: readonly { at: number; g?: string }[],
  stakes: readonly { game: string; at: number }[],
  local: readonly Recent[],
  limit = SHOW_MAX,
): Recent[] {
  const playable = new Set(games.filter((g) => g.status === 'playable').map((g) => g.id));
  const last = new Map<string, number>();
  const see = (id: string | undefined, at: number) => {
    if (!id || !playable.has(id) || !Number.isFinite(at)) return;
    if (at > (last.get(id) ?? -Infinity)) last.set(id, at);
  };
  for (const e of ledger) see(e.g, e.at);
  for (const s of stakes) see(s.game, s.at);
  for (const e of local) see(e.id, e.at);
  return [...last].map(([id, at]) => ({ id, at })).sort((a, b) => b.at - a.at).slice(0, limit);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前；按时间差算，不看日历（时区无关）；时钟比记录早也算刚刚 */
export function relativeTime(at: number, now: number): string {
  const d = now - at;
  if (d < MIN) return '刚刚';
  if (d < HOUR) return `${Math.floor(d / MIN)} 分钟前`;
  if (d < DAY) return `${Math.floor(d / HOUR)} 小时前`;
  const days = Math.floor(d / DAY);
  return days === 1 ? '昨天' : `${days} 天前`;
}

/** 点的链接指向哪个游戏：路径落在 /games/<id>/ 下，或是开发时游戏自己的地址 */
export function gameOfHref(games: readonly GameEntry[], href: string, base: string): GameEntry | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  return (
    games.find((g) => {
      if (g.status !== 'playable') return false;
      if (u.origin === new URL(base).origin && u.pathname.startsWith(g.path)) return true;
      return !!g.devUrl && u.origin === new URL(g.devUrl).origin;
    }) ?? null
  );
}
