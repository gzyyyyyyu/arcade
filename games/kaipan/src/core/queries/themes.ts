/** 题材看板。 */
import { stocksOf, themeById } from '../content/index.ts';
import { FEEL_LABEL, STAGE_LABEL } from '../labels.ts';
import { feelOf, rulesOf } from '../market.ts';
import type { Feel, GameState, Stage, ThemeId } from '../types.ts';

// ================================================================ 题材看板

export interface ThemeCard {
  id: ThemeId;
  name: string;
  /** 一句话性格 */
  desc: string;
  heat: number;
  /** 近 5 日的热度变化（旧 → 新） */
  trend: number[];
  /** 最近一天的热度变化 */
  lastDelta: number;
  feel: Feel;
  feelLabel: string;
  /** 上一个交易日的真实阶段：持有情绪指标时每个题材都给，熬夜复盘时只给被揭示的那个，否则为 null */
  stage: Stage | null;
  stageLabel: string | null;
  /** 这一条阶段来自熬夜复盘（只标注到这个盘前） */
  reviewed: boolean;
  /** 大V直播间跟单的加成（还剩几天、每天 +几） */
  boost: { dH: number; days: number } | null;
  /** 本题材在场的股票 id（龙头在前） */
  stocks: string[];
}

export function themeBoard(s: Readonly<GameState>): ThemeCard[] {
  const reveal = rulesOf(s).revealStages;
  const review = s.review && s.review.day === s.dayIndex - 1 ? s.review : null;
  return s.themeIds.map((id) => {
    const t = s.themes[id];
    const history = t?.history ?? [];
    const trend: number[] = [];
    for (let i = Math.max(1, history.length - 5); i < history.length; i++) trend.push((history[i] ?? 0) - (history[i - 1] ?? 0));
    const feel = feelOf(history);
    const reviewed = review?.theme === id;
    const stage = reveal && t ? t.lastStage : reviewed && review ? review.stage : null;
    return {
      id,
      name: themeById(id).name,
      desc: themeById(id).desc,
      heat: t?.heat ?? 0,
      trend,
      lastDelta: trend[trend.length - 1] ?? 0,
      feel,
      feelLabel: FEEL_LABEL[feel],
      stage,
      stageLabel: stage ? STAGE_LABEL[stage] : null,
      reviewed: reviewed && !reveal,
      boost: t?.boost ? { ...t.boost } : null,
      stocks: stocksOf(id)
        .filter((d) => s.stocks[d.id] && !s.stocks[d.id]?.delisted)
        .map((d) => d.id),
    };
  });
}
