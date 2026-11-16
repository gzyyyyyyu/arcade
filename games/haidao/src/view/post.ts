import type Phaser from 'phaser';
import { LOW_MEMORY } from './viewport.ts';
import { DEPTH } from './depth.ts';
import { REDUCED } from './feel.ts';

/**
 * 整屏后期，全部是便宜的做法：
 * - 暗角 + 暖色调色 + 关卡天气：画布和界面之间的一层静态 CSS 渐变（不读画布、不混合，只多一个合成层）；
 * - 泛光：火焰、爆炸、炮口处放一个柔光圆盘（加色混合，对象池里 10 个，不新建、不用补间）。
 *   低端机自动关：手机平板默认不开；开着时连续 2 秒帧率低于约 30 就永久关掉；系统开了"减弱动态效果"也不开。
 *   `?bloom=1` 强制开（不自动关）、`?bloom=0` 强制关，测帧率 A/B 用。
 */

export type Weather = 'clear' | 'fog' | 'dusk' | 'night';

/** 守岛关卡的天气：先看关卡已有字段（雾区 → 雾，首领技能 → 黄昏），再用这张表按关卡 id 补（不改关卡数据） */
const WEATHER_BY_ID: Record<string, Weather> = {
  td04: 'fog',
  td06: 'dusk',
  td08: 'fog',
  td12: 'night',
  td18: 'dusk',
};
export function weatherOf(level: { id: string; fogZones?: unknown[]; bossSkill?: unknown } | undefined): Weather {
  if (!level) return 'clear';
  const t = WEATHER_BY_ID[level.id];
  if (t) return t;
  if (level.fogZones?.length) return 'fog';
  if (level.bossSkill) return 'dusk';
  return 'clear';
}

const LAYER = 'hd-post';
let layer: HTMLElement | null = null;

/** 在画布和界面之间放那一层（只放一次）；样式写在行内，不依赖界面根节点 */
export function mountPost(): void {
  if (layer?.isConnected) return;
  const ui = document.getElementById('ui');
  if (!ui?.parentElement) return;
  layer = document.createElement('div');
  layer.className = LAYER;
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0';
  ui.parentElement.insertBefore(layer, ui);
  setWeather('clear');
}

const SCENE: Record<Weather, string> = {
  // 暖色调色（很淡的橘）+ 清透的深海蓝暗角（紫黑暗角会把四角海水压成浑浊的灰紫）
  clear: 'radial-gradient(ellipse 78% 74% at 50% 46%,rgba(255,200,130,0) 52%,rgba(10,42,68,.22) 100%),linear-gradient(rgba(255,190,110,.055),rgba(255,190,110,.055))',
  // 雾：灰蓝罩一层，暗角更轻
  fog: 'radial-gradient(ellipse 80% 76% at 50% 46%,rgba(150,170,190,.1) 40%,rgba(40,52,68,.42) 100%),linear-gradient(rgba(150,172,196,.2),rgba(130,150,174,.26))',
  // 黄昏：上橘下紫
  dusk: 'radial-gradient(ellipse 78% 74% at 50% 46%,rgba(255,150,70,0) 48%,rgba(40,14,30,.5) 100%),linear-gradient(rgba(255,138,60,.2),rgba(150,60,110,.16))',
  // 夜：蓝黑
  night: 'radial-gradient(ellipse 74% 70% at 50% 46%,rgba(60,80,140,0) 38%,rgba(6,8,26,.62) 100%),linear-gradient(rgba(30,44,100,.3),rgba(14,20,60,.36))',
};

export function setWeather(w: Weather): void {
  if (layer) layer.style.background = SCENE[w];
}

// ---------------------------------------------------------------- 泛光

const POOL = 10;
const GLOW = 'hd.glow';

/** 柔光圆盘贴图，画一次：中心白、向外平滑衰减 */
function ensureGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW)) return;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  scene.textures.addCanvas(GLOW, c);
}

interface Glow {
  im: Phaser.GameObjects.Image;
  life: number;
  max: number;
  a0: number;
  s0: number;
  s1: number;
}

const FORCE = ((): boolean | null => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('bloom');
  return v === '1' ? true : v === '0' ? false : null;
})();

export class Bloom {
  /** 现在开着没有 */
  on: boolean;
  private readonly pool: Glow[] = [];
  private next = 0;
  private slow = 0;
  private age = 0;
  private readonly sc: number;

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, r: number) {
    this.scene = scene;
    this.on = FORCE ?? (!LOW_MEMORY && !REDUCED);
    this.sc = 1 / r;
    if (!this.on) return;
    ensureGlowTexture(scene);
    for (let i = 0; i < POOL; i++) {
      const im = scene.add.image(0, 0, GLOW).setBlendMode(1 /* ADD */).setDepth(DEPTH.glow).setVisible(false);
      this.pool.push({ im, life: 0, max: 1, a0: 0, s0: 1, s1: 1 });
    }
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', () => scene.events.off('update', this.tick, this));
  }

  /** 在世界坐标 (x, y) 亮一团光：size 约等于光晕半径（世界单位），ms 是持续时间 */
  flash(x: number, y: number, size: number, tint = 0xff9a3c, ms = 320, alpha = 0.55): void {
    if (!this.on) return;
    const g = this.pool[this.next]!;
    this.next = (this.next + 1) % POOL;
    g.life = g.max = ms;
    g.a0 = alpha;
    g.s0 = (size * 1.2 * this.sc) / 64;
    g.s1 = (size * 2.6 * this.sc) / 64;
    g.im.setPosition(x, y).setTint(tint).setAlpha(alpha).setScale(g.s0).setVisible(true);
  }

  private tick(_t: number, dt: number): void {
    this.age += dt;
    for (const g of this.pool) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) {
        g.im.setVisible(false);
        continue;
      }
      const k = 1 - g.life / g.max;
      g.im.setAlpha(g.a0 * (1 - k) * (1 - k)).setScale(g.s0 + (g.s1 - g.s0) * (1 - (1 - k) * (1 - k)));
    }
    // 自动关：开场 3 秒之后，连续 2 秒帧率低于 30 就关（强制开的不关）
    if (FORCE === true || this.age < 3000) return;
    this.slow = this.scene.game.loop.actualFps < 30 ? this.slow + dt : 0;
    if (this.slow > 2000) this.off();
  }

  private off(): void {
    this.on = false;
    for (const g of this.pool) g.im.setVisible(false);
    this.scene.events.off('update', this.tick, this);
  }
}
