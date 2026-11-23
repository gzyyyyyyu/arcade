/**
 * 首领连战的结算（DESIGN.md 2.5）：结算页（screens.ts 的 Result）是按守夜排的版，连战局在它画好以后换掉几处：
 * 标题写"全清"或"连战 N/M"，"撑了"那一格换成用时，再加一排这一局的首领（打倒的亮、没打到的灰）；
 * "级"那一格（连战等级不变）换成本机今天最好，铜钱那一格拿掉（连战不发铜钱）。
 * 只改结算面板里的几个节点，不改 Result 本身；找不到节点就什么也不做。
 */
import { ENEMY_BY_KIND } from '../../content/enemies.ts';
import type { RushPlan, RushResult } from '../../core/index.ts';
import { rushClock } from '../../online/rush.ts';
import { RUSH } from '../../content/rush.ts';
import './rushResult.css';

/** 没打完的那一关还剩多少血（试玩 11-22：「最后一关打掉 82%」看不懂）：写这一关还没倒的首领名 */
function stageLeft(plan: RushPlan, r: RushResult): string {
  let end = 0;
  for (const st of plan.stages) {
    end += st.length;
    if (end > r.down) break;
  }
  const names = plan.stages.flat().slice(r.down, end).map((k) => ENEMY_BY_KIND[k].name).join('、');
  return `${names}还剩 ${Math.max(1, Math.round((1 - r.progress) * 100))}% 血`;
}

export function decorateRushResult(root: HTMLElement, plan: RushPlan, r: RushResult, quit: boolean, best: string | null): void {
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
    if (small) small.textContent = r.cleared ? `精英和首领 ${r.total} 只全部伏诛` : quit ? `认输 · 打倒 ${r.down} 只` : `${r.ticks >= RUSH.limit ? '时间到' : '倒下了'} · 还差 ${r.total - r.down} 只，${stageLeft(plan, r)}`;
    // 这一局的首领一排：按上场的顺序，打倒的亮着
    const kinds = plan.stages.flat();
    const row = document.createElement('div');
    row.className = 'yx-rushlist';
    kinds.forEach((k, i) => {
      const el = document.createElement('span');
      el.className = i < r.down ? 'down' : '';
      el.textContent = ENEMY_BY_KIND[k].name;
      row.append(el);
    });
    time.after(row);
  }
  // 连战不发铜钱：结算页那一格局内铜钱不算数，拿掉免得像是拿到了
  for (const cell of panel.querySelectorAll<HTMLElement>('.yx-rstats > div')) {
    const label = cell.querySelector('span');
    if (label?.textContent === '铜钱') cell.remove();
    // 实盘连战不交榜，没有「今天最好」，那一格照旧写级
    else if (label?.textContent === '级' && best !== null) {
      label.textContent = '今天最好';
      const v = cell.querySelector('b');
      if (v) v.textContent = best;
    }
  }
}
