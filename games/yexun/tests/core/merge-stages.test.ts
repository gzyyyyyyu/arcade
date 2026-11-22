// 两段式合成（DESIGN 3.3f）：两件料都到 5 级先合初成（效果按 mergePower 打折、不空法器格），到原条件开宝箱升大成。娱乐、实盘一样
import type { CharacterId } from '../../src/content/meta.ts';
import { describe, expect, it } from 'vitest';
import { mergeWho } from '../../src/content/combos.ts';
import { CHARACTER_POOLS } from '../../src/content/pools.ts';
import { MAX_WEAPONS, MERGE_STAGE, MERGES, WEAPONS, type MergeDef, type WeaponId } from '../../src/content/weapons.ts';
import { grantWeapon, openChestNow, openEliteChestNow, spawnNow } from '../../src/core/debug.ts';
import { createWorld, Ev, MAX_SHOTS, Pick, Shot, step, type Setup, type World } from '../../src/core/index.ts';

const zhuxie = MERGES.find((m) => m.id === 'zhuxie')!;

/** 干净的一局：不刷怪 */
function bare(s: Partial<Setup> = {}): World {
  const w = createWorld({ seed: 7, mode: 'vigil', danger: 0, character: 'xiaodao', ...s } as Setup);
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1e9;
  w.spawnAcc = -1e9;
  return w;
}
/** 走真宝箱的路（规则 57 起 openChest57 一箱结完），0 件升级：只结进化、合成 */
const settle = (w: World): void => openEliteChestNow(w, 0);
const mergeEvents = (w: World): number[] => {
  const out: number[] = [];
  for (let q = 0; q < w.ev.n; q++) if (w.ev.type[q] === Ev.Merge) out.push(w.ev.b[q]!);
  return out;
};

describe('规则 63：两段式合成的流程', () => {
  it('两件都到 5 级开宝箱合初成：记进 mergeHalf、不空法器格；到原条件再开宝箱升大成、空出法器格', () => {
    const w = bare();
    grantWeapon(w, 'sword', MERGE_STAGE.halfLevel);
    grantWeapon(w, 'flysword', MERGE_STAGE.halfLevel);
    settle(w);
    expect(w.merges).toEqual(['zhuxie']);
    expect(w.mergeHalf).toEqual(['zhuxie']);
    expect(w.mergePower('zhuxie')).toBe(MERGE_STAGE.halfPower);
    expect(w.fullMerges).toBe(0);
    expect(mergeEvents(w)).toContain(1);
    // 升到原条件（合成：两件都进化）
    grantWeapon(w, 'sword', 8, true);
    grantWeapon(w, 'flysword', 8, true);
    settle(w);
    expect(w.mergeHalf).toEqual([]);
    expect(w.mergePower('zhuxie')).toBe(1);
    expect(w.fullMerges).toBe(1);
    expect(mergeEvents(w)).toContain(2);
  });

  it('开宝箱时已经到原条件的直接合大成', () => {
    const w = bare();
    grantWeapon(w, 'sword', 8, true);
    grantWeapon(w, 'flysword', 8, true);
    settle(w);
    expect(w.merges).toEqual(['zhuxie']);
    expect(w.mergeHalf).toEqual([]);
    expect(mergeEvents(w)).toContain(0);
  });

  it('4 级合不上；实盘局两件 5 级合初成', () => {
    const four = bare();
    grantWeapon(four, 'sword', MERGE_STAGE.halfLevel - 1);
    grantWeapon(four, 'flysword', 8);
    settle(four);
    expect(four.merges).toEqual([]);
    const live = bare({ live: true } as Partial<Setup>);
    grantWeapon(live, 'sword', MERGE_STAGE.halfLevel);
    grantWeapon(live, 'flysword', MERGE_STAGE.halfLevel);
    settle(live);
    expect(live.mergeHalf).toEqual(['zhuxie']);
  });

  it('初成不空法器格：手上满 6 件时升级卡里不出第 7 件法器', () => {
    const w = bare();
    // 手上 6 件（含 2 件料）
    for (const id of ['sword', 'flysword', 'talisman', 'thunder', 'bell', 'mirror'] as WeaponId[]) grantWeapon(w, id, MERGE_STAGE.halfLevel);
    settle(w);
    expect(w.mergeHalf.length).toBeGreaterThan(0);
    expect(w.weapons.length).toBe(MAX_WEAPONS);
    expect(w.fullMerges).toBe(0);
    // 刷 200 手三选一，没有手上以外的法器卡
    const held = new Set<string>(w.weapons.map((o) => o.id));
    // 放出刷怪，主角无敌地走到下一次升级
    w.nextEvent = 0;
    w.spawnAcc = 0;
    for (let t = 0; t < 6000 && w.phase !== 'choose'; t++) {
      w.invuln = 1e9;
      step(w, t % 8, -1);
    }
    expect(w.phase).toBe('choose');
    for (let k = 0; k < 200; k++) {
      for (const c of w.choices) if (c.kind === 'weapon') expect(held.has(c.id), c.id).toBe(true);
      w.rerolls = 1;
      step(w, 0, Pick.Reroll);
    }
  });
});

