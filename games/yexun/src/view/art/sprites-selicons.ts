/**
 * 选模式页按钮上的小图标（程序画，32×32 的设计格，按需要的像素放大后转成图片地址，画一次就缓存）：
 * - 心法：十个流派各一个圆章（颜色跟着流派的主色走，图案是该流派的招牌：剑、符、钟、雷、火、纸人、水、阵旗、鬼火、铜钱），外加「不带」的空章；
 * - 实盘档位：一堆铜钱，档越大堆得越高、越多（小一摞矮的、中一摞高的、大两摞、豪华三摞带金光）。
 * - 连战：驿站、精英、锁、放逐、纸钱和 12 个符印的图标（文件末尾的 rushIcon）。
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

/** 连战的小图标（驿站、精英、锁、重抽、放逐、纸钱，以及 12 个符印）；键名同 design 的 RelicId，给连战界面用 */
export type RushIconKey =
  | 'shop' | 'event' | 'rest' | 'elite' | 'lock' | 'reroll' | 'ban' | 'paper'
  | 'mirror' | 'lamp' | 'tube' | 'string' | 'charm' | 'boots' | 'ruler' | 'bowl' | 'thunder' | 'cloak' | 'gourd';

const GOLD = '#ffd75a';
const GOLD_SH = '#d89a24';
const BROWN = '#8a5a22';

