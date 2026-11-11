/**
 * 本机存档（localStorage `haidao.save` = { profile, lastSeen }）。存储不可用（隐私模式、满了）时照常能玩，只是不记得。
 * 格式和校验在 sync.ts（云存档共用）；每次写完调 saveHooks.onWrite，main 在那里通知云存档。
 */
import { fresh, reviveSave, type Save } from './sync.ts';

export const SAVE_KEY = 'haidao.save';
export const saveHooks: { onWrite?: () => void } = {};

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = reviveSave(JSON.parse(raw));
      if (s) return s;
    }
  } catch {
    // 读不到或坏了：当新档
  }
  return fresh();
}

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // 存不上：这次不记
  }
  saveHooks.onWrite?.();
}
