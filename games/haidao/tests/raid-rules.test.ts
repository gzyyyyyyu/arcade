import { describe, expect, it } from 'vitest';
import { BRANCHES, BUILDINGS, CAMPAIGN, RULES_VERSION, battleFingerprint, battleResult, botActions, createBattle, heroLevel, newProfile, runBattle, stepBattle } from '../src/core/index.ts';
import type { BattleEvent, BattleSetup, Placed } from '../src/core/index.ts';
import { RAID_HERO, RAID_HERO_LEASH } from '../src/content/tdunits.ts';
import { raidSetup, replayRaid } from '../src/core/pvp.ts';
import { validateBase } from '../src/core/validate.ts';
import { fullBase, sampleArmy } from '../tools/sample.ts';

/**
 * 规则版本 6（DESIGN 10.6）：宝藏箱、分叉、驻岛英雄进攻防。
 * 金标准是升版本前（规则版本 5 的代码）录下的 [指纹, 星数, 摧毁率]：旧版本的回放必须逐位不变。
 * 战役每关普通机器人种子 1、小白种子 2；hqN/布局/plain|td 是 fullBase 的满配岛（td = 带宝藏箱和分叉，版本 5 下分叉不起作用）、种子 7。
 * 难度曲线批：c13–c29 加了细档（gen.ts 的 TUNE：基础等级、升一级的塔数、狙击塔 / 震荡炮数量、摆位），这 17 关的键按新布局重录；c30 和前 12 关不变。
 * 0.31.18 战役曲线批：c06、c07、c11、c13、c14、c16、c18–c29 的布局变了，这几关按新布局重录（悬赏借用的 c07、c10、c16 已冻结成悬赏专用表，战役这份可以动）。
 * 0.31.23：c29 少一座火箭塔，c29 的两个键按新布局重录。
 * c11–c30（c16 除外）在 0.31.1 改了战役布局（后段加城墙、重新配平），这几关按新布局重录；c30 在 0.31.5 又改了一次布局（外圈缺口 1 格、防御 5 级），再重录；c08、c09 各挪了一门臼炮的位置（c08 挪到东南、c09 挪到南面）来配平，也按新布局重录；旧防守记录里存的是那一场 setup 的布局，回放不受影响。
 */
