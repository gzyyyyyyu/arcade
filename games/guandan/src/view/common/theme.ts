/**
 * 配色、字体、世界尺寸与渲染倍数。
 *
 * 世界坐标高度固定 720，宽度随屏幕宽高比在 1280..1720 之间变（手机横屏更宽，不留黑边，手牌能排得更开）。
 * 宽高比按实际可见区域算（device.ts 的 appBox，不用 screen 和 100vh）。
 * 画布按 RENDER_SCALE 倍的物理像素绘制，相机同倍数 zoom，文字和贴图按实际像素栅格化，FIT 缩放时只缩小不放大，字就不糊。
 */
import { hex } from '../art/common.ts';
import { appBox, pickRenderScale } from './device.ts';

export const COLOR = {
  felt: 0x1f5a43,
  feltDark: 0x123a2b,
  wood: 0x6b3b1f,
  woodDark: 0x3e2110,
  red: 0xb3202a,
  redDark: 0x7d121a,
  gold: 0xe0b45a,
  goldLight: 0xffe3a0,
  goldDark: 0x9a7330,
  ivory: 0xfff7e6,
  paper: 0xfbf1dc,
  ink: 0x2b1d14,
  muted: 0x7a6555,
  dim: 0xb8a690,
  green: 0x2f9e5b,
  blue: 0x3a78c8,
  teamUs: 0xd9443a,
  teamThem: 0x3a78c8,
  overlay: 0x0b0806,
  grey: 0x8c8378,
  white: 0xffffff,
} as const;

/** 输赢数字的颜色（docs/ui.md 第 9 节）：正绿负红、0 用 zero（默认墨色） */
export function signColor(n: number, zero: number = COLOR.ink): number {
  return n > 0 ? COLOR.green : n < 0 ? COLOR.red : zero;
}

/** 深色底（顶栏实盘条、主页面板）上的输赢数字：亮一档的红绿，对比度 ≥ 4.5；0 用这一行原来的字色 */
export function signColorOnDark(n: number, zero: number): number {
  return n > 0 ? 0x7be39a : n < 0 ? 0xff8a80 : zero;
}

export const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Droid Sans Fallback", sans-serif';
/** 标题和大字：优先游戏自带的宋体子集（fonts.ts，缺字时逐字回退），再系统宋体，没有就退回黑体 */
export const FONT_TITLE = '"GD Title", "Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Sans CJK SC", "Microsoft YaHei", serif';
export const FONT_NUM = '"Arial Black", "Helvetica Neue", Arial, "DejaVu Sans", "Noto Sans CJK SC", sans-serif';

/** 0xRRGGBB → CSS 颜色串（和美术那边同一个函数） */
export const css = hex;

export const GAME_HEIGHT = 720;
export const MIN_WIDTH = 1280;
const MAX_WIDTH = 1720;

/** 按窗口宽高比算世界宽度：16:9 及更窄时 1280（上下留边），更宽时加宽到最多 1720。 */
export function worldWidthFor(w: number, h: number): number {
  if (!(w > 0 && h > 0)) return MIN_WIDTH;
  const want = Math.round((GAME_HEIGHT * w) / h / 4) * 4;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, want));
}

/**
 * 手机、平板竖着拿（和"请横过来"同一条线：竖屏且宽不过 1024）：主页和弹窗按竖屏排，牌桌仍只认横屏（orientation.ts 只盖牌桌）
 */
export function isPortrait(w: number, h: number): boolean {
  return w > 0 && h > w && w <= 1024;
}

/** 竖屏世界：宽 720（和横屏手机缩到同一个比例，字号、点按区的托底照旧），高按屏幕比例，夹在 1080..1600 */
const PORTRAIT_WIDTH = 720;
const PORTRAIT_MIN_H = 1080;
const PORTRAIT_MAX_H = 1600;

