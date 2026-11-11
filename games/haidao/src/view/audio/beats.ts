import type { Beat } from './result.ts';
import { sfx } from './sfx.ts';

/** 按时间点放结算声音；alive 返回 false（结算框已经关了、离开场景）就不放了 */
export function playBeats(beats: Beat[], alive: () => boolean): void {
  for (const b of beats) setTimeout(() => { if (alive()) sfx(b.name, { pitch: b.pitch === 1 ? undefined : b.pitch }); }, b.at);
}
