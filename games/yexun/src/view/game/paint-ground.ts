/**
 * 场地的底：雪地和地形叠层的预渲染、按种子撒的点缀（枯树、残碑、石灯）。只装饰，不挡路；用的随机是画面自己的种子流，不碰核心。
 */
import type Phaser from 'phaser';
import { inRects, MAPS, type MapDef } from '../../content/maps.ts';
import type { Raid } from '../../explore/raid.ts';
import type { World } from '../../core/index.ts';
import { artRng } from '../art/draw.ts';
import { GROUND_TINT, paintTerrain } from '../art/terrain.ts';
import { LOW_MEMORY } from '../viewport.ts';

export interface GroundHost {
  img: (key: string, x: number, y: number, scale: number) => Phaser.GameObjects.Image;
  hasFrame: (key: string) => boolean;
  /** 夜探的街面（石板路）：不撒枯树、石头、草 */
  onStreet: (x: number, y: number) => boolean;
}

export class GroundPainter {
  private readonly scene: Phaser.Scene;
  private readonly w: World;
  private readonly raid: Raid | null;
  private readonly arenaW: number;
  private readonly arenaH: number;
  private readonly h: GroundHost;

  constructor(scene: Phaser.Scene, w: World, raid: Raid | null, arenaW: number, arenaH: number, h: GroundHost) {
    this.scene = scene;
    this.w = w;
    this.raid = raid;
    this.arenaW = arenaW;
    this.arenaH = arenaH;
    this.h = h;
  }

  /**
   * 省内存设备：雪地平铺 + 底色调 + 地形画进同一张图（场地四周各多 200，和平铺的范围一样），代替"平铺雪地 + 地形叠层"两遍全屏绘制。
   * 按 0.34 倍画（3,600 见方 → 1,224 像素，图集上限 2,048 以内），雪地纹理细节糊一点，换手机上少一遍全屏绘制。没有地形的图返回 false。
   */
  paintBakedGround(gtex: HTMLCanvasElement, def: MapDef): boolean {
    const scale = 0.34;
    const terr = paintTerrain(def, this.w.setup.seed, scale);
    if (!terr) return false;
    const pad = 200;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((this.arenaW + pad * 2) * scale);
    cv.height = Math.ceil((this.arenaH + pad * 2) * scale);
    const c = cv.getContext('2d')!;
    // 雪地：一块 512 世界单位，按画布倍数缩小平铺
    const pat = c.createPattern(gtex, 'repeat')!;
    pat.setTransform(new DOMMatrix().scale((512 / gtex.width) * scale));
    c.fillStyle = pat;
    c.fillRect(0, 0, cv.width, cv.height);
    // 底色调：和 setTint 一样是相乘
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = `#${GROUND_TINT[def.tone ?? 'snow'].toString(16).padStart(6, '0')}`;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(terr, pad * scale, pad * scale);
    const key = `ground_${def.id}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.scene.textures.addCanvas(key, cv);
    this.scene.add.image(this.arenaW / 2, this.arenaH / 2, key).setScale(1 / scale).setDepth(-1000);
    return true;
  }

  /** 河、冰、桥、落叶这类整张场地的地形叠层：一张 canvas，缩小存（省内存设备更小） */
  paintTerrainLayer(): void {
    const def = MAPS[this.w.mapId];
    const scale = LOW_MEMORY ? 0.34 : 0.5;
    const cv = paintTerrain(def, this.w.setup.seed, scale);
    if (!cv) return;
    const key = `terrain_${def.id}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.scene.textures.addCanvas(key, cv);
    this.scene.add.image(this.arenaW / 2, this.arenaH / 2, key).setScale(1 / scale).setDepth(-950);
  }

  /** 点缀：按种子撒在整个场地上（只装饰，不挡路）；枯树、残碑、石灯、石头、青石板、冰面、雪堆、枯草；义庄另撒白灯笼、稻草 */
  scatterDecor(): void {
    const r = artRng(this.w.setup.seed);
    const blocks = this.w.blocks;
    const mdef = MAPS[this.w.mapId];
    const water = mdef.water ?? [];
    const ice = mdef.ice ?? [];
    const bridges = mdef.bridges ?? [];
    const fire = this.w.fire;
    const spawnX = this.raid ? this.w.x : this.arenaW / 2;
    const spawnY = this.raid ? this.w.y : this.arenaH / 2;
    const put = (key: string, n: number, ground: boolean): void => {
      if (!this.h.hasFrame(key)) return;
      for (let i = 0; i < n; i++) {
        const x = 100 + r() * (this.arenaW - 200);
        const y = 100 + r() * (this.arenaH - 200);
        // 出生点附近留空，开场看得清（夜探的出生点在角上，不在中心）
        if (Math.abs(x - spawnX) < 220 && Math.abs(y - spawnY) < 160) continue;
        // 夜探的街面是石板路：不撒枯树、石头、草，只留雪堆
        if (this.h.onStreet(x, y) && key !== 'drift') continue;
        // 不压在墙、棺材上（立着的东西离远一点）
        const pad = ground ? 10 : 50;
        // 水里、冰面上不撒点缀（桥在水区之间的缺口里，一并避开）
        if (water.length && (inRects(water, x, y) || bridges.some((r) => x > r.x - 30 && x < r.x + r.w + 30 && y > r.y - 30 && y < r.y + r.h + 30)) && key !== 'rock') continue;
        if (water.length && ground && water.some((r) => x > r.x - 40 && x < r.x + r.w + 40 && y > r.y - 40 && y < r.y + r.h + 40)) continue;
        if (ice.length && inRects(ice, x, y) && key !== 'puddle' && key !== 'drift') continue;
        // 火区（乱葬岗磷火地、窑口）里不撒立着的东西，地上的小点缀也让开（焦土上只有火）
        if (fire.some((z) => x > z.x - pad && x < z.x + z.w + pad && y > z.y - pad && y < z.y + z.h + pad * 2)) continue;
        if (blocks.some((b) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad * 2)) continue;
        const o = this.h.img(key, x, y, 0.85 + r() * 0.35);
        if (r() < 0.5) o.setFlipX(true);
        o.setDepth(ground ? -900 + r() : y);
      }
    };
    // 夜探的场地是守夜的四倍大，点缀只多一倍（墙和房子已经很多）
    const dense = (LOW_MEMORY ? 0.6 : 1) * (this.raid ? 2 : 1);
    put('drift', Math.round(60 * dense), true);
    put('puddle', Math.round(26 * dense), true);
    put('slabs', Math.round(30 * dense), true);
    put('grass', Math.round(220 * (this.raid ? dense / 2 : dense)), true);
    const yz = !this.raid && this.w.mapId === 'yizhuang';
    // 山寺的树都是古松（Town 里摆），不再撒枯树
    // 竹林里本来就是竹子，不再撒枯树；冰湖上雪堆多一点
    if (this.raid?.setup.template !== 'shansi' && mdef.tone !== 'bamboo') put('tree', Math.round((yz ? 26 : mdef.tone === 'ice' ? 24 : 46) * dense), false);
    put('rock', Math.round(60 * dense), false);
    put('stele', Math.round(18 * dense), false);
    put('stonelamp', Math.round(22 * dense), false);
    // 鬼市：巷子里零星立着白灯笼（摊子上挂的是红的）
    if (mdef.tone === 'market') put('white_lantern', Math.round(24 * dense), false);
    if (yz) {
      put('white_lantern', Math.round(30 * dense), false);
      put('straw', Math.round(30 * dense), true);
    }
  }
}
