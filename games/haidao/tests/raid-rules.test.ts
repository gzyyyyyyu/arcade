import { describe, expect, it } from 'vitest';
import { BRANCHES, BUILDINGS, CAMPAIGN, RULES_VERSION, battleFingerprint, campaignSetup, battleResult, botActions, createBattle, heroLevel, islandExt, newProfile, runBattle, stepBattle } from '../src/core/index.ts';
import type { BattleEvent, BattleSetup, Placed } from '../src/core/index.ts';
import { RAID_HERO, RAID_HERO_LEASH } from '../src/content/tdunits.ts';
import { raidSetup, replayRaid } from '../src/core/pvp.ts';
import { validateBase } from '../src/core/validate.ts';
import { fullBase, sampleArmy } from '../tools/sample.ts';

/**
 * 攻防的金标准（只锁当前规则版本）：固定 setup 加机器人操作打完一场的 [指纹, 星数, 摧毁率]。
 * 战役每关普通机器人种子 1、小白种子 2；hqN/布局/plain|td 是 fullBase 的满配岛（td = 带宝藏箱和分叉）、种子 7。
 * 规则、战役布局、机器人改了就会变：有意改动后按新结果重录，并在提交说明里写清为什么；回放不保证跨版本，旧版本不另录。
 */
const GOLDEN: Record<string, [number, number, number]> = {
  'c01/normal/1': [3948300874, 3, 100],
  'c01/novice/2': [631265332, 3, 100],
  'c02/normal/1': [3409974777, 3, 100],
  'c02/novice/2': [2452518807, 3, 100],
  'c03/normal/1': [1200473016, 3, 100],
  'c03/novice/2': [1139127349, 3, 100],
  'c04/normal/1': [214608332, 3, 100],
  'c04/novice/2': [4116441673, 3, 100],
  'c05/normal/1': [1243432695, 3, 100],
  'c05/novice/2': [1034896399, 2, 63],
  'c06/normal/1': [53808885, 3, 100],
  'c06/novice/2': [289060119, 3, 100],
  'c07/normal/1': [347365248, 3, 100],
  'c07/novice/2': [267055209, 2, 75],
  'c08/normal/1': [4102436288, 3, 100],
  'c08/novice/2': [3525213145, 2, 76],
  'c09/normal/1': [3525729690, 3, 100],
  'c09/novice/2': [806513025, 2, 53],
  'c10/normal/1': [715383414, 2, 84],
  'c10/novice/2': [2771735960, 3, 100],
  'c11/normal/1': [4213487801, 3, 100],
  'c11/novice/2': [477055438, 3, 100],
  'c12/normal/1': [2205141605, 2, 88],
  'c12/novice/2': [917994887, 3, 100],
  'c13/normal/1': [1961329852, 2, 73],
  'c13/novice/2': [1620213354, 3, 100],
  'c14/normal/1': [3997848256, 2, 82],
  'c14/novice/2': [286886913, 3, 100],
  'c15/normal/1': [2097588051, 1, 61],
  'c15/novice/2': [3147211294, 3, 100],
  'c16/normal/1': [4058800649, 3, 100],
  'c16/novice/2': [3443361163, 0, 33],
  'c17/normal/1': [2396330351, 3, 100],
  'c17/novice/2': [390001220, 1, 57],
  'c18/normal/1': [562349290, 1, 60],
  'c18/novice/2': [1501187210, 1, 65],
  'c19/normal/1': [2305074962, 2, 77],
  'c19/novice/2': [93025755, 1, 55],
  'c20/normal/1': [3035344539, 2, 84],
  'c20/novice/2': [3504565328, 3, 100],
  'c21/normal/1': [3969308567, 3, 100],
  'c21/novice/2': [3389169573, 3, 100],
  'c22/normal/1': [2344392545, 3, 100],
  'c22/novice/2': [343479400, 1, 52],
  'c23/normal/1': [78254991, 2, 60],
  'c23/novice/2': [3274331296, 3, 100],
  'c24/normal/1': [2386521914, 1, 62],
  'c24/novice/2': [1930977347, 0, 18],
  'c25/normal/1': [2872982333, 3, 100],
  'c25/novice/2': [1775519898, 3, 100],
  'c26/normal/1': [3978811478, 3, 100],
  'c26/novice/2': [522750282, 0, 40],
  'c27/normal/1': [591935472, 1, 65],
  'c27/novice/2': [3129847198, 3, 100],
  'c28/normal/1': [4137271458, 2, 90],
  'c28/novice/2': [396337967, 2, 86],
  'c29/normal/1': [1556322285, 1, 51],
  'c29/novice/2': [834162185, 1, 81],
  'c30/normal/1': [2341630317, 1, 55],
  'c30/novice/2': [1371416701, 3, 100],
  'hq3/turtle/plain': [1532886607, 0, 25],
  'hq3/turtle/td': [1595322046, 0, 29],
  'hq3/spread/plain': [2273621801, 2, 75],
  'hq3/spread/td': [2149781173, 2, 58],
  'hq3/trap/plain': [1166791585, 0, 31],
  'hq3/trap/td': [2662192437, 0, 41],
  'hq5/turtle/plain': [3496388543, 0, 16],
  'hq5/turtle/td': [2659857611, 0, 14],
  'hq5/spread/plain': [1219955235, 0, 44],
  'hq5/spread/td': [1829651384, 0, 40],
  'hq5/trap/plain': [2799957121, 0, 24],
  'hq5/trap/td': [3122120971, 0, 18],
  'hq7/turtle/plain': [1529970563, 0, 39],
  'hq7/turtle/td': [2063565170, 0, 15],
  'hq7/spread/plain': [3115399763, 0, 29],
  'hq7/spread/td': [1002571705, 0, 31],
  'hq7/trap/plain': [507138426, 0, 24],
  'hq7/trap/td': [1152703929, 0, 13],
};

