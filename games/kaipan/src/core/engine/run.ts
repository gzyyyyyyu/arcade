/** 入口：开局设置检查、createRun、dispatch、replay。 */
import { BALANCE } from '../balance.ts';
import { FRIENDS, MAX_DIFFICULTY, THEME_IDS, clampDifficulty, isFriendId, isItemId, isPersonaId, isStockId, isThemeId, personaAccount, personaById, stocksOf } from '../content/index.ts';
import { isLiveTier } from '../liveTiers.ts';
import { MOODS, baseMarketRules, newStock, rulesFor, warmUpTheme } from '../market.ts';
import { rngFor } from '../rng.ts';
import { fitRoles, realMood, trackMood, warmUpReal } from '../real.ts';
import { newTempo } from '../tempo.ts';
import { isWeekId } from '../weekly.ts';
import { realFromSegment, type Segment } from '../segment.ts';
import type { Action, GameEvent, GameState, PersonaId, RunSetup, ThemeId } from '../types.ts';
import { addTo, borrow, buy, repay, sell, subscribe, trim } from './actions.ts';
import { firstEmpty, isFlash, totalDays } from './calendar.ts';
import { startDay, startMonth } from './day.ts';
import { choose } from './event.ts';
import { canShortNow, newExt } from './ext.ts';
import { deleverage } from './gear.ts';
import { addFriend, gainItem, newHolding, syncSlots } from './holdings.ts';
import { open } from './open.ts';
import { openReward, pickReward, skipReward } from './reward.ts';
import { type DispatchOptions, type DispatchResult, type Emitter, MONTHS } from './shared.ts';
import { validate } from './validate.ts';

// ================================================================ 入口

/** 一局开始时的统计（读档补缺省值也用它）。 */
export function emptyStats(account: number): GameState['stats'] {
  return {
    days: 0,
    buys: 0,
    sells: 0,
    activeDays: 0,
    limitUpDays: 0,
    maxBoards: 0,
    chains: 0,
    peakAccount: account,
    billsPaid: 0,
    trades: [],
    picked: [],
    events: [],
    limitDownDays: 0,
    maxDayRet: 0,
    surprisesPaid: [],
    creditUsed: 0,
    maxThemes: 0,
    maxSameTheme: 0,
    monthRets: [],
    monthOpen: account,
    crashRet: null,
    acquired: [],
    itemsTaken: [],
    seenItems: [],
    seenFriends: [],
  };
}

/** 正常开局（只用了 persona / difficulty / daily / short）：计入档案、成就。带调试字段的开局不计。 */
export function isRankedSetup(setup: RunSetup | null): boolean {
  if (!setup) return true;
  return Object.keys(setup).every((k) => k === 'persona' || k === 'difficulty' || k === 'daily' || k === 'short' || k === 'flash' || k === 'weekly');
}

function checkSetup(setup: RunSetup | null): void {
  if (!setup) return;
  if (setup.persona !== undefined && !isPersonaId(setup.persona)) throw new Error(`未知人设：${String(setup.persona)}`);
  if (setup.difficulty !== undefined && (!Number.isFinite(setup.difficulty) || setup.difficulty > MAX_DIFFICULTY)) {
    throw new Error(`难度要在 1..${MAX_DIFFICULTY}`);
  }
  if (setup.daily !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(setup.daily)) throw new Error('每日挑战的日期要是 YYYY-MM-DD');
  for (const id of setup.items ?? []) if (!isItemId(id)) throw new Error(`未知道具：${id}`);
  for (const id of setup.friends ?? []) if (!isFriendId(id)) throw new Error(`未知群友：${id}`);
  for (const id of setup.holdings ?? []) if (!isStockId(id)) throw new Error(`未知股票：${id}`);
  if (setup.themes) {
    if (setup.themes.length !== BALANCE.activeThemes || new Set(setup.themes).size !== setup.themes.length) {
      throw new Error(`登场风口要 ${BALANCE.activeThemes} 个不重复的`);
    }
    for (const id of setup.themes) if (!isThemeId(id)) throw new Error(`未知风口：${id}`);
  }
  if (setup.account !== undefined && !(setup.account > 0)) throw new Error('开局账户要大于 0');
  if (setup.live !== undefined) {
    const { months, billMult, lev, tier } = setup.live;
    if (!Number.isInteger(months) || months < 1 || months > MONTHS) throw new Error(`实盘的月数要在 1..${MONTHS}`);
    if (!(billMult > 0 && billMult <= 1)) throw new Error('实盘的账单倍数要在 (0, 1]');
    if (lev !== undefined && !(lev >= 1 && lev <= 10)) throw new Error('实盘的涨跌倍数要在 1..10');
    if (tier !== undefined && !isLiveTier(tier)) throw new Error(`未知档位：${String(tier)}`);
    const g = setup.live.gear;
    if (g !== undefined && !(g.x >= 1 && g.x <= 5 && g.cap >= 1 && g.cap <= 10 && g.interest >= 0 && g.interest < 1 && g.call >= 0 && g.call < 1)) throw new Error('实盘的杠杆设置不对');
    if (setup.daily !== undefined) throw new Error('每日挑战不能是实盘');
  }
  if (setup.short !== undefined) {
    const { months, billMult, goal } = setup.short;
    if (!Number.isInteger(months) || months < 1 || months > MONTHS) throw new Error(`短局的月数要在 1..${MONTHS}`);
    if (!(billMult > 0 && billMult <= 2)) throw new Error('短局的账单倍数要在 (0, 2]');
    if (!(goal >= 0 && goal <= 3)) throw new Error('短局的首付比例要在 0..3');
    if (setup.daily !== undefined || setup.live !== undefined) throw new Error('每日挑战、实盘不能是短局');
  }
  if (setup.flash !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(setup.flash)) throw new Error('闪电盘的日期要是 YYYY-MM-DD');
    if (setup.daily !== undefined || setup.live !== undefined || setup.short !== undefined) throw new Error('闪电盘不能同时是每日挑战、实盘、短局');
  }
  if (setup.weekly !== undefined) {
    if (!isWeekId(setup.weekly)) throw new Error('本周市场的周号要是 YYYY-Www（如 2026-W44）');
    if (setup.daily !== undefined || setup.live !== undefined || setup.short !== undefined || setup.flash !== undefined) throw new Error('本周市场不能同时是每日挑战、实盘、短局、闪电盘');
  }
}

