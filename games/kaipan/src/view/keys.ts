/**
 * 「快捷键一览」的内容（H 或 ? 打开，见 meta/keysPanel.ts）。
 * 单独放一个纯数据文件：面板、「怎么玩」里的操作说明和单测都读同一份，键位改了只改这里。
 */

interface KeyRow {
  /** 一组键帽，同一行里是「或」的关系（空格、回车）；组合键写成一个元素（'Shift + 1–5'） */
  keys: readonly string[];
  /** 这些键干什么，一句话 */
  what: string;
}

export const KEY_ROWS: readonly KeyRow[] = [
  { keys: ['空格', '回车'], what: '开盘、跳过动画、继续；买卖菜单开着时，先收起菜单' },
  { keys: ['F'], what: '快进平淡日' },
  { keys: ['1', '2', '3'], what: '买第几条推荐；菜单、三选一里选第几项' },
  { keys: ['Shift + 数字'], what: '一步卖出对应那一格（全卖）' },
  { keys: ['← → ↑ ↓'], what: '在推荐卡、持仓卡、开盘键之间移动蓝框' },
  { keys: ['Tab', 'Shift + Tab'], what: '按顺序往后、往前移动蓝框' },
  { keys: ['回车', '空格'], what: '蓝框亮着时，按下蓝框上的那一个' },
  { keys: ['Esc'], what: '关掉菜单、弹窗，取消选格子，收起复盘' },
  { keys: ['右键'], what: '持仓卡上：打开加仓 / 卖出菜单；空白处：取消' },
  { keys: ['H', '?'], what: '打开这张快捷键一览' },
];

/** 面板上方的一句提醒：拖拽不是键盘操作，但同样是新手容易漏掉的 */
export const KEY_NOTE = '鼠标和手指还能拖：推荐卡拖进空格就买，持仓卡拖出持仓区就卖。';

/** 是不是「打开快捷键一览」的按键（H，或 Shift + / 即 ?）。 */
export function isKeysHelpKey(e: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.code === 'KeyH' || e.key === '?' || (e.code === 'Slash' && e.shiftKey);
}
