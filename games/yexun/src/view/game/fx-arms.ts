/**
 * 2.0 第一批法器（阵旗、勾魂锁、竹篙、长明灯）和十个搭配的画面与声音。
 * 只读核心发的 ArmEv 事件（core/arms/events.ts），不碰规则：事件来了登记一条"有寿命的特效"，
 * 每帧按已过的时间在两层 Graphics 上重画（地面层在怪脚下，空中层在最上面），寿命到了就丢。
 * 和 GameScene 里的光波、绳子同一个做法（不建补间：阵旗这类整局常驻的东西一拍可能来好几条）。
 * 雪地很亮：全部用饱和色加深色边、普通混合，不用 ADD。省内存模式（?lowmem）不放粒子，旗、圈照画。
 */
import type Phaser from 'phaser';
import { ArmEv, ArmFx } from '../../core/arms/events.ts';
import { COS, SIN } from '../../core/dirs.ts';
import { sfx } from '../audio/sfx.ts';
import '../audio/sfx-arms.ts';
import type { Fx } from './fx.ts';

/** 一拍的毫秒数（核心每秒 30 拍） */
const TICK = 1000 / 30;
const INK = 0x17131c;
const GOLD = 0xf2c94c;
const GOLD_D = 0x7a4a0a;
const WATER = 0x4ab4ff;
const WATER_D = 0x1f5fb8;
const FOAM = 0xe8f8ff;
const FLAME = 0xffb02e;
const FLAME_D = 0xd8601a;
const TAU = Math.PI * 2;

type Kind =
  | 'zone' | 'freeze' | 'chain' | 'pull' | 'thrust' | 'trail' | 'lamp'
  | 'leijie' | 'hejin' | 'qiankun' | 'qianjian' | 'heling' | 'yiwei' | 'chenzhong' | 'huadeng' | 'dudeng' | 'liangyi';

interface E {
  k: Kind;
  x: number;
  y: number;
  a: number;
  b: number;
  c: number;
  /** 已过去的毫秒 / 总寿命 */
  t: number;
  max: number;
  /** 出手时主角的位置（锁链从这里甩出） */
  hx: number;
  hy: number;
  /** 这条特效自己的一点随机（花瓣、纸鹤的起点），生成时定下，不每帧重抽 */
  seed: number;
  /** 闪电的折线 */
  pts: number[] | null;
}

const MAX_LIVE = 160;
const MAX_TRAIL = 60;
/** 四边形（8 个数：四个顶点）：拆成两个三角形填色；stroke 为真时描边 */
function quad(g: Phaser.GameObjects.Graphics, q: number[], stroke: boolean): void {
  g.fillTriangle(q[0]!, q[1]!, q[2]!, q[3]!, q[4]!, q[5]!);
  g.fillTriangle(q[0]!, q[1]!, q[4]!, q[5]!, q[6]!, q[7]!);
  if (!stroke) return;
  g.beginPath();
  g.moveTo(q[0]!, q[1]!);
  g.lineTo(q[2]!, q[3]!);
  g.lineTo(q[4]!, q[5]!);
  g.lineTo(q[6]!, q[7]!);
  g.closePath();
  g.strokePath();
}
const ease = (p: number): number => 1 - (1 - p) * (1 - p);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
/** 淡入淡出：前 inP 淡入，后 outP 淡出 */
const envelope = (p: number, inP: number, outP: number): number => (p < inP ? p / inP : p > 1 - outP ? Math.max(0, (1 - p) / outP) : 1);

export class ArmsFxView {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly air: Phaser.GameObjects.Graphics;
  private list: E[] = [];
  private clock = 0;
  /** 这一批事件里已经响过的声音：同一批同一种只响一次 */
  private said = new Set<string>();
  private pullN = 0;
  private freezeN = 0;

  private readonly fx: Fx;
  private readonly lowMem: boolean;

  constructor(scene: Phaser.Scene, fx: Fx, lowMem: boolean) {
    this.fx = fx;
    this.lowMem = lowMem;
    this.ground = scene.add.graphics().setDepth(-290);
    this.air = scene.add.graphics().setDepth(7900);
  }

  destroy(): void {
    this.ground.destroy();
    this.air.destroy();
  }

  /** 一批事件开始读之前调用（重置同批限频） */
  begin(): void {
    this.said.clear();
    this.pullN = 0;
    this.freezeN = 0;
  }

  private say(name: Parameters<typeof sfx.play>[0], volume = 0.6): void {
    if (this.said.has(name)) return;
    this.said.add(name);
    sfx.play(name, { volume });
  }

  private add(k: Kind, x: number, y: number, a: number, b: number, c: number, max: number, hx: number, hy: number): E | null {
    if (this.list.length >= MAX_LIVE) return null;
    const e: E = { k, x, y, a, b, c, t: 0, max, hx, hy, seed: Math.random(), pts: null };
    this.list.push(e);
    return e;
  }

