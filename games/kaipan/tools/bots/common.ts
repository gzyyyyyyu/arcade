/** 机器人共用的小件：类型、盘中减仓、黑天鹅躲避、打新申购、冻结格处理，以及各策略都用的局面小工具。 */
import {
  canSell,
  isBusy,
  stockById,
  freeUnits,
  validate,
  gearLevered,
  SWAN_DEFS,
  ipoPending,
  ipoToday,
  swanNotice,
  type Action,
  type GameState,
  type Rng,
  type ThemeId,
} from '../../src/core/index.ts';

export interface Bot {
  name: string;
  act(s: GameState, rng: Rng): Action;
}

/** 机器人工厂：有记忆的机器人每局要新建一个。 */
export type BotFactory = () => Bot;

/**
 * 0.20.0 盘中减仓（docs/design-balance.md 4.4）：会玩的（normal、putong、smart）开盘前看到放大后的结回倍数离清零线不到 CUT.gap 份就减一档；
 * 小白（balance.md：不止损）从不减仓。CUT.gap 由 sim 的 --cut-gap 调。
 */
export const CUT = { gap: 0.3, bots: new Set(['normal', 'putong', 'smart']) };

export function shouldCut(bot: string, s: GameState): boolean {
  if (!CUT.bots.has(bot) || s.phase !== 'premarket' || s.gearCut) return false; // 只减一次：减完没有清零线了
  const g = s.setup?.live?.gear;
  const v = gearLevered(s);
  return !!g && v !== null && v <= g.call + CUT.gap;
}

/**
 * 黑天鹅预告（最后 3 个交易日）：会看预告的机器人在下跌类预告时减仓，只动受影响的多头持仓，之后不再买受影响的。
 * 普通（normal、putong）减一半（第一天预告时的受影响数量的一半，向上取整），聪明（smart）全躲；小白和其余不理会。
 * 躲的办法就是玩家也能用的现有手段：卖掉变现金。
 */
export const SWAN_BOTS: Record<string, number> = { normal: 0.5, putong: 0.5, smart: 1 };

/** 返回要先做的卖出（没有为 null）；keep 是这一局记下来的"最多还能拿几只受影响的"。 */
export function swanSell(bot: string, s: GameState, memo: { keep: number | null }): Action | null {
  const cut = SWAN_BOTS[bot];
  const n = cut === undefined || s.phase !== 'premarket' ? null : swanNotice(s);
  if (!n || cut === undefined || !SWAN_DEFS[n.kind].down) return null;
  const hit = s.slots
    .map((h, slot) => ({ h, slot }))
    .filter((x) => x.h && !x.h.short && (n.kind !== 'themeBust' || themeOfStock(x.h.stockId) === n.theme));
  memo.keep ??= hit.length - Math.ceil(hit.length * cut);
  if (hit.length <= memo.keep || isBusy(s)) return null;
  // 先卖拖后腿的（持有收益最低的）
  const worst = hit.sort((a, b) => (a.h?.value ?? 1) - (b.h?.value ?? 1))[0];
  const a: Action = { type: 'sell', slot: worst?.slot ?? 0 };
  return validate(s, a) === null ? a : null;
}

/** 预告期里不再买进会被砸的股票（改成直接开盘）。 */
export function swanBlocks(bot: string, s: GameState, a: Action): boolean {
  if (a.type !== 'buy' || a.short || SWAN_BOTS[bot] === undefined || s.phase !== 'premarket') return false;
  const n = swanNotice(s);
  if (!n || !SWAN_DEFS[n.kind].down) return false;
  const stock = s.today.recs[a.rec]?.stockId;
  return !!stock && (n.kind !== 'themeBust' || themeOfStock(stock) === n.theme);
}

/**
 * 打新（docs/design.md 第 18 节）：会申购的机器人在申购日盘前、手里有闲钱时先申购再做别的。
 * 普通（normal、putong）闲钱够 1 份就试一口；聪明（smart）闲钱够 2 份半仓、够 1 份试一口；小白和其余不申购。
 * 「只打新」（ipo-only）自己在 act 里处理：除了申购什么都不买，中签的新股上市第 2 天卖。
 */
