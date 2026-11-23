/**
 * 水手营（守岛的兵营塔）：造在木台上，放出几名水兵站到集结点（营 3 格内的路上），拦住走过来的地面敌人，
 * 每个兵缠住 1 个（重盾队 2 个），被拦住的敌人原地打兵（用自己的 dmg、reach，和打英雄同一套）；飞的不拦。兵倒下按阶复活。
 * 只在战役和海盗来袭、setup.camp 时有（campEnabled）；没造营的局不建状态、不进指纹。
 * 兵不占格、不挡流场（挡人靠「缠住」，和英雄一样），按营的 id 和兵的序号定序，全整数，不用随机。
 */
import { TD2_CAMP, TD2_CAMP_BRANCH } from '../content/tdcamp.ts';
import type { TdCampBranch } from '../content/tdcamp.ts';
import { TD2_ENEMIES, TD2_UP_PCT } from '../content/td2units.ts';
import { cellIdx, cellX, cellY, inGrid } from './grid.ts';
import { UNIT } from './types.ts';
import type { TdTier } from './td2types.ts';
import type { TdEnemy, TdEvent, TdSetup } from './tdtypes.ts';
import { d2, ensureGrid, inner, isAir, moveToward, targetable } from './tdstate.ts';
import type { Hit, TdState } from './tdstate.ts';
import { tdRoutes } from './tdquery.ts';

/** 一名水兵（x、y 是单位）。respawn：倒下时为复活的拍，活着为 -1；foes：正缠着的敌人 id（近战），远程兵为空 */
export interface TdSoldier {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  respawn: number;
  foes: number[];
  cd: number;
  face: 1 | -1;
}

/** 一座水手营：在第几块木台、阶、分叉、集结点（单位）、兵 */
export interface TdCamp {
  id: number;
  slot: number;
  tier: TdTier;
  branch?: TdCampBranch;
  rx: number;
  ry: number;
  men: TdSoldier[];
}

export const HIT_SOLDIER: Hit = { dt: 'shot', branch: [], heavy: 0 };

/** 这一局能不能造水手营：战役和海盗来袭，且开局给了（tdrun 按进度给） */
export function campEnabled(setup: Pick<TdSetup, 'mode' | 'camp'>): boolean {
  return (setup.mode === 'campaign' || setup.mode === 'home') && setup.camp === true;
}

/** 某块木台上的营（没有为 undefined） */
export function campAt(s: TdState, slot: number): TdCamp | undefined {
  return s.camps?.find((c) => c.slot === slot);
}

/** 升到下一阶要多少金；3 阶为 -1 */
export function campUpCost(c: TdCamp): number {
  return c.tier >= 3 ? -1 : Math.floor((TD2_CAMP.cost * (TD2_UP_PCT[c.tier - 1] as number)) / 100);
}

/** 某阶（带分叉）一个兵的满血 */
export function soldierHp(tier: TdTier, branch?: TdCampBranch): number {
  const hp = (TD2_CAMP.tiers[tier - 1] as { hp: number }).hp;
  return branch === 'camp.wall' ? Math.floor((hp * TD2_CAMP_BRANCH['camp.wall'].hpPct) / 100) : hp;
}

function soldierDmg(c: TdCamp): number {
  const d = (TD2_CAMP.tiers[c.tier - 1] as { dmg: number }).dmg;
  return c.branch === 'camp.gun' ? Math.floor((d * TD2_CAMP_BRANCH['camp.gun'].dmgPct) / 100) : d;
}

/** 一个兵最多缠几个（远程兵 0） */
function holdOf(c: TdCamp): number {
  return c.branch === 'camp.gun' ? 0 : c.branch === 'camp.wall' ? TD2_CAMP_BRANCH['camp.wall'].hold : 1;
}

/** 营（木台中心，单位） */
export function campCenter(s: TdState, c: TdCamp): { x: number; y: number } {
  const sl = s.slots[c.slot] as { x: number; y: number };
  return { x: sl.x * UNIT + 100, y: sl.y * UNIT + 100 };
}

/** 第 i 个兵在集结点上站哪（按序号排开：中、左、右、后） */
function postOf(c: TdCamp, i: number): { x: number; y: number } {
  const sp = TD2_CAMP.spread;
  const off = [[0, 0], [-sp, -sp], [sp, sp], [-sp, sp], [sp, -sp]][i % 5] as [number, number];
  return { x: c.rx + off[0], y: c.ry + off[1] };
}

/** 这一格能不能当集结点：在岛上、能走（不是墙、建筑、水面、木台上的塔） */
function walkable(s: TdState, cx: number, cy: number): boolean {
  ensureGrid(s);
  return inGrid(s.ext, cx, cy) && inner(s).occ[cellIdx(cx, cy)] === 0;
}

