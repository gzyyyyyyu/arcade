/**
 * 手机竖屏放大后的镜头辅助（纯函数，tests/camguide.test.ts 锁住）：
 * 开场"先看整岛、再推到要守 / 要登陆的那一侧"的时间线，推过去的落点，之后的自动构图（框住正在交战的主组和它的目标，玩家一碰就让位、
 * 停手 AUTO_IDLE 后接回），以及屏外东西在屏幕边缘的指示（箭头、小标）。登陆战、守岛、护航都走这一套（FitCam 每帧调），各场景只给「看什么」。
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

/** 玩家自己动过镜头（拖、捏、滚轮、点屏边箭头、切全景）之后多久内，自动构图不接管（毫秒） */
export const AUTO_IDLE = 4000;
/** 点了一下画面（下船、放技能、点塔）之后多久内不动镜头：刚点完画面就滑走，下一下会点歪（毫秒） */
export const TAP_HOLD = 2500;
/** 主组的半径（世界像素，约 4 格宽）：离锚点这么近的算同一拨 */
export const GROUP_R = 260;
/** 死区：落点偏离当前中心超过可见宽的这一比例才开始挪，挪到差不到 AUTO_SETTLE 就停（来回小抖不跟） */
export const AUTO_DEAD = 0.18;
export const AUTO_SETTLE = 0.02;

export interface FPt { x: number; y: number }

/** anchor 周围 r 以内的点的中心（anchor 自己一定算进去） */
export function groupAround(points: readonly FPt[], anchor: FPt, r = GROUP_R): FPt {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of points) {
    if (Math.hypot(p.x - anchor.x, p.y - anchor.y) > r) continue;
    x += p.x;
    y += p.y;
    n++;
  }
  return n ? { x: x / n, y: y / n } : { x: anchor.x, y: anchor.y };
}

/** 最大的一簇的中心：每个点数 r 以内有几个，取最多的那个当锚（并列取先出现的），没有点为 null */
export function biggestCluster(points: readonly FPt[], r = GROUP_R): FPt | null {
  let best = -1;
  let bn = -1;
  for (let i = 0; i < points.length; i++) {
    let n = 0;
    for (const q of points) if (Math.hypot(q.x - points[i]!.x, q.y - points[i]!.y) <= r) n++;
    if (n > bn) {
      bn = n;
      best = i;
    }
  }
  return best < 0 ? null : groupAround(points, points[best]!, r);
}

/**
 * 构图的落点（世界坐标）：主组和目标（要守的宝藏 / 要打的建筑）放得进可见区的八成，就看两者的中间，一起框住；
 * 放不下只看主组（交战的人比目标要紧）。vw、vh 是可见区的世界宽高
 */
export function frameFocus(group: FPt, objective: FPt | null, vw: number, vh: number): FPt {
  if (!objective) return group;
  const fits = Math.abs(group.x - objective.x) <= vw * 0.8 && Math.abs(group.y - objective.y) <= vh * 0.8;
  return fits ? { x: (group.x + objective.x) / 2, y: (group.y + objective.y) / 2 } : group;
}

/** 让世界点 (wx, wy) 落在可见区正中的镜头中心（缩放 z，屏幕 w×h，vis 是可见区，CSS 像素） */
export function centerFor(wx: number, wy: number, vis: Rect, w: number, h: number, z: number): { cx: number; cy: number } {
  return { cx: wx - ((vis.l + vis.r) / 2 - w / 2) / z, cy: wy - ((vis.t + vis.b) / 2 - h / 2) / z };
}

/**
 * 自动构图的一帧（纯函数）：cur 是现在的镜头中心，tgt 是想去的（都是世界坐标），vw 是可见区的世界宽，dt 毫秒。
 * 没在挪时，偏差超过 vw × AUTO_DEAD 才起步（track = 一直跟，没有死区，护航跟船用）；挪起来就按指数逼近、限速，差到 vw × AUTO_SETTLE 以内停下。
 * 减弱动态（reduced）时只慢慢平移：逼近更慢、限速更低。
 */
export function autoStep(cur: { cx: number; cy: number }, tgt: { cx: number; cy: number }, moving: boolean, dt: number, vw: number, o: { reduced?: boolean; track?: boolean } = {}): { cx: number; cy: number; moving: boolean } {
  const dx = tgt.cx - cur.cx;
  const dy = tgt.cy - cur.cy;
  const d = Math.hypot(dx, dy);
  if (!moving && !o.track && d <= vw * AUTO_DEAD) return { cx: cur.cx, cy: cur.cy, moving: false };
  if (d <= vw * AUTO_SETTLE) return { cx: tgt.cx, cy: tgt.cy, moving: false };
  if (dt <= 0) return { cx: cur.cx, cy: cur.cy, moving };
  const rate = o.reduced ? 0.9 : 2.6;
  const cap = (o.reduced ? 0.35 : 1.1) * vw * (dt / 1000);
  const step = Math.min(d * (1 - Math.exp((-rate * dt) / 1000)), cap);
  return { cx: cur.cx + (dx / d) * step, cy: cur.cy + (dy / d) * step, moving: true };
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

/** enemy = 屏外的敌人；slot = 屏外能造塔的空木台；gate = 屏外的路口 / 关口旗（护航的敌人入口和下一个关口）；goal = 预告卡「先造 / 下一座造 / 升级」指的那块木台 */
export type EdgeKind = 'enemy' | 'slot' | 'gate' | 'crate' | 'goal';
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
const KIND_ORDER: Record<EdgeKind, number> = { enemy: 0, slot: 1, gate: 2, crate: 3, goal: 4 };

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

/**
 * 预告卡的金箭头别和别的指示叠在一起：同一段上的空木台小标让给它（指的多半就是那块），和敌人箭头靠得太近（< 一段）就顺着边往里挪一段
 */
export function goalClear(marks: EdgeMark[], view: Rect): EdgeMark[] {
  const g = marks.find((m) => m.kind === 'goal');
  if (!g) return marks;
  const near = (m: EdgeMark): boolean => m !== g && Math.abs(m.x - g.x) < EDGE_STEP && Math.abs(m.y - g.y) < EDGE_STEP;
  const out = marks.filter((m) => !(m.kind === 'slot' && near(m)));
  if (out.some(near)) {
    // 顺着它所在的边往可见区中线那边挪一段
    const along = g.side === 'l' || g.side === 'r' ? 'y' : 'x';
    const c = along === 'y' ? (view.t + view.b) / 2 : (view.l + view.r) / 2;
    g[along] += g[along] < c ? EDGE_STEP : -EDGE_STEP;
  }
  return out;
}
