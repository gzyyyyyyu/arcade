import Phaser from 'phaser';
import type { Face } from '../../core/index.ts';
import type { Rect } from '../rect.ts';
import { sound } from '../sound.ts';
import { COLOR } from '../theme.ts';
import { addPaper } from '../ui/art.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { addText } from '../ui/text.ts';
import { DRAG_THRESHOLD, dragEnded, dragStarted, easeTilt, outsideArea, pastThreshold, slotAt, tiltDeg } from './dragGeo.ts';

/** 被拖的那张卡：推荐卡（买）或持仓卡（卖） */
export type DragSource = { kind: 'rec'; index: number; stockId: string; name: string; face: Face } | { kind: 'hold'; slot: number; stockId: string; name: string; face: Face };

/** 场景给拖拽的接口：哪里能拖、往哪放、放下怎么办。拖拽本身不碰规则，只在放下时回调。 */
export interface DragHost {
  /** 现在能不能开始拖（盘前、没有弹窗、没有选格子横幅、没在播动画） */
  canDrag(): boolean;
  /** 点 (x, y) 按在哪张可拖的卡上（按在按钮上的不算）；没有返回 null */
  pick(x: number, y: number): DragSource | null;
  /** 推荐卡能放进的格子（按 dragGeo.buyDropSlots） */
  buyTargets(rec: number): number[];
  /** 每格的位置 */
  slotRects(): (Rect | null)[];
  /** 整个持仓区（卖出的判断：拖出这个区放手就卖） */
  sellArea(): Rect;
  /** 放进了某格：买入（或满仓时换掉那一格） */
  dropBuy(rec: number, slot: number): void;
  /** 拖出了持仓区：卖光 */
  dropSell(slot: number): void;
  /** 动画开着吗（关了就不飞回弹，直接消失） */
  lively(): boolean;
}

/**
 * 拖拽：鼠标和手指通用。按下后挪过 DRAG_THRESHOLD 才算拖；卡片的复制品跟着手走、随速度轻微倾斜；
 * 能放的格子描亮边，手在哪格里哪格更亮；放手时放得下就缩进格子并执行，放不下就弹回原处。
 * 放手用浏览器自己的 pointerup（窗口捕获阶段）：按钮、卡身会 stopPropagation，场景的 pointerup 不一定到。
 */
export class TradeDrag {
  private readonly scene: Phaser.Scene;
  private readonly host: DragHost;
  private cand: { src: DragSource; x: number; y: number } | null = null;
  private live: { src: DragSource; ghost: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text; from: { x: number; y: number }; hi: Phaser.GameObjects.Graphics; targets: number[]; tilt: number; vx: number; x: number; y: number } | null = null;
  private readonly onUp = (): void => this.finish(true);
  private readonly onCancel = (): void => this.finish(false);

