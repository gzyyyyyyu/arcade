/**
 * 弹窗：确认离开、补码、新手提示。同一时间只有一个。
 * 关闭：点遮罩（sticky 的不理）、Esc（没有 sticky 才关；带 cancel 的按钮即使 sticky 也认 Esc，等于点它）、按钮。
 * 键盘：Tab / Shift+Tab 在弹窗里循环；弹窗开着时按键不往下漏（牌桌的 F/C/R 在 window 上听，这里在它前面截掉）；
 * 关掉后焦点还给打开前那个元素。默认焦点：带 focus 的按钮 > 主按钮 > 第一个不危险的按钮（离桌确认默认落在"接着打"）。
 */
import { el } from './dom.ts';
import { chips } from './text.ts';
import { must } from '../must.ts';

export interface Choice {
  label: string;
  value: string;
  /** 主按钮（金色）：只给"最想让人点的那个"，危险的不要用 */
  primary?: boolean;
  /** 危险按钮（红色）：离桌、认输、放弃这类会丢东西的 */
  danger?: boolean;
  /** 取消类按钮：Esc 等于点它（sticky 的弹窗也认） */
  cancel?: boolean;
  /** 打开时焦点落在它上面（不写按上面的顺序挑） */
  focus?: boolean;
}

let open: { root: HTMLElement; done: (v: string | null) => void } | null = null;

export function closeDialog(): void {
  open?.done(null);
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export function dialog(parent: HTMLElement, title: string, body: string | HTMLElement, choices: Choice[], sticky = false): Promise<string | null> {
  closeDialog();
  // 先关旧的再记：旧的关掉时已经把焦点还回它的打开者了
  const opener = document.activeElement as HTMLElement | null;
  return new Promise((resolve) => {
    const mask = el('div', 'mask', parent);
    const box = el('div', 'dialog', mask);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
    box.tabIndex = -1;
    el('div', 'd-title', box, title);
    const b = el('div', 'd-body', box);
    if (typeof body === 'string') b.textContent = body;
    else b.appendChild(body);
    const row = el('div', 'd-buttons', box);
    const done = (v: string | null): void => {
      if (open?.root === mask) open = null;
      window.removeEventListener('keydown', onKey, true);
      mask.remove();
      document.body.classList.toggle('texas-dialog', open !== null);
      if (!open && opener && opener.isConnected) opener.focus();
      resolve(v);
    };
    const btns: HTMLButtonElement[] = [];
    for (const c of choices) {
      const btn = el('button', c.danger ? 'd-btn danger' : c.primary ? 'd-btn primary' : 'd-btn', row, c.label);
      btn.type = 'button';
      btn.addEventListener('click', () => done(c.value));
      btns.push(btn);
    }
    const onKey = (e: KeyboardEvent): void => {
      if (open?.root !== mask) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const i = choices.findIndex((c) => c.cancel);
        if (i >= 0) done(must(choices[i], 'choices[i]').value);
        else if (!sticky) done(null);
        return;
      }
      if (e.key === 'Tab') {
        const items = Array.from(mask.querySelectorAll<HTMLElement>(FOCUSABLE));
        e.stopPropagation();
        if (items.length === 0) return void e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const last = items.length - 1;
        // 在两头、或焦点已经跑到弹窗外：自己接管；中间的交给浏览器按顺序走
        if (e.shiftKey ? at <= 0 : at < 0 || at === last) {
          e.preventDefault();
          must(items[e.shiftKey ? last : 0], 'items[e.shiftKey ? last : 0]').focus();
        }
        return;
      }
      // 其他键：焦点在弹窗外（点了遮罩外的东西）也不让它漏到牌桌快捷键上
      if (!mask.contains(e.target as Node | null)) e.stopPropagation();
    };
    // 弹窗里的键（输入框打字、回车点按钮）到 mask 为止，不再冒泡到 window 上的牌桌快捷键
    mask.addEventListener('keydown', (e) => e.stopPropagation());
    window.addEventListener('keydown', onKey, true);
    mask.addEventListener('click', (e) => {
      if (e.target === mask && !sticky) done(null);
    });
    open = { root: mask, done };
    // 好友房的道具动画层（kit fun，挂在 body 上、压在整个牌桌上面）：弹窗开着时收起，不压确认框
    document.body.classList.add('texas-dialog');
    const first = btns[choices.findIndex((c) => c.focus)] ?? btns[choices.findIndex((c) => c.primary)] ?? btns[choices.findIndex((c) => !c.danger)] ?? btns[0];
    (first ?? box).focus();
  });
}

/** 补码：选补多少（默认补满），返回 null 是不补 */
export async function askTopUp(parent: HTMLElement, opts: { min: number; max: number; step: number; balance: number; busted: boolean }): Promise<number | null> {
  const wrap = document.createElement('div');
  wrap.className = 'topup';
  const line = el('div', 'topup-line', wrap);
  const slider = el('input', 'slider', line);
  slider.type = 'range';
  slider.min = String(opts.min);
  slider.max = String(opts.max);
  slider.step = String(opts.step);
  slider.value = String(opts.max);
  const amt = el('span', 'buy-amt', line, chips(opts.max));
  slider.addEventListener('input', () => {
    amt.textContent = chips(Number(slider.value));
  });
  el('div', 'topup-note', wrap, `钱包里还有 ${chips(opts.balance)}`);
  // 输光了的时候"不补"就是离桌结算：不让点到遮罩就走了，只认按钮
  const v = await dialog(
    parent,
    opts.busted ? '输光了' : '补码',
    wrap,
    [
      opts.busted ? { label: '离桌', value: 'no', danger: true } : { label: '算了', value: 'no', cancel: true },
      { label: '补上', value: 'yes', primary: true },
    ],
    opts.busted,
  );
  return v === 'yes' ? Number(slider.value) : null;
}
