/** 开盘：一天的结算，按固定顺序分成几步（题材、个股、连锁、持仓、账户、消息、日报、复盘、统计、收盘）。 */
import { BALANCE } from '../balance.ts';
import { makeComments, themeTruth } from '../chat.ts';
import { effectLabel, holdingParts, itemEffect, leadPart, leverageEffect, shortParts } from '../explain.ts';
import { ipoBoundStock, ipoPremiumOn, ipoWon } from '../ipo.ts';
import { dayQuips, makeNews } from '../story.ts';
import { SWAN_DEFS, swanDelta, swanShortDelta, swanWarn } from '../swan.ts';
import { itemById, stockById, stocksOf } from '../content/index.ts';
import type { HoldingCtx, MarketRules, Rules } from '../hooks.ts';
import { dirOf, feelOf, moveStocks, newStock, round2, rulesOf, settleTheme, type RawPart } from '../market.ts';
import { rngFor } from '../rng.ts';
import { realMarketPct, realSectorPct, realStockPct, tapeIndex, trackThemeRet } from '../real.ts';
import { tempoClose } from '../tempo.ts';
import type { RealMarket } from '../segment.ts';
import type { AccountEffect, DayPlan, ChainLink, DayReport, GameState, HoldingMove, HoldingStep, IpoOffer, ItemTrigger, MessageJudge, Stage, StockMove, ThemeId, ThemeMove } from '../types.ts';
import { crashPlan, dayMarketRules, daysInMonth, holdingBase, isFlash, lastDayIndex, swanPlan } from './calendar.ts';
import { startDay, tempoCtx } from './day.ts';
import { flashEvent } from './event.ts';
import { checkBank, learn, react, shortWind, unitsOf } from './ext.ts';
import { marginCalled } from './gear.ts';
import { addStat, closeHolding, setAccount } from './holdings.ts';
import { endMonth } from './month.ts';
import { type Emitter, emit } from './shared.ts';

/**
 * 打新中签的新股当天的涨跌：绑定"替身"（同题材真实波动最大的在场股票）的真实涨跌 × BALANCE.track.amp，
 * 上市头两天再叠溢价（pp），按新股的涨跌停截断。不掷随机数；归因写进 rawParts（溢价另成一项，见 PartContext.ipo）。
 * 会更新 s.stocks 里这只新股的价格和涨跌记录。
 */
function moveIpoStock(
  s: GameState,
  offer: IpoOffer,
  day: number,
  tape: Readonly<RealMarket>,
  i: number,
  rules: Rules,
  rawParts: Map<string, RawPart[]>,
): { move: StockMove; premium: number } | null {
  const st = s.stocks[offer.stockId];
  if (!st) return null;
  const bound = ipoBoundStock(s, offer.theme);
  const amp = BALANCE.track.amp;
  const raw = bound ? amp * realStockPct(tape, bound, i) : 0;
  const premium = ipoPremiumOn(s.seed, offer, day);
  const limit = BALANCE.roles.ipo.limit * rules.limitMult;
  const x = round2(Math.max(-limit, Math.min(limit, raw + premium)));
  const mk = amp * realMarketPct(tape, i);
  const sec = amp * realSectorPct(tape, offer.theme, i);
  const parts: RawPart[] = [
    { kind: 'market', value: mk },
    { kind: 'theme', value: sec - mk },
    { kind: 'noise', value: raw - sec },
  ];
  if (x !== raw + premium) parts.push({ kind: 'limit', value: x - raw - premium });
  rawParts.set(offer.stockId, parts);
  st.move = x;
  st.history.push(x);
  while (st.history.length > 5) st.history.shift();
  st.price = Math.max(0.01, round2(st.price * (1 + x / 100)));
  return { move: { id: offer.stockId, move: x, limitUp: false, limitDown: false, boards: 0, blown: false, jump: 0, chain: 0, st: null }, premium };
}


