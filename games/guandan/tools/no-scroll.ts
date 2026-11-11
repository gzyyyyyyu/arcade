/**
 * 一屏放下（仓库 docs/ui.md 第 11 节）：截图时量一遍，页面本身和每个看得见、能滚的元素都不许 scrollHeight 超过 clientHeight
 * （差 1 像素是取整，不算）。画布里的画面没法滚，量的是叠在上面的 DOM：好友房面板、kit 的弹层、出错面板。
 * tools/shot.ts、tools/online-smoke.ts、tools/stake-smoke.ts 每截一张图都调它和下面的 layoutIssuesOf，有一处就记成失败。
 */
import type { Page } from 'playwright-core';

export async function overflowsOf(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const de = document.scrollingElement ?? document.documentElement;
    // 和 clientHeight（布局视口）比，不用 innerHeight：冒烟模拟 iOS 工具栏遮挡时会把 innerHeight 改小
    if (de.scrollHeight > de.clientHeight + 1) out.push(`页面 ${de.scrollHeight} > 视口 ${de.clientHeight}`);
    for (const e of Array.from(document.body.querySelectorAll('*'))) {
      if (!(e instanceof HTMLElement) || e.closest('canvas, svg')) continue;
      const st = getComputedStyle(e);
      if (st.display === 'none' || st.visibility === 'hidden' || e.clientHeight === 0) continue;
      if (!/(auto|scroll)/.test(st.overflowY)) continue;
      if (e.scrollHeight > e.clientHeight + 1) {
        const name = e.id ? `#${e.id}` : e.className ? `.${String(e.className).split(' ')[0]}` : e.tagName.toLowerCase();
        out.push(`${name} ${e.scrollHeight} > ${e.clientHeight}`);
      }
    }
    return out;
  });
}

/**
 * 有意截断的字（省略号之类）：选择器 → 理由。量"裁字"时跳过，新加的要写清为什么允许截
 */
const CLIP_OK: Record<string, string> = {
  '#online .ol-seat .ol-nm': '好友房座位卡窄（斗地主三列），长昵称按省略号截，悬停看全名，"（你）"在截断外面',
};

/**
 * 不滚不等于排得下（海岛 11-02：竖屏底部按钮压在技能钮上、技能字被裁一截，量滚动全过）。截图时再量两样：
 * - 重叠：看得见、点得到的 DOM 控件（button、a、[role=button]、输入框）两两的包围盒不许相交，被弹层盖住的不算；
 *   画布里的读调试桥 hits()（已经去掉了整屏遮罩下面那层），也两两比；
 * - 裁字：DOM 里自己带字的元素 scrollWidth/scrollHeight 不许超出 clientWidth/clientHeight 1 像素以上（CLIP_OK 里登记的除外）。
 * 画布里的字没有"被裁"这回事可量（Phaser 的 Text 不裁，只会画出框外），这一项只覆盖 DOM。
 */
export async function layoutIssuesOf(page: Page): Promise<{ overlap: string[]; clip: string[] }> {
  return page.evaluate((clipOk) => {
    const overlap: string[] = [];
    const clip: string[] = [];
    const name = (e: Element): string => {
      const t = (e.textContent ?? '').trim().slice(0, 12) || e.getAttribute('aria-label') || '';
      const tag = e.id ? `#${e.id}` : e.className && typeof e.className === 'string' ? `.${e.className.split(' ')[0]}` : e.tagName.toLowerCase();
      return t ? `${tag}「${t}」` : tag;
    };
    const vis = (e: Element): DOMRect | null => {
      const st = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) <= 0.05) return null;
      if (b.width <= 0 || b.height <= 0 || b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) return null;
      return b;
    };
    const cross = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
    const dom: { e: Element; r: { x: number; y: number; w: number; h: number } }[] = [];
    for (const e of Array.from(document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, textarea'))) {
      const b = vis(e);
      if (!b) continue;
      // 被弹层盖住的点不到，不算：中心点最上面的得是它自己（或它里面的字）
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!top || !(top === e || e.contains(top))) continue;
      dom.push({ e, r: { x: b.left, y: b.top, w: b.width, h: b.height } });
    }
    for (let i = 0; i < dom.length; i++)
      for (let j = i + 1; j < dom.length; j++) {
        const a = dom[i]!;
        const b = dom[j]!;
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        if (cross(a.r, b.r)) overlap.push(`${name(a.e)} × ${name(b.e)}`);
      }
    const hits = window.__game?.hits() ?? [];
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++) {
        const a = hits[i]!;
        const b = hits[j]!;
        if (cross(a, b)) overlap.push(`画布 ${a.kind}@${Math.round(a.x)},${Math.round(a.y)} × ${b.kind}@${Math.round(b.x)},${Math.round(b.y)}`);
      }
    const okSel = Object.keys(clipOk);
    for (const e of Array.from(document.body.querySelectorAll('*'))) {
      if (!(e instanceof HTMLElement) || e.closest('canvas, svg, script, style')) continue;
      if (!Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
      if (!vis(e) || e.clientWidth === 0 || e.clientHeight === 0) continue;
      if (okSel.some((s) => e.matches(s))) continue;
      if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) clip.push(`${name(e)} ${e.scrollWidth}×${e.scrollHeight} > ${e.clientWidth}×${e.clientHeight}`);
    }
    return { overlap, clip };
  }, CLIP_OK);
}
