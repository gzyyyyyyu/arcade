import { BUILDING_KINDS, isDecoKind } from '../content/buildings.ts';
// 飘字的排布算法：纯函数，不依赖 Phaser，单测直接测（tests/fx-layout.test.ts）。

interface Spot {
  x: number;
  y: number;
  /** 占的宽高（屏幕像素）；不给就按小数字算 */
  w?: number;
  h?: number;
}

/** 候选偏移（以小数字 28×14 为一格的倍数）：先原位，再左右上方错开，最后往上叠；按新数字的大小放大，大字错得开 */
const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [26, -10], [-26, -10], [0, -22], [46, 0], [-46, 0], [26, -34], [-26, -34], [0, -46], [48, -22], [-48, -22], [0, -62],
];
/** 两个数字之间至少留的空（屏幕像素）：只要求不重叠的话，「-117-463」贴在一起读成一个数 */
export const DMG_GAP = 4;

/**
 * 新数字（宽 w、高 h）该往哪儿偏：从候选里挑第一个不压在别的数字上（含 DMG_GAP 的空）的位置（active 是正在飘的数字的屏幕坐标和大小）；
 * 全都有冲突就取冲突最少的。返回屏幕像素偏移。
 */
export function pickSlot(active: readonly Spot[], x: number, y: number, w = 28, h = 14): { dx: number; dy: number } {
  const sx = Math.max(1, (w + DMG_GAP) / 28);
  const sy = Math.max(1, (h + DMG_GAP) / 14);
  let best = { dx: 0, dy: 0 };
  let bestN = Infinity;
  for (const o of OFFSETS) {
    const dx = o[0] * sx;
    const dy = o[1] * sy;
    let n = 0;
    for (const a of active) {
      if (Math.abs(a.x - (x + dx)) < ((a.w ?? 28) + w) / 2 + DMG_GAP && Math.abs(a.y - (y + dy)) < ((a.h ?? 14) + h) / 2 + DMG_GAP) n++;
    }
    if (n < bestN) {
      best = { dx, dy };
      bestN = n;
      if (n === 0) break;
    }
  }
  return best;
}

/** 正在飘的一个数字（屏幕像素）：y 是没推开之前的位置，born 是出现了多久（越大越早） */
export interface Floating {
  x: number;
  y: number;
  w: number;
  h: number;
  born: number;
}

/**
 * 飘字竖向防撞：大字升得比小字快（34 / 22 像素），后出的大字会追上先出的小字叠在一起。
 * 每帧在上升之后跑一遍：两个数字的框横竖都重叠时，把早出的那个（同时出的按下标）再往上推开重叠的量。
 * push[i] 是第 i 个已经被推上去多少（屏幕像素），只增不减（数字不往下掉）；n 很小（池子 8 个），两两比几遍就够。
 */
export function pushApart(items: readonly Floating[], push: Float64Array, rounds = 3): void {
  const n = items.length;
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = items[i]!;
        const b = items[j]!;
        // a 是早出的那个：只推它，b 不动
        if (i === j || a.born < b.born || (a.born === b.born && i > j)) continue;
        if (Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + DMG_GAP) continue;
        const ay = a.y - push[i]!;
        const by = b.y - push[j]!;
        const need = (a.h + b.h) / 2 + DMG_GAP - (by - ay);
        if (need > 0.01 && ay <= by + 0.01) {
          push[i] = push[i]! + need;
          moved = true;
        }
      }
    }
    if (!moved) return;
  }
}

/** 最近飘过的一个「+N」字：同类（key）同一片地方的新字并进它，数字往上加 */
export interface Recent {
  key: string;
  t: number;
  x: number;
  y: number;
}
/** 并字的时间窗（毫秒）和半径（屏幕像素）：敌人在宝藏边成片倒下时，一片只留一个「+N」往上加 */
export const MERGE_MS = 900;
export const MERGE_PX = 110;

