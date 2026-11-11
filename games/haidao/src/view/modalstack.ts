/**
 * 弹窗栈的规矩（纯逻辑，不碰 DOM，tests/modal.test.ts 锁住；DOM 那一层是 ui.ts 的 openModal）：
 * - 同一时间只开一个：新弹窗打开时旧的先关；确认框这类 stack 弹窗可以叠在上面，但最多两层；
 * - Esc 只管最上面一层：可关的弹窗关掉，结算类（必须点按钮）等于点主按钮；
 * - 点遮罩：只有可关的弹窗会关，结算类不理。
 */
export interface ModalEntry {
  /** 可关：Esc 和点遮罩都走 esc()；不可关（结算类）：只有 Esc 走 esc()（= 主按钮），点遮罩不理 */
  closable: boolean;
  /** 叠在别的弹窗上（确认框），不关下面那个 */
  stack?: boolean;
  /** Esc（可关的还有点遮罩）做的事 */
  esc: () => void;
  /** 把这个弹窗从界面上拿掉 */
  close: () => void;
  /** 还在界面上吗（有些地方直接 mask.remove()，栈据此清理） */
  alive: () => boolean;
}

export class ModalStack {
  private items: ModalEntry[] = [];

  private prune(): void {
    this.items = this.items.filter((m) => m.alive());
  }

  open(m: ModalEntry): void {
    this.prune();
    if (m.stack) {
      while (this.items.length >= 2) this.items.shift()!.close();
    } else {
      for (const o of this.items) o.close();
      this.items = [];
    }
    this.items.push(m);
  }

  /** 有弹窗开着吗 */
  get isOpen(): boolean {
    this.prune();
    return this.items.length > 0;
  }

  get size(): number {
    this.prune();
    return this.items.length;
  }

  /** Esc：交给最上面一层；返回有没有弹窗接住 */
  escape(): boolean {
    this.prune();
    const top = this.items[this.items.length - 1];
    if (!top) return false;
    top.esc();
    return true;
  }

  /** 点了某个弹窗的遮罩（不是点在框里）：可关的才关，返回有没有处理 */
  maskClick(m: ModalEntry): boolean {
    this.prune();
    if (!m.closable || this.items[this.items.length - 1] !== m) return false;
    m.esc();
    return true;
  }
}
