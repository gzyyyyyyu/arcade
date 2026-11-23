import Phaser from 'phaser';
import { sound } from '../sound.ts';
import { CAT_HINT_KEY, hasArt } from '../assets.ts';
import type { Animator } from '../fx/anim.ts';
import type { Rect } from '../rect.ts';
import { COLOR, FS, PORTRAIT } from '../theme.ts';
import { addImage } from '../ui/art.ts';
import { MIN_TEXT_SIZE, addText } from '../ui/text.ts';
import { shortHint } from '../labels.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { HINT_AREA } from './layout.ts';

/** 新手提示的位置：看板和显示器之间、桌面上方（不挡持仓卡和开盘按钮）。 */
const HINT_RECT: Rect = HINT_AREA;
const CAT = 52;
/** 竖屏：提示只占底下左边那一块，猫不垫在气泡下面，缩成小头像放进标题行 */
const CAT_INSIDE = PORTRAIT;

/**
 * 开盘前猫说的一句话（今天的第一建议，字比别处大）：左下角猫头像，上面一个对话气泡。点 × 关掉（只关今天这句）。
 * 猫头像缺素材时画一个橘色圆脸。
 */
export class HintBubble {
  private readonly scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;
  private text = '';
  private closedDay = -1;
  private onClose: (() => void) | null = null;
  /** 手机：小结卡占着左下角时先藏起来（提示还在，收起小结就露出来） */
  private suppressed = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 显示（同一句不重画）；day 用来记住"今天已经关掉了"。 */
  show(text: string, day: number, anim: Animator | null, onClose?: () => void, header = '今天先看这条 · 猫的建议', full = false): void {
    if (this.closedDay === day) return this.hide();
    if (this.root && this.text === text) return;
    this.hide();
    this.text = text;
    this.onClose = onClose ?? null;
    const s = this.scene;
    const { x, y, w, h } = HINT_RECT;
    const root = s.add.container(0, 0).setDepth(40);
    // 气泡里只放一句短话（≤16 字），整句和来历在悬停提示里
    // 新玩法的说明要整句看完（截成 16 字会把关键那半句截掉）：字号从 15 往下缩到放得下为止
    const catH = CAT_INSIDE ? 0 : CAT + 2;
    const room = h - catH - 40;
    const t = addText(s, 0, 0, full ? text : shortHint(text), { size: 15, bold: true, color: COLOR.ink, wrap: w - 28, lineSpacing: 3 });
    for (let size = 14; full && t.height > room && size >= Math.max(12, MIN_TEXT_SIZE); size--) t.setFontSize(size);
    // 气泡顶上找回小标题（谁在说：猫 / 新手提示），用小字 + 色点
    // 猫头像底边贴着这块的底边（往下多伸的话手机上会被画面底边裁掉）
    const bh = Math.min(h - catH, t.height + 40);
    const by = CAT_INSIDE ? y + h - bh : y + h - CAT - bh + 2;
    const bubble = s.add.rectangle(x, by, w, bh, 0xfffbe8).setOrigin(0, 0).setRounded(12).setStrokeStyle(2.5, COLOR.ink, 1);
    const tail = s.add.triangle(0, 0, x + 18, by + bh - 1, x + 34, by + bh - 1, x + 22, by + bh + 12, 0xfffbe8).setOrigin(0, 0);
    const tailLine = s.add.graphics().lineStyle(2.5, COLOR.ink, 1).strokePoints([new Phaser.Math.Vector2(x + 18, by + bh), new Phaser.Math.Vector2(x + 22, by + bh + 12), new Phaser.Math.Vector2(x + 34, by + bh)]);
    t.setPosition(x + 12, by + 28);
    const dot = CAT_INSIDE ? catFace(s, x + 18, by + 15, 20) : [s.add.circle(x + 17, by + 15, 4, COLOR.accent)];
    const who = addText(s, x + (CAT_INSIDE ? 32 : 26), by + 15, header, { size: FS.xs, bold: true, color: COLOR.accentDark, originY: 0.5 });
    const close = addText(s, x + w - 10, by + 4, '×', { size: 18, color: COLOR.muted, originX: 1 }).setInteractive({ useHandCursor: true });
    close.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      sound.ui('close');
      this.closedDay = day;
      this.hide();
      this.onClose?.();
    });
    const cat = CAT_INSIDE ? [] : catFace(s, x + 14 + CAT / 2, y + h - CAT / 2, CAT);
    root.add([bubble, ...(CAT_INSIDE ? [] : [tail, tailLine]), ...dot, who, t, close, ...cat]);
    const hit = s.add.rectangle(x, by, w, bh, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    bindTooltip(hit, () => ({ x, y: by, w, h: bh }), () => ({ title: header, body: `${text}\n\n猫只看公开的信息（看板、推荐、你的持仓）随口一说，不保证对。不想看可以在设置里关掉。` }));
    root.addAt(hit, 1);
    root.setVisible(!this.suppressed);
    this.root = root;
    if (anim && !anim.calm) {
      root.setAlpha(0);
      anim.fx({ targets: root, alpha: 1, duration: 220 }, () => root.setAlpha(1));
    }
  }

  hide(): void {
    this.root?.destroy();
    this.root = null;
    this.text = '';
  }

  setSuppressed(on: boolean): void {
    this.suppressed = on;
    this.root?.setVisible(!on);
  }

  get visible(): boolean {
    return this.root !== null;
  }

  /** 气泡占的区域（教程气泡要避开它；没显示时为 null）。 */
  rect(): Rect | null {
    return this.root && !this.suppressed ? { ...HINT_RECT } : null;
  }

  get shownText(): string {
    return this.root ? this.text : '';
  }
}

/** 猫头像；缺素材时画一个橘色圆脸 */
function catFace(s: Phaser.Scene, cx: number, cy: number, size: number): Phaser.GameObjects.GameObject[] {
  return hasArt(s.textures, CAT_HINT_KEY)
    ? [addImage(s, cx, cy, CAT_HINT_KEY, size)]
    : [s.add.circle(cx, cy, size / 2 - 2, 0xf3a54a).setStrokeStyle(2.5, COLOR.ink, 1), addText(s, cx, cy, '喵', { size: Math.max(10, Math.round(size * 0.3)), bold: true, color: COLOR.ink, originX: 0.5, originY: 0.5 })];
}
