/** 月份与交易日的开始：开月、盘前行情计划（合成、真实、跟踪）、开新的一天。 */
import { BALANCE } from '../balance.ts';
import { makeMessages, makeRecs, needsHeadline } from '../chat.ts';
import { BILL_NAMES, GEAR_INTEREST_BILL, SHORT_GOAL_BILL, SURPRISE_BILLS, calendarOf, eventById, itemById } from '../content/index.ts';
import type { MarketRules } from '../hooks.ts';
import { advanceStage, marketReturn, nextMood, rollDH, round2, runBillMult, rulesOf, stageDays, uniformInt } from '../market.ts';
import { rngFor } from '../rng.ts';
import { realDH, realEnter, realNextStage, tapeIndex, trackMarketRet, trackMood } from '../real.ts';
import { announceMonth, beginMonth, premarketQuiet, type TempoCtx } from '../tempo.ts';
import type { RealMarket } from '../segment.ts';
import type { DayPlan, GameState, ThemeId } from '../types.ts';
import { CRASH_BILL_ID, billFor, crashNotice, crashPlan, dayMarketRules, daysInMonth, ipoToday, isFlash, runMonths, shortGoal, surprisePlan } from './calendar.ts';
import { gearInterest } from './gear.ts';
import { gainItem, setAccount } from './holdings.ts';
import { CRASH_STAGES, rewardCandidates } from './reward.ts';
import { type Emitter, emit } from './shared.ts';

// ================================================================ 月份与交易日

export function startMonth(s: GameState, month: number, em: Emitter): void {
  s.month = month;
  s.dayInMonth = 0;
  // 闪电盘：没有月供、突发账单、股灾传闻、月度主题和延后结算，也不发 monthStarted（画面没有"新月份"这回事）
  if (isFlash(s)) {
    if (s.tempo) s.tempo.cur = null;
    s.bill = { month, name: '', amount: 0, extras: [] };
    s.notice = null;
    for (const id of [...s.items]) {
      itemById(id).onMonthStart?.({
        state: s,
        addAccount(amount, text) {
          const before = s.account;
          setAccount(s, s.account + amount);
          emit(em, { type: 'itemTriggered', itemId: id, slot: null, stockId: null, text, delta: round2(s.account - before) });
        },
      });
    }
    s.stats.monthOpen = s.account;
    return;
  }
  // 先定本月主题（规则表从这一刻起叠加主题的修改，月供也按它算）
  beginMonth(s);
  const rules = rulesOf(s);
  const base = billFor(month, rules, s.nextBillMult);
  s.nextBillMult = 1;
  const extras = surprisePlan(s.seed, s.difficulty, s.persona, runBillMult(s))
    .filter((x) => x.month === month)
    .map((x) => ({ ...x.extra }));
  // 第 6 级股灾那个月：爆仓的亲戚找你借钱救急（按常规月供的比例，和传闻一起在月初公布）
  const crashMonth = crashPlan(s.seed, s.difficulty, s.real ?? null);
  if (crashMonth && crashMonth.month === month && BALANCE.crash.bill > 0) {
    const def = SURPRISE_BILLS.find((d) => d.id === CRASH_BILL_ID);
    extras.push({ id: CRASH_BILL_ID, name: def?.name ?? '借钱救急', amount: Math.round((base * BALANCE.crash.bill) / 100) * 100 });
  }
  // 娱乐短局：最后一个月月底多交一笔首付（这局的最终目标，开局时就说了）
  const goal = shortGoal(s);
  if (goal > 0 && month === runMonths(s)) extras.push({ id: SHORT_GOAL_BILL.id, name: SHORT_GOAL_BILL.name, amount: goal });
  // 实盘杠杆：每月的融资利息（开局资产的比例，取整到百元）
  const interest = gearInterest(s);
  if (interest > 0) extras.push({ id: GEAR_INTEREST_BILL.id, name: GEAR_INTEREST_BILL.name, amount: interest });
  let amount = base;
  for (const x of extras) amount += x.amount;
  s.bill = { month, name: BILL_NAMES[month - 1] ?? '账单', amount, extras };
  emit(em, { type: 'monthStarted', month, days: daysInMonth(month), bill: { ...s.bill, extras: extras.map((x) => ({ ...x })) }, calendar: calendarOf(month).id });
  // 第 6 级股灾：那个月月初公布传闻
  const crash = crashPlan(s.seed, s.difficulty, s.real ?? null);
  s.notice = crash && crash.month === month ? crashNotice(month, !!s.real) : null;
  if (s.notice) emit(em, { type: 'marketNotice', notice: { ...s.notice } });
  // 事件留下的延后结算
  const due = s.pending.filter((p) => p.month === month);
  s.pending = s.pending.filter((p) => p.month !== month);
  for (const p of due) {
    const def = eventById(p.id);
    if (!def.settle) continue;
    const r = def.settle({ state: s, rng: rngFor(s.seed, 'pending', month, p.id), badMult: rules.eventBadMult }, p.amount);
    const before = s.account;
    setAccount(s, s.account + r.delta);
    emit(em, { type: 'pendingSettled', id: p.id, amount: p.amount, delta: round2(s.account - before), text: r.text });
  }
  for (const id of [...s.items]) {
    const def = itemById(id);
    def.onMonthStart?.({
      state: s,
      addAccount(amount, text) {
        const before = s.account;
        setAccount(s, s.account + amount);
        emit(em, { type: 'itemTriggered', itemId: id, slot: null, stockId: null, text, delta: round2(s.account - before) });
      },
    });
  }
  if (s.tempo) announceMonth(s, tempoCtx(s, em));
  s.stats.monthOpen = s.account;
}

