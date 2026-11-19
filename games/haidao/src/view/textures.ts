import type Phaser from 'phaser';
import { allArt, type ArtPiece } from './art/index.ts';
import { h32, rng } from './art/grade.ts';

/** 每张纹理里不透明像素的外框（纹理像素）：血条贴着建筑真正的顶，引导高亮框框住真正的样子 */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
const boxes = new Map<string, Box>();
/** 已经烘成纹理的 key：高等级外观没烘到时，场景用低一级顶替 */
const baked = new Set<string>();
export const isBaked = (key: string): boolean => baked.has(key);
export const artBox = (key: string): Box | undefined => boxes.get(key);
/** 图的不透明部分的顶（世界坐标）：血条、伤害数字、守岛塔上的升级箭头都贴着它，不飘在透明空白上 */
export function artTop(im: Phaser.GameObjects.Image): number {
  return im.y - im.originY * im.displayHeight + (artBox(im.texture.key)?.t ?? 0) * Math.abs(im.scaleY);
}

function scanBox(c: HTMLCanvasElement): Box {
  const w = c.width;
  const h = c.height;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let l = w, t = h, r = 0, b = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]! > 24) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  return r >= l ? { l, t, r, b } : { l: 0, t: 0, r: w, b: h };
}

/** 颗粒小图（按渲染倍数各一张）：深浅两色的细碎斑点，烘建筑时盖一层，去掉矢量的塑料感 */
const grainTiles = new Map<number, HTMLCanvasElement>();
function grainTile(r: number): HTMLCanvasElement {
  let t = grainTiles.get(r);
  if (t) return t;
  const n = Math.round(96 * r);
  t = document.createElement('canvas');
  t.width = t.height = n;
  const cx = t.getContext('2d')!;
  const R = rng(h32(1, 2, 3));
  for (let i = 0; i < 520; i++) {
    cx.fillStyle = R() < 0.5 ? 'rgba(40,24,10,0.5)' : 'rgba(255,240,210,0.5)';
    const w = (0.8 + R() * 1.4) * r;
    cx.fillRect(R() * n, R() * n, w, w * 0.8);
  }
  grainTiles.set(r, t);
  return t;
}

/**
 * 建筑烘焙后的统一光照和颗粒：只改已有的不透明像素（source-atop）。
 * 光从左上来：左上偏暖、右下偏冷；再盖一层按键值错开的颗粒（同一座建筑永远同样，不同建筑错开）。
 * 一次性的合成，运行时不增加任何开销。
 */
function finish(c: HTMLCanvasElement, key: string, r: number): void {
  if (!key.startsWith('b.')) return;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.save();
  cx.globalCompositeOperation = 'source-atop';
  const g = cx.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, 'rgba(255,228,170,0.12)');
  g.addColorStop(0.5, 'rgba(255,228,170,0)');
  g.addColorStop(1, 'rgba(31,69,110,0.14)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, c.width, c.height);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = h32(h, key.charCodeAt(i));
  const pat = cx.createPattern(grainTile(r), 'repeat');
  if (pat) {
    cx.globalAlpha = 0.5;
    cx.translate(h % 96, (h >>> 8) % 96);
    cx.fillStyle = pat;
    cx.fillRect(-96, -96, c.width + 192, c.height + 192);
  }
  cx.restore();
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('素材加载失败'));
    im.src = src;
  });
}

/** 把一张 SVG 按渲染倍数画进 canvas，注册成纹理（纹理尺寸 = w*r × h*r，贴出来时 setScale(1/r)） */
async function bake(tm: Phaser.Textures.TextureManager, p: ArtPiece, r: number): Promise<void> {
  if (tm.exists(p.key)) {
    baked.add(p.key);
    return;
  }
  const url = URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }));
  try {
    const im = await load(url);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(p.w * r));
    c.height = Math.max(1, Math.round(p.h * r));
    // willReadFrequently：紧接着要 getImageData 读不透明外框，不加的话浏览器每次读回都警告（一局 359 条）
    c.getContext('2d', { willReadFrequently: true })!.drawImage(im, 0, 0, c.width, c.height);
    finish(c, p.key, r);
    boxes.set(p.key, scanBox(c));
    tm.addCanvas(p.key, c);
    baked.add(p.key);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 全部素材分批烘焙成纹理，全部完成才返回 */
export async function bakeAll(tm: Phaser.Textures.TextureManager, r: number, onProgress?: (done: number, total: number) => void): Promise<void> {
  const all = allArt();
  let done = 0;
  for (let i = 0; i < all.length; i += 24) {
    await Promise.all(all.slice(i, i + 24).map((p) => bake(tm, p, r).then(() => onProgress?.(++done, all.length))));
  }
}

