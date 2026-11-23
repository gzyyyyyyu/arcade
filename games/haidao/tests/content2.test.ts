import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, RULES_VERSION, SNIPE_WARN, TD2_ENEMIES, TROOPS, botActions, createBattle, createTd, escortSetup, newProfile, runTdBot, stepBattle, stepTd, tdGrowthSetup,
  tdHomeGen, tdHomeSnapshot, tdHomeWave, tdUnlockedTowers, tideSetup,
} from '../src/core/index.ts';
import type { BattleAction, BattleEvent, BattleSetup, BUnit, Placed, TdEvent, TdSetup, TdWave, TroopKind } from '../src/core/index.ts';
import { SHIELD } from '../src/content/index.ts';
import { tideWave } from '../src/content/tdtide.ts';
import { replayRaid } from '../src/core/pvp.ts';
import { tdBotActions } from '../src/core/tdbot.ts';
import { fullBase, sampleProfile } from '../tools/sample.ts';

/**
 * 新内容第二片（DESIGN 14，规则版本 11）：狙击塔 + 盾兵。每条规则一条测试；
 * 版本 10 及以前的回放逐位不变由 raid-rules / battle（攻防）和 td-golden（守岛，v9-、v10- 的键）锁着。
 */

const lay = (rows: Array<[Placed['kind'], number, number, number]>): Placed[] => rows.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));
const SNIPER = BUILDINGS.sniper.levels[0]!;
const CANNON = BUILDINGS.cannon.levels[0]!;

/** 一块试验场：每条船一个兵，全部登陆后血量拉满，之后每拍先把兵摆回指定位置（朝向、被震晕）再推一拍，所以兵不会自己走开 */
interface Spec {
  x: number;
  y: number;
  /** 盾朝向（盾兵）；不写就保持引擎算出来的 */
  gx?: number;
  gy?: number;
  stun?: boolean;
}
function arena(rows: Array<[Placed['kind'], number, number, number]>, troops: TroopKind[]) {
  const army: BattleSetup['army'] = { boats: troops.map((troop) => ({ troop, count: 1, level: 1 })), skills: [], energy: 0 };
  const s = createBattle({ layout: lay(rows), army, seed: 1, rules: RULES_VERSION });
  stepBattle(s, troops.map((_, i): BattleAction => ({ t: 0, type: 'land', boat: i, x: -150, y: 1000 })));
  for (const u of s.units) {
    u.hp = u.maxHp = u.hp * 10_000;
    u.cd = 1_000_000;
  }
  const spec: Spec[] = s.units.map((u) => ({ x: u.x, y: u.y }));
  const step = (): BattleEvent[] => {
    s.units.forEach((u, i) => {
      const p = spec[i]!;
      u.x = p.x;
      u.y = p.y;
      if (p.gx !== undefined) u.gx = p.gx;
      if (p.gy !== undefined) u.gy = p.gy;
      if (p.stun) u.stunUntil = 1_000_000;
    });
    return stepBattle(s, []);
  };
  return { s, spec, step };
}

