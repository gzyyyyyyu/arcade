import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/index.ts';
import { grantWeapon } from '../../src/core/debug.ts';
import { mergeHint } from '../../src/view/ui/mergeHint.ts';
import { buildRows } from '../../src/app/buildRows.ts';

/** 一步合的规则（62）：规则 63 的两段式另见文件末尾 */
function world(rules = 62) {
  const w = createWorld({ seed: 3, mode: 'vigil', danger: 0 }, rules);
  w.weapons.length = 0;
  w.wstats.length = 0;
  return w;
}

describe('选卡合成提示', () => {
  it('两件都差不多了，拿到最后一样就"凑成"', () => {
    const w = world();
    grantWeapon(w, 'sword', 8);
    w.passives.zhusha = 1;
    grantWeapon(w, 'flysword', 8);
    w.passives.caoxie = 1;
    // 手上都齐了，只差飞剑还没进化：此时拿到的卡不再补缺口，没有提示
    expect(mergeHint(w, { kind: 'weapon', id: 'flysword' })).toBeNull();
    // 飞剑没满级、差最后一级：这张补上，凑成
    w.weapons.find((o) => o.id === 'flysword')!.level = 7;
    const h = mergeHint(w, { kind: 'weapon', id: 'flysword' });
    expect(h?.ready).toBe(true);
    expect(h?.text).toBe('凑成 诛邪剑阵！');
    expect(h?.dual).toBe(false);
  });

  it('双修只要另一件满级（1.1）：差一级时那件法器卡写"凑成"，被动卡没有', () => {
    const w = world();
    grantWeapon(w, 'flysword', 8, true);
    grantWeapon(w, 'talisman', 7);
    const h = mergeHint(w, { kind: 'weapon', id: 'talisman' });
    expect(h?.ready).toBe(true);
    expect(h?.id).toBe('fujian');
    expect(h?.dual).toBe(true);
    expect(mergeHint(w, { kind: 'passive', id: 'xianglu' })).toBeNull();
  });

  it('新法器：partner 在手，拿了只差一步就提示', () => {
    const w = world();
    grantWeapon(w, 'petals', 8, true);
    grantWeapon(w, 'bell', 7);
    w.passives.xiantao = 1;
    const h = mergeHint(w, { kind: 'weapon', id: 'bell' });
    expect(h?.id).toBe('linghua');
    expect(h?.ready).toBe(true);
  });

  it('已合成的、离得远的、铜钱卡都没有提示', () => {
    const w = world();
    grantWeapon(w, 'sword', 1);
    expect(mergeHint(w, { kind: 'weapon', id: 'sword' })).toBeNull();
    expect(mergeHint(w, { kind: 'coins', id: 'coins' })).toBeNull();
    w.merges.push('fujian');
    grantWeapon(w, 'flysword', 8, true);
    grantWeapon(w, 'talisman', 7);
    expect(mergeHint(w, { kind: 'weapon', id: 'talisman' })?.id).not.toBe('fujian');
  });

  it('规则 63：没合的提示合初成（两件到 5 级），初成的提示升大成', () => {
    const w = world(63);
    grantWeapon(w, 'sword', 5);
    grantWeapon(w, 'flysword', 4);
    const h = mergeHint(w, { kind: 'weapon', id: 'flysword' });
    expect(h?.text).toBe('凑成 诛邪剑阵·初成！');
    expect(h?.stage).toBe('half');
    // 合了初成以后：两件都进化才升大成（合成），差最后一样时提示升大成
    w.merges.push('zhuxie');
    w.mergeHalf.push('zhuxie');
    grantWeapon(w, 'sword', 8, true);
    grantWeapon(w, 'flysword', 7);
    w.passives.caoxie = 1;
    const up = mergeHint(w, { kind: 'weapon', id: 'flysword' });
    expect(up?.stage).toBe('full');
    expect(up?.text).toContain('诛邪剑阵');
    expect(up?.text).toContain('大成');
  });

  it('规则 63：暂停页的法器行标初成，写「再把 X、Y 练满升大成」', () => {
    const w = world(63);
    grantWeapon(w, 'sword', 5);
    grantWeapon(w, 'flysword', 6);
    w.merges.push('zhuxie');
    w.mergeHalf.push('zhuxie');
    // 被动都有了，只差两件练满
    w.passives.zhusha = 1;
    w.passives.caoxie = 1;
    const row = buildRows(w)[0]!;
    expect(row.name).toBe('诛邪剑阵·初成');
    expect(row.half).toBe(true);
    expect(row.hint).toBe('再把 桃木剑、飞剑 练满升大成');
    // 升了大成：不再标初成
    w.mergeHalf.length = 0;
    expect(buildRows(w)[0]!.half).toBeUndefined();
  });
});
