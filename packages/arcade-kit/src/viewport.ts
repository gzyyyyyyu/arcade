/**
 * 手机平板的可见区、双指放大、转屏、渲染倍数、省内存、WebGL 丢失恢复。浏览器用，纯 DOM，不依赖 Phaser。
 *
 * 规矩是仓库根 docs/ui.md 第 10 节"手机"，默认值是一套通用做法，别的做法（钉 #app、扣安全区、
 * 省内存三档、20 秒降档）做成选项，游戏按需传。
 *
 * 判断和公式拆成纯函数（isZoomed、measureBox、insetBox、sameBox、renderScaleFor、bootLevel、createLossWatch……），
 * 单测不碰 DOM；带 DOM 的几个只在调用时才读 window，模块加载时什么都不做。
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** visualViewport 里用得到的几项（测试里可以直接给对象） */
export interface VisualLike {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  scale: number;
}

// ───────────── 设备 ─────────────

/** iOS（iPadOS 13 起 UA 冒充 Mac，靠触屏点数区分） */
export function isIosUa(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** iOS 上的 Safari 本体（别的浏览器、微信等内置浏览器没有"添加到主屏幕"） */
export function isIosSafariUa(ua: string, maxTouchPoints: number): boolean {
  return isIosUa(ua, maxTouchPoints) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient/.test(ua);
}

export function isIOS(): boolean {
  return typeof navigator !== 'undefined' && isIosUa(navigator.userAgent, navigator.maxTouchPoints);
}

export function isIOSSafari(): boolean {
  return typeof navigator !== 'undefined' && isIosSafariUa(navigator.userAgent, navigator.maxTouchPoints);
}

/** 从主屏幕打开的（全屏、没有地址栏） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

/**
 * 省内存的设备（最早接入的游戏的口径）：iOS，或者主要靠触屏的（手机平板）。老 iPhone 只有 2GB，超了 WebKit 直接杀页面，
 * 所以这些设备渲染倍数封顶 2、大背景按 1 倍光栅化
 */
export function isLowMemoryDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return isIOS() || !!window.matchMedia?.('(pointer: coarse)').matches;
}

// ───────────── 可见区 ─────────────

/** 双指放大着：visualViewport.scale 明显不是 1（默认口径，放大缩小都算）。默认阈值 0.02 */
export function isZoomed(scale: number | undefined, epsilon = 0.02): boolean {
  return scale !== undefined && Math.abs(scale - 1) > epsilon;
}

/**
 * 看得见的区域（CSS 像素，相对布局视口左上角）：有 visualViewport 就取它和 inner 小的那个、带偏移（Safari 工具栏盖住顶上一截时 offsetTop > 0），
 * 没有就是整个窗口。放大中返回 null：这时的 visualViewport 只是放大镜的取景框，调用方沿用上次的区域
 */
export function measureBox(inner: { w: number; h: number }, vv: VisualLike | null | undefined, zoomed: (scale: number) => boolean = (s) => isZoomed(s)): Box | null {
  if (vv && zoomed(vv.scale)) return null;
  let x = 0;
  let y = 0;
  let w = inner.w;
  let h = inner.h;
  if (vv && vv.width > 0 && vv.height > 0) {
    w = Math.min(w || Infinity, vv.width);
    h = Math.min(h || Infinity, vv.height);
    x = Math.max(0, vv.offsetLeft);
    y = Math.max(0, vv.offsetTop);
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/** 扣掉安全区（刘海、圆角、Home 条） */
export function insetBox(b: Box, s: Insets): Box {
  return { x: b.x + s.left, y: b.y + s.top, w: Math.max(1, b.w - s.left - s.right), h: Math.max(1, b.h - s.top - s.bottom) };
}

export const sameBox = (a: Box | null, b: Box | null): boolean => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** 现在看得见的区域；放大中为 null */
export function visibleBox(o: { zoomEpsilon?: number } = {}): Box | null {
  if (typeof window === 'undefined') return null;
  return measureBox({ w: window.innerWidth, h: window.innerHeight }, window.visualViewport, (s) => isZoomed(s, o.zoomEpsilon));
}

let probe: HTMLElement | null = null;
/** 安全区：探针 div 读 env(safe-area-inset-*, 0px)，不支持的浏览器全是 0 */
export function safeInsets(): Insets {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!probe || !probe.isConnected) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v: string): number => Math.max(0, parseFloat(v) || 0);
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}