/** 可见区 w×h 下主页用的世界尺寸：竖屏 720 × 按比例的高；横屏照旧（高 720，宽按 worldWidthFor） */
export function worldSizeFor(w: number, h: number): { w: number; h: number } {
  if (!isPortrait(w, h)) return { w: worldWidthFor(w, h), h: GAME_HEIGHT };
  const want = Math.round((PORTRAIT_WIDTH * h) / w / 4) * 4;
  return { w: PORTRAIT_WIDTH, h: Math.max(PORTRAIT_MIN_H, Math.min(PORTRAIT_MAX_H, want)) };
}

/** 画布按 FIT 缩放后，一个世界坐标合多少 CSS 像素（竖屏按竖屏世界算；竖屏时牌桌被"请横过来"盖着，不用管它的比例） */
function cssPerWorld(w: number, h: number): number {
  const s = worldSizeFor(w, h);
  return Math.min(w / s.w, h / s.h);
}

/** 渲染倍数（1..3）：按实际可见区域 × DPR，iOS 封顶 2，省内存模式 1；算法见 device.ts。 */
export const RENDER_SCALE = pickRenderScale();

/**
 * 字号只用几级（世界坐标）。电脑、平板上最小的 18 也有 16 CSS 像素以上；手机横屏整张画布缩到 ×0.52–0.54，18 只剩 9–10 像素，
 * 由 typeFloor 的手机档托底（0.21.0 手机专项）。
 */
export const TYPE = { huge: 68, big: 40, title: 28, body: 23, label: 20, small: 18 } as const;

/** 手机档的下限（CSS 像素）：字 12、数字 14（再小手机上看不清） */
const TYPE_FLOOR_PX = { text: 12, num: 14 } as const;

/**
 * 字号下限（世界坐标）：按当前缩放，正文 12、数字 14 CSS 像素合多少。电脑 1:1、iPad 横屏 ×0.92 时比 TYPE 最小的 18 还小，等于不起作用；
 * SE 横屏（667×375，×0.52）正文 24、数字 27。ui/kit.ts 的 text() 一律按它托底；放不下的地方删字，不缩字。窗口变了画面重建时重新算
 */
export function typeFloor(num: boolean): number {
  if (typeof window === 'undefined') return 0;
  const b = appBox();
  return floorFor(b.w, b.h, num);
}

/**
 * 手机档：字号下限已经比 TYPE.small 大（画布缩到 2/3 以下，手机横屏），排不下的地方按它删字（"本副打"、A×N 角标、说明行）。
 * iPad 横屏（×0.92）、电脑都不是
 */
export function phoneType(): boolean {
  return typeFloor(false) > TYPE.small;
}

/** 可见区域 w×h CSS 像素时的字号下限（纯函数，测试用） */
export function floorFor(w: number, h: number, num: boolean): number {
  const k = cssPerWorld(w, h);
  return Math.ceil((num ? TYPE_FLOOR_PX.num : TYPE_FLOOR_PX.text) / k);
}

/** 间距刻度（世界坐标，4 的倍数）：留白、间隔只用这几级，不再到处写死数字 */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** 圆角刻度：小件（标签、小按钮）、按钮、面板内框、面板外框；胶囊形写高度的一半 */
export const RADIUS = { sm: 8, md: 12, lg: 14, xl: 22 } as const;
/**
 * 卡通描边（仓库统一的卡通风格，配色表在 docs/art.md 第 9 节）：按钮、面板、名牌一律深墨色描边、实色下沿，下沿按下时下沉。
 * 0.27.1（卡通第二版）：表面补回上亮下暗的轻渐变和顶边高光，下面再垫一层柔和的环境投影，不再是平涂贴纸
 */
export const OUTLINE = { color: 0x2b1d14, width: 3, ledge: 4 } as const;

