import type Phaser from 'phaser';
import { allArt, type ArtPiece } from './art/index.ts';
import { h32, rng } from './art/grade.ts';
import { type ArtMeta, artId, bitmapCanvas, loadArt, saveArt } from './artcache.ts';

/** 每张纹理里不透明像素的外框（纹理像素）：血条贴着建筑真正的顶，引导高亮框框住真正的样子 */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
const boxes = new Map<string, Box>();
/**
 * 建筑图裁掉的透明边：画布四周给阴影、旗、烟留的透明边很大，透明像素照样要逐个混合（手机上岛中间满屏建筑时，
 * 帧时间主要花在这里）。烘的时候把画布裁到「有一点颜色」（alpha > 0）的外框，帧设成 trim（Phaser 按原尺寸算锚点、
 * 按偏移画），所以位置、锚点、外观都不变，只是不再画全透明的那一圈。读像素照旧按原画布坐标（alphaAt）。
 */
/** 已经烘成纹理的 key：高等级外观没烘到时，场景用低一级顶替 */
const baked = new Set<string>();
export const isBaked = (key: string): boolean => baked.has(key);
export const artBox = (key: string): Box | undefined => boxes.get(key);
/** 图的不透明部分的顶（世界坐标）：血条、伤害数字、守岛塔上的升级箭头都贴着它，不飘在透明空白上 */
export function artTop(im: Phaser.GameObjects.Image): number {
  return im.y - im.originY * im.displayHeight + (artBox(im.texture.key)?.t ?? 0) * Math.abs(im.scaleY);
}

/** 一趟扫两个外框：box 是不透明部分（alpha > 24，给血条、点选、遮挡用），clip 是有一点颜色的部分（alpha > 0，裁画布用，裁掉的全是全透明） */
function scanBox(c: HTMLCanvasElement): { box: Box; clip: Box } {
  const w = c.width;
  const h = c.height;
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let l = w, t = h, r = 0, b = 0;
  let cl = w, ct = h, cr = 0, cb = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = d[(y * w + x) * 4 + 3]!;
      if (a === 0) continue;
      if (x < cl) cl = x;
      if (x > cr) cr = x;
      if (y < ct) ct = y;
      if (y > cb) cb = y;
      if (a > 24) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  const full = { l: 0, t: 0, r: w, b: h };
  return { box: r >= l ? { l, t, r, b } : full, clip: cr >= cl ? { l: cl, t: ct, r: cr, b: cb } : full };
}

/**
 * 按原画布坐标读一个像素的 alpha。裁过透明边的建筑图不用自己换算：Phaser 的 getPixelAlpha 会按帧的 trim 偏移减掉，
 * 落在裁掉的边里回 null（这里当 0）。0.49.0 曾在这里再减一次偏移，塔身、建筑的像素全读成透明，只有占地格点得中
 */
