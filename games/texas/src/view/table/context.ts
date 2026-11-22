/** 牌桌的共享状态：DOM 节点、座位、当前这一帧、选项。各部件（TableScene、TableProbe、TableMotion、TableHand）按引用持有同一个，不靠继承拿（table.ts 拆分） */
import { el } from '../dom.ts';
import { makeCard } from '../art.ts';
import { Dealer } from '../dealer.ts';
import type { Pt, Geo } from '../layout.ts';
import { Talk } from '../talk.ts';
import type { Frame, SeatNodes, TableViewOpts, SeatPeople } from './types.ts';

export class TableCtx {
  readonly root: HTMLDivElement;
  readonly feltEl: HTMLDivElement;
  readonly markEl: HTMLDivElement;
  /** 荷官：站在桌子顶边后面，牌从他手里发出、收回他那里；没地方站时照旧从庄家位置发、收回桌心 */
  readonly croupier: Dealer;
  /** 荷官现在站的点（没站是 null） */
  croupierAt: Pt | null = null;
  readonly potEl: HTMLDivElement;
  readonly potMain: HTMLDivElement;
  readonly potSides: HTMLDivElement;
  readonly resultEl: HTMLDivElement;
  readonly boardCards: HTMLDivElement[] = [];
  readonly dealer: HTMLDivElement;
  readonly fx: HTMLDivElement;
  seats: SeatNodes[] = [];
  /** 顶上一排刚赢的：名字那一行先写赢数 */
  readonly won = new Map<number, string>();
  me = 0;
  g: Geo = { w: 960, h: 540, tall: false };
  frame: Frame | null = null;
  /** 看对手的小卡：同一时间一张 */
  card: HTMLDivElement | null = null;
  cardTimer = 0;
  readonly talk = new Talk();
  urgeEl: HTMLButtonElement | null = null;
  people: SeatPeople[] | null = null;
  clockAnim: Animation | null = null;
  readonly opts: TableViewOpts;
  /** 聊天框的位置（chatDock）：同一个窗口、同一桌人只算一次 */
  dockAt: { key: string; cost: number; at: { left: number; top: number; width: number; height: number } } | null = null;

  constructor(parent: HTMLElement, opts: TableViewOpts) {
    this.opts = opts;
    this.root = el('div', 'table', parent);
    this.feltEl = el('div', 'felt', this.root);
    this.markEl = el('div', 'felt-mark', this.feltEl, '德州扑克');
    this.croupier = new Dealer(this.root, this.feltEl);
    this.potEl = el('div', 'pot', this.root);
    this.potMain = el('div', 'pot-main', this.potEl);
    this.potSides = el('div', 'pot-sides', this.potEl);
    for (let i = 0; i < 5; i++) {
      const c = makeCard('board');
      this.root.appendChild(c);
      this.boardCards.push(c);
    }
    this.resultEl = el('div', 'result', this.root);
    this.dealer = el('div', 'dealer', this.root, 'D');
    this.fx = el('div', 'fx', this.root);
  }
}
