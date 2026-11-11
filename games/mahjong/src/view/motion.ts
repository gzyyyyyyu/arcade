/**
 * 换页动效：主页 → 选桌 → 牌桌 → 回来时，新页面淡入并上移一小段，不再是硬切。
 * 靠观察 .screen 的 class 变化：app/ 里每换一页就把 class 改成 `screen front|lobby|room|game`，
 * 种类变了才演一次（同一页重画，比如钱包刷新，不演）；第一次出现不演，免得首屏内容晚出来。
 * 只动 opacity 和 transform；样式在 motion.css。
 */
import './motion.css';

const KINDS = ['front', 'lobby', 'room', 'game'] as const;

/** class 字符串里是哪一页；不认识返回 null */
export function screenKind(cls: string): string | null {
  return cls.split(/\s+/).find((c) => (KINDS as readonly string[]).includes(c)) ?? null;
}

/** 换页要不要演：已经有上一页、且种类真的变了 */
export function shouldEnter(prev: string | null, next: string | null): boolean {
  return prev !== null && next !== null && prev !== next;
}

/** 动画时长（毫秒），和 motion.css 里 .screen.enter 一致；兜底定时器也用它 */
const ENTER_MS = 200;

export function watchScreen(screen: HTMLElement): void {
  let last = screenKind(screen.className);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  new MutationObserver(() => {
    const kind = screenKind(screen.className);
    if (kind === null) return;
    const go = shouldEnter(last, kind);
    last = kind;
    if (!go || calm.matches) return;
    screen.classList.add('enter');
    const done = (): void => screen.classList.remove('enter');
    screen.addEventListener('animationend', done, { once: true });
    window.setTimeout(done, ENTER_MS + 100);
  }).observe(screen, { attributes: true, attributeFilter: ['class'] });
}