/**
 * 点按区域的下限：44 CSS 像素合多少世界坐标。电脑上 1280×720 是 1:1，就是 44；手机横屏 844×390 缩到 ×0.54，要 82。
 * 画出来的按钮可以比它小，点按区域往外扩（kit.ts 的 setHit）；挨得近的（顶栏图标、竖排按钮）调用方按间距收窄，不互相压着。
 * 窗口变了画面会重建（转屏、电脑上宽度变化大），重建时重新算。
 */
export function minHit(): number {
  if (typeof window === 'undefined') return 44;
  const b = appBox();
  return hitFor(b.w, b.h);
}

/** 可见区域 w×h CSS 像素时，44 CSS 像素合多少世界坐标（画布按 FIT 缩放，取宽、高两个方向小的那个比例） */
export function hitFor(w: number, h: number): number {
  const k = cssPerWorld(w, h);
  return Math.max(44, Math.min(100, Math.ceil(44 / k)));
}

/**
 * 操作区按钮画出来的最小高度：36 CSS 像素合多少世界坐标（minHit 是 44 CSS 像素）。电脑上 36，小于按钮本来的高度，不起作用；
 * 手机横屏（844×390）约 67：弱按钮（不要、重选、上一墩、理牌）不能画得比点按区小一大截，画出来的和点得到的要对得上。
 */
export function minDrawH(): number {
  return drawHFor(minHit());
}

/** 点按区 hit（世界坐标，对应 44 CSS 像素）时，36 CSS 像素的画出高度 */
export function drawHFor(hit: number): number {
  return Math.ceil((hit * 36) / 44);
}

/** 按钮的几种配色：主按钮红、要紧的金、确认绿、次要木色、联机蓝。按下、悬停、禁用由 kit.ts 按同一套规则算 */
// 颜色主次（卡通第二版）：主按钮红、要紧的金保持亮，确认绿、联机蓝、次要木色收沉一点，免得整屏都是高饱和
export const BUTTON = {
  red: { fill: 0xd8352f, text: 0xfff6e8, rim: 0xff9a84 },
  gold: { fill: 0xf2b840, text: 0x2b1d14, rim: 0xfff0b8 },
  green: { fill: 0x2f9a55, text: 0xf4fff6, rim: 0xa8e6b8 },
  wood: { fill: 0x8a5530, text: 0xffeccb, rim: 0xd9a46a },
  blue: { fill: 0x3474c4, text: 0xf0f7ff, rim: 0xa8cdf5 },
  /** 弱按钮（不要、重选、理牌）：饱和度低的暖灰褐，退到背景里 */
  quiet: { fill: 0x5f4a3b, text: 0xf0e2cc, rim: 0xb59f86 },
  /** 危险（确认框里会丢东西的那个：离开好友房、开新局丢进度、退出实盘）：深酒红，和主按钮的亮红分得开（docs/ui.md 第 2、5 节） */
  danger: { fill: 0x8e1b22, text: 0xffe3da, rim: 0xe0726a },
  off: { fill: 0x9a948d, text: 0xece8e2, rim: 0xb8b2aa },
} as const;

/**
 * 光影（质感改版）：光源在牌桌正上方、略偏左，所有面都是上亮下暗、影子往下偏。
 * 牌桌背景、牌面、按钮、主页面板都按这一组取，不各写各的高光和阴影。
 */
export const LIGHT = {
  /** 高光色（暖白）：边缘细线、按钮顶边、牌面边缘 */
  highlight: 0xfff4d6,
  /** 阴影色（偏暖的黑）：投影、内阴影 */
  shadow: 0x0b0604,
  /** 桌面光池的暖色 */
  pool: '#ffe2a0',
} as const;

/** 牌的纸边（右沿、下沿的深米色细带）：base 下沿最暗，side 上端稍亮，line 交界细线；牌面 SVG（art/cards.ts）用 */
export const EDGE = { side: '#cdbb8e', base: '#a8946a', line: '#6b5530' } as const;