// ───────────────────────── 每个搭配：初成 > 0 且 < 大成 ─────────────────────────

type Stage = 0 | 1 | 2;
/** 同一份法器（一件进化、另一件满级；合成两件都进化），只差搭配的状态：0 没合、1 初成、2 大成；主角四周两圈打不死的怪 */
function staged(m: MergeDef, stage: Stage): { w: World; ids: number[] } {
  const c = mergeWho(m)[0]!;
  const w = createWorld({ seed: 11, mode: 'vigil', danger: 2, character: c as never });
  w.weapons.length = 0;
  w.wstats.length = 0;
  const evoIn = (id: WeaponId): boolean => !!WEAPONS[id].evolve && CHARACTER_POOLS[c as CharacterId].passives.includes(WEAPONS[id].evolve!.with);
  const aEvo = !m.dual || evoIn(m.a);
  grantWeapon(w, m.a, 8, aEvo);
  grantWeapon(w, m.b, 8, !m.dual || !aEvo);
  openChestNow(w);
  expect(w.merges).toEqual([m.id]);
  if (stage === 0) w.merges.length = 0;
  if (stage === 1) w.mergeHalf.push(m.id);
  // 再给一次手上的料让属性重算（等级不变）
  grantWeapon(w, m.a, 1);
  w.nextEvent = 1e9;
  w.spawnAcc = -1e9;
  const ids: number[] = [];
  for (let k = 0; k < 24; k++) {
    const r = k < 8 ? 40 : 160;
    const e = spawnNow(w, 'jiangshi', w.x + ((k % 8 < 4 ? r : -r) * ((k % 4) + 1)) / 4, w.y + ((k % 2 ? r : -r) * (((k + 1) % 4) + 1)) / 4);
    w.eHp[e] = 1e7;
    w.eHpMax[e] = 1e7;
    ids.push(e);
  }
  return { w, ids };
}

/** 跑一分钟，每拍之后调 each 累计；pin = 每拍把怪放回原位（击退、推挤让伤害不单调的搭配用） */
function run({ w, ids }: { w: World; ids: number[] }, each: (w: World, ids: number[]) => number, pin = false): number {
  const X = ids.map((e) => w.eX[e]!);
  const Y = ids.map((e) => w.eY[e]!);
  let acc = 0;
  for (let t = 0; t < 1800; t++) {
    step(w, 0, w.phase === 'choose' ? 0 : -1);
    w.hp = w.stats.hpMax;
    if (pin)
      ids.forEach((e, j) => {
        w.eX[e] = X[j]!;
        w.eY[e] = Y[j]!;
      });
    acc += each(w, ids);
  }
  return acc;
}
const hurtAt = (w: World, ids: number[]): number => ids.reduce((s, e) => s + (1e7 - w.eHp[e]!), 0);
/** 伤害按最后一拍算（each 只在最后一拍有用：累计减血） */
const damage = (pin: boolean) => (m: MergeDef, st: Stage): number => {
  const x = staged(m, st);
  run(x, () => 0, pin);
  return hurtAt(x.w, x.ids);
};
const count = (f: (w: World, ids: number[]) => number) => (m: MergeDef, st: Stage): number => run(staged(m, st), f);