  constructor(scene: Phaser.Scene, host: DragHost) {
    this.scene = scene;
    this.host = host;
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.down, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.move, this);
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerup', this.onUp, true);
      window.addEventListener('pointercancel', this.onCancel, true);
    }
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** 正在拖（自动化、测试看） */
  get dragging(): boolean {
    return this.live !== null;
  }

  private down(p: Phaser.Input.Pointer): void {
    this.cand = null;
    if (p.button > 0 || this.live || !this.host.canDrag()) return;
    const src = this.host.pick(p.worldX, p.worldY);
    if (src) this.cand = { src, x: p.worldX, y: p.worldY };
  }

  private move(p: Phaser.Input.Pointer): void {
    if (this.live) {
      // 已经松手（窗口外松的，pointerup 没捡到）：收尾
      if (!p.isDown) return this.finish(false);
      this.live.vx += p.worldX - this.live.x;
      this.live.x = p.worldX;
      this.live.y = p.worldY;
      this.follow();
      return;
    }
    const c = this.cand;
    if (!c || !p.isDown) return;
    if (!pastThreshold(p.worldX - c.x, p.worldY - c.y, DRAG_THRESHOLD)) return;
    this.cand = null;
    if (!this.host.canDrag()) return;
    this.start(c.src, c.x, c.y, p.worldX, p.worldY);
  }

  private start(src: DragSource, fx: number, fy: number, x: number, y: number): void {
    const sc = this.scene;
    dragStarted();
    sound.ui('select');
    const ghost = sc.add.container(x, y).setDepth(175);
    const W = 112;
    const H = 132;
    const paper = addPaper(sc, -W / 2, -H / 2, W, H, true);
    const guy = new StockGuy(sc, 0, 30, src.stockId, src.face, 64, { idle: false });
    const name = addText(sc, 0, 38, src.name, { size: 14, bold: true, color: COLOR.ink, originX: 0.5 });
    ghost.add([paper, guy, name]);
    const label = addText(sc, 0, -H / 2 - 14, '', { size: 15, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5, stroke: COLOR.ink, strokeWidth: 4 });
    ghost.add(label);
    // 拿起来：弹大一点点
    if (this.host.lively()) {
      ghost.setScale(0.9);
      sc.tweens.add({ targets: ghost, scale: 1.04, duration: 120, ease: 'Back.easeOut' });
    }
    const targets = src.kind === 'rec' ? this.host.buyTargets(src.index) : [];
    const hi = sc.add.graphics().setDepth(170);
    this.live = { src, ghost, label, from: { x: fx, y: fy }, hi, targets, tilt: 0, vx: 0, x, y };
    this.follow();
  }

  /** 卡跟手，高亮和提示字跟着手所在的位置变。 */
  private follow(): void {
    const l = this.live;
    if (!l) return;
    l.ghost.setPosition(l.x, l.y);
    const rects = this.host.slotRects();
    const g = l.hi.clear();
    if (l.src.kind === 'rec') {
      const over = slotAt(rects, l.x, l.y, 6);
      for (const i of l.targets) {
        const r = rects[i];
        if (!r) continue;
        const hot = i === over;
        g.fillStyle(COLOR.gold, hot ? 0.35 : 0.12).fillRoundedRect(r.x, r.y, r.w, r.h, 14);
        g.lineStyle(hot ? 5 : 3, hot ? COLOR.accent : COLOR.gold, 1).strokeRoundedRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 16);
      }
      l.label.setText(over >= 0 && l.targets.includes(over) ? '松手买入' : l.targets.length > 0 ? '拖进发光的格子' : '现在买不了');
    } else {
      const area = this.host.sellArea();
      const out = outsideArea(area, l.x, l.y);
      // 持仓区：放开不动（红框提示别的地方是卖出区）
      g.lineStyle(out ? 3 : 4, out ? COLOR.up : COLOR.edge, 1).strokeRoundedRect(area.x - 8, area.y - 8, area.w + 16, area.h + 16, 18);
      l.label.setText(out ? '松手卖出' : '拖出去就卖');
    }
  }

  /** 每帧：倾斜角往速度对应的角度靠，速度逐帧衰减（停下来回正）。 */
  private tick(): void {
    const l = this.live;
    if (!l) return;
    l.tilt = easeTilt(l.tilt, tiltDeg(l.vx));
    l.ghost.setAngle(l.tilt);
    l.vx *= 0.6;
  }

  private finish(drop: boolean): void {
    this.cand = null;
    const l = this.live;
    if (!l) return;
    this.live = null;
    dragEnded(performance.now());
    l.hi.destroy();
    const { ghost, src } = l;
    const lively = this.host.lively();
    const rects = this.host.slotRects();
    const settle = (dx: number, dy: number, shrink: boolean, done?: () => void): void => {
      if (!lively) {
        ghost.destroy();
        done?.();
        return;
      }
      this.scene.tweens.add({
        targets: ghost,
        x: dx,
        y: dy,
        angle: 0,
        scale: shrink ? 0.35 : 1,
        alpha: shrink ? 0 : 0.2,
        duration: shrink ? 140 : 240,
        ease: shrink ? 'Quad.easeIn' : 'Back.easeOut',
        onComplete: () => {
          ghost.destroy();
          done?.();
        },
      });
    };
    if (drop && src.kind === 'rec') {
      const slot = slotAt(rects, l.x, l.y, 6);
      const r = slot >= 0 && l.targets.includes(slot) ? rects[slot] : null;
      if (r) {
        sound.ui('click');
        // 先执行买入（画面马上变），复制品缩进格子里
        this.host.dropBuy(src.index, slot);
        settle(r.x + r.w / 2, r.y + r.h / 2, true);
        return;
      }
    }
    if (drop && src.kind === 'hold' && outsideArea(this.host.sellArea(), l.x, l.y)) {
      this.host.dropSell(src.slot);
      settle(l.x, l.y - 40, true);
      return;
    }
    // 放不下：弹回按下的地方
    if (drop) sound.ui('denied');
    settle(l.from.x, l.from.y, false);
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.down, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.move, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerup', this.onUp, true);
      window.removeEventListener('pointercancel', this.onCancel, true);
    }
    if (this.live) {
      this.live.ghost.destroy();
      this.live.hi.destroy();
      this.live = null;
    }
  }
}
