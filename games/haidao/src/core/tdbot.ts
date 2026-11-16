/**
 * 守岛的三种机器人（DESIGN 10.5、守岛 2.0），确定性：只看状态、界面也能看到的预告（tdPreview）和路线（tdRoutes），不读关卡的波次表。
 * - 小白：塔造在第一个能造的木台、种类和分叉随便选，英雄站在宝藏箱旁不动，不放技能，不叫波。
 * - 普通（稳）：先把木台都造上，按预告补克制的塔（建议的伤害类型、飞的要枪弹、雾里要灯塔），钱多了升阶、清沉船、卖掉不对路的塔；
 *   英雄捡宝藏、追拿着宝藏回船的、守最忙的路，扎堆放拒马和炸药桶；不叫波。
 * - 贪：造塔、升阶、清沉船、卖塔、英雄都和普通一样，区别只在每波打得只剩 2 个敌人以内就立刻叫下一波（拿叫波金、抵英雄冷却）。
 *   （旧版开局只造 2 座攒到第 5 波、有钱先升阶：那是机器人自己把自己饿死，不是玩法；叫波的条件太严也几乎从不触发）
 */
import { BRANCH_LEVEL, branchOptions } from '../content/branches.ts';
import { TD2_COST, TD2_ECON, TD2_HERO_SKILL, td2TierStats } from '../content/td2units.ts';
import { Rng } from './rng.ts';
import { createTd, stepTd, tdResult, tdUpCost } from './td.ts';
import { tdClearCost, tdPreview, tdRoute, tdRoutes, tdSellRefund } from './tdquery.ts';
import type { TdState } from './tdstate.ts';
import { cellX, cellY } from './grid.ts';
import { TD_ARMORS, TD_ENEMY_ARMOR, TD_TOWER_DAMAGE, counterPct, isTdTowerKind } from './td2types.ts';
import type { TdArmor, TdTowerKind, WavePreview } from './td2types.ts';
import { UNIT } from './types.ts';
import type { TdAction, TdResult, TdSetup, TdTower } from './tdtypes.ts';

export type TdBotKind = 'novice' | 'normal' | 'greedy';

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
  let best: TdTowerKind = s.unlocked[0] ?? 'gunTower';
  let bestV = -1;
  for (const k of s.unlocked) {
    let v = 0;
    for (const a of TD_ARMORS) v += o.share[a] * counterPct(TD_TOWER_DAMAGE[k], a);
    const same = s.towers.filter((t) => t.kind === k && t.slot >= 0).length;
    v = Math.floor((v * towerValue(k)) / (2 + same));
    if (v > bestV) {
      bestV = v;
      best = k;
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
  return s.slots.map((sl) => {
    const cx = sl.x * UNIT + 100;
    const cy = sl.y * UNIT + 100;
    let n = 0;
    for (const [px, py] of pts) if (d2(px, py, cx, cy) <= 600 * 600) n++;
    return n;
  });
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
export function tdBotActions(kind: TdBotKind, seed: number, opts: TdBotOpts = {}): TdBot {
  const pickKind = (s: TdState, pv: WavePreview[]): TdTowerKind => (opts.only && s.unlocked.includes(opts.only) ? opts.only : counterKind(s, pv));
  const rng = new Rng(seed, `td-bot-${kind}`);
  const want = new Map<number, TdTowerKind>();
  let lastMove = -100;
  let soldWave = -1;
  let seenWave = 0;
  let waveAt = 0;
  let focus: Set<number> | null = null;
  return (s: TdState): TdAction[] => {
    const t = s.tick;
    const out: TdAction[] = [];
    if (s.over) return out;
    let gold = s.gold;
    const free = s.slots.map((sl, i) => (sl.tower < 0 && sl.wreck === undefined ? i : -1)).filter((i) => i >= 0);
    if (kind === 'novice') {
      if (s.unlocked.length === 0) return out;
      const i = free[0];
      if (i !== undefined) {
        let k = want.get(i);
        if (!k) {
          k = s.unlocked[rng.int(s.unlocked.length)] as TdTowerKind;
          want.set(i, k);
        }
        if (gold >= TD2_COST[k]) {
          out.push({ t, type: 'build', slot: i, kind: k });
          gold -= TD2_COST[k];
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
      let buildable = free;
      if (opts.layout === 'focus') {
        focus ??= focusSlots(s);
        const f = focus;
        buildable = free.filter((i) => f.has(i));
      } else if (opts.layout === 'tall') {
        const built = s.slots.filter((sl) => sl.tower >= 0).length;
        const short = s.towers.some((tw) => tw.slot >= 0 && tw.tier !== undefined && tw.tier < 3);
        if (built >= Math.max(2, Math.ceil(s.slots.length / 2)) || (built >= 1 && short)) buildable = [];
      }
      if (buildable.length > 0) {
        let bi = buildable[0] as number;
        for (const i of buildable) if ((sc[i] ?? 0) > (sc[bi] ?? 0)) bi = i;
        const k = pickKind(s, pv);
        if (gold >= TD2_COST[k]) {
          out.push({ t, type: 'build', slot: bi, kind: k });
          gold -= TD2_COST[k];
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
          if (bad !== undefined && gold + tdSellRefund(s, bad) >= TD2_COST[want2]) {
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
      const bomb = TD2_HERO_SKILL.bomb;
      if (skills && t >= h.kegReady) {
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
      if (skills && t >= (h.barricadeReady ?? 0)) {
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
      if (opts.move !== false && t - lastMove >= 10) {
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
