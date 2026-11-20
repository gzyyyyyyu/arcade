import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, RULES_VERSION, STUN_IMMUNE_MUL, TD2_ENEMIES, TD2_SHOCK_STUN, TROOPS, applyStun, botActions, createBattle, createTd, runTdBot, stepBattle, stepTd, stunned, tdGrowthSetup,
} from '../src/core/index.ts';
import type { BattleEvent, BattleSetup, BUnit, Placed, TdEvent, TdSetup, TdWave } from '../src/core/index.ts';
import { GRENADE_WALL_PCT } from '../src/core/battle.ts';
import { replayRaid } from '../src/core/pvp.ts';
import { tdBotActions } from '../src/core/tdbot.ts';
import { fullBase, sampleArmy } from '../tools/sample.ts';

/**
 * 新内容第一片（DESIGN 13）：震荡炮 + 掷弹兵。每条规则一条测试。
 */

const lay = (rows: Array<[Placed['kind'], number, number, number]>): Placed[] => rows.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));
const STUN = BUILDINGS.shock.levels[0]!.stun!;

/** 跑完一场进攻，顺便记下每个兵最长连续被定住几拍 */
function raid(setup: BattleSetup): { pct: number; longest: number; stuns: number } {
  const acts = botActions(setup, 'normal');
  const s = createBattle(setup);
  const run = new Map<number, number>();
  let longest = 0;
  let stuns = 0;
  let k = 0;
  const sorted = [...acts].sort((a, b) => a.t - b.t);
  while (!s.over) {
    const now = [];
    while (k < sorted.length && sorted[k]!.t <= s.tick) now.push(sorted[k++]!);
    for (const e of stepBattle(s, now)) if (e.type === 'stun') stuns++;
    for (const u of s.units) {
      const c = u.mode !== 'dead' && stunned(u, s.tick) ? (run.get(u.id) ?? 0) + 1 : 0;
      run.set(u.id, c);
      longest = Math.max(longest, c);
    }
  }
  return { pct: replayRaid(setup, acts).result.destroyedPct, longest, stuns };
}

describe('震晕（combat.ts applyStun）', () => {
  it('时长、免控、减半：震 24 拍、之后 2 倍时长免控，英雄 / 首领 / 船长减半', () => {
    expect(STUN).toBe(24);
    expect(TD2_SHOCK_STUN).toBe(24);
    const u: { stunUntil?: number; immuneUntil?: number } = {};
    expect(applyStun(u, 100, STUN, false)).toBe(124);
    expect(stunned(u, 123)).toBe(true);
    expect(stunned(u, 124)).toBe(false);
    // 免控：震晕结束后 2 × 24 拍内再震无效
    expect(applyStun(u, 130, STUN, false)).toBe(-1);
    expect(applyStun(u, 124 + STUN * STUN_IMMUNE_MUL - 1, STUN, false)).toBe(-1);
    expect(applyStun(u, 124 + STUN * STUN_IMMUNE_MUL, STUN, false)).toBe(124 + STUN * STUN_IMMUNE_MUL + STUN);
    const cap: { stunUntil?: number; immuneUntil?: number } = {};
    expect(applyStun(cap, 0, STUN, true)).toBe(STUN / 2);
    expect(cap.immuneUntil).toBe(STUN / 2 + STUN);
  });

  it('进攻：震荡炮打中的壮汉不走不打，船长只震一半', () => {
    const army = (troop: 'brute' | 'captain'): BattleSetup['army'] => ({ boats: [{ troop, count: 1, level: 1 }], skills: [], energy: 0 });
    for (const troop of ['brute', 'captain'] as const) {
      const s = createBattle({ layout: lay([['hq', 1, 9, 9], ['shock', 1, 2, 9]]), army: army(troop), seed: 1, rules: RULES_VERSION });
      let ev: BattleEvent[] = stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1000 }]);
      let st: Extract<BattleEvent, { type: 'stun' }> | undefined;
      for (let i = 0; i < 400 && !st; i++) {
        ev = stepBattle(s, []);
        st = ev.find((e): e is Extract<BattleEvent, { type: 'stun' }> => e.type === 'stun');
      }
      expect(st, troop).toBeDefined();
      expect(st!.until - (s.tick - 1)).toBe(troop === 'captain' ? STUN / 2 : STUN);
      const u = s.units[0] as BUnit;
      const at = [u.x, u.y];
      const hp = s.buildings.map((b) => b.hp);
      stepBattle(s, []);
      expect([u.x, u.y]).toEqual(at);
      expect(s.buildings.map((b) => b.hp)).toEqual(hp);
    }
  });

  it('整局模拟：满配岛（带震荡炮）打 8 级部队，没有一个兵连续被定住超过 24 拍', () => {
    let stuns = 0;
    for (const style of ['turtle', 'spread', 'trap'] as const) {
      for (const seed of [1, 2]) {
        const p = fullBase(7, style, true, true);
        const r = raid({ layout: p.base.buildings, army: sampleArmy(8), seed, rules: RULES_VERSION });
        expect(r.longest).toBeLessThanOrEqual(STUN);
        stuns += r.stuns;
      }
    }
    expect(stuns).toBeGreaterThan(0);
  }, 120_000);

  it('整局模拟：守岛只造震荡炮，没有一个敌人（含船长）连续被定住超过 24 拍', () => {
    const r = tdGrowthSetup('td07', 'suggest', 1);
    if (!r.ok) throw new Error(r.error);
    const s = createTd(r.value);
    // 机器人一拍一拍喂（runTdBot 只给结果，这里要看每拍的状态），只造震荡炮
    const bot = tdBotActions('normal', r.value.seed, { only: 'shock' });
    const run = new Map<number, number>();
    let longest = 0;
    let stuns = 0;
    while (!s.over) {
      for (const e of stepTd(s, bot(s))) if (e.type === 'stun') stuns++;
      for (const e of s.enemies) {
        const c = (e.mode === 'in' || e.mode === 'out') && stunned(e, s.tick) ? (run.get(e.id) ?? 0) + 1 : 0;
        run.set(e.id, c);
        longest = Math.max(longest, c);
      }
    }
    expect(stuns).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(TD2_SHOCK_STUN);
  }, 60_000);
});

