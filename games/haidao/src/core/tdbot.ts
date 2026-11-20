/**
 * 守岛的三种机器人（DESIGN 10.5、守岛 2.0），确定性：只看状态、界面也能看到的预告（tdPreview）和路线（tdRoutes），不读关卡的波次表。
 * - 小白：塔造在第一个能造的木台、种类和分叉随便选，英雄站在宝藏箱旁不动，不放技能，不叫波。
 * - 普通（稳）：先把木台都造上，按预告补克制的塔（建议的伤害类型、飞的要枪弹、雾里要灯塔），钱多了升阶、清沉船、卖掉不对路的塔；
 *   英雄捡宝藏、追拿着宝藏回船的、守最忙的路，扎堆放拒马和炸药桶；不叫波。
 * - 贪：造塔、升阶、清沉船、卖塔、英雄都和普通一样，区别只在每波打得只剩 2 个敌人以内就立刻叫下一波（拿叫波金、抵英雄冷却）。
 *   （旧版开局只造 2 座攒到第 5 波、有钱先升阶：那是机器人自己把自己饿死，不是玩法；叫波的条件太严也几乎从不触发）
 */
import { BRANCH_LEVEL, branchOptions } from '../content/branches.ts';
import { TD2_BATTERY, TD2_COST, TD2_ECON, TD2_ENEMIES, TD2_HERO_SKILL, TD2_NAV_SKILL, TD_SEA_RANGE, td2TierStats } from '../content/td2units.ts';
import { Rng } from './rng.ts';
import { createTd, stepTd, tdResult, tdUpCost } from './td.ts';
import { tdSluiceCan } from './tdmech.ts';
import { tdDareCan } from './tdevent.ts';
import { hookTarget } from './tdhook.ts';
import { tdClearCost, tdPreview, tdRoute, tdRoutes, tdSellRefund } from './tdquery.ts';
import { isqrt } from './fmath.ts';
import { cliffOn, tcx, tcy, tdBuildCost, tdBuildRange, tdHeroStats, tdTowerRange } from './tdstate.ts';
import { inRing } from './combat.ts';
import { SHIELD } from '../content/troops.ts';
import type { TdState } from './tdstate.ts';
import { cellX, cellY } from './grid.ts';
import { TD_ARMORS, TD_ENEMY_ARMOR, TD_TOWER_DAMAGE, counterPct, isTdTowerKind } from './td2types.ts';
import type { TdArmor, TdTowerKind, WavePreview } from './td2types.ts';
import { UNIT } from './types.ts';
import type { TdAction, TdEnemy, TdResult, TdSetup, TdTower } from './tdtypes.ts';

/**
 * novice 小白：塔随机挑、木台按顺序造、够钱就升最便宜的一档、不放技能、不指挥英雄（悬赏守岛档位表的量尺，别改它的打法）；
 * guided 照建议的新手：和小白一样，只是塔照预告卡的「建议」挑、先造离路近的木台（战役配平的新手线按它量，DESIGN 10.4 的验收目标）；
 * normal 稳、greedy 贪
 */
export type TdBotKind = 'novice' | 'guided' | 'normal' | 'greedy';

function d2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

const isAir = (e: { kind: keyof typeof TD_ENEMY_ARMOR }): boolean => TD_ENEMY_ARMOR[e.kind] === 'air';

/** 补防空先造哪种枪弹塔（便宜的在前） */
const BY_SHOT: readonly TdTowerKind[] = ['gunTower', 'harpoon'];

/** 预告里下两波的护甲占比（加起来）、有没有飞的、有没有要照亮的 */
export function outlook(s: TdState, pv: WavePreview[]): { share: Record<TdArmor, number>; air: boolean; fog: boolean } {
  const share: Record<TdArmor, number> = { cloth: 0, heavy: 0, wood: 0, air: 0 };
  let air = false;
  let fog = false;
  for (const p of pv) {
    for (const a of TD_ARMORS) share[a] += p.armorShare[a];
    for (const l of p.lanes) for (const e of l.enemies) {
      if (e.armor === 'air') air = true;
      if (e.fog) fog = true;
    }
  }
  // 最后一波开打后没有预告了：看场上的
  if (pv.length === 0) for (const e of s.enemies) if (e.mode === 'in' || e.mode === 'out') share[TD_ENEMY_ARMOR[e.kind]] += 1;
  return { share, air, fog };
}

const hits = (t: TdTower, armor: TdArmor): number => (isTdTowerKind(t.kind) ? counterPct(TD_TOWER_DAMAGE[t.kind], armor, t.branch) : 0);
const isLight = (t: TdTower): boolean => t.branch.includes('gunTower.lighthouse');
/** 灯塔够不够：雾区有几片就要几座（一座只照得到一段路），最多三座；只有雾船没有雾区时一座 */
const needLight = (s: TdState): boolean => s.towers.filter(isLight).length < Math.max(1, Math.min(3, s.level.fogZones?.length ?? 0));

