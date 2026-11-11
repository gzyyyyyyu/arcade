import type Phaser from 'phaser';
import { BEACH, ISLAND } from '../core/types.ts';
import * as ArtMod from './art/index.ts';
import { iso } from './iso.ts';
import type { Bounds } from './camctl.ts';
import { h32 } from './art/grade.ts';
import { LOW_MEMORY } from './viewport.ts';
import { paintTerrain, SEA_BG } from './terrain.ts';
import { DEPTH } from './depth.ts';

export { SEA_BG };

/** 岛外画多远的浅滩/海面（格） */
const EXT = BEACH + 3;

/** 离岛的方块距离：岛内 0，海滩 1..BEACH */
export function ringOf(gx: number, gy: number): number {
  return Math.max(0, -gx, gx - (ISLAND - 1), -gy, gy - (ISLAND - 1));
}

export function worldBounds(): Bounds {
  const e = EXT - 1;
  return { x0: -(ISLAND + 2 * e) * 32, x1: (ISLAND + 2 * e) * 32, y0: -e * 32, y1: (ISLAND + e) * 32 };
}

/** 画面层用的确定性散列（同一个格子每次得到同一个数，不用随机数） */
export function hash2(x: number, y: number, salt = 0): number {
  let h = (Math.imul(x + 1000, 73856093) ^ Math.imul(y + 1000, 19349663) ^ Math.imul(salt + 7, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

const COAST = ['reef', 'wave', 'shoal', 'foamPatch'] as const;

/**
 * 铺地：海（由近到远的浅深渐变）、带湿沙的沙滩、成片深浅的草地，再沿岛外缘撒海岸件打破直边（terrain.ts 画，全是程序生成）。
 * soft：战斗和守岛里细节收一收（格子线更淡、花草少），免得和兵、塔抢眼。
 *
 * 地面是静态的，不能一格一个显示对象：整张图开场用 canvas 2D 一次烘成（每个 soft × 倍数只烘一次，换场景复用）；
 * canvas 纹理在 WebGL 丢了又恢复后由 Phaser 自动重传，不会变空白。
 * 烘焙倍数：手机平板 1（省显存），电脑最多 1.5。
 */
export function drawGround(scene: Phaser.Scene, r: number, soft = false): Phaser.GameObjects.Image {
  const s = LOW_MEMORY ? 1 : Math.min(r, 1.5);
  const key = `ground.v3.${soft ? 'soft' : 'hard'}.${s}.${r}`;
  const x0 = -(ISLAND + 2 * EXT) * 32;
  const y0 = -EXT * 32;
  const w = (ISLAND + 2 * EXT) * 64;
  const h = (ISLAND + 2 * EXT) * 32;
  if (!scene.textures.exists(key)) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * s);
    cv.height = Math.ceil(h * s);
    const cx = cv.getContext('2d')!;
    cx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    paintTerrain(cx, { soft, x0, y0, s, w, h });
    // 海岸件：浅滩和外海那几圈里，约每 6 格一件，种类和偏移都由格子坐标定
    for (let gy = -EXT; gy < ISLAND + EXT; gy++) {
      for (let gx = -EXT; gx < ISLAND + EXT; gx++) {
        const d = ringOf(gx, gy);
        if (d < BEACH + 1 || d >= EXT) continue;
        const hh = hash2(gx, gy);
        if (hh % 6 !== 0) continue;
        const c = ArtMod.coastArt(COAST[(hh >>> 4) % COAST.length]!);
        const o = iso(gx + 0.5, gy + 0.5);
        cx.globalAlpha = soft ? 0.6 : 0.85;
        cx.drawImage(scene.textures.get(c.key).getSourceImage() as CanvasImageSource, o.x + (((hh >>> 8) % 33) - 16) - c.ax, o.y + (((hh >>> 14) % 17) - 8) - c.ay, c.w, c.h);
      }
    }
    cx.globalAlpha = 1;
    scene.textures.addCanvas(key, cv);
  }
  return scene.add.image(x0, y0, key).setOrigin(0, 0).setScale(1 / s).setDepth(DEPTH.ground);
}

export interface DecoSpr {
  img: Phaser.GameObjects.Image;
  gx: number;
  gy: number;
}

/**
 * 岛上空地撒装饰件（少量）。美术导出 decoArt / DECO_KINDS 之前什么也不画。
 * occupied(gx, gy) 为真的格子不放；建筑变了之后用 toggleDeco 刷新可见性。
 */
export function scatterDeco(scene: Phaser.Scene, r: number, occupied: (gx: number, gy: number) => boolean): DecoSpr[] {
  const kinds = ArtMod.DECO_KINDS;
  const out: DecoSpr[] = [];
  for (let gy = 0; gy < ISLAND; gy++) {
    for (let gx = 0; gx < ISLAND; gx++) {
      const h = hash2(gx, gy, 5);
      if (h % 23 !== 0) continue;
      const p = ArtMod.decoArt(kinds[(h >>> 5) % kinds.length]!);
      const s = iso(gx + 0.5, gy + 0.5);
      const img = scene.add.image(s.x, s.y, p.key).setOrigin(p.ax / p.w, p.ay / p.h).setScale(1 / r).setDepth(gx + gy + 0.2);
      img.setVisible(!occupied(gx, gy));
      out.push({ img, gx, gy });
    }
  }
  return out;
}

export function toggleDeco(list: DecoSpr[], occupied: (gx: number, gy: number) => boolean): void {
  for (const d of list) d.img.setVisible(!occupied(d.gx, d.gy));
}

/**
 * 同类物件的小变化（避免复制粘贴感）：按建筑 id 做确定性的亮度冷暖微差（乘色，最多暗 6%）；
 * 棕榈再按 id 左右翻一半（不转角度：棕榈的叶子画法经不起旋转）。不新增贴图、不改尺寸，纯参数。
 */
export function jitter(im: Phaser.GameObjects.Image, kind: string, id: number): Phaser.GameObjects.Image {
  if (kind === 'treasure' || kind === 'chest') return im; // 宝藏要最亮，不压暗
  const h = h32(id, kind.charCodeAt(0), kind.length);
  const base = (h >>> 8) % 12;
  const r = 255 - (h >>> 20) % 6 - base / 3;
  const g = 255 - base;
  const b = 255 - base - (h >>> 24) % 6;
  im.setTint((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b));
  if (kind === 'palm' && (h & 1) === 1) im.setFlipX(true); // 棕榈左右对称得过去，翻一半
  return im;
}

/** 在世界里贴一张素材（锚点 + 倍数） */
export function put(scene: Phaser.Scene, r: number, p: { key: string; w: number; h: number; ax: number; ay: number }, wx: number, wy: number): Phaser.GameObjects.Image {
  return scene.add.image(wx, wy, p.key).setOrigin(p.ax / p.w, p.ay / p.h).setScale(1 / r);
}

/**
 * 开场视角：横屏、电脑把整座岛（含海滩）装进屏幕；竖屏手机把岛撑满顶栏和底部操作区之间的空白，
 * 岛比屏幕宽一点没关系（拖动、双指缩放照常）：缩放取"撑满高度"和"最多比铺满宽度大 1.6 倍"里小的，免得两侧被切太多。
 * top、bottom 是顶栏、底部操作区占的 CSS 像素；返回的 cx、cy 是相机中心（世界坐标）。
 */
export function fitView(w: number, h: number, top: number, bottom: number): { z: number; minZ: number; maxZ: number; cx: number; cy: number } {
  const c = iso(ISLAND / 2, ISLAND / 2);
  if (h > w) {
    const zW = (1.15 * w) / (ISLAND * 64);
    const zH = Math.max(40, h - top - bottom) / ((ISLAND + 2) * 32);
    const z = Math.min(zH, zW * 1.6);
    const mid = (top + h - bottom) / 2;
    return { z, minZ: zW * 0.6, maxZ: z * 2.5, cx: c.x, cy: c.y - (mid - h / 2) / z };
  }
  const z = Math.min((0.96 * w) / ((ISLAND + 2 * BEACH) * 64), (h - 250) / 1000);
  return { z, minZ: z * 0.7, maxZ: z * 2.5, cx: c.x, cy: c.y - 20 };
}
