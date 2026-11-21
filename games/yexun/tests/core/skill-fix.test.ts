// 第二件起手时技能借的法器不在手上：纸匠的剪纸成军照样剪纸兵，小道士、剑侠、符师的技能按手上最高等级算
import { describe, expect, it } from 'vitest';
import { createWorld, Shot, step, MAX_SHOTS, type World } from '../../src/core/index.ts';
import { borrowStats } from '../../src/core/skills.ts';
import { spawnNow } from '../../src/core/debug.ts';
import { weaponStats } from '../../src/content/weapons.ts';

const papers = (w: World, slot: number): number => {
  let n = 0;
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Paper && w.sSlot[i] === slot) n++;
  return n;
};

describe('第二件起手的技能', () => {
  it('借的法器不在手上：按手上最高等级算；拿在手上的照旧用手上的', () => {
    const w = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: 'xiaodao', startAlt: true });
    expect(w.weapons.some((o) => o.id === 'sword')).toBe(false);
    w.weapons[0]!.level = 5;
    expect(borrowStats(w, 'sword').dmg).toBe(weaponStats('sword', 5, false).dmg);
    expect(borrowStats(w, 'sword').dmg).toBeGreaterThan(weaponStats('sword', 1, false).dmg);
    const held = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: 'xiaodao' });
    expect(borrowStats(held, 'sword')).toBe(held.wstats[0]);
  });

  it('纸匠第二起手放剪纸成军：剪出 4 个不挂槽位的纸兵，会打怪', () => {
    const w = createWorld({ seed: 5, mode: 'vigil', danger: 0, character: 'zhijiang', startAlt: true });
    expect(w.weapons.some((o) => o.id === 'zhibing')).toBe(false);
    for (let t = 0; t < 60; t++) step(w, -1, w.phase === 'choose' ? 0 : -1, 0);
    w.skill.cd = 0;
    step(w, -1, -1, 1);
    expect(papers(w, -1)).toBe(4);
    // 起手法器不出手，掉的血都是纸兵打的
    for (const o of w.weapons) o.timer = 1e9;
    const e = spawnNow(w, 'jiangshi', w.x + 70, w.y);
    w.eHp[e] = 1e7;
    for (let t = 0; t < 90; t++) {
      for (const o of w.weapons) o.timer = 1e9;
      step(w, -1, w.phase === 'choose' ? 0 : -1, 0);
    }
    expect(w.eHp[e]!).toBeLessThan(1e7);
  });
});
