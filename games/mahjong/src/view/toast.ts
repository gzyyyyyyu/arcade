/**
 * 顶栏下居中的小提示（成就解锁、图鉴新收集共用）：贴在顶栏下面，一条一条排队，点击穿透，2.6 秒自己消失。
 * 样式在 achieve.css 的 .ach-toasts 下。
 */
import './achieve.css';
import { el } from './dom.ts';

/** 每条提示停多久（毫秒）、多条之间的空隙 */
const TOAST_MS = 2600;
const GAP_MS = 250;

/** 图鉴的小书本 */
export const BOOK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5c3-1 5.5-.8 8 .8v13.7c-2.5-1.6-5-1.8-8-.8z" fill="#f3e3b8" stroke="#a9741a" stroke-width="1.5" stroke-linejoin="round"/><path d="M20 4.500c-3-1-5.5-.8-8 .8v13.700c2.5-1.6 5-1.8 8-.8z" fill="#fff3d6" stroke="#a9741a" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.5 8.500c1.5-.3 3 0 4 .6M6.5 11.500c1.5-.3 3 0 4 .6M13.5 9.100c1-.6 2.5-.9 4-.6M13.5 12.100c1-.6 2.5-.9 4-.6" stroke="#a9741a" stroke-width="1" fill="none" stroke-linecap="round"/></svg>';

const queue: { icon: string; text: string }[] = [];
let showing = false;
let box: HTMLElement | null = null;

/** icon 是一段内联 SVG（程序自己写的，不是外部数据） */
export function showToast(icon: string, text: string): void {
  queue.push({ icon, text });
  if (!showing) next();
}

function next(): void {
  const item = queue.shift();
  if (item === undefined) {
    showing = false;
    return;
  }
  showing = true;
  box ??= el('div', 'ach-toasts', document.body);
  // 贴在顶栏下面：顶栏右边是"规则""离开"，盖上去虽然点得穿，看不见也不行
  const bar = document.querySelector('.topbar')?.getBoundingClientRect();
  if (bar && bar.height > 0) box.style.top = `${Math.round(bar.bottom + 8)}px`;
  const t = el('div', 'ach-toast', box);
  t.setAttribute('role', 'status');
  const icon = el('span', 'ach-medal', t);
  icon.innerHTML = item.icon;
  el('span', 'ach-t', t, item.text);
  dodgeBadges(box, t);
  window.setTimeout(() => {
    t.remove();
    window.setTimeout(next, GAP_MS);
  }, TOAST_MS);
}

/** 窄屏上居中的提示还会碰到左右两家的名牌：碰到就挪到名牌下面（名牌上的分数、缺门不能被挡） */
function dodgeBadges(box: HTMLElement, t: HTMLElement): void {
  const r = t.getBoundingClientRect();
  let below = 0;
  for (const e of document.querySelectorAll('.badge')) {
    const b = e.getBoundingClientRect();
    if (b.width && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) below = Math.max(below, b.bottom);
  }
  if (below) box.style.top = `${Math.round(below + 8)}px`;
}
