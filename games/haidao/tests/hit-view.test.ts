import { describe, expect, it } from 'vitest';
import { DmgTrack, HEAVY_ABS, isHeavyDmg, projDmgKind } from '../src/view/dmgkind';
import {
  charLevel,
  DEATH_CLIP,
  deathFx,
  DEATH_MS,
  deathStyleFor,
  DFX_DUST,
  DFX_DUST_SMALL,
  DFX_EMBER,
  DFX_SMOKE,
  DIE_BURN,
  DIE_SHOT,
  DIE_SOFT,
  HIT,
  HIT_HEAVY,
  HIT_HEAVY_MS,
  HIT_MS,
  hatDrop,
  POSE_KEYS,
  sampleClip,
  zeroPose,
  type DeathStyle,
} from '../src/view/rig';
import { PUDDLE_FADE, PUDDLE_HOLD, puddleLook, tarAt } from '../src/view/tarfx';

describe('受击轻重', () => {
  it('占血量四分之一或绝对值到线算重击', () => {
    expect(isHeavyDmg(10, 100)).toBe(false);
    expect(isHeavyDmg(25, 100)).toBe(true);
    expect(isHeavyDmg(HEAVY_ABS, 100000)).toBe(true);
    expect(isHeavyDmg(5, 0)).toBe(false);
  });
  it('重击比轻击后仰更大、退得更远、时间更长', () => {
    const o = zeroPose();
    let lean = 0;
    let x = 0;
    let lean0 = 0;
    for (let k = 0; k <= 1; k += 0.02) {
      lean = Math.min(lean, sampleClip(o, HIT_HEAVY, k).lean);
      x = Math.min(x, o.x);
      lean0 = Math.min(lean0, sampleClip(o, HIT, k).lean);
    }
    expect(lean).toBeLessThan(lean0 - 5);
    expect(x).toBeLessThan(-6);
    expect(HIT_HEAVY_MS).toBeGreaterThan(HIT_MS);
  });
  it('新动作都有 >= 8 个关键姿势、起止回到 0 或停在终态', () => {
    for (const c of [HIT_HEAVY, DIE_SHOT, DIE_BURN, DIE_SOFT]) expect(c.keys.length).toBeGreaterThanOrEqual(8);
    const z = sampleClip(zeroPose(), HIT_HEAVY, 1);
    for (const k of POSE_KEYS) expect(z[k]).toBe(0);
  });
});

describe('倒下的样子', () => {
  const kinds = ['fly', 'kneel', 'shot', 'burn', 'soft'] as const;
  it('每种样子都有动作，时长是倒下总时长', () => {
    for (const s of kinds) {
      expect(DEATH_CLIP[s].keys.length).toBeGreaterThanOrEqual(8);
      expect(DEATH_CLIP[s].ms).toBe(DEATH_MS);
    }
  });
  it('按伤害类型选：炮弹爆炸飞、火烧焦、枪弹中弹、晕着软倒；没线索退回老逻辑', () => {
    expect(deathStyleFor('shell', 10, 100, false, false)).toBe('fly');
    expect(deathStyleFor('blast', 10, 100, false, true)).toBe('fly');
    expect(deathStyleFor('fire', 10, 100, false, false)).toBe('burn');
    expect(deathStyleFor('fire', 10, 100, false, true)).toBe('burn');
    expect(deathStyleFor('shot', 10, 100, false, false)).toBe('shot');
    expect(deathStyleFor('shot', 10, 100, false, true)).toBe('soft');
    expect(deathStyleFor(null, 10, 100, false, true)).toBe('soft');
    expect(deathStyleFor(null, 10, 100, false, false)).toBe('kneel');
    expect(deathStyleFor(null, 60, 100, false, false)).toBe('fly');
    expect(deathStyleFor('shot', 1, 100, true, false)).toBe('fly');
  });
  it('躺平的终态角度合理：炸飞和中弹向后躺，烧焦、软倒向前扑', () => {
    const o = zeroPose();
    expect(sampleClip(o, DEATH_CLIP.fly, 1).rot).toBeLessThan(-80);
    expect(sampleClip(o, DEATH_CLIP.shot, 1).rot).toBeLessThan(-80);
    expect(sampleClip(o, DEATH_CLIP.burn, 1).rot).toBeGreaterThan(70);
    expect(sampleClip(o, DEATH_CLIP.soft, 1).rot).toBeGreaterThan(70);
  });
  it('炸飞比以前飞得更高更远', () => {
    const o = zeroPose();
    let hi = 0;
    for (let k = 0; k < 1; k += 0.01) hi = Math.min(hi, sampleClip(o, DEATH_CLIP.fly, k).y);
    expect(hi).toBeLessThan(-12);
    expect(sampleClip(o, DEATH_CLIP.fly, 1).x).toBeLessThan(-25);
  });
  it('帽子每种样子都落回地面', () => {
    for (const s of kinds as readonly DeathStyle[]) {
      const y0 = -40;
      const h = hatDrop({ x: 0, y: 0, r: 0 }, s, 1, y0);
      expect(Math.abs(h.y - (-y0 - 1.5))).toBeLessThan(0.5);
    }
  });
  it('粒子只在越过时间点的那一帧放，不重复', () => {
    expect(deathFx('fly', 0.3, 0.37) & DFX_DUST).toBeTruthy();
    expect(deathFx('fly', 0.37, 0.4) & DFX_DUST).toBeFalsy();
    expect(deathFx('shot', 0.5, 0.6) & DFX_DUST_SMALL).toBeTruthy();
    expect(deathFx('kneel', 0, 1)).toBe(0);
    expect(deathFx('soft', 0, 1)).toBe(0);
    let smoke = 0;
    let ember = 0;
    for (let k = 0; k < 1; k += 1 / 66) {
      const f = deathFx('burn', k, k + 1 / 66);
      if (f & DFX_SMOKE) smoke++;
      if (f & DFX_EMBER) ember++;
    }
    expect(smoke).toBeGreaterThanOrEqual(8);
    expect(ember).toBeGreaterThanOrEqual(4);
  });
  it('烧黑在前 30% 完成', () => {
    expect(charLevel(0)).toBe(0);
    expect(charLevel(0.3)).toBe(1);
    expect(charLevel(1)).toBe(1);
  });
});

