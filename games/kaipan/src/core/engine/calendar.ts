/** 查询：日历、月供、黑天鹅和打新的日程、行情规则。 */
import { BALANCE, fx } from '../balance.ts';
import { ipoSwitch } from '../ipo.ts';
import { SWAN_DEFS, SWAN_KINDS, swanSwitch, swanWarn } from '../swan.ts';
import { IPO_STOCKS, SURPRISE_BILLS, clampDifficulty, personaAccount } from '../content/index.ts';
import type { MarketRules, Rules } from '../hooks.ts';
import { marketRulesFor, rulesFor, uniformInt } from '../market.ts';
import { rngFor } from '../rng.ts';
import { tapeIndex } from '../real.ts';
import { applyWeeklyMarket, weeklyRuleOf } from '../weekly.ts';
import type { RealMarket } from '../segment.ts';
import type { BillExtra, GameState, IpoOffer, MarketNotice, PersonaId, RunSetup, SwanKind, SwanNotice, ThemeId } from '../types.ts';
import { freeUnits, isBusy, usedUnits } from './ext.ts';
import { isRankedSetup } from './run.ts';
import { MONTHS } from './shared.ts';

// ================================================================ 查询：日历、月供

/** 第 month 月（1..12）的交易日数。 */
export function daysInMonth(month: number): number {
  return BALANCE.monthDays[month - 1] ?? 0;
}

/** 0.10.0 娱乐短局的开局设置：规则从 BALANCE.short 抄进这局，首付比例按难度 */
export function shortSetup(persona: PersonaId, difficulty: number): RunSetup {
  const { months, billMult, goal } = BALANCE.short;
  const lv = clampDifficulty(difficulty);
  return { persona, difficulty: lv, short: { months, billMult, goal: goal[Math.min(lv, goal.length) - 1] as number } };
}

/** 新号前几局的开局设置：新手档短局，首付比例按 BALANCE.novice（行情段由调用方从 NOVICE_SEGMENTS 里挑） */
export function noviceSetup(persona: PersonaId): RunSetup {
  const s = shortSetup(persona, 1);
  return { ...s, short: { ...(s.short as NonNullable<RunSetup['short']>), goal: BALANCE.novice.goal } };
}

/** 这局是不是 noviceSetup 开的（重玩同一局也要从同一个温和段池里抽） */
export function isNoviceSetup(setup: Readonly<RunSetup> | null): boolean {
  if (!setup?.persona || setup.daily || setup.flash !== undefined || setup.weekly !== undefined || setup.live || setup.lesson) return false;
  const n = noviceSetup(setup.persona);
  return setup.difficulty === 1 && setup.short?.goal === n.short?.goal && setup.short?.months === n.short?.months && setup.short?.billMult === n.short?.billMult;
}

/** 短局最后要交的首付（元，取整到百元）：开局资产 × 这局的首付比例；不是短局为 0。开局面板用开局设置算，局里用 shortGoal */
export function shortGoalFor(setup: Readonly<RunSetup> | null): number {
  const g = setup?.short?.goal ?? 0;
  return g > 0 ? Math.round((g * (setup?.account ?? personaAccount(setup?.persona ?? 'newbie'))) / 100) * 100 : 0;
}

export function shortGoal(s: Readonly<GameState>): number {
  return shortGoalFor(s.setup);
}

/** 这一局打几个月：实盘（0.6.0）、娱乐短局（0.10.0）按开局设置，闪电盘固定（BALANCE.flash），完整一年 12 个月。 */
export function runMonths(s: Readonly<GameState>): number {
  return s.setup?.live?.months ?? s.setup?.short?.months ?? (isFlash(s) ? BALANCE.flash.months : MONTHS);
}

/** 闪电盘（setup.flash 带日期）和本周市场（setup.weekly 带周号）：固定 10 个交易日，没有月供，开局三选一道具，第 4、8 天收盘后各一个事件。 */
export function isFlash(s: Readonly<Pick<GameState, 'setup'>>): boolean {
  return s.setup?.flash !== undefined || s.setup?.weekly !== undefined;
}

