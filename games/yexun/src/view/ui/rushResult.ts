/**
 * 首领连战的结算（DESIGN.md 2.5）：结算页（screens.ts 的 Result）是按守夜排的版，连战局在它画好以后换掉几处：
 * 标题写"全清"或"连战 N/M"，"撑了"那一格换成用时，再加一排这一局的首领（打倒的亮、没打到的灰）。
 * 只改结算面板里的几个节点，不改 Result 本身；找不到节点就什么也不做。
 */
import { RUSH_NAMES } from '../../content/rush.ts';
import type { RushPlan, RushResult } from '../../core/index.ts';
import { rushClock } from '../../online/rush.ts';
import './rushResult.css';

export function decorateRushResult(root: HTMLElement, plan: RushPlan, r: RushResult, quit: boolean): void {
  const panel = root.querySelector<HTMLElement>('.yx-result-panel');
  if (!panel) return;
  panel.classList.toggle('won', r.cleared);
  panel.classList.add('rush');
  const title = panel.querySelector<HTMLElement>('.yx-rhead .yx-brush');
  if (title) title.textContent = r.cleared ? '全清' : `连战 ${r.down}/${r.total}`;
  const time = panel.querySelector<HTMLElement>('.yx-rtime');
  if (time) {
    const label = time.querySelector('span');
    const big = time.querySelector('b');
    const small = time.querySelector('small');
    if (label) label.textContent = '用时';
    if (big) big.textContent = rushClock(r.ticks);
    if (small) small.textContent = r.cleared ? `${r.total} 只首领全部伏诛` : quit ? `认输 · 打倒 ${r.down} 只` : `连战 ${r.down}/${r.total} · 还差 ${r.total - r.down} 只`;
    // 这一局的首领一排：按上场的顺序，打倒的亮着
    const kinds = plan.stages.flat();
    const row = document.createElement('div');
    row.className = 'yx-rushlist';
    kinds.forEach((k, i) => {
      const el = document.createElement('span');
      el.className = i < r.down ? 'down' : '';
      el.textContent = RUSH_NAMES[k] ?? k;
      row.append(el);
    });
    time.after(row);
  }
}
