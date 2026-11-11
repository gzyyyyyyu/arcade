/** 胡牌与杠钱：记一次胡、算番收钱、给称号打标记，以及刮风下雨的收款。 */
import { payOne, type Payment } from '../../match/index.ts';
import type { KanType } from '../../table/index.ts';
import { byTile, countsOf, type Tile } from '../../tiles/index.ts';
import { scoreHand, unitOf, type FanItem, type WinContext } from './fan.ts';
import { KAN_PAY, type Win, type XzState } from './types.ts';
import { flag, isFlow, pay, payersOf, winsOf } from './util.ts';

/** 有人胡了：记下来、收钱。ron 时 from 是点炮的人；自摸时 from 是 null，每个还没胡的别家付 */
/** 点炮的胡：先记下要收多少（一炮多响时几家一起按比例付，见下面），自摸当场付 */
export function recordWin(s: XzState, seat: number, tile: Tile, from: number | null, ctx: WinContext, dues?: { to: number; amount: number }[]): void {
  const p = s.players[seat]!;
  const hand = from === null ? p.hand.slice() : [...p.hand, tile].sort(byTile);
  const r = scoreHand(countsOf(hand), p.melds, ctx, s.opts.cap);
  const unit = unitOf(s.base, r.fan);
  s.winners++;
  const win: Win = { order: s.winners, tile, from, fan: r.fan, items: r.items, capped: r.capped, hand };
  p.wins = [...winsOf(p), win];
  p.won ??= win;
  if (!isFlow(s)) p.hand = hand;
  // 血流：手牌锁在 13 张。点炮胡的那张没进手牌，自摸胡的那张从手里摘出来（它是公开的，记在胡里）
  else if (from === null && p.hand.includes(tile)) p.hand.splice(p.hand.indexOf(tile), 1);
  if (from === null) {
    const extra = s.opts.zimo === 'di' ? s.base : 0;
    const pays: Payment[] = [];
    for (const i of payersOf(s, seat)) pays.push(...payOne(s.chips, i, seat, unit + extra, 'zimo'));
    pay(s, pays);
  } else {
    if (dues) dues.push({ to: seat, amount: unit });
    else pay(s, payOne(s.chips, from, seat, unit, 'hu'));
    s.stats[from]!.pao++;
  }
  const st = s.stats[seat]!;
  st.wins++;
  if (from === null) st.zimo++;
  st.maxFan = Math.max(st.maxFan, r.fan);
  for (const it of r.items) {
    const id = TITLE_OF_FAN[it.id];
    if (id) flag(st, id);
  }
  if (r.capped) flag(st, 'xz_capped');
  // "第三个胡"是血战才有的说法，血流里没人下桌
  if (s.winners === s.players.length - 1 && !isFlow(s)) flag(st, 'xz_last_stand');
  s.events.push({ e: 'hu', seat, from, tile, fan: r.fan, items: r.items, rob: ctx.rob, n: p.wins.length });
}

const TITLE_OF_FAN: Partial<Record<FanItem['id'], string>> = {
  qing: 'xz_qing',
  longqidui: 'xz_dragon',
  qidui: 'xz_seven',
  jingou: 'xz_golden_hook',
  gangkai: 'xz_gang_flower',
  qianggang: 'xz_rob_gang',
  haidi: 'xz_sea_moon',
  tianhu: 'xz_heaven',
  dihu: 'xz_earth',
};

/** 收杠钱（刮风下雨）：直杠点杠的人付，补杠、暗杠每个还没胡的别家付 */
export function kanPay(s: XzState, seat: number, kan: KanType, from: number | null): number {
  const ref = ++s.kanSeq;
  const amount = KAN_PAY[kan] * s.base;
  const pays: Payment[] = [];
  if (kan === 'direct') pays.push(...payOne(s.chips, from!, seat, amount, 'kan', ref));
  else for (const i of payersOf(s, seat)) pays.push(...payOne(s.chips, i, seat, amount, 'kan', ref));
  pay(s, pays);
  s.stats[seat]!.gangs++;
  s.noCalls = false;
  return ref;
}

