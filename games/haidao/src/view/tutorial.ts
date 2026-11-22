import { app } from './app.ts';
import { button, el } from './ui.ts';

/**
 * 新手引导：气泡 + 高亮框 + 箭头，每步一句大白话，随时可以"跳过"。
 * 步数记在 Profile.tutorial：
 *   0 收金币  1 建金库  2 看主寨升级  3 看船队  4 出海  5 战斗里登陆/放炮  6 回家升级  7 去训练营看看  8 完成
 * 场景负责判断"现在该指哪"（show / hide），本文件只管画。演示局（volatile）一律视作已完成。
 */
export const TUT_DONE = 8;
/** 出海那一段带完了（海图不再按引导藏旗和出发钮；老玩家开档直接到这一步，还会被指一次训练营） */
export const TUT_SAILED = 7;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function tutStep(): number {
  return app.volatile ? TUT_DONE : app.profile.tutorial;
}

/** 只往前走 */
export function tutSet(n: number): void {
  if (app.volatile || app.profile.tutorial >= n) return;
  app.commit({ ...app.profile, tutorial: n });
}

/** 正好在第 from 步时前进一步 */
export function tutAdv(from: number): void {
  if (tutStep() === from) tutSet(from + 1);
}

/** 元素在界面根节点里的位置（CSS 像素） */
export function rectOf(e: Element | null, root: HTMLElement): Rect | null {
  if (!e) return null;
  const a = e.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  if (a.width === 0 && a.height === 0) return null;
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
}

export class Tutorial {
  private ring: HTMLElement;
  private tip: HTMLElement;
  private txt: HTMLElement;
  private arrow: HTMLElement;
  private target: (() => Rect | null) | null = null;
  private raf = 0;
  private shown = false;
  private key = '';
  private ins: { top: number; bottom: number; left: number; right: number } | null = null;
  private insAt = 0;

  private readonly root: HTMLElement;

  /** skip：横幅上那个钮换成别的字和动作（训练营的「跳过提示」）；没给 = 「跳过引导」，跳过整个新手引导 */
  constructor(root: HTMLElement, skip?: { label: string; onSkip: () => void }) {
    this.root = root;
    this.ring = el('div', 'hd-tut-ring', undefined, root);
    this.arrow = el('div', 'hd-tut-arrow', undefined, root);
    this.tip = el('div', 'hd-tut-tip', undefined, root);
    this.txt = el('p', '', '', this.tip);
    button(skip?.label ?? '跳过引导', 'hd-btn-plain', () => {
      if (skip) skip.onSkip();
      else tutSet(TUT_DONE);
      this.hide();
    }, this.tip);
    this.hide();
  }

  show(key: string, text: string, target: (() => Rect | null) | null): void {
    this.target = target;
    if (key !== this.key) {
      this.key = key;
      this.ins = null;
      this.txt.textContent = text;
      // 换一步时横幅重新淡入一下：瞬间换字看不出「下一步变了」
      this.tip.classList.remove('hd-tut-new');
      void this.tip.offsetWidth;
      this.tip.classList.add('hd-tut-new');
    }
    if (!this.shown) {
      this.shown = true;
      this.tip.style.display = '';
      this.loop();
    }
  }

  hide(): void {
    this.shown = false;
    this.key = '';
    cancelAnimationFrame(this.raf);
    this.ring.style.display = 'none';
    this.arrow.style.display = 'none';
    this.tip.style.display = 'none';
  }

  destroy(): void {
    this.hide();
    this.ring.remove();
    this.arrow.remove();
    this.tip.remove();
  }

  private loop = (): void => {
    if (!this.shown) return;
    this.place();
    this.raf = requestAnimationFrame(this.loop);
  };

  /**
   * 顶栏、底栏和两侧竖排占掉的地方：横幅停在它们外面。横幅每帧跟目标走，可这些栏不会每帧变，
   * 量一次要查一遍 DOM 再逐个读布局，缓存 200 毫秒（换一步时 show 清掉缓存）
   */
  private insets(): { top: number; bottom: number; left: number; right: number } {
    const now = performance.now();
    if (this.ins && now - this.insAt < 200) return this.ins;
    this.insAt = now;
    this.ins = this.measure();
    return this.ins;
  }

