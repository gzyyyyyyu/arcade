/**
 * 护航的纯函数（tests/escort-ui.test.ts 锁住）：商船在航线上的位置、画面按帧插值、走过的实线和没走的虚线、
 * 竖屏跟船的镜头落点、玩家一碰就停跟随。不依赖 Phaser 和 DOM。
 * 航线是格子序列（格子坐标，格心 +0.5）；位置 pos 是整数，1 格 = ESCORT_CELL。
 */
import { ESCORT_CELL } from '../core/escorttypes.ts';

export interface Pt { x: number; y: number }
export interface ShipPoint extends Pt {
  /** 航向（格坐标系里的单位向量；停在终点时沿用最后一段） */
  hx: number;
  hy: number;
}

/** 竖屏跟船：镜头往船前方多看几格 */
export const AHEAD_CELLS = 3;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** pos 处船的格坐标（格心）和航向；pos 夹在 0 .. 终点之间 */
export function shipPoint(route: readonly Pt[], pos: number): ShipPoint {
  const last = route.length - 1;
  if (last < 0) return { x: 0.5, y: 0.5, hx: 1, hy: 0 };
  if (last === 0) return { x: route[0]!.x + 0.5, y: route[0]!.y + 0.5, hx: 1, hy: 0 };
  const p = clamp(pos / ESCORT_CELL, 0, last);
  const i = Math.min(Math.floor(p), last - 1);
  const t = p - i;
  const a = route[i]!;
  const b = route[i + 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: a.x + 0.5 + dx * t, y: a.y + 0.5 + dy * t, hx: dx / len, hy: dy / len };
}

/** 画面插值：上一拍和这一拍的位置按这一拍走了多少（0..1）混合；停着或倒着走也不会越界 */
export function interpPos(prev: number, cur: number, frac: number): number {
  return prev + (cur - prev) * clamp(frac, 0, 1);
}

/** 船前方 cells 格的点（到终点为止），镜头看这里 */
export function aheadPoint(route: readonly Pt[], pos: number, cells = AHEAD_CELLS): Pt {
  const end = Math.max(0, route.length - 1) * ESCORT_CELL;
  const q = shipPoint(route, Math.min(end, pos + cells * ESCORT_CELL));
  return { x: q.x, y: q.y };
}

/** 从起点走到 pos 的折线（格坐标，终点是船的插值位置）：画实线用 */
export function pathTo(route: readonly Pt[], pos: number): Pt[] {
  if (route.length === 0) return [];
  const p = clamp(pos / ESCORT_CELL, 0, route.length - 1);
  const i = Math.floor(p);
  const out: Pt[] = [];
  for (let k = 0; k <= i; k++) out.push({ x: route[k]!.x + 0.5, y: route[k]!.y + 0.5 });
  if (p > i && i < route.length - 1) {
    const q = shipPoint(route, pos);
    out.push({ x: q.x, y: q.y });
  }
  return out;
}

/** 从 pos 走到终点的折线：画淡虚线用 */
export function pathFrom(route: readonly Pt[], pos: number): Pt[] {
  if (route.length === 0) return [];
  const p = clamp(pos / ESCORT_CELL, 0, route.length - 1);
  const i = Math.floor(p);
  const out: Pt[] = [];
  if (p > i) {
    const q = shipPoint(route, pos);
    out.push({ x: q.x, y: q.y });
  }
  for (let k = p > i ? i + 1 : i; k < route.length; k++) out.push({ x: route[k]!.x + 0.5, y: route[k]!.y + 0.5 });
  return out;
}

/** 把折线切成虚线段：每段 dash 长，空 gap；长度单位同点坐标 */
export function dashes(pts: readonly Pt[], dash: number, gap: number): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  if (pts.length < 2 || dash <= 0) return out;
  let on = true;
  let left = dash;
  let cur: Pt = pts[0]!;
  let start: Pt = cur;
  for (let k = 1; k < pts.length; k++) {
    const b = pts[k]!;
    let len = Math.hypot(b.x - cur.x, b.y - cur.y);
    const ux = len > 0 ? (b.x - cur.x) / len : 0;
    const uy = len > 0 ? (b.y - cur.y) / len : 0;
    while (len > 1e-9) {
      const step = Math.min(left, len);
      cur = { x: cur.x + ux * step, y: cur.y + uy * step };
      len -= step;
      left -= step;
      if (left <= 1e-9) {
        if (on) out.push([start, cur]);
        on = !on;
        left = on ? dash : gap;
        start = cur;
      }
    }
  }
  if (on && (start.x !== cur.x || start.y !== cur.y)) out.push([start, cur]);
  return out;
}

/** 预告里的相遇点：航线下标（追不上 -1 / 没有 undefined）→ 格坐标 */
export function meetPoint(route: readonly Pt[], meet: number | undefined): Pt | null {
  if (meet === undefined || meet < 0 || meet >= route.length) return null;
  const c = route[meet]!;
  return { x: c.x + 0.5, y: c.y + 0.5 };
}

/** 前方最近的隘口（航线下标）；都过了为 -1 */
export function nextGate(gates: readonly number[], passed: number): number {
  return gates[passed] ?? -1;
}

export interface View { cx: number; cy: number; z: number }

/** 让世界点 (wx, wy) 落在可见区正中的镜头中心（缩放 z，屏幕 w×h，vis 是可见区，CSS 像素） */
export function centerFor(wx: number, wy: number, vis: { l: number; t: number; r: number; b: number }, w: number, h: number, z: number): { cx: number; cy: number } {
  return { cx: wx - ((vis.l + vis.r) / 2 - w / 2) / z, cy: wy - ((vis.t + vis.b) / 2 - h / 2) / z };
}

/** 镜头平滑跟：每帧按指数逼近（rate 每秒），dt 毫秒；很近时直接到 */
export function followStep(cur: { cx: number; cy: number }, target: { cx: number; cy: number }, dt: number, rate = 5): { cx: number; cy: number } {
  const k = 1 - Math.exp((-rate * Math.max(0, dt)) / 1000);
  const dx = target.cx - cur.cx;
  const dy = target.cy - cur.cy;
  if (Math.hypot(dx, dy) < 0.5) return { cx: target.cx, cy: target.cy };
  return { cx: cur.cx + dx * k, cy: cur.cy + dy * k };
}

/** 镜头不是我们上次放的位置了 = 玩家拖、捏、滚轮过：停跟随 */
export function userMoved(set: View | null, now: View, eps = 0.75): boolean {
  if (!set) return false;
  return Math.abs(set.cx - now.cx) > eps || Math.abs(set.cy - now.cy) > eps || Math.abs(set.z - now.z) > 0.002;
}

/** "回到船"钮：竖屏跟船模式下，玩家停了跟随、这局还没结束 */
export function showBackToShip(live: boolean, following: boolean, over: boolean): boolean {
  return live && !following && !over;
}
