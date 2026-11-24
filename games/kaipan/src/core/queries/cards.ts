/** 股票与持仓卡。 */
import { BALANCE } from '../balance.ts';
import { stockById, themeById } from '../content/index.ts';
import { canSell, holdingBase, isBusy } from '../engine/index.ts';
import { ROLE_LABEL } from '../labels.ts';
import type { Face, GameState, Role, ThemeId } from '../types.ts';

// ================================================================ 股票与持仓卡

/** 股票小人的表情：按上一个交易日的涨跌。 */
export function faceOf(move: number, limit: number, delisted = false): Face {
  if (delisted) return 'delisted';
  if (move >= limit - 1e-9) return 'limitup';
  if (move <= -limit + 1e-9) return 'limitdown';
  if (move >= 1) return 'happy';
  if (move <= -1) return 'worried';
  return 'calm';
}

export interface StockCard {
  id: string;
  name: string;
  theme: ThemeId;
  themeName: string;
  role: Role;
  roleLabel: string;
  price: number;
  /** 上一个交易日涨跌（pp） */
  move: number;
  /** 近 5 日涨跌（pp） */
  history: number[];
  boards: number;
  face: Face;
  /** ST：退市警告次数 / 摘帽后还要涨停几天 */
  warnings: number;
  uncap: number;
  delisted: boolean;
}

export function stockCard(s: Readonly<GameState>, id: string): StockCard {
  const def = stockById(id);
  const st = s.stocks[id];
  const limit = BALANCE.roles[def.role].limit;
  return {
    id,
    name: def.name,
    theme: def.theme,
    themeName: themeById(def.theme).name,
    role: def.role,
    roleLabel: ROLE_LABEL[def.role],
    price: st?.price ?? 0,
    move: st?.move ?? 0,
    history: [...(st?.history ?? [])],
    boards: st?.boards ?? 0,
    face: faceOf(st?.move ?? 0, limit, st?.delisted ?? false),
    warnings: st?.warnings ?? 0,
    uncap: st?.uncap ?? 0,
    delisted: st?.delisted ?? false,
  };
}

export interface HoldingCard extends StockCard {
  slot: number;
  /** 这一格上一个交易日的收益（pp，含道具）；刚买入为 null */
  todayRet: number | null;
  /** 持有收益（pp） */
  holdRet: number;
  /**
   * 持有收益折成钱（元，四舍五入）：这一格现在的钱（占账户的比例 × 账户）× (1 − 1 / 净值倍数)。
   * 每天按份数重新占账户，所以是按「现在这么多钱、涨跌了这么多」折算，和账户的逐日变化不完全相等。
   */
  holdMoney: number;
  /** 今天能卖（T+1） */
  canSell: boolean;
  /** 买入时是冷门或降温（低吸大师） */
  lowBuy: boolean;
  /** 这一只占账户的比例（0..1）：1/4；多开一格且拿满 5 只时 1/(4 + fx(extra_slot, share))；开了仓位玩法再乘份数 */
  weight: number;
  /** 占几份（缺省 1）、押跌 */
  units: number;
  short: boolean;
}

/** 持仓格：每格一项，空格为 null。 */
export function holdingCards(s: Readonly<GameState>): (HoldingCard | null)[] {
  return s.slots.map((h, slot) => {
    if (!h) return null;
    return {
      ...stockCard(s, h.stockId),
      slot,
      todayRet: h.todayRet,
      holdRet: Math.round((h.value - 1) * 10000) / 100,
      holdMoney: Math.round(((h.units ?? 1) / holdingBase(s)) * s.account * (1 - 1 / h.value)),
      canSell: s.phase === 'premarket' && !isBusy(s) && canSell(s, slot),
      lowBuy: h.lowBuy,
      weight: (h.units ?? 1) / holdingBase(s),
      units: h.units ?? 1,
      short: !!h.short,
    };
  });
}
