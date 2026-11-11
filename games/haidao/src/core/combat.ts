import { isqrt } from './fmath.ts';

/**
 * 进攻和守岛共用的战斗规则（docs/v2.md 第 3 节）：寻敌锁定、提前量、飞行时间、同路错开。
 * 只认最小接口（id 和位置），不碰各自的状态；整数运算、按 id 定序，同样的输入一定同样的输出。
 */

/** 会动的东西：x、y 是这一拍的位置，px、py 是上一拍的（没有就当没动） */
export interface Mover {
  id: number;
  x: number;
  y: number;
  px?: number;
  py?: number;
}

/** 提前量最多往前估多远（3 格）：再远就是瞎猜，宁可落在身后 */
export const LEAD_MAX = 300;
/** 一拍里位移超过这么多算跳变（被拉回、传送），不按它估速度 */
const LEAD_JUMP = 30;

/** 距离平方是否在环形射程里（含两端） */
export function inRing(d2: number, range: number, minRange: number): boolean {
  return d2 <= range * range && d2 >= minRange * minRange;
}

/**
 * 寻敌：候选按 rank 升序（[优先级类, 同类里的先后]，最后按 id），排好的数组第一个就是这一发打的。
 * 锁定：上一个目标 lock 还在候选里、优先级类不比最好的低，就放回第一个接着打，
 * 不因为别的目标往前挪了一点、近了一点就换（塔来回换目标，玩家看着就是乱打）。
 */
export function rankTargets<T extends Mover>(cands: readonly T[], lock: number, rank: (u: T) => readonly [number, number]): T[] {
  if (cands.length <= 1) return cands.slice();
  const keyed = cands.map((u) => ({ u, k: rank(u) }));
  keyed.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.u.id - b.u.id);
  const out = keyed.map((q) => q.u);
  if (lock >= 0 && out.length > 1) {
    const i = keyed.findIndex((q) => q.u.id === lock);
    if (i > 0 && (keyed[i] as { k: readonly [number, number] }).k[0] <= (keyed[0] as { k: readonly [number, number] }).k[0]) {
      const [held] = out.splice(i, 1);
      out.unshift(held as T);
    }
  }
  return out;
}

/**
 * 锁定的快速判断（装填中用，不排序）：lock 还在候选里、它的优先级类不比任何候选低，就返回它；否则返回 undefined，交给 rankTargets 重排
 */
export function keepLock<T extends Mover>(cands: readonly T[], lock: number, cls: (u: T) => number): T | undefined {
  if (lock < 0) return undefined;
  const held = cands.find((u) => u.id === lock);
  if (!held) return undefined;
  const c = cls(held);
  for (const u of cands) if (cls(u) < c) return undefined;
  return held;
}

/** 飞行拍数：距离 / 每拍速度，向上取整，至少 2 拍（让画面来得及播出膛） */
export function flightTicks(x0: number, y0: number, x1: number, y1: number, speed: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return Math.max(2, Math.ceil(isqrt(dx * dx + dy * dy) / speed));
}

/** 提前量：按目标这一拍走了多少，估 fl 拍后它在哪（最多 LEAD_MAX）；炸的打这个点，直射的追着目标走不用它 */
export function leadPoint(u: Mover, fl: number, max = LEAD_MAX): { x: number; y: number } {
  const vx = u.px === undefined ? 0 : u.x - u.px;
  const vy = u.py === undefined ? 0 : u.y - u.py;
  if (vx * vx + vy * vy > LEAD_JUMP * LEAD_JUMP) return { x: u.x, y: u.y };
  let dx = vx * fl;
  let dy = vy * fl;
  const d = isqrt(dx * dx + dy * dy);
  if (d > max) {
    dx = Math.floor((dx * max) / d);
    dy = Math.floor((dy * max) / d);
  }
  return { x: u.x + dx, y: u.y + dy };
}

/**
 * 同一条路上按 id 错开：横竖各 5 档（-2..2）× spread。横向用 id、竖向用 id×3，相邻的 id 横竖都不同档，
 * 走同一串格子的不会叠成一个点。
 */
export function laneOffset(id: number, spread: number): { x: number; y: number } {
  const m = (v: number): number => ((v % 5) + 5) % 5 - 2;
  return { x: m(id) * spread, y: m(id * 3) * spread };
}

/** 会被震晕的东西：stunUntil 之前不走不打，immuneUntil 之前不能再被震 */
export interface Stunnable {
  stunUntil?: number;
  immuneUntil?: number;
}

/** 震晕之后的免控时长 = 震晕时长 × 这个倍数（DESIGN 13：不会被连着定住） */
export const STUN_IMMUNE_MUL = 2;

/**
 * 震晕（进攻的兵、驻岛英雄、守岛敌人共用）：免控中不震，返回 -1；否则写上 stunUntil、immuneUntil，返回 stunUntil。
 * half：英雄、首领、船长只震一半时长（免控也按减半后的时长算）。
 */
export function applyStun(u: Stunnable, now: number, ticks: number, half: boolean): number {
  if (now < (u.immuneUntil ?? 0) || ticks <= 0) return -1;
  const d = half ? Math.max(1, Math.floor(ticks / 2)) : ticks;
  u.stunUntil = now + d;
  u.immuneUntil = now + d + d * STUN_IMMUNE_MUL;
  return u.stunUntil;
}

/** 这一拍是不是被震晕着 */
export function stunned(u: Stunnable, now: number): boolean {
  return now < (u.stunUntil ?? 0);
}

/** 狙击塔从锁定到开火的预警拍数（0.5 秒）：画面在这段时间画瞄准线，玩家看得懂下一发打谁（DESIGN 14） */
export const SNIPE_WARN = 10;

/**
 * 盾挡不挡得住：盾朝 (gx, gy)（单位向量 × 100），弹从 (sx, sy) 打向站在 (x, y) 的人，
 * 来向落在盾朝向 ±60° 以内算挡住（cos60 = 1/2：2·点积 ≥ |盾|·|来向|，整数运算）。
 * 打在自己身上（距离 0）或盾没朝向（0, 0）不算挡。
 */
export function shieldFaces(gx: number, gy: number, x: number, y: number, sx: number, sy: number): boolean {
  const dx = sx - x;
  const dy = sy - y;
  const d = isqrt(dx * dx + dy * dy);
  const g = isqrt(gx * gx + gy * gy);
  if (d === 0 || g === 0) return false;
  return 2 * (gx * dx + gy * dy) >= g * d;
}
