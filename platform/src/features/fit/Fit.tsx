/**
 * 一屏放下（docs/ui.md 第 11 节）用的两个公共件：
 * - <Paged>：长列表（排行、流水、好友、游戏格子）按容器剩下的高度算一页放几条，放不下的翻页，不让页面滚；
 * - <PageTabs>：宽屏上几栏并排，窄屏或矮屏放不下时改成页签，一次只看一栏。
 * 容器的高度由外面的布局给（flex: 1; min-height: 0），这里只量、不定高。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { packPages, pageCount, perPage } from './fit-logic.ts';
import './fit.css';

/**
 * 列表这一块能用多高（full）、翻页条要占掉多少（cost）。
 * 按"翻页条不在"时的整块高度算，翻页条在不在都得到同一个结果：一页放得下全部就不翻页，放不下再扣掉翻页条的高度。
 * 只按当下列表的高度算会来回跳：翻页条一出列表变矮、少放几条，一收列表变高、又放得下，iPad 上 React #185。
 * barCost 记上次量到的翻页条占高（在列表旁边时是 0），翻页条没出现过时按触屏点按高度 44 估。
 */
function space(el: HTMLElement, room: ((list: HTMLElement) => number) | undefined, barCost: { current: number | null }): { full: number; cost: number } {
  const bar = el.nextElementSibling as HTMLElement | null;
  const outerGap = parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0;
  if (bar) barCost.current = bar.getBoundingClientRect().top >= el.getBoundingClientRect().bottom - 1 ? bar.offsetHeight + outerGap : 0;
  const cost = barCost.current ?? 44 + outerGap;
  const full = room ? room(el) : el.clientHeight + (bar ? cost : 0);
  return { full, cost };
}

/**
 * 按高度分页的列表。grid 为真时按 CSS 网格排（列数由 CSS 定，这里数第一行有几个），否则一条一行。
 * 量法：先按估计的条数画出来，量第一条的高和行距算出一页能放几行；画完还溢出就再少一行（条目高矮不一时兜底）。
 * fixed：一页固定放几条，不量（电脑上大厅要一页放下全部游戏，由调用方给 Infinity）。
 * room：列表按内容高、不撑满时（排行榜满榜卡片也按内容高），量不出"还能放多高"，由调用方给出列表顶上往下能用的高度（含翻页条），
 * 窗口变了也重量；不给就量列表自己的高度。
 * uneven：条目高矮差得多（管理页邀请码：带长名字的用过码折三行）时按每条的实际高度装页，每页条数不同；
 * 默认按见过的最高一条算，一条高的就让每页都少放。只用于一条一行的列表，要量全部条目：宽度变了、条目变了（按 keyOf 的序列比，
 * 调用方每次渲染传新数组不算变）、当前页有条目变高变矮时，先整列画一帧再量。
 * 翻页条可以由调用方的 CSS 挪到列表旁边（好友页手机横屏挪到卡片头那一行）：量到它不在列表下面就不给它留高。
 */
