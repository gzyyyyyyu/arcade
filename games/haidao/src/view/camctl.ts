import type Phaser from 'phaser';
import { centerAfterZoom, clampZoom, exceedsDrag, isTap } from './camgesture.ts';

/** 长按多久算长按（毫秒，比点按的上限 TAP_MAX_MS 短） */
const HOLD_MS = 450;

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 单指拖动的接管者（放建筑时拖虚影）：start 返回 true 就接管，这次拖动不平移；mouse = 这次是鼠标按下（不是手指） */
export interface DragHook {
  start(wx: number, wy: number, mouse: boolean): boolean;
  move(wx: number, wy: number): void;
  end(): void;
}

interface Ptr {
  x: number;
  y: number;
  sx: number;
  sy: number;
  t0: number;
}

/**
 * 世界相机的手势：单指拖动平移、双指捏合缩放（同时平移）、滚轮缩放、轻点。
 * 世界坐标 (cx, cy) 在画布中心，z 是 CSS 像素每世界单位；Phaser 相机缩放 = r * z（画布按 r 倍像素画）。
 */
export class CamCtl {
  z = 1;
  cx = 0;
  cy = 0;
  minZ = 0.2;
  maxZ = 1.6;
  /** 软边界：镜头中心离世界边界至少留几个半屏宽（0.5 = 视野边缘最多越界半个屏幕）。开建筑面板时基地临时放到 0，好把边上的建筑挪进面板外的可见区 */
  slack = 0.5;
  /** 点按：mouse = 鼠标左键（电脑上单击建筑直接开信息面板，手指点开操作环） */
  onTap?: (wx: number, wy: number, mouse: boolean) => void;
  /** 鼠标悬停（没按键）：世界坐标；鼠标移出画布给 NaN */
  onHover?: (wx: number, wy: number) => void;
  /** 手指 / 鼠标按下一根指头时（世界坐标）；抬起、拖开、变多指时 NaN：基地按下就画这一下会选中谁 */
  onPress?: (wx: number, wy: number) => void;
  /** 右键：世界坐标和画布上的 CSS 坐标（基地在建筑上弹右键菜单；别处取消选择），不触发点按 */
  onRight?: (wx: number, wy: number, sx: number, sy: number) => void;
  /** 手指长按（HOLD_MS 没挪开）：世界坐标；返回 true 表示用掉了，松手时不再算点按 */
  onHold?: (wx: number, wy: number) => boolean;
  /** 鼠标最后停在画布上的位置（CSS 像素，相对画布左上）；不在画布上或是手指时为 NaN。摆放时拖到边缘平移镜头用 */
  readonly mouse = { x: NaN, y: NaN };
  drag: DragHook | null = null;
  private ptrs = new Map<number, Ptr>();
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private held = false;
  private multi = false;
  private moved = false;
  private dragging = false;
  /** 惯性：松手后继续滑的速度（世界单位/毫秒） */
  private vx = 0;
  private vy = 0;
  private lastT = 0;
  private pd = 0;
  private pmx = 0;
  private pmy = 0;
  private readonly cam: Phaser.Cameras.Scene2D.Camera;

  private readonly scene: Phaser.Scene;
  private readonly r: number;
  private bounds: Bounds;

  constructor(scene: Phaser.Scene, r: number, bounds: Bounds) {
    this.scene = scene;
    this.r = r;
    this.bounds = bounds;
    this.cam = scene.cameras.main;
    scene.input.addPointer(2);
    scene.input.on('pointerdown', this.down, this);
    scene.input.on('pointermove', this.move, this);
    scene.input.on('pointerup', this.up, this);
    scene.input.on('pointerupoutside', this.up, this);
    scene.input.on('wheel', this.wheel, this);
    scene.input.on('gameout', this.out, this);
    scene.input.mouse?.disableContextMenu();
    scene.scale.on('resize', this.apply, this);
    scene.events.on('update', this.glide, this);
    scene.events.once('shutdown', () => this.destroy());
    this.apply();
  }

  destroy(): void {
    const i = this.scene.input;
    i.off('pointerdown', this.down, this);
    i.off('pointermove', this.move, this);
    i.off('pointerup', this.up, this);
    i.off('pointerupoutside', this.up, this);
    i.off('wheel', this.wheel, this);
    i.off('gameout', this.out, this);
    this.scene.scale.off('resize', this.apply, this);
    this.scene.events.off('update', this.glide, this);
  }

