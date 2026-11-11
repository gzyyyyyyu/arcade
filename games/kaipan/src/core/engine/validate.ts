/** 操作校验：validate(state, action) 返回非法原因，合法为 null。 */
import { BALANCE } from '../balance.ts';
import { COLLATERAL_IDS, stockById } from '../content/index.ts';
import { rulesOf } from '../market.ts';
import type { Action, GameState } from '../types.ts';
import { firstEmpty, ipoToday } from './calendar.ts';
import { canSell, canShortNow, freeUnits, isBusy, loanOffer, sizeUnits, unitsOf } from './ext.ts';

// ================================================================ 校验

function slotError(s: Readonly<GameState>, slot: number | undefined, allowReplace: boolean): string | null {
  if (slot === undefined) return firstEmpty(s) >= 0 ? null : '手里已经拿满了，要先卖掉一只，或者选一只换掉';
  if (!Number.isInteger(slot) || slot < 0 || slot >= s.slots.length) return '没有这个位置';
  if (s.slots[slot] && !allowReplace) return '这个位置已经有股票了';
  return null;
}

const FROZEN_MSG = '这一格在申购新股，钱冻结着，等出签再说';

/** 返回操作不合法的原因；合法返回 null。 */
export function validate(s: Readonly<GameState>, a: Action): string | null {
  if (s.phase === 'won' || s.phase === 'lost') return '本局已结束';
  switch (a.type) {
    case 'buy': {
      if (s.phase !== 'premarket') return '现在还不能买卖';
      if (isBusy(s)) return '今天在加班，没空买卖';
      const rec = Number.isInteger(a.rec) ? s.today.recs[a.rec] : undefined;
      if (!rec) return '没有这条推荐';
      if (rec.taken) return '这只今天已经买过了';
      if (s.today.buysLeft <= 0) return '今天能买的次数用完了';
      if (s.slots.some((h) => h?.stockId === rec.stockId)) return '手里已经有这只了';
      const only = rulesOf(s).onlyRoles;
      if (only && !only.includes(stockById(rec.stockId).role)) return '这个月只能买老实股';
      if ((a.size !== undefined || a.short) && !s.ext) return '这一局没有这个玩法';
      if (a.size !== undefined && a.size !== 'taste' && a.size !== 'half' && a.size !== 'heavy') return '没有这种买法';
      if (a.short && !canShortNow(s)) return '还没解锁押跌';
      const err = slotError(s, a.slot, true);
      if (err) return err;
      if (a.slot !== undefined && s.slots[a.slot]?.ipo?.stage === 'frozen') return FROZEN_MSG;
      if (a.slot !== undefined && s.slots[a.slot] && !canSell(s, a.slot)) return '今天买的，明天才能卖（也不能换掉）';
      if (s.ext && sizeUnits(s, a.size ?? 'taste', a.slot) <= 0) return '现金用完了：先卖掉一些，或者选一只换掉';
      return null;
    }
    case 'add': {
      if (!s.ext) return '这一局没有这个玩法';
      if (s.phase !== 'premarket') return '现在还不能买卖';
      if (isBusy(s)) return '今天在加班，没空买卖';
      const h = Number.isInteger(a.slot) ? s.slots[a.slot] : undefined;
      if (!h) return '这个位置是空的';
      if (h.ipo?.stage === 'frozen') return FROZEN_MSG;
      if (s.stocks[h.stockId]?.delisted) return '这只已经退市了';
      if (s.today.buysLeft <= 0 && !rulesOf(s).freeAdd) return '今天能买的次数用完了';
      if (freeUnits(s) + 1e-9 < BALANCE.ext.minUnit) return '现金用完了，加不了';
      return null;
    }
    case 'trim': {
      if (!s.ext) return '这一局没有这个玩法';
      if (s.phase !== 'premarket') return '现在还不能买卖';
      if (isBusy(s)) return '今天在加班，没空买卖';
      const h = Number.isInteger(a.slot) ? s.slots[a.slot] : undefined;
      if (!h) return '这个位置是空的';
      if (h.ipo?.stage === 'frozen') return FROZEN_MSG;
      if (unitsOf(h) < 2 * BALANCE.ext.minUnit - 1e-9) return '只剩一小口了，要卖就清仓';
      return canSell(s, a.slot) ? null : '今天买的，明天才能卖';
    }
    case 'borrow': {
      if (!s.ext) return '这一局没有这个玩法';
      if (!(COLLATERAL_IDS as readonly string[]).includes(a.id)) return '没有这件东西';
      const o = loanOffer(s, a.id);
      if (!o) return '这个难度还押不了这件东西';
      return o.error;
    }
    case 'repay': {
      if (!s.ext) return '这一局没有这个玩法';
      if (s.phase !== 'premarket') return '银行只在开盘前办事';
      const loan = s.ext.loans.find((l) => l.id === a.id);
      if (!loan) return '这件东西没有押在银行';
      return s.account >= loan.amount ? null : '钱不够还';
    }
    case 'sell': {
      if (s.phase !== 'premarket') return '现在还不能买卖';
      if (isBusy(s)) return '今天在加班，没空买卖';
      if (!Number.isInteger(a.slot) || !s.slots[a.slot]) return '这个位置是空的';
      if (s.slots[a.slot]?.ipo?.stage === 'frozen') return FROZEN_MSG;
      return canSell(s, a.slot) ? null : '今天买的，明天才能卖';
    }
    case 'subscribe': {
      if (s.phase !== 'premarket') return '现在还不能买卖';
      if (isBusy(s)) return '今天在加班，没空申购';
      if (a.size !== 'taste' && a.size !== 'half' && a.size !== 'heavy') return '没有这种买法';
      if (!ipoToday(s)) return '今天没有新股可以申购';
      return sizeUnits(s, a.size) > 0 ? null : '现金用完了：先卖掉一些再申购';
    }
    case 'open':
      return s.phase === 'premarket' ? null : '现在还不能开盘';
    case 'deleverage': {
      const g = s.setup?.live?.gear;
      if (!g || g.x <= 1) return '这一局没开杠杆';
      if (s.gearCut && s.gearCut.x <= 1) return '已经减到不加杠杆了';
      return s.phase === 'premarket' ? null : '开盘前才能减仓';
    }
    case 'pickReward': {
      if (s.phase !== 'reward' || !s.reward) return '现在不是领奖励的时候';
      const card = Number.isInteger(a.index) ? s.reward.cards[a.index] : undefined;
      if (!card) return '没有这张奖励卡';
      if (card.kind === 'stock') return slotError(s, a.slot, true);
      return null;
    }
    case 'skipReward':
      return s.phase === 'reward' ? null : '现在不是领奖励的时候';
    case 'choose':
      if (s.phase !== 'event' || !s.event) return '现在没有事件';
      return a.option === 0 || a.option === 1 ? null : '只有两个选项';
    default:
      return `未知操作：${String((a as { type?: unknown }).type)}`;
  }
}
