/** 持仓与账户的小操作：新建、平仓、加群友、得道具、记账。 */
import { friendById, itemById, stockById } from '../content/index.ts';
import { feelOf, round2, rulesOf } from '../market.ts';
import { rngFor } from '../rng.ts';
import type { AutoSellReason, Feel, GameState, Holding, ThemeId } from '../types.ts';
import { unitsOf } from './ext.ts';
import { type Emitter, emit } from './shared.ts';

// ================================================================ 持仓

export function feelNow(s: Readonly<GameState>, theme: ThemeId): Feel {
  return feelOf(s.themes[theme]?.history ?? []);
}

export function newHolding(
  s: GameState,
  stockId: string,
  boughtDay: number,
  source: Holding['source'],
  extra: { recBy?: string | null; firstBuy?: boolean; contra?: boolean } = {},
): Holding {
  const theme = stockById(stockId).theme;
  const buyFeel = feelNow(s, theme);
  if (!s.stats.acquired.includes(stockId)) s.stats.acquired.push(stockId);
  return {
    stockId,
    boughtDay,
    value: 1,
    todayRet: null,
    lowBuy: buyFeel === 'cold' || buyFeel === 'cooling',
    buyFeel,
    buyStage: s.themes[theme]?.stage ?? 'cold',
    source,
    recBy: extra.recBy ?? null,
    firstBuy: extra.firstBuy ?? false,
    contra: extra.contra ?? false,
    sawEbb: false,
  };
}

/** 清掉一格持仓并记一笔交易。 */
export function closeHolding(s: GameState, slot: number, reason: 'sell' | 'replace' | AutoSellReason | 'end'): Holding | null {
  const h = s.slots[slot];
  if (!h) return null;
  s.stats.trades.push({
    stockId: h.stockId,
    buyDay: h.boughtDay,
    sellDay: s.dayIndex,
    stage: h.buyStage,
    feel: h.buyFeel,
    ret: round2((h.value - 1) * 100),
    reason,
    recBy: h.recBy,
    contra: h.contra,
    guard: h.buyStage === 'climax' && h.sawEbb,
    ...(s.ext ? { short: !!h.short, units: unitsOf(h) } : {}),
  });
  s.slots[slot] = null;
  return h;
}

export function markOp(s: GameState): void {
  if (s.today.ops === 0) s.stats.activeDays += 1;
  s.today.ops += 1;
}

/** 道具变化后补齐持仓格（多开一格）。格子只增不减。 */
export function syncSlots(s: GameState): void {
  const n = rulesOf(s).slots;
  while (s.slots.length < n) s.slots.push(null);
}

export function addFriend(s: GameState, id: string, em: Emitter): void {
  if (s.friends.some((f) => f.id === id)) return;
  const def = friendById(id);
  let topics: ThemeId[] = [];
  if (def.topics === 'random2') {
    const rng = rngFor(s.seed, 'friendTopics', id);
    const pool = [...s.themeIds];
    for (let k = 0; k < 2 && pool.length > 0; k++) topics.push(pool.splice(rng.int(pool.length), 1)[0] as ThemeId);
  } else if (Array.isArray(def.topics)) {
    topics = [...(def.topics as readonly ThemeId[])];
  }
  s.friends.push({ id, hits: 0, total: 0, topics });
  seeFriend(s, id);
  emit(em, { type: 'friendJoined', friendId: id, topics: [...topics] });
}

export function seeFriend(s: GameState, id: string): void {
  if (!s.stats.seenFriends.includes(id)) s.stats.seenFriends.push(id);
}

export function seeItem(s: GameState, id: string): void {
  if (!s.stats.seenItems.includes(id)) s.stats.seenItems.push(id);
}

/** 获得道具。taken：算不算"拿过道具"（人设自带、调试开局设置的不算）；untilMonth：临时道具到那个月月底失效。 */
export function gainItem(s: GameState, id: string, em: Emitter, taken = true, untilMonth?: number): void {
  if (s.items.includes(id)) return;
  s.items.push(id);
  seeItem(s, id);
  if (taken && !s.stats.itemsTaken.includes(id)) s.stats.itemsTaken.push(id);
  if (untilMonth !== undefined) s.expiring.push({ id, month: untilMonth });
  itemById(id).onGain?.({ state: s, addFriend: (f) => addFriend(s, f, em) });
  syncSlots(s);
}

/**
 * 0.5.4：结算用的两项累计（炒股净赚、还掉的账单）。只在开局就有这两项的局里累计：
 * 0.5.3 打到一半的存档读进来时没有这两项，从半路开始记会得到半截数，宁可让结算走旧说法。
 */
export function addStat(s: GameState, key: 'tradeMoney' | 'billMoney', delta: number): void {
  const v = s.stats[key];
  if (v !== undefined) s.stats[key] = round2(v + delta);
}

export function setAccount(s: GameState, v: number): void {
  s.account = Math.max(0, round2(v));
  if (s.account > s.stats.peakAccount) s.stats.peakAccount = s.account;
}
