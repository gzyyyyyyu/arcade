import { describe, expect, it } from 'vitest';
import { buildLevel, TD2_LEVEL_DEFS } from '../src/content/tdmaps.ts';
import { runTdBot, tdGrowthSetup } from '../src/core/index.ts';
import type { TdLevel } from '../src/core/index.ts';

// 战役几关前几波放宽（关卡的 ease）。没写 ease 的关、悬赏守岛 / 大潮 / 海盗来袭不读它

const count = (lv: TdLevel, i: number): number => lv.waves[i]!.groups.reduce((a, g) => a + g.n, 0);
const eased = TD2_LEVEL_DEFS.filter((d) => d.ease);

describe('关卡放宽', () => {
  it('有几关写了 ease，都在前三章，另有第六章首领关 td34（前 6 波放宽，0.59.0 配平）', () => {
    expect(eased.length).toBeGreaterThan(0);
    for (const d of eased) if (d.id !== 'td34') expect(d.chapter).toBeLessThanOrEqual(3);
    expect(eased.some((d) => d.id === 'td34')).toBe(true);
  });

  it('开局金多给 ease.gold', () => {
    for (const d of eased) expect(buildLevel(d).gold).toBe(d.gold + (d.ease!.gold ?? 0));
  });

  it('前 waves 波人数变少，之后的波不变', () => {
    for (const d of eased.filter((x) => x.ease!.pct)) {
      const now = buildLevel(d);
      const before = buildLevel({ ...d, ease: undefined });
      const upto = d.ease!.waves ?? d.waves.length;
      for (let i = 0; i < d.waves.length; i++) {
        if (i < upto) expect(count(now, i), `${d.id} 第 ${i + 1} 波`).toBeLessThan(count(before, i));
        else expect(now.waves[i]).toEqual(before.waves[i]);
      }
    }
  });

  it('照建议的新手：同种子重放逐位一样', () => {
    const s = tdGrowthSetup('td01', 'suggest', 7);
    if (!s.ok) throw new Error(s.error);
    expect(runTdBot(s.value, 'guided').result).toEqual(runTdBot(s.value, 'guided').result);
  });
});
