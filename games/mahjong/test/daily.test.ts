/** 每日挑战（game/daily.ts）：种子由日期定、第一场算成绩、连续天数、坏数据当空 */
import { describe, expect, test } from 'vitest';
import { DAILY_RC_LENGTH, DAILY_ROUNDS, dailyBoard, dailyKey, markSent, toSubmit, emptyAll, emptyDaily, lastDays, parseAll, parseDaily, recordDaily, streakOf } from '../src/game/daily.ts';
import { DEFAULT_OPTS } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { DEFAULT_OPTS as RC_OPTS } from '../src/core/variants/riichi/index.ts';
import { dailyCardOf } from '../src/view/share.ts';
import { newSolo } from '../src/solo.ts';

const play = (d: string): ReturnType<typeof newSolo> => newSolo('fun', { ...DEFAULT_OPTS, rounds: DAILY_ROUNDS }, '我', null, 1000, 'normal', 'sichuan-xuezhan', d);

describe('种子', () => {
  test('同一天相同、不同天不同', () => {
    expect(dailyKey('2026-10-27')).toEqual(dailyKey('2026-10-27'));
    expect(dailyKey('2026-10-27')).not.toEqual(dailyKey('2026-10-28'));
    expect(dailyKey('2026-10-27')).toHaveLength(8);
  });
  test('同一天开的两场牌和电脑完全相同，存档带日期；普通单机没有', () => {
    const a = play('2026-10-27');
    const b = play('2026-10-27');
    expect(a.daily).toBe('2026-10-27');
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.names).toEqual(b.names);
    expect(JSON.stringify(play('2026-10-28').state)).not.toBe(JSON.stringify(a.state));
    expect(newSolo('fun', DEFAULT_OPTS, '我', null, 1000).daily).toBeUndefined();
  });
});

