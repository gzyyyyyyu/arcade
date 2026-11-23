/**
 * 2.0 首领和特色怪的画面（规则在 core/foes/）：Ev.Foe 的特效和声音、地上的竹浪 / 冰风 / 浮冰 / 香炉全灭，
 * 无面佛的四尊小佛、潜水的涟漪、红衣戏子头顶的红丝。只读核心的状态和事件，不算规则。
 * 圈的预警走 GameScene 的 telegraphs（和石兽、冰魄一样的圆圈）。
 * 首领连战：词缀（金盾圈、风的拽线、鬼火）和夜漏君（鼓圈、月牙镰红线、灯笼、月蚀压暗、夜潮）也在这里画。
 */
import Phaser from 'phaser';
import { ENEMY_BY_KIND } from '../../content/enemies.ts';
import { WUMIAN, ZHUMU } from '../../content/foes.ts';
import { YELOU } from '../../content/rushFoes.ts';
import { CURSE_FX } from '../../content/meta.ts';
import { dcos, dsin } from '../../core/fmath.ts';
import { affixPull, affixShieldLeft, yelouDrip } from '../../core/foes/index.ts';
import { MAX_DRUMS, MAX_FLAMES, MAX_WAVES } from '../../core/foes/state.ts';
import type { World } from '../../core/index.ts';
import { sfx, type SfxName } from '../audio/sfx.ts';
import type { Fx } from './fx.ts';

export interface FoeHost {
  scene: Phaser.Scene;
  fx: Fx;
  lowMem: boolean;
  telegraph(x: number, y: number, r: number, ticks: number, color: number): void;
  burst(x: number, y: number, tint: number, size: number): void;
  shake(ms: number, k: number): void;
  say(title: string, sub: string): void;
  img(key: string, x: number, y: number, scale: number): Phaser.GameObjects.Image;
}

/** 圈的样子（Ev.Foe 子类个位）→ 预警色 */
const VIS_COLOR = [0x3fae5a, 0x3a8fd0, 0x6fc4f0, 0xe8b830, 0x9a7a4a, 0xd0302a, 0xb8862a];
const VIS_STRIKE: SfxName[] = ['bambooPop', 'monkeyPounce', 'iceSpike', 'goldChime', 'ratBurrow', 'sleeveSweep', 'signRain'];
/** 落下时碎屑的颜色 */
const VIS_SHARD = [0x7fc45a, 0x7fd0f0, 0xcdeeff, 0xf3d36a, 0xb08a58, 0xe0384a, 0xd8c08a];
const VIS_N = VIS_COLOR.length;
const KIND_NAME: Record<number, string> = {};
for (const k of ['zhumu', 'shuihou', 'binghun', 'wumian', 'hongyi', 'shuoshu'] as const) KIND_NAME[ENEMY_BY_KIND[k].code] = k;
const CODE = (k: keyof typeof ENEMY_BY_KIND): number => ENEMY_BY_KIND[k].code;

export class FoeView {
  private readonly g: Phaser.GameObjects.Graphics;
  /** 压在怪和主角上面的一层：月蚀的夜色、夜潮、灯笼、镰刀红线 */
  private readonly top: Phaser.GameObjects.Graphics;
  /** 上一次滴漏响是第几秒 */
  private dripSec = -1;
  private readonly statues: Phaser.GameObjects.Image[] = [];
  private readonly ripples: Phaser.GameObjects.Image[] = [];
  private thread: Phaser.GameObjects.Image | null = null;
  private readonly h: FoeHost;

  constructor(h: FoeHost) {
    this.h = h;
    this.g = h.scene.add.graphics().setDepth(-250);
    this.top = h.scene.add.graphics().setDepth(6900);
  }