/** 开盘各步骤共用的当天信息：盘前就定下，开盘过程中不再变。 */
interface DayBase {
  day: number;
  plan: DayPlan;
  rules: Rules;
  mr: MarketRules;
  swanToday: ReturnType<typeof swanPlan>;
}

/** 第 1 步的结果：大盘天气和题材。 */
interface ThemeStep {
  moodBefore: GameState['mood'];
  themeRet: Partial<Record<ThemeId, number>>;
  themes: ThemeMove[];
  stageOf: Map<ThemeId, Stage>;
}

/** 第 2 步的结果：个股涨跌。 */
interface StockStep {
  held: Set<string>;
  rawParts: Map<string, RawPart[]>;
  boardsBefore: Map<string, number>;
  moves: StockMove[];
  ipoPremium: Map<string, number>;
  moveOf: Map<string, StockMove>;
}

/** 第 3 步的结果：龙头带动。 */
interface ChainStep {
  chains: ChainLink[];
  leaderUp: Set<ThemeId>;
}

/** 第 4 步的结果：持仓收益与道具。 */
interface HoldingStepResult {
  triggers: ItemTrigger[];
  holdings: HoldingMove[];
}

/** 第 5 步的结果：账户。 */
interface AccountStep {
  before: number;
  gross: number;
  accRet: number;
  afterTrade: number;
  effects: AccountEffect[];
  autoSold: DayReport['autoSold'];
  weight: number;
  heldThemeCount: Map<ThemeId, number>;
  bank: ReturnType<typeof checkBank> | null;
}

/** 第 6 步的结果：消息揭晓。 */
interface JudgeStep {
  track: RealMarket | null;
  judged: MessageJudge[];
  intel: MessageJudge[];
}

/** 开盘：按第 5 节的顺序结算今天，并推进到下一天 / 月底。每一步按原来的顺序依次做，事件推送和随机数取用的先后不变。 */
export function open(s: GameState, em: Emitter): void {
  const day = s.today.day;
  const plan = s.today.plan;
  const rules = rulesOf(s);
  const mr = dayMarketRules(s);
  emit(em, { type: 'opened', day });
  const b: DayBase = { day, plan, rules, mr, swanToday: announceSwan(s, em, day) };
  const th = settleThemes(s, em, b);
  const stock = settleStocks(s, b, th);
  const ch = linkChains(stock);
  const hd = settleHoldings(s, em, b, th, stock, ch);
  const ac = settleAccount(s, em, b, hd);
  const jd = judgeMessages(s, em, b, th);
  const report = buildReport(s, em, b, th, stock, ch, hd, ac, jd);
  reviewOne(s, em, b, th);
  tallyStats(s, stock, ch, hd, ac, report);
  closeDay(s, em, report);
}

/** 黑天鹅 Boss 日：每局最后一个交易日；盘前已经公开的预告，开盘时画面全屏报幕。 */
function announceSwan(s: GameState, em: Emitter, day: number): DayBase['swanToday'] {
  const swanToday = day === lastDayIndex(s) ? swanPlan(s) : null;
  if (swanToday) {
    const w = swanWarn(swanToday.kind, swanToday.theme);
    emit(em, { type: 'swanOpen', notice: { kind: swanToday.kind, name: w.head, theme: swanToday.theme, daysLeft: 0, line: w.line, hedge: w.hedge } });
  }
  return swanToday;
}

