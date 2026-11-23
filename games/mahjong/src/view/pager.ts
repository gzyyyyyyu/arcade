import { button, el } from './dom.ts';

/**
 * 长内容按看得见的高度翻页（docs/ui.md 第 11 节：任何界面一屏放下，长列表翻页，不用滚动）。
 *
 * page 是弹窗或页面里定高的内容区（CSS 里 flex: 1、min-height: 0、overflow: hidden，见 css/rules.css 的 .paged）。
 * 先整个排出来量一遍：放得下就什么都不做；放不下就从上往下切成几页（表格切到行、列表切到项，标题不落在一页的最后），
 * 内容区的高度钉在最高那页（翻页时弹窗不忽大忽小），后面接一条"‹ 2 / 5 ›"。滚轮、PageUp / PageDown 也翻。
 * 尺寸变了（转屏、收放地址栏）整个重切，停在原来第一项所在的那页。
 */
export function paginate(page: HTMLElement, at = 0, split?: string): void {
  const old = PAGERS.get(page);
  old?.bar.remove();
  page.style.height = '';
  page.style.flex = '';
  page.style.minWidth = '';
  page.classList.add('paged');
  SPLIT.set(page, split);
  if (!LISTENING.has(page)) listen(page);
  for (const u of page.querySelectorAll<HTMLElement>('[data-pg-hidden]')) unhide(u);
  if (!page.clientHeight || page.scrollHeight <= page.clientHeight + 1) {
    PAGERS.delete(page);
    return;
  }
  // 翻页条先放上再量：它占掉的高度要从内容区里让出来，不然切好的页最后一行会被它挤掉一截
  const bar = el('div', 'pager');
  page.after(bar);
  const prev = button('chip pg-prev', bar, '‹', () => go(cur - 1));
  const label = el('span', 'pg-at', bar, '1 / 1');
  const next = button('chip pg-next', bar, '›', () => go(cur + 1));
  const max = page.clientHeight;
  // 宽度也钉住：弹窗按内容收宽，全部内容摆着时最宽，切开以后窄的那页（只有几行明细）会让弹窗缩一截，翻页时忽宽忽窄（立直结算）
  const wide = page.getBoundingClientRect().width / scaleOf(page);
  const units = unitsOf(page, max, split);
  const starts = cut(page, units);
  // 让出翻页条的高度以后其实一页就放得下（或者量的那一刻弹窗还在入场动画里，量出来偏矮）：不翻页，别留一条"1 / 1"
  if (starts.length <= 1) {
    bar.remove();
    PAGERS.delete(page);
    return;
  }
  page.style.minWidth = `${Math.ceil(wide)}px`;
  prev.setAttribute('aria-label', '上一页');
  next.setAttribute('aria-label', '下一页');
  let cur = 0;
  const go = (n: number): void => {
    cur = Math.max(0, Math.min(starts.length - 1, n));
    const from = starts[cur]!;
    const to = starts[cur + 1] ?? units.length;
    units.forEach((u, i) => (i >= from && i < to ? unhide(u) : hide(u)));
    // 里面一项都不剩的外层（表格、列表、小节）整个藏掉，不留空表头和边距
    for (const box of page.querySelectorAll<HTMLElement>('[data-pg-box]')) {
      const any = units.some((u, i) => i >= from && i < to && box.contains(u));
      any ? unhide(box) : hide(box);
    }
    label.textContent = `${cur + 1} / ${starts.length}`;
    prev.disabled = cur === 0;
    next.disabled = cur === starts.length - 1;
    state.first = from;
  };
  const state: Pager = {
    bar,
    first: 0,
    go: (d) => go(cur + d),
    show: (e) => {
      const i = units.findIndex((u) => u.contains(e));
      if (i >= 0) go(starts.findLastIndex((s) => s <= i));
    },
  };
  PAGERS.set(page, state);
  // 内容区高度钉在最高那页用到的高度（不是能给的最大高度）：翻页时弹窗不忽大忽小，矮的那页底下也不空出一大截
  const top = page.getBoundingClientRect().top;
  const k = scaleOf(page);
  let used = 0;
  starts.forEach((_, i) => {
    go(i);
    for (const u of units) if (!u.hidden) used = Math.max(used, (u.getBoundingClientRect().bottom - top) / k);
  });
  page.style.height = `${Math.min(max, Math.ceil(used) + 2)}px`;
  page.style.flex = 'none';
  go(Math.max(0, starts.findLastIndex((s) => s <= at)));
}

interface Pager {
  bar: HTMLElement;
  /** 当前页第一项的序号：重切以后回到这一项所在的页 */
  first: number;
  go(d: number): void;
  show(e: HTMLElement): void;
}

