/**
 * 一局结算与一场推进：和牌收点、荒牌流局、中途流局、换庄与本场、名次与得分、一场结束换筹码。
 */
import type { Payment } from '../../match/index.ts';
import { distance } from '../../table/index.ts';
import { byTile, kindOf, type Tile } from '../../tiles/index.ts';
import { liability, payments, scoreWin } from './score.ts';
import { SEATS, START_POINTS, RETURN_POINTS, UMA, SHARE_POINTS, type RcEnd, type RcWin, type Final, type RcState, TABLE } from './state.ts';
import { ABORTS, isYaochu, doraIndicators, uraIndicators, tenpaiKinds, move, flush, winContext } from './helpers.ts';

export function recordWin(s: RcState, seat: number, tile: Tile, from: number | null, rob: boolean, bonus: boolean): RcWin {
  const p = s.players[seat]!;
  const hand = from === null ? p.hand.slice() : [...p.hand, tile].sort(byTile);
  const score = scoreWin(hand, p.melds, winContext(s, seat, tile, from === null, rob))!;
  const dealer = seat === s.dealer;
  const before = s.points[seat]!;
  const pays: Payment[] = [];
  const liable = score.yakuman ? liability(p.melds) : null;
  const pao = liable && liable.seat !== seat && score.yaku.some((y) => y.id === liable.yaku) ? liable.seat : null;
  const paoBase = pao === null ? 0 : 8000;
  const restBase = score.base - paoBase;
  if (from !== null) {
    if (pao !== null && pao !== from) {
      const half = (payments(paoBase, dealer, false) as { ron: number }).ron / 2;
      move(s, pays, pao, seat, half, 'pao');
      move(s, pays, from, seat, half, 'ron');
    } else if (paoBase) move(s, pays, from, seat, (payments(paoBase, dealer, false) as { ron: number }).ron, 'ron');
    if (restBase > 0) move(s, pays, from, seat, (payments(restBase, dealer, false) as { ron: number }).ron, 'ron');
    if (bonus) move(s, pays, from, seat, 300 * s.honba, 'honba');
  } else {
    if (pao !== null) {
      move(s, pays, pao, seat, (payments(paoBase, dealer, false) as { ron: number }).ron, 'pao');
      if (bonus) move(s, pays, pao, seat, 300 * s.honba, 'honba');
    }
    if (restBase > 0) {
      const t = payments(restBase, dealer, true) as { dealer: number; other: number };
      for (let i = 0; i < SEATS; i++) if (i !== seat) move(s, pays, i, seat, i === s.dealer ? t.dealer : t.other, 'tsumo');
    }
    if (bonus && pao === null) for (let i = 0; i < SEATS; i++) if (i !== seat) move(s, pays, i, seat, 100 * s.honba, 'honba');
  }
  if (bonus && s.sticks) {
    move(s, pays, TABLE, seat, 1000 * s.sticks, 'stick');
    s.sticks = 0;
  }
  const st = s.stats[seat]!;
  st.wins++;
  if (from === null) st.tsumo++;
  else s.stats[from]!.dealIn++;
  st.maxHan = Math.max(st.maxHan, score.yakuman ? 13 : score.han);
  if (score.yakuman) st.yakuman++;
  p.hand = hand;
  s.events.push({ e: 'win', seat, from, tile, score, rob });
  flush(s, pays);
  return { seat, from, tile, score, hand: hand.slice(), melds: structuredClone(p.melds), gain: s.points[seat]! - before, pao };
}

