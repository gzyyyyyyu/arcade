/**
 * 试炼的目标判定（content/trials.ts，docs/design-play.md 2.6）：step 每拍调 trialVerdict 决定要不要收工；
 * 局末 trialResult 算通关没有、完成度和排行榜成绩。纯函数，只读 World。
 */
import { trialScore } from '../content/trials.ts';
import { DAWN_TICK } from '../content/waves.ts';
import { TICKS_PER_SECOND, type World } from './state.ts';

/** 1 = 达成收工、-1 = 过点算输、0 = 接着打（守夜才调；天亮、倒下照常由 step 判） */
export function trialVerdict(w: World): number {
  const g = w.trial!.goal;
  if (g.kind === 'slay') {
    if (g.foe === 'mid' && w.midKilled) return 1;
    // 尸王倒了 step 里直接收工算赢；过点（含天亮）还没打倒就输
    if (w.tick >= g.by * TICKS_PER_SECOND) return -1;
  } else if (g.kind === 'nobun' && w.tick >= g.until * TICKS_PER_SECOND) return 1;
  return 0;
}

export interface TrialResult {
  won: boolean;
  /** 完成度：撑了几秒 / 赢了剩几秒 / 带出价值 */
  progress: number;
  score: number;
}

/** 局末结果；夜探传带出价值（没撤出 0），认输照常按当时算 */
export function trialResult(w: World, lootValue = 0): TrialResult | null {
  const t = w.trial;
  if (!t) return null;
  const g = t.goal;
  const secs = Math.floor(Math.min(w.tick, DAWN_TICK) / TICKS_PER_SECOND);
  let won: boolean;
  let progress: number;
  if (g.kind === 'loot') {
    won = w.raid?.outcome === 'escaped' && lootValue >= g.value;
    progress = lootValue;
  } else if (g.kind === 'slay') {
    won = w.won && (g.foe === 'mid' ? w.midKilled : w.bossKilled);
    progress = won ? Math.max(0, g.by - secs) : secs;
  } else {
    won = w.won;
    progress = secs;
  }
  return { won, progress, score: trialScore(won, progress) };
}