/**
 * 按钮的三档：主按钮（红，出牌、快速开始）最重，有高光渐变、深下沿和投影；
 * 次按钮（金、绿、蓝、木，提示这类）是原来的立体按钮；弱按钮（不要、重选、理牌，色 quiet）更扁、投影浅。
 * 调用处只传颜色名（red 即主、quiet 即弱，其余次），档位由 BUTTON_TIER 推出，不在各处各写。
 * 字段：ledge 实色下沿厚度；top/bottom 面的亮暗倍数；hi 顶边高光透明度；drop 投影浓度；rise 投影下移。
 */
export const TIER = {
  primary: { ledge: 6, top: 1.16, bottom: 0.84, hi: 0.62, drop: 0.3, rise: 8 },
  secondary: { ledge: OUTLINE.ledge, top: 1.08, bottom: 0.92, hi: 0.4, drop: 0.16, rise: 4 },
  quiet: { ledge: 3, top: 1.03, bottom: 0.96, hi: 0.16, drop: 0.06, rise: 2 },
  /** 不可点：压平，没有高光和投影 */
  off: { ledge: 2, top: 1, bottom: 0.96, hi: 0, drop: 0, rise: 0 },
} as const;
export type ButtonTier = keyof typeof TIER;
export const BUTTON_TIER: Record<keyof typeof BUTTON, ButtonTier> = { red: 'primary', gold: 'secondary', green: 'secondary', wood: 'secondary', blue: 'secondary', quiet: 'quiet', danger: 'secondary', off: 'off' };
/** 键盘焦点框的颜色：金色在红、木、绿底上都看得见 */
export const FOCUS_RING = 0xffd54a;

/**
 * DOM 部分（好友房面板、转屏提示、出错面板、添加到主屏幕）用的同一套刻度和配色，写成 CSS 变量。
 * 变量带 `--gd-` 前缀：和平台同域，但变量只在掼蛋自己的页面里，前缀只为一眼看出是谁的。
 */
