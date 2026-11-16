/**
 * 护航的两种机器人（设计第 5 节），确定性：只读状态、预告（tdPreview，含相遇点 meet）和航线，不读波次表。
 * - 小白：开局就巡航 + 英雄跟随，一直不变；木台按顺序造、种类和分叉随便选，不卖塔、不修船、不放技能、不叫波。
 * - 普通：读预告的相遇点定船速（相遇点落在塔群里就停在塔群里打，落在无塔区且船血够就冲）；按预告补克制的塔，
 *   优先离船最近的前方木台，船过了的塔卖掉换钱；血低了修船；咬船的堆上扔炸药桶、敌人前面放拒马；清场且在冲时才叫波。
 * 造塔的挑种类 / 分叉复用 tdbot.ts（counterKind、counterBranch）。
 */
import { BRANCH_LEVEL, branchOptions } from '../content/branches.ts';
import { TD2_COST, TD2_HERO_SKILL } from '../content/td2units.ts';
import { escortHullPct, escortResultOf, escortShip } from './escort.ts';
import { ESCORT_MEND, ESCORT_PIN_AT } from './escorttypes.ts';
import type { EscortResult } from './escorttypes.ts';
import { Rng } from './rng.ts';
import { createTd, stepTd, tdResult, tdUpCost } from './td.ts';
import { tdPreview, tdSellRefund } from './tdquery.ts';
import type { TdState } from './tdstate.ts';
import { counterBranch, counterKind, towerOn } from './tdbot.ts';
import { TD_ENEMY_ARMOR } from './td2types.ts';
import type { TdTowerKind } from './td2types.ts';
import { UNIT } from './types.ts';
import type { TdAction, TdResult, TdSetup, TdTower } from './tdtypes.ts';

export type EscortBotKind = 'novice' | 'normal';

/** 塔群的范围：船和塔中心离这么近（单位）算在这座塔的射程里（2 阶加农炮射程的保守值） */
const COVER = 700;
/** 敌人离船这么近（单位）才算"近处有敌人"，值得停下来打；连续最多停 HOLD_CAP 拍 */
const NEAR = 1500;
const HOLD_CAP = 300;

function d2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

const isAir = (e: { kind: keyof typeof TD_ENEMY_ARMOR }): boolean => TD_ENEMY_ARMOR[e.kind] === 'air';

/** 航线第 i 格附近（COVER 内）有几座塔 */
function coverAt(s: TdState, i: number): number {
  const c = s.escort!.def.route[i];
  if (!c) return 0;
  const x = c.x * UNIT + 50;
  const y = c.y * UNIT + 50;
  let n = 0;
  for (const t of s.towers) if (t.slot >= 0 && d2(x, y, (t.x + 1) * UNIT, (t.y + 1) * UNIT) <= COVER * COVER) n++;
  return n;
}

/** 木台离"船前方的航线"有多近：返回航线上离船最近的、COVER 内的下标与船的差；够不着前方航线返回 -1 */
function aheadGap(s: TdState, sl: { x: number; y: number }): number {
  const es = s.escort!;
  const from = escortShip(es).index;
  const cx = (sl.x + 1) * UNIT;
  const cy = (sl.y + 1) * UNIT;
  for (let i = from; i < es.def.route.length; i++) {
    const c = es.def.route[i] as { x: number; y: number };
    if (d2(cx, cy, c.x * UNIT + 50, c.y * UNIT + 50) <= COVER * COVER) return i - from;
  }
  return -1;
}

export type EscortBot = (s: TdState) => TdAction[];

