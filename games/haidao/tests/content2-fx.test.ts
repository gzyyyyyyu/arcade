import { describe, expect, it } from 'vitest';
import { SNIPE_WARN } from '../src/core/combat.ts';
import { TURRET_KINDS, TURRET_SPEC, arcHeight, isTurret, recoilAt } from '../src/view/aim.ts';
import { BUILDING_KINDS, FX_KINDS, TROOP_KINDS } from '../src/view/art/index.ts';
import { BUILDING_SIZE, turretBaseArt, TURRET_PIVOT } from '../src/view/art/buildings.ts';
import { rigPieces } from '../src/view/art/rigparts.ts';
import { turretGeom, turretPieces } from '../src/view/art/turrets.ts';
import { tdEnemyFrames } from '../src/view/art/tdart.ts';
import { troopFrames } from '../src/view/art/troops.ts';
import { RIG_KINDS, SKEL, STYLE } from '../src/view/rig.ts';
import { GUARD_MS, guardKick, lerpPlace, shieldPlace, type ShieldPlace } from '../src/view/shieldlook.ts';
import { SNIPE_WARN_MS, snipeLook, warnK } from '../src/view/snipelook.ts';
import { ENEMY_HINT, TOWER_INFO } from '../src/view/td-ui.ts';
import { towerFire, projectileFire } from '../src/view/audio/pick.ts';
import { SFX_META, SOUNDS } from '../src/view/audio/synth.ts';
import { MIN_GAP_MS } from '../src/view/audio/mix.ts';

const place = (): ShieldPlace => ({ x: 0, y: 0, sx: 1, behind: false, nx: 0, ny: 0, rot: 0 });

describe('狙击塔的画面', () => {
  it('是会转的炮台：16 个方向的长炮管、三档外观各不相同，炮管比其它塔都长', () => {
    expect(isTurret('sniper')).toBe(true);
    expect(TURRET_KINDS).toContain('sniper');
    expect(BUILDING_KINDS).toContain('sniper');
    expect(BUILDING_SIZE.sniper).toBe(2);
    for (const t of [0, 1, 2]) expect(turretPieces('sniper', t).length).toBe(16);
    const svgs = [0, 1, 2].map((t) => turretPieces('sniper', t).find((p) => p.key.endsWith('.d3'))!.svg);
    expect(new Set(svgs).size).toBe(3);
    for (const k of TURRET_KINDS) if (k !== 'sniper') expect(turretGeom('sniper', 2).len).toBeGreaterThan(turretGeom(k, 2).len);
  });
  it('瞭望台随级换外观，底座和转轴都画得出来（转轴在平台上方、不在地面）', () => {
    const a = turretBaseArt('sniper', 2).svg;
    const b = turretBaseArt('sniper', 6).svg;
    expect(a).not.toBe(b);
    expect(TURRET_PIVOT('sniper', 2).dy).toBeLessThan(-60);
  });
  it('后坐深、回位慢；开火前能预备', () => {
    const sp = TURRET_SPEC.sniper;
    expect(sp.recoil).toBeGreaterThan(TURRET_SPEC.cannon.recoil);
    expect(sp.ret).toBeGreaterThan(TURRET_SPEC.cannon.ret);
    expect(recoilAt(sp.kick, Infinity, sp)).toBeCloseTo(-sp.recoil);
    expect(recoilAt(5000, 60, sp)).toBeLessThan(0);
  });
  it('弹迹素材、开火声、卡片说明都有；狙击弹走直线', () => {
    expect(FX_KINDS).toContain('snipe');
    expect(towerFire('sniper')).toBe('snipe');
    expect(projectileFire('snipe')).toBe('snipe');
    expect(arcHeight('snipe', 400)).toBe(0);
    expect(TOWER_INFO.sniper?.line).toBeTruthy();
  });
  it('音效：重枪合成存在、同名最小间隔有登记', () => {
    expect(SFX_META.snipe.group).toBe('fire');
    expect(SOUNDS.snipe).toBeTypeOf('function');
    expect(MIN_GAP_MS.snipe).toBeGreaterThan(0);
  });
});

describe('狙击预警的样子', () => {
  it('预警 0.5 秒 = SNIPE_WARN 拍；进度从 0 到 1', () => {
    expect(SNIPE_WARN_MS).toBe(500);
    expect(warnK(100, 100 - SNIPE_WARN)).toBe(0);
    expect(warnK(100, 100 - SNIPE_WARN / 2)).toBeCloseTo(0.5);
    expect(warnK(100, 100)).toBe(1);
    expect(warnK(100, 120)).toBe(1);
    expect(warnK(100, 50)).toBe(0);
  });
  it('越接近开火线越实越粗、准星越收越紧、最后亮出白芯', () => {
    const at = (k: number): ReturnType<typeof snipeLook> => ({ ...snipeLook(k, 1000, true) });
    const a = at(0.1);
    const b = at(0.5);
    const c = at(0.95);
    expect(a.lineA).toBeLessThan(b.lineA);
    expect(b.lineA).toBeLessThan(c.lineA);
    expect(a.lineW).toBeLessThan(c.lineW);
    expect(c.lineA).toBeGreaterThan(0.9);
    expect(a.coreA).toBe(0);
    expect(c.coreA).toBeGreaterThan(0.5);
    const r0 = { ...snipeLook(0, 0) }.ringR;
    const r1 = { ...snipeLook(1, 0) }.ringR;
    expect(r1).toBeLessThan(r0);
  });
  it('减弱动态：不闪、准星不收缩', () => {
    const xs = new Set<number>();
    for (let t = 0; t < 400; t += 7) xs.add(snipeLook(0.3, t, true).lineA);
    expect(xs.size).toBe(1);
    expect(snipeLook(0, 0, true).ringR).toBe(snipeLook(1, 0, true).ringR);
    const ys = new Set<number>();
    for (let t = 0; t < 400; t += 7) ys.add(snipeLook(0.3, t, false).lineA);
    expect(ys.size).toBeGreaterThan(1);
  });
  it('预警时长和规则常量同一个数', () => {
    expect(SNIPE_WARN).toBe(10);
  });
});

