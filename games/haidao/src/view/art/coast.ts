/** 海岸装饰件：礁石、浪花、浅滩斑块。画面层沿岛边撒一圈，打破菱形的直线边。锚点 = 中心。 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece } from './kit.ts';
import { ell, path, piece, pieceRaw, poly, uid } from './kit.ts';

export type CoastKind = 'reef' | 'wave' | 'shoal' | 'foamPatch' | 'spit' | 'swash' | 'glint' | 'fish' | 'cloud';

function make(kind: CoastKind): ArtPiece {
  switch (kind) {
    case 'reef': {
      let b = ell(0, 6, 36, 13, C.foam!, { sw: 0, op: 0.55 }) + ell(0, 5, 28, 9, C.shallowL!, { sw: 0, op: 0.6 });
      b += poly([[-22, 4], [-20, -6], [-10, -12], [-2, -6], [0, 4], [-10, 8]], '#8c949b', { sw: 2 });
      b += poly([[-20, -6], [-10, -12], [-2, -6], [-10, -3]], '#c2c8cd', { sw: 0 });
      b += poly([[4, 6], [6, -2], [14, -6], [22, 0], [20, 8], [10, 10]], '#7b838a', { sw: 2 });
      b += poly([[6, -2], [14, -6], [22, 0], [12, 1]], '#b4bbc1', { sw: 0 });
      b += path('M-30,10 q6,-4 12,0 t12,0 t12,0 t12,0', 'none', { stroke: '#fff', sw: 2, op: 0.9 });
      return piece('c.reef', 80, 44, 40, 26, b);
    }
    case 'wave': {
      const b =
        path('M-30,2 q8,-9 15,-2 t15,0 t15,0 t15,-2', 'none', { stroke: '#fff', sw: 3.2, op: 0.85 }) +
        path('M-22,9 q6,-6 12,-1 t12,0 t12,-1', 'none', { stroke: '#fff', sw: 2, op: 0.55 });
      return piece('c.wave', 72, 24, 36, 12, b);
    }
    case 'shoal': {
      const g = uid('sg');
      const b = `<defs><radialGradient id="${g}"><stop offset="0" stop-color="${C.shallowL}" stop-opacity="0.95"/><stop offset="0.7" stop-color="${C.shallow}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.shallow}" stop-opacity="0"/></radialGradient></defs>` + ell(0, 0, 52, 24, `url(#${g})`, { sw: 0 });
      return piece('c.shoal', 112, 56, 56, 28, b);
    }
    case 'spit': {
      // 沙嘴：一小片伸进浅滩的沙，带浅色边和泡沫
      const g = uid('sp');
      const b = `<defs><radialGradient id="${g}"><stop offset="0.6" stop-color="${C.shallowL}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.shallow}" stop-opacity="0"/></radialGradient></defs>` + ell(0, 2, 40, 17, `url(#${g})`, { sw: 0 }) +
        path('M-24,4 Q-14,-8 0,-6 Q16,-8 26,4 Q10,12 -6,10 Q-18,10 -24,4 Z', C.sand!, { sw: 1.6, stroke: '#c9a45a' }) + ell(-4, 0, 10, 3, C.sandL!, { sw: 0, op: 0.8 }) + ell(8, 4, 1.2, 0.8, C.sandD!, { sw: 0 }) +
        path('M-28,8 q8,-5 14,-1 t14,0 t14,-1 t10,-3', 'none', { stroke: '#fff', sw: 2.2, op: 0.85 });
      return piece('c.spit', 88, 44, 44, 24, b);
    }
    case 'swash': {
      // 浪舌：一条弯弯的白色浪带，里侧半透明，外沿细线；画面层让它沿岸慢慢推上来再退下去（动的是整张图的位移和透明度）
      const g = uid('sw');
      const b = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.7"/></linearGradient></defs>` +
        path('M-34,4 Q-18,-8 0,-6 Q18,-8 34,4 Q18,0 0,1 Q-18,0 -34,4 Z', `url(#${g})`, { sw: 0 }) + path('M-34,4 Q-18,-8 0,-6 Q18,-8 34,4', 'none', { stroke: '#fff', sw: 1.8, op: 0.9 });
      return piece('c.swash', 72, 20, 36, 12, b);
    }
    case 'glint': {
      // 波光：四角小星
      const b = poly([[0, -7], [1.3, -1.3], [7, 0], [1.3, 1.3], [0, 7], [-1.3, 1.3], [-7, 0], [-1.3, -1.3]], '#fff', { sw: 0, op: 0.95 }) + ell(0, 0, 2.2, 2.2, '#fff', { sw: 0, op: 0.5 });
      return piece('c.glint', 16, 16, 8, 8, b);
    }
    case 'fish': {
      // 鱼群：三条深色小鱼的剪影，隔着水看，半透明
      const one = (x: number, y: number, k: number): string => path(`M${x - 7 * k},${y} Q${x},${y - 3.4 * k} ${x + 6 * k},${y} Q${x},${y + 3.4 * k} ${x - 7 * k},${y} Z M${x - 6 * k},${y} L${x - 10.5 * k},${y - 3 * k} L${x - 10.5 * k},${y + 3 * k} Z`, '#14587a', { sw: 0, op: 0.5 });
      return piece('c.fish', 44, 22, 22, 11, one(2, -3, 1) + one(-9, 3, 0.85) + one(12, 5, 0.8));
    }
    case 'cloud': {
      // 云影：大块半透明的深蓝软斑，不分级（影子不该被调色）；画面层放大、很淡地慢慢飘过海面
      const g = uid('cl');
      const blob = (x: number, y: number, rx: number, ry: number): string => ell(x, y, rx, ry, `url(#${g})`, { sw: 0 });
      const b = `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#06233d" stop-opacity="0.9"/><stop offset="0.6" stop-color="#06233d" stop-opacity="0.5"/><stop offset="1" stop-color="#06233d" stop-opacity="0"/></radialGradient></defs>` +
        blob(0, 0, 150, 60) + blob(-90, 12, 90, 44) + blob(95, -8, 100, 46) + blob(20, 26, 110, 40);
      return pieceRaw('c.cloud', 400, 190, 200, 95, b);
    }
    default: {
      const b =
        ell(0, 0, 30, 11, '#fff', { sw: 0, op: 0.35 }) + ell(-4, -1, 18, 6, '#fff', { sw: 0, op: 0.5 }) +
        ell(10, 2, 4, 2, '#fff', { sw: 0, op: 0.8 }) + ell(-14, 1, 3, 1.6, '#fff', { sw: 0, op: 0.8 });
      return piece('c.foamPatch', 72, 30, 36, 15, b);
    }
  }
}

const cache = new Map<CoastKind, ArtPiece>();
export function coastArt(kind: CoastKind): ArtPiece {
  let a = cache.get(kind);
  if (!a) cache.set(kind, (a = make(kind)));
  return a;
}
