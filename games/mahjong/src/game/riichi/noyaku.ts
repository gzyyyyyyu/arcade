/**
 * 立直的"无役提醒"：听牌了，但每一张和牌张别人打出来都和不了（没有役，宝牌不算役）时，提醒玩家，
 * 免得新手等了半天不知道为什么荣和不了（docs/riichi.md 第 4 节）。
 * 只用自己的手牌和公开信息（场风、自风、宝牌指示牌），不看别人的手牌和牌墙；不改算分，役直接问 scoreWin。
 */
import { countsOf, kindOf, tileOf, type Tile } from '../../core/tiles/index.ts';
import type { Meld } from '../../core/table/index.ts';
import { doraOf, scoreWin, waitsOf, type WinContext } from '../../core/variants/riichi/index.ts';

/** tsumo：门清，别人打的和不了，自摸有门前清自摸和；none：副露了，自摸也没有役 */
export type NoYaku = 'tsumo' | 'none';

export interface NoYakuIn {
  /** 打出去之后的 13 张 */
  hand: readonly Tile[];
  melds: readonly Meld[];
  /** 0–3 东南西北 */
  seatWind: number;
  roundWind: number;
  /** 翻开的宝牌指示牌 */
  indicators: readonly Tile[];
  /** 已经立直了不提示 */
  riichi: number;
}

const TEXT: Record<NoYaku, string> = { tsumo: '只能自摸，或者立直', none: '没有役，和不了' };
export const noYakuText = (n: NoYaku): string => TEXT[n];

/** 听牌（四张都在自己手里和副露里的不算）但没有一张能荣和时给出原因；有役、没听、已立直都是 null */
export function noYakuOf(i: NoYakuIn): NoYaku | null {
  if (i.riichi || i.hand.length % 3 !== 1) return null;
  const own = countsOf([...i.hand, ...i.melds.flatMap((m) => m.tiles)]);
  const ks = waitsOf(countsOf(i.hand), i.melds.length).filter((k) => own[k]! < 4);
  if (!ks.length) return null;
  const menzen = i.melds.every((m) => m.kind === 'kan' && m.kan === 'concealed');
  const owned = new Set<Tile>([...i.hand, ...i.melds.flatMap((m) => m.tiles)]);
  const dora = i.indicators.map((t) => doraOf(kindOf(t)));
  let tsumoYaku = false;
  for (const k of ks) {
    // 和牌张用一张自己手里没有的实物牌（优先非赤）
    let win = -1;
    for (let j = 3; j >= 0 && win < 0; j--) if (!owned.has(tileOf(k, j))) win = tileOf(k, j);
    if (win < 0) continue;
    const ctx: WinContext = { win, tsumo: false, seatWind: i.seatWind, roundWind: i.roundWind, riichi: 0, ippatsu: false, rinshan: false, chankan: false, haitei: false, houtei: false, tenhou: false, chiihou: false, dora, ura: [] };
    if (scoreWin([...i.hand, win], i.melds, ctx)) return null;
    if (menzen && scoreWin([...i.hand, win], i.melds, { ...ctx, tsumo: true })) tsumoYaku = true;
  }
  return menzen && tsumoYaku ? 'tsumo' : 'none';
}
