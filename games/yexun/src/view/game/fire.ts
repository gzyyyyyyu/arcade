/**
 * 火区的画面（守夜乱葬岗的磷火地、夜探窑镇的窑口共用这一处；规则在 core/fire.ts，这里每帧用 fireStage / fireAll 读状态，不自己算）。
 * - 底：每块一张焦土贴图（同尺寸共用一张），一直在；
 * - 没烧：焦土上零星几点火星往上飘（乱葬岗青绿磷火，窑口橙红）；
 * - 预告：边框一闪一闪（深边 + 亮色），地面跟着变亮；
 * - 烧着：铺一片火苗（图集里的 flame_ghost / flame_kiln），按块错开晃动；鬼火齐燃时全部烧。
 * 雪地很亮：火苗、边框都是饱和色 + 深色边、普通混合（AGENTS.md「画面」一节）。只画屏幕内的块，火苗、火星用对象池，省内存设备减半。
 */
import type Phaser from 'phaser';
import type { Rect } from '../../content/maps.ts';
import { FIRE_BURN, FIRE_IDLE, FIRE_WARN, fireAll, fireStage } from '../../core/fire.ts';
import type { World } from '../../core/index.ts';
import type { Frame } from '../art/atlas.ts';

export type FireTone = 'ghost' | 'kiln';

interface Palette {
  flame: string;
  /** 火星、预告边框的亮色 */
  hi: number;
  /** 边框的深色描边 */
  edge: number;
  /** 焦土 */
  soil: string;
  soilEdge: string;
  /** 焦土上的余烬斑点 */
  glint: string;
}

const PAL: Record<FireTone, Palette> = {
  ghost: { flame: 'flame_ghost', hi: 0x3cf0a8, edge: 0x0e3a2e, soil: '#3e4440', soilEdge: '#1e2622', glint: '#46c896' },
  kiln: { flame: 'flame_kiln', hi: 0xff8a2a, edge: 0x4a1a10, soil: '#4a3a32', soilEdge: '#241812', glint: '#e8742a' },
};

/** 一簇火苗占多大地方（世界单位²）：240×200 的磷火地普通设备约 16 簇 */
const FLAME_AREA = 3000;
/** 没烧时每块几点火星 */
const EMBERS = 3;

export interface FireHost {
  scene: Phaser.Scene;
  frame: (key: string) => Frame;
  lowMem: boolean;
}