  /** 事件：Ev.Foe 的一条（子类见 core/events.ts） */
  onEvent(x: number, y: number, a: number, b: number, c: number): void {
    const h = this.h;
    const ring = (r: number, tint: number, life = 460): void => h.fx.spawn({ frame: 'ring', x, y, life, s0: 0.4, s1: (r * 2.4) / 128, a0: 1, a1: 0, tint, depth: 60 });
    const shards = (tint: number, n: number): void => {
      if (h.lowMem) return;
      for (let k = 0; k < n; k++) h.fx.spawn({ frame: 'shard', x, y, vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 120, g: 420, life: 560, s0: 1.4, s1: 0.6, tint, rot: Math.random() * 6, spin: 8 });
    };
    if (a >= 30 && a < 30 + VIS_N) {
      // 预警圈：b 半径、c 预警拍数
      h.telegraph(x, y, b, c, VIS_COLOR[a - 30]!);
      return;
    }
    if (a >= 50 && a < 50 + VIS_N) {
      const v = a - 50;
      ring(b, VIS_COLOR[v]!);
      h.burst(x, y - 8, VIS_COLOR[v]!, 1.1);
      shards(VIS_SHARD[v]!, v === 0 || v === 2 ? 8 : 4);
      sfx.play(VIS_STRIKE[v]!, { volume: v === 4 || v === 6 ? 0.6 : 0.8 });
      if (v === 1 || v === 3) h.shake(160, 0.007);
      return;
    }
    switch (a) {
      case 2:
        // 竹浪放出：整片竹林摇晃
        sfx.play('bambooWave');
        h.shake(900, 0.004);
        break;
      case 3:
        sfx.play(b > 0 ? 'spiritSummon' : 'bambooPop', { volume: 0.7 });
        if (b > 0) ring(b, 0x3fae5a);
        break;
      case 4:
        sfx.play('monkeyDive');
        ring(60, 0x6fb4e8);
        break;
      case 5:
        sfx.play('monkeyPounce');
        h.burst(x, y - 10, 0x9fd4f0, 1.6);
        break;
      case 6:
        sfx.play('waterWhip');
        break;
      case 7:
        if (b > 0) {
          sfx.play('waterDrag');
          ring(120, 0x3a8fd0, 700);
        }
        break;
      case 8:
        sfx.play('iceWind');
        break;
      case 9:
        sfx.play('iceCrack');
        h.shake(500, 0.006);
        h.say('冰面裂开', '只有浮冰上走得稳');
        break;
      case 10:
        sfx.play('wumianCharge');
        break;
      case 11:
        sfx.play('wumianStun');
        h.shake(380, 0.012);
        ring(90, 0xf3d36a, 520);
        shards(0xd9c9a0, 10);
        break;
      case 12:
        sfx.play('censerOut');
        h.shake(300, 0.006);
        h.say('香炉全灭', '香火区外挨打更重，往香炉靠');
        break;
      case 13:
        sfx.play(b === 1 ? 'snowChildReveal' : 'snowChildDash', { volume: 0.7 });
        if (b === 1) h.burst(x, y - 10, 0xfff3e0, 1.2);
        break;
      case 14:
        sfx.play('coffinOpen');
        shards(0x85613c, 6);
        break;
      case 15:
        sfx.play('nailShot', { volume: 0.6 });
        break;
      case 16:
        sfx.play('coffinSmash');
        shards(0x85613c, 8);
        break;
      case 17:
        sfx.play('stageGong');
        h.say('开戏了', '戏台前冒出一队鬼影');
        ring(200, 0xe8b830, 700);
        break;
      case 18:
        sfx.play('troupeAppear', { volume: 0.5 });
        h.burst(x, y - 20, 0xa890d0, 1);
        break;
      case 19:
        sfx.play('sleeveSweep');
        ring(b, 0xd0302a);
        h.shake(180, 0.008);
        break;
      case 20:
        if (b === 9) {
          sfx.play('faceChange');
          h.burst(x, y - 30, 0xf0d8a0, 1.8);
          ring(90, 0xe0384a);
        } else {
          // 无面佛的小佛放金光圈：从小佛身上冒一圈光
          sfx.play('goldChime', { volume: 0.7 });
          ring(60, 0xe8b830, 520);
          h.burst(x, y - 30, 0xf3d36a, 1.2);
        }
        break;
      case 21:
        sfx.play(b === 1 ? 'ratBurrow' : 'ratBurrow', { pitch: b === 1 ? 1.3 : 0.8 });
        h.burst(x, y, 0x9a7a4a, 1.4);
        shards(0xb08a58, 6);
        break;
      case 22:
        sfx.play('ricePile');
        h.burst(x, y - 20, 0xf0e4bc, 1.4);
        break;
      case 23: {
        // 首领倒下
        const name = KIND_NAME[b];
        if (name) sfx.play(`${name}Down` as SfxName);
        h.burst(x, y - 40, 0xf3d36a, 2.2);
        shards(0xf3d36a, 14);
        h.shake(420, 0.01);
        break;
      }
      // ---- 首领连战：词缀 ----
      case 60:
        sfx.play('affixShield');
        ring(90, 0xe8b830, 600);
        break;
      case 61:
        sfx.play('shieldBreak');
        shards(0xf3d36a, 10);
        break;
      case 62:
        sfx.play('shadowSplit');
        h.burst(x, y - 30, 0x5a4a8a, 2);
        break;
      case 63:
        sfx.play('spiritSummon', { volume: 0.7 });
        ring(150, 0x9a7a4a);
        break;
      case 64:
        sfx.play('rageRoar');
        h.burst(x, y - 30, 0xd0302a, 2);
        h.shake(260, 0.008);
        break;
      case 65:
        sfx.play('windHowl', { volume: 0.7 });
        break;
      case 67:
        sfx.play('leechSip', { volume: 0.6 });
        h.burst(x, y - 30, 0xd0302a, 1.2);
        break;
      case 68:
        h.burst(x, y - 20, 0x2a2438, 1.2);
        break;
      // ---- 夜漏君 ----
      case 70:
        sfx.play('nightDrum');
        h.shake(120, 0.004);
        break;
      case 72:
        sfx.play('troupeAppear', { volume: 0.5 });
        ring(170, 0x46598c);
        break;
      case 74:
        sfx.play('scytheSwish');
        break;
      case 77:
      case 78:
        sfx.play('tideSurge', { volume: 0.7 });
        break;
      case 79:
        sfx.play('rageRoar');
        h.say('发狂了', '滴漏漏尽，夜漏君越打越狠，快打');
        h.shake(400, 0.01);
        break;
      case 80:
        sfx.play('nightGong');
        h.shake(500, 0.012);
        ring(220, 0xe8b830, 800);
        break;
      case 81:
        sfx.play('yelouDown');
        h.burst(x, y - 60, 0xfff1c0, 3);
        shards(0xcfe4f0, 18);
        h.shake(700, 0.014);
        break;
      default:
        break;
    }
  }

