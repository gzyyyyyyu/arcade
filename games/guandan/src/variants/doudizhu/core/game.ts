/**
 * 斗地主规则核心（牌馆 PR ②，设计 docs/doudizhu.md 第 3 节）：一副 54 张、3 人、叫分 1–3 定地主，经典牌型，
 * 炸弹 / 王炸 / 春天 / 反春各翻一倍，零和结算。
 * 和掼蛋核心同样的约束：纯函数、确定性，不碰 DOM、时间、Math.random；随机只用带种子、按用途分流的流。
 * 单机按种子（rngFor），联机按 256 位密钥（arcade-kit/rng 的 stream，状态里不留种子，32 位种子能被反推全桌的牌）。
 * 座位 0、1、2 按出牌顺序轮（0 的下家是 1）。
 */
import { type Entropy, isEntropy, shuffle as keyedShuffle, stream } from 'arcade-kit/rng';
import type { Card } from '../../../core/cards.ts';
import { type Rng, rngFor } from '../../../core/rng.ts';
import { nextOf } from '../../../core/seats.ts';
import { type DdzPlay, chooseDdz, interpretDdz, isBombish, sortDdz } from './patterns.ts';

export const DDZ_SEATS = 3;
/** 斗地主自己的规则版本（和掼蛋的分开记） */
export const DDZ_RULES = 1;
export const next3 = (s: number): number => nextOf(s, DDZ_SEATS);

/** 叫分阶段、出牌阶段每步给的时间（毫秒） */
export const DDZ_BID_MS = 15000;
const DDZ_PLAY_MS = 30000;

export interface DdzOptions {
  /** 一场几副 */
  deals: number;
  /** 每副的分封顶（0 = 不封顶） */
  dealCap: number;
  /** 一场里任何一家累计到 ±cap 就结束（0 = 不封顶）；最后那副按 s 截，仍然零和 */
  cap: number;
  /** 明牌玩法（常见做法）：地主拿到底牌后可以选择亮出手牌换这一副翻倍。不带或 false = 经典玩法，状态、事件、视图和以前逐位相同 */
  mingpai?: boolean;
  /**
   * 不洗牌玩法（欢乐斗地主的"不洗牌场"）：牌按点数成团、只切几刀、成叠发（`clumpDeck`），炸弹多。只换发牌，叫分、出牌、结算一条不改；
   * 这时被每副封顶（dealCap）截了的那副记 `capped`。单机按种子、联机按密钥（clumpRng）；不带或 false = 经典发牌，状态、事件逐位和以前相同
   */
  noShuffle?: boolean;
}

export const DDZ_FUN: DdzOptions = { deals: 6, dealCap: 0, cap: 0 };
/** 不洗牌玩法叠在娱乐规则上的部分：成团发牌，每副封顶 dealCap 分（炸弹多、倍数大，ddz-stake-sim --fun --noshuffle 量过，docs/doudizhu.md 第 4 节） */
export const DDZ_NOSHUFFLE: Partial<DdzOptions> = { noShuffle: true, dealCap: 48 };

type DdzPhase = 'bid' | 'show' | 'play' | 'dealEnd' | 'gameOver';

export interface DdzResult {
  landlord: number;
  bid: number;
  bombs: number;
  spring: 'spring' | 'anti' | null;
  landlordWon: boolean;
  /** 这一副的分 s（叫分 × 2^k，按每副封顶、一场封顶截过） */
  s: number;
  /** 倍数 2^k */
  mult: number;
  /** 这一副地主明了牌（×2 已乘进 mult）；只有开了 mingpai 的局才有这个字段 */
  ming?: boolean;
  /** 被一场封顶截过 */
  capped: boolean;
  /** 每个座位这一副的分，三家和恒为 0 */
  delta: number[];
}

interface DdzTrickPlay {
  seat: number;
  play: DdzPlay | null;
}