describe('伤害类型推断', () => {
  it('弹种归类', () => {
    expect(projDmgKind('bullet')).toBe('shot');
    expect(projDmgKind('ball')).toBe('shell');
    expect(projDmgKind('flame')).toBe('fire');
    expect(projDmgKind('keg')).toBe('blast');
    expect(projDmgKind('tar')).toBeNull();
  });
  it('直射：落点拍和位置对得上的那一发', () => {
    const t = new DmgTrack();
    t.noteShoot('bullet', 1000, 1000, 50);
    t.noteShoot('ball', 5000, 5000, 50);
    expect(t.classify(1, 1040, 980, 50)).toBe('shot');
    expect(t.classify(2, 5010, 4990, 51)).toBe('shell');
    expect(t.classify(3, 9000, 9000, 50)).toBeNull();
  });
  it('爆炸罩住的算爆炸，能查到是哪发弹炸的就按它', () => {
    const t = new DmgTrack();
    t.noteExplode(2000, 2000, 150, 60);
    expect(t.classify(1, 2080, 2000, 60)).toBe('blast');
    expect(t.classify(2, 2400, 2000, 60)).toBeNull();
    t.noteShoot('shell', 2000, 2000, 60);
    expect(t.classify(3, 2080, 2000, 61)).toBe('shell');
  });
  it('火烧的无主伤害沿用上次类型 3 秒，之后不再', () => {
    const t = new DmgTrack();
    t.noteShoot('flame', 100, 100, 10);
    expect(t.classify(7, 110, 100, 10)).toBe('fire');
    expect(t.classify(7, 110, 100, 30)).toBe('fire');
    expect(t.classify(7, 110, 100, 200)).toBeNull();
    expect(t.take(7)).toBe('fire');
    expect(t.take(7)).toBeNull();
  });
  it('记录环写满不增长也不出错', () => {
    const t = new DmgTrack();
    for (let i = 0; i < 100; i++) t.noteShoot('bullet', i, i, i);
    expect(t.classify(1, 99, 99, 99)).toBe('shot');
  });
});

describe('焦油痕迹', () => {
  it('水洼先铺开、停几秒、再淡掉', () => {
    expect(puddleLook(0).grow).toBeLessThan(0.5);
    expect(puddleLook(300).grow).toBe(1);
    expect(puddleLook(PUDDLE_HOLD - 1).a).toBe(1);
    expect(puddleLook(PUDDLE_HOLD + PUDDLE_FADE / 2).a).toBeCloseTo(0.5, 5);
    expect(puddleLook(PUDDLE_HOLD + PUDDLE_FADE).a).toBe(0);
    expect(puddleLook(-5).a).toBe(0);
  });
  it('认出焦油陷阱的中心', () => {
    const b = [{ kind: 'tar', x: 3, y: 4, size: 1 }, { kind: 'mine', x: 5, y: 5, size: 1 }];
    expect(tarAt(b, 350, 450)).toBe(true);
    expect(tarAt(b, 550, 550)).toBe(false);
    expect(tarAt(b, 360, 450)).toBe(false);
  });
});
