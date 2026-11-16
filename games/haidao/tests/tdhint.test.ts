import { describe, expect, it } from 'vitest';
import { TD_ENEMY_ARMOR, bestDamageVs, type TdEnemyKind } from '../src/core/index.ts';
import { TD2_ENEMIES } from '../src/content/td2units.ts';
import { ARMOR_NAME, DAMAGE_NAME } from '../src/view/td-ui.ts';
import { FOE_MAX, foeText, newFoes } from '../src/view/tdhint.ts';

describe('守岛第一次来某种敌人的提示', () => {
  it('每种敌人都有一句话，护甲和最怕的伤害读克制表', () => {
    for (const k of Object.keys(TD2_ENEMIES) as TdEnemyKind[]) {
      const t = foeText(k);
      const a = TD_ENEMY_ARMOR[k];
      expect(t).toContain(ARMOR_NAME[a]);
      expect(t).toContain(`最怕${DAMAGE_NAME[bestDamageVs(a)]}`);
      expect(t.length).toBeLessThanOrEqual(40);
    }
  });
  it('「最怕」只从这局能造的塔里挑：只有一种伤害或并列时不写', () => {
    expect(foeText('sailor', ['cannon'])).not.toContain('最怕');
    expect(foeText('sailor', ['cannon', 'gunTower'])).not.toMatch(/最怕火/);
    const all = foeText('sailor', ['cannon', 'gunTower', 'flame']);
    expect(all).toContain(`最怕${DAMAGE_NAME[bestDamageVs(TD_ENEMY_ARMOR.sailor)]}`);
  });
  it('只挑没见过的，按出场顺序、去重、最多 FOE_MAX 种', () => {
    expect(newFoes(['sailor', 'ironclad', 'sailor'], new Set())).toEqual(['sailor', 'ironclad']);
    expect(newFoes(['sailor', 'ironclad', 'fog'], new Set(['sailor']))).toEqual(['ironclad', 'fog'].slice(0, FOE_MAX));
    expect(newFoes(['sailor'], new Set(['sailor']))).toEqual([]);
  });
});
