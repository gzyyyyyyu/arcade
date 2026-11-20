/**
 * 登陆沙滩的脉动光带：可登陆区外缘一圈金边在呼吸，两颗光点沿着边绕圈跑，选了兵种更快更亮；
 * 鼠标悬停（或手机上点到）的那一段沙滩额外更亮。画在 beachG 的填色上面，一眼看出"点哪里能派兵"。
 *
 * 全部按时间（毫秒）算，不按帧数，60 帧设计、帧率掉了也只是步子大一点；系统"减少动效"时不跑、不呼吸，只留静态亮边。
 * 路径和取最近点是纯函数（tests/beachfx.test.ts 锁住）。
 */
import type Phaser from 'phaser';
import { BEACH, ISLAND } from '../core/types.ts';
import { iso } from './iso.ts';
import { DEPTH } from './depth.ts';
import { REDUCED } from './feel.ts';


type P = { x: number; y: number };

/** 外缘一圈的四个角（格坐标，顺时针）：岛是 [-ext, ISLAND+ext)，外面一圈 BEACH 宽的沙滩 */
export function ringCorners(ext: number): P[] {
  const lo = -ext - BEACH;
  const hi = ISLAND + ext + BEACH;
  return [
    { x: lo, y: lo },
    { x: hi, y: lo },
    { x: hi, y: hi },
    { x: lo, y: hi },
  ];
}

