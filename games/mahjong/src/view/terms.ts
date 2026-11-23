/**
 * 结算页里的术语说明（docs/ui.md 文案一节）：术语是一个小按钮，点一下在原地展开一句大白话，再点收起。
 * 全模块只用这一个做法（不用悬停提示，手机上点不出来），两个玩法的结算共用。
 */
import { button, el } from './dom.ts';
import './ui-help.css';

/** 术语 → 一句大白话。写的是这个词在结算里的意思，不讲规则全貌 */
export const TERMS: Record<string, string> = {
  本场: '连庄或流局后加的“本场数”，每一本场让胡牌的人多收 300 点。',
  供托: '桌上没人拿走的立直棒（每根 1000 点），下一个胡牌的人全拿走。',
  跳满: '番数到 6–7 番的叫跳满，直接算 12000 点（庄家 18000）。',
  满贯: '番数够高（5 番，或符番折算后一样多）封顶的一档，8000 点（庄家 12000）。',
  倍满: '8–10 番的一档，16000 点（庄家 24000）。',
  三倍满: '11–12 番的一档，24000 点（庄家 36000）。',
  役满: '最大的一档，32000 点（庄家 48000），要凑齐特别稀有的牌型。',
  里宝指示: '立直胡牌后才翻开的指示牌，它的下一张牌就是里宝牌，手里每有一张多算 1 番。',
  宝牌指示: '翻开的指示牌，它的下一张牌就是宝牌，手里每有一张多算 1 番。',
  包牌: '有人打出让别人凑成役满的关键牌，这个人要替他付一部分点数。',
  不听罚符: '流局时没听牌的人要付、听牌的人来分，一共 3000 点。',
  流局满贯: '流局时自己打出的牌全是幺九牌且没被吃碰，按满贯算。',
  退杠分: '牌摸完时没听牌的人，这一局杠牌收来的分要退回给付的人（川麻叫「退税」）。',
  查花猪: '牌墙摸完时手里三种花色都有的人（没缺门），要赔给其他人。',
  查大叫: '牌墙摸完时没听牌的人，要赔给听牌的人。',
  呼叫转移: '杠了牌的人接着打出的牌被人胡了（点炮），这次杠收来的分转给胡的人。',
};

/** 写一个带说明的词；note 默认放在 parent 末尾，host 可以换成别的容器（比如标题下面） */
export function term(parent: HTMLElement, word: string, host: HTMLElement = parent): HTMLElement {
  const text = TERMS[word];
  if (!text) return el('span', '', parent, word);
  const b = button('term', parent, word, () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    note.hidden = !open;
  });
  b.setAttribute('aria-expanded', 'false');
  b.title = '点一下看说明';
  const note = el('span', 'term-note', host, `${word}：${text}`);
  note.hidden = true;
  return b;
}