/** 画面自用的散列（不碰规则的随机）：同一块同一个下标永远落在同一处 */
const hash = (a: number, b: number): number => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class FireView {
  private readonly h: FireHost;
  private readonly w: World;
  private readonly zones: readonly Rect[];
  private readonly pal: Palette;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly flames: Phaser.GameObjects.Image[] = [];
  private readonly embers: Phaser.GameObjects.Image[] = [];
  private readonly flameF: Frame;
  private readonly emberF: Frame;
  private readonly perArea: number;

  constructor(h: FireHost, w: World, tone: FireTone) {
    this.h = h;
    this.w = w;
    this.zones = w.fire;
    this.pal = PAL[tone];
    this.flameF = h.frame(this.pal.flame);
    this.emberF = h.frame('ember');
    this.perArea = h.lowMem ? FLAME_AREA * 2 : FLAME_AREA;
    for (const z of this.zones) this.soil(z);
    // 预告的地面提亮、边框：焦土之上、人物之下
    this.g = h.scene.add.graphics().setDepth(-870);
  }

  /** 连战换图时拆掉（焦土底图由场景按场地对象一起拆） */
  destroy(): void {
    this.g.destroy();
    for (const o of this.flames) o.destroy();
    for (const o of this.embers) o.destroy();
  }

  /** 焦土：一张不规则的暗色斑，深边，上面几道裂缝和余烬点；同尺寸只画一次 */
  private soil(z: Rect): void {
    const key = `firesoil-${this.pal.flame}-${Math.round(z.w)}x${Math.round(z.h)}`;
    const tex = this.h.scene.textures;
    const S = this.h.lowMem ? 0.5 : 1;
    if (!tex.exists(key)) {
      const pad = 16;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((z.w + pad * 2) * S);
      cv.height = Math.ceil((z.h + pad * 2) * S);
      const c = cv.getContext('2d')!;
      c.scale(S, S);
      c.translate(pad, pad);
      // 边缘起伏的一块：沿矩形一圈取点，往外 / 往里抖一点
      const pts: [number, number][] = [];
      const n = 28;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const j = (hash(i, z.w | 0) - 0.5) * 18;
        if (t < 0.25) pts.push([t * 4 * z.w, -j]);
        else if (t < 0.5) pts.push([z.w + j, (t - 0.25) * 4 * z.h]);
        else if (t < 0.75) pts.push([z.w - (t - 0.5) * 4 * z.w, z.h + j]);
        else pts.push([-j, z.h - (t - 0.75) * 4 * z.h]);
      }
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fillStyle = this.pal.soil;
      c.globalAlpha = 0.82;
      c.fill();
      c.globalAlpha = 1;
      c.lineWidth = 5;
      c.lineJoin = 'round';
      c.strokeStyle = this.pal.soilEdge;
      c.stroke();
      // 裂缝
      c.strokeStyle = this.pal.soilEdge;
      c.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        let x = hash(i, 11) * z.w;
        let y = hash(i, 23) * z.h;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += (hash(i, k + 40) - 0.5) * 50;
          y += (hash(i, k + 60) - 0.5) * 40;
          c.lineTo(Math.min(z.w, Math.max(0, x)), Math.min(z.h, Math.max(0, y)));
        }
        c.stroke();
      }
      // 余烬斑点
      c.fillStyle = this.pal.glint;
      for (let i = 0; i < 18; i++) {
        c.globalAlpha = 0.35 + hash(i, 7) * 0.4;
        c.beginPath();
        c.arc(10 + hash(i, 3) * (z.w - 20), 10 + hash(i, 5) * (z.h - 20), 2 + hash(i, 9) * 2.5, 0, Math.PI * 2);
        c.fill();
      }
      tex.addCanvas(key, cv);
    }
    this.h.scene.add.image(z.x - 16, z.y - 16, key).setOrigin(0, 0).setScale(1 / S).setDepth(-880);
  }

  /** 每帧：view 是镜头看得见的世界范围，now 是画面的毫秒数；回这一帧屏幕上有没有正在预告或烧着的块（第一次提示用） */
  update(view: { x: number; y: number; right: number; bottom: number }, now: number): boolean {
    const w = this.w;
    const n = this.zones.length;
    const all = fireAll(w);
    const g = this.g;
    g.clear();
    let nf = 0;
    let ne = 0;
    let lit = false;
    const flash = Math.floor(now / 130) % 2 === 0;
    for (let k = 0; k < n; k++) {
      const z = this.zones[k]!;
      if (z.x > view.right + 40 || z.x + z.w < view.x - 40 || z.y > view.bottom + 60 || z.y + z.h < view.y - 40) continue;
      const st = fireStage(w.tick, k, n, all);
      if (st !== FIRE_IDLE) lit = true;
      if (st === FIRE_BURN) {
        nf = this.burn(z, k, nf, now);
        // 火里的地面一层亮色，边框常亮
        g.fillStyle(this.pal.hi, 0.28).fillRect(z.x, z.y, z.w, z.h);
        g.lineStyle(6, this.pal.edge, 0.9).strokeRect(z.x, z.y, z.w, z.h);
        g.lineStyle(3, this.pal.hi, 0.9).strokeRect(z.x, z.y, z.w, z.h);
      } else if (st === FIRE_WARN) {
        // 预告：地面越来越亮，边框一闪一闪
        g.fillStyle(this.pal.hi, flash ? 0.26 : 0.14).fillRect(z.x, z.y, z.w, z.h);
        g.lineStyle(7, this.pal.edge, flash ? 1 : 0.6).strokeRect(z.x, z.y, z.w, z.h);
        if (flash) g.lineStyle(3.5, this.pal.hi, 1).strokeRect(z.x, z.y, z.w, z.h);
        ne = this.drift(z, k, ne, now, EMBERS * 2);
      } else ne = this.drift(z, k, ne, now, EMBERS);
    }
    for (let i = nf; i < this.flames.length; i++) if (this.flames[i]!.visible) this.flames[i]!.setVisible(false);
    for (let i = ne; i < this.embers.length; i++) if (this.embers[i]!.visible) this.embers[i]!.setVisible(false);
    return lit;
  }

  /** 一块烧着的火区：按网格摆火苗（每格抖一点位置），每簇按自己的相位一伸一缩、左右晃 */
  private burn(z: Rect, k: number, nf: number, now: number): number {
    const cols = Math.max(2, Math.round(z.w / Math.sqrt(this.perArea)));
    const rows = Math.max(2, Math.round((z.w * z.h) / this.perArea / cols));
    const f = this.flameF;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = z.x + ((c + 0.2 + hash(k, i) * 0.6) / cols) * z.w;
        const y = z.y + ((r + 0.4 + hash(i, k) * 0.6) / rows) * z.h;
        const ph = hash(k * 31 + i, 5) * 6.28;
        const s = (0.85 + hash(i, k + 9) * 0.45) * (1 + Math.sin(now * 0.012 + ph) * 0.12);
        const img = (this.flames[nf] ??= this.h.scene.add.image(0, 0, f.tex ?? 'atlas', f.key).setOrigin(f.ox, f.oy));
        img
          .setVisible(true)
          .setPosition(x, y)
          .setScale(s / f.res, (s * (1 + Math.sin(now * 0.017 + ph * 1.3) * 0.1)) / f.res)
          .setRotation(Math.sin(now * 0.006 + ph) * 0.08)
          .setDepth(y);
        nf++;
      }
    }
    return nf;
  }

  /** 没烧 / 预告时的火星：从焦土上冒起、往上飘、淡掉，循环；位置由时间算，不存状态 */
  private drift(z: Rect, k: number, ne: number, now: number, count: number): number {
    const m = this.h.lowMem ? Math.max(1, count >> 1) : count;
    const f = this.emberF;
    for (let i = 0; i < m; i++) {
      const period = 1400 + hash(k, i + 70) * 900;
      const t = ((now + hash(i, k + 3) * period) % period) / period;
      const cyc = Math.floor((now + hash(i, k + 3) * period) / period);
      const x = z.x + 12 + hash(k * 7 + i, cyc) * (z.w - 24) + Math.sin(t * 6.28 + i) * 6;
      const y = z.y + 16 + hash(cyc, k * 5 + i) * (z.h - 24) - t * 46;
      const img = (this.embers[ne] ??= this.h.scene.add.image(0, 0, f.tex ?? 'atlas', f.key).setOrigin(f.ox, f.oy).setTint(this.pal.hi));
      img
        .setVisible(true)
        .setPosition(x, y)
        .setScale((0.9 - t * 0.5) / f.res)
        .setAlpha(t < 0.2 ? t * 5 : 1 - (t - 0.2) / 0.8)
        .setDepth(y);
      ne++;
    }
    return ne;
  }
}
