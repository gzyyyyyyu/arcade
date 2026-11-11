/** 解锁项的画面辅助：说明文字和图标。开放什么、还差什么由规则核心的 unlocksAt / nextUnlock 给 */
import { BUILDINGS, SKILLS, TROOPS } from '../content/index.ts';
import type { UnlockItem } from '../core/index.ts';
import type { BuildingKind, SkillKind, TroopKind } from '../core/types.ts';
import { bArt, iconA, tArt, type ArtPiece } from './art.ts';

export { nextUnlock, unlocksAt, type UnlockItem } from '../core/index.ts';

export function itemDesc(it: UnlockItem): string {
  if (it.type === 'building') return BUILDINGS[it.kind as BuildingKind]?.desc ?? '';
  if (it.type === 'troop') return TROOPS[it.kind as TroopKind]?.desc ?? '';
  return SKILLS[it.kind as SkillKind]?.desc ?? '';
}

export function itemArt(it: UnlockItem): ArtPiece {
  if (it.type === 'building') return bArt(it.kind as BuildingKind, 1);
  if (it.type === 'troop') return tArt(it.kind as TroopKind, 'idle');
  return iconA(it.kind as SkillKind);
}
