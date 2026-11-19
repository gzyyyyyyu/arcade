import type { TdEnemy } from '../core/index.ts';

/**
 * 守岛里哪些敌人算首领、哪些算精英（敌人表里没有这个标记，规则只按种类区分；画面按这里给血条和徽记）。
 * 首领：船长（光环）、海盗王（开炮、掉宝）——顶栏挂粗血条、头上宽血条加王冠；精英：水手长（4 倍血）、大副（死后分裂）——宽血条加金菱形。
 */
export type FoeTier = 0 | 1 | 2;
const TIER: Readonly<Partial<Record<TdEnemy['kind'], FoeTier>>> = { captain: 2, king: 2, bosun: 1, mate: 1 };

export function foeTier(kind: TdEnemy['kind']): FoeTier {
  return TIER[kind] ?? 0;
}

/** 顶栏粗血条跟谁：场上（在岛上或往回跑）的首领里最大血量的那个，同样大取编号小的（先来的）；没有返回 null */
export function bossOf(enemies: readonly TdEnemy[]): TdEnemy | null {
  let best: TdEnemy | null = null;
  for (const e of enemies) {
    if ((e.mode !== 'in' && e.mode !== 'out') || foeTier(e.kind) !== 2) continue;
    if (!best || e.maxHp > best.maxHp || (e.maxHp === best.maxHp && e.id < best.id)) best = e;
  }
  return best;
}
