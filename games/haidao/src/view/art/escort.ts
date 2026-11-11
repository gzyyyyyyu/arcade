/**
 * 护航的素材：商船（侧视图的货船，船头朝右下，按等距斜切，带船尾浪）和速度钮、修船钮的线图标。
 * 全部程序生成；船锚点 = 水线上的船中心。
 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece } from './kit.ts';
import { darken, ell, line, path, piece, poly, rect } from './kit.ts';

const ISO = 'matrix(0.894 0.447 0 1 0 0)';

/** 商船：宽肚货船，两面帆、货箱、蓝旗；船尾带一道白浪 */
export function escortShipArt(): ArtPiece {
  let b = ell(4, 8, 58, 22, '#0b3a55', { sw: 0, op: 0.24 }) + ell(-2, 6, 50, 16, '#fff', { sw: 0, op: 0.3 });
  // 船尾浪：船尾（左上）拖出去的两道泡沫
  b += path('M-50,-8 q-10,-3 -20,2 M-48,2 q-12,0 -22,6', 'none', { stroke: C.foam!, sw: 3, op: 0.9 });
  let s = '';
  s += line([-4, -14], [-4, -62], '#2f1a0e', 5) + line([22, -12], [22, -50], '#2f1a0e', 4);
  const sail = (x: number, top: number, w: number, h: number): string =>
    path(`M${x},${top} L${x + w},${top + 3} Q${x + w + 7},${top + h * 0.5} ${x + w - 2},${top + h} L${x + 2},${top + h} Q${x - 6},${top + h * 0.5} ${x},${top} Z`, C.cream!, { sw: 2.2 }) +
    path(`M${x + w * 0.55},${top + 2} Q${x + w + 7},${top + h * 0.5} ${x + w - 2},${top + h} L${x + w * 0.5},${top + h} Z`, darken(C.cream!, 0.14), { sw: 0, op: 0.85 });
  s += sail(-20, -60, 32, 38) + sail(26, -48, 24, 28);
  s += path('M-4,-62 l14,3 l-14,6 z', C.blue!, { sw: 1.6 });
  s += path('M-44,-6 Q-40,16 -10,18 L28,16 Q46,10 52,-8 L-44,-6 Z', C.woodD!, { sw: 2.4 });
  s += path('M-46,-6 L52,-8 Q48,-14 40,-14 L-38,-13 Q-46,-12 -46,-6 Z', C.wood!, { sw: 2.2 });
  s += path('M-44,-4 L50,-6', 'none', { stroke: C.gold!, sw: 2.4 });
  s += rect(-34, -24, 16, 12, C.woodL!, { sw: 1.8 }) + rect(-16, -22, 14, 10, C.woodD!, { sw: 1.8 }) + rect(36, -22, 12, 10, C.woodL!, { sw: 1.8 });
  s += poly([[-34, -24], [-30, -28], [-14, -28], [-18, -24]], C.woodL!, { sw: 1.4 });
  s += line([-26, -24], [-26, -12], C.woodDD!, 1.2, 0.7);
  s += rect(-6, -26, 10, 12, C.red!, { sw: 1.6 });
  b += `<g transform="${ISO}">${s}</g>`;
  b += path('M-40,22 q6,-4 12,0 t12,0 M18,28 q6,-4 12,0 t12,0', 'none', { stroke: C.foam!, sw: 2, op: 0.9 });
  return piece('esc.ship', 170, 130, 84, 96, b);
}

const A = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
const SVGS: Record<'hold' | 'sail' | 'rush' | 'mend' | 'ship', string> = {
  // 停 = 锚
  hold: `<g ${A}><circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V20M7 11h10M4.5 14.5c.6 3.4 3.7 5.5 7.5 5.5s6.9-2.1 7.5-5.5"/></g>`,
  // 巡航 = 帆
  sail: `<g ${A}><path d="M12 3v15M12 4.5c4 1.6 6.5 5.6 6.5 11H12M10.5 8C8 9.5 6 12 5.5 15.5H10.5M4 19.5h16"/></g>`,
  // 冲 = 双箭头
  rush: `<g ${A}><path d="M4 6l7 6-7 6M12 6l7 6-7 6"/></g>`,
  // 修船 = 扳手
  mend: `<g ${A}><path d="M14.5 4.5a4.5 4.5 0 0 0-4 6.3L4 17.3 6.7 20l6.5-6.5a4.5 4.5 0 0 0 6.3-4l-3 3-2.7-.6-.6-2.7z"/></g>`,
  ship: `<g ${A}><path d="M3 15h18l-2.5 4H5.5zM12 3v12M12 4c3 1.4 5 4.4 5 8H12"/></g>`,
};

/** 线图标（currentColor），按钮里用 innerHTML 放进去：停 = 锚、巡航 = 帆、冲 = 双箭头、修船 = 扳手 */
export function escortIcon(kind: keyof typeof SVGS): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${SVGS[kind]}</svg>`;
}
