import { esc, layer, onAction } from './shared.ts';

export class Confirm {
  private readonly root: HTMLDivElement;
  private cb: ((ok: boolean) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = layer(parent, 'yx-confirm');
    onAction(this.root, {
      yes: () => this.close(true),
      no: () => this.close(false),
    });
    // 点遮罩 = 取消，和其他面板一样；取消总是不丢进度的那边
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && this.open) this.close(false);
    });
  }

  get open(): boolean {
    return this.cb !== null;
  }

  /** danger：确认的是丢进度的动作（认输、离开），确认键用危险样式、回车默认落在"取消"上。
   *  不传就按确认键的字面猜（调用方在 main.ts，那边没传参数） */
  ask(text: string, yes: string, no: string, cb: (ok: boolean) => void, danger = /认输|离开|退出|放弃|回大厅|回菜单|不玩/.test(yes)): void {
    this.cb = cb;
    this.root.innerHTML = `<div class="yx-panel yx-confirm-panel" role="alertdialog" aria-label="${esc(text)}"><p>${esc(text)}</p><div class="yx-row2"><button type="button" class="yx-big ghost" data-a="no">${esc(no)}</button><button type="button" class="yx-big${danger ? ' ghost yx-danger' : ''}" data-a="yes">${esc(yes)}</button></div></div>`;
    this.root.style.display = '';
    // 回车触发的是焦点上的按钮：危险动作默认停在安全的那个，不危险的停在确认
    this.root.querySelector<HTMLElement>(danger ? '[data-a="no"]' : '[data-a="yes"]')?.focus({ preventScroll: true });
  }

  close(ok: boolean): void {
    const cb = this.cb;
    this.cb = null;
    this.root.style.display = 'none';
    cb?.(ok);
  }
}

// ───────────────────────── 结算 ─────────────────────────
