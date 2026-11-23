import type Phaser from 'phaser';
import type { Rect } from '../view/rect.ts';
import { isCut } from '../view/ui/text.ts';

/**
 * 量画布里的布局（--noscroll 的重叠和裁字检查用）。DOM 的 scrollWidth / getBoundingClientRect 量不到画布里的按钮和文字，
 * 这里直接走 Phaser 的显示列表：
 * - 每个控件（调试桥 controls() 的点）落在哪个点击区上：取包含这个点、画得最靠上（显示列表里最后）的那个，和 Phaser 判定点击的顺序一致；
 *   按钮有底板时另给底板的框（看得见的那块）；
 * - 看得见的文字：超出镜头（被屏幕边裁掉）、超出所在按钮的底板，或者两段文字互相压住。
 * 开盘不用遮罩；放不下截成省略号的文字由 ui/text.ts 的 markCut 记下，这里带上 cut 标记（--noscroll 要求 0 处）。
 * 弹窗、月底面板这类盖层下面铺着一块接住点击的整屏遮罩（占镜头 40% 以上的点击区）：有遮罩时只量遮罩所在顶层及更高的层，
 * 下面被盖住的按钮点不到、文字也看不清，不算重叠和压字。
 * 不接点击的不透明层（选格子的提示条这类纸面、实心底）盖住的文字同样看不见，不算压字；被它盖住的按钮却照样点得到，单独标出来。
 */
export interface LayoutBox {
  key: string;
  /** 点击区（世界坐标） */
  hit: Rect;
  /** 看得见的底板；不是按钮的点击区（透明热区）就等于点击区 */
  face: Rect;
  /** 同一个点击区上的多个 key 共用一个 id，比较重叠时跳过 */
  id: number;
  /** 底板中心被后画的不透明层（纸面、实心底）盖住了：看不见，但点击区还在、点得到 */
  covered: boolean;
}

export interface LayoutText {
  text: string;
  box: Rect;
  /** 属于哪个按钮（底板容器里的字）：按钮 key；不属于任何按钮时为 null */
  owner: string | null;
  /** 被截成了省略号（ui/text.ts 的 markCut） */
  cut: boolean;
}

export interface Layout {
  view: Rect;
  boxes: LayoutBox[];
  texts: LayoutText[];
}

type Obj = Phaser.GameObjects.GameObject & {
  visible?: boolean;
  alpha?: number;
  list?: Phaser.GameObjects.GameObject[];
  text?: string;
  input?: { enabled: boolean } | null;
  getBounds?: () => Phaser.Geom.Rectangle;
};

/** 按钮容器（ui/button.ts）：有世界坐标下的底板矩形 */
type Faced = Phaser.GameObjects.Container & { rect: () => Rect; center: () => { x: number; y: number } };

