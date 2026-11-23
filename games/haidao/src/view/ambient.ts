import type Phaser from 'phaser';
import { BEACH, ISLAND } from '../core/types.ts';
import { coastArt, mapDecoArt } from './art/index.ts';
import { h32 } from './art/grade.ts';
import { iso } from './iso.ts';
import { LOW_MEMORY } from './viewport.ts';
import { REDUCED } from './feel.ts';
import { DEV } from './devflags.ts';

/**
 * 海面上"活"的东西（装饰，不影响规则，不碰存档）：沿岸推上来又退下去的浪舌、波光、偶尔游过的鱼群、偶尔飞过的海鸥。
 * 全部是开场建好的少数几个图像，用补间动位移和透明度（浪带、波光的图都是烘好的纹理），不每帧重画、不新建对象；
 * 位置、节奏全由编号定（确定性）。手机少放一半；系统设了"减弱动态效果"就只放静止的浪舌。
 * 一共约 18 个对象（手机 11 个），帧率测量里的"显示对象"数要把它们算进去。
 * 空白海面（岛外一大片）另有远处漂的船、飘过的云影、飞过的海鸟，共 6 个对象（手机 3 个），同样只用补间和一个 onUpdate，不新建对象。
 * ext 是岛按主寨扩了几圈：沿岸的东西跟着往外挪。返回的函数把这些对象和补间全收掉（基地里主寨跨档升级、岛变大时重开一遍）。
 */

const EDGE = ['top', 'right', 'bottom', 'left'] as const;
/** 各边的外法线（屏幕方向，已归一）和海岸线的倾角 */
const NORMAL = [
  { nx: 0.894, ny: -0.447, rot: 0.4636 },
  { nx: 0.894, ny: 0.447, rot: -0.4636 },
  { nx: -0.894, ny: 0.447, rot: 0.4636 },
  { nx: -0.894, ny: -0.447, rot: -0.4636 },
] as const;

/** 沿第 side 条边、离岛 e 格、沿边位置 t（0..1）的屏幕点；e 从不扩的岛边量起（岛扩了 ext 圈就传 e + ext） */
function onEdge(side: number, e: number, t: number): { x: number; y: number } {
  const I = ISLAND;
  const a = -e + t * (I + 2 * e);
  switch (EDGE[side]) {
    case 'top':
      return iso(a, -e);
    case 'right':
      return iso(I + e, a);
    case 'bottom':
      return iso(I + e - (a + e), I + e);
    default:
      return iso(-e, I + e - (a + e));
  }
}

const frac = (n: number, k: number): number => (h32(n, k, 77) % 1000) / 1000;