export interface DdzState {
  rules: number;
  /** 单机的种子；联机局为空串（发牌用 key） */
  seed: string;
  /** 联机的 256 位密钥 */
  key?: number[];
  /** 成功 dispatch 的次数（actors 的 group、电脑的种子用） */
  step: number;
  opts: DdzOptions;
  dealNo: number;
  /** 这一副重发了几次（三家都不叫） */
  redeal: number;
  phase: DdzPhase;
  hands: Card[][];
  bottom: Card[];
  firstBidder: number;
  bids: (number | null)[];
  bid: number;
  landlord: number;
  turn: number;
  /** 这一轮出过的（含"不要"），轮到最后出牌的人重新首出时清空 */
  trick: DdzTrickPlay[];
  /** 每家这一副出过几手 */
  handsPlayed: number[];
  /** 这一副公开出过的牌（记牌用） */
  played: Card[];
  bombs: number;
  /** 地主明牌了（亮牌后他的手牌对所有人公开）；没明牌时没有这个字段 */
  ming?: true;
  scores: number[];
  results: DdzResult[];
}

export type DdzAction =
  | { type: 'bid'; seat: number; bid: number }
  | { type: 'show'; seat: number; open: boolean }
  | { type: 'play'; seat: number; cards: Card[] }
  | { type: 'pass'; seat: number }
  | { type: 'next' };

export type DdzEvent =
  | { type: 'deal'; dealNo: number; firstBidder: number; redeal: number }
  | { type: 'bid'; seat: number; bid: number }
  | { type: 'redeal' }
  | { type: 'landlord'; seat: number; bid: number; bottom: Card[] }
  /** 明牌阶段地主的选择（open = 亮牌）；亮牌后他的手牌见视图的 mingHand */
  | { type: 'show'; seat: number; open: boolean }
  | { type: 'play'; seat: number; play: DdzPlay; left: number }
  | { type: 'pass'; seat: number }
  | { type: 'newTrick'; seat: number }
  | { type: 'dealEnd'; result: DdzResult }
  | { type: 'gameOver'; scores: number[] };

interface DdzDispatch {
  state: DdzState;
  events: DdzEvent[];
  error: string | null;
}

/** 复制一份可以改的状态：会被原地改的数组各拷一份，只读的（key、bottom、opts、trick 里的牌型）共用 */
function clone(s: DdzState): DdzState {
  return {
    ...s,
    hands: s.hands.map((h) => h.slice()),
    bids: s.bids.slice(),
    trick: s.trick.slice(),
    handsPlayed: s.handsPlayed.slice(),
    played: s.played.slice(),
    scores: s.scores.slice(),
    results: s.results.slice(),
  };
}

function freshDeck(): Card[] {
  return Array.from({ length: 54 }, (_, i) => i);
}

/** 不洗牌发牌的几个数（ddz-sim --noshuffle 量过，docs/doudizhu.md 第 4 节） */
export const CLUMP = { cuts: 3, swaps: 6, packet: [3, 5] } as const;

/**
 * 不洗牌的一副牌：像上一副打完收起来的牌——按点数排好（同点数四张挨着），切 CLUMP.cuts 刀、随手换几对，
 * 再按 3–5 张一叠轮着发给三家（最后 3 张是底牌）。同点数常常整叠落进一家手里，所以炸弹多。返回的顺序和经典发牌一样：
 * 前 17 张给 0 号、再 17 张给 1 号、再 17 张给 2 号、最后 3 张底牌
 */
export function clumpDeck(rng: Pick<Rng, 'int'>): Card[] {
  let deck = sortDdz(freshDeck());
  for (let i = 0; i < CLUMP.cuts; i++) {
    const at = 5 + rng.int(deck.length - 10);
    deck = [...deck.slice(at), ...deck.slice(0, at)];
  }
  for (let i = 0; i < CLUMP.swaps; i++) {
    const a = rng.int(deck.length);
    const b = rng.int(deck.length);
    [deck[a], deck[b]] = [deck[b]!, deck[a]!];
  }
  const hands: Card[][] = [[], [], []];
  let at = 0;
  for (let seat = 0; at < 51; seat = (seat + 1) % DDZ_SEATS) {
    const room = 17 - hands[seat]!.length;
    if (room === 0) continue;
    const n = Math.min(room, CLUMP.packet[0] + rng.int(CLUMP.packet[1] - CLUMP.packet[0] + 1));
    hands[seat]!.push(...deck.slice(at, at + n));
    at += n;
  }
  return [...hands[0]!, ...hands[1]!, ...hands[2]!, ...deck.slice(51)];
}