/** 绕圈的位置：t 在 [0,1) 循环，返回格坐标（四条边等长） */
export function ringPoint(t: number, ext: number): P {
  const c = ringCorners(ext);
  const u = (((t % 1) + 1) % 1) * 4;
  const i = Math.min(3, Math.floor(u));
  const f = u - i;
  const a = c[i]!;
  const b = c[(i + 1) % 4]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** 点在登陆圈外多远（格）还算点中：画出来的海岸线是波浪形的，鼓出去的沙子和最外那条湿沙线在规则的方环外 */
export const SNAP_OUT = 0.8;
/** 点在岛内多远（格）还往外推到沙滩上：草边也是波浪形的，盖住了一点能登陆的格子 */
export const SNAP_IN = 0.4;
/** 吸附后离边界留的余量，保证取整后的格子落在方环里 */
const SNAP_EPS = 0.05;

/**
 * 出船时的落点吸附（格坐标；岛是 [-ext, ISLAND+ext)）：方环（BEACH 宽）里的点原样返回；环外 SNAP_OUT、岛内 SNAP_IN 以内的点挪到环上最近处；
 * 再远就是 null（点的是海或岛里面）。deep（已经选着船）时岛里面多深都挪到最近那条边的沙滩上：竖屏放大时一屏大半是草地，
 * 试玩里点了 4 下只出去 1 船。只在画面层用，规则照旧只认方环，发出去的坐标始终合法
 */
export function snapLanding(gx: number, gy: number, ext: number, deep = false): P | null {
  const a = -ext;
  const b = ISLAND + ext;
  const lo = a - BEACH + SNAP_EPS;
  const hi = b + BEACH - SNAP_EPS;
  const cx = Math.min(hi, Math.max(lo, gx));
  const cy = Math.min(hi, Math.max(lo, gy));
  if (Math.hypot(gx - cx, gy - cy) > SNAP_OUT) return null;
  // 岛内：离四条边最近的那条有多远
  const inX = Math.min(cx - a, b - cx);
  const inY = Math.min(cy - a, b - cy);
  if (cx > a && cx < b && cy > a && cy < b) {
    if (!deep && Math.min(inX, inY) > SNAP_IN) return null;
    const mid = ISLAND / 2;
    if (inX <= inY) return { x: cx < mid ? a - SNAP_EPS : b + SNAP_EPS, y: cy };
    return { x: cx, y: cy < mid ? a - SNAP_EPS : b + SNAP_EPS };
  }
  return { x: cx, y: cy };
}

/** 离某个格坐标最近的圈上位置 t */
export function ringNearest(gx: number, gy: number, ext: number): number {
  const c = ringCorners(ext);
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = c[i]!;
    const b = c[(i + 1) % 4]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const f = Math.max(0, Math.min(1, ((gx - a.x) * dx + (gy - a.y) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(gx - (a.x + dx * f), gy - (a.y + dy * f));
    if (d < bd) {
      bd = d;
      best = (i + f) / 4;
    }
  }
  return best;
}

export class BeachGlow {
  private g: Phaser.GameObjects.Graphics;
  /** 悬停的格中心（格坐标）；没悬停是 null */
  hover: P | null = null;
  /** 平滑后的悬停亮度 0..1（进出渐变，不闪） */
  private hk = 0;
  private ht = 0;
  /** 选了兵种的强度 0..1（平滑） */
  private sk = 0;
  private lastT = -1;

  /** 岛扩了几圈（这一局的 state.ext） */
  private readonly ext: number;

  constructor(scene: Phaser.Scene, ext: number) {
    this.ext = ext;
    this.g = scene.add.graphics().setDepth(DEPTH.floorOverlay + 0.5).setVisible(false);
  }

  destroy(): void {
    this.g.destroy();
  }

  /** time 毫秒；selected = 选着兵种；zoom = 镜头缩放÷渲染倍数（线宽按它补，远景也看得见） */
  update(time: number, on: boolean, selected: boolean, zoom: number): void {
    const g = this.g;
    if (!on) {
      if (g.visible) g.clear().setVisible(false);
      this.lastT = -1;
      return;
    }
    const dt = this.lastT < 0 ? 16 : Math.min(100, time - this.lastT);
    this.lastT = time;
    const k = 1 - Math.exp(-dt / 120);
    this.sk += ((selected ? 1 : 0) - this.sk) * k;
    if (this.hover) this.ht = ringNearest(this.hover.x, this.hover.y, this.ext);
    this.hk += ((this.hover && selected ? 1 : 0) - this.hk) * k;
    g.setVisible(true).clear();
    const w = Math.max(1, Math.min(2.4, 1 / Math.max(0.01, zoom)));
    const breath = REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin((time / (selected ? 650 : 1000)) * Math.PI * 2);
    const ring = (width: number, color: number, alpha: number): void => {
      const c = ringCorners(this.ext);
      g.lineStyle(width * w, color, alpha);
      g.beginPath();
      const p0 = iso(c[0]!.x, c[0]!.y);
      g.moveTo(p0.x, p0.y);
      for (let i = 1; i <= 4; i++) {
        const p = iso(c[i % 4]!.x, c[i % 4]!.y);
        g.lineTo(p.x, p.y);
      }
      g.strokePath();
    };
    const s = this.sk;
    // 可登陆的沙滩整体铺一层浅金色，随呼吸起伏；选了兵种明显更亮（出兵区高亮）。减少动效时是静态的一层
    const a = -this.ext;
    const b = ISLAND + this.ext;
    const lo = a - BEACH;
    const hi = b + BEACH;
    g.fillStyle(0xffe27a, (0.07 + 0.07 * breath) * (1 + 1.6 * s));
    for (const q of [
      [lo, lo, hi, a],
      [lo, b, hi, hi],
      [lo, a, a, b],
      [b, a, hi, b],
    ] as const) {
      const pts = [iso(q[0], q[1]), iso(q[2], q[1]), iso(q[2], q[3]), iso(q[0], q[3])];
      g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
    }
    // 外缘光带：宽的柔光 + 窄的亮芯，随呼吸起伏；选了兵种再加粗加亮
    ring((16 + 10 * breath) * (1 + 0.6 * s), 0xffd86a, (0.14 + 0.1 * breath) * (0.8 + 0.8 * s));
    ring(7 + 4 * s, 0xffe885, Math.min(1, 0.35 + 0.25 * breath + 0.3 * s));
    // 绕圈跑的光点（带拖尾）：选了兵种两颗、跑得更快；没选一颗慢慢走。减少动效时不跑
    if (!REDUCED) {
      const n = s > 0.5 ? 2 : 1;
      const speed = 1 / (s > 0.5 ? 5200 : 9000);
      for (let j = 0; j < n; j++) {
        const head = time * speed + j / n;
        this.comet(head, 0.1, 0xfff2b0, 0.55 + 0.4 * s, w);
      }
    }
    // 悬停那一段更亮
    if (this.hk > 0.02 && this.hover) {
      this.comet(this.ht + 0.09, 0.18, 0xffffff, this.hk, w, 0.6);
      // 悬着的那一格自己也亮起来
      const c = this.hover;
      const cell = [iso(c.x - 0.5, c.y - 0.5), iso(c.x + 0.5, c.y - 0.5), iso(c.x + 0.5, c.y + 0.5), iso(c.x - 0.5, c.y + 0.5)];
      g.fillStyle(0xfff0a0, (0.35 + 0.15 * breath) * this.hk).fillPoints(cell as unknown as Phaser.Math.Vector2[], true);
    }
  }

  /** 沿圈画一段渐隐的亮线：head 是头（t），len 是拖尾长度（占整圈）；center 时头在中间向两头渐隐 */
  private comet(head: number, len: number, color: number, alpha: number, w: number, center = 0): void {
    const g = this.g;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = i / N;
      const b = (i + 1) / N;
      // 拖尾：越靠头越亮；center 模式两头都渐隐
      const f = center ? Math.sin(((a + b) / 2) * Math.PI) : (a + b) / 2;
      const p = ringPoint(head - len * (1 - a), this.ext);
      const q = ringPoint(head - len * (1 - b), this.ext);
      const A = iso(p.x, p.y);
      const B = iso(q.x, q.y);
      g.lineStyle((center ? 14 : 5 + 5 * f) * w, color, alpha * f);
      g.beginPath();
      g.moveTo(A.x, A.y);
      g.lineTo(B.x, B.y);
      g.strokePath();
    }
  }
}
