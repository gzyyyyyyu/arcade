import type Phaser from 'phaser';
import { BEACH, ISLAND } from '../core/types.ts';
import type { CamCtl } from './camctl.ts';
import { iso } from './iso.ts';
import { INTRO_HOLD, INTRO_PUSH, camAt, focusCx } from './camguide.ts';
import { takesCamera } from './camgesture.ts';
import { button } from './ui.ts';
import { REDUCED } from './feel.ts';

/**
 * 镜头"按岛适配"（fit）：基地、登陆战、守岛进场时，整座岛加四面沙滩（再加各场景要求的额外点）
 * 全部在"可见区"里，可见区 = 整屏扣掉顶栏、底部操作区（横屏时是侧边操作区）。不用拖就能找到任何建筑和登陆点；
 * 放大是可选的（双指 / 滚轮），松手不自动跑偏；放大或平移后出现"回到全景"按钮。
 */

export interface Box { l: number; r: number; t: number; b: number }
export interface Inset { top: number; bottom: number; left: number; right: number }
/** pano：竖屏放大（登陆战、守岛）时另给整岛全景的视角，开场先停在这里再推过去，"全景"钮也回到这里 */
export interface Fit { z: number; cx: number; cy: number; minZ: number; maxZ: number; pano?: { z: number; cx: number; cy: number } }

/** 建筑往上长：图比脚印高出的部分（世界单位），框的顶边要多留这么多 */
const TALL = 64;
/** 适配时的最大缩放（电脑大屏上不把岛放得过大） */
const Z_CAP = 1.5;
/** 最大放大倍数：相对适配缩放 */
const ZOOM_MAX = 3;

/** 整座岛含沙滩（菱形）的包围盒：margin 是岛外沿的沙滩宽度（格，默认全部 3 格；基地用不上登陆，只留 1 格），extra 是还要装进来的格点（世界格坐标）；顶边留出建筑的高度 */
export function islandBox(extra: ReadonlyArray<readonly [number, number]> = [], margin = BEACH): Box {
  const e = margin;
  const pts: Array<readonly [number, number]> = [[-e, -e], [ISLAND + e, -e], [-e, ISLAND + e], [ISLAND + e, ISLAND + e], ...extra];
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  for (const [gx, gy] of pts) {
    const p = iso(gx, gy);
    l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y);
  }
  return { l, r, t: t - TALL, b };
}

/** 一组格子矩形 [x0, y0, x1, y1]（左上格到右下格，含）外扩 margin 格后的包围盒；顶边留出建筑的高度 */
export function cellsBox(rects: ReadonlyArray<readonly [number, number, number, number]>, margin = 1): Box {
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  for (const [x0, y0, x1, y1] of rects) {
    for (const [gx, gy] of [[x0 - margin, y0 - margin], [x1 + 1 + margin, y0 - margin], [x0 - margin, y1 + 1 + margin], [x1 + 1 + margin, y1 + 1 + margin]] as const) {
      const p = iso(gx, gy);
      l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y);
    }
  }
  return { l, r, t: t - TALL, b };
}

/** 竖屏时内容盒的高最多占可见区高的这个比例（放大的封顶） */
const PORTRAIT_FILL = 0.92;
/** 竖屏的登陆战、守岛：内容盒的高放大到约占屏高的这个比例，左右可以裁（裁掉的由边缘箭头、拖动补上） */
export const PORTRAIT_LIVE = 0.6;
/** 基地竖屏：内容盒（全部建筑连同高出的屋顶）放到约占屏高的这个比例就够了（docs/ui.md 要求岛占屏高 ≥ 60%），
 * 再放大只会把两侧建筑拦腰切掉；矮竖屏（360×640）原来放到 73%，左右只看得到一半 */
