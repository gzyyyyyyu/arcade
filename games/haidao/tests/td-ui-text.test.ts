import { describe, expect, it } from 'vitest';
import { COUNTER, TD2_LOSE_AT, TD2_STAR_LOST, TD_ARMORS, TD_TOWER_DAMAGE, TD_TOWER_KINDS, counterKind, createTd, freeSlotPick, stepTd, tdGrowthSetup, tdPreview, tdUpCost } from '../src/core/index.ts';
import {
  ARMOR_NAME, DAMAGE_NAME, armorOrder, branchDamageHint, callBonusText, campaignChapters, garrisonLine, garrisonShort, cardLine, chapterLines, laneName, levelIntro, pctText, pctTier, spotSide, starRule, nextStep, nextStepText, stepLine, openerLeft, tdVerdict, towerCounter,
} from '../src/view/td-ui.ts';
import { TD2_COST } from '../src/content/td2units.ts';

const td11 = () => {
  const r = tdGrowthSetup('td11', 'suggest', 1);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

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
    expect(pctText(150)).toBe('多打一半');
    expect(pctText(100)).toBe('照常');
    expect(pctText(50)).toBe('只打一半');
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
  it('预告卡的下一步：有空木台写照建议的新手挑的那座（counterKind），钱不够写差多少；护甲按占比从多到少', () => {
    const st = createTd(td11());
    const pv = tdPreview(st, 2);
    const h = nextStep(undefined, st, pv);
    expect(h.step).toEqual({ kind: counterKind(st, pv), up: false, slot: freeSlotPick(st, pv), cost: TD2_COST[counterKind(st, pv)] });
    // td11 第一波全是布衣：以前卡上写「火」，现在挑的不是喷火塔
    expect(h.step!.kind).not.toBe('flame');
    expect(nextStepText({ kind: 'mortar', up: false, slot: 0, cost: 120 })).toBe('下一座造：臼炮');
    expect(stepLine({ kind: 'mortar', up: false, slot: 0, cost: 120 }, 80)).toEqual({ lead: '下一座造', short: '差 40' });
    expect(stepLine({ kind: 'mortar', up: false, slot: 0, cost: 120 }, 120)).toEqual({ lead: '下一座造', short: '' });
    // 升级钱不够时开头缩成「升级」，卡上这一格不至于挤成单独一行
    expect(stepLine({ kind: 'gunTower', up: true, slot: 3, cost: 72 }, 7)).toEqual({ lead: '升级', short: '差 65' });
    expect(stepLine({ kind: 'gunTower', up: true, slot: 3, cost: 72 }, 72)).toEqual({ lead: '钱够就升级', short: '' });
    expect(armorOrder({ cloth: 30, heavy: 60, wood: 0, air: 10 })).toEqual(['heavy', 'cloth', 'air']);
  });
  it('下一步定住：翻波、换了预告也不换；造了塔才重挑', () => {
    const st = createTd(td11());
    const h = nextStep(undefined, st, tdPreview(st, 2));
    // 预告换成后面几波（护甲、飞的都不一样）：木台上的塔没变，卡上照旧
    const later = { ...st, wave: 6 };
    expect(nextStep(h, later, tdPreview(later, 2))).toBe(h);
    st.gold = 9999;
    stepTd(st, [{ t: st.tick, type: 'build', slot: 0, kind: h.step!.kind }]);
    const h2 = nextStep(h, st, tdPreview(st, 2));
    expect(h2).not.toBe(h);
    expect(h2.key).not.toBe(h.key);
  });
  it('钱够两步：第二步就是照第一步造完以后卡上会给的那一步', () => {
    const st = createTd(td11());
    const h = nextStep(undefined, st, tdPreview(st, 2));
    expect(h.after?.up).toBe(false);
    expect(h.after?.slot).not.toBe(h.step!.slot);
    st.gold = 9999;
    stepTd(st, [{ t: st.tick, type: 'build', slot: h.step!.slot, kind: h.step!.kind }]);
    expect(nextStep(h, st, tdPreview(st, 2)).step).toEqual(h.after);
  });
  it('木台造满：写「钱够就升级」升阶最便宜的那座（并列取序号小的）；升满了不写', () => {
    const st = createTd(td11());
    st.gold = 99999;
    const free = st.slots.flatMap((sl, i) => (sl.tower < 0 && sl.wreck === undefined ? [i] : []));
    stepTd(st, free.map((slot, i) => ({ t: st.tick, type: 'build' as const, slot, kind: i === 1 ? ('mortar' as const) : ('gunTower' as const) })));
    const pv = tdPreview(st, 2);
    // 火枪塔升阶比臼炮便宜：挑序号最小的那座火枪塔
    const h = nextStep(undefined, st, pv);
    expect(h.step).toEqual({ kind: 'gunTower', up: true, slot: free[0], cost: tdUpCost('gunTower', 0) });
    expect(nextStepText(h.step!)).toBe('钱够就升级：火枪塔');
    // 第二步换一座（同一座连升两阶卡上看不懂）：下一座最便宜的火枪塔
    expect(h.after).toEqual({ kind: 'gunTower', up: true, slot: free[2], cost: tdUpCost('gunTower', 0) });
    // 火枪塔都升到 3 阶了：轮到臼炮
    for (const tw of st.towers) if (tw.kind === 'gunTower') tw.tier = 3;
    expect(nextStep(h, st, pv).step).toEqual({ kind: 'mortar', up: true, slot: free[1], cost: tdUpCost('mortar', 0) });
    for (const tw of st.towers) tw.tier = 3;
    expect(nextStep(undefined, st, pv).step).toBeNull();
  });
  it('开局造法只剩没造的那几座，造完或开打后不再给（卡上换成下一座）', () => {
    const r = tdGrowthSetup('td11', 'suggest', 1);
    if (!r.ok) throw new Error(r.error);
    const st = createTd(r.value);
    const op = st.level.opener!;
    expect(openerLeft(st)).toEqual(op);
    const built = (n: number) => ({ ...st, slots: st.slots.map((sl, i) => (op.slice(0, n).some((o) => o.slot === i) ? { ...sl, tower: 1 } : sl)) });
    expect(openerLeft(built(1))).toEqual(op.slice(1));
    expect(openerLeft(built(op.length))).toBeUndefined();
    expect(openerLeft({ ...st, wave: 1 })).toBeUndefined();
  });
});

