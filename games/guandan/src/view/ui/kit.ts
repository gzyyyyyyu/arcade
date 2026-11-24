/**
 * 界面小组件：文字、按钮、图标按钮、面板、弹窗、气泡、提示条。
 * 底板全用 Graphics 画（矢量，相机 zoom 后依然锐利），尺寸随用随定，不需要预烘焙贴图。
 */
import Phaser from 'phaser';
import { BUTTON, BUTTON_TIER, COLOR, FONT, FONT_NUM, FONT_TITLE, LIGHT, OUTLINE, RADIUS, RENDER_SCALE, TIER, TYPE, css, minHit, signColor, signColorOnDark, typeFloor } from '../common/theme.ts';
import { signed } from '../common/stake-text.ts';
import type { ButtonTier } from '../common/theme.ts';
import { audio } from '../common/audio.ts';
import { focusable, pushLayer } from './focus.ts';

/**
 * 改点按区域（世界坐标，以对象中心为中心，dy 是往下挪多少）：按钮、图标按钮、区域都能用。
 * 区域（Zone）的原点不一定在中心，按它自己的原点算。上下挨得近的（主页的切换和主按钮）用 dy 把点按区挪到空着的那一边，不互相压着。
 */
export function setHit(obj: Phaser.GameObjects.Container | Phaser.GameObjects.Zone, w: number, h: number, dy = 0): void {
  const cx = obj.x;
  const cy = obj.y;
  if (obj instanceof Phaser.GameObjects.Zone && (obj.originX !== 0.5 || obj.originY !== 0.5)) {
    const left = cx + obj.width * (0.5 - obj.originX) - w / 2;
    const top = cy + obj.height * (0.5 - obj.originY) - h / 2;
    obj.setOrigin(0, 0).setPosition(left, top);
  }
  obj.setSize(w, h);
  if (!obj.input) obj.setInteractive({ useHandCursor: true });
  obj.input!.hitArea.setTo(0, dy, w, h);
}

/**
 * 贴着屏幕上沿的顶栏按钮（对象直接放在场景里或放在原点的容器里）：点按区域从上沿往下 h 高，不伸出屏幕。
 * 伸出去的那截点不到，手机横屏上露在屏内的就不够 44 CSS 像素。
 */
export function setTopHit(obj: Phaser.GameObjects.Container, w: number, h: number): void {
  setHit(obj, w, h, Math.max(0, h / 2 - obj.y));
}

export function worldW(scene: Phaser.Scene): number {
  return Math.round(scene.scale.gameSize.width / RENDER_SCALE);
}
/** 世界高度：牌桌和横屏主页是 720（GAME_HEIGHT），竖屏的主页按屏幕比例更高（theme.ts 的 worldSizeFor） */
export function worldH(scene: Phaser.Scene): number {
  return Math.round(scene.scale.gameSize.height / RENDER_SCALE);
}

interface TextOpts {
  size?: number;
  color?: number;
  bold?: boolean;
  font?: 'body' | 'title' | 'num';
  align?: 'left' | 'center' | 'right';
  ox?: number;
  oy?: number;
  stroke?: number;
  strokeWidth?: number;
  /** 自动换行宽度（按字符断行） */
  wrap?: number;
  lineSpacing?: number;
  shadow?: boolean;
  /** 手机字号托底按纯数字（14）还是按字（12）算；不给就看这段字本身。一行切成几段时按整行算，免得数字那段比旁边的字大 */
  numeric?: boolean;
}

/** 中文按字符断行，行首避开标点。 */
function cjkWrap(text: string, obj: Phaser.GameObjects.Text, width: number): string[] {
  const ctx = obj.context;
  const out: string[] = [];
  const noStart = '，。、；：？！）》」%,.;:?!)';
  for (const para of text.split('\n')) {
    const atoms = para.match(/[A-Za-z0-9.+\-×%]+|./gu) ?? [];
    let line = '';
    for (const a of atoms) {
      if (line && ctx.measureText(line + a).width > width && !noStart.includes(a)) {
        out.push(line);
        line = a.trim() ? a : '';
      } else line += a;
    }
    out.push(line);
  }
  return out;
}

/** 按数字托底的字：数字加上 ×、%、+-、小数点、斜杠和空格（"27"、"A×2" 不算，"×2" 算） */
const NUMERIC = /^[\d\s×%+\-.,/:]+$/;

