/**
 * 每日挑战的画面（DESIGN.md 7 节）：选桌页的入口卡、结算里的"今日成绩"一行，读写本机的 mahjong.daily。
 * 今天是几号在这里按北京时间算（规则核心不碰时间）；纯逻辑在 game/daily.ts。
 */
import { readText, writeJson } from '../storage.ts';
import { signed } from './text.ts';
import { DAILY_KEY, DAILY_VARIANTS, dailyBoard, emptyDaily, lastDays, markSent, parseAll, recordDaily, streakOf, toSubmit, type DailyAll, type DailyData, type DailyVariant } from '../game/daily.ts';
import { dailyCardOf } from './share.ts';
import type { ShareCard } from 'arcade-kit/share';
import { el } from './dom.ts';
import { pageOf } from './variants/pages.ts';
import './daily.css';

/** 北京时间的日期格式：建一个 Intl.DateTimeFormat 很贵（手机上十几毫秒），只建一次 */
let cnDay: Intl.DateTimeFormat | null = null;

/** 北京时间的今天，YYYY-MM-DD */
export function todayCN(now: Date = new Date()): string {
  cnDay ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' });
  return cnDay.format(now);
}

function readAll(): DailyAll {
  return parseAll(readText(DAILY_KEY));
}

export function readDaily(v: DailyVariant): DailyData {
  return readAll()[v] ?? emptyDaily();
}

function writeDaily(v: DailyVariant, d: DailyData): void {
  // 存不上就不记，下次入口还是"今天还没打"，不看返回值
  writeJson(DAILY_KEY, { ...readAll(), [v]: d });
}


/** 选桌页（娱乐，血战到底和立直各一张）的入口：点了开今天这一副 */
export function dailyEntry(box: HTMLElement, variant: DailyVariant, onStart: () => void): void {
  const today = todayCN();
  const d = readDaily(variant);
  const mine = d.days[today];
  const run = streakOf(d, today);
  const b = el('button', 'daily-entry', box);
  b.type = 'button';
  b.addEventListener('click', onStart);
  const top = el('div', 'daily-top', b);
  el('b', '', top, '每日挑战');
  const state = el('span', 'daily-state', top, mine ? '今天 ' : '今天还没打');
  if (mine) {
    netText(state, mine.net);
    state.append(' 分 · 再打算练习');
  }
  const more = el('span', 'daily-state', b, `${run > 0 ? `连续 ${run} 天` : '还没连上'} · 全天同一副牌，普通档 ${pageOf(variant).daily.lengthText}`);
  if (d.best !== null) {
    more.append(' · 最好 ');
    netText(more, d.best);
  }
  const week = el('div', 'daily-week', b);
  for (const x of lastDays(d, today)) {
    const s = el('span', x.net === null ? '' : `done ${tone(x.net)}`, week, x.net === null ? x.date.slice(5) : signed(x.net));
    if (x.date === today) s.classList.add('today');
    s.title = x.date;
  }
}

/** 带正负号的分：赢绿输红（docs/ui.md 状态色），和结算的 .net.up / .net.down 一个意思 */
const tone = (n: number): string => (n > 0 ? 'up' : n < 0 ? 'down' : '');
function netText(parent: HTMLElement, n: number, tag: 'b' | 'span' = 'span'): void {
  el(tag, `pts ${tone(n)}`.trim(), parent, signed(n));
}

/** 正在交的榜：同一个榜不并发交两次 */
const sending = new Set<string>();

/**
 * 把这一天的今日成绩交给平台每日榜（先记账后交：成绩已经在本机记下，交成功才写 sent）。
 * 只有登录才交；榜没登记、断网都不吭声，下次打开主页再交。回 true 是这次交上了
 */
async function submitDaily(variant: DailyVariant, date: string, userId: string): Promise<boolean> {
  const score = toSubmit(readDaily(variant), date);
  const board = dailyBoard(date, variant);
  if (score === null || sending.has(board)) return false;
  sending.add(board);
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Arcade': '1' },
      body: JSON.stringify({ gameId: 'mahjong', boardId: board, score, userId }),
    });
    if (!res.ok) return false;
    writeDaily(variant, markSent(readDaily(variant), date));
    return true;
  } catch {
    return false;
  } finally {
    sending.delete(board);
  }
}

/** 打开主页时补交：只补今天的（昨天没交上的不补，榜已经过去了） */
export function settleDailyBoards(userId: string | null): void {
  if (!userId) return;
  const today = todayCN();
  for (const v of DAILY_VARIANTS) void submitDaily(v, today, userId);
}

/**
 * 一场打完的结算里加一行：算今日成绩的记下来；练习局写明不计成绩。date 是开这一场时的日期（过了零点接着打按旧日期算）。
 * 登录了就交今日榜，交上了行尾加一句"已进今日榜"；已经交过的（结算重画）直接写上
 */
export function dailyLine(variant: DailyVariant, date: string, net: number, id: string, userId: string | null = null): HTMLElement {
  const r = recordDaily(readDaily(variant), date, net, id);
  if (r.first) writeDaily(variant, r.data);
  if (!r.first) return el('div', 'daily-line practice', undefined, '每日挑战 · 练习，不计成绩');
  const line = el('div', 'daily-line');
  const run = streakOf(r.data, todayCN());
  el('span', '', line, `今日成绩 `);
  netText(line, net, 'b');
  const rest = el('span', '', line, ' 分 · 最好 ');
  netText(rest, r.data.best ?? net);
  rest.append(` 分 · 连续 ${run} 天`);
  const ranked = (): void => void el('span', 'daily-ranked', line, ' · 已进今日榜');
  if (r.data.days[date]?.sent) ranked();
  else if (userId && date === todayCN())
    void submitDaily(variant, date, userId).then((ok) => {
      if (ok && line.isConnected) ranked();
    });
  return line;
}

/** 每日局结算上"分享"用的卡（要在 dailyLine 记完成绩之后调，读到的是记完的数据） */
export function dailyCard(variant: DailyVariant, date: string, net: number, id: string): ShareCard {
  const d = readDaily(variant);
  return dailyCardOf(variant, d, date, net, d.days[date]?.id === id);
}
