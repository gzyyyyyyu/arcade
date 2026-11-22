/**
 * 玩家动作：立直 / 打牌 / 杠 / 自摸 / 九种九牌的选项，applyMut 动作入口，resumeMut，谁能出手，好友房换人。
 */
import { wallLeft } from '../../table/index.ts';
import { countsOf, kindOf, type Tile } from '../../tiles/index.ts';
import type { SeatKind } from '../types.ts';
import { isAgari, scoreWin, waitsOf } from './score.ts';
import { SEATS, type RcState, type RcAction } from './state.ts';
import { isYaochu, countKind, isClosed, emptyStats, flushDora, winContext } from './helpers.ts';
import { startRound, drawFor, advance } from './deal.ts';
import { openClaim, passDiscard, resolve, addKan, finishAddedKan } from './claims.ts';
import { recordWin, abort, endRound, standings } from './settle.ts';

// ---------- 动作 ----------

/** 立直时能打哪几张（打了以后还听牌）；条件不够返回空 */
export function riichiOptions(s: RcState, seat: number): Tile[] {
  const p = s.players[seat]!;
  if (s.phase !== 'turn' || s.turn !== seat || !s.canTsumo || p.riichi || !isClosed(p)) return [];
  if (s.points[seat]! < 1000 || wallLeft(s.wall) < 4) return [];
  const ok = new Set<number>();
  const c = countsOf(p.hand);
  for (const k of new Set(p.hand.map(kindOf))) {
    c[k]!--;
    if (waitsOf(c, p.melds.length).length) ok.add(k);
    c[k]!++;
  }
  return p.hand.filter((t) => ok.has(kindOf(t)));
}

/** 能打哪些牌：立直后只能打摸到的；刚吃碰不能食替 */
export function discardOptions(s: RcState, seat: number): Tile[] {
  const p = s.players[seat]!;
  if (p.riichi) return s.drawn !== null ? [s.drawn] : [];
  return p.hand.filter((t) => !p.banned.includes(kindOf(t)));
}

/** 自己这一手能杠的牌：暗杠、加杠；立直后只能暗杠摸到的那种，而且不改听的牌 */
export function kanOptions(s: RcState, seat: number): Tile[] {
  const p = s.players[seat]!;
  if (s.phase !== 'turn' || s.turn !== seat || !s.canTsumo || s.kans >= 4 || wallLeft(s.wall) <= 0) return [];
  const c = countsOf(p.hand);
  const out: Tile[] = [];
  for (let k = 0; k < 34; k++) {
    if (c[k] === 4) {
      if (p.riichi) {
        if (s.drawn === null || kindOf(s.drawn) !== k) continue;
        const before = waitsOf(countsOf(p.hand.filter((t) => t !== s.drawn)), p.melds.length);
        const rest = c.slice();
        rest[k] = 0;
        const after = waitsOf(rest, p.melds.length + 1);
        if (before.length !== after.length || before.some((x, i) => x !== after[i])) continue;
      }
      out.push(p.hand.find((t) => kindOf(t) === k)!);
    } else if (!p.riichi && c[k]! >= 1 && p.melds.some((m) => m.kind === 'pon' && kindOf(m.tiles[0]!) === k)) {
      out.push(p.hand.find((t) => kindOf(t) === k)!);
    }
  }
  return out;
}

export function canTsumo(s: RcState, seat: number): boolean {
  const p = s.players[seat]!;
  if (s.phase !== 'turn' || s.turn !== seat || !s.canTsumo || s.drawn === null) return false;
  if (!isAgari(countsOf(p.hand), p.melds.length)) return false;
  return scoreWin(p.hand, p.melds, winContext(s, seat, s.drawn, true, false)) !== null;
}

/** 九种九牌：自己第一次摸牌、这一局还没人鸣牌，手里幺九牌 9 种以上 */
export function canKyuushu(s: RcState, seat: number): boolean {
  const p = s.players[seat]!;
  if (s.phase !== 'turn' || s.turn !== seat || p.draws !== 1 || p.river.length || !s.noCalls) return false;
  return new Set(p.hand.map(kindOf).filter(isYaochu)).size >= 9;
}

/**
 * 做一步（原地改）。返回 null 是成功，字符串是错误码（固定的短码，不带牌面）。
 * 调用前 events 由调用方清空：这一步发生的事都记在里面。
 */