/** 1. 大盘天气、题材热度 */
function settleThemes(s: GameState, em: Emitter, b: DayBase): ThemeStep {
  const { day, plan, mr } = b;
  const moodBefore = s.mood;
  s.mood = plan.mood;
  emit(em, { type: 'marketMoved', moodBefore, mood: s.mood, ret: plan.marketRet });
  const themeRet: Partial<Record<ThemeId, number>> = {};
  const themes: ThemeMove[] = [];
  for (const id of s.themeIds) {
    const t = s.themes[id];
    if (!t) continue;
    const heatBefore = t.heat;
    const feelBefore = feelOf(t.history);
    const stage = t.stage;
    // 真实行情：风口涨跌 = amp × 真实行业当天涨跌（和个股一致；热度只是信息）
    const realRet = s.real ? round2(trackThemeRet(s.real, id, tapeIndex(s.real, day))) : undefined;
    const r = settleTheme(t, plan.dH[id] ?? 0, mr, rngFor(s.seed, 'themeNoise', id, day), realRet);
    themeRet[id] = r.ret;
    const tm: ThemeMove = { id, heatBefore, heat: t.heat, dH: r.dH, ret: r.ret, feelBefore, feel: feelOf(t.history), stage };
    themes.push(tm);
    emit(em, { type: 'themeMoved', ...tm });
  }
  const stageOf = new Map(themes.map((t) => [t.id, t.stage]));
  return { moodBefore, themeRet, themes, stageOf };
}

/** 2. 个股涨跌（含打新中签的新股） */
function settleStocks(s: GameState, b: DayBase, th: ThemeStep): StockStep {
  const { day, plan, mr, rules } = b;
  const { themeRet } = th;
  const held = new Set<string>();
  // 申购冻结中的新股还没上市（s.stocks 里没有它），不算持仓
  for (const h of s.slots) if (h && h.ipo?.stage !== 'frozen') held.add(h.stockId);
  const rawParts = new Map<string, RawPart[]>();
  const boardsBefore = new Map<string, number>();
  for (const id of held) boardsBefore.set(id, s.stocks[id]?.boards ?? 0);
  const real = s.real ? { tape: s.real, i: tapeIndex(s.real, day) } : undefined;
  const moves = moveStocks({ seed: s.seed, day, state: s, themeRet, marketRet: plan.marketRet, mr, rules, held, partsOut: rawParts, real });
  // 打新中签的新股不在 moveStocks 的股票池里：逐日照搬"替身"的真实涨跌，上市头两天再叠溢价
  const ipoPremium = new Map<string, number>();
  if (real) {
    for (const h of s.slots) {
      if (h?.ipo?.stage !== 'listed') continue;
      const r = moveIpoStock(s, h.ipo.offer, day, real.tape, real.i, rules, rawParts);
      if (!r) continue;
      moves.push(r.move);
      if (r.premium !== 0) ipoPremium.set(h.stockId, r.premium);
    }
  }
  const moveOf = new Map(moves.map((m) => [m.id, m]));
  return { held, rawParts, boardsBefore, moves, ipoPremium, moveOf };
}

/** 3. 连锁：龙头涨停带动同题材跟风 */
function linkChains(stock: StockStep): ChainStep {
  const { moves, moveOf, held } = stock;
  const chains: ChainLink[] = [];
  for (const m of moves) {
    const def = stockById(m.id);
    if (def.role !== 'leader' || !m.limitUp) continue;
    const followers = stocksOf(def.theme)
      .filter((d) => (moveOf.get(d.id)?.chain ?? 0) > 0 || moveOf.get(d.id)?.follow === true)
      .map((d) => d.id);
    if (followers.length === 0 && !held.has(m.id)) continue;
    chains.push({ leader: m.id, followers, held: followers.filter((id) => held.has(id)), leaderHeld: held.has(m.id) });
  }
  const leaderUp = new Set<ThemeId>();
  for (const c of chains) if (c.leaderHeld) leaderUp.add(stockById(c.leader).theme);
  return { chains, leaderUp };
}

