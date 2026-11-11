import { describe, expect, it } from 'vitest';
import { LIVE_EASE } from '../../src/content/waves.ts';
import { createWorld, fingerprint, step, type Setup } from '../../src/core/index.ts';
import { vigilBp } from '../../src/content/live.ts';
import { liveSetup } from '../../src/platform/live.ts';

// 固定输入跑 5 分钟（每 1.5 秒换一个方向，升级选第一张），返回 [拍数, 血, 指纹]
function run(s: Setup, rules?: number): [number, number, number] {
  const w = createWorld(s, rules);
  for (let t = 0; t < 9000 && w.phase !== 'over'; t++) {
    if (w.phase === 'choose') step(w, 0, 0, 0);
    else step(w, Math.floor(t / 45) % 8, -1, 0);
  }
  return [w.tick, w.hp, fingerprint(w)];
}

describe('实盘降难度 LIVE_EASE（0.17.15，规则 50）', () => {
  // 基准取自 0.17.14 线上（规则 49）的同一局
  const OLD = {
    large: [5_020, -19, 3_848_765_194],
    luxe: [2_426, -6, 2_726_953_419],
  } as const;
  const large = liveSetup('large', 11, undefined, 'xiaodao', 'temple');
  const luxe = liveSetup('luxe', 11, undefined, 'xiaodao', 'guishi');

  it('规则 ≤49 的录像逐位照旧', () => {
    expect(run(large, 49)).toEqual(OLD.large);
    expect(run(luxe, 49)).toEqual(OLD.luxe);
    expect(run(large, 45)).toEqual(OLD.large);
  });

  it('规则 50 起实盘守夜中档以上挨打变轻（同一局多剩血或撑得更久）', () => {
    // 规则 51 起实盘卡池和捡拾半径又变了，这里钉在规则 50 上比
    const [t1, hp1] = run(large, 50);
    expect(t1 > OLD.large[0] || hp1 > OLD.large[1]).toBe(true);
    const [t2, hp2] = run(luxe, 50);
    expect(t2 > OLD.luxe[0] || hp2 > OLD.luxe[1]).toBe(true);
    expect(createWorld(large).liveEase).toBe(true);
  });

  it('娱乐局、小档、夜探实盘不受影响', () => {
    expect(run({ seed: 11, mode: 'vigil', danger: 3, map: 'temple' }, 50)).toEqual(OLD.large);
    expect(run(liveSetup('small', 11, undefined, 'xiaodao', 'temple'), 50)).toEqual([8_995, 72, 783_164_772]);
    expect(run(liveSetup('large', 11, 'guzhen', 'xiaodao'), 50)).toEqual([8_995, 108, 3_517_663_366]);
    expect(createWorld(liveSetup('large', 11, 'guzhen', 'xiaodao')).liveEase).toBe(false);
    expect(createWorld(liveSetup('small', 11)).liveEase).toBe(false);
    expect(LIVE_EASE.fromDanger).toBe(2);
  });

  it('规则 51 起夜探实盘能放技能，规则 50 的夜探实盘录像照旧不能', () => {
    const raid = liveSetup('medium', 11, 'guzhen', 'xiaodao');
    expect(createWorld(raid).liveNoSkill).toBe(false);
    expect(createWorld(raid, 50).liveNoSkill).toBe(true);
  });
});

describe('0.17.15 降难度后压回的 5 格（规则 50）', () => {
  // [档, 图, 角色, 规则 49 天亮, 规则 49 第 10 分钟倒下, 规则 50 天亮]：前两列取自 0.17.14 线上
  const CELLS = [
    ['medium', 'temple', 'xiaodao', 17_236, 7_583, 14_456],
    ['luxe', 'temple', 'xiaodao', 17_712, 13_443, 13_653],
    ['luxe', 'guishi', 'xiaodao', 15_006, 11_389, 12_669],
    ['medium', 'guishi', 'fushi', 15_568, 6_849, 13_622],
    ['luxe', 'guishi', 'jianxia', 12_605, 9_567, 10_455],
  ] as const;
  it('规则 ≤49 开的局结算不变，规则 50 起压低', () => {
    for (const [t, m, c, dawn49, mid49, dawn50] of CELLS) {
      expect(vigilBp(t, 0, true, false, c, m, 49), `${t} ${m} ${c}`).toBe(dawn49);
      expect(vigilBp(t, 600 * 30, false, false, c, m, 49), `${t} ${m} ${c}`).toBe(mid49);
      expect(vigilBp(t, 0, true, false, c, m), `${t} ${m} ${c}`).toBe(dawn50);
      expect(vigilBp(t, 0, true, false, c, m, 50), `${t} ${m} ${c}`).toBe(dawn50);
    }
    expect(vigilBp('large', 0, true, false, 'xiaodao', 'temple')).toBe(vigilBp('large', 0, true, false, 'xiaodao', 'temple', 49));
  });
});

