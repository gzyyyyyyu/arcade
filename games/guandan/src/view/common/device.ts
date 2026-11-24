/**
 * 设备与可见区域：iOS 识别、实际能看到的区域、渲染倍数、省内存模式。
 *
 * iOS Safari 的 100vh 和 screen 尺寸是工具栏收起时的最大高度，比真能看到的高，按它们排版顶栏会被地址栏盖住，
 * 按它们算渲染倍数还会偏大；所以布局和倍数一律按 visualViewport / innerHeight 量出来的可见区域，再扣掉安全区。
 *
 * 省内存模式：老 iPhone 内存不够时 WebKit 直接杀掉页面（"网页已崩溃"），JS 来不及做任何事。
 * 所以页面在前台时本地记一笔"开着"，切到后台或正常离开（pagehide）就清掉；下次打开还看到这笔记录，
 * 说明上次是开着的时候被杀掉的，这次降一档：先 1 倍渲染，再不行换 Canvas 渲染。只在 iOS 上记。
 * 换版本后重新试正常模式（新版本可能已经修好了）。
 *
 * 判断和公式都用 arcade-kit/viewport（各游戏共用一份，默认值是开盘的）；这里传牌馆自己的阈值。
 */
import { type Box, forcedScale, insetBox, isLowMemoryDevice, lowMemoryTier, measureBox, renderScaleFor, safeInsets, sameBox, webglUsable as webglAvailable } from 'arcade-kit/viewport';
import { KEYS, rawStore } from '../store.ts';

export { isIOS, isIOSSafari, isStandalone } from 'arcade-kit/viewport';
export type { Box };

// 和 theme.ts 一致；theme.ts 引用本文件，反过来引用会循环
const GAME_HEIGHT = 720;
const MIN_WIDTH = 1280;

/**
 * 双指放大的判定：牌馆只认放大（scale > 1.01），缩小不算（kit 默认是开盘的 |scale − 1| > 0.02，这里传牌馆的）
 */
export const zoomedIn = (scale: number): boolean => scale > 1.01;

/** 实际可见区域（CSS 像素，相对布局视口左上角）；双指放大中为 null，调用方沿用上次的区域 */
function visibleBox(): Box | null {
  return measureBox({ w: window.innerWidth, h: window.innerHeight }, window.visualViewport, zoomedIn);
}

/** 画面容器能用的区域：可见区域扣掉安全区；双指放大中为 null */
function measureAppBox(): Box | null {
  const v = visibleBox();
  return v && insetBox(v, safeInsets());
}

let fitted: Box | null = null;

/**
 * 把 #app 钉到可见区域（CSS 里的 100vh/100dvh 只是 JS 跑起来之前的兜底）。启动时调一次；之后由 main.ts 的
 * kit watchViewport（pin 同一个元素）跟着可见区走，钉上去的区域经 setFitted 记回这里。返回这次是不是真的改了尺寸
 */
export function fitAppToViewport(el: HTMLElement): boolean {
  const b = measureAppBox();
  if (!b || sameBox(fitted, b)) return false;
  el.style.left = `${b.x}px`;
  el.style.top = `${b.y}px`;
  el.style.width = `${b.w}px`;
  el.style.height = `${b.h}px`;
  fitted = b;
  return true;
}

/** watchViewport 钉了区域：记下来（appBox 读它），返回是不是和上次不一样 */
export function setFitted(b: Box): boolean {
  if (sameBox(fitted, b)) return false;
  fitted = b;
  return true;
}

/** #app 现在的区域（上次钉上去的；还没钉过就现量，放大中再退回整个窗口） */
export function appBox(): Box {
  return fitted ?? measureAppBox() ?? { x: 0, y: 0, w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
}

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/**
 * 省内存三档（kit 的 lowMemoryTier，标记存在 guandan.boot）：只在 iOS 上记（桌面浏览器崩溃、断电不该把画质永久降下去）。
 * 单元测试（node）里没有 window，档位是 0
 */
const tier = typeof window === 'undefined'
  ? { level: 0 as const, markForeground: (): void => {}, markRenderLost: (): void => {} }
  : lowMemoryTier({ read: () => rawStore.read(KEYS.boot), write: (m) => rawStore.write(KEYS.boot, m), version: VERSION });

/** 本次启动用的省内存档位（模块加载时定下来，之后不变）：0 正常，1 一倍渲染，2 再加 Canvas 渲染 */
export const LOW_MEMORY: 0 | 1 | 2 = tier.level;

/** 页面切到后台或正常离开：这段时间没被杀，清掉标记；回到前台再记上 */
export const markForeground = (on: boolean): void => tier.markForeground(on);

/** 画面被系统收回（WebGL 上下文丢了不回来）：下次直接降一档 */
export const markRenderLost = (): void => tier.markRenderLost();

/**
 * 渲染倍数：可见区域 × DPR 对 1280×720 取整（1..3，取整前减 0.05：刚好超一点不升档）。手机平板（iOS 或触屏，kit 的 isLowMemoryDevice）封顶 2（仓库 AGENTS.md 第 4 节：老 iPhone 内存小，WebKit 超了直接杀页面；安卓 3 倍屏同样吃内存）；
 * 省内存模式固定 1。URL 参数 scale=N 强制倍数（清晰度对比、排查用），优先于以上全部
 */
export function pickRenderScale(): number {
  if (typeof window === 'undefined') return 1;
  const forced = forcedScale(window.location.search);
  if (forced) return forced;
  if (LOW_MEMORY > 0) return 1;
  const v = visibleBox() ?? { w: window.innerWidth, h: window.innerHeight };
  return renderScaleFor({ w: v.w, h: v.h, dpr: window.devicePixelRatio || 1, designW: MIN_WIDTH, designH: GAME_HEIGHT, lowMemory: isLowMemoryDevice(), lowMemoryCap: 2, bias: 0.05 });
}

/** 启动前先试一下能不能拿到 WebGL：拿不到（或省内存第 2 档）就用 Canvas 渲染 */
export function webglUsable(): boolean {
  return LOW_MEMORY < 2 && webglAvailable();
}
