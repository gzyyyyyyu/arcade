/** 中文断行的规矩（不依赖 Phaser，单测直接测）：行首行尾的标点、段尾不留孤字。 */

/** 不能出现在行首的标点。 */
export const NO_LINE_START = new Set('，。、；：？！）》」』”’%,.;:?!)'.split(''));
/** 不能留在行尾的标点。 */
export const NO_LINE_END = new Set('（《「『“‘('.split(''));

/** 英文、数字、金额这类片段整体不拆 */
const ATOM_CHAR = /[A-Za-z0-9.¥+\-×%]/;

/**
 * 段落最后一行只剩一两个字（「条街。」「变）」）时，从上一行末尾挪几个字下来，让最后一行至少 4 个字。
 * 只挪中文字和标点（英文数字片段不拆）；挪完上一行只会变短、最后一行不到 8 个字，所以不用重新量宽度。
 */
export function avoidOrphan(prev: string, tail: string): [string, string] {
  const visible = (s: readonly string[]): number => s.filter((c) => !NO_LINE_START.has(c) && c.trim() !== '').length;
  const p = Array.from(prev);
  let t = Array.from(tail);
  if (visible(t) > 2 || p.length < 8) return [prev, tail];
  while (visible(t) < 4 && p.length > 6 && !ATOM_CHAR.test(p[p.length - 1] as string)) t = [p.pop() as string, ...t];
  // 挪完别让最后一行以标点开头、上一行以开括号结尾
  while (p.length > 6 && NO_LINE_START.has(t[0] as string)) t = [p.pop() as string, ...t];
  while (p.length > 6 && NO_LINE_END.has(p[p.length - 1] as string)) t = [p.pop() as string, ...t];
  return [p.join(''), t.join('')];
}