function goldenSetup(key: string): BattleSetup {
  const [a, b, c] = key.split('/') as [string, string, string];
  if (a.startsWith('hq')) {
    const hq = Number(a.slice(2));
    const layout = fullBase(hq, b as 'turtle', c === 'td').base.buildings;
    return { layout, army: sampleArmy(hq), seed: 7, rules: RULES_VERSION, ext: islandExt(layout) };
  }
  const lv = CAMPAIGN.find((l) => l.id === a)!;
  return campaignSetup(lv, sampleArmy(lv.hq), Number(c));
}
const styleOf = (key: string): 'normal' | 'novice' => (key.startsWith('hq') ? 'normal' : (key.split('/')[1] as 'normal' | 'novice'));

describe('攻防金标准', () => {
  it('每一场的指纹、星数、摧毁率逐位不变', () => {
    expect(RULES_VERSION).toBe(28);
    for (const key of Object.keys(GOLDEN)) {
      const setup = goldenSetup(key);
      const r = replayRaid(setup, botActions(setup, styleOf(key)));
      expect([r.fingerprint, r.result.stars, r.result.destroyedPct], key).toEqual(GOLDEN[key]);
    }
  }, 120_000); // 负载 28–32、maxWorkers=1 实测 29.0 秒，取 4 倍

  it('战役（和借战役关卡的流浪海盗岛、悬赏岛）没有宝藏箱和分叉；raidSetup 出当前规则版本', () => {
    for (const lv of CAMPAIGN) expect(lv.layout.some((b) => b.kind === 'treasure' || b.branch !== undefined), lv.id).toBe(false);
    expect(raidSetup([], 0, sampleArmy(3), 1).rules).toBe(RULES_VERSION);
  });
});

function heroSetup(hq: number, style: 'turtle' | 'spread' | 'trap', seed: number): BattleSetup {
  const p = fullBase(hq, style, true);
  return raidSetup(p.base.buildings, islandExt(p.base.buildings), sampleArmy(Math.min(8, hq + 1)), seed, heroLevel(p));
}