/** 本局登场的题材：随机 6 个（must 里的必定登场，人设用），按看板顺序（设计稿第 2.1 节的顺序）排列。 */
export function pickThemes(seed: string, must: readonly ThemeId[] = []): ThemeId[] {
  const rng = rngFor(seed, 'themes');
  const pool = THEME_IDS.filter((id) => !must.includes(id));
  const out: ThemeId[] = must.filter((id) => THEME_IDS.includes(id)).slice(0, BALANCE.activeThemes);
  while (out.length < BALANCE.activeThemes && pool.length > 0) out.push(pool.splice(rng.int(pool.length), 1)[0] as ThemeId);
  return THEME_IDS.filter((id) => out.includes(id));
}

/**
 * 开一局。正常开局 setup 只带 persona（人设，缺省 newbie）、difficulty（1..8，缺省 1）、daily（每日挑战日期）；
 * 其余字段仅供调试、测试、模拟跳到指定局面（这样的局不计入档案）。
 */
/** 开局选项：segment 是抽中的真实行情段（缺省或 null = 0.3 的合成行情）。 */
export interface CreateOptions {
  segment?: Readonly<Segment> | null;
  /** 0.4 C：打开仓位、押跌、抵押（正式游戏都开；缺省关 = 0.3 的玩法，replay-golden 用） */
  ext?: boolean;
  /**
   * 0.5：月度主题、中场、高光、连击。缺省：有行情段时打开、合成行情关闭（replay-golden 逐位不变）。
   * 回放要带同样的值：replay(seed, actions, setup, { segment, ext: !!state.ext, tempo: !!state.tempo })。
   */
  tempo?: boolean;
  /** 0.5：真实行情用 0.4 的映射（个股 = 大盘 + 风口 + 自身分别放大 + 连板惯性……）；只给对照和旧档测试用 */
  legacyReal?: boolean;
}

