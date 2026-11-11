/** 牌桌上的临时节点和小动画（table.ts 拆分） */
import { chipPile, makeCard, setCard } from '../art.ts';
import type { Pt } from '../layout.ts';

export function place(e: HTMLElement, p: Pt): void {
  e.style.left = `${p.x}px`;
  e.style.top = `${p.y}px`;
}

export function chipNode(amount: number, cls = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = `fly-chips ${cls}`;
  d.innerHTML = chipPile(amount);
  return d;
}

export function backNode(cls: string): HTMLElement {
  const c = makeCard(`${cls} fly`);
  setCard(c, null);
  return c;
}

export function flipIn(c: HTMLElement, ms: number): void {
  c.animate([{ transform: 'translate(-50%, -50%) rotateY(180deg)' }, { transform: 'translate(-50%, -50%) rotateY(0deg)' }], {
    duration: ms,
    easing: 'ease-out',
  });
}

/** 转牌、河牌的慢翻：翻起来时放大一点、带一圈金光，落定后恢复；省内存、减少动态效果时退回普通翻牌 */
export function flipHot(c: HTMLElement, ms: number): void {
  if (document.documentElement.classList.contains('lowfx')) return flipIn(c, ms);
  const glow = 'drop-shadow(0 0 14px rgba(255, 214, 110, .95))';
  c.animate(
    [
      { transform: 'translate(-50%, -50%) rotateY(180deg) scale(1)', filter: 'none' },
      { transform: 'translate(-50%, -50%) rotateY(90deg) scale(1.3)', filter: glow, offset: 0.45 },
      { transform: 'translate(-50%, -50%) rotateY(0deg) scale(1.22)', filter: glow, offset: 0.75 },
      { transform: 'translate(-50%, -50%) rotateY(0deg) scale(1)', filter: 'none' },
    ],
    { duration: ms, easing: 'ease-out' },
  );
}

/** 池子收进筹码时鼓一下 */
export function bump(e: HTMLElement): void {
  e.animate([{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: 'translate(-50%, -50%) scale(1.12)' }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 300 });
}

/** 几个矩形的外框；一个都没有回 null */
export function union(rs: readonly DOMRect[]): DOMRect | null {
  if (!rs.length) return null;
  const l = Math.min(...rs.map((r) => r.left));
  const t = Math.min(...rs.map((r) => r.top));
  return new DOMRect(l, t, Math.max(...rs.map((r) => r.right)) - l, Math.max(...rs.map((r) => r.bottom)) - t);
}