/**
 * 不洗牌发牌用的随机数：单机按种子（rngFor），联机按 256 位密钥的 stream（拒绝采样的 below，和经典联机发牌一样不能从看到的牌反推），
 * 流名 'ddz-clump'，同样按第几副、重发次数分
 */
function clumpRng(s: DdzState): Pick<Rng, 'int'> {
  if (!s.key) return rngFor(s.seed, 'ddz-clump', s.dealNo, s.redeal);
  const st = stream(s.key, 'ddz-clump', s.dealNo * 4 + s.redeal);
  return { int: (n) => st.below(n) };
}

/** 发牌：同一副重发（redeal 0..3）各用自己的流，联机的流序号 = 第几副 × 4 + 重发次数 */
function deal(s: DdzState, ev: DdzEvent[]): void {
  const deck = s.opts.noShuffle ? clumpDeck(clumpRng(s)) : s.key
    ? keyedShuffle(freshDeck(), stream(s.key, 'ddz-deal', s.dealNo * 4 + s.redeal))
    : rngFor(s.seed, 'ddz-deal', s.dealNo, s.redeal).shuffle(freshDeck());
  s.hands = [0, 1, 2].map((i) => sortDdz(deck.slice(i * 17, i * 17 + 17)));
  s.bottom = sortDdz(deck.slice(51));
  s.bids = [null, null, null];
  s.bid = 0;
  s.landlord = -1;
  s.trick = [];
  s.handsPlayed = [0, 0, 0];
  s.played = [];
  s.bombs = 0;
  delete s.ming;
  s.phase = 'bid';
  s.turn = s.firstBidder;
  ev.push({ type: 'deal', dealNo: s.dealNo, firstBidder: s.firstBidder, redeal: s.redeal });
  // 连着 3 次没人叫：这一副先叫的人直接 1 分当地主（不让牌局卡在无限重发里）
  if (s.redeal >= 3) setLandlord(s, s.firstBidder, 1, ev);
}

function setLandlord(s: DdzState, seat: number, bid: number, ev: DdzEvent[]): void {
  s.landlord = seat;
  s.bid = bid;
  s.hands[seat] = sortDdz([...s.hands[seat]!, ...s.bottom]);
  // 明牌玩法：先让地主选亮不亮，再开始出牌
  s.phase = s.opts.mingpai ? 'show' : 'play';
  s.turn = seat;
  ev.push({ type: 'landlord', seat, bid, bottom: [...s.bottom] });
}

function newDdz(seed: string, key: number[] | undefined, opts: Partial<DdzOptions>): { state: DdzState; events: DdzEvent[] } {
  const s: DdzState = {
    rules: DDZ_RULES,
    seed: key ? '' : seed,
    ...(key ? { key } : {}),
    step: 0,
    opts: { ...DDZ_FUN, ...opts },
    dealNo: 1,
    redeal: 0,
    phase: 'bid',
    hands: [],
    bottom: [],
    firstBidder: key ? stream(key, 'ddz-first').below(DDZ_SEATS) : rngFor(seed, 'ddz-first').int(DDZ_SEATS),
    bids: [],
    bid: 0,
    landlord: -1,
    turn: 0,
    trick: [],
    handsPlayed: [0, 0, 0],
    played: [],
    bombs: 0,
    scores: [0, 0, 0],
    results: [],
  };
  const events: DdzEvent[] = [];
  deal(s, events);
  return { state: s, events };
}