/** 闪电盘一共几个交易日（= 前 BALANCE.flash.months 个月的天数）。 */
export function flashDays(): number {
  let n = 0;
  for (let m = 1; m <= BALANCE.flash.months; m++) n += daysInMonth(m);
  return n;
}

/** 这一局最后一个交易日的编号（dayIndex，0 起）：打几个月就数到几月月底。 */
export function lastDayIndex(s: Readonly<GameState>): number {
  let n = 0;
  for (let m = 1; m <= runMonths(s); m++) n += daysInMonth(m);
  return n - 1;
}

/**
 * 这一局有没有黑天鹅 Boss 日：只在真实行情的普通娱乐局（整年和 5 个月短局，含好友挑战）。
 * 实盘、每日挑战、闪电盘、合成行情、带调试字段的开局都没有，它们的结果逐位不变。
 */
export function hasSwan(s: Readonly<GameState>): boolean {
  if (!swanSwitch.enabled || !s.real || s.setup?.daily !== undefined || isFlash(s) || s.setup?.live !== undefined) return false;
  return isRankedSetup(s.setup);
}

/** 这一局的黑天鹅（只由种子定，独立的 rng 用途名 `blackSwan`，不碰任何别的抽取）；没有黑天鹅的局为 null。 */
export function swanPlan(s: Readonly<GameState>): { kind: SwanKind; theme: ThemeId | null } | null {
  if (!hasSwan(s)) return null;
  const rng = rngFor(s.seed, 'blackSwan');
  const kind = SWAN_KINDS[rng.int(SWAN_KINDS.length)] as SwanKind;
  const pick = rng.int(Math.max(1, s.themeIds.length));
  return { kind, theme: SWAN_DEFS[kind].themed ? ((s.themeIds[pick] as ThemeId | undefined) ?? null) : null };
}

/** 预告：最后 BALANCE.swan.warnDays 个交易日的盘前公开（含最后一天当天）；别的时候为 null。只有种类、题材、避险办法，没有幅度。 */
export function swanNotice(s: Readonly<GameState>): SwanNotice | null {
  const plan = swanPlan(s);
  if (!plan || s.phase !== 'premarket') return null;
  const daysLeft = lastDayIndex(s) - s.dayIndex;
  if (daysLeft < 0 || daysLeft >= BALANCE.swan.warnDays) return null;
  const w = swanWarn(plan.kind, plan.theme);
  return { kind: plan.kind, name: w.head, theme: plan.theme, daysLeft, line: w.line, hedge: w.hedge };
}

/**
 * 这一局开不开打新：只在真实行情、带仓位玩法的普通娱乐局（整年和 5 个月短局，含好友挑战）。
 * 实盘、每日挑战、闪电盘、本周市场、合成行情、带调试字段的开局都不开，它们的结果逐位不变。
 */
export function hasIpo(s: Readonly<GameState>): boolean {
  if (!ipoSwitch.enabled || !s.real || !s.ext) return false;
  if (s.setup?.daily !== undefined || s.setup?.flash !== undefined || s.setup?.live !== undefined || s.setup?.weekly !== undefined) return false;
  return isRankedSetup(s.setup);
}

/** 第 month 月第一个交易日的编号（dayIndex，0 起）。 */
function monthStartDay(month: number): number {
  let n = 0;
  for (let m = 1; m < month; m++) n += daysInMonth(m);
  return n;
}

/**
 * 第 month 月的新股和日程：BALANCE.ipo.fromMonth 起、最后一个月除外，每月第 floor(当月天数 / 2) 个交易日盘前开放申购，
 * 题材和新股只由种子定（rng 用途 `ipo`，按月分流）；不开打新的局和没有新股的月份为 null。
 * 日程：申购日 D 和 D+1 冻结，D+1 收盘后出签，D+2 上市（首日）。
 */