/** 4. 持仓收益与道具 */
function settleHoldings(s: GameState, em: Emitter, b: DayBase, th: ThemeStep, stock: StockStep, ch: ChainStep): HoldingStepResult {
  const { day, plan, rules, swanToday } = b;
  const { themes, stageOf } = th;
  const { held, rawParts, boardsBefore, moves, ipoPremium, moveOf } = stock;
  const { chains, leaderUp } = ch;
  const triggers: ItemTrigger[] = [];
  const holdings: HoldingMove[] = [];
  for (let slot = 0; slot < s.slots.length; slot++) {
    const h = s.slots[slot];
    if (!h || h.ipo?.stage === 'frozen') continue;
    const stock = stockById(h.stockId);
    const move = moveOf.get(h.stockId);
    if (!move) continue;
    if (stageOf.get(stock.theme) === 'ebb') h.sawEbb = true;
    const steps: HoldingStep[] = [{ source: 'move', label: '股票本身的涨跌', value: move.move }];
    // 黑天鹅：真实行情算完之后再叠一层额外涨跌；押跌的反着算（它被砸你赚，它被推上去你被轧）
    const swanLong = swanToday ? swanDelta(swanToday.kind, swanToday.theme, stock.theme, move.move) : 0;
    const swanRet = h.short ? swanShortDelta(swanLong) : swanLong;
    const itemParts: { itemId: string; value: number }[] = [];
    let current = '';
    const ctx: HoldingCtx = {
      state: s,
      slot,
      holding: h,
      stock,
      move,
      stage: stageOf.get(stock.theme) ?? 'cold',
      boughtToday: h.boughtDay >= day && !rules.noT1,
      leaderUp,
      marketRet: plan.marketRet,
      ret: move.move + (h.short ? 0 : swanRet),
      sell: move.st === 'delisted' ? 'delist' : null,
      trigger(text) {
        triggers.push({ itemId: current, slot, stockId: h.stockId, text, delta: 0 });
      },
    };
    const run = (phase: 'onHolding' | 'onExit'): void => {
      for (const id of s.items) {
        const fn = itemById(id)[phase];
        if (!fn) continue;
        current = id;
        const before = ctx.ret;
        const n = triggers.length;
        fn(ctx);
        if (ctx.ret !== before) itemParts.push({ itemId: id, value: ctx.ret - before });
        if (triggers.length > n) {
          const t = triggers[triggers.length - 1] as ItemTrigger;
          t.delta = round2(ctx.ret - before);
          steps.push({ source: id, label: itemById(id).name, value: round2(ctx.ret) });
        }
      }
    };
    // 押跌：它跌你赚、它涨你亏；涨停被轧亏得更狠；每天一点手续费。押跌不吃"买涨"的道具，只走自动卖出
    let squeeze = 0;
    if (h.short) {
      // 晴天押跌逆风、雨天押跌顺风（窗外天气就是今天的大环境）
      const wind = shortWind(s, plan.mood);
      ctx.ret = -move.move * rules.shortGainMult - BALANCE.ext.shortFee + wind;
      if (move.limitUp) {
        squeeze = -move.move * (BALANCE.ext.squeeze - 1) * rules.squeezeMult;
        ctx.ret += squeeze;
      }
      ctx.ret += swanRet;
    } else run('onHolding');
    run('onExit');
    const ret = round2(ctx.ret);
    h.value = h.value * (1 + ret / 100);
    h.todayRet = ret;
    const pctx = {
      stockId: h.stockId,
      move,
      dH: themes.find((t) => t.id === stock.theme)?.dH ?? 0,
      marketRet: plan.marketRet,
      boardsBefore: boardsBefore.get(h.stockId) ?? 0,
      track: !!s.real,
      swan: swanToday && swanRet !== 0 ? { name: SWAN_DEFS[swanToday.kind].name, value: swanRet } : undefined,
      ipo: ipoPremium.has(h.stockId) ? { value: ipoPremium.get(h.stockId) as number } : undefined,
    };
    const parts = h.short
      ? shortParts(squeeze, itemParts, ret, pctx)
      : holdingParts(rawParts.get(h.stockId) ?? [{ kind: 'noise', value: move.move }], itemParts, ret, pctx);
    const hm: HoldingMove = { slot, stockId: h.stockId, move: move.move, ret, parts, lead: leadPart(parts), amount: 0, steps, holdRet: round2((h.value - 1) * 100), sold: ctx.sell };
    if (swanToday && swanRet !== 0) hm.swan = round2(swanRet);
    if (ipoPremium.has(h.stockId)) hm.ipo = ipoPremium.get(h.stockId) as number;
    if (s.ext) {
      hm.units = unitsOf(h);
      if (h.short) {
        hm.short = true;
        if (move.limitUp) {
          hm.squeeze = true;
          h.squeezed = (h.squeezed ?? 0) + 1;
          s.ext.log.squeezes += 1;
          s.ext.log.stubborn = Math.max(s.ext.log.stubborn, h.squeezed);
          emit(em, { type: 'squeezed', slot, stockId: h.stockId, ret });
          learn(s, 'squeeze', em);
        } else h.squeezed = 0;
      }
    }
    holdings.push(hm);
  }
  for (const hm of holdings) {
    const stock = moveOf.get(hm.stockId);
    if (stock) emit(em, { type: 'stockMoved', ...hm, stock });
    // 上市首日收盘：溢价大涨还是破发
    const listed = s.slots[hm.slot]?.ipo;
    if (listed?.stage === 'listed' && listed.offer.listDay === day) emit(em, { type: 'ipoListed', slot: hm.slot, stockId: hm.stockId, premium: hm.ipo ?? 0 });
  }
  for (const c of chains) emit(em, { type: 'chain', ...c });
  for (const t of triggers) emit(em, { type: 'itemTriggered', ...t });
  for (const m of moves) {
    if (!m.st) continue;
    emit(em, { type: 'stockNews', stockId: m.id, news: m.st, warnings: s.stocks[m.id]?.warnings ?? 0, held: held.has(m.id) });
  }
  return { triggers, holdings };
}

