/**
 * 电脑上的两个小帮手（纯函数，好测）：
 * 1. 悬停看听牌：同一手牌（视图对象）下同一张牌只算一次，手牌变了（新的视图）自然作废；
 * 2. "点两下或往上拖打出"的提示只在前几次打牌时出现，次数记在 localStorage 的 mahjong.hint。
 */

import { readText, writeText } from '../storage.ts';

/** 给"按视图对象 + 一个参数"的计算加缓存；视图换了，旧缓存随它一起被回收 */
export function memoPerView<K extends object, A, R>(fn: (view: K, arg: A) => R): (view: K, arg: A) => R {
  const seen = new WeakMap<K, Map<A, R>>();
  return (view, arg) => {
    let m = seen.get(view);
    if (!m) seen.set(view, (m = new Map()));
    if (m.has(arg)) return m.get(arg)!;
    const r = fn(view, arg);
    m.set(arg, r);
    return r;
  };
}

export const HINT_KEY = 'mahjong.hint';
/** 前几次打牌显示提示，之后收起来 */
export const HINT_LIMIT = 6;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** s 不传用 localStorage，传 null 是没有存储（测试注入用）；读不到当 0 次 */
function read(s?: Store | null): number {
  const n = Number(readText(HINT_KEY, s));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 还要不要显示"点两下或往上拖打出" */
export function showPlayHint(s?: Store | null): boolean {
  return read(s) < HINT_LIMIT;
}

/** 打出一张牌，记一次 */
export function countPlayHint(s?: Store | null): void {
  const n = read(s);
  // 存不上就一直显示，不碍事，不看返回值
  if (n < HINT_LIMIT) writeText(HINT_KEY, String(n + 1), s);
}

/** 有鼠标、能悬停的设备才做悬停预览（手机平板没有悬停） */
export function canHover(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}
