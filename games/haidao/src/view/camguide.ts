/**
 * 手机竖屏放大后的镜头辅助（纯函数，tests/camguide.test.ts 锁住）：
 * 开场"先看整岛、再推到要守 / 要登陆的那一侧"的时间线，推过去的落点，开新一波时要不要跟过去，以及屏外东西在屏幕边缘的指示（箭头、小标）。
 * 竖屏下登陆战和守岛放大到内容约占屏高 60%，左右会裁掉一截，所以要告诉玩家"那边还有东西"。
 */
import { clamp01, easeInOutSine } from './motion.ts';

export interface View { cx: number; cy: number; z: number }
export interface Rect { l: number; t: number; r: number; b: number }

/** 开场先停在整岛全景的时长（毫秒） */
export const INTRO_HOLD = 1000;
/** 从全景推到落点的时长（毫秒） */
export const INTRO_PUSH = 900;

/**
 * 镜头时间线：t（毫秒，从开场算）< hold 时停在 from，之后 push 毫秒内慢进慢出地推到 to。
 * 缩放按比例插值（每一帧放大的倍数一样，看起来匀），中心按缩放的进度走，免得先横移再放大的"拐弯"感。
 */
export function camAt(t: number, from: View, to: View, hold = INTRO_HOLD, push = INTRO_PUSH): { view: View; done: boolean } {
  if (t < hold) return { view: from, done: false };
  const k = push <= 0 ? 1 : clamp01((t - hold) / push);
  if (k >= 1) return { view: to, done: true };
  const e = easeInOutSine(k);
  const z = from.z > 0 && to.z > 0 ? from.z * (to.z / from.z) ** e : from.z + (to.z - from.z) * e;
  return { view: { cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, z }, done: false };
}

/** 玩家自己动过镜头（拖、捏、滚轮、点屏边箭头）之后多久内，开新一波也不替他挪镜头（毫秒） */
export const FOLLOW_IDLE = 5000;
/** 登陆口离可见区边缘至少这么多像素才算「看得见」：贴着边的一半在屏外，敌人一上岛就出去了 */
export const FOLLOW_PAD = 40;

/**
 * 开新一波时要不要把镜头推到它的登陆口（只在竖屏放大模式）：这波的登陆口已经有一个在可见区里、
 * 玩家 FOLLOW_IDLE 内自己动过镜头、开着造塔 / 升级面板或正在瞄技能，都不推。
 * points 是登陆口投到屏幕上的位置（CSS 像素，和 view 同一个坐标系），sinceUser 是离玩家上次动镜头多少毫秒。
 */
export function followWave(o: { live: boolean; busy: boolean; sinceUser: number; points: ReadonlyArray<{ x: number; y: number }>; view: Rect }): boolean {
  if (!o.live || o.busy || o.sinceUser < FOLLOW_IDLE || o.points.length === 0) return false;
  const v = o.view;
  const p = FOLLOW_PAD;
  return !o.points.some((q) => q.x >= v.l + p && q.x <= v.r - p && q.y >= v.t + p && q.y <= v.b - p);
}

/**
 * 推过去的落点（横向）：可见区的中线尽量对准 focusX（世界坐标），但不让可见区越出内容盒的左右边；
 * 内容盒比可见区还窄就居中。w 是屏宽，left / right 是可见区两侧扣掉的宽（CSS 像素），z 是缩放。返回镜头中心的世界 x。
 */
export function focusCx(focusX: number, content: { l: number; r: number }, z: number, w: number, left = 0, right = 0): number {
  const vw = Math.max(1, w - left - right) / z;
  const lo = content.l + vw / 2;
  const hi = content.r - vw / 2;
  const vc = lo > hi ? (content.l + content.r) / 2 : Math.min(hi, Math.max(lo, focusX));
  // 可见区中线相对画布中线的偏移（左右扣的宽不一样时）
  const mid = left + (w - left - right) / 2;
  return vc - (mid - w / 2) / z;
}

