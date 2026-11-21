/**
 * 下船登陆的时间线和位移（纯函数，只动画面）：木筏滑到浅水 → 兵一个个从筏上小跳下水 → 涉水几步上岸，接上正常走路。
 * 规则里兵在登陆那一拍就站在落点；这里只在开头约 1 秒里把"显示位置"从筏上一点点收敛到规则位置，
 * 收敛完偏差为 0，所以玩家不会觉得兵出来慢了。位置都是屏幕世界坐标（像素）。
 */
import { clamp01, easeOutCubic, easeOutQuad, lerp } from './motion.ts';

/** 木筏从海里滑到浅水的时长 */
export const SLIDE_MS = 320;
/** 一个兵从筏上跳到水里的时长、涉水到规则位置的时长 */
export const HOP_MS = 220;
export const WADE_MS = 240;
/** 最后一个兵比第一个晚起跳的上限；一船兵再多，整段也不超过 SLIDE + 这个 + HOP + WADE ≈ 1 秒 */
const STAGGER_MAX_MS = 220;
/** 相邻两个兵起跳的间隔上限（兵少时别拖） */
const STAGGER_STEP_MS = 60;
/** 筏停在落点外多远（屏幕像素，朝海里） */
export const RAFT_OFFSHORE = 46;
/** 兵落水的位置在落点外多远 */
const SHALLOW_OFFSHORE = 24;
/** 跳起的高度 */
export const HOP_H = 12;
/** 筏退走的距离和淡出时长 */
const RAFT_LEAVE_PX = 36;
const RAFT_FADE_MS = 360;

export interface V2 {
  x: number;
  y: number;
}

/** 第 i 个兵起跳的时刻（相对登陆那一刻） */
export function hopStart(i: number, n: number): number {
  const gap = n <= 1 ? 0 : Math.min(STAGGER_STEP_MS, STAGGER_MAX_MS / (n - 1));
  return SLIDE_MS + i * gap;
}

/** 第 i 个兵整段演完的时刻 */
export function endOf(i: number, n: number): number {
  return hopStart(i, n) + HOP_MS + WADE_MS;
}

/** 整船的兵都下完（可以让筏退走）的时刻 */
export function allOffAt(n: number): number {
  return hopStart(Math.max(0, n - 1), n) + HOP_MS;
}

/** 整段总时长（最后一个兵上岸） */
export function totalMs(n: number): number {
  return endOf(Math.max(0, n - 1), n);
}

/** 筏的位置：t < SLIDE 从海里滑进（收速），之后停住；兵全下完后往海里退一小段 */
export function raftPos(out: V2, t: number, from: V2, to: V2, n: number, away: V2): V2 {
  const k = easeOutCubic(t / SLIDE_MS);
  const leave = easeOutQuad((t - allOffAt(n)) / RAFT_FADE_MS) * RAFT_LEAVE_PX;
  out.x = lerp(from.x, to.x, k) + away.x * leave;
  out.y = lerp(from.y, to.y, k) + away.y * leave;
  return out;
}

/** 筏的透明度：一出现就不透明（兵坐在上面，淡入会让兵像飘在水上），兵全下完后淡出 */
export function raftAlpha(t: number, n: number): number {
  return 1 - clamp01((t - allOffAt(n)) / RAFT_FADE_MS);
}

/** 筏上第 i 个兵的站位（沿筏身一字排开，相对筏中心） */
export function deckSlot(out: V2, i: number, n: number): V2 {
  const k = n <= 1 ? 0 : i / (n - 1) - 0.5;
  out.x = k * 46;
  out.y = -8 + k * 23 + (i % 2 ? 7 : -3);
  return out;
}

export interface Disp {
  /** 显示位置（屏幕世界坐标） */
  x: number;
  y: number;
  /** 身体抬高（正数 = 往上），压扁量 */
  oy: number;
  sq: number;
  /** 还站在筏上或在半空：走路循环不推进 */
  hold: boolean;
  /** 在水里涉水：脚下要溅水 */
  wading: boolean;
  /** 演完了，之后完全交给规则位置 */
  done: boolean;
}

/**
 * 第 i 个兵（共 n 个）在 t 毫秒时的显示位置。
 * raftNow 是此刻筏中心；shore 是落点（岸边）；away 是朝海里的单位向量；rule 是规则位置此刻的屏幕坐标。
 * 涉水阶段终点取"此刻"的规则位置，所以兵走起来之后也不会错开：到点时偏差一定是 0。
 */
export function disembark(out: Disp, t: number, i: number, n: number, raftNow: V2, shore: V2, away: V2, rule: V2): Disp {
  const s = hopStart(i, n);
  const slot = deckSlot(SLOT, i, n);
  out.oy = 0;
  out.sq = 0;
  out.hold = true;
  out.wading = false;
  out.done = false;
  if (t < s) {
    // 坐在筏上，筏晃一点点
    out.x = raftNow.x + slot.x;
    out.y = raftNow.y + slot.y + Math.sin(t / 90 + i) * 0.8;
    return out;
  }
  const hx = shore.x + away.x * SHALLOW_OFFSHORE;
  const hy = shore.y + away.y * SHALLOW_OFFSHORE;
  if (t < s + HOP_MS) {
    // 小跳：水平走直线，竖直一道抛物线
    const k = (t - s) / HOP_MS;
    const dx = shore.x + away.x * RAFT_OFFSHORE + slot.x;
    const dy = shore.y + away.y * RAFT_OFFSHORE + slot.y;
    out.x = lerp(dx, hx, easeOutQuad(k));
    out.y = lerp(dy, hy, easeOutQuad(k));
    out.oy = Math.sin(Math.PI * k) * HOP_H;
    return out;
  }
  const w = (t - s - HOP_MS) / WADE_MS;
  if (w >= 1) {
    out.x = rule.x;
    out.y = rule.y;
    out.hold = false;
    out.done = true;
    return out;
  }
  // 落水压扁一下再回弹，同时开始涉水
  const tl = t - s - HOP_MS;
  out.sq = tl < 120 ? Math.sin((tl / 120) * Math.PI) * 0.14 : 0;
  const k = easeOutQuad(w);
  out.x = lerp(hx, rule.x, k);
  out.y = lerp(hy, rule.y, k);
  out.hold = false;
  out.wading = true;
  return out;
}

const SLOT: V2 = { x: 0, y: 0 };
