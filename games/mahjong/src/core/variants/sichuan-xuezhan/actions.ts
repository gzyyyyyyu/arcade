/** 轮到自己时的动作：能杠哪些、能打哪些、能不能自摸，以及统一入口 applyMut（原地改）。 */
import { wallLeft, type Meld } from '../../table/index.ts';
import { byTile, countsOf, kindOf, suitOf, type Tile } from '../../tiles/index.ts';
import { NO_CONTEXT } from './fan.ts';
import { finishAddedKan, openClaim, resolve } from './claim.ts';
import { advance, drawFor } from './draw.ts';
import { finishSwap } from './round.ts';
import { endRound } from './settle.ts';
import type { XzAction, XzPlayer, XzState } from './types.ts';
import { canWin, countKind, doneAll, isFlow, tenpaiKinds } from './util.ts';
import { kanPay, recordWin } from './win.ts';

// ---------- 动作 ----------

/**
 * 血流里已胡的人杠完，听的牌必须和杠前一样（杠前 = 手里去掉刚摸的那张，也就是锁住的 13 张）。
 * 暗杠和补杠都要比：杠出去的牌四张用完，原来听它的就变了
 */
function kanKeepsWait(s: XzState, p: XzPlayer, tile: Tile): boolean {
  const k = kindOf(tile);
  const before = tenpaiKinds({ ...p, hand: p.hand.filter((t) => t !== s.drawn) });
  const four = countKind(p.hand, k) === 4;
  const hand = four ? p.hand.filter((t) => kindOf(t) !== k) : p.hand.filter((t) => t !== tile);
  const melds: Meld[] = four
    ? [...p.melds, { kind: 'kan', tiles: p.hand.filter((t) => kindOf(t) === k), from: null, kan: 'concealed' }]
    : p.melds.map((m) => (m.kind === 'pon' && kindOf(m.tiles[0]!) === k ? { ...m, kind: 'kan' as const, kan: 'added' as const, tiles: [...m.tiles, tile] } : m));
  // 杠完要补一张再打，补的那张只能打出去，所以杠后的 13 张就是现在手里剩下的
  const after = tenpaiKinds({ ...p, hand, melds });
  return before.length === after.length && before.every((x, i) => x === after[i]);
}

/** 自己这一手能杠的牌：暗杠（手里四张）、补杠（碰过、手里有第四张）；缺门不能杠，牌墙空了不能杠；血流里已胡的人还要杠完不改听 */
export function kanOptions(s: XzState, seat: number): Tile[] {
  const p = s.players[seat]!;
  if (wallLeft(s.wall) <= 0) return [];
  const out: Tile[] = [];
  const c = countsOf(p.hand);
  for (let k = 0; k < 27; k++) {
    if (suitOf(k) === p.que) continue;
    if (c[k] === 4) out.push(p.hand.find((t) => kindOf(t) === k)!);
    else if (c[k]! >= 1 && p.melds.some((m) => m.kind === 'pon' && kindOf(m.tiles[0]!) === k)) out.push(p.hand.find((t) => kindOf(t) === k)!);
  }
  return p.won && isFlow(s) ? out.filter((t) => kanKeepsWait(s, p, t)) : out;
}

/** 能打哪些牌：有缺先打缺 */
export function discardOptions(p: XzPlayer): Tile[] {
  const que = p.hand.filter((t) => suitOf(kindOf(t)) === p.que);
  return que.length ? que : p.hand.slice();
}

/** 这一手真正能打的牌：血流里已胡的人手牌锁住，只能打刚摸的那张 */
export function discardChoices(s: XzState, seat: number): Tile[] {
  const p = s.players[seat]!;
  return p.won && isFlow(s) && s.drawn !== null && p.hand.includes(s.drawn) ? [s.drawn] : discardOptions(p);
}

export function canZimo(s: XzState, seat: number): boolean {
  const p = s.players[seat]!;
  return s.phase === 'turn' && s.turn === seat && s.canZimo && canWin(p, p.hand);
}

/**
 * 做一步（原地改）。返回 null 是成功，字符串是错误码（固定的短码，不带牌面）。
 * 调用前 events 由调用方清空：这一步发生的事都记在里面。
 */
