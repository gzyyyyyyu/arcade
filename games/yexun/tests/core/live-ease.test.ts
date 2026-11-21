import { describe, expect, it } from 'vitest';
import { LIVE_EASE } from '../../src/content/waves.ts';
import { createWorld, step, type Setup } from '../../src/core/index.ts';
import { liveSetup } from '../../src/platform/live.ts';

// 固定输入跑 5 分钟（每 1.5 秒换一个方向，升级选第一张），返回 [拍数, 血]
function run(s: Setup): [number, number] {
  const w = createWorld(s);
  for (let t = 0; t < 9000 && w.phase !== 'over'; t++) {
    if (w.phase === 'choose') step(w, 0, 0, 0);
    else step(w, Math.floor(t / 45) % 8, -1, 0);
  }
  return [w.tick, w.hp];
}

describe('实盘降难度 LIVE_EASE', () => {
  const large = liveSetup('large', 11, undefined, 'xiaodao', 'temple');
  const luxe = liveSetup('luxe', 11, undefined, 'xiaodao', 'guishi');

  it('实盘守夜中档以上挨打变轻（同一局比娱乐多剩血或撑得更久）', () => {
    for (const s of [large, luxe]) {
      const [t1, hp1] = run(s);
      const [t0, hp0] = run({ ...s, live: false });
      expect(t1 > t0 || hp1 > hp0, s.map).toBe(true);
    }
    expect(createWorld(large).liveEase).toBe(true);
  });

  it('娱乐局、小档、夜探实盘不受影响', () => {
    expect(createWorld({ seed: 11, mode: 'vigil', danger: 3, map: 'temple' }).liveEase).toBe(false);
    expect(createWorld(liveSetup('large', 11, 'guzhen', 'xiaodao')).liveEase).toBe(false);
    expect(createWorld(liveSetup('small', 11)).liveEase).toBe(false);
    expect(LIVE_EASE.fromDanger).toBe(2);
  });
});