/** 5. 账户：把今天的收益记到账上、分摊到每格、自动卖出、新股出签、银行检查 */
function settleAccount(s: GameState, em: Emitter, b: DayBase, hd: HoldingStepResult): AccountStep {
  const { day, rules } = b;
  const { triggers, holdings } = hd;
  let gross = 0;
  let unitSum = 0;
  for (const hm of holdings) unitSum += hm.units ?? 1;
  const weight = 1 / holdingBase(s, unitSum);
  for (const hm of holdings) gross += hm.ret * weight * (hm.units ?? 1);
  gross = round2(gross);
  let accRet = round2(gross * rules.leverage);
  const levRet = accRet - gross;
  const accItems: { itemId: string; value: number }[] = [];
  const heldThemeCount = new Map<ThemeId, number>();
  for (const hm of holdings) {
    const th = stockById(hm.stockId).theme;
    heldThemeCount.set(th, (heldThemeCount.get(th) ?? 0) + 1);
  }
  for (const id of s.items) {
    const fn = itemById(id).onAccount;
    if (!fn) continue;
    const ctx = {
      state: s,
      themes: heldThemeCount.size,
      ret: accRet,
      trigger(text: string) {
        triggers.push({ itemId: id, slot: null, stockId: null, text, delta: 0 });
      },
    };
    const n = triggers.length;
    fn(ctx);
    if (triggers.length > n) {
      const t = triggers[triggers.length - 1] as ItemTrigger;
      t.delta = round2(ctx.ret - accRet);
      emit(em, { type: 'itemTriggered', ...t });
    }
    if (round2(ctx.ret) !== accRet) accItems.push({ itemId: id, value: round2(ctx.ret) - accRet });
    accRet = round2(ctx.ret);
  }
  const before = s.account;
  setAccount(s, before * (1 + accRet / 100));
  const effects = splitMoney(before, s.account, holdings, weight, levRet, accItems);
  // 打新累计盈亏：中签后新股持仓每天给账户带来的盈亏
  const ipoStat = s.stats.ipo;
  if (ipoStat) for (const hm of holdings) if (s.slots[hm.slot]?.ipo?.stage === 'listed') ipoStat.money = round2(ipoStat.money + hm.amount);
  if (s.ext) {
    for (const hm of holdings) {
      if (!hm.short) continue;
      const log = s.ext.log;
      log.shortPnl = round2(log.shortPnl + hm.amount);
    }
  }
  const autoSold: DayReport['autoSold'] = [];
  for (const hm of holdings) {
    if (!hm.sold) continue;
    closeHolding(s, hm.slot, hm.sold);
    autoSold.push({ slot: hm.slot, stockId: hm.stockId, reason: hm.sold });
    emit(em, { type: 'autoSold', slot: hm.slot, stockId: hm.stockId, reason: hm.sold, holdRet: hm.holdRet });
  }
  // 打新：冻结满的那天收盘后出签（没中清空这一格；中签只配 1 份，新股从明天起正常交易，上市首日是后天）
  for (let slot = 0; slot < s.slots.length; slot++) {
    const h = s.slots[slot];
    const ipo = h?.ipo;
    if (!h || ipo?.stage !== 'frozen' || ipo.offer.drawDay !== day) continue;
    const won = ipoWon(s.seed, ipo.offer, ipo.size ?? 'taste');
    if (won) {
      const id = ipo.offer.stockId;
      s.stocks[id] = newStock(s.seed, id, 'ipo');
      s.slots[slot] = { ...h, boughtDay: day, units: Math.min(BALANCE.ipo.units, unitsOf(h)), ipo: { stage: 'listed', offer: ipo.offer } };
      if (s.stats.ipo) s.stats.ipo.wins += 1;
    } else s.slots[slot] = null;
    emit(em, { type: 'ipoDrawn', slot, won, offer: { ...ipo.offer, odds: { ...ipo.offer.odds } } });
  }
  emit(em, { type: 'accountChanged', before, after: s.account, ret: accRet });
  // 收盘小结只讲交易带来的变化；银行收走东西另记在 report.bank 和 seized 事件里
  const afterTrade = s.account;
  // 炒股本身累计赚亏（结算页按它评价，不按最后剩多少钱——账单、利息、奖励都不算在里面）
  addStat(s, 'tradeMoney', afterTrade - before);
  const bank = s.ext ? checkBank(s, em) : null;
  return { before, gross, accRet, afterTrade, effects, autoSold, weight, heldThemeCount, bank };
}

