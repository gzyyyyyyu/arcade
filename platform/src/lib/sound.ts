/**
 * 大厅的点按声：按下按钮、链接时一声很轻的"嗒"，WebAudio 现场合成，不下载音频文件。
 * 可以关（页脚的"声音"），关掉记在 localStorage 的 `arcade.sound`（平台的 key 加 arcade. 前缀）。
 * 关着的时候连 AudioContext 都不建，保证一点声音都不出；开着时也等第一次按下才建（手机浏览器要用户先碰一下屏幕才放声音）。
 * 这个开关也管游戏：各游戏经 arcade-kit 的 platformSoundOn() 读同一个 key，大厅静音了进游戏也是静音的（游戏自己的开关另算）。
 * `arcade.sound` 的值是对游戏公开的约定：只有 'off'（静音）或者没有这个 key（开着），以后别改格式，改了游戏会读错。
 */
const KEY = 'arcade.sound';
const listeners = new Set<() => void>();
let on = readPref();
let ctx: AudioContext | null = null;

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    // 隐私模式等用不了 localStorage：照默认开着，只是记不住
    return true;
  }
}

export const soundOn = () => on;

/** 给 useSyncExternalStore 用 */
export function subscribeSound(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

export function setSoundOn(next: boolean) {
  try {
    if (next) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // 记不住就算了，这一页里照样按选的来
  }
  on = next;
  if (!next) {
    void ctx?.close();
    ctx = null;
  }
  for (const f of listeners) f();
  // 刚打开时响一声高一点的，让人知道开了
  if (next) tap(true);
}

/**
 * 拿到可用的 AudioContext；关着、不支持时给 null。无头浏览器（冒烟要确定）下提示音也给 null，
 * 只有点按声照建：冒烟靠数点按声建了几个 AudioContext 验"关了一点声音都不出"
 */
function audio(isTap: boolean): AudioContext | null {
  if (!on || (navigator.webdriver && !isTap)) return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Note = { at: number; hz: number; len: number; type?: OscillatorType; to?: number; vol?: number };

/** 按时间排好的几个音，音量都压在点按声的 1.5 倍以内（0.05 × 1.5） */
function play(notes: Note[], isTap = false) {
  try {
    const c = audio(isTap);
    if (!c) return;
    const t0 = c.currentTime;
    for (const n of notes) {
      const t = t0 + n.at;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.hz, t);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.len);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.min(n.vol ?? 0.05, 0.075), t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.len);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + n.len + 0.02);
    }
  } catch {
    // 声音出不来不影响任何操作
  }
}

/** 一声"嗒"：正弦波从高往低滑一点，50 毫秒左右收住；confirm 是打开声音时往上的一声 */
function tap(confirm = false) {
  // 音量压得很低：只是手指下的一点反馈，不吵
  play([confirm ? { at: 0, hz: 880, to: 1320, len: 0.12 } : { at: 0, hz: 700, to: 420, len: 0.05, vol: 0.035 }], true);
}

/** 进游戏：往上的两声"叮叮"（约 0.3 秒） */
export function playEnter() {
  play([
    { at: 0, hz: 660, len: 0.14, type: 'triangle' },
    { at: 0.12, hz: 990, len: 0.2, type: 'triangle' },
  ]);
}

/** 筹码进账：三下很快的高音"叮叮叮" */
export function playCoins() {
  play([
    { at: 0, hz: 1568, len: 0.08, type: 'square', vol: 0.025 },
    { at: 0.07, hz: 1976, len: 0.08, type: 'square', vol: 0.025 },
    { at: 0.14, hz: 2349, len: 0.16, type: 'square', vol: 0.025 },
  ]);
}

/** 成功：大三度的轻轻一响（C5 加 E5） */
export function playSuccess() {
  play([
    { at: 0, hz: 523, len: 0.35 },
    { at: 0.09, hz: 659, len: 0.4 },
  ]);
}

/** 出错：低低短短的"咚" */
export function playError() {
  play([{ at: 0, hz: 220, to: 130, len: 0.16, vol: 0.07 }]);
}

/** 整页只挂一个监听：按下能点的东西（没禁用的按钮、链接、页签、勾选框和它的字、下拉框）就响一声 */
export function installTapSound() {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!on || e.button !== 0) return;
      // 不用 :has：Chrome 105、Safari 15.4 以前不认，closest 会每按一下抛一次错
      const el = (e.target as Element | null)?.closest('a[href], button:not(:disabled), summary, [role="tab"], label, select:not(:disabled)');
      // 声音开关自己在打开时响确认的那一声
      if (!el || el.closest('[data-sound-toggle]')) return;
      if (el instanceof HTMLLabelElement && !(el.control && !(el.control as HTMLInputElement).disabled)) return;
      tap();
    },
    { capture: true, passive: true },
  );
  // 触屏的按下不算"用户碰过页面"，手机上第一声可能放不出来；抬起时把声音通道叫醒，下一次就有了
  document.addEventListener('pointerup', () => void (ctx?.state === 'suspended' && ctx.resume()), { capture: true, passive: true });
}
