import { describe, expect, it } from 'vitest';
import { createWorld, Drop, step, trialResult, type World } from '../../src/core/index.ts';
import { normalizeSetup } from '../../src/core/state.ts';
import { SCHOOLS } from '../../src/content/guide.ts';
import { TRIAL_IDS, TRIALS, trialScore } from '../../src/content/trials.ts';
import '../../src/explore/register.ts';

/** 试炼（docs/design-play.md 2.6）：配置按表展开，新词缀在核心里生效 */
const play = (w: World, ticks: number): World => {
  for (let t = 0; t < ticks && w.phase !== 'over'; t++) step(w, (t >> 5) % 8 + 1, w.phase === 'choose' ? 0 : -1, 0);
  return w;
};

describe('试炼', () => {
  it('Setup.trial 按表展开，玩家自己的加成、锦囊、开局配置、降低伤害都不带；实盘、连战不开试炼', () => {
    for (const id of TRIAL_IDS) {
      const t = TRIALS[id];
      const s = normalizeSetup({ seed: 3, mode: 'vigil', danger: 0, trial: id, character: 'pang', perks: { shuaxin: 2 }, kits: ['reroll'], startAlt: true, xinfa: 'sword', assist: true, endless: true, curses: ['dark'] });
      expect(s).toMatchObject({ mode: t.mode, danger: t.danger, map: t.map, character: t.character, perks: {}, trial: id });
      expect([...(s.curses ?? [])].sort()).toEqual([...(t.curses ?? [])].sort());
      expect(s.kits ?? s.startAlt ?? s.xinfa ?? s.assist ?? s.endless).toBeUndefined();
      expect(s.weekly).toBe(t.weekly);
      if (t.raid) expect(s.raid).toEqual({ template: t.raid });
    }
    expect(normalizeSetup({ seed: 3, mode: 'vigil', danger: 2, trial: 'chuye', live: true }).trial).toBeUndefined();
    expect(normalizeSetup({ seed: 3, mode: 'vigil', danger: 2, trial: 'nope' as never }).trial).toBeUndefined();
  });

  it('不给新法器：一路选卡也只有起手那件', () => {
    const w = play(createWorld({ seed: 5, mode: 'vigil', danger: 0, trial: 'dumu' }), 30 * 240);
    expect(w.weapons.map((o) => o.id)).toEqual([w.startWeapon]);
    expect(w.level).toBeGreaterThan(3);
  });

  it('白名单：新法器只出那一派的', () => {
    // 直接给升级，有新法器卡就拿新法器，看拿到的是不是都在白名单里
    const w = createWorld({ seed: 9, mode: 'vigil', danger: 0, trial: 'fencheng' });
    for (let n = 0; n < 40 && w.phase !== 'over'; n++) {
      w.pendingLevels++;
      step(w, 0, -1, 0);
      if (w.phase !== 'choose') continue;
      const k = Math.max(0, w.choices.findIndex((c) => c.kind === 'weapon' && !w.weapons.some((o) => o.id === c.id)));
      step(w, 0, k, 0);
    }
    expect(w.weapons.length).toBeGreaterThan(1);
    for (const o of w.weapons) expect(SCHOOLS.fire.weapons).toContain(o.id);
  });

  it('不吃肉包：哪儿都不掉，撑到时限算通关', () => {
    const w = createWorld({ seed: 2, mode: 'vigil', danger: 0, trial: 'kuye' });
    let buns = 0;
    for (let t = 0; t < 30 * 200 && w.phase !== 'over'; t++) {
      step(w, (t >> 5) % 8 + 1, w.phase === 'choose' ? 0 : -1, 0);
      for (let i = 0; i < w.dAlive.length; i++) if (w.dAlive[i] && w.dKind[i] === Drop.Bun) buns++;
    }
    expect(buns).toBe(0);
  });

  it('限时打倒首领：过点算输；成绩编码先比通关再比完成度', () => {
    const w = createWorld({ seed: 4, mode: 'vigil', danger: 0, trial: 'zhanzha' });
    w.tick = TRIALS.zhanzha.goal.kind === 'slay' ? TRIALS.zhanzha.goal.by * 30 : 0;
    step(w, 0, -1, 0);
    expect(w.phase).toBe('over');
    expect(w.won).toBe(false);
    const r = trialResult(w)!;
    expect(r.won).toBe(false);
    expect(r.score).toBe(trialScore(false, r.progress));
    expect(trialScore(true, 0)).toBeGreaterThan(trialScore(false, 899));
    expect(trialScore(true, 30)).toBeGreaterThan(trialScore(true, 10));
  });

  it('不是试炼的局：trial 为 null，结果为 null', () => {
    const w = createWorld({ seed: 1, mode: 'vigil', danger: 2 });
    expect(w.trial).toBeNull();
    expect(trialResult(w)).toBeNull();
  });
});
