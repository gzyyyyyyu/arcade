import { describe, expect, it } from 'vitest';
import { CURSE_IDS, CURSES } from '../../src/content/meta.ts';
import { BLOOD_MOON, ELITE_RAGE } from '../../src/content/waves.ts';
import { createWorld, Ev, step, type World } from '../../src/core/index.ts';
import { grantWeapon, spawnNow } from '../../src/core/debug.ts';
import { dailyPlan } from '../../src/online/daily.ts';
import { DAILY_CURSE_IDS } from '../../src/online/types.ts';

function quiet(w: World): World {
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  return w;
}

/** 精英在半血线上被砍一下，返回有没有发狂 */
function rageHappens(curses: readonly ('rage' | 'moon')[]): boolean {
  const w = quiet(createWorld({ seed: 3, mode: 'vigil', danger: 2, curses }));
  grantWeapon(w, 'sword', 8);
  const i = spawnNow(w, 'whitefox', w.x + 30, w.y);
  const half = w.eHpMax[i]! * ELITE_RAGE.at;
  let raged = false;
  for (let t = 0; t < 300 && w.eHp[i]! >= half; t++) {
    w.eHp[i] = half + 1;
    w.eX[i] = w.x + 30;
    w.eY[i] = w.y;
    w.invuln = 99;
    step(w, 0, 0);
    for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.EliteRage) raged = true;
  }
  return raged;
}

function moonRises(curses: readonly ('rage' | 'moon')[]): boolean {
  const w = quiet(createWorld({ seed: 2, mode: 'vigil', danger: 2, curses }));
  w.tick = BLOOD_MOON.first - 1;
  step(w, 0, 0);
  for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.BloodMoon && w.ev.a[k] === 1) return true;
  return false;
}

describe('新咒印：狂、月', () => {
  it('登记齐全：有名字、有说明', () => {
    for (const id of ['rage', 'moon'] as const) {
      expect(CURSE_IDS).toContain(id);
      expect(CURSES[id].text.length).toBeGreaterThan(0);
      expect(CURSES[id].label.length).toBeGreaterThan(0);
    }
  });

  it('狂：危险 2 的精英掉过半血发狂；不挂不会', () => {
    expect(rageHappens(['rage'])).toBe(true);
    expect(rageHappens([])).toBe(false);
    expect(rageHappens(['moon'])).toBe(false);
  });

  it('月：危险 2 到点升起血月；不挂不会', () => {
    expect(moonRises(['moon'])).toBe(true);
    expect(moonRises([])).toBe(false);
    expect(moonRises(['rage'])).toBe(false);
  });

  it('每日挑战的咒印池不含新咒印，抽出来的也都在旧名单里', () => {
    expect(DAILY_CURSE_IDS).toEqual(['fast', 'noheal', 'noreroll', 'more', 'elites', 'dark']);
    for (let d = 1; d <= 60; d++) {
      const date = `2026-10-${String(d % 28 + 1).padStart(2, '0')}`;
      for (const mode of ['vigil', 'raid'] as const) for (const c of dailyPlan(date, mode).curses) expect(DAILY_CURSE_IDS).toContain(c);
    }
  });
});
