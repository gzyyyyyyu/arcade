/**
 * 斗地主好友房的「不洗牌」房（娱乐 0.33.0、实盘 0.39.0）：开房选项怎么校验、联机开局（按密钥成团发牌）的牌和选项、视图里的标记。
 * 规则核心的成团发牌本身在 ddz-noshuffle.test.ts，这里只管房间这一层。
 */
import { describe, expect, it } from 'vitest';
import { rankOf } from '../../src/core/cards.ts';
import { parseHallOpts } from '../../src/net/hall.ts';
import { ddzBegin, ddzView } from '../../src/variants/doudizhu/net/rules.ts';
import { testKey } from '../../src/variants/guandan/net/rules.ts';
import { tableRules } from '../../src/variants/doudizhu/net/stake.ts';
import { ROOM_DEALS, RULES_CLUMP, RULES_V2, stakeOptions } from '../../src/variants/doudizhu/stake/index.ts';

const SEATS = ['human', 'human', 'human'] as const;
const OPEN = { seats: [...SEATS], opts: { stake: null, noShuffle: true as const } };

function bombs(hand: readonly number[]): number {
  const n = new Map<number, number>();
  for (const c of hand) n.set(rankOf(c), (n.get(rankOf(c)) ?? 0) + 1);
  return [...n].filter(([r, k]) => k === 4 && r < 16).length + (n.has(16) && n.has(17) ? 1 : 0);
}

const handsOf = (s: ReturnType<typeof ddzBegin>): number[][] => s.g.hands.map((h) => [...h]);

describe('parseHallOpts（不洗牌的开房选项）', () => {
  it('noShuffle: true 的娱乐房认下来', () => {
    expect(parseHallOpts({ variant: 'ddz', noShuffle: true })).toEqual({ variant: 'ddz', stake: null, noShuffle: true });
  });

  it('带档位的不洗牌实盘也认下来（0.39.0，用不洗牌那套数）', () => {
    expect(parseHallOpts({ variant: 'ddz', stake: 'small', noShuffle: true })).toEqual({ variant: 'ddz', stake: 'small', noShuffle: true });
    expect(parseHallOpts({ variant: 'ddz', stake: 'small', noShuffle: false })).toBeNull();
  });

  it('noShuffle 只认 true：false、1、字符串都拒绝', () => {
    for (const v of [false, 1, 'yes', 'true', null, {}]) expect(parseHallOpts({ variant: 'ddz', noShuffle: v })).toBeNull();
  });

  it('不带 noShuffle 就没有这个字段，老的开房请求形状不变', () => {
    const r = parseHallOpts({ variant: 'ddz' });
    expect(r).toEqual({ variant: 'ddz', stake: null });
    expect('noShuffle' in r!).toBe(false);
  });
});

describe('ddzBegin（不洗牌房间开局）', () => {
  it('状态的选项带 noShuffle 和每副封顶 48；不带时都没有', () => {
    const on = ddzBegin(testKey(1), OPEN);
    expect(on.g.opts.noShuffle).toBe(true);
    expect(on.g.opts.dealCap).toBe(48);
    const off = ddzBegin(testKey(1), { seats: [...SEATS], opts: { stake: null } });
    expect(off.g.opts.noShuffle).toBeFalsy();
  });

  it('视图带 noShuffle: true，经典房没有这个字段', () => {
    const on = ddzView(ddzBegin(testKey(2), OPEN), 0);
    expect(on.view.noShuffle).toBe(true);
    const off = ddzView(ddzBegin(testKey(2), { seats: [...SEATS], opts: { stake: null } }), 0);
    expect('noShuffle' in off.view).toBe(false);
  });

  it('带档位的不洗牌：牌局用版本 3 的实盘选项（不明牌），桌记版本 3、每分按 1/200 带回；经典实盘照旧版本 2', () => {
    const s = ddzBegin(testKey(3), { seats: [...SEATS], opts: { stake: 'small', noShuffle: true } });
    expect(s.g.opts).toEqual(stakeOptions(ROOM_DEALS, RULES_CLUMP));
    expect(s.g.opts.mingpai).toBeFalsy();
    expect(s.stake!.rules).toBe(3);
    expect(tableRules(s.stake!)).toBe(RULES_CLUMP);
    const c = ddzBegin(testKey(3), { seats: [...SEATS], opts: { stake: 'small' } });
    expect(c.g.opts).toEqual(stakeOptions(ROOM_DEALS));
    expect(c.stake!.rules).toBe(RULES_V2.v);
  });

  it('同一份熵两次开局手牌一样；三家手牌加底牌是 54 张的一个排列', () => {
    const a = ddzBegin(testKey(4), OPEN);
    const b = ddzBegin(testKey(4), OPEN);
    expect(handsOf(a)).toEqual(handsOf(b));
    expect([...a.g.hands.flat(), ...a.g.bottom].sort((x, y) => x - y)).toEqual(Array.from({ length: 54 }, (_, i) => i));
  });

  it('和不带 noShuffle 的同一份熵比，手牌不同（发牌走的是成团那条流）', () => {
    const a = ddzBegin(testKey(5), OPEN);
    const c = ddzBegin(testKey(5), { seats: [...SEATS], opts: { stake: null } });
    expect(handsOf(a)).not.toEqual(handsOf(c));
  });

  it('多份熵平均每副炸弹明显比经典多', () => {
    const N = 30;
    let clump = 0;
    let classic = 0;
    for (let i = 0; i < N; i++) {
      for (const h of handsOf(ddzBegin(testKey(100 + i), OPEN))) clump += bombs(h);
      for (const h of handsOf(ddzBegin(testKey(100 + i), { seats: [...SEATS], opts: { stake: null } }))) classic += bombs(h);
    }
    expect(clump / N).toBeGreaterThan(1.5);
    expect(clump).toBeGreaterThan(classic * 2);
  });
});
