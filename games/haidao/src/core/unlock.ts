/** 主寨每升一级开放什么：给界面的"下一级解锁"提示用 */
import { BUILDINGS, HQ_LEVELS, SKILLS, TROOPS } from '../content/index.ts';
import { hqLevel, totalStars } from './base.ts';
import type { Profile, Res } from './types.ts';

export interface UnlockItem {
  type: 'troop' | 'building' | 'skill';
  kind: string;
  name: string;
}

/** 这一级主寨新开放的东西（1 级是开局就有的，不算新开放，返回空） */
export function unlocksAt(hq: number): UnlockItem[] {
  if (hq <= 1) return [];
  const out: UnlockItem[] = [];
  for (const [kind, d] of Object.entries(BUILDINGS)) {
    if (d.unlockHq === hq && d.category !== 'deco') out.push({ type: 'building', kind, name: d.name });
  }
  for (const [kind, d] of Object.entries(TROOPS)) if (d.unlockHq === hq) out.push({ type: 'troop', kind, name: d.name });
  for (const [kind, d] of Object.entries(SKILLS)) if (d.unlockHq === hq) out.push({ type: 'skill', kind, name: d.name });
  return out;
}

export function nextUnlock(p: Profile): { hq: number; needStars: number; starsLeft: number; cost: Res; items: UnlockItem[] } | null {
  const cur = hqLevel(p);
  const next = HQ_LEVELS[cur];
  if (!next) return null;
  return {
    hq: next.level,
    needStars: next.needStars,
    starsLeft: Math.max(0, next.needStars - totalStars(p)),
    cost: { ...next.cost },
    items: unlocksAt(next.level),
  };
}
