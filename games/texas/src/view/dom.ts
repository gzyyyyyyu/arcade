/** 小工具：建元素、量位置。画面都是固定节点，状态变了只改属性和文字（docs/screens.md 8.1，不引框架）。 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: Element, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** 改文字：一样就不动，免得无谓的重排 */
export function setText(e: Element, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/**
 * 顶栏的"在哪一桌"：长的一段（玩法、档位）加短的一段（盲注、第几级）。手机竖屏、横屏顶栏窄，样式里只留短的那段（style.css 的 .where .w-long）。
 * 两段都空就清空（.where:empty 收起）
 */
export function setWhere(e: Element, long: string, short: string): void {
  const text = long && short ? `${long} · ${short}` : long || short;
  if (e.textContent === text) return;
  e.replaceChildren();
  if (long) el('span', 'w-long', e as HTMLElement, short ? `${long} · ` : long);
  if (short) el('span', 'w-short', e as HTMLElement, short);
  toggle(e, 'split', !!short);
}

export function toggle(e: Element, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}
