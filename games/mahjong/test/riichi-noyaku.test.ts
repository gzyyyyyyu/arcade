/** 立直的无役提醒：只用自己的牌和公开信息，听牌但没有役才提示 */
import { describe, expect, it } from 'vitest';
import { tileOf, type Tile } from '../src/core/tiles/index.ts';
import type { Meld } from '../src/core/table/index.ts';
import { noYakuOf, noYakuText, type NoYakuIn } from '../src/game/riichi/noyaku.ts';
import { kinds } from './helpers.ts';

function T(s: string): Tile[] {
  const used = new Map<number, number>();
  return kinds(s).map((k) => {
    const n = used.get(k) ?? 0;
    used.set(k, n + 1);
    return tileOf(k, (n + 1) % 4);
  });
}
const pon = (s: string): Meld => ({ kind: 'pon', tiles: T(s), from: 1 }) as Meld;
const base = (hand: string, o: Partial<NoYakuIn> = {}): NoYakuIn => ({ hand: T(hand), melds: [], seatWind: 1, roundWind: 0, indicators: T('9s'), riichi: 0, ...o });

describe('无役提醒', () => {
  it('有役（断幺）不提示', () => {
    expect(noYakuOf(base('234m567p345s6677m'))).toBeNull();
  });
  it('有役牌（自风刻子）的副露手不提示', () => {
    expect(noYakuOf(base('456p789s23m55z', { melds: [pon('222z')] }))).toBeNull();
  });
  it('门清无役：别人打的胡不了，自摸有役，提示可以立直', () => {
    const r = noYakuOf(base('123m45667p789s55z'));
    expect(r).toBe('tsumo');
    expect(noYakuText(r!)).toBe('只能自摸，或者立直');
  });
  it('副露无役：自摸也没有役', () => {
    const r = noYakuOf(base('456p789s23m55z', { melds: [pon('111m')] }));
    expect(r).toBe('none');
    expect(noYakuText(r!)).toBe('没有役，胡不了');
  });
  it('宝牌不算役', () => {
    // 指示牌 9m，宝牌是 1m：副露的 111m 全是宝牌，还是没有役
    expect(noYakuOf(base('456p789s23m55z', { melds: [pon('111m')], indicators: T('9m') }))).toBe('none');
  });
  it('已经立直不提示；没听牌也不提示', () => {
    expect(noYakuOf(base('123m45667p789s55z', { riichi: 1 }))).toBeNull();
    expect(noYakuOf(base('1357m1357p1357s1z'))).toBeNull();
  });
});
