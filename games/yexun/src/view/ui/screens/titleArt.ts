import { drawFlakes, drawModeScene, drawTitleLive, drawTitleStill, makeFlakes, type Flake } from '../../art/sprites-title.ts';

/** 模式卡上的小场景图（画一次缓存成 data URL） */
const sceneCache = new Map<string, string>();
export function sceneUrl(kind: 'watch' | 'raid', w: number, h: number): string {
  const key = `${kind}${w}x${h}`;
  let u = sceneCache.get(key);
  if (!u) {
    const cv = document.createElement('canvas');
    cv.width = w * 2;
    cv.height = h * 2;
    const c = cv.getContext('2d')!;
    c.scale(2, 2);
    drawModeScene(c, w, h, kind);
    u = cv.toDataURL();
    sceneCache.set(key, u);
  }
  return u;
}

/** 主视觉（月、灯笼、飘雪）：静底图画一次，动的（月晕、灯笼、飘雪）每帧叠；尺寸变了才重画底图。设备像素最多 2 倍（省内存设备同） */
export class TitleArt {
  readonly canvas: HTMLCanvasElement;
  private raf = 0;
  private artSize = '';
  private still: HTMLCanvasElement | null = null;
  private info: ReturnType<typeof drawTitleStill> | null = null;
  private flakes: Flake[] = [];
  private last = 0;

  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'yx-art';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  start(): void {
    cancelAnimationFrame(this.raf);
    const frame = (now: number): void => {
      const w = this.host.clientWidth;
      const h = this.host.clientHeight;
      if (w < 2 || h < 2) {
        this.raf = requestAnimationFrame(frame);
        return;
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const sizeKey = `${w}x${h}@${dpr}`;
      if (sizeKey !== this.artSize) {
        this.artSize = sizeKey;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        const st = document.createElement('canvas');
        st.width = this.canvas.width;
        st.height = this.canvas.height;
        const sc = st.getContext('2d')!;
        sc.scale(dpr, dpr);
        // 菜单内容的起点（含 safe-area），竖屏时灯笼挂在它下面
        this.info = drawTitleStill(sc, w, h, parseFloat(getComputedStyle(this.host).paddingTop) || undefined, this.host.classList.contains('yx-selscreen'));
        this.still = st;
        this.flakes = makeFlakes(w < 600 ? 50 : 90, w, h);
      }
      const c = this.canvas.getContext('2d')!;
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
      this.last = now;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(this.still!, 0, 0);
      c.scale(dpr, dpr);
      drawTitleLive(c, w, h, this.info!, now);
      drawFlakes(c, this.flakes, w, h, dt, now);
      this.raf = requestAnimationFrame(frame);
    };
    this.last = 0;
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
