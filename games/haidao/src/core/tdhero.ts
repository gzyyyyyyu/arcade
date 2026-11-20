/**
 * 守岛的英雄：出生和复活的位置、每拍的走位和开火、守点迎敌、自己挑站位（威胁最大那条路的路口）、护航时跟船。
 */
import { TD_PICK_R } from '../content/tdunits.ts';
import { TD2_ENEMIES } from '../content/td2units.ts';
import { inRing, rankTargets } from './combat.ts';
import { INF, cellIdx, cellOf, cellX, cellY, inGrid, nextCell } from './grid.ts';
import { UNIT } from './types.ts';
import type { EscortState } from './escorttypes.ts';
import { escortShip } from './escort.ts';
import type { TdEnemy, TdEvent } from './tdtypes.ts';
import { inner, HIT_HERO, tdHeroStats, d2, ensureGrid, cellFlow, targetable, damageBlock, moveToward, cliffOn } from './tdstate.ts';
import type { TdState } from './tdstate.ts';
import { tdLanes, tdRoute, laneOf, laneCell } from './tdquery.ts';

/** 英雄守点：守点周围多远（单位）的敌人他会主动迎上去打 */
export const TD_HERO_GUARD = 450;

/** 英雄迎敌时，离敌人多近就站住开火（射程的几分之几，留一点余量免得在射程边上进进出出） */
const TD_HERO_STAND_PCT = 80;

/** 自己守时多久重选一次站位（拍） */
const TD_HERO_AUTO_EVERY = 50;

/** 自己守的站位：那条路去宝藏的路线上，离宝藏还有几格（≈ 迎敌圈 4.5 格，站在路口也罩得住宝藏） */
const TD_HERO_AUTO_BACK = 4;