/** 单机：按种子 */
export function createDdz(seed: string | number, opts: Partial<DdzOptions> = {}): { state: DdzState; events: DdzEvent[] } {
  return newDdz(String(seed), undefined, opts);
}

/** 联机：按 256 位密钥（房间开局时用 crypto 生成） */
export function createDdzKeyed(key: Entropy, opts: Partial<DdzOptions> = {}): { state: DdzState; events: DdzEvent[] } {
  if (!isEntropy(key)) throw new Error('key must be 8 u32 words');
  return newDdz('', [...key], opts);
}

/** 这一轮要压的那手（最后一手不是"不要"的）；轮回到出它的人时轮已清空，回 null（重新首出） */
export function targetOf(s: Pick<DdzState, 'trick'>): DdzTrickPlay | null {
  for (let i = s.trick.length - 1; i >= 0; i--) if (s.trick[i]!.play) return s.trick[i]!;
  return null;
}

function finishDeal(s: DdzState, winner: number, ev: DdzEvent[]): void {
  const landlordWon = winner === s.landlord;
  const farmers = [0, 1, 2].filter((x) => x !== s.landlord);
  let spring: DdzResult['spring'] = null;
  if (landlordWon && farmers.every((f) => s.handsPlayed[f] === 0)) spring = 'spring';
  if (!landlordWon && s.handsPlayed[s.landlord] === 1) spring = 'anti';
  let mult = 1;
  for (let k = s.bombs + (spring ? 1 : 0) + (s.ming ? 1 : 0); k > 0; k--) mult *= 2;
  let pts = s.bid * mult;
  // 不洗牌玩法炸弹多、倍数大：被每副封顶截了也记 capped，结算页写"封顶了"（经典玩法照旧只记一场封顶，结果和以前逐位相同）
  let capped = false;
  if (s.opts.dealCap > 0 && pts > s.opts.dealCap) {
    pts = s.opts.dealCap;
    if (s.opts.noShuffle) capped = true;
  }
  const sign = landlordWon ? 1 : -1;
  const per = (x: number) => (x === s.landlord ? 2 * sign : -sign);
  // 一场封顶：截的是 s（不是某个人），所以仍然零和。任何一家的累计都不过 ±cap；
  // 地主一手动 2s，余量是奇数时够不到正好 cap，这时他停在 cap-1，这一副也算被截（一场到此结束）
  if (s.opts.cap > 0) {
    for (let x = 0; x < DDZ_SEATS; x++) {
      const step = Math.abs(per(x));
      const room = per(x) > 0 ? s.opts.cap - s.scores[x]! : s.opts.cap + s.scores[x]!;
      const most = Math.max(0, Math.floor(room / step));
      if (most < pts) {
        pts = most;
        capped = true;
      }
    }
  }
  const delta = [0, 1, 2].map((x) => per(x) * pts);
  for (let x = 0; x < DDZ_SEATS; x++) s.scores[x] = s.scores[x]! + delta[x]!;
  const result: DdzResult = { landlord: s.landlord, bid: s.bid, bombs: s.bombs, spring, landlordWon, s: pts, mult, ...(s.opts.mingpai ? { ming: s.ming === true } : {}), capped, delta };
  s.results.push(result);
  s.turn = -1;
  ev.push({ type: 'dealEnd', result });
  const reached = s.opts.cap > 0 && (capped || s.scores.some((x) => Math.abs(x) >= s.opts.cap));
  if (reached || s.dealNo >= s.opts.deals) {
    s.phase = 'gameOver';
    ev.push({ type: 'gameOver', scores: [...s.scores] });
  } else s.phase = 'dealEnd';
}

