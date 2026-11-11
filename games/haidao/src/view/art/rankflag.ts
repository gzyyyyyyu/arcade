/**
 * 海盗王阶的王旗（DESIGN 2.6）：立在主寨旁的一根旗杆，旗面用该阶的主色、镶边用 trim；阶数越高越华丽：
 * 1–3 阶小旗（镶一道边），4–6 阶加骷髅纹章、金边和周期性的闪光扫过，7–9 阶加王冠和燕尾，10 阶再加金色光晕和星光。
 * 全部程序画（SVG，不分级的 pieceRaw：王阶色要和表里一致），只在有王阶时按需烘焙那一阶的帧，不进开局的 allArt。
 * 旗面飘动靠 6 帧波浪相位（FLAG_WAVE），闪光扫过另有 6 帧（相位和波浪帧一一对应，所以插进去不跳）。
 */
import { RANKS } from '../../content/rank.ts';
import type { ArtPiece } from './kit.ts';
import { ell, f, line, pieceRaw, poly, skull } from './kit.ts';
import { PALETTE as C } from './palette.ts';

/** 王阶色（数值）转成 SVG 颜色 */
export const rankHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** 某一阶的主色和镶边色（SVG 颜色）；0 阶或越界给 null */
export function rankColors(rank: number): { color: string; trim: string } | null {
  const r = RANKS[Math.floor(rank) - 1];
  return r ? { color: rankHex(r.color), trim: rankHex(r.trim) } : null;
}

/** 飘动的波浪相位数；有闪光的阶（FLAG_SWEEP_FROM 起）另有同样多帧"带闪光"的 */
export const FLAG_WAVE = 6;
export const FLAG_SWEEP_FROM = 4;
const INK = C.ink!;

/** 旗杆高和旗面大小：随阶数长大 */
const K = 1.3;
const dims = (rank: number): { H: number; fw: number; fh: number } => ({ H: (62 + rank * 2) * K, fw: (26 + rank * 2.6) * K, fh: (18 + rank * 1.6) * K });

/** 王冠：底边在 (x, y)，s = 放大倍数 */
function crown(x: number, y: number, s: number): string {
  const p = (dx: number, dy: number): [number, number] => [x + dx * s, y + dy * s];
  let o = poly([p(-9, 0), p(-9, -9), p(-4.5, -4), p(0, -12), p(4.5, -4), p(9, -9), p(9, 0)], C.gold!, { sw: 1.6 });
  o += poly([p(-9, 0), p(9, 0), p(9, -3), p(-9, -3)], C.goldD!, { sw: 0, op: 0.8 });
  o += ell(x, y - 7 * s, 1.7 * s, 1.7 * s, C.red!, { sw: 0.8 });
  o += ell(x - 5.5 * s, y - 3 * s, 1.2 * s, 1.2 * s, C.blue!, { sw: 0.6 });
  o += ell(x + 5.5 * s, y - 3 * s, 1.2 * s, 1.2 * s, C.blue!, { sw: 0.6 });
  return o;
}

/** 四角星光（10 阶）：大小随相位呼吸 */
function twinkle(x: number, y: number, r: number, c: string): string {
  return poly([[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]], c, { sw: 0.6, op: 0.95 });
}

/**
 * 一帧王旗。i = 波浪相位 0..FLAG_WAVE-1；sweep = 闪光位置 0..1（没有闪光传 -1）。
 * 锚点 = 旗杆底；旗面、纹章、王冠都从旗杆往右、往上长。
 */
