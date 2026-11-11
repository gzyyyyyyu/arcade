/** 机器人：给模拟和测试用；normal 在影子战场里一边打一边决定放什么技能 */
import { BUILDINGS, DEFENSE_KINDS, SKILLS } from '../content/index.ts';
import { createBattle, stepBattle } from './battle.ts';
import { BATTLE_TICKS, ISLAND, UNIT } from './types.ts';
import type { BBuilding, BattleAction, BattleSetup, BattleState, TroopKind } from './types.ts';

/** 四面海滩的登陆点（战斗单位）：西、东、北、南 */
function sidePoint(side: number): { x: number; y: number; ax: number; ay: number } {
  const mid = (ISLAND * UNIT) / 2;
  const out = -150;
  const far = ISLAND * UNIT + 150;
  if (side === 0) return { x: out, y: mid, ax: 0, ay: 1 };
  if (side === 1) return { x: far, y: mid, ax: 0, ay: 1 };
  if (side === 2) return { x: mid, y: out, ax: 1, ay: 0 };
  return { x: mid, y: far, ax: 1, ay: 0 };
}

function landAt(side: number, i: number, n: number, t: number): BattleAction {
  const p = sidePoint(side);
  const off = (i - (n - 1) / 2) * 150;
  return { t, type: 'land', boat: i, x: Math.round(p.x + p.ax * off), y: Math.round(p.y + p.ay * off) };
}

/** 这一面海滩被多少防御盯着（按每秒伤害加权） */
function sideDanger(setup: BattleSetup, side: number): number {
  const p = sidePoint(side);
  let score = 0;
  for (const b of setup.layout) {
    const def = BUILDINGS[b.kind];
    const lv = def.levels[b.level - 1];
    if (!lv) continue;
    const isDef = DEFENSE_KINDS.has(b.kind) || b.kind === 'mine';
    if (!isDef) continue;
    const cx = b.x * UNIT + (def.size * UNIT) / 2;
    const cy = b.y * UNIT + (def.size * UNIT) / 2;
    const reach = b.kind === 'mine' ? 400 : Math.round((lv.range ?? 0) * UNIT) + 200;
    const dx = cx - p.x;
    const dy = cy - p.y;
    if (dx * dx + dy * dy <= reach * reach) score += b.kind === 'mine' ? Math.floor((lv.dmg ?? 0) / 8) : Math.floor(((lv.dmg ?? 0) * 20) / (lv.reload ?? 20));
  }
  return score;
}

const ORDER: Record<TroopKind, number> = { brute: 0, shield: 0, sailor: 1, captain: 2, harpooner: 3, gunner: 3, grenadier: 4, cannoneer: 4, bomber: 4, medic: 5 };

export function botActions(setup: BattleSetup, style: 'novice' | 'normal'): BattleAction[] {
  const n = setup.army.boats.length;
  if (style === 'novice') {
    const side = (setup.seed >>> 0) % 4;
    const out: BattleAction[] = [];
    for (let i = 0; i < n; i++) out.push(landAt(side, i, n, 0));
    return out;
  }
  let side = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let sd = 0; sd < 4; sd++) {
    const d = sideDanger(setup, sd);
    if (d < best) {
      best = d;
      side = sd;
    }
  }
  // 次安全的一侧：火箭塔（一次打三个、带溅射）多的岛，分两侧登陆别扎堆
  const rockets = setup.layout.filter((b) => b.kind === 'rocket').length;
  let side2 = -1;
  if (rockets >= 2) {
    let b2 = Number.POSITIVE_INFINITY;
    for (let sd = 0; sd < 4; sd++) {
      if (sd === side) continue;
      const d = sideDanger(setup, sd);
      if (d < b2) {
        b2 = d;
        side2 = sd;
      }
    }
  }
  const order = setup.army.boats.map((_b, i) => i).sort((a, b) => (ORDER[setup.army.boats[a]?.troop ?? 'sailor'] - ORDER[setup.army.boats[b]?.troop ?? 'sailor']) || a - b);
  const out: BattleAction[] = [];
  const lastLand: number[] = [];
  order.forEach((boat, k) => {
    const t = k * 30 + ((ORDER[setup.army.boats[boat]?.troop ?? 'sailor'] ?? 0) >= 3 ? 60 : 0);
    const a = landAt(side2 >= 0 && k % 2 === 1 ? side2 : side, boat, n, t);
    out.push(a);
    lastLand.push(t);
  });
  const landsEnd = Math.max(0, ...lastLand);

  // 影子战场：照已定的登陆操作先走，边走边决定技能
  const shadow = createBattle(setup);
  const byTick = new Map<number, BattleAction[]>();
  for (const a of out) byTick.set(a.t, [...(byTick.get(a.t) ?? []), a]);
  const cost = (k: 'barrage' | 'flare' | 'medkit'): number => {
    const sk = setup.army.skills.find((q) => q.kind === k);
    return sk ? (SKILLS[k].levels[sk.level - 1]?.energy ?? 99) : 99;
  };
  let flared = false;
  let meds = 0;
  while (!shadow.over && shadow.tick < BATTLE_TICKS) {
    const acts = byTick.get(shadow.tick) ?? [];
    if (shadow.tick >= landsEnd + 40 && shadow.tick % 20 === 0) {
      const extra = decide(shadow, cost, flared, meds);
      for (const a of extra) {
        acts.push(a);
        out.push(a);
        if (a.type === 'skill' && a.skill === 'flare') flared = true;
        if (a.type === 'skill' && a.skill === 'medkit') meds++;
      }
    }
    stepBattle(shadow, acts);
  }
  return out;
}