/** 6. 消息揭晓、群友战绩 */
function judgeMessages(s: GameState, em: Emitter, b: DayBase, th: ThemeStep): JudgeStep {
  const { day } = b;
  const { themes } = th;
  const dHOf = new Map(themes.map((t) => [t.id, t.dH]));
  const score = (friendId: string, hit: boolean): void => {
    const f = s.friends.find((x) => x.id === friendId);
    if (f) {
      f.total += 1;
      if (hit) f.hits += 1;
    }
  };
  // 真实行情：消息说的是风口接下来 days 天的真实累计方向；说一天的当天揭晓，说几天的到期那天收盘揭晓（report.intel）
  const track = s.real ?? null;
  const judged: MessageJudge[] = [];
  s.today.messages.forEach((m, index) => {
    const days = m.days ?? 1;
    if (track && days > 1) {
      (s.watch ??= []).push({ day, index, friendId: m.friendId, theme: m.theme, claim: m.claim, days });
      return;
    }
    const truth = track ? themeTruth(track, m.theme, day, 1) : dirOf(dHOf.get(m.theme) ?? 0);
    const hit = truth === m.claim;
    score(m.friendId, hit);
    const j: MessageJudge = { index, friendId: m.friendId, theme: m.theme, claim: m.claim, truth, hit };
    if (track) j.days = 1;
    judged.push(j);
  });
  for (const j of judged) emit(em, { type: 'messageJudged', ...j });
  const intel: MessageJudge[] = [];
  if (track && s.watch && s.watch.length > 0) {
    const due = s.watch.filter((w) => w.day + w.days - 1 <= day || day >= track.days - 1);
    s.watch = s.watch.filter((w) => !due.includes(w));
    for (const w of due) {
      const truth = themeTruth(track, w.theme, w.day, w.days);
      const hit = truth === w.claim;
      score(w.friendId, hit);
      const j: MessageJudge = { index: w.index, day: w.day, days: w.days, friendId: w.friendId, theme: w.theme, claim: w.claim, truth, hit };
      intel.push(j);
      emit(em, { type: 'intelJudged', ...j });
    }
  }
  return { track, judged, intel };
}

