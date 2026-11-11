import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, CAMPAIGN, RULES_VERSION, battleFingerprint, battleResult, botActions, createBattle, equipSkin, newProfile, presetLayout, rollDrops,
  runBattle, settleCampaign, stepBattle,
} from '../src/core/index.ts';
import type { BattleResult, BuildingKind, Placed, Profile } from '../src/core/index.ts';
import { sampleArmy } from '../tools/sample.ts';

type Row = [BuildingKind, number, number, number];
const rows = (r: Row[]): Placed[] => r.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));
const LAND = [{ t: 0, type: 'land' as const, boat: 0, x: -150, y: 1000 }, { t: 0, type: 'land' as const, boat: 1, x: -150, y: 1100 }];
const ARMY = { boats: [{ troop: 'sailor' as const, count: 10, level: 1 }, { troop: 'gunner' as const, count: 6, level: 1 }], skills: [], energy: 0 };

const BASE: Row[] = [['hq', 1, 9, 9], ['goldmine', 1, 4, 8], ['sawmill', 1, 4, 12], ['cannon', 2, 6, 16], ['cannon', 2, 13, 16], ['gunTower', 2, 10, 16], ['mine', 2, 9, 15], ['mine', 2, 11, 15], ['mine', 2, 13, 14], ['mine', 2, 7, 14]];
/** 围着西边资源和主寨的墙，只在南面留口子——口子正对炮和地雷 */
function gatedWalls(): Row[] {
  const w: Row[] = [];
  for (let x = 2; x <= 14; x++) {
    w.push(['wall', 1, x, 5]);
    if (x < 8 || x > 12) w.push(['wall', 1, x, 14]);
  }
  for (let y = 6; y <= 13; y++) w.push(['wall', 1, 2, y], ['wall', 1, 14, y]);
  return w;
}
function fight(layout: Placed[], seed: number): { pct: number; ms: number; tick: number; fp: number } {
  const s = createBattle({ layout, army: ARMY, seed, rules: RULES_VERSION });
  const t0 = performance.now();
  while (!s.over) stepBattle(s, s.tick === 0 ? LAND : []);
  return { pct: battleResult(s).destroyedPct, ms: performance.now() - t0, tick: s.tick, fp: battleFingerprint(s) };
}