/** 节奏模块要用的引擎能力（加钱、发道具、发事件）。 */
export function tempoCtx(s: GameState, em: Emitter): TempoCtx {
  return {
    emit: (e) => emit(em, e),
    addCash(amount) {
      const before = s.account;
      setAccount(s, s.account + amount);
      return round2(s.account - before);
    },
    gainItem: (id) => gainItem(s, id, em),
    itemPool: () => rewardCandidates(s).item.map((c) => c.id),
  };
}

/**
 * 个股照搬真实走势时的今天。大盘 = amp × 真实涨跌（日历、难度、股灾不再改大盘）；
 * 风口热度和阶段照 0.4（真实相对强弱 + 日历、直播间、震荡等加成，股灾时一起退潮）——热度只是信息，不影响个股涨跌。
 */
function trackPlan(s: GameState, real: Readonly<RealMarket>, mr: MarketRules, crash: boolean): DayPlan {
  const R = BALANCE.real;
  const day = s.dayIndex;
  const i = tapeIndex(real, day);
  const dH: Partial<Record<ThemeId, number>> = {};
  for (const id of s.themeIds) {
    const t = s.themes[id];
    if (!t) continue;
    const rng = rngFor(s.seed, 'stage', id, day);
    const uIgnite = rng.next();
    const uChop = rng.next();
    const data = realDH(real, t, i);
    let bonus = (mr.themeDH[id] ?? 0) + (t.boost?.dH ?? 0);
    if (t.stage === 'cold' && uIgnite < mr.sprout + (mr.sproutTheme[id] ?? 0)) bonus += R.igniteDH;
    if (mr.dHNoise > 0) bonus += -mr.dHNoise + 2 * mr.dHNoise * uChop;
    let d = data * mr.dHMult + bonus;
    if (crash && (CRASH_STAGES as readonly string[]).includes(t.stage)) {
      t.lastStage = t.stage;
      t.stage = 'ebb';
      t.age = 0;
      t.sure = false;
      t.rebound = true;
      d += R.crashDH;
    }
    const forced = crash && t.rebound === true && t.age === 0;
    const next = forced ? 'ebb' : realNextStage(t, Math.round(d) || 0);
    if (next === 'ebb' && d < 0) d *= mr.ebbMult * (crash ? BALANCE.crash.plunge : 1);
    realEnter(t, next);
    dH[id] = Math.round(d) || 0;
  }
  const market = round2(trackMarketRet(real, i));
  return { mood: trackMood(real, i), marketRet: market, dH };
}

export function startDay(s: GameState, em: Emitter): void {
  s.phase = 'premarket';
  const day = s.dayIndex;
  const rules = rulesOf(s);
  const mr = dayMarketRules(s);
  const dH: Partial<Record<ThemeId, number>> = {};
  const crash = s.notice?.id === 'crash' && crashPlan(s.seed, s.difficulty, s.real ?? null)?.dayInMonth === s.dayInMonth;
  if (s.real) {
    s.today = { day, messages: [], recs: [], buysLeft: s.busyDay === day ? 0 : rules.buysPerDay, ops: 0, buys: 0, plan: trackPlan(s, s.real, mr, crash) };
  }
  for (const id of s.real ? [] : s.themeIds) {
    const t = s.themes[id];
    if (!t) continue;
    advanceStage(t, mr, rngFor(s.seed, 'stage', id, day));
    // 股灾：所有还没退潮、不在冷门的题材今天起提前退潮（隐藏，收盘后揭晓）
    if (crash && (CRASH_STAGES as readonly string[]).includes(t.stage)) {
      t.stage = 'ebb';
      t.sure = false;
      t.rebound = true;
      const [lo, hi] = stageDays('ebb', id);
      t.left = uniformInt(rngFor(s.seed, 'crashStage', id), lo, hi);
    }
    dH[id] = rollDH(t, crash ? { ...mr, ebbMult: mr.ebbMult * BALANCE.crash.plunge } : mr, rngFor(s.seed, 'dH', id, day));
  }
  const moodRng = rngFor(s.seed, 'mood', day);
  let mood = s.real ? s.today.plan.mood : nextMood(s.mood, mr, moodRng);
  let marketRet = s.real ? s.today.plan.marketRet : marketReturn(mood, mr, moodRng);
  // 股灾当天：大盘暴跌（隐藏，收盘后揭晓）
  if (crash && !s.real) {
    mood = 'bear';
    marketRet = round2(marketRet + BALANCE.crash.marketHit);
  }
  const busy = s.busyDay === day;
  if (!s.real) s.today = { day, messages: [], recs: [], buysLeft: busy ? 0 : rules.buysPerDay, ops: 0, buys: 0, plan: { mood, marketRet, dH } };
  const manufactured = !!s.real && needsHeadline(s);
  s.today.messages = makeMessages(s, rules);
  s.today.recs = makeRecs(s, rules);
  if (s.tempo) s.today.quiet = premarketQuiet(s);
  emit(em, { type: 'dayStarted', day, month: s.month, dayInMonth: s.dayInMonth });
  emit(em, { type: 'chat', messages: s.today.messages.map((m) => ({ ...m })), recs: s.today.recs.map((r) => ({ ...r })) });
  const ipoOpen = em.enabled ? ipoToday(s) : null;
  if (ipoOpen) emit(em, { type: 'ipoOpened', offer: { ...ipoOpen, odds: { ...ipoOpen.odds } } });
  // 本月还没有高光，主题在月末前一天放出一条重磅情报（算一次高光）
  const big = manufactured ? s.today.messages.find((m) => m.big) : undefined;
  if (big && s.tempo?.cur) {
    s.tempo.cur.highlights += 1;
    emit(em, { type: 'highlight', kind: 'headline', text: `重磅情报：${big.text}` });
  }
}
