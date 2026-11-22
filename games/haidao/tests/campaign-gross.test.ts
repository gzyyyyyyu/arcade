import { describe, expect, it } from 'vitest';
import { CAMPAIGN, campaignGross, newProfile, settleCampaign } from '../src/core/index.ts';
import type { Profile } from '../src/core/index.ts';

/** 结算的毛收入 = 进了仓库的 + 仓库满了截掉的 − 掉落（掉落是随机的，岛面板不算） */
function grossOf(p: Profile, levelId: string, stars: number, destroyedPct: number): { gold: number; wood: number } {
  const out = settleCampaign(p, levelId, { stars, destroyedPct } as Parameters<typeof settleCampaign>[2]);
  let gold = out.loot.gold + out.cut.gold;
  let wood = out.loot.wood + out.cut.wood;
  for (const d of out.drops) {
    if (d.kind === 'gold') gold -= d.amount;
    else if (d.kind === 'wood') wood -= d.amount;
  }
  return { gold, wood };
}

function withState(levelId: string, streak: number, prevStars: number): Profile {
  const p = newProfile();
  return { ...p, stars: prevStars > 0 ? { ...p.stars, [levelId]: prevStars } : p.stars, stats: { ...p.stats, streak } };
}

describe('岛面板的预计掠夺 = 结算的毛收入（campaignGross）', () => {
  it('前 6 关 × 连胜 0 / 2 / 9 × 没打过 / 已三星：打满（三星 100%）时两边一样', () => {
    for (const lv of CAMPAIGN.slice(0, 6)) {
      for (const streak of [0, 2, 9]) {
        for (const prev of [0, 3]) {
          const p = withState(lv.id, streak, prev);
          expect(campaignGross(p, lv.id, { stars: 3, destroyedPct: 100 }), `${lv.id} 连胜 ${streak} 原有 ${prev} 星`).toEqual(grossOf(p, lv.id, 3, 100));
        }
      }
    }
  });

  it('没打满、打输也一样（结算就是用它算的）', () => {
    const id = CAMPAIGN[2]!.id;
    for (const [stars, pct] of [[1, 55], [2, 80], [0, 30]] as const) {
      const p = withState(id, 2, 0);
      expect(campaignGross(p, id, { stars, destroyedPct: pct })).toEqual(grossOf(p, id, stars, pct));
    }
  });

  it('连胜加成和新星奖励都算进去：比关卡底数多', () => {
    const lv = CAMPAIGN[2]!;
    const g = campaignGross(withState(lv.id, 2, 0), lv.id, { stars: 3, destroyedPct: 100 });
    expect(g.gold).toBeGreaterThan(lv.loot.gold);
    expect(g.wood).toBeGreaterThanOrEqual(lv.loot.wood);
  });
});
