/**
 * 跟注提示（docs/screens.md 8.2）：轮到我要跟注时，我这两张牌对着还没弃牌的几家"大约赢几成"，和赔率要的赢面摆在一起。
 * 只是画面上的提示：只吃我自己看得到的东西（我的底牌、公共牌、还剩几家），对手的牌当成随机的两张抽样，不碰任何人没亮的牌；
 * 不进规则核心，也不给电脑用。抽样用 arcade-kit/rng 的流（用途 RNG.hint，密钥由我的牌、公共牌和对手家数算）：同一个局面永远同一个数，重画不跳。
 * 真人桌（好友房、快速匹配、锦标赛）不显示，见 view/actions.ts 的 update。
 */
import { ENTROPY_WORDS, stream } from 'arcade-kit/rng';
import type { Card } from '../core/cards.ts';
import { evalMasks } from '../core/eval.ts';
import { RNG } from '../core/table.ts';

/** 抽样次数：赢面的标准误约 1.6 个百分点，给人看的数取整到个位够用；每次轮到我只算一次，一家 2 ms、八家约 4.5 ms（负载高的机器上，test/core/odds.test.ts 量） */
export const HINT_SAMPLES = 1000;

const bit = (c: Card): number => 1 << (c >> 2);

const hand = new Int32Array(4);

/** 公共牌（四种花色的点数位 m）加上 a、b 两张的牌力；借用模块里的一块缓冲，不每次新建 */
function power(m: Int32Array, a: Card, b: Card): number {
  hand.set(m);
  hand[a & 3]! |= bit(a);
  hand[b & 3]! |= bit(b);
  return evalMasks(hand[0]!, hand[1]!, hand[2]!, hand[3]!);
}

/**
 * 我的赢面（千分数，平分按人数分）：hole 是我的两张，board 是已经翻开的公共牌，opponents 是还没弃牌的对手家数（≥ 1）。
 * 每次抽样给每家对手发两张、补齐公共牌，比一次大小
 */
export function handOdds(hole: readonly Card[], board: readonly Card[], opponents: number): number {
  if (hole.length !== 2 || opponents < 1) throw new Error(`handOdds needs 2 hole cards and an opponent, got ${hole.length} / ${opponents}`);
  const used = [...hole, ...board];
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.includes(c)) deck.push(c);
  const key = new Array<number>(ENTROPY_WORDS).fill(0);
  [...used, 52 + opponents].forEach((c, i) => (key[i % ENTROPY_WORDS] = (Math.imul(key[i % ENTROPY_WORDS]!, 53) + c + 1) >>> 0));
  const rng = stream(key, RNG.hint);
  const need = 5 - board.length;
  const draw = need + 2 * opponents;
  const m = new Int32Array(4);
  let score = 0;
  for (let k = 0; k < HINT_SAMPLES; k++) {
    // 只洗前 draw 张：前 need 张补公共牌，后面每两张一家
    for (let i = 0; i < draw; i++) {
      const j = i + rng.below(deck.length - i);
      const t = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = t;
    }
    m.fill(0);
    for (const c of board) m[c & 3]! |= bit(c);
    for (let i = 0; i < need; i++) m[deck[i]! & 3]! |= bit(deck[i]!);
    const mine = power(m, hole[0]!, hole[1]!);
    let ties = 1;
    let lost = false;
    for (let p = 0; p < opponents && !lost; p++) {
      const v = power(m, deck[need + 2 * p]!, deck[need + 2 * p + 1]!);
      if (v > mine) lost = true;
      else if (v === mine) ties++;
    }
    if (!lost) score += 2520 / ties;
  }
  return Math.round((score * 1000) / (2520 * HINT_SAMPLES));
}
