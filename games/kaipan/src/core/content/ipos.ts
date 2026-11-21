import type { StockDef } from '../types.ts';

/**
 * 打新的新股（docs/design-modes.md 第 18 节）：每个题材 2 只，全部化名。
 * 它们不在 STOCKS 里（开局登场、推荐、群聊、奖励都不碰），只在申购中签后才加进 s.stocks；
 * look 是画面借用形象的同题材内容股（`def.look ?? def.id`）。
 */
export const IPO_STOCKS: readonly StockDef[] = [
  { id: 'ipo_ai_1', name: '智算新贵', theme: 'ai', role: 'ipo', look: 'ai_follower' },
  { id: 'ipo_ai_2', name: '小模型大梦想', theme: 'ai', role: 'ipo', look: 'ai_follower2' },
  { id: 'ipo_ne_1', name: '储能新苗', theme: 'newenergy', role: 'ipo', look: 'ne_follower' },
  { id: 'ipo_ne_2', name: '氢动力宝', theme: 'newenergy', role: 'ipo', look: 'ne_follower2' },
  { id: 'ipo_con_1', name: '奶盖新锐', theme: 'consumer', role: 'ipo', look: 'con_follower' },
  { id: 'ipo_con_2', name: '零食小当家', theme: 'consumer', role: 'ipo', look: 'con_follower2' },
  { id: 'ipo_ph_1', name: '新药先锋', theme: 'pharma', role: 'ipo', look: 'ph_follower' },
  { id: 'ipo_ph_2', name: '养生小铺', theme: 'pharma', role: 'ipo', look: 'ph_blue' },
  { id: 'ipo_fin_1', name: '数字钱庄', theme: 'finance', role: 'ipo', look: 'fin_follower' },
  { id: 'ipo_fin_2', name: '互助小贷', theme: 'finance', role: 'ipo', look: 'fin_blue' },
  { id: 'ipo_la_1', name: '无人机新秀', theme: 'lowalt', role: 'ipo', look: 'la_follower' },
  { id: 'ipo_la_2', name: '云端货运', theme: 'lowalt', role: 'ipo', look: 'la_blue' },
  { id: 'ipo_gm_1', name: '手游新贵', theme: 'gaming', role: 'ipo', look: 'gm_follower' },
  { id: 'ipo_gm_2', name: '直播新秀', theme: 'gaming', role: 'ipo', look: 'gm_follower2' },
  { id: 'ipo_pig_1', name: '黑猪新贵', theme: 'pig', role: 'ipo', look: 'pig_follower' },
  { id: 'ipo_pig_2', name: '猪舍科技', theme: 'pig', role: 'ipo', look: 'pig_blue' },
];
