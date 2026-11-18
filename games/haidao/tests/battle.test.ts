import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN, RULES_VERSION, TROOPS, armyFor, battleFingerprint, botActions, canLand, createBattle, newProfile, runBattle,
  publicLayout, settleCampaign, startCampaign, stepBattle, trimArmy,
} from '../src/core/index.ts';
import type { BattleAction, BattleSetup } from '../src/core/index.ts';
import { sampleArmy } from '../tools/sample.ts';

function setupFor(i: number, seed = 1, rules = RULES_VERSION): BattleSetup {
  const lv = CAMPAIGN[i]!;
  return { layout: lv.layout, army: sampleArmy(lv.hq), seed, rules };
}

describe('战斗', () => {
  it('登陆区：只在岛外一圈海滩', () => {
    const s = createBattle(setupFor(0));
    expect(canLand(s, -150, 1100)).toBe(true);
    expect(canLand(s, 1100, 1100)).toBe(false);
    expect(canLand(s, -350, 1100)).toBe(false);
    expect(canLand(s, 2300, 2300)).toBe(true);
    expect(canLand(s, 2600, 1100)).toBe(false);
  });
  it('坐标不是有限数：canLand 返回 false，操作被忽略', () => {
    const s = createBattle(setupFor(0));
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(canLand(s, v, 1100)).toBe(false);
      expect(canLand(s, -150, v)).toBe(false);
    }
    const e0 = s.energy;
    stepBattle(s, [
      { t: 0, type: 'land', boat: 0, x: Number.NaN, y: 1000 },
      { t: 0, type: 'land', boat: 0, x: -150, y: Number.POSITIVE_INFINITY },
      { t: 0, type: 'skill', skill: 'barrage', x: Number.NaN, y: 0 },
    ]);
    expect(s.units).toHaveLength(0);
    expect(s.landed[0]).toBe(false);
    expect(s.energy).toBe(e0);
  });
  it('非法登陆被忽略；同一条船不能登陆两次', () => {
    const s = createBattle(setupFor(0));
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: 1100, y: 1100 }]);
    expect(s.units).toHaveLength(0);
    const ev = stepBattle(s, [{ t: 1, type: 'land', boat: 0, x: -150, y: 1000 }, { t: 1, type: 'land', boat: 0, x: -150, y: 900 }]);
    expect(ev.filter((e) => e.type === 'land')).toHaveLength(1);
  });
  it('确定性：同 setup 同操作两次重放指纹相同；换种子不同', () => {
    for (const i of [0, 5, 9, 11]) {
      const setup = setupFor(i, 7);
      const acts = botActions(setup, 'normal');
      const a = runBattle(setup, acts);
      const b = runBattle(setup, acts);
      expect(battleFingerprint(a.state)).toBe(battleFingerprint(b.state));
      expect(a.result).toEqual(b.result);
      expect(a.events).toBe(b.events);
    }
    const x = runBattle(setupFor(5, 1), botActions(setupFor(5, 1), 'normal'));
    const y = runBattle(setupFor(5, 2), botActions(setupFor(5, 2), 'normal'));
    expect(battleFingerprint(x.state)).not.toBe(battleFingerprint(y.state));
  }, 15_000); // 负载 28–32、maxWorkers=1 实测 2.3 秒，取 4 倍
  it('逐拍推进与 runBattle 一致，结束后不再变化', () => {
    const setup = setupFor(1);
    const acts = botActions(setup, 'normal');
    const s = createBattle(setup);
    while (!s.over) stepBattle(s, acts.filter((a) => a.t === s.tick));
    const r = runBattle(setup, acts);
    expect(battleFingerprint(s)).toBe(battleFingerprint(r.state));
    const fp = battleFingerprint(s);
    expect(stepBattle(s, [])).toEqual([]);
    expect(battleFingerprint(s)).toBe(fp);
  });
  it('逐拍推进与 runBattle：事件序列和最终指纹一致（同一拍的操作按排序后的顺序进）', () => {
    for (const i of [1, 6]) {
      const setup = setupFor(i, 4);
      const acts = botActions(setup, 'normal');
      const sorted = acts.map((a, k) => ({ a, k })).sort((p, q) => p.a.t - q.a.t || p.k - q.k).map((x) => x.a);
      const s = createBattle(setup);
      const evs: string[] = [];
      let k = 0;
      while (!s.over) {
        const now: BattleAction[] = [];
        while (k < sorted.length && sorted[k]!.t <= s.tick) now.push(sorted[k++]!);
        for (const e of stepBattle(s, now)) evs.push(JSON.stringify(e));
      }
      const r = runBattle(setup, acts);
      expect(evs.length).toBe(r.events);
      expect(battleFingerprint(s)).toBe(battleFingerprint(r.state));
      // 再逐拍跑一遍，事件序列逐条相同（确定性）
      const s2 = createBattle(setup);
      const evs2: string[] = [];
      k = 0;
      while (!s2.over) {
        const now: BattleAction[] = [];
        while (k < sorted.length && sorted[k]!.t <= s2.tick) now.push(sorted[k++]!);
        for (const e of stepBattle(s2, now)) evs2.push(JSON.stringify(e));
      }
      expect(evs2).toEqual(evs);
      expect(JSON.parse(evs[evs.length - 1]!)).toMatchObject({ type: 'end' });
    }
  });
  it('没人登陆就一直耗到时间到，0 星', () => {
    const r = runBattle(setupFor(0), []);
    expect(r.result.stars).toBe(0);
    expect(r.state.tick).toBe(3600);
  });
  it('摧毁一座建筑回 1 点能量；星规则', () => {
    const setup = setupFor(0);
    const { state, result } = runBattle(setup, botActions(setup, 'normal'));
    expect(result.destroyedPct).toBe(100);
    expect(result.hqDown).toBe(true);
    expect(result.stars).toBe(3);
    expect(state.buildings.filter((b) => b.destroyed).length).toBeGreaterThanOrEqual(4);
  });
  it('地雷：踩到才暴露', () => {
    const lv = CAMPAIGN[3]!;
    const s = createBattle(setupFor(3));
    expect(s.buildings.filter((b) => b.kind === 'mine').every((b) => !b.revealed)).toBe(true);
    const setup = setupFor(3);
    const r = runBattle(setup, botActions(setup, 'novice'));
    expect(lv.layout.some((b) => b.kind === 'mine')).toBe(true);
    expect(r.state.buildings.some((b) => b.kind === 'mine' && b.revealed)).toBe(true);
  });
  it('技能：能量不够不放；炮击扣能量并伤到建筑', () => {
    const setup = setupFor(0);
    const s = createBattle(setup);
    const e0 = s.energy;
    const act: BattleAction = { t: 0, type: 'skill', skill: 'barrage', x: 1100, y: 1100 };
    stepBattle(s, [act]);
    expect(s.energy).toBe(e0 - 4);
    stepBattle(s, [act]);
    expect(s.energy).toBe(e0 - 4); // 只剩 2 点，不够
    for (let i = 0; i < 30; i++) stepBattle(s, []);
    expect(s.buildings.find((b) => b.kind === 'hq')!.hp).toBeLessThan(s.buildings.find((b) => b.kind === 'hq')!.maxHp);
  });
});