/** enemy = 屏外的敌人；slot = 屏外能造塔的空木台；gate = 屏外的路口 / 关口旗（护航的敌人入口和下一个关口） */
export type EdgeKind = 'enemy' | 'slot' | 'gate';
/** 一个可能在屏外的东西：屏幕坐标 sx、sy（CSS 像素，相对画布左上），世界坐标 wx、wy（点了箭头镜头往这里移） */
export interface EdgeItem { kind: EdgeKind; sx: number; sy: number; wx: number; wy: number }
export type Side = 'l' | 'r' | 't' | 'b';
/** 边缘上的一个指示：同一种、同一边、同一段的合成一个，n 是个数，(wx, wy) 是它们的世界中心，(dx, dy) 是从可见区中心指过去的方向 */
export interface EdgeMark { kind: EdgeKind; side: Side; x: number; y: number; n: number; wx: number; wy: number; dx: number; dy: number }

/** 指示离可见区边的距离（中心到边，CSS 像素）：44 像素的点按目标一半再多 4 */
export const EDGE_PAD = 26;
/** 同一边上每段的长度：段中心之间至少隔这么远（44 像素的目标 + 8 像素间距） */
export const EDGE_STEP = 52;

const ORDER: Record<Side, number> = { t: 0, r: 1, b: 2, l: 3 };
const KIND_ORDER: Record<EdgeKind, number> = { enemy: 0, slot: 1, gate: 2 };

/**
 * 屏外东西的边缘指示：在可见区 view 里的不管；屏外的沿"可见区中心 → 它"的射线和边缘轨道（view 往里缩 pad）求交，
 * 交点所在的边按 step 分段，同种同段的合成一个（位置取段中心，不随敌人一点点挪而抖）。结果按种类、边、段排好，确定性。
 */
export function edgeMarks(items: readonly EdgeItem[], view: Rect, pad = EDGE_PAD, step = EDGE_STEP): EdgeMark[] {
  const L = view.l + pad;
  const R = view.r - pad;
  const T = view.t + pad;
  const B = view.b - pad;
  if (R <= L || B <= T) return [];
  const ox = (view.l + view.r) / 2;
  const oy = (view.t + view.b) / 2;
  const acc = new Map<string, { kind: EdgeKind; side: Side; idx: number; at: number; n: number; wx: number; wy: number; dx: number; dy: number }>();
  for (const it of items) {
    if (it.sx >= view.l && it.sx <= view.r && it.sy >= view.t && it.sy <= view.b) continue;
    const dx = it.sx - ox;
    const dy = it.sy - oy;
    const kx = dx > 0 ? (R - ox) / dx : dx < 0 ? (L - ox) / dx : Infinity;
    const ky = dy > 0 ? (B - oy) / dy : dy < 0 ? (T - oy) / dy : Infinity;
    const side: Side = kx <= ky ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'b' : 't';
    const k = Math.min(kx, ky);
    const along = side === 'l' || side === 'r' ? oy + dy * k : ox + dx * k;
    const lo = side === 'l' || side === 'r' ? T : L;
    const hi = side === 'l' || side === 'r' ? B : R;
    const idx = Math.max(0, Math.floor((Math.min(hi, Math.max(lo, along)) - lo) / step));
    const at = Math.min(hi, lo + (idx + 0.5) * step);
    const key = `${it.kind}|${side}|${idx}`;
    const a = acc.get(key);
    if (a) {
      a.n++;
      a.wx += it.wx;
      a.wy += it.wy;
      a.dx += dx;
      a.dy += dy;
    } else acc.set(key, { kind: it.kind, side, idx, at, n: 1, wx: it.wx, wy: it.wy, dx, dy });
  }
  return [...acc.values()]
    .sort((p, q) => KIND_ORDER[p.kind] - KIND_ORDER[q.kind] || ORDER[p.side] - ORDER[q.side] || p.idx - q.idx)
    .map((a) => {
      const x = a.side === 'l' ? L : a.side === 'r' ? R : a.at;
      const y = a.side === 't' ? T : a.side === 'b' ? B : a.at;
      return { kind: a.kind, side: a.side, x, y, n: a.n, wx: a.wx / a.n, wy: a.wy / a.n, dx: a.dx / a.n, dy: a.dy / a.n };
    });
}
