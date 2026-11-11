/**
 * 成就的界面（docs/features.md 13.9）：本机存取、图标（自己用 SVG 画，铜银金三档）、拿到时的小提示、大厅里的成就墙。
 * 提示贴在舞台右上角、不拦点击，不压底牌和操作按钮；规则在 src/achievements.ts。
 */
import { DEFS, PERSONA_NAMES, defOf, parseAch, progressOf, type AchState, type Def, type Glyph } from '../achievements.ts';
import { KEYS, readJson, writeJson } from '../store.ts';
import { dialog } from './dialog.ts';
import { el } from './dom.ts';
import { chips } from './text.ts';
import { must } from '../must.ts';

export const loadAch = (): AchState => parseAch(readJson<unknown>(KEYS.ach));
export const saveAch = (s: AchState): boolean => writeJson(KEYS.ach, s);

/** 48×48 的图案（中心 24,24），颜色跟着档位走（ach.css） */
const GLYPH: Record<Exclude<Glyph, 'face'>, string> = {
  star: '<polygon points="24,11 27.5,20.5 37.5,21 29.7,27.2 32.4,37 24,31.4 15.6,37 18.3,27.2 10.5,21 20.5,20.5"/>',
  cards: '<rect x="13" y="14" width="14" height="20" rx="2.5" transform="rotate(-12 20 24)"/><rect x="22" y="13" width="14" height="20" rx="2.5" transform="rotate(12 29 23)" class="ach-g2"/>',
  flame: '<path d="M24 10c2 6 9 9 9 17a9 9 0 0 1-18 0c0-4 2-6 4-8 0 3 1 4 3 5-1-5 0-9 2-14z"/>',
  crown: '<path d="M12 34l-2-17 8 7 6-10 6 10 8-7-2 17z"/>',
  trophy: '<path d="M17 12h14v8a7 7 0 0 1-14 0zM17 14h-5v3a5 5 0 0 0 5 5M31 14h5v3a5 5 0 0 1-5 5M22 27h4v5h5v3H17v-3h5z"/>',
  bolt: '<path d="M27 10 15 27h8l-2 11 12-17h-8z"/>',
  mask: '<path d="M11 17c4 3 9 3 13 0 4 3 9 3 13 0v9c0 6-6 11-13 11S11 32 11 26z"/><ellipse cx="18" cy="25" rx="3" ry="2" class="ach-g2"/><ellipse cx="30" cy="25" rx="3" ry="2" class="ach-g2"/>',
  rise: '<path d="M11 35l10-10 6 6 10-12" fill="none" class="ach-stroke"/><path d="M29 19h8v8z"/>',
};

/** 图标：外圈和底色看档位，没拿到的灰掉 */
export function icon(d: Def, got: boolean): string {
  const g = d.glyph === 'face' ? `<text x="24" y="31" text-anchor="middle" class="ach-t">${must(PERSONA_NAMES[d.persona ?? 0], 'PERSONA_NAMES[d.persona ?? 0]')[0]}</text>` : GLYPH[d.glyph];
  return `<svg class="ach-ico ${got ? `ach-${d.tier}` : 'ach-lock'}" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" class="ach-ring"/><circle cx="24" cy="24" r="17.5" class="ach-disc"/><g class="ach-glyph">${g}</g></svg>`;
}

/** 拿到成就的提示：右上角叠着，几秒后自己收；一手同时拿好几个就依次叠 */
export class AchToasts {
  private readonly box: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.box = el('div', 'ach-toast', parent);
    this.box.setAttribute('aria-live', 'polite');
  }

  show(ids: readonly string[]): void {
    for (const id of ids) {
      const d = defOf(id);
      if (!d) continue;
      const it = el('div', 'ach-item', this.box);
      it.dataset.ach = id;
      it.innerHTML = `${icon(d, true)}<span class="ach-txt"><small>成就解锁</small><b></b></span>`;
      must(it.querySelector('b'), 'it.querySelector(b)').textContent = d.name;
      window.setTimeout(() => it.classList.add('out'), 3_800);
      window.setTimeout(() => it.remove(), 4_200);
    }
    // 一次最多叠 4 个，多的把最早的挤掉
    while (this.box.children.length > 4) must(this.box.firstElementChild, 'this.box.firstElementChild').remove();
  }
}

/** 成就墙：已拿到的在前，没拿到的灰着、写怎么拿，计数类的写进度 */
export async function achPanel(parent: HTMLElement, s: AchState): Promise<void> {
  const body = el('div', 'ach-panel');
  const got = DEFS.filter((d) => s.got.includes(d.id)).length;
  el('div', 'ach-sum', body, `已解锁 ${got} / ${DEFS.length}`);
  const grid = el('div', 'ach-grid', body);
  const order = [...DEFS].sort((a, b) => Number(s.got.includes(b.id)) - Number(s.got.includes(a.id)));
  for (const d of order) {
    const has = s.got.includes(d.id);
    const cell = el('div', has ? 'ach-cell got nohow' : 'ach-cell', grid);
    cell.dataset.ach = d.id;
    cell.title = d.how;
    cell.innerHTML = icon(d, has);
    el('b', 'ach-name', cell, d.name);
    // 已拿到的不再写条件；没拿到的计数类写 现在/目标，其他写怎么拿
    const line = has ? '' : d.goal ? `${chips(Math.min(progressOf(s, d), d.goal))} / ${chips(d.goal)}` : d.how;
    if (line) {
      el('small', 'ach-how', cell, line);
      cell.classList.remove('nohow');
    }
  }
  // 翻页（docs/ui.md 第 11 节）：格子都留在页面里，只显示当前页；一页放几个按网格现在的行列数算，窗口变了重算
  const pager = el('div', 'ach-pager', body);
  const prev = el('button', 'ach-prev', pager, '上一页');
  const num = el('span', 'ach-page', pager);
  const next = el('button', 'ach-next', pager, '下一页');
  prev.type = 'button';
  next.type = 'button';
  const cells = [...grid.children] as HTMLElement[];
  let page = 0;
  let per = cells.length;
  const render = (): void => {
    const pages = Math.max(1, Math.ceil(cells.length / per));
    page = Math.min(page, pages - 1);
    cells.forEach((c, i) => (c.hidden = Math.floor(i / per) !== page));
    num.textContent = `${page + 1} / ${pages}`;
    pager.classList.toggle('single', pages === 1);
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
  };
  const measure = (): void => {
    const first = cells[0];
    if (!first || grid.clientHeight === 0) return;
    const cs = getComputedStyle(grid);
    const cols = Math.max(1, cs.gridTemplateColumns.split(' ').length);
    const gap = parseFloat(cs.rowGap) || 0;
    const rowH = parseFloat(cs.gridAutoRows) || 64;
    const rows = Math.max(1, Math.floor((grid.clientHeight + gap) / (rowH + gap)));
    const n = cols * rows;
    if (n !== per) {
      per = n;
      render();
    }
  };
  prev.addEventListener('click', () => {
    page -= 1;
    render();
  });
  next.addEventListener('click', () => {
    page += 1;
    render();
  });
  render();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(grid);
  await dialog(parent, '成就', body, [{ label: '关闭', value: 'ok', primary: true }]);
}
