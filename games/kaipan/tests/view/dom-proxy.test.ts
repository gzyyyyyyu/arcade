import { describe, expect, it } from 'vitest';
import { atLeast, worldToPage } from '../../src/view/ui/domProxyGeo.ts';

describe('DOM 影子按钮的坐标换算', () => {
  it('1 倍、画布铺满页面左上角：世界坐标就是页面坐标', () => {
    expect(worldToPage({ x: 14, y: 10, w: 104, h: 42 }, { scrollX: 0, scrollY: 0, zoom: 1 }, { x: 0, y: 0, w: 1280, h: 720 }, { w: 1280, h: 720 })).toEqual({ x: 14, y: 10, w: 104, h: 42 });
  });
  it('EXPAND 滚动、渲染倍数 2、窗口缩小一半、画布有偏移', () => {
    const p = worldToPage({ x: 14, y: 10, w: 100, h: 40 }, { scrollX: -20, scrollY: -10, zoom: 2 }, { x: 5, y: 7, w: 1000, h: 500 }, { w: 2000, h: 1000 });
    expect(p).toEqual({ x: 5 + (14 + 20) * 2 * 0.5, y: 7 + (10 + 10) * 2 * 0.5, w: 100, h: 40 });
  });
  it('触屏上撑到至少 44 见方，以原框中心为准；够大的不变', () => {
    expect(atLeast({ x: 10, y: 8, w: 93, h: 37 }, 44)).toEqual({ x: 10, y: 4.5, w: 93, h: 44 });
    expect(atLeast({ x: 10, y: 8, w: 100, h: 50 }, 44)).toEqual({ x: 10, y: 8, w: 100, h: 50 });
  });
});