describe('狙击塔：锁定预警', () => {
  // 狙击塔中心 (1600, 600)，射程 11 格；登陆点（-150, 1000）在射程外，兵站在塔西边
  const rows: Array<[Placed['kind'], number, number, number]> = [['hq', 1, 2, 15], ['sniper', 1, 15, 5]];

  it('装填好就锁定并推 aim 事件，SNIPE_WARN 拍后才开火，一发的总间隔仍是 4 秒（80 拍）', () => {
    const { s, spec, step } = arena(rows, ['sailor']);
    spec[0] = { x: 1600 - 800, y: 600 };
    const aims: number[] = [];
    const shots: number[] = [];
    const t0 = s.tick;
    for (let i = 0; i < 200; i++) {
      const abs = s.tick;
      const t = abs - t0;
      for (const e of step()) {
        if (e.type === 'aim') {
          expect(e.id).toBe(2);
          expect(e.tid).toBe(s.units[0]!.id);
          expect(e.fireAt - abs).toBe(SNIPE_WARN);
          aims.push(t);
        }
        if (e.type === 'shoot' && e.from === 'building') shots.push(t);
      }
    }
    expect(SNIPE_WARN).toBe(10);
    expect(aims.slice(0, 3)).toEqual([0, 80, 160]);
    expect(shots.slice(0, 3)).toEqual([10, 90, 170]);
  });

  it('锁定后目标走出射程就作废，不开火；回到射程内重新锁定、重新预警', () => {
    const { s, spec, step } = arena(rows, ['sailor']);
    spec[0] = { x: 1600 - 800, y: 600 };
    const log: Array<[number, string]> = [];
    const t0 = s.tick;
    for (let i = 0; i < 40; i++) {
      if (i === 3) spec[0] = { x: 1600 - 1500, y: 600 };
      if (i === 25) spec[0] = { x: 1600 - 800, y: 600 };
      const t = s.tick - t0;
      for (const e of step()) {
        if (e.type === 'aim') log.push([t, `aim:${e.fireAt - t0}`]);
        if (e.type === 'shoot' && e.from === 'building') log.push([t, 'shoot']);
      }
    }
    expect(log).toEqual([[0, 'aim:10'], [25, 'aim:35'], [35, 'shoot']]);
  });

  it('rankTargets 的优先级：船长 > 船医 > 掷弹兵 / 火炮兵（同类血多的先）> 其余（同类血多的先），比近远优先', () => {
    // 远的优先级高：船长最远、船医次之，最近的是火枪手
    const kinds: TroopKind[] = ['gunner', 'sailor', 'grenadier', 'cannoneer', 'medic', 'captain'];
    const { s, spec, step } = arena(rows, kinds);
    spec.forEach((p, i) => {
      p.x = 1600 - 400 - i * 100;
      p.y = 600;
    });
    const order: TroopKind[] = [];
    for (let i = 0; i < 60 && order.length < kinds.length; i++) {
      for (const e of step()) {
        if (e.type !== 'aim') continue;
        const u = s.units.find((q) => q.id === e.tid) as BUnit;
        order.push(u.kind);
        // 这个兵被打掉了：下一拍重挑
        u.hp = 0;
        u.mode = 'dead';
      }
    }
    expect(order).toEqual(['captain', 'medic', 'grenadier', 'cannoneer', 'sailor', 'gunner']);
  });
});

