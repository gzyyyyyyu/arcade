import { describe, expect, it } from 'vitest';
import { RULES_VERSION, createBattle, stepBattle } from '../src/core/index.ts';
import type { BUnit, BattleAction, BattleEvent, Placed, TroopKind } from '../src/core/index.ts';

/** 进攻兵寻敌（DESIGN 10.2b）：掷弹兵挑溅射得分高的、远程兵等盾兵、船医就近挑血比最低的 */

const lay = (rows: Array<[Placed['kind'], number, number, number]>): Placed[] => rows.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));

function land(rows: Array<[Placed['kind'], number, number, number]>, boats: Array<{ troop: TroopKind; x: number; y: number }>) {
  const army = { boats: boats.map((b) => ({ troop: b.troop, count: 1, level: 3 })), skills: [], energy: 0 };
  const s = createBattle({ layout: lay(rows), army, seed: 1, rules: RULES_VERSION });
  stepBattle(s, boats.map((b, i): BattleAction => ({ t: 0, type: 'land', boat: i, x: b.x, y: b.y })));
  for (const u of s.units) u.hp = u.maxHp = u.maxHp * 1000;
  return s;
}

describe('进攻寻敌', () => {
  const grenRows: Array<[Placed['kind'], number, number, number]> = [['hq', 1, 14, 14], ['goldmine', 1, 0, 9], ['gunTower', 1, 4, 9], ['gunTower', 1, 4, 11]];
  it('掷弹兵放着孤零零的最近金矿不炸，去炸扎堆的塔', () => {
    const s = land(grenRows, [{ troop: 'grenadier' as const, x: -150, y: 1000 }]);
    stepBattle(s, []);
    expect(s.buildings.find((x) => x.id === (s.units[0] as BUnit).target)?.kind).toBe('gunTower');
  });

  it('远程兵比盾兵靠前时原地等，最多等 60 拍后放行', () => {
    const rows: Array<[Placed['kind'], number, number, number]> = [['hq', 1, 14, 14], ['gunTower', 1, 8, 0]];
    const boats = [{ troop: 'shield' as const, x: -150, y: 1800 }, { troop: 'gunner' as const, x: -150, y: 300 }];
    const moved = (ticks: number): number => {
      const s = land(rows, boats);
      const g = s.units[1] as BUnit;
      const x0 = g.x;
      const y0 = g.y;
      for (let i = 0; i < ticks; i++) stepBattle(s, []);
      return Math.abs(g.x - x0) + Math.abs(g.y - y0);
    };
    expect(moved(10)).toBeLessThan(20);
    expect(moved(120)).toBeGreaterThan(moved(10) + 100);
  });

  it('船医先给血量比最低的回血，不按兵的顺序', () => {
    const rows: Array<[Placed['kind'], number, number, number]> = [['hq', 1, 14, 14]];
    const boats = [{ troop: 'medic' as const, x: -150, y: 300 }, { troop: 'sailor' as const, x: -150, y: 300 }, { troop: 'sailor' as const, x: -150, y: 300 }, { troop: 'sailor' as const, x: -150, y: 1900 }];
    const heal = (): number => {
      const s = land(rows, boats);
      (s.units[1] as BUnit).hp = Math.floor((s.units[1] as BUnit).maxHp / 2);
      (s.units[2] as BUnit).hp = Math.floor((s.units[2] as BUnit).maxHp / 5);
      (s.units[3] as BUnit).hp = 1;
      const ev: BattleEvent[] = [];
      for (let i = 0; i < 25; i++) ev.push(...stepBattle(s, []));
      const h = ev.find((e) => e.type === 'heal');
      return h && h.type === 'heal' ? h.id : -1;
    };
    // 单位 id 从 1 起：1 船医、2 半血水手、3 两成血水手、4 远处残血水手
    expect(heal()).toBe(3);
  });
});