export function startAmbient(scene: Phaser.Scene, r: number, ext: number): () => void {
  const sc = 1 / r;
  const objs: Phaser.GameObjects.Image[] = [];
  const tws: Phaser.Tweens.Tween[] = [];
  const stop = (): void => {
    for (const t of tws) t.remove();
    for (const o of objs) o.destroy();
  };
  const img = (p: { key: string; ax: number; ay: number; w: number; h: number }, x: number, y: number, depth: number): Phaser.GameObjects.Image => {
    const im = scene.add.image(x, y, p.key).setOrigin(p.ax / p.w, p.ay / p.h).setScale(sc).setDepth(depth);
    objs.push(im);
    return im;
  };
  const tween = (cfg: Phaser.Types.Tweens.TweenBuilderConfig): void => {
    tws.push(scene.tweens.add(cfg));
  };

  // 浪舌：贴着沙滩外缘，慢慢推上来、停一下、退回去
  const swash = coastArt('swash');
  const nSwash = LOW_MEMORY ? 6 : 10;
  for (let i = 0; i < nSwash; i++) {
    const side = i % 4;
    const base = onEdge(side, BEACH + 0.2 + ext, 0.12 + 0.76 * frac(i, 1));
    const n = NORMAL[side]!;
    const im = img(swash, base.x - n.nx * 5, base.y - n.ny * 5, -99).setRotation(n.rot).setAlpha(REDUCED ? 0.5 : 0);
    if (REDUCED) continue;
    tween({
      targets: im,
      x: base.x + n.nx * 9,
      y: base.y + n.ny * 9,
      alpha: 0.75,
      duration: 2200 + (i % 3) * 400,
      yoyo: true,
      hold: 500,
      repeat: -1,
      repeatDelay: 600 + (i % 4) * 500,
      delay: Math.floor(frac(i, 2) * 4000),
      ease: 'Sine.easeInOut',
    });
  }
  if (REDUCED) return stop;

  // 波光：外海里的小亮点，一闪一闪
  const glint = coastArt('glint');
  const nGlint = LOW_MEMORY ? 3 : 6;
  for (let i = 0; i < nGlint; i++) {
    const p = onEdge(i % 4, BEACH + 1.4 + 1.2 * frac(i, 3) + ext, 0.1 + 0.8 * frac(i, 4));
    const im = img(glint, p.x, p.y, -98).setAlpha(0).setScale(sc * 0.5);
    tween({
      targets: im,
      alpha: 0.95,
      scale: sc * 1.1,
      duration: 700 + (i % 3) * 300,
      yoyo: true,
      repeat: -1,
      repeatDelay: 1200 + Math.floor(frac(i, 5) * 3000),
      delay: Math.floor(frac(i, 6) * 5000),
      ease: 'Sine.easeInOut',
    });
  }

  // 鱼群：隔一阵游过一次，顺着海岸线外一圈走，淡入淡出
  const fish = img(coastArt('fish'), 0, 0, -98).setAlpha(0);
  const swim = { k: 0 };
  let cycle = 0;
  const place = (t: number): void => {
    const side = (cycle * 3 + 1) % 4;
    const dir = cycle % 2 ? -1 : 1;
    const p = onEdge(side, BEACH + 1.7 + (cycle % 3) * 0.5 + ext, 0.2 + 0.6 * (dir > 0 ? t : 1 - t));
    fish.setPosition(p.x, p.y).setAlpha(Math.min(1, Math.sin(Math.PI * t) * 1.6)).setScale(dir * sc, sc);
  };
  tween({
    targets: swim,
    k: 1,
    duration: 16000,
    repeat: -1,
    repeatDelay: 22000,
    delay: 6000,
    onStart: () => place(0),
    onRepeat: () => {
      cycle++;
    },
    onUpdate: () => place(swim.k),
  });

  // 海鸥：隔很久飞过一次岛上空
  const gp = mapDecoArt('gull');
  const gull = img(gp, 0, 0, 9000).setAlpha(0);
  const fly = { k: 0 };
  const a = iso(-6 - ext, 16);
  const b = iso(ISLAND + 6 + ext, 2);
  tween({
    targets: fly,
    k: 1,
    duration: 24000,
    repeat: -1,
    repeatDelay: 30000,
    delay: 12000,
    onUpdate: () => {
      const t = fly.k;
      gull.setPosition(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - 150 + Math.sin(t * 40) * 6).setAlpha(Math.min(1, Math.sin(Math.PI * t) * 3) * 0.9).setScale(sc * (1 + Math.sin(t * 40) * 0.18), sc);
    },
  });

  // ?sea=0 关掉空白海面的船 / 云影 / 海鸟（帧率 A/B 用：perf.ts --query sea=0）
  if (DEV.sea) openSea(scene, sc, img, tween);
  return stop;
}

/** 岛外空白海面的区域（世界坐标）：竖屏时可见区比烘好的地面大得多，这几条带子刚好落在岛的上下两侧 */
const SEA_N = { y0: -1500, y1: -420 } as const;
const SEA_S = { y0: 1000, y1: 2000 } as const;

/**
 * 空白海面：远处慢慢漂的船（沿等距方向走，淡入淡出）、云影（大块很淡的深蓝，从一侧飘到另一侧，盖在地面上、建筑下面）、海鸟（扇翅膀）。
 * 位置、速度由编号定；全部对象池式固定个数，手机各减半。
 */
