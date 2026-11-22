/**
 * 好友房锦标赛的结束页和淘汰提示的内容（docs/tournament.md 14.3）：只摆文字，名次、奖金都是房间算好的（RoomView.tour）。
 * 大字块、两栏和离桌结算共用 summary.ts；名次表的样式在 tour.css（限定在 .dialog 下，和单机的结束页共用）。
 */
import type { HandResult } from '../core/table.ts';
import { el } from './dom.ts';
import { heroBox, lastHandBox, sumGrid } from './summary.ts';
import { chips } from './text.ts';

export interface TourRow {
  name: string;
  /** 整场 6 人里的名次 */
  place: number;
  /** 实盘的奖金；娱乐是 null */
  prize: number | null;
  me: boolean;
}

interface TourEnd {
  /** 我的名次；旁观的人是 null */
  place: number | null;
  /** 我的奖金（实盘，我是选手）；娱乐、旁观是 null */
  prize: number | null;
  fun: boolean;
  /** 我是选手（要写奖金那一行） */
  played: boolean;
  /** 真人名次表，名次靠前的在前 */
  rows: TourRow[];
  champion: string;
}

export function tourEndBody(i: TourEnd): HTMLElement {
  const body = el('div', 'summary tour-sum');
  // 奖金按真人之间的名次分：大字写真人里第几，全桌名次（含电脑）放小字，免得"第 5 名拿全部奖池"看着像算错
  const mine = i.rows.findIndex((r) => r.me);
  const prize = i.played ? (i.fun ? '娱乐赛：筹码不算数' : `结回钱包 ${chips(i.prize ?? 0)}`) : '';
  if (i.place === null || mine < 0) heroBox(body, `冠军 ${i.champion}`, 'even', prize);
  else {
    heroBox(body, i.rows.length > 1 ? `真人第 ${mine + 1} 名` : `第 ${i.place} 名`, mine === 0 || (i.prize ?? 0) > 0 ? 'win' : 'even', prize);
    if (i.rows.length > 1) el('div', 'sum-note', body, `全桌第 ${i.place} 名（含电脑）`);
  }
  const list = el('ol', 'tour-top', body);
  for (const [k, r] of i.rows.entries()) {
    const li = el('li', r.me ? 'me' : '', list);
    el('b', '', li, `第 ${k + 1} 名`);
    el('span', '', li, r.me ? `${r.name}（你）` : r.name);
    if (r.prize !== null) el('span', 'tour-row-prize', li, `奖金 ${chips(r.prize)}`);
  }
  // 娱乐赛没有奖池，这句只给实盘
  if (!i.fun) el('div', 'sum-note', body, '奖池只在真人之间按名次分，电脑不拿奖');
  return body;
}

/** 我被淘汰了（打完前）：大字名次、奖金那句、打了几手和出局那一手；问看到结束还是现在离开（单机、好友房共用） */
export interface TourOut {
  place: number;
  /** 大字下面那一句：娱乐赛筹码不算数 / 奖金多少 / 没进奖励圈 */
  prize: string;
  /** 单机知道我打了几手；好友房不写 */
  hands?: number;
  last: HandResult | null;
  name: (seat: number) => string;
  me: number;
}

export function tourOutBody(o: TourOut): HTMLElement {
  const body = el('div', 'summary tour-out');
  heroBox(body, `第 ${o.place} 名`, 'lose', o.prize);
  if (o.hands !== undefined) sumGrid(body, [['打了', `${o.hands} 手`]]);
  lastHandBox(body, '出局那手', o.last, o.name, o.me);
  el('p', 'sum-note', body, '现在离开也照样排名次、结奖金。');
  return body;
}
