/**
 * 连战路线图用的地图小缩略（8 张图各一个小方块）：按图的底色（`tone`）取色，再加两三笔这张图的招牌地形。
 * 和选图页的 `drawMapThumb`（terrain.ts，按真实地形画大图）不同，这里只求小尺寸一眼分得出，不读地形数据。
 * 只在 DOM 里用，直接出 data URL，同一张图同一尺寸只画一次。
 */
import { MAPS, type MapId } from '../../content/maps.ts';
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';

const BASE = { snow: '#c6d6f0', yard: '#b9b3c4', bamboo: '#9fd08a', river: '#e2d2a0', ice: '#cfe4f4', temple: '#c4bccb', market: '#5a4a62', grave: '#8e8a74' } as const;
const cache = new Map<string, string>();

/** 32×32 的设计格里画两三笔地形 */
const MARKS: Record<MapId, (c: Ctx) => void> = {
  snow: (c) => {
    for (const [x, y, r] of [[9, 22, 6], [22, 12, 5], [20, 24, 4]] as const) dab(c, ellipse(x, y, r * 1.4, r * 0.7), '#ffffff', 0.9);
  },
  yizhuang: (c) => {
    blob(c, rrect(7, 10, 18, 14, 1.2), '#7a5a3a', '#4e3820', 1.6, 1.2);
    blob(c, poly(4, 11, 16, 3.5, 28, 11), '#b0402a', '#7a2616', 1.6, 1);
    dab(c, rrect(14, 17, 4, 7, 0.6), INK);
  },
  bamboo: (c) => {
    for (const x of [8, 15, 23]) {
      blob(c, rrect(x - 2, 4, 4, 24, 1.2), '#1f7a3a', '#145424', 1.4, 0.8);
      for (const y of [11, 19]) stroke(c, (k) => { k.moveTo(x - 2, y); k.lineTo(x + 2, y); }, 1.2, '#0e3a1a');
    }
  },
  riverbank: (c) => {
    stroke(c, (k) => { k.moveTo(-2, 10); k.quadraticCurveTo(12, 17, 20, 11); k.quadraticCurveTo(26, 8, 34, 14); }, 8, '#1f6fd0');
    stroke(c, (k) => { k.moveTo(-2, 10); k.quadraticCurveTo(12, 17, 20, 11); k.quadraticCurveTo(26, 8, 34, 14); }, 2, '#8ac4ff');
    blob(c, rrect(13, 8, 6, 12, 1), '#8d6038', '#5e3e20', 1.2, 0.8);
  },
  icelake: (c) => {
    blob(c, rrect(5, 8, 22, 17, 4), '#9ee0ff', '#5fb4e0', 1.6, 1.2);
    stroke(c, (k) => { k.moveTo(9, 13); k.lineTo(17, 13); k.moveTo(12, 18); k.lineTo(21, 18); }, 1.6, '#ffffff');
  },
  temple: (c) => {
    blob(c, rrect(10, 14, 12, 11, 1.4), '#c08a28', '#8a5e14', 1.6, 1.1);
    blob(c, poly(7, 15, 16, 7, 25, 15), '#6b4a30', '#4a321e', 1.6, 1);
    dab(c, ellipse(16, 8, 1.4, 3), '#ff9a2e');
  },
  guishi: (c) => {
    stroke(c, (k) => { k.moveTo(16, 0); k.lineTo(16, 32); }, 5, '#9a92a8');
    for (const [x, y] of [[6, 9], [24, 9], [6, 22], [24, 22]] as const) blob(c, rrect(x - 4, y - 3, 8, 6, 1), '#e0583e', '#a02a18', 1.4, 0.8);
    dab(c, circle(16, 16, 4), '#ffd75a');
  },
  luanzang: (c) => {
    for (const [x, y] of [[9, 20], [23, 22]] as const) {
      blob(c, (k) => { k.moveTo(x - 6, y + 4); k.quadraticCurveTo(x, y - 8, x + 6, y + 4); }, '#4a3e30', '#2e261c', 1.6, 1);
    }
    dab(c, ellipse(18, 9, 2.2, 3.2), '#2fc08a', 0.95);
    dab(c, ellipse(10, 9, 1.6, 2.4), '#2fc08a', 0.8);
  },
};

/** 路线图上一条路的地图缩略（正方形，边长 px 像素，默认 64 够 44–56 CSS 像素的方块用） */
export function mapThumbUrl(map: MapId, px = 64): string {
  const key = `${map}@${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const c = cv.getContext('2d');
  if (!c) return '';
  c.scale(px / 32, px / 32);
  c.fillStyle = BASE[MAPS[map].tone ?? 'snow'];
  c.fillRect(0, 0, 32, 32);
  c.save();
  c.beginPath();
  c.rect(0, 0, 32, 32);
  c.clip();
  MARKS[map](c);
  c.restore();
  stroke(c, (k) => { k.rect(1, 1, 30, 30); }, 2, INK);
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
