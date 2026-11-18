/** 顶栏、月供、日历。 */
import { CALENDAR, calendarOf, difficultyDef, eventById, personaAccount, personaById } from '../content/index.ts';
import { liveTierOf, liveValue } from '../live.ts';
import { weeklyInfo, weeklyRule } from '../weekly.ts';
import type { WeeklyRuleId } from '../weekly.ts';
import { billFor, daysInMonth, daysLeftInMonth, flashDays, isBusy, isFlash, runMonths, shortGoal, swanNotice } from '../engine/index.ts';
import { rulesWithoutTheme } from '../market.ts';
import { WEATHER_LABEL } from '../labels.ts';
import type { BillExtra, GameState, MarketNotice, SwanNotice, Mood, PersonaId } from '../types.ts';
import { type ItemView, itemView } from './items.ts';

// ================================================================ 顶栏、月供、日历

export interface TopBar {
  month: number;
  /** 本月第几天（1 起） */
  day: number;
  daysInMonth: number;
  calendar: CalendarView;
  account: number;
  bill: number;
  billName: string;
  /** 本月还剩几个交易日（含今天） */
  daysLeft: number;
  mood: Mood;
  weather: string;
  items: ItemView[];
  slots: number;
  buysLeft: number;
  /** 人设 */
  persona: PersonaId;
  personaName: string;
  /** 难度等级与名字 */
  difficulty: number;
  difficultyName: string;
  /** 每日挑战的日期（不是每日挑战为 null） */
  daily: string | null;
  /** 闪电盘：日期、已打到第几个交易日（1 起，打完为 days）、一共几天、开局资产；不是闪电盘为 null */
  flash: { date: string; day: number; days: number; start: number } | null;
  /** 本周市场：周号、这周的规则（id、名字、进局一句话、说明）；不是本周市场为 null。这时 flash 也有值（date 是周号），共用 10 天短局的显示 */
  weekly: { week: string; rule: WeeklyRuleId; name: string; line: string; tip: string } | null;
  /** 本月的市场传闻（第 6 级股灾），没有为 null */
  notice: MarketNotice | null;
  /** 黑天鹅预告（最后 3 个交易日的盘前，顶栏挂倒数标记）；没有为 null */
  swan: SwanNotice | null;
  /** 今天没空看盘（加班事件） */
  busy: boolean;
  /** 0.6.0 实盘：档位名、一份、按现在的资产能结回多少；娱乐局为 null */
  live: { tierName: string; stake: number; value: number } | null;
  /** 临时道具（id → 到几月底失效） */
  expiring: { id: string; month: number }[];
  /** 事件留下的延后结算（公开） */
  pending: { id: string; name: string; month: number; amount: number }[];
}

function topBarLive(s: Readonly<GameState>): TopBar['live'] {
  const t = liveTierOf(s);
  return t ? { tierName: t.name, stake: t.stake, value: liveValue(s) ?? 0 } : null;
}

export function topBar(s: Readonly<GameState>): TopBar {
  return {
    month: s.month,
    day: Math.min(s.dayInMonth + 1, daysInMonth(s.month)),
    daysInMonth: daysInMonth(s.month),
    calendar: calendarView(s)[s.month - 1] as CalendarView,
    account: s.account,
    bill: s.bill.amount,
    billName: s.bill.name,
    daysLeft: daysLeftInMonth(s),
    mood: s.mood,
    weather: WEATHER_LABEL[s.mood],
    items: s.items.map(itemView),
    slots: s.slots.length,
    buysLeft: s.today.buysLeft,
    persona: s.persona,
    personaName: personaById(s.persona).name,
    difficulty: s.difficulty,
    difficultyName: difficultyDef(s.difficulty).name,
    daily: s.setup?.daily ?? null,
    flash: isFlash(s) ? { date: (s.setup?.flash ?? s.setup?.weekly) as string, day: Math.min(s.dayIndex + 1, flashDays()), days: flashDays(), start: s.setup?.account ?? personaAccount(s.persona) } : null,
    weekly: s.setup?.weekly !== undefined ? { week: s.setup.weekly, rule: weeklyRule(s.setup.weekly), ...weeklyInfo(s.setup.weekly) } : null,
    notice: s.notice ? { ...s.notice } : null,
    swan: swanNotice(s),
    busy: isBusy(s),
    live: topBarLive(s),
    expiring: s.expiring.map((x) => ({ ...x })),
    pending: s.pending.map((p) => ({ id: p.id, name: eventById(p.id).name, month: p.month, amount: p.amount })),
  };
}

export interface BillView {
  month: number;
  name: string;
  /** 本月要还的总额（含突发账单） */
  amount: number;
  /** 常规月供（amount − 突发账单合计） */
  base: number;
  /** 本月的突发账单明细（没有时为空数组） */
  extras: BillExtra[];
  daysLeft: number;
  account: number;
  /** 账户够不够还（按当前余额） */
  enough: boolean;
  /** 有信用卡兜底 */
  credit: boolean;
}

export function billView(s: Readonly<GameState>): BillView {
  const extras = s.bill.extras ?? [];
  return {
    month: s.bill.month,
    name: s.bill.name,
    amount: s.bill.amount,
    base: s.bill.amount - extras.reduce((t, x) => t + x.amount, 0),
    extras: extras.map((x) => ({ ...x })),
    daysLeft: daysLeftInMonth(s),
    account: s.account,
    enough: s.account >= s.bill.amount,
    credit: s.items.includes('credit'),
  };
}

/**
 * 0.32.0 娱乐短局：到最后一个月月底还要交多少——还没交的各月账单加首付（顶栏账户下面一行、月底账单的一行收据用）。
 * 还没交的这个月用已经公布的账单（s.bill，最后一个月里已含首付）；以后几个月的主题和突发账单要到月初才公布，不能透露，
 * 只按不带主题的规则表估常规月供（下个月乘上已经公布的 nextBillMult），所以是个估计（顶栏的悬停里说明）。不是短局为 null。
 */
export function shortNeed(s: Readonly<GameState>): { goal: number; need: number } | null {
  const goal = shortGoal(s);
  if (goal <= 0) return null;
  const last = runMonths(s);
  const rules = rulesWithoutTheme(s);
  let need = 0;
  for (let m = s.stats.billsPaid + 1; m <= last; m++) {
    if (m === s.bill.month) need += s.bill.amount;
    else need += billFor(m, rules, m === s.month + 1 ? s.nextBillMult : 1) + (m === last ? goal : 0);
  }
  return { goal, need };
}

export interface CalendarView {
  month: number;
  id: string;
  name: string;
  desc: string;
  days: number;
  current: boolean;
  past: boolean;
}

/** A 股日历：12 个月，固定、提前可见。 */
export function calendarView(s: Readonly<GameState>): CalendarView[] {
  return CALENDAR.map((c) => ({
    month: c.month,
    id: c.id,
    name: c.name,
    desc: s.real?.track && c.realDesc ? c.realDesc : c.desc,
    days: daysInMonth(c.month),
    current: c.month === s.month,
    past: c.month < s.month,
  }));
}

/** 当月日历事件。 */
export function currentCalendar(s: Readonly<GameState>): CalendarView {
  const c = calendarOf(Math.max(1, s.month));
  return { month: c.month, id: c.id, name: c.name, desc: s.real?.track && c.realDesc ? c.realDesc : c.desc, days: daysInMonth(c.month), current: true, past: false };
}
