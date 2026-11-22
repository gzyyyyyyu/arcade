import { useEffect, useRef, useState } from 'react';

/** 自动化浏览器（冒烟、截图）里动效一律关掉，断言和截图才稳定；styles.css 的"动效"段认 html.no-motion */
const webdriver = typeof navigator !== 'undefined' && navigator.webdriver === true;
if (webdriver && typeof document !== 'undefined') document.documentElement.classList.add('no-motion');

const DURATION = 600;

const reduced = () => webdriver || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/**
 * 数字变化时在 600ms 内滚到新值；第一个真值直接给（不从 0 数起）。value 是 null 表示还没读到（比如钱包还在路上），
 * 读到的第一个值不滚：不然每次打开页面顶栏筹码都从 0 滚一遍、每帧重画一次。减少动效、自动化浏览器下立刻到位
 */
export function useCountUp(value: number | null): number {
  const [shown, setShown] = useState(value ?? 0);
  const from = useRef(value);
  useEffect(() => {
    if (value === null || from.current === value) return;
    if (from.current === null || reduced()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const base: number = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - (1 - t) ** 3;
      const v = t >= 1 ? value : Math.round(base + (value - base) * eased);
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}
