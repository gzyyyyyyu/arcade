import type { World } from '../core/index.ts';

// ?fps：左下角显示每秒帧数和这一秒里最长的一帧（真机验收用；只在带参数时出现，不写存储）
export function mountFpsMeter(q: URLSearchParams, world: () => World | null): void {
  if (!q.has('fps')) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:max(6px,env(safe-area-inset-left,0px));bottom:max(6px,env(safe-area-inset-bottom,0px));z-index:99999;padding:2px 6px;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.6);border-radius:4px;pointer-events:none';
  document.body.appendChild(el);
  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let from = last;
  const tick = (now: number): void => {
    worst = Math.max(worst, now - last);
    last = now;
    frames++;
    if (now - from >= 1000) {
      el.textContent = `${Math.round((frames * 1000) / (now - from))} 帧/秒 · 最长 ${Math.round(worst)} ms · 怪 ${world()?.eCount ?? 0}`;
      frames = 0;
      worst = 0;
      from = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
