import { describe, expect, it } from 'vitest';
import { CAMPAIGN, FUN, RULES_VERSION, armyFor, battleFingerprint, battleResult, botActions, canRecall, createBattle, newProfile, placeChests, reachableCells, runBattle, stepBattle } from '../src/core/index.ts';
import type { BattleAction, BattleEvent, BattleSetup } from '../src/core/index.ts';
import { Rng } from '../src/core/rng.ts';
import { sanitizeActions, replayRaid } from '../src/core/pvp.ts';

/** 每局不一样（DESIGN 15）和误放撤回（规则版本 13）：关着时逐位不变，开着时确定、公平 */
const LEVELS = [0, 3, 7, 11, 17, 24];

function setupOf(i: number, seed: number, rules = RULES_VERSION, fun?: BattleSetup['fun']): BattleSetup {
  const lv = CAMPAIGN[i]!;
  const p = newProfile();
  return { layout: lv.layout, army: armyFor({ ...p }), seed, rules, ...(fun ? { fun } : {}) };
}

function bigArmy(setup: BattleSetup): BattleSetup {
  return { ...setup, army: { ...setup.army, boats: setup.army.boats.length ? setup.army.boats : [{ troop: 'sailor', count: 6, level: 1 }] } };
}

describe('开关关着：整局和没有这个功能时逐位一致', () => {
  it('规则版本 13 不带 fun = 规则版本 11；fun 全 false 也一样', () => {
    for (const i of LEVELS) {
      for (const seed of [1, 2, 77]) {
        const base = bigArmy(setupOf(i, seed, 11));
        const acts = botActions(base, 'normal');
        const a = runBattle(base, acts);
        const b = runBattle({ ...base, rules: 13 }, acts);
        const c = runBattle({ ...base, rules: 13, fun: { chest: false, ally: false } }, acts);
        const d = runBattle({ ...base, rules: 12, fun: { chest: true, ally: true } }, acts);
        const fp = battleFingerprint(a.state);
        expect(battleFingerprint(b.state), `c${i + 1}/${seed}`).toBe(fp);
        expect(battleFingerprint(c.state)).toBe(fp);
        expect(battleFingerprint(d.state), '规则版本 12 里 fun 不生效').toBe(fp);
        expect(b.result).toEqual(a.result);
      }
    }
    // 6 关 × 3 种子 × 4 局整场对打；0.31.1 后段关加了城墙，整套并行跑时会超过默认 5 秒（单跑约 3 秒）
  }, 60_000);
  it('开着宝箱不改登陆落点的随机（独立流）：第一批兵开局位置和关着时一样', () => {
    const base = bigArmy(setupOf(3, 5));
    const on = createBattle({ ...base, fun: { chest: true, ally: true } });
    const off = createBattle(base);
    const act: BattleAction = { t: 0, type: 'land', boat: 0, x: -150, y: 1100 };
    stepBattle(on, [act]);
    stepBattle(off, [act]);
    expect(on.units.map((u) => [u.x, u.y])).toEqual(off.units.map((u) => [u.x, u.y]));
  });
});