export interface WatchViewportOptions {
  /** 可见区真的变了才调（判重按 x、y、w、h）；pin 模式给的是扣过安全区、钉上去的区域 */
  onChange(box: Box): void;
  /** 双指放大的阈值：|scale − 1| 超过它就不跟（默认 0.02）；只认放大之类的判法传 isZoomed 自定义 */
  zoomEpsilon?: number;
  isZoomed?: (scale: number) => boolean;
  /** 每次事件之后再补算一次的延时（iOS 转屏后要过一会儿才给最终尺寸）。默认 300ms */
  settleMs?: number;
  /** 补算那一下之后再调（有的游戏在这里决定要不要换世界宽度、重建画面）；不管尺寸变没变都调 */
  onSettle?(): void;
  /** 给了就把这个元素钉成可见区扣掉安全区的像素位置（选项做法）；不给就写 --app-h（默认做法） */
  pin?: HTMLElement;
  /** 写 document 根上的 --app-h（可见区高度，不扣安全区，CSS 自己 calc 扣）。默认：没给 pin 时写 */
  writeAppH?: boolean;
  /** 页面被系统推上去一截时滚回顶部（默认是） */
  scrollTop?: boolean;
  /** 也听 visualViewport 的 scroll：工具栏收放时只有偏移变（默认是） */
  listenScroll?: boolean;
}

/**
 * 跟着可见区走：转屏、地址栏收放、窗口大小、visualViewport 变化时量一次，稍后（settleMs）再补一次。
 * 放大中不动（不写尺寸、不滚、不回调）。开始时先量一次。返回取消监听的函数（连同没到点的补算一起取消）
 */