describe('城墙和寻路', () => {
  it('墙引导布局：同一组兵，带墙的摧毁率比无墙低', () => {
    const open = [1, 2, 3, 4].map((sd) => fight(rows(BASE), sd).pct);
    const walled = [1, 2, 3, 4].map((sd) => fight(rows([...BASE, ...gatedWalls()]), sd).pct);
    const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(walled)).toBeLessThan(avg(open));
  });
  it('寻路确定性：同一局两次重放指纹一致', () => {
    const l = rows([...BASE, ...gatedWalls()]);
    expect(fight(l, 5).fp).toBe(fight(l, 5).fp);
  });
  it('墙封死主寨：兵砸墙进去', () => {
    const ring: Row[] = [['hq', 1, 9, 9]];
    for (let i = 7; i <= 14; i++) ring.push(['wall', 1, i, 7], ['wall', 1, i, 14]);
    for (let j = 8; j <= 13; j++) ring.push(['wall', 1, 7, j], ['wall', 1, 14, j]);
    const s = createBattle({ layout: rows(ring), army: ARMY, seed: 1, rules: RULES_VERSION });
    while (!s.over) stepBattle(s, s.tick === 0 ? LAND : []);
    expect(s.buildings.filter((b) => b.kind === 'wall' && b.destroyed).length).toBeGreaterThan(0);
    expect(battleResult(s).hqDown).toBe(true);
  });
  it('墙不算摧毁率：只剩墙时仍可 100%', () => {
    const r = runBattle({ layout: rows([['hq', 1, 9, 9], ['wall', 1, 5, 9], ['wall', 1, 5, 10]]), army: ARMY, seed: 1, rules: RULES_VERSION }, LAND);
    expect(r.result.destroyedPct).toBe(100);
  });
  it('炸药兵优先炸墙，炸墙伤害 ×3', () => {
    const army = { boats: [{ troop: 'bomber' as const, count: 1, level: 1 }], skills: [], energy: 0 };
    const s = createBattle({ layout: rows([['hq', 1, 9, 9], ['wall', 1, 2, 10]]), army, seed: 1, rules: RULES_VERSION });
    const wall = s.buildings.find((b) => b.kind === 'wall')!;
    stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1050 }]);
    for (let i = 0; i < 100 && !wall.destroyed; i++) stepBattle(s, []);
    // 1 级炸药兵 220 伤害，×3 = 660，一炸就掉一段（没有 ×3 撑不过 1 级墙的血量 352）
    expect(wall.destroyed).toBe(true);
    expect(s.buildings.find((b) => b.kind === 'hq')!.hp).toBe(s.buildings.find((b) => b.kind === 'hq')!.maxHp);
  });
  it('战役城墙：c13 起才有、越往后越多；悬赏借用的 c07、c10、c16 没有墙；墙不压别的建筑', () => {
    const count = (id: string) => CAMPAIGN.find((l) => l.id === id)!.layout.filter((b) => b.kind === 'wall').length;
    for (const l of CAMPAIGN.slice(0, 12)) expect(count(l.id), l.id).toBe(0);
    for (const id of ['c07', 'c10', 'c16']) expect(count(id), id).toBe(0);
    const late = CAMPAIGN.slice(12).filter((l) => l.id !== 'c16').map((l) => count(l.id));
    expect(late[0]).toBeGreaterThan(0);
    expect(late.at(-1)).toBeGreaterThanOrEqual(late[0]! * 4);
    // 墙碰上炮台、地雷会跳过那一格，所以逐关数量会有几段起伏；只锁"三段越来越多"
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(late.slice(0, 4))).toBeLessThan(avg(late.slice(4, 10)));
    expect(avg(late.slice(4, 10))).toBeLessThan(avg(late.slice(10)));
    for (const l of CAMPAIGN) {
      const seen = new Set<string>();
      for (const b of l.layout) for (let i = 0; i < BUILDINGS[b.kind].size; i++) for (let j = 0; j < BUILDINGS[b.kind].size; j++) {
        const k = `${b.x + i},${b.y + j}`;
        expect(seen.has(k), `${l.id} ${k}`).toBe(false);
        seen.add(k);
      }
    }
  });
  it('性能：满墙岛整场 ≤ 1 秒（本机约 150 ms；CI 和高负载时留余量，只拦数量级的退化）', () => {
    // 战役 c30 自己带城墙（gen.ts）；这里要的是"墙摆满"，所以先把关卡自带的墙拿掉，再按方框摆满
    const lv = { ...CAMPAIGN[29]!, layout: CAMPAIGN[29]!.layout.filter((b) => b.kind !== 'wall') };
    const walls: Placed[] = [];
    let id = 500;
    for (let x = 4; x <= 18; x++) {
      walls.push({ id: id++, kind: 'wall', level: 4, x, y: 4 }, { id: id++, kind: 'wall', level: 4, x, y: 17 });
    }
    for (let y = 5; y <= 16; y++) walls.push({ id: id++, kind: 'wall', level: 4, x: 4, y }, { id: id++, kind: 'wall', level: 4, x: 18, y });
    const occupied = new Set<string>();
    for (const b of lv.layout) for (let i = 0; i < BUILDINGS[b.kind].size; i++) for (let j = 0; j < BUILDINGS[b.kind].size; j++) occupied.add(`${b.x + i},${b.y + j}`);
    const free = walls.filter((w) => !occupied.has(`${w.x},${w.y}`));
    expect(free.length).toBeGreaterThan(30);
    const setup = { layout: [...lv.layout, ...free], army: sampleArmy(8), seed: 3, rules: RULES_VERSION };
    const acts = botActions(setup, 'normal');
    const t0 = performance.now();
    runBattle(setup, acts);
    const ms = performance.now() - t0;
    console.log(`满墙岛整场 ${ms.toFixed(0)} ms（${free.length} 段墙）`);
    expect(ms).toBeLessThan(1000);
  });
});

function richProfile(): Profile {
  const p = newProfile();
  const list: Row[] = [['hq', 5, 9, 9], ['goldmine', 3, 3, 3], ['goldmine', 3, 3, 8], ['sawmill', 3, 16, 3], ['vault', 3, 3, 16], ['woodyard', 3, 16, 16], ['dock', 3, 9, 17], ['armory', 3, 16, 9],
    ['cannon', 4, 6, 6], ['cannon', 4, 14, 6], ['cannon', 4, 6, 14], ['gunTower', 4, 14, 14], ['mortar', 3, 10, 6], ['flame', 3, 10, 15], ['mine', 3, 2, 2], ['mine', 3, 19, 2], ['mine', 3, 2, 19], ['mine', 3, 19, 19], ['tar', 3, 8, 8],
    ['palm', 1, 1, 10], ['rock', 1, 20, 10]];
  for (let i = 0; i < 40; i++) list.push(['wall', 2, i % 20, 20 + (i % 2)]);
  return { ...p, base: { buildings: rows(list), nextId: list.length + 1 } };
}

