/**
 * 成就（src/game/achieve.ts）：代表成就的判定、进度计数、不重复解锁、坏数据兜底成空、一场里的计数。
 */
import { describe, expect, test } from 'vitest';
import { ACHIEVEMENTS, type AchCtx, achFor, achFromEvents, achKey, achProgress, emptyAch, parseAch } from '../src/game/achieve.ts';
import { emptyDex, type DexRecord } from '../src/game/dex.ts';
import type { RcEvent } from '../src/core/variants/riichi/index.ts';
import type { FanId, XzEvent } from '../src/core/variants/sichuan-xuezhan/index.ts';

const hu = (seat: number, from: number | null, fan: number, ...ids: FanId[]): XzEvent => ({ e: 'hu', seat, from, tile: 7, fan, items: ids.map((id) => ({ id, fan: 1 })), rob: false }) as unknown as XzEvent;
const win = (seat: number, from: number | null, extra: Record<string, unknown>, ...ids: string[]): RcEvent =>
  ({ e: 'win', seat, from, tile: 7, rob: false, score: { yaku: ids.map((id) => ({ id, han: 1 })), yakuman: 0, han: 1, ura: 0, limit: 'none', ...extra } }) as unknown as RcEvent;
const ctx: AchCtx = { first: null, dex: emptyDex() };
const run = (events: (XzEvent | RcEvent)[], seat = 0, rec = emptyAch(), c = ctx) => achFromEvents(rec, events, seat, c);

describe('成就判定', () => {
  test('第一次和牌 + 自摸；点炮和不算自摸', () => {
    expect(run([hu(0, null, 1, 'ping')]).fresh).toEqual(['first_win', 'first_zimo']);
    expect(run([hu(0, 2, 1, 'ping')]).fresh).toEqual(['first_win']);
  });

  test('只看自己；旁观不判', () => {
    expect(run([hu(1, null, 1, 'qing')]).fresh).toEqual([]);
    expect(achFromEvents(emptyAch(), [hu(0, null, 1)], null, ctx).fresh).toEqual([]);
  });

  test('两种玩法的同一个成就都认：清一色、七对、杠上开花、海底', () => {
    expect(run([hu(0, null, 4, 'qing', 'gangkai')]).fresh).toEqual(expect.arrayContaining(['flush', 'kan_win']));
    expect(run([win(0, 3, {}, 'chinitsu', 'chiitoi', 'houtei')]).fresh).toEqual(expect.arrayContaining(['flush', 'seven_pairs', 'last_tile']));
    expect(run([hu(0, 1, 2, 'longqidui', 'haidipao')]).fresh).toEqual(expect.arrayContaining(['seven_pairs', 'last_tile']));
  });

  test('立直专属：跳满、役满、一发、里宝牌；川麻 4 番以上才算大牌', () => {
    const f = run([win(0, null, { limit: 'haneman', yakuman: 1, ura: 2 }, 'ippatsu')]).fresh;
    expect(f).toEqual(expect.arrayContaining(['haneman', 'yakuman', 'ippatsu', 'ura']));
    expect(run([win(0, 1, { limit: 'mangan' }, 'tanyao')]).fresh).not.toContain('haneman');
    expect(run([hu(0, 1, 3, 'ping')]).fresh).not.toContain('big_fan');
    expect(run([hu(0, 1, 4, 'ping')]).fresh).toContain('big_fan');
  });

  test('一炮多响里的那一家；只有自己一家和不算', () => {
    expect(run([win(0, 3, {}, 'riichi'), win(1, 3, {}, 'riichi')]).fresh).toContain('multi_ron');
    expect(run([win(0, 3, {}, 'riichi')]).fresh).not.toContain('multi_ron');
    expect(run([win(1, 3, {}, 'riichi'), win(2, 3, {}, 'riichi')]).fresh).toEqual([]);
  });

  test('连庄：自己坐庄到第 3 本场；别人坐庄、只有 2 本场都不算', () => {
    const deal = (dealer: number, honba: number): RcEvent => ({ e: 'deal', wind: 0, hand: 1, honba, dealer }) as RcEvent;
    expect(run([deal(0, 3)]).fresh).toEqual(['dealer3']);
    expect(run([deal(0, 2)]).fresh).toEqual([]);
    expect(run([deal(1, 3)]).fresh).toEqual([]);
  });

  test('一场里和 3 把；新开一场、打完一场都清零', () => {
    let r = run([hu(0, 1, 1)]).rec;
    r = run([hu(0, 1, 1)], 0, r).rec;
    expect(achProgress(r, 'wins3', emptyDex())).toEqual({ n: 2, total: 3 });
    const third = run([hu(0, 1, 1)], 0, r);
    expect(third.fresh).toContain('wins3');
    // 新开一场（川麻 round 0）
    const reset = run([{ e: 'deal', round: 0, dealer: 0 } as XzEvent], 0, r);
    expect(reset.rec.wins).toBe(0);
    // 打完
    expect(run([{ e: 'over' } as XzEvent], 0, r).rec.wins).toBe(0);
  });

  test('打完场数：10、50 场解锁，第一名看 ctx', () => {
    const over = [{ e: 'over' } as XzEvent];
    const r = { ...emptyAch(), played: 9 };
    const a = run(over, 0, r, { first: true, dex: emptyDex() });
    expect(a.fresh).toEqual(['first_place', 'played10']);
    expect(a.rec.played).toBe(10);
    expect(run(over, 0, { ...emptyAch(), got: { played10: 1 }, played: 49 }, ctx).fresh).toEqual(['played50']);
    expect(run(over, 0, r, { first: false, dex: emptyDex() }).fresh).toEqual(['played10']);
  });

  test('图鉴收集：满 10 样、川麻集齐', () => {
    const dex: DexRecord = { xz: {}, rc: {} };
    for (const id of ['ping', 'qing', 'qidui', 'gen', 'haidi']) dex.xz[id] = 1;
    for (const id of ['riichi', 'tsumo', 'pinfu', 'tanyao', 'honitsu']) dex.rc[id] = 1;
    expect(run([hu(0, 1, 1)], 0, emptyAch(), { first: null, dex }).fresh).toContain('dex10');
    expect(run([hu(0, 1, 1)], 0, emptyAch(), { first: null, dex: emptyDex() }).fresh).not.toContain('dex10');
    expect(achProgress(emptyAch(), 'dex10', dex)).toEqual({ n: 10, total: 10 });
  });

  test('已解锁的不再报；没变化时原样返回同一个对象，不改传进来的', () => {
    const first = run([hu(0, null, 1)]);
    const again = run([hu(0, null, 1)], 0, first.rec);
    expect(again.fresh).toEqual([]);
    expect(run([{ e: 'discard', seat: 0, tile: 1 } as XzEvent], 0, first.rec).rec).toBe(first.rec);
    expect(emptyAch()).toEqual({ got: {}, played: 0, wins: 0 });
  });
});

