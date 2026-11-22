/** 简单机器人：random / follower / chaser / xiaobai / qunzhu / 只打新。 */
import {
  feelOf,
  isBusy,
  validate,
  ipoToday,
  lessonAdvice,
  type Action,
  type ThemeId,
} from '../../src/core/index.ts';
import { type Bot, emptySlot, sellableSlots, themeOfStock, lastDelta, buyable, pickRewardBy } from './common.ts';
import { simpleItemPref, casualEvent } from './normal.ts';

/** 「只打新」机器人：申购（试一口 / 半仓 / 重仓由 size 定）、中签后上市第 2 天卖，其余时间只开盘，奖励和事件照最保守的选。 */
export function ipoOnlyBot(size: 'taste' | 'half' | 'heavy'): Bot {
  return {
    name: size === 'taste' ? 'ipo-only' : `ipo-only-${size}`,
    act(s) {
      if (s.phase === 'reward') return { type: 'skipReward' };
      if (s.phase === 'event') return { type: 'choose', option: 1 };
      if (isBusy(s)) return { type: 'open' };
      const sub: Action = { type: 'subscribe', size };
      if (ipoToday(s) && validate(s, sub) === null) return sub;
      for (let i = 0; i < s.slots.length; i++) {
        const o = s.slots[i]?.ipo;
        if (o?.stage === 'listed' && s.dayIndex >= o.offer.listDay + 1 && validate(s, { type: 'sell', slot: i }) === null) return { type: 'sell', slot: i };
      }
      return { type: 'open' };
    },
  };
}

// ================================================================ random / follower / chaser / qunzhu

export function randomBot(): Bot {
  return {
    name: 'random',
    act(s, rng) {
      if (s.phase === 'reward') {
        const n = s.reward?.cards.length ?? 0;
        if (n === 0) return { type: 'skipReward' };
        const i = rng.int(n);
        if (s.reward?.cards[i]?.kind === 'stock') return { type: 'pickReward', index: i, slot: rng.int(s.slots.length) };
        return { type: 'pickReward', index: i };
      }
      if (s.phase === 'event') return { type: 'choose', option: rng.int(2) };
      if (s.today.ops < 2) {
        const u = rng.next();
        const sellable = sellableSlots(s);
        if (u < 0.25 && sellable.length > 0) return { type: 'sell', slot: sellable[rng.int(sellable.length)] as number };
        if (u < 0.6 && s.today.buysLeft > 0) {
          const rec = rng.int(Math.max(1, s.today.recs.length));
          if (buyable(s, rec)) {
            const e = emptySlot(s);
            if (e >= 0) return { type: 'buy', rec, slot: e };
            if (sellable.length > 0) return { type: 'buy', rec, slot: sellable[rng.int(sellable.length)] as number };
          }
        }
      }
      return { type: 'open' };
    },
  };
}

export function followerBot(): Bot {
  return {
    name: 'follower',
    act(s) {
      if (s.phase === 'reward') return pickRewardBy(s, (kind) => (kind === 'stock' ? (emptySlot(s) >= 0 ? 1 : -1000) : 0));
      if (s.phase === 'event') return { type: 'choose', option: 0 };
      if (emptySlot(s) >= 0 && buyable(s, 0)) return { type: 'buy', rec: 0 };
      return { type: 'open' };
    },
  };
}

export function chaserBot(): Bot {
  return {
    name: 'chaser',
    act(s) {
      if (s.phase === 'reward') return pickRewardBy(s, (kind, id) => (kind === 'item' ? 2 + simpleItemPref(id) : kind === 'stock' ? 1 : 0.5));
      if (s.phase === 'event') return { type: 'choose', option: s.event?.id === 'livestream' ? 0 : 1 };
      // 热度下降就卖
      for (const i of sellableSlots(s)) {
        const h = s.slots[i];
        if (h && lastDelta(s, themeOfStock(h.stockId)) < 0) return { type: 'sell', slot: i };
      }
      // 追最热的题材
      if (emptySlot(s) >= 0 && s.today.buysLeft > 0) {
        let best = -1;
        let heat = -1;
        s.today.recs.forEach((r, i) => {
          const h = s.themes[themeOfStock(r.stockId)]?.heat ?? 0;
          if (buyable(s, i) && h > heat) {
            heat = h;
            best = i;
          }
        });
        if (best >= 0) return { type: 'buy', rec: best };
      }
      return { type: 'open' };
    },
  };
}