  /** 读一条事件；是本批的事件返回 true。(hx, hy) 是主角此刻的位置 */
  handle(type: number, x: number, y: number, a: number, b: number, c: number, hx: number, hy: number): boolean {
    switch (type) {
      case ArmEv.Zone: {
        const ticks = Math.max(6, c);
        if (a === 1) this.say('armZone4', 0.7);
        this.add('zone', x, y, a, b, c, ticks * TICK, hx, hy);
        return true;
      }
      case ArmEv.Freeze:
        if (this.freezeN++ < (this.lowMem ? 6 : 14)) {
          this.say('armFreeze', 0.5);
          this.add('freeze', x, y, a, 0, 0, 420, hx, hy);
        }
        return true;
      case ArmEv.Chain:
        if (a === 1) this.say('armChainEvo', 0.7);
        this.add('chain', x, y, a, b, c, 460, hx, hy);
        return true;
      case ArmEv.Pull:
        if (this.pullN++ < (this.lowMem ? 6 : 16)) this.add('pull', x, y, a, b, c, 340, hx, hy);
        return true;
      case ArmEv.Thrust: {
        if (c === 1) this.say('armPoleEvo', 0.7);
        if (this.add('thrust', x, y, a, b, c, 380, hx, hy) && !this.lowMem) this.splashAt(x + COS[a & 255]! * b, y - 16 + SIN[a & 255]! * b, c === 1 ? 12 : 6);
        return true;
      }
      case ArmEv.Trail: {
        let n = 0;
        for (const e of this.list) if (e.k === 'trail') n++;
        if (n < MAX_TRAIL) this.add('trail', x, y, a, b, c, Math.max(6, b) * TICK, hx, hy);
        return true;
      }
      case ArmEv.Lamp:
        if (a === 1) this.say('armLampBig', 0.6);
        // 小灯每拍重发：只画当拍，略长于一拍，连起来不闪
        this.add('lamp', x, y, a, b, c, a === 2 ? TICK * 1.6 : Math.max(6, c) * TICK, hx, hy);
        return true;
      case ArmEv.Combo:
        // 编号 10 起是第二批的搭配（fx-arms2.ts）
        if (a >= 10) return false;
        this.combo(x, y, a, b, hx, hy);
        return true;
      default:
        return false;
    }
  }

  private combo(x: number, y: number, fxId: number, b: number, hx: number, hy: number): void {
    switch (fxId) {
      case ArmFx.Leijie: {
        this.say('armLeijie');
        const e = this.add('leijie', x, y, 0, b, 0, 280, hx, hy);
        if (e) {
          const x0 = x + (Math.random() - 0.5) * 60;
          const pts: number[] = [];
          for (let k = 0; k <= 6; k++) pts.push(lerp(x0, x, k / 6) + (k > 0 && k < 6 ? (Math.random() - 0.5) * 30 : 0), lerp(y - 130, y - 20, k / 6));
          e.pts = pts;
        }
        break;
      }
      case ArmFx.Hejin: this.say('armHejin'); this.add('hejin', x, y, 0, b, 0, b > 0 ? 700 : 320, hx, hy); break;
      case ArmFx.Qiankun: this.say('armQiankun', 0.7); this.add('qiankun', x, y, 0, b, 0, 620, hx, hy); break;
      case ArmFx.Qianjian: this.say('armQianjian'); this.add('qianjian', x, y, 0, b, 0, 440, hx, hy); break;
      case ArmFx.Heling: this.say('armHeling'); this.add('heling', x, y, 0, b, 0, 620, hx, hy); break;
      case ArmFx.Yiwei: this.say('armYiwei'); this.add('yiwei', x, y, 0, b, 0, 640, hx, hy); break;
      case ArmFx.Chenzhong: this.say('armChenzhong'); this.add('chenzhong', x, y, 0, b, 0, 800, hx, hy); break;
      case ArmFx.Huadeng: this.say('armHuadeng'); this.add('huadeng', x, y, 0, b, 0, 760, hx, hy); break;
      case ArmFx.Dudeng: this.say('armDudeng'); this.add('dudeng', x, y, 0, b, 0, 480, hx, hy); break;
      case ArmFx.Liangyi: this.say('armLiangyi'); this.add('liangyi', x, y, 0, b, 0, 600, hx, hy); break;
    }
  }

