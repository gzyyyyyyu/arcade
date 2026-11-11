/**
 * 徽章"已看过"的记录：战绩页只在新拿到、升档的奖章上播一次亮相。
 * 记录按用户分开存浏览器里（id → 当时的档位），不上服务器：只是个演出开关，丢了最多重播一次。
 */

// 测试工程的类型里没有 DOM，所以经 globalThis 取，只声明用到的两个方法
interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }
const store = () => (globalThis as { localStorage?: Store }).localStorage;

const key = (userId: string) => `arcade.badgesSeen.${userId}`;

/** 新拿到或档位升了的徽章 id；降档、没变化、现在没拿到的都不算（降档后再升回来才算新的） */
export function newlyEarned(prev: Record<string, number>, now: Record<string, number>): string[] {
  return Object.keys(now).filter((id) => now[id]! > 0 && now[id]! > (prev[id] ?? 0));
}

/** 读不到、坏 JSON、形状不对都当没有记录（返回 null，调用方据此区分"第一次打开"） */
export function readSeen(userId: string): Record<string, number> | null {
  try {
    const raw = store()!.getItem(key(userId));
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
    return out;
  } catch {
    return null;
  }
}

/** 存不了（隐私模式、满了）就算了，不影响页面 */
export function writeSeen(userId: string, map: Record<string, number>): void {
  try {
    store()!.setItem(key(userId), JSON.stringify(map));
  } catch {
    /* 演出开关而已 */
  }
}