  /** 每帧：地上的东西和附着在怪身上的小东西 */
  draw(w: World, now: number, inter: (p: number, c: number) => number): void {
    const f = w.foe;
    const g = this.g;
    g.clear();
    const hv = this.h;
    const cam = hv.scene.cameras.main;
    const view = cam.worldView;
    // 竹浪：墙是一条竹篱，空隙留白；预警时半透明、空隙描边
    for (let k = 0; k < MAX_WAVES; k++) {
      if (!f.wOn[k]) continue;
      const warn = f.wWarn[k]! > 0;
      const pos = f.wPos[k]!;
      const gap = f.wGap[k]!;
      const gw = f.wGapW[k]!;
      const th = ZHUMU.waveThick;
      const lo = gap - 1500;
      const hi = gap + 1500;
      const seg = (a0: number, a1: number): void => {
        if (f.wAxis[k] === 0) g.fillRect(pos - th / 2, a0, th, a1 - a0);
        else g.fillRect(a0, pos - th / 2, a1 - a0, th);
      };
      g.fillStyle(0x2f7a3a, warn ? 0.35 : 0.9);
      seg(lo, gap - gw / 2);
      seg(gap + gw / 2, hi);
      g.fillStyle(0xa9e07a, warn ? 0.25 : 0.7);
      for (const [a0, a1] of [[lo, gap - gw / 2], [gap + gw / 2, hi]] as const) {
        if (f.wAxis[k] === 0) g.fillRect(pos - 3, a0, 6, a1 - a0);
        else g.fillRect(a0, pos - 3, a1 - a0, 6);
      }
      if (warn) {
        g.lineStyle(5, 0xffffff, 0.85);
        if (f.wAxis[k] === 0) g.strokeRect(pos - th / 2 - 4, gap - gw / 2, th + 8, gw);
        else g.strokeRect(gap - gw / 2, pos - th / 2 - 4, gw, th + 8);
      }
    }
    // 冰风预告：一条长条
    if (f.windT > 0) {
      const c = dcos(f.windDir);
      const s = dsin(f.windDir);
      const L = 440;
      const half = 90;
      g.fillStyle(0xcdeeff, 0.18 + 0.2 * (1 - f.windT / 20));
      g.fillPoints(
        [
          new Phaser.Math.Vector2(f.windX - s * half, f.windY + c * half),
          new Phaser.Math.Vector2(f.windX + c * L - s * half, f.windY + s * L + c * half),
          new Phaser.Math.Vector2(f.windX + c * L + s * half, f.windY + s * L - c * half),
          new Phaser.Math.Vector2(f.windX + s * half, f.windY - c * half),
        ],
        true,
      );
    }
    // 浮冰：裂开预警时画裂纹，裂开后水色罩住全场、浮冰亮着
    if (f.fN > 0) {
      const cracked = w.tick >= f.floeWarnEnd;
      if (cracked) {
        g.fillStyle(0x1c4a7a, 0.28);
        g.fillRect(view.x - 20, view.y - 20, view.width + 40, view.height + 40);
      }
      for (let k = 0; k < f.fN; k++) {
        g.fillStyle(0xeaf8ff, cracked ? 0.95 : 0.3);
        g.fillRoundedRect(f.fX[k]!, f.fY[k]!, f.fW[k]!, f.fH[k]!, 26);
        g.lineStyle(6, 0x2a5a8a, cracked ? 0.9 : 0.6);
        g.strokeRoundedRect(f.fX[k]!, f.fY[k]!, f.fW[k]!, f.fH[k]!, 26);
        if (!cracked) {
          g.lineStyle(3, 0x17131c, 0.7);
          g.lineBetween(f.fX[k]!, f.fY[k]!, f.fX[k]! + f.fW[k]!, f.fY[k]! + f.fH[k]!);
        }
      }
    }
    // 香炉全灭：场上发暗，香火区描金边（那里不加倍）
    if (f.dark) {
      g.fillStyle(0x0a0614, 0.22);
      g.fillRect(view.x - 20, view.y - 20, view.width + 40, view.height + 40);
      g.lineStyle(7, 0xe8b830, 0.55 + Math.sin(now * 0.006) * 0.25);
      for (const r of w.incense) g.strokeRect(r.x, r.y, r.w, r.h);
    }
    this.drawFlames(w, now);
    this.drawRush(w, now, inter);
    this.attach(w, now, inter);
  }

