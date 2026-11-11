import { describe, expect, it } from 'vitest';
import { createWorld, fingerprint, step } from '../../src/core/index.ts';
import { INPUT_DIRS } from '../../src/core/fmath.ts';
import { decodeDirs, encodeDirs } from '../../src/replay/format.ts';

describe('慢走（摇杆力度）', () => {
  it('33–64 的位移是对应方向全速的一半', () => {
    for (const d of [1, 5, 9, 17, 27]) {
      const a = createWorld({ seed: 3, mode: 'vigil', danger: 1 });
      const b = createWorld({ seed: 3, mode: 'vigil', danger: 1 });
      const x0 = a.x;
      const y0 = a.y;
      step(a, d);
      step(b, d + INPUT_DIRS);
      expect(b.x - x0).toBeCloseTo((a.x - x0) / 2, 9);
      expect(b.y - y0).toBeCloseTo((a.y - y0) / 2, 9);
      expect(b.face).toBe(a.face);
      expect(b.moving).toBe(true);
    }
  });

  it('慢走真的改变结果（旧值 0–32 逐位不变由 core.test 的金标准指纹锁住）', () => {
    const run = (shift: number): number => {
      const w = createWorld({ seed: 11, mode: 'vigil', danger: 2 });
      let s = 11;
      let dir = 1;
      for (let t = 0; t < 1500 && w.phase !== 'over'; t++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        if (s % 23 === 0) dir = s % 33;
        step(w, dir === 0 ? 0 : dir + shift, w.phase === 'choose' ? s % 3 : -1);
      }
      return fingerprint(w);
    };
    expect(run(INPUT_DIRS)).not.toBe(run(0));
  });

  it('录像里的慢走值往返一致', () => {
    const dirs = new Uint8Array(500);
    for (let i = 0; i < dirs.length; i++) dirs[i] = Math.floor(i / 3) % 65;
    const s = encodeDirs(dirs);
    expect(decodeDirs(s, dirs.length)).toEqual(dirs);
    expect(decodeDirs('2~A', 2)).toBeNull();
    expect(decodeDirs('2~', 2)).toBeNull();
    expect(decodeDirs('2~B', 2)).toEqual(new Uint8Array([33, 33]));
  });
});