export function placeHero(s: TdState): void {
  ensureGrid(s);
  const occ = inner(s).occ;
  if (s.escort) {
    // 护航：英雄出生、复活都在船边（船所在格，被占就找四周）
    const sh = escortShip(s.escort);
    const bx = Math.floor(sh.x / UNIT);
    const by = Math.floor(sh.y / UNIT);
    for (const [ox, oy] of [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      if (!inGrid(s.ext, bx + ox, by + oy) || occ[cellIdx(bx + ox, by + oy)] !== 0) continue;
      s.hero.x = (bx + ox) * UNIT + 50;
      s.hero.y = (by + oy) * UNIT + 50;
      return;
    }
    return;
  }
  const t = s.treasures[0] as { x: number; y: number };
  for (const [ox, oy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    if (!inGrid(s.ext, t.x + ox, t.y + oy) || occ[cellIdx(t.x + ox, t.y + oy)] !== 0) continue;
    s.hero.x = (t.x + ox) * UNIT + 50;
    s.hero.y = (t.y + oy) * UNIT + 50;
    return;
  }
}


/** 护航英雄跟随：每 10 拍把目标设到船旁边一个能站的格 */
function followShip(s: TdState): void {
  const es = s.escort as EscortState;
  const h = s.hero;
  if (!es.follow || s.tick % 10 !== 0 || h.respawn >= 0 || h.clear >= 0) return;
  ensureGrid(s);
  const occ = inner(s).occ;
  const ship = escortShip(es);
  const bx = Math.floor(ship.x / UNIT);
  const by = Math.floor(ship.y / UNIT);
  for (const [ox, oy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]] as const) {
    if (!inGrid(s.ext, bx + ox, by + oy) || occ[cellIdx(bx + ox, by + oy)] !== 0) continue;
    const gx = (bx + ox) * UNIT + 50;
    const gy = (by + oy) * UNIT + 50;
    if (d2(gx, gy, h.x, h.y) > 60 * 60) h.goal = { x: gx, y: gy };
    return;
  }
}

export function stepHero(s: TdState, ev: TdEvent[]): void {
  const h = s.hero;
  const I = inner(s);
  const hl = tdHeroStats(h.level, h.kind);
  if (h.respawn >= 0) {
    if (s.tick < h.respawn) return;
    h.respawn = -1;
    h.hp = h.maxHp;
    placeHero(s);
    I.heroCmd = false;
    h.post = undefined;
    ev.push({ type: 'hero', what: 'up' });
    return;
  }
  if (s.escort) followShip(s);
  if (!s.escort && !I.heroCmd && s.tick % TD_HERO_AUTO_EVERY === 0) {
    const p = autoPost(s);
    if (p) h.post = p;
  }
  // 玩家手动指了地方（或清障）就听玩家的；守点逻辑只在没有手动指令时接管
  if ((!h.goal || I.heroAuto) && h.clear < 0 && !s.escort?.follow) heroGuard(s, hl.range);
  // 捡地上的宝藏：直接送回宝藏箱
  for (let i = s.piles.length - 1; i >= 0; i--) {
    const p = s.piles[i] as TdState['piles'][number];
    if (d2(p.x, p.y, h.x, h.y) > TD_PICK_R * TD_PICK_R) continue;
    s.vault += p.n;
    s.piles.splice(i, 1);
    ev.push({ type: 'pickup', n: p.n });
  }
  // 清障碍
  const blk = h.clear >= 0 ? s.blocks.find((b) => b.id === h.clear && !b.destroyed) : undefined;
  if (h.clear >= 0 && !blk) {
    h.clear = -1;
    h.goal = null;
  }
  if (blk) {
    const nx = Math.max(blk.x * UNIT, Math.min((blk.x + blk.size) * UNIT, h.x));
    const ny = Math.max(blk.y * UNIT, Math.min((blk.y + blk.size) * UNIT, h.y));
    if (d2(nx, ny, h.x, h.y) <= hl.range * hl.range) {
      h.goal = null;
      if (s.tick >= h.cd) {
        h.cd = s.tick + hl.reload;
        damageBlock(s, ev, blk, hl.dmg * 2);
        if (blk.destroyed) h.clear = -1;
      }
      return;
    }
  }
  if (h.goal) {
    const goalCell = cellOf(h.goal.x, h.goal.y);
    const f = cellFlow(s, goalCell, 0);
    const here = f[cellOf(h.x, h.y)] as number;
    if (here === 0 || here >= INF) {
      // 到了（或走不到）：在终点格里直走到点上
      const face = { x: h.x, y: h.y, face: 1 as 1 | -1 };
      if (here === 0 && (I.occ[goalCell] ?? 0) === 0) moveToward(face, h.goal.x, h.goal.y, hl.speed);
      h.x = face.x;
      h.y = face.y;
      if (here >= INF || d2(h.x, h.y, h.goal.x, h.goal.y) <= 10 * 10 || (I.occ[goalCell] ?? 0) !== 0) h.goal = null;
    } else {
      const n = nextCell(I.occ, s.ext, f, h.x, h.y);
      if (n >= 0) {
        const face = { x: h.x, y: h.y, face: 1 as 1 | -1 };
        moveToward(face, cellX(n), cellY(n), hl.speed);
        h.x = face.x;
        h.y = face.y;
      }
    }
  }
  // 自动打射程内的：拿着宝藏的先打，其次最近的，锁住上一个（枪弹：能打飞的；雾船在身边 2 格内自然被照亮）
  const cand: TdEnemy[] = [];
  for (const e of s.enemies) if (inRing(d2(e.x, e.y, h.x, h.y), hl.range, 0) && targetable(s, e, HIT_HERO)) cand.push(e);
  const best = rankTargets(cand, h.aim, (e) => [e.carry > 0 ? 0 : 1, d2(e.x, e.y, h.x, h.y)])[0];
  h.aim = best ? best.id : -1;
  if (best && s.tick >= h.cd) {
    h.cd = s.tick + hl.reload;
    // 英雄的开火事件 id 记 -1（没有这座塔），画面据此播英雄的枪口火光和弹道
    ev.push({ type: 'shoot', id: -1, x0: h.x, y0: h.y, x1: best.x, y1: best.y, t1: s.tick + 4, target: best.id });
    // 断崖关：英雄的枪也写出膛点，盾兵正面照样挡（td.ts 的 guardedHit），英雄不是盾兵的万能解；别的关不写
    const from = cliffOn(s) ? { sx: h.x, sy: h.y } : {};
    I.pend.push({ t: s.tick + 4, kind: 'unit', id: best.id, dmg: hl.dmg, x: best.x, y: best.y, r: 0, hit: HIT_HERO, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0, ...from });
  }
}

/**
 * 英雄守点（每 5 拍判一次）：守点 TD_HERO_GUARD 内有能打的敌人，就朝离自己最近的那个走到射程的 TD_HERO_STAND_PCT% 以内再站住开火；
 * 没有了就回守点。只追守点附近的，不会被一路引到岛的另一头；手动走位会改守点。
 */
export function heroGuard(s: TdState, range: number): void {
  if (s.tick % 5 !== 0) return;
  const h = s.hero;
  const I = inner(s);
  const post = h.post ?? { x: h.x, y: h.y };
  const g2 = TD_HERO_GUARD * TD_HERO_GUARD;
  let best: TdEnemy | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const e of s.enemies) {
    if (d2(e.x, e.y, post.x, post.y) > g2 || !targetable(s, e, HIT_HERO)) continue;
    const d = d2(e.x, e.y, h.x, h.y);
    if (d < bd || (d === bd && best && e.id < best.id)) {
      bd = d;
      best = e;
    }
  }
  const stand = Math.floor((range * TD_HERO_STAND_PCT) / 100);
  if (best) {
    // 站在木台上不停下，接着朝敌人走，走出木台再站住
    if (bd > stand * stand || onSlot(s, h.x, h.y) >= 0) {
      h.goal = { x: best.x, y: best.y };
      I.heroAuto = true;
    } else if (I.heroAuto) {
      h.goal = null;
      I.heroAuto = false;
    }
    return;
  }
  if (d2(h.x, h.y, post.x, post.y) > 40 * 40) {
    h.goal = { x: post.x, y: post.y };
    I.heroAuto = true;
  } else if (I.heroAuto) {
    h.goal = null;
    I.heroAuto = false;
  }
}

