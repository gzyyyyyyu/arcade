import { BUILDINGS } from '../content/index.ts';
import type { EscortDef, Placed, TdIslandLevel, TdLevel } from '../core/index.ts';
import { BEACH, ISLAND } from '../core/types.ts';
import { el } from './ui.ts';

const NS = 'http://www.w3.org/2000/svg';

/** 等距投影（和局内 iso.ts 同一个 2:1 菱形，只是不乘像素），这样小地图的东南西北和开打后的画面一致 */
const px = (x: number, y: number): [number, number] => [x - y, (x + y) / 2];
const diamond = (x: number, y: number, w: number, h = w): string =>
  [px(x, y), px(x + w, y), px(x + w, y + h), px(x, y + h)].map(([a, b]) => `${a},${b}`).join(' ');
const mid = (p: { x: number; y: number }): [number, number] => px(p.x + 0.5, p.y + 0.5);

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.appendChild(e);
  return e;
}

/** 小地图要画的东西：关卡（木台、登陆点）、岛上的墙 / 宝藏 / 主寨，护航关再加航线和隘口 */
interface IsleSpec {
  lv: Pick<TdLevel, 'name' | 'slots' | 'lanes' | 'tide' | 'water' | 'cliffs'>;
  layout: readonly Placed[];
  escort?: Pick<EscortDef, 'route' | 'gates'>;
}

/**
 * 一张关卡岛的小地图（SVG）：沙滩、岛、墙、宝藏、主寨、木台、登陆点，护航关加航线（起点、终点港口、隘口）。
 * 选关卡片的缩略图、护航选图页、驻守台选塔页共用；cls 定尺寸和图例，样式在 tdcss.ts 的 .hd-minimap。返回外框和 svg 根。
 */
export function islandMap(spec: IsleSpec, parent: HTMLElement, cls: string): { box: HTMLElement; root: SVGSVGElement } {
  const { lv, layout, escort } = spec;
  const box = el('div', `hd-minimap ${cls}`, undefined, parent);
  const lo = -BEACH;
  const hi = ISLAND + BEACH;
  const root = svg('svg', { viewBox: `${lo - hi - 1} ${lo - 1} ${(hi - lo) * 2 + 2} ${hi - lo + 2}`, role: 'img', 'aria-label': `${lv.name}的小地图` }, box);
  svg('polygon', { points: diamond(lo, lo, hi - lo), class: 'sand' }, root);
  svg('polygon', { points: diamond(0, 0, ISLAND), class: 'land' }, root);
  // 第四章的水面（水道、火口湖）：和海一个颜色，一眼看出哪里过不去
  for (const c of lv.water ?? []) svg('polygon', { points: diamond(c.x, c.y, 1), class: 'water' }, root);
  // 第五章的断崖：红褐色，崖上的高台另描一圈（和岛上的颜色一样）
  for (const c of lv.cliffs ?? []) svg('polygon', { points: diamond(c.x, c.y, 1), class: 'cliff' }, root);
  for (const s of lv.slots) if (s.high) svg('polygon', { points: diamond(s.x, s.y, 2), class: 'cliff' }, root);
  for (const b of layout) {
    if (b.kind !== 'wall' && b.kind !== 'treasure' && b.kind !== 'hq') continue;
    svg('polygon', { points: diamond(b.x, b.y, BUILDINGS[b.kind].size), class: b.kind }, root);
  }
  for (const s of lv.slots) svg('polygon', { points: diamond(s.x, s.y, 1), class: s.high ? 'pad high' : 'pad' }, root);
  if (escort && escort.route.length > 1) {
    svg('polyline', { points: escort.route.map((p) => mid(p).join(',')).join(' '), class: 'route' }, root);
    for (const g of escort.gates) {
      const p = escort.route[g];
      if (!p) continue;
      const [cx, cy] = mid(p);
      svg('circle', { cx, cy, r: 1.1, class: 'gate' }, root);
    }
    const [sx, sy] = mid(escort.route[0]!);
    svg('circle', { cx: sx, cy: sy, r: 1.3, class: 'start' }, root);
    const [ex, ey] = mid(escort.route[escort.route.length - 1]!);
    svg('circle', { cx: ex, cy: ey, r: 1.6, class: 'port' }, root);
  }
  for (const l of [...lv.lanes, ...(lv.tide ? [lv.tide.lane] : [])]) {
    const [cx, cy] = mid(l);
    svg('circle', { cx, cy, r: 1.3, class: 'lane' }, root);
  }
  return { box, root };
}

/** 图例的一项：类名对应 tdcss.ts 里 .hd-minimap-legend 的色点 */
export function isleLegend(box: HTMLElement, items: ReadonlyArray<readonly [string, string]>): void {
  const legend = el('div', 'hd-minimap-legend', undefined, box);
  for (const [k, t] of items) el('span', `lg-${k}`, t, legend);
}

/**
 * 驻守台选塔页上的这一关小地图：在岛小地图上把驻守台按号标出来，当前挑的那座描亮。
 * 玩家挑塔时看得到「这座台在哪条路边」。点台子的号等于点它的页签（onSpot）。返回描亮第几座台的函数。
 */
export function garrisonMap(lv: TdIslandLevel, parent: HTMLElement, onSpot: (k: number) => void): (k: number) => void {
  const { box, root } = islandMap({ lv, layout: lv.layout }, parent, 'hd-tdgar-map');
  const marks = lv.garrison.map((g, k) => {
    const [cx, cy] = mid(g);
    const grp = svg('g', { class: 'spot', tabindex: -1 }, root);
    svg('circle', { cx, cy, r: 2.2 }, grp);
    // 字号是小地图自己的坐标单位（岛 22 格宽），写在 SVG 属性上，不进界面的 CSS 字号阶梯
    const t = svg('text', { x: cx, y: cy + 1.1, 'font-size': 3 }, grp);
    t.textContent = String(k + 1);
    grp.addEventListener('click', () => onSpot(k));
    return grp;
  });
  isleLegend(box, [['lane', '登陆点'], ['treasure', '宝藏'], ['spot', '驻守台']]);
  return (k) => marks.forEach((m, i) => m.classList.toggle('on', i === k));
}
