/** 月度奖励：三选一的候选、抽取、领取、跳过。 */
import { BALANCE } from '../balance.ts';
import { ITEMS, personaById, stockById, stocksOf } from '../content/index.ts';
import { rulesOf, stageDays, uniformInt } from '../market.ts';
import { rngFor } from '../rng.ts';
import { forwardRet } from '../real.ts';

import type { Action, GameState, Holding, Rarity, RewardCard } from '../types.ts';
import { daysInMonth, firstEmpty, isFlash } from './calendar.ts';
import { startDay } from './day.ts';
import { maybeEvent } from './event.ts';
import { canShortNow, freeUnits } from './ext.ts';
import { addFriend, closeHolding, gainItem, newHolding, seeFriend, seeItem } from './holdings.ts';
import { type Emitter, MONTHS, emit } from './shared.ts';

// ================================================================ 月度奖励

const STOCK_CARD_STAGES = ['cold', 'sprout'] as const;
/** 股灾时被强制退潮的阶段。 */
export const CRASH_STAGES = ['sprout', 'ferment', 'rally', 'climax'] as const;

/** 每日挑战、闪电盘：同一天所有人同一局，内容池不能随版本变（realOnly 的道具、群友不进池）。 */
function fixedDay(s: Readonly<GameState>): boolean {
  return s.setup?.daily !== undefined || isFlash(s);
}

/** 闪电盘开局三选一里不出的道具：和月供有关的（信用卡、众筹炒股），两个月的局里没有用。 */
const FLASH_NO_ITEMS: readonly string[] = ['credit', 'crowd_fund'];

/** 奖励卡候选：未持有的道具、还没入群的群友、处在冷门或萌芽的题材的龙头 / 妖股。 */
export function rewardCandidates(s: Readonly<GameState>): Record<RewardCard['kind'], RewardCard[]> {
  const inGroup = new Set(s.friends.map((f) => f.id));
  const banned = new Set(personaById(s.persona).bannedItems ?? []);
  const items: RewardCard[] = ITEMS.filter(
    (d) =>
      !s.items.includes(d.id) &&
      !banned.has(d.id) &&
      (!d.realOnly || (!!s.real && !fixedDay(s))) &&
      !(d.excludesFriend && inGroup.has(d.excludesFriend)) &&
      (!d.ext || (!!s.ext && (d.id !== 'short_permit' || !canShortNow(s)))),
  ).map(
    (d) => ({ kind: 'item', id: d.id, rarity: d.rarity }),
  );
  const friends: RewardCard[] = [];
  if (!inGroup.has('neimu') && !s.items.includes('paid_group')) friends.push({ kind: 'friend', id: 'neimu', rarity: 'rare' });
  if (!inGroup.has('zhuchang') && s.themeIds.includes('pig')) friends.push({ kind: 'friend', id: 'zhuchang', rarity: 'uncommon' });
  // realOnly 的群友只在真实行情的非每日局进池：多一张卡会改变 rng.weighted 的抽取，合成行情（replay-golden）和每日挑战不能变
  if (!inGroup.has('quant') && s.real && !fixedDay(s)) friends.push({ kind: 'friend', id: 'quant', rarity: 'uncommon' });
  const held = new Set(s.slots.map((h) => h?.stockId));
  const stocks: RewardCard[] = [];
  for (const id of s.themeIds) {
    const t = s.themes[id];
    // 真实行情：股票卡是"内部消息"——以 BALANCE.intel.headline 的概率只给接下来一个月真实走势偏强的（不看风口阶段）
    const track = s.real ?? null;
    if (!t || (!track && !(STOCK_CARD_STAGES as readonly string[]).includes(t.stage))) continue;
    for (const d of stocksOf(id)) {
      if ((d.role !== 'leader' && d.role !== 'meme') || held.has(d.id) || !s.stocks[d.id] || s.stocks[d.id]?.delisted) continue;
      if (track) {
        const good = forwardRet(track, 'stock', d.id, s.dayIndex, daysInMonth(Math.min(MONTHS, s.month + 1))) > 0;
        const honest = rngFor(s.seed, 'stockCard', s.month, d.id).next() < BALANCE.intel.headline;
        if (good !== honest) continue;
      }
      stocks.push({ kind: 'stock', id: d.id, rarity: d.role === 'leader' ? 'rare' : 'uncommon' });
    }
  }
  return { item: items, friend: friends, stock: stocks };
}

