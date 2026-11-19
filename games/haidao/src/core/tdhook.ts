/**
 * 守岛英雄的第三个技能：锚钩（规则版本 20，DESIGN 10.1）。钩住英雄射程外一圈内的一个敌人，按整数格朝英雄拉回最多几格，再定住一会儿；
 * 正往船上跑的也能钩回来，宝藏还在它身上。拉的路线和落点全是整数格运算（直线按 Bresenham 走格，斜走时两侧有一边挡住就算挡住，
 * 和流场 grid.ts 的规矩一样），同种子同操作逐位可复现。
 * 只在战役和海盗来袭、英雄 ≥ 8 级时有（hookEnabled）：悬赏守岛（实盘）、大潮（周榜）、护航都没有，那几种模式和规则 19 逐局一样。
 */
import { TD2_ENEMIES, TD2_HERO_SKILL } from '../content/td2units.ts';
import { cellIdx, cellX, cellY, inGrid } from './grid.ts';
import { RULES_SINCE, UNIT } from './types.ts';
import type { TdEnemy, TdEvent, TdSetup } from './tdtypes.ts';
import { HIT_HERO, barricadeAt, d2, ensureGrid, inner, isAir, targetable } from './tdstate.ts';
import type { TdState } from './tdstate.ts';
import { heroCd } from './tdevent.ts';

const HOOK = TD2_HERO_SKILL.hook;

/** 这一局有没有锚钩 */
export function hookEnabled(setup: Pick<TdSetup, 'rules' | 'mode'>, heroLevel: number): boolean {
  return setup.rules >= RULES_SINCE.tdHook && (setup.mode === 'campaign' || setup.mode === 'home') && heroLevel >= HOOK.level;
}

/** 钩得动吗：英雄的枪打得到（活着、看得见、不是 0 倍），不是首领（船长带光环、海盗王在海上），不是海上的船，没有正被钩着 */
export function hookable(s: TdState, e: TdEnemy): boolean {
  const def = TD2_ENEMIES[e.kind];
  return !def.shell && !def.aura && !e.hook && targetable(s, e, HIT_HERO);
}

/**
 * 拉回的路线：从敌人所在格朝 (tx, ty) 格按 Bresenham 一格一格走，最多 HOOK.cells 格，返回经过的格下标（不含起点）。
 * 不拉进英雄脚下那格；地面敌人碰到墙、建筑、水面、拒马挡的格就停在前一格，斜走时两侧任一格挡住也停（不从两格之间的缝挤过去）；飞的不挡。
 */
export function hookPath(s: TdState, e: TdEnemy, tx: number, ty: number): number[] {
  ensureGrid(s);
  const occ = inner(s).occ;
  const fly = isAir(e.kind);
  let cx = Math.floor(e.x / UNIT);
  let cy = Math.floor(e.y / UNIT);
  const dx = Math.abs(tx - cx);
  const dy = Math.abs(ty - cy);
  const sx = Math.sign(tx - cx);
  const sy = Math.sign(ty - cy);
  let err = dx - dy;
  const out: number[] = [];
  const blocked = (x: number, y: number): boolean => !inGrid(x, y) || (!fly && ((occ[cellIdx(x, y)] ?? 1) > 0 || !!barricadeAt(s, cellIdx(x, y))));
  while (out.length < HOOK.cells && (cx !== tx || cy !== ty)) {
    const e2 = 2 * err;
    let nx = cx;
    let ny = cy;
    if (e2 > -dy) {
      err -= dy;
      nx += sx;
    }
    if (e2 < dx) {
      err += dx;
      ny += sy;
    }
    if ((nx === tx && ny === ty) || blocked(nx, ny)) break;
    if (nx !== cx && ny !== cy && (blocked(nx, cy) || blocked(cx, ny))) break;
    out.push(cellIdx(nx, ny));
    cx = nx;
    cy = ny;
  }
  return out;
}