/**
 * 把一批小素材烘进一张图集（分件骨架的部件用：一个兵 10 张图都在同一张贴图上，画的时候不换贴图）。
 * 每张按渲染倍数画好后按高度排成行（行宽 2048，四周留 2 像素防止线性过滤串色），帧名 = 素材 key，
 * 锚点（素材的 ax、ay，按渲染倍数）存在帧的 customData 里，贴图时 setOrigin(ax / 帧宽, ay / 帧高)。
 */
export async function bakeAtlas(tm: Phaser.Textures.TextureManager, key: string, pieces: ArtPiece[], r: number): Promise<void> {
  if (tm.exists(key)) return;
  const ims = await Promise.all(
    pieces.map(async (p) => {
      const url = URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }));
      try {
        return { p, im: await load(url), w: Math.max(1, Math.round(p.w * r)), h: Math.max(1, Math.round(p.h * r)) };
      } finally {
        URL.revokeObjectURL(url);
      }
    }),
  );
  const W = 2048;
  const PAD = 2;
  const order = ims.map((_, i) => i).sort((a, b) => ims[b]!.h - ims[a]!.h);
  const at: Array<{ x: number; y: number }> = [];
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const i of order) {
    const it = ims[i]!;
    if (x + it.w + PAD > W) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    at[i] = { x, y };
    x += it.w + PAD;
    rowH = Math.max(rowH, it.h);
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = y + rowH + PAD;
  const cx = c.getContext('2d')!;
  ims.forEach((it, i) => cx.drawImage(it.im, at[i]!.x, at[i]!.y, it.w, it.h));
  // 炮塔会转的部分（炮管、喷嘴）补上和底座（finish）一样的左上暖、右下冷，不然炮头比底座平、比底座亮；不加颗粒
  if (key.startsWith('tur.')) {
    cx.globalCompositeOperation = 'source-atop';
    ims.forEach((it, i) => {
      const { x: ox, y: oy } = at[i]!;
      const g = cx.createLinearGradient(ox, oy, ox + it.w, oy + it.h);
      g.addColorStop(0, 'rgba(255,228,170,0.12)');
      g.addColorStop(0.5, 'rgba(255,228,170,0)');
      g.addColorStop(1, 'rgba(31,69,110,0.16)');
      cx.fillStyle = g;
      cx.fillRect(ox, oy, it.w, it.h);
    });
    cx.globalCompositeOperation = 'source-over';
  }
  const tex = tm.addCanvas(key, c);
  if (!tex) return;
  ims.forEach((it, i) => {
    const fr = tex.add(it.p.key, 0, at[i]!.x, at[i]!.y, it.w, it.h);
    if (fr) fr.customData = { ax: it.p.ax * r, ay: it.p.ay * r };
  });
  baked.add(key);
}

const pending = new Map<string, Promise<void>>();
/** 同一张图并发只烘一次（两条路同时要同一张，比如基地补烘和环境动画，各烘一遍会撞 key） */
function bakeOnce(tm: Phaser.Textures.TextureManager, p: ArtPiece, r: number): Promise<void> {
  let pr = pending.get(p.key);
  if (!pr) {
    pr = bake(tm, p, r).finally(() => pending.delete(p.key));
    pending.set(p.key, pr);
  }
  return pr;
}

/** 按需烘焙一批素材（皮肤帧不进 allArt，装备时才烘焙），不弹「装船中」 */
export async function bakeSome(tm: Phaser.Textures.TextureManager, pieces: ArtPiece[], r: number): Promise<void> {
  await Promise.all(pieces.map((p) => bakeOnce(tm, p, r)));
}

/** 按 key 去重的按需烘焙：没烘过的才烘，同一张并发只烘一次；烘的时候在 tip 里显示“装船中…” */
export async function ensureArt(tm: Phaser.Textures.TextureManager, pieces: ArtPiece[], r: number): Promise<void> {
  const todo = pieces.filter((p) => !baked.has(p.key) && !tm.exists(p.key));
  if (!todo.length) return;
  const el = document.createElement('div');
  el.className = 'hd-loading';
  el.textContent = '装船中…';
  el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:60;padding:6px 14px;border-radius:14px;background:rgba(10,30,50,.82);color:#fff;font:600 14px system-ui;pointer-events:none';
  document.body.appendChild(el);
  try {
    const seen = new Set<string>();
    await Promise.all(todo.filter((p) => !seen.has(p.key) && seen.add(p.key)).map((p) => bakeOnce(tm, p, r).catch(() => undefined)));
  } finally {
    el.remove();
  }
}
