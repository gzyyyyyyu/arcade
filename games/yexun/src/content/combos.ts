/**
 * 搭配（合成、双修）对哪个角色凑得出来（DESIGN 3.3d）：界面上所有「谁能合」都从这里读，和规则核心同一个口径。
 * 规则核心只按专属放行（weapons.ts 的 mergeFor），料抽不抽得到看角色池（pools.ts）；两样叠起来才是「凑得出」：
 * 专属给了别人的、两件料有一件不在池里的、进化用的被动不在池里（合成要两件都进化，双修要至少一件进化）的，都凑不出。
 */
import { CHARACTER_IDS, type CharacterId } from './meta.ts';
import { CHARACTER_POOLS } from './pools.ts';
import { MERGES, mergeFor, WEAPONS, type MergeDef, type WeaponId } from './weapons.ts';

/** ok 凑得出；only 是别人的专属；pool 料不在池里；evo 进化用的被动不在池里 */
export type Reach = 'ok' | 'only' | 'pool' | 'evo';

export function mergeReach(m: MergeDef, c: CharacterId): Reach {
  if (!mergeFor(m, c)) return 'only';
  const p = CHARACTER_POOLS[c];
  if (!p.weapons.includes(m.a) || !p.weapons.includes(m.b)) return 'pool';
  const evo = (w: WeaponId): boolean => {
    const e = WEAPONS[w].evolve;
    return !!e && p.passives.includes(e.with);
  };
  return (m.dual ? evo(m.a) || evo(m.b) : evo(m.a) && evo(m.b)) ? 'ok' : 'evo';
}

/** 凑不出的原因，一句话（图鉴用）；ok 时是空串 */
export function reachWhy(m: MergeDef, c: CharacterId): string {
  const r = mergeReach(m, c);
  if (r === 'only') return '别的角色专属';
  if (r === 'pool') {
    const p = CHARACTER_POOLS[c].weapons;
    return `抽不到${[m.a, m.b].filter((w) => !p.includes(w)).map((w) => WEAPONS[w].name).join('、')}`;
  }
  return r === 'evo' ? '缺进化用的被动' : '';
}

/** 能选的角色里谁凑得出这个搭配（按选角页的顺序） */
export const mergeWho = (m: MergeDef): CharacterId[] => CHARACTER_IDS.filter((c) => mergeReach(m, c) === 'ok');

/** 界面上列的搭配：能选的角色里至少一个人凑得出（以后再收起某个角色，他的专属搭配就不列，数据留着） */
export const SHOWN_MERGES: readonly MergeDef[] = MERGES.filter((m) => mergeWho(m).length > 0);

/** 这个角色凑得出的搭配（按 MERGES 的顺序） */
export const reachableMerges = (c: CharacterId): MergeDef[] => SHOWN_MERGES.filter((m) => mergeReach(m, c) === 'ok');