/**
 * 0.10.0 小白（docs/balance.md 第 1 节）：追最热的题材、不止损、不看消息真假。
 * 群里谁说涨就信谁、谁说跌就卖；亏了也拿着等回本，只在题材明显凉透（降温、冷）时才卖；不押跌、不抵押、不加仓。
 */
export function xiaobaiBot(): Bot {
  return {
    name: 'xiaobai',
    act(s, rng) {
      if (s.phase === 'reward') return pickRewardBy(s, (kind, id) => (kind === 'stock' ? (emptySlot(s) >= 0 ? 3 : 0.5) : kind === 'item' ? 1 + simpleItemPref(id) / 2 : 1) + rng.next());
      if (s.phase === 'event') return { type: 'choose', option: s.event ? casualEvent(s.event.id, rng) : 1 };
      const said = (theme: ThemeId): number => {
        let v = 0;
        for (const m of s.today.messages) if (m.theme === theme) v += m.claim === 'up' ? 1 : m.claim === 'down' ? -1 : 0;
        return v;
      };
      if (s.today.ops < 2) {
        for (const i of sellableSlots(s)) {
          const h = s.slots[i];
          if (!h) continue;
          const theme = themeOfStock(h.stockId);
          const feel = feelOf(s.themes[theme]?.history ?? []);
          if (said(theme) < 0 || feel === 'cold' || (feel === 'cooling' && h.value >= 1)) return { type: 'sell', slot: i };
        }
      }
      if (emptySlot(s) >= 0 && s.today.buysLeft > 0 && s.today.ops < 2) {
        let best = -1;
        let top = -Infinity;
        s.today.recs.forEach((r, i) => {
          if (!buyable(s, i)) return;
          const theme = themeOfStock(r.stockId);
          const v = (s.themes[theme]?.heat ?? 0) + said(theme) * 15;
          if (v > top) {
            top = v;
            best = i;
          }
        });
        if (best >= 0) return { type: 'buy', rec: best };
      }
      return { type: 'open' };
    },
  };
}

/** 无脑跟群主：买群主推荐的；群主说哪个题材跌，就卖哪个题材。 */
export function qunzhuBot(): Bot {
  return {
    name: 'qunzhu',
    act(s) {
      if (s.phase === 'reward') return pickRewardBy(s, (kind, id) => (kind === 'item' ? 2 + simpleItemPref(id) : kind === 'stock' ? 1 : 0.5));
      if (s.phase === 'event') return { type: 'choose', option: 0 };
      const down = new Set(s.today.messages.filter((m) => m.friendId === 'qunzhu' && m.claim === 'down').map((m) => m.theme));
      for (const i of sellableSlots(s)) {
        const h = s.slots[i];
        if (h && down.has(themeOfStock(h.stockId))) return { type: 'sell', slot: i };
      }
      const rec = s.today.recs.findIndex((r, i) => r.friendId === 'qunzhu' && buyable(s, i));
      if (rec >= 0) {
        const e = emptySlot(s);
        if (e >= 0) return { type: 'buy', rec, slot: e };
        const sellable = sellableSlots(s);
        if (sellable.length > 0) return { type: 'buy', rec, slot: sellable[0] as number };
      }
      return { type: 'open' };
    },
  };
}


/**
 * 新手课（src/core/lesson.ts）：一直照 lessonAdvice 做。variant 是故意不照做的一条，测这条心法值多少：
 * nostop 不止损（建议卖的只在不是止损时卖）、heavy 买一律重仓。奖励都不要，事件选第 2 项。
 */
export function lessonBot(variant: '' | 'nostop' | 'heavy' = ''): Bot {
  return {
    name: variant ? `lesson-${variant}` : 'lesson',
    act(s) {
      if (s.phase === 'reward') return { type: 'skipReward' };
      if (s.phase === 'event') return { type: 'choose', option: 1 };
      const a = lessonAdvice(s);
      if (!a || a.kind === 'wait') return { type: 'open' };
      if (a.kind === 'sell') return variant === 'nostop' && a.mind === 'zhisun' ? { type: 'open' } : { type: 'sell', slot: a.slot };
      return { type: 'buy', rec: a.rec, size: variant === 'heavy' ? 'heavy' : 'taste' };
    },
  };
}