export const PORTRAIT_BASE_H = 0.6;
/** 基地竖屏放大时，可见区至少要看到内容盒宽度的这个比例（能拖，不是实时操作，可以裁左右的空沙角） */
const PORTRAIT_MIN_W = 0.4;
/** 竖屏全景（pano）：有 must（主寨）时可以裁掉内容盒左右的空沙角，可见区至少看到内容盒宽的这个比例；没有 must 就整个内容盒都装进来 */
const PANO_MIN_W = 0.8;
/** 竖屏放大时主寨离可见区边的最小留空（CSS 像素） */
const MUST_PAD = 14;
/** 商船的船身高（世界单位）：护航的适配盒上沿要在航线之外再多留这么多，开场船和旗才不被屏上沿切掉 */
export const SHIP_H = 64;
/** 可见区高 > 宽 × 这个数就算竖长 */
const PORTRAIT_RATIO = 1.2;

/**
 * 竖屏适配用的内容：box 是有内容的区域；whole 为真（登陆战、守岛：实时操作）时 box 的高放大到约占屏高 PORTRAIT_LIVE，
 * 上下完整在可见区里、左右可以裁（开场先给整岛全景再推过去，见 FitCam）；
 * 为假（基地：能拖）时可以裁掉左右空沙角，但 must（主寨）必须在屏内。
 */
export interface Content { box: Box; whole?: boolean; must?: Box; /** 横屏和电脑也按内容盒适配（基地：不改岛大小，只让建筑别缩得太小），缩出去仍能看全岛 */ tight?: boolean }

/**
 * 镜头中心横向挪最少的距离，让 m 整个落在可见区里（左右各留 pad）。放得下就一定放进来，
 * 比可见区还宽时保左边。w 是屏宽，left / right 是可见区两侧扣掉的宽，z 是缩放。返回新的镜头中心世界 x。
 */
export function nudgeInto(cx: number, z: number, w: number, left: number, right: number, m: { l: number; r: number }, pad = MUST_PAD): number {
  const lo = left + pad;
  const hi = w - right - pad;
  const sr = (m.r - cx) * z + w / 2;
  if (sr > hi) cx += (sr - hi) / z;
  const sl = (m.l - cx) * z + w / 2;
  if (sl < lo) cx -= (lo - sl) / z;
  return cx;
}

/** 护航的适配盒：在原盒子上并进航线格（起点到终点，外扩 1 格），上沿多留一个船身高度 */
export function withRoute(box: Box, rects: ReadonlyArray<readonly [number, number, number, number]>): Box {
  if (rects.length === 0) return box;
  const r = cellsBox(rects, 1);
  return { l: Math.min(box.l, r.l), r: Math.max(box.r, r.r), t: Math.min(box.t, r.t - SHIP_H), b: Math.max(box.b, r.b) };
}

/**
 * 场景进场的适配：横屏和电脑是整座岛（fitBox）；可见区竖长（手机竖屏）时改按内容适配（Content），
 * 在装得下的前提下尽量放大，内容盒高度最多到可见区的 PORTRAIT_FILL。
 * minZ 始终是整岛适配，玩家能双指 / 滚轮缩出去看全岛。
 */
