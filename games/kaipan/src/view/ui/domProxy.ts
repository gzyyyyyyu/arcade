import type Phaser from 'phaser';
import { OVERLAY_FLAG } from './dialog.ts';

/**
 * 画布里的按钮在 DOM 里的"影子"：一个完全透明的 <button>，盖在画布按钮上。
 * 画布按钮读屏软件和自动化找不到（先做「大厅」）；影子点下去等于点了画布按钮（走 Button.press，流程不另写）。
 * 只在画布按钮点得到、且没有对话框盖着的时候出现，所以不会点穿；Tab 能聚焦，聚焦时有描边。
 */

const CLS = 'kaipan-dom-proxy';
const STYLE_ID = 'kaipan-dom-proxy-style';
const CSS = `
button.${CLS} { all: unset; box-sizing: border-box; position: fixed; z-index: 5; background: transparent; opacity: 0; cursor: pointer !important; }
button.${CLS}:focus-visible { opacity: 1; outline: 3px solid #3a86ff; outline-offset: 2px; border-radius: 10px; }
button.${CLS}[hidden] { display: none; }
`;

import { HIT_MIN } from './button.ts';
import { atLeast, worldToPage, type Box } from './domProxyGeo.ts';

/** 画布按钮要有这两样 */
interface Proxied {
  rect(): Box;
  isEnabled(): boolean;
  press(): boolean;
  /** 影子盖住了画布按钮，画布收不到鼠标进出：由影子转给按钮，悬停才会亮 */
  setHover?(on: boolean): unknown;
}

/** 给画布按钮配一个 DOM 影子；场景关掉时一起删。没有 document（单测）时什么都不做。 */
export function attachDomProxy(scene: Phaser.Scene, btn: Proxied, label: string): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null;
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement('button');
  el.type = 'button';
  el.className = CLS;
  el.setAttribute('aria-label', label);
  el.hidden = true;
  el.addEventListener('click', () => {
    btn.press();
  });
  el.addEventListener('mouseenter', () => btn.setHover?.(true));
  el.addEventListener('mouseleave', () => btn.setHover?.(false));
  document.body.appendChild(el);
  const sync = (): void => {
    const canvas = scene.game.canvas;
    const on = scene.sys.isActive() && !scene.data.get(OVERLAY_FLAG) && btn.isEnabled();
    if (!canvas || !on) {
      el.hidden = true;
      return;
    }
    const cr = canvas.getBoundingClientRect();
    const g = scene.scale.gameSize;
    const cam = scene.cameras.main;
    // 触屏上影子按钮至少 44 CSS 像素见方（docs/ui.md：触屏可点区域 ≥ 44）；画布按钮在小屏上缩到 37 高也照样好点
    const p = atLeast(worldToPage(btn.rect(), cam, { x: cr.left, y: cr.top, w: cr.width, h: cr.height }, { w: g.width, h: g.height }), HIT_MIN > 0 ? 44 : 0);
    el.hidden = false;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.width = `${p.w}px`;
    el.style.height = `${p.h}px`;
  };
  scene.events.on('postupdate', sync);
  scene.events.once('shutdown', () => {
    scene.events.off('postupdate', sync);
    el.remove();
  });
  scene.events.once('destroy', () => el.remove());
  return el;
}
