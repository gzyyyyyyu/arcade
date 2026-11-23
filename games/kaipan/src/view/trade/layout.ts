import type { Rect } from '../rect.ts';
import { PHONE, PORTRAIT, VIEW } from '../theme.ts';
import { PORTRAIT_TOP_H } from './topBarGeo.ts';

/**
 * 交易主场景的布局，见设计稿第 10 节。电脑是 1280×720 的世界；
 * 手机横屏：持仓在左上、收盘小结在左下、开盘键在右下角旁边，
 * 右边一块用标签页在「群聊」和「风口」之间切换（三块都摆开字就小得看不清）。
 */
const DESKTOP = {
  TOP: { x: 8, y: 8, w: 1264, h: 56 },
  /** 左栏题材看板 */
  BOARD: { x: 10, y: 70, w: 246, h: 644 },
  /** 右栏手机群聊 */
  PHONE: { x: 966, y: 66, w: 306, h: 650 },
  /** 中间持仓区（卡片顶到底） */
  SLOTS: { x: 266, y: 232, w: 692, h: 222 },
  /** 显示器上的状态条 */
  MONITOR: { x: 478, y: 466, w: 324, h: 64 },
  /** 开盘按钮 */
  OPEN: { x: 476, y: 604, w: 270, h: 84 },
  /** 收盘小结 */
  RECAP: { x: 278, y: 68, w: 668, h: 160 },
  /** 猫的提示气泡 */
  HINT: { x: 262, y: 448, w: 214, h: 164 },
  /** 群聊 / 风口的标签页（电脑上没有） */
  TABS: null as Rect | null,
} satisfies Record<string, Rect | null>;

/**
 * 手机：世界宽 718–960、高 404（见 theme.ts 的 phoneWorld），各块按宽度算。
 * 右边群聊 / 风口一块占宽度的三分之一多（256–338），左边是持仓、下面是小结和开盘键。
 */
export function mobileLayout(W: number, H: number): typeof DESKTOP {
  const panelW = Math.max(256, Math.min(338, Math.round(W * 0.355)));
  const px = W - 6 - panelW;
  const leftW = px - 16;
  const slotsY = 54;
  const slotsH = 214;
  const lowY = slotsY + slotsH + 6;
  const lowH = H - 4 - lowY;
  const openW = 140;
  const ox = 8 + leftW - openW;
  const recap = { x: 8, y: lowY, w: leftW - openW - 8, h: lowH };
  return {
    TOP: { x: 4, y: 4, w: W - 8, h: 46 },
    BOARD: { x: px, y: 100, w: panelW, h: H - 104 },
    PHONE: { x: px, y: 100, w: panelW, h: H - 104 },
    SLOTS: { x: 8, y: slotsY, w: leftW, h: slotsH },
    MONITOR: { x: ox, y: lowY, w: openW, h: 46 },
    OPEN: { x: ox, y: lowY + 50, w: openW, h: lowH - 50 },
    RECAP: recap,
    HINT: recap,
    // 标签页是手机上点得最多的地方：高 46（SE 上约 43px），下沿再往下撑一点点击区见 tabs.ts
    TABS: { x: px, y: 52, w: panelW, h: 46 },
  };
}

/**
 * 竖屏版（世界 404 × 718–960）：一栏从上往下——两行顶栏（高 92）、持仓（高 214，矮屏 204）、群聊 / 推荐 / 风口的标签和那一块（吃掉多出来的高度），
 * 最下面一排是收盘小结（左）和显示器状态条 + 开盘键（右，宽 150，拇指够得着）。
 */
export function portraitLayout(W: number, H: number): typeof DESKTOP {
  const top = { x: 4, y: 4, w: W - 8, h: PORTRAIT_TOP_H };
  const slotsY = top.y + top.h + 6;
  // 矮屏（360×640）也留 204：两排矮卡各 98 高，放大镜和「卖出」的点击区上下都够 50（HIT_MIN），群聊那块还剩 232
  const slotsH = H >= 800 ? 214 : 204;
  const tabsY = slotsY + slotsH + 6;
  const lowH = 112;
  const lowY = H - 4 - lowH;
  const openW = 150;
  const ox = W - 8 - openW;
  // 页签高 50：360 宽上点击区也够 44 像素（横屏那边是 46，下沿再撑 4）
  const tabsH = 50;
  const panelY = tabsY + tabsH + 2;
  const recap = { x: 8, y: lowY, w: ox - 8 - 8, h: lowH };
  return {
    TOP: top,
    BOARD: { x: 6, y: panelY, w: W - 12, h: lowY - 6 - panelY },
    PHONE: { x: 6, y: panelY, w: W - 12, h: lowY - 6 - panelY },
    SLOTS: { x: 8, y: slotsY, w: W - 16, h: slotsH },
    MONITOR: { x: ox, y: lowY, w: openW, h: 46 },
    OPEN: { x: ox, y: lowY + 50, w: openW, h: lowH - 50 },
    RECAP: recap,
    // 猫的提示只占底下这一块（往上高出会在矮屏上压住第 3 张推荐卡的买入 / 押跌）；猫缩成小头像放进标题行（hintBubble 的 catInside）
    HINT: recap,
    TABS: { x: 6, y: tabsY, w: W - 12, h: tabsH },
  };
}

const L = PORTRAIT ? portraitLayout(VIEW.w, VIEW.h) : PHONE ? mobileLayout(VIEW.w, VIEW.h) : DESKTOP;

export const TOP: Rect = L.TOP;
export const BOARD: Rect = L.BOARD;
export const PHONE_RECT: Rect = L.PHONE;
export const SLOTS: Rect = L.SLOTS;
export const MONITOR: Rect = L.MONITOR;
export const OPEN: Rect = L.OPEN;
export const RECAP_AREA: Rect = L.RECAP;
export const HINT_AREA: Rect = L.HINT;
export const TABS: Rect | null = L.TABS;

/**
 * 竖屏版的持仓卡是矮卡（slotCard 的 compact 画法），排成两行：4 格以内一行 2 张，5、6 格一行 3 张。
 * 一行排 4 张的话一张只有 90 宽，「卖出」「加减」挤不下（docs/ui.md 可点区域）。
 */
export const COMPACT_SLOTS = PORTRAIT;

/** n 格持仓时每张卡的位置（居中排开；竖屏版两行）。 */
export function slotRects(n: number): Rect[] {
  if (COMPACT_SLOTS) return gridRects(n, SLOTS);
  return rowRects(n);
}

/** 竖屏：两行，行距 8（卖出键的点击区往下撑 8，不压到下一行的卡） */
function gridRects(n: number, area: Rect): Rect[] {
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.max(1, Math.ceil(n / cols));
  const gap = 8;
  const w = Math.floor((area.w - gap * (cols - 1)) / cols);
  const h = Math.floor((area.h - gap * (rows - 1)) / rows);
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const x0 = area.x + Math.round((area.w - (w * inRow + gap * (inRow - 1))) / 2);
    return { x: x0 + (i % cols) * (w + gap), y: area.y + r * (h + gap), w, h };
  });
}

function rowRects(n: number): Rect[] {
  const gap = PHONE ? (n <= 4 ? 8 : 6) : n <= 4 ? 16 : 10;
  const w = Math.min(160, Math.floor((SLOTS.w - gap * (n - 1)) / n));
  const total = w * n + gap * (n - 1);
  const x0 = SLOTS.x + Math.round((SLOTS.w - total) / 2);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y: SLOTS.y, w, h: SLOTS.h }));
}