export const THEME_CSS = `
:root {
  --gd-s1: 4px; --gd-s2: 8px; --gd-s3: 12px; --gd-s4: 16px; --gd-s6: 24px; --gd-s8: 32px;
  --gd-r-sm: 8px; --gd-r-md: 12px; --gd-r-lg: 18px; --gd-r-pill: 999px;
  --gd-font: ${FONT};
  --gd-font-num: ${FONT_NUM};
  --gd-red: ${css(COLOR.red)}; --gd-red-dark: ${css(COLOR.redDark)}; --gd-gold: ${css(COLOR.gold)}; --gd-gold-light: ${css(COLOR.goldLight)};
  --gd-wood: ${css(COLOR.wood)}; --gd-paper: ${css(COLOR.paper)}; --gd-ink: ${css(COLOR.ink)}; --gd-muted: ${css(COLOR.muted)};
  --gd-green: ${css(BUTTON.green.fill)}; --gd-felt: ${css(COLOR.felt)}; --gd-felt-dark: ${css(COLOR.feltDark)}; --gd-focus: ${css(FOCUS_RING)};
  --gd-shadow: 0 4px 0 #2b1d14, 0 8px 16px rgba(0, 0, 0, 0.24); --gd-line: 3px solid #2b1d14;
  --gd-gloss: linear-gradient(rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 45%, rgba(0, 0, 0, 0.12));
  --gd-hit: 44px;
  /* kit 的 DOM 组件（邀请横条、叫朋友来、分享预览、互动菜单）跟着掼蛋的红金木色（kit 0.16 的主题变量，靠继承生效） */
  --ak-bg: rgba(43, 29, 20, 0.97); --ak-fg: #fff6e0; --ak-accent: var(--gd-red); --ak-accent-fg: #fff6e0;
  --ak-border: var(--gd-gold); --ak-title: var(--gd-gold-light); --ak-soft: #4a3220; --ak-font: var(--gd-font);
}
/* 统一的按钮：常态、悬停、按下（下沉）、禁用、键盘焦点、加载中 */
.gd-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--gd-s2); min-height: var(--gd-hit); padding: 0 var(--gd-s4);
  border: var(--gd-line); border-radius: var(--gd-r-md); background: var(--gd-gloss), ${css(BUTTON.red.fill)}; color: #fff;
  font: bold 16px/1 var(--gd-font); box-shadow: var(--gd-shadow); cursor: pointer; position: relative;
  transition: transform 80ms ease-out, filter 120ms, box-shadow 80ms; -webkit-tap-highlight-color: transparent; }
.gd-btn:hover:not(:disabled) { filter: brightness(1.08); }
.gd-btn::before { content: ""; position: absolute; left: 6px; right: 6px; top: 2px; height: 1px; background: rgba(255, 255, 255, 0.45); border-radius: 1px; pointer-events: none; }
.gd-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 #2b1d14, 0 3px 6px rgba(0, 0, 0, 0.2); }
.gd-btn:disabled { background: ${css(BUTTON.off.fill)}; color: ${css(BUTTON.off.text)}; cursor: default; box-shadow: none; }
.gd-btn:focus-visible { outline: 3px solid var(--gd-focus); outline-offset: 2px; }
.gd-btn.is-loading { color: transparent; pointer-events: none; }
.gd-btn.is-loading::after { content: ""; position: absolute; width: 18px; height: 18px; border-radius: 50%;
  border: 3px solid rgba(255, 243, 214, 0.35); border-top-color: #fff3d6; animation: gd-spin 0.8s linear infinite; }
/* 次按钮木色；gd-on 是选中项（金底深字），不和主按钮同色 */
.gd-btn.gd-2 { background: var(--gd-gloss), ${css(BUTTON.wood.fill)}; }
.gd-btn.gd-on { background: var(--gd-gloss), ${css(BUTTON.gold.fill)}; color: ${css(BUTTON.gold.text)}; }
/* 危险按钮（删存档、离开好友房）：深酒红加浅字，和主按钮的亮红分得开（docs/ui.md 第 2 节） */
.gd-btn.gd-danger { background: var(--gd-gloss), var(--gd-red-dark); color: #ffd9cf; }
/* 弹窗右上角的 ✕：没有底，点区 44 见方（docs/ui.md 第 5 节） */
/* 关闭键：和画布弹窗右上角的圆钮同一个样子（kit.ts iconButton：木色圆、金线内圈、深墨描边） */
.gd-btn.gd-x { width: var(--gd-hit); height: var(--gd-hit); padding: 0; border: 3px solid ${css(OUTLINE.color)}; border-radius: 50%;
  background: #6b3f20; box-shadow: inset 0 0 0 2px #6b3f20, inset 0 0 0 4px var(--gd-gold), 0 3px 0 ${css(OUTLINE.color)}; color: #ffe9c2; font-size: 20px; }
.gd-btn.gd-x::before { display: none; }
.gd-btn.gd-x:hover { background: #82502a; box-shadow: inset 0 0 0 2px #82502a, inset 0 0 0 4px var(--gd-gold-light), 0 3px 0 ${css(OUTLINE.color)}; filter: none; }
.gd-btn.gd-big { min-height: 56px; font-size: 22px; background: var(--gd-gloss), ${css(BUTTON.green.fill)}; }
@keyframes gd-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gd-btn { transition: none; } .gd-btn.is-loading::after { animation-duration: 2.4s; } }
`;

/** 把 THEME_CSS 挂进页面（只挂一次）；各个 DOM 部件挂自己的样式前先调它 */
export function mountThemeCss(): void {
  if (typeof document === 'undefined' || document.getElementById('gd-theme')) return;
  const st = document.createElement('style');
  st.id = 'gd-theme';
  st.textContent = THEME_CSS;
  document.head.appendChild(st);
}
