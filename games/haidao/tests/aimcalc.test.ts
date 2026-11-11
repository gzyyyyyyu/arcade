import { describe, expect, it } from 'vitest';
import { RULES_VERSION, createBattle, stepBattle } from '../src/core/index.ts';
import { CAMPAIGN } from '../src/content/index.ts';
import { UNIT, type BBuilding } from '../src/core/types.ts';
import { LAND_SPREAD, barrageHits, flareTarget, ringCells, skillCanCast, skillHint } from '../src/view/aimcalc.ts';
import { sampleArmy } from '../tools/sample.ts';

const b = (id: number, kind: string, x: number, y: number, size = 2, over: Partial<BBuilding> = {}): BBuilding => ({ id, kind, x, y, size, destroyed: false, revealed: true, ...over }) as unknown as BBuilding;

describe('落点预览的计算', () => {
  it('信号弹：半径内最近的、没被毁、看得见的建筑；没有就是 undefined', () => {
    const list = [b(1, 'cannon', 10, 10), b(2, 'palm', 5, 5, 1), b(3, 'wall', 6, 6, 1), b(4, 'cannon', 20, 20, 2, { destroyed: true }), b(5, 'hut', 30, 30, 2, { revealed: false })];
    expect(flareTarget(list, 8 * UNIT, 8 * UNIT, 3)?.id).toBe(3);
    expect(flareTarget(list, 4 * UNIT, 4 * UNIT, 1)).toBeUndefined();
    expect(flareTarget(list, 21 * UNIT, 21 * UNIT, 3)).toBeUndefined();
    expect(flareTarget(list, 31 * UNIT, 31 * UNIT, 3)).toBeUndefined();
    expect(skillCanCast('flare', list, 4 * UNIT, 4 * UNIT, 1)).toBe(false);
    expect(skillCanCast('barrage', list, 4 * UNIT, 4 * UNIT, 1)).toBe(true);
  });
  it('和规则一致：预览说没有目标的点，规则里信号弹也不生效；有目标的点生效', () => {
    const lv = CAMPAIGN.find((l) => l.hq >= 2)!;
    const army = sampleArmy(lv.hq);
    const sk = army.skills.find((k) => k.kind === 'flare');
    if (!sk) return;
    const run = (x: number, y: number): boolean => {
      const s = createBattle({ layout: lv.layout, army, seed: 1, rules: RULES_VERSION });
      const ev = stepBattle(s, [{ t: 0, type: 'skill', skill: 'flare', x, y }]);
      return ev.some((e) => e.type === 'skill');
    };
    const s = createBattle({ layout: lv.layout, army, seed: 1, rules: RULES_VERSION });
    const r = 3;
    for (const [x, y] of [[0, 0], [5 * UNIT, 5 * UNIT], [20 * UNIT, 20 * UNIT], [-1 * UNIT, 30 * UNIT]] as const) {
      expect(flareTarget(s.buildings, x, y, r) !== undefined).toBe(run(x, y));
    }
  });
  it('炮击圈内的建筑、圈的点数和半径', () => {
    const list = [b(1, 'cannon', 10, 10), b(2, 'cannon', 14, 10)];
    expect(barrageHits(list, 11 * UNIT, 11 * UNIT, 2.2).map((q) => q.id)).toEqual([1]);
    const ring = ringCells(5, 5, 2);
    expect(ring).toHaveLength(40);
    for (const [x, y] of ring) expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(2, 6);
    expect(LAND_SPREAD).toBe(0.6);
    expect(skillHint('flare', '信号弹')).toContain('建筑');
    expect(skillHint('barrage', '炮击')).toContain('圈里');
    expect(skillHint('x', '甲')).toBe('点岛上任意处，放甲');
  });
});
