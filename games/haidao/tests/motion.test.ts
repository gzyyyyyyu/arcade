import { describe, expect, it } from 'vitest';
import { DEATH_MS, EASE, HIT_SQUASH, hitSquash, STAGE_LOOK, TURN_MS, attackFrame, collapseScale, damageStage, deathPose, easeInOutSine, easeOutBack, easeOutCubic, interpPos, riseScale, strideFrame, turnStep } from '../src/view/motion.ts';

describe('拍间插值', () => {
  it('按比例插，端点精确', () => {
    const o = { x: 0, y: 0 };
    expect(interpPos(o, 10, 20, 30, 40, 0)).toEqual({ x: 10, y: 20 });
    expect(interpPos(o, 10, 20, 30, 40, 0.5)).toEqual({ x: 20, y: 30 });
    expect(interpPos(o, 10, 20, 30, 40, 1)).toEqual({ x: 30, y: 40 });
  });
  it('比例越界夹住', () => {
    const o = { x: 0, y: 0 };
    expect(interpPos(o, 0, 0, 10, 0, 7).x).toBe(10);
    expect(interpPos(o, 0, 0, 10, 0, -3).x).toBe(0);
  });
  it('一拍跳太远（传送）不插', () => {
    expect(interpPos({ x: 0, y: 0 }, 0, 0, 500, 0, 0.1, 100).x).toBe(500);
  });
  it('步伐按距离换帧，循环', () => {
    expect(strideFrame(0, 10, 4)).toBe(0);
    expect(strideFrame(25, 10, 4)).toBe(2);
    expect(strideFrame(40, 10, 4)).toBe(0);
  });
});

describe('转向过渡', () => {
  it('从 1 翻到 -1 要经过 0（压扁），用时约 TURN_MS，不瞬切', () => {
    let f = 1;
    let sawThin = false;
    let t = 0;
    while (f !== -1 && t < 1000) {
      f = turnStep(f, -1, 16);
      t += 16;
      if (Math.abs(f) < 0.2) sawThin = true;
    }
    expect(sawThin).toBe(true);
    expect(f).toBe(-1);
    expect(t).toBeGreaterThanOrEqual(TURN_MS);
    expect(t).toBeLessThan(TURN_MS + 40);
  });
  it('已经朝向目标就不动，不会过冲', () => {
    expect(turnStep(1, 1, 16)).toBe(1);
    expect(turnStep(-0.95, -1, 100)).toBe(-1);
  });
});

describe('攻击帧下标', () => {
  it('帧下标：预备 0、出手 1、后摇 2、收招 3；少于 4 帧时不越界', () => {
    expect([0.1, 0.35, 0.5, 0.9].map((k) => attackFrame(k, 4))).toEqual([0, 1, 2, 3]);
    for (const k of [0, 0.3, 0.5, 1]) expect(attackFrame(k, 2)).toBeLessThanOrEqual(1);
  });
});

describe('受击、缓动、死亡', () => {
  it('缓动：easeOut 前快后慢，easeInOut 对称，Back 会过冲', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5, 5);
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
    expect(easeOutBack(1)).toBeCloseTo(1, 5);
  });
  it('每个动作都选了非线性曲线', () => {
    for (const v of Object.values(EASE)) expect(v).not.toMatch(/linear/i);
    expect(EASE.strike).toMatch(/easeOut/);
    expect(EASE.land).toMatch(/Back/);
  });
  it('死亡：先倒下（角度单调增、不淡出），再淡到全透明，不是瞬间消失', () => {
    const p = { angle: 0, dy: 0, sy: 1, alpha: 1 };
    deathPose(p, 0);
    expect(p.angle).toBe(0);
    expect(p.alpha).toBe(1);
    let last = -1;
    for (let k = 0; k <= 0.5; k += 0.05) {
      deathPose(p, k);
      expect(p.angle).toBeGreaterThanOrEqual(last);
      expect(p.alpha).toBe(1);
      last = p.angle;
    }
    expect(p.angle).toBeGreaterThan(1.2);
    deathPose(p, 0.8);
    expect(p.alpha).toBeGreaterThan(0);
    expect(p.alpha).toBeLessThan(1);
    deathPose(p, 1);
    expect(p.alpha).toBeCloseTo(0, 6);
    expect(DEATH_MS).toBeGreaterThan(300);
  });
});

describe('建筑', () => {
  it('受损阶段按血量分：66% / 33% / 15%', () => {
    expect(damageStage(100, 100)).toBe(0);
    expect(damageStage(66, 100)).toBe(0);
    expect(damageStage(65, 100)).toBe(1);
    expect(damageStage(32, 100)).toBe(2);
    expect(damageStage(14, 100)).toBe(3);
    expect(damageStage(5, 0)).toBe(0);
  });
  it('阶段越高越塌：冒烟 → 着火 → 半塌', () => {
    expect(STAGE_LOOK[0].smokeMs).toBe(0);
    expect(STAGE_LOOK[1].smokeMs).toBeGreaterThan(0);
    expect(STAGE_LOOK[1].fireMs).toBe(0);
    expect(STAGE_LOOK[2].fireMs).toBeGreaterThan(0);
    expect(STAGE_LOOK[3].sy).toBeLessThan(STAGE_LOOK[2].sy);
    expect(STAGE_LOOK[3].tilt).toBeGreaterThan(STAGE_LOOK[2].tilt);
  });
  it('升起：从扁到站直，中途过冲，最后正好 1', () => {
    expect(riseScale(0)[0]).toBeLessThan(0.1);
    expect(riseScale(1)).toEqual([expect.closeTo(1, 5), expect.closeTo(1, 5), 1]);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((k) => riseScale(k)[0]))).toBeGreaterThan(1);
  });
  it('倒塌下沉：越塌越快，压扁', () => {
    expect(collapseScale(0).sy).toBe(1);
    expect(collapseScale(1).sy).toBeLessThan(0.8);
    expect(collapseScale(0.5).dy).toBeLessThan(collapseScale(1).dy / 2);
  });
});

describe('建筑挨打压扁回弹', () => {
  it('挨打那一下压到最扁，横向胖一半', () => {
    const [sx, sy] = hitSquash(0);
    expect(sy).toBeCloseTo(1 - HIT_SQUASH, 6);
    expect(sx).toBeCloseTo(1 + HIT_SQUASH / 2, 6);
  });
  it('中途回弹略过 1，过冲不到压扁量的一半', () => {
    let top = 0;
    for (let k = 0; k <= 1; k += 0.01) top = Math.max(top, hitSquash(k)[1]);
    expect(top).toBeGreaterThan(1);
    expect(top - 1).toBeLessThan(HIT_SQUASH / 2);
  });
  it('结束时正好回到原样（不留一点点压扁）', () => {
    expect(hitSquash(1)).toEqual([1, 1]);
    expect(hitSquash(2)).toEqual([1, 1]);
    const [sx, sy] = hitSquash(0.999);
    expect(Math.abs(sy - 1)).toBeLessThan(0.002);
    expect(Math.abs(sx - 1)).toBeLessThan(0.002);
  });
});
