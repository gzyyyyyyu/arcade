/**
 * 主页面板（图鉴、藏宝阁、玩法说明、排行、回放列表）共用的弹窗关法（docs/ui.md 第 5 节）：
 * 右上角 ✕、点遮罩（面板外那层）、Esc 三种都能关；同时只开一个；打开时焦点进面板，关掉回到打开它的按钮。
 * 各面板自己的"返回"按钮和 hide()/onClose 照旧，这里只补齐上面这几条，免得每个面板各写一遍。
 */
import './modal.css';

interface Opened {
  root: HTMLElement;
  /** 玩家主动关（✕、遮罩、Esc）：面板自己的 onClose，会 hide 并回到上一屏 */
  close(): void;
  /** 被别的面板顶掉：只收起，不回上一屏 */
  hide(): void;
  opener: HTMLElement | null;
}

let current: Opened | null = null;
const wired = new WeakSet<HTMLElement>();
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
/** 面板里最后获得焦点的那个按钮是谁（data-a + data-t）：切标签会整块重画，旧按钮没了，靠它在新 DOM 里找回同一个 */
const lastKey = new WeakMap<HTMLElement, string>();

const keyOf = (el: Element): string | null => {
  const a = el.getAttribute('data-a');
  return a ? `[data-a="${a}"]${el.hasAttribute('data-t') ? `[data-t="${el.getAttribute('data-t')}"]` : ''}` : null;
};

const focusables = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent !== null || e === document.activeElement);

// 焦点陷阱（docs/ui.md 第 5 节）：面板开着时 Tab / Shift+Tab 在面板里转圈，不跑到底下被遮住的主页按钮上。
// 第一次开面板时才挂（openModal 里）：模块顶层碰 window 会让在 Node 里间接引到这个文件的单测直接报错
let trapOn = false;
const trapTab = (e: KeyboardEvent): void => {
  if (e.key !== 'Tab' || !current) return;
  const list = focusables(current.root);
  if (list.length === 0) return;
  const first = list[0]!;
  const last = list[list.length - 1]!;
  const at = document.activeElement as HTMLElement | null;
  if (!at || !current.root.contains(at)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && at === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && at === last) {
    e.preventDefault();
    first.focus();
  }
};

/** 面板每次重画（innerHTML / replaceChildren）后调一次：补回右上角 ✕，焦点放回重画前的那个按钮。重复调用没有副作用 */
export function modalChrome(root: HTMLElement): void {
  const panel = root.querySelector<HTMLElement>(':scope > .yx-panel');
  if (!panel) return;
  if (!panel.querySelector(':scope > .yx-mx')) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'yx-mx';
    x.setAttribute('aria-label', '关闭');
    x.textContent = '✕';
    panel.prepend(x);
  }
  // 切标签重画以后旧按钮已经不在了，焦点掉到 body：按记下的 data-a / data-t 找回同一个按钮
  if (current?.root === root && !root.contains(document.activeElement)) {
    const k = lastKey.get(root);
    const back = (k && root.querySelector<HTMLElement>(k)) || null;
    back?.focus({ preventScroll: true });
  }
}

/** 面板显示时调（在 render 之后）。先关掉已开的别的面板 */
export function openModal(root: HTMLElement, close: () => void, hide: () => void): void {
  if (current && current.root !== root) {
    const old = current;
    current = null;
    old.hide();
  }
  const opener = current?.root === root ? current.opener : (document.activeElement as HTMLElement | null);
  current = { root, close, hide, opener };
  if (!trapOn) {
    trapOn = true;
    window.addEventListener('keydown', trapTab);
  }
  root.classList.add('yx-modal-root');
  if (!wired.has(root)) {
    wired.add(root);
    root.addEventListener('focusin', (e) => {
      const k = keyOf(e.target as Element);
      if (k) lastKey.set(root, k);
    });
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      // 点遮罩 = 点到根节点本身（面板里的点击 target 是面板内的元素）
      if ((t === root || t.closest('.yx-mx')) && current?.root === root) current.close();
    });
  }
  modalChrome(root);
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const panel = root.querySelector<HTMLElement>(':scope > .yx-panel') ?? root;
  if (panel === root || !panel.hasAttribute('tabindex')) panel.tabIndex = -1;
  // 面板刚从 display:none 出来，等到下一帧再抢焦点才有效
  requestAnimationFrame(() => {
    if (current?.root !== root) return;
    (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus({ preventScroll: true });
  });
}

/** 面板收起时调（hide 里）。焦点回到打开它的按钮；那个按钮可能在刚收起的上一屏里，等回上一屏显示完再还 */
export function closeModal(root: HTMLElement): void {
  if (current?.root !== root) return;
  const opener = current.opener;
  current = null;
  queueMicrotask(() => {
    if (current === null && opener && opener.isConnected) opener.focus({ preventScroll: true });
  });
}

/** Esc 用：有主页面板开着就关掉它并返回 true */
export function closeTopModal(): boolean {
  if (!current) return false;
  current.close();
  return true;
}

export function modalOpen(): boolean {
  return current !== null;
}