export function Paged<T>({
  items,
  render,
  keyOf,
  className,
  grid = false,
  fixed,
  label = '翻页',
  testId,
  room,
  uneven = false,
}: {
  items: readonly T[];
  render: (item: T) => ReactNode;
  keyOf: (item: T) => string;
  className?: string;
  grid?: boolean;
  fixed?: number;
  label?: string;
  testId?: string;
  room?: (list: HTMLElement) => number;
  uneven?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [per, setPer] = useState(fixed ?? 8);
  // 记当前页第一条的下标而不是页号：每页条数会变（翻到一页高条目多的、转屏），按页号的话边界一挪，中间几条就翻不到了
  const [first, setFirst] = useState(0);
  const cap = useRef({ key: '', max: Infinity });
  // 翻页条占掉列表多少高（含间距）：没出现过时按触屏点按高度估（44 + 间距），出现过就用量到的；在列表旁边时是 0
  const barCost = useRef<number | null>(null);
  const tall = useRef({ key: '', full: 0, h: 0 });
  // uneven：每页第一条的下标，null = 还没量（这一帧整列画出来量每条的高）
  const [starts, setStarts] = useState<readonly number[] | null>(null);
  const heights = useRef<{ width: number; sig: string; h: number[] } | null>(null);
  // 条目序列：只在 uneven 时算，按 key 比，不按数组引用比（调用方每次渲染给新数组时按引用比会整列重量、来回循环）
  const sig = uneven ? items.map(keyOf).join('\n') : '';
  const size = fixed ?? per;
  let pages: number;
  let at: number;
  let shown: readonly T[];
  let startOf: (page: number) => number;
  if (uneven) {
    pages = starts ? starts.length : 1;
    at = starts ? starts.findLastIndex((s) => s <= first) : 0;
    shown = starts ? items.slice(starts[at], starts[at + 1] ?? items.length) : items;
    startOf = (p) => starts?.[p] ?? 0;
  } else {
    pages = pageCount(items.length, size);
    at = Number.isFinite(size) ? Math.min(Math.floor(first / size), pages - 1) : 0;
    // fixed = Infinity（一页放下全部）时 0 * Infinity 是 NaN，切不出东西，单独处理
    shown = Number.isFinite(size) ? items.slice(at * size, at * size + size) : items;
    startOf = (p) => p * size;
  }

  // 量：容器多高、一条多高、一行几个；尺寸变了（转屏、拉窗口、内容变高）重量
  useLayoutEffect(() => {
    if (fixed !== undefined || !uneven) return;
    const el = box.current;
    if (!el) return;
    const rows = () => [...el.children].map((c) => c.getBoundingClientRect().height);
    const measure = () => {
      const known = heights.current;
      // 当前页的条目和记下的高差半像素以上：内容变了（比如码被用掉、多一行"用："），整列重量
      const moved = starts !== null && known !== null && rows().some((h, i) => Math.abs(h - (known.h[starts[at]! + i] ?? h)) > 0.5);
      if (!known || known.width !== el.clientWidth || known.sig !== sig || moved) {
        if (starts !== null) return setStarts(null);
        heights.current = { width: el.clientWidth, sig, h: rows() };
      }
      const { full, cost } = space(el, room, barCost);
      const next = packPages(heights.current!.h, full, full - cost, parseFloat(getComputedStyle(el).rowGap) || 0);
      setStarts((prev) => (prev && prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // 条目变高变矮列表框不变，单看列表的 ResizeObserver 不响：当前页每一条也盯着
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [fixed, uneven, sig, starts, at, room]);

  useLayoutEffect(() => {
    if (fixed !== undefined || uneven) return;
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const style = getComputedStyle(el);
      const gap = parseFloat(style.rowGap) || 0;
      const top = first.offsetTop;
      let cols = 0;
      for (const c of el.children) if ((c as HTMLElement).offsetTop === top) cols++;
      let tallest = 0;
      for (const c of el.children) tallest = Math.max(tallest, (c as HTMLElement).offsetHeight);
      const { full, cost } = space(el, room, barCost);
      // 同一尺寸下记住见过的最高一条：每页的条目高矮不一，按当页最高算会在两种条数之间来回跳（iPad 大厅 6↔4，React #185）
      // 键里带宽度和条数、再比整块高度：一页放得下时调用方可以把条目撑高填满（paged--one，排行总榜），换了条数或尺寸要重新量自然高度。
      // 整块高度差 2px 以内算同一尺寸：有翻页条时按"列表 + 翻页条 + 间距"倒推，和没有时直接量的差 1px（亚像素取整），
      // 按严格相等比的话记忆每次都清空，只在某一页里的高条目时多时少，6↔4 条来回跳（管理页邀请码 1280×800，React #185）
      const tallKey = `${el.clientWidth}x${items.length}`;
      if (tall.current.key !== tallKey || Math.abs(tall.current.full - full) > 2) tall.current = { key: tallKey, full, h: 0 };
      tall.current.h = Math.max(tall.current.h, tallest);
      tallest = tall.current.h;
      const step = grid ? Math.max(1, cols) : 1;
      const all = perPage(full, tallest, gap, step);
      const fit = all >= items.length ? all : perPage(full - cost, tallest, gap, step);
      // 画出来还溢出（条目高矮不一）：记一个上限再少一行；容器尺寸变了上限作废，免得两种算法来回跳。
      // 尺寸刚变的这一次不记：眼下的条数是按旧尺寸算的，溢出是因为框变矮了（比如大厅的提示条晚到），不是条目高矮不一；
      // 原来这一下就把上限钉死，平板竖屏大厅放得下 6 张却只放 4 张
      const key = `${el.clientWidth}x${full}`;
      const sameSize = cap.current.key === key;
      if (!sameSize) cap.current = { key, max: Infinity };
      if (sameSize && el.scrollHeight > el.clientHeight + 1) cap.current.max = Math.min(cap.current.max, per - step);
      setPer(Math.max(step, Math.min(fit, cap.current.max)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // 按内容高的列表自己不变高，拉窗口时它的 ResizeObserver 不响，听窗口
    if (room) addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      removeEventListener('resize', measure);
    };
  }, [fixed, uneven, grid, items.length, per, room]);

  return (
    <div className={`paged${pages === 1 ? ' paged--one' : ''}${className ? ` ${className}` : ''}`} data-testid={testId}>
      <div className={`paged__list${grid ? ' paged__list--grid' : ''}`} ref={box}>
        {shown.map((it) => (
          <div className="paged__item" key={keyOf(it)}>
            {render(it)}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <nav className="paged__bar" aria-label={label}>
          <button className="btn btn--small" type="button" disabled={at === 0} onClick={() => setFirst(startOf(at - 1))} aria-label="上一页">
            ‹
          </button>
          <span className="paged__at" data-testid={testId ? `${testId}-at` : undefined}>
            {at + 1} / {pages}
          </span>
          <button className="btn btn--small" type="button" disabled={at >= pages - 1} onClick={() => setFirst(startOf(at + 1))} aria-label="下一页">
            ›
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * 几栏内容：宽屏（wide 媒体查询成立）并排全显示；否则顶上一排页签，一次显示一栏。
 * 页签选中哪个只在本页面内记，不进存储。
 */
export function PageTabs({ tabs, wide = '(min-width: 960px) and (min-height: 600px)', className, label = '切换' }: { tabs: readonly { id: string; name: string; body: ReactNode }[]; wide?: string; className?: string; label?: string }) {
  const [on, setOn] = useState(tabs[0]?.id ?? '');
  const isWide = useMedia(wide);
  const cur = tabs.some((t) => t.id === on) ? on : tabs[0]?.id;
  return (
    <div className={`ptabs${isWide ? ' ptabs--wide' : ''}${className ? ` ${className}` : ''}`}>
      {!isWide && (
        <div className="seg ptabs__bar" role="tablist" aria-label={label}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === cur} className={t.id === cur ? 'seg__on' : undefined} onClick={() => setOn(t.id)} data-testid={`ptab-${t.id}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="ptabs__panes">
        {tabs.map((t) =>
          isWide || t.id === cur ? (
            <div key={t.id} className="ptabs__pane" role={isWide ? undefined : 'tabpanel'}>
              {t.body}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function useMedia(query: string): boolean {
  const [hit, setHit] = useState(() => window.matchMedia(query).matches);
  useLayoutEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setHit(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return hit;
}