/** 新字并进哪一个最近的同类字：时间窗内、屏幕距离 MERGE_PX 内最近的那个，没有返回 -1。z 是世界到屏幕的缩放 */
export function pickMerge(recent: readonly Recent[], key: string, x: number, y: number, now: number, z: number): number {
  let best = -1;
  let bd = MERGE_PX;
  for (let i = 0; i < recent.length; i++) {
    const o = recent[i]!;
    if (o.key !== key || now - o.t >= MERGE_MS) continue;
    const d = Math.hypot(o.x - x, o.y - y) * z;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** 把一段居中的内容（宽 w）夹进 [margin, width - margin]；屏幕不够宽时居中 */
export function clampCenter(x: number, w: number, width: number, margin: number): number {
  const lo = margin + w / 2;
  const hi = width - margin - w / 2;
  if (lo > hi) return width / 2;
  return Math.min(hi, Math.max(lo, x));
}

/** 这一场里哪种防御造成了大部分伤亡：倒在它旁边的兵占 ≥ 一半且至少 3 个才算 */
export function topBlame(deathBy: ReadonlyMap<string, number>): { kind: string; n: number; total: number } | null {
  let top: string | null = null;
  let topN = 0;
  let total = 0;
  for (const [k, n] of deathBy) {
    total += n;
    if (n > topN) {
      top = k;
      topN = n;
    }
  }
  return top && total >= 3 && topN * 2 >= total ? { kind: top, n: topN, total } : null;
}

/** 伤害数字在屏幕上的字号（CSS 像素）：sz 是设计字号；不超过小兵在屏幕上身高 unitPx 的一半多一点，但再小也留 13 像素能看清 */
export const DMG_MIN_PX = 13;
export function dmgFontPx(sz: number, unitPx: number): number {
  return Math.min(sz, Math.max(0.55 * unitPx, DMG_MIN_PX));
}

// ---------------------------------------------------------------- 遮挡剪影（occlude.ts）用的纯函数

/** 分桶的格子边长（世界像素） */
export const OCC_CELL = 128;
export interface OccBox {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  depth: number;
  /** 建筑的图（被雾藏起来、看不见时不挡人） */
  img?: { visible: boolean };
}

/** 纯函数：建筑（外框 b、深度）挡不挡住深度 du、身体中点 (x, y) 的单位 */
export function occludes(b: OccBox, x: number, y: number, du: number): boolean {
  return b.depth > du && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

/** 纯函数：建筑的不透明外框（纹理像素 l/t/r/b）按贴图的位置、原点、缩放换成世界坐标，左右各收 inset、上收 inset/2，底边不低于锚点 */
export function boxOf(img: { x: number; y: number; originX: number; originY: number; width: number; height: number; scaleX: number; scaleY: number }, box: { l: number; t: number; r: number; b: number }, inset = 0.16): { x0: number; y0: number; x1: number; y1: number } {
  const sx = Math.abs(img.scaleX);
  const sy = Math.abs(img.scaleY);
  const left = img.x - img.originX * img.width * sx;
  const top = img.y - img.originY * img.height * sy;
  const x0 = left + box.l * sx;
  const x1 = left + box.r * sx;
  const y0 = top + box.t * sy;
  const y1 = Math.min(top + box.b * sy, img.y);
  const w = x1 - x0;
  const h = y1 - y0;
  return { x0: x0 + w * inset, x1: x1 - w * inset, y0: y0 + h * inset * 0.5, y1 };
}

/**
 * 不算挡人的：贴地矮的（城墙、陷阱）、海里的（海怪）、宝藏箱、装饰（棕榈、岩石、旗杆、雕像、宝箱、章节纪念）。
 * 装饰的外框按整片树冠 / 整张图算，人其实看得见，在上面再画剪影就成了站在旁边的一个浅蓝残影。
 */
export const NO_OCC: ReadonlySet<string> = new Set<string>(['wall', 'mine', 'tar', 'kraken', 'treasure', ...BUILDING_KINDS.filter(isDecoKind)]);