export function applyMut(s: XzState, seat: number, a: XzAction): string | null {
  if (seat < 0 || seat >= s.players.length || !Number.isInteger(seat)) return 'bad_seat';
  const p = s.players[seat]!;
  switch (a.t) {
    case 'swap': {
      if (s.phase !== 'swap') return 'not_now';
      if (p.swapOut) return 'already';
      if (a.tiles.length !== 3 || new Set(a.tiles).size !== 3 || !a.tiles.every((t) => p.hand.includes(t))) return 'bad_tiles';
      const suit = suitOf(kindOf(a.tiles[0]!));
      if (!a.tiles.every((t) => suitOf(kindOf(t)) === suit)) return 'same_suit';
      p.swapOut = a.tiles.slice().sort(byTile);
      if (s.players.every((x) => x.swapOut)) finishSwap(s);
      return null;
    }
    case 'que': {
      if (s.phase !== 'que') return 'not_now';
      if (p.que >= 0) return 'already';
      if (a.suit !== 0 && a.suit !== 1 && a.suit !== 2) return 'bad_suit';
      p.que = a.suit;
      if (s.players.every((x) => x.que >= 0)) {
        s.phase = 'turn';
        s.turn = s.dealer;
        s.canZimo = true;
        s.events.push({ e: 'que' });
      }
      return null;
    }
    case 'discard': {
      if (s.phase !== 'turn' || s.turn !== seat) return 'not_your_turn';
      if (!p.hand.includes(a.tile)) return 'bad_tile';
      if (!discardChoices(s, seat).includes(a.tile)) return p.won && isFlow(s) ? 'locked' : 'que_first';
      p.hand.splice(p.hand.indexOf(a.tile), 1);
      p.river.push({ tile: a.tile });
      s.discards++;
      s.drawn = null;
      s.canZimo = false;
      const kanRef = s.afterKan;
      s.afterKan = null;
      s.events.push({ e: 'discard', seat, tile: a.tile });
      if (!openClaim(s, a.tile, seat, false, kanRef)) advance(s, seat);
      return null;
    }
    case 'zimo': {
      if (!canZimo(s, seat)) return 'cannot_win';
      const tian = seat === s.dealer && s.discards === 0 && p.draws === 0;
      // 天胡没有摸的那张：记庄家起手的第 14 张（发牌时最后发给他的，牌墙第 53 张）；换三张换走了就记手里最后一张
      const first = s.wall.tiles[s.players.length * 13]!;
      const tile = s.drawn ?? (tian && p.hand.includes(first) ? first : p.hand[p.hand.length - 1]!);
      const di = seat !== s.dealer && p.draws === 1 && p.river.length === 0 && s.noCalls && !p.won;
      if (s.winners === 0) s.nextDealer = seat;
      recordWin(s, seat, tile, null, {
        ...NO_CONTEXT,
        zimo: true,
        gangKai: s.afterKan !== null,
        haidi: wallLeft(s.wall) === 0,
        tian,
        di,
        zimoFan: s.opts.zimo === 'fan',
      });
      s.drawn = null;
      s.afterKan = null;
      if (doneAll(s)) {
        endRound(s, 'three');
        return null;
      }
      advance(s, seat);
      return null;
    }
    case 'kan': {
      if (s.phase !== 'turn' || s.turn !== seat) return 'not_your_turn';
      if (!kanOptions(s, seat).includes(a.tile)) return 'cannot_kan';
      const k = kindOf(a.tile);
      if (countKind(p.hand, k) === 4) {
        const tiles = p.hand.filter((t) => kindOf(t) === k);
        p.hand = p.hand.filter((t) => kindOf(t) !== k);
        p.melds.push({ kind: 'kan', tiles, from: null, kan: 'concealed' });
        s.events.push({ e: 'kan', seat, from: null, tile: a.tile, kan: 'concealed' });
        const ref = kanPay(s, seat, 'concealed', null);
        drawFor(s, seat, true);
        if (s.phase === 'turn') s.afterKan = ref;
        return null;
      }
      // 补杠：先看有没有人抢杠
      s.drawn = null;
      if (!openClaim(s, a.tile, seat, true, null)) finishAddedKan(s, seat, a.tile);
      return null;
    }
    case 'claim': {
      const c = s.claim;
      if (s.phase !== 'claim' || !c || c.id !== a.w) return 'stale_claim';
      if (seat === c.from || (p.won && !isFlow(s))) return 'not_your_turn';
      if (c.ans[seat] !== null || c.bot[seat]) return 'already';
      const opts = c.opts[seat]!;
      if (!opts.length && !(a.bot && a.c === 'pass')) return 'no_claim';
      if (a.c !== 'pass' && !opts.includes(a.c)) return 'cannot_claim';
      c.ans[seat] = a.c;
      if (a.bot) c.bot[seat] = true;
      if (c.opts.every((o, i) => !o.length || c.ans[i] !== null)) resolve(s);
      return null;
    }
    case 'expire': {
      const c = s.claim;
      if (s.phase !== 'claim' || !c || c.id !== a.w) return 'stale_claim';
      if (seat === c.from || (p.won && !isFlow(s))) return 'not_your_turn';
      // 到点：还没答的人能胡就胡，否则过
      c.opts.forEach((o, i) => {
        if (o.length && c.ans[i] === null) c.ans[i] = o.includes('ron') ? 'ron' : 'pass';
      });
      resolve(s);
      return null;
    }
  }
}

