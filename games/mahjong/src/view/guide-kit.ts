/**
 * 规则小册子、新手引导共用的小工具：一手牌写成几组、画一排示意的小牌。各玩法的引导和规则页（view/variants/<id>/guide.ts）都用它，
 * 不依赖玩法登记（guide.ts 依赖登记，两边不能反过来互相引用）。
 */
import { el } from './dom.ts';
import { tileName, tileUrl } from './tiles.ts';

export type Tab = '怎么胡' | '番型' | '血战规矩' | '电脑公平吗' | '怎么和' | '役种' | '立直和振听' | '图鉴' | '成就' | '键盘';

/**
 * 牌的种类：0–8 一到九万，9–17 一到九筒，18–26 一到九条，27–33 东南西北白发中；加 100 是赤五。
 * 一手牌写成几组，组和组之间空开
 */
export type Groups = number[][];
export const W = (...n: number[]): number[] => n.map((x) => x - 1);
export const T = (...n: number[]): number[] => n.map((x) => x + 8);
export const S = (...n: number[]): number[] => n.map((x) => x + 17);
/** 字牌：1 东 2 南 3 西 4 北 5 白 6 发 7 中 */
export const Z = (...n: number[]): number[] => n.map((x) => x + 26);
export const RED5 = (suit: 'w' | 't' | 's'): number => (suit === 'w' ? 4 : suit === 't' ? 13 : 22) + 100;

/** 一排小牌（示意用，和结算里的小牌一样大），组与组之间留空 */
export function tilesRow(parent: HTMLElement, groups: Groups, cls = ''): void {
  const row = el('div', `ex ${cls}`, parent);
  for (const g of groups) {
    const box = el('span', 'group', row);
    for (const k of g) {
      const red = k >= 100;
      const kind = red ? k - 100 : k;
      const t = el('span', 'mini', box);
      t.style.backgroundImage = `url("${tileUrl(kind, red)}")`;
      t.title = tileName(kind, red);
    }
  }
}
