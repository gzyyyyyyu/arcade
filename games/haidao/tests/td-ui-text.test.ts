import { describe, expect, it } from 'vitest';
import { COUNTER, TD2_LOSE_AT, TD2_STAR_LOST, TD_ARMORS, TD_TOWER_DAMAGE, TD_TOWER_KINDS } from '../src/core/index.ts';
import {
  ARMOR_NAME, DAMAGE_NAME, armorOrder, branchDamageHint, callBonusText, campaignChapters, cardLine, fitSuggest, laneName, pctText, pctTier, spotSide, starRule, suggestText, tdVerdict, towerCounter,
} from '../src/view/td-ui.ts';

describe('守岛结算文案和路名', () => {
  it('按星数分档，1 星写丢了几枚', () => {
    expect(tdVerdict(3, 0)).toBe('完美守住！');
    expect(tdVerdict(2, 3)).toBe('守住了！');
    expect(tdVerdict(1, 7)).toBe('勉强守住（丢了 7 枚）');
    expect(tdVerdict(0, 11)).toBe('没守住（丢了 11 枚）');
  });
  it('登陆路按岛外的方向叫名字', () => {
    expect(laneName({ x: 10, y: -2 })).toBe('北路');
    expect(laneName({ x: -2, y: 11 })).toBe('西路');
    expect(laneName({ x: 11, y: 23 })).toBe('南路');
    expect(laneName({ x: 23, y: 10 })).toBe('东路');
  });
  it('星数区间的文案读规则表的数', () => {
    const t = starRule();
    expect(t).toContain(`≤ ${TD2_STAR_LOST[0]} 枚 2 星`);
    expect(t).toContain(`≤ ${TD2_STAR_LOST[1]} 枚 1 星`);
    expect(t).toContain(`${TD2_LOSE_AT} 枚算输`);
  });
});

describe('克制表的显示（只读 COUNTER，不另算）', () => {
  it('倍率写法和分档', () => {
    expect(pctText(150)).toBe('×1.5');
    expect(pctText(100)).toBe('×1');
    expect(pctText(50)).toBe('×0.5');
    expect(pctText(0)).toBe('打不到');
    expect([pctTier(150), pctTier(100), pctTier(50), pctTier(0)]).toEqual(['good', 'even', 'weak', 'none']);
  });
  it('每种塔的克 / 怕 / 打不到和克制表逐格一致', () => {
    for (const k of TD_TOWER_KINDS) {
      const c = towerCounter(k);
      const row = COUNTER[TD_TOWER_DAMAGE[k]];
      expect(c.dmg).toBe(TD_TOWER_DAMAGE[k]);
      for (const a of TD_ARMORS) {
        expect(c.good.includes(a)).toBe(row[a] > 100);
        expect(c.weak.includes(a)).toBe(row[a] > 0 && row[a] < 100);
        expect(c.none.includes(a)).toBe(row[a] === 0);
      }
    }
  });
  it('分叉卡只写克制表的两条例外', () => {
    expect(branchDamageHint('rocket.flak')).toContain(ARMOR_NAME.air);
    expect(branchDamageHint('mortar.fire')).toContain(DAMAGE_NAME.fire);
    expect(branchDamageHint('cannon.pierce')).toBeUndefined();
    expect(branchDamageHint('harpoon.drag')).toBeUndefined();
  });
  it('预告条：建议的伤害、护甲按占比从多到少', () => {
    expect(suggestText({ suggest: 'shell' })).toBe(`建议：${DAMAGE_NAME.shell}`);
    expect(suggestText({ suggest: null })).toBe('');
  });
  it('建议只从这局能造的塔里挑', () => {
    const share = Object.fromEntries(TD_ARMORS.map((a) => [a, 0])) as Record<(typeof TD_ARMORS)[number], number>;
    const pv = [{ wave: 0, lanes: [], armorShare: { ...share, cloth: 100 }, suggest: 'fire' as const, boss: false }] as unknown as Parameters<typeof fitSuggest>[0];
    // 只有加农炮和火枪塔：火不在可选里；全是布甲时炮、枪一样好，不建议
    expect(fitSuggest(pv, ['cannon', 'gunTower'])[0]!.suggest).toBeNull();
    // 铁甲多：炮克铁甲
    const hv = [{ ...pv[0]!, armorShare: { ...share, cloth: 30, heavy: 70 } }];
    expect(fitSuggest(hv, ['cannon', 'gunTower'])[0]!.suggest).toBe('shell');
    // 只有一种伤害可选：没得选就不建议
    expect(fitSuggest(pv, ['cannon', 'mortar'])[0]!.suggest).toBeNull();
    // 没有限制：原样
    expect(fitSuggest(pv, undefined)[0]!.suggest).toBe('fire');
    expect(armorOrder({ cloth: 30, heavy: 60, wood: 0, air: 10 })).toEqual(['heavy', 'cloth', 'air']);
  });
});

describe('叫波按钮、驻守台', () => {
  it('叫波奖励：金币和冷却抵扣（拍换成秒，向下取整），都没有为空', () => {
    expect(callBonusText(40, 160)).toBe('+40 金 · 技能快 8 秒');
    expect(callBonusText(12, 10)).toBe('+12 金');
    expect(callBonusText(0, 0)).toBe('');
  });
  it('驻守台在岛的哪一边', () => {
    expect(spotSide({ x: 12, y: 2 })).toBe('北边');
    expect(spotSide({ x: 10, y: 18 })).toBe('南边');
    expect(spotSide({ x: 1, y: 11 })).toBe('西边');
    expect(spotSide({ x: 19, y: 9 })).toBe('东边');
    expect(spotSide({ x: 10, y: 10 })).toBe('岛中间');
  });
});

describe('选关卡片只写一句', () => {
  const all = campaignChapters().flatMap((c) => c.levels);
  const lv = all[1]!;
  it('锁着写怎么解锁，主寨不够写差几级（优先于新东西）', () => {
    expect(cardLine(lv, all, 1, true, 9, 0)).toEqual(['hd-tdlock', `先守下「${all[0]!.name}」（≥1 星）`]);
    expect(cardLine(lv, all, 1, false, lv.hq - 1, 0)).toEqual(['hd-short', `建议主寨 ${lv.hq} 级（你 ${lv.hq - 1} 级，会偏难）`]);
  });
  it('没打过写这关的新东西，打过了写建议主寨', () => {
    const [cls, text] = cardLine(all[0]!, all, 0, false, 9, 0);
    expect(cls).toBe('hd-tdnew');
    expect(text.startsWith('新：')).toBe(true);
    expect(cardLine(lv, all, 1, false, 9, 2)).toEqual(['', `建议主寨 ${lv.hq} 级`]);
  });
});
