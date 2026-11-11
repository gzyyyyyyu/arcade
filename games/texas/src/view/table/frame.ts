/** 视图 → 画面帧，以及动画要用的小算法（table.ts 拆分） */
import type { Card } from '../../core/cards.ts';
import { categoryOf, evalCards } from '../../core/eval.ts';
import type { Action, HandResult, LogEntry } from '../../core/table.ts';
import type { View } from '../../core/view.ts';
import { bluffer } from '../../core/fame.ts';
import { chips, handName } from '../text.ts';
import type { Frame } from './types.ts';
import { must } from '../../must.ts';

// ---------- 视图 → 画面 ----------

export function frameOf(v: View): Frame {
  // 一手打完停着：摆这一手的结尾（公共牌、亮出的牌、谁赢了），筹码已经分完
  const r = v.hold ? v.lastHand : null;
  const tags = r ? [] : tagsOf(v);
  return {
    handNo: v.handNo,
    board: r ? [...r.board] : [...v.board],
    pots: r ? [] : [...v.pots],
    button: v.phase === 'idle' && v.handNo === 0 ? -1 : v.button,
    toAct: v.toAct,
    bb: v.bb,
    seats: v.seats.map((s, i) => {
      const sh = r?.shown.find((x) => x.seat === i);
      // 一手打完后主动亮的：亮的那张翻开，没亮的盖着
      const sw = r?.showed?.find((x) => x.seat === i);
      const kept = i === v.me ? v.kept : undefined;
      return {
        owner: s.owner,
        persona: s.persona,
        stack: s.stack,
        bet: s.bet,
        status: s.status,
        away: s.away,
        leaving: s.leaving,
        // kept 里可能有 null（只留了一张），includes 给 false，所以不用 must()
        cards: sh ? [...sh.hole] : sw ? (kept ?? [null, null]).map((c, k) => (kept ? (sw.cards.includes(c!) ? c : null) : (sw.cards[k] ?? null))) : s.status === 'active' || s.status === 'allin' ? (i === v.me && v.hole.length ? [...v.hole] : [null, null]) : [],
        hand: sh && !must(r, 'r').byFold ? showName(v.log, sh) : '',
        win: !!r?.pots.some((p) => p.winners.some((w) => w.seat === i)),
        tag: tags[i] ?? (s.status === 'folded' ? '弃牌' : ''),
      };
    }),
    result: r,
  };
}

/** 每个座位这一轮最后做的事（log 里最后一次发公共牌之后的） */
export function tagsOf(v: View): string[] {
  const out: string[] = [];
  let start = 0;
  v.log.forEach((e, k) => {
    if (e.seat < 0) start = k + 1;
  });
  for (const e of v.log.slice(start)) if (e.seat >= 0) out[e.seat] = tagOf(e);
  return out;
}

/** 一条记录说成一句短话："跟注 40""加注到 120""全下 1,840" */
/** 摊牌亮出来的牌型；最后下注的人只有高牌，后面标"诈唬" */
export function showName(log: readonly LogEntry[], sh: HandResult['shown'][number]): string {
  return handName(sh.value) + (bluffer(log, sh.seat, categoryOf(sh.value)) ? ' · 诈唬' : '');
}

export function tagOf(e: LogEntry): string {
  const amt = chips(e.amount);
  if (e.allin && e.act !== 'sb' && e.act !== 'bb') return `全下`;
  switch (e.act) {
    case 'fold':
      return e.auto ? '超时弃牌' : '弃牌';
    case 'check':
      return e.auto ? '超时过牌' : '过牌';
    case 'call':
      return `跟注 ${amt}`;
    case 'bet':
      return `下注 ${amt}`;
    case 'raise':
      return `加注到 ${amt}`;
    case 'sb':
      return `小盲 ${amt}`;
    case 'bb':
      return `大盲 ${amt}`;
    default:
      return '';
  }
}

/** 一手在这一步就结束时没有这一步的记录（之后的视图已经是结果了）：按动作说 */
export function tagFor(a: Action, put: number, stack: number, to: number): string {
  if (put > 0 && put >= stack) return '全下';
  switch (a.t) {
    case 'fold':
      return '弃牌';
    case 'check':
      return '过牌';
    case 'call':
      return `跟注 ${chips(put)}`;
    case 'raise':
      return `加注到 ${chips(to)}`;
    case 'timeout':
      return put ? '' : '超时';
    default:
      return '';
  }
}

export const isBetting = (a: Action): boolean => ['fold', 'check', 'call', 'raise', 'allin', 'timeout'].includes(a.t);

/** 一手在这一步结束时，这个座位这一步投了多少（之后的视图已经是结果了，只能按之前的视图算） */
export function putBy(v: View, seat: number, a: Action): number {
  const s = must(v.seats[seat], 'v.seats[seat]');
  const toCall = Math.min(s.stack, Math.max(0, v.currentBet - s.bet));
  switch (a.t) {
    case 'call':
      return toCall;
    case 'raise':
      return Math.min(s.stack, a.to - s.bet);
    case 'allin':
      return s.stack;
    default:
      return 0;
  }
}

/** 7 张里组成最大牌型的那 5 张（只用来高亮，21 种组合挨个比） */
export function bestFive(cards: Card[]): Card[] {
  let best = -1;
  let pick: Card[] = [];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b);
      if (five.length !== 5) continue;
      const v = evalCards(five);
      if (v > best) {
        best = v;
        pick = five;
      }
    }
  return pick;
}