/** 荒牌流局：流局满贯优先（按满贯自摸收，不加本场），没有就付不听罚符 3,000；庄家听牌连庄，本场 +1 */
export function exhaust(s: RcState): void {
  const tenpai = s.players.map((p) => tenpaiKinds(p).length > 0);
  const nagashi = s.players.map((p) => p.river.length > 0 && p.river.every((r) => isYaochu(kindOf(r.tile)) && !r.taken));
  const pays: Payment[] = [];
  if (nagashi.some(Boolean)) {
    nagashi.forEach((x, seat) => {
      if (!x) return;
      const t = payments(2000, seat === s.dealer, true) as { dealer: number; other: number };
      for (let i = 0; i < SEATS; i++) if (i !== seat) move(s, pays, i, seat, i === s.dealer ? t.dealer : t.other, 'nagashi');
    });
  } else {
    const n = tenpai.filter(Boolean).length;
    if (n > 0 && n < SEATS) {
      const each = 3000 / ((SEATS - n) * n);
      tenpai.forEach((x, i) => {
        if (x) return;
        tenpai.forEach((y, j) => y && move(s, pays, i, j, each, 'noten'));
      });
    }
  }
  flush(s, pays);
  endRound(s, nagashi.some(Boolean) ? 'nagashi' : 'draw', tenpai[s.dealer]!, [], tenpai);
}

/** 中途流局：庄家不变，本场 +1，供托留在桌上 */
export function abort(s: RcState, end: RcEnd): void {
  endRound(s, end, true, []);
}

/** 现在的名次：点数高的在前，同分按起家顺序 */
export function ranking(points: readonly number[], first: number): number[] {
  return [0, 1, 2, 3].sort((a, b) => points[b]! - points[a]! || distance(first, a, SEATS) - distance(first, b, SEATS));
}

/** 这一局是不是最后一局（南四局、东风战东四局）或之后的延长局 */
export function allLast(s: RcState): boolean {
  if (s.opts.length === 'ikkyoku') return true;
  const last = s.opts.length === 'hanchan' ? 1 : 0;
  return s.wind > last || (s.wind === last && s.hand === 3);
}

/**
 * 一局结束：记小结；换庄、本场；看一场结束没有（飞了；最后一局庄家第一且 30,000 以上就停；
 * 最后一局之后有人到 30,000 就结束，没人到就西入（东风战南入），延长场打完也结束）
 */
export function endRound(s: RcState, end: RcEnd, renchan: boolean, wins: RcWin[], tenpai: boolean[] | null = null): void {
  s.claim = null;
  s.drawn = null;
  s.pendingRiichi = null;
  // 一局一结：流局、中途流局时桌上的供托退给立直的人（只有一局，没有下一局可留；和了时供托已给了和牌的人）
  if (s.opts.length === 'ikkyoku' && s.sticks) {
    s.players.forEach((p, i) => {
      if (p.riichi && s.sticks) {
        s.points[i]! += 1000;
        s.sticks--;
      }
    });
  }
  const delta = s.points.map((x, i) => x - s.start[i]!);
  delta.forEach((d, i) => {
    const st = s.stats[i]!;
    st.best = Math.max(st.best, d);
  });
  const ura = wins.some((w) => s.players[w.seat]!.riichi) ? uraIndicators(s) : [];
  s.history.push({ wind: s.wind, hand: s.hand, honba: s.honba, dealer: s.dealer, end, delta, wins, tenpai, dora: doraIndicators(s), ura });
  s.events.push({ e: 'end', end });
  const wasLast = allLast(s);
  const top = ranking(s.points, s.first)[0]!;
  let over = s.points.some((x) => x < 0) || s.opts.length === 'ikkyoku';
  if (renchan) {
    s.honba++;
    if (wasLast && !ABORTS.has(end) && top === s.dealer && s.points[s.dealer]! >= RETURN_POINTS) over = true;
  } else {
    s.honba = end === 'ron' || end === 'tsumo' ? 0 : s.honba + 1;
    s.hand++;
    if (s.hand === SEATS) {
      s.hand = 0;
      s.wind++;
    }
    s.dealer = (s.first + s.hand) % SEATS;
    if (wasLast && Math.max(...s.points) >= RETURN_POINTS) over = true;
    if (s.wind > (s.opts.length === 'hanchan' ? 2 : 1)) over = true;
  }
  s.kyoku++;
  if (over) return finishMatch(s);
  s.phase = 'end';
}