describe('漂流宝箱', () => {
  it('同种子同位置、不同种子不同；2–3 个；都在兵走得进的格子里', () => {
    const lv = CAMPAIGN[11]!;
    const s = createBattle({ ...bigArmy(setupOf(11, 9)), layout: lv.layout, fun: { chest: true } });
    const a = s.chests!;
    expect(a.length).toBeGreaterThanOrEqual(FUN.chest.min);
    expect(a.length).toBeLessThanOrEqual(FUN.chest.min + FUN.chest.extra - 1);
    const again = createBattle({ ...bigArmy(setupOf(11, 9)), fun: { chest: true } }).chests!;
    expect(again).toEqual(a);
    const others = [1, 2, 3, 4, 5].map((sd) => JSON.stringify(createBattle({ ...bigArmy(setupOf(11, sd)), fun: { chest: true } }).chests));
    expect(new Set(others).size).toBeGreaterThan(1);
  });
  it('城墙圈里不撒：把岛心用墙圈起来，箱子一个都不在圈里', () => {
    for (const i of LEVELS) {
      for (const seed of [1, 2, 3, 4]) {
        const s = createBattle({ ...bigArmy(setupOf(i, seed)), fun: { chest: true } });
        const ok = reachableCells(s.buildings);
        for (const c of s.chests!) {
          const cx = Math.floor(c.x / 100);
          const cy = Math.floor(c.y / 100);
          expect(ok[(cy + 3) * 28 + cx + 3], `c${i + 1} seed ${seed} 箱子 ${cx},${cy}`).toBe(true);
          expect(s.buildings.some((b) => cx >= b.x && cx < b.x + b.size && cy >= b.y && cy < b.y + b.size)).toBe(false);
        }
      }
    }
    // 人造一圈墙，里面的格子不可达
    const wall = [];
    let id = 1;
    for (let k = 8; k <= 12; k++) for (const [x, y] of [[k, 8], [k, 12], [8, k], [12, k]] as const) wall.push({ id: id++, kind: 'wall' as const, level: 1, x, y });
    const s = createBattle({ ...bigArmy(setupOf(0, 1)), layout: wall });
    const ok = reachableCells(s.buildings);
    expect(ok[(10 + 3) * 28 + 10 + 3]).toBe(false);
    expect(ok[(2 + 3) * 28 + 2 + 3]).toBe(true);
    for (let sd = 1; sd < 30; sd++) {
      const cs = placeChests(s.buildings, new Rng(sd, 'fun.chest'));
      for (const c of cs) expect(Math.floor(c.x / 100) > 8 && Math.floor(c.x / 100) < 12 && Math.floor(c.y / 100) > 8 && Math.floor(c.y / 100) < 12).toBe(false);
    }
  });
  it('兵走到旁边就捡走：能量 +3（封顶）、回血、护盾减伤', () => {
    for (const reward of ['energy', 'heal', 'shield'] as const) {
      const s = createBattle({ ...bigArmy(setupOf(0, 1)), fun: { chest: true } });
      const c = s.chests![0]!;
      c.reward = reward;
      s.energy = 5;
      s.units.push({ id: 900, kind: 'sailor', level: 1, x: c.x + 50, y: c.y, hp: 10, maxHp: 100, target: -1, mode: 'move', face: 1, cd: 0 });
      const ev: BattleEvent[] = stepBattle(s, []);
      const got = ev.find((e) => e.type === 'chest');
      expect(got).toBeTruthy();
      expect(c.taken).toBe(true);
      if (reward === 'energy') expect(s.energy).toBe(8);
      if (reward === 'heal') expect(s.units.find((u) => u.id === 900)!.hp).toBe(10 + FUN.chest.healPct);
      // 同一个箱子不会捡第二次
      expect(stepBattle(s, []).some((e) => e.type === 'chest' && e.id === c.id)).toBe(false);
    }
  });
});

