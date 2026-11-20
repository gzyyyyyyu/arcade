import { describe, expect, it } from 'vitest';
import { TD_ENEMY_ARMOR, bestDamageVs, type TdEnemyKind } from '../src/core/index.ts';
import { TD2_ENEMIES, TD2_EVENT } from '../src/content/td2units.ts';
import { ARMOR_NAME, DAMAGE_NAME } from '../src/view/td-ui.ts';
import { MECH_HINT, foeText, newFoes, pickHint, type HintItem } from '../src/view/tdhint.ts';

describe('守岛第一次来某种敌人的提示', () => {
  it('每种敌人都有一句话，护甲和打它多一半的伤害读克制表（海上的炮艇只说谁够得着，不说克制）', () => {
    for (const k of Object.keys(TD2_ENEMIES) as TdEnemyKind[]) {
      const t = foeText(k);
      expect(t.length).toBeLessThanOrEqual(40);
      if (TD2_ENEMIES[k].shell) {
        expect(t).not.toContain('打它多一半');
        expect(t).toContain('8 格');
        continue;
      }
      const a = TD_ENEMY_ARMOR[k];
      expect(t).toContain(ARMOR_NAME[a]);
      expect(t).toContain(`${DAMAGE_NAME[bestDamageVs(a)]}打它多一半`);
      expect(t.length).toBeLessThanOrEqual(40);
    }
  });
  it('「打它多一半」只从这局能造的塔里挑：只有一种伤害或并列时不写', () => {
    expect(foeText('sailor', ['cannon'])).not.toContain('打它多一半');
    expect(foeText('sailor', ['cannon', 'gunTower'])).not.toMatch(/火打它多一半/);
    const all = foeText('sailor', ['cannon', 'gunTower', 'flame']);
    expect(all).toContain(`${DAMAGE_NAME[bestDamageVs(TD_ENEMY_ARMOR.sailor)]}打它多一半`);
  });
  it('只挑没见过的，按出场顺序、去重', () => {
    expect(newFoes(['sailor', 'ironclad', 'sailor'], new Set())).toEqual(['sailor', 'ironclad']);
    expect(newFoes(['sailor', 'ironclad', 'fog'], new Set(['sailor']))).toEqual(['ironclad', 'fog']);
    expect(newFoes(['sailor'], new Set(['sailor']))).toEqual([]);
  });
});

describe('首次提示一次一条', () => {
  const none = { m: new Set<string>(), f: new Set<string>() };
  const m = (k: 'dare' | 'nav' | 'bounty'): HintItem => ({ t: 'm', k });
  const f = (k: 'sailor' | 'medic'): HintItem => ({ t: 'f', k });
  it('一次只弹一条，其余排队，下一波接着弹', () => {
    const a = pickHint([m('nav'), m('bounty'), f('sailor')], [], none, false);
    expect(a.show).toEqual(m('nav'));
    expect(a.queue).toEqual([m('bounty'), f('sailor')]);
    const b = pickHint([f('medic')], a.queue, none, false);
    expect(b.show).toEqual(f('medic'));
    expect(b.queue).toEqual([m('bounty'), f('sailor')]);
  });
  it('见过的跳过，重复的只留一条', () => {
    const r = pickHint([f('sailor'), m('nav')], [f('sailor')], { m: new Set(), f: new Set(['sailor']) }, false);
    expect(r).toEqual({ show: m('nav'), queue: [] });
  });
  it('战书卷轴浮着的那一波不弹，全排队', () => {
    expect(pickHint([f('medic')], [m('nav')], none, true)).toEqual({ show: null, queue: [f('medic'), m('nav')] });
  });
  it('战书说明里的数从规则表取（以前写死「多 1/4」，规则是 50%）', () => {
    expect(MECH_HINT.dare.text).toContain(`多 ${TD2_EVENT.dare.morePct}%`);
  });
});
