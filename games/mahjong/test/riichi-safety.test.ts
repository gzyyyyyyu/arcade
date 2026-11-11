/**
 * 安全牌提示（src/ai/riichi-danger.ts 的 safetyOf）：别家立直后，我手里每种牌是现物、较安全还是有风险。
 * 局面直接手摆一个最小的视图：safetyOf 只读河、副露、立直宣告、宝牌指示牌和我自己的手牌。
 */
import { describe, expect, test } from 'vitest';
import { safetyOf } from '../src/ai/riichi-danger.ts';
import { tileOf, type Tile } from '../src/core/tiles/index.ts';
import type { RcView } from '../src/core/variants/riichi/index.ts';
import { kinds } from './helpers.ts';

interface Spec {
  hand: string;
  /** 每家的河（按打出的先后）；n 用全桌统一的序号 */
  river: { seat: number; tile: string; n: number }[];
  /** 座位 → 立直宣告的牌在自己河里的位置 */
  riichi: Record<number, number>;
  dora?: string;
}

function view(spec: Spec): RcView {
  const used = new Map<number, number>();
  const one = (k: number): Tile => {
    const n = used.get(k) ?? 0;
    used.set(k, n + 1);
    return tileOf(k, n);
  };
  const hand = kinds(spec.hand).map(one);
  const seats = [0, 1, 2, 3].map((i) => ({
    wind: i,
    riichi: spec.riichi[i] !== undefined ? 1 : 0,
    riichiAt: spec.riichi[i] ?? -1,
    melds: [],
    river: spec.river.filter((r) => r.seat === i).map((r) => ({ tile: one(kinds(r.tile)[0]!), n: r.n, taken: false })),
  }));
  const dora = kinds(spec.dora ?? '9p').map(one);
  return { wind: 0, dora, seats, me: { seat: 0, hand, drawn: null } } as unknown as RcView;
}

const at = (seat: number, tile: string, n: number) => ({ seat, tile, n });

describe('安全牌提示', () => {
  test('现物：他河里有的；立直后别家打过的（他没和）', () => {
    const m = safetyOf(view({ hand: '9p4m2s5s', river: [at(1, '9p', 0), at(1, '4m', 4), at(2, '2s', 5)], riichi: { 1: 1 } }))!;
    expect(m.get(kinds('9p')[0]!)).toBe('safe');
    expect(m.get(kinds('4m')[0]!)).toBe('safe');
    expect(m.get(kinds('2s')[0]!)).toBe('safe');
    expect(m.get(kinds('5s')[0]!)).toBeUndefined();
  });

  test('立直前别家打过、他没打过的牌不算现物', () => {
    // 2s 是全桌第 2 张，早于他立直宣告（第 4 张）：对他不是现物
    const m = safetyOf(view({ hand: '2s', river: [at(2, '2s', 2), at(1, '9p', 0), at(1, '4m', 4)], riichi: { 1: 1 } }))!;
    expect(m.get(kinds('2s')[0]!)).toBeUndefined();
  });

  test('筋牌：较安全', () => {
    const m = safetyOf(view({ hand: '1m7m5m', river: [at(1, '9p', 0), at(1, '4m', 4)], riichi: { 1: 1 } }))!;
    expect(m.get(kinds('1m')[0]!)).toBe('fair');
    expect(m.get(kinds('7m')[0]!)).toBe('fair');
    expect(m.get(kinds('5m')[0]!)).toBeUndefined();
  });

  test('字牌：场上已见 3 张较安全，见 4 张是安全', () => {
    const base = [at(1, '9p', 0), at(1, '4m', 4)];
    // 我手里 1 张 + 河里 2 张 = 见 3 张（都是他立直之前打的，不是现物）
    const three = safetyOf(view({ hand: '7z', river: [...base, at(2, '7z', 1), at(3, '7z', 2)], riichi: { 1: 1 } }))!;
    expect(three.get(kinds('7z')[0]!)).toBe('fair');
    const four = safetyOf(view({ hand: '7z', river: [...base, at(2, '7z', 1), at(3, '7z', 2), at(2, '7z', 3)], riichi: { 1: 1 } }))!;
    expect(four.get(kinds('7z')[0]!)).toBe('safe');
    // 只见 1 张的字牌有风险
    const one = safetyOf(view({ hand: '7z', river: base, riichi: { 1: 1 } }))!;
    expect(one.get(kinds('7z')[0]!)).toBeUndefined();
  });

  test('两家立直：对每一家都要安全，取交集', () => {
    const river = [at(1, '9p', 0), at(1, '4m', 4), at(2, '8s', 1), at(2, '9m', 6), at(2, '4m', 8)];
    // 4m 在两家河里都有 → 安全；9p 只在 1 号家河里，对 2 号家不是现物，9p 是幺九但没筋可依 → 不再是安全
    const m = safetyOf(view({ hand: '4m9p', river, riichi: { 1: 1, 2: 1 } }))!;
    expect(m.get(kinds('4m')[0]!)).toBe('safe');
    expect(m.get(kinds('9p')[0]!)).not.toBe('safe');
  });

  test('我自己立直了、或者没人立直：不提示', () => {
    expect(safetyOf(view({ hand: '1m', river: [at(0, '2m', 0)], riichi: { 0: 0 } }))).toBeNull();
    expect(safetyOf(view({ hand: '1m', river: [at(1, '2m', 0)], riichi: {} }))).toBeNull();
    // 我立直、别家也立直：我只能摸切，不提示
    expect(safetyOf(view({ hand: '1m', river: [at(0, '2m', 0), at(1, '3m', 1)], riichi: { 0: 0, 1: 0 } }))).toBeNull();
  });
});
