/** 电脑键盘快捷键的纯逻辑：只判断"这次按键该做什么"，不碰 DOM，方便单测。 */

export type HotkeyAction =
  | { kind: 'game'; index: number }
  | { kind: 'go'; path: '/' | '/boards' | '/friends' | '/wallet' | '/me/stats' }
  | { kind: 'help' }
  | { kind: 'escape' };

export interface HotkeyKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
}

export interface HotkeyTarget {
  /** 焦点元素的标签名，大小写不限 */
  tag: string;
  /** 焦点元素是否 contenteditable */
  editable: boolean;
}

const GO: Record<string, '/' | '/boards' | '/friends' | '/wallet' | '/me/stats'> = {
  b: '/boards',
  f: '/friends',
  w: '/wallet',
  s: '/me/stats',
  h: '/',
};

export function actionFor(e: HotkeyKeyEvent, target: HotkeyTarget): HotkeyAction | null {
  // 带修饰键的留给浏览器和系统（Ctrl+F 查找、Ctrl+1 切标签页等），不抢
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // 打字时字母数字都是内容，只放行 Escape（用来退出输入框或关弹窗）
  const typing = target.editable || ['input', 'textarea', 'select'].includes(target.tag.toLowerCase());
  if (e.key === 'Escape') return { kind: 'escape' };
  if (typing) return null;
  if (e.key >= '1' && e.key <= '9' && e.key.length === 1) return { kind: 'game', index: Number(e.key) - 1 };
  if (e.key === '?') return { kind: 'help' };
  const path = GO[e.key.toLowerCase()];
  if (path && e.key.length === 1) return { kind: 'go', path };
  return null;
}

/** 帮助面板里显示的说明，和 actionFor 的规则保持一致 */
export const HOTKEY_HELP: readonly { keys: string; what: string }[] = [
  { keys: '1–9', what: '打开大厅里第几个游戏' },
  { keys: 'H', what: '回大厅' },
  { keys: 'B', what: '看排行榜' },
  { keys: 'F', what: '看好友' },
  { keys: 'W', what: '看钱包' },
  { keys: 'S', what: '看我的战绩' },
  { keys: '?', what: '打开或关闭这个说明' },
  { keys: 'Esc', what: '关闭弹窗，或退出输入框' },
];
