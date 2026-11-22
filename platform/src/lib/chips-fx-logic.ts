/**
 * 回大厅筹码演出的纯逻辑（不碰 DOM、存储，单测只引这个；读写记录在 chips-fx.ts）。从游戏回大厅时，顶栏筹码牌子的小演出：总数（钱包余额 + 桌上筹码）比进游戏前多，数字从旧值滚到新值并迸一小撮金币；
 * 少了只滚数字；没变不播。总数在进游戏那一刻记进 `arcade.enterFx` 的 total 字段（和 enter-fx.ts 共用同一条记录，不加新 key）。
 * 比较桌上筹码是为了：实盘中途离开、筹码还在桌上，不算赢。
 */

export const ENTER_FX_KEY = 'arcade.enterFx';
/** 进游戏的记录多久内回来才算"刚从游戏回来"（封面过渡和筹码演出共用） */
export const ENTER_FX_WITHIN_MS = 30 * 60_000;

type ChipsFx = { kind: 'none' } | { kind: 'roll'; from: number } | { kind: 'burst'; from: number };

interface WalletLike {
  balance: number;
  stakes: readonly { amount: number }[];
}

/** 钱包余额 + 桌上筹码 */
export function chipsTotal(w: WalletLike): number {
  return w.stakes.reduce((t, s) => t + s.amount, w.balance);
}

/**
 * 决定播什么。rec 是进游戏时的记录（可能没有、坏数据、没记总数、过期）。
 * from 是牌子上数字的起点：现在的余额减去总数的变化量（桌上筹码没动，变化全落在余额上），不低于 0。
 */
export function decideChipsFx(rec: { total?: unknown; at?: unknown } | null, now: { total: number; balance: number }, nowMs: number): ChipsFx {
  if (!rec || typeof rec.total !== 'number' || !Number.isFinite(rec.total) || typeof rec.at !== 'number') return { kind: 'none' };
  if (nowMs - rec.at > ENTER_FX_WITHIN_MS) return { kind: 'none' };
  const diff = now.total - rec.total;
  if (diff === 0) return { kind: 'none' };
  const from = Math.max(0, now.balance - diff);
  return diff > 0 ? { kind: 'burst', from } : { kind: 'roll', from };
}
