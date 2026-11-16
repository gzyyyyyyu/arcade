/**
 * 配色分级：素材 SVG 里的十六进制色统一过一遍（降饱和、拉开明暗、亮面偏暖暗面偏冷），再按本体色算描边。
 * 光源固定在屏幕左上：亮面暖、暗面冷；只有宝藏、旗帜、技能效果这类关键物（VIVID）保持原来的鲜艳。
 * 全部在生成 SVG 字符串时做一次（烘焙前），运行时每帧零开销。
 */

/** 保持鲜艳的颜色（小写）：旗帜红、火焰爆炸、紫色技能、宝藏的亮金点。调色板里的 gold 是黄铜色，跟着全局分级走，不再免检 */
export const VIVID = new Set([
  '#ffd447', '#ffcf5a', '#fff0a0', '#fff6c8', '#ffd646',
  '#cf3e34', '#ee6a52', '#8f292b', '#ff641c', '#f28326', '#7e46b3', '#ff5d73', '#ffe14a', '#c08bff', '#ffffff',
]);

/** 饱和度保留比例、明暗拉开幅度、冷暖偏移（0–255 的通道值） */
export const GRADE = { sat: 0.92, contrast: 0.08, warm: 8 } as const;

function parse(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const memo = new Map<string, string>();

/** 一个颜色的分级结果（小写十六进制）；VIVID 里的原样返回 */
export function gradeHex(c: string): string {
  const k = c.toLowerCase();
  if (VIVID.has(k)) return k;
  let v = memo.get(k);
  if (v) return v;
  const [r, g, b] = parse(k);
  const l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  // 向亮度灰靠拢 = 降饱和
  const gr = l * 255;
  let nr = gr + (r - gr) * GRADE.sat;
  let ng = gr + (g - gr) * GRADE.sat;
  let nb = gr + (b - gr) * GRADE.sat;
  // 以 0.5 为中心拉开明暗
  const lift = (l - 0.5) * GRADE.contrast * 255;
  nr += lift;
  ng += lift;
  nb += lift;
  // 亮面暖、暗面冷
  const t = (l - 0.5) * 2 * GRADE.warm;
  nr += t;
  nb -= t;
  v = hex(nr, ng, nb);
  memo.set(k, v);
  return v;
}

/** 整张 SVG 里所有 #rrggbb 过一遍分级 */
export function gradeSvg(svg: string): string {
  return svg.replace(/#[0-9a-fA-F]{6}\b/g, (m) => gradeHex(m));
}

/** 描边色：本体色向深褐靠拢（比本体深一档），不是统一的黑；不是十六进制色（渐变、rgba）时用 fallback */
export function outlineOf(fill: string, fallback: string, ink = '#2b1a15', k = 0.58): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(fill)) return fallback;
  const a = parse(fill);
  const b = parse(ink);
  return hex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}

// ---------------------------------------------------------------- 确定性随机（画面层，只用整数运算）

/** 整数散列：同样的输入永远同样的输出 */
export function h32(a: number, b = 0, c = 0, d = 0): number {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ Math.imul(d | 0, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 带种子的小随机数发生器（0..1），按用途传不同种子 */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 材质类别：按颜色猜（木 = 暖色高饱和，石 = 低饱和偏灰，铁 = 偏蓝灰且暗） */
export type Material = 'wood' | 'stone' | 'iron' | 'other';
export function materialOf(c: string): Material {
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return 'other';
  const [r, g, b] = parse(c);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (r > b + 22 && r >= g && sat > 0.28 && g > b) return mx > 90 && sat < 0.75 ? 'wood' : 'other';
  if (sat < 0.2 && mx > 100) return 'stone';
  if (b >= r && mx < 190 && sat < 0.45) return 'iron';
  return 'other';
}
