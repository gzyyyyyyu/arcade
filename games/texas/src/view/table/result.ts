/** 座位名、池子名、结果条文字（table.ts 拆分） */
import type { HandResult } from '../../core/table.ts';
import { chips, handName, personaName } from '../text.ts';
import type { SeatFrame } from './types.ts';
import { must } from '../../must.ts';

/**
 * 结果条等处叫座位的名字：我是"你"，好友房的真人用昵称，电脑按性格名，都不是才是空位。
 * 锦标赛里电脑座位的 owner 是 'player'（人人同样的比赛筹码），不能按 owner 判电脑，要看 persona（-1 是真人）
 */
export function seatName(s: Pick<SeatFrame, 'owner' | 'persona'>, mine: boolean, real: string | null): string {
  if (mine && (s.owner === 'player' || real)) return '你';
  return real ?? (s.owner !== 'none' && s.persona >= 0 ? personaName(s.persona) : '空位');
}

/** 第几个池子叫什么：主池、边池（只有一个时）或边池一、边池二……（不用数字：挨着金额会读成"1 600"） */
export const potName = (k: number, n: number): string => (k === 0 ? '主池' : n <= 2 ? '边池' : `边池${'一二三四五六七八'[k - 1] ?? k}`);

/** 一手的结果分成几行字（结果条）：只有一个池子时一行，分池时每个池子一行 */
export function resultLines(r: HandResult, name: (seat: number) => string, me: number): { html: string; mine: boolean }[] {
  const val = (seat: number): string => {
    const sh = r.shown.find((x) => x.seat === seat);
    return sh ? handName(sh.value) : '';
  };
  const who = (seats: number[]): string => seats.map((s) => esc(name(s))).join('、');
  if (r.byFold) {
    const w = must(must(r.pots[0], 'r.pots[0]').winners[0], 'must(r.pots[0], r.pots[0]).winners[0]');
    return [{ html: `大家都弃牌，<b>${who([w.seat])}</b> 拿下 <em>${chips(w.won)}</em>`, mine: w.seat === me }];
  }
  // 几个池子都是同一拨人赢的：并成一行写总数（"主池 3,850 稳哥赢 3,850、边池 600 稳哥赢 600"读着啰嗦）
  const key = (p: HandResult['pots'][number]): string => p.winners.map((w) => w.seat).join(',');
  const pots = r.pots.every((p) => key(p) === key(must(r.pots[0], 'r.pots[0]')))
    ? [{ amount: r.pots.reduce((a, p) => a + p.amount, 0), winners: must(r.pots[0], 'r.pots[0]').winners.map((w) => ({ ...w, won: r.pots.reduce((a, p) => a + (p.winners.find((x) => x.seat === w.seat)?.won ?? 0), 0) })) }]
    : r.pots;
  return pots.map((p, k) => {
    const seats = p.winners.map((w) => w.seat);
    const mine = seats.includes(me);
    const head = pots.length > 1 ? `<span class="r-pot">${potName(k, pots.length)} ${chips(p.amount)}</span> ` : '';
    const hand = val(must(seats[0], 'seats[0]'));
    if (seats.length > 1) return { html: `${head}平分：<b>${who(seats)}</b> 各 <em>${chips(must(p.winners[0], 'p.winners[0]').won)}</em>${hand ? ` · ${hand}` : ''}`, mine };
    // 拿到的是整个池子（含自己下的）：写"拿下"，不写"+"，免得读成净赢
    if (mine && pots.length === 1) return { html: `你拿下 <em>${chips(must(p.winners[0], 'p.winners[0]').won)}</em>${hand ? ` · ${hand}` : ''}`, mine };
    return { html: `${head}<b>${who(seats)}</b>${hand ? ` ${hand}` : ''} 赢 <em>${chips(must(p.winners[0], 'p.winners[0]').won)}</em>`, mine };
  });
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => must(({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c], '( &: &amp;, <: &lt;, >: &gt;, : &quot; )'));

/** 这一手结果里各个池子的数（收池动画收完以后应该是这些） */
export const potsOf = (r: HandResult): number[] => r.pots.map((p) => p.amount);

/** 没人跟的那部分从最后一个池子里退回 */
export function shave(pots: number[], amount: number): number[] {
  const out = [...pots];
  for (let k = out.length - 1; k >= 0 && amount > 0; k--) {
    const d = Math.min(must(out[k], 'out[k]'), amount);
    out[k]! -= d;
    amount -= d;
  }
  return out.filter((x) => x > 0);
}
