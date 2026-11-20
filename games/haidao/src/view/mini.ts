import { BUILDINGS } from '../content/index.ts';
import { BEACH, ISLAND, type Placed } from '../core/types.ts';
import { bArt, wArt } from './art.ts';
import { footCenter, iso } from './iso.ts';
import { el, svgUrl } from './ui.ts';

/** 岛布局的小地图（DOM）：侦察敌岛、推荐布局预览共用（ext 是岛扩了几圈）。可拖动、双指/滚轮缩放，点建筑触发 onPick。 */
const CW = 1500;
const CH = 1000;
const OX = CW / 2;
const OY = 260;
const NS = 'http://www.w3.org/2000/svg';

export interface Mini {
  fit(): void;
  /** 高亮选中的建筑并画射程圈（range 单位：格）；null 取消 */
  pick(id: number | null, range?: number): void;
  destroy(): void;
}

export function renderLayout(host: HTMLElement, layout: Placed[], ext: number, opts: { interactive?: boolean; onPick?: (b: Placed | null) => void; /** 按建筑外框放大（侦察用）；不传就整座岛装进去（推荐布局要看全貌） */ zoomToBuildings?: boolean } = {}): Mini {
  host.textContent = '';
  host.style.overflow = 'hidden';
  host.style.position = 'relative';
  const inner = el('div', 'hd-mini', undefined, host);
  inner.style.cssText = `position:absolute;left:0;top:0;width:${CW}px;height:${CH}px;transform-origin:0 0;`;
  // 地面：浅滩、沙、草三层菱形
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(CW));
  svg.setAttribute('height', String(CH));
  svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
  const diamond = (a: number, b: number, fill: string, stroke: string): void => {
    const pts = [iso(a, a), iso(b, a), iso(b, b), iso(a, b)].map((p) => `${OX + p.x},${OY + p.y}`).join(' ');
    const pg = document.createElementNS(NS, 'polygon');
    pg.setAttribute('points', pts);
    pg.setAttribute('fill', fill);
    pg.setAttribute('stroke', stroke);
    pg.setAttribute('stroke-width', '3');
    svg.appendChild(pg);
  };
  // ext：岛按主寨扩了几圈（战役岛 0，自己的岛按主寨等级）
  diamond(-ext - BEACH - 2, ISLAND + ext + BEACH + 2, '#7fe3d0', '#58c9b8');
  diamond(-ext - BEACH, ISLAND + ext + BEACH, '#f1d68c', '#dcb86a');
  diamond(-ext, ISLAND + ext, '#6ec24b', '#4ba53d');
  inner.appendChild(svg);
  const rangeSvg = document.createElementNS(NS, 'svg');
  rangeSvg.setAttribute('width', String(CW));
  rangeSvg.setAttribute('height', String(CH));
  rangeSvg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:9000';
  inner.appendChild(rangeSvg);

  const items = new Map<number, HTMLImageElement>();
  const walls = layout.filter((b) => b.kind === 'wall');
  const hasWall = (x: number, y: number): boolean => walls.some((w) => w.x === x && w.y === y);
  // 建筑外框：默认缩放按它来，岛上空着的四角不占屏幕
  let bl = Infinity, bt = Infinity, br = -Infinity, bb = -Infinity;
  for (const b of layout) {
    const mask = b.kind === 'wall' ? (hasWall(b.x, b.y - 1) ? 1 : 0) | (hasWall(b.x + 1, b.y) ? 2 : 0) | (hasWall(b.x, b.y + 1) ? 4 : 0) | (hasWall(b.x - 1, b.y) ? 8 : 0) : 0;
    const p = b.kind === 'wall' ? wArt(b.level, mask) : bArt(b.kind, b.level);
    const f = footCenter(b.x, b.y, BUILDINGS[b.kind].size);
    const s = iso(f.gx, f.gy);
    const im = document.createElement('img');
    im.src = svgUrl(p);
    im.draggable = false;
    im.dataset.id = String(b.id);
    im.style.cssText = `position:absolute;left:${OX + s.x - p.ax}px;top:${OY + s.y - p.ay}px;width:${p.w}px;height:${p.h}px;z-index:${Math.round((f.gx + f.gy) * 10)};`;
    inner.appendChild(im);
    items.set(b.id, im);
    bl = Math.min(bl, OX + s.x - p.ax);
    bt = Math.min(bt, OY + s.y - p.ay);
    br = Math.max(br, OX + s.x - p.ax + p.w);
    bb = Math.max(bb, OY + s.y - p.ay + p.h);
  }

  let sc = 1;
  let tx = 0;
  let ty = 0;
  const apply = (): void => {
    inner.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`;
  };
  const fit = (): void => {
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 200;
    if (opts.zoomToBuildings && br > bl && bb > bt) {
      // 建筑外框加一圈边（约 4%），铺满较紧的那一边；竖屏时岛约占满宽度，放大的程度再留给用户手动调
      const padX = (br - bl) * 0.04 + 12;
      const padY = (bb - bt) * 0.04 + 12;
      sc = Math.min(w / (br - bl + 2 * padX), h / (bb - bt + 2 * padY));
      tx = (w - (br - bl) * sc) / 2 - bl * sc;
      ty = (h - (bb - bt) * sc) / 2 - bt * sc;
    } else {
      sc = Math.min(w / 1500, h / 1000) * 1.05;
      tx = (w - CW * sc) / 2;
      ty = (h - CH * sc) / 2 - 20 * sc;
    }
    apply();
  };
  fit();

  const pick = (id: number | null, range?: number): void => {
    rangeSvg.textContent = '';
    for (const [k, im] of items) im.style.filter = k === id ? 'drop-shadow(0 0 6px #ffd23f) brightness(1.15)' : '';
    const b = layout.find((q) => q.id === id);
    if (!b || !range) return;
    const f = footCenter(b.x, b.y, BUILDINGS[b.kind].size);
    const s = iso(f.gx, f.gy);
    const e = document.createElementNS(NS, 'ellipse');
    e.setAttribute('cx', String(OX + s.x));
    e.setAttribute('cy', String(OY + s.y));
    e.setAttribute('rx', String(range * 45.25));
    e.setAttribute('ry', String(range * 22.6));
    e.setAttribute('fill', 'rgba(217,59,50,.18)');
    e.setAttribute('stroke', '#d93b32');
    e.setAttribute('stroke-width', '4');
    e.setAttribute('stroke-dasharray', '14 8');
    rangeSvg.appendChild(e);
  };

  const ptrs = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  let pinch = 0;
  let moved = false;
  const down = (e: PointerEvent): void => {
    host.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (ptrs.size === 1) moved = false;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      if (!a || !b) return;
      pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      moved = true;
    }
  };
  const move = (e: PointerEvent): void => {
    const q = ptrs.get(e.pointerId);
    if (!q) return;
    const dx = e.clientX - q.x;
    const dy = e.clientY - q.y;
    q.x = e.clientX;
    q.y = e.clientY;
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const r = host.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, sc * (d / pinch));
      pinch = d;
      return;
    }
    if (Math.hypot(q.x - q.sx, q.y - q.sy) > 6) moved = true;
    if (moved) {
      tx += dx;
      ty += dy;
      apply();
    }
  };
  const up = (e: PointerEvent): void => {
    const q = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!q || moved || ptrs.size > 0) return;
    const t = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const id = t?.dataset?.id;
    opts.onPick?.(id !== undefined ? (layout.find((b) => b.id === Number(id)) ?? null) : null);
  };
  const zoomAt = (px: number, py: number, ns: number): void => {
    const s2 = Math.min(3, Math.max(0.2, ns));
    tx = px - ((px - tx) / sc) * s2;
    ty = py - ((py - ty) / sc) * s2;
    sc = s2;
    apply();
  };
  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = host.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, sc * Math.exp(-e.deltaY * 0.0012));
  };
  if (opts.interactive) {
    host.style.touchAction = 'none';
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    host.addEventListener('wheel', wheel, { passive: false });
  }
  return {
    fit,
    pick,
    destroy: () => {
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
      host.removeEventListener('wheel', wheel);
    },
  };
}
