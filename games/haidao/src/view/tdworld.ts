import type { TdScene } from './TdScene.ts';
import Phaser from 'phaser';
import { BUILDINGS } from '../content/index.ts';
import { tdLanes, tdRoutes, tdWaveLanes } from '../core/index.ts';
import { cellX, cellY } from '../core/grid.ts';
import { UNIT, BEACH } from '../core/types.ts';
import { sTex, bTex, wTex, fxA, tdP, troopF, iconA } from './art.ts';
import { type Box, islandBox, type Content, cellsBox } from './camfit.ts';
import { type EdgeItem, type EdgeKind, edgeMarks, followWave } from './camguide.ts';
import { EASE } from './motion.ts';
import { RIG_TEX } from './rigsprite.ts';
import { isoRing } from './tdfx.ts';
import { jitter, put, ringOf } from './ground.ts';
import { footCenter, iso, depthOf } from './iso.ts';
import { laneName } from './td-ui.ts';
import { button, el, img } from './ui.ts';
import { DEPTH } from './depth.ts';
import { W, buildCost } from './tdcommon.ts';
import { litAt } from './tdsync.ts';
import { banner } from './tdhud.ts';
import { wreckOf } from './tdsheet.ts';

// ---------------------------------------------------------------- 画面

export function drawLayout(bs: TdScene): void {
  const s = bs.s;
  for (const b of bs.d.setup.layout) {
    const def = BUILDINGS[b.kind];
    if (!def) continue;
    if (b.kind === 'wall') {
      bs.wallLevel.set(b.id, b.level);
      continue;
    }
    const f = footCenter(b.x, b.y, def.size);
    const p = iso(f.gx, f.gy);
    const im = jitter(put(bs, bs.r, sTex(b.kind, b.level), p.x, p.y), b.kind, b.id).setDepth(depthOf(f.gx, f.gy));
    bs.envQ.push({ im, kind: b.kind, level: b.level, id: b.id });
    if (b.kind === 'treasure') {
      bs.chests.push(im);
      // 箱子很小：脚下垫一圈金光，一眼找到要守的东西
      bs.add.ellipse(p.x, p.y + 4, 54, 27, 0xffe885, 0.35).setStrokeStyle(2, 0xf8c630, 0.9).setDepth(depthOf(f.gx, f.gy) - 0.4);
      bs.tweens.add({ targets: im, scale: im.scale * 1.035, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const tw = s.towers.find((t) => t.id === b.id);
    if (tw) bs.tsp.set(tw.id, { img: im, key: im.texture.key, baseX: p.x, baseY: p.y, br: tw.branch.join(','), slot: -1 });
  }
  // 没摆宝藏箱的老岛：核心在主寨旁放了一个，画出来
  if (!bs.d.setup.layout.some((b) => b.kind === 'treasure')) {
    for (const t of s.treasures) {
      const f = footCenter(t.x, t.y, 1);
      const p = iso(f.gx, f.gy);
      bs.chests.push(put(bs, bs.r, bTex('treasure', 1), p.x, p.y).setDepth(depthOf(f.gx, f.gy)));
    }
  }
  for (const w of s.walls) {
    const f = footCenter(w.x, w.y, 1);
    const p = iso(f.gx, f.gy);
    const im = put(bs, bs.r, wTex(bs.wallLevel.get(w.id) ?? 1, 0), p.x, p.y).setDepth(depthOf(f.gx, f.gy));
    bs.walls.set(w.id, { img: im, level: bs.wallLevel.get(w.id) ?? 1, x: w.x, y: w.y });
  }
  refreshWalls(bs);
}

/** 城墙按四邻选图；被炸掉的画成碎石 */
export function refreshWalls(bs: TdScene): void {
  const alive = new Set(bs.s.walls.filter((w) => !w.destroyed).map((w) => `${w.x},${w.y}`));
  for (const w of bs.s.walls) {
    const sp = bs.walls.get(w.id);
    if (!sp) continue;
    if (w.destroyed) {
      const rp = fxA('rubble');
      sp.img.setTexture(rp.key).setOrigin(rp.ax / rp.w, rp.ay / rp.h).setScale(1 / bs.r);
      continue;
    }
    const has = (x: number, y: number): number => (alive.has(`${x},${y}`) ? 1 : 0);
    const mask = has(w.x, w.y - 1) | (has(w.x + 1, w.y) << 1) | (has(w.x, w.y + 1) << 2) | (has(w.x - 1, w.y) << 3);
    const p = wTex(sp.level, mask);
    sp.img.setTexture(p.key).setOrigin(p.ax / p.w, p.ay / p.h).setScale(1 / bs.r);
  }
}

/** 木台、火药桶、沉船、木桶 */
export function drawProps(bs: TdScene): void {
  const s = bs.s;
  for (const sl of s.slots) {
    const f = footCenter(sl.x, sl.y, 2);
    const p = iso(f.gx, f.gy);
    const im = put(bs, bs.r, tdP('pad'), p.x, p.y).setDepth(depthOf(f.gx, f.gy) - 0.5);
    const plus = bs.add.text(p.x, p.y - 6, '+', { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${30 * bs.r}px`, color: '#fff3b0', stroke: '#2b1a15', strokeThickness: 5 * bs.r }).setOrigin(0.5).setScale(1 / bs.r).setDepth(depthOf(f.gx, f.gy) + 0.1);
    bs.tweens.add({ targets: plus, y: p.y - 12, duration: 700, yoyo: true, repeat: -1, ease: EASE.recover });
    bs.pads.push({ img: im, plus });
    // 驻守台：台子外圈一道金边，和普通木台分得开（上面的塔开局就带着）
    if (sl.garrison !== undefined) {
      const rg = isoRing(1.25);
      bs.add.ellipse(p.x, p.y + 2, rg.w, rg.h, 0xf8c630, 0.16).setStrokeStyle(4, 0xf8c630, 0.95).setDepth(depthOf(f.gx, f.gy) - 0.45);
    }
  }
  for (const k of s.kegs) {
    const w = W(k.x, k.y);
    bs.kegs.set(k.id, put(bs, bs.r, tdP('keg'), w.x, w.y).setDepth(depthOf(k.x / UNIT, k.y / UNIT)));
  }
  for (const b of s.blocks) {
    const f = footCenter(b.x, b.y, b.size);
    const p = iso(f.gx, f.gy);
    bs.blocks.set(b.id, put(bs, bs.r, tdP(b.kind), p.x, p.y).setDepth(depthOf(f.gx, f.gy)));
  }
}

export function makeHero(bs: TdScene): void {
  const w = W(bs.s.hero.x, bs.s.hero.y);
  bs.heroRing = bs.add.ellipse(w.x, w.y, 30, 15).setStrokeStyle(3, 0xffe885, 1).setDepth(DEPTH.heroRing);
  bs.hero = bs.pool.get('t.captain', RIG_TEX, (an) => troopF('captain', an), bs.time.now);
  bs.hero.c.setPosition(w.x, w.y);
  bs.heroPx = w.x;
  bs.heroPy = w.y;
}

/** 雾区：每片用一圈圈雾团铺满（半径 r 格），灯塔、英雄靠近的雾团会淡掉 */
export function drawFog(bs: TdScene): void {
  for (const z of bs.s.level.fogZones ?? []) {
    // 边界：一圈淡淡的白线加一层薄雾底，一眼看出雾罩住哪一片
    const ring = Array.from({ length: 28 }, (_, k) => {
      const q = iso(z.x + 0.5 + z.r * Math.cos((k / 28) * Math.PI * 2), z.y + 0.5 + z.r * Math.sin((k / 28) * Math.PI * 2));
      return new Phaser.Math.Vector2(q.x, q.y);
    });
    bs.fogRings.push(bs.add.graphics().setDepth(DEPTH.fogRing).fillStyle(0xeaf6ff, 0.16).fillPoints(ring, true).lineStyle(3, 0xffffff, 0.6).strokePoints(ring, true));
    const step = 1.3;
    const n = Math.ceil(z.r / step);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const gx = z.x + 0.5 + i * step;
        const gy = z.y + 0.5 + j * step;
        if ((gx - z.x - 0.5) ** 2 + (gy - z.y - 0.5) ** 2 > z.r * z.r) continue;
        const p = iso(gx, gy);
        const im = put(bs, bs.r, tdP('mist'), p.x, p.y).setDepth(DEPTH.fogMist).setAlpha(0.62);
        bs.mist.push({ img: im, x: gx * UNIT, y: gy * UNIT, a: 0.62, ph: (i * 7 + j * 3) * 0.7 });
      }
    }
  }
}

/** 雾团轻轻飘动；被灯塔 / 英雄照到的淡掉 */
export function stepFog(bs: TdScene, now: number): void {
  // 大潮无尽的雾区晚点才起作用（fogFrom）：没起作用时雾团不显示，免得画面上有雾而规则里没有
  const off = fogOff(bs);
  for (const g of bs.fogRings) g.setVisible(!off);
  for (const m of bs.mist) {
    const target = off ? 0 : (litAt(bs, m.x, m.y) ? 0.12 : 0.62) + 0.08 * Math.sin(now / 900 + m.ph);
    m.a += (target - m.a) * 0.12;
    m.img.setAlpha(m.a);
  }
}

export function fogOff(bs: TdScene): boolean {
  return bs.s.level.fogFrom !== undefined && bs.s.wave <= bs.s.level.fogFrom;
}

export function inFog(bs: TdScene, x: number, y: number): boolean {
  if (fogOff(bs)) return false;
  for (const z of bs.s.level.fogZones ?? []) {
    const r = z.r * UNIT;
    if ((x - z.x * UNIT - 50) ** 2 + (y - z.y * UNIT - 50) ** 2 <= r * r) return true;
  }
  return false;
}

/** 落潮：登陆路旁那片沙滩平时被水盖着，落潮后露出湿沙；登陆口插小旗 */
export function drawTide(bs: TdScene, first: boolean): void {
  const lv = bs.s.level;
  const lanes = tdLanes(bs.s);
  const on = lv.tide ? lanes.length > lv.lanes.length : false;
  if (!first && on === bs.tideOn) return;
  bs.tideOn = on;
  const g = bs.tideG;
  g.clear();
  for (const im of bs.tideImgs) im.destroy();
  bs.tideImgs = [];
  if (lv.tide) {
    const { x, y } = lv.tide.lane;
    const cells: Array<[number, number]> = [];
    for (let cx = x - 2; cx <= x + 2; cx++) for (let cy = y - 2; cy <= y + 2; cy++) if (ringOf(cx, cy) >= 1 && ringOf(cx, cy) <= BEACH) cells.push([cx, cy]);
    for (const [cx, cy] of cells) {
      const pts = [iso(cx, cy), iso(cx + 1, cy), iso(cx + 1, cy + 1), iso(cx, cy + 1)].map((q) => new Phaser.Math.Vector2(q.x, q.y));
      if (!on) g.fillStyle(0x7fe3d0, 0.9).fillPoints(pts, true).lineStyle(2, 0xeffcf7, 0.7).strokePoints(pts, true);
    }
    // 涨落的潮：涨潮时在落潮路口摆一块浪花，提醒"这里下一次落潮会开路"
    if (!on && lv.tideOpen) {
      const q = iso(x + 0.5, y + 0.5);
      bs.tideImgs.push(put(bs, bs.r, tdP('tideWave'), q.x, q.y).setDepth(DEPTH.tideWave));
    }
    if (on) {
      for (const [cx, cy] of cells) {
        const f = footCenter(cx, cy, 1);
        const p = iso(f.gx, f.gy);
        bs.tideImgs.push(put(bs, bs.r, tdP('tideEdge'), p.x, p.y).setDepth(DEPTH.tideEdge));
      }
      if (!first) banner(bs, '落潮了', `${laneName(lv.tide.lane)}多露出一条登陆路`, false);
    } else if (!first) banner(bs, '涨潮了', `${laneName(lv.tide.lane)}被水淹没，敌人只走原来的路`, false);
  }
  if (first && lv.tide) {
    // 落潮路在岛外那一边的名字（北路 / 西路 / 南路 / 东路），和顶部预告条的说法对上
    const q = iso(lv.tide.lane.x + 0.5, lv.tide.lane.y + 0.5);
    bs.add.text(q.x, q.y + 26, laneName(lv.tide.lane), { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${15 * bs.r}px`, color: '#effcf7', stroke: '#2b1a15', strokeThickness: 4 * bs.r }).setOrigin(0.5).setScale(1 / bs.r).setDepth(DEPTH.tideLabel).setAlpha(0.85);
  }
  const lg = bs.laneG;
  lg.clear();
  for (const l of lanes) {
    const p = iso(l.x + 0.5, l.y + 0.5);
    lg.fillStyle(0xd93b32, 0.35).fillEllipse(p.x, p.y + 2, 64, 32).lineStyle(3, 0xd93b32, 0.9).strokeEllipse(p.x, p.y + 2, 64, 32);
    lg.lineStyle(4, 0x2b1a15, 1).lineBetween(p.x, p.y, p.x, p.y - 62);
    lg.fillStyle(0xd93b32, 1).lineStyle(3, 0x2b1a15, 1).fillTriangle(p.x, p.y - 62, p.x + 36, p.y - 50, p.x, p.y - 38).strokeTriangle(p.x, p.y - 62, p.x + 36, p.y - 50, p.x, p.y - 38);
  }
}

/** 适配的包围盒：整座岛（外沿留 1 格沙滩）加临时塔位、所有登陆口 */
export function fitBox(bs: TdScene): Box {
  const pts: Array<readonly [number, number]> = [];
  for (const q of bs.s.slots) pts.push([q.x - 1, q.y - 1], [q.x + 2, q.y + 2]);
  const lv = bs.s.level;
  for (const q of [...lv.lanes, ...(lv.tide ? [lv.tide.lane] : [])]) pts.push([q.x - 1, q.y - 1], [q.x + 2, q.y + 2]);
  return islandBox(pts, 1);
}

/** 竖屏适配的内容：塔位、临时塔位、其他建筑、宝藏箱、登陆口和登陆口到宝藏箱的真实路线格，外扩 1 格；必须完整在可见区里（实时操作） */
export function contentBox(bs: TdScene): Content {
  const rs: Array<readonly [number, number, number, number]> = [];
  for (const q of bs.s.slots) rs.push([q.x, q.y, q.x + 1, q.y + 1]);
  for (const b of bs.d.setup.layout) if (b.kind !== 'wall') rs.push([b.x, b.y, b.x + BUILDINGS[b.kind].size - 1, b.y + BUILDINGS[b.kind].size - 1]);
  for (const r of tdRoutes(bs.s)) {
    rs.push([r.x, r.y, r.x, r.y]);
    for (const n of r.cells) {
      const cx = Math.floor(cellX(n) / UNIT);
      const cy = Math.floor(cellY(n) / UNIT);
      rs.push([cx, cy, cx, cy]);
    }
  }
  if (bs.esc) rs.push(...bs.esc.routeRects());
  return { box: cellsBox(rs, 1), whole: true };
}

/** 开新一波镜头跟过去时，落点沿路线往岛里走几格 */
const FOLLOW_INLAND = 3;

/** 一波的登陆口投到世界坐标（格子中心） */
function wavePoints(bs: TdScene, w: number): Array<{ x: number; y: number }> {
  return tdWaveLanes(bs.s, w).map((c) => iso(c.x + 0.5, c.y + 0.5));
}

/** 竖屏开场推镜的落点（世界 x）：第一波要用的登陆口的中间 */
export function introFocus(bs: TdScene): number | null {
  const ps = wavePoints(bs, bs.s.wave);
  return ps.length ? ps.reduce((a, p) => a + p.x, 0) / ps.length : null;
}

/**
 * 竖屏放大时开了第 w 波：它的登陆口都在可见区外，就把镜头缓推到登陆口的中间（同点屏边箭头的平移）。
 * 玩家刚自己动过镜头、开着面板或在瞄技能时不推（followWave 判）；减弱动态时 panTo 直接到位。
 */
export function followWaveCam(bs: TdScene, w: number): void {
  const ps = wavePoints(bs, w);
  const busy = bs.openSlot >= 0 || bs.bestOpen || bs.mode !== 'none';
  const points = ps.map((p) => bs.cc.toScreen(p.x, p.y));
  if (!followWave({ live: bs.fit.live && !bs.ended, busy, sinceUser: bs.fit.sinceUser(), points, view: bs.fit.visible() })) return;
  // 落点不对准沙滩上的登陆口（那样半屏是海），对准沿去宝藏的路往岛里走 FOLLOW_INLAND 格的地方：登陆口在画面上部，下面是他们要走的路
  const routes = tdRoutes(bs.s);
  const at = tdWaveLanes(bs.s, w).map((c) => {
    const cells = routes.find((r) => r.x === c.x && r.y === c.y)?.cells ?? [];
    const k = cells[Math.min(FOLLOW_INLAND, cells.length - 1)];
    return k === undefined ? iso(c.x + 0.5, c.y + 0.5) : iso(cellX(k) / UNIT, cellY(k) / UNIT);
  });
  bs.fit.panTo(at.reduce((a, p) => a + p.x, 0) / at.length, at.reduce((a, p) => a + p.y, 0) / at.length);
}

/** 屏外的敌人在可见区边上出箭头加数量（点了镜头移过去），屏外的空木台出小标；只在竖屏放大（FitCam.live）时有 */
export function drawEdges(bs: TdScene): void {
  const s = bs.s;
  const items: EdgeItem[] = [];
  if (bs.fit.live && !bs.ended) {
    for (const e of s.enemies) {
      if (e.mode !== 'in' && e.mode !== 'out') continue;
      const w = W(e.x, e.y);
      const p = bs.cc.toScreen(w.x, w.y);
      items.push({ kind: 'enemy', sx: p.x, sy: p.y, wx: w.x, wy: w.y });
    }
    // 屏外的空木台只在够钱造最便宜的塔时才标（没钱造的标了也没用，反而让人猜那是什么）
    let cheapest = Infinity;
    for (const k of s.unlocked) cheapest = Math.min(cheapest, buildCost(k));
    for (const q of s.slots) {
      if (s.gold < cheapest) break;
      if (q.tower >= 0 || wreckOf(bs, q)) continue;
      const w = iso(q.x + 1, q.y + 1);
      const p = bs.cc.toScreen(w.x, w.y);
      items.push({ kind: 'slot', sx: p.x, sy: p.y, wx: w.x, wy: w.y });
    }
  }
  if (bs.esc && bs.fit.live && !bs.ended) {
    for (const w of bs.esc.edgePoints()) {
      const p = bs.cc.toScreen(w.x, w.y);
      items.push({ kind: 'gate', sx: p.x, sy: p.y, wx: w.x, wy: w.y });
    }
  }
  const marks = items.length ? edgeMarks(items, bs.fit.visible()) : [];
  // 界面根可能为刘海缩进：画布坐标换成界面根里的坐标
  // 两次量框会触发布局：缩进几乎不变，1 秒量一次（转屏 / 缩放时间到了自然更新）
  const tNow = bs.time.now;
  if (tNow - bs.edgeRectAt > 1000 || tNow < bs.edgeRectAt) {
    bs.edgeRectAt = tNow;
    const o = bs.ui.getBoundingClientRect();
    const base = (bs.ui.parentElement ?? bs.ui).getBoundingClientRect();
    bs.edgeOx = o.left - base.left;
    bs.edgeOy = o.top - base.top;
  }
  const ox = bs.edgeOx;
  const oy = bs.edgeOy;
  // 敌人是按钮（点了镜头移过去），空木台和路口旗是不能点的小标：三个池子，同一个下标一直对着同一个元素
  const pools: Record<EdgeKind, typeof bs.edgeEls> = { enemy: [], slot: [], gate: [] };
  for (const it of bs.edgeEls) pools[(it.el.dataset.k as EdgeKind | undefined) ?? 'slot'].push(it);
  const used = { enemy: 0, slot: 0, gate: 0 };
  for (const m of marks) {
    const pool = pools[m.kind];
    let it = pool[used[m.kind]++];
    if (!it) {
      const box: HTMLElement =
        m.kind === 'enemy'
          ? button('', 'hd-td-edge', () => {
              if (!box.dataset.wx) return;
              bs.fit.markUser();
              bs.fit.panTo(Number(box.dataset.wx), Number(box.dataset.wy));
            }, bs.edges)
          : el('span', 'hd-td-edge', undefined, bs.edges);
      // 皮肤的木板底不要：箭头自己一套样式（敌人 = 红圈 + 剑 + 个数；木台 = 木牌 + 加号；路口 = 黄旗）
      box.className = m.kind === 'enemy' ? 'hd-td-edge' : `hd-td-edge ${m.kind}`;
      box.dataset.k = m.kind;
      if (m.kind === 'enemy') box.appendChild(img(iconA('sword'), 16));
      const arrow = el('i', undefined, undefined, box);
      const n = el('b', undefined, undefined, box);
      it = { el: box, arrow, n, sig: '' };
      pool.push(it);
      bs.edgeEls.push(it);
    }
    const deg = Math.round((Math.atan2(m.dy, m.dx) * 180) / Math.PI);
    const wxr = Math.round(m.wx);
    const wyr = Math.round(m.wy);
    const sig = `${Math.round(m.x)}|${Math.round(m.y)}|${m.n}|${deg}|${wxr}|${wyr}`;
    if (sig === it.sig) continue;
    it.sig = sig;
    // dataset 只在变了的时候写（点击读它来平移镜头）
    it.el.dataset.wx = String(wxr);
    it.el.dataset.wy = String(wyr);
    it.el.style.display = '';
    it.el.style.transform = `translate(${Math.round(m.x - ox)}px, ${Math.round(m.y - oy)}px)`;
    it.arrow.style.transform = `rotate(${deg}deg)`;
    if (m.kind === 'enemy') {
      it.n.textContent = `×${m.n}`;
      it.el.setAttribute('aria-label', `那边有 ${m.n} 个敌人，点一下看过去`);
    } else if (m.kind === 'slot') {
      // 加号和个数写在 CSS 的 ::before 里（不是文字，不算同屏文字牌）
      it.n.dataset.n = m.n > 1 ? String(m.n) : '';
      it.el.setAttribute('aria-label', `那边有 ${m.n} 个空木台可以造塔`);
    }
  }
  for (const k of ['enemy', 'slot', 'gate'] as const) {
    for (const it of pools[k].slice(used[k])) {
      if (it.sig === '') continue;
      it.sig = '';
      it.el.style.display = 'none';
    }
  }
}