describe('中途援军', () => {
  it('确定：同种子同时间同地点；提前预告，规模约一成、等级跟船队', () => {
    const base = bigArmy(setupOf(8, 3));
    const run = (): { warnAt: number; landAt: number; n: number; x: number } => {
      const s = createBattle({ ...base, fun: { ally: true } });
      let warnAt = -1;
      let landAt = -1;
      let n = 0;
      let x = 0;
      for (let k = 0; k < 900 && !s.over; k++) {
        for (const e of stepBattle(s, [])) {
          if (e.type === 'ally' && e.phase === 'warn') warnAt = s.tick - 1;
          if (e.type === 'ally' && e.phase === 'land') {
            landAt = s.tick - 1;
            n = e.units.length;
            x = e.x;
          }
        }
      }
      return { warnAt, landAt, n, x };
    };
    const r = run();
    expect(run()).toEqual(r);
    expect(r.landAt - r.warnAt).toBe(FUN.ally.warnTicks);
    expect(r.landAt).toBeGreaterThanOrEqual(FUN.ally.atMin);
    expect(r.landAt).toBeLessThan(FUN.ally.atMin + FUN.ally.atSpan);
    expect(r.n).toBeGreaterThanOrEqual(1);
    const total = base.army.boats.reduce((a, b) => a + b.count, 0);
    expect(r.n).toBeLessThanOrEqual(Math.max(1, Math.ceil(total / 5)));
  });
  it('援军没靠岸之前不会因为"兵打光了"提前结束；援军拆的楼算进星数', () => {
    const base = setupOf(0, 1);
    const s = createBattle({ ...base, army: { ...base.army, boats: [{ troop: 'sailor', count: 1, level: 1 }] }, fun: { ally: true } });
    for (let k = 0; k < 400; k++) stepBattle(s, []);
    expect(s.over).toBe(false);
    for (let k = 0; k < 400; k++) stepBattle(s, []);
    expect(s.units.length).toBeGreaterThan(0);
  });
  it('开着宝箱和援军，机器人整局跑得完、回放指纹一致', () => {
    for (const i of LEVELS) {
      const st = bigArmy({ ...setupOf(i, 4), fun: { chest: true, ally: true } });
      const acts = botActions(st, 'normal');
      const a = runBattle(st, acts);
      const b = replayRaid(st, acts, a.state.tick);
      expect(b.fingerprint).toBe(battleFingerprint(a.state));
      expect(battleResult(a.state).over).toBe(true);
    }
  });
});

describe('误放撤回', () => {
  const land: BattleAction = { t: 0, type: 'land', boat: 0, x: -150, y: 1100 };
  const fresh = (rules = 13): ReturnType<typeof createBattle> => createBattle(bigArmy({ ...setupOf(3, 5), rules }));
  it('落地 5 拍内撤回：兵清空、船可再放', () => {
    const s = fresh();
    stepBattle(s, [land]);
    expect(s.units.length).toBeGreaterThan(0);
    for (let k = 0; k < 4; k++) stepBattle(s, []);
    expect(canRecall(s, 0)).toBe(true);
    const ev = stepBattle(s, [{ t: 5, type: 'recall', boat: 0 }]);
    expect(ev.some((e) => e.type === 'recall')).toBe(true);
    expect(s.units.length).toBe(0);
    expect(s.landed[0]).toBe(false);
    stepBattle(s, [{ ...land, t: 6, x: 2350, y: 1100 }]);
    expect(s.landed[0]).toBe(true);
  });
  it('超过 10 拍、已掉血、规则版本 12 都不行', () => {
    const s = fresh();
    stepBattle(s, [land]);
    for (let k = 0; k < 11; k++) stepBattle(s, []);
    expect(canRecall(s, 0)).toBe(false);
    const hurt = fresh();
    stepBattle(hurt, [land]);
    hurt.units[0]!.hp -= 1;
    expect(canRecall(hurt, 0)).toBe(false);
    const old = fresh(12);
    stepBattle(old, [land]);
    expect(canRecall(old, 0)).toBe(false);
    stepBattle(old, [{ t: 1, type: 'recall', boat: 0 }]);
    expect(old.units.length).toBeGreaterThan(0);
  });
  it('带撤回的操作序列：sanitizeActions 往返、重放指纹一致', () => {
    const st = bigArmy(setupOf(3, 5));
    const acts: BattleAction[] = [land, { t: 4, type: 'recall', boat: 0 }, { t: 8, type: 'land', boat: 0, x: 2350, y: 1100 }];
    expect(sanitizeActions(acts, st.army)).toEqual(acts);
    expect(sanitizeActions([{ t: 4, type: 'recall', boat: 99 }], st.army)).toBeNull();
    const a = runBattle(st, acts);
    expect(replayRaid(st, acts, a.state.tick).fingerprint).toBe(battleFingerprint(a.state));
  });
});