export function fitView(w: number, h: number, inset: Inset, full: Box, content?: Content, pad = 8): Fit {
  const whole = fitBox(w, h, inset, full, pad);
  const aw = Math.max(40, w - inset.left - inset.right - 2 * pad);
  const ah = Math.max(40, h - inset.top - inset.bottom - 2 * pad);
  if (content?.tight && ah <= aw * PORTRAIT_RATIO) {
    const t = fitBox(w, h, inset, content.box, pad);
    return { ...t, minZ: Math.min(whole.z, t.z), maxZ: Math.max(t.z, whole.z) * ZOOM_MAX };
  }
  if (!content || ah <= aw * PORTRAIT_RATIO) return whole;
  const c = content.box;
  const fitAll = fitBox(w, h, inset, c, pad);
  const bw = Math.max(1, c.r - c.l);
  const bh = Math.max(1, c.b - c.t);
  const cap = (ah * PORTRAIT_FILL) / bh;
  let z: number;
  if (content.whole) z = Math.min(Z_CAP, cap, Math.max(fitAll.z, (h * PORTRAIT_LIVE) / bh));
  else {
    z = Math.min(Z_CAP, Math.max(fitAll.z, Math.min(cap, aw / (bw * PORTRAIT_MIN_W))));
    z = Math.min(z, Math.max(fitAll.z, (h * PORTRAIT_BASE_H) / bh));
    if (content.must) z = Math.min(z, aw / Math.max(1, content.must.r - content.must.l));
  }
  const midX = inset.left + (w - inset.left - inset.right) / 2;
  const midY = inset.top + (h - inset.top - inset.bottom) / 2;
  const m = content.must;
  let cx = (c.l + c.r) / 2 - (midX - w / 2) / z;
  const cy = (c.t + c.b) / 2 - (midY - h / 2) / z;
  if (m) cx = nudgeInto(cx, z, w, inset.left, inset.right, m, pad);
  const out: Fit = { z, cx, cy, minZ: Math.min(whole.z, z), maxZ: Math.max(z, whole.z) * ZOOM_MAX };
  if (content.whole) {
    // 全景不再按整座岛含沙滩的大盒子适配（竖屏里菱形又宽又扁，岛只占屏高三成多）：按内容盒装，
    // 有主寨时再裁掉左右空沙角放大，主寨保证在屏内
    let pz = fitAll.z;
    if (m) pz = Math.max(pz, Math.min(cap, aw / (bw * PANO_MIN_W)));
    pz = Math.min(pz, z);
    let pcx = (c.l + c.r) / 2 - (midX - w / 2) / pz;
    if (m) pcx = nudgeInto(pcx, pz, w, inset.left, inset.right, m, pad);
    out.pano = { z: pz, cx: pcx, cy: (c.t + c.b) / 2 - (midY - h / 2) / pz };
    out.minZ = Math.min(whole.z, pz);
  }
  return out;
}

/**
 * 把 box 装进"屏幕 w×h 扣掉 inset"的可见区，居中。返回开场的缩放和镜头中心，以及放大范围：
 * 最小就是适配缩放（再缩小只会多露海），最大是适配的 ZOOM_MAX 倍。pad 是四边留的空（CSS 像素）。
 */
export function fitBox(w: number, h: number, inset: Inset, box: Box, pad = 8): Fit {
  const aw = Math.max(40, w - inset.left - inset.right - 2 * pad);
  const ah = Math.max(40, h - inset.top - inset.bottom - 2 * pad);
  const bw = Math.max(1, box.r - box.l);
  const bh = Math.max(1, box.b - box.t);
  const z = Math.min(aw / bw, ah / bh, Z_CAP);
  const midX = inset.left + (w - inset.left - inset.right) / 2;
  const midY = inset.top + (h - inset.top - inset.bottom) / 2;
  return { z, cx: (box.l + box.r) / 2 - (midX - w / 2) / z, cy: (box.t + box.b) / 2 - (midY - h / 2) / z, minZ: z, maxZ: z * ZOOM_MAX };
}

/** 手机横屏：宽比高大，且高 ≤ 500（和 CSS 里的 `(orientation:landscape) and (max-height:500px)` 一致） */
export const isLandscapePhone = (w: number, h: number): boolean => w > h && h <= 500;

/**
 * 读界面真实占的位置：顶部的条、底部（或侧边）的操作区各占多少 CSS 像素。
 * 顶部元素：.hd-hall .hd-bar .hd-bar2 .hd-td-bar .hd-td-bar2（取最低的下沿）；
 * 底部元素：.hd-bottom .hd-cards .hd-td-bottom .hd-esc-ctl（护航的速度钮），宽的算底部，窄而靠右的算右侧。
 */
