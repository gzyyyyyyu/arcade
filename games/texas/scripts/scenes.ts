/**
 * 冒烟 `--only scenes` 用的牌局：用规则核心直接摆出要看的局面（有人全下、一个或两个边池、摊牌），写成单机的本机存档，
 * 页面"继续上局"就停在这里，查牌桌上的元素互相压没压（docs/screens.md 8.2）。只在冒烟里用，不进页面。
 */
import { apply, deal, isFail, legal, newTable, seatHouse, seatPlayer, type Action, type Table } from '../src/core/table.ts';

export type SceneKind = 'side' | 'showdown';

const ok = (x: Table | { error: string }): Table => {
  if (isFail(x)) throw new Error(x.error);
  return x;
};

/**
 * size 人桌，sides 个短码电脑全下（筹码 60、180……各不相同）、一个电脑加到 300，其余跟注、我（0 号）跟注：收池后一个主池加 sides 个边池；
 * side：翻牌后轮到我时停下（操作区、赔率、牌型提示都在）；showdown：我一路过牌、跟到摊牌，一手打完停着
 */
export function scene(size: number, sides: number, kind: SceneKind, seed: number): Table {
  let t = newTable('small', size, [seed, 7, 3, 5, 11, 13, 17, 19], { holdHands: true, level: 2 });
  for (let i = 1; i < size; i++) t = ok(seatHouse(t, i, false));
  t = ok(seatPlayer(t, 0, 2_000, false));
  // 短码：直接改筹码，bank 跟着改（Σ筹码 + Σ投入 = bank）
  const short = Array.from({ length: Math.min(sides, size - 1) }, (_, k) => size - 1 - k);
  short.forEach((s, k) => {
    const seat = t.seats[s]!;
    t.bank += 60 + 120 * k - seat.stack;
    seat.stack = 60 + 120 * k;
  });
  t = deal(t);
  // 翻牌前第一个不是短码、不是我的电脑加到 300（比短码都多），收池时才分得出边池
  let raised = false;
  for (let guard = 0; guard < 400; guard++) {
    if (t.phase === 'idle' || t.toAct === null) break;
    const s = t.toAct;
    if (s === 0 && kind === 'side' && t.phase !== 'preflop') break;
    const l = legal(t, s)!;
    const raise = !raised && s !== 0 && !short.includes(s) && t.phase === 'preflop' && l.raise && l.minTo <= 300;
    if (raise) raised = true;
    const a: Action = short.includes(s) ? { t: 'allin' } : raise ? { t: 'raise', to: 300 } : l.check ? { t: 'check' } : { t: 'call' };
    t = ok(apply(t, s, a));
  }
  return t;
}

/** 单机存档（src/solo.ts 的 Session），练习桌、不碰钱包 */
export function sceneSave(t: Table, userId: string): string {
  return JSON.stringify({ v: 1, id: `scene-${t.seed[0]}`, userId, practice: true, table: t, pending: null, stats: { buyin: 2_000, hands: 0, won: 0, best: null } });
}

export type BigKind = 'quads' | 'boat';

const cardOf = (s: string): number => '23456789TJQKA'.indexOf(s[0]!) * 4 + 'cdhs'.indexOf(s[1]!);
const cardsOf = (s: string): number[] => s.split(' ').map(cardOf);

/**
 * 两人桌，电脑（1 号，小盲先说话）已经全下、轮到我跟：我一跟注就是翻牌前全下比牌，补牌的悬念、胜率、大牌庆祝都跟着放（大场面，0.28.0）。
 * 牌是摆好的（不靠种子碰运气）：quads 我 5♠5♥ 赢电脑 A♣K♦，公共牌 5♦5♣9♥2♠J♦（四条）；
 * boat 我 K♠K♥ 赢电脑 A♠A♥，公共牌 2♣9♦9♥J♠K♣（转牌时电脑领先 95%，河牌 K 给我葫芦：被逆转）
 */
export function bigHand(kind: BigKind, seed: number): Table {
  let t = newTable('small', 2, [seed, 7, 3, 5, 11, 13, 17, 19], { holdHands: true, level: 2 });
  t = ok(seatHouse(t, 1, false));
  t = ok(seatPlayer(t, 0, 2_000, false));
  for (const s of t.seats) {
    t.bank += 600 - s.stack;
    s.stack = 600;
  }
  // 起始按钮在 0，下一手庄家是 1（两人桌庄家 = 小盲，翻牌前先说话）：电脑先全下
  t.button = 0;
  t = deal(t);
  const [mine, bot, board] = kind === 'quads' ? ['5s 5h', 'Ac Kd', '5d 5c 9h 2s Jd'] : ['Ks Kh', 'As Ah', '2c 9d 9h Js Kc'];
  t.seats[0]!.hole = cardsOf(mine);
  t.seats[1]!.hole = cardsOf(bot);
  const taken = new Set([...cardsOf(mine), ...cardsOf(bot), ...cardsOf(board)]);
  const rest = t.deck.filter((c) => !taken.has(c));
  t.deck = [...cardsOf(mine), ...cardsOf(bot), ...cardsOf(board), ...rest];
  t.deckPos = 4;
  if (t.toAct !== 1) throw new Error(`bigHand: 先说话的应该是 1 号，实际 ${t.toAct}`);
  t = ok(apply(t, 1, { t: 'allin' }));
  if (t.toAct !== 0) throw new Error(`bigHand: 该轮到我跟注，实际 ${t.toAct}`);
  return t;
}
