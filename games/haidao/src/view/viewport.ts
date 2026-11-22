/**
 * 手机和平板（仓库根 AGENTS.md 第 4 节）：可见区、双指放大、转屏补算、省内存都用 arcade-kit/viewport，这里只传海岛的值：
 * 渲染倍数按像素比、最多 2，省内存设备（iOS 或触屏）最多 1.5；写 --app-h，放大中不动，不听 visualViewport 的 scroll。
 */
import { dprScale, isLowMemoryDevice, watchViewport } from 'arcade-kit/viewport';
import { DEV } from './devflags.ts';

/** 省内存设备；?lowmem 强制（冒烟用） */
export const LOW_MEMORY = DEV.lowMemory || isLowMemoryDevice();

/** 画布的渲染倍数；?rs=<1–3> 强制（帧率 A/B 测量用） */
export function renderScale(): number {
  return DEV.renderScale ?? dprScale({ dpr: window.devicePixelRatio || 1, cap: 2, lowMemory: LOW_MEMORY, lowMemoryCap: 1.5 });
}

/** 写 --app-h（看得见的高度），尺寸变化时通知；转屏后稍等再补算一次。双指放大时不动。返回取消监听的函数 */
export const fitViewport = (onFit: () => void): (() => void) => watchViewport({ onChange: onFit, listenScroll: false });
