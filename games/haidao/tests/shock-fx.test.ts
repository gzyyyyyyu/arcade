import { describe, expect, it } from 'vitest';
import { SHOCK_CHARGE_MS, TURRET_KINDS, TURRET_SPEC, arcHeight, recoilAt, isTurret } from '../src/view/aim.ts';
import { BUILDING_KINDS, TROOP_KINDS, FX_KINDS } from '../src/view/art/index.ts';
import { rigPieces } from '../src/view/art/rigparts.ts';
import { turretGeom, turretPieces } from '../src/view/art/turrets.ts';
import { tdEnemyFrames } from '../src/view/art/tdart.ts';
import { troopFrames } from '../src/view/art/troops.ts';
import { RIG_KINDS, STYLE, SKEL } from '../src/view/rig.ts';
import { starOrbit, wobbleAt } from '../src/view/stunfx.ts';
import { BRANCH_HINT, ENEMY_HINT, TOWER_INFO, enemyHints } from '../src/view/td-ui.ts';
import { projectileFire, towerFire } from '../src/view/audio/pick.ts';
import { SFX_META } from '../src/view/audio/synth.ts';
import type { WavePreview } from '../src/core/index.ts';

describe('震荡炮的画面', () => {
  it('是会转的炮台，蓄力 0.3 秒：开火前 300 毫秒起炮身开始往后缩，开火那一刻缩到底', () => {
    expect(isTurret('shock')).toBe(true);
    expect(TURRET_KINDS).toContain('shock');
    const sp = TURRET_SPEC.shock;
    expect(SHOCK_CHARGE_MS).toBe(300);
    expect(sp.prepMs).toBe(300);
    expect(recoilAt(-1, 301, sp)).toBe(0);
    expect(recoilAt(-1, 150, sp)).toBeLessThan(0);
    expect(recoilAt(-1, 1, sp)).toBeCloseTo(-sp.prep, 0);
    // 蓄力段比加农炮长
    expect(sp.prepMs).toBeGreaterThan(TURRET_SPEC.cannon.prepMs * 2);
  });
  it('按阶换外观：炮口三阶的画不一样（炮口铜环 0 / 1 / 2 道）', () => {
    const svgs = [0, 1, 2].map((t) => turretPieces('shock', t).find((p) => p.key.endsWith('.d3'))!.svg);
    expect(new Set(svgs).size).toBe(3);
    // 每多一道铜环多一段画（铜环是加在炮口上的，不是换色）
    expect(svgs[1]!.length).toBeGreaterThan(svgs[0]!.length);
    expect(svgs[2]!.length).toBeGreaterThan(svgs[1]!.length);
    expect(turretPieces('shock', 0).length).toBe(16);
    expect(turretGeom('shock', 5).len).toBeGreaterThan(0);
  });
  it('登记齐全：建筑图、弹种、音效', () => {
    expect(BUILDING_KINDS).toContain('shock');
    expect(FX_KINDS).toEqual(expect.arrayContaining(['shock', 'grenade', 'stars']));
    expect(towerFire('shock')).toBe('shock');
    expect(projectileFire('shock')).toBe('shock');
    expect(SFX_META.shock.group).toBe('fire');
    expect(SFX_META.stun).toBeDefined();
    expect(TOWER_INFO.shock?.line).toBeTruthy();
    expect(BRANCH_HINT['shock.chain']).toBeTruthy();
    expect(BRANCH_HINT['shock.hammer']).toBeTruthy();
  });
  it('冲击弹低平、手雷高抛', () => {
    expect(arcHeight('shock', 300)).toBeLessThan(arcHeight('mortar', 300));
    expect(arcHeight('grenade', 300)).toBeGreaterThan(arcHeight('ball', 300));
  });
});

describe('掷弹兵的画面', () => {
  it('兵和守岛敌人的骨架、动作、贴图都有', () => {
    for (const k of ['t.grenadier', 'e.grenadier'] as const) {
      expect(RIG_KINDS).toContain(k);
      expect(SKEL[k]).toBeDefined();
      expect(STYLE[k].attack.ms).toBeGreaterThan(0);
      const names = rigPieces(k).map((p) => p.key);
      expect(names.some((n) => n.endsWith('.wep'))).toBe(true);
      expect(names.some((n) => n.endsWith('.torso'))).toBe(true);
    }
    expect(TROOP_KINDS).toContain('grenadier');
    expect(troopFrames('grenadier', 'attack').length).toBeGreaterThanOrEqual(3);
    expect(tdEnemyFrames('grenadier', 'attack').length).toBeGreaterThanOrEqual(3);
  });
  it('预告提醒：先用火（规则已写同一句就不重复）', () => {
    const pv = (note: string | undefined): WavePreview => ({ wave: 1, boss: false, lanes: [{ lane: 0, fly: false, enemies: [{ kind: 'grenadier', n: 2, fog: false }] }], armorShare: { cloth: 100, heavy: 0, wood: 0, air: 0 }, note } as unknown as WavePreview);
    expect(ENEMY_HINT.grenadier).toBe('掷弹兵：先用火');
    expect(enemyHints(pv(undefined))).toEqual(['掷弹兵：先用火']);
    expect(enemyHints(pv('掷弹兵：先用火'))).toEqual([]);
  });
});

describe('被震晕的画面', () => {
  it('晃动幅度不大，三颗星各在轨道的不同位置', () => {
    for (let t = 0; t < 2000; t += 37) expect(Math.abs(wobbleAt(t, 3))).toBeLessThanOrEqual(0.12);
    const o = [0, 1, 2].map((i) => starOrbit(i, 500));
    expect(new Set(o.map((q) => Math.round(q.dx))).size).toBe(3);
    for (const q of o) expect(Math.abs(q.dy)).toBeLessThan(8);
  });
  it('减少动效：星不再转', () => {
    for (let i = 0; i < 3; i++) expect(starOrbit(i, 100, true)).toEqual(starOrbit(i, 99999, true));
  });
});
