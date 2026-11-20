/**
 * 「改规则」面板里的各行：照玩法的规则表（game/rule-spec.ts）画，左边标签、右边几个互斥的小按钮，选中的后面补一句说明。
 * 血战、血流、三人两房、立直共用这一套；选了一项整块重画（连带改的别项、说明跟着变）。
 */
import { choose, chosen, editable, type RuleSpec } from '../game/rule-spec.ts';
import { button, el } from './dom.ts';

export function renderRules<O>(box: HTMLElement, spec: RuleSpec<O>, real: boolean, get: () => O, set: (o: O) => void): void {
  const paint = (): void => {
    box.replaceChildren();
    const o = get();
    for (const d of editable(spec, real)) {
      const row = el('div', 'opt', box);
      row.dataset.key = d.key;
      el('span', 'label', row, d.label);
      const on = chosen(d, o);
      for (const c of d.choices) {
        const b = button(`chip${c === on ? ' on' : ''}`, row, c.text, () => {
          set(choose(spec, get(), d.key, c.value));
          paint();
        });
        b.setAttribute('aria-pressed', String(c === on));
      }
      const hint = d.hint?.(o);
      if (hint) el('small', 'hint', row, hint);
    }
    if (spec.fixed) el('p', 'fixed', box, spec.fixed.note);
  };
  paint();
}
