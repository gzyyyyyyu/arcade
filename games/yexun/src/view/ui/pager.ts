/**
 * 翻页（docs/ui.md 第 9、11 节：页面不滚，长列表翻页）：图鉴、成就、藏宝阁、玩法说明、排行、回放共用。
 * 做法：内容区是固定高度、overflow: hidden 的；把里面的"最小一块"（卡片、一行、一段）全摆出来量位置，
 * 按内容区的高度贪心切成几页，再把不在当前页的块藏起来。窗口大小变了自动重算，所以每页放几项是"按可用高度算"的，不写死。
 * 块之间有包着的外框（玩法说明的 section）时，这一页没有任何块的外框一起藏；外框自己的上下内边距靠"量一遍、超了就多留一点"补上。
 */

import './pager.css';

const OFF = 'yx-pg-off';

export interface PagerOptions {
  /** 固定高度、不滚动的内容区 */
  body: HTMLElement;
  /** 放"上一页 / 页码 / 下一页"的容器（只有一页时整个藏起来） */
  ctl: HTMLElement;
  /** 最小一块的选择器；嵌套时取最外层的 */
  leaves: string;
  /** 必须跟着后一块走的（小标题）：不会单独留在页底 */
  keep?: string;
  /** 每次分好页、翻页之后调（试炼页按看得见的卡读好友成绩） */
  onPage?: () => void;
}

export class Pager {
  page = 0;
  pages = 1;
  private readonly o: PagerOptions;
  private leafs: HTMLElement[] = [];
  private groups: HTMLElement[][] = [];
  private wrappers: { el: HTMLElement; inside: HTMLElement[] }[] = [];
  private readonly ro: ResizeObserver | null;
  private wheelAt = 0;
  private dead = false;

  constructor(o: PagerOptions) {
    this.o = o;
    o.ctl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pg]');
      if (!b || b.hasAttribute('disabled')) return;
      this.go(this.page + (b.dataset.pg === 'next' ? 1 : -1));
    });
    o.body.addEventListener(
      'wheel',
      (e) => {
        if (this.pages < 2 || Math.abs(e.deltaY) < 4) return;
        e.preventDefault();
        const now = performance.now();
        if (now - this.wheelAt < 280) return;
        this.wheelAt = now;
        this.go(this.page + (e.deltaY > 0 ? 1 : -1));
      },
      { passive: false },
    );
    this.ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.refresh());
    this.ro?.observe(o.body);
    this.refresh();
    void document.fonts?.ready.then(() => this.refresh());
  }

  destroy(): void {
    this.dead = true;
    this.ro?.disconnect();
  }

  go(n: number): void {
    this.page = Math.max(0, Math.min(this.pages - 1, n));
    this.apply();
  }

  /** 翻到含这个元素的那一页 */
  goTo(el: Element): void {
    const i = this.groups.findIndex((g) => g.some((l) => l === el || l.contains(el) || el.contains(l)));
    if (i >= 0) this.go(i);
  }

  /** 重新量、重新分页；保持在当前页（页数变少就夹到最后一页） */
  refresh(): void {
    if (this.dead) return;
    const { body, leaves } = this.o;
    for (const el of body.querySelectorAll(`.${OFF}`)) el.classList.remove(OFF);
    const H = body.clientHeight;
    const all = [...body.querySelectorAll<HTMLElement>(leaves)];
    this.leafs = all.filter((l) => !all.some((o) => o !== l && o.contains(l)));
    if (H <= 0 || this.leafs.length === 0) {
      this.groups = [this.leafs];
      this.pages = 1;
      this.wrappers = [];
      this.page = 0;
      this.paint();
      return;
    }
    const set = new Set(this.leafs);
    const wr = new Map<HTMLElement, HTMLElement[]>();
    for (const l of this.leafs) {
      for (let p = l.parentElement; p && p !== body; p = p.parentElement) {
        if (set.has(p)) break;
        const a = wr.get(p);
        if (a) a.push(l);
        else wr.set(p, [l]);
      }
    }
    this.wrappers = [...wr].map(([el, inside]) => ({ el, inside }));
    // 外框的上下内边距没算在块的位置里：切完试着摆一遍，哪页超了就多留出超的那部分再切
    let reserve = 0;
    for (let k = 0; k < 6; k++) {
      // 上一轮摆过某一页，有的块是藏着的：先全摆出来再量
      for (const el of body.querySelectorAll(`.${OFF}`)) el.classList.remove(OFF);
      this.groups = this.split(H - reserve);
      this.pages = this.groups.length;
      let over = 0;
      for (let i = 0; i < this.pages; i++) {
        this.show(i);
        over = Math.max(over, body.scrollHeight - body.clientHeight);
      }
      if (over <= 0) break;
      reserve += Math.max(over, 6);
    }
    this.page = Math.min(this.page, this.pages - 1);
    this.apply();
  }

  private split(H: number): HTMLElement[][] {
    const { keep } = this.o;
    const groups: HTMLElement[][] = [];
    let cur: HTMLElement[] = [];
    let start = 0;
    for (const l of this.leafs) {
      const r = l.getBoundingClientRect();
      if (cur.length === 0) start = r.top;
      if (cur.length > 0 && r.bottom - start > H + 0.5 && r.top > start + 0.5) {
        // 页底留着小标题不好看：标题连同后面一起挪到下一页
        const moved: HTMLElement[] = [];
        while (keep && cur.length > 1 && cur[cur.length - 1]!.matches(keep)) moved.unshift(cur.pop()!);
        groups.push(cur);
        cur = moved;
        start = (moved[0] ?? l).getBoundingClientRect().top;
      }
      cur.push(l);
    }
    if (cur.length) groups.push(cur);
    return groups;
  }

  /** 只摆第 i 页（量高度用） */
  private show(i: number): void {
    const on = new Set(this.groups[i]);
    for (const l of this.leafs) l.classList.toggle(OFF, !on.has(l));
    for (const w of this.wrappers) w.el.classList.toggle(OFF, !w.inside.some((l) => on.has(l)));
  }

  private apply(): void {
    this.show(this.page);
    this.paint();
  }

  private paint(): void {
    const { ctl } = this.o;
    this.o.onPage?.();
    ctl.hidden = this.pages <= 1;
    if (this.pages <= 1) return;
    ctl.innerHTML =
      `<button type="button" class="yx-pgbtn" data-pg="prev" aria-label="上一页"${this.page === 0 ? ' disabled' : ''}>‹<span class="yx-pgw"> 上一页</span></button>` +
      `<span class="yx-pgno">${this.page + 1} / ${this.pages}</span>` +
      `<button type="button" class="yx-pgbtn" data-pg="next" aria-label="下一页"${this.page >= this.pages - 1 ? ' disabled' : ''}><span class="yx-pgw">下一页 </span>›</button>`;
  }
}

/** 页脚里放翻页控件的位置（空的，Pager 往里填） */
export const PAGER_CTL = '<span class="yx-pager" hidden></span>';
