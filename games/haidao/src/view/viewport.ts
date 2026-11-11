/**
 * 手机和平板（尤其 iOS）的规矩（仓库根 AGENTS.md 第 4 节，做法照开盘 0.5.9）：
 * 渲染倍数封顶 2；高度按看得见的区域算（--app-h）；双指放大时不改尺寸。
 */

/** iOS（含报成 Mac 的 iPad）和触屏手机平板；?lowmem 强制（冒烟用） */
export const LOW_MEMORY = ((): boolean => {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('lowmem')) return true;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios || !!window.matchMedia?.('(pointer: coarse)').matches;
})();

/** 手机平板画布渲染倍数的上限（见 renderScale） */
export const PHONE_RS_CAP = 1.5;

/** 画布的渲染倍数：按 devicePixelRatio，最多 2（电脑上 3 倍也没有看得出的好处，省显存）；手机平板另有 PHONE_RS_CAP。?rs=<1–3> 强制（帧率 A/B 测量用） */
export function renderScale(): number {
  const force = Number(new URLSearchParams(window.location.search).get('rs'));
  if (force >= 1 && force <= 3) return force;
  return Math.max(1, Math.min(LOW_MEMORY ? PHONE_RS_CAP : 2, window.devicePixelRatio || 1));
}

/** 双指放大着（visualViewport.scale 明显不是 1） */
export function zoomed(scale: number | undefined): boolean {
  return scale !== undefined && Math.abs(scale - 1) > 0.02;
}

/** 写 --app-h（看得见的高度），尺寸变化时通知；转屏后稍等再补算一次。双指放大时不动。返回取消监听的函数 */
export function fitViewport(onFit: () => void): () => void {
  const root = document.documentElement;
  let last = '';
  const apply = (): void => {
    if (zoomed(window.visualViewport?.scale)) return;
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    const size = `${w}x${h}`;
    if (size === last) return;
    last = size;
    root.style.setProperty('--app-h', `${h}px`);
    onFit();
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = (): void => {
    apply();
    if (timer) clearTimeout(timer);
    timer = setTimeout(apply, 300);
  };
  apply();
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  window.visualViewport?.addEventListener('resize', later);
  return () => {
    window.removeEventListener('resize', later);
    window.removeEventListener('orientationchange', later);
    window.visualViewport?.removeEventListener('resize', later);
    if (timer) clearTimeout(timer);
  };
}
