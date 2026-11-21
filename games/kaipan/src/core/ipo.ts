/**
 * 打新：真实行情的普通娱乐局，每月月中有一只新股可以申购（docs/design-modes.md 第 18 节）。
 * 这里只放纯函数：哪只股票当"替身"、上市溢价怎么掷、中签怎么掷、归因文案。
 * 哪一局有、哪一天申购、日程怎么排由 engine/calendar.ts 的 hasIpo / ipoOffer / ipoToday 定（要用开局设置和日历）。
 * 所有随机都只由种子（和玩家选的档位）决定：独立的 rng 用途名 `ipo*`，不碰任何别的抽取。
 */
import { BALANCE } from './balance.ts';
import { stocksOf } from './content/index.ts';
import type { RealMarket } from './segment.ts';
import { rngFor } from './rng.ts';
import type { BuySize, GameState, IpoOffer, ThemeId } from './types.ts';

/** 临时开关：模拟器 `--no-ipo` 和测试拿来对照"没有打新"的结果；正式游戏永远开着。 */
export const ipoSwitch = { enabled: true };

/** 一只真实股票这一段的日涨跌平均绝对值（越大越"野"）。 */
function wildness(real: Readonly<RealMarket>, id: string): number {
  const r = real.stocks[id]?.r ?? [];
  let sum = 0;
  for (const x of r) sum += x < 0 ? -x : x;
  return r.length > 0 ? sum / r.length : 0;
}

/**
 * 新股的"替身"：本局同题材在场股票里真实波动最大的那只，新股逐日照搬它的真实涨跌（再叠上市溢价）。
 * 只看行情段整体的波动幅度（不看某一天），所以不泄露未来；并列取股票池里靠前的。
 */
export function ipoBoundStock(s: Readonly<GameState>, theme: ThemeId): string | null {
  const real = s.real;
  if (!real) return null;
  let best: string | null = null;
  let top = -1;
  for (const d of stocksOf(theme)) {
    if (!s.stocks[d.id] || !real.stocks[d.id]) continue;
    const w = wildness(real, d.id);
    if (w > top) {
      top = w;
      best = d.id;
    }
  }
  return best;
}

/** 上市首日的溢价（pp，> 0 大涨、< 0 破发）：只由种子和月份定，和申购了几份无关。 */
export function ipoFirstPremium(seed: string, month: number): number {
  const rng = rngFor(seed, 'ipo-list', month);
  const up = rng.next() < BALANCE.ipo.pop;
  const u = rng.next();
  const [lo, hi] = up ? BALANCE.ipo.up : BALANCE.ipo.down;
  const v = Math.round((lo + (hi - lo) * u) * 100) / 100;
  return up ? v : -v;
}

/** 上市后第 k 天（0 = 首日）叠的溢价：首日全额，第 2 天是首日的 carry 倍，之后没有。 */
export function ipoPremiumOn(seed: string, offer: Readonly<IpoOffer>, day: number): number {
  const k = day - offer.listDay;
  if (k === 0) return ipoFirstPremium(seed, offer.month);
  if (k === 1) return Math.round(ipoFirstPremium(seed, offer.month) * BALANCE.ipo.carry * 100) / 100;
  return 0;
}

/** 抽签：中不中只由种子、月份和申购的档位定（档位只改中签率，同一个签号在高档位更容易中）。 */
export function ipoWon(seed: string, offer: Readonly<IpoOffer>, size: BuySize): boolean {
  return rngFor(seed, 'ipo-draw', offer.month).next() < offer.odds[size];
}

/** 收盘归因里"新股上市"这一项的说明（v 是这一项对这格收益的贡献）。 */
export function ipoPartLabel(v: number): string {
  const a = `${Math.round(Math.abs(v) * 10) / 10}%`;
  return v >= 0 ? `新股上市，大家抢着要，多涨了 ${a}` : `新股一上市就跌，没人捧场，多跌了 ${a}`;
}
