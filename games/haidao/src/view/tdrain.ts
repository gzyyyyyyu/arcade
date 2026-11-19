/**
 * 暴雨（规则版本 22，core/tdevent.ts 的 raining）：下雨的那一波全屏斜雨、天色压暗，进出各淡 0.6 秒。
 * 雨不画在 Phaser 画布里：压暗的底色和雨丝烘成一张 256×256 的图，铺在画布上面、界面下面的一个 DOM 层（`.hd-td-rain`），
 * 用 CSS 的 transform 动画往左下挪一格图的距离再循环——只走浏览器的合成器，不重画画布。画在画布里（整屏 TileSprite）时，
 * 手机降速量帧率比 0.46.0 少一成到两成：软件渲染下多铺一整屏按像素算，和雨丝画几道无关（DESIGN 10.6g）。
 * 减弱动态效果时雨不动（CSS 里 prefers-reduced-motion 停掉动画）。
 */
import type { TdScene } from './TdScene.ts';
import { raining } from '../core/index.ts';
import { el } from './ui.ts';

const TILE = 256;
/** 图里画几道雨丝 */
const RAIN_DROPS = 45;
/** 压暗：底色和不透明度（烘在图里） */
const DIM = 'rgba(29,42,60,0.22)';

let url: string | null = null;

/** 雨丝图（画面层，位置用固定的伪随机，每次看起来一样）；只烘一次 */
function rainUrl(): string {
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  if (!g) return '';
  g.fillStyle = DIM;
  g.fillRect(0, 0, TILE, TILE);
  g.lineCap = 'round';
  let seed = 7;
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < RAIN_DROPS; i++) {
    const x = rnd() * TILE;
    const y = rnd() * TILE;
    const len = 14 + rnd() * 14;
    g.strokeStyle = `rgba(214,232,255,${(0.35 + rnd() * 0.3).toFixed(2)})`;
    g.lineWidth = 1.2 + rnd() * 0.8;
    // 斜率 1/4 往左下落（和 CSS 的循环位移对齐）：接缝两边各画一遍，平铺时不断线
    for (const [ox, oy] of [[0, 0], [-TILE, 0], [0, -TILE], [-TILE, -TILE], [TILE, 0], [0, TILE]] as const) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox - len * 0.25, y + oy + len);
      g.stroke();
    }
  }
  url = c.toDataURL();
  return url;
}

/** 每帧：按规则状态开关雨层（淡入淡出交给 CSS）；没下过雨的局不建 */
export function syncRain(bs: TdScene): void {
  const on = raining(bs.s) && !bs.s.over;
  if (!bs.rain) {
    if (!on) return;
    // 插在界面最前面：盖住画布、压在顶栏底栏和面板下面
    const layer = el('div', 'hd-td-rain', undefined);
    el('i', '', undefined, layer).style.backgroundImage = `url(${rainUrl()})`;
    bs.ui.prepend(layer);
    bs.rain = layer;
  }
  if (bs.rain.classList.contains('on') !== on) bs.rain.classList.toggle('on', on);
}