export function dispatchDdz(state: DdzState, a: DdzAction): DdzDispatch {
  const fail = (error: string): DdzDispatch => ({ state, events: [], error });
  const s = clone(state);
  const ev: DdzEvent[] = [];
  const ok = (): DdzDispatch => {
    s.step++;
    return { state: s, events: ev, error: null };
  };
  if (a.type === 'next') {
    if (s.phase !== 'dealEnd') return fail('not_deal_end');
    s.dealNo++;
    s.redeal = 0;
    s.firstBidder = next3(s.firstBidder);
    deal(s, ev);
    return ok();
  }
  if (a.seat !== s.turn) return fail('not_your_turn');
  if (a.type === 'bid') {
    if (s.phase !== 'bid') return fail('not_bidding');
    if (!Number.isInteger(a.bid) || a.bid < 0 || a.bid > 3 || (a.bid > 0 && a.bid <= s.bid)) return fail('bad_bid');
    s.bids[a.seat] = a.bid;
    ev.push({ type: 'bid', seat: a.seat, bid: a.bid });
    if (a.bid > 0) s.bid = a.bid;
    if (a.bid !== 3 && !s.bids.every((b) => b !== null)) {
      s.turn = next3(s.turn);
      return ok();
    }
    if (s.bid === 0) {
      ev.push({ type: 'redeal' });
      s.redeal++;
      s.firstBidder = next3(s.firstBidder);
      deal(s, ev);
      return ok();
    }
    setLandlord(s, s.bids.indexOf(s.bid), s.bid, ev);
    return ok();
  }
  if (a.type === 'show') {
    if (s.phase !== 'show') return fail('not_show');
    if (typeof a.open !== 'boolean') return fail('bad_show');
    if (a.open) s.ming = true;
    s.phase = 'play';
    ev.push({ type: 'show', seat: a.seat, open: a.open });
    return ok();
  }
  if (s.phase !== 'play') return fail('not_playing');
  const target = targetOf(s);
  if (a.type === 'pass') {
    if (!target) return fail('must_lead');
    s.trick.push({ seat: a.seat, play: null });
    ev.push({ type: 'pass', seat: a.seat });
    s.turn = next3(s.turn);
    if (s.turn === target.seat) {
      s.trick = [];
      ev.push({ type: 'newTrick', seat: s.turn });
    }
    return ok();
  }
  if (!Array.isArray(a.cards)) return fail('not_in_hand');
  const hand = s.hands[a.seat]!;
  const cards = a.cards;
  if (cards.length === 0 || new Set(cards).size !== cards.length || !cards.every((c) => hand.includes(c))) return fail('not_in_hand');
  const options = interpretDdz(cards);
  const play = chooseDdz(options, target ? target.play : null);
  if (!play) return fail(options.length ? 'too_small' : 'bad_pattern');
  s.hands[a.seat] = hand.filter((c) => !cards.includes(c));
  s.trick.push({ seat: a.seat, play });
  s.handsPlayed[a.seat] = s.handsPlayed[a.seat]! + 1;
  s.played.push(...play.cards);
  if (isBombish(play)) s.bombs++;
  ev.push({ type: 'play', seat: a.seat, play, left: s.hands[a.seat]!.length });
  if (s.hands[a.seat]!.length === 0) {
    finishDeal(s, a.seat, ev);
    return ok();
  }
  s.turn = next3(s.turn);
  return ok();
}

/** 现在的倍数（2^(炸弹数 + 明牌)；春天要等打完才知道）。状态和视图都能传 */
export function currentMult(s: Pick<DdzState, 'bombs' | 'ming'>): number {
  let m = s.ming ? 2 : 1;
  for (let i = 0; i < s.bombs; i++) m *= 2;
  return m;
}

/** 联机房间用：现在该谁动、这一步的分组名（同一步里换人不换组，每次成功 dispatch 都换组）。发牌后等 next 时没人动 */
export function actorsDdz(s: DdzState): { seats: number[]; group: string } {
  if (s.phase === 'show') return { seats: [s.turn], group: `show-${s.dealNo}-${s.step}` };
  if (s.phase === 'bid') return { seats: [s.turn], group: `bid-${s.dealNo}-${s.step}` };
  if (s.phase === 'play') return { seats: [s.turn], group: `play-${s.dealNo}-${s.step}` };
  return { seats: [], group: `${s.phase}-${s.dealNo}-${s.step}` };
}