describe('驻岛英雄', () => {
  it('站在第一个宝藏箱旁一格；等级来自研究 hero，没有宝藏箱或没写等级就没有英雄', () => {
    const setup = heroSetup(5, 'spread', 1);
    const s = createBattle(setup);
    const t = setup.layout.find((b) => b.kind === 'treasure')!;
    expect(s.hero).toBeDefined();
    expect(s.hero!.level).toBe(5);
    expect(s.hero!.hp).toBe(RAID_HERO[4]!.hp);
    expect(Math.abs(Math.floor(s.hero!.x / 100) - t.x) <= 1 && Math.abs(Math.floor(s.hero!.y / 100) - t.y) <= 1).toBe(true);
    expect(createBattle({ ...setup, hero: undefined }).hero).toBeUndefined();
    expect(createBattle({ ...setup, layout: setup.layout.filter((b) => b.kind !== 'treasure') }).hero).toBeUndefined();
  });

  it('确定性：同一场重放两次、逐拍推进和 runBattle 指纹一样；有英雄和没英雄结果不同', () => {
    for (const [hq, style, seed] of [[3, 'spread', 1], [5, 'trap', 2], [7, 'turtle', 3]] as const) {
      const setup = heroSetup(hq, style, seed);
      const acts = botActions(setup, 'normal');
      const a = replayRaid(setup, acts);
      expect(replayRaid(JSON.parse(JSON.stringify(setup)) as BattleSetup, acts).fingerprint).toBe(a.fingerprint);
      expect(battleFingerprint(runBattle(setup, acts).state)).toBe(a.fingerprint);
      expect(replayRaid({ ...setup, hero: undefined }, acts).fingerprint).not.toBe(a.fingerprint);
    }
  }, 15_000); // 负载 28–32、maxWorkers=1 实测 2.5 秒，取 4 倍

  it('守岗、扔火药桶、号令、倒下不复活；追出 6 格就回岗', () => {
    let kegs = 0;
    let rallies = 0;
    let downs = 0;
    for (const [hq, style, seed] of [[3, 'spread', 1], [5, 'spread', 2], [5, 'trap', 3], [7, 'spread', 4], [7, 'trap', 5]] as const) {
      const setup = heroSetup(hq, style, seed);
      const acts = botActions(setup, 'normal');
      const s = createBattle(setup);
      let dead = false;
      while (!s.over) {
        const ev: BattleEvent[] = stepBattle(s, acts.filter((a) => a.t === s.tick));
        const h = s.hero!;
        for (const e of ev) {
          if (e.type !== 'hero') continue;
          if (e.what === 'keg') kegs++;
          if (e.what === 'rally') rallies++;
          if (e.what === 'down') downs++;
        }
        if (dead) expect(h.mode).toBe('dead');
        if (h.mode === 'dead') dead = true;
        const off = Math.max(Math.abs(h.x - h.postX), Math.abs(h.y - h.postY));
        expect(off).toBeLessThanOrEqual(RAID_HERO_LEASH + 20);
      }
    }
    expect(kegs).toBeGreaterThan(0);
    expect(rallies).toBeGreaterThan(0);
    expect(downs).toBeGreaterThan(0);
  });
});

describe('宝藏箱和分叉进登陆战', () => {
  it('宝藏箱是普通建筑：有血、算摧毁率，拆了它摧毁率涨', () => {
    const layout: Placed[] = [
      { id: 1, kind: 'hq', level: 1, x: 2, y: 2 },
      { id: 2, kind: 'treasure', level: 1, x: 17, y: 10 },
    ];
    const setup: BattleSetup = { layout, army: sampleArmy(3), seed: 3, rules: RULES_VERSION };
    const s = createBattle(setup);
    expect(s.buildings.find((b) => b.kind === 'treasure')!.maxHp).toBeGreaterThan(0);
    // 全部船靠东边登陆，先拆宝藏箱
    const acts = setup.army.boats.map((_b, i) => ({ t: 0, type: 'land' as const, boat: i, x: 2350, y: 1050 + i * 20 }));
    let pctAtTreasure = -1;
    while (!s.over) {
      const ev = stepBattle(s, acts.filter((a) => a.t === s.tick));
      if (ev.some((e) => e.type === 'destroy' && e.kind === 'treasure')) pctAtTreasure = battleResult(s).destroyedPct;
    }
    expect(pctAtTreasure).toBe(50);
  });

  it('分叉在登陆战里起作用：同一座塔选了分叉，整场指纹不同', () => {
    const base = (branch?: string[]): Placed[] => [
      { id: 1, kind: 'hq', level: 3, x: 9, y: 9 },
      { id: 2, kind: 'mortar', level: 3, x: 4, y: 9, ...(branch ? { branch } : {}) },
      { id: 3, kind: 'cannon', level: 3, x: 14, y: 9, ...(branch ? { branch: ['cannon.chain'] } : {}) },
    ];
    const run = (layout: Placed[]) => {
      const setup: BattleSetup = { layout, army: sampleArmy(3), seed: 5, rules: RULES_VERSION };
      return replayRaid(setup, botActions(setup, 'normal'));
    };
    const a = run(base());
    const b = run(base(['mortar.fire']));
    expect(b.fingerprint).not.toBe(a.fingerprint);
    // 版本 6 下坏的分叉（等级不够）当没有
    const lowLv: Placed[] = [{ id: 1, kind: 'hq', level: 3, x: 9, y: 9 }, { id: 2, kind: 'cannon', level: 2, x: 4, y: 9, branch: ['cannon.pierce'] }];
    expect(createBattle({ layout: lowLv, army: sampleArmy(3), seed: 1, rules: RULES_VERSION }).buildings[1]!.branch).toBeUndefined();
  });
});