describe('掷弹兵的手雷', () => {
  /** 一圈墙（离主寨 6 格），墙里贴着西墙一座金库：掷弹兵从西边登陆，先隔墙炸金库，再得拆墙才够得着主寨 */
  const walled = (): Placed[] => {
    const rows: Array<[Placed['kind'], number, number, number]> = [['hq', 1, 9, 9], ['vault', 1, 4, 9]];
    for (let y = 3; y <= 18; y++) rows.push(['wall', 3, 3, y], ['wall', 3, 18, y]);
    for (let x = 4; x < 18; x++) rows.push(['wall', 3, x, 3], ['wall', 3, x, 18]);
    return lay(rows);
  };
  const gren = (n: number): BattleSetup['army'] => ({ boats: [{ troop: 'grenadier', count: n, level: 1 }], skills: [], energy: 0 });

  it('越墙：墙还立着，墙里的金库已经挨炸；炸到墙只算三成', () => {
    const s = createBattle({ layout: walled(), army: gren(4), seed: 1, rules: RULES_VERSION });
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1050 }]);
    const dmg = TROOPS.grenadier.levels[0]!.dmg;
    const wallHits = new Set<number>();
    let overWall = false;
    let grenades = 0;
    for (let i = 0; i < 1200 && !s.over; i++) {
      for (const e of stepBattle(s, [])) {
        if (e.type === 'shoot' && s.projectiles.find((p) => p.id === e.projectile)?.kind === 'grenade') grenades++;
        if (e.type !== 'hit' || e.target !== 'building') continue;
        const b = s.buildings.find((q) => q.id === e.id)!;
        if (b.kind === 'wall') wallHits.add(e.dmg);
        if (b.kind === 'vault' && s.buildings.filter((q) => q.kind === 'wall').every((q) => !q.destroyed)) overWall = true;
      }
    }
    expect(grenades).toBeGreaterThan(0);
    expect(overWall).toBe(true);
    expect([...wallHits]).toEqual([Math.floor((dmg * GRENADE_WALL_PCT) / 100)]);
  });
});

