/**
 * 看得见的区域（仓库根 AGENTS.md 第 4 节，手机用 arcade-kit/viewport）：
 * - kit 量可见区（visualViewport，带 Safari 工具栏的偏移）、写 --app-h（CSS 先写 100vh → 100dvh 兜底）、
 *   转屏和收放地址栏后重算并在稍后补算一次、双指放大时不动（阈值用 kit 的默认）；
 * - 这里只管舞台：按 app 的矩形用 layout.fit 缩放，写舞台的尺寸、类名和 CSS 变量；safe-area 由 CSS 的 env(safe-area-inset-*, 0px) 让出来。
 * 牌桌是 DOM + CSS，没有画布和 WebGL，"画布倍数封顶 2""WebGL 上下文丢失"那两条不适用（docs/screens.md 8.1）。
 */
import { watchViewport as watchVisible } from 'arcade-kit/viewport';
import { fit, type Geo } from './layout.ts';

export interface Fit extends Geo {
  scale: number;
}

export function watchViewport(app: HTMLElement, stage: HTMLElement, onFit: (f: Fit) => void): () => Fit {
  let last: Fit = { w: 960, h: 540, tall: false, scale: 1 };

  const measure = (): void => {
    // 舞台放在去掉 safe-area 以后的区域里
    const r = app.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const f = fit(r.width, r.height);
    if (Math.abs(f.w - last.w) < 0.5 && Math.abs(f.h - last.h) < 0.5 && f.tall === last.tall && Math.abs(f.scale - last.scale) < 0.001) return;
    last = f;
    stage.style.width = `${f.w}px`;
    stage.style.height = `${f.h}px`;
    // 操作区按舞台宽度限宽（style.css 的 .actions .odds/.quick）
    stage.style.setProperty('--stage-w', `${f.w}px`);
    // 竖屏：手机竖着拿，换竖的牌桌（style.css 的 .stage.tall、layout.ts 的竖屏位置）
    stage.classList.toggle('tall', f.tall);
    stage.style.transform = `translate(-50%, -50%) scale(${f.scale})`;
    // 一个屏幕像素合几个设计单位（大屏是 1）：小字的下限、触屏按钮能点的范围按它放大（style.css 的 --fs-1..3、--hit）。
    // 写在根上，根上那几个变量才算得到
    document.documentElement.style.setProperty('--ui', Math.max(1, 1 / f.scale).toFixed(3));
    // 手机横屏（缩到 0.9 倍以下）：字和按钮放大以后标题页放不下，换紧凑的排法（style.css 的 .stage.tight）
    stage.classList.toggle('tight', f.scale < 0.9);
    // 舞台收到 900 以下（平板竖拿、4:3）：牌桌左下那一排放不下，收窄（style.css 的 .stage.narrow）
    stage.classList.toggle('narrow', !f.tall && f.w < 900);
    onFit(f);
  };
  // kit 写好 --app-h 再回调：这时量到的 app 已经是新的大小；补算那一下不管可见区变没变都再量一次（转屏后 app 晚到）
  watchVisible({ onChange: measure, onSettle: measure });
  return () => last;
}
