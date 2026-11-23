/**
 * 介绍卡片的人话部分（数值不在这里，卡片直接读 TROOPS / BUILDINGS / raidDefenseBase）：
 * 登陆战每个兵一句定位 + 相克（它好打的防御 / 它怕的防御）。防御那一边的相克按这张表反查，同一件事只写一处。
 * 相克按规则推出来：单体塔一发只打一个（怕人多）、溅射塔怕肉不怕散、盾挡正面直射挡不住溅射抛射、射程比塔远的能站在塔够不着的地方打。
 */
import type { BuildingKind, TroopKind } from '../core/types.ts';

interface TroopIntel {
  /** 一句话定位：干什么的、怎么用 */
  role: string;
  /** 打起来占便宜的防御 */
  beats: readonly BuildingKind[];
  /** 碰上要吃亏的防御 */
  fears: readonly BuildingKind[];
}

export const TROOP_INTEL: Record<TroopKind, TroopIntel> = {
  sailor: { role: '便宜的近战，一拥而上拆最近的建筑；放一大片，让单体塔打不过来。', beats: ['cannon', 'harpoon', 'sniper'], fears: ['mortar', 'flame', 'rocket', 'mine'] },
  gunner: { role: '站在 4 格外放枪，血薄；跟在肉盾后面，别让它先进炮口。', beats: ['cannon', 'sniper'], fears: ['mortar', 'flame', 'rocket', 'gunTower'] },
  brute: { role: '血厚的肉盾，只找防御塔打；先放它吸炮火，后面的兵才活得久。', beats: ['gunTower', 'flame', 'mortar'], fears: ['harpoon', 'shock', 'tar'] },
  bomber: { role: '抱着炸药桶冲，附近有墙先炸墙（炸墙三倍伤害），炸完自己也没了。', beats: ['wall'], fears: ['gunTower', 'mine', 'flame'] },
  captain: { role: '英雄，一场只带一个：血厚、伤害高，什么都能拆；别让他一个人冲。', beats: ['cannon', 'gunTower', 'flame'], fears: ['sniper', 'shock', 'harpoon'] },
  medic: { role: '不打建筑，跟着大队给附近的兵回血；挡住零碎的小伤害最值。', beats: ['gunTower', 'flame'], fears: ['sniper', 'mortar'] },
  cannoneer: { role: '只打防御塔，射程 8 格，比大多数塔远：放在塔够不着的地方慢慢轰。', beats: ['cannon', 'gunTower', 'flame', 'shock'], fears: ['sniper', 'mortar', 'harpoon'] },
  harpooner: { role: '射得快的远程，专找防御塔；比喷火塔射得远，怕溅射。', beats: ['flame'], fears: ['mortar', 'rocket', 'gunTower'] },
  shield: { role: '举盾走在前面，正面的子弹炮弹只吃三成半，还替身后的兵挡一点。', beats: ['cannon', 'gunTower', 'harpoon', 'sniper'], fears: ['mortar', 'flame', 'rocket', 'shock'] },
  grenadier: { role: '隔着墙往里扔手雷，一炸一小片，专挑扎堆的建筑；血薄走得慢。', beats: ['wall'], fears: ['flame', 'rocket', 'sniper'] },
};

/** 防御的卡片：被哪些兵克、克哪些兵（反查 TROOP_INTEL） */
export function defenseMatchups(kind: BuildingKind): { beats: TroopKind[]; fears: TroopKind[] } {
  const beats: TroopKind[] = [];
  const fears: TroopKind[] = [];
  for (const [t, it] of Object.entries(TROOP_INTEL) as Array<[TroopKind, TroopIntel]>) {
    if (it.fears.includes(kind)) beats.push(t);
    if (it.beats.includes(kind)) fears.push(t);
  }
  return { beats, fears };
}
