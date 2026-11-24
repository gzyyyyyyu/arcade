/** 实盘杠杆：利息、放大后的倍数、盘中减仓、爆仓。 */
import { BALANCE } from '../balance.ts';
import { personaAccount } from '../content/index.ts';
import { liveGear, liveLevered } from '../liveTiers.ts';
import type { GameState } from '../types.ts';
import { debtOf } from './ext.ts';
import { type Emitter, emit } from './shared.ts';

/**
 * 实盘杠杆每月的利息（元，取整到百元）；没开杠杆为 0。interest 按带回倍数算（每月让带回少几成），
 * 折回游戏里的钱要除以这一档的涨跌倍数：不然越往上的档位利息被放大得越多，开杠杆在大档、豪华档几乎必输。
 */
export function gearInterest(s: Readonly<GameState>): number {
  const live = s.setup?.live;
  const g = live?.gear;
  if (!g || !(g.interest > 0) || (s.gearCut && s.gearCut.x <= 1)) return 0;
  // 减过仓的按减完那一档的利息（同样按档位打折）
  const rate = s.gearCut ? (cutGear(s)?.interest ?? 0) : g.interest;
  const start = s.setup?.account ?? personaAccount(s.persona);
  return Math.round((rate * start) / (live.lev ?? 1) / 100) * 100;
}

/**
 * 实盘杠杆：放大后的带回倍数（没截断）；没加杠杆为 null。
 * 减过仓的：减仓那刻的倍数 v0 加上之后按 1× 的涨跌（涨跌倍数 ×（资产比 − r0））。
 */
export function gearLevered(s: Readonly<GameState>): number | null {
  const live = s.setup?.live;
  if (!live?.gear || live.gear.x <= 1) return null;
  const start = s.setup?.account ?? personaAccount(s.persona);
  const r = (s.account - debtOf(s)) / start;
  if (s.gearCut) return s.gearCut.v0 + s.gearCut.x * (live.lev ?? 1) * (r - s.gearCut.r0);
  return liveLevered(r, live.lev ?? 1, live.gear.x);
}

/** 减过仓的这一局现在用的那一档（利息已按档位打折）；没减过仓为 null */
function cutGear(s: Readonly<GameState>): { interest: number } | null {
  if (!s.gearCut) return null;
  const tier = s.setup?.live?.tier;
  const rate = tier ? BALANCE.live.tiers[tier].gearRate : 1;
  return { interest: liveGear(s.gearCut.x).interest * rate };
}

/** 盘中减仓：杠杆降一档，记下这一刻的资产比和放大后的倍数，之后按新的一档算 */
export function deleverage(s: GameState, em: Emitter): void {
  const v = gearLevered(s);
  const g = s.setup?.live?.gear;
  if (v === null || !g) return;
  const start = s.setup?.account ?? personaAccount(s.persona);
  const x = (s.gearCut?.x ?? g.x) - 1;
  s.gearCut = { r0: (s.account - debtOf(s)) / start, v0: v, x };
  emit(em, { type: 'deleveraged', levered: v, x });
}

/** 爆仓：放大后的带回倍数跌到爆仓线，强制平仓、这局按 0 结（收盘后、月底还完账单后各查一次） */
export function marginCalled(s: GameState, em: Emitter): boolean {
  // 减过仓的不再有清零线：减仓就是为了躲开它（实测减完再按新一档的线清零，会玩的人反而更亏，见 design-balance.md 4.4）
  if (s.gearCut) return false;
  const v = gearLevered(s);
  const call = s.setup?.live?.gear?.call ?? 0;
  if (v === null || v > call) return false;
  s.phase = 'lost';
  s.endReason = 'margin';
  emit(em, { type: 'gearWiped', month: s.month, account: s.account, levered: v });
  emit(em, { type: 'runLost', reason: 'margin', month: s.month, account: s.account, bill: 0 });
  return true;
}