describe('盾兵的画面', () => {
  it('兵和守岛敌人都有骨架、动作和大木盾部件', () => {
    for (const k of ['t.shield', 'e.shield'] as const) {
      expect(RIG_KINDS).toContain(k);
      expect(SKEL[k]).toBeDefined();
      expect(STYLE[k].attack.ms).toBeGreaterThan(600);
      const names = rigPieces(k).map((p) => p.key);
      expect(names.some((n) => n.endsWith('.shield'))).toBe(true);
      expect(names.some((n) => n.endsWith('.torso'))).toBe(true);
    }
    expect(TROOP_KINDS).toContain('shield');
    expect(troopFrames('shield', 'attack').length).toBeGreaterThanOrEqual(3);
    expect(tdEnemyFrames('shield', 'walk').length).toBeGreaterThanOrEqual(3);
  });
  it('只有盾兵有盾部件', () => {
    for (const k of RIG_KINDS) {
      const has = rigPieces(k).some((p) => p.key.endsWith('.shield'));
      expect(has).toBe(k === 't.shield' || k === 'e.shield');
    }
  });
  it('预告卡写“先用火、爆”', () => {
    expect(ENEMY_HINT.shield).toBe('盾兵：先用火、爆');
  });
});

describe('盾跟着朝向换边', () => {
  it('朝屏幕右下（世界 +x）盾在身体右边偏前；朝世界 +y 在左边；朝世界 -x 在后上方被身体挡住', () => {
    const r = shieldPlace(100, 0, place());
    const l = shieldPlace(0, 100, place());
    const back = shieldPlace(-100, 0, place());
    const front = shieldPlace(100, 100, place());
    expect(r.x).toBeGreaterThan(5);
    expect(l.x).toBeLessThan(-5);
    expect(r.behind).toBe(false);
    expect(back.behind).toBe(true);
    expect(front.behind).toBe(false);
    // 对着玩家的盾最宽，侧面最窄
    expect(front.sx).toBeGreaterThan(r.sx);
    const side = shieldPlace(100, -100, place());
    expect(side.sx).toBeLessThan(r.sx);
    expect(side.x).toBeGreaterThan(r.x);
  });
  it('四个方向的盾位置各不相同（看得出举在哪边）', () => {
    const dirs: Array<[number, number]> = [[100, 0], [-100, 0], [0, 100], [0, -100], [70, 70], [-70, -70]];
    const spots = new Set(dirs.map(([x, y]) => { const p = shieldPlace(x, y, place()); return `${Math.round(p.x)},${Math.round(p.y)}`; }));
    expect(spots.size).toBe(dirs.length);
  });
  it('没有朝向（0, 0）按朝右下摆，不报错', () => {
    const p = shieldPlace(0, 0, place());
    expect(Number.isFinite(p.x)).toBe(true);
    expect(p.x).toBeGreaterThan(0);
  });
  it('转身是连续的：每一步都比上一步更靠近目标，最终到位', () => {
    const cur = shieldPlace(100, 0, place());
    const want = shieldPlace(-100, 0, place());
    let prev = Math.abs(cur.x - want.x);
    for (let i = 0; i < 20; i++) {
      lerpPlace(cur, want, 0.3);
      const d = Math.abs(cur.x - want.x);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
    expect(prev).toBeLessThan(0.1);
    expect(cur.behind).toBe(true);
  });
});

describe('挡住一发的盾晃', () => {
  it('撞上去往里一顿再弹回，GUARD_MS 后停', () => {
    const peak = Math.max(...Array.from({ length: 26 }, (_, i) => guardKick(i * 10, false, { push: 0, rot: 0, scale: 1, flash: 0 }).push));
    expect(peak).toBeGreaterThan(1.5);
    const end = guardKick(GUARD_MS, false, { push: 0, rot: 0, scale: 1, flash: 0 });
    expect(end.push).toBe(0);
    expect(end.rot).toBe(0);
    expect(end.scale).toBe(1);
    expect(guardKick(-5).push).toBe(0);
  });
  it('晃的幅度越来越小（阻尼）', () => {
    const amp = (a: number, b: number): number => {
      let m = 0;
      for (let t = a; t < b; t += 4) m = Math.max(m, Math.abs(guardKick(t, false, { push: 0, rot: 0, scale: 1, flash: 0 }).rot));
      return m;
    };
    expect(amp(0, 90)).toBeGreaterThan(amp(170, 260));
  });
  it('减弱动态：不晃，只给一下很短的亮闪', () => {
    for (let t = 0; t < GUARD_MS; t += 10) {
      const k = guardKick(t, true, { push: 0, rot: 0, scale: 1, flash: 0 });
      expect(k.push).toBe(0);
      expect(k.rot).toBe(0);
      expect(k.scale).toBe(1);
    }
    expect(guardKick(0, true, { push: 0, rot: 0, scale: 1, flash: 0 }).flash).toBe(1);
  });
  it('格挡音：当的一声，登记了同名最小间隔', () => {
    expect(SFX_META.guard.group).toBe('hit');
    expect(SOUNDS.guard).toBeTypeOf('function');
    expect(MIN_GAP_MS.guard).toBeGreaterThan(0);
  });
});
