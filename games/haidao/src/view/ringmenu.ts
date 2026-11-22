import { button, el } from './ui.ts';

/**
 * 点建筑弹出的"操作环"：几个圆钮围在建筑旁边，跟着建筑的屏幕位置走，靠边时整圈内收、不出可见区。
 * 布局是纯函数（ringLayout，tests/ringmenu.test.ts 锁住）；DOM 只在这里。
 */

interface RingRect { l: number; r: number; t: number; b: number }

/**
 * 圆钮直径（CSS 像素，≥ 44）、环半径。竖屏适配后岛变小，钮大了、贴近了会把建筑和邻居全盖住：
 * 钮取刚过 44 的 48，半径放到 88 让钮落在建筑外圈，底半透明（layout.ts）。
 */
export const RING_BTN = 48;
export const RING_RADIUS = 88;

/**
 * 锚点 (ax, ay) 是建筑中心的屏幕坐标，area 是可见区（扣掉顶栏、底栏）。
 * 返回环中心（被夹进可见区，使整圈钮都在里面）和 n 个钮相对中心的偏移；钮从正上方起顺时针均分。
 * 可见区太小放不下整圈时，环中心取可见区中点（钮会略超出，但不会比可见区更偏）。
 */
export function ringLayout(ax: number, ay: number, area: RingRect, n: number, radius = RING_RADIUS, btn = RING_BTN): { cx: number; cy: number; offs: Array<{ x: number; y: number }> } {
  const m = radius + btn / 2;
  const clamp = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const cx = clamp(ax, area.l + m, area.r - m);
  const cy = clamp(ay, area.t + m, area.b - m);
  const offs: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
    offs.push({ x: Math.round(Math.cos(a) * radius), y: Math.round(Math.sin(a) * radius) });
  }
  return { cx, cy, offs };
}

/** 圆（x、y、半径 r，和 ringLayout 同一坐标系）有没有被环上的哪颗按钮压住：被压住的收取气泡先藏起来 */
export function ringCovers(lay: { cx: number; cy: number; offs: Array<{ x: number; y: number }> }, x: number, y: number, r: number, btn = RING_BTN): boolean {
  return lay.offs.some((o) => Math.hypot(lay.cx + o.x - x, lay.cy + o.y - y) < btn / 2 + r);
}

export interface RingItem {
  /** 钮的 id（测试和引导用）：upgrade / info / collect / move */
  id: string;
  label: string;
  icon: string;
  /** 不可用（资源不够等）：灰着，点了走 onTap 给提示 */
  off?: boolean;
  /** 右上角小红点（比如"现在能升级"） */
  dot?: boolean;
  /** 灰着时钮下方的短原因（「差 3 星」「缺金币」）：手机没有悬停，不点就看不到为什么灰 */
  tag?: string;
  onTap: () => void;
}

const SVG = (body: string): string =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2b1a15" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** 钮上的小图标（线稿，和静音钮同一套画法） */
export const RING_ICON = {
  upgrade: SVG('<path d="M12 20V5M5 12l7-7 7 7" /><path d="M6 21h12"/>'),
  info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".6" fill="#2b1a15"/>'),
  collect: SVG('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8.5 12H15.5" />'),
  move: SVG('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
} as const;

export class RingMenu {
  private box: HTMLElement | null = null;
  private btns: HTMLButtonElement[] = [];
  private last = '';
  private lay: ReturnType<typeof ringLayout> | null = null;
  owner: number | null = null;

  private readonly parent: HTMLElement;
  private readonly areaOf: () => RingRect;

  constructor(parent: HTMLElement, areaOf: () => RingRect) {
    this.parent = parent;
    this.areaOf = areaOf;
  }

  get isOpen(): boolean {
    return this.box !== null;
  }

  /** 按钮元素（新手引导指它） */
  button(id: string): HTMLElement | null {
    return this.box?.querySelector<HTMLElement>(`[data-ring="${id}"]`) ?? null;
  }

  open(owner: number, items: RingItem[]): void {
    this.close();
    this.owner = owner;
    this.box = el('div', 'hd-rmenu', undefined, this.parent);
    this.btns = items.map((it) => {
      const b = button('', `hd-ringbtn ${it.id === 'upgrade' || it.id === 'collect' ? 'hd-btn-gold' : 'hd-btn-plain'}${it.off ? ' off' : ''}`, it.onTap, this.box!);
      b.dataset.ring = it.id;
      b.innerHTML = `${it.icon}<span>${it.label}</span>${it.dot ? '<i class="hd-dot"></i>' : ''}`;
      if (it.off && it.tag) el('small', 'hd-ringtag', it.tag, b);
      b.setAttribute('aria-label', it.label);
      return b;
    });
    this.last = '';
  }

  close(): void {
    this.box?.remove();
    this.box = null;
    this.btns = [];
    this.owner = null;
    this.lay = null;
  }

  /** 开着时，这个圆有没有被某颗按钮压住（没开、还没摆位置都算没压住） */
  covers(x: number, y: number, r: number): boolean {
    return this.lay !== null && ringCovers(this.lay, x, y, r);
  }

  /** 每帧调：anchor 是建筑中心的屏幕位置；位置没变就不写 DOM */
  follow(ax: number, ay: number): void {
    if (!this.box) return;
    const lay = ringLayout(ax, ay, this.areaOf(), this.btns.length);
    this.lay = lay;
    const sig = `${Math.round(lay.cx)},${Math.round(lay.cy)}`;
    if (sig === this.last) return;
    this.last = sig;
    this.btns.forEach((b, i) => {
      const o = lay.offs[i]!;
      b.style.left = `${Math.round(lay.cx + o.x - RING_BTN / 2)}px`;
      b.style.top = `${Math.round(lay.cy + o.y - RING_BTN / 2)}px`;
    });
  }
}
