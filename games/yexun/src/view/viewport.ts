import { dprScale, isLowMemoryDevice } from 'arcade-kit/viewport';
import { RING } from '../core/state.ts';

/**
 * 手机和平板（尤其 iOS）的规矩照模块 AGENTS.md「画面」一节，设备判断、可见区、双指放大都用 arcade-kit/viewport；
 * 这里只留夜巡自己的：?lowmem 强制省内存、渲染倍数的上限、世界缩放。
 */

/** 省内存设备（iOS、触屏手机平板）：渲染倍数封顶 2、关粒子；?lowmem 强制（冒烟用） */
export const LOW_MEMORY = ((): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('lowmem') || isLowMemoryDevice();
})();

/** 触屏（显示虚拟摇杆、不显示键盘提示） */
export const TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** 画布的渲染倍数：按 devicePixelRatio，省内存设备最多 2、别的最多 3 */
export function renderScale(): number {
  return dprScale({ dpr: window.devicePixelRatio, cap: 3, lowMemory: LOW_MEMORY, lowMemoryCap: 2 });
}

/** 竖屏按屏宽定缩放：一屏宽看到这么多世界单位（10-20 三档对比后定，见 CHANGELOG 0.3.15） */
const TALL_BASE = 460;

/**
 * 世界缩放：一屏大约看到多大的世界。横屏按高度定，手机上看到的世界稍大一点，免得怪贴脸了才看见；
 * 竖屏按宽度定（按高度的话竖屏只看得见 260 宽，主角和怪大得挤满屏）。
 * 不管哪种，看得见的半宽、半高都不超过这局的刷怪圈（core 的 RING，tall 是竖屏开的局、圈转 90°），怪不会在屏里凭空冒出来；
 * 横屏局转成竖屏（或反过来）时靠这一条收紧视野。
 */
export function worldZoom(cssW: number, cssH: number, tall: boolean): number {
  const base = cssH > cssW ? cssW / TALL_BASE : cssH / (cssH < 500 ? 500 : 560);
  const [rx, ry] = tall ? [RING.short, RING.long] : [RING.long, RING.short];
  return Math.max(base, cssW / (2 * rx), cssH / (2 * ry));
}