const toRect = (b: Phaser.Geom.Rectangle): Rect => ({ x: b.x, y: b.y, w: b.width, h: b.height });
/** 点击区占镜头这么大就算整屏遮罩 */
const BLOCKER = 0.4;
/** 不透明层：纸面九宫格、实心矩形，整体透明度不低于这个 */
const OPAQUE = 0.95;
const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function measureLayout(scene: Phaser.Scene | null, controls: Record<string, { x: number; y: number }>): Layout {
  if (!scene) return { view: { x: 0, y: 0, w: 0, h: 0 }, boxes: [], texts: [] };
  // 看得见的世界范围：和 session.toCanvas 同一个换算（镜头左上角 + 画布尺寸 ÷ 缩放）。
  // 不用 worldView：手机上镜头按缩放重排后它和实际显示的范围对不上，整屏的字都会被当成伸出屏幕
  const cam = scene.cameras.main;
  const v = { x: cam.scrollX, y: cam.scrollY, width: scene.scale.width / cam.zoom, height: scene.scale.height / cam.zoom };
  // depth：所在顶层对象的 depth（盖层按它分层）
  // order：画的先后（显示列表的遍历顺序，后画的盖在上面）
  const hits: { o: Obj; r: Rect; depth: number; order: number }[] = [];
  const texts: { o: Phaser.GameObjects.Text; r: Rect; depth: number; order: number }[] = [];
  const covers: { o: Obj; r: Rect; order: number }[] = [];
  let order = 0;
  const walk = (list: readonly Phaser.GameObjects.GameObject[], top: number | null, alpha: number): void => {
    for (const o of list as readonly Obj[]) {
      if (o.visible === false) continue;
      const depth = top ?? (o as unknown as { depth: number }).depth;
      const a = alpha * (o.alpha ?? 1);
      order++;
      // 点击区是透明度 0.001 的矩形，按透明度过滤之前先收
      if (o.input?.enabled && o.getBounds) hits.push({ o, r: toRect(o.getBounds()), depth, order });
      if (a <= 0.05) continue;
      if (o.type === 'Text' && typeof o.text === 'string' && o.text.trim()) {
        const t = o as unknown as Phaser.GameObjects.Text;
        texts.push({ o: t, r: toRect(t.getBounds()), depth, order });
      }
      const solid = o.type === 'NineSlice' || (o.type === 'Rectangle' && (o as unknown as Phaser.GameObjects.Rectangle).isFilled && (o as unknown as Phaser.GameObjects.Rectangle).fillAlpha >= OPAQUE);
      if (solid && a >= OPAQUE && !o.input?.enabled && o.getBounds) {
        // 纸面九宫格四角是圆的、带阴影：往里收 4 再算盖住
        const b = toRect(o.getBounds());
        if (b.w > 8 && b.h > 8) covers.push({ o, r: { x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - 8 }, order });
      }
      if (Array.isArray(o.list)) walk(o.list, depth, a);
    }
  };
  walk(scene.children.list, null, 1);
  /** (x, y) 被 order 之后画的不透明层盖住；within 是自己的按钮容器（自己按钮里的底板不算盖住） */
  const coveredAt = (x: number, y: number, after: number, within: Phaser.GameObjects.Container | null): boolean =>
    covers.some((c) => {
      if (c.order <= after || !inside(c.r, x, y)) return false;
      for (let p = c.o.parentContainer; p; p = p.parentContainer) if (p === within) return false;
      return true;
    });
  const isBlocker = (r: Rect): boolean => r.w * r.h >= BLOCKER * v.width * v.height;
  const floor = Math.max(-Infinity, ...hits.filter((h) => isBlocker(h.r)).map((h) => h.depth));
  const boxes: LayoutBox[] = [];
  const owners = new Map<Phaser.GameObjects.Container, string>();
  for (const [key, p] of Object.entries(controls)) {
    let best: (typeof hits)[number] | null = null;
    for (const h of hits) if (inside(h.r, p.x, p.y)) best = h;
    // 落在遮罩上或盖层下面：这时点不到，不算
    if (!best || isBlocker(best.r) || best.depth < floor) continue;
    const parent = best.o.parentContainer as Faced | null;
    const faced = parent && typeof parent.rect === 'function' && typeof parent.center === 'function' ? parent : null;
    if (faced && !owners.has(faced)) owners.set(faced, key);
    const face = faced ? faced.rect() : best.r;
    boxes.push({ key, hit: best.r, face, id: hits.indexOf(best), covered: coveredAt(face.x + face.w / 2, face.y + face.h / 2, best.order, faced) });
  }
  const ownerOf = (t: Phaser.GameObjects.Text): string | null => {
    for (let c = t.parentContainer; c; c = c.parentContainer) {
      const k = owners.get(c);
      if (k) return k;
    }
    return null;
  };
  return { view: { x: v.x, y: v.y, w: v.width, h: v.height }, boxes, texts: texts.filter((t) => t.depth >= floor && !coveredAt(t.r.x + t.r.w / 2, t.r.y + t.r.h / 2, t.order, null)).map(({ o, r }) => ({ text: o.text, box: r, owner: ownerOf(o), cut: isCut(o) })) };
}
