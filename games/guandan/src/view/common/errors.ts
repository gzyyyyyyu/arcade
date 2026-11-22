/**
 * 全局错误兜底：未捕获的异常不留白屏，弹一个独立于 Phaser 的 DOM 面板：继续 / 重新载入 / 放弃存档重开（危险色，点两下）。
 * 最近 20 条错误记在 localStorage（guandan.errors），方便排查。
 */
import { clearSave, rememberError } from '../store.ts';
import { NET_DOWN, RETRY_LABEL } from './stake-text.ts';
import { mountThemeCss } from './theme.ts';

let panel: HTMLElement | null = null;

function isNoise(message: string, filename?: string): boolean {
  if (filename && !filename.startsWith(location.origin) && !filename.startsWith('blob:')) return true;
  return /ResizeObserver loop|Script error\.?$/i.test(message);
}

/** 断网造成的错误（fetch 失败、分块脚本没下载下来，或浏览器自己说离线）：说统一的一句话，主按钮是"重试" */
function isNetworkError(message: string): boolean {
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /Failed to fetch|NetworkError|Load failed|Network request failed|dynamically imported module|Importing a module script failed/i.test(message);
}

export function showErrorPanel(err: unknown): void {
  const e = err instanceof Error ? err : new Error(String(err));
  rememberError({ time: new Date().toISOString(), message: e.message, stack: e.stack ?? '', version: __APP_VERSION__ });
  if (panel) return;
  document.getElementById('boot')?.remove();
  const el = document.createElement('div');
  el.id = 'error-panel';
  const net = isNetworkError(e.message);
  // 英文原文只进 guandan.errors（rememberError），不给玩家看（docs/ui.md 第 6 节）。
  // 一个主按钮：断网时是"重试"，否则是"继续"；删存档是危险色、单独一行，点两下才删
  el.innerHTML = `
    <div class="ep-card" role="alertdialog" aria-labelledby="ep-title">
      <b id="ep-title">${net ? NET_DOWN : '哎呀，出了点小问题'}</b>
      <span>进度已经自动保存，${net ? `网络好了点"${RETRY_LABEL}"就行` : '一般点"继续"就好'}。</span>
      <div class="ep-row">
        ${net ? `<button type="button" class="gd-btn" data-act="reload">${RETRY_LABEL}</button>` : ''}
        <button type="button" class="gd-btn${net ? ' gd-2' : ''}" data-act="go">继续</button>
        ${net ? '' : '<button type="button" class="gd-btn gd-2" data-act="reload">重新载入</button>'}
      </div>
      <button type="button" class="gd-btn gd-danger ep-reset" data-act="reset">放弃存档重开</button>
    </div>`;
  el.addEventListener('click', (ev) => {
    const act = (ev.target as HTMLElement).getAttribute('data-act');
    if (act === 'go') {
      el.remove();
      panel = null;
    } else if (act === 'reload') location.reload();
    else if (act === 'reset') {
      const b = ev.target as HTMLElement;
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = '再点一次：删掉存档重开';
        return;
      }
      clearSave();
      location.reload();
    }
  });
  document.body.appendChild(el);
  panel = el;
}

/** 关掉兜底面板（问题自己好了，比如 WebGL 画面恢复了） */
export function hideErrorPanel(): void {
  panel?.remove();
  panel = null;
}

export function installErrorHandler(): void {
  mountThemeCss();
  const style = document.createElement('style');
  style.textContent = `
#error-panel { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center;
  background: rgba(10, 6, 4, 0.72); font: 16px/1.6 var(--gd-font); }
#error-panel .ep-card { max-width: 420px; margin: var(--gd-s4); padding: var(--gd-s6); border-radius: var(--gd-r-lg); background: var(--gd-paper);
  border: 5px solid var(--gd-wood); box-shadow: 0 0 0 2px var(--gd-gold) inset; color: var(--gd-ink); display: flex; flex-direction: column; gap: var(--gd-s3); }
#error-panel b { font-size: 22px; color: var(--gd-red); }
#error-panel .ep-row { display: flex; gap: var(--gd-s2); flex-wrap: wrap; }
#error-panel .ep-row .gd-btn { flex: 1; min-width: 96px; }
#error-panel .ep-reset { width: 100%; }`;
  document.head.appendChild(style);
  window.addEventListener('error', (ev) => {
    if (isNoise(ev.message ?? '', ev.filename)) return;
    showErrorPanel(ev.error ?? ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => showErrorPanel(ev.reason));
}
