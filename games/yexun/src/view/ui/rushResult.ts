/**
 * 首领连战的结算（docs/design-play.md 2.5）：结算页（screens.ts 的 Result）是按守夜排的版，连战局在它画好以后换掉几处：
 * 标题写「天亮了」或「连战 N/11」，「撑了」那一格换成用时，再加一排这一局的 11 只首领（打倒的亮、没打到的灰，终局是夜漏君）；
 * 「级」那一格（连战等级不变）换成本机最好；带着的符印接在首领那排后面。铜钱照结算页原样（finish.ts 给 sources / coins）。
 * 只改结算面板里的几个节点，不改 Result 本身；找不到节点就什么也不做。
 */
import { ENEMY_BY_KIND } from '../../content/enemies.ts';
import { RUSH, RUSH_FOES, RUSH_RELICS, type RelicId } from '../../content/rush.ts';
import type { RushResult, RushRoute } from '../../core/rush.ts';
import { rushClock } from '../../online/rush.ts';
import './rushResult.css';

const FINAL_NAME = ENEMY_BY_KIND[RUSH.finalKind].name;

/** 这一局的 11 只按上场顺序 */
function foeNames(route: RushRoute): string[] {
  return [...route.foes.map((f) => RUSH_FOES[f].name), FINAL_NAME];
}

export function decorateRushResult(root: HTMLElement, route: RushRoute, r: RushResult, quit: boolean, best: string | null, relics: readonly RelicId[]): void {
  const panel = root.querySelector<HTMLElement>('.yx-result-panel');
  if (!panel) return;
  panel.classList.toggle('won', r.cleared);
  panel.classList.add('rush');
  const title = panel.querySelector<HTMLElement>('.yx-rhead .yx-brush');
  if (title) title.textContent = r.cleared ? '天亮了' : `连战 ${r.down}/${r.total}`;
  const names = foeNames(route);
  const time = panel.querySelector<HTMLElement>('.yx-rtime');
  if (time) {
    const label = time.querySelector('span');
    const big = time.querySelector('b');
    const small = time.querySelector('small');
    if (label) label.textContent = '用时';
    if (big) big.textContent = rushClock(r.ticks);
    // 没打完的那一关写这只还剩多少血（试玩 11-22：「最后一关打掉 82%」看不懂）
    const at = names[Math.min(r.down, names.length - 1)]!;
    const left = `${at}还剩 ${Math.max(1, Math.round((1 - r.progress) * 100))}% 血`;
    if (small) small.textContent = r.cleared ? `${r.total} 只全部打倒${r.hexes ? ` · 带咒 ${r.hexes} 条` : ''}` : quit ? `认输 · 打倒 ${r.down} 只` : `倒在第 ${r.down + 1} 关 · ${left}`;
    const row = document.createElement('div');
    row.className = 'yx-rushlist';
    names.forEach((n, i) => {
      const el = document.createElement('span');
      el.className = `${i < r.down ? 'down' : ''}${i === RUSH.stages ? ' final' : ''}`;
      el.textContent = n;
      row.append(el);
    });
    // 带着的符印接在首领后面（同一排折行，不多占一行高）
    for (const id of relics) {
      const el = document.createElement('span');
      el.className = 'relic';
      el.title = RUSH_RELICS[id].text;
      el.textContent = RUSH_RELICS[id].name;
      row.append(el);
    }
    time.after(row);
  }
  for (const cell of panel.querySelectorAll<HTMLElement>('.yx-rstats > div')) {
    const label = cell.querySelector('span');
    // 实盘连战不交榜、不记纪录（best 为 null），那一格照旧写级
    if (label?.textContent === '级' && best !== null) {
      label.textContent = '本机最好';
      const v = cell.querySelector('b');
      if (v) v.textContent = best;
    }
  }
  // 多了首领一排，左栏变高：和 Result.fit 同一套 .fit1–4 一级级收（rushResult.css 管连战这边收什么），之后 setNote 再收也接得上
  for (let k = 1; k <= 4 && panel.scrollHeight > panel.clientHeight + 1; k++) panel.classList.add(`fit${k}`);
}