/** 集结点合不合法：离营中心 TD2_CAMP.rally 内、落在能走的格 */
export function rallyOk(s: TdState, slot: number, x: number, y: number): boolean {
  const sl = s.slots[slot];
  if (!sl || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const r = TD2_CAMP.rally;
  if (d2(sl.x * UNIT + 100, sl.y * UNIT + 100, x, y) > r * r) return false;
  return walkable(s, Math.floor(x / UNIT), Math.floor(y / UNIT));
}

/** 默认集结点：营 rally 范围内离营最近的路线格（格中心）；路线够不着就取范围内离路线最近的能走格；都没有就站营门口 */
export function defaultRally(s: TdState, slot: number): { x: number; y: number } {
  const sl = s.slots[slot] as { x: number; y: number };
  const cx = sl.x * UNIT + 100;
  const cy = sl.y * UNIT + 100;
  const r2 = TD2_CAMP.rally * TD2_CAMP.rally;
  let best: { x: number; y: number } | null = null;
  let bd = Number.POSITIVE_INFINITY;
  const route: Array<{ x: number; y: number }> = [];
  for (const line of tdRoutes(s)) {
    for (const c of line.cells) {
      const p = { x: cellX(c), y: cellY(c) };
      route.push(p);
      const d = d2(cx, cy, p.x, p.y);
      if (d <= r2 && d < bd && walkable(s, Math.floor(p.x / UNIT), Math.floor(p.y / UNIT))) {
        bd = d;
        best = p;
      }
    }
  }
  if (best) return best;
  bd = Number.POSITIVE_INFINITY;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const gx = sl.x + 1 + dx;
      const gy = sl.y + 1 + dy;
      const p = { x: gx * UNIT + 50, y: gy * UNIT + 50 };
      if (d2(cx, cy, p.x, p.y) > r2 || !walkable(s, gx, gy)) continue;
      let d = Number.POSITIVE_INFINITY;
      for (const q of route) d = Math.min(d, d2(q.x, q.y, p.x, p.y));
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  }
  return best ?? { x: cx, y: cy + 150 };
}

/** 造营：兵从营门口出来，满血 */
export function newCamp(s: TdState, id: number, slot: number): TdCamp {
  const at = defaultRally(s, slot);
  const c: TdCamp = { id, slot, tier: 1, rx: at.x, ry: at.y, men: [] };
  const sl = s.slots[slot] as { x: number; y: number };
  const hp = soldierHp(1);
  for (let i = 0; i < TD2_CAMP.men; i++) c.men.push({ x: sl.x * UNIT + 100, y: sl.y * UNIT + 100, hp, maxHp: hp, respawn: -1, foes: [], cd: s.tick, face: 1 });
  return c;
}

/** 升阶、选分叉后：活着的兵按新满血补上差值 */
export function refitCamp(c: TdCamp): void {
  const hp = soldierHp(c.tier, c.branch);
  for (const m of c.men) {
    if (m.respawn < 0) m.hp = Math.min(hp, m.hp + Math.max(0, hp - m.maxHp));
    m.maxHp = hp;
    if (c.branch === 'camp.gun') m.foes = [];
  }
}

/** 敌人能被兵拦吗：地面、活着、不是海上的船 */
function blockable(e: TdEnemy): boolean {
  return (e.mode === 'in' || e.mode === 'out') && !isAir(e.kind) && !TD2_ENEMIES[e.kind].shell;
}

/**
 * 这一拍被兵缠住的敌人 → 缠住它的兵（营 id、兵序号）。只算兵活着、离敌人够近（敌人的 reach + 30，和英雄一样）的。
 * stepEnemies 用它让敌人停下打兵
 */
export function heldBy(s: TdState): Map<number, { camp: TdCamp; man: number }> {
  const out = new Map<number, { camp: TdCamp; man: number }>();
  if (!s.camps) return out;
  const byId = new Map<number, TdEnemy>();
  for (const e of s.enemies) byId.set(e.id, e);
  for (const c of s.camps) {
    c.men.forEach((m, i) => {
      if (m.respawn >= 0) return;
      for (const id of m.foes) {
        const e = byId.get(id);
        if (!e || !blockable(e) || out.has(id)) continue;
        const r = TD2_ENEMIES[e.kind].reach + 30;
        if (d2(m.x, m.y, e.x, e.y) <= r * r) out.set(id, { camp: c, man: i });
      }
    });
  }
  return out;
}

/** 敌人打兵：兵倒下就松开缠着的人，按阶的复活时间回来 */
export function hitSoldier(s: TdState, ev: TdEvent[], c: TdCamp, i: number, dmg: number): void {
  const m = c.men[i];
  if (!m || m.respawn >= 0) return;
  m.hp -= dmg;
  if (m.hp > 0) return;
  m.hp = 0;
  m.foes = [];
  m.respawn = s.tick + (TD2_CAMP.tiers[c.tier - 1] as { respawn: number }).respawn;
  ev.push({ type: 'soldier', camp: c.id, man: i, what: 'down', x: m.x, y: m.y });
}

