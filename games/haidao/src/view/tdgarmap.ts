import { BUILDINGS } from '../content/index.ts';
import type { TdIslandLevel } from '../core/index.ts';
import { BEACH, ISLAND } from '../core/types.ts';
import { el } from './ui.ts';

const NS = 'http://www.w3.org/2000/svg';

/** 等距投影（和局内 iso.ts 同一个 2:1 菱形，只是不乘像素），这样小地图的东南西北和开打后的画面一致 */
const px = (x: number, y: number): [number, number] => [x - y, (x + y) / 2];
const diamond = (x: number, y: number, w: number, h = w): string =>
  [px(x, y), px(x + w, y), px(x + w, y + h), px(x, y + h)].map(([a, b]) => `${a},${b}`).join(' ');

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

/**
 * 驻守台选塔页上的这一关小地图：沙滩、墙、宝藏箱、登陆点、木台，驻守台按号标出来，当前挑的那座描亮。
 * 玩家挑塔时看得到「这座台在哪条路边」。点台子的号等于点它的页签（onSpot）。返回描亮第几座台的函数。
 */
export function garrisonMap(lv: TdIslandLevel, parent: HTMLElement, onSpot: (k: number) => void): (k: number) => void {
  const box = el('div', 'hd-tdgar-map', undefined, parent);
  const lo = -BEACH;
  const hi = ISLAND + BEACH;
  const root = svg('svg', { viewBox: `${lo - hi - 1} ${lo - 1} ${(hi - lo) * 2 + 2} ${hi - lo + 2}`, role: 'img', 'aria-label': `${lv.name}的小地图` }, box);
  svg('polygon', { points: diamond(lo, lo, hi - lo), class: 'sand' }, root);
  svg('polygon', { points: diamond(0, 0, ISLAND), class: 'land' }, root);
  for (const b of lv.layout) {
    if (b.kind !== 'wall' && b.kind !== 'treasure' && b.kind !== 'hq') continue;
    svg('polygon', { points: diamond(b.x, b.y, BUILDINGS[b.kind].size), class: b.kind }, root);
  }
  for (const s of lv.slots) svg('polygon', { points: diamond(s.x, s.y, 1), class: 'pad' }, root);
  for (const l of [...lv.lanes, ...(lv.tide ? [lv.tide.lane] : [])]) {
    const [cx, cy] = px(l.x + 0.5, l.y + 0.5);
    svg('circle', { cx, cy, r: 1.3, class: 'lane' }, root);
  }
  const marks = lv.garrison.map((g, k) => {
    const [cx, cy] = px(g.x + 0.5, g.y + 0.5);
    const grp = svg('g', { class: 'spot', tabindex: -1 }, root);
    svg('circle', { cx, cy, r: 2.2 }, grp);
    // 字号是小地图自己的坐标单位（岛 22 格宽），写在 SVG 属性上，不进界面的 CSS 字号阶梯
    const t = svg('text', { x: cx, y: cy + 1.1, 'font-size': 3 }, grp);
    t.textContent = String(k + 1);
    grp.addEventListener('click', () => onSpot(k));
    return grp;
  });
  const legend = el('div', 'hd-tdgar-legend', undefined, box);
  el('span', 'lg-lane', '登陆点', legend);
  el('span', 'lg-treasure', '宝藏', legend);
  el('span', 'lg-spot', '驻守台', legend);
  return (k) => marks.forEach((m, i) => m.classList.toggle('on', i === k));
}
