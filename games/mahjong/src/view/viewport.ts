/**
 * 看得见的区域（仓库根 docs/ui.md 手机一节，DESIGN.md 第 7 节）：量可见区、写 --app-h、转屏后补算、双指放大时不动都用 kit 的 watchViewport
 * （CSS 先写 100vh → 100dvh，再由 kit 写 --app-h）；这里只管舞台怎么缩放：
 * - 舞台是设计尺寸（横屏 1000×560、竖屏 560×1120），按看得见的区域等比缩放，safe-area 由 CSS 让出来；
 *   竖屏的高度跟着屏幕比例在 920–1240 之间变（中间那一截上下挪，CSS 用 --cut，高过 1120 时是负数），
 *   不然 iPhone SE 工具栏展开时（约 375×553）按 1120 高缩到 0.49 倍，两边留黑、手牌只有 18 像素宽；现在约 0.6 倍。
 *   上限以前是 1120，390×844 这类长屏上下各留 32 像素黑边（0.18.0 手机专项）；1240 盖住 19.5:9 的手机。
 *   竖屏的宽度也能在 560–700 之间变：iPad 竖着拿（820×1180）高到下限 920 还宽，以前左右各留 51 像素黑边，现在舞台铺满、牌桌 560 宽居中。
 * 横屏的宽度也跟着屏幕比例在 1000–1500 之间变（高按 560 缩放）：电脑宽屏（1920×911 约 2.1:1）以前两边各留一条深色空边，
 *   现在舞台铺满；牌桌本身还是 1000 宽的几何、居中（css/table-layout.css），多出来的是同一块呢子，选桌页按宽度排两栏。
 * 电脑版（横屏、看得见的区域不小于 900×600，`data-fit="desk"`）：舞台高也跟着屏幕比例在 640–700 之间变（`--grow` = 比 560 高出多少），
 *   16:10、16:9 铺满、不留上下黑边；多出来的高度和宽度给牌河放大、中控盘、牌桌宽到 1200（css/table-layout.css 的电脑版一节）。手机横屏（高不到 600）还是 560 高。
 * 牌桌是 DOM + SVG，没有画布和 WebGL，"渲染倍数封顶 2""WebGL 上下文丢失"那两条不适用。
 */
import { watchViewport } from 'arcade-kit/viewport';

type Orient = 'land' | 'port';

const STAGE: Record<Orient, { w: number; h: number }> = { land: { w: 1000, h: 560 }, port: { w: 560, h: 1120 } };
/** 竖屏舞台最矮多少：对家贴顶、自己贴底，中间最多让出 200（再矮牌河就碰到对家的副露、自己的头像） */
const PORT_MIN_H = 920;
/** 竖屏舞台最高多少：再高上下牌河离中控盘太远 */
const PORT_MAX_H = 1240;
/** 竖屏舞台最宽多少：牌桌 560 宽居中，两边露板壁 */
const PORT_MAX_W = 700;
/** 竖屏舞台高到这个数，自己的手牌摆成两排、每张放大（css/table-layout.css 的两排手牌一节）：一排 14 张在 560 宽里最多 37，屏幕上只有约 26 像素；
 * 再矮（iPhone SE 工具栏展开这类）中间那一截让不出两排的高度，牌河会挤得太小，还是一排 */
const PORT_TWO_ROW_H = 1000;
/** 横屏舞台最宽多少：再宽牌桌两边的空呢子太多，按高缩放后两边留边 */
const LAND_MAX_W = 1500;
/** 电脑和平板（横屏、看得见的区域够大）舞台高的范围：高跟着屏幕比例变，16:10、16:9 都铺满不留黑边，牌河、中控盘才有地方放大 */
const DESK_MIN_H = 640;
const DESK_MAX_H = 700;
/** 横屏舞台的基础高度：--grow（舞台比它高出多少）让牌桌中间一截往下挪、牌河放大（css/table-layout.css 的电脑版一节） */
const LAND_BASE_H = 560;

export function fitStage(app: HTMLElement, stage: HTMLElement): void {
  let orient: Orient | null = null;
  let scale = 0;
  let height = 0;
  let width = 0;
  const measure = (): void => {
    const r = app.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    // 竖屏且明显窄（手机竖着拿）用竖屏布局，其余都用横屏
    const o: Orient = r.height > r.width * 1.15 ? 'port' : 'land';
    const st = STAGE[o];
    // 电脑版：横屏且看得见的区域不是手机那么矮；手机横屏（高不到 600）还是原来的 560 高
    const desk = o === 'land' && r.height >= 600 && r.width >= 900;
    const h =
      o === 'port'
        ? Math.round(Math.min(PORT_MAX_H, Math.max(PORT_MIN_H, (st.w * r.height) / r.width)))
        : desk
          ? Math.round(Math.min(DESK_MAX_H, Math.max(DESK_MIN_H, (st.w * r.height) / r.width)))
          : st.h;
    const w =
      o === 'land'
        ? Math.round(Math.min(LAND_MAX_W, Math.max(st.w, (h * r.width) / r.height)))
        : Math.round(Math.min(PORT_MAX_W, Math.max(st.w, (h * r.width) / r.height)));
    const s = Math.min(r.width / w, r.height / h);
    const fit = desk ? 'desk' : '';
    if (o === orient && fit === (stage.dataset.fit ?? '') && h === height && w === width && Math.abs(s - scale) < 0.001) return;
    scale = s;
    height = h;
    width = w;
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.setProperty('--cut', `${st.h - h}px`);
    stage.style.setProperty('--grow', `${o === 'land' ? h - LAND_BASE_H : 0}px`);
    if (desk) stage.dataset.fit = 'desk';
    else delete stage.dataset.fit;
    if (o === 'port' && h >= PORT_TWO_ROW_H) stage.dataset.hand = 'two';
    else delete stage.dataset.hand;
    // kit 的"互动"按钮在舞台外面，样式认 html 上的这个标记（电脑版缩成图标按钮）
    if (desk) document.documentElement.dataset.fit = 'desk';
    else delete document.documentElement.dataset.fit;
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    // 点按区域在屏幕上至少 44 像素：折成舞台里的设计像素（手机上约 63），按钮的隐形点按区按它撑开（css/base.css 的 --tap）
    stage.style.setProperty('--tap', `${Math.ceil(44 / s)}px`);
    // kit 的"互动"按钮浮在舞台外面（屏幕像素），按这个倍数放大字和图标（css/table.css 的 .atf-btn）
    document.documentElement.style.setProperty('--stage-scale', s.toFixed(3));
    // 字号同理：缩小的舞台上按倍数把字放回来，屏幕上的字不小于写的数（css/base.css 的 --fs-*）
    document.documentElement.style.setProperty('--fs-k', Math.max(1, 1 / s).toFixed(3));
    if (o !== orient) {
      orient = o;
      stage.dataset.orient = o;
    }
  };
  // 原来的口径：放大超过 5% 才算放大、转屏后 350ms 补算、不听 visualViewport 的 scroll、不滚回顶部；补算那一下不管可见区变没变都重量舞台
  watchViewport({ onChange: measure, onSettle: measure, zoomEpsilon: 0.05, settleMs: 350, listenScroll: false, scrollTop: false });
}
