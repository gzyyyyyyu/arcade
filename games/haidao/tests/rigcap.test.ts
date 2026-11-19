import { describe, expect, it } from 'vitest';
import { RigCap } from '../src/view/rigcap.ts';

/** 跑一帧：units 是 [id, 到中心距离, 体型]，返回这一帧画完整骨架的 id */
function frame(cap: RigCap, units: ReadonlyArray<readonly [number, number, number]>): number[] {
  cap.begin();
  const full = units.filter(([id, d, size]) => cap.want(id, d * d, size)).map(([id]) => id);
  cap.end();
  return full;
}

describe('RigCap：同屏完整骨架的名额', () => {
  it('不超名额时谁都画完整骨架', () => {
    const cap = new RigCap(3);
    const us = [[1, 10, 40], [2, 20, 40], [3, 30, 40]] as const;
    expect(frame(cap, us)).toEqual([1, 2, 3]);
    expect(frame(cap, us)).toEqual([1, 2, 3]);
  });
  it('超了：第一帧照旧全画，从下一帧起只留离中心近的前 cap 个', () => {
    const cap = new RigCap(2);
    const us = [[1, 300, 40], [2, 10, 40], [3, 20, 40], [4, 200, 40]] as const;
    expect(frame(cap, us)).toEqual([1, 2, 3, 4]);
    expect(frame(cap, us).sort()).toEqual([2, 3]);
  });
  it('体型大的（首领、精英）离得远一点也先保留', () => {
    const cap = new RigCap(1);
    const us = [[1, 50, 30], [2, 90, 90]] as const;
    frame(cap, us);
    expect(frame(cap, us)).toEqual([2]);
  });
  it('名额边上两人分数相近时不来回换（正在完整档的有折扣）', () => {
    const cap = new RigCap(1);
    frame(cap, [[1, 100, 40], [2, 101, 40]]);
    expect(frame(cap, [[1, 100, 40], [2, 101, 40]])).toEqual([1]);
    // 2 稍微更近了一点，但没超过折扣：不换
    expect(frame(cap, [[1, 100, 40], [2, 95, 40]])).toEqual([1]);
    expect(frame(cap, [[1, 100, 40], [2, 95, 40]])).toEqual([1]);
    // 近很多才换
    frame(cap, [[1, 100, 40], [2, 50, 40]]);
    expect(frame(cap, [[1, 100, 40], [2, 50, 40]])).toEqual([2]);
  });
  it('人数回落到名额内：下一帧全部恢复完整骨架', () => {
    const cap = new RigCap(1);
    frame(cap, [[1, 10, 40], [2, 20, 40]]);
    expect(frame(cap, [[1, 10, 40], [2, 20, 40]])).toEqual([1]);
    frame(cap, [[2, 20, 40]]);
    expect(frame(cap, [[2, 20, 40]])).toEqual([2]);
  });
});
