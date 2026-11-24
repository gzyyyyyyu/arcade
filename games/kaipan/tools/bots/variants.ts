/** 套在别的机器人外面的变体：extBot（仓位、押跌、抵押）、trackBot（真实行情 0.5）、dual（按行情模式二选一）。 */
import {
  forwardRet,
  messageCred,
  feelOf,
  flipDir,
  fx,
  isBusy,
  recCredibility,
  rulesOf,
  stockById,
  canShortNow,
  COLLATERAL_IDS,
  collateralTerms,
  freeUnits,
  validate,
  type GameState,
  type ThemeId,
} from '../../src/core/index.ts';
import { type Bot, emptySlot, sellableSlots, themeOfStock, buyable } from './common.ts';

// ================================================================ 仓位玩法：重仓派、押跌派、抵押赌徒


/**
 * 在一个机器人外面套一层：仓位、押跌、借钱。inner 看到的局面里，押跌的格子当成空的（它只管买涨）。
 * - heavy：买涨一律重仓（剩下的钱全压上）；
 * - short：拿押跌许可证、收体验卡；风口过热 / 降温、或者唱空群友建议押跌的推荐押它跌（1 份）；
 *   押跌的风口转暖、被轧、亏 12% 就平掉；
 * - gamble：第 2 个月起能押的都押（借最多的先），银行经理上门就借，从不主动赎回。
 */
export function extBot(name: string, inner: Bot, o: { heavy?: boolean; short?: boolean; gamble?: boolean }): Bot {
  return {
    name,
    act(s, rng) {
      if (s.phase === 'reward' && o.short && !canShortNow(s)) {
        const k = s.reward?.cards.findIndex((c) => c.kind === 'item' && c.id === 'short_permit') ?? -1;
        if (k >= 0) return { type: 'pickReward', index: k };
      }
      if (s.phase === 'event' && s.event) {
        const id = s.event.id;
        if (id === 'bear_live') return { type: 'choose', option: o.short ? 0 : 1 };
        if (id === 'bank_manager') return { type: 'choose', option: o.gamble ? 0 : 1 };
        if (id === 'mother_in_law') return { type: 'choose', option: 0 };
        if (id === 'parents_call') return { type: 'choose', option: 1 };
      }
      if (s.phase !== 'premarket') return inner.act(s, rng);
      if (o.gamble && !isBusy(s)) {
        const ids = [...COLLATERAL_IDS].sort((a, b) => (collateralTerms(b, s.difficulty)?.amount ?? 0) - (collateralTerms(a, s.difficulty)?.amount ?? 0));
        for (const id of ids) if (validate(s, { type: 'borrow', id }) === null) return { type: 'borrow', id };
      }
      if (o.short && canShortNow(s) && !isBusy(s) && s.today.ops < 2) {
        // 平掉押错的
        for (const i of sellableSlots(s)) {
          const h = s.slots[i];
          if (!h?.short) continue;
          const f = feelOf(s.themes[themeOfStock(h.stockId)]?.history ?? []);
          if (f === 'warming' || f === 'cold' || (h.squeezed ?? 0) > 0 || h.value < 0.88) return { type: 'sell', slot: i };
        }
        // 押跌：过热、降温的风口，或者唱空群友点名的
        const e = emptySlot(s);
        if (e >= 0 && s.today.buysLeft > 0 && s.slots.filter((h) => h?.short).length < 2) {
          const k = s.today.recs.findIndex((r, i) => {
            if (!buyable(s, i) || stockById(r.stockId).role === 'meme') return false;
            const f = feelOf(s.themes[themeOfStock(r.stockId)]?.history ?? []);
            return f === 'cooling' || f === 'overheated' || (!!r.short && f !== 'warming' && f !== 'cold');
          });
          if (k >= 0 && validate(s, { type: 'buy', rec: k, slot: e, short: true }) === null) return { type: 'buy', rec: k, slot: e, short: true };
        }
      }
      // 买涨交给 inner（押跌的格子对它来说是空的）
      const view: GameState = o.short ? { ...s, slots: s.slots.map((h) => (h?.short ? null : h)) } : s;
      let a = inner.act(view, rng);
      if (a.type === 'buy') {
        if (a.slot !== undefined && s.slots[a.slot]?.short) {
          const e = emptySlot(s);
          if (e < 0) return { type: 'open' };
          a = { ...a, slot: e };
        }
        if (o.heavy) a = { ...a, size: 'heavy' };
        if (validate(s, a) !== null) a = { type: 'open' };
      }
      if (a.type === 'sell' && (!s.slots[a.slot] || s.slots[a.slot]?.short)) a = { type: 'open' };
      // 重仓派：赚钱的那只有现金就加
      if (a.type === 'open' && o.heavy && !isBusy(s) && freeUnits(s) >= 1) {
        const k = s.slots.findIndex((h, i) => !!h && !h.short && (h.todayRet ?? 0) > 0 && h.value > 1.05 && validate(s, { type: 'add', slot: i }) === null);
        if (k >= 0) return { type: 'add', slot: k };
      }
      return a;
    },
  };
}


// ================================================================ 0.5：个股照搬真实走势时的机器人

