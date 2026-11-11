/** 特效：大字、闪光、震屏、粒子、庆祝。全部自管生命周期，播完即销毁。 */
import Phaser from 'phaser';
import { dur, tweenP, wait } from '../common/anim.ts';
import { COLOR, GAME_HEIGHT, TYPE } from '../common/theme.ts';
import { LOW_MEMORY } from '../common/device.ts';
import { text, worldW } from '../ui/kit.ts';
import { PACE, STRIKE_MS, strikeParams } from '../common/pace.ts';
import { texOr } from '../common/textures.ts';

/** 叠圆模拟径向渐变：Canvas 渲染下没有 fillGradientStyle，用由大到小的低透明度圆层叠出暖光。 */
function glowDisc(g: Phaser.GameObjects.Graphics, r: number, color: number, alpha: number, steps = 6): void {
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps;
    g.fillStyle(color, alpha / steps * (1 + i * 0.6)).fillCircle(0, 0, r * k);
  }
}

/** 一圈金色光束（大字背后、炸弹、升级共用）：长短相间，视觉上有层次。 */
function drawRays(g: Phaser.GameObjects.Graphics, n: number, len: number, color: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const half = i % 2 ? 0.05 : 0.085;
    const l = i % 2 ? len * 0.7 : len;
    g.fillStyle(color, i % 2 ? alpha * 0.7 : alpha)
      .fillTriangle(0, 0, Math.cos(a - half) * l, Math.sin(a - half) * l, Math.cos(a + half) * l, Math.sin(a + half) * l);
  }
}

/** 画面中央的大字（"炸弹×6""天王炸""接风""第 3 副"）。 */
export async function bigWord(
  scene: Phaser.Scene,
  msg: string,
  opts: { color?: number; stroke?: number; size?: number; y?: number; hold?: number; sub?: string; depth?: number } = {},
): Promise<void> {
  const W = worldW(scene);
  const y = opts.y ?? GAME_HEIGHT * 0.42;
  const depth = opts.depth ?? 3500;
  const c = scene.add.container(W / 2, y).setDepth(depth);
  const t = text(scene, 0, 0, msg, {
    size: opts.size ?? TYPE.huge,
    color: opts.color ?? COLOR.goldLight,
    bold: true,
    font: 'title',
    stroke: opts.stroke ?? COLOR.redDark,
    strokeWidth: 10,
    shadow: true,
  });
  // 背后：暖光 + 缓慢转开的金色光束，垫在字下面让字"发亮"
  const halo = scene.add.graphics();
  glowDisc(halo, Math.max(200, t.width * 0.6), COLOR.gold, 0.38);
  const beams = scene.add.graphics();
  drawRays(beams, 16, Math.max(320, t.width * 0.9), COLOR.goldLight, 0.2);
  c.add([halo, beams, t]);
  if (opts.sub) c.add(text(scene, 0, t.height / 2 + 22, opts.sub, { size: TYPE.title, color: 0xfff6e0, bold: true, stroke: 0x2b1d14, strokeWidth: 5 }));
  if (dur(1) === 0) {
    c.destroy();
    return;
  }
  // 金粉从字中心迸出，不挡字：深度在字之下一点
  burst(scene, W / 2, y, 'spark', 18, { speed: [120, 380], life: 800, gravity: 120, scale: [0.8, 0.1], tint: [COLOR.goldLight, COLOR.gold, 0xffffff] });
  c.setScale(2.2).setAlpha(0);
  beams.setScale(0.4);
  scene.tweens.add({ targets: beams, scale: 1.2, angle: 20, duration: dur(1100), ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: halo, scale: 1.25, duration: dur(900), ease: 'Sine.easeOut' });
  await tweenP(scene, { targets: c, scale: 1, alpha: 1, duration: PACE.word.in, ease: 'Back.easeOut' });
  await wait(scene, opts.hold ?? PACE.word.hold);
  await tweenP(scene, { targets: c, alpha: 0, y: c.y - 30, duration: PACE.word.out });
  c.destroy();
}

