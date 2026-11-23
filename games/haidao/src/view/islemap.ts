import { BUILDINGS, DEFENSE_KINDS } from '../content/index.ts';
import type { EscortDef, Placed, TdIslandLevel, TdLevel } from '../core/index.ts';
import { BEACH, ISLAND } from '../core/types.ts';
import { PALETTE as P } from './art/index.ts';
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
  /** 玩家的岛扩了几圈（islandExt）：岛面跟着画大 */
  ext?: number;
  /** 把防御塔也画成点（抢劫侦察用）；关卡图上塔由玩家自己摆，不画 */
  towers?: boolean;
}

let styled = false;
/** 小地图自己的样式：守岛选关、护航选图、抢劫对手卡都用，不靠哪个界面先注入。
 * 基础规则包 :where 降到最低权重：各界面的尺寸覆盖（.hd-tdgar-map 等）不管谁先注入都赢 */
function style(): void {
  if (styled) return;
  styled = true;
  const ink = P.ink!, gold = P.gold!, red = P.red!, redD = P.redD!;
  const st = el('style');
  st.textContent = `
.hd-ui :where(.hd-minimap) { display:flex; flex-direction:column; align-items:center; gap:2px; }
.hd-ui :where(.hd-minimap) svg { display:block; width:100%; height:auto; min-height:0; filter:drop-shadow(0 2px 0 rgba(20,60,80,.45)); }
.hd-ui :where(.hd-minimap) .sand { fill:#f1d89a; }
.hd-ui :where(.hd-minimap) .land { fill:#8cc56a; }
.hd-ui :where(.hd-minimap) .water { fill:#3fa0c4; }
.hd-ui :where(.hd-minimap) .cliff { fill:#a86a45; }
.hd-ui :where(.hd-minimap) .wall { fill:#6d5b4b; }
.hd-ui :where(.hd-minimap) .hq { fill:#a0603a; }
.hd-ui :where(.hd-minimap) .tower { fill:#c8423a; stroke:${ink}; stroke-width:.3; }
.hd-ui :where(.hd-minimap) .treasure { fill:${gold}; stroke:${ink}; stroke-width:.3; }
.hd-ui :where(.hd-minimap) .pad { fill:#c9a36b; }
.hd-ui :where(.hd-minimap) .pad.high { fill:#f3d19a; stroke:#5e321e; stroke-width:.25; }
.hd-ui :where(.hd-minimap) .lane { fill:${red}; stroke:#fff; stroke-width:.4; }
.hd-ui :where(.hd-minimap) .route { fill:none; stroke:#fff8e6; stroke-width:.9; stroke-dasharray:1.6 1; stroke-linecap:round; stroke-linejoin:round; }
.hd-ui :where(.hd-minimap) .gate { fill:${redD}; stroke:#fff; stroke-width:.4; }
.hd-ui :where(.hd-minimap) .start { fill:#fff8e6; stroke:${ink}; stroke-width:.4; }
.hd-ui :where(.hd-minimap) .port { fill:${gold}; stroke:${ink}; stroke-width:.5; }
.hd-ui :where(.hd-minimap) .spot { cursor:pointer; }
.hd-ui :where(.hd-minimap) .spot circle { fill:#fff8e6; stroke:${ink}; stroke-width:.5; }
.hd-ui :where(.hd-minimap) .spot text { font-weight:900; text-anchor:middle; fill:${ink}; pointer-events:none; }
.hd-ui :where(.hd-minimap) .spot.on circle { fill:${gold}; stroke:#fff; stroke-width:.7; }
.hd-ui :where(.hd-minimap-legend) { display:flex; flex-wrap:wrap; justify-content:center; gap:2px 10px; font-size:12px; font-weight:800; color:#fff; text-shadow:0 1px 2px ${P.seaDark}; }
.hd-ui :where(.hd-minimap-legend) span::before { content:''; display:inline-block; width:10px; height:10px; margin-right:3px; border-radius:50%; border:1px solid ${ink}; vertical-align:-1px; }
.hd-ui :where(.hd-minimap-legend) .lg-lane::before { background:${red}; }
.hd-ui :where(.hd-minimap-legend) .lg-treasure::before { background:${gold}; border-radius:2px; }
.hd-ui :where(.hd-minimap-legend) .lg-spot::before { background:#fff8e6; }
.hd-ui :where(.hd-minimap-legend) .lg-start::before { background:#fff8e6; }
.hd-ui :where(.hd-minimap-legend) .lg-gate::before { background:${redD}; }
.hd-ui :where(.hd-minimap-legend) .lg-port::before { background:${gold}; }
`;
  document.head.appendChild(st);
}

/**
 * 一张关卡岛的小地图（SVG）：沙滩、岛、墙、宝藏、主寨、木台、登陆点，护航关加航线（起点、终点港口、隘口）。
 * 选关卡片的缩略图、护航选图页、驻守台选塔页共用；cls 定尺寸和图例，样式在 tdcss.ts 的 .hd-minimap。返回外框和 svg 根。
 */
export function islandMap(spec: IsleSpec, parent: HTMLElement, cls: string): { box: HTMLElement; root: SVGSVGElement } {
  style();
  const { lv, layout, escort, ext = 0 } = spec;
  const box = el('div', `hd-minimap ${cls}`, undefined, parent);
  const lo = -BEACH;
  const hi = ISLAND + BEACH;
  const root = svg('svg', { viewBox: `${lo - hi - 1} ${lo - 1} ${(hi - lo) * 2 + 2} ${hi - lo + 2}`, role: 'img', 'aria-label': `${lv.name}的小地图` }, box);
  svg('polygon', { points: diamond(lo, lo, hi - lo), class: 'sand' }, root);
  svg('polygon', { points: diamond(-ext, -ext, ISLAND + 2 * ext), class: 'land' }, root);
  // 第四章的水面（水道、火口湖）：和海一个颜色，一眼看出哪里过不去
  for (const c of lv.water ?? []) svg('polygon', { points: diamond(c.x, c.y, 1), class: 'water' }, root);
  // 第五章的断崖：红褐色，崖上的高台另描一圈（和岛上的颜色一样）
  for (const c of lv.cliffs ?? []) svg('polygon', { points: diamond(c.x, c.y, 1), class: 'cliff' }, root);
  for (const s of lv.slots) if (s.high) svg('polygon', { points: diamond(s.x, s.y, 2), class: 'cliff' }, root);
  for (const b of layout) {
    const tower = spec.towers && DEFENSE_KINDS.has(b.kind);
    if (!tower && b.kind !== 'wall' && b.kind !== 'treasure' && b.kind !== 'hq') continue;
    svg('polygon', { points: diamond(b.x, b.y, BUILDINGS[b.kind].size), class: tower ? 'tower' : b.kind }, root);
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