/**
 * 真实行情 0.5 下，smart / oracle 的选股改用情报的期望值（0.4 的贝叶斯阶段模型针对的是"风口热度决定个股涨跌"，
 * 现在个股照搬真实走势，热度只是信息）。
 * - smart：知道每个群友真实的准确率（messageCred / recCredibility，相当于玩了很多局的老玩家），按"说中概率超过瞎猜的部分"给期望；
 * - truster（信靠谱群友）：只看战绩（说对次数 / 发言次数，带先验）好的群友，其余的话当没听见；
 * - oracle：直接看行情段里今天和明天的真实涨跌（上限）。
 * 领奖励和事件交给 normal。
 */
const TRACK_MSG = 4;
const TRACK_REC = 6;
const TRACK_BUY = 0.6;
const TRACK_SELL = -0.6;
const TRACK_SWAP = 2;

interface TrackMemo {
  until: number;
  e: number;
}

export function trackBot(name: string, mode: 'smart' | 'oracle' | 'truster', inner: Bot): Bot {
  const stockMemo = new Map<string, TrackMemo>();
  const themeMemo: { theme: ThemeId; until: number; e: number }[] = [];
  let seenDay = -1;
  let opsToday = 0;
  return {
    name,
    act(s, rng) {
      if (s.phase !== 'premarket') return inner.act(s, rng);
      const real = s.real as NonNullable<GameState['real']>;
      const day = s.today.day;
      const rules = rulesOf(s);
      const observed = (id: string): number => {
        const f = s.friends.find((x) => x.id === id);
        return ((f?.hits ?? 0) + 0.5 * 4) / ((f?.total ?? 0) + 4);
      };
      const msgCred = (m: GameState['today']['messages'][number]): number => {
        if (m.reverse) return fx('fan_qunzhu', 'acc');
        if (mode === 'truster') {
          const c = observed(m.friendId);
          return c >= 0.55 ? c : 1 / 3;
        }
        return messageCred(s, m.friendId, m.theme, rules);
      };
      const recCred = (r: GameState['today']['recs'][number]): number => {
        if (mode === 'truster') {
          const c = observed(r.friendId);
          return c >= 0.55 ? c : 1 / 3;
        }
        return recCredibility(s, r.friendId, stockById(r.stockId).theme, rules);
      };
      if (seenDay !== day) {
        seenDay = day;
        opsToday = 0;
        for (const m of s.today.messages) {
          const claim = m.reverse ? flipDir(m.claim) : m.claim;
          const sign = claim === 'up' ? 1 : claim === 'down' ? -1 : 0;
          const days = m.days ?? 1;
          if (sign !== 0) themeMemo.push({ theme: m.theme, until: day + days - 1, e: (sign * (msgCred(m) - 1 / 3) * TRACK_MSG) / days });
        }
        for (const r of s.today.recs) {
          const days = r.days ?? 1;
          const sign = r.short ? -1 : 1;
          stockMemo.set(r.stockId, { until: day + days - 1, e: (sign * (recCred(r) - 1 / 3) * TRACK_REC) / days });
        }
      }
      const expect = (id: string): number => {
        if (mode === 'oracle') return forwardRet(real, 'stock', id, day, 1) + 0.5 * forwardRet(real, 'stock', id, day + 1, 1);
        const theme = stockById(id).theme;
        let e = 0;
        for (const m of themeMemo) if (m.theme === theme && m.until >= day) e += m.e;
        const st = stockMemo.get(id);
        if (st && st.until >= day) e += st.e;
        return e;
      };
      if (opsToday >= 4) return { type: 'open' };
      // 卖：期望明显为负
      for (const i of sellableSlots(s)) {
        const h = s.slots[i];
        if (!h) continue;
        const e = h.short ? -expect(h.stockId) : expect(h.stockId);
        if (e < TRACK_SELL) {
          opsToday += 1;
          return { type: 'sell', slot: i };
        }
      }
      // 买：期望最高的推荐（只做多）；空格优先，否则换掉期望最低、能卖的
      if (s.today.buysLeft > 0) {
        let best = -1;
        let bestE = TRACK_BUY;
        s.today.recs.forEach((r, i) => {
          if (r.short || !buyable(s, i)) return;
          const only = rules.onlyRoles;
          if (only && !only.includes(stockById(r.stockId).role)) return;
          const e = expect(r.stockId);
          if (e > bestE) {
            bestE = e;
            best = i;
          }
        });
        if (best >= 0) {
          const e = emptySlot(s);
          if (e >= 0) {
            opsToday += 1;
            return { type: 'buy', rec: best, slot: e };
          }
          let victim = -1;
          let vE = Infinity;
          for (const i of sellableSlots(s)) {
            const h = s.slots[i];
            if (!h) continue;
            const x = h.short ? -expect(h.stockId) : expect(h.stockId);
            if (x < vE) {
              vE = x;
              victim = i;
            }
          }
          if (victim >= 0 && bestE - vE > TRACK_SWAP) {
            opsToday += 1;
            return { type: 'buy', rec: best, slot: victim };
          }
        }
      }
      return { type: 'open' };
    },
  };
}

/** 真实行情用 trackBot，合成行情用原来的机器人。 */
export function dual(track: Bot, old: Bot): Bot {
  return {
    name: track.name,
    act(s, rng) {
      return s.real ? track.act(s, rng) : old.act(s, rng);
    },
  };
}
