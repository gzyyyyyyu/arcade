/**
 * 护航（DESIGN 第 12 节）的纯函数：船在哪、走多快、咬一口多疼、星数、结果、相遇点。
 * td.ts 的 `if (s.escort)` 分支调这里；这里不碰 td.ts 的值（只引类型），免得循环引用。
 * 全整数、不用随机和平台数学函数。常量和类型在 escorttypes.ts。
 */
import { isqrt } from './fmath.ts';
import { ESCORT_BITE_PCT, ESCORT_CELL, ESCORT_PACE, ESCORT_PIN_AT } from './escorttypes.ts';
import type { EscortDef, EscortResult, EscortState } from './escorttypes.ts';
import type { TdState } from './tdstate.ts';

/** 船的终点位置 */
export function escortEnd(def: EscortDef): number {
  return Math.max(0, (def.route.length - 1) * ESCORT_CELL);
}

/** 船此刻的连续坐标（1 格 = 100 单位，格子中心为准，两格之间线性插值）和所在航线下标 */
export function escortShip(es: EscortState): { x: number; y: number; index: number } {
  const route = es.def.route;
  const last = route.length - 1;
  const index = Math.min(last, Math.floor(es.pos / ESCORT_CELL));
  const a = route[index] as { x: number; y: number };
  const b = route[Math.min(last, index + 1)] as { x: number; y: number };
  const frac = index >= last ? 0 : es.pos - index * ESCORT_CELL;
  return {
    x: a.x * 100 + 50 + Math.floor(((b.x - a.x) * 100 * frac) / ESCORT_CELL),
    y: a.y * 100 + 50 + Math.floor(((b.y - a.y) * 100 * frac) / ESCORT_CELL),
    index,
  };
}

/** 本拍每拍前进多少位置单位：速度档，咬住 1 到 PIN-1 个减半，PIN 个及以上钉死 */
export function escortRate(es: EscortState): number {
  const base = ESCORT_PACE[es.pace];
  if (es.biters >= ESCORT_PIN_AT) return 0;
  if (es.biters >= 1) return Math.floor(base / 2);
  return base;
}

/** 到达时的星数：剩余血量百分比 ≥ stars[1] 3★，≥ stars[0] 2★，其余 1★ */
export function escortStars(hullPct: number, def: EscortDef): number {
  if (hullPct >= def.stars[1]) return 3;
  if (hullPct >= def.stars[0]) return 2;
  return 1;
}

/** 咬一口扣多少血 */
export function escortBite(dmg: number): number {
  return Math.floor((dmg * ESCORT_BITE_PCT) / 100);
}

export function escortHullPct(es: EscortState): number {
  return es.def.hull > 0 ? Math.max(0, Math.floor((es.hull * 100) / es.def.hull)) : 0;
}

/** 结果：到了才有星，沉了、没到都是 0★（走了几格另给，供 0★ 折算） */
export function escortResult(es: EscortState, ticks: number): EscortResult {
  const hullPct = escortHullPct(es);
  return {
    over: es.arrived || es.sunk,
    arrived: es.arrived,
    sunk: es.sunk,
    hullPct,
    cells: Math.floor(es.pos / ESCORT_CELL),
    total: Math.max(0, es.def.route.length - 1),
    stars: es.arrived ? escortStars(hullPct, es.def) : 0,
    ticks,
    mends: es.mends,
  };
}

/** 界面结算和机器人用：整局状态的护航结果（over 以整局为准，超时也算结束） */
export function escortResultOf(s: TdState): EscortResult {
  const es = s.escort as EscortState;
  return { ...escortResult(es, s.tick), over: s.over };
}

/**
 * 预告用的相遇点（只读，规则不用）：waveAt 是这一波还有多少拍开打，lane 是登陆口格子，speed 是先头敌人每拍走多少单位。
 * 按船当前速度档（不算咬住）推算：敌人从登陆口直线走向航线上第 i 格的时间，赶得上船到那一格的时间，就在那里相遇。
 * 返回第一个这样的航线下标；船停着就是停在当前格等它；一直追不上 -1。船越快越靠后。
 */
export function escortMeet(es: EscortState, waveAt: number, lane: { x: number; y: number }, speed: number): number {
  const route = es.def.route;
  const rate = ESCORT_PACE[es.pace];
  const from = Math.min(route.length - 1, Math.floor(es.pos / ESCORT_CELL));
  const sp = Math.max(1, speed);
  for (let i = from; i < route.length; i++) {
    const c = route[i] as { x: number; y: number };
    const dx = (c.x - lane.x) * 100;
    const dy = (c.y - lane.y) * 100;
    const te = Math.max(0, waveAt) + Math.floor(isqrt(dx * dx + dy * dy) / sp);
    // 船到第 i 格要多少拍；停着的船只会待在当前格
    if (rate === 0) {
      if (i === from) return i;
      continue;
    }
    const ts = Math.floor(Math.max(0, i * ESCORT_CELL - es.pos) / rate);
    if (te <= ts) return i;
  }
  return -1;
}
