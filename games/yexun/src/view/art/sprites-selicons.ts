/**
 * 选模式页按钮上的小图标（程序画，32×32 的设计格，按需要的像素放大后转成图片地址，画一次就缓存）：
 * - 心法：十个流派各一个圆章（颜色跟着流派的主色走，图案是该流派的招牌：剑、符、钟、雷、火、纸人、水、阵旗、鬼火、铜钱），外加「不带」的空章；
 * - 实盘档位：一堆铜钱，档越大堆得越高、越多（小一摞矮的、中一摞高的、大两摞、豪华三摞带金光）。
 * 只在 DOM 界面里用（不进图集），所以直接出 data URL。
 */
import type { SchoolId } from '../../content/guide.ts';
import type { LiveTier } from '../../content/live.ts';
import { INK, blob, circle, dab, ellipse, poly, rrect, stroke, type Ctx } from './draw.ts';

/** 出图边长：按钮里最大 24 CSS 像素 × 放大到顶 1.6 × dpr 2 ≈ 77，取 80，大屏也不糊 */
const PX = 80;
const WHITE = '#f6f8ff';
const cache = new Map<string, string>();

function paint(key: string, draw: (c: Ctx) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = cv.height = PX;
  const c = cv.getContext('2d');
  if (!c) return '';
  c.scale(PX / 32, PX / 32);
  draw(c);
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** 圆章底：深色边 + 主色 + 一道高光（和技能按钮的圆章一个画法） */
function badge(c: Ctx, fill: string, shade: string): void {
  blob(c, circle(16, 16, 14), fill, shade, 2.4, 2);
  dab(c, ellipse(11, 8.5, 6, 2.4, -0.5), '#ffffff', 0.35);
}

const SCHOOL_ART: Record<SchoolId, (c: Ctx) => void> = {
  // 剑修：一把竖着的剑
  sword: (c) => {
    badge(c, '#3f8fd8', '#2a62a0');
    blob(c, poly(16, 4.5, 18.6, 8, 18.6, 20, 13.4, 20, 13.4, 8), '#eef2f8', '#aab4c2', 1.6, 1);
    blob(c, rrect(10, 19.5, 12, 3, 1.2), '#c9a24a', null, 1.4);
    blob(c, rrect(14.4, 22.5, 3.2, 5.5, 1), '#7a4818', null, 1.3);
  },
  // 符箓：一张黄符，朱砂一道
  talisman: (c) => {
    badge(c, '#8a5cc8', '#5e3a96');
    c.save();
    c.translate(16, 16);
    c.rotate(-0.18);
    blob(c, rrect(-5, -10.5, 10, 21, 1), '#f2d14a', '#d8b232', 1.6, 1);
    stroke(c, (k) => { k.moveTo(-2.4, -7); k.lineTo(2.4, -7); k.moveTo(0, -7); k.lineTo(0, 1); k.moveTo(-2.6, 3); k.quadraticCurveTo(0, 7, 2.6, 3); }, 1.3, '#c8402f');
    c.restore();
  },
  // 镇守：一口钟
  ward: (c) => {
    badge(c, '#e0a63a', '#b07a1e');
    blob(c, (k) => { k.moveTo(8.5, 22); k.quadraticCurveTo(8.5, 8, 16, 7.5); k.quadraticCurveTo(23.5, 8, 23.5, 22); }, '#fff0b8', '#e8c868', 1.8, 1.4);
    blob(c, rrect(7, 21, 18, 3.4, 1.4), '#8a5a1a', null, 1.5);
    blob(c, circle(16, 26.4, 1.9), '#8a5a1a', null, 1.2);
  },
  // 五雷：一道折线雷
  wood: (c) => {
    badge(c, '#4a56c8', '#2f3890');
    blob(c, poly(18.5, 4.5, 10, 17.5, 15.5, 17.5, 12.5, 27.5, 22.5, 13, 16.8, 13), '#ffe45a', '#e8b828', 1.6, 1);
  },
  // 烈火：一团火苗
  fire: (c) => {
    badge(c, '#e0603a', '#a83a1e');
    blob(c, (k) => { k.moveTo(16, 5); k.bezierCurveTo(24, 12, 25, 18, 22, 23); k.quadraticCurveTo(16, 29, 10, 23); k.bezierCurveTo(7, 18, 10, 13, 13, 11); k.quadraticCurveTo(13, 15, 15, 16); k.quadraticCurveTo(13, 10, 16, 5); }, '#ffb43a', '#f08a2a', 1.6, 1);
    dab(c, (k) => { k.moveTo(16, 15); k.quadraticCurveTo(20.5, 19, 18.8, 23); k.quadraticCurveTo(16, 25.6, 13.2, 23); k.quadraticCurveTo(12.5, 19.5, 16, 15); }, '#fff2a8');
  },
  // 纸兵：一个剪纸小人
  paper: (c) => {
    badge(c, '#d8503c', '#a02c1e');
    blob(c, circle(16, 10, 3.6), '#fbf5e4', null, 1.4);
    blob(c, poly(16, 13.2, 23.5, 17.5, 21.8, 19.4, 19, 18, 20.5, 26.5, 17.2, 26.5, 16, 21.5, 14.8, 26.5, 11.5, 26.5, 13, 18, 10.2, 19.4, 8.5, 17.5), '#fbf5e4', null, 1.4);
  },
  // 水府：一道浪
  water: (c) => {
    badge(c, '#2a9cc0', '#1a6e8a');
    blob(c, (k) => { k.moveTo(6, 22); k.quadraticCurveTo(8, 10, 17, 9); k.quadraticCurveTo(24, 9, 25, 15); k.quadraticCurveTo(20, 12.5, 18, 16.5); k.quadraticCurveTo(22, 17, 26, 22); k.closePath(); }, '#d8f4ff', '#9cd8f0', 1.6, 1);
    stroke(c, (k) => { k.moveTo(7, 25.5); k.quadraticCurveTo(11.5, 23, 16, 25.5); k.quadraticCurveTo(20.5, 28, 25, 25.5); }, 1.5, WHITE);
  },
  // 阵法：一面阵旗插在三点阵眼中间
  array: (c) => {
    badge(c, '#3a9a5a', '#246a3c');
    stroke(c, (k) => { k.moveTo(12, 6); k.lineTo(12, 25); }, 2.2, INK);
    stroke(c, (k) => { k.moveTo(12, 6); k.lineTo(12, 25); }, 1, '#e0b070');
    blob(c, poly(12.6, 6.5, 23.5, 9.5, 12.6, 14.5), '#f05a48', '#c83a2a', 1.4, 1);
    for (const [x, y] of [[7.5, 24.5], [16.5, 24.5], [22, 19]] as const) blob(c, circle(x, y, 1.8), '#fff2a8', null, 1);
  },
  // 幽冥：一团绿白鬼火
  ghost: (c) => {
    badge(c, '#5a3a7a', '#3a2252');
    blob(c, (k) => { k.moveTo(9, 25); k.quadraticCurveTo(8, 9, 16, 8); k.quadraticCurveTo(24, 9, 23, 25); k.lineTo(20.3, 22.5); k.lineTo(17.6, 25); k.lineTo(14.9, 22.5); k.lineTo(12.2, 25); k.closePath(); }, '#d8ffe8', '#9ce0bc', 1.6, 1);
    dab(c, circle(13.5, 15, 1.5), INK);
    dab(c, circle(18.5, 15, 1.5), INK);
  },
  // 聚财：一枚方孔铜钱
  wealth: (c) => {
    badge(c, '#c89a2a', '#8a6614');
    blob(c, circle(16, 16, 9), '#ffd75a', '#e0a82a', 1.8, 1.4);
    blob(c, rrect(13.2, 13.2, 5.6, 5.6, 0.6), '#8a6614', null, 1.4);
  },
};

/** 心法：流派的圆章 */
export const schoolIcon = (id: SchoolId): string => paint(`s.${id}`, SCHOOL_ART[id]);

/** 心法「不带」：浅色空章，中间一道斜杠 */
export const noSchoolIcon = (): string =>
  paint('s.none', (c) => {
    blob(c, circle(16, 16, 14), '#e6dcc0', '#cbbd98', 2.4, 2);
    stroke(c, (k) => { k.arc(16, 16, 7.5, 0, Math.PI * 2); }, 1.8, '#8a7a5a');
    stroke(c, (k) => { k.moveTo(10.8, 21.2); k.lineTo(21.2, 10.8); }, 1.8, '#8a7a5a');
  });

/** 一摞铜钱（x 是摞的中心，n 枚，从下往上叠） */
function pile(c: Ctx, x: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const y = 26 - i * 3.4;
    blob(c, ellipse(x, y, 5.6, 2.6), '#ffd75a', '#d89a24', 1.3, 0.9);
    if (i === n - 1) blob(c, rrect(x - 1.3, y - 0.9, 2.6, 1.8, 0.3), '#8a6614', null, 0.8);
  }
}

const TIER_ART: Record<LiveTier, (c: Ctx) => void> = {
  small: (c) => pile(c, 16, 2),
  medium: (c) => pile(c, 16, 5),
  large: (c) => {
    pile(c, 11, 4);
    pile(c, 21, 6);
  },
  luxe: (c) => {
    pile(c, 8, 4);
    pile(c, 24, 5);
    pile(c, 16, 7);
    for (const [x, y, r] of [[26.5, 6, 2.2], [5.5, 10, 1.6]] as const) {
      dab(c, poly(x, y - r * 2, x + r * 0.5, y - r * 0.5, x + r * 2, y, x + r * 0.5, y + r * 0.5, x, y + r * 2, x - r * 0.5, y + r * 0.5, x - r * 2, y, x - r * 0.5, y - r * 0.5), '#fff2a8');
    }
  },
};

/** 实盘档位：铜钱堆，堆越大档越大 */
export const tierIcon = (t: LiveTier): string => paint(`t.${t}`, TIER_ART[t]);