export function applyMut(s: RcState, seat: number, a: RcAction): string | null {
  if (seat < 0 || seat >= SEATS || !Number.isInteger(seat)) return 'bad_seat';
  const p = s.players[seat]!;
  switch (a.t) {
    case 'discard': {
      if (s.phase !== 'turn' || s.turn !== seat) return 'not_your_turn';
      if (!p.hand.includes(a.tile)) return 'bad_tile';
      if (a.riichi) {
        if (!riichiOptions(s, seat).includes(a.tile)) return 'cannot_riichi';
      } else if (!discardOptions(s, seat).includes(a.tile)) return p.riichi ? 'riichi_locked' : 'kuikae';
      p.hand.splice(p.hand.indexOf(a.tile), 1);
      p.river.push({ tile: a.tile, n: s.discards + 1 });
      if (a.riichi) {
        p.riichiAt = p.river.length - 1;
        s.pendingRiichi = seat;
      } else p.ippatsu = false;
      p.banned = [];
      s.drawn = null;
      s.canTsumo = false;
      s.rinshan = false;
      s.discards++;
      s.events.push({ e: 'discard', seat, tile: a.tile, riichi: !!a.riichi });
      flushDora(s);
      if (!openClaim(s, a.tile, seat, null) && !passDiscard(s)) advance(s, seat);
      return null;
    }
    case 'tsumo': {
      if (!canTsumo(s, seat)) return 'cannot_win';
      const win = recordWin(s, seat, s.drawn!, null, false, true);
      endRound(s, 'tsumo', seat === s.dealer, [win]);
      return null;
    }
    case 'kan': {
      if (!kanOptions(s, seat).includes(a.tile)) return 'cannot_kan';
      const k = kindOf(a.tile);
      s.drawn = null;
      if (countKind(p.hand, k) === 4) {
        const tiles = p.hand.filter((t) => kindOf(t) === k);
        p.hand = p.hand.filter((t) => kindOf(t) !== k);
        p.melds.push({ kind: 'kan', tiles, from: null, kan: 'concealed' });
        s.events.push({ e: 'kan', seat, from: null, tile: a.tile, kan: 'concealed' });
        addKan(s, seat, true);
        if (!openClaim(s, a.tile, seat, 'concealed')) drawFor(s, seat, true);
        return null;
      }
      if (!openClaim(s, a.tile, seat, 'added')) finishAddedKan(s, seat, a.tile);
      return null;
    }
    case 'kyuushu': {
      if (!canKyuushu(s, seat)) return 'cannot_abort';
      abort(s, 'nine_terminals');
      return null;
    }
    case 'claim': {
      const c = s.claim;
      if (s.phase !== 'claim' || !c || c.id !== a.w) return 'stale_claim';
      if (seat === c.from) return 'not_your_turn';
      if (c.ans[seat] !== null || c.bot[seat]) return 'already';
      const opts = c.opts[seat]!;
      if (!opts.length && !(a.bot && a.c === 'pass')) return 'no_claim';
      if (a.c !== 'pass' && !opts.includes(a.c)) return 'cannot_claim';
      if (a.c === 'chi' && a.low !== undefined && !c.chi[seat]!.includes(a.low)) return 'cannot_claim';
      c.ans[seat] = a.c;
      if (a.c === 'chi') c.low[seat] = a.low ?? c.chi[seat]![0]!;
      if (a.bot) c.bot[seat] = true;
      if (c.opts.every((o, i) => !o.length || c.ans[i] !== null)) resolve(s);
      return null;
    }
    case 'expire': {
      const c = s.claim;
      if (s.phase !== 'claim' || !c || c.id !== a.w) return 'stale_claim';
      if (seat === c.from) return 'not_your_turn';
      // 到点：还没答的人能和就和，否则过
      c.opts.forEach((o, i) => {
        if (o.length && c.ans[i] === null) c.ans[i] = o.includes('ron') ? 'ron' : 'pass';
      });
      resolve(s);
      return null;
    }
  }
}

export function resumeMut(s: RcState): void {
  if (s.phase !== 'end') return;
  startRound(s);
}

/** 这一刻谁能出手（声明窗口的名单见文件头） */
export function actorsOf(s: RcState): { seats: number[]; group: string } | null {
  switch (s.phase) {
    case 'turn':
      return { seats: [s.turn], group: `turn-${s.kyoku}` };
    case 'claim': {
      const c = s.claim!;
      return { seats: [0, 1, 2, 3].filter((i) => i !== c.from && !c.bot[i]), group: `claim-${c.id}` };
    }
    default:
      return null;
  }
}

/**
 * 好友房有人接管座位、带入到账：筹码重新记；点数不动，记下这个座位此刻的得分，终局时新来的人只按接手以后的涨落算：
 * 打完一整场和含马的那份比（entry），提前收场、离座和不含马的那份比（entryEarly），同一种算法相减。
 * 前一个人离座时按"没打完"结走（不算马，见 standings），两种算法之间的差和电脑代打那一段一样归庄家
 */
export function restakeMut(s: RcState, seat: number, chips: number): void {
  s.chips[seat] = chips;
  s.stake[seat] = chips;
  // 还没开打（开局时真人的带入到账也走这里）：从头算，不记；按名次算马时点数都一样也会差出几万分
  if (s.kyoku === 0 && s.discards === 0) return;
  s.entry = (s.entry ?? [0, 0, 0, 0]).map((x, i) => (i === seat ? standings(s).score[seat]! : x));
  s.entryEarly = (s.entryEarly ?? [0, 0, 0, 0]).map((x, i) => (i === seat ? standings(s, true).score[seat]! : x));
}

/** 好友房里座位换了人：只换"是谁"，统计从头算 */
export function seatedMut(s: RcState, seat: number, kind: SeatKind): void {
  if (s.kinds[seat] === kind) return;
  s.kinds[seat] = kind;
  s.stats[seat] = { ...emptyStats(), rounds: s.phase === 'end' || s.phase === 'over' ? 0 : 1 };
}