/** 放锚钩（操作 hook）：冷却好了、英雄活着、目标钩得动且在 range 内才生效 */
export function castHook(s: TdState, ev: TdEvent[], id: number): void {
  const h = s.hero;
  if (h.hookReady === undefined || h.respawn >= 0 || s.tick < h.hookReady) return;
  const e = s.enemies.find((q) => q.id === id);
  if (!e || !hookable(s, e) || d2(e.x, e.y, h.x, h.y) > HOOK.range * HOOK.range) return;
  const cells = hookPath(s, e, Math.floor(h.x / UNIT), Math.floor(h.y / UNIT));
  const at = s.tick + HOOK.fly;
  const until = at + cells.length * HOOK.perCell + HOOK.stun;
  // 钩上到拉完都不走不打；不走 applyStun：锚钩不吃也不给免控，免得和震荡炮互相抵掉
  e.stunUntil = Math.max(e.stunUntil ?? 0, until);
  if (cells.length > 0) e.hook = { cells, at };
  // 拉过之后旧的足迹不作数（鱼叉的拖拽按足迹往回拉，不能把它又拽回钩之前的地方）
  e.trail.length = 0;
  h.hookReady = s.tick + heroCd(s, HOOK.cd);
  ev.push({
    type: 'hook', id: e.id, x0: h.x, y0: h.y, x1: e.x, y1: e.y, t1: at,
    path: cells.flatMap((c) => [cellX(c), cellY(c)]), until, ready: h.hookReady,
  });
  ev.push({ type: 'hero', what: 'hook' });
}

/** 被钩着的敌人这一拍（代替它自己走）：钩子还在飞就不动；之后每 perCell 拍拖完一格，每拍每个轴最多挪 UNIT / perCell，到最后一格中心就放开 */
export function stepHooked(s: TdState, e: TdEnemy): void {
  const hk = e.hook as NonNullable<TdEnemy['hook']>;
  if (s.tick < hk.at) return;
  const k = Math.min(hk.cells.length - 1, Math.floor((s.tick - hk.at) / HOOK.perCell));
  const c = hk.cells[k] as number;
  const tx = cellX(c);
  const ty = cellY(c);
  const st = Math.ceil(UNIT / HOOK.perCell);
  const mx = Math.max(-st, Math.min(st, tx - e.x));
  const my = Math.max(-st, Math.min(st, ty - e.y));
  if (mx !== 0) e.face = mx > 0 ? 1 : -1;
  e.x += mx;
  e.y += my;
  if (k === hk.cells.length - 1 && e.x === tx && e.y === ty) delete e.hook;
}

/** 宝藏箱几格内往里走的敌人值得钩（机器人用；再远塔还有时间打，钩了浪费冷却） */
const HOOK_NEAR_TREASURE = 3 * UNIT;

/**
 * 机器人挑谁钩（英雄够得着、钩得动的里面）：带着宝藏回船的，挑离它的船最近的；没有就挑离宝藏箱 HOOK_NEAR_TREASURE 内、离箱子最近的去抢的；
 * 都没有为 undefined。同距离取编号小的
 */
export function hookTarget(s: TdState): TdEnemy | undefined {
  const h = s.hero;
  const r2 = HOOK.range * HOOK.range;
  let best: TdEnemy | undefined;
  let bd = Number.POSITIVE_INFINITY;
  let carrier = false;
  for (const e of s.enemies) {
    if (d2(e.x, e.y, h.x, h.y) > r2 || !hookable(s, e)) continue;
    const isCarrier = e.mode === 'out' && e.carry > 0;
    if (carrier && !isCarrier) continue;
    let d: number;
    if (isCarrier) d = d2(e.x, e.y, e.hx, e.hy);
    else {
      if (e.mode !== 'in') continue;
      d = Number.POSITIVE_INFINITY;
      for (const tr of s.treasures) d = Math.min(d, d2(e.x, e.y, tr.x * UNIT + 50, tr.y * UNIT + 50));
      if (d > HOOK_NEAR_TREASURE * HOOK_NEAR_TREASURE) continue;
    }
    if (isCarrier && !carrier) {
      carrier = true;
      bd = Number.POSITIVE_INFINITY;
    }
    if (d < bd || (d === bd && best && e.id < best.id)) {
      bd = d;
      best = e;
    }
  }
  return best;
}
