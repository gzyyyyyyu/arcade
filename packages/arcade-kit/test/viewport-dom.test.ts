/**
 * arcade-kit/viewport 的 DOM 接线（0.25.0）：用手写的假 window、visualViewport、document（vi.stubGlobal）和假时钟，
 * 测 watchViewport 的六条（放大不动、缩回跟上、转屏先量再补、判重、取消监听、--app-h）和 onWebglLoss 的接线与取消。
 * 不加 happy-dom 依赖：kit 只碰这几个全局，假一份就够
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onWebglLoss, watchViewport, type Box } from '../src/viewport.ts';

/** 记着自己挂了哪些监听的 EventTarget（看取消监听后是不是全摘掉了） */
class Target extends EventTarget {
  live = new Map<string, number>();
  override addEventListener(t: string, fn: EventListenerOrEventListenerObject | null, o?: AddEventListenerOptions | boolean): void {
    this.live.set(t, (this.live.get(t) ?? 0) + 1);
    super.addEventListener(t, fn, o);
  }
  override removeEventListener(t: string, fn: EventListenerOrEventListenerObject | null, o?: EventListenerOptions | boolean): void {
    this.live.set(t, (this.live.get(t) ?? 0) - 1);
    super.removeEventListener(t, fn, o);
  }
  count(): number {
    return [...this.live.values()].reduce((a, n) => a + n, 0);
  }
}

class FakeVV extends Target {
  width = 844;
  height = 390;
  offsetLeft = 0;
  offsetTop = 0;
  scale = 1;
}

let win: Target & { innerWidth: number; innerHeight: number; visualViewport: FakeVV | null; scrollX: number; scrollY: number; scrollTo(): void };
let vv: FakeVV;
let props: Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  vv = new FakeVV();
  win = Object.assign(new Target(), { innerWidth: 844, innerHeight: 390, visualViewport: vv as FakeVV | null, scrollX: 0, scrollY: 0, scrollTo() {} });
  props = {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => void (props[k] = v) } } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 改尺寸（visualViewport 和 inner 一起，像真的转屏、地址栏收放） */
function size(w: number, h: number): void {
  vv.width = w;
  vv.height = h;
  win.innerWidth = w;
  win.innerHeight = Math.ceil(h);
}

describe('watchViewport', () => {
  const start = (o: Partial<Parameters<typeof watchViewport>[0]> = {}) => {
    const seen: Box[] = [];
    let settled = 0;
    const stop = watchViewport({ onChange: (b) => seen.push(b), onSettle: () => settled++, ...o });
    return { seen, stop, settled: () => settled };
  };

  it('开始先量一次', () => {
    const w = start();
    expect(w.seen).toEqual([{ x: 0, y: 0, w: 844, h: 390 }]);
  });

  it('① 放大中（scale 偏离 1 超过阈值）改尺寸不回调，补算到点也不回调', () => {
    const w = start();
    vv.scale = 1.5;
    size(563, 260);
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(w.seen).toHaveLength(1);
    expect(w.settled()).toBe(1);
  });

  it('② 缩回 1 倍后回调一次，量的是缩回后的尺寸', () => {
    const w = start();
    vv.scale = 1.5;
    size(563, 260);
    vv.dispatchEvent(new Event('resize'));
    vv.scale = 1;
    size(844, 340);
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(w.seen).toEqual([
      { x: 0, y: 0, w: 844, h: 390 },
      { x: 0, y: 0, w: 844, h: 340 },
    ]);
  });

  it('③ 转屏：先量一次；浏览器晚报的新尺寸在 settleMs 后补上', () => {
    const w = start({ settleMs: 300 });
    win.dispatchEvent(new Event('orientationchange'));
    expect(w.seen).toHaveLength(1);
    size(390, 844);
    vi.advanceTimersByTime(299);
    expect(w.seen).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(w.seen.at(-1)).toEqual({ x: 0, y: 0, w: 390, h: 844 });
    expect(w.settled()).toBe(1);
  });

  it('④ 判重：尺寸没变的 resize 不回调', () => {
    const w = start();
    for (let i = 0; i < 3; i++) win.dispatchEvent(new Event('resize'));
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(w.seen).toHaveLength(1);
    size(844, 340);
    win.dispatchEvent(new Event('resize'));
    win.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(w.seen).toHaveLength(2);
  });

  it('⑤ 取消监听后不再回调，监听器全部摘掉，等着的补算也取消', () => {
    const w = start();
    expect(win.count() + vv.count()).toBeGreaterThan(0);
    win.dispatchEvent(new Event('resize'));
    w.stop();
    expect(win.count()).toBe(0);
    expect(vv.count()).toBe(0);
    size(390, 844);
    win.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(w.seen).toHaveLength(1);
    expect(w.settled()).toBe(0);
  });

  it('listenScroll: false 不听 visualViewport 的 scroll', () => {
    start({ listenScroll: false });
    expect(vv.live.get('scroll') ?? 0).toBe(0);
    expect(vv.live.get('resize')).toBe(1);
  });

  it('⑥ --app-h 等于 visualViewport 高度取整；没有 visualViewport 时取 innerHeight', () => {
    vv.height = 339.6;
    start();
    expect(props['--app-h']).toBe('340px');
    vi.unstubAllGlobals();
    props = {};
    win.visualViewport = null;
    win.innerHeight = 412;
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => void (props[k] = v) } } });
    start();
    expect(props['--app-h']).toBe('412px');
  });
});

describe('onWebglLoss', () => {
  const canvas = (): Target & HTMLCanvasElement => new Target() as Target & HTMLCanvasElement;

  it('丢了 showAfterMs 才提示、恢复收起；同一时间一条', () => {
    const c = canvas();
    let shown = 0;
    let hidden = 0;
    onWebglLoss(c, { showAfterMs: 2000, show: () => { shown++; return () => void hidden++; } });
    c.dispatchEvent(new Event('webglcontextlost'));
    vi.advanceTimersByTime(1999);
    expect(shown).toBe(0);
    c.dispatchEvent(new Event('webglcontextlost'));
    vi.advanceTimersByTime(5000);
    expect(shown).toBe(1);
    c.dispatchEvent(new Event('webglcontextrestored'));
    expect(hidden).toBe(1);
  });

  it('页面离开时还丢着算放弃（giveUpOnHide）', () => {
    const c = canvas();
    let gave = 0;
    onWebglLoss(c, { show: () => {}, giveUpOnHide: true, onGiveUp: () => void gave++ });
    c.dispatchEvent(new Event('webglcontextlost'));
    win.dispatchEvent(new Event('pagehide'));
    expect(gave).toBe(1);
  });

  it('A4⑥ 取消监听后不再响应：画布和 window 上的监听都摘掉，等着的提示和放弃也取消', () => {
    const c = canvas();
    let shown = 0;
    let gave = 0;
    const stop = onWebglLoss(c, { showAfterMs: 2000, show: () => void shown++, giveUpMs: 5000, onGiveUp: () => void gave++ });
    c.dispatchEvent(new Event('webglcontextlost'));
    stop();
    expect(c.count()).toBe(0);
    expect(win.count()).toBe(0);
    vi.advanceTimersByTime(10_000);
    c.dispatchEvent(new Event('webglcontextlost'));
    vi.advanceTimersByTime(10_000);
    expect(shown).toBe(0);
    expect(gave).toBe(0);
  });
});