const GOLDEN_R5: Record<string, [number, number, number]> = {
  'c01/normal/1': [179559456, 3, 100],
  'c01/novice/2': [1302726997, 3, 100],
  'c02/normal/1': [3655416401, 3, 100],
  'c02/novice/2': [4078578725, 3, 100],
  'c03/normal/1': [2703610844, 3, 100],
  'c03/novice/2': [208317703, 3, 100],
  'c04/normal/1': [1702933610, 3, 100],
  'c04/novice/2': [2891123879, 3, 100],
  'c05/normal/1': [2919674657, 2, 90],
  'c05/novice/2': [3539189479, 2, 72],
  'c06/normal/1': [1049670336, 2, 50],
  'c06/novice/2': [2428999782, 2, 50],
  'c07/normal/1': [127821360, 2, 66],
  'c07/novice/2': [1847336937, 0, 41],
  'c08/normal/1': [3522649896, 2, 53],
  'c08/novice/2': [3331143824, 1, 46],
  'c09/normal/1': [1658411859, 2, 84],
  'c09/novice/2': [1436958197, 0, 30],
  'c10/normal/1': [4008941730, 2, 61],
  'c10/novice/2': [1459892211, 1, 46],
  'c11/normal/1': [2476205084, 1, 64],
  'c11/novice/2': [3272753155, 2, 85],
  'c12/normal/1': [4062649148, 0, 41],
  'c12/novice/2': [279372744, 0, 29],
  'c13/normal/1': [3596636415, 2, 80],
  'c13/novice/2': [3534674592, 3, 100],
  'c14/normal/1': [2074692559, 2, 70],
  'c14/novice/2': [2366654380, 2, 70],
  'c15/normal/1': [2238583, 3, 100],
  'c15/novice/2': [1588229169, 3, 100],
  'c16/normal/1': [1997757113, 3, 100],
  'c16/novice/2': [4222610257, 0, 29],
  'c17/normal/1': [1966038867, 3, 100],
  'c17/novice/2': [2403349073, 1, 55],
  'c18/normal/1': [2414291638, 0, 43],
  'c18/novice/2': [3285412473, 3, 100],
  'c19/normal/1': [1834626670, 3, 100],
  'c19/novice/2': [3702587281, 0, 38],
  'c20/normal/1': [1988344774, 2, 60],
  'c20/novice/2': [1531059652, 0, 40],
  'c21/normal/1': [196559393, 2, 71],
  'c21/novice/2': [270025577, 1, 57],
  'c22/normal/1': [3642989439, 2, 63],
  'c22/novice/2': [3196813356, 1, 52],
  'c23/normal/1': [1029537584, 2, 72],
  'c23/novice/2': [2351926052, 2, 95],
  'c24/normal/1': [862768610, 0, 43],
  'c24/novice/2': [4208266561, 1, 78],
  'c25/normal/1': [1339536818, 2, 80],
  'c25/novice/2': [3756674837, 1, 60],
  'c26/normal/1': [4285173621, 1, 55],
  'c26/novice/2': [2243943812, 1, 66],
  'c27/normal/1': [3616979200, 1, 50],
  'c27/novice/2': [2582030394, 0, 42],
  'c28/normal/1': [3504117265, 1, 53],
  'c28/novice/2': [4145834881, 1, 70],
  'c29/normal/1': [238986108, 2, 73],
  'c29/novice/2': [1565967474, 0, 30],
  'c30/normal/1': [2715823529, 2, 77],
  'c30/novice/2': [3713176589, 1, 59],
  'hq3/turtle/plain': [1318443749, 0, 25],
  'hq3/turtle/td': [435251806, 0, 23],
  'hq3/spread/plain': [1975371858, 2, 68],
  'hq3/spread/td': [3545508376, 2, 70],
  'hq3/trap/plain': [1269584035, 1, 56],
  'hq3/trap/td': [3001861128, 1, 52],
  'hq5/turtle/plain': [4200869357, 0, 16],
  'hq5/turtle/td': [2701960950, 0, 14],
  'hq5/spread/plain': [1059529819, 0, 48],
  'hq5/spread/td': [3890861843, 1, 33],
  'hq5/trap/plain': [4143970845, 0, 32],
  'hq5/trap/td': [2862662293, 0, 29],
  'hq7/turtle/plain': [2040526048, 0, 41],
  'hq7/turtle/td': [661333238, 0, 40],
  'hq7/spread/plain': [1950923455, 0, 29],
  'hq7/spread/td': [372306943, 0, 29],
  'hq7/trap/plain': [60081002, 0, 39],
  'hq7/trap/td': [900761282, 0, 36],
};

function goldenSetup(key: string, rules: number): BattleSetup {
  const [a, b, c] = key.split('/') as [string, string, string];
  if (a.startsWith('hq')) {
    const hq = Number(a.slice(2));
    return { layout: fullBase(hq, b as 'turtle', c === 'td').base.buildings, army: sampleArmy(hq), seed: 7, rules };
  }
  const lv = CAMPAIGN.find((l) => l.id === a)!;
  return { layout: lv.layout, army: sampleArmy(lv.hq), seed: Number(c), rules };
}
const styleOf = (key: string): 'normal' | 'novice' => (key.startsWith('hq') ? 'normal' : (key.split('/')[1] as 'normal' | 'novice'));

