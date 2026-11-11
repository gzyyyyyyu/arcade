/**
 * 牌桌画面：座位、公共牌、池子、下注、庄家按钮，和一步一步的动画（发牌、推筹码、翻牌、摊牌、分池）。
 *
 * 画面只读规则给的视图（View），不算规则：每一步拿到"之前的视图、之后的视图、谁做了什么"，
 * 先把"之前"摆出来，按差别一段段播动画，最后摆成"之后"。动画全用 transform / opacity，走合成层。
 *
 * 0.1.1（试玩反馈："每一把结束后直接开了…看都看不清"）：
 * - 一手打完规则先停着（hold），结果从 lastHand 摆出来：亮出的牌、赢的五张、牌型、结果条，一直摆到下一手发牌时才收；
 * - 节奏放慢一档：发牌从庄家顺时针一张张发两圈，翻牌三张依次翻、转牌河牌前停一下，摊牌一家家亮，池子一个个飞给赢家；
 * - 每个座位这一轮做了什么（"跟注 40"）一直挂着，到下一轮才收；名牌上的数变动时跳着走；
 * - 筹码按面额分颜色一摞摞摆（art.ts 的 chipPile），池子在公共牌下面，有边池时分开写。
 */
import type { Action } from '../core/table.ts';
import type { View } from '../core/view.ts';
import type { Geo } from './layout.ts';
import { TableCtx } from './table/context.ts';
import { TableScene } from './table/base.ts';
import { TableProbe } from './table/probe.ts';
import { TableMotion } from './table/motion.ts';
import { TableHand } from './table/hand.ts';
import type { SeatPeople, TableViewOpts } from './table/types.ts';
export type { TableViewOpts, SeatPeople } from './table/types.ts';
export { seatName, resultLines } from './table/result.ts';

/**
 * 牌桌画面的门面：状态放在共享的 TableCtx，四个部件各管一摊（摆画面 scene、量位置 probe、小动画 motion、一手的演出 hand），
 * 这里只把对外的方法转给它们。部件之间不继承：用到别人的方法就持有那个部件（hand → motion → scene）。
 */
export class TableView {
  readonly root: HTMLDivElement;
  private readonly c: TableCtx;
  private readonly scene: TableScene;
  private readonly probe: TableProbe;
  private readonly motion: TableMotion;
  private readonly hand: TableHand;

  constructor(parent: HTMLElement, opts: TableViewOpts) {
    this.c = new TableCtx(parent, opts);
    this.root = this.c.root;
    this.scene = new TableScene(this.c);
    this.probe = new TableProbe(this.c, this.scene);
    this.motion = new TableMotion(this.c, this.scene);
    this.hand = new TableHand(this.c, this.scene, this.motion);
  }

  setMark(text: string): void {
    this.scene.setMark(text);
  }
  setPeople(p: SeatPeople[] | null): void {
    this.scene.setPeople(p);
  }
  setClock(seat: number | null, deadline: number | null, totalMs: number): void {
    this.scene.setClock(seat, deadline, totalMs);
  }
  setup(size: number, me: number): void {
    this.scene.setup(size, me);
  }
  layout(g: Geo): void {
    this.scene.layout(g);
  }
  show(v: View): void {
    this.scene.show(v);
  }

  avoid(r: DOMRect | null): void {
    this.probe.avoid(r);
  }
  avatarRect(seat: number): DOMRect | null {
    return this.probe.avatarRect(seat);
  }
  plateRect(seat: number): DOMRect | null {
    return this.probe.plateRect(seat);
  }
  guideRect(what: 'hole' | 'board' | 'pot' | 'result'): DOMRect | null {
    return this.probe.guideRect(what);
  }
  centerRects(): DOMRect[] {
    return this.probe.centerRects();
  }
  chatDock(w: number, h: number, extra: readonly DOMRect[]): { left: number; top: number; width: number; height: number } {
    return this.probe.chatDock(w, h, extra);
  }
  dockFits(w: number, h: number, extra: readonly DOMRect[]): boolean {
    return this.probe.dockFits(w, h, extra);
  }
  keepOut(): DOMRect[] {
    return this.probe.keepOut();
  }
  showCard(seat: number, tag: string, rows: string[]): void {
    this.probe.showCard(seat, tag, rows);
  }
  hideCard(): void {
    this.probe.hideCard();
  }

  urge(seat: number | null, onClick: () => void): void {
    this.motion.urge(seat, onClick);
  }
  hit(seat: number): void {
    this.motion.hit(seat);
  }
  bubble(seat: number, text: string, ms?: number): void {
    this.motion.bubble(seat, text, ms);
  }

  /**
   * 播一步。prev / next 是这一步前后的视图，seat / action 是谁做了什么（系统的事是 null）。
   * 播完才 resolve：单机等动画播完，电脑才接着出手。
   */
  async play(prev: View, next: View, seat: number | null, action: Action | null): Promise<void> {
    // 画面出错（0.10.0 线上：全下的音效抛错）只记一笔、直接摆成结果：牌局永远不因为画面停住
    try {
      await this.hand.animate(prev, next, seat, action);
    } catch (e) {
      console.error('texas: 这一步的动画出错，直接摆成结果', e);
    }
    this.scene.show(next);
  }
}
