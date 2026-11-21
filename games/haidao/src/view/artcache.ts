/**
 * 烘焙结果的本机缓存（Cache Storage `haidao.art`）：SVG 光栅化 + 读像素找外框是打开海岛最慢的一段（手机上占首屏九成），
 * 烘好的画布存成 PNG，下次打开直接解码（createImageBitmap 不占主线程）。
 * 键 = SVG 内容的哈希 + 渲染倍数：画法一改哈希就变；条目记着写入时的游戏版本，旧版本写的、这次又没用到的在 pruneArt 里删。
 * 浏览器不给缓存（隐私模式、非安全来源）时照常现烘，只是每次都慢。
 */

const NAME = 'haidao.art';
const PREFIX = `${typeof location === 'undefined' ? 'http://localhost' : location.origin}/__haidao_art/`;

export interface ArtMeta {
  /** 原画布尺寸（纹理像素） */
  w: number;
  h: number;
  /** 裁掉透明边后的位置（只有建筑图裁） */
  clip?: { l: number; t: number; w: number; h: number };
  /** 不透明部分的外框 */
  box?: { l: number; t: number; r: number; b: number };
}

let opened: Promise<Cache | null> | null = null;
function open(): Promise<Cache | null> {
  opened ??= typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(NAME).catch(() => null);
  return opened;
}

/** 两路 32 位 FNV-1a 拼 64 位，碰撞概率可以忽略 */
export function artId(svg: string, r: number): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ svg.length;
  for (let i = 0; i < svg.length; i++) {
    const c = svg.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}-${Math.round(r * 100)}`;
}

/** 本次打开用到的条目（pruneArt 保留它们） */
const used = new Set<string>();

/** 读缓存：命中回解码好的位图和元数据，没有或读不了回 null */
export async function loadArt(id: string): Promise<{ bm: ImageBitmap; meta: ArtMeta } | null> {
  used.add(id);
  const c = await open();
  if (!c) return null;
  try {
    const res = await c.match(PREFIX + id);
    if (!res) return null;
    const meta = JSON.parse(res.headers.get('x-meta') ?? '{}') as ArtMeta;
    return { bm: await createImageBitmap(await res.blob()), meta };
  } catch {
    return null;
  }
}

/** 写缓存（不等）：编码 PNG 在浏览器后台做；写失败（存储满了）就算了，下次照常现烘 */
export function saveArt(id: string, canvas: HTMLCanvasElement, meta: ArtMeta): void {
  void open().then((c) => {
    if (!c) return;
    canvas.toBlob((blob) => {
      if (blob) c.put(PREFIX + id, new Response(blob, { headers: { 'content-type': 'image/png', 'x-meta': JSON.stringify(meta), 'x-ver': __APP_VERSION__ } })).catch(() => undefined);
    }, 'image/png');
  });
}

/** 位图画回画布（纹理照旧用画布：读像素 alphaAt、裁边 setTrim 都不用改） */
export function bitmapCanvas(bm: ImageBitmap): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = bm.width;
  c.height = bm.height;
  c.getContext('2d')!.drawImage(bm, 0, 0);
  bm.close();
  return c;
}

/** 删掉旧版本写的、这次打开又没用到的条目（换了画法的图）：后台素材烘完之后调一次 */
export async function pruneArt(): Promise<void> {
  const c = await open();
  if (!c) return;
  try {
    for (const req of await c.keys()) {
      if (used.has(req.url.slice(PREFIX.length))) continue;
      const res = await c.match(req);
      if (res?.headers.get('x-ver') !== __APP_VERSION__) await c.delete(req);
    }
  } catch {
    /* 清理失败不影响玩，下次再删 */
  }
}