describe('validateBase 认宝藏箱、分叉、英雄研究', () => {
  const ok = (p: unknown): string => {
    const v = validateBase(JSON.parse(JSON.stringify(p)));
    return v.ok ? 'OK' : v.error;
  };
  it('满配的岛（宝藏箱摆满、分叉、英雄研究）原样收下', () => {
    for (const hq of [3, 5, 7]) {
      const p = fullBase(hq, 'trap', true);
      const v = validateBase(JSON.parse(JSON.stringify(p)));
      expect(v.ok ? 'OK' : v.error, `hq${hq}`).toBe('OK');
      if (!v.ok) continue;
      expect(v.value.base.buildings.filter((b) => b.kind === 'treasure').length).toBe(p.base.buildings.filter((b) => b.kind === 'treasure').length);
      expect(v.value.base.buildings.filter((b) => b.branch).length).toBe(p.base.buildings.filter((b) => b.branch).length);
      expect(v.value.research.hero).toBe(p.research.hero);
    }
  });
  it('宝藏箱超名额回 limit', () => {
    const p = fullBase(3, 'trap', true);
    const used = new Set<string>();
    for (const b of p.base.buildings) for (let x = b.x; x < b.x + BUILDINGS[b.kind].size; x++) for (let y = b.y; y < b.y + BUILDINGS[b.kind].size; y++) used.add(`${x},${y}`);
    let spot = 0;
    while (used.has(`${spot % 22},${Math.floor(spot / 22)}`)) spot++;
    p.base.buildings.push({ id: 900, kind: 'treasure', level: 1, x: spot % 22, y: Math.floor(spot / 22) });
    expect(ok(p)).toBe('limit');
  });
  it('坏的分叉回 branch：不是这种塔的、等级不够、6 级那次没先选 3 级那次、不是数组、超过两个', () => {
    const p = fullBase(7, 'trap', true);
    const cannon = p.base.buildings.find((b) => b.kind === 'cannon')!;
    for (const bad of [['gunTower.marksman'], ['cannon.heavy'], ['nope'], 'cannon.pierce', [], ['cannon.pierce', 'cannon.heavy', 'cannon.quick'], ['cannon.pierce', 'cannon.chain']]) {
      (cannon as { branch?: unknown }).branch = bad;
      expect(ok(p), JSON.stringify(bad)).toBe('branch');
    }
    cannon.level = 2;
    cannon.branch = ['cannon.pierce'];
    expect(ok(p)).toBe('branch');
  });
  it('英雄研究：不超过主寨，2 级以上要军械所；坏值回 research', () => {
    const p = fullBase(5, 'trap', true);
    p.research.hero = 6;
    expect(ok(p)).toBe('research');
    p.research.hero = 0;
    expect(ok(p)).toBe('research');
    p.research.hero = 5;
    expect(ok(p)).toBe('OK');
    const q = fullBase(3, 'trap', true);
    q.research.hero = 2;
    expect(ok(q)).toBe('research');
    q.research.hero = 1;
    expect(ok(q)).toBe('OK');
    expect(ok({ ...newProfile(), research: { hero: 'x' } })).toBe('research');
  });
});

describe('重放预算', () => {
  it('c30 的岛加宝藏箱、分叉、8 级驻岛英雄打满一场，服务端重放在预算内（本机见 DESIGN 5.1，负载高时放宽到 2 秒）', () => {
    const lv = CAMPAIGN.find((l) => l.id === 'c30')!;
    const layout: Placed[] = lv.layout.map((b, i) => {
      const t1 = BRANCHES.filter((d) => d.tower === b.kind && d.tier === 1);
      const t2 = BRANCHES.filter((d) => d.tower === b.kind && d.tier === 2);
      const br = [...(b.level >= 3 && t1.length ? [t1[i % t1.length]!.id] : []), ...(b.level >= 6 && t2.length ? [t2[i % t2.length]!.id] : [])];
      return br.length ? { ...b, branch: br } : { ...b };
    });
    const used = new Set<string>();
    for (const b of layout) for (let x = b.x; x < b.x + BUILDINGS[b.kind].size; x++) for (let y = b.y; y < b.y + BUILDINGS[b.kind].size; y++) used.add(`${x},${y}`);
    let spot: [number, number] | undefined;
    for (let r = 0; r < 11 && !spot; r++) for (let y = 11 - r; y <= 11 + r && !spot; y++) for (let x = 11 - r; x <= 11 + r && !spot; x++) if (!used.has(`${x},${y}`)) spot = [x, y];
    layout.push({ id: 9999, kind: 'treasure', level: 1, x: spot![0], y: spot![1] });
    const setup = raidSetup(layout, 0, sampleArmy(8), 4242, 8);
    const acts = botActions(setup, 'normal');
    expect(createBattle(setup).hero?.level).toBe(8);
    expect(layout.some((b) => b.branch)).toBe(true);
    replayRaid(setup, acts);
    const t0 = performance.now();
    const a = replayRaid(setup, acts);
    const ms = performance.now() - t0;
    console.log(`c30 + 宝藏箱 + 分叉 + 8 级英雄：重放 ${a.ticks} 拍，${ms.toFixed(0)} 毫秒`);
    expect(replayRaid(setup, acts).fingerprint).toBe(a.fingerprint);
    expect(ms).toBeLessThan(2000);
  });
});