  /** 鬼火（词缀「火」的脚印、月牙镰的冷焰）：快灭的淡下去 */
  private drawFlames(w: World, now: number): void {
    const f = w.foe;
    const g = this.g;
    for (let k = 0; k < MAX_FLAMES; k++) {
      const left = f.hEnd[k]! - w.tick;
      if (left <= 0) continue;
      const a = Math.min(1, left / 20);
      const r = f.hR[k]! * (0.92 + Math.sin(now * 0.012 + k) * 0.08);
      g.fillStyle(0x1f5a8a, 0.45 * a);
      g.fillCircle(f.hX[k]!, f.hY[k]!, r);
      g.fillStyle(0x7fe0ff, 0.55 * a);
      g.fillCircle(f.hX[k]!, f.hY[k]! - 4, r * 0.55);
    }
  }

  /** 连战：首领身上的词缀表现和夜漏君的场面 */
  private drawRush(w: World, now: number, inter: (p: number, c: number) => number): void {
    const f = w.foe;
    const g = this.g;
    const t = this.top;
    t.clear();
    const view = this.h.scene.cameras.main.worldView;
    const yelouC = CODE('yelou');
    let yl = -1;
    for (let i = 0; i < w.eAlive.length; i++) {
      if (!w.eAlive[i]) continue;
      if (w.eKind[i] === yelouC) yl = i;
      if (!w.eAffix[i]) continue;
      const x = inter(w.ePX[i]!, w.eX[i]!);
      const y = inter(w.ePY[i]!, w.eY[i]!);
      const r = w.eR[i]! * 1.6;
      // 护：金圈，越薄越快碎
      const sh = affixShieldLeft(w, i);
      if (sh > 0) {
        const k = Math.min(1, sh / (w.eHpMax[i]! * 0.08));
        t.lineStyle(4 + 6 * k, 0xe8b830, 0.55 + 0.3 * k);
        t.strokeCircle(x, y - w.eR[i]!, r);
        t.lineStyle(2, 0x6a4a10, 0.8);
        t.strokeCircle(x, y - w.eR[i]!, r + 5 + 3 * k);
      }
      // 风：预警时一条虚线，拽人时实线
      const p = affixPull(w, i);
      if (p !== 0) {
        const px = inter(w.px, w.x);
        const py = inter(w.py, w.y);
        t.lineStyle(p < 0 ? 3 : 7, 0xcdeeff, p < 0 ? 0.5 + Math.sin(now * 0.03) * 0.3 : 0.85);
        t.lineBetween(x, y - 20, px, py - 20);
      }
    }
    // 鼓圈：环上空出缺口，缺口两端描金
    const D = YELOU.drum;
    const step = (Math.PI * 2) / 256;
    for (let k = 0; k < MAX_DRUMS; k++) {
      if (!f.dOn[k]) continue;
      const cx = f.dX[k]!;
      const cy = f.dY[k]!;
      const R = f.dR[k]!;
      const gaps = [f.dGap0[k]!, f.dGap1[k]!].filter((v) => v >= 0).sort((a, b) => a - b);
      const arcs: [number, number][] = [];
      let from = gaps.length ? gaps[gaps.length - 1]! + D.gapHalf - 256 : 0;
      for (const gp of gaps) {
        arcs.push([from, gp - D.gapHalf]);
        from = gp + D.gapHalf;
      }
      if (!gaps.length) arcs.push([0, 256]);
      g.lineStyle(D.thick, 0x2a2236, 0.75);
      for (const [a0, a1] of arcs) {
        g.beginPath();
        g.arc(cx, cy, R, a0 * step, a1 * step);
        g.strokePath();
      }
      g.lineStyle(D.thick * 0.35, 0xb8a0e0, 0.8);
      for (const [a0, a1] of arcs) {
        g.beginPath();
        g.arc(cx, cy, R, a0 * step, a1 * step);
        g.strokePath();
      }
      g.lineStyle(D.thick + 4, 0xf3c84a, 0.95);
      for (const gp of gaps)
        for (const e of [gp - D.gapHalf, gp + D.gapHalf]) {
          g.beginPath();
          g.arc(cx, cy, R, (e - 2) * step, (e + 2) * step);
          g.strokePath();
        }
    }
    const px = w.x;
    const py = w.y;
    // 月蚀：主角四周留一圈看得见，其余压暗；灯笼在夜色上面亮着。连战事件「灯下黑」（w.rushDark）和咒「暗」同样压暗，看得近一点
    if (f.ylDark || w.rushDark || w.setup.curses?.includes('dark')) {
      const sight = Math.min(view.width, view.height) * 0.5 * (f.ylDark ? YELOU.sight : CURSE_FX.darkView);
      const far = Math.max(view.width, view.height) * 1.5;
      t.lineStyle(far, 0x05040c, 0.62);
      t.strokeCircle(px, py, sight + far / 2);
      t.lineStyle(60, 0x05040c, 0.3);
      t.strokeCircle(px, py, sight - 10);
    }
    for (let k = 0; k < f.lN; k++) {
      const lx = f.lX[k]!;
      const ly = f.lY[k]!;
      const near = (px - lx) ** 2 + (py - ly) ** 2 <= YELOU.lantern.r ** 2;
      t.fillStyle(0xffb84a, near ? 0.22 : 0.12);
      t.fillCircle(lx, ly, YELOU.lantern.r);
      t.lineStyle(3, 0xf3c84a, near ? 0.9 : 0.5);
      t.strokeCircle(lx, ly, YELOU.lantern.r);
      t.fillStyle(0xd0302a, 1);
      t.fillRoundedRect(lx - 14, ly - 62, 28, 36, 10);
      t.fillStyle(0xffd36a, 0.7 + Math.sin(now * 0.008 + k) * 0.2);
      t.fillRoundedRect(lx - 8, ly - 56, 16, 24, 6);
    }
    // 夜潮：圈外一片暗潮，边上一道浪
    if (f.tideR > 0) {
      const far = Math.max(view.width, view.height) * 2;
      t.lineStyle(far, 0x0b1430, 0.5);
      t.strokeCircle(f.tideX, f.tideY, f.tideR + far / 2);
      t.lineStyle(10, 0x5a7ad0, 0.7 + Math.sin(now * 0.01) * 0.2);
      t.strokeCircle(f.tideX, f.tideY, f.tideR);
    }
    if (yl >= 0) {
      // 月牙镰预警：沿冲的方向一道半透明红线
      if (w.eS[yl] === 1 && w.ePhase[yl] === 1) {
        const x = w.eX[yl]!;
        const y = w.eY[yl]!;
        const L = YELOU.scythe.dash * YELOU.scythe.speed;
        t.lineStyle(w.eR[yl]! * 2, 0xd0302a, 0.28 + Math.sin(now * 0.04) * 0.12);
        t.lineBetween(x, y, x + w.eAX[yl]! * L, y + w.eAY[yl]! * L);
        t.lineStyle(3, 0xff6a5a, 0.9);
        t.lineBetween(x, y, x + w.eAX[yl]! * L, y + w.eAY[yl]! * L);
      }
      // 滴漏：五更每 3 秒滴一声
      const drip = yelouDrip(w);
      const sec = drip > 0 ? Math.floor(drip / 90) : -1;
      if (sec >= 0 && sec !== this.dripSec) sfx.play('waterDrip', { volume: 0.5 });
      this.dripSec = sec;
    }
  }