export const IPO_BOTS: Record<string, 'taste' | 'smart'> = { normal: 'taste', putong: 'taste', smart: 'smart' };

export function ipoSubscribe(bot: string, s: GameState): Action | null {
  const policy = IPO_BOTS[bot];
  if (!policy || s.phase !== 'premarket' || !ipoToday(s)) return null;
  const free = freeUnits(s);
  const size = policy === 'smart' && free >= 2 ? 'half' : 'taste';
  const a: Action = { type: 'subscribe', size };
  // 普通：现金大把闲着（至少 3 份没动）才试一口，不为了申购把要买的位子占掉；聪明：有 1 份闲钱就试
  return free >= (policy === 'taste' ? 3 : 1) && validate(s, a) === null ? a : null;
}

/**
 * 申购冻结期间别的机器人的选股逻辑不认识冻结的格子：动作碰到冻结的格子（卖、减、加、换），
 * 或者买入时冻结的份数让现金不够了（空格还在，钱被冻住了），就改成开盘。
 */
export function touchesFrozen(s: GameState, a: Action): boolean {
  if (!ipoPending(s)) return false;
  const slot = a.type === 'sell' || a.type === 'add' || a.type === 'trim' || a.type === 'buy' ? a.slot : undefined;
  if (slot !== undefined && s.slots[slot]?.ipo?.stage === 'frozen') return true;
  return a.type === 'buy' && validate(s, a) !== null;
}

// ================================================================ 公共小工具

export function emptySlot(s: GameState): number {
  return s.slots.indexOf(null);
}

export function sellableSlots(s: GameState): number[] {
  const out: number[] = [];
  s.slots.forEach((h, i) => {
    if (h && canSell(s, i)) out.push(i);
  });
  return out;
}

export function themeOfStock(id: string): ThemeId {
  return stockById(id).theme;
}

export function lastDelta(s: GameState, theme: ThemeId): number {
  const h = s.themes[theme]?.history ?? [];
  return h.length >= 2 ? (h[h.length - 1] ?? 0) - (h[h.length - 2] ?? 0) : 0;
}

export function heldThemes(s: GameState): Map<ThemeId, number> {
  const m = new Map<ThemeId, number>();
  for (const h of s.slots) if (h) m.set(themeOfStock(h.stockId), (m.get(themeOfStock(h.stockId)) ?? 0) + 1);
  return m;
}

export function buyable(s: GameState, rec: number): boolean {
  const r = s.today.recs[rec];
  return !!r && !r.taken && s.today.buysLeft > 0 && !s.slots.some((h) => h?.stockId === r.stockId);
}

/** 奖励里的股票卡放到哪：空格，否则换掉持有收益最低的可卖持仓；都不行返回 -1。 */
function stockCardSlot(s: GameState): number {
  const e = emptySlot(s);
  if (e >= 0) return e;
  let worst = -1;
  let v = Infinity;
  s.slots.forEach((h, i) => {
    if (h && h.value < v) {
      v = h.value;
      worst = i;
    }
  });
  return worst;
}

/** 简单的领奖励：按偏好表打分。 */
export function pickRewardBy(s: GameState, score: (kind: string, id: string) => number): Action {
  const cards = s.reward?.cards ?? [];
  let best = -1;
  let bestScore = -Infinity;
  cards.forEach((c, i) => {
    const v = score(c.kind, c.id);
    if (v > bestScore) {
      bestScore = v;
      best = i;
    }
  });
  if (best < 0 || bestScore <= -100) return { type: 'skipReward' };
  const card = cards[best];
  if (card?.kind === 'stock') {
    const slot = stockCardSlot(s);
    if (slot < 0) return { type: 'skipReward' };
    return { type: 'pickReward', index: best, slot };
  }
  return { type: 'pickReward', index: best };
}