  /** 溅水：几滴水珠（粒子，省内存模式不放） */
  private splashAt(x: number, y: number, n: number): void {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * TAU;
      const v = 90 + Math.random() * 120;
      this.fx.spawn({ frame: 'mote', x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 90, g: 420, life: 380, s0: 0.7, s1: 0.2, a0: 1, a1: 0, tint: k % 2 ? WATER : FOAM });
    }
  }

  /** 每帧：推进寿命、重画。dt 毫秒 */
  update(dt: number): void {
    const gg = this.ground;
    const ag = this.air;
    gg.clear();
    ag.clear();
    this.clock += dt;
    if (this.list.length === 0) return;
    let w = 0;
    for (const e of this.list) {
      e.t += dt;
      if (e.t >= e.max) continue;
      this.list[w++] = e;
      const p = e.t / e.max;
      switch (e.k) {
        case 'zone': this.drawZone(gg, ag, e, p); break;
        case 'freeze': this.drawFreeze(ag, e, p); break;
        case 'chain': this.drawChain(gg, ag, e, p); break;
        case 'pull': this.drawPull(ag, e, p); break;
        case 'thrust': this.drawThrust(gg, ag, e, p); break;
        case 'trail': this.drawTrail(gg, e, p); break;
        case 'lamp': this.drawLamp(gg, ag, e, p); break;
        case 'leijie': this.drawLeijie(gg, ag, e, p); break;
        case 'hejin': this.drawHejin(ag, e, p); break;
        case 'qiankun': this.drawQiankun(gg, e, p); break;
        case 'qianjian': this.drawQianjian(gg, ag, e, p); break;
        case 'heling': this.drawHeling(gg, ag, e, p); break;
        case 'yiwei': this.drawYiwei(gg, e, p); break;
        case 'chenzhong': this.drawChenzhong(gg, ag, e, p); break;
        case 'huadeng': this.drawHuadeng(ag, e, p); break;
        case 'dudeng': this.drawDudeng(gg, ag, e, p); break;
        case 'liangyi': this.drawLiangyi(gg, e, p); break;
      }
    }
    this.list.length = w;
  }

  // ───────────────────────── 小零件 ─────────────────────────

  /** 一面旗：(x, y) 是旗杆根，h 高；旗面朝右飘 */
  private flag(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number, color: number, alpha: number): void {
    g.lineStyle(5, INK, alpha);
    g.lineBetween(x, y, x, y - h);
    g.lineStyle(2.4, 0xc9a35a, alpha);
    g.lineBetween(x, y, x, y - h);
    const fl = Math.sin(this.clock * 0.012 + x * 0.05) * h * 0.1;
    const w = h * 0.72;
    const top = y - h;
    const bot = y - h * 0.46;
    g.fillStyle(color, alpha);
    g.fillTriangle(x + 1, top, x + w, top + (bot - top) * 0.5 + fl, x + 1, bot);
    g.lineStyle(2.4, INK, alpha);
    g.strokeTriangle(x + 1, top, x + w, top + (bot - top) * 0.5 + fl, x + 1, bot);
  }

  /** 一串锁链（从 (x0, y0) 画到 (x1, y1) 的 prog 处）：深色边的短节，黑白（或金）交替 */
  private chainLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, prog: number, wd: number, evo: boolean, alpha: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const reach = len * prog;
    const seg = 9 + wd;
    const n = Math.min(40, Math.ceil(reach / seg));
    for (let i = 0; i < n; i++) {
      const s0 = i * seg;
      const s1 = Math.min(reach, s0 + seg - 3);
      if (s1 <= s0) break;
      const col = i % 2 ? (evo ? GOLD : 0xf4f6fb) : (evo ? 0x2a2f3a : 0x3a4050);
      g.lineStyle(wd + 3.5, INK, alpha);
      g.lineBetween(x0 + ux * s0, y0 + uy * s0, x0 + ux * s1, y0 + uy * s1);
      g.lineStyle(wd, col, alpha);
      g.lineBetween(x0 + ux * s0, y0 + uy * s0, x0 + ux * s1, y0 + uy * s1);
    }
  }

  /** 一只纸鹤（朝右）：白纸身 + 两翅上下扇 + 红嘴，深色边 */
  private crane(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, face: number, alpha: number): void {
    const fl = Math.sin(this.clock * 0.04 + x) * 5 * s;
    const f = face >= 0 ? 1 : -1;
    g.fillStyle(0xf4ecd4, alpha);
    g.lineStyle(2.2, INK, alpha);
    // 身体
    g.fillTriangle(x - 9 * s * f, y + 2 * s, x + 6 * s * f, y - 3 * s, x + 4 * s * f, y + 4 * s);
    g.strokeTriangle(x - 9 * s * f, y + 2 * s, x + 6 * s * f, y - 3 * s, x + 4 * s * f, y + 4 * s);
    // 翅
    g.fillStyle(0xffffff, alpha);
    g.fillTriangle(x - 2 * s * f, y, x - 6 * s * f, y - 10 * s - fl, x + 3 * s * f, y - 2 * s);
    g.strokeTriangle(x - 2 * s * f, y, x - 6 * s * f, y - 10 * s - fl, x + 3 * s * f, y - 2 * s);
    // 颈和嘴
    g.fillStyle(0xd8402f, alpha);
    g.fillTriangle(x + 6 * s * f, y - 3 * s, x + 11 * s * f, y - 7 * s, x + 7 * s * f, y - 5 * s);
  }

  /** 一朵火苗：(x, y) 是火底 */
  private flame(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, alpha: number): void {
    const fl = Math.sin(this.clock * 0.02 + x * 0.3) * 1.5 * s;
    g.fillStyle(FLAME, alpha);
    g.fillCircle(x, y - 4 * s, 4.6 * s);
    g.fillTriangle(x - 4.2 * s, y - 5 * s, x + 4.2 * s, y - 5 * s, x + fl, y - 15 * s);
    g.lineStyle(2, FLAME_D, alpha);
    g.strokeTriangle(x - 4.2 * s, y - 5 * s, x + 4.2 * s, y - 5 * s, x + fl, y - 15 * s);
    g.fillStyle(0xfff3b0, alpha);
    g.fillCircle(x, y - 3.4 * s, 2.4 * s);
  }

  // ───────────────────────── 阵旗 ─────────────────────────

  private drawZone(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const { x, y, b } = e;
    const big = e.a === 1;
    const k = envelope(p, 0.12, 0.3) * (e.a === 2 ? 0.55 : 1);
    const fill = big ? GOLD : 0xd8402f;
    const edge = big ? GOLD_D : 0x5a1410;
    // 地面方阵：淡淡的底色 + 深色粗边 + 亮线 + 里面的纹（九宫格 + 对角 + 圆）
    gg.fillStyle(fill, 0.13 * k);
    gg.fillRect(x - b, y - b, b * 2, b * 2);
    gg.lineStyle(7, edge, 0.6 * k);
    gg.strokeRect(x - b, y - b, b * 2, b * 2);
    gg.lineStyle(3, big ? 0xfff0a0 : GOLD, 0.95 * k);
    gg.strokeRect(x - b, y - b, b * 2, b * 2);
    gg.lineStyle(2, edge, 0.5 * k);
    gg.strokeRect(x - b / 3, y - b / 3, (b * 2) / 3, (b * 2) / 3);
    gg.lineBetween(x - b, y - b, x + b, y + b);
    gg.lineBetween(x - b, y + b, x + b, y - b);
    gg.strokeCircle(x, y, b * 0.55);
    if (big) {
      // 四象大阵：外面再套一圈，圈上四个点
      gg.lineStyle(3, edge, 0.5 * k);
      gg.strokeCircle(x, y, b * 1.12);
      for (let i = 0; i < 4; i++) gg.fillStyle(GOLD, 0.9 * k).fillCircle(x + COS[i * 64]! * b * 1.12, y + SIN[i * 64]! * b * 1.12, 4);
    }
    // 四角的旗：先落地（头 160ms 从上往下插）
    const drop = Math.max(0, 1 - e.t / 160);
    const h = e.a === 2 ? 22 : big ? 40 : 32;
    const cols = big ? [0x3a8fe0, 0x3a9a5a, GOLD, 0xd8402f] : [0xd8402f, 0xd8402f, 0xd8402f, 0xd8402f];
    const cx = [x - b, x + b, x + b, x - b];
    const cy = [y - b, y - b, y + b, y + b];
    const al = Math.min(1, envelope(p, 0.04, 0.25) + 0.05);
    for (let i = 0; i < 4; i++) this.flag(ag, cx[i]!, cy[i]! - drop * drop * 60, h, cols[i]!, al * (e.a === 2 ? 0.7 : 1));
    if (big) {
      // 旗间连线：旗尖之间一道发光的线，轻轻一明一暗
      const pulse = 0.65 + 0.35 * Math.sin(this.clock * 0.012);
      for (const [wd, col, al2] of [[7, INK, 0.5], [3.5, 0xfff0a0, 0.95]] as const) {
        ag.lineStyle(wd, col, al2 * k * pulse);
        ag.beginPath();
        ag.moveTo(cx[0]!, cy[0]! - h);
        for (let i = 1; i <= 4; i++) ag.lineTo(cx[i % 4]!, cy[i % 4]! - h);
        ag.strokePath();
      }
    }
  }

  private drawFreeze(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    const y = e.y - 44;
    ag.fillStyle(0xbfeaff, 0.35 * k);
    ag.fillCircle(e.x, y, 12 + 8 * p);
    ag.lineStyle(5, INK, 0.7 * k);
    ag.strokeCircle(e.x, y, 15 + 6 * p);
    ag.lineStyle(2.6, 0x7fd8ff, k);
    ag.strokeCircle(e.x, y, 15 + 6 * p);
    if (this.lowMem) return;
    // 三张定身符绕着转
    for (let i = 0; i < 3; i++) {
      const ang = this.clock * 0.008 + (i * TAU) / 3;
      const px = e.x + Math.cos(ang) * 16;
      const py = y + Math.sin(ang) * 8;
      ag.fillStyle(GOLD, k);
      ag.fillRect(px - 2.5, py - 5, 5, 10);
      ag.lineStyle(1.6, INK, k);
      ag.strokeRect(px - 2.5, py - 5, 5, 10);
    }
  }

  // ───────────────────────── 勾魂锁 ─────────────────────────

  private drawChain(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const evo = e.a === 1;
    const k = envelope(p, 0.05, 0.45);
    // 主角甩向锚点的一条链：头 25% 伸出去
    this.chainLine(ag, e.hx, e.hy - 24, e.x, e.y, Math.min(1, p / 0.25), evo ? 7 : 5, evo, k);
    // 锚点的圈：从抓取半径收到一小圈；黑白（进化是黑金）链节围成
    const r = Math.max(14, lerp(Math.max(30, e.b), 20, ease(Math.min(1, p / 0.7))));
    const segs = 14;
    gg.fillStyle(evo ? GOLD : 0xcfd6e4, 0.16 * k);
    gg.fillCircle(e.x, e.y, r);
    for (let i = 0; i < segs; i++) {
      const a0 = (i * TAU) / segs + 0.04 + p * 0.8;
      const a1 = ((i + 1) * TAU) / segs - 0.04 + p * 0.8;
      const col = i % 2 ? (evo ? GOLD : 0xf4f6fb) : (evo ? 0x2a2f3a : 0x3a4050);
      for (const [wd, c] of [[(evo ? 11 : 8) + 3, INK], [evo ? 11 : 8, col]] as const) {
        gg.lineStyle(wd, c, k);
        gg.beginPath();
        gg.arc(e.x, e.y, r, a0, a1);
        gg.strokePath();
      }
    }
    if (evo) {
      gg.lineStyle(2.5, 0xfff0a0, 0.8 * k);
      gg.strokeCircle(e.x, e.y, r + 9);
    }
  }

  private drawPull(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const evo = e.c === 1;
    const k = envelope(p, 0.05, 0.5);
    const q = ease(Math.min(1, p / 0.6));
    const mx = lerp(e.x, e.a, q);
    const my = lerp(e.y, e.b, q);
    // 怪原位到新位的拖影，再接一条链（主角 → 怪当前位置）
    ag.lineStyle(14, INK, 0.2 * k);
    ag.lineBetween(e.x, e.y - 18, mx, my - 18);
    ag.lineStyle(9, evo ? 0xfff0a0 : 0xcfd6e4, 0.45 * k);
    ag.lineBetween(e.x, e.y - 18, mx, my - 18);
    this.chainLine(ag, e.hx, e.hy - 24, mx, my - 16, 1, evo ? 4 : 3, evo, k);
  }

  // ───────────────────────── 竹篙 ─────────────────────────

  private drawThrust(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const evo = e.c === 1;
    const ux = COS[e.a & 255]!;
    const uy = SIN[e.a & 255]!;
    const full = e.b;
    // 戳出去（头 35%）、停一下、收回一点
    const reach = full * (p < 0.35 ? ease(p / 0.35) : p < 0.6 ? 1 : 1 - ((p - 0.6) / 0.4) * 0.5);
    const sx = e.x;
    const sy = e.y - 16;
    const ex = sx + ux * reach;
    const ey = sy + uy * reach;
    const k = envelope(p, 0.05, 0.4);
    // 地面的水纹带：沿篙的方向一道亮蓝带，深蓝边，白色水线
    const hw = evo ? 24 : 15;
    const nx = -uy;
    const ny = ux;
    const fx = e.x + ux * full;
    const fy = e.y + uy * full;
    gg.fillStyle(WATER, 0.28 * k);
    quad(gg, [e.x + nx * hw, e.y + ny * hw, fx + nx * hw, fy + ny * hw, fx - nx * hw, fy - ny * hw, e.x - nx * hw, e.y - ny * hw], false);
    for (const s of [1, -1]) {
      gg.lineStyle(4, WATER_D, 0.7 * k);
      gg.lineBetween(e.x + nx * hw * s, e.y + ny * hw * s, fx + nx * hw * s, fy + ny * hw * s);
      gg.lineStyle(2, FOAM, 0.9 * k);
      gg.lineBetween(e.x + nx * hw * 0.7 * s, e.y + ny * hw * 0.7 * s, fx + nx * hw * 0.7 * s, fy + ny * hw * 0.7 * s);
    }
    // 篙影：竹篙本身，深色边 + 竹绿 + 亮线 + 竹节
    const wd = evo ? 8 : 5.5;
    ag.lineStyle(wd + 4, INK, k);
    ag.lineBetween(sx, sy, ex, ey);
    ag.lineStyle(wd, 0x7fb04a, k);
    ag.lineBetween(sx, sy, ex, ey);
    ag.lineStyle(1.6, 0xc9e88a, k);
    ag.lineBetween(sx - ny, sy + nx, ex - ny, ey + nx);
    for (let d = 26; d < reach; d += 28) {
      ag.lineStyle(2.4, 0x4a7a2a, k);
      ag.lineBetween(sx + ux * d + nx * wd * 0.6, sy + uy * d + ny * wd * 0.6, sx + ux * d - nx * wd * 0.6, sy + uy * d - ny * wd * 0.6);
    }
    // 篙尖的水花圈
    const rr = 10 + 18 * p * (evo ? 1.5 : 1);
    ag.lineStyle(4, WATER_D, 0.8 * k);
    ag.strokeEllipse(ex, ey + 14, rr * 2, rr * 1.1);
    ag.lineStyle(2, FOAM, k);
    ag.strokeEllipse(ex, ey + 14, rr * 2, rr * 1.1);
  }

  private drawTrail(gg: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = envelope(p, 0.08, 0.5);
    const r = e.a;
    gg.fillStyle(WATER, 0.22 * k);
    gg.fillCircle(e.x, e.y, r);
    gg.lineStyle(4, WATER_D, 0.5 * k);
    gg.strokeCircle(e.x, e.y, r);
    gg.lineStyle(2, FOAM, 0.75 * k);
    gg.strokeCircle(e.x, e.y, r * 0.62);
    if (e.c === 1) {
      // 水痕上的灯点：暖黄的小火点，轻轻闪
      for (let i = 0; i < 3; i++) {
        const ang = e.seed * TAU + (i * TAU) / 3;
        const fl = 0.75 + 0.25 * Math.sin(this.clock * 0.015 + i * 2);
        const px = e.x + Math.cos(ang) * r * 0.5;
        const py = e.y + Math.sin(ang) * r * 0.5;
        gg.fillStyle(0xffd34a, 0.28 * k * fl);
        gg.fillCircle(px, py, 10);
        gg.fillStyle(0xffd34a, k);
        gg.fillCircle(px, py, 3.6);
        gg.lineStyle(1.8, FLAME_D, k);
        gg.strokeCircle(px, py, 3.6);
      }
    }
  }

  // ───────────────────────── 长明灯 ─────────────────────────

  private drawLamp(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const small = e.a === 2;
    const k = small ? 0.9 : envelope(p, 0.1, 0.25);
    const r = e.b;
    // 光晕：三层暖黄由外到内加深，外沿一圈橙边（雪地上要看得见）
    gg.fillStyle(0xffd96a, 0.1 * k);
    gg.fillCircle(e.x, e.y, r);
    gg.fillStyle(0xffd96a, 0.1 * k);
    gg.fillCircle(e.x, e.y, r * 0.66);
    gg.fillStyle(0xfff0a0, 0.14 * k);
    gg.fillCircle(e.x, e.y, r * 0.33);
    gg.lineStyle(5, 0x7a4a20, 0.3 * k);
    gg.strokeCircle(e.x, e.y, r);
    gg.lineStyle(2.4, FLAME, 0.75 * k);
    gg.strokeCircle(e.x, e.y, r);
    this.flame(ag, e.x, e.y - 10, small ? 0.8 : 1.15, k);
    if (e.a === 1) {
      // 万家灯火：外圈一串红灯笼，慢慢转
      const n = 8;
      for (let i = 0; i < n; i++) {
        const ang = this.clock * 0.0006 + (i * TAU) / n;
        const px = e.x + Math.cos(ang) * r;
        const py = e.y + Math.sin(ang) * r * 0.9;
        gg.fillStyle(0xffe48a, 0.3 * k);
        gg.fillCircle(px, py, 11);
        gg.fillStyle(0xd8402f, k);
        gg.fillEllipse(px, py, 11, 9);
        gg.lineStyle(2, 0x5a1410, k);
        gg.strokeEllipse(px, py, 11, 9);
        gg.fillStyle(GOLD, k);
        gg.fillRect(px - 2.5, py - 6, 5, 2);
      }
    }
  }

  // ───────────────────────── 搭配 ─────────────────────────

  private drawLeijie(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    const pts = e.pts;
    if (pts && p < 0.7) {
      for (const [wd, c] of [[10, 0x23306a], [5.5, 0x55c8ff], [2.2, 0xffffff]] as const) {
        ag.lineStyle(wd, c, Math.min(1, k * 1.4));
        ag.beginPath();
        ag.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i < pts.length; i += 2) ag.lineTo(pts[i]!, pts[i + 1]!);
        ag.strokePath();
      }
    }
    gg.fillStyle(0xbfe6ff, 0.35 * k);
    gg.fillCircle(e.x, e.y, 10 + 20 * p);
    gg.lineStyle(4, 0x23306a, k);
    gg.strokeCircle(e.x, e.y, 10 + 20 * p);
    gg.lineStyle(2, 0x55c8ff, k);
    gg.strokeCircle(e.x, e.y, 10 + 20 * p);
  }

  private drawHejin(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    if (e.b > 0) {
      // 盾碎：一只纸鹤绕着俯冲一圈
      const R = Math.min(120, Math.max(40, e.b));
      const ang = e.seed * TAU + p * TAU;
      const dive = Math.sin(p * Math.PI);
      const cx = e.x + Math.cos(ang) * R * (1 - 0.35 * dive);
      const cy = e.y - 30 + Math.sin(ang) * R * 0.5 + dive * 22;
      this.crane(ag, cx, cy, 1.5, -Math.sin(ang), envelope(p, 0.08, 0.2));
      return;
    }
    // 啄一下：从上方俯冲到目标，再飞回
    const q = p < 0.5 ? ease(p / 0.5) : 1 - ease((p - 0.5) / 0.5);
    this.crane(ag, lerp(e.x - 20, e.x, q), lerp(e.y - 52, e.y - 16, q), 1.3, 1, envelope(p, 0.1, 0.25));
  }

  private drawQiankun(gg: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const R = e.b > 0 ? e.b : 120;
    const r = lerp(20, R, ease(p));
    const k = envelope(p, 0.05, 0.5);
    gg.fillStyle(0x3a4a8a, 0.14 * k);
    gg.fillCircle(e.x, e.y, r);
    gg.lineStyle(10, 0x1a2450, 0.85 * k);
    gg.strokeCircle(e.x, e.y, r);
    gg.lineStyle(4.5, GOLD, k);
    gg.strokeCircle(e.x, e.y, r);
    // 八卦：圈上八组三道短线（实线 / 断线），朝外
    const bits = [7, 3, 5, 1, 6, 2, 4, 0];
    for (let i = 0; i < 8; i++) {
      const ang = (i * TAU) / 8 + p * 0.6;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      for (let j = 0; j < 3; j++) {
        const d = r + 8 + j * 6;
        const px = e.x + cs * d;
        const py = e.y + sn * d;
        const half = 6;
        const solid = ((bits[i]! >> j) & 1) === 1;
        gg.lineStyle(3, j === 0 ? 0x1a2450 : 0x1a2450, 0.9 * k);
        const seg = (o0: number, o1: number): void => {
          gg.lineBetween(px - sn * o0, py + cs * o0, px - sn * o1, py + cs * o1);
        };
        if (solid) seg(-half, half);
        else { seg(-half, -1.8); seg(1.8, half); }
        gg.lineStyle(1.6, GOLD, k);
        if (solid) seg(-half, half);
        else { seg(-half, -1.8); seg(1.8, half); }
      }
    }
  }

  private drawQianjian(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = envelope(p, 0.05, 0.4);
    const fall = ease(Math.min(1, p / 0.5));
    const sway = Math.sin(p * 14) * 5 * (1 - p);
    const x0 = e.x + sway;
    const y0 = lerp(e.y - 110, e.y - 62, fall);
    const y1 = lerp(e.y - 56, e.y - 10, fall);
    ag.lineStyle(3, INK, k);
    ag.lineBetween(x0, y0, e.x, y1);
    for (let i = 0; i < 5; i++) {
      const q = i / 4;
      const cx = lerp(x0, e.x, q);
      const cy = lerp(y0, y1, q);
      ag.fillStyle(GOLD, k);
      ag.fillCircle(cx, cy, 5.5);
      ag.lineStyle(2, GOLD_D, k);
      ag.strokeCircle(cx, cy, 5.5);
      ag.fillStyle(INK, k);
      ag.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    if (p > 0.45) {
      const q = (p - 0.45) / 0.55;
      gg.lineStyle(4, GOLD_D, 0.8 * (1 - q));
      gg.strokeCircle(e.x, e.y, 8 + 22 * q);
      gg.lineStyle(2, 0xfff0a0, 1 - q);
      gg.strokeCircle(e.x, e.y, 8 + 22 * q);
    }
  }

  private drawHeling(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const R = e.b > 0 ? Math.min(140, e.b) : 80;
    const fly = ease(Math.min(1, p / 0.65));
    for (let i = 0; i < 3; i++) {
      const ang = e.seed * TAU + (i * TAU) / 3;
      const r = R * (1 - fly);
      this.crane(ag, e.x + Math.cos(ang) * r, e.y - 14 + Math.sin(ang) * r * 0.55 - 10 * Math.sin(fly * Math.PI), 1.2, -Math.cos(ang), envelope(p, 0.05, 0.25));
    }
    if (p > 0.55) {
      const q = (p - 0.55) / 0.45;
      gg.lineStyle(6, GOLD_D, 0.8 * (1 - q));
      gg.strokeCircle(e.x, e.y, 10 + 30 * q);
      gg.lineStyle(3, GOLD, 1 - q);
      gg.strokeCircle(e.x, e.y, 10 + 30 * q);
      this.bell(ag, e.x, e.y - 20, 1 - q * 0.4, 1 - q);
    }
  }

  private bell(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, alpha: number): void {
    g.fillStyle(0xe2b54a, alpha);
    g.fillCircle(x, y - 3 * s, 7 * s);
    g.fillTriangle(x - 7 * s, y - 3 * s, x + 7 * s, y - 3 * s, x + 10 * s, y + 7 * s);
    g.fillTriangle(x - 7 * s, y - 3 * s, x - 10 * s, y + 7 * s, x + 10 * s, y + 7 * s);
    g.lineStyle(2, GOLD_D, alpha);
    g.strokeCircle(x, y - 3 * s, 7 * s);
    g.lineBetween(x - 10 * s, y + 7 * s, x + 10 * s, y + 7 * s);
    g.fillStyle(0x7a4a20, alpha);
    g.fillCircle(x, y + 9 * s, 2.2 * s);
  }

  private drawYiwei(gg: Phaser.GameObjects.Graphics, e: E, p: number): void {
    for (let i = 0; i < 3; i++) {
      const q = p * 1.5 - i * 0.22;
      if (q <= 0 || q >= 1) continue;
      const r = 12 + 56 * ease(q);
      const k = 1 - q;
      gg.lineStyle(6, WATER_D, 0.7 * k);
      gg.strokeEllipse(e.x, e.y, r * 2, r * 1.2);
      gg.lineStyle(3, FOAM, k);
      gg.strokeEllipse(e.x, e.y, r * 2, r * 1.2);
    }
    gg.fillStyle(WATER, 0.2 * (1 - p));
    gg.fillEllipse(e.x, e.y, 90 * (0.4 + p), 54 * (0.4 + p));
  }

  private drawChenzhong(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const R = e.b > 0 ? e.b : 100;
    for (let i = 0; i < 2; i++) {
      const q = (p - i * 0.35) / 0.55;
      if (q <= 0 || q >= 1) continue;
      const r = R * ease(q) * 0.9 + 14;
      const k = 1 - q;
      gg.fillStyle(GOLD, 0.12 * k);
      gg.fillCircle(e.x, e.y, r);
      gg.lineStyle(10, GOLD_D, 0.8 * k);
      gg.strokeCircle(e.x, e.y, r);
      gg.lineStyle(4.5, 0xfff0a0, k);
      gg.strokeCircle(e.x, e.y, r);
    }
    this.bell(ag, e.x, e.y - 24, 1 + 0.2 * Math.sin(p * 18), envelope(p, 0.1, 0.4));
  }

  private drawHuadeng(ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const n = this.lowMem ? 4 : 8;
    const k = envelope(p, 0.1, 0.25);
    for (let i = 0; i < n; i++) {
      const s = (e.seed + i * 0.618) % 1;
      const s2 = (e.seed * 7 + i * 0.381) % 1;
      const q = Math.min(1, Math.max(0, p * 1.25 - s * 0.25));
      const px = e.x + (s - 0.5) * 70 + Math.sin(q * 6 + i) * 8;
      const py = lerp(e.y - 50 - s2 * 20, e.y - 4, q);
      const rot = q * 7 + i;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const pts = [px + cs * 7, py + sn * 7 * 0.6, px - sn * 3.5, py + cs * 3.5, px - cs * 7, py - sn * 7 * 0.6, px + sn * 3.5, py - cs * 3.5];
      ag.fillStyle(0xff8fb8, k);
      ag.lineStyle(2, 0xb8325f, k);
      quad(ag, pts, true);
    }
  }

  private drawDudeng(gg: Phaser.GameObjects.Graphics, ag: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const k = 1 - p;
    gg.fillStyle(0xffd96a, 0.25 * k);
    gg.fillCircle(e.x, e.y, 12 + 26 * p);
    gg.lineStyle(4, FLAME_D, 0.7 * k);
    gg.strokeCircle(e.x, e.y, 12 + 26 * p);
    gg.lineStyle(2, FLAME, k);
    gg.strokeCircle(e.x, e.y, 12 + 26 * p);
    for (let i = 0; i < 3; i++) {
      this.flame(ag, e.x + (i - 1) * 10, e.y - 4 - 22 * ease(p) - i * 3, 1.1 - p * 0.6, k);
    }
  }

  private drawLiangyi(gg: Phaser.GameObjects.Graphics, e: E, p: number): void {
    const R = e.b > 0 ? e.b : 80;
    const r = lerp(R * 0.3, R, ease(p));
    const k = envelope(p, 0.08, 0.45);
    const rot = this.clock * 0.006;
    gg.lineStyle(14, GOLD, 0.9 * k);
    gg.strokeCircle(e.x, e.y, r);
    gg.lineStyle(10, INK, k);
    gg.strokeCircle(e.x, e.y, r);
    for (const [col, a0] of [[0xffffff, rot], [0x3a4050, rot + Math.PI]] as const) {
      gg.lineStyle(7, col, k);
      gg.beginPath();
      gg.arc(e.x, e.y, r, a0, a0 + Math.PI);
      gg.strokePath();
    }
    // 两个小点：白里一点黑、黑里一点白
    for (const [col, a0] of [[0x3a4050, rot + Math.PI / 2], [0xffffff, rot + Math.PI * 1.5]] as const) {
      gg.fillStyle(col, k);
      gg.fillCircle(e.x + Math.cos(a0) * r * 0.45, e.y + Math.sin(a0) * r * 0.45, 5);
      gg.lineStyle(1.6, INK, k);
      gg.strokeCircle(e.x + Math.cos(a0) * r * 0.45, e.y + Math.sin(a0) * r * 0.45, 5);
    }
  }
}
