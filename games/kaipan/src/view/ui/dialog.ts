import Phaser from 'phaser';
import { addBackdrop } from '../fx/effects.ts';
import { sound } from '../sound.ts';
import { COLOR, FS, TYPE } from '../theme.ts';
import { Button, HIT_MIN } from './button.ts';
import type { Glyph } from '../assets.ts';
import { addGlyph, addPaper } from './art.ts';
import { bindTooltip, hideTooltip, type TipContent } from './tooltip.ts';
import { addText } from './text.ts';
import { viewOf } from '../viewport.ts';
import { group } from '../../core/format.ts';

/** 场景数据里的标记：有对话框打开时，场景的快捷键暂停响应。 */
export const OVERLAY_FLAG = 'overlayOpen';
/** 场景数据里最近打开的对话框（右键取消时关它；已关的 isClosed 为 true） */
export const TOP_DIALOG = 'topDialog';

/**
 * 居中对话框（设置、关于、确认等）：遮罩拦截点击，Esc 或右上角关闭。
 * 内容加到 inner（原点为面板左上角）。
 */
/**
 * 手机上整屏弹窗的大小（0.19.1）：世界是 718–960×404（见 theme.ts 的 phoneWorld），弹窗最宽 940、最高 430，
 * 四周各留一点边：SE 上 702×392，844×390 上 858×392，宽屏 940×392。
 */
export function phonePanel(scene: Phaser.Scene): { w: number; h: number } {
  const V = viewOf(scene);
  // 竖屏版（0.33.0，世界 404 × 718–960）：整屏面板占满高度，上下各留 12，内容按单列排（各面板自己的竖屏几何）
  if (V.h > V.w) return { w: V.w - 16, h: V.h - 24 };
  return { w: Math.min(940, V.w - 16), h: Math.min(430, V.h - 12) };
}

/**
 * 定宽弹窗的宽：竖屏版（0.33.0）世界只有 404 宽，按设计宽和「屏宽 − 16」取小。
 * 用到它的弹窗在变窄后自己重排（按钮均分、说明折行），不整体缩小（字号守 docs/ui.md 的下限）。
 */
export function dialogW(scene: Phaser.Scene, w: number): number {
  return Math.min(w, viewOf(scene).w - 16);
}

export class Dialog extends Phaser.GameObjects.Container {
  readonly inner: Phaser.GameObjects.Container;
  readonly dw: number;
  readonly dh: number;
  private readonly onClosed: (() => void) | undefined;
  private closed = false;
  private readonly keyHandler: (e: KeyboardEvent) => void;
  /** 按空格也收起（买卖菜单：空格是「开盘」，菜单盖着时先收菜单，再按一次才开盘） */
  protected spaceCloses = false;
  /** 点遮罩关闭；必须做决定的弹窗（结算、确认离开、解锁）关掉它，✕、Esc 或「取消」仍可关 */
  protected closeOnBackdrop = true;
  /** 可以叠在别的面板上（确认框）：此时不关旧的，两层为限 */
  protected get stacksOnTop(): boolean {
    return false;
  }
  /** 叠在哪个面板上（关掉自己后焦点和遮罩标记还给它） */
  private parentDialog: Dialog | null = null;
  /** 遮罩和面板分开：进出场时面板缩放，遮罩只淡入淡出（缩放遮罩会露出屏幕边） */
  private readonly backdrop: Phaser.GameObjects.Image;
  private readonly sheet: Phaser.GameObjects.Container;
  private enterTween: Phaser.Tweens.Tween | null = null;
  /** 自动化用：命名按钮 */
  protected readonly named: Record<string, { center(): { x: number; y: number }; parentContainer?: Phaser.GameObjects.Container | null }> = {};

  /** 遮罩的不透明度：整屏大面板（新一局、每日挑战）盖在标题页那排按钮上，传 SOLID_BACKDROP_ALPHA 做实，不然按钮下半截从面板边上露出来 */
  private readonly backdropAlpha: number;