describe('存储读出来的东西不可信', () => {
  test('坏数据当空；认不得的 id、不是正整数的计数丢掉', () => {
    for (const bad of [null, undefined, 3, 'x', [], { got: [] }]) expect(parseAch(bad)).toEqual(emptyAch());
    expect(parseAch({ got: { first_win: 1, nope: 1 }, played: 3.5, wins: -1 })).toEqual({ got: { first_win: 1 }, played: 0, wins: 0 });
    expect(parseAch({ got: { wins3: 1 }, played: 12, wins: 2 })).toEqual({ got: { wins3: 1 }, played: 12, wins: 2 });
  });
});

describe('成就表', () => {
  test('id 不重复、条数在 20 上下、两种玩法各有专属', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
    expect(achFor('xz').length).toBeLessThan(ACHIEVEMENTS.length);
    expect(achFor('rc').some((a) => a.id === 'yakuman')).toBe(true);
    expect(achFor('xz').some((a) => a.id === 'yakuman')).toBe(false);
  });
});

describe('刷新后不重复判（last）', () => {
  test('同一步标识相同，换一步、换一场不同；没事件不判', () => {
    const ev = [{ e: 'draw', seat: 0 }] as never[];
    const a = achKey('s1', { round: 2, wall: 40 }, ev);
    expect(achKey('s1', { round: 2, wall: 40 }, ev)).toBe(a);
    expect(achKey('s1', { round: 2, wall: 39 }, ev)).not.toBe(a);
    expect(achKey('s2', { round: 2, wall: 40 }, ev)).not.toBe(a);
    expect(achKey('s1', { wind: 0, hand: 1, honba: 0, wall: 40 }, ev)).not.toBe(a);
    expect(achKey('s1', { round: 2, wall: 40 }, [])).toBeNull();
  });
  test('last 读回来还在；老数据没有、坏的都忽略', () => {
    expect(parseAch({ got: {}, played: 1, wins: 0, last: 'k' }).last).toBe('k');
    expect(parseAch({ got: {}, played: 1, wins: 0 }).last).toBeUndefined();
    expect(parseAch({ got: {}, played: 1, wins: 0, last: 3 }).last).toBeUndefined();
  });
});
