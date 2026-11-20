import type { TdScene } from './TdScene.ts';
import Phaser from 'phaser';
import { BUILDINGS } from '../content/index.ts';
import { tdIncomingWave, tdLanes, tdRoutes, tdWaveLanes } from '../core/index.ts';
import { fleetAt } from '../core/tdmech.ts';
import { cellX, cellY } from '../core/grid.ts';
import { UNIT, BEACH } from '../core/types.ts';
import { sTex, bTex, wTex, fxA, tdP, troopF, iconA, shipA } from './art.ts';
import { type Box, islandBox, type Content, cellsBox, type Director } from './camfit.ts';
import { type EdgeItem, type EdgeKind, type FPt, edgeMarks, frameFocus, goalClear, groupAround } from './camguide.ts';
import { goalSlot } from './tdpadguide.ts';
import { EASE } from './motion.ts';
import { RIG_TEX, rigTex } from './rigsprite.ts';
import { heroRank, rigPieces } from './art/rigparts.ts';
import { bakeAtlas } from './textures.ts';
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
/**
 * 第四章岛上的水面（TdLevel.water：水道、火口湖）：每格一块深浅两层的水，挨着陆地的边描一道白浪；
 * 桥（TdIslandLevel.bridges）的格子底下也铺水，上面横铺木板、两边栏杆。开局画一次，不随局面变
 */
