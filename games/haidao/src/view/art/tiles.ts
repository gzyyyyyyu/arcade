/** 地面菱形（64×32，可无缝拼）：草、深草、沙、浅滩、海。 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { ell, f, lighten, darken, line, path, poly, uid, wrap } from './kit.ts';

type TileKind = 'grass' | 'sand' | 'shallow' | 'sea' | 'grass2';

const DIAMOND: Pt[] = [[32, 0], [64, 16], [32, 32], [0, 16]];

function tuft(x: number, y: number, c: string): string {
  return path(`M${f(x - 3)},${f(y)} L${f(x - 2)},${f(y - 4)} L${f(x)},${f(y - 1)} L${f(x + 1)},${f(y - 5)} L${f(x + 3)},${f(y)} Z`, c, { sw: 0 });
}

export function tileArt(kind: TileKind): ArtPiece {
  const g = uid('tg');
  let base: string;
  let top: string;
  let det = '';
  switch (kind) {
    case 'grass':
      base = C.grass!; top = lighten(C.grass!, 0.1);
      det = tuft(18, 14, C.grassD!) + tuft(44, 20, C.grassD!) + tuft(34, 8, C.grassL!) + ell(26, 22, 1.6, 0.9, lighten(C.grass!, 0.4), { sw: 0 });
      break;
    case 'grass2':
      base = C.grassD!; top = C.grass!;
      det = tuft(22, 18, C.grassDD!) + tuft(40, 12, C.grassDD!) + tuft(30, 24, C.grass!) + ell(46, 17, 1.4, 0.8, C.grassL!, { sw: 0 }) + ell(14, 17, 1.3, 0.7, '#ffe27a', { sw: 0 });
      break;
    case 'sand':
      base = C.sand!; top = C.sandL!;
      det = ell(20, 14, 1.4, 0.8, C.sandD!, { sw: 0 }) + ell(42, 19, 1.2, 0.7, C.sandD!, { sw: 0 }) + ell(34, 10, 1, 0.6, C.sandD!, { sw: 0 }) + ell(28, 24, 1.1, 0.6, '#fff4cc', { sw: 0 });
      break;
    case 'shallow':
      base = C.shallow!; top = C.shallowL!;
      det = path('M14,16 q4,-2 8,0 t8,0', 'none', { stroke: '#e8fffa', sw: 1.2, op: 0.8 }) + path('M34,22 q4,-2 8,0 t8,0', 'none', { stroke: '#e8fffa', sw: 1.2, op: 0.7 });
      break;
    default:
      base = C.sea!; top = C.seaLight!;
      det = path('M12,14 q4,-3 8,0 t8,0', 'none', { stroke: C.seaLight!, sw: 1.4, op: 0.7 }) + path('M34,22 q4,-3 8,0 t8,0', 'none', { stroke: C.seaLight!, sw: 1.4, op: 0.6 });
  }
  const defs = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${darken(base, 0.06)}"/></linearGradient></defs>`;
  // 略放大 0.5 像素盖住拼缝
  const big: Pt[] = [[32, -0.5], [64.8, 16], [32, 32.5], [-0.8, 16]];
  const body = defs + poly(big, `url(#${g})`, { sw: 0 }) + det;
  void line;
  return { key: `t.${kind}`, svg: wrap(64, 32, body), w: 64, h: 32, ax: 32, ay: 16 };
}

export { DIAMOND };