describe('战役', () => {
  it('新号能打第 1 关拿 3 星（普通机器人），结算给掠夺和星奖', () => {
    const p = newProfile();
    const st = startCampaign(p, 'c01', 11);
    if (!st.ok) throw new Error(st.error);
    expect(st.value.profile.res.wood).toBeLessThan(p.res.wood);
    const { setup } = st.value;
    expect(setup.army).toEqual(armyFor(p));
    const { result, state } = runBattle(setup, botActions(setup, 'normal'));
    expect(result.stars).toBe(3);
    expect(state.tick).toBeLessThanOrEqual(2400); // 新号两船水手，2 分钟内打完
    const done = settleCampaign(st.value.profile, 'c01', result);
    expect(done.newStars).toBe(3);
    expect(done.profile.stars.c01).toBe(3);
    expect(done.loot.gold).toBeGreaterThan(CAMPAIGN[0]!.loot.gold - 1);
    // 已三星再打：掠夺只给三成，不再有星奖
    const again = settleCampaign({ ...done.profile, res: { gold: 0, wood: 0 } }, 'c01', result);
    expect(again.newStars).toBe(0);
    // 三成掠夺 + 连胜 10% + 可能的掉落箱：不少于三成加成
    expect(again.streakBonusPct).toBe(10);
    expect(again.loot.gold).toBeGreaterThanOrEqual(Math.floor(CAMPAIGN[0]!.loot.gold * 0.3 * 1.1));
  });
  it('未解锁的关和木材不够', () => {
    const p = newProfile();
    expect(startCampaign(p, 'c03', 1)).toEqual({ ok: false, error: 'locked' });
    expect(startCampaign(p, 'nope', 1)).toEqual({ ok: false, error: 'locked' });
    expect(startCampaign({ ...p, res: { gold: 0, wood: 3 } }, 'c01', 1)).toEqual({ ok: false, error: 'no_wood' });
  });
  it('木材不够整支船队就少带兵，船坞配置不动', () => {
    const p = { ...newProfile(), res: { gold: 0, wood: 50 } }; // 满编两船 12 个水手 96 木材，50 只够 6 个
    const st = startCampaign(p, 'c01', 1);
    if (!st.ok) throw new Error(st.error);
    expect(st.value.trimmed).toBe(6);
    expect(st.value.setup.army.boats.map((b) => b.count)).toEqual([6]); // 同价先减后面的船，减空的船不带
    expect(st.value.profile.res.wood).toBe(2);
    expect(st.value.profile.boats).toEqual(p.boats);
    expect(armyFor(st.value.profile)).toEqual(armyFor(p));
    const full = startCampaign({ ...p, res: { gold: 0, wood: 96 } }, 'c01', 1);
    if (!full.ok) throw new Error(full.error);
    expect(full.value.trimmed).toBe(0);
    expect(full.value.setup.army).toEqual(armyFor(p));
  });
  it('少带兵先减单价最高的', () => {
    const army = { boats: [{ troop: 'sailor' as const, count: 4, level: 1 }, { troop: 'gunner' as const, count: 3, level: 1 }], skills: [], energy: 6 };
    const u = (k: 'sailor' | 'gunner'): number => TROOPS[k].levels[0]!.cost;
    expect(u('gunner')).toBeGreaterThan(u('sailor'));
    const t = trimArmy(army, 4 * u('sailor') + u('gunner'));
    expect(t?.army.boats.map((b) => b.count)).toEqual([4, 1]);
    expect(t?.trimmed).toBe(2);
    expect(trimArmy(army, u('sailor') - 1)).toBeNull();
    expect(army.boats[1]!.count).toBe(3); // 不改传进来的部队
  });
  it('掠夺按仓库上限截断', () => {
    const p = { ...newProfile(), res: { gold: 1490, wood: 0 } };
    const r = settleCampaign(p, 'c01', { over: true, stars: 3, destroyedPct: 100, hqDown: true });
    expect(r.profile.res.gold).toBe(1500);
  });
});