  constructor(scene: Phaser.Scene, w: number, h: number, title: string, onClosed?: () => void, backdropAlpha = BACKDROP_ALPHA) {
    super(scene, 0, 0);
    this.dw = w;
    this.dh = h;
    this.onClosed = onClosed;
    this.backdropAlpha = backdropAlpha;
    // 点开弹窗的那下鼠标多半还停在按钮上：按钮的悬停说明先收起，不然会盖在弹窗上面
    hideTooltip(scene);
    const V = viewOf(scene);
    const x = Math.round((V.w - w) / 2);
    const y = Math.round((V.h - h) / 2);
    const backdrop = addBackdrop(scene, backdropAlpha);
    const panel = addPaper(scene, x, y, w, h);
    const hitPanel = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    const head = addText(scene, x + 28, y + 24, title, { size: TYPE.title + 2, bold: true, color: COLOR.ink });
    const underline = scene.add.rectangle(x + 28, y + 54, Math.min(w - 56, head.width + 24), 4, COLOR.accent).setOrigin(0, 0).setRounded(2);
    // 关闭钮：有底的圆形按钮（看得见的直径 40，手机世界缩放后仍 ≥ 36px），点区 ≥ 44（触屏按 HIT_MIN 撑）
    const cx = x + w - 14 - CLOSE_D / 2;
    const cy = y + 14 + CLOSE_D / 2;
    const closeBg = scene.add.circle(cx, cy, CLOSE_D / 2, COLOR.paperHi).setStrokeStyle(2, COLOR.edge, 1);
    const closeX = addText(scene, cx, cy - 1, '×', { size: FS.xxl, color: COLOR.muted, originX: 0.5, originY: 0.5 });
    const closeSide = Math.max(44, HIT_MIN);
    const closeHit = scene.add.rectangle(cx, cy, closeSide, closeSide, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    closeHit.on(Phaser.Input.Events.POINTER_UP, () => this.close());
    closeHit.on(Phaser.Input.Events.POINTER_OVER, () => closeBg.setFillStyle(COLOR.paper));
    closeHit.on(Phaser.Input.Events.POINTER_OUT, () => closeBg.setFillStyle(COLOR.paperHi));
    // 点遮罩关闭（必须做决定的弹窗把 closeOnBackdrop 关掉）；遮罩上盖着面板的 hitPanel，点面板里不会走到这里
    backdrop.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.closeOnBackdrop && backdropAlpha < SOLID_BACKDROP_ALPHA) this.close();
    });
    this.inner = scene.add.container(x, y);
    this.backdrop = backdrop;
    this.sheet = scene.add.container(0, 0, [panel, hitPanel, head, underline, closeBg, closeX, closeHit, this.inner]);
    // 同时只开一个：新的打开时旧的先关；确认框这类 stacksOnTop 的可以叠在面板上（最多两层）
    const prev = scene.data.get(TOP_DIALOG) as Dialog | undefined;
    if (prev && !prev.closed) {
      if (this.stacksOnTop && !prev.parentDialog) this.parentDialog = prev;
      else {
        const keep = prev.parentDialog;
        prev.close();
        if (keep && !keep.closed && this.stacksOnTop) this.parentDialog = keep;
        else keep?.close();
      }
    }
    this.add([backdrop, this.sheet]);
    this.setDepth(this.parentDialog ? 310 : 300);
    this.enterAnim();
    scene.add.existing(this);
    scene.data.set(OVERLAY_FLAG, true);
    scene.data.set(TOP_DIALOG, this);
    this.keyHandler = (e: KeyboardEvent) => {
      if (scene.data.get(TOP_DIALOG) !== this || handledKey === e) return;
      if (e.code === 'Escape' || (e.code === 'Space' && this.spaceCloses)) {
        handledKey = e;
        this.close();
      }
    };
    scene.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.keyHandler);
    sound.ui('open');
  }

  /**
   * 0.5 统一弹窗按钮：主按钮橙色在右、次按钮白色在左，贴在面板右下角。
   * spec.name 给自动化脚本用（写进 named）。返回两个按钮（没给的为 null）。
   */
  protected actions(primary: ActionSpec | null, secondary?: ActionSpec | null): { primary: Button | null; secondary: Button | null } {
    const r = actionButtons(this.scene, this.inner, this.dw - 28, this.dh - 22, primary, secondary);
    if (primary?.name && r.primary) this.named[primary.name] = r.primary;
    if (secondary?.name && r.secondary) this.named[secondary.name] = r.secondary;
    return r;
  }

  controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const [k, b] of Object.entries(this.named)) out[k] = b.center();
    return out;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * 进场：面板从 0.92 倍放大到 1 并淡入（约 200 毫秒）；减少动态效果只淡入，关动画（anim=0、自动化）直接出现。
   * 按屏幕中心缩放，面板里的按钮位置最多偏几个像素，动画结束前后坐标一致。
   */
  private enterAnim(): void {
    const scene = this.scene;
    if (scene.data.get('animOff') === true) return;
    const calm = scene.data.get('calm') === true;
    this.applyPose(0, calm);
    this.enterTween = scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: calm ? ENTER_CALM_MS : ENTER_MS,
      ease: calm ? 'Quad.easeOut' : 'Back.easeOut',
      onUpdate: (tw) => this.applyPose(Math.min(1, tw.getValue() ?? 1), calm),
      onComplete: () => this.applyPose(1, calm),
    });
  }

  /** t = 0 完全隐藏（缩小、透明），t = 1 就位。 */
  private applyPose(t: number, calm: boolean): void {
    const V = viewOf(this.scene);
    const s = calm ? 1 : POP_FROM + (1 - POP_FROM) * t;
    const a = Math.max(0, Math.min(1, t));
    this.sheet.setScale(s).setPosition((V.w / 2) * (1 - s), (V.h / 2) * (1 - s)).setAlpha(a);
    this.backdrop.setAlpha(this.backdropAlpha * a);
  }

  /**
   * 退场：面板淡出并缩小到 0.94（约 150 毫秒）。弹窗本身立刻销毁（按键监听、回调和以前一样马上结束），
   * 只把遮罩和面板摘出来交给一个临时容器播完动画：期间所有按钮锁住，不会重复触发。
   */
  private exitAnim(): boolean {
    const scene = this.scene;
    if (scene.data.get('animOff') === true || !scene.sys.isActive()) return false;
    const calm = scene.data.get('calm') === true;
    const V = viewOf(scene);
    this.enterTween?.stop();
    const ghost = scene.add.container(0, 0).setDepth(300);
    this.remove([this.backdrop, this.sheet]);
    ghost.add([this.backdrop, this.sheet]);
    freeze(ghost);
    const sheet = this.sheet;
    const backdrop = this.backdrop;
    const backdropAlpha = this.backdropAlpha;
    scene.tweens.addCounter({
      from: 1,
      to: 0,
      duration: calm ? ENTER_CALM_MS : EXIT_MS,
      ease: 'Quad.easeIn',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        const s = calm ? 1 : EXIT_TO + (1 - EXIT_TO) * t;
        sheet.setScale(s).setPosition((V.w / 2) * (1 - s), (V.h / 2) * (1 - s)).setAlpha(t);
        backdrop.setAlpha(backdropAlpha * t);
      },
      onComplete: () => ghost.destroy(),
    });
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.keyHandler);
    // 同一次按键里，场景的快捷键处理在本处理之后执行：下一帧再放开
    const scene = this.scene;
    // 叠在面板上的确认框关掉后，面板还开着：标记和「最上层」还给它
    const parent = this.parentDialog && !this.parentDialog.closed ? this.parentDialog : null;
    if (scene.data.get(TOP_DIALOG) === this && parent) scene.data.set(TOP_DIALOG, parent);
    // 关的时候若已经有新弹窗接上（旧的被新的关掉、或 onClosed 里开了下一个），不能把它的标记清掉
    scene.time.delayedCall(0, () => {
      const top = scene.data.get(TOP_DIALOG) as Dialog | undefined;
      if (!top || top.closed) scene.data.set(OVERLAY_FLAG, false);
    });
    sound.ui('close');
    const done = this.onClosed;
    this.exitAnim();
    this.destroy();
    done?.();
  }
}

