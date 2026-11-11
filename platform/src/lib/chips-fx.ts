/**
 * 回大厅筹码演出在页面这一层的部分：记住最近读到的总数、页面加载时先把进游戏时的记录读下来。
 * 决定播什么的纯函数在 chips-fx-logic.ts。
 */
import { ENTER_FX_KEY } from './chips-fx-logic.ts';

/** 最近一次读到的总数；点进游戏时 enter-fx.ts 把它记下来。没读到钱包就是 null，回来也就不播 */
let latestTotal: number | null = null;
export const setLatestTotal = (n: number | null): void => {
  latestTotal = n;
};
export const getLatestTotal = (): number | null => latestTotal;

/**
 * 页面一加载就把进游戏时的记录读下来（不删）：enter-fx.ts 播完"缩回"会删掉记录，
 * 而钱包要等接口回来才有数，所以这里先留一份，等钱包到了再比较；只取一次。
 */
let pending: { total?: unknown; at?: unknown } | null = null;
try {
  const raw = JSON.parse(sessionStorage.getItem(ENTER_FX_KEY) ?? 'null') as { total?: unknown; at?: unknown } | null;
  if (raw && typeof raw === 'object') pending = { total: raw.total, at: raw.at };
} catch {
  // 没有 sessionStorage 或数据坏了，当没有
}
export function takePending(): { total?: unknown; at?: unknown } | null {
  const p = pending;
  pending = null;
  return p;
}
