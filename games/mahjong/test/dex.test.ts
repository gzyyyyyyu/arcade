/**
 * 番型 / 役种图鉴（src/game/dex.ts）：只记自己和出来的、次数累加、两种玩法分开、进度数对、坏数据兜底成空记录。
 */
import { describe, expect, test } from 'vitest';
import { RC_YAKU_DEX, RC_YAKUMAN_DEX, XZ_DEX, dexAddFresh, dexFromEvents, dexKey, dexMarkSeen, dexNewIds, dexToastText, dexProgress, emptyDex, parseDex } from '../src/game/dex.ts';
import { YAKU_NAME, type RcEvent } from '../src/core/variants/riichi/index.ts';
import type { FanId, XzEvent } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { FAN_TABLE } from '../src/view/text.ts';

const hu = (seat: number, ...ids: FanId[]): XzEvent => ({ e: 'hu', seat, from: null, tile: 0, fan: 1, items: ids.map((id) => ({ id, fan: 1 })), rob: false }) as unknown as XzEvent;
const win = (seat: number, ...ids: string[]): RcEvent => ({ e: 'win', seat, from: null, tile: 0, rob: false, score: { yaku: ids.map((id) => ({ id, han: 1 })) } }) as unknown as RcEvent;

describe('图鉴记录', () => {
  test('只记自己的；旁观（seat 为 null）不记', () => {
    const ev = [hu(1, 'qing'), hu(0, 'pengpeng', 'gen')];
    expect(dexFromEvents(emptyDex(), ev, 0).xz).toEqual({ pengpeng: 1, gen: 1 });
    expect(dexFromEvents(emptyDex(), ev, 2)).toEqual(emptyDex());
    expect(dexFromEvents(emptyDex(), ev, null)).toEqual(emptyDex());
  });

  test('重复累加，不改传进来的记录', () => {
    const r0 = emptyDex();
    const r1 = dexFromEvents(r0, [hu(0, 'ping')], 0);
    const r2 = dexFromEvents(r1, [hu(0, 'ping'), hu(0, 'qidui')], 0);
    expect(r2.xz).toEqual({ ping: 2, qidui: 1 });
    expect(r0).toEqual(emptyDex());
    expect(r1.xz).toEqual({ ping: 1 });
  });

  test('两种玩法分开记；立直的役牌、场风自风合成一行，河底并进海底', () => {
    const r = dexFromEvents(emptyDex(), [win(0, 'riichi', 'haku', 'chun', 'yakuhai_seat', 'houtei')], 0);
    expect(r.xz).toEqual({});
    expect(r.rc).toEqual({ riichi: 1, yakuhai: 1, haitei: 1 });
    expect(dexFromEvents(r, [hu(0, 'ping')], 0).rc).toEqual(r.rc);
  });
});

describe('图鉴进度', () => {
  test('总数和规则表对得上，进度只数列出来的', () => {
    expect(XZ_DEX).toEqual(FAN_TABLE.map((x) => x[0]));
    for (const id of [...RC_YAKU_DEX, ...RC_YAKUMAN_DEX]) if (id !== 'yakuhai') expect(YAKU_NAME).toHaveProperty(id);
    expect(dexProgress(emptyDex(), 'xz')).toEqual({ got: 0, total: XZ_DEX.length });
    expect(dexProgress(emptyDex(), 'rc').total).toBe(RC_YAKU_DEX.length + RC_YAKUMAN_DEX.length);
    // 自摸加番这类不在图鉴里的附加项记了也不算进度
    const r = dexFromEvents(emptyDex(), [hu(0, 'ping', 'ping', 'zimo')], 0);
    expect(dexProgress(r, 'xz')).toEqual({ got: 1, total: XZ_DEX.length });
    expect(dexProgress(dexFromEvents(emptyDex(), [win(0, 'kokushi', 'tanyao')], 0), 'rc').got).toBe(2);
  });
});

describe('坏数据', () => {
  test('形状不对兜底成空记录，坏的那一项丢掉', () => {
    for (const bad of [null, undefined, 5, 'x', [], { xz: 3, rc: [] }, { xz: null }]) expect(parseDex(bad)).toEqual(emptyDex());
    expect(parseDex({ xz: { ping: 2, qing: -1, gen: 1.5, qidui: '3' }, rc: { riichi: 4 }, extra: 1 })).toEqual({ xz: { ping: 2 }, rc: { riichi: 4 } });
  });
});

