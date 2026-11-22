/**
 * 进游戏、回大厅的过渡：点"进入游戏"时，那个游戏的封面从卡片上原地放大铺满屏幕（260ms），铺满后再跳转，
 * 游戏页加载的那一下看到的是封面而不是白屏；从游戏回到大厅时反过来，满屏的封面缩回那张卡片（220ms）。
 * 进去时在 sessionStorage `arcade.enterFx` 记下游戏 id、时间和当时的筹码总数（给顶栏筹码牌子的演出用，见 chips-fx.ts），回大厅时 30 分钟内的记录才播"缩回"，播完就删。
 * 减少动效、自动化浏览器下不播，直接跳；中键、Ctrl 开新标签页照常（不拦）。
 */
import { getLatestTotal } from './chips-fx.ts';
import { ENTER_FX_WITHIN_MS, ENTER_FX_KEY as KEY } from './chips-fx-logic.ts';
import { playEnter } from './sound.ts';

const ZOOM_MS = 260;
const BACK_MS = 220;

export const quiet = () => navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('no-motion');

/** 一张盖在最上层的封面，起止位置用 transform 算，只动 transform/opacity */
function overlay(src: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'enterfx';
  el.setAttribute('aria-hidden', 'true');
  el.style.backgroundImage = `url("${src}")`;
  document.body.append(el);
  return el;
}

/** 从满屏缩到某个矩形的 transform（满屏是 0,0 到视口大小） */
function toRect(r: DOMRect): string {
  return `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`;
}

type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean; preventDefault(): void };

/**
 * 卡片、横幅、"继续玩"小按钮点进游戏都走这里。cover 是要放大的那张封面图（找不到就只响一声再跳）。
 * 普通左键才拦；声音开着时响"叮叮"（sound.ts 的 playEnter 自己看开关）。
 */
export function enterGame(e: ClickLike, href: string, gameId: string, cover: Element | null): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ id: gameId, at: Date.now(), total: getLatestTotal() ?? undefined }));
  } catch {
    // 存不了就回来时不播
  }
  if (quiet()) return;
  e.preventDefault();
  playEnter();
  const img = cover instanceof HTMLImageElement ? cover : null;
  if (!img) {
    setTimeout(() => location.assign(href), 120);
    return;
  }
  const el = overlay(img.currentSrc || img.src);
  const from = toRect(img.getBoundingClientRect());
  const go = () => {
    location.assign(href);
    // 兜底：跳转没走成（被拦、很慢）或页面进了往返缓存，1 秒后把满屏封面拿掉，大厅不会一直被盖住
    setTimeout(() => el.remove(), 1_000);
  };
  el.animate([{ transform: from, borderRadius: '16px' }, { transform: 'none', borderRadius: '0' }], { duration: ZOOM_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' })
    .finished.then(go, go);
}

/** 拿掉页面上所有过渡层 */
function clearOverlays(): void {
  for (const el of document.querySelectorAll('.enterfx')) el.remove();
}

/**
 * 大厅挂上时调一次，返回卸载函数。除了刚画好时看一次要不要播"缩回"，还要管浏览器的后退：
 * 从游戏按后退时大厅是从往返缓存（bfcache）原样恢复的，进游戏时那张满屏封面还在、React 的 effect 也不会重跑，
 * 所以在 pageshow（persisted）时先拿掉残留的封面，再按记录播一次缩回。
 */
export function watchBackFx(findCover: (gameId: string) => Element | null): () => void {
  playBackFx(findCover);
  const onShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return;
    clearOverlays();
    playBackFx(findCover);
  };
  addEventListener('pageshow', onShow);
  return () => removeEventListener('pageshow', onShow);
}

/** 读出并删掉进游戏时的记录；坏数据、存不了都当没有 */
function takeRecord(): { id: string; at: number } | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { id?: unknown; at?: unknown } | null;
    sessionStorage.removeItem(KEY);
    return raw && typeof raw.id === 'string' && typeof raw.at === 'number' ? { id: raw.id, at: raw.at } : null;
  } catch {
    return null;
  }
}

/** 刚从某个游戏回来就播一次"封面缩回卡片"。找不到那张卡（比如滚到别处、游戏下架）就不播 */
function playBackFx(findCover: (gameId: string) => Element | null): void {
  const rec = takeRecord();
  if (!rec || Date.now() - rec.at > ENTER_FX_WITHIN_MS || quiet()) return;
  const img = findCover(rec.id);
  if (!(img instanceof HTMLImageElement)) return;
  const r = img.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  const el = overlay(img.currentSrc || img.src);
  el.animate([{ transform: 'none', opacity: 1 }, { transform: toRect(r), opacity: 0.6, offset: 0.85 }, { transform: toRect(r), opacity: 0 }], {
    duration: BACK_MS,
    easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
    fill: 'forwards',
  }).finished.then(() => el.remove(), () => el.remove());
}