  private measure(): { top: number; bottom: number; left: number; right: number } {
    const root = this.root.getBoundingClientRect();
    let top = 56;
    for (const e of this.root.querySelectorAll('.hd-bar, .hd-bar2, .hd-hall, .hd-mute')) {
      const b = e.getBoundingClientRect();
      // 只算贴在屏幕上部的（战斗竖屏里加速 / 撤退排在底部技能行，不算顶栏）
      if (b.width > 0 && b.top - root.top < root.height * 0.3) top = Math.max(top, b.bottom - root.top);
    }
    let bottom = root.height;
    let left = 0;
    let right = root.width;
    for (const e of this.root.querySelectorAll('.hd-bottom, .hd-cards, .hd-place, .hd-sheet, .hd-bounty, .hd-mapcard, .hd-map-close, .hd-map-home, .hd-fitbtn, .hd-claimfab')) {
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // 浮在底栏正上方的「一键收取」：横幅停在它上面，不盖住它（手机横屏它贴在右侧竖排旁边，按竖排让）
      if (e.classList.contains('hd-claimfab') && b.top - root.top > root.height * 0.5) {
        bottom = Math.min(bottom, b.top - root.top);
        continue;
      }
      // 手机横屏的底栏挪到右侧竖排：窄的不算底部（和镜头适配 measureInsets 同一口径），否则底部像是没地方，横幅只能停顶上压住目标
      if (b.width > root.width * 0.5) bottom = Math.min(bottom, b.top - root.top);
      // 贴边的竖排（横屏的兵种卡和技能列、海图左上的悬赏和航线卡、海图右上的「回岛」「找下一关」、右上的「全景」）：横幅左右让开，免得盖住引导要你点的那个钮
      else if (b.left - root.left > root.width * 0.6) right = Math.min(right, b.left - root.left - 8);
      else if (b.right - root.left < root.width * 0.4) left = Math.max(left, b.right - root.left + 8);
    }
    return { top, bottom, left, right };
  }

  /**
   * 停靠式：横幅停在屏幕顶部（顶栏下）或底部（底栏上），永远不压在岛上；
   * 目标在下半屏就停顶部，在上半屏就停底部。高亮框框住目标，箭头在框靠横幅的一侧指向目标。
   */
  private place(): void {
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    const r = this.target?.() ?? null;
    const { top: topInset, bottom: botInset, left: l0, right: r0 } = this.insets();
    // 宽度跟着字走（字和「跳过引导」一行），最宽 560，左右让开竖排；让完太窄（< 240）就不让
    const room = r0 - l0 >= 240 ? [l0, r0] : [0, W];
    const maxW = Math.min(room[1]! - room[0]! - 16, 560);
    this.tip.style.maxWidth = `${maxW}px`;
    const tw = Math.min(this.tip.offsetWidth || maxW, maxW);
    this.tip.style.left = `${room[0]! + (room[1]! - room[0]! - tw) / 2}px`;
    const th = this.tip.offsetHeight || 60;
    const atTop = !r || r.y + r.h / 2 >= H * 0.5;
    this.tip.style.top = `${atTop ? topInset + 6 : Math.max(topInset + 6, botInset - th - 6)}px`;
    if (!r) {
      this.ring.style.display = 'none';
      this.arrow.style.display = 'none';
      return;
    }
    const pad = 6;
    this.ring.style.display = '';
    this.ring.style.left = `${r.x - pad}px`;
    this.ring.style.top = `${r.y - pad}px`;
    this.ring.style.width = `${r.w + pad * 2}px`;
    this.ring.style.height = `${r.h + pad * 2}px`;
    this.arrow.style.display = '';
    this.arrow.style.left = `${r.x + r.w / 2 - 12}px`;
    this.arrow.style.borderLeftColor = 'transparent';
    if (r.x > W * 0.75) {
      // 目标在右侧竖排（手机横屏的底栏）：箭头放在框左边、尖朝右，上下放会压住相邻的钮
      this.arrow.style.left = `${r.x - pad - 24}px`;
      this.arrow.style.top = `${r.y + r.h / 2 - 12}px`;
      this.arrow.style.borderLeftColor = '#2b1a15';
      this.arrow.style.borderTopColor = 'transparent';
      this.arrow.style.borderBottomColor = 'transparent';
    } else if (atTop) {
      // 横幅在上：箭头在框上方，尖朝下
      this.arrow.style.top = `${r.y - pad - 24}px`;
      this.arrow.style.borderTopColor = '#2b1a15';
      this.arrow.style.borderBottomColor = 'transparent';
    } else {
      this.arrow.style.top = `${r.y + r.h + pad}px`;
      this.arrow.style.borderBottomColor = '#2b1a15';
      this.arrow.style.borderTopColor = 'transparent';
    }
    // 目标在一排挨着的钮里（建造列表的卡）：箭头无论放哪边都压在隔壁钮的字上，只留光圈
    const o = this.root.getBoundingClientRect();
    const under = document.elementFromPoint(o.left + this.arrow.offsetLeft + 12, o.top + this.arrow.offsetTop + 12);
    if (under?.closest('button')) this.arrow.style.display = 'none';
  }
}
