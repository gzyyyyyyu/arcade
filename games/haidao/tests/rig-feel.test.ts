import { describe, expect, it } from 'vitest';
import { arcLook, CATCH_MS, HITSTOP_MS, RIG_KINDS, sampleClip, SKEL, SLASH, SMASH, STYLE, stopK, strideOf, PX_PER_TILE, THROW, WALK, WALK_BOB, WALK_SQUASH, WALK_SWING, zeroPose, type Clip, type Pose } from '../src/view/rig.ts';
import { TROOPS } from '../src/content/troops.ts';
import { boxOf, DMG_MIN_PX, dmgFontPx, NO_OCC, occludes } from '../src/view/fxlayout.ts';

// 主线 10-30 对小兵动作的四条反馈，能锁的数值锁在这里
const FRAME = 1000 / 60;
const at = (c: Clip, k: number): Pose => sampleClip(zeroPose(), c, k);
const range = (c: Clip, key: keyof Pose): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 240; i++) {
    const v = at(c, i / 240)[key];
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
};

describe('走路：摆幅、起伏翻倍，触地压扁，脚不打滑', () => {
  it('腿摆角、身体起伏都是上一版（24 度、2.2 像素）的两倍以上', () => {
    expect(WALK_SWING).toBeGreaterThanOrEqual(48);
    const [lo, hi] = range(WALK, 'legF');
    expect(hi).toBeCloseTo(WALK_SWING, 0);
    expect(lo).toBeCloseTo(-WALK_SWING, 0);
    const [ylo, yhi] = range(WALK, 'y');
    expect(yhi - ylo).toBeGreaterThanOrEqual(2 * 2.2);
    expect(WALK_BOB).toBeGreaterThanOrEqual(4.4);
  });
  it('触地那一拍（0.25、0.75）身子最低、压扁 WALK_SQUASH；过渡位最高、略拉长', () => {
    for (const k of [0.25, 0.75]) {
      expect(at(WALK, k).sq).toBeCloseTo(WALK_SQUASH);
      expect(at(WALK, k).y).toBeCloseTo(0);
    }
    expect(at(WALK, 0).y).toBeLessThan(-4);
    expect(at(WALK, 0).sq).toBeLessThan(0);
  });
  it('步幅按摆角算：一个循环脚走过的距离 = strideOf，摆角放大后步幅跟着变大（不滑步）', () => {
    for (const k of RIG_KINDS) {
      const sk = SKEL[k];
      const ls = STYLE[k].legScale ?? 1;
      expect(strideOf(sk, ls)).toBeCloseTo(4 * sk.leg * Math.sin((WALK_SWING * ls * Math.PI) / 180) * sk.s);
    }
  });
  it('各兵种步频不同：循环时间 T = 步幅 / (速度 × 每格像素)，重兵最慢、炸药兵最快，左右两步不镜像', () => {
    const T: Record<string, number> = { sailor: 0.72, harpooner: 0.7, bomber: 0.62, medic: 0.8, gunner: 0.86, grenadier: 0.95, captain: 0.95, shield: 1, cannoneer: 1.05, brute: 1.15 };
    for (const [id, want] of Object.entries(T)) {
      const k = `t.${id}` as keyof typeof STYLE;
      const t = strideOf(SKEL[k], STYLE[k].legScale) / (TROOPS[id as keyof typeof TROOPS].levels[0]!.speed * PX_PER_TILE);
      expect(Math.abs(t / want - 1), `${id} T=${t.toFixed(3)}`).toBeLessThan(0.08);
    }
    for (const k of RIG_KINDS) {
      const w = STYLE[k].walk;
      expect(w.keys.length).toBeGreaterThanOrEqual(16);
      const a = at(w, 0.1);
      const b = at(w, 0.6);
      expect(Math.abs(a.armB + b.armB) + Math.abs(a.lean - b.lean) + Math.abs(a.y - b.y), `${k} 两步镜像`).toBeGreaterThan(0.05);
    }
  });
});

