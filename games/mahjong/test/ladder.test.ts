import { describe, expect, it } from 'vitest';
import { bindSolo, cloudPart, emptyLadder, endTable, levelOf, mergeLadder, parseLadder, quitRun, RETRIES, sameCloud, startRun, tableKey, TABLES, type LadderData } from '../src/game/ladder.ts';

const KEY = [1, 2, 3, 4, 5, 6, 7, 8];

describe('茶馆擂台', () => {
  it('三桌难度从新手到高手', () => {
    let d = startRun(emptyLadder(), 'xz', KEY);
    const levels = [];
    for (let t = 0; t < TABLES; t++) {
      levels.push(levelOf(d.run!));
      d = endTable(d, 0).d;
    }
    expect(levels).toEqual(['easy', 'normal', 'hard']);
  });

  it('每桌的牌：同一桌同一副，桌号、重打换一副', () => {
    const run = startRun(emptyLadder(), 'xz', KEY).run!;
    expect(tableKey(run)).toEqual(tableKey({ ...run }));
    expect(tableKey(run)).toHaveLength(8);
    expect(tableKey({ ...run, table: 1 })).not.toEqual(tableKey(run));
    expect(tableKey({ ...run, retried: 1 })).not.toEqual(tableKey(run));
    expect(tableKey({ ...run, key: [9, 2, 3, 4, 5, 6, 7, 8] })).not.toEqual(tableKey(run));
  });

  it('净分 ≥ 0 算赢：三桌全赢拿称号、记最远，这一轮结束', () => {
    let d = startRun(emptyLadder(), 'xl', KEY);
    expect(endTable(d, 0).outcome).toBe('next');
    d = endTable(d, 0).d;
    d = endTable(d, 12).d;
    const last = endTable(d, 3);
    expect(last.outcome).toBe('clear');
    expect(last.d.run).toBeUndefined();
    expect(last.d.titles).toEqual(['xl']);
    expect(last.d.best).toEqual({ xl: 3 });
    // 再打通一次不重复给；称号按玩法顺序排
    let again = startRun(last.d, 'xz', KEY);
    for (let t = 0; t < TABLES; t++) again = endTable(again, 1).d;
    expect(again.titles).toEqual(['xz', 'xl']);
  });

  it('输了：重打次数用完这一轮结束，最远只记赢过的', () => {
    let d = startRun(emptyLadder(), 'rc', KEY);
    d = endTable(d, 5).d;
    for (let r = 0; r < RETRIES; r++) {
      const o = endTable(d, -1);
      expect(o.outcome).toBe('retry');
      expect(o.d.run).toMatchObject({ table: 1, retried: r + 1 });
      d = o.d;
    }
    const out = endTable(d, -1);
    expect(out.outcome).toBe('out');
    expect(out.d.run).toBeUndefined();
    expect(out.d.best).toEqual({ rc: 1 });
    expect(out.d.titles).toEqual([]);
  });

  it('最远不倒退；放弃清掉这一轮', () => {
    let d: LadderData = { ...emptyLadder(), best: { xz: 2 } };
    d = startRun(d, 'xz', KEY);
    d = endTable(d, 0).d;
    expect(d.best.xz).toBe(2);
    expect(quitRun(d).run).toBeUndefined();
  });

  it('本机记录读回来一样，坏字段丢掉', () => {
    const d = bindSolo(endTable(startRun(emptyLadder(), 'xz', KEY), 0).d, 'abc');
    expect(parseLadder(JSON.stringify(d))).toEqual(d);
    expect(parseLadder('{bad')).toEqual(emptyLadder());
    expect(parseLadder({ v: 2 })).toEqual(emptyLadder());
    const bad = parseLadder({ v: 1, titles: ['xz', 'nope', 'rc', 'xz'], best: { xz: 9, xl: 2 }, run: { mode: 'xz', key: [1], table: 0, retried: 0 } });
    expect(bad).toEqual({ v: 1, titles: ['xz', 'rc'], best: { xl: 2 } });
  });
});

describe('擂台的云存档合并', () => {
  const a: LadderData = { v: 1, titles: ['rc'], best: { rc: 3, xz: 1 }, run: { mode: 'xz', key: KEY, table: 1, retried: 0, solo: 's1' } };
  const b = { v: 1, titles: ['xz', 'rc'], best: { xz: 3, xl: 2, rc: 1 } };

  it('称号取并集、最远取较大，没打完的一轮留本机的', () => {
    expect(mergeLadder(a, b)).toEqual({ v: 1, titles: ['xz', 'rc'], best: { xz: 3, xl: 2, rc: 3 }, run: a.run });
  });

  it('交换、重复合并结果一样；坏的云端数据当空', () => {
    const ab = mergeLadder(a, b);
    expect(sameCloud(mergeLadder(parseLadder(b), a), ab)).toBe(true);
    expect(mergeLadder(ab, b)).toEqual(ab);
    expect(mergeLadder(a, '{bad')).toEqual(a);
    expect(mergeLadder(a, { v: 1, titles: ['hack'], best: { xz: 99 } })).toEqual(a);
  });

  it('上云的部分不带没打完的一轮', () => {
    expect(cloudPart(a)).toEqual({ v: 1, titles: ['rc'], best: { rc: 3, xz: 1 } });
    expect(sameCloud(a, { ...a, run: undefined })).toBe(true);
  });
});