export function watchViewport(o: WatchViewportOptions): () => void {
  const zoomed = o.isZoomed ?? ((s: number) => isZoomed(s, o.zoomEpsilon));
  const writeAppH = o.writeAppH ?? !o.pin;
  const root = document.documentElement;
  let last: Box | null = null;
  const apply = (): void => {
    const v = measureBox({ w: window.innerWidth, h: window.innerHeight }, window.visualViewport, zoomed);
    if (!v) return;
    if (o.scrollTop !== false && (window.scrollY !== 0 || window.scrollX !== 0)) window.scrollTo(0, 0);
    const b = o.pin ? insetBox(v, safeInsets()) : v;
    if (sameBox(last, b)) return;
    last = b;
    if (o.pin) {
      o.pin.style.left = `${b.x}px`;
      o.pin.style.top = `${b.y}px`;
      o.pin.style.width = `${b.w}px`;
      o.pin.style.height = `${b.h}px`;
    }
    if (writeAppH) root.style.setProperty('--app-h', `${v.h}px`);
    o.onChange(b);
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = (): void => {
    apply();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      apply();
      o.onSettle?.();
    }, o.settleMs ?? 300);
  };
  const vv = window.visualViewport;
  const scroll = o.listenScroll !== false;
  apply();
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  vv?.addEventListener('resize', later);
  if (scroll) vv?.addEventListener('scroll', later);
  return () => {
    window.removeEventListener('resize', later);
    window.removeEventListener('orientationchange', later);
    vv?.removeEventListener('resize', later);
    if (scroll) vv?.removeEventListener('scroll', later);
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/**
 * 舞台等比缩放的游戏用：kit 只管量 app 的矩形、判重、转屏补算、放大中不动，
 * 怎么缩放、写哪些 CSS 变量和类名留在游戏的 onChange 里。返回取消监听的函数
 */
export function watchStage(app: HTMLElement, onChange: (r: DOMRect) => void, o: Pick<WatchViewportOptions, 'zoomEpsilon' | 'isZoomed' | 'settleMs' | 'listenScroll'> = {}): () => void {
  const zoomed = o.isZoomed ?? ((s: number) => isZoomed(s, o.zoomEpsilon));
  let lastW = -1;
  let lastH = -1;
  const apply = (): void => {
    const s = window.visualViewport?.scale;
    if (s !== undefined && zoomed(s)) return;
    const r = app.getBoundingClientRect();
    if (r.width === lastW && r.height === lastH) return;
    lastW = r.width;
    lastH = r.height;
    onChange(r);
  };
  return watchViewport({ onChange: apply, onSettle: apply, isZoomed: zoomed, settleMs: o.settleMs, listenScroll: o.listenScroll, writeAppH: false, scrollTop: false });
}

// ───────────── 渲染倍数 ─────────────

export interface RenderScaleInput {
  /** 用来算的区域（CSS 像素）和像素比 */
  w: number;
  h: number;
  dpr: number;
  /** 世界的设计尺寸：长边对设计宽、短边对设计高 */
  designW: number;
  designH: number;
  /** 最多几倍（默认 3）；省内存设备再封顶到 lowMemoryCap */
  cap?: number;
  lowMemory?: boolean;
  /** 省内存设备的封顶（默认 2，仓库根 docs/ui.md 第 10 节：手机平板渲染倍数最多 2） */
  lowMemoryCap?: number;
  /** 取整前先减掉（比如 0.05：刚好超一点不升档）；默认 0 */
  bias?: number;
}

/**
 * 只按像素比的渲染倍数（不按设计尺寸算的游戏用）：max(1, min(上限, dpr))，可以是小数；省内存设备的上限再取 lowMemoryCap。
 * 比如 cap 2、lowMemoryCap 1.5，或 cap 3、lowMemoryCap 2，或 cap 2（不分设备）
 */
export function dprScale(i: { dpr: number; cap?: number; lowMemory?: boolean; lowMemoryCap?: number }): number {
  const cap = i.lowMemory ? Math.min(i.cap ?? 3, i.lowMemoryCap ?? 2) : (i.cap ?? 3);
  return Math.max(1, Math.min(cap, i.dpr || 1));
}

/** 渲染倍数：物理像素对设计尺寸的比，向上取整到 1..cap；省内存设备封顶 lowMemoryCap */
export function renderScaleFor(i: RenderScaleInput): number {
  const long = Math.max(i.w, i.h) * i.dpr;
  const short = Math.min(i.w, i.h) * i.dpr;
  const cap = Math.min(i.cap ?? 3, i.lowMemory ? (i.lowMemoryCap ?? 2) : Infinity);
  return Math.min(cap, Math.max(1, Math.ceil(Math.min(long / i.designW, short / i.designH) - (i.bias ?? 0))));
}

/** URL 参数 scale=N（1..3）强制渲染倍数：清晰度对比、排查用；没给或不合法是 null */
export function forcedScale(search: string): number | null {
  const n = Number(new URLSearchParams(search).get('scale'));
  return n >= 1 && n <= 3 ? Math.round(n) : null;
}

/**
 * 现在的渲染倍数（默认取法）：真正的手机平板（省内存设备、窗口长边接近屏幕长边）按窗口算——iOS 的 screen 是竖着的整屏、不扣地址栏；
 * 电脑和开了小窗的二合一按显示器算，窗口开小再拉大也不发虚。`basis: 'visible'` 一律按可见区算（选项做法）。URL 的 scale=N 优先
 */
export function renderScale(o: { designW: number; designH: number; cap?: number; lowMemory?: boolean; lowMemoryCap?: number; bias?: number; basis?: 'auto' | 'visible' }): number {
  if (typeof window === 'undefined') return 1;
  const forced = forcedScale(window.location.search);
  if (forced) return forced;
  const lowMemory = o.lowMemory ?? isLowMemoryDevice();
  const dpr = window.devicePixelRatio || 1;
  let w: number;
  let h: number;
  if (o.basis === 'visible') {
    const v = visibleBox() ?? { w: window.innerWidth, h: window.innerHeight };
    w = v.w;
    h = v.h;
  } else {
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    const sw = window.screen?.width || o.designW;
    const sh = window.screen?.height || o.designH;
    const phone = lowMemory && Math.max(iw, ih) >= 0.9 * Math.max(sw, sh);
    w = (phone ? iw : sw) || o.designW;
    h = (phone ? ih : sh) || o.designH;
  }
  return renderScaleFor({ w, h, dpr, designW: o.designW, designH: o.designH, cap: o.cap, lowMemory, lowMemoryCap: o.lowMemoryCap, bias: o.bias });
}

// ───────────── 省内存三档（可选） ─────────────

/**
 * 老 iPhone 内存不够时 WebKit 直接杀页面，JS 来不及做任何事。页面在前台时记一笔"开着"（pending），切后台或正常离开就清掉；
 * 下次打开还看到这笔，说明上次是开着的时候被杀的，这次降一档：0 正常，1 一倍渲染，2 再换 Canvas。换版本从 0 重来
 */
export interface BootMark {
  v: 1;
  pending: 0 | 1;
  low: 0 | 1 | 2;
  ver: string;
}
export type LowLevel = 0 | 1 | 2;

/** 读到的标记：坏的、别的版本的当没有（换版本从 0 重来，新版本可能已经修好了） */
export function cleanMark(raw: unknown, version: string): BootMark {
  const m = raw as Partial<BootMark> | null;
  if (m?.v !== 1 || m.ver !== version) return { v: 1, pending: 0, low: 0, ver: version };
  return { v: 1, pending: m.pending === 1 ? 1 : 0, low: m.low === 2 ? 2 : m.low === 1 ? 1 : 0, ver: version };
}

/** 启动：上次没清"开着"就升一档；返回这次的档位和要写回的标记（记上"开着"） */
export function bootLevel(raw: unknown, version: string): { level: LowLevel; mark: BootMark } {
  const m = cleanMark(raw, version);
  const level = (m.pending ? Math.min(2, m.low + 1) : m.low) as LowLevel;
  return { level, mark: { ...m, pending: 1, low: level } };
}

/** 画面被收回（WebGL 丢了不回来）：下次至少比这次高一档 */
export function lostMark(raw: unknown, version: string, level: LowLevel): BootMark {
  const m = cleanMark(raw, version);
  return { ...m, pending: 0, low: Math.min(2, Math.max(level, m.low) + 1) as LowLevel };
}

export interface LowMemoryTier {
  /** 这次启动用的档位（创建时定下来，之后不变） */
  readonly level: LowLevel;
  /** 页面到前台 true / 去后台、正常离开 false */
  markForeground(on: boolean): void;
  /** WebGL 丢了不回来：下次降一档 */
  markRenderLost(): void;
}

/**
 * 省内存三档：存储由游戏给（key 要带游戏前缀，比如 <游戏id>.boot），只在 track 为真时记（默认只在 iOS 上：桌面崩溃、断电不该把画质永久降下去）
 */
export function lowMemoryTier(o: { read(): unknown; write(mark: BootMark): void; version: string; track?: boolean }): LowMemoryTier {
  const track = o.track ?? isIOS();
  if (!track) return { level: 0, markForeground: () => {}, markRenderLost: () => {} };
  const { level, mark } = bootLevel(o.read(), o.version);
  o.write(mark);
  return {
    level,
    markForeground(on) {
      const m = cleanMark(o.read(), o.version);
      if (m.pending !== (on ? 1 : 0)) o.write({ ...m, pending: on ? 1 : 0 });
    },
    markRenderLost() {
      o.write(lostMark(o.read(), o.version, level));
    },
  };
}

/** 能不能拿到 WebGL：试一下马上还掉（老 iPhone 同时能开的 WebGL 上下文很少）。拿不到的游戏用 Canvas 渲染 */
export function webglUsable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// ───────────── WebGL 丢失恢复 ─────────────

export interface LossOptions {
  /** 丢了多久还没回来才提示（默认 3000ms） */
  showAfterMs?: number;
  /** 显示提示，返回收起它的函数（恢复时调） */
  show(): (() => void) | void;
  /** 丢了这么久还没回来就放弃（比如 20 秒记一笔下次降档）；不给就不放弃 */
  giveUpMs?: number;
  onGiveUp?(): void;
  /** 页面离开（pagehide）时还丢着也算放弃（选项做法）；默认否 */
  giveUpOnHide?: boolean;
}
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

/**
 * 丢失恢复的状态机（不碰 DOM，单测用）：丢了等 showAfterMs 才提示，恢复时收起；同一时间只有一条提示，丢着的时候再来 lost 不重算；
 * 放弃只调一次
 */
export function createLossWatch(o: LossOptions, t: Timers): { lost(): void; restored(): void; hide(): void; isLost(): boolean; dispose(): void } {
  let lost = false;
  let wait: unknown = null;
  let giveUp: unknown = null;
  let close: (() => void) | null = null;
  let gaveUp = false;
  const quit = (): void => {
    if (gaveUp) return;
    gaveUp = true;
    o.onGiveUp?.();
  };
  const clearAll = (): void => {
    if (wait !== null) t.clear(wait);
    if (giveUp !== null) t.clear(giveUp);
    wait = giveUp = null;
  };
  return {
    lost() {
      if (lost) return;
      lost = true;
      wait = t.set(() => {
        wait = null;
        if (lost && !close) close = o.show() ?? (() => {});
      }, o.showAfterMs ?? 3000);
      if (o.giveUpMs !== undefined) giveUp = t.set(() => {
        giveUp = null;
        if (lost) quit();
      }, o.giveUpMs);
    },
    restored() {
      lost = false;
      clearAll();
      close?.();
      close = null;
    },
    hide() {
      if (lost && o.giveUpOnHide) quit();
    },
    isLost: () => lost,
    dispose: clearAll,
  };
}

/** 接到画布上：webglcontextlost / webglcontextrestored（和 pagehide）。返回取消监听的函数 */
export function onWebglLoss(canvas: HTMLCanvasElement, o: LossOptions): () => void {
  const w = createLossWatch(o, { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) });
  const lost = (): void => w.lost();
  const restored = (): void => w.restored();
  const hide = (): void => w.hide();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  window.addEventListener('pagehide', hide);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    window.removeEventListener('pagehide', hide);
    w.dispose();
  };
}
