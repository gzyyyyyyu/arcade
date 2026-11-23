/** 声明窗口：别人打出或补杠一张牌后，谁能碰杠胡，以及裁决（胡 > 杠 / 碰、一炮多响、呼叫转移）。 */
import { payMany } from '../../match/index.ts';
import { distance, resolveClaims, wallLeft, type ClaimKind } from '../../table/index.ts';
import { byTile, kindOf, suitOf, type Tile } from '../../tiles/index.ts';
import { NO_CONTEXT } from './fan.ts';
import { advance, drawFor } from './draw.ts';
import { endRound } from './settle.ts';
import type { XzState } from './types.ts';
import { canWin, countKind, doneAll, hasQue, isFlow, pay } from './util.ts';
import { kanPay, recordWin } from './win.ts';

/** 别人打出（或补杠）一张以后谁能做什么；只要有人有选择就开窗口，返回开没开 */
export function openClaim(s: XzState, tile: Tile, from: number, rob: boolean, kanRef: number | null): boolean {
  const k = kindOf(tile);
  const opts: ClaimKind[][] = s.players.map(() => []);
  let any = false;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i]!;
    // 血战里胡了的人下桌；血流里留着，但手牌锁住，只能胡或过
    if (i === from || (p.won && !isFlow(s)) || suitOf(k) === p.que) continue;
    const o = opts[i]!;
    if (!hasQue(p) && canWin(p, [...p.hand, tile])) o.push('ron');
    if (!rob && !p.won && wallLeft(s.wall) > 0) {
      const n = countKind(p.hand, k);
      if (n >= 3) o.push('kan');
      if (n >= 2) o.push('pon');
    }
    if (o.length) any = true;
  }
  if (!any) return false;
  s.claim = {
    id: ++s.claimSeq,
    tile,
    from,
    rob,
    kanRef,
    haidi: wallLeft(s.wall) === 0,
    opts,
    ans: s.players.map(() => null),
    bot: s.players.map(() => false),
  };
  s.phase = 'claim';
  return true;
}

/** 有选择的人都答完了（或者到点了）：胡 > 杠 / 碰，一炮多响 */
export function resolve(s: XzState): void {
  const c = s.claim!;
  s.claim = null;
  const ans = c.ans.map((a, i) => (c.opts[i]!.length ? (a ?? 'pass') : null));
  const r = resolveClaims(ans, c.from, true);
  const thrower = s.players[c.from]!;
  if (r && 'ron' in r) {
    if (s.winners === 0 && r.ron.length > 1) s.nextDealer = c.from;
    else if (s.winners === 0) s.nextDealer = r.ron[0]!;
    if (c.rob) thrower.hand.splice(thrower.hand.indexOf(c.tile), 1);
    else thrower.river[thrower.river.length - 1]!.taken = true;
    // 一炮多响：几家的胡一起付，点炮的付不起时按应收的比例分
    const dues: { to: number; amount: number }[] = [];
    for (const seat of r.ron) {
      recordWin(s, seat, c.tile, c.from, { ...NO_CONTEXT, gangPao: c.kanRef !== null, rob: c.rob, haidi: c.haidi }, dues);
    }
    pay(s, payMany(s.chips, c.from, dues, 'hu'));
    // 呼叫转移：那一杠收到的钱转给胡的人（平分，零头给离点炮者最近的）
    if (c.kanRef !== null && s.opts.transfer) {
      const got = s.ledger.filter((x) => x.kind === 'kan' && x.ref === c.kanRef && x.to === c.from).reduce((a, x) => a + x.amount, 0);
      if (got > 0) {
        const each = Math.floor(got / r.ron.length);
        const dues = r.ron.map((to, i) => ({ to, amount: each + (i === 0 ? got - each * r.ron.length : 0) }));
        pay(s, payMany(s.chips, c.from, dues, 'move', c.kanRef));
      }
    }
    if (doneAll(s)) return endRound(s, 'three');
    const n = s.players.length;
    const last = r.ron.reduce((a, b) => (distance(c.from, b, n) > distance(c.from, a, n) ? b : a));
    return advance(s, last);
  }
  if (r) {
    const p = s.players[r.seat]!;
    const k = kindOf(c.tile);
    const mine = p.hand.filter((t) => kindOf(t) === k).slice(0, r.kind === 'kan' ? 3 : 2);
    p.hand = p.hand.filter((t) => !mine.includes(t));
    thrower.river[thrower.river.length - 1]!.taken = true;
    const tiles = [...mine, c.tile].sort(byTile);
    s.turn = r.seat;
    s.afterKan = null;
    if (r.kind === 'kan') {
      p.melds.push({ kind: 'kan', tiles, from: c.from, kan: 'direct' });
      s.events.push({ e: 'kan', seat: r.seat, from: c.from, tile: c.tile, kan: 'direct' });
      const ref = kanPay(s, r.seat, 'direct', c.from);
      drawFor(s, r.seat, true);
      if (s.phase === 'turn') s.afterKan = ref;
      return;
    }
    p.melds.push({ kind: 'pon', tiles, from: c.from });
    s.noCalls = false;
    s.drawn = null;
    s.canZimo = false;
    s.phase = 'turn';
    s.events.push({ e: 'pon', seat: r.seat, from: c.from, tile: c.tile });
    return;
  }
  // 没人要
  if (c.rob) return finishAddedKan(s, c.from, c.tile);
  advance(s, c.from);
}

export function finishAddedKan(s: XzState, seat: number, tile: Tile): void {
  const p = s.players[seat]!;
  const k = kindOf(tile);
  p.hand.splice(p.hand.indexOf(tile), 1);
  const m = p.melds.find((x) => x.kind === 'pon' && kindOf(x.tiles[0]!) === k)!;
  m.kind = 'kan';
  m.kan = 'added';
  m.tiles = [...m.tiles, tile].sort(byTile);
  s.events.push({ e: 'kan', seat, from: m.from, tile, kan: 'added' });
  const ref = kanPay(s, seat, 'added', null);
  drawFor(s, seat, true);
  if (s.phase === 'turn') s.afterKan = ref;
}

