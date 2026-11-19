import { COUNTER, TD_ARMORS, TD_ENEMY_ARMOR, TD_TOWER_DAMAGE, tdBuildRange, tdGarrisonOptions, type Profile, type TdArmor, type TdGarrisonOption, type TdGarrisonPick, type TdIslandLevel, type TdTowerKind, type TdWave } from '../core/index.ts';
import { TD2_ENEMIES } from '../content/td2units.ts';
import { UNIT } from '../core/types.ts';

/**
 * 驻守台的「这关推荐」（只是画面上的建议，开局时规则照收玩家挑的任何一项）：
 * 规则核心的 tdAutoPicks 只按阶数挑（每座台都挑同一种最高阶的），不看这一关来什么敌人；这里按这一关全部波次的敌人打分——
 * 一、护甲占比（按血量加权，首领算得重）× 克制倍率（COUNTER），挑克得最好的伤害；
 * 二、这一关有船（炮艇、海盗王停在海上）时，射程 ≥ SHIP_RANGE 格的塔加分（够得着海上的船）；
 * 三、几座台尽量不推同一种（同分时换一种），阶高的略优先。
 */
export const SHIP_RANGE = 8;
const SHIPS = new Set(['gunboat', 'king']);
/** 够得着船的加分（克制分是 0.5–1.5 一档）、重复推荐同一种的扣分、阶的微小优先 */
const SHIP_BONUS = 0.3;
const REPEAT_COST = 0.08;
const TIER_EPS = 0.01;

/** 一关全部波次的护甲占比（血量加权，和为 1；没有敌人时全 0）和有没有船 */
export function levelFoes(waves: readonly TdWave[]): { share: Record<TdArmor, number>; ships: boolean } {
  const share = { cloth: 0, heavy: 0, wood: 0, air: 0 } as Record<TdArmor, number>;
  let total = 0;
  let ships = false;
  for (const w of waves) {
    for (const g of w.groups) {
      const v = g.n * TD2_ENEMIES[g.enemy].hp;
      share[TD_ENEMY_ARMOR[g.enemy]] += v;
      total += v;
      if (SHIPS.has(g.enemy)) ships = true;
    }
  }
  if (total > 0) for (const a of TD_ARMORS) share[a] /= total;
  return { share, ships };
}

/** 一种塔对这一关的分：克制分 + 够得着船的加分 + 阶 */
export function optionScore(o: TdGarrisonOption, foes: ReturnType<typeof levelFoes>): number {
  const d = TD_TOWER_DAMAGE[o.kind];
  let v = 0;
  for (const a of TD_ARMORS) v += (foes.share[a] * COUNTER[d][a]) / 100;
  if (foes.ships && tdBuildRange(o.kind, o.tier).range >= SHIP_RANGE * UNIT) v += SHIP_BONUS;
  return v + o.tier * TIER_EPS;
}

/** 每座台推荐哪种塔（下标 = 台的序号）；某座台一种能带的都没有就不推荐 */
export function garrisonRec(waves: readonly TdWave[], spots: ReadonlyArray<readonly TdGarrisonOption[]>): Map<number, TdTowerKind> {
  const foes = levelFoes(waves);
  const out = new Map<number, TdTowerKind>();
  const used = new Map<TdTowerKind, number>();
  spots.forEach((opts, i) => {
    let best: TdGarrisonOption | null = null;
    let top = Number.NEGATIVE_INFINITY;
    for (const o of opts) {
      const v = optionScore(o, foes) - (used.get(o.kind) ?? 0) * REPEAT_COST;
      if (v > top) [best, top] = [o, v];
    }
    if (!best) return;
    out.set(i, best.kind);
    used.set(best.kind, (used.get(best.kind) ?? 0) + 1);
  });
  return out;
}

/** 每座驻守台都挑推荐的那种（没进驻守台面板就直接开打时用，和面板默认选中的同一套） */
export function garrisonRecPicks(p: Profile, lv: TdIslandLevel): TdGarrisonPick[] {
  return [...garrisonRec(lv.waves, lv.garrison.map((sp) => tdGarrisonOptions(p, sp.cap)))].map(([spot, kind]) => ({ spot, kind }));
}
