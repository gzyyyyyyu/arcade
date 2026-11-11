import { onAction } from './shared.ts';

/** 第一局最多 3 条（DESIGN.md 13.7），每条带"不再提示"，点了以后整套引导都关掉 */
export class Tips {
  private readonly root: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onOff: () => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'yx-tip';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    onAction(this.root, {
      off: () => {
        this.hide();
        this.onOff();
      },
    });
  }

  show(html: string, ms: number): void {
    this.root.innerHTML = `<span>${html}</span><button type="button" data-a="off" aria-label="不再提示">不再提示</button>`;
    this.root.style.display = '';
    if (this.timer) clearTimeout(this.timer);
    this.timer = ms > 0 ? setTimeout(() => this.hide(), ms) : null;
  }

  hide(): void {
    this.root.style.display = 'none';
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
