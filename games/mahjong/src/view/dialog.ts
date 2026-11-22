/**
 * 弹窗：确认框、结算、规则。同一时间只有一个；打开时把 kit 的好玩图层藏起来（它在舞台外面，z-index 夹不到中间，见 kit README）。
 */
import { button, el } from './dom.ts';

let current: HTMLElement | null = null;
/** Esc 在当前弹窗上做什么：可关的弹窗就是关掉，确认框是"不"，必须点按钮的（结算、匹配中）为空，Esc 不管 */
let onEsc: (() => void) | null = null;
/** 当前弹窗真的关掉（不是换成下一个弹窗）时调一次 */
let onClose: (() => void) | null = null;
let hooks: { open(): void; close(): void } = { open() {}, close() {} };

export function dialogHooks(h: { open(): void; close(): void }): void {
  hooks = h;
}

/** 关闭动画的时长（毫秒），要和 motion.css 里 .mask.closing 的动画一致；兜底定时器也用它 */
const CLOSE_MS = 120;

/**
 * 关弹窗：current 马上清掉（调用方接着开新弹窗没问题），旧节点淡出后再摘。
 * 淡出期间摘掉 end / confirm 两个类：app/ 靠 `.mask.end` 判断"结算框还开着"，不能把正在淡出的算进去。
 * instant 用于直接换成另一个弹窗，不叠两层。
 */
export function closeDialog(): void {
  drop(false);
}

function drop(instant: boolean): void {
  if (!current) return;
  const old = current;
  current = null;
  if (instant) old.remove();
  else {
    old.classList.remove('end', 'confirm');
    old.classList.add('closing');
    old.addEventListener('animationend', () => old.remove(), { once: true });
    window.setTimeout(() => old.remove(), CLOSE_MS + 80);
  }
  onEsc = null;
  const closed = onClose;
  onClose = null;
  hooks.close();
  if (!instant) closed?.();
}

/** 开一个弹窗，内容由 fill 画；返回内容盒子 */
export function dialog(parent: HTMLElement, cls: string, fill: (box: HTMLElement) => void, closable = true, esc?: () => void, closed?: () => void): HTMLElement {
  // 被别的弹窗直接换掉也算关了（说明开着时点顶栏"规则"）；换成带同一个回调的（说明翻页）不算
  const prev = onClose;
  drop(true);
  const mask = el('div', `mask ${cls}`, parent);
  const box = el('div', 'dialog', mask);
  if (closable) {
    button('x', box, '×', closeDialog);
    mask.addEventListener('click', (e) => e.target === mask && closeDialog());
  }
  fill(box);
  current = mask;
  onClose = closed ?? null;
  onEsc = esc ?? (closable ? closeDialog : null);
  hooks.open();
  if (prev && prev !== closed) prev();
  return box;
}

/** Esc 统一在这里管（牌桌的键盘处理看到有弹窗就不动，所以不会一键两用） */
export function escAction(e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'repeat'>, handler: (() => void) | null): boolean {
  return e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && !!handler;
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (!current || !escAction(e, onEsc)) return;
    e.preventDefault();
    onEsc!();
  });
}

/**
 * 二选一确认框：按钮写动词。yes 是会丢东西的（离开、放弃）时 danger 为真，用红系危险色（docs/ui.md 第 2、5 节），
 * 焦点放在安全的 no 上，回车默认选它
 */
export function confirmBox(parent: HTMLElement, text: string, yes: string, no: string, danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    let escCancel = (): void => {};
    dialog(
      parent,
      'confirm',
      (box) => {
        el('p', '', box, text);
        const row = el('div', 'row', box);
        const cancel = (): void => {
          closeDialog();
          resolve(false);
        };
        const safe = button(danger ? 'act' : 'act soft', row, no, cancel);
        escCancel = cancel;
        button(danger ? 'act danger' : 'act go', row, yes, () => {
          closeDialog();
          resolve(true);
        });
        if (danger) safe.focus();
      },
      false,
      () => escCancel(),
    );
  });
}
