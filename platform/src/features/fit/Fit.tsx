/**
 * 一屏放下（docs/ui.md 第 11 节）用的两个公共件：
 * - <Paged>：长列表（排行、流水、好友、游戏格子）按容器剩下的高度算一页放几条，放不下的翻页，不让页面滚；
 * - <PageTabs>：宽屏上几栏并排，窄屏或矮屏放不下时改成页签，一次只看一栏。
 * 容器的高度由外面的布局给（flex: 1; min-height: 0），这里只量、不定高。
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { pageCount, perPage } from './fit-logic.ts';
import './fit.css';

/**
 * 按高度分页的列表。grid 为真时按 CSS 网格排（列数由 CSS 定，这里数第一行有几个），否则一条一行。
 * 量法：先按估计的条数画出来，量第一条的高和行距算出一页能放几行；画完还溢出就再少一行（条目高矮不一时兜底）。
 * fixed：一页固定放几条，不量（电脑上大厅要一页放下全部游戏，由调用方给 Infinity）。
 * room：列表按内容高、不撑满时（排行榜满榜卡片也按内容高），量不出"还能放多高"，由调用方给出列表顶上往下能用的高度（含翻页条），
 * 窗口变了也重量；不给就量列表自己的高度。
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
}) {
  const box = useRef<HTMLDivElement>(null);
  const [per, setPer] = useState(fixed ?? 8);
  const [page, setPage] = useState(0);
  const cap = useRef({ key: '', max: Infinity });
  // 翻页条的高：没出现过时按触屏点按高度估（44），出现过就用量到的
  const barH = useRef(44);
  const tall = useRef({ key: '', h: 0 });
  const size = fixed ?? per;
  const pages = pageCount(items.length, size);
  const at = Math.min(page, pages - 1);
  // fixed = Infinity（一页放下全部）时 0 * Infinity 是 NaN，切不出东西，单独处理
  const shown = Number.isFinite(size) ? items.slice(at * size, at * size + size) : items;

  // 量：容器多高、一条多高、一行几个；尺寸变了（转屏、拉窗口、内容变高）重量
  useLayoutEffect(() => {
    if (fixed !== undefined) return;
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
      // 按"翻页条不在"时的整块高度算，翻页条在不在都得到同一个结果：一页放得下全部就不翻页，放不下再扣掉翻页条的高度。
      // 只按当下列表的高度算会来回跳：翻页条一出列表变矮、少放几条，一收列表变高、又放得下，iPad 上 React #185
      const bar = el.nextElementSibling as HTMLElement | null;
      const outerGap = parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0;
      if (bar) barH.current = bar.offsetHeight;
      const full = room ? room(el) : el.clientHeight + (bar ? bar.offsetHeight + outerGap : 0);
      // 同一尺寸下记住见过的最高一条：每页的条目高矮不一，按当页最高算会在两种条数之间来回跳（iPad 大厅 6↔4，React #185）
      // 键里带整块高度和条数：一页放得下时调用方可以把条目撑高填满（paged--one，排行总榜），换了条数或尺寸要重新量自然高度
      const tallKey = `${el.clientWidth}x${full}x${items.length}`;
      if (tall.current.key !== tallKey) tall.current = { key: tallKey, h: 0 };
      tall.current.h = Math.max(tall.current.h, tallest);
      tallest = tall.current.h;
      const step = grid ? Math.max(1, cols) : 1;
      const all = perPage(full, tallest, gap, step);
      const fit = all >= items.length ? all : perPage(full - barH.current - outerGap, tallest, gap, step);
      // 画出来还溢出（条目高矮不一）：记一个上限再少一行；容器尺寸变了上限作废，免得两种算法来回跳
      const key = `${el.clientWidth}x${full}`;
      if (cap.current.key !== key) cap.current = { key, max: Infinity };
      if (el.scrollHeight > el.clientHeight + 1) cap.current.max = Math.min(cap.current.max, per - step);
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
  }, [fixed, grid, items.length, per, room]);

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
          <button className="btn btn--small" type="button" disabled={at === 0} onClick={() => setPage(at - 1)} aria-label="上一页">
            ‹
          </button>
          <span className="paged__at" data-testid={testId ? `${testId}-at` : undefined}>
            {at + 1} / {pages}
          </span>
          <button className="btn btn--small" type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} aria-label="下一页">
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
