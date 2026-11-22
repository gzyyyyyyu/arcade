import { isIOSSafari, isStandalone } from 'arcade-kit/viewport';

/** 0.5.9 iOS Safari 的开始菜单上提示「添加到主屏幕玩更大」（可见区适配本身在共用包 arcade-kit/viewport，见 main.ts） */
const TIP_KEY = 'kaipan.homeTip.off';
const TIP_ID = 'home-tip';

/**
 * 「添加到主屏幕玩更大」：只在 iOS Safari 的开始菜单上显示，点 × 关掉后不再出现（记在 kaipan.homeTip.off）。
 * 从主屏幕打开是全屏（index.html 里的 apple-mobile-web-app-capable），没有地址栏挡着。
 */
export function showHomeTip(): void {
  if (typeof document === 'undefined' || document.getElementById(TIP_ID)) return;
  // 已经从主屏幕打开的、App 里的浏览器、别家浏览器都不提示（它们加不了主屏幕）
  if (!isIOSSafari() || isStandalone()) return;
  try {
    if (localStorage.getItem(TIP_KEY) === '1') return;
  } catch {
    // 存储不可用：照常显示
  }
  const el = document.createElement('div');
  el.id = TIP_ID;
  el.style.cssText =
    'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 10px);transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:10px;' +
    'padding:8px 8px 8px 16px;border-radius:999px;background:rgba(40,32,24,.88);color:#fff8ec;white-space:nowrap;' +
    'font:600 14px/1.4 system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);';
  const text = document.createElement('span');
  text.textContent = '添加到主屏幕玩更大：点分享 → 「添加到主屏幕」';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '不再提示');
  close.style.cssText = 'width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff8ec;font:700 20px/1 system-ui;cursor:pointer;';
  close.addEventListener('click', () => {
    try {
      localStorage.setItem(TIP_KEY, '1');
    } catch {
      // 存不上：这次关掉就算了
    }
    el.remove();
  });
  el.append(text, close);
  document.body.appendChild(el);
}

export function hideHomeTip(): void {
  document.getElementById(TIP_ID)?.remove();
}