  private attach(w: World, now: number, inter: (p: number, c: number) => number): void {
    const hv = this.h;
    let wum = -1;
    let hongyi = -1;
    let nRip = 0;
    const SHUIHOU_C = CODE('shuihou');
    const SHUOSHU_C = CODE('shuoshu');
    for (let i = 0; i < w.eAlive.length; i++) {
      if (!w.eAlive[i]) continue;
      const k = w.eKind[i]!;
      if (k === CODE('wumian')) wum = i;
      else if (k === CODE('hongyi')) hongyi = i;
      else if ((k === SHUIHOU_C || k === SHUOSHU_C) && w.eS[i] === 1) {
        // 潜水、钻地：原地留涟漪（水猴）或土堆（鼠）
        const r = (this.ripples[nRip] ??= hv.img('ripple', 0, 0, 1).setDepth(-200));
        const x = inter(w.ePX[i]!, w.eX[i]!);
        const y = inter(w.ePY[i]!, w.eY[i]!);
        r.setVisible(true).setPosition(x, y).setAlpha(0.55 + Math.sin(now * 0.01 + i) * 0.25).setScale(k === SHUIHOU_C ? 1.2 : 0.9).setTint(k === SHUIHOU_C ? 0xffffff : 0xb08a58);
        nRip++;
      }
    }
    for (let n = nRip; n < this.ripples.length; n++) this.ripples[n]!.setVisible(false);
    // 无面佛四周的四尊小佛（放金光圈的轮到谁，谁亮一下由 Ev.Foe 20 的光圈表现）
    for (let n = 0; n < 4; n++) {
      if (wum < 0) {
        this.statues[n]?.setVisible(false);
        continue;
      }
      const s = (this.statues[n] ??= hv.img('xiaofo', 0, 0, 1));
      const hx = w.foe.homeX + (n === 0 || n === 3 ? -1 : 1) * WUMIAN.statue * 0.8;
      const hy = w.foe.homeY + (n < 2 ? -1 : 1) * WUMIAN.statue * 0.55;
      s.setVisible(true).setPosition(hx, hy).setDepth(hy);
    }
    // 红衣戏子头顶的红丝：真身才有，假身没有
    if (hongyi >= 0) {
      const t = (this.thread ??= hv.img('redsilk', 0, 0, 1));
      t.setVisible(true)
        .setPosition(inter(w.ePX[hongyi]!, w.eX[hongyi]!), inter(w.ePY[hongyi]!, w.eY[hongyi]!) - 112 + Math.sin(now * 0.008) * 4)
        .setDepth(w.eY[hongyi]! + 1);
    } else this.thread?.setVisible(false);
  }
}