describe('图鉴去重（刷新后）', () => {
  const v = { round: 2, wall: 40 };
  test('同一手标识相同，换局 / 换场 / 换牌标识不同；没和牌或旁观没有标识', () => {
    const ev = [hu(0, 'ping')];
    const k = dexKey('ROOM', v, ev, 0);
    expect(k).toBeTruthy();
    expect(dexKey('ROOM', { ...v }, [hu(0, 'ping')], 0)).toBe(k);
    expect(dexKey('ROOM', { ...v, round: 3 }, ev, 0)).not.toBe(k);
    expect(dexKey('OTHER', v, ev, 0)).not.toBe(k);
    expect(dexKey('ROOM', v, [hu(1, 'ping')], 0)).toBeNull();
    expect(dexKey('ROOM', v, ev, null)).toBeNull();
  });

  test('记录带 last：刷新后读回来仍在，同一手不再记；老数据（没有 last）照常读', () => {
    const rec = { ...dexFromEvents(emptyDex(), [hu(0, 'ping')], 0), last: 'k1' };
    const back = parseDex(JSON.parse(JSON.stringify(rec)));
    expect(back.last).toBe('k1');
    expect(back.xz).toEqual({ ping: 1 });
    const old = parseDex({ xz: { ping: 3 }, rc: {} });
    expect(old).toEqual({ xz: { ping: 3 }, rc: {} });
    expect(parseDex({ xz: {}, rc: {}, last: 5 }).last).toBeUndefined();
  });
});

describe('新收集', () => {
  const after = (before: ReturnType<typeof emptyDex>, ...evs: XzEvent[]) => dexFromEvents(before, evs, 0);
  test('第一次和才算新，再和不算', () => {
    const r1 = after(emptyDex(), hu(0, 'qing'));
    expect(dexNewIds(emptyDex(), r1)).toEqual(['xz:qing']);
    expect(dexNewIds(r1, after(r1, hu(0, 'qing')))).toEqual([]);
  });
  test('一手多样新的全返回；已和过的不算；别人和的不算', () => {
    const r0 = after(emptyDex(), hu(0, 'ping'));
    const r1 = after(r0, hu(0, 'ping', 'pengpeng', 'gen'));
    expect(dexNewIds(r0, r1)).toEqual(['xz:pengpeng', 'xz:gen']);
    expect(dexNewIds(r0, dexFromEvents(r0, [hu(1, 'qing')], 0))).toEqual([]);
  });
  test('立直役牌合成一行，只算一次新', () => {
    const r = dexFromEvents(emptyDex(), [win(0, 'haku', 'chun', 'riichi')], 0);
    expect(dexNewIds(emptyDex(), r)).toEqual(['rc:riichi', 'rc:yakuhai']);
  });
  test('提示文字：三样以内全写，更多写前两样加等 N 样', () => {
    expect(dexToastText(['清一色'])).toBe('图鉴 +1：清一色');
    expect(dexToastText(['清一色', '对对胡', '杠上开花'])).toBe('图鉴 +3：清一色、对对胡、杠上开花');
    expect(dexToastText(['a', 'b', 'c', 'd'])).toBe('图鉴 +4：a、b等 4 样');
  });
  test('看过清掉：只清那个玩法的；没有可清的原样返回', () => {
    const r = dexAddFresh(dexFromEvents(dexFromEvents(emptyDex(), [hu(0, 'qing')], 0), [win(0, 'riichi')], 0), ['xz:qing', 'rc:riichi', 'xz:qing']);
    expect(r.fresh).toEqual(['xz:qing', 'rc:riichi']);
    const s = dexMarkSeen(r, 'xz');
    expect(s.fresh).toEqual(['rc:riichi']);
    expect(dexMarkSeen(s, 'rc').fresh).toBeUndefined();
    expect(dexMarkSeen(emptyDex(), 'xz')).toEqual(emptyDex());
  });
  test('老数据兼容：没有 fresh 照常读；坏的 fresh 和次数为 0 的丢掉；读回来保留', () => {
    expect(parseDex({ xz: { ping: 1 }, rc: {} }).fresh).toBeUndefined();
    expect(parseDex({ xz: { ping: 1 }, rc: {}, fresh: 'x' }).fresh).toBeUndefined();
    expect(parseDex({ xz: { ping: 1 }, rc: {}, fresh: ['xz:ping', 'xz:qing', 5, 'bad'] }).fresh).toEqual(['xz:ping']);
    const r = dexAddFresh(after(emptyDex(), hu(0, 'ping')), ['xz:ping']);
    expect(parseDex(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});
