import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/index.ts';
import { AUTO_SKILL_RANGE, autoSkillSetting, wantAutoSkill } from '../../src/view/game/autoskill.ts';

const g = globalThis as unknown as { localStorage?: Storage };

describe('自动放技能', () => {
  let saved: Storage | undefined;
  beforeEach(() => {
    saved = g.localStorage;
    const m = new Map<string, string>();
    g.localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
  });
  afterEach(() => {
    g.localStorage = saved;
  });

  it('默认关，存取走 yexun.settings', () => {
    expect(autoSkillSetting.on).toBe(false);
    autoSkillSetting.on = true;
    expect(autoSkillSetting.on).toBe(true);
    expect(JSON.parse(g.localStorage!.getItem('yexun.settings')!).autoSkill).toBe(true);
  });

  it('开着 + 技能就绪 + 范围内有活怪才按', () => {
    const w = createWorld({ seed: 7, mode: 'vigil', danger: 0 });
    w.phase = 'play';
    w.skill.cd = 0;
    w.skill.active = 0;
    w.eAlive.fill(0);
    expect(wantAutoSkill(w, true)).toBe(false); // 没怪
    w.eAlive[0] = 1;
    w.eX[0] = w.x + AUTO_SKILL_RANGE + 10;
    w.eY[0] = w.y;
    expect(wantAutoSkill(w, true)).toBe(false); // 太远
    w.eX[0] = w.x + AUTO_SKILL_RANGE - 10;
    expect(wantAutoSkill(w, true)).toBe(true);
    expect(wantAutoSkill(w, false)).toBe(false); // 开关关
    w.skill.cd = 100;
    expect(wantAutoSkill(w, true)).toBe(false); // 冷却中
    w.skill.cd = 0;
    Object.defineProperty(w, 'liveNoSkill', { value: true });
    expect(wantAutoSkill(w, true)).toBe(false); // 实盘不能放
  });
});
