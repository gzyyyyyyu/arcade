/**
 * 渲染倍数对照表（0.25.0，kit 收编验收 A3）：五个有画布的游戏原来各自的公式照抄在这里（local/main fef06a95），
 * 和 kit 传对应参数后的结果逐个比。期望值从游戏原代码算，不从 kit 算；游戏迁到 kit 时照这里的参数传，结果不变。
 * 雀馆、德州、飞驰是 DOM 画面，没有渲染倍数
 */
import { describe, expect, it } from 'vitest';
import { dprScale, renderScaleFor } from '../src/viewport.ts';

const DPRS = [1, 1.25, 1.5, 2, 2.625, 3, 3.5];
/** 横屏的手机、竖着拿的手机、平板、电脑（电脑都是横着的显示器） */
const SIZES = [
  { w: 844, h: 390, phone: true },
  { w: 390, h: 844, phone: true },
  { w: 667, h: 375, phone: true },
  { w: 1366, h: 1024, phone: true },
  { w: 1280, h: 720, phone: false },
  { w: 1920, h: 1080, phone: false },
  { w: 2560, h: 1440, phone: false },
];
const LOW = [false, true];

/** 海岛 src/view/viewport.ts 的 renderScale（PHONE_RS_CAP = 1.5；?rs= 强制不在这里） */
const haidao = (dpr: number, low: boolean): number => Math.max(1, Math.min(low ? 1.5 : 2, dpr || 1));
/** 夜巡 src/view/viewport.ts 的 renderScale */
const yexun = (dpr: number, low: boolean): number => Math.max(1, Math.min(low ? 2 : 3, dpr || 1));
/** 弹里个弹 src/view/viewport.ts 的 renderRatio（不分设备） */
const danli = (dpr: number): number => Math.min(2, Math.max(1, dpr || 1));
/** 开盘 src/view/theme.ts 的 RENDER_SCALE（量的区域已经选好：手机长边对宽，电脑横着的显示器原样；?scale= 强制不在这里） */
const kaipan = (sw: number, sh: number, dpr: number, low: boolean, phone: boolean, view: { w: number; h: number }): number => {
  const w = (phone ? Math.max(sw, sh) : sw) * dpr;
  const h = (phone ? Math.min(sw, sh) : sh) * dpr;
  return Math.min(low ? 2 : 3, Math.max(1, Math.ceil(Math.min(w / view.w, h / view.h))));
};
/** 牌馆 src/view/common/device.ts 的 pickRenderScale（省内存档 LOW_MEMORY > 0 时直接 1、?scale= 强制，都在公式外面） */
const guandan = (vw: number, vh: number, dpr: number, ios: boolean): number => {
  const long = Math.max(vw, vh) * dpr;
  const short = Math.min(vw, vh) * dpr;
  const s = Math.min(3, Math.max(1, Math.ceil(Math.min(long / 1280, short / 720) - 0.05)));
  return ios ? Math.min(2, s) : s;
};

const grid = (): { w: number; h: number; phone: boolean; dpr: number; low: boolean }[] =>
  SIZES.flatMap((s) => DPRS.flatMap((dpr) => LOW.map((low) => ({ ...s, dpr, low }))));

describe('渲染倍数：kit 传各游戏的参数，结果和原公式逐个相等', () => {
  it('海岛：dprScale cap 2、lowMemoryCap 1.5', () => {
    for (const g of grid()) expect(dprScale({ dpr: g.dpr, cap: 2, lowMemory: g.low, lowMemoryCap: 1.5 }), JSON.stringify(g)).toBe(haidao(g.dpr, g.low));
  });

  it('夜巡：dprScale cap 3、lowMemoryCap 2', () => {
    for (const g of grid()) expect(dprScale({ dpr: g.dpr, cap: 3, lowMemory: g.low, lowMemoryCap: 2 }), JSON.stringify(g)).toBe(yexun(g.dpr, g.low));
  });

  it('弹里个弹：dprScale cap 2（不传省内存）', () => {
    for (const g of grid()) expect(dprScale({ dpr: g.dpr, cap: 2 }), JSON.stringify(g)).toBe(danli(g.dpr));
  });

  it('开盘：renderScaleFor 默认（cap 3、省内存封顶 2、bias 0），电脑 1280×720 和手机世界两种设计尺寸', () => {
    for (const view of [{ w: 1280, h: 720 }, { w: 820, h: 380 }]) {
      for (const g of grid()) {
        expect(renderScaleFor({ w: g.w, h: g.h, dpr: g.dpr, designW: view.w, designH: view.h, lowMemory: g.low }), JSON.stringify({ ...g, view })).toBe(kaipan(g.w, g.h, g.dpr, g.low, g.phone, view));
      }
    }
  });

  it('牌馆：renderScaleFor bias 0.05，省内存（iOS）封顶 2', () => {
    for (const g of grid()) {
      expect(renderScaleFor({ w: g.w, h: g.h, dpr: g.dpr, designW: 1280, designH: 720, lowMemory: g.low, lowMemoryCap: 2, bias: 0.05 }), JSON.stringify(g)).toBe(guandan(g.w, g.h, g.dpr, g.low));
    }
  });

  it('dprScale 不给像素比时按 1，结果不小于 1', () => {
    expect(dprScale({ dpr: 0 })).toBe(1);
    expect(dprScale({ dpr: 0.75 })).toBe(1);
    expect(dprScale({ dpr: 5 })).toBe(3);
  });
});
