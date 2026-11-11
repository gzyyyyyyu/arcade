/**
 * 本周市场：每周一套限定规则，玩法和闪电盘一样（10 个交易日、开局三选一、没有月供、不进档案），
 * 榜是 `week-YYYY-Www-rules`，全世界这一周同一局。
 *
 * 本文件只放"周号 → 规则"和"规则怎么改玩家规则、市场规则"，纯整数运算：不用 Date，也不用依赖平台的数学函数。
 * 周号是北京时间的 ISO 周（周一 0 点换周，哪年按这周的周四算），由画面层的 beijingIsoWeek 算好传进来。
 */
import { BALANCE } from './balance.ts';
import type { MarketRules, Rules } from './hooks.ts';
import type { RunSetup } from './types.ts';

/** 本周规则的 id：涨跌停放宽、反向群聊、题材快轮、满仓周、做空周。 */
export const WEEKLY_RULE_IDS = ['limit', 'reverse', 'rotate', 'full', 'short'] as const;
export type WeeklyRuleId = (typeof WEEKLY_RULE_IDS)[number];

/** 画面用的名字、进局一句话和榜单说明。 */
export const WEEKLY_RULE_INFO: Readonly<Record<WeeklyRuleId, { name: string; line: string; tip: string }>> = {
  limit: { name: '涨跌停放宽', line: '本周涨跌停放宽到 ±20%，大涨大跌都更猛', tip: '本周所有股票的涨跌停从 ±10% 放宽到 ±20%：赚得更多，亏得也更狠。' },
  reverse: {
    name: '反向群聊',
    line: '本周群友说的全是反话：说涨多半跌，说跌多半涨',
    tip: '本周群里每个人的消息和推荐都要反着听：他说涨，多半是要跌；推荐的票，多半要跌；唱空的反而是好票。这不是 bug，是本周的规矩。',
  },
  rotate: { name: '题材快轮', line: '本周风口轮得特别快，别恋战，跑得快才赚得到', tip: '本周风口的热度起落快得多：起风快、退潮也快，拿着不动容易被甩下车。' },
  full: { name: '满仓周', line: '本周多给你 2 个持仓格，能多拿几只', tip: '本周持仓格多给 2 个：可以多拿几只，分散一点，也能把热门风口一网打尽。' },
  short: { name: '做空周', line: '本周一开局就能押跌，押对了赚得更多、被轧也亏得少', tip: '本周一开局就能押跌：押对赚得多一半，涨停被轧时亏得少一半。' },
};

const WEEK_RE = /^(\d{4})-W(\d{2})$/;

/** 公历日期到"1970-01-01 起的第几天"（整数运算，负数也对）。 */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 星期几：周一 1 … 周日 7（1970-01-01 是周四）。 */
function isoDow(days: number): number {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

/** 某年 ISO 第 1 周的周一。 */
function week1Monday(year: number): number {
  const jan4 = daysFromCivil(year, 1, 4);
  return jan4 - (isoDow(jan4) - 1);
}

/** 某年有几个 ISO 周（52 或 53）：12 月 28 日一定在最后一周。 */
export function isoWeeksInYear(year: number): number {
  return Math.floor((daysFromCivil(year, 12, 28) - week1Monday(year)) / 7) + 1;
}

/** 周号是不是合法的 YYYY-Www（周数 1..这一年的周数）。 */
export function isWeekId(week: string | null | undefined): week is string {
  const m = typeof week === 'string' ? WEEK_RE.exec(week) : null;
  if (!m) return false;
  const y = Number(m[1]);
  const w = Number(m[2]);
  return w >= 1 && w <= isoWeeksInYear(y);
}

/** 这一周的周一是"1970-01-01 起的第几天"。周号不合法时抛错。 */
export function weekMondayDays(week: string): number {
  if (!isWeekId(week)) throw new Error('本周市场的周号要是 YYYY-Www（如 2026-W44）');
  const m = WEEK_RE.exec(week) as RegExpExecArray;
  return week1Monday(Number(m[1])) + 7 * (Number(m[2]) - 1);
}

/**
 * 这一周用哪条规则：按周号在 5 条里依次轮换（相邻两周一定不同，跨年也接得上）。
 * 起点定在 2026-W44 = 反向群聊，之后固定不变（改了会让已经打过的榜说不清是哪条规则）。
 */
export function weeklyRule(week: string): WeeklyRuleId {
  const abs = Math.round((weekMondayDays(week) - week1Monday(2026)) / 7);
  const n = WEEKLY_RULE_IDS.length;
  return WEEKLY_RULE_IDS[(((abs + 3) % n) + n) % n] as WeeklyRuleId;
}

/** 这一周规则的名字、进局一句话、说明。 */
export function weeklyInfo(week: string): { name: string; line: string; tip: string } {
  return WEEKLY_RULE_INFO[weeklyRule(week)];
}

/** 这一局的本周规则；不是本周市场的局回 null。 */
export function weeklyRuleOf(setup: Readonly<Pick<RunSetup, 'weekly'>> | null | undefined): WeeklyRuleId | null {
  return setup?.weekly !== undefined ? weeklyRule(setup.weekly) : null;
}

/** 本周规则对玩家规则的修改（rulesOf 里最后叠加）。 */
export function applyWeeklyRules(r: Rules, rule: WeeklyRuleId): void {
  const W = BALANCE.weekly;
  if (rule === 'limit') r.limitMult *= W.limitMult;
  else if (rule === 'reverse') r.reverseAll = true;
  else if (rule === 'full') r.slots += W.extraSlots;
  else if (rule === 'short') {
    r.canShort = true;
    r.shortGainMult *= W.shortGain;
    r.squeezeMult *= W.squeezeMult;
  }
}

/** 本周规则对市场规则的修改（dayMarketRules 里叠加）：题材快轮让热度起落更快。 */
export function applyWeeklyMarket(mr: MarketRules, rule: WeeklyRuleId): void {
  if (rule === 'rotate') mr.dHMult *= BALANCE.weekly.rotateMult;
}
