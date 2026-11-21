/** 建 DOM 的小工具 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function button(cls: string, parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, parent, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/**
 * 按钮发请求时显示"加载中"（样式见 css/buttons.css 的 aria-busy）：禁用、转圈，请求回来（成功失败都算）再放开。
 * 转着的时候再点不会发第二次
 */
export async function busy(b: HTMLButtonElement, task: () => Promise<unknown>): Promise<void> {
  if (b.getAttribute('aria-busy') === 'true') return;
  b.disabled = true;
  b.setAttribute('aria-busy', 'true');
  try {
    await task();
  } finally {
    b.disabled = false;
    b.removeAttribute('aria-busy');
  }
}

export function clear(e: HTMLElement): void {
  e.replaceChildren();
}

/**
 * 把 box 的子节点换成 next 的子节点，按位置比，一模一样的（isEqualNode）留着原来的不动：牌桌每一步整块重画的地方（牌河、副露、别家手牌、名牌、中控盘）
 * 只换真变了的节点，没变的不重算样式、不重排版，正在放的动画也不断。isEqualNode 不比事件监听，只用在不挂监听的节点上
 */
export function sync(box: Element, next: Element): void {
  let cur = box.firstChild;
  for (const n of [...next.childNodes]) {
    if (cur?.isEqualNode(n)) {
      cur = cur.nextSibling;
      continue;
    }
    if (cur) {
      const after = cur.nextSibling;
      box.replaceChild(n, cur);
      cur = after;
    } else box.appendChild(n);
  }
  while (cur) {
    const after = cur.nextSibling;
    box.removeChild(cur);
    cur = after;
  }
}
