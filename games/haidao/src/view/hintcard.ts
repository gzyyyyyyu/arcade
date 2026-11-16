/**
 * 「第一次见到」的小提示卡：登陆战第一次见到某种防御（funui.ts）、守岛第一次来某种敌人（tdhud.ts）共用。
 * 一行一张图 + 名字 + 一句话，不挡操作：点一下或 4 秒后收起，场景关掉时一起收。见过的记在本地存储（JSON 数组）。
 */
import type Phaser from 'phaser';
import { parseSeen } from './battlehint.ts';
import { el } from './ui.ts';

export interface HintRow {
  icon: HTMLElement;
  name: string;
  text: string;
}

/** 挑出这次要提示的（pick 拿到已见集合），并把它们记成已见；存储不可用时当没见过、也不记 */
export function takeNew<T extends string>(key: string, pick: (seen: ReadonlySet<string>) => T[]): T[] {
  let seen = new Set<string>();
  try {
    seen = parseSeen(localStorage.getItem(key));
  } catch {
    // 存储不可用：当没见过，本局提示一次
  }
  const fresh = pick(seen);
  if (fresh.length === 0) return fresh;
  try {
    localStorage.setItem(key, JSON.stringify([...seen, ...fresh]));
  } catch {
    // 存储不可用：不记
  }
  return fresh;
}

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  el('style', '', `
.hd-ui .hd-defhint { position:absolute; left:50%; top:92px; transform:translateX(-50%); z-index:46; width:max-content; max-width:min(92%,420px); display:flex; flex-direction:column; gap:6px; padding:8px 12px; border-radius:14px; border:3px solid #2b1a15; background:#fff3d6; color:#2b1a15; box-shadow:0 3px 0 #2b1a15; animation:hd-pop .4s cubic-bezier(.2,1.5,.4,1); }
.hd-ui .hd-defhint div { display:flex; align-items:center; gap:8px; }
.hd-ui .hd-defhint b { font-size:16px; }
.hd-ui .hd-defhint span { font-size:14px; }
@media (prefers-reduced-motion: reduce) { .hd-ui .hd-defhint { animation:none; } }
`, document.head);
}

/** 弹一张提示卡（rows 为空不弹） */
export function hintCard(scene: Phaser.Scene, parent: HTMLElement, rows: readonly HintRow[], title?: string): void {
  if (rows.length === 0) return;
  style();
  const card = el('div', 'hd-defhint', undefined, parent);
  if (title) el('b', 'hd-defhint-t', title, card);
  for (const r of rows) {
    const row = el('div', '', undefined, card);
    row.appendChild(r.icon);
    const t = el('p', '', undefined, row);
    t.style.margin = '0';
    el('b', '', r.name, t);
    el('br', '', undefined, t);
    el('span', '', r.text, t);
  }
  const timer = setTimeout(() => card.remove(), 4000);
  card.addEventListener('pointerdown', () => {
    clearTimeout(timer);
    card.remove();
  });
  scene.events.once('shutdown', () => {
    clearTimeout(timer);
    card.remove();
  });
}
