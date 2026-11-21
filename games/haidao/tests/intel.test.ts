import { describe, expect, it } from 'vitest';
import { BUILDINGS, TROOPS, TROOP_INTEL, TROOP_KINDS, defenseMatchups } from '../src/content/index.ts';
import { td2TierStats } from '../src/content/td2units.ts';
import { raidDefenseBase } from '../src/core/battle.ts';
import { TD_TOWER_KINDS } from '../src/core/td2types.ts';
import { DEFENSE_CARD_KINDS, defenseCard, tdTowerCard, troopCard } from '../src/view/intel.ts';

const num = (s: string): number => Number(s.replace(/[^\d.-]/g, ''));

describe('介绍卡片：数值直接读核心的表', () => {
  it('每个兵种每一级：血量、每下伤害、射程、移速、花费和 TROOPS 一致，满级没有下一级', () => {
    for (const k of TROOP_KINDS) {
      for (let lv = 1; lv <= 8; lv++) {
        const c = troopCard(k, lv);
        const L = TROOPS[k].levels[lv - 1]!;
        const get = (key: string) => c.stats.find((s) => s.key === key);
        expect(num(get('hp')!.cur)).toBe(L.hp);
        expect(num(get('dmg')!.cur)).toBe(L.dmg);
        expect(num(get('range')!.cur)).toBe(L.range);
        expect(num(get('speed')!.cur)).toBe(L.speed);
        expect(num(get('cost')!.cur)).toBe(L.cost);
        if (lv < 8) expect(num(get('hp')!.next!)).toBe(TROOPS[k].levels[lv]!.hp);
        else expect(c.stats.every((s) => s.next === null)).toBe(true);
        for (const s of c.stats) expect(s.bar).toBeGreaterThan(0);
        for (const s of c.stats) expect(s.bar).toBeLessThanOrEqual(1);
      }
    }
  });

  it('防御每一级：射程、每发伤害、溅射按 raidDefenseBase（和战斗里同一份）', () => {
    for (const k of DEFENSE_CARD_KINDS) {
      for (let lv = 1; lv <= BUILDINGS[k].maxLevel; lv++) {
        const c = defenseCard(k, lv);
        const b = raidDefenseBase(k, lv);
        const get = (key: string) => c.stats.find((s) => s.key === key);
        if (b.range > 0) expect(num(get('range')!.cur)).toBe(b.range / 100);
        if (b.splash > 0) expect(num(get('splash')!.cur)).toBe(b.splash / 100);
        if (b.dmg > 0) expect(num(get('dmg')!.cur)).toBe(b.dmg);
        expect(c.aims.length).toBeGreaterThan(0);
      }
    }
  });

  it('守岛塔每一阶：每发伤害、射程按 td2TierStats', () => {
    for (const k of TD_TOWER_KINDS) {
      for (const t of [1, 2, 3] as const) {
        const c = tdTowerCard(k, t);
        const s = td2TierStats(k, t);
        expect(num(c.stats.find((x) => x.key === 'dmg')!.cur)).toBe(s.dmg);
        expect(num(c.stats.find((x) => x.key === 'range')!.cur)).toBe(s.range / 100);
      }
    }
  });
});

describe('介绍卡片：寻敌和相克', () => {
  it('寻敌第一条按 TroopDef.aim（规则 pickTarget 读的同一个字段）', () => {
    const first = { nearest: 'near', defense: 'defense', wallFirst: 'wall', cluster: 'cluster', heal: 'heal' } as const;
    for (const k of TROOP_KINDS) expect(troopCard(k, 1).aims[0]!.icon).toBe(first[TROOPS[k].aim]);
  });

  it('防御的相克是兵种相克表反查：兵怕它 = 它克兵', () => {
    for (const k of DEFENSE_CARD_KINDS) {
      const m = defenseMatchups(k);
      for (const t of m.beats) expect(TROOP_INTEL[t].fears).toContain(k);
      for (const t of m.fears) expect(TROOP_INTEL[t].beats).toContain(k);
    }
  });

  it('相克表只写有卡片的防御，同一个兵不会既克又怕同一座', () => {
    for (const k of TROOP_KINDS) {
      const it = TROOP_INTEL[k];
      for (const d of [...it.beats, ...it.fears]) expect(DEFENSE_CARD_KINDS).toContain(d);
      expect(it.beats.filter((d) => it.fears.includes(d))).toEqual([]);
    }
  });
});
