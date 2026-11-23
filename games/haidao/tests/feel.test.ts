import { describe, expect, it } from 'vitest';
import { BIG_EVENT, SHAKE, SHAKE_COOLDOWN_MS, ShakeGate, StopGate, VIBE, buildingDownEvent, isBigBlast, isKeyHit, resolveFeel, vibrate } from '../src/view/feel.ts';

describe('震屏闸门', () => {
  it('关了就不震', () => {
    expect(new ShakeGate().request('heavy', 0, false)).toBe(false);
  });
  it('冷却里同档和低档都不放行，过了冷却放行', () => {
    const g = new ShakeGate();
    expect(g.request('medium', 1000, true)).toBe(true);
    expect(g.request('medium', 1000 + SHAKE_COOLDOWN_MS - 1, true)).toBe(false);
    expect(g.request('light', 1100, true)).toBe(false);
    expect(g.request('medium', 1000 + SHAKE_COOLDOWN_MS, true)).toBe(true);
  });
  it('冷却里更高一档能打断，同一时间只取最大的', () => {
    const g = new ShakeGate();
    expect(g.request('light', 0, true)).toBe(true);
    expect(g.request('heavy', 50, true)).toBe(true);
    expect(g.request('medium', 100, true)).toBe(false);
    expect(g.request('light', 200, true)).toBe(false);
  });
  it('冷却不短于 300 毫秒，三档强度递增', () => {
    expect(SHAKE_COOLDOWN_MS).toBeGreaterThanOrEqual(300);
    expect(SHAKE.light.k).toBeLessThan(SHAKE.medium.k);
    expect(SHAKE.medium.k).toBeLessThan(SHAKE.heavy.k);
  });
});

describe('顿帧闸门', () => {
  it('只给重击：stop 为 0 不触发；触发后不叠加、留冷却', () => {
    const s = new StopGate();
    expect(s.trigger(0, 0)).toBe(false);
    expect(s.trigger(55, 0)).toBe(true);
    expect(s.active(10)).toBe(true);
    expect(s.trigger(55, 20)).toBe(false);
    expect(s.active(54)).toBe(true);
    expect(s.active(60)).toBe(false);
    expect(s.trigger(55, 150)).toBe(false);
    expect(s.trigger(55, 500)).toBe(true);
  });
});

describe('哪些事件震屏', () => {
  it('墙、地雷、焦油、棕榈不震，主寨最重，其它建筑中档', () => {
    for (const k of ['wall', 'mine', 'tar', 'palm', 'rock', 'barrel']) expect(buildingDownEvent(k)).toBeNull();
    expect(buildingDownEvent('hq')).toBe('hqDown');
    expect(BIG_EVENT.hqDown.shake).toBe('heavy');
    expect(buildingDownEvent('cannon')).toBe('buildingDown');
  });
  it('主寨 / 宝藏箱只有重击才算被打', () => {
    expect(isKeyHit('hq', 30, 90)).toBe(false);
    expect(isKeyHit('hq', 90, 90)).toBe(true);
    expect(isKeyHit('treasure', 120, 90)).toBe(true);
    expect(isKeyHit('cannon', 500, 90)).toBe(false);
  });
  it('小爆炸不算大事件', () => {
    expect(isBigBlast(0.8)).toBe(false);
    expect(isBigBlast(1.4)).toBe(false);
    expect(isBigBlast(1.5)).toBe(true);
  });
  it('只有最重的几件事配较长的顿帧', () => {
    expect(BIG_EVENT.keyHit.stop).toBe(0);
    // 出海一座接一座倒，普通建筑倒塌不能顿帧（兵会跟着停一下）；主寨、首领、宝藏照旧
    expect(BIG_EVENT.buildingDown).toEqual({ shake: 'light', stop: 0 });
    expect(BIG_EVENT.hqDown.stop).toBeGreaterThan(0);
    expect(BIG_EVENT.hqDown.stop).toBeGreaterThanOrEqual(BIG_EVENT.buildingDown.stop);
  });
});

describe('开关', () => {
  it('没存过：跟随系统的减弱动态效果；存过：听存的', () => {
    expect(resolveFeel(null, false)).toBe(true);
    expect(resolveFeel(null, true)).toBe(false);
    expect(resolveFeel('1', true)).toBe(true);
    expect(resolveFeel('0', false)).toBe(false);
    expect(resolveFeel('乱写的', true)).toBe(false);
  });
});

describe('短振动', () => {
  it('开关关了、设备不支持都跳过，开着且支持才振', () => {
    const calls: Array<number | number[]> = [];
    const nav = {
      vibrate: (p: number | number[]) => {
        calls.push(p);
        return true;
      },
    };
    expect(vibrate('land', false, nav)).toBe(false);
    expect(vibrate('land', true, {})).toBe(false);
    expect(vibrate('land', true, undefined)).toBe(false);
    expect(calls).toEqual([]);
    expect(vibrate('land', true, nav)).toBe(true);
    expect(vibrate('win', true, nav)).toBe(true);
    expect(calls).toEqual([VIBE.land, [...VIBE.win]]);
  });
  it('每一下都是几十毫秒', () => {
    for (const p of Object.values(VIBE)) for (const n of typeof p === 'number' ? [p] : p) expect(n).toBeLessThanOrEqual(100);
  });
});