/** 闪电盘开局的三选一：只出道具，用独立的 rng 用途名，不碰别的模式的抽取。 */
function rollFlashRewards(s: GameState): RewardCard[] {
  const rng = rngFor(s.seed, s.setup?.weekly !== undefined ? 'weeklyReward' : 'flashReward');
  const rw = BALANCE.reward.rarityWeights;
  const list = rewardCandidates(s).item.filter((c) => !FLASH_NO_ITEMS.includes(c.id));
  const cards: RewardCard[] = [];
  for (let k = 0; k < rulesOf(s).rewardCards && list.length > 0; k++) {
    const card = rng.weighted(list, list.map((c) => rw[c.rarity as Rarity]));
    cards.push(card);
    list.splice(list.indexOf(card), 1);
  }
  return cards;
}

function rollRewards(s: GameState): RewardCard[] {
  if (isFlash(s)) return rollFlashRewards(s);
  const rng = rngFor(s.seed, 'reward', s.month);
  const cand = rewardCandidates(s);
  const kinds = ['item', 'friend', 'stock'] as const;
  const rw = BALANCE.reward.rarityWeights;
  const cards: RewardCard[] = [];
  const n = rulesOf(s).rewardCards;
  for (let k = 0; k < n; k++) {
    const avail = kinds.filter((x) => cand[x].length > 0);
    if (avail.length === 0) break;
    const kind = rng.weighted(avail, avail.map((x) => BALANCE.reward.kindWeights[x]));
    const list = cand[kind];
    const card = rng.weighted(list, list.map((c) => rw[c.rarity as Rarity]));
    cards.push(card);
    if (kind === 'stock') {
      const theme = stockById(card.id).theme;
      cand.stock = list.filter((c) => stockById(c.id).theme !== theme);
    } else {
      cand[kind] = list.filter((c) => c !== card);
    }
  }
  return cards;
}

export function openReward(s: GameState, em: Emitter): void {
  s.phase = 'reward';
  s.reward = { month: s.month, cards: rollRewards(s) };
  for (const c of s.reward.cards) {
    if (c.kind === 'item') seeItem(s, c.id);
    else if (c.kind === 'friend') seeFriend(s, c.id);
  }
  emit(em, { type: 'rewardOffered', month: s.month, cards: s.reward.cards.map((c) => ({ ...c })) });
}

/** 把股票直接放进第 slot 格（月度奖励、事件用）：原来的持仓卖出；算作上一个交易日买入，下一个交易日就能卖。 */
export function placeStock(s: GameState, stockId: string, slot: number, source: Holding['source']): string | null {
  const old = closeHolding(s, slot, 'replace');
  const h = newHolding(s, stockId, s.dayIndex - 1, source);
  // 送的股票占 1 份；现金不够时有多少占多少（至少半份）
  if (s.ext) h.units = Math.max(BALANCE.ext.minUnit, Math.min(BALANCE.ext.taste, freeUnits(s)));
  s.slots[slot] = h;
  return old?.stockId ?? null;
}

export function pickReward(s: GameState, a: Extract<Action, { type: 'pickReward' }>, em: Emitter): void {
  const card = s.reward?.cards[a.index];
  if (!card) return;
  let slot: number | null = null;
  let replaced: string | null = null;
  if (card.kind === 'item') {
    gainItem(s, card.id, em);
  } else if (card.kind === 'friend') {
    addFriend(s, card.id, em);
  } else {
    // 稀有股票：所在题材当月一定处于萌芽期（冷门的被拉起萌芽），且这一轮萌芽不会夭折
    const t = s.themes[stockById(card.id).theme];
    if (t && s.real) {
      // 真实行情：冷门的被拉起冒头，之后几天有人持续带热度（必不夭折）
      if (t.stage !== 'sprout') {
        t.stage = 'sprout';
        t.age = 1;
      }
      t.sure = true;
      const R = BALANCE.real.sure;
      if (!t.boost || t.boost.dH < R.dH) t.boost = { dH: R.dH, days: R.days };
    } else if (t) {
      if (t.stage !== 'sprout') {
        t.stage = 'sprout';
        const [lo, hi] = stageDays('sprout', t.id);
        t.left = uniformInt(rngFor(s.seed, 'rewardStage', s.month), lo, hi);
      }
      t.sure = true;
    }
    slot = a.slot ?? firstEmpty(s);
    replaced = placeStock(s, card.id, slot, 'reward');
  }
  s.stats.picked.push(card.id);
  emit(em, { type: 'rewardPicked', card: { ...card }, slot, replaced });
  s.reward = null;
  afterReward(s, em);
}

export function skipReward(s: GameState, em: Emitter): void {
  s.reward = null;
  emit(em, { type: 'rewardSkipped' });
  afterReward(s, em);
}

/** 领完（或跳过）奖励：闪电盘的奖励只在开局，领完开打第一天；别的模式接着按概率抽月底事件。 */
function afterReward(s: GameState, em: Emitter): void {
  if (isFlash(s)) startDay(s, em);
  else maybeEvent(s, em);
}