/** 进场、退场时长（毫秒）和起止缩放；减少动态效果只淡入淡出 */
const BACKDROP_ALPHA = 0.5;
/** 关闭钮看得见的直径（世界单位；手机世界约 0.9 倍，屏幕上仍 ≥ 36px） */
const CLOSE_D = 40;
/** 同一次按键只让最上面一层响应（确认框关掉后，下面的面板不跟着关） */
let handledKey: KeyboardEvent | null = null;
export const SOLID_BACKDROP_ALPHA = 0.97;
const ENTER_MS = 200;
const ENTER_CALM_MS = 140;
const EXIT_MS = 150;
const POP_FROM = 0.92;
const EXIT_TO = 0.94;

/** 把容器里所有按钮锁住、所有可点的东西关掉交互（淡出时用）。 */
function freeze(c: Phaser.GameObjects.Container): void {
  for (const child of c.list) {
    if (child instanceof Button) child.setLocked(true);
    if (child.input) child.disableInteractive();
    if (child instanceof Phaser.GameObjects.Container) freeze(child);
  }
}

/** 弹窗按钮：文字 ≤ 4 个字；hotkey 是快捷键角标。 */
interface ActionSpec {
  label: string;
  onClick: () => void;
  hotkey?: string;
  /** 自动化用的控件名（Dialog.actions 写进 named） */
  name?: string;
  /** 点击音效；null 不发声 */
  sound?: null;
  /** 丢东西、没法撤回的操作：用危险色（红系），不和主按钮同色 */
  danger?: boolean;
}