describe('盾兵：盾的正面、侧后和不挡的东西', () => {
  /** 炮塔中心 (1600, 600)，盾兵站在西边；返回盾兵挨的第一发的伤害和 guard 事件数 */
  function hitOnShield(tower: 'cannon' | 'flame', face: [number, number], opts: { stun?: boolean; kind?: TroopKind } = {}): { dmg: number; guards: number } {
    const dist = tower === 'flame' ? 300 : 500;
    const { s, spec, step } = arena([['hq', 1, 2, 15], [tower, 1, 15, 5]], [opts.kind ?? 'shield']);
    spec[0] = { x: 1600 - dist, y: 600, gx: face[0], gy: face[1], ...(opts.stun ? { stun: true } : {}) };
    let guards = 0;
    for (let i = 0; i < 200; i++) {
      for (const e of step()) {
        if (e.type === 'guard') guards++;
        if (e.type === 'hit' && e.target === 'unit' && e.id === s.units[0]!.id) return { dmg: e.dmg, guards };
      }
    }
    throw new Error('没挨到炮');
  }
  const front: [number, number] = [100, 0];
  const FRONT_DMG = Math.floor((CANNON.dmg! * SHIELD.frontPct) / 100);

  it('正面（盾朝来弹 ±60°）的直射只吃 35%，推 guard 事件；侧面、身后吃全额', () => {
    expect(hitOnShield('cannon', front)).toEqual({ dmg: FRONT_DMG, guards: 1 });
    // 夹角 45° 仍算正面，75° 不算
    expect(hitOnShield('cannon', [71, 71])).toEqual({ dmg: FRONT_DMG, guards: 1 });
    expect(hitOnShield('cannon', [26, 97])).toEqual({ dmg: CANNON.dmg, guards: 0 });
    expect(hitOnShield('cannon', [0, 100])).toEqual({ dmg: CANNON.dmg, guards: 0 });
    expect(hitOnShield('cannon', [-100, 0])).toEqual({ dmg: CANNON.dmg, guards: 0 });
    // 不是盾兵的壮汉：同样的炮吃全额
    expect(hitOnShield('cannon', front, { kind: 'brute' })).toEqual({ dmg: CANNON.dmg, guards: 0 });
  });

  it('溅射不算直射：喷火打在盾正面照吃全额，也没有 guard（臼炮、火箭的炮弹同理，守岛里有臼炮的整局测试）', () => {
    expect(hitOnShield('flame', front)).toEqual({ dmg: BUILDINGS.flame.levels[0]!.dmg, guards: 0 });
  });

  it('被震晕时盾放下：正面来的直射吃全额', () => {
    expect(hitOnShield('cannon', front, { stun: true })).toEqual({ dmg: CANNON.dmg, guards: 0 });
  });

  it('身后友军减伤：盾兵身后 1.5 格内、在盾正面覆盖里的友军少吃 30%（guard 带 cover）；太远、在侧面、盾没朝着来弹、盾被震晕都不算', () => {
    // 狙击塔中心 (1600, 600) 在东边，船长（狙击最优先）和盾兵站在它西边，盾朝东
    const run = (shield: Spec, captain: Spec): { dmg: number; guard?: Extract<BattleEvent, { type: 'guard' }> } => {
      const { s, spec, step } = arena([['hq', 1, 2, 15], ['sniper', 1, 15, 5]], ['shield', 'captain']);
      spec[0] = shield;
      spec[1] = captain;
      let guard: Extract<BattleEvent, { type: 'guard' }> | undefined;
      for (let i = 0; i < 200; i++) {
        for (const e of step()) {
          if (e.type === 'guard') guard = e;
          if (e.type === 'hit' && e.target === 'unit' && e.id === s.units[1]!.id) return { dmg: e.dmg, ...(guard ? { guard } : {}) };
        }
      }
      throw new Error('没挨到狙击');
    };
    const sx = 1600 - 700;
    const toward = { gx: 100, gy: 0 };
    const cut = Math.floor((SNIPER.dmg! * (100 - SHIELD.coverCutPct)) / 100);
    const a = run({ x: sx, y: 600, ...toward }, { x: sx - 100, y: 600 });
    expect(a.dmg).toBe(cut);
    expect(a.guard).toMatchObject({ cover: true });
    // 站得太远（2.5 格）、站在盾的侧面、盾朝向别处、盾兵被震晕：全额
    expect(run({ x: sx, y: 600, ...toward }, { x: sx - 250, y: 600 }).dmg).toBe(SNIPER.dmg);
    expect(run({ x: sx, y: 600, ...toward }, { x: sx, y: 600 + 100 }).dmg).toBe(SNIPER.dmg);
    expect(run({ x: sx, y: 600, gx: 0, gy: 100 }, { x: sx - 100, y: 600 }).dmg).toBe(SNIPER.dmg);
    expect(run({ x: sx, y: 600, ...toward, stun: true }, { x: sx - 100, y: 600 }).dmg).toBe(SNIPER.dmg);
    // 没有盾兵：全额
    const bare = arena([['hq', 1, 2, 15], ['sniper', 1, 15, 5]], ['captain']);
    bare.spec[0] = { x: sx - 100, y: 600 };
    let dmg = 0;
    for (let i = 0; i < 200 && !dmg; i++) for (const e of bare.step()) if (e.type === 'hit' && e.target === 'unit') dmg = e.dmg;
    expect(dmg).toBe(SNIPER.dmg);
  });

  it('盾朝走的方向 / 打的目标：登陆后朝岛心，之后跟着目标走', () => {
    const army: BattleSetup['army'] = { boats: [{ troop: 'shield', count: 1, level: 1 }], skills: [], energy: 0 };
    const s = createBattle({ layout: lay([['hq', 1, 9, 9], ['cannon', 1, 14, 3]]), army, seed: 1, rules: RULES_VERSION });
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1000 }]);
    const u = s.units[0] as BUnit;
    expect(u.gx).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) stepBattle(s, []);
    // 目标是最近的防御（东北那座炮）：盾朝东偏北
    expect(u.gx).toBeGreaterThan(0);
    expect(u.gy).toBeLessThan(0);
    expect(Math.abs(Math.hypot(u.gx!, u.gy!) - 100)).toBeLessThanOrEqual(1);
  });
});