/** 一种塔 1 阶时每 100 金的"有效输出"：秒伤 × 一次打几个（溅射按平均打到 2 个）× 射程（按 6 格折）÷ 造价。只用来给机器人排序 */
function towerValue(k: TdTowerKind): number {
  const t = td2TierStats(k, 1);
  // 狙击塔的 11 格射程机器人用不上（不会摆在后排专打船长），按 6 格算，免得它压过所有塔（DESIGN 14）
  const range = k === 'sniper' ? 600 : t.range;
  return Math.floor((t.dmg * 20 * t.shots * (t.splash > 0 ? 2 : 1) * range * 100) / (t.reload * 600 * TD2_COST[k]));
}

/**
 * 按预告挑塔：飞的没人打先补枪弹；要照亮的先补火枪（升 3 阶选灯塔）；
 * 否则给每种解锁的塔打分 = Σ 护甲占比 × 克制倍率 × 每 100 金有效输出，同种塔已经有几座就打几折（不会一种塔铺满）。
 */
export function counterKind(s: TdState, pv: WavePreview[]): TdTowerKind {
  const o = outlook(s, pv);
  const can = (k: TdTowerKind): boolean => s.unlocked.includes(k);
  // 飞的从东边绕后的关（flank）至少备三座能打飞的；预告里飞的占一成以上备两座，别的一座
  if (o.air && s.towers.filter((t) => t.slot >= 0 && hits(t, 'air') > 0).length < (s.level.flank ? 3 : o.share.air >= 12 ? 2 : 1)) {
    const k = BY_SHOT.find(can);
    if (k) return k;
  }
  if (o.fog && needLight(s) && s.towers.filter((t) => t.kind === 'gunTower' && t.slot >= 0).length < Math.max(1, Math.min(3, s.level.fogZones?.length ?? 0))) {
    if (can('gunTower')) return 'gunTower';
  }
  // 第四章：预告里有炮艇，木台上够得着海上的塔（射程 ≥ TD_SEA_RANGE）先凑够两座，在这几种里照常按克制挑；没有炮艇的关不走这条
  const sea = (k: TdTowerKind): boolean => td2TierStats(k, 1).range >= TD_SEA_RANGE;
  const pool = gunboatAhead(pv) && s.towers.filter((t) => t.slot >= 0 && sea(t.kind as TdTowerKind)).length < 2 && s.unlocked.some(sea) ? s.unlocked.filter(sea) : s.unlocked;
  let best: TdTowerKind = pool[0] ?? 'gunTower';
  let bestV = -1;
  const guard = cliffOn(s) ? shieldPct(pv) : 0;
  for (const k of pool) {
    let v = 0;
    for (const a of TD_ARMORS) v += (a === 'heavy' && guard > 0 && direct(k) ? Math.floor((o.share[a] * (100 - Math.floor((guard * (100 - SHIELD.frontPct)) / 200))) / 100) : o.share[a]) * counterPct(TD_TOWER_DAMAGE[k], a);
    const same = s.towers.filter((t) => t.kind === k && t.slot >= 0).length;
    v = Math.floor((v * towerValue(k)) / (2 + same));
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

/** 单体直射的塔（枪弹、炮弹、不溅射）：正面打盾兵会被挡 */
function direct(k: TdTowerKind): boolean {
  const dt = TD_TOWER_DAMAGE[k];
  return (dt === 'shot' || dt === 'shell') && td2TierStats(k, 1).splash === 0;
}

/**
 * 预告里重甲里盾兵占几成（按个数，百分比）：断崖关挑塔时，单体直射打重甲的那份按「一半时间打在盾正面」打折（counterKind）。
 * 只在断崖关算：海盗来袭也有盾兵，它的机器人照旧，回放逐位不变
 */
function shieldPct(pv: readonly WavePreview[]): number {
  let heavy = 0;
  let shield = 0;
  for (const w of pv) for (const l of w.lanes) for (const e of l.enemies) {
    if (e.armor !== 'heavy') continue;
    heavy += e.n;
    if (e.kind === 'shield') shield += e.n;
  }
  return heavy > 0 ? Math.floor((shield * 100) / heavy) : 0;
}

/** 预告的这两波里有没有停在海上的船（炮艇、海盗王） */
function gunboatAhead(pv: readonly WavePreview[]): boolean {
  return pv.some((w) => w.lanes.some((l) => l.enemies.some((e) => !!TD2_ENEMIES[e.kind].shell)));
}

/** 友军船值得叫吗：船好了、不在海上，海上停着至少 min 艘船（炮艇、海盗王；海盗王一艘就叫） */
function fleetWorth(s: TdState, min: number): boolean {
  const f = s.fleet;
  if (!f || f.sail || s.tick < f.ready) return false;
  let n = 0;
  for (const e of s.enemies) {
    if ((e.mode !== 'in' && e.mode !== 'out') || !TD2_ENEMIES[e.kind].shell) continue;
    if (e.kind === 'king') return true;
    n++;
  }
  return n >= min;
}

/** 一条地面路线被塔盖住多少："路线上的格 × 够得着它的塔"的对数（塔中心按占地中心、射程含最小射程） */
function coverage(s: TdState, cells: readonly number[]): number {
  let n = 0;
  for (const t of s.towers) {
    const { range, minRange } = tdTowerRange(s, t);
    const tx = t.x * UNIT + t.size * 50;
    const ty = t.y * UNIT + t.size * 50;
    for (const c of cells) {
      const d = d2(cellX(c), cellY(c), tx, ty);
      if (d <= range * range && d >= minRange * minRange) n++;
    }
  }
  return n;
}

/**
 * 水闸值不值得关（真人的想法：把敌人赶到自己塔多的那条路上）：下一波走落潮路的占这一波人数的四分之一以上，
 * 并且关闸后要改走的 0 号路被塔盖住的程度比落潮路多两成以上。只看人数就关会把敌人赶进没塔、有雾的路（td11 实测三星 37% → 5%）
 */
export function sluiceWorth(s: TdState, pv: WavePreview[]): boolean {
  const p = pv[0];
  if (!p || p.wave !== s.wave) return false;
  let all = 0;
  let tide = 0;
  for (const l of p.lanes) for (const e of l.enemies) {
    all += e.n;
    if (l.lane === s.level.lanes.length) tide += e.n;
  }
  if (all === 0 || tide * 4 < all) return false;
  const routes = tdRoutes(s);
  const main = routes.find((r) => r.lane === 0);
  const low = routes.find((r) => r.tide);
  if (!main || !low) return false;
  const a = coverage(s, main.cells);
  return a > 0 && a * 100 >= coverage(s, low.cells) * 120;
}

/**
 * 去捡这个补给箱安不安全：宝藏箱 8 格内没有地面敌人、没有拿着宝藏往回跑的、地上没有掉的宝藏（飞的不算，英雄在不在都拦不住），
 * 下一波开打前来得及走个来回，而且箱子离英雄 6 格以内（绕一下就回来；td06 的英雄站位一偏就漏，离开远了 200 局三星 100% → 87%）
 */
export function crateSafe(s: TdState, box: { x: number; y: number }): boolean {
  const tr = s.treasures[0];
  if (!tr || s.piles.length > 0) return false;
  if (d2(box.x, box.y, s.hero.x, s.hero.y) > 600 * 600) return false;
  const trip = Math.floor((2 * isqrt(d2(box.x, box.y, s.hero.x, s.hero.y))) / Math.max(1, tdHeroStats(s.hero.level, s.hero.kind).speed));
  if (s.next >= 0 && s.next - s.tick < trip) return false;
  const r = 8 * UNIT;
  for (const e of s.enemies) {
    if ((e.mode !== 'in' && e.mode !== 'out') || isAir(e)) continue;
    if (e.mode === 'out' && e.carry > 0) return false;
    if (d2(e.x, e.y, tr.x * UNIT + 50, tr.y * UNIT + 50) <= r * r) return false;
  }
  return true;
}

/**
 * 战书（规则版本 22）值不值得接：这一局还没丢过宝藏、木台全都造上了塔（没有空着的）。贪机器人不看，一律接。
 * 赏金船机器人不去追：追要反复改英雄的守点，追完回不到原来自己守的样子，误差比赏金本身大；塔打得到就拿
 */
export function dareWorth(s: TdState): boolean {
  return s.lost === 0 && s.slots.every((sl) => sl.tower >= 0 || sl.wreck !== undefined);
}

/**
 * 老炮往哪打：地面敌人里炸得到最多人的那一点（同样多取离宝藏近的，也就是走得最靠前的），够 min 个或圈里有船长才打；不值得为 null。
 * 飞的炸不到不算
 */
export function batteryTarget(s: TdState, min: number): { x: number; y: number } | null {
  const ground = s.enemies.filter((e) => (e.mode === 'in' || e.mode === 'out') && !isAir(e));
  const r2 = TD2_BATTERY.r * TD2_BATTERY.r;
  const tr = s.treasures[0];
  let best: { x: number; y: number } | null = null;
  let bn = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (const e of ground) {
    let n = 0;
    let boss = false;
    for (const o of ground) {
      if (d2(o.x, o.y, e.x, e.y) > r2) continue;
      n++;
      if (o.kind === 'captain') boss = true;
    }
    if (n < min && !boss) continue;
    const d = tr ? d2(e.x, e.y, tr.x * UNIT + 50, tr.y * UNIT + 50) : 0;
    if (n > bn || (n === bn && d < bd)) {
      bn = n;
      bd = d;
      best = { x: e.x, y: e.y };
    }
  }
  return best;
}

export function counterBranch(s: TdState, t: TdTower, tier: 1 | 2, pv: WavePreview[]): string | undefined {
  const opts = branchOptions(t.kind, tier);
  if (opts.length === 0) return undefined;
  if (tier === 2) return opts[0]?.id;
  const o = outlook(s, pv);
  if (t.kind === 'cannon') return o.share.heavy > 0 ? 'cannon.pierce' : o.share.wood > 0 ? 'cannon.grape' : 'cannon.chain';
  if (t.kind === 'gunTower') {
    if (o.fog && needLight(s)) return 'gunTower.lighthouse';
    if (o.air) return 'gunTower.marksman';
    return 'gunTower.rapid';
  }
  if (t.kind === 'mortar') return 'mortar.fire';
  if (t.kind === 'rocket') return o.air ? 'rocket.flak' : 'rocket.swarm';
  return opts[0]?.id;
}

/** 每个木台的打分：开着的地面路线经过的格子、预告里飞的直线，有几格在 6 格内 */
function slotScores(s: TdState, pv: WavePreview[]): number[] {
  const pts: Array<[number, number]> = [];
  const routes = tdRoutes(s);
  for (const r of routes) if (r.open) for (const c of r.cells) pts.push([cellX(c), cellY(c)]);
  const tr = s.treasures[0];
  for (const p of pv) {
    for (const l of p.lanes) {
      if (!l.fly || !tr) continue;
      const r = routes.find((q) => q.lane === l.lane);
      if (!r) continue;
      const x0 = r.x * UNIT + 50;
      const y0 = r.y * UNIT + 50;
      for (let k = 1; k <= 24; k++) pts.push([x0 + Math.floor(((tr.x * UNIT + 50 - x0) * k) / 24), y0 + Math.floor(((tr.y * UNIT + 50 - y0) * k) / 24)]);
    }
  }
  // 崖上的高台（断崖关）：打得远、崖下打不到，按高台的射程圈数路（只有断崖关的木台带 high，别的关逐位不变）
  const hi = tdBuildRange('gunTower', 1, true);
  return s.slots.map((sl) => {
    const cx = sl.x * UNIT + 100;
    const cy = sl.y * UNIT + 100;
    let n = 0;
    if (sl.high) for (const [px, py] of pts) n += inRing(d2(px, py, cx, cy), hi.range, hi.minRange) ? 1 : 0;
    else for (const [px, py] of pts) if (d2(px, py, cx, cy) <= 600 * 600) n++;
    return n;
  });
}

/**
 * 照建议的新手先造哪块空木台：离路最近（slotScores 最高），并列取序号小的；没有空木台（沉船压着的不算）返回 undefined。
 * 预告卡「下一座造」指的木台也读它（画面层的 nextStep）
 */
export function freeSlotPick(s: TdState, pv: WavePreview[], free = s.slots.flatMap((sl, i) => (sl.tower < 0 && sl.wreck === undefined ? [i] : []))): number | undefined {
  let i = free[0];
  if (i === undefined) return undefined;
  const sc = slotScores(s, pv);
  for (const j of free) if ((sc[j] ?? 0) > (sc[i] ?? 0)) i = j;
  return i;
}

export const towerOn = (s: TdState, slot: number): TdTower | undefined => {
  const sl = s.slots[slot];
  return sl && sl.tower >= 0 ? s.towers.find((q) => q.id === sl.tower) : undefined;
};

export type TdBot = (s: TdState) => TdAction[];

/**
 * 配平用的开关（td-sim 的"反压制""英雄拆开看"）：only = 木台上只造这一种塔（没解锁就照常挑）；
 * skills = false 不放拒马和炸药桶；move = false 英雄不走位（不捡宝藏、不追、不清障，站在宝藏箱边）。
 */
export interface TdBotOpts {
  only?: TdTowerKind;
  skills?: boolean;
  move?: boolean;
  /**
   * 布局思路（只给配平模拟用，默认 mix）：mix 按克制混搭、哪块木台离路近造哪块；
   * focus 塔全堆在主路（这一关来得最多的那条路）两边，别的路靠英雄和拒马；tall 少造、先升满阶再造下一座（最多一半木台）
   */
  layout?: 'mix' | 'focus' | 'tall';
  /**
   * 断崖关的守法（只给配平模拟用）：high 只造崖上的高台；low 只造崖下离路最近的同样几块（块数和高台一样多，
   * 比的是摆在哪，不是造几座——少造几座、钱全拿去升阶本身就更稳）；不写两种都造
   */
  pads?: 'high' | 'low';
}

/** opts.pads 用的木台：高台全部；或者崖下的木台里离路最近（slotScores 最高）的同样几块 */
function padsFor(s: TdState, pv: WavePreview[], pick: 'high' | 'low'): Set<number> {
  const all = s.slots.map((_, i) => i).filter((i) => s.slots[i]!.garrison === undefined);
  const high = all.filter((i) => s.slots[i]!.high);
  if (pick === 'high') return new Set(high);
  const sc = slotScores(s, pv);
  return new Set(all.filter((i) => !s.slots[i]!.high).sort((a, b) => (sc[b] ?? 0) - (sc[a] ?? 0) || a - b).slice(0, high.length));
}

/** focus 用的主路：这一关所有波次里来得最多（个数）的那条路（下标同 tdRoutes 的 lane）；没有波次表（无尽）取 0 号 */
function mainLane(s: TdState): number {
  const n = new Map<number, number>();
  for (const w of s.level.waves) for (const g of w.groups) n.set(g.lane, (n.get(g.lane) ?? 0) + g.n);
  let best = 0;
  for (const [l, c] of n) if (c > (n.get(best) ?? 0) || (c === (n.get(best) ?? 0) && l < best)) best = l;
  return best;
}

/** focus 能造的木台：离主路路线 6 格内的；不到两块就取离主路最近的两块 */
function focusSlots(s: TdState): Set<number> {
  const r = tdRoutes(s).find((q) => q.lane === mainLane(s)) ?? tdRoutes(s)[0];
  const cells = r?.cells ?? [];
  const dist = s.slots.map((sl) => {
    const cx = sl.x * UNIT + 100;
    const cy = sl.y * UNIT + 100;
    let bd = Number.POSITIVE_INFINITY;
    for (const c of cells) bd = Math.min(bd, d2(cellX(c), cellY(c), cx, cy));
    return bd;
  });
  const near = new Set(s.slots.map((_, i) => i).filter((i) => (dist[i] ?? Number.POSITIVE_INFINITY) <= 600 * 600));
  if (near.size >= 2) return near;
  return new Set(s.slots.map((_, i) => i).sort((a, b) => (dist[a] ?? 0) - (dist[b] ?? 0) || a - b).slice(0, 2));
}

/** 造一个机器人：返回"看一眼状态 → 这一拍的操作"的函数（自己记着种子流和上次的决定） */
/** 射程内的活敌人数（minRange 以内的打不到，不算） */
function inReach(s: TdState, tw: TdTower, live: readonly TdEnemy[]): TdEnemy[] {
  const { range, minRange } = tdTowerRange(s, tw);
  const cx = tcx(tw);
  const cy = tcy(tw);
  return live.filter((e) => {
    const d = d2(e.x, e.y, cx, cy);
    return d <= range * range && d >= minRange * minRange;
  });
}

/**
 * 航海士的急射旗插在哪（冷却没好、没有值得插的为 null）：以英雄够得着的每座「正在打」的塔（射程里有首领，或有 3 个以上敌人）的中心为候选，
 * 数圈里正在打的塔有几座，挑最多的；同样多挑有首领的，再同样按塔的编号顺序取先到的
 */
export function flagSpot(s: TdState, live: readonly TdEnemy[]): { x: number; y: number } | null {
  const h = s.hero;
  const fl = TD2_NAV_SKILL.flag;
  if (h.respawn >= 0 || s.tick < (h.barricadeReady ?? 0)) return null;
  const busy: Array<{ x: number; y: number; boss: number }> = [];
  for (const tw of s.towers) {
    const near = inReach(s, tw, live);
    const boss = near.some((e) => !!TD2_ENEMIES[e.kind].aura || e.kind === 'king') ? 1 : 0;
    if (boss || near.length >= 3) busy.push({ x: tcx(tw), y: tcy(tw), boss });
  }
  let best: { x: number; y: number; n: number; boss: number } | null = null;
  for (const c of busy) {
    if (d2(c.x, c.y, h.x, h.y) > fl.range * fl.range) continue;
    let n = 0;
    let boss = 0;
    for (const o of busy) {
      if (d2(o.x, o.y, c.x, c.y) > fl.r * fl.r) continue;
      n++;
      boss = Math.max(boss, o.boss);
    }
    if (!best || n > best.n || (n === best.n && boss > best.boss)) best = { x: c.x, y: c.y, n, boss };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/**
 * 航海士的重赏画在哪（冷却没好、没有扎堆为 null）：英雄投得到、圈里有 3 个以上敌人、那一点至少两座塔打得到，按敌人顺序取第一个
 */
export function rewardSpot(s: TdState, live: readonly TdEnemy[]): { x: number; y: number } | null {
  const h = s.hero;
  const rw = TD2_NAV_SKILL.reward;
  if (h.respawn >= 0 || s.tick < h.kegReady) return null;
  for (const e of live) {
    if (d2(e.x, e.y, h.x, h.y) > rw.range * rw.range) continue;
    let n = 0;
    for (const o of live) if (d2(o.x, o.y, e.x, e.y) <= rw.r * rw.r) n++;
    if (n < 3) continue;
    let cover = 0;
    for (const tw of s.towers) if (inReach(s, tw, [e]).length > 0) cover++;
    if (cover >= 2) return { x: e.x, y: e.y };
  }
  return null;
}

export function tdBotActions(kind: TdBotKind, seed: number, opts: TdBotOpts = {}): TdBot {
  const pickKind = (s: TdState, pv: WavePreview[]): TdTowerKind => (opts.only && s.unlocked.includes(opts.only) ? opts.only : counterKind(s, pv));
  const rng = new Rng(seed, `td-bot-${kind}`);
  // 章末机制（规则版本 16）的随机另开一条流：没有机制的关，机器人的每一个决定和以前逐位一样
  const mrng = new Rng(seed, `td-bot-mech-${kind}`);
  let sluiceAsked = -1;
  let dareAsked = -1;
  const crateAsked = new Set<number>();
  const want = new Map<number, TdTowerKind>();
  let lastMove = -100;
  let soldWave = -1;
  let seenWave = 0;
  let waveAt = 0;
  let focus: Set<number> | null = null;
  let padSet: Set<number> | null = null;
  return (s: TdState): TdAction[] => {
    const t = s.tick;
    const out: TdAction[] = [];
    if (s.over) return out;
    let gold = s.gold;
    const free = s.slots.map((sl, i) => (sl.tower < 0 && sl.wreck === undefined ? i : -1)).filter((i) => i >= 0);
    if (kind === 'novice' || kind === 'guided') {
      // 小白一半的时候想得起看一眼水闸（每波只想一次），想起来了和普通一样判断
      if (sluiceAsked !== s.wave && tdSluiceCan(s) === 'shut' && s.next - t < 100) {
        sluiceAsked = s.wave;
        if (mrng.int(2) === 0 && sluiceWorth(s, tdPreview(s, 1))) out.push({ t, type: 'sluice' });
      }
      // 小白一半的时候想得起接战书（每波只想一次），想起来了和普通一样判断
      if (dareAsked !== s.wave && tdDareCan(s) === 'take' && s.next - t < 100) {
        dareAsked = s.wave;
        if (mrng.int(2) === 0 && dareWorth(s)) out.push({ t, type: 'dare' });
      }
      // 小白看见漂来的补给箱、宝藏箱边上又安全时，一半的时候叫英雄去捡（每个箱子只想一次）
      for (const c of s.drift?.crates ?? []) {
        if (crateAsked.has(c.id) || !crateSafe(s, c)) continue;
        crateAsked.add(c.id);
        if (s.drift!.chase < 0 && mrng.int(2) === 0) out.push({ t, type: 'pickup', id: c.id });
      }
      // 小白看见扎堆的也会想起老炮，一半的时候
      if (s.battery && t >= s.battery.ready && t % 20 === 0 && mrng.int(2) === 0) {
        const at = batteryTarget(s, 3);
        if (at) out.push({ t, type: 'battery', x: at.x, y: at.y });
      }
      // 小白看见海上有船（炮艇、海盗王）也会想起友军船，一半的时候
      if (fleetWorth(s, 1) && t % 20 === 0 && mrng.int(2) === 0) out.push({ t, type: 'fleet' });
      if (s.unlocked.length === 0) return out;
      // 照建议的新手：先造离路近的木台（和稳机器人同一套打分），塔照预告卡的建议挑
      const pv = kind === 'guided' ? tdPreview(s, 2) : null;
      const i = pv ? freeSlotPick(s, pv, free) : free[0];
      if (i !== undefined) {
        let k = want.get(i);
        if (!k) {
          k = pv ? pickKind(s, pv) : (s.unlocked[rng.int(s.unlocked.length)] as TdTowerKind);
          want.set(i, k);
        }
        if (gold >= tdBuildCost(s, i, k)) {
          out.push({ t, type: 'build', slot: i, kind: k });
          gold -= tdBuildCost(s, i, k);
        }
      } else {
        for (let j = 0; j < s.slots.length; j++) {
          const tw = towerOn(s, j);
          if (!tw || tw.tier === undefined) continue;
          const c = tdUpCost(tw.kind, tw.tier - 1);
          if (tw.tier < 3 && c >= 0 && gold >= c) {
            out.push({ t, type: 'up', slot: j });
            gold -= c;
            break;
          }
        }
      }
      for (let j = 0; j < s.slots.length; j++) {
        const tw = towerOn(s, j);
        if (tw?.tier !== 3) continue;
        for (const tier of [1, 2] as const) {
          if (tw.branch.length !== tier - 1 || tw.level < BRANCH_LEVEL[tier]) continue;
          const opts = branchOptions(tw.kind, tier);
          if (opts.length > 0) out.push({ t, type: 'branch', slot: j, branch: opts[rng.int(opts.length)]!.id });
        }
      }
      return out;
    }

    // ---------------- 普通、贪
    if (s.wave !== seenWave) {
      seenWave = s.wave;
      waveAt = t;
    }
    const pv = tdPreview(s, 2);
    const live = s.enemies.filter((e) => e.mode === 'in' || e.mode === 'out');
    // 开打前 5 秒再定：这时塔基本造好了，按塔的覆盖判断才准
    if (s.next - t < 100 && t % 10 === 0 && tdSluiceCan(s) === 'shut' && sluiceWorth(s, pv)) out.push({ t, type: 'sluice' });
    if (s.next - t < 100 && t % 10 === 0 && tdDareCan(s) === 'take' && (kind === 'greedy' || dareWorth(s))) out.push({ t, type: 'dare' });
    if (t % 10 === 0) {
      const sc = slotScores(s, pv);
      const order = s.slots.map((_, i) => i).sort((a, b) => (sc[b] ?? 0) - (sc[a] ?? 0) || a - b);
      // 预告里有要照亮的敌人而还没有灯塔：先把一座火枪塔升到 3 阶（才能选灯塔分叉），不然雾船怎么都漏
      let spent = false;
      if (outlook(s, pv).fog && needLight(s)) {
        const gj = order.find((j) => {
          const tw = towerOn(s, j);
          return !!tw && tw.kind === 'gunTower' && tw.tier !== undefined && tw.tier < 3;
        });
        if (gj !== undefined) {
          const tw = towerOn(s, gj)!;
          const c = tdUpCost(tw.kind, (tw.tier ?? 1) - 1);
          if (c >= 0 && gold >= c) {
            out.push({ t, type: 'up', slot: gj });
            gold -= c;
          }
          spent = true;
        }
      }
      // 布局思路：focus 只在主路两边造；tall 已造的没升满就先升，最多造一半木台
      if (opts.pads && !padSet) padSet = padsFor(s, pv, opts.pads);
      const ps = padSet;
      let buildable = ps ? free.filter((i) => ps.has(i)) : free;
      if (opts.layout === 'focus') {
        focus ??= focusSlots(s);
        const f = focus;
        buildable = buildable.filter((i) => f.has(i));
      } else if (opts.layout === 'tall') {
        const built = s.slots.filter((sl) => sl.tower >= 0).length;
        const short = s.towers.some((tw) => tw.slot >= 0 && tw.tier !== undefined && tw.tier < 3);
        if (built >= Math.max(2, Math.ceil(s.slots.length / 2)) || (built >= 1 && short)) buildable = [];
      }
      if (buildable.length > 0) {
        let bi = buildable[0] as number;
        for (const i of buildable) if ((sc[i] ?? 0) > (sc[bi] ?? 0)) bi = i;
        const k = pickKind(s, pv);
        if (gold >= tdBuildCost(s, bi, k)) {
          out.push({ t, type: 'build', slot: bi, kind: k });
          gold -= tdBuildCost(s, bi, k);
        }
        spent = true;
      }
      if (!spent) {
        for (const j of order) {
          const tw = towerOn(s, j);
          if (!tw || tw.tier === undefined || tw.tier >= 3) continue;
          const c = tdUpCost(tw.kind, tw.tier - 1);
          if (c >= 0 && gold >= c) {
            out.push({ t, type: 'up', slot: j });
            gold -= c;
          }
          break;
        }
      }
      // 没空木台了：钱够就清一块沉船（多一个塔位）
      if (free.length === 0) {
        const wrecked = order.find((j) => s.slots[j]!.wreck !== undefined);
        const id = wrecked === undefined ? undefined : s.slots[wrecked]!.wreck;
        if (id !== undefined && gold >= tdClearCost(s, id) + TD2_COST.gunTower) {
          out.push({ t, type: 'clearNow', id });
          gold -= TD2_ECON.clearGold;
        }
      }
      // 卖掉一座对预告里的主力打不动的塔（每波最多一次，倒数里才卖）
      if (free.length === 0 && live.length === 0 && soldWave !== s.wave && pv.length > 0) {
        const o = outlook(s, pv);
        let top: TdArmor = 'cloth';
        for (const a of TD_ARMORS) if (o.share[a] > o.share[top]) top = a;
        if (o.share[top] >= 60 && !opts.only) {
          const want2 = pickKind(s, pv);
          const bad = [...order].reverse().find((j) => {
            const tw = towerOn(s, j);
            return !!tw && !tw.garrison && tw.tier === 1 && hits(tw, top) <= 50;
          });
          if (bad !== undefined && gold + tdSellRefund(s, bad) >= tdBuildCost(s, bad, want2)) {
            out.push({ t, type: 'sell', slot: bad });
            soldWave = s.wave;
          }
        }
      }
      // 钱多出来修墙
      const broken = s.walls.find((w) => w.destroyed);
      if (broken && gold >= TD2_ECON.repairGold + 100) {
        out.push({ t, type: 'repair', id: broken.id });
        gold -= TD2_ECON.repairGold;
      }
      for (let j = 0; j < s.slots.length; j++) {
        const tw = towerOn(s, j);
        if (tw?.tier !== 3) continue;
        for (const tier of [1, 2] as const) {
          if (tw.branch.length !== tier - 1) continue;
          const b = counterBranch(s, tw, tier, pv);
          if (b) out.push({ t, type: 'branch', slot: j, branch: b });
        }
      }
    }
    const h = s.hero;
    if (h.respawn < 0) {
      const ground = live.filter((e) => !isAir(e));
      const skills = opts.skills !== false;
      // 炸药桶：投得到的地方有 3 个以上扎堆
      if (skills && h.kind) {
        const f = flagSpot(s, live);
        if (f) out.push({ t, type: 'flag', x: f.x, y: f.y });
        const r = rewardSpot(s, live);
        if (r) out.push({ t, type: 'reward', x: r.x, y: r.y });
      }
      const bomb = TD2_HERO_SKILL.bomb;
      if (skills && !h.kind && t >= h.kegReady) {
        for (const e of ground) {
          if (d2(e.x, e.y, h.x, h.y) > bomb.range * bomb.range) continue;
          let n = 0;
          for (const o of ground) if (d2(o.x, o.y, e.x, e.y) <= bomb.r * bomb.r) n++;
          if (n >= 3) {
            out.push({ t, type: 'keg', x: e.x, y: e.y });
            break;
          }
        }
      }
      // 拒马：去抢的地面敌人有 3 个以上在英雄够得着的地方，拦在走得最靠前的那个前面两格
      const bar = TD2_HERO_SKILL.barricade;
      if (skills && !h.kind && t >= (h.barricadeReady ?? 0)) {
        const near = ground.filter((e) => e.mode === 'in' && d2(e.x, e.y, h.x, h.y) <= (bar.range + 200) * (bar.range + 200));
        if (near.length >= 3) {
          let lead = near[0]!;
          let leadLeft = Number.POSITIVE_INFINITY;
          for (const e of near) {
            const left = tdRoute(s, Math.floor(e.x / UNIT), Math.floor(e.y / UNIT)).length;
            if (left < leadLeft) {
              leadLeft = left;
              lead = e;
            }
          }
          const ahead = tdRoute(s, Math.floor(lead.x / UNIT), Math.floor(lead.y / UNIT))[2];
          if (ahead !== undefined && d2(cellX(ahead), cellY(ahead), h.x, h.y) <= bar.range * bar.range) out.push({ t, type: 'barricade', x: cellX(ahead), y: cellY(ahead) });
        }
      }
      // 锚钩（规则版本 20，有锚钩的局才有 hookReady）：先钩带着宝藏、离船最近的，没有就钩快摸到宝藏箱的
      if (skills && h.hookReady !== undefined && t >= h.hookReady) {
        const e = hookTarget(s);
        if (e) out.push({ t, type: 'hook', id: e.id });
      }
      if (s.battery && skills && t >= s.battery.ready) {
        const at = batteryTarget(s, 4);
        if (at) out.push({ t, type: 'battery', x: at.x, y: at.y });
      }
      if (skills && fleetWorth(s, 2)) out.push({ t, type: 'fleet' });
      // 补给箱：宝藏箱附近安全（crateSafe）才叫英雄去捡最近的那个，敌人压到宝藏边还去捡会漏（td06 一漂来就去捡，三星 100% → 0%）；
      // 波是叠着来的、岛上几乎不会清空，所以不等清场。去捡的路上不再给他别的走位
      const drift = s.drift;
      if (drift && drift.chase < 0 && drift.crates.length > 0 && opts.move !== false) {
        let near = drift.crates[0]!;
        for (const c of drift.crates) if (d2(c.x, c.y, h.x, h.y) < d2(near.x, near.y, h.x, h.y)) near = c;
        if (crateSafe(s, near)) out.push({ t, type: 'pickup', id: near.id });
      }
      if (opts.move !== false && t - lastMove >= 10 && !(drift && drift.chase >= 0)) {
        let goal: { x: number; y: number } | null = null;
        let bd = Number.POSITIVE_INFINITY;
        // 飞的在场：英雄（枪弹，能打飞的）回箱子边守着
        const tr0 = s.treasures[0];
        const home = live.some((e) => e.mode === 'in' && isAir(e)) && !ground.some((e) => e.mode === 'in');
        if (home && tr0) goal = { x: tr0.x * UNIT + 50, y: (tr0.y + 1) * UNIT + 50 };
        for (const p of home ? [] : s.piles) {
          const d = d2(p.x, p.y, h.x, h.y);
          if (d < bd) {
            bd = d;
            goal = { x: p.x, y: p.y };
          }
        }
        if (!goal) {
          for (const e of ground) {
            if (e.mode !== 'out' || e.carry === 0) continue;
            const d = d2(e.x, e.y, h.x, h.y);
            if (d < bd) {
              bd = d;
              goal = { x: e.x, y: e.y };
            }
          }
        }
        if (!goal) {
          // 守最忙的那条路：场上去抢的地面敌人离哪条路的登陆点近；没有敌人就守预告里下一波人最多的路
          const routes = tdRoutes(s).filter((r) => r.open);
          let li = 0;
          let most = -1;
          routes.forEach((r, i) => {
            let n = 0;
            for (const e of ground) if (e.mode === 'in' && d2(e.hx, e.hy, r.x * UNIT + 50, r.y * UNIT + 50) <= 200 * 200) n++;
            if (n === 0) for (const l of pv[0]?.lanes ?? []) if (l.lane === r.lane && !l.fly) for (const q of l.enemies) n += q.n;
            if (n > most) {
              most = n;
              li = i;
            }
          });
          const r = routes[li];
          if (r) {
            const c = r.cells[Math.max(0, r.cells.length - 4)];
            if (c !== undefined) goal = { x: cellX(c), y: cellY(c) };
          }
        }
        // 没敌人、离下一波还早：英雄去打沉船（压木台的先打）或木桶，打完给钱
        if (live.length === 0 && s.next - t > 200 && s.lost === 0) {
          const pad = s.slots.find((sl) => sl.wreck !== undefined);
          const b = pad ? s.blocks.find((q) => q.id === pad.wreck && !q.destroyed) : s.blocks.find((q) => !q.destroyed && q.kind === 'barrel');
          if (b) {
            if (h.clear !== b.id) out.push({ t, type: 'clear', id: b.id });
            goal = null;
          }
        }
        if (goal && (!h.goal || d2(goal.x, goal.y, h.goal.x, h.goal.y) > 50 * 50) && d2(goal.x, goal.y, h.x, h.y) > 60 * 60) {
          out.push({ t, type: 'move', x: goal.x, y: goal.y });
          lastMove = t;
        }
      }
    }
    // 贪：上一波清完就叫下一波（拿叫波金、抵英雄冷却）。开打 5 秒内不算清完：晚出发的组可能还没上岸
    if (kind === 'greedy' && s.wave >= 1 && t - waveAt >= 100 && s.next > t + 20 && live.length <= 2 && s.piles.length === 0) out.push({ t, type: 'call' });
    return out;
  };
}

/** 机器人打一局：返回结果和它下过的全部操作（重放测试用） */
export function runTdBot(setup: TdSetup, kind: TdBotKind, opts: TdBotOpts = {}): { result: TdResult; actions: TdAction[]; state: TdState } {
  const s = createTd(setup);
  const bot = tdBotActions(kind, setup.seed, opts);
  const actions: TdAction[] = [];
  while (!s.over) {
    const a = bot(s);
    actions.push(...a);
    stepTd(s, a);
  }
  return { result: tdResult(s), actions, state: s };
}