export function text(scene: Phaser.Scene, x: number, y: number, str: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const family = o.font === 'title' ? FONT_TITLE : o.font === 'num' ? FONT_NUM : FONT;
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: family,
    // 手机横屏按 typeFloor 托底：字 ≥ 12、纯数字（张数、比分、点数）≥ 14 CSS 像素
    fontSize: `${Math.max(o.size ?? TYPE.body, typeFloor(o.font === 'num' || (o.numeric ?? NUMERIC.test(str))))}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color: css(o.color ?? COLOR.ink),
    align: o.align ?? 'center',
    resolution: RENDER_SCALE,
    lineSpacing: o.lineSpacing ?? 4,
  };
  if (o.stroke !== undefined) {
    style.stroke = css(o.stroke);
    style.strokeThickness = o.strokeWidth ?? 4;
  }
  if (o.shadow) style.shadow = { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,0.55)', blur: 4, fill: true, stroke: true };
  const w = o.wrap;
  if (w !== undefined) style.wordWrap = { callback: (t: string, obj: Phaser.GameObjects.Text) => cjkWrap(t, obj, w) };
  return scene.add.text(x, y, str, style).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);
}

/**
 * 一行字里的输赢数字单独红绿（docs/ui.md 第 9 节：数字正绿负红）。一个 Text 只能一种颜色，所以按 `{0}`、`{1}` 把句子切开，
 * 数字（按 signed() 写成 +1,500 / -1,500）各成一段、照常挨着往右排：不换行、不重排整句，其余的字还是 o.color。
 * dark：深色底上用亮一档的红绿。返回的容器 width / height 是整行的，原点按 o.ox（默认居中）算，可以像 Text 一样拿 width 排旁边的东西。
 */
export function signedLine(scene: Phaser.Scene, x: number, y: number, tpl: string, nums: readonly number[], o: TextOpts & { dark?: boolean } = {}): Phaser.GameObjects.Container {
  const parts = tpl.split(/\{(\d+)\}/);
  const whole = parts.map((p, i) => (i % 2 ? signed(nums[Number(p)] ?? 0) : p)).join('');
  const base = o.color ?? COLOR.ink;
  const segs: Phaser.GameObjects.Text[] = [];
  let w = 0;
  parts.forEach((p, i) => {
    const n = i % 2 ? (nums[Number(p)] ?? 0) : 0;
    const s = i % 2 ? signed(n) : p;
    if (!s) return;
    const color = i % 2 ? (o.dark ? signColorOnDark(n, base) : signColor(n, base)) : base;
    // 数字段是分数、筹码：一律按数字的下限（ui.md 金额最小 14），不跟着整句当正文（斗地主"继续上局 · 我 0 分"手机上 0 只有 12px）
    const t = text(scene, w, 0, s, { ...o, color, ox: 0, numeric: i % 2 ? true : (o.numeric ?? (o.font === 'num' || NUMERIC.test(whole))) });
    segs.push(t);
    w += t.width;
  });
  const h = Math.max(0, ...segs.map((t) => t.height));
  const ox = o.ox ?? 0.5;
  for (const t of segs) t.x -= w * ox;
  return scene.add.container(x, y, segs).setSize(w, h);
}

/** 宽过 max 就从尾巴上删字、补"…"（手机档字号托底以后放不下的一行：删字，不缩字） */
export function fitWidth(t: Phaser.GameObjects.Text, max: number): Phaser.GameObjects.Text {
  if (t.width <= max) return t;
  const chars = Array.from(t.text);
  while (chars.length > 1 && t.width > max) {
    chars.pop();
    t.setText(`${chars.join('')}…`);
  }
  return t;
}

/** 按比例调亮调暗（×f），和美术那边按 [-1,1] 往黑白拉的 shade 不同 */
function shade(c: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

export type ButtonStyle = Exclude<keyof typeof BUTTON, 'off'>;

/**
 * 圆角按钮底板：有质感的卡通。从下往上：柔和的环境投影（光在上方，影子往下偏）、深墨实色下沿（按下时面板下沉到下沿上）、
 * 三段轻渐变的面（下暗、中间本色、上亮，Canvas 渲染不支持渐变填充，用叠层画）、顶边半透明高光、深墨描边。
 * 三档的厚薄、明暗、高光和投影浓度都取自 theme.ts 的 TIER（主按钮最重，弱按钮扁，不可点压平）。
 */
function drawPlate(g: Phaser.GameObjects.Graphics, w: number, h: number, fill: number, rim: number, r: number = RADIUS.lg, pressed = false, tier: ButtonTier = 'secondary'): void {
  g.clear();
  const T = TIER[tier];
  const L = T.ledge;
  const dy = pressed ? L - 1 : 0;
  const top = -h / 2 + dy;
  const fh = h - L;
  // 环境投影：两层由浓到淡，按下时收一点；主按钮的影子带一点本色，像红漆反的光
  const sh = tier === 'primary' ? shade(fill, 0.35) : LIGHT.shadow;
  if (T.drop > 0) {
    g.fillStyle(sh, pressed ? T.drop * 0.7 : T.drop);
    g.fillRoundedRect(-w / 2 - 2, -h / 2 + L + T.rise, w + 4, fh + 2, r + 2);
    g.fillStyle(sh, pressed ? T.drop * 0.45 : T.drop * 0.7);
    g.fillRoundedRect(-w / 2 - 4, -h / 2 + L + T.rise * 1.75, w + 8, fh + 2, r + 4);
  }
  g.fillStyle(OUTLINE.color, 1);
  g.fillRoundedRect(-w / 2, -h / 2 + L, w, fh, r);
  g.fillStyle(shade(fill, T.bottom), 1);
  g.fillRoundedRect(-w / 2, top, w, fh, r);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, top, w, fh * 0.72, r);
  g.fillStyle(shade(fill, T.top), 1);
  g.fillRoundedRect(-w / 2, top, w, fh * 0.4, { tl: r, tr: r, bl: 6, br: 6 });
  if (T.hi > 0) {
    g.fillStyle(rim, T.hi * 0.65);
    g.fillRoundedRect(-w / 2 + 6, top + 4, w - 12, Math.max(4, fh * 0.14), { tl: r - 5, tr: r - 5, bl: 3, br: 3 });
    g.lineStyle(1, LIGHT.highlight, T.hi);
    g.lineBetween(-w / 2 + r, top + 2.5, w / 2 - r, top + 2.5);
    // 主按钮再补一道底边反光，面更圆
    if (tier === 'primary') {
      g.fillStyle(rim, 0.22);
      g.fillRoundedRect(-w / 2 + 10, top + fh - 9, w - 20, 4, 2);
    }
  }
  g.lineStyle(OUTLINE.width, OUTLINE.color, 1);
  g.strokeRoundedRect(-w / 2, top, w, fh, r);
}

/** 本地坐标里的外框（世界单位） */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 不变的 Graphics 画法烘成纹理贴到 img 上：按渲染倍数用 Canvas 2D 画（带抗锯齿），同一个 key 只画一次、大家共用。
 * WebGL 下 Graphics 每帧都重新拆点、三角化（每段圆弧固定 100 个点），按钮底板、牌影这类不变的东西每帧白算；烘成图以后每帧只是贴一张图。
 * box 要包住画出来的全部（含描边、投影），key 要包含所有影响画法的参数。
 */
export function bakeInto(img: Phaser.GameObjects.Image, key: string, box: Box, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  const x = Math.floor(box.x);
  const y = Math.floor(box.y);
  const w = Math.ceil(box.x + box.w) - x;
  const h = Math.ceil(box.y + box.h) - y;
  const scene = img.scene;
  if (!scene.textures.exists(key)) {
    const g = new Phaser.GameObjects.Graphics(scene);
    draw(g);
    // 画法里可能先 clear()，所以缩放、平移的命令等画完再插到最前面
    const cmds = g.commandBuffer.slice();
    g.clear().scaleCanvas(RENDER_SCALE, RENDER_SCALE).translateCanvas(-x, -y);
    g.commandBuffer.push(...cmds);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * RENDER_SCALE);
    canvas.height = Math.ceil(h * RENDER_SCALE);
    g.generateTexture(canvas);
    g.destroy();
    scene.textures.addCanvas(key, canvas);
  }
  img.setTexture(key).setDisplaySize(w, h).setPosition(x + w / 2, y + h / 2);
}

/** drawPlate 画出来的外框：左右各出 4 像素投影，下面多出投影的下移，描边再各出一半 */
function plateBox(w: number, h: number, tier: ButtonTier): Box {
  const pad = 4 + OUTLINE.width;
  return { x: -w / 2 - pad, y: -h / 2 - pad, w: w + 2 * pad, h: h + 2 * pad + TIER[tier].rise * 1.75 + 2 };
}

/** 按钮底板烘成的图（同样的尺寸、颜色、状态共用一张） */
function bakePlate(img: Phaser.GameObjects.Image, w: number, h: number, fill: number, rim: number, r: number, pressed: boolean, tier: ButtonTier): void {
  bakeInto(img, `plate:${w}x${h}:${fill}:${rim}:${r}:${pressed ? 1 : 0}:${tier}`, plateBox(w, h, tier), (g) => drawPlate(g, w, h, fill, rim, r, pressed, tier));
}

/**
 * 按钮：常态、悬停（亮一点、放大一点）、按下（下沉、缩一点）、禁用（灰）、键盘焦点（focus.ts 画框）、加载中（转圈，点了没反应）。
 * 点按区域至少 minHit() 见方（画出来的可以小），挨得近的调用方用 setHit 收窄；按下和抬起都在它上面才算点了一下。
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image | null = null;
  private spinner: Phaser.GameObjects.Graphics | null = null;
  private enabledFlag = true;
  private loadingFlag = false;
  private hover = false;
  private down = false;
  private styleName: ButtonStyle;
  readonly bw: number;
  readonly bh: number;
  onClick: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, style: ButtonStyle, onClick: () => void, iconKey?: string) {
    super(scene, x, y);
    this.bw = w;
    this.bh = h;
    this.styleName = style;
    this.onClick = onClick;
    this.bg = scene.add.image(0, 0, '__DEFAULT');
    this.add(this.bg);
    const st = BUTTON[style];
    const size = h >= 56 ? TYPE.title : TYPE.body;
    if (iconKey && scene.textures.exists(`icon:${iconKey}`)) {
      const isz = Math.round(h * 0.5);
      this.icon = scene.add.image(0, -2, `icon:${iconKey}`).setDisplaySize(isz, isz).setTint(st.text);
      this.add(this.icon);
    }
    this.label = text(scene, 0, -2, label, { size, color: st.text, bold: true, stroke: shade(st.fill, 0.5), strokeWidth: 3 });
    this.add(this.label);
    this.layoutContent();
    this.redraw();
    this.setHit(Math.max(w, minHit()), Math.max(h, minHit()));
    this.on('pointerover', () => {
      this.hover = true;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.hover = false;
      this.down = false;
      this.redraw();
    });
    // 右键不算点按（右键用来取消选牌，点在按钮上不该顺手出牌）
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.usable || p.button === 2) return;
      this.down = true;
      this.redraw();
    });
    this.on('pointerup', () => {
      const was = this.down;
      this.down = false;
      this.redraw();
      if (was) this.press();
    });
    focusable(this, w, h, () => this.press(), () => this.usable);
    scene.add.existing(this);
  }

  /** 点按区域（世界坐标，以按钮中心为中心）；默认至少 minHit() 见方，挨得近的调用方按间距收窄 */
  setHit(w: number, h: number, dy = 0): this {
    setHit(this, w, h, dy);
    return this;
  }

  private get usable(): boolean {
    return this.enabledFlag && !this.loadingFlag;
  }

  /** 按一下：点按、键盘焦点的回车、快捷键（ui/shortcuts.ts）都走这里，音效和禁用状态一致 */
  press(): void {
    if (!this.usable) return;
    audio.sfx('click');
    this.onClick();
  }

  private layoutContent(): void {
    if (this.icon && this.label.text) {
      const iw = this.icon.displayWidth;
      const total = iw + 8 + this.label.width;
      this.icon.x = -total / 2 + iw / 2;
      this.label.x = this.icon.x + iw / 2 + 8 + this.label.width / 2;
    } else if (this.icon) {
      this.icon.x = 0;
    }
  }

  private redraw(): void {
    const on = this.enabledFlag;
    const pressed = on && this.down;
    const st = on ? BUTTON[this.styleName] : BUTTON.off;
    const fill = on && this.hover && !pressed ? shade(st.fill, 1.1) : st.fill;
    bakePlate(this.bg, this.bw, this.bh, fill, st.rim, RADIUS.lg, pressed, on ? BUTTON_TIER[this.styleName] : 'off');
    const dy = pressed ? 2 : 0;
    this.label.y = -2 + dy;
    if (this.icon) this.icon.y = -2 + dy;
    if (this.spinner) this.spinner.y = -2 + dy;
    this.setScale(!this.usable ? 1 : pressed ? 0.97 : this.hover ? 1.03 : 1);
  }

  setText(s: string): this {
    this.label.setText(s);
    this.layoutContent();
    return this;
  }

  setEnabled(on: boolean): this {
    if (on === this.enabledFlag) return this;
    this.enabledFlag = on;
    const st = on ? BUTTON[this.styleName] : BUTTON.off;
    this.label.setColor(css(st.text));
    this.label.setStroke(css(on ? shade(st.fill, 0.5) : 0x3a302a), 3);
    this.icon?.setTint(st.text);
    // 不可点的字也淡一档，和能点的差得开
    if (!this.loadingFlag) {
      this.label.setAlpha(on ? 1 : 0.7);
      this.icon?.setAlpha(on ? 1 : 0.7);
    }
    if (!on) this.down = false;
    this.redraw();
    return this;
  }

  /** 加载中：字和图标淡下去，中间转圈；这期间点了不算（等钱包、开房这类要等回话的） */
  setLoading(on: boolean): this {
    if (on === this.loadingFlag) return this;
    this.loadingFlag = on;
    const rest = this.enabledFlag ? 1 : 0.7;
    this.label.setAlpha(on ? 0.25 : rest);
    this.icon?.setAlpha(on ? 0.25 : rest);
    if (on) {
      const r = Math.min(14, this.bh * 0.24);
      const g = this.scene.add.graphics();
      g.lineStyle(4, BUTTON[this.styleName].text, 0.35).strokeCircle(0, 0, r);
      g.lineStyle(4, BUTTON[this.styleName].text, 1).beginPath().arc(0, 0, r, -Math.PI / 2, 0).strokePath();
      g.y = -2;
      this.add(g);
      this.spinner = g;
      this.scene.tweens.add({ targets: g, angle: 360, duration: 800, repeat: -1 });
    } else if (this.spinner) {
      this.scene.tweens.killTweensOf(this.spinner);
      this.spinner.destroy();
      this.spinner = null;
    }
    this.down = false;
    this.redraw();
    return this;
  }

  get enabled(): boolean {
    return this.enabledFlag;
  }

  get loading(): boolean {
    return this.loadingFlag;
  }
}

/**
 * 主页的模式卡（art-v3 PR ①）：和按钮同一种立体面板，竖着排图标、名字、一两行说明。悬停、按下、键盘焦点和 Button 一样；
 * 点按区域就是卡本身（卡比 minHit 大）
 */
export class ModeCard extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private hover = false;
  private down = false;
  readonly bw: number;
  readonly bh: number;
  private onClick: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, name: string, desc: string, style: ButtonStyle, iconKey: string, onClick: () => void) {
    super(scene, x, y);
    this.onClick = onClick;
    this.bw = w;
    this.bh = h;
    const st = BUTTON[style];
    this.bg = scene.add.image(0, 0, '__DEFAULT');
    this.add(this.bg);
    // 内容按 150 高排、在卡里竖着居中（高竖屏主页的卡更高）
    const top = -Math.min(h, 150) / 2;
    const icon = scene.add.image(0, top + 34, `icon:${iconKey}`).setDisplaySize(40, 40).setTint(st.text);
    const title = text(scene, 0, top + 76, name, { size: TYPE.title, bold: true, color: st.text, stroke: shade(st.fill, 0.5), strokeWidth: 3 });
    const sub = text(scene, 0, top + 108, desc, { size: TYPE.small, color: st.text, wrap: w - 20, oy: 0 }).setAlpha(0.9);
    this.add([icon, title, sub]);
    this.setData('style', style);
    this.paint();
    setHit(this, w, h);
    this.on('pointerover', () => {
      this.hover = true;
      this.paint();
    });
    this.on('pointerout', () => {
      this.hover = false;
      this.down = false;
      this.paint();
    });
    this.on('pointerdown', () => {
      this.down = true;
      this.paint();
    });
    this.on('pointerup', () => {
      const was = this.down;
      this.down = false;
      this.paint();
      if (was) this.press();
    });
    focusable(this, w, h, () => this.press());
    scene.add.existing(this);
  }

  private press(): void {
    audio.sfx('click');
    this.onClick();
  }

  private paint(): void {
    const st = BUTTON[this.getData('style') as ButtonStyle];
    const pressed = this.down;
    bakePlate(this.bg, this.bw, this.bh, this.hover && !pressed ? shade(st.fill, 1.1) : st.fill, st.rim, RADIUS.xl, pressed, 'secondary');
    this.setScale(pressed ? 0.98 : this.hover ? 1.02 : 1);
  }
}

/**
 * 圆形木质图标按钮（顶栏用）。点按区域默认至少 minHit() 见方，挨得近的调用方用 setHit 收窄到间距。
 * label：电脑（鼠标）上停在图标上，下方冒一个小标签写它是什么；触屏不冒（没有悬停，也占地方）。
 */
export function iconButton(scene: Phaser.Scene, x: number, y: number, icon: string, onClick: () => void, size = 48, label?: string): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.image(0, 0, '__DEFAULT');
  const r = size / 2;
  // 外框：投影往下偏 6，描边各出一半
  const box = { x: -r - 2, y: -r - 4, w: 2 * r + 4, h: 2 * r + 12 };
  const paint = (lit: boolean): void =>
    bakeInto(g, `iconBtn:${size}:${lit ? 1 : 0}`, box, (gr) => {
      // 卡通圆钮：柔和投影、深墨下沿、木色上亮下暗、内圈金线、深墨描边
      gr.fillStyle(0x000000, 0.18).fillCircle(0, 6, r);
      gr.fillStyle(OUTLINE.color, 1).fillCircle(0, 3, r - 1);
      const base = lit ? 0x82502a : 0x6b3f20;
      gr.fillStyle(base, 1).fillCircle(0, -1, r - 2);
      gr.fillStyle(shade(base, 1.18), 1).fillEllipse(0, -1 - r * 0.32, (r - 4) * 1.6, (r - 4) * 0.9);
      gr.lineStyle(2, lit ? COLOR.goldLight : COLOR.gold, lit ? 1 : 0.85).strokeCircle(0, -1, r - 6);
      gr.lineStyle(OUTLINE.width, OUTLINE.color, 1).strokeCircle(0, -1, r - 2);
    });
  paint(false);
  c.add(g);
  const img = scene.add.image(0, -1, `icon:${icon}`).setDisplaySize(size * 0.56, size * 0.56).setTint(0xffe9c2);
  c.add(img);
  const hit = Math.max(size + 8, minHit());
  setHit(c, hit, hit);
  let down = false;
  const press = (): void => {
    audio.sfx('click');
    onClick();
  };
  let tip: Phaser.GameObjects.Container | null = null;
  const hideTip = (): void => {
    tip?.destroy();
    tip = null;
  };
  const showTip = (): void => {
    if (!label || tip) return;
    const t = text(scene, 0, 0, label, { size: TYPE.small, bold: true, color: 0xfff3d6 });
    const w = t.width + 20;
    const h = t.height + 10;
    // 图标靠着屏幕左右沿时标签往里挪，不出画面
    const wx = c.getWorldTransformMatrix().tx;
    const dx = Phaser.Math.Clamp(wx, w / 2 + 4, worldW(scene) - w / 2 - 4) - wx;
    const bg = scene.add.graphics();
    bg.fillStyle(0x2b1d14, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bg.lineStyle(2, COLOR.gold, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    tip = scene.add.container(dx, r + 6 + h / 2, [bg, t]);
    c.add(tip);
  };
  c.on('pointerover', (p: Phaser.Input.Pointer) => {
    paint(true);
    c.setScale(1.06);
    if (!p.wasTouch) showTip();
  });
  c.on('pointerout', () => {
    down = false;
    paint(false);
    c.setScale(1);
    hideTip();
  });
  c.on('pointerdown', () => {
    down = true;
    c.setScale(0.94);
    hideTip();
  });
  c.on('pointerup', () => {
    c.setScale(1);
    if (!down) return;
    down = false;
    press();
  });
  focusable(c, size, size, press);
  c.setData('icon', img);
  return c;
}

/** 按颜色逐段插值 */
function lerpStops(stops: readonly number[], t: number): number {
  const k = Math.min(stops.length - 1, Math.max(0, t * (stops.length - 1)));
  const i = Math.min(stops.length - 2, Math.floor(k));
  const a = stops[i]!, b = stops[i + 1]!, u = k - i;
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - u) + ((b >> s) & 255) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * 竖向渐变的圆角矩形（Graphics 画一次，不用贴图；Canvas 渲染不支持渐变填充，所以用 24 条细带叠出来，相邻带的色差不到 1/255 的两三级，看不出台阶）。
 * 上下两端的带按圆角画，中间的是直条。
 */
export function vGradient(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number, stops: readonly number[]): void {
  const cap = Math.min(r, h / 2);
  // 两端的圆角块（颜色取渐变的两头），中间一段分 24 条直带
  g.fillStyle(lerpStops(stops, 0), 1).fillRoundedRect(x, y, w, cap * 2, { tl: r, tr: r, bl: 0, br: 0 });
  g.fillStyle(lerpStops(stops, 1), 1).fillRoundedRect(x, y + h - cap * 2, w, cap * 2, { tl: 0, tr: 0, bl: r, br: r });
  const n = 24;
  const mid = h - cap * 2;
  const step = mid / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle(lerpStops(stops, (cap * 2 + (i + 0.5) * step) / h), 1).fillRect(x, y + cap * 2 + i * step, w, step + 1);
  }
  // 圆角块里再按渐变补一层，避免两端和中间交界出现色差
  g.fillStyle(lerpStops(stops, cap / h), 1).fillRect(x, y + cap, w, cap);
  g.fillStyle(lerpStops(stops, 1 - cap / h), 1).fillRect(x, y + h - cap * 2, w, cap);
}

/**
 * 纸面面板：木框 + 金线 + 象牙纸底（卡通第二版恢复 0.27.0 前的木框，外面套统一的深墨描边、实色下沿和柔和投影），
 * 纸面上亮下暗一点、带几道极淡的横纹（程序画，纸感），可带红色标题飘带。原点在面板中心。
 */
export function panel(scene: Phaser.Scene, w: number, h: number, title?: string): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.22).fillRoundedRect(-w / 2 - 6, -h / 2 + 14, w + 12, h + 4, 22);
  g.fillStyle(OUTLINE.color, 1).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 16);
  g.fillStyle(0x6b3f20, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 16);
  g.fillStyle(0x8a5530, 1).fillRoundedRect(-w / 2, -h / 2, w, h * 0.5, { tl: 16, tr: 16, bl: 0, br: 0 });
  // 纸面：象牙白 → 奶油 → 米黄，连续的竖向渐变。以前三块纯色叠着，交界各有一道硬边，看着像横着一条半透明色带
  vGradient(g, -w / 2 + 12, -h / 2 + 12, w - 24, h - 24, 10, [0xfffaf0, COLOR.paper, 0xf3e3c0]);
  // 纸纹：每隔 9 像素一道极淡的横线
  g.lineStyle(1, 0x8a6a40, 0.05);
  for (let y = -h / 2 + 24; y < h / 2 - 16; y += 9) g.lineBetween(-w / 2 + 16, y, w / 2 - 16, y);
  g.lineStyle(2, COLOR.gold, 1).strokeRoundedRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 13);
  g.lineStyle(1.5, 0xe2c99a, 1).strokeRoundedRect(-w / 2 + 18, -h / 2 + 18, w - 36, h - 36, 8);
  g.lineStyle(OUTLINE.width, OUTLINE.color, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
  c.add(g);
  if (title) {
    const tw = Math.max(220, title.length * 34 + 90);
    const rg = scene.add.graphics();
    const ty = -h / 2 + 4;
    rg.fillStyle(COLOR.redDark, 1).fillTriangle(-tw / 2 - 26, ty - 10, -tw / 2 + 6, ty - 18, -tw / 2 + 6, ty + 22);
    rg.fillTriangle(tw / 2 + 26, ty - 10, tw / 2 - 6, ty - 18, tw / 2 - 6, ty + 22);
    rg.lineStyle(OUTLINE.width, OUTLINE.color, 1).strokeTriangle(-tw / 2 - 26, ty - 10, -tw / 2 + 6, ty - 18, -tw / 2 + 6, ty + 22);
    rg.strokeTriangle(tw / 2 + 26, ty - 10, tw / 2 - 6, ty - 18, tw / 2 - 6, ty + 22);
    rg.fillStyle(OUTLINE.color, 1).fillRoundedRect(-tw / 2, ty - 22 + OUTLINE.ledge, tw, 48, 12);
    rg.fillStyle(COLOR.red, 1).fillRoundedRect(-tw / 2, ty - 22, tw, 48, 12);
    rg.fillStyle(BUTTON.red.fill, 1).fillRoundedRect(-tw / 2, ty - 22, tw, 26, { tl: 12, tr: 12, bl: 0, br: 0 });
    rg.lineStyle(1, 0xffffff, 0.4).lineBetween(-tw / 2 + 12, ty - 19.5, tw / 2 - 12, ty - 19.5);
    rg.lineStyle(2, COLOR.gold, 0.9).strokeRoundedRect(-tw / 2 + 5, ty - 17, tw - 10, 38, 8);
    rg.lineStyle(OUTLINE.width, OUTLINE.color, 1).strokeRoundedRect(-tw / 2, ty - 22, tw, 48, 12);
    c.add(rg);
    c.add(text(scene, 0, ty + 1, title, { size: TYPE.title, color: COLOR.goldLight, bold: true, font: 'title', stroke: COLOR.redDark, strokeWidth: 3 }));
  }
  return c;
}

export interface Modal {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  close: () => void;
}

/** 开着的"可点外面关"的弹窗（设置、规则、战绩、成就、选难度、选档位）：同一时间只留一个，新的打开时旧的先关 */
const dismissables = new Map<Phaser.Scene, Modal[]>();

/**
 * 弹窗：半透明遮罩挡住下面的点击 + 居中面板；返回 close。
 * dismissOnOutside：点弹窗外（遮罩）关闭，和点 ✕、Esc 走同一个 close；只给没有未保存内容的面板（设置、规则、战绩、成就、选难度、选档位）用。
 * 确认框、结算这类要玩家做决定的不传，点外面不关（防误关）；它们可以叠在面板上，不受"只留一个"限制。
 * escCloses：没有 ✕ 的弹窗也让 Esc 关（确认框：Esc = 算了）。
 */
export function modal(scene: Phaser.Scene, w: number, h: number, title?: string, opts: { closeBtn?: boolean; onClose?: () => void; depth?: number; dismissOnOutside?: boolean; escCloses?: boolean } = {}): Modal {
  const W = worldW(scene);
  const H = worldH(scene);
  const root = scene.add.container(0, 0).setDepth(opts.depth ?? 5000);
  const dim = scene.add.graphics();
  dim.fillStyle(COLOR.overlay, 0.62).fillRect(0, 0, W, H);
  // 遮罩挡住下面的点击
  const block = scene.add.zone(0, 0, W, H).setOrigin(0, 0).setInteractive();
  root.add([dim, block]);
  const body = panel(scene, w, h, title);
  body.setPosition(W / 2, H / 2 + (title ? 10 : 0));
  root.add(body);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    if (opts.dismissOnOutside) dismissables.set(scene, (dismissables.get(scene) ?? []).filter((m) => m.root !== root));
    // 淡出期间整屏遮罩和里面的按钮立刻不接点击：机器一卡，120 毫秒的淡出会拖很久，这时点别的按钮会被看不见的遮罩吞掉
    //（手机冒烟"点大厅出确认框"偶发超时的根因）
    const off = (o: Phaser.GameObjects.GameObject): void => {
      if (o.input) o.disableInteractive();
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(off);
    };
    off(root);
    scene.tweens.add({ targets: root, alpha: 0, duration: 120, onComplete: () => root.destroy() });
    opts.onClose?.();
  };
  if (opts.closeBtn !== false) {
    // 宽的弹窗（设置、规则贴着屏幕两边）右上角的关闭键往里放，点按区不伸出右沿
    const hit = Math.max(46 + 8, minHit());
    const cb = iconButton(scene, Math.min(w / 2 - 6, W / 2 - hit / 2), -h / 2 + 6, 'close', close, 46);
    // 高的弹窗（手机横屏上按 minHit() 排行距的选档位）右上角的关闭键离屏幕上沿近：点按区往下挪，不伸出屏幕
    const over = hit / 2 - (body.y - h / 2 + 6);
    if (over > 0) setHit(cb, hit, hit, over);
    body.add(cb);
  }
  // 键盘只在弹窗里走；能关的弹窗 Esc 关掉（没有 ✕ 的确认框传 escCloses，Esc 当「算了」）
  pushLayer(root, opts.closeBtn !== false || opts.escCloses ? close : undefined);
  root.setAlpha(0);
  body.setScale(0.92);
  scene.tweens.add({ targets: root, alpha: 1, duration: 140 });
  scene.tweens.add({ targets: body, scale: 1, duration: 200, ease: 'Back.easeOut' });
  const m: Modal = { root, body, close };
  if (opts.dismissOnOutside) {
    // 同一时间只一个：先关掉还开着的同类弹窗
    for (const old of dismissables.get(scene) ?? []) old.close();
    dismissables.set(scene, [m]);
    // 按下和抬起都在面板外才关：面板空白处、标题飘带上的点击不算（面板上沿多留出飘带的高度），从面板里拖出来也不误关
    const outside = (p: Phaser.Input.Pointer): boolean => {
      const dx = Math.abs(p.worldX - body.x);
      return dx > w / 2 || p.worldY < body.y - h / 2 - 30 || p.worldY > body.y + h / 2;
    };
    let downOutside = false;
    block.on('pointerdown', (p: Phaser.Input.Pointer) => (downOutside = outside(p)));
    block.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (downOutside && outside(p)) close();
      downOutside = false;
    });
  }
  return m;
}

/** 开关/选项按钮组：一行若干个选项，当前项金底加粗描边。 */
export function segmented(
  scene: Phaser.Scene,
  x: number,
  y: number,
  items: { label: string; value: string }[],
  current: string,
  onPick: (v: string) => void,
  itemW = 104,
  // 没传就按 44 CSS 像素兜底（手机上 60 只合 30 来个 CSS 像素）
  hitH = Math.max(60, minHit()),
  hitDy = 0,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const btns: { g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; v: string; hover: boolean; down: boolean }[] = [];
  const h = 44;
  let cur = current;
  const paint = (): void => {
    for (const b of btns) {
      const on = b.v === cur;
      // 选中项金底深字：不和主按钮（红）同色，分得清「选了的」和「要点的」（docs/ui.md 第 4 节）
      const base = on ? BUTTON.gold.fill : 0xf6ead2;
      const fill = b.down ? shade(base, 0.9) : b.hover && !on ? 0xf4e8d0 : base;
      const dy = b.down ? 2 : 0;
      b.g.clear();
      b.g.fillStyle(fill, 1).fillRoundedRect(-itemW / 2 + 3, -h / 2 + dy, itemW - 6, h, RADIUS.md);
      b.g.lineStyle(on ? OUTLINE.width : 2, on || b.hover ? OUTLINE.color : 0x8a7560, 1).strokeRoundedRect(-itemW / 2 + 3, -h / 2 + dy, itemW - 6, h, RADIUS.md);
      b.t.setColor(css(on ? BUTTON.gold.text : COLOR.ink));
      b.t.y = dy;
    }
  };
  items.forEach((it, i) => {
    const bx = i * itemW;
    const g = scene.add.graphics().setPosition(bx, 0);
    const t = text(scene, bx, 0, it.label, { size: TYPE.label, bold: true });
    // 点按区域：宽到和邻居相接，高到行距（设置面板一行 60），比画出来的 44 高
    // hitDy：上下有别的按钮时把点按区挪到空着的一边（主页的切换往上伸进标题字）
    const hit = scene.add.zone(bx, 0, itemW, Math.max(h, hitH)).setInteractive({ useHandCursor: true });
    if (hitDy) setHit(hit, itemW, Math.max(h, hitH), hitDy);
    const b = { g, t, v: it.value, hover: false, down: false };
    const pick = (): void => {
      audio.sfx('click');
      cur = it.value;
      paint();
      onPick(it.value);
    };
    hit.on('pointerover', () => {
      b.hover = true;
      paint();
    });
    hit.on('pointerout', () => {
      b.hover = false;
      b.down = false;
      paint();
    });
    hit.on('pointerdown', () => {
      b.down = true;
      paint();
    });
    hit.on('pointerup', () => {
      const was = b.down;
      b.down = false;
      if (was) pick();
      else paint();
    });
    focusable(hit, itemW - 6, h, pick);
    btns.push(b);
    c.add([g, t, hit]);
  });
  paint();
  return c;
}