function openSea(
  scene: Phaser.Scene,
  sc: number,
  img: (p: { key: string; ax: number; ay: number; w: number; h: number }, x: number, y: number, depth: number) => Phaser.GameObjects.Image,
  tween: (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => void,
): void {
  // 只在镜头里（含一圈余量）时才画：电脑横屏时上下两条海面大多在屏外，屏外的不进渲染、不打断合批（帧率 A/B：perf.ts --query sea=0）
  const cam = scene.cameras.main;
  const put = (im: Phaser.GameObjects.Image, x: number, y: number, a: number): void => {
    const v = cam.worldView;
    const w = Math.abs(im.displayWidth);
    const h = Math.abs(im.displayHeight);
    const on = a > 0.01 && x + w > v.x && x - w < v.right && y + h > v.y && y - h < v.bottom;
    if (on) im.setPosition(x, y).setAlpha(a);
    if (im.visible !== on) im.setVisible(on);
  };
  // 远船：北边一条、南边一条（手机只放北边），朝向用翻转表示，船头顺着等距方向
  const ship = mapDecoArt('ship');
  const nShip = LOW_MEMORY ? 1 : 2;
  for (let i = 0; i < nShip; i++) {
    const band = i === 0 ? SEA_N : SEA_S;
    const dir = i === 0 ? 1 : -1;
    const x0 = -700 + 500 * frac(i, 11);
    const y0 = band.y0 + (band.y1 - band.y0) * (0.25 + 0.5 * frac(i, 12));
    const len = 620;
    const im = img(ship, x0, y0, -97).setAlpha(0).setScale(dir * sc * 1.3, sc * 1.3);
    const t = { k: 0 };
    tween({
      targets: t,
      k: 1,
      duration: 110000 + i * 30000,
      repeat: -1,
      repeatDelay: 6000 + i * 9000,
      delay: i * 17000,
      onUpdate: () => put(im, x0 + dir * len * t.k, y0 + dir * len * 0.5 * t.k + Math.sin(t.k * 60) * 1.5, Math.min(1, Math.sin(Math.PI * t.k) * 3) * 0.95),
    });
  }

  // 云影：从左飘到右，很慢；放大一倍半左右（再大整片半透明填充太贵），淡入淡出
  const cloud = coastArt('cloud');
  const nCloud = LOW_MEMORY ? 1 : 2;
  for (let i = 0; i < nCloud; i++) {
    // 走岛外上下两条空白海面（横穿岛中间的话电脑横屏时整片半透明盖在岛上，填充约占 2% 帧率）
    const band = i === 0 ? SEA_N : SEA_S;
    const y = (band.y0 + band.y1) / 2;
    const big = 1.6 + 0.4 * frac(i, 13);
    const im = img(cloud, 0, y, -90).setAlpha(0).setScale(sc * big, sc * big * 0.9).setFlipX(i === 1);
    const t = { k: 0 };
    tween({
      targets: t,
      k: 1,
      duration: 90000 + i * 25000,
      repeat: -1,
      delay: i * 30000,
      onUpdate: () => put(im, -1900 + 3800 * t.k, y + 120 * Math.sin(t.k * Math.PI), Math.min(1, Math.sin(Math.PI * t.k) * 2.2) * 0.24),
    });
  }

  // 海鸟：飞过岛外的天空，扇翅膀（只改纵向缩放）；手机一只
  const gull = mapDecoArt('gull');
  const nBird = LOW_MEMORY ? 1 : 2;
  for (let i = 0; i < nBird; i++) {
    const band = i === 0 ? SEA_N : SEA_S;
    const dir = i === 0 ? 1 : -1;
    const ya = band.y0 + (band.y1 - band.y0) * (0.2 + 0.4 * frac(i, 14));
    const im = img(gull, 0, ya, 9000).setAlpha(0);
    const t = { k: 0 };
    tween({
      targets: t,
      k: 1,
      duration: 26000 + i * 9000,
      repeat: -1,
      repeatDelay: 14000 + i * 11000,
      delay: 4000 + i * 13000,
      onUpdate: () => {
        const flap = Math.sin(t.k * 150);
        put(im, -1300 + 2600 * (dir > 0 ? t.k : 1 - t.k), ya + 260 * t.k * dir + Math.sin(t.k * 25) * 14, Math.min(1, Math.sin(Math.PI * t.k) * 4) * 0.85);
        if (im.visible) im.setScale(sc * 1.6 * (dir > 0 ? 1 : -1), sc * 1.6 * (0.55 + 0.45 * Math.abs(flap)));
      },
    });
  }
}
