import type Phaser from 'phaser';
import type { GameState, HoldingCard, IpoOffer } from '../../core/index.ts';
import { COLOR } from '../theme.ts';

/**
 * 读「冷时买的」（HoldingCard.lowBuy）的道具：核对过规则层 items.ts，目前只有抄底大师（dixi，onHolding 里看 holding.lowBuy）；
 * buyStage 只用在成就和档案里，不影响道具。
 */
export const LOWBUY_ITEMS: readonly string[] = ['dixi'];


/** 这一局有仓位玩法时，卡上要的信息（总份数、剩下的现金份数） */
export interface SlotExt {
  total: number;
  cash: number;
}


/** 打新：一格申购中（冻结）的内容。daysLeft 是离出签还有几天（0 = 今天收盘出签） */
export interface FrozenInfo {
  offer: IpoOffer;
  units: number;
  daysLeft: number;
}

export const frozenKeyOf = (f: FrozenInfo): string => `${f.offer.stockId}|${f.units}|${f.daysLeft}`;

/** 申购中的格子：stockId 在 s.stocks 里还没有，规则层的持仓查询不认识它，画面自己从格子上的 ipo 标记取。 */
export function frozenOf(s: GameState, slot: number): FrozenInfo | null {
  const h = s.slots[slot];
  if (h?.ipo?.stage !== 'frozen') return null;
  return { offer: h.ipo.offer, units: h.units ?? 1, daysLeft: Math.max(0, h.ipo.offer.drawDay - s.dayIndex) };
}

/** 新股持仓的角标：上市头两天写「新」，首日涨了写「新 +X%」，跌了写「新 -X%」（灰底）；不是新股或过了头两天为 null。 */
export function newTagOf(s: GameState, slot: number): { text: string; fill: number; ink: number } | null {
  const h = s.slots[slot];
  if (h?.ipo?.stage !== 'listed' || s.dayIndex > h.ipo.offer.listDay + 1) return null;
  const premium = s.lastDay?.holdings.find((m) => m.stockId === h.stockId)?.ipo;
  if (premium !== undefined && premium < 0) return { text: `新 ${Math.round(premium)}%`, fill: 0xc9c3bb, ink: COLOR.ink };
  if (premium !== undefined && premium > 0) return { text: `新 +${Math.round(premium)}%`, fill: COLOR.gold, ink: COLOR.ink };
  return { text: '新', fill: COLOR.gold, ink: COLOR.ink };
}

/** 虚线圆角框 */
export function dashedBox(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0xfff8ec, 0.78).fillRoundedRect(x, y, w, h, 14);
  g.lineStyle(3, color, 1);
  const dash = 10;
  const gap = 7;
  const seg = (x0: number, y0: number, x1: number, y1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      g.lineBetween(x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len, x0 + ((x1 - x0) * e) / len, y0 + ((y1 - y0) * e) / len);
    }
  };
  const r = 14;
  seg(x + r, y, x + w - r, y);
  seg(x + r, y + h, x + w - r, y + h);
  seg(x, y + r, x, y + h - r);
  seg(x + w, y + r, x + w, y + h - r);
  g.beginPath().arc(x + r, y + r, r, Math.PI, Math.PI * 1.5).strokePath();
  g.beginPath().arc(x + w - r, y + r, r, Math.PI * 1.5, Math.PI * 2).strokePath();
  g.beginPath().arc(x + w - r, y + h - r, r, 0, Math.PI * 0.5).strokePath();
  g.beginPath().arc(x + r, y + h - r, r, Math.PI * 0.5, Math.PI).strokePath();
  return g;
}

/** 每格的选择模式（满仓替换、稀有股票放哪一格） */
export interface PickMode {
  label: (slot: number, card: HoldingCard | null) => string | null;
  onPick: (slot: number) => void;
}