function frame(rank: number, i: number, sweep: number): ArtPiece {
  const { color, trim } = rankColors(rank)!;
  const { H, fw, fh } = dims(rank);
  const ph = (i / FLAG_WAVE) * Math.PI * 2;
  const w1 = Math.sin(ph) * fh * 0.12;
  const w2 = Math.sin(ph + 2.1) * fh * 0.09;
  const fy = -H + 5;
  const notch = rank >= 7;
  const right = notch ? `L${f(fw * 0.88)},${f(0.55 * fh + w2 * 0.5)} L${f(fw)},${f(fh + w2)}` : `L${f(fw)},${f(fh + w2)}`;
  const d = `M0,0 Q${f(fw * 0.3)},${f(-0.2 * fh + w1)} ${f(fw * 0.6)},${f(0.05 * fh)} T${f(fw)},${f(0.1 * fh + w2)} ${right} Q${f(fw * 0.7)},${f(0.8 * fh - w1)} ${f(fw * 0.5)},${f(0.97 * fh)} T0,${f(fh)} Z`;

  const padL = 10;
  const padR = 12 + (rank >= 10 ? 22 : 0);
  const padT = 14 + (rank >= 7 ? 20 : 0) + (rank >= 10 ? 18 : 0);
  const padB = 12;
  const w = Math.ceil(padL + fw + padR);
  const h = Math.ceil(padT + H + padB);
  const ax = padL;
  const ay = padT + H;

  let b = '';
  // 脚下：一圈小石座和影子
  b += `<ellipse cx="0" cy="3" rx="${f(12 + rank * 0.4)}" ry="5" fill="#0b1a2a" opacity="0.32"/>`;
  b += ell(0, 1, 8, 3.6, C.stoneD!, { sw: 1.6 });
  b += ell(0, -0.6, 6.2, 2.6, C.stone!, { sw: 0 });
  // 十阶光晕：在旗面后面一团金光，随相位轻轻呼吸
  if (rank >= 10) {
    const gid = 'rg';
    const pulse = 0.85 + 0.15 * Math.sin(ph);
    b += `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="${trim}" stop-opacity="${f(0.62 * pulse)}"/><stop offset="0.55" stop-color="${trim}" stop-opacity="${f(0.22 * pulse)}"/><stop offset="1" stop-color="${trim}" stop-opacity="0"/></radialGradient></defs>`;
    b += `<ellipse cx="${f(fw * 0.5)}" cy="${f(fy + fh * 0.5)}" rx="${f(fw * 0.95)}" ry="${f(fh * 1.25)}" fill="url(#${gid})"/>`;
  }
  // 旗杆：深木杆加一道亮边，顶上金球（4 阶起整杆镶金箍）
  b += line([0, 0], [0, -H], '#2f1a0e', 4.6);
  b += line([-0.8, -1], [-0.8, -H + 1], C.woodL!, 1.2, 0.7);
  if (rank >= 4) for (const k of [0.25, 0.5]) b += line([-2.4, -H * k], [2.4, -H * k], trim, 1.6, 0.9);
  b += ell(0, -H - 1, 3.2, 3.2, rank >= 4 ? C.gold! : C.woodL!, { sw: 1.4 });
  if (rank >= 7) b += crown(0, -H - 3, 0.9 + (rank - 7) * 0.12);

  // 裁剪和渐变的 id 每帧各用各的：几帧拼进同一份 SVG 时（预览、合图）同名 id 会裁到别的帧的旗形上
  const cid = `rkc${rank}${sweep >= 0 ? 's' : 'w'}${i}`;
  // 旗面（画在杆右边，左上角挂在杆顶下面一点）
  let flagBody = `<path d="${d}" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
  // 下半截稍暗，有布的体积感
  flagBody += `<g clip-path="url(#${cid})"><path d="${d}" fill="#0b1a2a" opacity="0.14" transform="translate(0 ${f(fh * 0.42)})"/></g>`;
  // 镶边：1–3 阶只有上缘一道，4 阶起整圈（金边），7 阶起双层
  flagBody += `<path d="M0,0 Q${f(fw * 0.3)},${f(-0.2 * fh + w1)} ${f(fw * 0.6)},${f(0.05 * fh)} T${f(fw)},${f(0.1 * fh + w2)}" fill="none" stroke="${trim}" stroke-width="2.4" stroke-linecap="round"/>`;
  if (rank >= 4) {
    flagBody += `<path d="${d}" fill="none" stroke="${trim}" stroke-width="${rank >= 7 ? 2.2 : 1.6}" stroke-linejoin="round" opacity="0.95" transform="translate(${f(fw * 0.04)} ${f(fh * 0.07)}) scale(0.92)"/>`;
    flagBody += skull(fw * 0.47, fh * 0.46 + w1 * 0.4, Math.min(fw, fh) * (rank >= 7 ? 0.62 : 0.58), true);
  } else {
    // 小旗：旗心一枚镶边色的小锚点（圆点加横杆），不抢旗色
    flagBody += `<circle cx="${f(fw * 0.5)}" cy="${f(fh * 0.5 + w1 * 0.4)}" r="${f(fh * 0.16)}" fill="${trim}" stroke="${INK}" stroke-width="1"/>`;
  }
  // 闪光扫过：一条斜向的亮带，裁在旗面轮廓里
  if (sweep >= 0) {
    const cx = -fw * 0.25 + (fw * 1.5) * sweep;
    flagBody += `<defs><linearGradient id="${cid}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.78"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
    flagBody += `<g clip-path="url(#${cid})"><polygon points="${f(cx - fw * 0.16)},${f(-fh * 0.2)} ${f(cx + fw * 0.2)},${f(-fh * 0.2)} ${f(cx + fw * 0.08)},${f(fh * 1.3)} ${f(cx - fw * 0.28)},${f(fh * 1.3)}" fill="url(#${cid}g)"/></g>`;
  }
  b += `<defs><clipPath id="${cid}"><path d="${d}"/></clipPath></defs>`;
  b += `<g transform="translate(1 ${f(fy)})">${flagBody}</g>`;
  // 十阶星光：旗面周围几颗，相位错开着闪
  if (rank >= 10) {
    const tw = (k: number): number => 2.2 + 1.8 * Math.max(0, Math.sin(ph + k * 2.1));
    b += twinkle(fw * 1.02, fy - 2, tw(0), '#fff7c4') + twinkle(fw * 0.2, fy + fh * 1.15, tw(1), '#fff7c4') + twinkle(fw * 0.82, fy + fh * 0.95, tw(2), '#fff');
  }
  return pieceRaw(`rk.flag.${rank}.${sweep >= 0 ? 's' : 'w'}${i}`, w, h, ax, ay, b);
}

const memo = new Map<number, ArtPiece[]>();
/**
 * 某一阶的王旗全部帧：先 FLAG_WAVE 张波浪帧，4 阶起再接 FLAG_WAVE 张带闪光的（第 k 张和第 k 张波浪帧同相位）。
 * 越界给空数组。同一阶只画一次。
 */
export function rankFlagFrames(rank: number): ArtPiece[] {
  const rk = Math.floor(rank);
  if (!RANKS[rk - 1]) return [];
  let v = memo.get(rk);
  if (!v) {
    v = Array.from({ length: FLAG_WAVE }, (_, i) => frame(rk, i, -1));
    if (rk >= FLAG_SWEEP_FROM) for (let i = 0; i < FLAG_WAVE; i++) v.push(frame(rk, i, (i + 0.5) / FLAG_WAVE));
    memo.set(rk, v);
  }
  return v;
}

/**
 * 王旗杆底相对主寨精灵锚点的偏移（主寨 4×4 格，锚点在占地中心；旗立在占地右前角的外面，
 * 不进占地、不挡主寨的门和旗布，也不改建筑占地）。
 */
export function RANK_FLAG_AT(): { dx: number; dy: number } {
  return { dx: 100, dy: 48 };
}