describe('盾兵和狙击塔在各玩法里', () => {
  it('海盗来袭：盾兵第 9 波起出现；大潮的波次里没有盾兵；护航、大潮不能造狙击塔', () => {
    const snap = tdHomeSnapshot({ ...newProfile(), ...sampleProfile(7) });
    const kindsOf = (from: number): Set<string> => {
      const gen = tdHomeGen(snap, 5);
      const out = new Set<string>();
      for (let w = from; w < 20; w++) for (const g of tdHomeWave(gen, w).groups) out.add(g.enemy);
      return out;
    };
    expect(kindsOf(8).has('shield')).toBe(true);
    // 第 9 波之前（下标 0–7）没有
    const early = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) for (let w = 0; w < 8; w++) for (const g of tdHomeWave(tdHomeGen(snap, seed), w).groups) early.add(g.enemy);
    expect(early.size).toBeGreaterThan(0);
    expect(early.has('shield')).toBe(false);
    for (let w = 0; w < 60; w++) for (const g of tideWave(w, 3, 2, true).groups) expect(g.enemy).not.toBe('shield');
    expect(tideSetup({ year: 2026, week: 44 }).unlocked).not.toContain('sniper');
    expect(escortSetup('strait-easy', 1).unlocked).not.toContain('sniper');
    // 战役 18 关：主寨 6 级开放
    expect(tdUnlockedTowers(sampleProfile(6))).toContain('sniper');
    expect(tdUnlockedTowers(sampleProfile(5))).not.toContain('sniper');
  });
});

describe('守岛：狙击塔和盾兵', () => {
  const waveOf = (enemy: 'shield' | 'sailor' | 'captain', n: number, w = 4): TdWave[] =>
    Array.from({ length: w }, (_, i) => ({ hpPct: 220, groups: [{ enemy, n: n + i, lane: 0, every: 24 }, { enemy, n: n + i, lane: 1, every: 24, delay: 60 }] }));

  it('狙击塔：aim 预警 SNIPE_WARN 拍后开火；开火的每一发都有对应的 aim', () => {
    const r = tdGrowthSetup('td10', 'suggest', 1);
    if (!r.ok) throw new Error(r.error);
    const s = createTd({ ...r.value, rules: RULES_VERSION, garrison: [], unlocked: ['sniper'], level: { ...r.value.level, waves: waveOf('sailor', 4) } });
    const bot = tdBotActions('normal', r.value.seed, { only: 'sniper' });
    const aimAt = new Map<number, number>();
    let aims = 0;
    let shots = 0;
    while (!s.over) {
      const t = s.tick;
      for (const e of stepTd(s, bot(s)) as TdEvent[]) {
        if (e.type === 'aim') {
          expect(e.fireAt - t).toBe(SNIPE_WARN);
          aimAt.set(e.id, e.fireAt);
          aims++;
        }
        if (e.type === 'shoot' && s.towers.find((q) => q.id === e.id)?.kind === 'sniper') {
          expect(aimAt.get(e.id), `塔 ${e.id}`).toBe(t);
          aimAt.delete(e.id);
          shots++;
        }
      }
    }
    expect(shots).toBeGreaterThan(3);
    expect(aims).toBeGreaterThanOrEqual(shots);
  }, 60_000);

  it('盾兵：枪弹 / 炮弹的单体伤害正面只吃 35% 并推 guard；火、溅射不挡；盾朝走的方向', () => {
    const r = tdGrowthSetup('td10', 'suggest', 1);
    if (!r.ok) throw new Error(r.error);
    const count = (unlocked: TdSetup['unlocked']): { guards: number; facing: boolean } => {
      const s = createTd({ ...r.value, rules: RULES_VERSION, garrison: [], unlocked, level: { ...r.value.level, waves: waveOf('shield', 3, 2) } });
      const bot = tdBotActions('normal', r.value.seed, { only: unlocked![0]! });
      let guards = 0;
      let facing = false;
      while (!s.over) {
        for (const e of stepTd(s, bot(s))) if (e.type === 'guard') guards++;
        for (const e of s.enemies) if (e.kind === 'shield' && e.mode === 'in' && (e.gx ?? 0) !== 0 || (e.gy ?? 0) !== 0) facing = true;
      }
      return { guards, facing };
    };
    expect(count(['cannon']).guards).toBeGreaterThan(0);
    expect(count(['gunTower']).guards).toBeGreaterThan(0);
    expect(count(['flame']).guards).toBe(0);
    expect(count(['mortar']).guards).toBe(0);
    expect(count(['cannon']).facing).toBe(true);
    expect(TD2_ENEMIES.shield.hp).toBeGreaterThan(0);
  }, 120_000);
});