/** 造一个护航机器人：返回"看一眼状态 → 这一拍的操作"的函数 */
export function escortBotActions(kind: EscortBotKind, seed: number): EscortBot {
  const rng = new Rng(seed, `escort-bot-${kind}`);
  const want = new Map<number, TdTowerKind>();
  let lastMove = -100;
  let soldWave = -1;
  /** 在塔群里连续停了多久：敌人远远地排着队、一直打不完时不能永远停（bays-easy 曾因此原地沉船） */
  let holdFor = 0;
  let noHoldUntil = 0;
  return (s: TdState): TdAction[] => {
    const t = s.tick;
    const out: TdAction[] = [];
    const es = s.escort;
    if (s.over || !es) return out;
    let gold = s.gold;
    if (t === 0) out.push({ t, type: 'follow', on: true });
    if (kind === 'novice') {
      if (t === 0) out.push({ t, type: 'pace', pace: 'sail' });
      const free = s.slots.map((sl, i) => (sl.tower < 0 && sl.wreck === undefined ? i : -1)).filter((i) => i >= 0);
      if (s.unlocked.length === 0) return out;
      const i = free[0];
      if (i !== undefined) {
        let k = want.get(i);
        if (!k) {
          k = s.unlocked[rng.int(s.unlocked.length)] as TdTowerKind;
          want.set(i, k);
        }
        if (gold >= TD2_COST[k]) out.push({ t, type: 'build', slot: i, kind: k });
      } else {
        for (let j = 0; j < s.slots.length; j++) {
          const tw = towerOn(s, j);
          if (!tw || tw.tier === undefined) continue;
          const c = tdUpCost(tw.kind, tw.tier - 1);
          if (tw.tier < 3 && c >= 0 && gold >= c) {
            out.push({ t, type: 'up', slot: j });
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

    // ---------------- 普通
    const ship = escortShip(es);
    const hullPct = escortHullPct(es);
    const live = s.enemies.filter((e) => e.mode === 'in');
    if (t % 10 === 0) {
      const pv = tdPreview(s, 2);
      // 船速
      const meet = pv[0]?.meet ?? -1;
      const here = coverAt(s, ship.index);
      let pace: 'hold' | 'sail' | 'rush' = 'sail';
      if (es.biters >= ESCORT_PIN_AT) pace = 'hold';
      else if (here >= 3 && t >= noHoldUntil && live.some((e) => d2(e.x, e.y, ship.x, ship.y) <= NEAR * NEAR)) pace = 'hold'; // 在塔群里，近处有敌人就打完再走
      else if (hullPct > 60 && es.biters === 0 && (meet < 0 || coverAt(s, meet) < 3)) pace = 'rush';
      holdFor = pace === 'hold' ? holdFor + 10 : 0;
      if (holdFor >= HOLD_CAP) {
        pace = 'sail';
        noHoldUntil = t + 200;
        holdFor = 0;
      }
      if (pace !== es.pace) out.push({ t, type: 'pace', pace });
      // 修船
      if (hullPct < 60 && gold >= ESCORT_MEND.gold && t >= es.mendReady && es.biters < ESCORT_PIN_AT) {
        out.push({ t, type: 'mend' });
        gold -= ESCORT_MEND.gold;
      }
      // 造塔 / 升阶：前方最近的木台优先
      const free = s.slots.map((sl, i) => ({ i, g: sl.tower < 0 && sl.wreck === undefined ? aheadGap(s, sl) : -1 })).filter((q) => q.g >= 0).sort((a, b) => a.g - b.g || a.i - b.i);
      let spent = false;
      if (free.length > 0) {
        const k = counterKind(s, pv);
        if (gold >= TD2_COST[k]) {
          out.push({ t, type: 'build', slot: free[0]!.i, kind: k });
          gold -= TD2_COST[k];
        }
        spent = true;
      }
      if (!spent) {
        const ups = s.slots.map((sl, j) => ({ j, g: aheadGap(s, sl) })).filter((q) => q.g >= 0 && towerOn(s, q.j)).sort((a, b) => a.g - b.g || a.j - b.j);
        for (const q of ups) {
          const tw = towerOn(s, q.j) as TdTower;
          if (tw.tier === undefined || tw.tier >= 3) continue;
          const c = tdUpCost(tw.kind, tw.tier - 1);
          if (c >= 0 && gold >= c) {
            out.push({ t, type: 'up', slot: q.j });
            gold -= c;
          }
          break;
        }
      }
      // 船过了的隘口：塔卖掉换钱（每波一座，没敌人时）
      if (live.length === 0 && soldWave !== s.wave) {
        const gone = s.slots.findIndex((sl, j) => !!towerOn(s, j) && !towerOn(s, j)!.garrison && aheadGap(s, sl) < 0 && sl.tower >= 0);
        if (gone >= 0 && tdSellRefund(s, gone) > 0) {
          out.push({ t, type: 'sell', slot: gone });
          soldWave = s.wave;
        }
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
      // 清场且船血够、正在冲时才叫波
      if (s.wave >= 1 && live.length === 0 && s.piles.length === 0 && hullPct > 70 && es.pace === 'rush' && s.next > t + 20) out.push({ t, type: 'call' });
    }
    // 英雄技能：咬船的扎堆就扔炸药桶；地面敌人冲着船来就在它前面放拒马
    const h = s.hero;
    if (h.respawn < 0) {
      const ground = live.filter((e) => !isAir(e));
      const bomb = TD2_HERO_SKILL.bomb;
      if (t >= h.kegReady && es.biters >= 2) {
        for (const e of ground) {
          if (d2(e.x, e.y, ship.x, ship.y) > 200 * 200 || d2(e.x, e.y, h.x, h.y) > bomb.range * bomb.range) continue;
          let n = 0;
          for (const o of ground) if (d2(o.x, o.y, e.x, e.y) <= bomb.r * bomb.r) n++;
          if (n >= 2) {
            out.push({ t, type: 'keg', x: e.x, y: e.y });
            break;
          }
        }
      }
      const bar = TD2_HERO_SKILL.barricade;
      if (t >= (h.barricadeReady ?? 0) && t - lastMove >= 40) {
        let lead: (typeof ground)[number] | undefined;
        let ld = Number.POSITIVE_INFINITY;
        for (const e of ground) {
          const d = d2(e.x, e.y, ship.x, ship.y);
          if (d > 250 * 250 && d < ld) {
            ld = d;
            lead = e;
          }
        }
        if (lead && ground.length >= 3) {
          // 敌人前面一格（朝船的方向）
          const dx = ship.x - lead.x;
          const dy = ship.y - lead.y;
          const cx = Math.floor((lead.x + (dx > 0 ? UNIT : dx < 0 ? -UNIT : 0)) / UNIT);
          const cy = Math.floor((lead.y + (dy > 0 ? UNIT : dy < 0 ? -UNIT : 0)) / UNIT);
          if (d2(h.x, h.y, cx * UNIT + 50, cy * UNIT + 50) <= bar.range * bar.range) {
            out.push({ t, type: 'barricade', x: cx * UNIT + 50, y: cy * UNIT + 50 });
            lastMove = t;
          }
        }
      }
    }
    return out;
  };
}

/** 机器人打一局：返回守岛口径的结果和护航结果 */
export function runEscortBot(kind: EscortBotKind, setup: TdSetup): { result: TdResult; escort: EscortResult } {
  const s = createTd(setup);
  const bot = escortBotActions(kind, setup.seed);
  while (!s.over) stepTd(s, bot(s));
  return { result: tdResult(s), escort: escortResultOf(s) };
}
