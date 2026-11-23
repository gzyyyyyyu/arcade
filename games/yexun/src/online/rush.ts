/**
 * 首领连战的入口和分数（docs/design-play.md 2.5、5.7）：
 * - 每日连战：北京时间的日期 → 种子（同一天全服同一张路线图），危险 2；角色、配装、咒自己选（入口页用 withLoadout 补上）；
 *   交平台每日榜的子榜 rush（榜名 daily-YYYY-MM-DD-rush），分数怎么显示写在 public/daily.json。
 * - 自由连战：随机种子、危险 0–4，不交榜，本机按危险档记最好（meta/records.ts）。
 * 路线、首领、地图都由核心按种子算（core/rush.ts rushRoute）。
 */
import { fmtClock, TICKS_PER_SECOND } from '../content/clock.ts';
import { MAX_RUSH_HEXES, RUSH_HEX_IDS, type RushHexId } from '../content/rush.ts';
import { hash32 } from '../core/rng.ts';
import { loadoutOk, type RushLoadout, type RushResult, rushRoute } from '../core/rush.ts';
import { DAILY_DANGER, DATE_RE, dailyBoardId } from './daily.ts';
import type { Danger, OnlineSetup } from './types.ts';

/** 平台每日榜的子榜 id */
const RUSH_SUB = 'rush' as const;

/** 自由连战能选的最高危险档 */
export const RUSH_FREE_MAX_DANGER = 4;

export function rushBoardId(date: string): string {
  return dailyBoardId(date, RUSH_SUB);
}

/** 连战局的开局设置（不带配装）：图 = 路线图第 1 列第 1 条路的图（核心开局也从这张图开始） */
function rushSetup(seed: number, danger: Danger): OnlineSetup {
  return { seed, mode: 'vigil', map: rushRoute(seed).layers[0]![0]!.map, danger, curses: [], character: 'xiaodao', perks: {}, rush: true };
}

/** 这一天的每日连战：种子只看日期，危险 2；配装、角色、咒由入口页补（withLoadout） */
export function rushDaily(date: string): { date: string; setup: OnlineSetup; boardId: string } {
  if (!DATE_RE.test(date)) throw new Error('每日连战的日期要是 YYYY-MM-DD');
  return { date, setup: rushSetup(hash32(`yexun-daily-rush-${date}`, 0), DAILY_DANGER), boardId: rushBoardId(date) };
}

/** 自由连战：调用方给随机种子，危险 0–4（超出的截到范围里） */
export function rushFree(seed: number, danger: Danger): OnlineSetup {
  return rushSetup(seed >>> 0, Math.max(0, Math.min(RUSH_FREE_MAX_DANGER, Math.floor(danger))) as Danger);
}

/** 给连战局填上配装和咒（角色跟着配装走；咒去重、按表序、截到上限） */
export function withLoadout(s: OnlineSetup, loadout: RushLoadout, hexes: readonly RushHexId[] = []): OnlineSetup {
  return { ...s, character: loadout.character, rushLoadout: loadout, rushHexes: RUSH_HEX_IDS.filter((h) => hexes.includes(h)).slice(0, MAX_RUSH_HEXES) };
}

/**
 * 这一局是不是货真价实的某天每日连战：种子、危险档对得上，配装合法（角色解锁不在这里判），咒合法且不超过 2 条，
 * 守夜的咒印只能是连战咒里同名的那几条（normalizeSetup 写进去的），没开无尽、降低伤害、加成，不是实盘
 */
export function isRushSetup(date: string | null | undefined, s: OnlineSetup): boolean {
  if (!date || !DATE_RE.test(date) || !s.rush || s.mode !== 'vigil') return false;
  const p = rushDaily(date).setup;
  if (p.seed !== s.seed || p.danger !== s.danger || s.endless || s.assist || s.live || Object.keys(s.perks ?? {}).length > 0) return false;
  const l = s.rushLoadout;
  if (!l || !loadoutOk(l) || l.character !== (s.character ?? 'xiaodao')) return false;
  const hexes = s.rushHexes ?? [];
  if (hexes.length > MAX_RUSH_HEXES || new Set(hexes).size !== hexes.length || !hexes.every((h) => RUSH_HEX_IDS.includes(h))) return false;
  return (s.curses ?? []).every((c) => (hexes as readonly string[]).includes(c));
}

/**
 * 连战的分数（越大越好）：打倒夜漏君 × 1e10 + 打倒几只(0–11) × 1e8 + 咒几条(0–2) × 1e7 + 一共几只(11) × 1e5 + 尾数。
 * 尾数：全清是 RUSH_TAIL − 用了几秒（局内拍数，越快越大，封底 0）；没全清是正在打的那只打掉了百分之几。
 * 所以先比天亮没有，再比打到哪，再比带了几条咒，最后全清比快、没全清比最后一只打掉多少。最大约 1.11e10，在安全整数内。
 * 平台按字段拆开显示（daily.json 的 boards.rush）
 */
const RUSH_CLEAR = 1e10;
/** 全清尾数的基准秒数（25 分钟）：用时超过它的全清尾数是 0 */
export const RUSH_TAIL = 1500;

export function rushScore(r: RushResult): number {
  const down = Math.max(0, Math.min(99, Math.trunc(r.down)));
  const hexes = Math.max(0, Math.min(9, Math.trunc(r.hexes)));
  const total = Math.max(0, Math.min(99, Math.trunc(r.total)));
  const tail = r.cleared ? Math.max(0, RUSH_TAIL - Math.ceil(r.ticks / TICKS_PER_SECOND)) : Math.max(0, Math.min(99, Math.floor(r.progress * 100)));
  return (r.cleared ? RUSH_CLEAR : 0) + down * 1e8 + hexes * 1e7 + total * 1e5 + tail;
}

export function decodeRush(score: number): { cleared: boolean; down: number; hexes: number; total: number; tail: number } {
  const cleared = score >= RUSH_CLEAR;
  const s = cleared ? score - RUSH_CLEAR : score;
  return { cleared, down: Math.floor(s / 1e8) % 100, hexes: Math.floor(s / 1e7) % 10, total: Math.floor(s / 1e5) % 100, tail: s % 1e5 };
}

/** 连战分数的短写法（结算页小格子放得下）：天亮写用时（超过 25 分钟写 25:00+），没打完写 N/11 */
export function rushShort(score: number): string {
  const d = decodeRush(score);
  const hex = d.hexes > 0 ? ` · 咒 ${d.hexes}` : '';
  if (!d.cleared) return `${d.down}/${d.total}${hex}`;
  return `天亮 ${d.tail > 0 ? fmtClock(RUSH_TAIL - d.tail) : `${fmtClock(RUSH_TAIL)}+`}${hex}`;
}

/** 用时写成分:秒 */
export function rushClock(ticks: number): string {
  return fmtClock(Math.ceil(ticks / TICKS_PER_SECOND));
}