describe('成绩', () => {
  test('第一场算成绩，之后不覆盖；同一场重复记仍算成绩', () => {
    const a = recordDaily(emptyDaily(), '2026-10-27', 30, 'g1');
    expect(a.first).toBe(true);
    const b = recordDaily(a.data, '2026-10-27', 90, 'g2');
    expect(b.first).toBe(false);
    expect(b.data.days['2026-10-27']!.net).toBe(30);
    expect(b.data.best).toBe(30);
    expect(recordDaily(a.data, '2026-10-27', 30, 'g1').first).toBe(true);
  });
  test('最好成绩跨天取最大，负分也记', () => {
    let d = recordDaily(emptyDaily(), '2026-10-01', -40, 'a').data;
    expect(d.best).toBe(-40);
    d = recordDaily(d, '2026-10-02', 20, 'b').data;
    d = recordDaily(d, '2026-10-03', 5, 'c').data;
    expect(d.best).toBe(20);
  });
  test('只留最近 7 天', () => {
    let d = emptyDaily();
    for (let i = 1; i <= 9; i++) d = recordDaily(d, `2026-10-0${i}`, i, `g${i}`).data;
    expect(Object.keys(d.days)).toHaveLength(7);
    expect(d.days['2026-10-01']).toBeUndefined();
    expect(lastDays(d, '2026-10-09').map((x) => x.net)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('连续天数', () => {
  const run = (dates: string[]): ReturnType<typeof emptyDaily> => dates.reduce((d, x, i) => recordDaily(d, x, 1, `g${i}`).data, emptyDaily());
  test('跨月、跨年也连上', () => {
    expect(streakOf(run(['2026-01-30', '2026-01-31', '2026-02-01']), '2026-02-01')).toBe(3);
    expect(streakOf(run(['2026-12-31', '2027-01-01']), '2027-01-01')).toBe(2);
  });
  test('断档重来；今天还没打时昨天的连续还算，再早就断了', () => {
    const d = run(['2026-10-01', '2026-10-02', '2026-10-05']);
    expect(d.run).toBe(1);
    expect(streakOf(d, '2026-10-05')).toBe(1);
    const e = run(['2026-10-01', '2026-10-02']);
    expect(streakOf(e, '2026-10-03')).toBe(2);
    expect(streakOf(e, '2026-10-04')).toBe(0);
  });
  test('过了零点补记旧日期不倒着改连续天数', () => {
    let d = run(['2026-10-01']);
    d = recordDaily(d, '2026-10-02', 3, 'x').data;
    d = recordDaily(d, '2026-10-03', 3, 'y').data;
    expect(d.run).toBe(3);
  });
});

describe('坏数据', () => {
  test.each([null, undefined, '', 'x{', '[]', '{"days":5}', 42, '{"days":{"bad":{"net":1,"id":"a"}},"best":"x","run":9}'])('%s 当空', (raw) => {
    const d = parseDaily(raw as string);
    expect(d).toEqual(emptyDaily());
  });
  test('好数据读得回来，坏的条目丢掉', () => {
    const d = recordDaily(emptyDaily(), '2026-10-27', 12, 'a').data;
    expect(parseDaily(JSON.stringify(d))).toEqual(d);
    expect(parseDaily({ ...d, days: { ...d.days, 'zz': { net: 1, id: 'q' } } })).toEqual(d);
  });
});

const playRc = (d: string): ReturnType<typeof newSolo> => newSolo('fun', { ...RC_OPTS, length: DAILY_RC_LENGTH }, '我', null, 1000, 'normal', 'riichi', d);

describe('两种玩法', () => {
  test('同一天两种玩法种子不同；川麻的种子和以前一样', () => {
    expect(dailyKey('2026-10-27', 'riichi')).not.toEqual(dailyKey('2026-10-27', 'sichuan-xuezhan'));
    expect(dailyKey('2026-10-27')).toEqual(dailyKey('2026-10-27', 'sichuan-xuezhan'));
    expect(dailyKey('2026-10-27', 'riichi')).toEqual(dailyKey('2026-10-27', 'riichi'));
  });
  test('立直每日局：同一天开两次开局牌和电脑一致，存档带日期和玩法，东风战', () => {
    const a = playRc('2026-10-27');
    const b = playRc('2026-10-27');
    expect(a.daily).toBe('2026-10-27');
    expect(a.state.variant).toBe('riichi');
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.names).toEqual(b.names);
    expect(JSON.stringify(playRc('2026-10-28').state)).not.toBe(JSON.stringify(a.state));
    expect(JSON.stringify(playRc('2026-10-27').state)).not.toBe(JSON.stringify(play('2026-10-27').state));
    expect((a.state.opts as { length: string }).length).toBe('tonpuu');
  });
  test('各记各的成绩、最好、连续，互不覆盖', () => {
    const all = emptyAll();
    all['sichuan-xuezhan'] = recordDaily(all['sichuan-xuezhan'], '2026-10-27', 30, 'x1').data;
    all.riichi = recordDaily(all.riichi, '2026-10-27', -12, 'r1').data;
    const back = parseAll(JSON.stringify(all));
    expect(back['sichuan-xuezhan'].days['2026-10-27']!.net).toBe(30);
    expect(back.riichi.days['2026-10-27']!.net).toBe(-12);
    expect(back.riichi.best).toBe(-12);
    expect(back['sichuan-xuezhan'].best).toBe(30);
  });
  test('老数据（只有川麻那种结构）读成川麻，立直为空；坏数据全空', () => {
    const old = recordDaily(emptyDaily(), '2026-10-27', 12, 'a').data;
    const all = parseAll(JSON.stringify(old));
    expect(all['sichuan-xuezhan']).toEqual(old);
    expect(all.riichi).toEqual(emptyDaily());
    expect(parseAll('x{')).toEqual(emptyAll());
    expect(parseAll(null)).toEqual(emptyAll());
  });
});

describe('每日分享卡', () => {
  const at = (date: string, ...played: [string, number][]) => {
    let d = emptyDaily();
    for (const [x, n] of played) d = recordDaily(d, x, n, `g${x}`).data;
    return dailyCardOf('sichuan-xuezhan', d, date, played.at(-1)![1], true);
  };
  test('成绩局：大字是成绩，带最好、连续、7 天格子，没有牌和名字', () => {
    const c = at('2026-10-27', ['2026-10-25', 10], ['2026-10-26', -5], ['2026-10-27', 30]);
    expect(c.title).toBe('每日挑战 · 2026-10-27');
    expect(c.big.value).toBe('+30');
    expect(c.stats).toEqual([
      { label: '最好', value: '+30' },
      { label: '连续', value: '3 天' },
      { label: '近 7 天', value: '○○○○●●●' },
    ]);
    expect(c.player).toBeUndefined();
  });
  test('练习局写"练习"，立直写东风战', () => {
    const d = recordDaily(emptyDaily(), '2026-10-27', 8, 'a').data;
    const c = dailyCardOf('riichi', d, '2026-10-27', 99, false);
    expect(c.big.value).toBe('练习');
    expect(c.big.label).toContain('东风战');
  });
  test('断了的连续写 0 天', () => {
    const c = at('2026-10-30', ['2026-10-27', 5]);
    expect(c.stats![1]!.value).toBe('0 天');
  });
});

describe('每日榜', () => {
  test('子榜名按日期和玩法：川麻 xz、立直 rc', () => {
    expect(dailyBoard('2026-10-31', 'sichuan-xuezhan')).toBe('daily-2026-10-31-xz');
    expect(dailyBoard('2026-10-31', 'riichi')).toBe('daily-2026-10-31-rc');
  });

  test('只交当天第一场；交上以后不再交，练习、重画都不改', () => {
    let d = recordDaily(emptyDaily(), '2026-10-31', -120.4, 'a').data;
    expect(toSubmit(d, '2026-10-31')).toBe(-120);
    expect(toSubmit(d, '2026-10-30')).toBeNull();
    d = markSent(d, '2026-10-31');
    expect(toSubmit(d, '2026-10-31')).toBeNull();
    // 同一场结算重画、再打一场练习：记账不变，sent 还在
    expect(recordDaily(d, '2026-10-31', -120.4, 'a').data).toBe(d);
    expect(recordDaily(d, '2026-10-31', 300, 'b')).toEqual({ data: d, first: false });
    // 存下再读回来 sent 还在；坏的 sent 当没交
    expect(parseDaily(JSON.stringify(d)).days['2026-10-31']).toEqual({ net: -120.4, id: 'a', sent: true });
    expect(parseDaily({ ...d, days: { '2026-10-31': { net: 1, id: 'a', sent: 'yes' } } }).days['2026-10-31']).toEqual({ net: 1, id: 'a' });
  });
});