/** 主按钮、次按钮的尺寸（所有弹窗一致）。 */
const ACTION_SIZE = { primary: { w: 136, h: 46 }, secondary: { w: 112, h: 46 }, gap: 14 } as const;

/**
 * 0.5 统一弹窗按钮（Dialog 之外的浮层也用）：主按钮橙色在右、次按钮白色在左。
 * (right, bottom) 为按钮区右下角，坐标相对 parent。
 */
export function actionButtons(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  right: number,
  bottom: number,
  primary: ActionSpec | null,
  secondary?: ActionSpec | null,
): { primary: Button | null; secondary: Button | null } {
  const P = ACTION_SIZE.primary;
  const S = ACTION_SIZE.secondary;
  let x = right;
  let p: Button | null = null;
  let s2: Button | null = null;
  if (primary) {
    x -= P.w;
    p = new Button(scene, x, bottom - P.h, { width: P.w, height: P.h, label: primary.label, variant: primary.danger ? 'danger' : 'primary', fontSize: TYPE.title, hotkey: primary.hotkey, onClick: primary.onClick, ...(primary.sound === null ? { sound: null } : {}) });
    parent.add(p);
    x -= ACTION_SIZE.gap;
  }
  if (secondary) {
    x -= S.w;
    s2 = new Button(scene, x, bottom - S.h, { width: S.w, height: S.h, label: secondary.label, variant: 'default', fontSize: TYPE.title - 2, hotkey: secondary.hotkey, onClick: secondary.onClick, ...(secondary.sound === null ? { sound: null } : {}) });
    parent.add(s2);
  }
  return { primary: p, secondary: s2 };
}

/** 短金额：¥7,900、¥2万、¥2.5万、¥1.2亿（卡片上的大数字用；精确值放悬停）。sign 为 true 时正数带 +。 */
export function moneyShort(v: number, sign = false): string {
  const a = Math.abs(v);
  const s = Math.round(a) === 0 ? '' : v < 0 ? '-' : sign ? '+' : '';
  const trim = (x: number): string => String(Math.round(x * 10) / 10);
  if (a >= 1e8) return `${s}¥${trim(a / 1e8)}亿`;
  if (a >= 1e4) return `${s}¥${trim(a / 1e4)}万`;
  return `${s}¥${group(Math.round(a))}`;
}

/**
 * 小图标 + 短标签的胶囊（看点卡的规则 / 要还的钱、银行的可押物等）。(x, y) 为左上角，高 32。
 * tip 给了就绑悬停说明。返回容器和宽度。
 */
export function iconChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: Glyph,
  label: string,
  opts: { color?: number; fill?: number; bold?: boolean; tip?: TipContent; tint?: number } = {},
): { node: Phaser.GameObjects.Container; w: number } {
  const H = 32;
  const t = addText(scene, 34, H / 2, label, { size: TYPE.label + 1, bold: opts.bold ?? true, color: opts.color ?? COLOR.ink, originY: 0.5 });
  const w = Math.round(t.width + 46);
  const bg = scene.add.rectangle(0, 0, w, H, opts.fill ?? COLOR.paperHi).setOrigin(0, 0).setRounded(H / 2).setStrokeStyle(2, COLOR.edge, 1);
  const g = addGlyph(scene, 18, H / 2, glyph, 24, opts.tint);
  const node = scene.add.container(x, y, [bg, g, t]);
  const tip = opts.tip;
  if (tip) {
    bg.setInteractive();
    bindTooltip(bg, () => {
      const m = bg.getWorldTransformMatrix();
      return { x: m.tx, y: m.ty, w, h: H };
    }, () => tip);
  }
  return { node, w };
}