/** 横幅提示（不挡操作）：漆红绸带，金边、燕尾缺口，从左滑入。 */
export async function banner(scene: Phaser.Scene, msg: string, y = 300, color = 0x2b1d14): Promise<void> {
  const W = worldW(scene);
  const c = scene.add.container(W / 2, y).setDepth(3400);
  const t = text(scene, 0, -1, msg, { size: TYPE.title, color: COLOR.goldLight, bold: true, font: 'title', stroke: COLOR.redDark, strokeWidth: 3, shadow: true });
  const w = Math.max(380, t.width + 160);
  const h = 30; // 半高
  const notch = 20; // 燕尾缺口深度
  // 默认调用不传色，用漆红；调用方真传了别的色就当绸带底色
  const base = color === 0x2b1d14 ? COLOR.red : color;
  const V = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);
  const poly = (x0: number, hh: number, n: number): Phaser.Math.Vector2[] => [
    V(-x0, -hh), V(x0, -hh), V(x0 - n, 0), V(x0, hh), V(-x0, hh), V(-x0 + n, 0),
  ];
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillPoints(poly(w / 2, h, notch).map((p) => V(p.x, p.y + 5)), true);
  g.fillStyle(COLOR.gold, 1).fillPoints(poly(w / 2, h, notch), true); // 金边（外层）
  g.fillStyle(COLOR.redDark, 1).fillPoints(poly(w / 2 - 3, h - 3, notch - 1), true);
  g.fillStyle(base, 1).fillPoints(poly(w / 2 - 5, h - 5, notch - 2), true);
  // 漆面反光：上半部一层浅色，模拟上亮下暗的渐变
  g.fillStyle(0xffffff, 0.12).fillPoints([
    V(-w / 2 + 5, -h + 5), V(w / 2 - 5, -h + 5), V(w / 2 - 5 - (notch - 2) * 0.5, -h * 0.25), V(-w / 2 + 5 + (notch - 2) * 0.5, -h * 0.25),
  ], true);
  g.fillStyle(0x000000, 0.14).fillRect(-w / 2 + notch, h * 0.55, w - notch * 2, h * 0.45 - 5);
  g.lineStyle(1.5, COLOR.goldLight, 0.7).lineBetween(-w / 2 + notch + 6, -h + 9, w / 2 - notch - 6, -h + 9).lineBetween(-w / 2 + notch + 6, h - 9, w / 2 - notch - 6, h - 9);
  c.add([g, t]);
  if (dur(1) === 0) {
    c.destroy();
    return;
  }
  c.setAlpha(0).x = -w;
  await tweenP(scene, { targets: c, alpha: 1, x: W / 2, duration: PACE.banner.in, ease: 'Cubic.easeOut' });
  await wait(scene, PACE.banner.hold);
  await tweenP(scene, { targets: c, alpha: 0, x: W / 2 + 80, duration: PACE.banner.out, ease: 'Cubic.easeIn' });
  c.destroy();
}

export function flash(scene: Phaser.Scene, color: number, alpha = 0.6): void {
  if (dur(1) === 0) return;
  const r = scene.add.graphics().setDepth(3300);
  r.fillStyle(color, alpha).fillRect(0, 0, worldW(scene), GAME_HEIGHT);
  scene.tweens.add({ targets: r, alpha: 0, duration: dur(380), onComplete: () => r.destroy() });
}

export function shake(scene: Phaser.Scene, ms: number, intensity: number): void {
  if (dur(1) === 0) return;
  scene.cameras.main.shake(dur(ms), intensity);
}

/** 一次性粒子爆发。 */
export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  kind: 'spark' | 'petal' | 'coin' | 'confetti' | 'star' | 'smoke',
  count: number,
  opts: { speed?: [number, number]; life?: number; gravity?: number; scale?: [number, number]; tint?: number[] } = {},
): void {
  // 省内存设备不放装饰粒子（art-v3）：闪光、震屏、大字照常，戏还在
  if (dur(1) === 0 || LOW_MEMORY) return;
  const em = scene.add.particles(x, y, texOr(scene, `particle:${kind}`), {
    speed: { min: opts.speed?.[0] ?? 150, max: opts.speed?.[1] ?? 420 },
    angle: { min: 0, max: 360 },
    lifespan: opts.life ?? 900,
    gravityY: opts.gravity ?? 300,
    scale: { start: opts.scale?.[0] ?? 0.9, end: opts.scale?.[1] ?? 0.2 },
    alpha: { start: 1, end: 0 },
    rotate: { min: 0, max: 360 },
    tint: opts.tint,
    emitting: false,
  });
  em.setDepth(3450);
  em.explode(count);
  // 火花/星/金币爆开时先有一团短促的暖光，像金粉被点亮
  if (kind === 'spark' || kind === 'star' || kind === 'coin') {
    const gl = scene.add.graphics().setPosition(x, y).setDepth(3440);
    glowDisc(gl, 70 + count * 2, COLOR.gold, 0.5, 5);
    gl.setScale(0.5);
    scene.tweens.add({ targets: gl, scale: 1.6, alpha: 0, duration: dur(420), ease: 'Cubic.easeOut', onComplete: () => gl.destroy() });
  }
  scene.time.delayedCall((opts.life ?? 900) + 200, () => em.destroy());
}