/** 翻到某个元素所在的那页（结算打开时翻到自己那一行）；不在翻页区里就什么都不做 */
export function pageTo(e: HTMLElement): void {
  const page = e.closest<HTMLElement>('.paged');
  if (page) PAGERS.get(page)?.show(e);
}
/** 一场打完的结算：名次、这一局的明细一块块小结都按行拆，第一页名次下面空着的地方接着摆明细（立直的明细和点数各包一层，也拆开） */
export const END_SPLIT = '.summary, .summary > .rows, .rc-main, .rc-side, .rc-side > .rows';

const PAGERS = new WeakMap<HTMLElement, Pager>();
const LISTENING = new WeakSet<HTMLElement>();
/** 重切时沿用调用方给的 split */
const SPLIT = new WeakMap<HTMLElement, string | undefined>();

const hide = (e: HTMLElement): void => {
  e.hidden = true;
  e.dataset.pgHidden = '';
};
const unhide = (e: HTMLElement): void => {
  e.hidden = false;
  delete e.dataset.pgHidden;
};

/**
 * 切的最小单位：本身放得下一页的块整块算一项；比一页还高的往里拆（表格拆到行、列表拆到项、小节拆到子块）。
 * split 选中的块（结算里的一块块小结）不管多高都拆开，前一页剩下的地方能接着摆它的头几行，不整块挪到下一页留一大截空
 */
function unitsOf(box: HTMLElement, max: number, split?: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (parent: HTMLElement): void => {
    for (const c of parent.children) {
      if (!(c instanceof HTMLElement) || c.classList.contains('pager')) continue;
      const kids = c instanceof HTMLTableElement ? [...c.rows].filter((r) => r.parentElement?.tagName !== 'THEAD') : [...c.children];
      if ((c.offsetHeight > max || (split && c.matches(split))) && kids.length > 1) {
        c.dataset.pgBox = '';
        if (c instanceof HTMLTableElement) {
          for (const r of kids) out.push(r as HTMLElement);
        } else walk(c);
      } else out.push(c);
    }
  };
  walk(box);
  return out;
}

/** 从上往下排：每页从 starts[i] 开始，第一项超出底边就换页；一页最后一项是标题就挪到下一页 */
function cut(page: HTMLElement, units: HTMLElement[]): number[] {
  const starts: number[] = [];
  let s = 0;
  while (s < units.length) {
    starts.push(s);
    units.forEach((u, i) => (i < s ? hide(u) : unhide(u)));
    const bottom = page.getBoundingClientRect().top + page.clientHeight * scaleOf(page);
    let e = s + 1;
    while (e < units.length && units[e]!.getBoundingClientRect().bottom <= bottom + 1) e++;
    if (e < units.length && e - 1 > s && /^H[1-6]$/.test(units[e - 1]!.tagName)) e--;
    s = e;
  }
  for (const u of units) unhide(u);
  return starts;
}

/** 舞台整个按比例缩放（view/viewport.ts）：屏幕上的矩形和 CSS 像素差一个倍数 */
function scaleOf(e: HTMLElement): number {
  return e.offsetHeight ? e.getBoundingClientRect().height / e.offsetHeight : 1;
}

/** 滚轮、PageUp / PageDown 翻页；尺寸变了重切。内容区离开页面后自己摘掉监听 */
function listen(page: HTMLElement): void {
  LISTENING.add(page);
  let wheelAt = 0;
  page.addEventListener(
    'wheel',
    (e) => {
      const p = PAGERS.get(page);
      if (!p) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) < 4 || performance.now() - wheelAt < 250) return;
      wheelAt = performance.now();
      p.go(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false },
  );
  const onKey = (e: KeyboardEvent): void => {
    if (!page.isConnected) return void document.removeEventListener('keydown', onKey);
    const p = PAGERS.get(page);
    if (!p || (e.key !== 'PageDown' && e.key !== 'PageUp')) return;
    e.preventDefault();
    p.go(e.key === 'PageDown' ? 1 : -1);
  };
  document.addEventListener('keydown', onKey);
  let timer = 0;
  const onResize = (): void => {
    if (!page.isConnected) return void window.removeEventListener('resize', onResize);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => page.isConnected && paginate(page, PAGERS.get(page)?.first ?? 0, SPLIT.get(page)), 150);
  };
  window.addEventListener('resize', onResize);
  // 标题字体晚到会把字撑高：到了再切一次
  void document.fonts?.ready.then(() => page.isConnected && paginate(page, PAGERS.get(page)?.first ?? 0, SPLIT.get(page)));
}
