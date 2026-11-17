// 0.28.0（规则 65）：专属搭配的料加权、两个技能冷却缩短、心法流派的法器伤害 +10% 进实盘后压回的守夜格子（DESIGN 4.2a、docs/balance-yexun.md 第 1 节）
import { describe, expect, it } from 'vitest';
import { LIVE_SKILL_BP, vigilBp, type LiveTier } from '../../src/content/live.ts';
import type { CharacterId } from '../../src/content/meta.ts';

// [档, 角色, 规则 64 的组合系数, 规则 65 的组合系数]，都在雪原
const CELLS: [LiveTier, CharacterId, number, number][] = [
  ['luxe', 'xiaodao', 9500, 8900],
  ['medium', 'fushi', 10000, 9800],
  ['large', 'fushi', 9600, 9100],
  ['luxe', 'fushi', 8700, 8500],
  ['medium', 'zhijiang', 9400, 9200],
];
const dawn = (t: LiveTier, k: number): number => Math.floor((LIVE_SKILL_BP.dawn[t]! * k) / 10_000);

describe('规则 65 守夜压回的格子', () => {
  it('规则 64 开的局照旧结', () => {
    for (const [t, c, old] of CELLS) expect(vigilBp(t, 0, true, false, c, 'snow', 64), `${t} ${c}`).toBe(dawn(t, old));
  });
  it('规则 65 起（现行规则同）按压回的系数结，别的图不动', () => {
    for (const [t, c, , now] of CELLS) {
      expect(vigilBp(t, 0, true, false, c, 'snow', 65), `${t} ${c}`).toBe(dawn(t, now));
      expect(vigilBp(t, 0, true, false, c, 'snow'), `${t} ${c}`).toBe(dawn(t, now));
      expect(vigilBp(t, 0, true, false, c, 'bamboo'), `${t} ${c} 竹林`).toBe(vigilBp(t, 0, true, false, c, 'bamboo', 64));
    }
  });
});