export function turnMsDdz(s: DdzState): number {
  return s.phase === 'bid' || s.phase === 'show' ? DDZ_BID_MS : s.phase === 'play' ? DDZ_PLAY_MS : 0;
}

export interface DdzView {
  seat: number;
  phase: DdzPhase;
  hand: Card[];
  counts: number[];
  /** 地主定了才给 */
  bottom: Card[];
  landlord: number;
  firstBidder: number;
  redeal: number;
  bids: (number | null)[];
  bid: number;
  turn: number;
  step: number;
  trick: DdzTrickPlay[];
  target: DdzTrickPlay | null;
  /** 这一副公开出过的牌（三家合起来，记牌用） */
  played: Card[];
  bombs: number;
  /** 地主明牌了；没明牌时没有这个字段（和 mingHand 同时出现） */
  ming?: true;
  /** 明牌后地主手里的牌（每次出牌后剩下的），所有座位包括旁观都有；没明牌时没有这个字段，别的隐藏信息照旧不给 */
  mingHand?: Card[];
  scores: number[];
  dealNo: number;
  deals: number;
  cap: number;
  dealCap: number;
  /** 不洗牌玩法（发牌方式是公开的，顶栏写出来）；经典玩法没有这个字段 */
  noShuffle?: true;
  results: DdzResult[];
}

/** 某个座位看得到的（别人的手牌不给；底牌在地主定下之前不给；旁观座位 -1 没有手牌） */
export function viewDdz(s: DdzState, seat: number): DdzView {
  return {
    seat,
    phase: s.phase,
    hand: [...(s.hands[seat] ?? [])],
    counts: s.hands.map((h) => h.length),
    bottom: s.landlord >= 0 ? [...s.bottom] : [],
    landlord: s.landlord,
    firstBidder: s.firstBidder,
    redeal: s.redeal,
    bids: [...s.bids],
    bid: s.bid,
    turn: s.turn,
    step: s.step,
    trick: s.trick.map((t) => ({ seat: t.seat, play: t.play ? { ...t.play, cards: [...t.play.cards] } : null })),
    target: ((): DdzTrickPlay | null => {
      const t = targetOf(s);
      return t ? { seat: t.seat, play: t.play ? { ...t.play, cards: [...t.play.cards] } : null } : null;
    })(),
    played: [...s.played],
    bombs: s.bombs,
    ...(s.ming && s.landlord >= 0 ? { ming: true as const, mingHand: [...s.hands[s.landlord]!] } : {}),
    scores: [...s.scores],
    dealNo: s.dealNo,
    deals: s.opts.deals,
    cap: s.opts.cap,
    dealCap: s.opts.dealCap,
    ...(s.opts.noShuffle ? { noShuffle: true as const } : {}),
    results: s.results.map((r) => ({ ...r, delta: [...r.delta] })),
  };
}

/** 超时：叫分不叫；明牌阶段不明牌；首出出最小的单张；跟牌不要 */
export function timeoutDdz(v: DdzView): DdzAction | null {
  if (v.turn !== v.seat) return null;
  if (v.phase === 'bid') return { type: 'bid', seat: v.seat, bid: 0 };
  if (v.phase === 'show') return { type: 'show', seat: v.seat, open: false };
  if (v.phase !== 'play') return null;
  return v.target ? { type: 'pass', seat: v.seat } : { type: 'play', seat: v.seat, cards: [sortDdz(v.hand)[0]!] };
}

/** 回放：同一个种子、同一串动作得到同一个状态 */
export function replayDdz(seed: string | number, opts: Partial<DdzOptions>, actions: readonly DdzAction[]): DdzState {
  return replayDdzFrom(createDdz(seed, opts).state, actions);
}

/** 从某个开局状态（单机或联机）起按动作回放 */
export function replayDdzFrom(start: DdzState, actions: readonly DdzAction[]): DdzState {
  let s = start;
  for (const a of actions) {
    const r = dispatchDdz(s, a);
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return s;
}
