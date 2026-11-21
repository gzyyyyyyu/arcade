/**
 * 心法特色（开局配置 B，DESIGN 3.7）：每个流派一条改打法的规则，只加这个流派单子上的法器（受伤减免除外）。
 * 规则在 core/xinfa.ts，界面文字（选卡、开局面板、玩法说明、HUD）都从这张表来。权重、保底见 pools.ts XINFA_MUL。
 */
import type { SchoolId } from './guide.ts';

export const XINFA_FX = {
  /** 剑意：打离你 near 以内的怪 ×mul */
  sword: { near: 160, mul: 1.25 },
  /** 符潮：身边 r 以内每 per 只怪 +step，最多 max 层 */
  talisman: { r: 300, per: 8, step: 0.06, max: 6 },
  /** 不动如山：停下满 still 拍后受伤 ×hurt、本流派 ×mul */
  ward: { still: 15, hurt: 0.7, mul: 1.2 },
  /** 雷动：连续走动每 every 拍 +1 层（最多 max，每层 +step），停下满 reset 拍清零 */
  wood: { every: 60, max: 5, step: 0.05, reset: 15 },
  /** 燎原：本流派打倒的怪在原地炸一圈火星，半径 r，伤害 = 打倒它那一下 × share（火星本身不再炸） */
  fire: { r: 70, share: 0.2 },
  /** 同袍：场上每个纸兵受伤 −step，最多 −max */
  paper: { step: 0.06, max: 0.3 },
  /** 逐浪：被减速的怪 ×mul */
  water: { mul: 1.25 },
  /** 阵眼：站在自己的阵里本流派 ×mul */
  array: { mul: 1.15 },
  /** 舍身：血不过 hp（比例）时本流派 ×mul */
  ghost: { hp: 0.5, mul: 1.35 },
  /** 财运：捡一枚铜钱 +1 层（最多 max，每层 +step），keep 拍没捡清零 */
  wealth: { step: 0.03, max: 8, keep: 120 },
} as const;

/** 心法特色的名字和一句话（数字从 XINFA_FX 现算） */
export const XINFA_TEXT: Record<SchoolId, { name: string; text: string }> = {
  sword: { name: '剑意', text: `打 ${XINFA_FX.sword.near} 以内的怪 +${pct(XINFA_FX.sword.mul)}%` },
  talisman: { name: '符潮', text: `身边每 ${XINFA_FX.talisman.per} 只怪 +${pct(1 + XINFA_FX.talisman.step)}%，最多 +${pct(1 + XINFA_FX.talisman.step * XINFA_FX.talisman.max)}%` },
  ward: { name: '不动如山', text: `站定 ${XINFA_FX.ward.still / 30} 秒 +${pct(XINFA_FX.ward.mul)}%、挨打少 ${100 - Math.round(XINFA_FX.ward.hurt * 100)}%` },
  wood: { name: '雷动', text: `一直走，每 ${XINFA_FX.wood.every / 30} 秒 +${pct(1 + XINFA_FX.wood.step)}%，最多 +${pct(1 + XINFA_FX.wood.step * XINFA_FX.wood.max)}%，停下就散` },
  fire: { name: '燎原', text: '打倒的怪炸一圈火星' },
  paper: { name: '同袍', text: `每个纸兵挨打少 ${Math.round(XINFA_FX.paper.step * 100)}%，最多 ${Math.round(XINFA_FX.paper.max * 100)}%` },
  water: { name: '逐浪', text: `打被拖慢的怪 +${pct(XINFA_FX.water.mul)}%` },
  array: { name: '阵眼', text: `站在阵里 +${pct(XINFA_FX.array.mul)}%` },
  ghost: { name: '舍身', text: `血不过半 +${pct(XINFA_FX.ghost.mul)}%` },
  wealth: { name: '财运', text: `捡一枚铜钱 +${pct(1 + XINFA_FX.wealth.step)}%，最多 +${pct(1 + XINFA_FX.wealth.step * XINFA_FX.wealth.max)}%，${XINFA_FX.wealth.keep / 30} 秒没捡就散` },
};

function pct(mul: number): number {
  return Math.round((mul - 1) * 100);
}
