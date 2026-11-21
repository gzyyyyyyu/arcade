import { describe, expect, it } from 'vitest';
import { createWorld, step } from '../../src/core/index.ts';
import { normalizeSetup, type Setup } from '../../src/core/state.ts';
import { CHARACTER_POOLS } from '../../src/content/pools.ts';

/** 局前锦囊（DESIGN 3.8a）：只管娱乐局；没带时和原来一模一样 */
const base: Setup = { seed: 7, mode: 'vigil', danger: 2, character: 'xiaodao' };

describe('局前锦囊', () => {
  it('实盘、连战、本周夜事不带', () => {
    expect(normalizeSetup({ ...base, kits: ['reroll'], live: true }).kits).toBeUndefined();
    expect(normalizeSetup({ ...base, kits: ['reroll'], rush: true }).kits).toBeUndefined();
    expect(normalizeSetup({ ...base, kits: ['reroll'], weekly: 'coin' }).kits).toBeUndefined();
    expect(normalizeSetup({ ...base, kits: ['passive', 'bogus' as never, 'passive'] }).kits).toEqual(['passive']);
  });
  it('刷新符多 2 次刷新、1 次封禁；「定」咒印照样不能刷新', () => {
    const a = createWorld(base);
    const b = createWorld({ ...base, kits: ['reroll'] });
    expect(b.rerolls - a.rerolls).toBe(2);
    expect(b.bans - a.bans).toBe(1);
    expect(createWorld({ ...base, kits: ['reroll'], curses: ['noreroll'] }).rerolls).toBe(0);
  });
  it('开门红起手 2 级；随身宝从角色池抽一件被动，同种子抽到同一件', () => {
    expect(createWorld({ ...base, kits: ['start2'] }).weapons[0]!.level).toBe(2);
    const p = (seed: number) => Object.keys(createWorld({ ...base, seed, kits: ['passive'] }).passives);
    expect(p(11)).toEqual(p(11));
    expect(p(11)).toHaveLength(1);
    expect(CHARACTER_POOLS.xiaodao.passives).toContain(p(11)[0]);
  });
  it('没带锦囊：跑一段和原来同一个局面（不多吃随机数）', () => {
    const run = (s: Setup) => {
      const w = createWorld(s);
      for (let t = 0; t < 900 && w.phase !== 'over'; t++) step(w, t % 8, w.phase === 'choose' ? 0 : -1, 0);
      return [w.tick, w.kills, w.x, w.y, w.hp];
    };
    expect(run({ ...base, kits: [] })).toEqual(run(base));
  });
});