/** 点 (x, y)（单位）压在哪块木台上：和 tdBuildBlock 的英雄判定同一个范围（台中心 ±100 内）；不压为 -1 */
export function onSlot(s: TdState, x: number, y: number): number {
  return s.slots.findIndex((sl) => Math.abs(x - (sl.x * UNIT + 100)) < 100 && Math.abs(y - (sl.y * UNIT + 100)) < 100);
}

/** 把一个点挪出木台：沿离台中心远的那根轴推到台外 10 单位；推出去又压到别的台就再推（最多 3 次） */
export function offSlot(s: TdState, x: number, y: number): { x: number; y: number } {
  for (let k = 0; k < 3; k++) {
    const sl = s.slots[onSlot(s, x, y)];
    if (!sl) break;
    const cx = sl.x * UNIT + 100;
    const cy = sl.y * UNIT + 100;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(dx) > Math.abs(dy)) x = cx + (dx > 0 ? 110 : -110);
    else y = cy + (dy >= 0 ? 110 : -110);
  }
  return { x, y };
}

/** 威胁最大的那条路（下标同 laneOf）：场上的敌人按登陆点归路、按剩余血量加；场上没敌人看下一波各路的总血；都没有为 -1，平手取下标小的 */
function threatLane(s: TdState): number {
  const lv = s.level;
  const n = lv.lanes.length + (lv.tide ? 1 : 0);
  const w = new Array<number>(n).fill(0);
  let any = false;
  for (const e of s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    let bl = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let l = 0; l < n; l++) {
      const c = laneCell(lv, l);
      if (!c) continue;
      const d = d2(e.hx, e.hy, c.x * UNIT + 50, c.y * UNIT + 50);
      if (d < bd) {
        bd = d;
        bl = l;
      }
    }
    w[bl] = (w[bl] ?? 0) + e.hp;
    any = true;
  }
  const wave = lv.waves[s.wave];
  if (!any && wave) for (const g of wave.groups) {
    const l = laneOf(s, g.lane, s.wave);
    w[l] = (w[l] ?? 0) + g.n * TD2_ENEMIES[g.enemy].hp;
  }
  let best = -1;
  for (let l = 0; l < n; l++) if ((w[l] ?? 0) > 0 && (best < 0 || (w[l] ?? 0) > (w[best] ?? 0))) best = l;
  return best;
}

/**
 * 自己守的站位：威胁最大那条路去宝藏的路线上的路口——和别的开着的路汇合的第一格；汇合点离宝藏比 TD_HERO_AUTO_BACK 格远（或只有这一条路）
 * 就取离宝藏 TD_HERO_AUTO_BACK 格的那格（已经在汇合之后，几路都从这里过）。压着木台或被占就往路线上游找，再找下游；找不到为 null。
 * 不站在一条路离宝藏 4 格的地方而让别的路从旁边摸宝藏：那样不走位的玩家反而丢三星（td06 实测 100% → 1%）。
 */
function autoPost(s: TdState): { x: number; y: number } | null {
  const l = threatLane(s);
  const c = l >= 0 ? laneCell(s.level, l) : undefined;
  if (!c) return null;
  const cells = tdRoute(s, c.x, c.y);
  if (cells.length === 0) return null;
  const occ = inner(s).occ;
  const others = new Set<number>();
  for (const o of tdLanes(s)) if (o.x !== c.x || o.y !== c.y) for (const q of tdRoute(s, o.x, o.y)) others.add(q);
  let k0 = Math.max(0, cells.length - 1 - TD_HERO_AUTO_BACK);
  if (others.size > 0) {
    const m = cells.findIndex((q) => others.has(q));
    k0 = Math.max(k0, m < 0 ? cells.length - 1 : m);
  }
  const ok = (k: number): { x: number; y: number } | null => {
    const cell = cells[k] as number;
    const x = cellX(cell);
    const y = cellY(cell);
    return (occ[cell] ?? 1) === 0 && onSlot(s, x, y) < 0 ? { x, y } : null;
  };
  for (let k = k0; k >= 0; k--) {
    const p = ok(k);
    if (p) return p;
  }
  for (let k = k0 + 1; k < cells.length; k++) {
    const p = ok(k);
    if (p) return p;
  }
  return null;
}
