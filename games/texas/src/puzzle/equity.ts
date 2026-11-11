/**
 * 谜题的赢面（docs/features.md 13.11）：对手的牌是一组明牌的组合（范围），每种组合一样可能。
 * 翻牌以后剩的公共牌一张张穷举（翻牌 990 种、转牌 44 种），算得出准的；翻牌前五张都没发，穷举太多，
 * 用 kit 的随机流抽样（固定次数、固定种子，同一天同一结果）。平局算半个。
 */
import type { RandomStream } from 'arcade-kit/rng';
import type { Card } from '../core/cards.ts';
import { evalMasks } from '../core/eval.ts';

export type Combo = readonly [Card, Card];

const bit = (c: Card): number => 1 << (c >> 2);

/** 除了 used 里的牌，所有两张牌的组合 */
export function combosWithout(used: readonly Card[]): Combo[] {
  const block = new Uint8Array(52);
  for (const c of used) block[c] = 1;
  const out: Combo[] = [];
  for (let a = 0; a < 52; a++) {
    if (block[a]) continue;
    for (let b = a + 1; b < 52; b++) if (!block[b]) out.push([a, b]);
  }
  return out;
}

const sa = new Int32Array(4);
const sb = new Int32Array(4);

/** 我和对手各加这几张公共牌（-1 是没有）后比大小：2 赢 1 平 0 输 */
function versus(hm: Int32Array, vm: Int32Array, x: number, y: number): number {
  sa.set(hm);
  sb.set(vm);
  if (x >= 0) {
    sa[x & 3]! |= bit(x);
    sb[x & 3]! |= bit(x);
  }
  if (y >= 0) {
    sa[y & 3]! |= bit(y);
    sb[y & 3]! |= bit(y);
  }
  const h = evalMasks(sa[0]!, sa[1]!, sa[2]!, sa[3]!);
  const v = evalMasks(sb[0]!, sb[1]!, sb[2]!, sb[3]!);
  return h > v ? 2 : h === v ? 1 : 0;
}

/** 翻牌后（公共牌 3–5 张）的准确赢面，0–1 */
export function exactEquity(hero: readonly Card[], board: readonly Card[], range: readonly Combo[]): number {
  if (board.length < 3 || board.length > 5) throw new Error('exactEquity needs 3-5 board cards');
  const block = new Uint8Array(52);
  for (const c of hero) block[c] = 1;
  for (const c of board) block[c] = 1;
  const hm = new Int32Array(4);
  const bm = new Int32Array(4);
  for (const c of board) bm[c & 3]! |= bit(c);
  hm.set(bm);
  for (const c of hero) hm[c & 3]! |= bit(c);
  const vm = new Int32Array(4);
  const need = 5 - board.length;
  let score = 0;
  let total = 0;
  for (const [a, b] of range) {
    if (block[a] || block[b]) continue;
    vm.set(bm);
    vm[a & 3]! |= bit(a);
    vm[b & 3]! |= bit(b);
    const rest: number[] = [];
    for (let c = 0; c < 52; c++) if (!block[c] && c !== a && c !== b) rest.push(c);
    if (need === 0) {
      score += versus(hm, vm, -1, -1);
      total++;
    } else if (need === 1) {
      for (const x of rest) {
        score += versus(hm, vm, x, -1);
        total++;
      }
    } else {
      for (let i = 0; i < rest.length; i++)
        for (let j = i + 1; j < rest.length; j++) {
          score += versus(hm, vm, rest[i]!, rest[j]!);
          total++;
        }
    }
  }
  return total ? score / (2 * total) : 0;
}

/** 翻牌前：对手从范围里抽一手，五张公共牌随机发，抽 iters 次 */
export function sampleEquity(hero: readonly Card[], range: readonly Combo[], r: RandomStream, iters: number): number {
  const live = range.filter(([a, b]) => !hero.includes(a) && !hero.includes(b));
  if (!live.length) return 0;
  const hm = new Int32Array(4);
  const vm = new Int32Array(4);
  let score = 0;
  for (let it = 0; it < iters; it++) {
    const [a, b] = live[r.below(live.length)]!;
    const used = [hero[0]!, hero[1]!, a, b];
    const board: number[] = [];
    while (board.length < 5) {
      const c = r.below(52);
      if (!used.includes(c)) {
        used.push(c);
        board.push(c);
      }
    }
    hm.fill(0);
    vm.fill(0);
    for (const c of board) {
      hm[c & 3]! |= bit(c);
      vm[c & 3]! |= bit(c);
    }
    for (const c of hero) hm[c & 3]! |= bit(c);
    vm[a & 3]! |= bit(a);
    vm[b & 3]! |= bit(b);
    score += versus(hm, vm, -1, -1);
  }
  return score / (2 * iters);
}