describe('攻击：全身参与，蓄力后仰、出手前压、脚下挪一步再回来', () => {
  const clips: Array<[string, Clip]> = [['slash', SLASH], ['smash', SMASH], ['throw', THROW]];
  for (const [n, c] of clips) {
    it(`${n}：蓄力段身子后仰 ≥ 18 度，出手点前压 ≥ 18 度，整体转身和重心前移，结束回到原位`, () => {
      const hit = c.hit!;
      const [leanLo] = range({ ...c, keys: c.keys.filter((q) => q.t <= hit - 0.05) }, 'lean');
      expect(leanLo).toBeLessThanOrEqual(-18);
      const s = at(c, hit);
      expect(s.lean).toBeGreaterThanOrEqual(18);
      expect(s.rot).toBeGreaterThan(4);
      expect(s.x).toBeGreaterThanOrEqual(3.5);
      expect(Math.abs(s.legF - s.legB)).toBeGreaterThanOrEqual(25);
      const end = at(c, 1);
      for (const key of ['lean', 'rot', 'x', 'legF', 'legB'] as const) expect(Math.abs(end[key])).toBeLessThan(1e-6);
    });
  }
  it('挥砍类有弧形残影，壮汉的锤子最长最亮', () => {
    const brute = arcLook('t.brute')!;
    expect(brute).not.toBeNull();
    for (const k of RIG_KINDS) {
      const a = arcLook(k);
      if (!a || k === 't.brute') continue;
      expect(a.len).toBeLessThanOrEqual(brute.len);
      expect(a.alpha).toBeLessThanOrEqual(brute.alpha);
    }
    expect(arcLook('t.gunner')).toBeNull();
  });
});

describe('局部顿帧：只停这个兵 2–3 帧，再追回规则进度不跳', () => {
  it('停的时长在 60 帧下是 2–3 帧', () => {
    expect(HITSTOP_MS / FRAME).toBeGreaterThanOrEqual(2);
    expect(HITSTOP_MS / FRAME).toBeLessThanOrEqual(3);
  });
  it('按 1/60 秒步进：出手点上停住的帧数 2–3，追回段每帧推进不超过正常速度的 2.6 倍，最后和规则进度重合', () => {
    const ms = SLASH.ms!;
    const hit = SLASH.hit!;
    let held = 0;
    let prev = stopK(0, hit, ms);
    const dk = FRAME / ms;
    for (let f = 1; f * dk <= 1; f++) {
      const k = f * dk;
      const v = stopK(k, hit, ms);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(v - prev).toBeLessThanOrEqual(dk * 2.6);
      if (k > hit && v === hit) held++;
      if ((k - hit) * ms >= HITSTOP_MS + CATCH_MS) expect(v).toBeCloseTo(k);
      prev = v;
    }
    expect(held).toBeGreaterThanOrEqual(2);
    expect(held).toBeLessThanOrEqual(3);
  });
});

describe('伤害数字字号按镜头封顶', () => {
  it('正常全景（小兵屏幕上 ≥ 40 像素）保持设计字号，放大跟拍时不超过小兵身高的一半多一点', () => {
    expect(dmgFontPx(12, 40)).toBe(12);
    expect(dmgFontPx(19, 40)).toBe(19);
    // 镜头放大：设计字号本身是屏幕像素，不随镜头变大，但近景 unitPx 很大时也不会超过设计字号
    expect(dmgFontPx(19, 200)).toBe(19);
    // 很远（小兵只有 20 像素高）：字缩到能看清的下限
    expect(dmgFontPx(19, 20)).toBe(DMG_MIN_PX);
    expect(dmgFontPx(12, 10)).toBe(12);
  });
});

describe('遮挡剪影：按格子查，建筑在前、外框盖住身体中点才画', () => {
  const b = { id: 1, x0: 0, y0: 0, x1: 100, y1: 80, depth: 10 };
  it('深度在前、点在框里才算挡住', () => {
    expect(occludes(b, 50, 40, 9.4)).toBe(true);
    expect(occludes(b, 50, 40, 10.4)).toBe(false);
    // 装饰和贴地的不算挡：站在棕榈后面的兵不该多出一个浅蓝残影
    for (const k of ['palm', 'flagpole', 'statue', 'chest', 'rock', 'wall', 'tar', 'mine']) expect(NO_OCC.has(k)).toBe(true);
    for (const k of ['hq', 'cannon', 'goldmine']) expect(NO_OCC.has(k)).toBe(false);
    expect(occludes(b, 120, 40, 9.4)).toBe(false);
  });
  it('外框按原点和缩放换成世界坐标、四边收一圈、底边不低于锚点', () => {
    const r = boxOf({ x: 100, y: 200, originX: 0.5, originY: 1, width: 200, height: 160, scaleX: 0.5, scaleY: 0.5 }, { l: 20, t: 10, r: 180, b: 160 }, 0);
    expect(r).toEqual({ x0: 60, x1: 140, y0: 125, y1: 200 });
    const s = boxOf({ x: 100, y: 200, originX: 0.5, originY: 1, width: 200, height: 160, scaleX: 0.5, scaleY: 0.5 }, { l: 20, t: 10, r: 180, b: 160 });
    expect(s.x0).toBeGreaterThan(60);
    expect(s.x1).toBeLessThan(140);
    expect(s.y1).toBe(200);
  });
});
