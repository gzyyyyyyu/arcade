/** arcade-kit/viewport 的纯函数（0.25.0）：放大判定、可见区、安全区、判重、渲染倍数、省内存三档、WebGL 丢失恢复的状态机 */
import { describe, expect, it } from 'vitest';
import {
  bootLevel,
  cleanMark,
  createLossWatch,
  forcedScale,
  insetBox,
  isIosSafariUa,
  isIosUa,
  isZoomed,
  lostMark,
  measureBox,
  renderScaleFor,
  sameBox,
  type Timers,
} from '../src/viewport.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
const WECHAT = `${IPHONE} MicroMessenger/8.0`;

describe('设备', () => {
  it('iOS：iPhone 认；iPadOS 冒充 Mac 时靠触屏点数认；Mac 本身不认', () => {
    expect(isIosUa(IPHONE, 5)).toBe(true);
    expect(isIosUa(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIosUa(IPAD_AS_MAC, 0)).toBe(false);
  });
  it('iOS Safari 本体：微信等内置浏览器不算', () => {
    expect(isIosSafariUa(IPHONE, 5)).toBe(true);
    expect(isIosSafariUa(WECHAT, 5)).toBe(false);
  });
});

describe('可见区', () => {
  const vv = (o: Partial<{ width: number; height: number; offsetLeft: number; offsetTop: number; scale: number }> = {}) => ({ width: 844, height: 340, offsetLeft: 0, offsetTop: 50, scale: 1, ...o });

  it('放大判定默认 |scale − 1| > 0.02（开盘），放大缩小都算', () => {
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(1.015)).toBe(false);
    expect(isZoomed(1.03)).toBe(true);
    expect(isZoomed(0.9)).toBe(true);
    expect(isZoomed(undefined)).toBe(false);
    expect(isZoomed(1.04, 0.05)).toBe(false);
  });

  it('有 visualViewport：取它和 inner 小的那个、带偏移（工具栏盖住顶上一截）；取整', () => {
    expect(measureBox({ w: 844, h: 390 }, vv({ height: 339.6 }))).toEqual({ x: 0, y: 50, w: 844, h: 340 });
  });

  it('放大中返回 null（调用方沿用上次）；自定义判定（牌馆只认放大 1.01）', () => {
    expect(measureBox({ w: 844, h: 390 }, vv({ scale: 1.5 }))).toBeNull();
    expect(measureBox({ w: 844, h: 390 }, vv({ scale: 0.9 }), (s) => s > 1.01)).not.toBeNull();
  });

  it('没有 visualViewport 就是整个窗口', () => {
    expect(measureBox({ w: 1280, h: 720 }, null)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });

  it('扣安全区；判重四项都比', () => {
    const b = insetBox({ x: 0, y: 0, w: 844, h: 390 }, { top: 0, right: 47, bottom: 21, left: 47 });
    expect(b).toEqual({ x: 47, y: 0, w: 750, h: 369 });
    expect(sameBox(b, { ...b })).toBe(true);
    expect(sameBox(b, { ...b, y: 1 })).toBe(false);
    expect(sameBox(null, b)).toBe(false);
  });
});

describe('渲染倍数', () => {
  const D = { designW: 1280, designH: 720 };
  it('按物理像素对设计尺寸取整，长边对宽：竖着拿的手机和横着一样', () => {
    expect(renderScaleFor({ ...D, w: 1280, h: 720, dpr: 1 })).toBe(1);
    expect(renderScaleFor({ ...D, w: 1920, h: 1080, dpr: 1 })).toBe(2);
    expect(renderScaleFor({ ...D, w: 844, h: 390, dpr: 3 })).toBe(2);
    expect(renderScaleFor({ ...D, w: 390, h: 844, dpr: 3 })).toBe(2);
    expect(renderScaleFor({ ...D, w: 2560, h: 1440, dpr: 2 })).toBe(3);
  });
  it('省内存设备默认封顶 2（AGENTS.md：手机平板最多 2）；封顶值可传', () => {
    expect(renderScaleFor({ ...D, w: 1366, h: 1024, dpr: 2, lowMemory: true })).toBe(2);
    expect(renderScaleFor({ ...D, w: 1366, h: 1024, dpr: 2, lowMemory: false })).toBe(3);
    expect(renderScaleFor({ ...D, w: 1366, h: 1024, dpr: 2, lowMemory: true, lowMemoryCap: 3 })).toBe(3);
  });
  it('bias：刚好超一点不升档（牌馆 0.05）', () => {
    expect(renderScaleFor({ ...D, w: 1300, h: 731, dpr: 1 })).toBe(2);
    expect(renderScaleFor({ ...D, w: 1300, h: 731, dpr: 1, bias: 0.05 })).toBe(1);
  });
  it('URL 的 scale=N 只认 1..3', () => {
    expect(forcedScale('?scale=2')).toBe(2);
    expect(forcedScale('?scale=9')).toBeNull();
    expect(forcedScale('')).toBeNull();
  });
});

describe('省内存三档', () => {
  it('第一次打开是 0，记上"开着"；上次没清就升一档，最多到 2；换版本从 0 重来', () => {
    const a = bootLevel(null, '1.0');
    expect(a).toEqual({ level: 0, mark: { v: 1, pending: 1, low: 0, ver: '1.0' } });
    const b = bootLevel(a.mark, '1.0');
    expect(b.level).toBe(1);
    expect(bootLevel(bootLevel(b.mark, '1.0').mark, '1.0').level).toBe(2);
    expect(bootLevel({ ...b.mark, low: 2 }, '1.1').level).toBe(0);
  });
  it('正常离开清掉"开着"的，下次不升档；坏数据当没有', () => {
    expect(bootLevel({ v: 1, pending: 0, low: 1, ver: '1.0' }, '1.0').level).toBe(1);
    expect(cleanMark('garbage', '1.0')).toEqual({ v: 1, pending: 0, low: 0, ver: '1.0' });
  });
  it('WebGL 丢了不回来：下次比这次高一档，不超过 2', () => {
    expect(lostMark({ v: 1, pending: 1, low: 0, ver: '1.0' }, '1.0', 0)).toEqual({ v: 1, pending: 0, low: 1, ver: '1.0' });
    expect(lostMark({ v: 1, pending: 1, low: 2, ver: '1.0' }, '1.0', 2).low).toBe(2);
  });
});

describe('WebGL 丢失恢复', () => {
  /** 手动走的假时钟 */
  function clock(): Timers & { run(ms: number): void } {
    let now = 0;
    let id = 0;
    const due = new Map<number, { at: number; fn: () => void }>();
    return {
      set(fn, ms) {
        due.set(++id, { at: now + ms, fn });
        return id;
      },
      clear(i) {
        due.delete(i as number);
      },
      run(ms) {
        now += ms;
        for (const [i, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
          if (t.at > now) continue;
          due.delete(i);
          t.fn();
        }
      },
    };
  }

  it('默认等 3 秒才提示；没到点就恢复不提示', () => {
    const t = clock();
    let shown = 0;
    const w = createLossWatch({ show: () => void shown++ }, t);
    w.lost();
    t.run(2999);
    w.restored();
    t.run(5000);
    expect(shown).toBe(0);
  });

  it('提示了，恢复时收起；丢着时再来 lost 不重算、不多提示', () => {
    const t = clock();
    let shown = 0;
    let closed = 0;
    const w = createLossWatch({ show: () => { shown++; return () => void closed++; } }, t);
    w.lost();
    t.run(2000);
    w.lost();
    t.run(1000);
    expect(shown).toBe(1);
    w.lost();
    t.run(5000);
    expect(shown).toBe(1);
    w.restored();
    expect(closed).toBe(1);
    expect(w.isLost()).toBe(false);
  });

  it('放弃：giveUpMs 到点还丢着调一次；恢复了就不调；页面离开时还丢着也算（giveUpOnHide）', () => {
    const t = clock();
    let gave = 0;
    const w = createLossWatch({ show: () => {}, showAfterMs: 2000, giveUpMs: 20_000, onGiveUp: () => void gave++, giveUpOnHide: true }, t);
    w.lost();
    t.run(20_000);
    w.hide();
    expect(gave).toBe(1);
    const t2 = clock();
    let gave2 = 0;
    const w2 = createLossWatch({ show: () => {}, giveUpMs: 20_000, onGiveUp: () => void gave2++ }, t2);
    w2.lost();
    t2.run(10_000);
    w2.restored();
    t2.run(20_000);
    w2.hide();
    expect(gave2).toBe(0);
  });
});
