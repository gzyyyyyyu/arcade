/**
 * 开场与摸牌：begin 开一场、startRound 发牌开一局、drawFor 摸牌（含岭上牌、海底）、advance 轮到下家。
 */
import { type Entropy, stream } from 'arcade-kit/rng';
import { drawHead, newWall, wallLeft } from '../../table/index.ts';
import { buildWall, byTile, type Tile } from '../../tiles/index.ts';
import type { MatchSetup, SeatKind } from '../types.ts';
import { VARIANT, RULES_VERSION, SEATS, TILESET, START_POINTS, DEAD_WALL, RINSHAN0, type RcOpts, type RcState } from './state.ts';
import { emptyStats, emptyPlayer, revealDora } from './helpers.ts';
import { exhaust } from './settle.ts';

// ---------- 一场、一局 ----------

export function begin(key: Entropy, opts: RcOpts, kinds: readonly SeatKind[], setup: MatchSetup): RcState {
  const first = stream(key, 'seat', 0).below(SEATS);
  const s: RcState = {
    variant: VARIANT,
    v: RULES_VERSION,
    key: [...key],
    opts: { ...opts },
    share: setup.share,
    base: setup.base,
    kinds: [...kinds],
    personas: [...setup.personas],
    ...(setup.tunes ? { tunes: setup.tunes.map((t) => ({ ...t })) } : {}),
    chips: setup.chips ? [...setup.chips] : Array.from({ length: SEATS }, () => setup.share),
    stake: setup.chips ? [...setup.chips] : Array.from({ length: SEATS }, () => setup.share),
    points: Array.from({ length: SEATS }, () => START_POINTS),
    start: [],
    first,
    wind: 0,
    hand: 0,
    honba: 0,
    sticks: 0,
    kyoku: 0,
    dealer: first,
    phase: 'turn',
    wall: newWall([], 0),
    dead: [],
    doraOpen: 0,
    pendingDora: 0,
    kans: 0,
    kanBy: [],
    players: [],
    turn: first,
    drawn: null,
    canTsumo: false,
    rinshan: false,
    claim: null,
    claimSeq: 0,
    noCalls: true,
    discards: 0,
    pendingRiichi: null,
    ledger: [],
    events: [],
    history: [],
    stats: Array.from({ length: SEATS }, emptyStats),
    final: null,
  };
  startRound(s);
  return s;
}

export function startRound(s: RcState): void {
  const tiles = buildWall(TILESET, stream(s.key, 'deal', s.kyoku));
  s.dead = tiles.slice(0, DEAD_WALL);
  const live = tiles.slice(DEAD_WALL);
  s.players = Array.from({ length: SEATS }, emptyPlayer);
  for (let i = 0; i < SEATS; i++) {
    const p = s.players[(s.dealer + i) % SEATS]!;
    p.hand = live.slice(i * 13, i * 13 + 13).sort(byTile);
  }
  s.wall = newWall(live, SEATS * 13);
  s.start = s.points.slice();
  s.sticks0 = s.sticks;
  s.doraOpen = 0;
  s.pendingDora = 0;
  s.kans = 0;
  s.kanBy = [];
  s.claim = null;
  s.noCalls = true;
  s.discards = 0;
  s.pendingRiichi = null;
  s.ledger = [];
  for (const st of s.stats) st.rounds++;
  s.events.push({ e: 'deal', wind: s.wind, hand: s.hand, honba: s.honba, dealer: s.dealer });
  revealDora(s);
  drawFor(s, s.dealer, false);
}

/** 摸牌：岭上牌从王牌区摸，海底跟着往前缩一张（王牌区一直是 14 张）；牌墙摸完了荒牌流局 */
export function drawFor(s: RcState, seat: number, rinshan: boolean): void {
  let t: Tile | null;
  if (rinshan) {
    t = s.dead[RINSHAN0 + s.kans - 1]!;
    s.wall.tail--;
  } else {
    t = drawHead(s.wall);
    if (t === null) return exhaust(s);
  }
  const p = s.players[seat]!;
  p.hand.push(t);
  p.hand.sort(byTile);
  p.draws++;
  p.passed = false;
  s.turn = seat;
  s.drawn = t;
  s.canTsumo = true;
  s.rinshan = rinshan;
  s.phase = 'turn';
  s.events.push({ e: 'draw', seat, tile: t, rinshan });
}

export function advance(s: RcState, from: number): void {
  if (wallLeft(s.wall) <= 0) return exhaust(s);
  drawFor(s, (from + 1) % SEATS, false);
}