describe('克制', () => {
  it('进攻：同一支壮汉部队打带震荡炮的岛，摧毁率比把震荡炮换成同级加农的岛明显低', () => {
    const base = (third: 'shock' | 'cannon'): Placed[] => lay([
      ['hq', 5, 9, 9], ['cannon', 5, 6, 6], ['cannon', 5, 14, 14], ['gunTower', 5, 14, 6], [third, 5, 6, 14],
      ['vault', 5, 2, 2], ['vault', 5, 16, 16], ['sawmill', 5, 2, 16], ['goldmine', 5, 16, 2],
    ]);
    const army: BattleSetup['army'] = { boats: [{ troop: 'brute', count: 3, level: 4 }, { troop: 'brute', count: 3, level: 4 }], skills: [], energy: 0 };
    let shock = 0;
    let swap = 0;
    for (let seed = 1; seed <= 6; seed++) {
      for (const k of ['shock', 'cannon'] as const) {
        const setup: BattleSetup = { layout: base(k), army, seed, rules: RULES_VERSION };
        const pct = replayRaid(setup, botActions(setup, 'normal')).result.destroyedPct;
        if (k === 'shock') shock += pct;
        else swap += pct;
      }
    }
    expect(swap - shock).toBeGreaterThanOrEqual(6 * 5);
  }, 120_000);

  it('守岛：全是掷弹兵的波次，有喷火（火枪 + 喷火、加农 + 喷火）比没喷火（只有火枪、只有加农）漏的宝少', () => {
    const r = tdGrowthSetup('td10', 'suggest', 1);
    if (!r.ok) throw new Error(r.error);
    const waves: TdWave[] = [];
    for (let w = 0; w < 8; w++) waves.push({ hpPct: 220 + 10 * w, groups: [{ enemy: 'grenadier', n: 6 + w, lane: 0, every: 24 }, { enemy: 'grenadier', n: 5 + w, lane: 1, every: 24, delay: 60 }] });
    let flame = 0;
    let none = 0;
    for (const seed of [1, 2, 3]) {
      for (const k of ['gunTower', 'cannon'] as const) {
        const setup: TdSetup = { ...r.value, seed, level: { ...r.value.level, waves } };
        none += runTdBot({ ...setup, unlocked: [k] }, 'normal').result.lost;
        flame += runTdBot({ ...setup, unlocked: [k, 'flame'] }, 'normal').result.lost;
      }
    }
    expect(none - flame).toBeGreaterThanOrEqual(6);
  }, 240_000); // 负载 28–32、maxWorkers=1 实测 59.3 秒，取 4 倍

  it('守岛：掷弹兵在离墙、拒马、英雄 3 格内停下扔雷，墙只吃三成', () => {
    const r = tdGrowthSetup('td07', 'suggest', 2);
    if (!r.ok) throw new Error(r.error);
    const waves: TdWave[] = [{ groups: [{ enemy: 'grenadier', n: 6, lane: 0, every: 30 }] }];
    const s = createTd({ ...r.value, level: { ...r.value.level, waves, first: 20 } });
    const def = TD2_ENEMIES.grenadier;
    let lobs = 0;
    let far = true;
    const wallHits = new Set<number>();
    const hp = new Map(s.walls.map((w) => [w.id, w.hp]));
    for (let i = 0; i < 3000 && !s.over; i++) {
      const ev: TdEvent[] = stepTd(s, []);
      for (const e of ev) {
        if (e.type !== 'lob') continue;
        lobs++;
        const d2 = (e.x1 - e.x0) * (e.x1 - e.x0) + (e.y1 - e.y0) * (e.y1 - e.y0);
        if (d2 > (def.lob!.range + 150) * (def.lob!.range + 150)) far = false;
      }
      for (const w of s.walls) {
        const before = hp.get(w.id)!;
        if (w.hp < before) wallHits.add(before - w.hp);
        hp.set(w.id, w.hp);
      }
    }
    expect(lobs).toBeGreaterThan(0);
    expect(far).toBe(true);
    if (wallHits.size > 0) for (const d of wallHits) expect(d % Math.floor((def.dmg * def.lob!.wallPct) / 100)).toBe(0);
  }, 60_000);
});