describe('隐藏信息与金标准', () => {
  it('地雷：未触发时 revealed=false，publicLayout 去掉地雷且不改入参', () => {
    const lv = CAMPAIGN[3]!;
    const before = JSON.stringify(lv.layout);
    const pub = publicLayout(lv.layout);
    expect(lv.layout.some((b) => b.kind === 'mine')).toBe(true);
    expect(pub.some((b) => b.kind === 'mine')).toBe(false);
    expect(pub).toHaveLength(lv.layout.filter((b) => b.kind !== 'mine').length);
    expect(JSON.stringify(lv.layout)).toBe(before);
    const s = createBattle(setupFor(3));
    for (const b of s.buildings) expect(b.revealed).toBe(b.kind !== 'mine');
    // 中途没有踩到的地雷仍然是隐藏的
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
    expect(s.buildings.filter((b) => b.kind === 'mine' && !b.destroyed).every((b) => !b.revealed)).toBe(true);
  });

  it('金标准：固定 setup 加机器人操作的整场指纹（规则改了要有意更新并升 RULES_VERSION；版本 6 不改战役，指纹和版本 5 一样；版本 7、8 只改守岛；不带前缀的键锁版本 8，v9- 的锁版本 9）', () => {
    expect(RULES_VERSION).toBe(18);
    const got: Record<string, string> = {};
    for (const rules of [8, 9]) {
      for (const [i, style] of [[0, 'normal'], [4, 'normal'], [7, 'novice'], [11, 'normal']] as const) {
        const setup = setupFor(i, 42, rules);
        const r = runBattle(setup, botActions(setup, style));
        got[`${rules === 8 ? '' : `v${rules}-`}${CAMPAIGN[i]!.id}-${style}`] = `${battleFingerprint(r.state)} t${r.state.tick} s${r.result.stars} p${r.result.destroyedPct} e${r.events}`;
      }
    }
    // 规则版本 10 只加震荡炮、掷弹兵和震晕，11 只加狙击塔、盾兵：战役岛和典型部队里都没有，指纹和版本 9 逐位一样
    for (const rules of [10, 11]) {
      for (const [i, style] of [[0, 'normal'], [4, 'normal'], [7, 'novice'], [11, 'normal']] as const) {
        const setup = setupFor(i, 42, rules);
        const r = runBattle(setup, botActions(setup, style));
        expect(`${battleFingerprint(r.state)} t${r.state.tick} s${r.result.stars} p${r.result.destroyedPct} e${r.events}`, `v${rules} ${CAMPAIGN[i]!.id}`).toBe(got[`v9-${CAMPAIGN[i]!.id}-${style}`]);
      }
    }
    expect(got).toMatchInlineSnapshot(`
      {
        "c01-normal": "1286599511 t2357 s3 p100 e1222",
        "c05-normal": "3345519285 t3600 s2 p72 e1467",
        "c08-novice": "1546703860 t3600 s1 p46 e1776",
        "c12-normal": "2898823692 t3320 s0 p41 e1139",
        "v9-c01-normal": "113238476 t2401 s3 p100 e1229",
        "v9-c05-normal": "2686508635 t2026 s2 p63 e1439",
        "v9-c08-novice": "1623798829 t3600 s1 p46 e1826",
        "v9-c12-normal": "2315145875 t2253 s1 p47 e2274",
      }
    `);
  }, 15_000); // 负载 28–32、maxWorkers=1 实测 3.3 秒，取 4 倍
});

