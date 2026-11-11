/**
 * 选桌页"规则设置"里的一行：左边标签，右边几个互斥的小按钮（点了换选中的那个）。
 * 各玩法的规则设置（view/variants/<id>/page.ts 的 newLobbyRules）都用它。
 */
import { button, el } from './dom.ts';

export function ruleRow(more: HTMLElement, label: string, choices: [string, () => boolean, () => void][]): void {
  const r = el('div', 'opt', more);
  el('span', 'label', r, label);
  for (const [text, on, set] of choices) {
    const b = button(`chip${on() ? ' on' : ''}`, r, text, () => {
      set();
      for (const x of r.querySelectorAll('.chip')) x.classList.remove('on');
      b.classList.add('on');
    });
  }
}