export function ipoOffer(s: Readonly<GameState>, month: number): IpoOffer | null {
  if (!hasIpo(s) || month < BALANCE.ipo.fromMonth || month >= runMonths(s) || s.themeIds.length === 0) return null;
  const rng = rngFor(s.seed, 'ipo', month);
  const theme = s.themeIds[rng.int(s.themeIds.length)] as ThemeId;
  const pool = IPO_STOCKS.filter((d) => d.theme === theme);
  const def = pool[rng.int(pool.length)];
  if (!def) return null;
  const day = monthStartDay(month) + Math.floor(daysInMonth(month) / 2) - 1;
  const F = BALANCE.ipo;
  return { stockId: def.id, name: def.name, theme, month, day, drawDay: day + F.freezeDays - 1, listDay: day + F.freezeDays, odds: { ...F.odds } };
}

/** 正在冻结的申购（没有为 null）。 */
export function ipoPending(s: Readonly<GameState>): { slot: number; offer: IpoOffer } | null {
  for (let slot = 0; slot < s.slots.length; slot++) {
    const h = s.slots[slot];
    if (h?.ipo?.stage === 'frozen') return { slot, offer: h.ipo.offer };
  }
  return null;
}

/** 今天盘前能申购的新股：有新股、这个月还没申购、有空格也有闲钱、没在加班；别的时候为 null。 */
export function ipoToday(s: Readonly<GameState>): IpoOffer | null {
  if (s.phase !== 'premarket' || !hasIpo(s) || isBusy(s)) return null;
  const offer = ipoOffer(s, s.month);
  if (!offer || offer.day !== s.dayIndex || ipoPending(s)) return null;
  if (firstEmpty(s) < 0 || freeUnits(s) + 1e-9 < BALANCE.ext.minUnit) return null;
  return offer;
}

/** 一局的总交易日数。 */
export function totalDays(): number {
  let n = 0;
  for (const d of BALANCE.monthDays) n += d;
  return n;
}

/** 第 month 月的基础月供（未计难度、信用卡）：(base + step × (month−1)) × growth^(month−1)，取整到百元。 */
export function baseBill(month: number): number {
  let v = BALANCE.bills.base + BALANCE.bills.step * (month - 1);
  for (let m = 1; m < month; m++) v *= BALANCE.bills.growth;
  return Math.round(v / 100) * 100;
}

/**
 * 第 month 月的常规月供（取整到百元）：基础月供 × 规则表的 billMult（难度、人设、众筹炒股）× mult（信用卡、房东涨租）。
 * 第二个参数可以直接给规则表，也可以给难度等级（再给人设、道具）。
 */
export function billFor(
  month: number,
  difficulty: number | Readonly<Rules> = 1,
  mult = 1,
  persona: PersonaId = 'newbie',
  items: readonly string[] = [],
): number {
  const r = typeof difficulty === 'number' ? rulesFor(items, difficulty, persona) : difficulty;
  return Math.round((baseBill(month) * r.billMult * mult) / 100) * 100;
}

/**
 * 隐藏：本局的突发账单（由种子决定，月初才公布）。一局 count 次，第 k 次落在 windows[k] 里的某个月；
 * 名目不重复，金额在 BALANCE.surprise.amounts[id] 内均匀抽取，乘难度和人设的突发账单倍数（surpriseMult），取整到百元。
 */
export function surprisePlan(seed: string, difficulty = 1, persona: PersonaId = 'newbie', billMult = 1): { month: number; extra: BillExtra }[] {
  const p = BALANCE.surprise;
  const rng = rngFor(seed, 'surprise');
  const n = Math.min(p.windows.length, p.count[0] + rng.int(p.count[1] - p.count[0] + 1));
  const pool = SURPRISE_BILLS.filter((d) => p.amounts[d.id] !== undefined);
  // billMult：实盘的账单倍数（0.6.0），和常规月供打同样的折
  const mult = rulesFor([], difficulty, persona).surpriseMult * billMult;
  const out: { month: number; extra: BillExtra }[] = [];
  for (let k = 0; k < n && pool.length > 0; k++) {
    const [lo, hi] = p.windows[k] as readonly [number, number];
    const month = lo + rng.int(hi - lo + 1);
    const def = pool.splice(rng.int(pool.length), 1)[0] as (typeof pool)[number];
    const [a, b] = p.amounts[def.id] as readonly [number, number];
    const amount = Math.round(((a + rng.next() * (b - a)) * mult) / 100) * 100;
    out.push({ month, extra: { id: def.id, name: def.name, amount } });
  }
  return out;
}

