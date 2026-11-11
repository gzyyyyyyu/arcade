// 事件 -> 声音名的纯映射：开火按塔种类、命中按目标材质、建筑按大小分档。画面层的事件处理只调这里，不各写一串三元式。
import type { SfxName } from './synth.ts';

const FIRE: Record<string, SfxName> = {
  cannon: 'cannon', gunTower: 'musket', mortar: 'mortar', rocket: 'rocket', harpoon: 'harpoon', flame: 'flame', kraken: 'kraken', shock: 'shock', sniper: 'snipe',
};

/** 塔 / 防御建筑开火的声音；不认识的按大炮 */
export function towerFire(kind: string | undefined): SfxName {
  return (kind && FIRE[kind]) || 'cannon';
}

/** 兵开火（登陆战里防守方没有塔种类时，按弹种选） */
export function projectileFire(kind: string): SfxName {
  return kind === 'shock' ? 'shock' : kind === 'snipe' ? 'snipe' : kind === 'grenade' ? 'harpoon' : kind === 'shell' ? 'mortar' : kind === 'bullet' ? 'musket' : kind === 'barrage' ? 'barrage' : 'cannon';
}

const STONE = new Set(['hq', 'vault', 'armory', 'rock', 'statue', 'cannon', 'gunTower', 'mortar', 'harpoon', 'rocket', 'flame', 'fogTower', 'kraken', 'shock']);
const METAL_UNITS = new Set(['brute', 'captain', 'ironclad']);

/** 被击中的东西是木、石还是铁：木屋木墙 -> wood，石墙和塔 -> stone，铁甲兵 -> metal，血肉之躯用通用 hit */
export function hitSound(target: 'building' | 'unit' | 'hero' | 'wall', kind?: string, level = 1): SfxName {
  if (target === 'hero') return 'hitMetal';
  if (target === 'unit') return kind && METAL_UNITS.has(kind) ? 'hitMetal' : 'hit';
  if (kind === 'wall') return level >= 3 ? 'hitStone' : 'hitWood';
  return kind && STONE.has(kind) ? 'hitStone' : 'hitWood';
}

/** 大建筑：占 3 格以上或主寨；落成、升级、倒塌用大一档的声音 */
export function isBigBuilding(kind: string, size: number): boolean {
  return kind === 'hq' || size >= 3;
}

export const buildSound = (big: boolean): SfxName => (big ? 'buildBig' : 'build');
export const upgradeSound = (big: boolean): SfxName => (big ? 'upgradeBig' : 'upgrade');
export const crumbleSound = (big: boolean): SfxName => (big ? 'crumbleBig' : 'crumble');
