/**
 * 设置的读写（纯逻辑，tests/settings.test.ts 锁住）：存在 localStorage 的 `haidao.settings`。
 * 音乐（环境声）和音效分开；旧版只有一个 `muted`，没有新字段时 muted=true 当作两个都关。
 * 写回时保留不认识的字段，并同步写 `muted`（两个都关才算静音），回退到旧版也不会突然出声。
 * 震屏和振动开关仍在 `haidao.feel`（feel.ts，默认跟随系统的"减弱动态效果"）。
 */
export const SETTINGS_KEY = 'haidao.settings';

export interface Settings {
  music: boolean;
  sfx: boolean;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = { music: true, sfx: true };

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function readObject(store: Store | null): Record<string, unknown> {
  try {
    const raw = store?.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const o: unknown = JSON.parse(raw);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
  } catch { /* 坏数据、隐私模式：当作没存过 */ }
  return {};
}

export function parseSettings(o: Record<string, unknown>): Settings {
  const legacyMuted = o.muted === true;
  return {
    music: typeof o.music === 'boolean' ? o.music : !legacyMuted,
    sfx: typeof o.sfx === 'boolean' ? o.sfx : !legacyMuted,
  };
}

export function loadSettings(store: Store | null = defaultStore()): Settings {
  return parseSettings(readObject(store));
}

export function saveSettings(s: Settings, store: Store | null = defaultStore()): void {
  try {
    const o = readObject(store);
    o.music = s.music;
    o.sfx = s.sfx;
    o.muted = !s.music && !s.sfx;
    store?.setItem(SETTINGS_KEY, JSON.stringify(o));
  } catch { /* 写不进去只是下次不记得 */ }
}

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