describe('克制', () => {
  it('进攻：带狙击塔的岛比把狙击塔换成同级加农的岛，船医、船长死得多（差 ≥ 10 点）', () => {
    const isle = (third: 'sniper' | 'cannon'): Placed[] => lay([
      ['hq', 6, 9, 9], ['cannon', 6, 12, 5], ['gunTower', 6, 13, 12], ['gunTower', 6, 15, 9], [third, 6, 15, 15], ['vault', 6, 4, 4], ['vault', 6, 4, 14],
    ]);
    const dead = (third: 'sniper' | 'cannon', front: TroopKind, n: number): { back: number; front: number } => {
      let b = 0, bt = 0, f = 0, ft = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const boats = [front, front, 'medic', 'captain'].map((troop, i) => ({ troop: troop as TroopKind, count: troop === front ? n : troop === 'medic' ? 2 : 1, level: 5, i }));
        const s = createBattle({ layout: isle(third), army: { boats: boats.map(({ troop, count, level }) => ({ troop, count, level })), skills: [], energy: 0 }, seed, rules: RULES_VERSION });
        const acts: BattleAction[] = boats.map((_, i) => ({ t: i * 15, type: 'land', boat: i, x: -150, y: 1100 }));
        let k = 0;
        while (!s.over) {
          const now: BattleAction[] = [];
          while (k < acts.length && acts[k]!.t <= s.tick) now.push(acts[k++]!);
          stepBattle(s, now);
        }
        for (const u of s.units) {
          if (u.kind === 'medic' || u.kind === 'captain') {
            bt++;
            if (u.mode === 'dead') b++;
          } else {
            ft++;
            if (u.mode === 'dead') f++;
          }
        }
      }
      return { back: (100 * b) / bt, front: (100 * f) / ft };
    };
    const withSniper = dead('sniper', 'brute', 3);
    const without = dead('cannon', 'brute', 3);
    expect(withSniper.back - without.back).toBeGreaterThanOrEqual(10);
    // 同人口换成盾兵挡在前面：直射打死的兵少 10 点以上
    const shielded = dead('sniper', 'shield', 4);
    expect(withSniper.front - shielded.front).toBeGreaterThanOrEqual(10);
  }, 120_000);

  it('守岛：全是盾兵的波次，火枪塔单独守漏得多，加上臼炮（溅射不被盾挡）漏得少', () => {
    const r = tdGrowthSetup('td10', 'suggest', 1);
    if (!r.ok) throw new Error(r.error);
    const waves: TdWave[] = [];
    for (let w = 0; w < 8; w++) waves.push({ hpPct: 220 + 10 * w, groups: [{ enemy: 'shield', n: 4 + w, lane: 0, every: 24 }, { enemy: 'shield', n: 3 + w, lane: 1, every: 24, delay: 60 }] });
    let gun = 0;
    let splash = 0;
    for (const seed of [1, 2, 3]) {
      // 驻守塔压在 2 阶（驻守台不封顶后 3 阶驻守塔自己就守得住，量不出木台上塔种的差别）
      const setup: TdSetup = { ...r.value, seed, rules: RULES_VERSION, garrison: r.value.garrison?.map((g) => ({ ...g, tier: 2 as const })), level: { ...r.value.level, waves } };
      gun += runTdBot({ ...setup, unlocked: ['gunTower'] }, 'normal').result.lost;
      splash += runTdBot({ ...setup, unlocked: ['gunTower', 'mortar'] }, 'normal').result.lost;
    }
    expect(gun - splash).toBeGreaterThanOrEqual(6);
  }, 120_000);

  it('全盾兵部队的摧毁率不高于同人口的壮汉部队（防盾太硬）', () => {
    const army = (troop: TroopKind, n: number, hq: number): BattleSetup['army'] => ({ boats: Array.from({ length: 6 }, () => ({ troop, count: n, level: hq })), skills: [], energy: 0 });
    let shield = 0;
    let brute = 0;
    for (const hq of [7]) {
      for (const style of ['turtle', 'spread', 'trap'] as const) {
        for (const seed of [1, 2, 3]) {
          const layout = fullBase(hq, style, true, true, true).base.buildings;
          for (const [troop, n] of [['shield', 4], ['brute', 3]] as const) {
            const setup: BattleSetup = { layout, army: army(troop, n, hq), seed, rules: RULES_VERSION };
            const pct = replayRaid(setup, botActions(setup, 'normal')).result.destroyedPct;
            if (troop === 'shield') shield += pct;
            else brute += pct;
          }
        }
      }
    }
    expect(TROOPS.shield.housing * 4).toBe(TROOPS.brute.housing * 3);
    expect(shield).toBeLessThanOrEqual(brute);
  }, 120_000);
});
