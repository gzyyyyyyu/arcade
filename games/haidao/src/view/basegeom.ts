import type { BaseScene } from './BaseScene.ts';
import { BUILDINGS } from '../content/index.ts';
import type { Placed } from '../core/types.ts';
import { app } from './app.ts';
import { artBox } from './textures.ts';
import { easeOutCubic } from './motion.ts';
import { measureInsets, type Content, cellsBox } from './camfit.ts';
import { type CamView, type ScreenRect, panelFocus, camLerp } from './basefeel.ts';
import { type Node, PANEL_CAM_MS } from './basecommon.ts';

export function occupied(_bs: BaseScene, gx: number, gy: number): boolean {
  return app.profile.base.buildings.some((b) => {
    const s = BUILDINGS[b.kind].size;
    return gx >= b.x - 0 && gx < b.x + s && gy >= b.y && gy < b.y + s;
  });
}

function cssSize(bs: BaseScene): { w: number; h: number } {
  return { w: bs.scale.width / bs.r, h: bs.scale.height / bs.r };
}

/** 图里不透明部分的顶（世界坐标）：气泡、飘字贴着它，不悬在透明空白上 */
export function topOf(_bs: BaseScene, n: Node): number {
  const im = n.img;
  return im.y - im.originY * im.displayHeight + (artBox(n.key)?.t ?? 0) * im.scaleY;
}

/** 建筑图里不透明部分的中心（世界坐标）：操作环围着它转 */
export function centerOf(_bs: BaseScene, n: Node): { x: number; y: number } {
  const im = n.img;
  const bx = artBox(n.key) ?? { l: 0, t: 0, r: im.width, b: im.height };
  const ox = im.x - im.originX * im.displayWidth;
  const oy = im.y - im.originY * im.displayHeight;
  return { x: ox + ((bx.l + bx.r) / 2) * im.scaleX, y: oy + ((bx.t + bx.b) / 2) * im.scaleY };
}

export function measureSafe(bs: BaseScene, time = performance.now()): void {
  bs.lastSafe = time;
  const { w, h } = cssSize(bs);
  const m = measureInsets(bs.ui, w, h);
  const a = bs.ui.getBoundingClientRect();
  const b = (bs.ui.parentElement ?? bs.ui).getBoundingClientRect();
  bs.off = { x: a.left - b.left, y: a.top - b.top };
  bs.safe = { l: m.left - bs.off.x, r: w - m.right - bs.off.x, t: m.top - bs.off.y, b: h - m.bottom - bs.off.y };
}

// ---------------------------------------------------------------- 界面

/** 基地内容盒顶边在通用高度上再多留的一截（世界单位） */
const TALL_EXTRA = 64;

/** 适配的内容：全部建筑占地外扩 1 格；竖屏时主寨必须在屏内（基地能拖，左右空沙角可以裁），横屏和电脑按这个盒装进可见区 */
/** 这次打开游戏后进过几次基地：竖屏开场「先看全岛再推近」只演第一次（每打完一仗回来都推一遍太烦） */
let baseEntries = 0;
/** BaseScene.create 时调一次：是不是这次打开游戏后第一次进基地 */
export function firstBaseEntry(): boolean {
  return baseEntries++ === 0;
}

export function fitContent(scene: BaseScene): Content {
  const foot = (b: Placed): readonly [number, number, number, number] => [b.x, b.y, b.x + BUILDINGS[b.kind].size - 1, b.y + BUILDINGS[b.kind].size - 1];
  const bs = app.profile.base.buildings;
  const hq = bs.find((b) => b.kind === 'hq');
  // 边上的高建筑（箭塔、主寨的旗）比通用的 TALL 还高，再让出一截，免得顶被顶栏压住
  const box = cellsBox(bs.map(foot), 1);
  return { box: { ...box, t: box.t - TALL_EXTRA }, tight: true, intro: scene.introOnce, must: hq ? cellsBox([foot(hq)], 0) : undefined };
}

function camNow(bs: BaseScene): CamView {
  return { cx: bs.cc.cx, cy: bs.cc.cy, z: bs.cc.z };
}