describe('推荐布局', () => {
  for (const style of ['turtle', 'spread', 'trap'] as const) {
    it(`${style}：不丢建筑、不越界、不重叠、等级不变`, () => {
      const p = richProfile();
      const out = presetLayout(p, style);
      expect(out).toHaveLength(p.base.buildings.length);
      const seen = new Set<string>();
      for (const b of out) {
        const o = p.base.buildings.find((q) => q.id === b.id)!;
        expect(o.kind).toBe(b.kind);
        expect(o.level).toBe(b.level);
        const s = BUILDINGS[b.kind].size;
        expect(b.x >= 0 && b.y >= 0 && b.x + s <= 22 && b.y + s <= 22, `${style} ${b.kind} 越界`).toBe(true);
        for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
          const k = `${b.x + i},${b.y + j}`;
          expect(seen.has(k), `${style} ${b.kind} 重叠 ${k}`).toBe(false);
          seen.add(k);
        }
      }
    });
  }
  it('三套布局互不相同；不改入参', () => {
    const p = richProfile();
    const snap = JSON.stringify(p);
    const a = JSON.stringify(presetLayout(p, 'turtle'));
    expect(a).not.toBe(JSON.stringify(presetLayout(p, 'spread')));
    expect(a).not.toBe(JSON.stringify(presetLayout(p, 'trap')));
    expect(JSON.stringify(p)).toBe(snap);
  });
});

describe('收获感', () => {
  const win = (stars: number, pct = 100): BattleResult => ({ over: true, stars, destroyedPct: pct, hqDown: stars >= 2 });
  it('连胜加成 +10%/场，封顶 +50%，0 星清零并给安慰奖', () => {
    let p: Profile = { ...newProfile(), res: { gold: 0, wood: 0 } };
    const lv = CAMPAIGN[1]!;
    const first = settleCampaign(p, 'c02', win(3), 1);
    expect(first.streak).toBe(1);
    expect(first.streakBonusPct).toBe(0);
    p = { ...first.profile, res: { gold: 0, wood: 0 }, stats: { ...first.profile.stats, streak: 7, maxStreak: 7 } };
    const big = settleCampaign(p, 'c02', win(3), 1);
    expect(big.streakBonusPct).toBe(50);
    expect(big.loot.gold).toBeGreaterThan(Math.floor(lv.loot.gold * 0.3 * 1.5) - 1);
    const lost = settleCampaign({ ...p, res: { gold: 0, wood: 0 } }, 'c04', win(0, 20), 1);
    expect(lost.streak).toBe(0);
    expect(lost.consolation).toBe(true);
    expect(lost.loot.gold).toBe(Math.floor((CAMPAIGN[3]!.loot.gold * 15) / 100));
    expect(lost.loot.wood).toBeGreaterThan(0);
    expect(lost.profile.stats.maxStreak).toBe(7);
  });
  it('掉宝确定性；0 星不掉；首领首次三星必掉稀有，已有的不重复', () => {
    expect(rollDrops(9, win(0), 'c01')).toEqual([]);
    expect(rollDrops(9, win(2), 'c03')).toEqual(rollDrops(9, win(2), 'c03'));
    const d = rollDrops(3, win(3), 'c05', [], true);
    expect(d.some((x) => x.kind === 'cosmetic')).toBe(true);
    const owned = ['deco:statue'];
    for (let seed = 0; seed < 60; seed++) {
      const r = rollDrops(seed, win(3), 'c05', owned, true);
      expect(r.some((x) => x.kind === 'cosmetic' && x.id === 'deco:statue')).toBe(false);
    }
    // 普通掉落：1 个金币或木材箱
    const common = rollDrops(5, win(1), 'c03').filter((x) => x.kind !== 'cosmetic');
    expect(common).toHaveLength(1);
  });
  it('首领岛首次三星写进 cosmetics；装备皮肤要先有', () => {
    const p = { ...newProfile(), res: { gold: 0, wood: 0 } };
    const r = settleCampaign(p, 'c05', win(3), 11);
    expect(r.profile.cosmetics.length).toBe(1);
    expect(r.drops.some((d) => d.kind === 'cosmetic')).toBe(true);
    expect(equipSkin(p, 'sailor', 'gold')).toEqual({ ok: false, error: 'locked' });
    const owned = { ...p, cosmetics: ['skin:sailor:gold'] };
    const e = equipSkin(owned, 'sailor', 'gold');
    expect(e.ok && e.value.skins.sailor).toBe('gold');
  });
});