const RUSH_ART: Record<RushIconKey, (c: Ctx) => void> = {
  // 商店：一只钱袋，口上一枚铜钱
  shop: (c) => {
    badge(c, '#e6a83a', '#b07818');
    blob(c, (k) => { k.moveTo(12, 11); k.lineTo(20, 11); k.quadraticCurveTo(26, 17, 24, 24); k.quadraticCurveTo(16, 27, 8, 24); k.quadraticCurveTo(6, 17, 12, 11); }, '#fff2d0', '#d8c08a', 1.8, 1.2);
    blob(c, rrect(11.5, 9, 9, 3.4, 1.2), '#c43a2a', null, 1.4);
    blob(c, circle(16, 19, 3.6), GOLD, GOLD_SH, 1.4, 0.8);
    blob(c, rrect(14.8, 17.8, 2.4, 2.4, 0.3), BROWN, null, 0.8);
  },
  // 事件：一个大问号
  event: (c) => {
    badge(c, '#8a5cc8', '#5e3a96');
    stroke(c, (k) => { k.moveTo(11.5, 12.5); k.quadraticCurveTo(12, 6.5, 16.5, 6.8); k.quadraticCurveTo(21.5, 7.4, 20.6, 12); k.quadraticCurveTo(19.6, 15, 16.4, 17); k.lineTo(16.2, 20); }, 5.6, INK);
    stroke(c, (k) => { k.moveTo(11.5, 12.5); k.quadraticCurveTo(12, 6.5, 16.5, 6.8); k.quadraticCurveTo(21.5, 7.4, 20.6, 12); k.quadraticCurveTo(19.6, 15, 16.4, 17); k.lineTo(16.2, 20); }, 3, '#fff2a8');
    dab(c, circle(16.2, 24.4, 2.6), INK);
    dab(c, circle(16.2, 24.4, 1.5), '#fff2a8');
  },
  // 休整：一团篝火上架着茶壶，简化成火苗
  rest: (c) => {
    badge(c, '#e0603a', '#a8381a');
    blob(c, (k) => { k.moveTo(16, 5.5); k.quadraticCurveTo(24, 13, 22, 21); k.quadraticCurveTo(16, 27, 10, 21); k.quadraticCurveTo(8, 14, 13, 11); k.quadraticCurveTo(13.5, 14, 15.5, 15); k.quadraticCurveTo(14.5, 10, 16, 5.5); }, '#ffb02e', '#e8701a', 1.8, 1.4);
    blob(c, (k) => { k.moveTo(16, 14); k.quadraticCurveTo(20, 18.5, 18.6, 22); k.quadraticCurveTo(16, 24.6, 13.4, 22); k.quadraticCurveTo(12.6, 18.6, 16, 14); }, '#fff0a0', null, 1.2);
    stroke(c, (k) => { k.moveTo(8, 27); k.lineTo(24, 27); }, 3, INK);
  },
  // 精英：骷髅印
  elite: (c) => {
    badge(c, '#c8323a', '#8a1a22');
    blob(c, (k) => { k.moveTo(8.5, 15); k.quadraticCurveTo(8.5, 6.5, 16, 6.5); k.quadraticCurveTo(23.5, 6.5, 23.5, 15); k.quadraticCurveTo(23.5, 18.5, 21, 20); k.lineTo(21, 24); k.lineTo(11, 24); k.lineTo(11, 20); k.quadraticCurveTo(8.5, 18.5, 8.5, 15); }, '#f4efe0', '#c9c0a8', 1.8, 1.2);
    dab(c, ellipse(12.8, 15, 2.4, 2.8), INK);
    dab(c, ellipse(19.2, 15, 2.4, 2.8), INK);
    dab(c, poly(16, 17.6, 14.8, 20.4, 17.2, 20.4), INK);
    stroke(c, (k) => { k.moveTo(13.5, 22); k.lineTo(13.5, 24); k.moveTo(16, 22); k.lineTo(16, 24); k.moveTo(18.5, 22); k.lineTo(18.5, 24); }, 1.1, '#8a8470');
  },
  // 锁：一把挂锁
  lock: (c) => {
    badge(c, '#5a82a8', '#385a80');
    stroke(c, (k) => { k.moveTo(11.5, 15); k.lineTo(11.5, 11); k.quadraticCurveTo(16, 3.5, 20.5, 11); k.lineTo(20.5, 15); }, 4.6, INK);
    stroke(c, (k) => { k.moveTo(11.5, 15); k.lineTo(11.5, 11); k.quadraticCurveTo(16, 3.5, 20.5, 11); k.lineTo(20.5, 15); }, 2.2, '#dfe6f0');
    blob(c, rrect(8.5, 14.5, 15, 11.5, 2.4), GOLD, GOLD_SH, 2, 1.4);
    dab(c, circle(16, 19.4, 1.9), INK);
    dab(c, rrect(15.2, 19.6, 1.6, 3.8, 0.6), INK);
  },
  // 重抽：两道首尾相接的循环箭头
  reroll: (c) => {
    badge(c, '#38a898', '#227468');
    c.save();
    c.translate(16, 16);
    const arrow = (color: string, w: number, outline: boolean): void => {
      for (const rot of [0, Math.PI]) {
        c.save();
        c.rotate(rot);
        c.beginPath();
        c.arc(0, 0, 7.2, -Math.PI * 0.82, -Math.PI * 0.22);
        c.lineWidth = w;
        c.lineCap = 'round';
        c.strokeStyle = color;
        c.stroke();
        c.beginPath();
        c.moveTo(7.78, -1.89);
        c.lineTo(7.78, -6.44);
        c.lineTo(3.32, -2.74);
        c.closePath();
        c.fillStyle = color;
        c.fill();
        if (outline) {
          c.lineWidth = 2.4;
          c.lineJoin = 'round';
          c.strokeStyle = color;
          c.stroke();
        }
        c.restore();
      }
    };
    arrow(INK, 4.8, true);
    arrow('#fff6d8', 2.4, false);
    c.restore();
  },
  // 放逐：圆圈加斜杠
  ban: (c) => {
    badge(c, '#e8e2d0', '#c4bca0');
    stroke(c, (k) => { k.arc(16, 16, 9, 0, Math.PI * 2); }, 5, INK);
    stroke(c, (k) => { k.arc(16, 16, 9, 0, Math.PI * 2); }, 2.8, '#d83a3a');
    stroke(c, (k) => { k.moveTo(9.6, 22.4); k.lineTo(22.4, 9.6); }, 5, INK);
    stroke(c, (k) => { k.moveTo(9.6, 22.4); k.lineTo(22.4, 9.6); }, 2.8, '#d83a3a');
  },
  // 纸钱：一叠黄纸钱，中间一个方孔
  paper: (c) => {
    badge(c, '#e0c060', '#b08a28');
    c.save();
    c.translate(16, 16);
    c.rotate(-0.22);
    blob(c, rrect(-8, -7, 16, 14, 1.2), '#fff0b0', '#e0c46a', 1.8, 1.1);
    blob(c, rrect(-2, -2, 4, 4, 0.5), '#8a6614', null, 1.1);
    c.restore();
  },
  // 照胆镜：一面圆镜带柄
  mirror: (c) => {
    badge(c, '#6a98c8', '#3a6a9a');
    blob(c, circle(16, 13.5, 7.6), '#e8f4ff', '#a8c8e8', 2, 1.4);
    dab(c, ellipse(13.4, 10.8, 2.4, 1.2, -0.6), '#ffffff', 0.9);
    blob(c, rrect(14.4, 21, 3.2, 7, 1), '#c0883a', null, 1.4);
  },
  // 长明灯：一盏小油灯，火苗不灭
  lamp: (c) => {
    badge(c, '#e8883a', '#b05a18');
    blob(c, (k) => { k.moveTo(16, 5.5); k.quadraticCurveTo(21, 11, 19.5, 14.5); k.quadraticCurveTo(16, 16.5, 12.5, 14.5); k.quadraticCurveTo(11.5, 11, 16, 5.5); }, '#ffe27a', '#ffb02e', 1.6, 1);
    blob(c, (k) => { k.moveTo(8.5, 17); k.lineTo(23.5, 17); k.quadraticCurveTo(22, 25, 16, 25); k.quadraticCurveTo(10, 25, 8.5, 17); }, '#c08a3a', '#8a5a1a', 1.8, 1.2);
    stroke(c, (k) => { k.moveTo(23, 18.4); k.quadraticCurveTo(27, 18.4, 26.4, 21.6); }, 1.6, INK);
  },
  // 签筒：一筒竹签
  tube: (c) => {
    badge(c, '#6aa84a', '#3a7a28');
    for (const [x, r] of [[12.6, -0.18], [16, 0], [19.4, 0.18]] as const) {
      c.save();
      c.translate(x, 11);
      c.rotate(r);
      blob(c, rrect(-1.3, -6, 2.6, 11, 0.8), '#f0d48a', '#c8a850', 1.2, 0.7);
      c.restore();
    }
    blob(c, rrect(10, 12, 12, 14, 2.4), '#b0743a', '#80501e', 2, 1.4);
    stroke(c, (k) => { k.moveTo(10.4, 17); k.lineTo(21.6, 17); }, 1.2, '#80501e');
  },
  // 纸钱串：一串铜钱
  string: (c) => {
    badge(c, '#c89a2a', '#8a6614');
    stroke(c, (k) => { k.moveTo(16, 3.5); k.lineTo(16, 28); }, 1.6, INK);
    for (const y of [8, 14.5, 21]) {
      blob(c, circle(16, y, 3.6), GOLD, GOLD_SH, 1.4, 0.8);
      blob(c, rrect(14.9, y - 1.1, 2.2, 2.2, 0.3), BROWN, null, 0.8);
    }
  },
  // 护身符：一道黄符，朱砂「护」意的一竖一点
  charm: (c) => {
    badge(c, '#d8503a', '#9a2a18');
    blob(c, rrect(10.5, 5.5, 11, 21, 1.2), '#f2d14a', '#d8b232', 1.8, 1);
    stroke(c, (k) => { k.moveTo(16, 9.5); k.lineTo(16, 20.5); k.moveTo(13, 13); k.lineTo(19, 13); k.moveTo(13.4, 18); k.lineTo(18.6, 18); }, 1.5, '#c8281a');
  },
  // 疾风履：一只带风的靴
  boots: (c) => {
    badge(c, '#4aa8a0', '#287a74');
    blob(c, (k) => { k.moveTo(12, 6.5); k.lineTo(19, 6.5); k.lineTo(19, 17); k.quadraticCurveTo(25, 18, 25, 23); k.lineTo(10, 23); k.quadraticCurveTo(10, 14, 12, 6.5); }, '#7a5a3a', '#4e3820', 1.9, 1.3);
    blob(c, rrect(10, 21, 15, 3.4, 1.2), '#e8e2d0', null, 1.4);
    stroke(c, (k) => { k.moveTo(3.5, 12); k.lineTo(9, 12); k.moveTo(5, 16.5); k.lineTo(10, 16.5); }, 1.8, '#ffffff');
  },
  // 镇尺：一把长方镇纸尺
  ruler: (c) => {
    badge(c, '#8a7a6a', '#5a4e40');
    blob(c, rrect(5.5, 12, 21, 8, 1.6), '#a07038', '#704a1a', 2, 1.3);
    stroke(c, (k) => { for (const x of [9, 13, 17, 21]) { k.moveTo(x, 12); k.lineTo(x, x % 8 === 1 ? 16 : 15); } }, 1.3, '#4e320e');
  },
  // 聚宝盆：一只盆，里头堆着元宝
  bowl: (c) => {
    badge(c, '#c8683a', '#8a3e18');
    blob(c, (k) => { k.moveTo(11, 8); k.quadraticCurveTo(16, 3.5, 21, 8); k.quadraticCurveTo(22, 14, 16, 14); k.quadraticCurveTo(10, 14, 11, 8); }, GOLD, GOLD_SH, 1.6, 1);
    blob(c, (k) => { k.moveTo(6.5, 14); k.lineTo(25.5, 14); k.quadraticCurveTo(24, 26.5, 16, 26.5); k.quadraticCurveTo(8, 26.5, 6.5, 14); }, '#c8452a', '#8a2414', 2, 1.4);
    stroke(c, (k) => { k.moveTo(9, 19); k.lineTo(23, 19); }, 1.3, GOLD);
  },
  // 五雷令：一面令牌上一道闪电
  thunder: (c) => {
    badge(c, '#4a5aa8', '#2a3678');
    blob(c, rrect(8.5, 5.5, 15, 21, 2), '#2c2f5c', '#191b3c', 1.9, 1.1);
    blob(c, poly(18, 7.5, 11, 17, 15.4, 17, 13.4, 24.5, 21, 14, 16.6, 14), '#ffe04a', '#e0a82a', 1.5, 0.9);
  },
  // 夜行衣：一件深色短披风
  cloak: (c) => {
    badge(c, '#5a4a8a', '#382c62');
    blob(c, (k) => { k.moveTo(11, 7); k.quadraticCurveTo(16, 4.5, 21, 7); k.quadraticCurveTo(26, 16, 25, 26); k.lineTo(22, 23); k.lineTo(19, 26); k.lineTo(16, 23); k.lineTo(13, 26); k.lineTo(10, 23); k.lineTo(7, 26); k.quadraticCurveTo(6, 16, 11, 7); }, '#3b4286', '#222657', 1.9, 1.3);
    dab(c, circle(16, 8.5, 1.6), GOLD);
  },
  // 血葫芦：一只红葫芦
  gourd: (c) => {
    badge(c, '#d84a4a', '#9a2222');
    blob(c, circle(16, 10.5, 4.6), '#ffb4a0', '#e07860', 1.8, 1.2);
    blob(c, circle(16, 19.5, 6.6), '#ffb4a0', '#e07860', 1.9, 1.4);
    blob(c, rrect(14.4, 3.6, 3.2, 3.6, 0.8), '#7a4818', null, 1.2);
  },
};

/** 连战小图标：驿站三种、精英、锁、放逐、纸钱、12 个符印 */
export const rushIcon = (id: RushIconKey): string => paint(`r.${id}`, RUSH_ART[id]);