function decide(s: BattleState, cost: (k: 'barrage' | 'flare' | 'medkit') => number, flared: boolean, meds: number): BattleAction[] {
  const alive = s.units.filter((u) => u.mode !== 'dead');
  if (alive.length === 0) return [];
  const hq = s.buildings.find((b) => b.kind === 'hq' && !b.destroyed);
  const defs = s.buildings.filter((b) => DEFENSE_KINDS.has(b.kind));
  const defsLeft = defs.filter((b) => !b.destroyed).length;
  // 信号弹要等外围防御拆得差不多再放，不然兵会顶着炮火直奔主寨
  if (!flared && hq && hq.revealed && defsLeft * 10 <= defs.length * 4 && s.energy >= cost('flare')) {
    return [{ t: s.tick, type: 'skill', skill: 'flare', x: hq.x * UNIT + (hq.size * UNIT) / 2, y: hq.y * UNIT + (hq.size * UNIT) / 2 }];
  }
  if (meds < 2 && s.energy >= cost('medkit')) {
    const hurt = alive.filter((u) => u.hp * 2 < u.maxHp);
    if (hurt.length >= 3) {
      const x = Math.floor(hurt.reduce((a, u) => a + u.x, 0) / hurt.length);
      const y = Math.floor(hurt.reduce((a, u) => a + u.y, 0) / hurt.length);
      return [{ t: s.tick, type: 'skill', skill: 'medkit', x, y }];
    }
  }
  if (s.energy >= cost('barrage')) {
    // 最危险的炮：伤害最高、且离我方兵最近的防御建筑
    let pick: BBuilding | undefined;
    let pickScore = -1;
    for (const b of s.buildings) {
      if (b.destroyed || !DEFENSE_KINDS.has(b.kind) || !b.revealed) continue;
      const lv = BUILDINGS[b.kind].levels[b.level - 1];
      const dps = Math.floor(((lv?.dmg ?? 0) * 20) / (lv?.reload ?? 20));
      const cx = b.x * UNIT + (b.size * UNIT) / 2;
      const cy = b.y * UNIT + (b.size * UNIT) / 2;
      let near = false;
      for (const u of alive) {
        const dx = u.x - cx;
        const dy = u.y - cy;
        if (dx * dx + dy * dy <= 1000 * 1000) {
          near = true;
          break;
        }
      }
      const score = dps + (near ? 1000 : 0);
      if (score > pickScore) {
        pickScore = score;
        pick = b;
      }
    }
    if (pick) return [{ t: s.tick, type: 'skill', skill: 'barrage', x: pick.x * UNIT + (pick.size * UNIT) / 2, y: pick.y * UNIT + (pick.size * UNIT) / 2 }];
  }
  return [];
}
