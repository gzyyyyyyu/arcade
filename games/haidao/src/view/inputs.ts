import type Phaser from 'phaser';
import { el } from './ui.ts';

/**
 * 电脑上的键盘操作（每个场景绑一次，场景关掉自动解绑）：Esc 取消 / 关面板，空格回全景，数字键 1–9 选第 n 个按钮（再多的按钮用字母键，走 key）；
 * 其他键交给 key（基地的字母快捷键），返回 true 表示用掉了（不再往下传）。在输入框里打字时不响应。
 */
export function bindKeys(scene: Phaser.Scene, h: { esc(): void; space(): void; digit(n: number): void; key?(k: string): boolean }): void {
  const on = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') h.esc();
    else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      h.space();
    } else if (/^[1-9]$/.test(e.key)) h.digit(Number(e.key));
    else if (!e.repeat && h.key?.(e.key)) e.preventDefault();
  };
  window.addEventListener('keydown', on);
  scene.events.once('shutdown', () => window.removeEventListener('keydown', on));
}

/** 按钮右上角的小数字（只在有鼠标的电脑上显示，样式在 layout.ts）：提示按几号键 */
export function keyBadge(btn: HTMLElement, n: number | string): void {
  btn.dataset.key = String(n);
  el('kbd', 'hd-key', String(n), btn);
}

/** 点第 i 个（0 起）可点的按钮；按钮不存在、不可点（disabled、display:none）就什么也不做 */
export function pressNth(list: ArrayLike<Element>, i: number): void {
  const b = list[i] as HTMLElement | undefined;
  if (b && !(b as HTMLButtonElement).disabled && b.offsetParent !== null) b.click();
}