describe('叫波按钮、驻守台', () => {
  it('叫波奖励：金币和冷却抵扣（拍换成秒，向下取整），都没有为空', () => {
    expect(callBonusText(40, 160)).toBe('+40 金 · 技能快 8 秒');
    expect(callBonusText(12, 10)).toBe('+12 金');
    expect(callBonusText(0, 0)).toBe('');
  });
  it('驻守的那一句：基地等级 → 驻守阶', () => {
    expect(garrisonLine({ kind: 'cannon', baseLevel: 7, tier: 3 })).toBe('你的加农炮 7 级 → 驻守 3 阶');
    expect(garrisonShort({ kind: 'gunTower', baseLevel: 6, tier: 2 })).toBe('基地 6 级→驻守 2 阶');
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

describe('主寨不够的红字一章只写一次', () => {
  const chapters = campaignChapters();
  const all = chapters.flatMap((c) => c.levels);
  const ch = chapters[1]!.levels;
  const i0 = all.indexOf(ch[0]!);
  const lo = Math.min(...ch.map((l) => l.hq));
  const hi = Math.max(...ch.map((l) => l.hq));
  it('整章都不够：章节下一句写区间，卡片改写新东西或建议主寨，不再有红字', () => {
    const r = chapterLines(ch, all, i0, () => false, 1, (id) => (id === ch[0]!.id ? 2 : 0));
    expect(r.warn).toBe(`这一章建议主寨 ${lo === hi ? lo : `${lo}–${hi}`} 级（你 1 级，会偏难）`);
    expect(r.lines.some(([c]) => c === 'hd-short')).toBe(false);
    expect(r.lines[0]).toEqual(['', `建议主寨 ${ch[0]!.hq} 级`]);
    expect(r.lines[1]![1]).toBe(levelIntro(all, i0 + 1) || `建议主寨 ${ch[1]!.hq} 级`);
  });
  it('锁着的照写解锁条件；只有一张不够时不提上去', () => {
    const r = chapterLines(ch, all, i0, (i) => i > i0, 1, () => 0);
    expect(r.warn).toBe('');
    expect(r.lines[0]![0]).toBe('hd-short');
    expect(r.lines[1]![0]).toBe('hd-tdlock');
  });
  it('主寨够了就和逐张 cardLine 一样', () => {
    const r = chapterLines(ch, all, i0, () => false, 99, () => 0);
    expect(r.warn).toBe('');
    expect(r.lines).toEqual(ch.map((l, j) => cardLine(l, all, i0 + j, false, 99, 0)));
  });
});
