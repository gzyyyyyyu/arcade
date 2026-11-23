import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/content/index.ts';
import { TD_ARMORS, TD_DAMAGES, TD_TOWER_KINDS } from '../src/core/td2types.ts';
import { armorFoes, armorLine, damageSources, damageTowers, foeLine } from '../src/view/td-ui.ts';

/**
 * 克制表的说明文字（DESIGN 10.2）：表头和表下的名单全部从核心的表现算，不手写——改了塔或敌人的伤害、护甲，界面跟着变。
 */
describe('克制表的名单', () => {
  it('每种塔正好出现在一种伤害下面，震荡炮在炮弹里，英雄在枪弹里，火药桶和地雷在爆破里', () => {
    const all = TD_DAMAGES.flatMap((d) => damageTowers(d));
    expect([...all].sort()).toEqual([...TD_TOWER_KINDS].sort());
    expect(damageSources('shell')).toContain(BUILDINGS.shock.name);
    expect(damageSources('shot')).toContain('英雄');
    expect(damageSources('blast')).toEqual(expect.arrayContaining(['火药桶', '地雷']));
    expect(damageSources('fire')).toContain('地上的火');
  });

  it('每种敌人正好穿一种护甲；精英跟着普通兵：水手长布衣、鹦鹉王飞禽；小艇、首领后几段不单列', () => {
    const all = TD_ARMORS.flatMap((a) => armorFoes(a));
    expect(new Set(all).size).toBe(all.length);
    expect(armorFoes('cloth')).toEqual(expect.arrayContaining(['sailor', 'bosun']));
    expect(armorFoes('air')).toEqual(['parrot', 'macaw', 'balloon']);
    expect(all).not.toContain('skiffling');
    expect(all).toContain('tyrantShip');
    expect(all).not.toContain('tyrant');
    expect(all).not.toContain('tyrantRun');
  });

  it('一句话怎么打：多一半、只打一半、打不到，照常的不写', () => {
    expect(foeLine('sailor')).toBe('水手 · 布衣：火打它多一半');
    expect(armorLine('heavy')).toBe('炮弹打它多一半，枪弹、火只打一半');
    expect(armorLine('air')).toBe('枪弹打它多一半，炮弹、火、爆破打不到');
  });
});