export function measureInsets(ui: HTMLElement, w: number, h = 800): Inset {
  // 基准是界面根（和画布一样大）：.hd-screen 为刘海让出的边距也算进各个 inset
  const base = (ui.parentElement ?? ui).getBoundingClientRect();
  const out: Inset = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const e of ui.querySelectorAll<HTMLElement>('.hd-hall, .hd-bar, .hd-bar2, .hd-td-bar, .hd-td-bar2')) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.top - base.top > h * 0.3) continue;
    out.top = Math.max(out.top, r.bottom - base.top);
  }
  for (const e of ui.querySelectorAll<HTMLElement>('.hd-bottom, .hd-cards, .hd-td-bottom, .hd-esc-ctl')) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(e).display === 'none') continue;
    if (r.width > w * 0.6) out.bottom = Math.max(out.bottom, base.bottom - r.top);
    else if (r.left - base.left > w * 0.5) out.right = Math.max(out.right, base.right - r.left);
    else out.left = Math.max(out.left, r.right - base.left);
  }
  // 刘海和圆角：界面自己缩进的边距（layout.ts 里 .hd-screen 的 safe-area）也是不能放岛的
  const me = ui.getBoundingClientRect();
  out.top = Math.max(out.top, me.top - base.top);
  out.left = Math.max(out.left, me.left - base.left);
  out.right = Math.max(out.right, base.right - me.right);
  // 兜底：读不到（界面还没排版）时给保守值
  if (out.top === 0) out.top = w < 560 ? 108 : 64;
  return out;
}

const BACK_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b1a15" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
/** 点边缘箭头、"全景"钮切换时镜头移过去的时长（毫秒） */
const PAN_MS = 320;

/**
 * 场景的镜头适配：进场时 refit，转屏 / 窗口变化时（没放大过）重新适配；放大或平移后出现"回到全景"按钮。
 * boxOf 是整座岛（缩出去的下限）；contentOf（可选）是有内容的区域，竖屏按它适配。每次现算（基地的包围盒随不变，战斗里是岛 + 登陆点，守岛要加登陆口）。
 * focusOf（可选，世界 x）：竖屏放大时开场先停 1 秒整岛全景，再推到这一侧（守岛 = 第一波的登陆口，登陆战 = 发光沙滩那一侧）；
 * 这种模式（live）下"全景"钮在"整岛全景"和"放大的开场视角"之间切换，一直显示。
 */