/**
 * 隐藏：第 6 级"股灾"的月份和出事的交易日（由种子决定）。月份在那个月月初才公布（state.notice），
 * 出事的是哪一天不公布（BALANCE.crash.day 的范围是公开的规则）。难度不到 6 级时为 null。
 */
export function crashPlan(seed: string, difficulty: number, real: Readonly<RealMarket> | null = null): { month: number; dayInMonth: number } | null {
  if (clampDifficulty(difficulty) < CRASH_LEVEL) return null;
  const c = BALANCE.crash;
  // 真实行情：对齐到股灾可能出现的那几个月里大盘真实跌得最多的一天（跌得不够狠就还按种子）
  if (real) {
    let best: { month: number; dayInMonth: number; r: number } | null = null;
    for (const month of c.months) {
      let first = 0;
      for (let m = 1; m < month; m++) first += daysInMonth(m);
      for (let k = 0; k < daysInMonth(month); k++) {
        const r = real.market[tapeIndex(real, first + k)] ?? 0;
        if (!best || r < best.r) best = { month, dayInMonth: k, r };
      }
    }
    if (best && best.r <= BALANCE.real.crashReal) return { month: best.month, dayInMonth: best.dayInMonth };
  }
  const rng = rngFor(seed, 'crash');
  const month = c.months[rng.int(c.months.length)] as number;
  const [lo, hi] = c.day;
  const dayInMonth = Math.min(daysInMonth(month) - 1, uniformInt(rng, lo, hi));
  return { month, dayInMonth };
}

/** 今天的市场规则：当月日历 → 难度；股灾那个月大盘更容易转熊（BALANCE.crash.bear）。 */
export function dayMarketRules(s: Readonly<GameState>): MarketRules {
  const mr = marketRulesFor(s.month, s.difficulty);
  if (s.notice?.id === 'crash') mr.bearBias += BALANCE.crash.bear;
  const wr = weeklyRuleOf(s.setup);
  if (wr) applyWeeklyMarket(mr, wr);
  return mr;
}

/** 股灾那个月的突发账单 id（不参加平时的随机突发账单）。 */
export const CRASH_BILL_ID = 'bailout';

/** "股灾"从第几级开始。 */
export const CRASH_LEVEL = 6;

export function crashNotice(month: number, real: boolean): MarketNotice {
  const [lo, hi] = real ? [0, daysInMonth(month) - 1] : BALANCE.crash.day;
  return {
    id: 'crash',
    month,
    name: '市场传闻',
    text: `传闻这个月要出大事：第 ${lo + 1}–${hi + 1} 个交易日里的某一天起，所有风口会一起降温`,
  };
}

/** 本月还剩几个交易日（含今天；盘前时今天还没结算）。 */
export function daysLeftInMonth(s: Readonly<GameState>): number {
  return Math.max(0, daysInMonth(s.month) - s.dayInMonth);
}

export function firstEmpty(s: Readonly<GameState>): number {
  return s.slots.indexOf(null);
}

/**
 * 每只持仓占账户的比例的分母：基础格数（4）；持仓超过基础格数（多开一格且拿满）时，
 * 多出来的每只只摊薄 fx('extra_slot','share') 份（1 = 按持仓数平分；0.5 = 拿满 5 只时每只占 1/4.5，总仓位 111%）。
 * 所以空着的基础格是现金、拖累收益，多开的那一格空着不拖累。
 */
export function holdingBase(s: Readonly<GameState>, holdings = usedUnits(s)): number {
  const extra = Math.max(0, holdings - BALANCE.slots);
  return BALANCE.slots + extra * (fx('extra_slot', 'share') || 1);
}
