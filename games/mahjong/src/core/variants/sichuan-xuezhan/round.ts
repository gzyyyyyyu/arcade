/** 一场、一局的开始：建桌、发牌、换三张、下一局。 */
import { stream } from 'arcade-kit/rng';
import type { Entropy } from 'arcade-kit/rng';
import { newWall } from '../../table/index.ts';
import { buildWall } from '../../tiles/index.ts';
import type { MatchSetup, SeatKind } from '../types.ts';
import { RULES_VERSION, TILESET, TILESET_THREE, VARIANT, seatsOf, type XzOpts, type XzState } from './types.ts';
import { emptyStats, sortHand } from './util.ts';

// ---------- 一场、一局 ----------

export function begin(key: Entropy, opts: XzOpts, kinds: readonly SeatKind[], setup: MatchSetup): XzState {
  // 三人局只取前 3 个座位（调用方按四人给的也照样能开）
  const n = seatsOf(opts);
  const s: XzState = {
    variant: VARIANT,
    v: RULES_VERSION,
    key: [...key],
    opts: { ...opts },
    share: setup.share,
    base: setup.base,
    kinds: kinds.slice(0, n),
    personas: setup.personas.slice(0, n),
    ...(setup.tunes ? { tunes: setup.tunes.slice(0, n).map((t) => ({ ...t })) } : {}),
    round: 0,
    dealer: stream(key, 'seat', 0).below(n),
    chips: setup.chips ? setup.chips.slice(0, n) : Array.from({ length: n }, () => setup.share),
    stake: setup.chips ? setup.chips.slice(0, n) : Array.from({ length: n }, () => setup.share),
    start: [],
    phase: 'swap',
    wall: newWall([], 0),
    players: [],
    turn: 0,
    drawn: null,
    canZimo: false,
    afterKan: null,
    claim: null,
    claimSeq: 0,
    kanSeq: 0,
    swapDir: null,
    noCalls: true,
    discards: 0,
    winners: 0,
    nextDealer: null,
    ledger: [],
    events: [],
    history: [],
    stats: Array.from({ length: n }, emptyStats),
  };
  startRound(s);
  return s;
}

function startRound(s: XzState): void {
  const n = seatsOf(s.opts);
  const tiles = buildWall(s.opts.three ? TILESET_THREE : TILESET, stream(s.key, 'deal', s.round));
  s.players = Array.from({ length: n }, () => ({ hand: [], melds: [], river: [], que: -1 as const, swapOut: null, swapIn: null, won: null, wins: [], draws: 0 }));
  let at = 0;
  for (let i = 0; i < n; i++) {
    const p = s.players[(s.dealer + i) % n]!;
    p.hand = tiles.slice(at, at + 13);
    at += 13;
  }
  s.players[s.dealer]!.hand.push(tiles[at++]!);
  for (const p of s.players) sortHand(p);
  s.wall = newWall(tiles, at);
  s.start = s.chips.slice();
  s.turn = s.dealer;
  s.drawn = null;
  s.canZimo = true;
  s.afterKan = null;
  s.claim = null;
  s.swapDir = null;
  s.noCalls = true;
  s.discards = 0;
  s.winners = 0;
  s.nextDealer = null;
  s.ledger = [];
  delete s.since;
  // 三人两房只有两门，不定缺：换完（或不换）直接开打
  s.phase = s.opts.swap ? 'swap' : s.opts.three ? 'turn' : 'que';
  for (const st of s.stats) st.rounds++;
  s.events.push({ e: 'deal', round: s.round, dealer: s.dealer });
}

/** 换三张：各家都选好后，按随机方向一起换（0 给下家、1 给对家、2 给上家；三人局没有对家，只有 0、2） */
export function finishSwap(s: XzState): void {
  const n = s.players.length;
  const dir = s.opts.three ? stream(s.key, 'swap', s.round).below(2) * 2 : stream(s.key, 'swap', s.round).below(3);
  s.swapDir = dir;
  const give = dir === 2 ? n - 1 : dir + 1;
  for (let i = 0; i < n; i++) {
    const p = s.players[i]!;
    const to = s.players[(i + give) % n]!;
    to.swapIn = p.swapOut!.slice();
  }
  for (const p of s.players) {
    p.hand = p.hand.filter((t) => !p.swapOut!.includes(t)).concat(p.swapIn!);
    sortHand(p);
  }
  s.phase = s.opts.three ? 'turn' : 'que';
  s.events.push({ e: 'swapped', dir });
}

export function resumeMut(s: XzState): void {
  if (s.phase !== 'end') return;
  startRound(s);
}