const midHand = (s: RcState): boolean => s.phase === 'turn' || s.phase === 'claim';

/**
 * 现在的名次和得分（不改状态）。得分按点数记（+52.3 记 52,300），四家合计 0，桌上的供托算给第一名。
 * - 打完了：点数 − 返点 + 马，第一名加头名奖；
 * - 一局一结：和打一半收场一样，只按点数差；
 * - 没打完就收场（early：好友房有人离座、提前收场，单机中途离开）：只按点数差（点数 − 起始点数），不算马和头名奖，
 *   一局打到一半的这一局不算（按这一局开始时的点数和供托）。马和头名奖是打完一整场才有的东西，
 *   开局点数都一样时按起家排第一就能白拿头名奖，一开局就走能刷筹码
 */
export function standings(s: RcState, early = false): Final {
  const half = early && midHand(s);
  const points = half ? s.start : s.points;
  const sticks = half ? (s.sticks0 ?? 0) : s.sticks;
  const rank = ranking(points, s.first);
  const oka = (RETURN_POINTS - START_POINTS) * SEATS;
  const score = points.map((x, i) => {
    const r = rank.indexOf(i);
    const bonus = r === 0 ? 1000 * sticks : 0;
    return early || s.opts.length === 'ikkyoku' ? x + bonus - START_POINTS : x + bonus - RETURN_POINTS + UMA[r]! * 1000 + (r === 0 ? oka : 0);
  });
  return { rank, score };
}

/**
 * 一场结束（early 见 standings）：桌上的供托给第一名，按 standings 的得分换筹码（SHARE_POINTS 分换一份）。
 * 每个座位按"现在坐着的人接手以后"的得分算（entry，好友房中途接管时记）：前一个人离座时已经按那一刻的得分结走了。
 * 输的最多输掉带来的；赢家按应得的比例分输家付得出的，再加上离座的人和庄家之间已经结过的那部分（庄家补上或收回），
 * 所以没人中途换手时四家的筹码总数守恒
 */
export function finishMatch(s: RcState, early = false): void {
  const f = standings(s, early);
  if (early && midHand(s)) {
    s.points = s.start.slice();
    s.sticks = s.sticks0 ?? 0;
  }
  if (s.sticks) {
    s.points[f.rank[0]!]! += 1000 * s.sticks;
    s.sticks = 0;
  }
  s.final = f;
  s.claim = null;
  const per = SHARE_POINTS[s.opts.length];
  const chipsOf = (x: number): number => (x < 0 ? -1 : 1) * Math.floor((Math.abs(x) * s.share) / per);
  // 和 standings 同一种算法的那份比：提前收场不含马（entryEarly），打完含马（entry）
  const entry = (early ? (s.entryEarly ?? s.entry) : s.entry) ?? [0, 0, 0, 0];
  const delta = f.score.map((x, i) => x - entry[i]!);
  const owe = delta.map((x, i) => (x < 0 ? Math.min(chipsOf(-x), Math.max(0, s.chips[i]!)) : 0));
  const want = delta.map((x) => (x > 0 ? chipsOf(x) : 0));
  const pool = Math.max(0, owe.reduce((a, b) => a + b, 0) + chipsOf(-entry.reduce((a, b) => a + b, 0)));
  const total = want.reduce((a, b) => a + b, 0);
  const got = want.map((w) => (total ? Math.floor((w * pool) / total) : 0));
  // 整除剩下的零头按名次给（第一名先拿）
  let left = pool - got.reduce((a, b) => a + b, 0);
  for (const i of f.rank) {
    if (left <= 0 || !total) break;
    if (want[i]! > 0) {
      got[i]!++;
      left--;
    }
  }
  s.chips = s.chips.map((c, i) => c - owe[i]! + got[i]!);
  s.phase = 'over';
  s.events.push({ e: 'over' });
}
