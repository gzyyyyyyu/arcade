/**
 * 弹窗的纯逻辑（不碰 DOM，方便单测）：同一时间只开一个的栈、Tab 在弹窗里循环。
 * Modal.tsx 负责把它们接到真实元素上。
 */

/** 打开一个弹窗：先前开着的都要关掉（同时只开一个），返回新栈和需要被关的 id */
export function openInStack(stack: readonly string[], id: string): { stack: string[]; toClose: string[] } {
  return { stack: [id], toClose: stack.filter((s) => s !== id) };
}

/** 关掉一个弹窗，不在栈里就原样返回 */
export function closeInStack(stack: readonly string[], id: string): string[] {
  return stack.filter((s) => s !== id);
}

/** Esc 只给最上面的那个弹窗 */
export function isTop(stack: readonly string[], id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/**
 * Tab 键后焦点该去哪个可聚焦元素：count 个元素，current 是现在的下标（-1 = 焦点不在列表里），back = Shift+Tab。
 * 返回 null 表示没有可聚焦的元素（此时让焦点留在弹窗框上）。
 */
export function nextFocusIndex(count: number, current: number, back: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0) return back ? count - 1 : 0;
  return (current + (back ? -1 : 1) + count) % count;
}