export function drawWater(bs: TdScene): void {
  const lv = bs.s.level as { water?: Array<{ x: number; y: number }>; bridges?: Array<{ x: number; y: number }> };
  const water = lv.water ?? [];
  const bridges = lv.bridges ?? [];
  if (water.length === 0 && bridges.length === 0) return;
  const wet = new Set([...water, ...bridges].map((c) => `${c.x},${c.y}`));
  const g = bs.add.graphics().setDepth(DEPTH.water);
  const diamond = (cx: number, cy: number, inset = 0): Phaser.Math.Vector2[] =>
    [iso(cx + inset, cy + inset), iso(cx + 1 - inset, cy + inset), iso(cx + 1 - inset, cy + 1 - inset), iso(cx + inset, cy + 1 - inset)].map((q) => new Phaser.Math.Vector2(q.x, q.y));
  // 一整片同色（每格略放大一点盖住接缝），不画每格的内框，免得看成一格格的瓷砖
  g.fillStyle(0x2f8fb4, 1);
  for (const c of [...water, ...bridges]) g.fillPoints(diamond(c.x, c.y, -0.02), true);
  // 挨着陆地的边：先一道宽的浅水，再一道白浪
  const edges: Array<[number, number, number, number, number, number]> = [
    [0, -1, 0, 0, 1, 0],
    [1, 0, 1, 0, 1, 1],
    [0, 1, 1, 1, 0, 1],
    [-1, 0, 0, 1, 0, 0],
  ];
  const shore: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
  for (const c of water) {
    for (const [dx, dy, ax, ay, bx, by] of edges) {
      if (wet.has(`${c.x + dx},${c.y + dy}`)) continue;
      shore.push([iso(c.x + ax, c.y + ay), iso(c.x + bx, c.y + by)]);
    }
  }
  g.lineStyle(14, 0x5fc2dc, 0.75);
  for (const [a, b] of shore) g.lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(3, 0xeffcf7, 0.9);
  for (const [a, b] of shore) g.lineBetween(a.x, a.y, b.x, b.y);
  // 水面的反光：按格子坐标挑一部分格画一道短白线（固定，不随机）
  g.lineStyle(2, 0xffffff, 0.35);
  for (const c of water) {
    if ((c.x * 7 + c.y * 13) % 5 !== 0) continue;
    const m = iso(c.x + 0.5, c.y + 0.5);
    g.lineBetween(m.x - 10, m.y, m.x + 6, m.y - 2);
  }
  if (bridges.length === 0) return;
  const bg = bs.add.graphics().setDepth(DEPTH.bridge);
  for (const c of bridges) {
    bg.fillStyle(0x9a6a3a, 1).fillPoints(diamond(c.x, c.y, 0.04), true);
    bg.lineStyle(2, 0x5a3a1e, 0.9);
    for (let k = 1; k < 4; k++) {
      const a = iso(c.x + k / 4, c.y);
      const b = iso(c.x + k / 4, c.y + 1);
      bg.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  // 两边栏杆：桥在 x 方向的最左、最右两列各一道
  const xs = bridges.map((c) => c.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) + 1;
  const ys = bridges.map((c) => c.y);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys) + 1;
  bg.lineStyle(4, 0x5a3a1e, 1);
  for (const x of [x0, x1]) {
    const a = iso(x, y0);
    const b = iso(x, y1);
    bg.lineBetween(a.x, a.y - 8, b.x, b.y - 8);
  }
}

export function drawProps(bs: TdScene): void {
  const s = bs.s;
  // 岸防老炮（规则版本 16）：沙滩上的炮台，炮弹从炮口飞出去（tdevents.ts 的 battery）
  if (s.battery) {
    const q = iso(s.battery.x + 0.5, s.battery.y + 0.5);
    put(bs, bs.r, tdP('battery'), q.x, q.y).setDepth(depthOf(s.battery.x + 0.5, s.battery.y + 0.5));
  }
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

/** 守岛英雄画哪套骨架：航海士（规则版本 23）还是船长 */
export function heroRig(h: { kind?: 'nav' }): 'h.nav' | 't.captain' {
  return h.kind ? 'h.nav' : 't.captain';
}

export function makeHero(bs: TdScene): void {
  const w = W(bs.s.hero.x, bs.s.hero.y);
  // 脚下暖金底盘（半透明的金色实心椭圆加亮边）：人堆里先看到这块金，再找到人
  bs.heroRing = bs.add.ellipse(w.x, w.y, 40, 20, 0xffc94a, 0.42).setStrokeStyle(3, 0xffe885, 1).setDepth(DEPTH.heroRing);
  // 整帧图只在离得远换低细节时用；英雄一直画完整骨架（tdsync 传 lod 0），航海士也拿船长的整帧当兜底
  const frames = (an: 'idle' | 'walk' | 'attack') => troopF('captain', an);
  const kind = heroRig(bs.s.hero);
  bs.hero = bs.pool.get(kind, RIG_TEX, frames, bs.time.now);
  // 英雄 4 / 8 / 12 级换外观（船长：白色长羽、金肩章、双枪；航海士：辫子金扣、金肩章、金边望远镜）：那一级的部件图集按需烘（第一次进要等几十毫秒，先用普通图集顶着），烘好换上
  const rank = heroRank(bs.s.hero.level);
  if (rank) {
    const key = rigTex(kind, rank);
    const wear = (): void => {
      if (bs.sys.isActive()) bs.hero.setup(kind, key, frames, bs.time.now);
    };
    if (bs.textures.exists(key)) wear();
    else void bakeAtlas(bs.textures, key, rigPieces(kind, rank), bs.r).then(wear);
  }
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
/** 每个场景沙滩上的补给箱：箱子图 + 脚下一圈呼吸的金光（规则版本 16 的章末机制，tdevents.ts 的 crate 事件增删） */
const CRATES = new WeakMap<object, { s: object; m: Map<number, Phaser.GameObjects.GameObject[]> }>();

/** 这一局的箱子表：「再守一次」是同一个场景对象重开（状态对象换了），旧局的图已随场景销毁，换一张新表 */
function cratesOf(bs: TdScene): Map<number, Phaser.GameObjects.GameObject[]> {
  let c = CRATES.get(bs);
  if (c?.s !== bs.s) CRATES.set(bs, (c = { s: bs.s, m: new Map() }));
  return c.m;
}

export function addCrate(bs: TdScene, id: number, ux: number, uy: number): void {
  const m = cratesOf(bs);
  const p = W(ux, uy);
  const R = isoRing(1.2);
  const ring = bs.add.ellipse(p.x, p.y + 4, R.w, R.h, 0xffe885, 0.18).setStrokeStyle(3, 0xffe885, 0.9).setDepth(depthOf(ux / UNIT, uy / UNIT) - 0.1);
  bs.tweens.add({ targets: ring, scaleX: 1.15, scaleY: 1.15, alpha: 0.5, duration: 700, yoyo: true, repeat: -1, ease: EASE.recover });
  const im = put(bs, bs.r, tdP('crate'), p.x, p.y - 30).setDepth(depthOf(ux / UNIT, uy / UNIT));
  bs.tweens.add({ targets: im, y: p.y, duration: 600, ease: 'Bounce.easeOut' });
  bs.tweens.add({ targets: im, angle: { from: -4, to: 4 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  m.set(id, [ring, im]);
}

/** 捡到（往上一跳再消失）或漂走（往海里滑、淡出） */
export function removeCrate(bs: TdScene, id: number, picked: boolean): void {
  const m = cratesOf(bs);
  const objs = m.get(id);
  if (!objs) return;
  m.delete(id);
  for (const o of objs) {
    bs.tweens.killTweensOf(o);
    bs.tweens.add({ targets: o, alpha: 0, y: (o as Phaser.GameObjects.Image).y + (picked ? -30 : 16), duration: picked ? 260 : 600, onComplete: () => o.destroy() });
  }
}

/** 点到的是哪个补给箱（点在箱子 1.2 格内；没有为 -1） */
export function crateAt(bs: TdScene, ux: number, uy: number): number {
  for (const c of bs.s.drift?.crates ?? []) if ((c.x - ux) ** 2 + (c.y - uy) ** 2 <= 120 * 120) return c.id;
  return -1;
}

/** 每局一张水闸图（不往 TdScene 里加字段，按场景存、按状态对象认局），按"下一波关没关"换提起 / 放下 */
const SLUICE = new WeakMap<object, { s: object; im: Phaser.GameObjects.Image; down: boolean }>();

/** 落潮路口的水闸（规则版本 16 的章末机制）：开局摆上，玩家关上下一波就放下闸板（updateHud 里每次状态变了调） */
export function syncSluice(bs: TdScene, down: boolean): void {
  const lv = bs.s.level;
  if (!bs.s.sluice || !lv.tide) return;
  let g = SLUICE.get(bs);
  // 「再守一次」是同一个场景对象重开：旧局的闸板图已销毁，再 setTexture 会抛错、整个场景起不来，所以按局（状态对象）重摆
  if (g?.s !== bs.s) {
    const { x, y } = lv.tide.lane;
    const q = iso(x + 0.5, y + 0.5);
    g = { s: bs.s, im: put(bs, bs.r, tdP(down ? 'sluiceDown' : 'sluiceUp'), q.x, q.y - 4).setDepth(depthOf(x + 0.5, y + 0.5)), down };
    SLUICE.set(bs, g);
    return;
  }
  if (g.down === down) return;
  g.down = down;
  g.im.setTexture(tdP(down ? 'sluiceDown' : 'sluiceUp').key);
  bs.tweens.add({ targets: g.im, y: { from: g.im.y - 6, to: g.im.y }, duration: 180, ease: 'Quad.easeOut' });
}

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
    } else if (!first && bs.s.sluice?.shut.includes(bs.s.wave - 1)) banner(bs, '水闸关上了', `${laneName(lv.tide.lane)}的敌人改走${laneName(lv.lanes[0] ?? lv.tide.lane)}`, false);
    else if (!first) banner(bs, '涨潮了', `${laneName(lv.tide.lane)}被水淹没，敌人只走原来的路`, false);
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
  return { box: cellsBox(rs, 1) };
}

/** 看下一波时，落点沿路线往岛里走几格 */
const FOLLOW_INLAND = 3;

/** 木台离这一波的路线不超过这么多格，就算「这一波要用的台」 */
const INTRO_PAD_REACH = 3;

/**
 * 竖屏开场推镜的落点（世界 x）：第一波要用的登陆口，加上这些路线边上的木台，一起取中。
 * 只看登陆口时，木台在另一侧的关（比如 td06）一开场木台全在屏外，只剩屏边的「+」，玩家要先自己找台子造塔。
 */
export function introFocus(bs: TdScene): number | null {
  const s = bs.s;
  const lanes = tdWaveLanes(s, s.wave);
  if (!lanes.length) return null;
  const xs = lanes.map((c) => iso(c.x + 0.5, c.y + 0.5).x);
  const cells = tdRoutes(s)
    .filter((r) => lanes.some((c) => c.x === r.x && c.y === r.y))
    .flatMap((r) => r.cells.map((n) => [Math.floor(cellX(n) / UNIT), Math.floor(cellY(n) / UNIT)] as const));
  for (const q of s.slots) {
    if (cells.some(([cx, cy]) => Math.max(Math.abs(cx - q.x - 0.5), Math.abs(cy - q.y - 0.5)) <= INTRO_PAD_REACH)) xs.push(iso(q.x + 1, q.y + 1).x);
  }
  return xs.reduce((a, x) => a + x, 0) / xs.length;
}

/**
 * 守岛的自动构图（竖屏放大时，FitCam 每帧问一次看哪里）：
 * - 岛上有敌人：离宝藏最近的那个当锚，它周围一拨是主组，和离主组最近的宝藏能一起框住就框住，放不下只看主组。
 *   所以一拨人正在冲宝藏时，新一波从别处上岸也不会把镜头拉走（新来的看屏边箭头）；
 * - 岛上没敌人：看下一波的登陆口沿路往岛里走 FOLLOW_INLAND 格（登陆口在画面上部，下面是他们要走的路）；
 * - 护航：看船前方（escortview 给）。
 * 开着造塔 / 升级面板、在瞄技能、录像钩子在控镜头时不动。
 */
export function tdDirector(bs: TdScene): Director {
  return {
    busy: () => bs.openSlot >= 0 || bs.bestOpen || bs.mode !== 'none' || bs.followT !== null || bs.ended,
    track: () => !!bs.esc,
    focus: (vw, vh) => {
      if (bs.esc) return bs.esc.camFocus();
      const s = bs.s;
      const chests = s.treasures.map((t) => iso(t.x + 0.5, t.y + 0.5));
      const foes: FPt[] = [];
      for (const e of s.enemies) if (e.mode === 'in' || e.mode === 'out') foes.push(W(e.x, e.y));
      if (foes.length) {
        const near = (p: FPt): number => Math.min(...chests.map((c) => Math.hypot(c.x - p.x, c.y - p.y)));
        let anchor = foes[0]!;
        for (const p of foes) if (chests.length && near(p) < near(anchor)) anchor = p;
        const group = groupAround(foes, anchor);
        let obj: FPt | null = null;
        for (const c of chests) if (!obj || Math.hypot(c.x - group.x, c.y - group.y) < Math.hypot(obj.x - group.x, obj.y - group.y)) obj = c;
        return frameFocus(group, obj, vw, vh);
      }
      const w = tdIncomingWave(s);
      return w < 0 ? null : laneFocus(bs, w);
    },
  };
}

/** 第 w 波登陆口沿去宝藏的路往岛里走 FOLLOW_INLAND 格的点的中间（世界坐标）；这一波没有登陆口为 null */
function laneFocus(bs: TdScene, w: number): FPt | null {
  const routes = tdRoutes(bs.s);
  const at = tdWaveLanes(bs.s, w).map((c) => {
    const cells = routes.find((r) => r.x === c.x && r.y === c.y)?.cells ?? [];
    const k = cells[Math.min(FOLLOW_INLAND, cells.length - 1)];
    return k === undefined ? iso(c.x + 0.5, c.y + 0.5) : iso(cellX(k) / UNIT, cellY(k) / UNIT);
  });
  if (!at.length) return null;
  return { x: at.reduce((a, p) => a + p.x, 0) / at.length, y: at.reduce((a, p) => a + p.y, 0) / at.length };
}

/** 屏外的敌人在可见区边上出箭头加数量、屏外的补给箱出箱子（点了镜头移过去），屏外的空木台出小标；只在竖屏放大（FitCam.live）时有 */
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
  // 预告卡指的那块木台（开局造法 / 下一座造 / 升级）在屏外：边上指一个金色箭头，点了镜头移过去（和点卡上那一格一样）
  const goal = bs.fit.live && !bs.ended ? goalSlot(bs) : undefined;
  if (goal !== undefined) {
    const q = s.slots[goal]!;
    const w = iso(q.x + 1, q.y + 1);
    const p = bs.cc.toScreen(w.x, w.y);
    items.push({ kind: 'goal', sx: p.x, sy: p.y, wx: w.x, wy: w.y });
  }
  // 补给箱漂到屏外时也标出来：竖屏镜头跟着敌人走，宝藏边的箱子常在画面外，不标就等于没漂来
  if (bs.fit.live && !bs.ended) {
    for (const c of s.drift?.crates ?? []) {
      const w = W(c.x, c.y);
      const p = bs.cc.toScreen(w.x, w.y);
      items.push({ kind: 'crate', sx: p.x, sy: p.y, wx: w.x, wy: w.y });
    }
  }
  if (bs.esc && bs.fit.live && !bs.ended) {
    for (const w of bs.esc.edgePoints()) {
      const p = bs.cc.toScreen(w.x, w.y);
      items.push({ kind: 'gate', sx: p.x, sy: p.y, wx: w.x, wy: w.y });
    }
  }
  const view = bs.fit.visible();
  const marks = items.length ? goalClear(edgeMarks(items, view), view) : [];
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
  // 敌人和补给箱是按钮（点了镜头移过去），空木台和路口旗是不能点的小标：每种一个池子，同一个下标一直对着同一个元素
  const pools: Record<EdgeKind, typeof bs.edgeEls> = { enemy: [], slot: [], gate: [], crate: [], goal: [] };
  for (const it of bs.edgeEls) pools[(it.el.dataset.k as EdgeKind | undefined) ?? 'slot'].push(it);
  const used = { enemy: 0, slot: 0, gate: 0, crate: 0, goal: 0 };
  for (const m of marks) {
    const pool = pools[m.kind];
    let it = pool[used[m.kind]++];
    if (!it) {
      const box: HTMLElement =
        m.kind === 'enemy' || m.kind === 'crate' || m.kind === 'goal'
          ? button('', 'hd-td-edge', () => {
              if (!box.dataset.wx) return;
              bs.fit.markUser();
              bs.fit.panTo(Number(box.dataset.wx), Number(box.dataset.wy));
            }, bs.edges)
          : el('span', 'hd-td-edge', undefined, bs.edges);
      // 皮肤的木板底不要：箭头自己一套样式（敌人 = 红圈 + 剑 + 个数；补给箱 = 金圈 + 箱子；木台 = 木牌 + 加号；路口 = 黄旗；预告卡指的木台 = 金圈 + 锤子）
      box.className = m.kind === 'enemy' ? 'hd-td-edge' : `hd-td-edge ${m.kind}`;
      box.dataset.k = m.kind;
      if (m.kind === 'enemy') box.appendChild(img(iconA('sword'), 16));
      if (m.kind === 'goal') {
        box.appendChild(img(iconA('hammer'), 22));
        box.setAttribute('aria-label', '预告卡说的那块木台在那边，点一下看过去');
      }
      if (m.kind === 'crate') {
        box.appendChild(img(tdP('crate'), 30));
        box.setAttribute('aria-label', '那边漂来了补给箱，点一下看过去');
      }
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
  for (const k of ['enemy', 'slot', 'gate', 'crate', 'goal'] as const) {
    for (const it of pools[k].slice(used[k])) {
      if (it.sig === '') continue;
      it.sig = '';
      it.el.style.display = 'none';
    }
  }
}

/**
 * 友军巡航船（规则版本 19）：船在海上时每帧按规则的航线摆（两拍之间按帧插值），朝开的方向翻转；不在海上就藏起来。
 * 船就是玩家旗舰那张图缩小，第一次出海时才建
 */
export function syncFleet(bs: TdScene, frac: number): void {
  const sail = bs.s.fleet?.sail;
  if (!sail) {
    bs.fleetImg?.setVisible(false);
    return;
  }
  const t = bs.s.tick + frac;
  const a = fleetAt(sail, Math.floor(t));
  const b = fleetAt(sail, Math.floor(t) + 1);
  const k = t - Math.floor(t);
  const ux = a.x + (b.x - a.x) * k;
  const uy = a.y + (b.y - a.y) * k;
  const q = iso(ux / UNIT, uy / UNIT);
  if (!bs.fleetImg) bs.fleetImg = put(bs, bs.r, shipA('flagship'), q.x, q.y).setScale(0.42 / bs.r);
  const img = bs.fleetImg.setVisible(true).setPosition(q.x, q.y).setDepth(depthOf(ux / UNIT, uy / UNIT));
  const ahead = iso(b.x / UNIT, b.y / UNIT);
  const back = iso(a.x / UNIT, a.y / UNIT);
  if (ahead.x !== back.x) img.setFlipX(ahead.x < back.x);
}