export function createRun(seed: string, setup: RunSetup | null = null, opts: CreateOptions = {}): { state: GameState; events: GameEvent[] } {
  checkSetup(setup);
  const persona: PersonaId = setup?.persona ?? 'newbie';
  const pdef = personaById(persona);
  const difficulty = clampDifficulty(setup?.difficulty);
  const themeIds = setup?.themes ? THEME_IDS.filter((id) => setup.themes?.includes(id)) : pickThemes(seed, pdef.themes);
  const themes: GameState['themes'] = {};
  const stocks: GameState['stocks'] = {};
  for (const id of themeIds) for (const d of stocksOf(id)) stocks[d.id] = newStock(seed, d.id, d.role);
  const seg = opts.segment ?? null;
  if (seg && seg.days < totalDays()) throw new Error(`行情段 ${seg.id} 只有 ${seg.days} 天，一局要 ${totalDays()} 天`);
  const real = seg ? realFromSegment(seg, themeIds, Object.keys(stocks), BALANCE.real.smooth) : null;
  // 0.5：个股照搬真实走势；开局按这一段的真实表现校正性格（只决定显示和情报口吻）
  if (real && !opts.legacyReal) {
    real.track = true;
    fitRoles(real, themeIds, (t) => stocksOf(t));
  }
  for (const id of themeIds) themes[id] = real ? warmUpReal(real, id) : warmUpTheme(seed, id);
  const account = setup?.account ?? personaAccount(persona);
  const rules0 = rulesFor([], difficulty, persona);
  const s: GameState = {
    version: 4,
    seed,
    setup,
    persona,
    difficulty,
    phase: 'premarket',
    account,
    month: 0,
    dayInMonth: 0,
    dayIndex: 0,
    themeIds,
    themes,
    stocks,
    mood: real ? (real.track ? trackMood(real, real.warm - 1) : realMood(real, real.warm - 1, baseMarketRules())) : (MOODS[rngFor(seed, 'mood0').int(MOODS.length)] ?? 'flat'),
    slots: Array.from({ length: rules0.slots }, () => null),
    friends: [],
    items: [],
    bill: { month: 1, name: '', amount: 0, extras: [] },
    nextBillMult: 1,
    today: { day: 0, messages: [], recs: [], buysLeft: 0, ops: 0, buys: 0, plan: { mood: 'flat', marketRet: 0, dH: {} } },
    reward: null,
    event: null,
    lastDay: null,
    endReason: null,
    review: null,
    notice: null,
    pending: [],
    expiring: [],
    busyDay: null,
    // 炒股净赚、还掉的账单只在新开的局里从 0 记起（emptyStats 也给读档补缺省值用，不能放在那里）
    stats: { ...emptyStats(account), tradeMoney: 0, billMoney: 0 },
    actions: [],
    real,
    ...(opts.ext ? { ext: newExt() } : {}),
    ...((opts.tempo ?? !!real) ? { tempo: newTempo(seed, difficulty, real, !!opts.ext, !!real && setup?.daily === undefined && setup?.flash === undefined && setup?.weekly === undefined && setup?.live === undefined), watch: [] } : {}),
  };
  const em: Emitter = { events: [], enabled: true };
  for (const def of FRIENDS) if (def.founding) addFriend(s, def.id, em);
  for (const id of setup?.friends ?? []) addFriend(s, id, em);
  for (const id of pdef.items) gainItem(s, id, em, false);
  for (const id of setup?.items ?? []) gainItem(s, id, em, false);
  for (const id of setup?.holdings ?? []) {
    const slot = firstEmpty(s);
    if (slot < 0) throw new Error('开局持仓超过格数');
    if (!s.stocks[id]) throw new Error(`开局持仓的股票不在本局登场的风口里：${id}`);
    s.slots[slot] = newHolding(s, id, -1, 'setup');
  }
  // 本周市场「满仓周」：多给的持仓格开局就有
  if (s.setup?.weekly !== undefined) syncSlots(s);
  // 0.4 C：人设、难度一开局就能押跌时，空军老周直接在群里
  if (s.ext && canShortNow(s)) addFriend(s, 'kongjun', em);
  em.events = [];
  startMonth(s, 1, em);
  // 闪电盘：先三选一道具（领完才开第一天，见 afterReward）
  if (isFlash(s)) openReward(s, em);
  else startDay(s, em);
  return { state: s, events: em.events };
}

export function dispatch(prev: GameState, action: Action, opts: DispatchOptions = {}): DispatchResult {
  const error = validate(prev, action);
  if (error) return { state: prev, events: [], error };
  const s = opts.inPlace ? prev : structuredClone(prev);
  const em: Emitter = { events: [], enabled: opts.events ?? true };
  s.actions.push({ ...action });
  switch (action.type) {
    case 'buy':
      buy(s, action, em);
      break;
    case 'sell':
      sell(s, action.slot, em);
      break;
    case 'subscribe':
      subscribe(s, action.size, em);
      break;
    case 'add':
      addTo(s, action.slot, em);
      break;
    case 'trim':
      trim(s, action.slot, em);
      break;
    case 'borrow':
      borrow(s, action.id, em);
      break;
    case 'repay':
      repay(s, action.id, em);
      break;
    case 'open':
      open(s, em);
      break;
    case 'deleverage':
      deleverage(s, em);
      break;
    case 'pickReward':
      pickReward(s, action, em);
      break;
    case 'skipReward':
      skipReward(s, em);
      break;
    case 'choose':
      choose(s, action.option, em);
      break;
  }
  return { state: s, events: em.events, error: null };
}

/** 由种子、开局设置和操作记录重建状态；任何一步非法都会抛错。 */
export function replay(seed: string, actions: readonly Action[], setup: RunSetup | null = null, opts: CreateOptions = {}): GameState {
  let state = createRun(seed, setup, opts).state;
  actions.forEach((a, i) => {
    const r = dispatch(state, a, { events: false, inPlace: true });
    if (r.error) throw new Error(`回放第 ${i} 步失败：${r.error}`);
    state = r.state;
  });
  return state;
}