/** 收盘小结：押跌的烟花和雨、日报、群聊吐槽、新闻、高光，以及日报里的黑天鹅一项。 */
function buildReport(s: GameState, em: Emitter, b: DayBase, th: ThemeStep, stock: StockStep, ch: ChainStep, hd: HoldingStepResult, ac: AccountStep, jd: JudgeStep): DayReport {
  const { day, plan, swanToday } = b;
  const { moodBefore, themes } = th;
  const { moves, moveOf } = stock;
  const { chains } = ch;
  const { triggers, holdings } = hd;
  const { before, gross, accRet, afterTrade, effects, autoSold, weight, bank } = ac;
  const { track, judged, intel } = jd;
  // 押跌的：跌停放烟花、涨停下雨
  const fireworks = holdings.some((hm) => (hm.short ? moveOf.get(hm.stockId)?.limitDown : moveOf.get(hm.stockId)?.limitUp));
  const rain = holdings.some((hm) => (hm.short ? moveOf.get(hm.stockId)?.limitUp : moveOf.get(hm.stockId)?.limitDown));
  const crashToday = s.notice?.id === 'crash' && crashPlan(s.seed, s.difficulty, s.real ?? null)?.dayInMonth === s.dayInMonth;
  const report: DayReport = {
    day,
    month: s.month,
    dayInMonth: s.dayInMonth,
    market: { moodBefore, mood: s.mood, ret: plan.marketRet },
    themes,
    stocks: moves,
    holdings,
    chains,
    triggers,
    account: { before, gross, ret: accRet, after: afterTrade, effects },
    autoSold,
    messages: judged,
    comments: [],
    fireworks,
    rain,
    crash: crashToday,
    news: [],
    quips: [],
  };
  if (bank) report.bank = bank;
  if (swanToday) {
    let money = 0;
    for (const hm of holdings) if (hm.swan !== undefined) money += (before * hm.swan * weight * (hm.units ?? 1)) / 100;
    report.swan = {
      kind: swanToday.kind,
      name: SWAN_DEFS[swanToday.kind].name,
      theme: swanToday.theme,
      money: round2(money),
      touched: holdings.some((hm) => hm.swan !== undefined),
    };
  }
  if (track) report.intel = intel;
  report.comments = makeComments(s, report);
  for (const c of report.comments) emit(em, { type: 'comment', ...c });
  // 被轧、银行打电话、东西被收走，群友接一句
  if (s.ext) {
    const shortWin = holdings.some((h) => h.short && moveOf.get(h.stockId)?.limitDown);
    const kind = bank?.seized.length ? 'seized' : bank?.called ? 'call' : holdings.some((h) => h.squeeze) ? 'squeeze' : shortWin ? 'shortWin' : null;
    const c = kind ? react(s, em, kind, day) : null;
    if (c) report.comments.push(c);
  }
  report.news = makeNews(s, report);
  for (const n of report.news) emit(em, { type: 'news', ...n });
  report.quips = dayQuips(s, report);
  for (const q of report.quips) emit(em, { type: 'quip', ...q });
  if (crashToday) emit(em, { type: 'crashHit', day, month: s.month });
  // 高光、连击、月度目标、平淡日（小奖励加在交易结算之后）
  if (s.tempo) report.tempo = tempoClose(s, report, tempoCtx(s, em));
  return report;
}