describe('第二期规则', () => {
  const unitsOf = (troop: 'medic' | 'cannoneer' | 'harpooner' | 'sailor' | 'brute', n = 4): BattleSetup['army'] => ({
    boats: [{ troop, count: n, level: 1 }],
    skills: [{ kind: 'barrage', level: 1 }],
    energy: 8,
  });
  const lay = (rows: Array<[import('../src/core/index.ts').BuildingKind, number, number, number]>) => rows.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));

  it('船医给受伤的兵回血', () => {
    const army = { boats: [{ troop: 'sailor' as const, count: 2, level: 1 }, { troop: 'medic' as const, count: 1, level: 1 }], skills: [], energy: 0 };
    const s = createBattle({ layout: lay([['hq', 1, 9, 9]]), army, seed: 1, rules: RULES_VERSION });
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }, { t: 0, type: 'land', boat: 1, x: -150, y: 1100 }]);
    const sailor = s.units.find((u) => u.kind === 'sailor')!;
    sailor.hp = 10;
    let healed = 0;
    for (let i = 0; i < 80; i++) for (const e of stepBattle(s, [])) if (e.type === 'heal') healed += e.amount;
    expect(healed).toBeGreaterThan(0);
    expect(sailor.hp).toBeGreaterThan(10);
  });
  it('火炮兵、鱼叉手都能拆建筑', () => {
    for (const troop of ['cannoneer', 'harpooner'] as const) {
      const setup = { layout: lay([['hq', 1, 9, 9]]), army: unitsOf(troop), seed: 1, rules: RULES_VERSION };
      const r = runBattle(setup, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
      expect(r.result.hqDown, troop).toBe(true);
    }
  });
  it('焦油陷阱：隐藏，踩到后兵减速', () => {
    const setup = { layout: lay([['hq', 1, 9, 9], ['tar', 1, 2, 10]]), army: unitsOf('sailor', 1), seed: 1, rules: RULES_VERSION };
    const s = createBattle(setup);
    expect(s.buildings[1]!.revealed).toBe(false);
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1050 }]);
    let sawSlow = false;
    let lastX = s.units[0]!.x;
    for (let i = 0; i < 120; i++) {
      stepBattle(s, []);
      const u = s.units[0]!;
      if (s.buildings[1]!.destroyed && !sawSlow) {
        sawSlow = true;
        const x0 = u.x;
        stepBattle(s, []);
        expect(u.x - x0).toBeLessThanOrEqual(Math.round((1.6 * 100) / 20) / 2 + 1);
      }
      lastX = u.x;
    }
    expect(sawSlow).toBe(true);
    expect(lastX).toBeGreaterThan(0);
  });
  it('火箭塔一次打多个兵', () => {
    const setup = { layout: lay([['hq', 1, 9, 9], ['rocket', 1, 12, 5]]), army: unitsOf('sailor', 5), seed: 1, rules: RULES_VERSION };
    const s = createBattle(setup);
    let shots = 0;
    for (const e of stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: 1300, y: -150 }])) if (e.type === 'shoot') shots++;
    for (let i = 0; i < 40; i++) for (const e of stepBattle(s, [])) if (e.type === 'shoot' && e.from === 'building') shots++;
    expect(shots).toBeGreaterThanOrEqual(2);
  });
  it('海怪拍海滩上的兵，也能被打掉', () => {
    const setup = { layout: lay([['hq', 1, 9, 9], ['kraken', 1, -3, 9]]), army: unitsOf('brute', 1), seed: 1, rules: RULES_VERSION };
    const s = createBattle(setup);
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
    let slams = 0;
    for (let i = 0; i < 60; i++) for (const e of stepBattle(s, [])) if (e.type === 'explode') slams++;
    expect(slams).toBeGreaterThan(0);
    const r = runBattle({ ...setup, army: unitsOf('brute', 8) }, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
    expect(r.state.buildings.find((b) => b.kind === 'kraken')!.destroyed).toBe(true);
  });
  it('雾塔：罩住的建筑先看不见，炮击打不中；兵走近才现形', () => {
    const setup = { layout: lay([['hq', 1, 9, 9], ['fogTower', 1, 12, 6], ['goldmine', 1, 14, 9]]), army: unitsOf('sailor', 1), seed: 1, rules: RULES_VERSION };
    const s = createBattle(setup);
    expect(s.buildings.find((b) => b.kind === 'goldmine')!.revealed).toBe(false);
    expect(s.buildings.find((b) => b.kind === 'fogTower')!.revealed).toBe(true);
    const gm = s.buildings.find((b) => b.kind === 'goldmine')!;
    stepBattle(s, [{ t: 0, type: 'skill', skill: 'barrage', x: 1550, y: 1050 }]);
    for (let i = 0; i < 40; i++) stepBattle(s, []);
    expect(gm.hp).toBe(gm.maxHp);
    // 兵走近后现形
    const s2 = createBattle(setup);
    s2.units.push({ id: 1, kind: 'sailor', level: 1, x: 1400, y: 1000, hp: 100, maxHp: 100, target: -1, mode: 'move', face: 1, cd: 0 });
    stepBattle(s2, []);
    expect(s2.buildings.find((b) => b.kind === 'goldmine')!.revealed).toBe(true);
  });
});