/** 建筑不透明部分在画布上的框（CSS 像素） */
function screenBox(bs: BaseScene, n: Node): ScreenRect {
  const im = n.img;
  const bx = artBox(n.key) ?? { l: 0, t: 0, r: im.width, b: im.height };
  const ox = im.x - im.originX * im.displayWidth;
  const oy = im.y - im.originY * im.displayHeight;
  const a = bs.cc.toScreen(ox + bx.l * im.scaleX, oy + bx.t * im.scaleY);
  const b = bs.cc.toScreen(ox + bx.r * im.scaleX, oy + bx.b * im.scaleY);
  return { l: a.x, t: a.y, r: b.x, b: b.y };
}

/** 面板以外、顶栏底栏以内的可见区（画布 CSS 像素）：按面板的真实位置算，右侧面板让左边、底部抽屉让上面 */
function panelArea(bs: BaseScene, sheet: HTMLElement, w: number, h: number): ScreenRect | null {
  const u = bs.ui.getBoundingClientRect();
  // offset* 不含入场动画的 transform，量的是面板停稳后的位置
  const inUi = sheet.offsetParent === bs.ui;
  const r0 = sheet.getBoundingClientRect();
  const sx = (inUi ? sheet.offsetLeft : r0.left - u.left) + bs.off.x;
  const sy = (inUi ? sheet.offsetTop : r0.top - u.top) + bs.off.y;
  const sw = sheet.offsetWidth;
  const pad = 8;
  const l = Math.max(0, bs.safe.l + bs.off.x) + pad;
  const t = Math.max(0, bs.safe.t + bs.off.y) + pad;
  const r = Math.min(w, bs.safe.r + bs.off.x) - pad;
  const b = Math.min(h, bs.safe.b + bs.off.y) - pad;
  const side = sw < w * 0.7 && sx > w * 0.3;
  const a = side ? { l, t, r: Math.min(r, sx - pad), b } : { l, t, r, b: Math.min(b, sy - pad) };
  return a.r - a.l < 60 || a.b - a.t < 60 ? null : a;
}

/** 开建筑面板：镜头平滑地把这座建筑挪到可见区正中（太小就拉近一点） */
export function focusPanel(bs: BaseScene, id: number): void {
  const n = bs.nodes.get(id);
  if (!n || !bs.sheet) return;
  measureSafe(bs);
  const { w, h } = cssSize(bs);
  const area = panelArea(bs, bs.sheet, w, h);
  if (!area) return;
  bs.pf ??= { saved: camNow(bs), expect: null, moved: false, anim: null };
  bs.cc.slack = 0;
  const to = panelFocus(screenBox(bs, n), area, camNow(bs), w, h, bs.cc.maxZ);
  bs.pf.anim = { from: camNow(bs), to, t: 0, back: false };
}

/** 每帧：走镜头动画；面板关了就回到开之前的镜头（玩家自己动过镜头就不回） */
export function focusFrame(bs: BaseScene, dt: number): void {
  const pf = bs.pf;
  if (!pf) return;
  const c = bs.cc;
  if (pf.expect && !pf.moved && (Math.abs(c.cx - pf.expect.cx) > 0.5 || Math.abs(c.cy - pf.expect.cy) > 0.5 || Math.abs(c.z - pf.expect.z) > 1e-3)) {
    pf.moved = true;
    pf.anim = null;
  }
  const open = bs.sheet?.dataset.kind?.startsWith('info:') ?? false;
  if (!open && !pf.anim?.back) {
    if (pf.moved) return endFocus(bs);
    pf.anim = { from: camNow(bs), to: pf.saved, t: 0, back: true };
  }
  const a = pf.anim;
  if (!a) return;
  a.t = Math.min(1, a.t + dt / PANEL_CAM_MS);
  const v = camLerp(a.from, a.to, easeOutCubic(a.t));
  c.setView(v.cx, v.cy, v.z);
  pf.expect = camNow(bs);
  if (a.t >= 1) {
    pf.anim = null;
    if (a.back) endFocus(bs);
  }
}

function endFocus(bs: BaseScene): void {
  bs.pf = null;
  bs.cc.slack = 0.5;
  bs.cc.apply();
}