/**
 * 每拍：复活到点的兵回集结点；近战兵挑集结点 guard 内还没被缠满的地面敌人（先挑没人缠的、离集结点近的，同距按 id），走过去缠住、每 reload 拍砍一下；
 * 火枪队站在自己的位置打 range 内最近的敌人（能打飞的）。伤害用 damage 回调（td.ts 的直射结算，盾、鼓、克制照算）
 */
export function stepCamps(s: TdState, ev: TdEvent[], damage: (e: TdEnemy, dmg: number, x: number, y: number) => void): void {
  if (!s.camps) return;
  const claimed = new Map<number, number>();
  for (const c of s.camps) for (const m of c.men) if (m.respawn < 0) for (const id of m.foes) claimed.set(id, (claimed.get(id) ?? 0) + 1);
  const g2 = TD2_CAMP.guard * TD2_CAMP.guard;
  for (const c of s.camps) {
    const hold = holdOf(c);
    const dmg = soldierDmg(c);
    c.men.forEach((m, i) => {
      const post = postOf(c, i);
      if (m.respawn >= 0) {
        if (s.tick < m.respawn) return;
        const at = campCenter(s, c);
        m.respawn = -1;
        m.hp = m.maxHp;
        m.x = at.x;
        m.y = at.y;
        m.cd = s.tick;
        ev.push({ type: 'soldier', camp: c.id, man: i, what: 'up', x: m.x, y: m.y });
      }
      if (hold === 0) {
        // 火枪队：站位不动，打射程内最近的（同距按 id）
        if (d2(m.x, m.y, post.x, post.y) > 10 * 10) moveToward(m, post.x, post.y, TD2_CAMP.speed);
        if (s.tick < m.cd) return;
        const rg = TD2_CAMP_BRANCH['camp.gun'].range;
        let tgt: TdEnemy | undefined;
        let bd = rg * rg + 1;
        for (const e of s.enemies) {
          if (!targetable(s, e, HIT_SOLDIER, 0)) continue;
          const d = d2(m.x, m.y, e.x, e.y);
          if (d < bd || (d === bd && tgt && e.id < tgt.id)) {
            bd = d;
            tgt = e;
          }
        }
        if (!tgt) return;
        m.cd = s.tick + TD2_CAMP.reload;
        ev.push({ type: 'shoot', id: -100 - c.id, x0: m.x, y0: m.y, x1: tgt.x, y1: tgt.y, t1: s.tick + 4, target: tgt.id });
        damage(tgt, dmg, m.x, m.y);
        return;
      }
      // 近战：松开死了的、走远了的
      m.foes = m.foes.filter((id) => {
        const e = s.enemies.find((q) => q.id === id);
        const keep = !!e && blockable(e) && d2(e.x, e.y, c.rx, c.ry) <= g2 * 4;
        if (!keep) claimed.set(id, (claimed.get(id) ?? 1) - 1);
        return keep;
      });
      while (m.foes.length < hold) {
        let pick: TdEnemy | undefined;
        let pk = Number.POSITIVE_INFINITY;
        for (const e of s.enemies) {
          if (!blockable(e) || m.foes.includes(e.id)) continue;
          const d = d2(e.x, e.y, c.rx, c.ry);
          if (d > g2) continue;
          // 先挑没人缠的（键里加一个大数），再挑近的，同距按 id
          const k = (claimed.get(e.id) ?? 0) * 100_000_000 + d;
          if (k < pk || (k === pk && pick && e.id < pick.id)) {
            pk = k;
            pick = e;
          }
        }
        if (!pick) break;
        m.foes.push(pick.id);
        claimed.set(pick.id, (claimed.get(pick.id) ?? 0) + 1);
      }
      const foe = m.foes.length > 0 ? s.enemies.find((q) => q.id === m.foes[0]) : undefined;
      if (!foe) {
        if (d2(m.x, m.y, post.x, post.y) > 10 * 10) moveToward(m, post.x, post.y, TD2_CAMP.speed);
        return;
      }
      const reach = TD2_CAMP.reach;
      if (d2(m.x, m.y, foe.x, foe.y) > reach * reach) {
        moveToward(m, foe.x, foe.y, TD2_CAMP.speed);
        return;
      }
      if (s.tick < m.cd) return;
      m.cd = s.tick + TD2_CAMP.reload;
      damage(foe, dmg, m.x, m.y);
    });
  }
}

/** 指纹用：营和兵的状态摊平 */
export function campPrint(s: TdState): number[] {
  const out: number[] = [];
  for (const c of s.camps ?? []) {
    out.push(c.id, c.slot, c.tier, c.branch === 'camp.gun' ? 1 : c.branch === 'camp.wall' ? 2 : 0, c.rx, c.ry);
    for (const m of c.men) out.push(m.x, m.y, m.hp, m.respawn, m.cd, ...m.foes, -1);
  }
  return out;
}
