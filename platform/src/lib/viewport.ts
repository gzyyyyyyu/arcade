/**
 * 页面一屏高（docs/ui.md 第 11 节"一屏放下不用滚"）：外框的高度按看得见的区域算，写进 CSS 变量 --app-h。
 * CSS 里依次是 100vh → 100dvh → var(--app-h)：iOS Safari 的 100vh 是工具栏收起时的高度，横屏时顶上一截会被地址栏压住，
 * 所以由脚本按 visualViewport（没有就 innerHeight）补一个准的。双指放大时可见区是放大后的，不跟着改，缩回 1 倍再算；
 * 转屏后浏览器的尺寸要过一会儿才稳，稍等再补算一次。
 */
export function installViewportHeight(): void {
  const root = document.documentElement;
  const set = () => {
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) > 0.01) return;
    root.style.setProperty('--app-h', `${Math.round(vv?.height ?? window.innerHeight)}px`);
  };
  set();
  window.visualViewport?.addEventListener('resize', set);
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', () => {
    set();
    window.setTimeout(set, 300);
  });
}
