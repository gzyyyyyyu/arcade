/**
 * 全下或弃牌局的电脑（docs/features.md 13.10）：翻牌前只有弃牌、全下（面对全下时跟注）三种出手，所以不用蒙特卡洛，查表加几个整数门槛。
 * 参数是这个座位的视图，随机数是传进来的那一条流（每次调用固定抽 1 个数，不管走哪个分支）。全程整数。
 *
 * 抢先全下（还没人全下）：推"前 p% 的牌"。p 由身后还有几个人没说话（位置）和有效筹码（大盲数）定，
 * 取自两张常见的 10 大盲推弃表的近似：按钮约 45%、小盲约 62%、枪口约 21%，筹码越短推得越宽。
 * 面对全下：按底池赔率定要多大把握才跟；牌力用"对一个随机对手的胜率"，打折 CALL_EDGE（全下的人手牌比随机牌强），
 * 多一个全下的人再加一点。每个电脑的松紧（这一场的状态 form[0]）和一点浮动让同样的牌不总是同样的打法。
 */
import type { RandomStream } from 'arcade-kit/rng';
import type { Action } from '../core/table.ts';
import type { View } from '../core/view.ts';
import { strength, TOP } from './preflop.ts';

/** 身后还有几个人没说话（含盲注）→ 抢先全下的牌占比（%）：1 = 小盲，2 = 按钮，……，5 以上 = 枪口 */
const PUSH_PCT = [100, 62, 45, 33, 26, 21, 18] as const;
/** 有效筹码（大盲数，下标 0–20，之后按 21 算）→ 对上表的倍数（‰）：越短越宽，20 大盲以上收得很紧 */
const STACK_MUL = [2300, 2300, 2200, 2000, 1800, 1650, 1500, 1350, 1220, 1100, 1000, 930, 860, 800, 750, 700, 650, 610, 570, 540, 510, 480] as const;
/** 面对全下：全下的人的牌比随机牌强，跟注要比底池赔率多这么多把握（胜率‰） */
const CALL_EDGE = 110;
/** 每多一个先全下的人再加（‰） */
const CALL_EXTRA = 50;
/** 随机浮动（‰，±）：同样的牌不总是同样的打法 */
const JITTER = 25;

export function pushFoldAction(v: View, r: RandomStream): Action {
  const me = v.me;
  const lg = v.legal;
  if (me === null || !lg) throw new Error('pushFoldAction: not my turn');
  const noise = r.below(2 * JITTER + 1) - JITTER;
  const s = v.seats[me]!;
  const [a, b] = v.hole as [number, number];
  const str = strength(a, b);
  // 这一场的松紧（form[0]，±90，正数更紧）折成 ±15 的把握
  const tight = Math.trunc((v.form?.[0] ?? 0) / 6);
  if (lg.check) return { t: 'check' };

  // 面对全下（最高注超过大盲）
  if (v.currentBet > v.bb) {
    const shovers = v.seats.filter((x, i) => i !== me && x.status !== 'folded' && x.status !== 'out' && x.bet > v.bb).length;
    const need = Math.floor((lg.call * 1000) / (v.pot + lg.call)) + CALL_EDGE + CALL_EXTRA * Math.max(0, shovers - 1) + tight + noise;
    return str >= need ? { t: 'call' } : { t: 'fold' };
  }

  // 抢先全下
  const behind = v.seats.filter((x, i) => i !== me && x.status === 'active').length;
  const pct0 = PUSH_PCT[Math.min(behind, PUSH_PCT.length - 1)]!;
  // 有效筹码：对手里最深的那个和自己比，取小的
  const deepest = v.seats.reduce((m, x, i) => (i !== me && x.status !== 'folded' && x.status !== 'out' ? Math.max(m, x.stack + x.bet) : m), 0);
  const eff = Math.floor(Math.min(s.stack + s.bet, deepest) / v.bb);
  const mul = STACK_MUL[Math.min(eff, STACK_MUL.length - 1)]!;
  const pct = Math.max(0, Math.min(100, Math.floor((pct0 * mul) / 1000) - Math.trunc(tight / 3)));
  // 下注额已经投进去很多（盲注占了大半筹码）时不弃：弃了也是白送
  const committed = s.bet * 3 >= s.stack + s.bet;
  const edge = Math.trunc(noise / 5);
  if (committed || str + edge >= TOP[pct]!) return { t: 'allin' };
  return { t: 'fold' };
}
