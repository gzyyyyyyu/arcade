/**
 * 各玩法通用的结算小块：好友房一场结束的颁奖、这一场的名场面（一局、一场的结算在 view/variants/<id>/summary.ts）。
 */
import type { Award } from '../game/awards.ts';
import type { Highlight } from '../game/banter.ts';
import { el } from './dom.ts';
import { AWARD_NAME, awardLine, HIGHLIGHT_NAME } from './text.ts';

/** 好友房一场结束的颁奖（game/awards.ts）：奖名、得奖的人大字，下面一句话 */
export function awardsSummary(list: readonly Award[], names: string[], unit: string): HTMLElement {
  const box = el('div', 'summary awards');
  el('h2', '', box, '颁奖');
  const row = el('div', 'award-row', box);
  for (const a of list) {
    const card = el('div', `award ${a.id}`, row);
    el('div', 'award-name', card, AWARD_NAME[a.id]);
    el('div', 'award-who', card, names[a.seat] ?? '');
    el('div', 'award-line', card, awardLine(a, names[a.seat] ?? '', unit));
  }
  return box;
}

/** 这一场的名场面（game/banter.ts 的 highlightsOf，从公开的胡牌里认出来的） */
export function fameSummary(list: readonly Highlight[], names: string[]): HTMLElement {
  const box = el('div', 'summary fame-list');
  el('h2', '', box, '名场面');
  for (const h of list.slice(-8)) el('div', 'flow', box, `第 ${h.round + 1} 局 · ${names[h.seat] ?? ''} ${HIGHLIGHT_NAME[h.id]}`);
  return box;
}
