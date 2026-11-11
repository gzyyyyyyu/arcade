import { peekHeroAtlas, peekMobAtlas, type Atlas } from '../view/art/atlas.ts';

/** 图集里一帧画成 data URL（HUD 的头像、法器图标用）；同一张只画一次 */
export function iconMaker(atlas: Atlas): (key: string, px?: number) => string {
  const cache = new Map<string, string>();
  return (key, px = 64) => {
    const id = `${key}@${px}`;
    let url = cache.get(id);
    if (url) return url;
    const hero = peekHeroAtlas();
    const mob = peekMobAtlas();
    const hit = atlas.frames.has(key) ? atlas : hero?.frames.has(key) ? hero : mob?.frames.has(key) ? mob : atlas;
    const f = hit.frames.get(key) ?? atlas.frames.get('soul')!;
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.round((px * f.h) / f.w);
    c.getContext('2d')!.drawImage(hit.canvas, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
    url = c.toDataURL();
    cache.set(id, url);
    return url;
  };
}
