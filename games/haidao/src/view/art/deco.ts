/** 岛上的地面装饰：灌木、花丛、石块、小路菱形。画面层往空草地上撒，让大片草地有细节。锚点 = 所在格中心。 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece } from './kit.ts';
import { ell, line, piece, poly, wrap, uid } from './kit.ts';

export type DecoKind = 'bush' | 'flowers' | 'stones' | 'path' | 'tuft';

function make(kind: DecoKind): ArtPiece {
  switch (kind) {
    case 'bush': {
      let b = ell(5, 4, 17, 6, '#0b2a1a', { sw: 0, op: 0.22 });
      b += ell(-7, -4, 9, 7.5, C.grassD!, { sw: 1.8 }) + ell(6, -5, 10, 8.5, C.grassD!, { sw: 1.8 }) + ell(0, -9, 9, 8, C.grass!, { sw: 1.8 });
      b += ell(-3, -12, 5, 3.4, C.grassL!, { sw: 0 }) + ell(5, -9, 3.4, 2.4, C.grassL!, { sw: 0 });
      b += ell(8, -6, 1.8, 1.8, '#ff5d73', { sw: 0 }) + ell(-8, -3, 1.8, 1.8, '#ffe14a', { sw: 0 });
      return piece('d.bush', 44, 36, 22, 28, b);
    }
    case 'flowers': {
      let b = '';
      const cols = ['#ff5d73', '#ffe14a', '#ffffff', '#c08bff'];
      const pos: Array<[number, number]> = [[-12, 2], [-3, -4], [8, 3], [14, -3], [1, 6]];
      pos.forEach(([x, y], i) => {
        b += line([x, y], [x, y + 6], C.grassDD!, 1.6) + ell(x - 2.2, y, 2.2, 2.2, cols[i % 4]!, { sw: 0.8 }) + ell(x + 2.2, y, 2.2, 2.2, cols[i % 4]!, { sw: 0.8 }) + ell(x, y - 2, 2.2, 2.2, cols[i % 4]!, { sw: 0.8 }) + ell(x, y, 1.4, 1.4, '#ffd23f', { sw: 0 });
      });
      return piece('d.flowers', 44, 28, 22, 14, b);
    }
    case 'stones': {
      let b = ell(2, 4, 14, 5, '#0b2a1a', { sw: 0, op: 0.2 });
      b += poly([[-12, 2], [-10, -5], [-3, -7], [1, 0], [-4, 4]], '#9aa2a9', { sw: 1.6 }) + poly([[2, 3], [4, -3], [11, -4], [14, 2], [8, 5]], '#8a929a', { sw: 1.6 }) + poly([[-10, -5], [-3, -7], [-5, -3]], '#c9cfd4', { sw: 0 });
      return piece('d.stones', 40, 24, 20, 14, b);
    }
    case 'tuft': {
      const b = poly([[-8, 2], [-6, -8], [-3, 0], [0, -11], [3, 0], [6, -8], [8, 2]], C.grassD!, { sw: 1.4 });
      return piece('d.tuft', 24, 20, 12, 14, b);
    }
    default: {
      // 小路：一格菱形，沙土色，带碎石
      const g = uid('pg');
      const b = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d792"/><stop offset="1" stop-color="#d7b46a"/></linearGradient></defs>` +
        poly([[0, -15.5], [31.5, 0], [0, 15.5], [-31.5, 0]], `url(#${g})`, { sw: 0 }) + ell(-8, 1, 1.6, 1, '#b99552', { sw: 0 }) + ell(10, -3, 1.4, 0.9, '#b99552', { sw: 0 }) + ell(2, 6, 1.2, 0.8, '#fff3c8', { sw: 0 });
      return { key: 'd.path', svg: wrap(64, 32, `<g transform="translate(32 16)">${b}</g>`), w: 64, h: 32, ax: 32, ay: 16 };
    }
  }
}

const cache = new Map<DecoKind, ArtPiece>();
export function decoArt(kind: DecoKind): ArtPiece {
  let a = cache.get(kind);
  if (!a) cache.set(kind, (a = make(kind)));
  return a;
}