/** 诛邪剑阵：挥剑那一拍待命的飞剑一起射出去，量射出去的飞剑带的伤害（初成打折） */
function zhuxieLaunch(_m: MergeDef, st: Stage): number {
  const { w } = staged(zhuxie, st);
  const kf = w.weapons.findIndex((o) => o.id === 'flysword');
  const ks = w.weapons.findIndex((o) => o.id === 'sword');
  for (let t = 0; t < 30; t++) {
    w.weapons[kf]!.timer = 1e9;
    step(w, 0, -1);
  }
  w.weapons[ks]!.timer = 1;
  w.weapons[kf]!.timer = 1e9;
  step(w, 0, -1);
  let s = 0;
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Fly && w.sState[i] !== 0) s += w.sDmg[i]!;
  return s;
}

/** 买路符钱：给一只怪贴上符再打死它，量爆出的铜钱 */
function maibuCoins(m: MergeDef, st: Stage): number {
  const { w, ids } = staged(m, st);
  const c0 = w.coins;
  const e = ids[0]!;
  // 贴符只在合了买路符钱时发生（没合的局不贴）
  if (st > 0) w.arms.marked[e] = 1;
  w.eHp[e] = 1;
  w.eHpMax[e] = 1;
  for (let t = 0; t < 60; t++) step(w, 0, w.phase === 'choose' ? 0 : -1);
  return w.coins - c0;
}

/**
 * 每个搭配用哪种量法（「初成 > 0 且 < 大成」：没合的 < 初成 < 大成）。
 * 默认量一分钟里两圈怪掉的血；几种量别的：
 * - pin：击退、推挤让伤害不单调（乾坤护阵、鸣兵、两仪阵、爆竹驱年），把怪钉在原位再量伤害；
 * - 不是伤害的效果：阴阳镇魂（光环里减速一半的怪·拍）、火兵（地上火的伤害积分）、一苇渡江（水痕的寿命积分）、寒钟（被冻住的怪·拍）、
 *   锁魂幡（记下的怪数，每拍清掉重记）、买路符钱（爆出的铜钱）、诛邪剑阵（挥剑时射出去的飞剑带的伤害）
 */
const METRIC: Record<string, (m: MergeDef, st: Stage) => number> = {
  qiankun: damage(true),
  mingbing: damage(true),
  liangyi: damage(true),
  baozhu: damage(true),
  yinyang: count((w, ids) => ids.filter((e) => w.eSlow[e] === 2).length),
  huobing: count((w) => {
    let s = 0;
    for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Burn) s += w.sDmg[i]!;
    return s;
  }),
  yiwei: count((w) => w.arms.puddles.reduce((s, p) => s + p.life, 0)),
  hanzhong: count((w, ids) => ids.filter((e) => w.eBind[e]! > w.tick).length),
  suohun: count((w, ids) => {
    let n = 0;
    for (const e of ids) {
      n += w.arms.souled[e]!;
      w.arms.souled[e] = 0;
    }
    return n;
  }),
  maibu: maibuCoins,
  zhuxie: zhuxieLaunch,
};

describe('规则 63：每个搭配初成 > 0 且 < 大成', () => {
  for (const m of MERGES.filter((x) => mergeWho(x).length > 0)) {
    it(`${m.name}`, () => {
      const f = METRIC[m.id] ?? damage(false);
      const [none, half, full] = ([0, 1, 2] as Stage[]).map((st) => f(m, st));
      expect(half, `${m.id} 初成 > 没合`).toBeGreaterThan(none!);
      expect(full, `${m.id} 大成 > 初成`).toBeGreaterThan(half!);
    }, 60_000);
  }
});