export function alphaAt(tm: Phaser.Textures.TextureManager, key: string, x: number, y: number): number {
  return tm.getPixelAlpha(x, y, key) ?? 0;
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

/** 烘好的画布注册成纹理：建筑图按 clip 裁过透明边的，帧设成 trim（Phaser 按原尺寸算锚点、按偏移画） */
function register(tm: Phaser.Textures.TextureManager, key: string, c: HTMLCanvasElement, meta: ArtMeta): void {
  if (meta.box) boxes.set(key, meta.box);
  const tex = tm.addCanvas(key, c);
  if (meta.clip) tex?.get().setTrim(meta.w, meta.h, meta.clip.l, meta.clip.t, meta.clip.w, meta.clip.h);
  baked.add(key);
}

/** 把一张 SVG 按渲染倍数画进 canvas，注册成纹理（纹理尺寸 = w*r × h*r，贴出来时 setScale(1/r)）；本机缓存里有就直接用（artcache.ts） */
async function bake(tm: Phaser.Textures.TextureManager, p: ArtPiece, r: number): Promise<void> {
  if (tm.exists(p.key)) {
    baked.add(p.key);
    return;
  }
  const id = artId(p.svg, r);
  const hit = await loadArt(id);
  if (hit) {
    if (!tm.exists(p.key)) register(tm, p.key, bitmapCanvas(hit.bm), hit.meta);
    else hit.bm.close();
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
    const { box, clip } = scanBox(c);
    const cw = clip.r - clip.l + 1;
    const ch = clip.b - clip.t + 1;
    const meta: ArtMeta = { w: c.width, h: c.height, box };
    let out = c;
    // 只裁建筑图（b.*：场上同时最多、面积最大），省得少于一成的不裁
    if (p.key.startsWith('b.') && cw * ch < c.width * c.height * 0.9) {
      out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      out.getContext('2d')!.drawImage(c, clip.l, clip.t, cw, ch, 0, 0, cw, ch);
      meta.clip = { l: clip.l, t: clip.t, w: cw, h: ch };
    }
    if (tm.exists(p.key)) return;
    register(tm, p.key, out, meta);
    saveArt(id, out, meta);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 开局素材（不含兵的动作帧）分批烘焙成纹理，全部完成才返回 */
export async function bakeAll(tm: Phaser.Textures.TextureManager, r: number, onProgress?: (done: number, total: number) => void): Promise<void> {
  const all = allArt({ troops: false });
  let done = 0;
  for (let i = 0; i < all.length; i += 24) {
    await Promise.all(all.slice(i, i + 24).map((p) => bake(tm, p, r).then(() => onProgress?.(++done, all.length))));
  }
}

/** 后台烘焙：一张一张烘，每张之间让出主线程（等浏览器空闲，最多 100ms），基地照常流畅；hurry() 为真（有人等着进场）时不再让 */
export async function bakeIdle(tm: Phaser.Textures.TextureManager, pieces: ArtPiece[], r: number, hurry: () => boolean): Promise<void> {
  for (const p of pieces) {
    if (baked.has(p.key) || tm.exists(p.key)) continue;
    if (!hurry()) await new Promise<void>((res) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => res(), { timeout: 100 }) : setTimeout(res, 0)));
    await bakeOnce(tm, p, r);
  }
}

/** 等一件事时在屏幕上方挂「装船中…」，完了收起 */
export async function withTip<T>(work: Promise<T>): Promise<T> {
  const el = document.createElement('div');
  el.className = 'hd-loading';
  el.textContent = '装船中…';
  el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:60;padding:6px 14px;border-radius:14px;background:rgba(10,30,50,.82);color:#fff;font:600 14px system-ui;pointer-events:none';
  document.body.appendChild(el);
  try {
    return await work;
  } finally {
    el.remove();
  }
}

/**
 * 把一批小素材烘进一张图集（分件骨架的部件用：一个兵 10 张图都在同一张贴图上，画的时候不换贴图）。
 * 每张按渲染倍数画好后按高度排成行（行宽 2048，四周留 2 像素防止线性过滤串色），帧名 = 素材 key，
 * 锚点（素材的 ax、ay，按渲染倍数）存在帧的 customData 里，贴图时 setOrigin(ax / 帧宽, ay / 帧高)。
 */
export async function bakeAtlas(tm: Phaser.Textures.TextureManager, key: string, pieces: ArtPiece[], r: number): Promise<void> {
  if (tm.exists(key)) return;
  // 排版只看尺寸（不用等图）：缓存里的整张图集按同样的排版切帧
  const W = 2048;
  const PAD = 2;
  const ims = pieces.map((p) => ({ p, w: Math.max(1, Math.round(p.w * r)), h: Math.max(1, Math.round(p.h * r)) }));
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
  const id = artId(`${key}|${pieces.map((p) => `${p.key}:${p.ax},${p.ay}:${p.svg}`).join('|')}`, r);
  const hit = await loadArt(id);
  let c: HTMLCanvasElement;
  if (hit) c = bitmapCanvas(hit.bm);
  else {
    const loaded = await Promise.all(
      pieces.map(async (p) => {
        const url = URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }));
        try {
          return await load(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      }),
    );
    c = document.createElement('canvas');
    c.width = W;
    c.height = y + rowH + PAD;
    const cx = c.getContext('2d')!;
    ims.forEach((it, i) => cx.drawImage(loaded[i]!, at[i]!.x, at[i]!.y, it.w, it.h));
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
    saveArt(id, c, { w: c.width, h: c.height });
  }
  if (tm.exists(key)) return;
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
  const seen = new Set<string>();
  await withTip(Promise.all(todo.filter((p) => !seen.has(p.key) && seen.add(p.key)).map((p) => bakeOnce(tm, p, r).catch(() => undefined))));
}
