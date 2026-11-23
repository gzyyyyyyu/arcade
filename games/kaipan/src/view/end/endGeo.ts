import { GAME_WIDTH, TYPE } from '../theme.ts';

const W = 960;
const H = 600;

/** 结束页纸卡的一套尺寸（电脑一套、手机横屏一套），坐标都相对纸卡左上角。 */
export interface Geo {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 左栏左边距、宽 */
  pad: number;
  leftW: number;
  /** 立绘 / 徽章的中心 y、立绘宽、徽章大小 */
  headY: number;
  portrait: number;
  badge: number;
  titleY: number;
  titleSize: number;
  moneySize: number;
  wallet: number;
  /** 「最赚的一笔」卡：宽、小人最大、离纸卡底边 */
  boxW: number;
  guyMax: number;
  boxBottom: number;
  /** 右栏左边、战绩格（列数、宽、图标、字号） */
  mx: number;
  rightW: number;
  tileCols: number;
  tw: number;
  tileIcon: number;
  tileSize: number;
  tileGap: number;
  /** 收获一行：是否在同一行写「收获」两个字（手机），图标大小 */
  gainsInline: boolean;
  chipIcon: number;
  /** 底部按钮高、离纸卡底边 */
  btnH: number;
  btnBottom: number;
  /** 战绩格竖排（小图标和标签一行、数字一行，手机窄屏）；月份轨道一格的间距 */
  stacked: boolean;
  trackPitch: number;
  /** 账单轨道离「收获」、最好成绩 / 经历 / 排行榜 / 下次试试离轨道的距离 */
  dy: { track: number; best: number; recap: number; row: number; hint: number };
  /**
   * 竖屏版一栏排下来：「最赚的一笔」卡的高度（定高，不再撑到纸卡底），右栏（战绩、收获、账单、按钮）接在它下面。
   * 横屏两栏时为 null。
   */
  single: { boxH: number } | null;
}

export const DESK_GEO: Geo = {
  x: GAME_WIDTH / 2 - W / 2, y: 60, w: W, h: H, pad: 40, leftW: 420, headY: 46, portrait: 40, badge: 36, titleY: 86, titleSize: 40, moneySize: 40, wallet: 44,
  boxW: 400, guyMax: 180, boxBottom: 40, mx: 480, rightW: 404, tileCols: 2, tw: 196, tileIcon: 40, tileSize: TYPE.title + 2, tileGap: 12,
  gainsInline: false, chipIcon: 34, btnH: 50, btnBottom: 74, stacked: false, trackPitch: 31,
  // 图标格（高 44）从收获下 34 起，到 78 为止；轨道的深色条顶在 track − 22，留 6 的空
  dy: { track: 106, best: 44, recap: 92, row: 114, hint: 150 },
  single: null,
};
/**
 * 手机横屏（按世界宽度，718–960×404）：纸卡 = 整屏弹窗大小（SE 702×392，宽屏 940×392）；
 * 左栏标题、账户、最赚的一笔收小一号，宽 290–380；右栏战绩 3 × 2，一格不到 140 宽时竖排，
 * 「收获」两个字和图标并在一行，按钮 46 高，按右栏宽度分。
 */
export function phoneGeo(V: { w: number; h: number }): Geo {
  if (V.h > V.w) return portraitGeo(V);
  const w = Math.min(940, V.w - 16);
  const h = Math.min(430, V.h - 12);
  const pad = w >= 900 ? 24 : 20;
  const leftW = Math.max(290, Math.min(380, Math.round(w * 0.42)));
  const mx = pad + leftW + 20;
  const rightW = w - mx - 16;
  const tileGap = 8;
  const tw = Math.floor((rightW - tileGap * 2) / 3);
  const stacked = tw < 140;
  return {
    x: Math.round((V.w - w) / 2), y: Math.round((V.h - h) / 2), w, h, pad, leftW, headY: 34, portrait: 34, badge: 30, titleY: 64, titleSize: 32, moneySize: 32, wallet: 36,
    boxW: leftW, guyMax: 120, boxBottom: 34, mx, rightW, tileCols: 3, tw, tileIcon: stacked ? 20 : 32, tileSize: TYPE.title, tileGap,
    gainsInline: true, chipIcon: 30, btnH: 46, btnBottom: 64, stacked, trackPitch: Math.min(31, Math.floor((rightW - 44) / 12)),
    // 轨道离「收获」一行（图标格高 44）至少隔 6，不压住收获的图标
    dy: { track: 66, best: 40, recap: 84, row: 98, hint: 132 },
    single: null,
  };
}

/**
 * 竖屏版（世界 404 × 718–960）：纸卡占满一屏（四周留 8 / 12），一栏从上往下排：头像和标签、称号、账户、
 * 「最赚的一笔」卡（高 150：小人 + 一列字和「这段日子」），下面接战绩 3 × 2（竖排的窄格）、收获、账单轨道，最下面一排按钮。
 * 矮屏（360×640 是 694 高）上经历、排行榜、下次试试这几行放不下就不放（排行在每日挑战面板里也能看）。
 */
function portraitGeo(V: { w: number; h: number }): Geo {
  const w = V.w - 16;
  const h = V.h - 24;
  const pad = 16;
  const rightW = w - pad * 2;
  const tileGap = 8;
  return {
    x: Math.round((V.w - w) / 2), y: 12, w, h, pad, leftW: rightW, headY: 34, portrait: 34, badge: 30, titleY: 64, titleSize: 28, moneySize: 28, wallet: 32,
    boxW: rightW, guyMax: 110, boxBottom: 0, mx: pad, rightW, tileCols: 3, tw: Math.floor((rightW - tileGap * 2) / 3), tileIcon: 20, tileSize: TYPE.title, tileGap,
    gainsInline: true, chipIcon: 30, btnH: 46, btnBottom: 64, stacked: true, trackPitch: Math.min(31, Math.floor((rightW - 44) / 12)),
    dy: { track: 66, best: 40, recap: 84, row: 98, hint: 132 },
    single: { boxH: 150 },
  };
}