describe('规则版本 5 的金标准', () => {
  it('每一场的指纹、星数、摧毁率和升版本前逐位一样（旧防守记录照原样回放）', () => {
    for (const key of Object.keys(GOLDEN_R5)) {
      const setup = goldenSetup(key, 5);
      const r = replayRaid(setup, botActions(setup, styleOf(key)));
      expect([r.fingerprint, r.result.stars, r.result.destroyedPct], key).toEqual(GOLDEN_R5[key]);
    }
  }, 120_000); // 负载 28–32、maxWorkers=1 实测 29.0 秒，取 4 倍

  it('战役（和借战役关卡的流浪海盗岛、悬赏岛）没有宝藏箱和分叉：规则版本 6 的指纹和版本 5 一样', () => {
    for (const key of Object.keys(GOLDEN_R5)) {
      if (key.startsWith('hq')) continue;
      const setup = goldenSetup(key, 6);
      expect(replayRaid(setup, botActions(setup, styleOf(key))).fingerprint, key).toBe(GOLDEN_R5[key]![0]);
    }
    for (const lv of CAMPAIGN) expect(lv.layout.some((b) => b.kind === 'treasure' || b.branch !== undefined), lv.id).toBe(false);
  }, 60_000);

  it('版本 5 的锁（升级时还没结的那场）按版本 5 结：raidSetup 现在出版本 6，存下来的旧 setup 照旧', () => {
    expect(raidSetup([], sampleArmy(3), 1).rules).toBe(RULES_VERSION);
    const old = goldenSetup('hq5/trap/td', 5);
    const r = replayRaid({ ...old, hero: 5 }, botActions(old, 'normal'));
    expect([r.fingerprint, r.result.stars, r.result.destroyedPct]).toEqual(GOLDEN_R5['hq5/trap/td']);
  });
});

describe('规则版本 7、8（守岛 2.0、守岛寻敌）不碰攻防（版本 9 才改进攻，见 raid-combat.test.ts）', () => {
  it('同一场在版本 6、7、8 下逐位一样：战役、满配岛（宝藏箱、分叉）、带驻岛英雄的攻防', () => {
    expect(RULES_VERSION).toBe(19);
    const cases: Array<[string, BattleSetup, 'normal' | 'novice']> = Object.keys(GOLDEN_R5).map((key) => [key, goldenSetup(key, 6), styleOf(key)]);
    for (const [hq, style, seed] of [[3, 'spread', 1], [5, 'trap', 2], [7, 'turtle', 3]] as const) cases.push([`hero ${hq}/${style}`, { ...heroSetup(hq, style, seed), rules: 6 }, 'normal']);
    for (const [key, v6, style] of cases) {
      const acts = botActions(v6, style);
      const a = replayRaid(v6, acts);
      for (const rules of [7, 8]) {
        const b = replayRaid({ ...v6, rules }, acts);
        expect([b.fingerprint, b.result.stars, b.result.destroyedPct], `${key} v${rules}`).toEqual([a.fingerprint, a.result.stars, a.result.destroyedPct]);
        expect(botActions({ ...v6, rules }, style), `${key} v${rules}`).toEqual(acts);
      }
    }
  }, 220_000); // 负载 28–32、maxWorkers=1 实测 54.7 秒，取 4 倍
});

function heroSetup(hq: number, style: 'turtle' | 'spread' | 'trap', seed: number): BattleSetup {
  const p = fullBase(hq, style, true);
  return raidSetup(p.base.buildings, sampleArmy(Math.min(8, hq + 1)), seed, heroLevel(p));
}

describe('驻岛英雄（规则版本 6）', () => {
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

describe('宝藏箱和分叉进登陆战（规则版本 6）', () => {
  it('宝藏箱是普通建筑：有血、算摧毁率，拆了它摧毁率涨', () => {
    const layout: Placed[] = [
      { id: 1, kind: 'hq', level: 1, x: 2, y: 2 },
      { id: 2, kind: 'treasure', level: 1, x: 17, y: 10 },
    ];
    const setup: BattleSetup = { layout, army: sampleArmy(3), seed: 3, rules: 6 };
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
      const setup: BattleSetup = { layout, army: sampleArmy(3), seed: 5, rules: 6 };
      return replayRaid(setup, botActions(setup, 'normal'));
    };
    const a = run(base());
    const b = run(base(['mortar.fire']));
    expect(b.fingerprint).not.toBe(a.fingerprint);
    // 版本 6 下坏的分叉（等级不够）当没有
    const lowLv: Placed[] = [{ id: 1, kind: 'hq', level: 3, x: 9, y: 9 }, { id: 2, kind: 'cannon', level: 2, x: 4, y: 9, branch: ['cannon.pierce'] }];
    expect(createBattle({ layout: lowLv, army: sampleArmy(3), seed: 1, rules: 6 }).buildings[1]!.branch).toBeUndefined();
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
    const setup = raidSetup(layout, sampleArmy(8), 4242, 8);
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
