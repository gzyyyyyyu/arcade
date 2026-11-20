import { describe, expect, it } from 'vitest';
import { buildLevel, TD2_LEVEL_DEFS } from '../src/content/tdmaps.ts';
import { RULES_SINCE, levelForRules, runTdBot, tdGrowthSetup } from '../src/core/index.ts';
import type { TdLevel } from '../src/core/index.ts';
import { readGolden } from './td-golden-lib.ts';

// 规则 24：战役几关前几波放宽（关卡的 ease）。旧版本的局、没写 ease 的关、悬赏守岛 / 大潮 / 海盗来袭都不变

/** 只比波次内容：组上的 since / until 是新旧并排的记号，按版本挑完后不影响这一局 */
const plain = (lv: TdLevel): unknown => lv.waves.map((w) => ({ ...w, groups: w.groups.map(({ since: _s, until: _u, ...g }) => g) }));
const count = (lv: TdLevel, i: number): number => lv.waves[i]!.groups.reduce((a, g) => a + g.n, 0);
const eased = TD2_LEVEL_DEFS.filter((d) => d.ease);

describe('关卡放宽（规则 24）', () => {
  it('有几关写了 ease，都只在前三章', () => {
    expect(eased.length).toBeGreaterThan(0);
    for (const d of eased) expect(d.chapter).toBeLessThanOrEqual(3);
  });

  it('旧版本的局：写了 ease 的关和没写时逐组一样、开局金一样', () => {
    for (const d of eased) {
      const now = buildLevel(d);
      const before = buildLevel({ ...d, ease: undefined });
      for (const rules of [RULES_SINCE.tdEase - 1, 16, 9]) {
        expect(plain(levelForRules(now, rules))).toEqual(plain(levelForRules(before, rules)));
        expect(levelForRules(now, rules).gold).toBe(d.gold);
      }
    }
  });

  it('规则 24 起：开局金多给 ease.gold', () => {
    for (const d of eased) expect(levelForRules(buildLevel(d), RULES_SINCE.tdEase).gold).toBe(d.gold + (d.ease!.gold ?? 0));
  });

  it('规则 24 起：前 waves 波人数变少，之后的波不变', () => {
    for (const d of eased.filter((x) => x.ease!.pct)) {
      const now = levelForRules(buildLevel(d), RULES_SINCE.tdEase);
      const before = levelForRules(buildLevel({ ...d, ease: undefined }), RULES_SINCE.tdEase);
      const upto = d.ease!.waves ?? d.waves.length;
      for (let i = 0; i < d.waves.length; i++) {
        if (i < upto) expect(count(now, i), `${d.id} 第 ${i + 1} 波`).toBeLessThan(count(before, i));
        else expect(plain({ ...now, waves: [now.waves[i]!] })).toEqual(plain({ ...before, waves: [before.waves[i]!] }));
      }
    }
  });

  it('指纹锁：没写 ease 的关、悬赏守岛、大潮、海盗来袭的 v24- 和 v23- 逐个相同', () => {
    const g = readGolden();
    const easedIds = new Set(eased.map((d) => d.id));
    let same = 0;
    for (const [k, v] of Object.entries(g)) {
      if (!k.startsWith('v24-') || k.includes('-guided-')) continue;
      const rest = k.slice(4);
      const id = /(?:^|nav-)(td\d\d)-/.exec(rest)?.[1];
      if (id && easedIds.has(id)) continue;
      expect(g[`v23-${rest}`], k).toBe(v);
      same++;
    }
    expect(same).toBeGreaterThan(100);
  });

  it('照建议的新手：同种子重放逐位一样', () => {
    const s = tdGrowthSetup('td01', 'suggest', 7);
    if (!s.ok) throw new Error(s.error);
    expect(runTdBot(s.value, 'guided').result).toEqual(runTdBot(s.value, 'guided').result);
  });
});