export class FitCam {
  home = { cx: 0, cy: 0, z: 1 };
  /** 竖屏放大（登陆战、守岛）：开场推镜、边缘指示只在这种模式下有 */
  live = false;
  private pano = { cx: 0, cy: 0, z: 1 };
  private inset: Inset = { top: 0, bottom: 0, left: 0, right: 0 };
  private introDone = false;
  /** 正在走的镜头动画：t0 在下一帧补上（构造时还不知道场景时间） */
  private anim: { from: { cx: number; cy: number; z: number }; to: { cx: number; cy: number; z: number }; t0: number; hold: number; push: number } | null = null;
  private readonly btn: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private lastCheck = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onResize = (): void => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refit(this.away()), 60);
  };
  private readonly onUpdate = (time: number): void => {
    if (this.anim) {
      const a = this.anim;
      if (a.t0 < 0) a.t0 = time;
      const st = camAt(time - a.t0, a.from, a.to, a.hold, a.push);
      this.cc.setView(st.view.cx, st.view.cy, st.view.z);
      if (st.done) this.anim = null;
    }
    if (time - this.lastCheck < 150) return;
    this.lastCheck = time;
    this.syncBtn();
  };
  /** 这次按下的起点（画布像素）：单击（下船、放技能）不打断开场推镜，拖开、捏合、滚轮才把镜头交给玩家 */
  private press: { x: number; y: number; touch: boolean } | null = null;
  private readonly onDown = (p: Phaser.Input.Pointer): void => {
    this.press = { x: p.x, y: p.y, touch: p.wasTouch };
    this.checkTakeover(p);
  };
  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    if (p.isDown) this.checkTakeover(p);
  };
  private readonly onUp = (): void => {
    this.press = null;
  };
  private readonly onWheel = (): void => {
    this.anim = null;
  };
  private checkTakeover(p: Phaser.Input.Pointer): void {
    if (!this.press) return;
    const fingers = this.scene.input.manager.pointers.filter((q) => q.isDown).length;
    if (takesCamera((p.x - this.press.x) / this.r, (p.y - this.press.y) / this.r, this.press.touch, fingers)) this.anim = null;
  }

  private readonly scene: Phaser.Scene;
  private readonly cc: CamCtl;
  private readonly ui: HTMLElement;
  private readonly boxOf: () => Box;
  private readonly contentOf: (() => Content) | undefined;
  private readonly focusOf: (() => number | null) | undefined;
  private readonly r: number;

  constructor(scene: Phaser.Scene, cc: CamCtl, ui: HTMLElement, boxOf: () => Box, r: number, contentOf?: () => Content, focusOf?: () => number | null) {
    this.contentOf = contentOf;
    this.focusOf = focusOf;
    this.scene = scene;
    this.cc = cc;
    this.ui = ui;
    this.boxOf = boxOf;
    this.r = r;
    this.btn = button('', 'hd-fitbtn', () => this.toggle(), ui);
    this.btn.innerHTML = `${BACK_ICON}<span>全景</span>`;
    this.label = this.btn.querySelector('span')!;
    this.btn.setAttribute('aria-label', '回到全景');
    scene.scale.on('resize', this.onResize, this);
    scene.events.on('update', this.onUpdate, this);
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.input.on('wheel', this.onWheel, this);
    scene.events.once('shutdown', () => this.destroy());
    this.refit(false);
  }

  private destroy(): void {
    this.scene.scale.off('resize', this.onResize, this);
    this.scene.events.off('update', this.onUpdate, this);
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
    this.scene.input.off('wheel', this.onWheel, this);
    if (this.timer) clearTimeout(this.timer);
  }

  /** 把一个视角夹过边界后的实际值（不改当前镜头） */
  private clamped(v: { cx: number; cy: number; z: number }): { cx: number; cy: number; z: number } {
    const keep = { cx: this.cc.cx, cy: this.cc.cy, z: this.cc.z };
    this.cc.setView(v.cx, v.cy, v.z);
    const out = { cx: this.cc.cx, cy: this.cc.cy, z: this.cc.z };
    this.cc.setView(keep.cx, keep.cy, keep.z);
    return out;
  }

  /** 重新算适配；keepView 为真（用户放大着）时只更新范围和 home，不动当前镜头 */
  refit(keepView: boolean): void {
    const w = this.scene.scale.width / this.r;
    const h = this.scene.scale.height / this.r;
    this.inset = measureInsets(this.ui, w, h);
    const content = this.contentOf?.();
    const f = fitView(w, h, this.inset, this.boxOf(), content);
    this.live = !!f.pano;
    this.cc.minZ = f.minZ * 0.98;
    this.cc.maxZ = f.maxZ;
    let cx = f.cx;
    const fx = this.live && content ? this.focusOf?.() : null;
    if (fx !== null && fx !== undefined && content) cx = focusCx(fx, content.box, f.z, w, this.inset.left, this.inset.right);
    // 放大档以主寨为底：落点想看的那一侧再偏，也要让主寨整个在屏内（只在竖屏放大模式里有 must）
    if (this.live && content?.must) cx = nudgeInto(cx, f.z, w, this.inset.left, this.inset.right, content.must);
    this.home = this.clamped({ cx, cy: f.cy, z: f.z });
    this.pano = f.pano ? this.clamped(f.pano) : this.home;
    const intro = this.anim && this.anim.hold > 0 ? this.anim : null;
    if (intro && this.live) {
      // 开场推镜途中界面排版完、窗口变了（进场时常有）：起止点跟着换，推镜照常走完，不跳过
      intro.from = this.pano;
      intro.to = this.home;
      this.syncBtn();
      return;
    }
    this.anim = null;
    if (keepView) this.cc.apply();
    else if (this.live && !this.introDone && !REDUCED) {
      // 开场：先停在整岛全景，再推到要守 / 要登陆的那一侧
      this.cc.setView(this.pano.cx, this.pano.cy, this.pano.z);
      this.anim = { from: this.pano, to: this.home, t0: -1, hold: INTRO_HOLD, push: INTRO_PUSH };
    } else this.cc.setView(this.home.cx, this.home.cy, this.home.z);
    this.introDone = true;
    this.syncBtn();
  }

  /** 可见区（扣掉顶栏、操作区后的画布范围，CSS 像素，相对画布左上），边缘指示和测试钩子用 */
  visible(): { l: number; t: number; r: number; b: number } {
    const w = this.scene.scale.width / this.r;
    const h = this.scene.scale.height / this.r;
    return { l: this.inset.left, t: this.inset.top, r: w - this.inset.right, b: h - this.inset.bottom };
  }

  /** 镜头平移到让世界点 (wx, wy) 落在可见区中间（缩放不变），ms 为 0 时直接到 */
  panTo(wx: number, wy: number, ms = PAN_MS): void {
    const v = this.visible();
    const w = this.scene.scale.width / this.r;
    const h = this.scene.scale.height / this.r;
    const z = this.cc.z;
    const to = this.clamped({ cx: wx - ((v.l + v.r) / 2 - w / 2) / z, cy: wy - ((v.t + v.b) / 2 - h / 2) / z, z });
    this.moveTo(to, ms);
  }

  private moveTo(to: { cx: number; cy: number; z: number }, ms: number): void {
    if (ms <= 0 || REDUCED) {
      this.anim = null;
      this.cc.setView(to.cx, to.cy, to.z);
    } else this.anim = { from: { cx: this.cc.cx, cy: this.cc.cy, z: this.cc.z }, to, t0: -1, hold: 0, push: ms };
  }

  /** 现在（或正在去的）是不是整岛全景：live 模式下"全景"钮据此切换 */
  private atPano(): boolean {
    return (this.anim?.to.z ?? this.cc.z) <= this.pano.z * 1.06;
  }

  private syncBtn(): void {
    const pano = this.atPano();
    this.btn.classList.toggle('on', this.live || this.away());
    const txt = this.live && pano ? '放大' : '全景';
    if (this.label.textContent !== txt) {
      this.label.textContent = txt;
      this.btn.setAttribute('aria-label', this.live && pano ? '放大到开场视角' : '回到全景');
    }
  }

  /** "全景"钮 / 空格：live 模式下在整岛全景和开场视角之间切换，其余回到适配视角 */
  toggle(): void {
    if (!this.live) return this.back();
    this.moveTo(this.atPano() ? this.home : this.pano, PAN_MS);
    this.syncBtn();
  }

  /** 测试辅助：内容盒投到页面上的 CSS 像素范围和视口，量"内容盒占屏高百分之几"、有没有被裁 */
  info(): { box: { l: number; r: number; t: number; b: number } | null; w: number; h: number } {
    const w = this.scene.scale.width / this.r;
    const h = this.scene.scale.height / this.r;
    const c = this.contentOf?.().box;
    if (!c) return { box: null, w, h };
    const a = this.cc.toScreen(c.l, c.t);
    const b = this.cc.toScreen(c.r, c.b);
    return { box: { l: a.x, r: b.x, t: a.y, b: b.y }, w, h };
  }

  /** 放大了，或者平移离开全景视角 */
  away(): boolean {
    const c = this.cc;
    return c.z > this.home.z * 1.06 || c.z < this.home.z * 0.94 || Math.hypot(c.cx - this.home.cx, c.cy - this.home.cy) * c.z > 36;
  }

  /** 回到开场视角（竖屏放大时是推过去之后的那个，测试钩子 api.home 也走这里） */
  back(): void {
    this.anim = null;
    this.cc.setView(this.home.cx, this.home.cy, this.home.z);
    this.syncBtn();
  }
}
