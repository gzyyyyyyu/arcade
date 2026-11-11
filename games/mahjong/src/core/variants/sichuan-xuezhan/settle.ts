/** 一局结束的结算：流局退税、查花猪、查大叫，记小结、换庄、看一场打没打完。 */
import { payMany, payOne, type Payment } from '../../match/index.ts';
import { countsOf } from '../../tiles/index.ts';
import { NO_CONTEXT, scoreHand, unitOf } from './fan.ts';
import type { XzState } from './types.ts';
import { hasQue, isFlow, pay, tenpaiKinds, unfinished, winsOf } from './util.ts';

/** 一局结束：流局时退税、查花猪、查大叫；记小结，换庄，看一场打没打完 */
export function endRound(s: XzState, end: 'wall' | 'three'): void {
  s.claim = null;
  s.drawn = null;
  if (end === 'wall') {
    const left = unfinished(s);
    const pig = new Map<number, boolean>();
    const ting = new Map<number, number>();
    for (const i of left) {
      const p = s.players[i]!;
      pig.set(i, hasQue(p));
      const ks = tenpaiKinds(p);
      if (ks.length) {
        let best = 0;
        for (const k of ks) {
          const hand = countsOf(p.hand);
          hand[k]!++;
          best = Math.max(best, scoreHand(hand, p.melds, NO_CONTEXT, s.opts.cap).fan);
        }
        ting.set(i, best);
      }
    }
    // 退税：没听牌的人（含花猪）这一局收的杠钱退回去。杠上炮已经呼叫转移给胡的人的那部分不再退（不然赔两遍）：
    // 同一杠转走的数从先收的那几笔里扣
    for (const i of left) {
      if (ting.has(i)) continue;
      const moved = new Map<number, number>();
      for (const x of s.ledger) if (x.kind === 'move' && x.from === i && x.ref !== undefined) moved.set(x.ref, (moved.get(x.ref) ?? 0) + x.amount);
      const since = s.since ?? s.players.map(() => 0);
      const mine = (y: Payment, n: number): boolean => n >= since[y.to]! && n >= since[y.from]!;
      for (const x of s.ledger.filter((y, n) => y.kind === 'kan' && y.to === i && mine(y, n))) {
        const gone = Math.min(x.amount, moved.get(x.ref!) ?? 0);
        if (gone) moved.set(x.ref!, moved.get(x.ref!)! - gone);
        // 血流：已胡过的人不参加退税（既不赔也不收）
        if (isFlow(s) && s.players[x.from]!.won) continue;
        if (x.amount > gone) pay(s, payOne(s.chips, i, x.from, x.amount - gone, 'tax', x.ref));
      }
    }
    // 查花猪：赔给每个还没胡、不是花猪的人封顶的数
    const capUnit = unitOf(s.base, s.opts.cap);
    for (const i of left) {
      if (!pig.get(i)) continue;
      const dues = left.filter((j) => j !== i && !pig.get(j)).map((to) => ({ to, amount: capUnit }));
      if (dues.length) pay(s, payMany(s.chips, i, dues, 'pig'));
    }
    // 查大叫：没听牌的（不是花猪）赔给每个听牌的，按他能胡的最大番
    for (const i of left) {
      if (pig.get(i) || ting.has(i)) continue;
      const dues = left.filter((j) => ting.has(j)).map((to) => ({ to, amount: unitOf(s.base, ting.get(to)!) }));
      if (dues.length) pay(s, payMany(s.chips, i, dues, 'cha'));
    }
  }
  const net = s.chips.map((c, i) => c - s.start[i]!);
  net.forEach((n, i) => {
    const st = s.stats[i]!;
    st.best = Math.max(st.best, n);
  });
  const wins = s.players
    .flatMap((p, seat) => winsOf(p).map((w) => ({ w, seat })))
    .sort((a, b) => a.w.order - b.w.order)
    .map(({ w, seat }) => ({ seat, from: w.from, fan: w.fan, items: w.items }));
  s.history.push({ round: s.round, dealer: s.dealer, net, wins, end });
  s.events.push({ e: 'end', end });
  if (s.nextDealer !== null) s.dealer = s.nextDealer;
  s.round++;
  const over = s.round >= s.opts.rounds || s.chips.some((c) => c <= 0) || s.chips.some((c, i) => c >= s.stake[i]! + s.share * 3);
  s.phase = over ? 'over' : 'end';
  if (over) s.events.push({ e: 'over' });
}