/** 光芒：从中心旋转散开的金色光束（天王炸、升级用），中心带一团暖光。 */
export function rays(scene: Phaser.Scene, x: number, y: number, color = 0xffd25a): void {
  if (dur(1) === 0) return;
  const g = scene.add.graphics().setPosition(x, y).setDepth(3290);
  drawRays(g, 18, 900, color, 0.3);
  glowDisc(g, 160, COLOR.goldLight, 0.5, 5);
  g.setScale(0.2).setAlpha(0.9);
  scene.tweens.add({ targets: g, scale: 1, angle: 25, alpha: 0, duration: dur(1100), ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
}

/** 持续的彩带/花瓣雨（胜利页），返回停止函数。 */
export function rain(scene: Phaser.Scene, kind: 'confetti' | 'petal' | 'coin' | 'smoke', depth: number, tint?: number[]): () => void {
  if (LOW_MEMORY) return () => undefined;
  const W = worldW(scene);
  const em = scene.add.particles(0, -20, texOr(scene, `particle:${kind}`), {
    x: { min: 0, max: W },
    speedY: { min: 90, max: 200 },
    speedX: { min: -40, max: 40 },
    lifespan: 5200,
    rotate: { min: 0, max: 360 },
    scale: { min: 0.6, max: 1.2 },
    frequency: kind === 'smoke' ? 220 : 60,
    alpha: kind === 'smoke' ? { start: 0.5, end: 0 } : 1,
    tint,
  });
  em.setDepth(depth);
  return () => {
    em.stop();
    scene.time.delayedCall(5400, () => em.destroy());
  };
}

/** 冲击波圆环：从一点扩开并淡出（炸弹落桌、头游印章落下共用）。圆环按最终半径画好再放大，线宽跟着由细变粗。 */
export function shockwave(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: { radius?: number; color?: number; width?: number; ms?: number; depth?: number } = {},
): void {
  if (dur(1) === 0) return;
  const r = opts.radius ?? 200;
  const g = scene.add.graphics().setPosition(x, y).setDepth(opts.depth ?? 320);
  g.lineStyle(opts.width ?? 6, opts.color ?? COLOR.goldLight, 0.95).strokeCircle(0, 0, r);
  g.lineStyle(2, 0xffffff, 0.8).strokeCircle(0, 0, r * 0.92);
  g.setScale(0.15);
  scene.tweens.add({ targets: g, scale: 1, alpha: 0, duration: dur(opts.ms ?? 380), ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
}

/**
 * 炸弹落桌：打出的牌先被"举起"放大，约 110 毫秒砸到桌面（压扁一点），冲击波圆环、火星、尘土一起迸开，再用约 100 毫秒回弹。
 * 和大字同时播，调用方 Promise.all 一起等。牌组中途被清掉（场景销毁、清桌）就地收手。
 */
export async function bombStrike(
  scene: Phaser.Scene,
  at: { x: number; y: number },
  cards: Phaser.GameObjects.Container[],
  tier: number,
): Promise<void> {
  if (dur(1) === 0) return;
  const p = strikeParams(tier);
  const live = (): Phaser.GameObjects.Container[] => cards.filter((c) => c.active);
  const base = cards.map((c) => ({ c, sx: c.scaleX, sy: c.scaleY, y: c.y }));
  base.forEach((b) => b.c.setScale(b.sx * p.lift, b.sy * p.lift).setY(b.y - p.rise));
  await Promise.all(
    base.map((b) => tweenP(scene, { targets: b.c, scaleX: b.sx * p.dip, scaleY: b.sy * p.dip, y: b.y + 3, duration: STRIKE_MS.slam, ease: 'Cubic.easeIn' })),
  );
  if (!scene.sys.isActive()) return;
  shockwave(scene, at.x, at.y, { radius: p.ring, width: p.ringWidth, color: tier >= 4 ? 0xffe7a0 : tier >= 3 ? 0xffb040 : 0xfff0c8 });
  burst(scene, at.x, at.y, 'spark', p.sparks, { speed: [140, 360 + tier * 70], life: 600, gravity: 260 });
  burst(scene, at.x, at.y, 'smoke', p.dust, { speed: [60, 200], life: 700, gravity: 20, scale: [0.9, 1.8], tint: [0xd8c8a8, 0xb8a888] });
  shake(scene, 140, p.shake);
  await Promise.all(
    base
      .filter((b) => live().includes(b.c))
      .map((b) => tweenP(scene, { targets: b.c, scaleX: b.sx, scaleY: b.sy, y: b.y, duration: STRIKE_MS.settle, ease: 'Back.easeOut' })),
  );
}

/**
 * 炸弹压炸弹的对撞：在落桌点再补两圈反色的冲击波（红一圈、金一圈错开 90 毫秒）、一团更猛的火星和一下重震，
 * 叠在 bombStrike 上同时播，不加总时长。关了动画什么都不做
 */
export function bombClash(scene: Phaser.Scene, at: { x: number; y: number }): void {
  if (dur(1) === 0) return;
  shockwave(scene, at.x, at.y, { radius: 300, width: 10, color: COLOR.red, ms: 460 });
  scene.time.delayedCall(dur(90), () => shockwave(scene, at.x, at.y, { radius: 360, width: 6, color: COLOR.goldLight, ms: 520 }));
  burst(scene, at.x, at.y, 'spark', LOW_MEMORY ? 24 : 70, { speed: [260, 720], life: 900, gravity: 320, tint: [0xff6a3a, COLOR.goldLight, 0xffffff] });
  shake(scene, 260, 0.02);
}

/** 春天 / 反春：整屏暖色调 + 花瓣雨 + 大字，总长约 1.3 秒（PACE.ddz.spring 控制大字停留）。省内存设备花瓣减到三分之一 */
export async function springBloom(scene: Phaser.Scene, anti: boolean): Promise<void> {
  if (dur(1) === 0) return;
  const W = worldW(scene);
  const tint = scene.add.graphics().setDepth(3290);
  tint.fillStyle(anti ? 0xffa88a : 0xffc890, 1).fillRect(0, 0, W, GAME_HEIGHT);
  tint.setAlpha(0);
  const total = PACE.word.in + PACE.ddz.spring + PACE.word.out;
  scene.tweens.add({ targets: tint, alpha: 0.3, duration: dur(300), ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: tint, alpha: 0, delay: dur(total - 450), duration: dur(450), onComplete: () => tint.destroy() });
  const em = scene.add.particles(0, -20, texOr(scene, 'particle:petal'), {
    x: { min: 0, max: W },
    speedY: { min: 260, max: 460 },
    speedX: { min: -60, max: 60 },
    lifespan: dur(2200),
    rotate: { min: 0, max: 360 },
    scale: { min: 0.7, max: 1.3 },
    frequency: LOW_MEMORY ? 90 : 28,
    alpha: { start: 1, end: 0.2 },
    tint: anti ? [0xfff0a0, 0xffd25a, 0xff9a6a] : [0xffb7c5, 0xff8fa3, 0xffe3ec],
  });
  em.setDepth(3400);
  scene.time.delayedCall(dur(total - 200), () => em.stop());
  scene.time.delayedCall(dur(total + 2600), () => em.destroy());
  await bigWord(scene, anti ? '反春！' : '春天！', {
    color: 0xffe3ec,
    stroke: anti ? COLOR.redDark : 0x8a2a4a,
    size: 100,
    hold: PACE.ddz.spring,
    sub: anti ? '地主只出了一手' : '农民一手都没出',
  });
}