/** 熬夜复盘：随机揭示一个题材当天的真实阶段（公开，到第二天盘前有效） */
function reviewOne(s: GameState, em: Emitter, b: DayBase, th: ThemeStep): void {
  const { day, rules } = b;
  const { stageOf } = th;
  if (rules.reviewOne && s.themeIds.length > 0) {
    const rng = rngFor(s.seed, 'review', day);
    const theme = s.themeIds[rng.int(s.themeIds.length)] as ThemeId;
    const stage: Stage = stageOf.get(theme) ?? 'cold';
    s.review = { theme, stage, day };
    emit(em, { type: 'themeReviewed', theme, stage, day });
  } else {
    s.review = null;
  }
}

/** 统计 */
function tallyStats(s: GameState, stock: StockStep, ch: ChainStep, hd: HoldingStepResult, ac: AccountStep, report: DayReport): void {
  const { moveOf } = stock;
  const { chains } = ch;
  const { triggers, holdings } = hd;
  const { accRet, heldThemeCount } = ac;
  const { fireworks, rain } = report;
  s.stats.days += 1;
  if (fireworks) s.stats.limitUpDays += 1;
  if (rain) s.stats.limitDownDays += 1;
  if (accRet > s.stats.maxDayRet) s.stats.maxDayRet = accRet;
  s.stats.maxThemes = Math.max(s.stats.maxThemes, heldThemeCount.size);
  for (const n of heldThemeCount.values()) s.stats.maxSameTheme = Math.max(s.stats.maxSameTheme, n);
  for (const hm of holdings) s.stats.maxBoards = Math.max(s.stats.maxBoards, moveOf.get(hm.stockId)?.boards ?? 0);
  const chainHits = chains.filter((c) => c.held.length > 0).length + (triggers.some((t) => t.itemId === 'longtou') ? 1 : 0);
  s.stats.chains += chainHits;
}

/** 收盘：记下日报、推进日期，然后查爆仓、月底结算或开下一天。 */
function closeDay(s: GameState, em: Emitter, report: DayReport): void {
  s.lastDay = report;
  s.dayIndex += 1;
  s.dayInMonth += 1;
  emit(em, { type: 'dayClosed', report });

  if (marginCalled(s, em)) return;
  if (s.dayInMonth >= daysInMonth(s.month)) endMonth(s, em);
  else if (isFlash(s) && BALANCE.flash.eventAfter.includes(s.dayIndex) && flashEvent(s, em)) return;
  else startDay(s, em);
}

/**
 * 把账户当天的变化分到每格持仓（holdings[].amount，按当天收益 × 权重）和账户层效果（借钱炒股、分散投资等）。
 * 各项取到分，零头并进金额绝对值最大的那一格（没有持仓时并进最后一项账户效果），保证总和等于 after − before。
 */
function splitMoney(
  before: number,
  after: number,
  holdings: HoldingMove[],
  weight: number,
  levRet: number,
  accItems: readonly { itemId: string; value: number }[],
): AccountEffect[] {
  for (const hm of holdings) hm.amount = round2((before * hm.ret * weight * (hm.units ?? 1)) / 100);
  const effects: AccountEffect[] = [];
  if (levRet !== 0) effects.push(leverageEffect(round2((before * levRet) / 100)));
  for (const it of accItems) effects.push(itemEffect(it.itemId, round2((before * it.value) / 100)));
  let sum = 0;
  for (const hm of holdings) sum += hm.amount;
  for (const e of effects) sum += e.amount;
  const rest = round2(after - before - sum);
  if (rest !== 0) {
    const big = holdings.reduce<HoldingMove | null>((a, hm) => (a && Math.abs(a.amount) >= Math.abs(hm.amount) ? a : hm), null);
    if (big) big.amount = round2(big.amount + rest);
    else if (effects.length > 0) {
      const last = effects[effects.length - 1] as AccountEffect;
      last.amount = round2(last.amount + rest);
    }
  }
  for (const e of effects) e.label = effectLabel(e);
  return effects;
}