  /** 松手后的惯性滑动，指数衰减 */
  private glide(_t: number, dt: number): void {
    if (Math.abs(this.vx) < 0.0005 && Math.abs(this.vy) < 0.0005) return;
    this.cx += this.vx * dt;
    this.cy += this.vy * dt;
    const k = Math.exp(-dt / 260);
    this.vx *= k;
    this.vy *= k;
    this.apply();
  }

  setBounds(b: Bounds): void {
    this.bounds = b;
    this.apply();
  }

  /** 画布尺寸（画布像素） */
  private get W(): number {
    return this.scene.scale.width;
  }
  private get H(): number {
    return this.scene.scale.height;
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    const k = this.r * this.z;
    return { x: this.cx + (sx - this.W / 2) / k, y: this.cy + (sy - this.H / 2) / k };
  }

  /** 世界点 → 画面上的 CSS 像素（相对画布左上角），新手引导指方向用 */
  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.cx) * this.z + this.W / this.r / 2, y: (wy - this.cy) * this.z + this.H / this.r / 2 };
  }

  /** 夹住缩放和中心，写进相机 */
  apply(): void {
    this.z = clampZoom(this.z, this.minZ, this.maxZ);
    const k = this.r * this.z;
    const hw = this.W / (2 * k);
    const hh = this.H / (2 * k);
    const b = this.bounds;
    // 软边界：视野边缘最多可以越过世界边界半个屏幕，不会一碰边就卡死
    const mx = hw * this.slack;
    const my = hh * this.slack;
    this.cx = b.x1 - b.x0 <= 2 * mx ? (b.x0 + b.x1) / 2 : Math.min(b.x1 - mx, Math.max(b.x0 + mx, this.cx));
    this.cy = b.y1 - b.y0 <= 2 * my ? (b.y0 + b.y1) / 2 : Math.min(b.y1 - my, Math.max(b.y0 + my, this.cy));
    this.cam.setZoom(k);
    this.cam.setScroll(this.cx - this.cam.width / 2, this.cy - this.cam.height / 2);
  }

  setView(cx: number, cy: number, z: number): void {
    this.cx = cx;
    this.cy = cy;
    this.z = z;
    this.apply();
  }

  /** 镜头平移（CSS 像素）：摆放建筑时鼠标贴边自动平移 */
  panBy(dx: number, dy: number): void {
    if (!dx && !dy) return;
    this.cx += dx / this.z;
    this.cy += dy / this.z;
    this.apply();
  }

  /** 以屏幕点 (sx, sy) 为不动点缩放到 z */
  private zoomAt(sx: number, sy: number, z: number): void {
    const wp = this.toWorld(sx, sy);
    this.z = clampZoom(z, this.minZ, this.maxZ);
    const c = centerAfterZoom(wp, sx, sy, this.r * this.z, this.W, this.H);
    this.cx = c.cx;
    this.cy = c.cy;
    this.apply();
  }

  private wheel(p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void {
    this.zoomAt(p.x, p.y, this.z * Math.exp(-dy * 0.0012));
  }

  private out(): void {
    this.mouse.x = this.mouse.y = NaN;
    this.onHover?.(NaN, NaN);
  }

  private down(p: Phaser.Input.Pointer): void {
    // 鼠标只有左键平移 / 点按；右键是取消，中键不管
    if (!p.wasTouch && p.button !== 0) {
      if (p.button === 2) {
        const w = this.toWorld(p.x, p.y);
        this.onRight?.(w.x, w.y, p.x / this.r, p.y / this.r);
      }
      return;
    }
    // 被系统手势打断（touchcancel）的指针收不到 up：按下新指头时把已经不在按着的旧指针清掉，否则以后的单击都会被当成多指
    for (const id of [...this.ptrs.keys()]) {
      if (id !== p.id && !this.scene.input.manager.pointers.some((q) => q.id === id && q.isDown)) this.ptrs.delete(id);
    }
    if (this.ptrs.size === 0) {
      this.multi = false;
      this.moved = false;
      this.dragging = false;
    }
    this.vx = this.vy = 0;
    this.lastT = performance.now();
    this.ptrs.set(p.id, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now() });
    if (this.ptrs.size === 2) {
      this.multi = true;
      this.vx = this.vy = 0;
      if (this.dragging) {
        this.drag?.end();
        this.dragging = false;
      }
      this.pinchInit();
    } else if (this.ptrs.size === 1 && this.drag) {
      const w = this.toWorld(p.x, p.y);
      this.dragging = this.drag.start(w.x, w.y, !p.wasTouch);
    }
    clearTimeout(this.holdTimer);
    if (this.ptrs.size === 1) {
      const w = this.toWorld(p.x, p.y);
      this.onPress?.(w.x, w.y);
      this.held = false;
      const hold = this.onHold;
      if (hold && p.wasTouch && !this.dragging) {
        this.holdTimer = setTimeout(() => {
          if (this.ptrs.size !== 1 || this.moved || this.multi || this.dragging) return;
          const q = this.ptrs.get(p.id);
          if (!q) return;
          const at = this.toWorld(q.x, q.y);
          this.held = hold(at.x, at.y);
        }, HOLD_MS);
      }
    } else this.onPress?.(NaN, NaN);
  }

  private pinchInit(): void {
    const [a, b] = [...this.ptrs.values()] as [Ptr, Ptr];
    this.pd = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    this.pmx = (a.x + b.x) / 2;
    this.pmy = (a.y + b.y) / 2;
  }

  private move(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) {
      this.mouse.x = p.x / this.r;
      this.mouse.y = p.y / this.r;
    } else this.mouse.x = this.mouse.y = NaN;
    const q = this.ptrs.get(p.id);
    if (!q) {
      if (!p.wasTouch && this.onHover) {
        const w = this.toWorld(p.x, p.y);
        this.onHover(w.x, w.y);
      }
      return;
    }
    const ox = q.x;
    const oy = q.y;
    q.x = p.x;
    q.y = p.y;
    if (this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()] as [Ptr, Ptr];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // 先让上次中点下的世界点跟着新中点走，再按距离比缩放
      const wp = this.toWorld(this.pmx, this.pmy);
      this.z = clampZoom(this.z * (d / this.pd), this.minZ, this.maxZ);
      const c = centerAfterZoom(wp, mx, my, this.r * this.z, this.W, this.H);
      this.cx = c.cx;
      this.cy = c.cy;
      this.pd = d;
      this.pmx = mx;
      this.pmy = my;
      this.apply();
      return;
    }
    // 阈值按 CSS 像素算（触屏 10、鼠标 6）；一旦超过就一直算拖，松手不再触发点按
    if (!this.moved && exceedsDrag((q.x - q.sx) / this.r, (q.y - q.sy) / this.r, p.wasTouch)) {
      this.moved = true;
      this.onPress?.(NaN, NaN);
    }
    if (this.multi) return;
    if (this.dragging) {
      const w = this.toWorld(p.x, p.y);
      this.drag?.move(w.x, w.y);
    } else if (this.moved) {
      const k = this.r * this.z;
      const now = performance.now();
      const dt = Math.max(1, now - this.lastT);
      this.lastT = now;
      const dx = (p.x - ox) / k;
      const dy = (p.y - oy) / k;
      this.cx -= dx;
      this.cy -= dy;
      this.vx = this.vx * 0.5 - (dx / dt) * 0.5;
      this.vy = this.vy * 0.5 - (dy / dt) * 0.5;
      this.apply();
    }
  }

  private up(p: Phaser.Input.Pointer): void {
    const q = this.ptrs.get(p.id);
    if (!q) return;
    this.ptrs.delete(p.id);
    clearTimeout(this.holdTimer);
    this.onPress?.(NaN, NaN);
    // 双指剩一指时不重算捏合（只剩一个点），multi 保持到全部抬起，免得松手那一下被当成点击或拖动
    if (this.ptrs.size > 0) return;
    if (this.dragging) {
      this.dragging = false;
      this.drag?.end();
    } else if (this.moved && !this.multi && performance.now() - this.lastT > 90) {
      this.vx = this.vy = 0;
    } else if (this.held) {
      this.held = false;
    } else if (isTap({ moved: this.moved, multi: this.multi, dragging: false, heldMs: performance.now() - q.t0 })) {
      const w = this.toWorld(q.x, q.y);
      this.onTap?.(w.x, w.y, !p.wasTouch);
    }
  }
}
