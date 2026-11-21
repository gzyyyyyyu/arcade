/**
 * 主页（标题页）的排版（art-v3 PR ①，docs/art.md 第 4 节）：纯函数，画背景的 SVG 和场景摆东西用同一份，宽屏时一起铺开。
 * 横屏：世界坐标高 720、宽 1280..1720，左边是主视觉（茶馆一角、四个人），右边一块面板放标题、主按钮、模式卡、战绩。
 * 竖屏（宽 720、高 1080..1600，theme.ts 的 worldSizeFor）：主视觉在上、面板在下，同一块面板（宽 672、高 600）原样搬下来。
 */
import type { AvatarId, Mood } from '../art/index.ts';

interface HomeLayout {
  W: number;
  H: number;
  /** 竖屏：主视觉在上、面板在下 */
  portrait: boolean;
  /** 主视觉（桌子、散牌、人）整体往下挪多少：竖屏时把主视觉和面板之间的空当分一部分到上面，不全堆在中间 */
  top: number;
  /** 主视觉占的宽度（面板左边再让出 24） */
  artW: number;
  panel: { x: number; y: number; w: number; h: number };
  /** 月洞窗中心和半径 */
  window: { x: number; y: number; r: number };
  /** 灯笼挂点（绳子的顶端）和缩放 */
  lanterns: { x: number; y: number; s: number }[];
  /** 四个人：头肩像底边中点、缩放、微微歪的角度 */
  figures: { id: AvatarId; mood: Mood; x: number; y: number; s: number; tilt: number }[];
  /** 桌子后沿、前沿的 y */
  table: { back: number; front: number };
}

/** 面板宽：1280 时 500，越宽越大，封顶 560（多出的宽度主要给主视觉） */
export function panelWidth(W: number): number {
  return Math.min(560, 500 + Math.round((W - 1280) * 0.25));
}

/** 面板的高（横竖屏一样） */
const PANEL_H = 600;
/** 竖屏时面板离下沿留多少（版本号写在下沿） */
const PORTRAIT_BOTTOM = 44;

export function homeLayout(W: number, H = 720): HomeLayout {
  const portrait = H > W;
  const pw = portrait ? W - 48 : panelWidth(W);
  const margin = 32;
  const panel = portrait ? { x: 24, y: H - PORTRAIT_BOTTOM - PANEL_H, w: pw, h: PANEL_H } : { x: W - margin - pw, y: 92, w: pw, h: PANEL_H };
  // 竖屏主视觉占满整宽；面板压住桌子前沿以下的部分（720 高的主视觉、面板顶在 H-644：H 小到 1364 以下时面板盖住桌沿，再小就盖住散牌）
  const artW = portrait ? W : panel.x - 24;
  const top = portrait ? Math.max(0, Math.round((panel.y - 680) * 0.45)) : 0;
  const back = 486 + top;
  // 四个人等距排在主视觉里，彼此压一点（像围坐），最右的一位不压到面板；竖屏只有 720 宽，人缩小一点
  const order: [AvatarId, Mood, number, number][] = [
    ['laozhang', 'smug', 30, -4],
    ['xiaomei', 'normal', 20, 2],
    ['aqiang', 'happy', 26, 5],
    ['me', 'happy', 34, -3],
  ];
  const s = portrait ? 1.3 : 1.62;
  const figures = order.map(([id, mood, dy, tilt], i) => ({ id, mood, x: Math.round(artW * (0.14 + 0.24 * i)), y: back + dy, s, tilt }));
  return {
    W,
    H,
    portrait,
    top,
    artW,
    panel,
    window: { x: Math.round(artW * 0.46), y: 290 + top, r: 230 },
    // 灯笼从顶上挂下来，不跟着主视觉往下挪
    lanterns: [
      { x: Math.round(artW * 0.07), y: 10, s: 0.95 },
      { x: Math.round(artW * 0.84), y: 0, s: 0.8 },
    ],
    figures,
    table: { back, front: 640 + top },
  };
}

/** 头肩像纹理的原始尺寸（homeFigureSvg 的画布，底边中点在 (80, 160)） */
export const FIGURE_SIZE = { w: 160, h: 170, footY: 160 } as const;
/** 灯笼纹理的原始尺寸和挂点（lanternArtSvg） */
export const LANTERN_SIZE = { w: 120, h: 280, pivotY: 10 } as const;
