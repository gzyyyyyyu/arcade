import { attachIntel } from './intelcard.ts';
import { DEFENSE_CARD_KINDS, defenseCard } from './intel.ts';
import type { BaseScene } from './BaseScene.ts';
import { BUILDINGS, HQ_LEVELS } from '../content/index.ts';
import { hqLevel, buildLimit, canPlace, build, move } from '../core/index.ts';
import { type BuildingKind, ISLAND, type Placed } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { alphaAt, artBox } from './textures.ts';
import { bArt, bTex } from './art.ts';
import { upgradable } from './dots.ts';
import { fullText, nextSlotHq, lackText, startSpot, edgePan, hoverBob, clampPlace, placeCheck, placeReason } from './basefeel.ts';
import { put } from './ground.ts';
import { unIso, iso, footCenter, depthOf } from './iso.ts';
import { type PickItem, pick, occluders, fadeStep } from './basepick.ts';
import { sfx } from './audio/sfx.ts';
import { buildSound, isBigBuilding } from './audio/pick.ts';
import { tutStep, type Rect, tutAdv } from './tutorial.ts';
import { button, el, img, lockIcon, costRow, toast, paginate } from './ui.ts';
import { DEPTH } from './depth.ts';
import { v2, CAT_ORDER } from './basecommon.ts';
import { closeCtx, closeRing, drawSel, openRing } from './basemenu.ts';
import { doCollect } from './baseupgrade.ts';
import { closeSheet, openInfo, openSheet, openPresets, short } from './basepanel.ts';
import { measureSafe, topOf } from './basegeom.ts';
import { REDUCED } from './feel.ts';

/** 贴图不透明的判定阈值（和 textures.ts 的外框扫描一致） */
const ALPHA_MIN = 24;

/** 参与选中判定的建筑：占地 + 画的先后（读存档和精灵，不画东西） */
function pickItems(bs: BaseScene): PickItem[] {
  return app.profile.base.buildings.map((b) => {
    const size = BUILDINGS[b.kind].size;
    const f = footCenter(b.x, b.y, size);
    return { id: b.id, x: b.x, y: b.y, size, depth: bs.nodes.get(b.id)?.img.depth ?? depthOf(f.gx, f.gy) };
  });
}

/**
 * (wx, wy) 在建筑 id 的贴图不透明像素上吗：先按外框快速排除，再读那一个像素的 alpha
 * （alphaAt 只读 1×1，不读整张图）。
 */
function hitPixel(bs: BaseScene, id: number, wx: number, wy: number): boolean {
  const n = bs.nodes.get(id);
  if (!n?.img.visible) return false;
  const im = n.img;
  const bx = artBox(n.key) ?? { l: 0, t: 0, r: im.width, b: im.height };
  const ox = im.x - im.originX * im.displayWidth;
  const oy = im.y - im.originY * im.displayHeight;
  const tx = (wx - ox) / im.scaleX;
  const ty = (wy - oy) / im.scaleY;
  if (tx < bx.l || tx > bx.r || ty < bx.t || ty > bx.b) return false;
  if (!bs.textures.exists(n.key)) return true;
  return alphaAt(bs.textures, n.key, Math.floor(tx), Math.floor(ty)) > ALPHA_MIN;
}

/**
 * 点中的建筑 id（DESIGN 第 6 节）：占地格优先 → 不透明像素、前面的优先 → 同一点连点循环（cycle = true 才循环，悬停、右键只取最前）。
 */
export function buildingAt(bs: BaseScene, wx: number, wy: number, cycle = false): number | null {
  return pick(pickItems(bs), wx, wy, (id, x, y) => hitPixel(bs, id, x, y), cycle ? bs.cycle : undefined, 8 / bs.cc.z);
}

/** 占地菱形的四个顶点（世界坐标） */
function diamondPts(x: number, y: number, size: number): Phaser.Math.Vector2[] {
  return [iso(x, y), iso(x + size, y), iso(x + size, y + size), iso(x, y + size)].map(v2);
}

/** 悬停 / 按下的占地菱形加描边（鼠标悬停和手指按下共用） */
function drawHover(bs: BaseScene, id: number | null): void {
  const g = bs.hoverG;
  g.clear();
  const b = id === null ? undefined : app.profile.base.buildings.find((q) => q.id === id);
  if (!b) return;
  const pts = diamondPts(b.x, b.y, BUILDINGS[b.kind].size);
  g.fillStyle(0xffe885, 0.2).fillPoints(pts, true).lineStyle(5, 0x2b1a15, 0.5).strokePoints(pts, true).lineStyle(3, 0xffe885, 0.95).strokePoints(pts, true);
}

/** 手指按下：马上画出这一下会选中谁（松手或拖开就收） */
export function press(bs: BaseScene, wx: number | null, wy = 0): void {
  if (bs.place) return;
  bs.pressId = wx === null ? null : buildingAt(bs, wx, wy);
  drawHover(bs, bs.pressId ?? bs.hoverId);
}

/** 鼠标悬停：建筑占地画一圈金边，光标变手，头上出名牌；放建筑时鼠标移动就是挪虚影 */
export function hover(bs: BaseScene, wx: number, wy: number): void {
  if (bs.place) {
    if (!Number.isNaN(wx)) placeAt(bs, wx, wy, true);
    return;
  }
  const id = Number.isNaN(wx) ? null : buildingAt(bs, wx, wy);
  if (id === bs.hoverId) return;
  bs.hoverId = id;
  bs.plateSig = '';
  bs.plateAt = 0;
  if (id === null) bs.plate.classList.remove('on');
  bs.input.setDefaultCursor(id === null ? 'default' : 'pointer');
  drawHover(bs, id);
}

/** 当前该看清哪块占地：摆放中的虚影 > 手指按下 > 悬停 > 选中 */
function focusFoot(bs: BaseScene): { x: number; y: number; size: number; skip?: number; sig: string } | null {
  const pl = bs.place;
  if (pl) {
    if (pl.kind === 'wall' && pl.id === undefined) return null;
    return { x: pl.x, y: pl.y, size: pl.size, skip: pl.id, sig: `p${pl.x},${pl.y},${pl.size},${pl.id ?? ''}` };
  }
  const id = bs.pressId ?? bs.hoverId ?? bs.sel;
  const b = id === null ? undefined : app.profile.base.buildings.find((q) => q.id === id);
  if (!b) return null;
  return { x: b.x, y: b.y, size: BUILDINGS[b.kind].size, skip: b.id, sig: `b${b.id},${b.x},${b.y}` };
}

/** 每帧：焦点建筑被前面的高建筑盖住时，前面的变半透明（按时间淡入淡出，减少动效时直接到位）；其余恢复 */
export function fadeFrame(bs: BaseScene, time: number, dt: number): void {
  const f = focusFoot(bs);
  const sig = f ? `${f.sig}|${bs.nodes.size}` : '';
  if (sig !== bs.occSig || time - bs.occAt > 600) {
    bs.occAt = time;
    if (sig !== bs.occSig || bs.occ.size > 0 || f) {
      bs.occSig = sig;
      bs.occ = f ? occluders(pickItems(bs), f.x, f.y, f.size, (id, x, y) => hitPixel(bs, id, x, y), f.skip) : new Set();
    }
  }
  for (const id of new Set([...bs.occ, ...bs.fade.keys()])) {
    const n = bs.nodes.get(id);
    if (!n) {
      bs.fade.delete(id);
      continue;
    }
    if (bs.upfx.busy(n.img) || bs.place?.id === id) continue;
    const cur = bs.fade.get(id) ?? 1;
    const nxt = fadeStep(cur, bs.occ.has(id) ? OCC_ALPHA : 1, dt, REDUCED);
    n.img.setAlpha(nxt);
    if (nxt >= 1) bs.fade.delete(id);
    else bs.fade.set(id, nxt);
  }
}

const OCC_ALPHA = 0.35;

// ---- 点岛：手指点建筑弹操作环，鼠标左键单击直接开右侧信息面板
export function tap(bs: BaseScene, wx: number, wy: number, mouse = false): void {
  bs.touch = !mouse;
  closeCtx(bs);
  if (bs.place) {
    // 摆放中：鼠标单击 = 在这里放下；手指点一下 = 把虚影挪过来（再点 ✓ 放下）
    placeAt(bs, wx, wy, mouse);
    if (mouse) confirmPlace(bs);
    else syncPlaceUi(bs);
    return;
  }
  // 气泡优先（点气泡就收，不弹环）
  const rad = 22 * Math.min(2.6, Math.max(1, 0.9 / bs.cc.z));
  for (const [id, n] of bs.nodes) {
    if (n.bubble?.visible && Math.hypot(wx - n.bubble.x, wy - n.bubble.y) < rad + 6) return doCollect(bs, id);
  }
  press(bs, null);
  const hit = buildingAt(bs, wx, wy, true);
  if (hit === null) {
    closeRing(bs);
    bs.sel = null;
    drawSel(bs);
    return closeSheet(bs);
  }
  if (mouse) {
    closeRing(bs);
    openInfo(bs, hit);
  } else openRing(bs, hit);
}

// ---- 建造
export function openBuild(bs: BaseScene): void {
  const p = app.profile;
  const hq = hqLevel(p);
  const { box, body } = openSheet(bs, '建造', 'build');
  button('推荐布局（一键换摆法）', 'hd-btn-plain hd-presetbtn', () => openPresets(bs), body);
  // 现在升得起的建筑（和底栏「建造」上的红点对应）：点一下回到岛上，手机弹出它的操作环，电脑打开它的信息面板
  const ups = upgradable(p).map((id) => p.base.buildings.find((b) => b.id === id)!).filter((b) => b.kind !== 'wall').slice(0, 8);
  if (ups.length > 0) {
    el('p', 'hd-desc', '现在能升级：', body);
    const row = el('div', 'hd-chips', undefined, body);
    for (const b of ups) {
      const c = button(`${BUILDINGS[b.kind].name} ${b.level}→${b.level + 1}`, 'hd-btn-gold hd-upchip', () => {
        closeSheet(bs);
        if (bs.touch) openRing(bs, b.id);
        else openInfo(bs, b.id);
      }, row);
      c.style.minHeight = '44px';
    }
  }
  const grid = el('div', 'hd-grid', undefined, body);
  bs.buildCards.clear();
  const kinds = (Object.keys(BUILDINGS) as BuildingKind[])
    .filter((k) => CAT_ORDER.includes(BUILDINGS[k].category))
    .sort((a, b) => CAT_ORDER.indexOf(BUILDINGS[a].category) - CAT_ORDER.indexOf(BUILDINGS[b].category) || BUILDINGS[a].unlockHq - BUILDINGS[b].unlockHq);
  for (const k of kinds) {
    const d = BUILDINGS[k];
    const lim = buildLimit(p, k);
    const cost = d.levels[0]!.cost;
    const locked = d.unlockHq > hq;
    const full = !locked && lim.have >= lim.max;
    const poor = cost.gold > p.res.gold || cost.wood > p.res.wood;
    const card = el('button', `hd-card${locked || full ? ' off' : ''}${poor && !locked && !full ? ' poor' : ''}`, undefined, grid);
    card.type = 'button';
    bs.buildCards.set(k, card);
    if (DEFENSE_CARD_KINDS.includes(k)) attachIntel(card, () => defenseCard(k, 1));
    card.appendChild(img(bArt(k, 1), 56));
    el('span', 'hd-nm', d.name, card);
    if (locked) {
      const lk = el('span', 'hd-sub hd-lockrow', undefined, card);
      lk.appendChild(lockIcon(16));
      lk.append(`主寨 ${d.unlockHq} 级开放`);
    }
    else {
      card.appendChild(costRow(cost, p.res));
      el('span', 'hd-sub', `已建 ${lim.have}/${lim.max}`, card);
      // 灰着的卡直接写原因和出路，不用点了才弹提示
      if (full) el('span', 'hd-sub hd-cardnote', fullText(lim.max, nextSlotHq(HQ_LEVELS.map((l) => l.limits[k] ?? 0), hq)), card);
      else if (poor) el('span', 'hd-sub hd-cardnote lack', lackText(cost, p.res), card);
    }
    card.addEventListener('click', () => {
      if (locked || full || poor) sfx('error');
      else sfx('tap');
      if (locked) return toast(`主寨 ${d.unlockHq} 级才能建${d.name}`);
      if (full) return toast(lim.max === 0 ? `${d.name}现在还不能建` : `${d.name}的名额满了，升级主寨有更多名额`);
      if (poor) return toast(cost.gold > p.res.gold ? `还差 ${fmt(cost.gold - p.res.gold)} 金币` : `还差 ${fmt(cost.wood - p.res.wood)} 木材`);
      startPlace(bs, k);
    });
  }
  // 26 种建筑一页放不下：按抽屉高度翻页；新手引导要点的金库那页先开
  paginate(box, [...grid.children] as HTMLElement[], grid, tutStep() === 1 ? bs.buildCards.get('vault') : null);
}

// ---- 摆放（建造新建筑、移动）：按格吸附，虚影下的每一格涂绿 / 红，底栏写能不能放和原因。
// 电脑：鼠标移动就是预览，左键放下，右键 / Esc 取消，滚轮照常缩放，贴着屏幕边缘镜头自己平移；
// 手机：手指拖，松手不落地，虚影旁边出 ✓ / ✕ 两个钮（点空地也能把虚影挪过去）。放下有落地演出（upfx.drop）。
export function startPlace(bs: BaseScene, kind: BuildingKind, id?: number): void {
  closeSheet(bs);
  cancelPlace(bs);
  if (id !== undefined) bs.upfx.finish(id);
  bs.hoverG.clear();
  bs.hoverId = null;
  bs.plate.classList.remove('on');
  bs.input.setDefaultCursor('default');
  const p = app.profile;
  const cur = id !== undefined ? p.base.buildings.find((b) => b.id === id) : undefined;
  const level = cur?.level ?? 1;
  const size = BUILDINGS[kind].size;
  const art = bTex(kind, level);
  const ghost = put(bs, bs.r, art, 0, 0).setAlpha(0.8).setDepth(DEPTH.dragGhost);
  const diamond = bs.add.graphics().setDepth(DEPTH.dragDiamond);
  // 起点：旧位置，或者画面中心附近最近的一块空地（四周留空，不压在别的建筑后面，见 basefeel 的 startSpot）
  let sx = cur?.x ?? 0;
  let sy = cur?.y ?? 0;
  if (!cur) {
    const g = unIso(bs.cc.cx, bs.cc.cy);
    const at = startSpot(p.base.buildings, kind, Math.round(g.gx - size / 2), Math.round(g.gy - size / 2), bs.ext, (x, y) => canPlace(p, kind, x, y));
    if (at) {
      sx = at.x;
      sy = at.y;
    }
  }
  const bar = (bs.placeBar = el('div', 'hd-place', undefined, bs.ui));
  const tag = el('div', 'hd-tag', undefined, bar);
  el('b', '', id !== undefined ? `移动${BUILDINGS[kind].name}` : `建造${BUILDINGS[kind].name}`, tag);
  const costEl = el('span', '', undefined, tag);
  if (id === undefined) costEl.appendChild(costRow(BUILDINGS[kind].levels[0]!.cost, p.res));
  const why = el('span', 'hd-place-why', '', tag);
  const hint = el('div', 'hd-place-hint', '', bar);
  const row = el('div', 'hd-row hd-place-row', undefined, bar);
  button('取消', 'hd-btn-plain', () => cancelPlace(bs), row).title = '取消（右键或 Esc）';
  const float = el('div', 'hd-place-float', undefined, bs.ui);
  const ok = button('✓', 'hd-btn-gold hd-place-ok', () => confirmPlace(bs), float, null);
  ok.setAttribute('aria-label', '确定');
  ok.title = '放在这里';
  const no = button('✕', 'hd-btn-plain hd-place-no', () => cancelPlace(bs), float);
  no.setAttribute('aria-label', '取消');
  no.title = '取消（Esc）';
  bs.place = { kind, id, level, size, x: sx, y: sy, valid: false, ghost, diamond, ok, no, float, why, hint, check: null, dragging: false, press: null, moved: false, mouseLine: false, shake: 0, bx: 0, by: 0, costEl };
  bs.bottom.style.display = 'none';
  setPlace(bs, sx, sy);
  if (kind === 'wall' && id === undefined) {
    bs.place.lineFrom = { x: sx, y: sy };
    setLine(bs, sx, sy);
  }
  bs.refresh();
  drawSel(bs);
  syncPlaceUi(bs);
}

/** 摆放界面按"手指 / 鼠标"切换：手指用虚影旁的 ✓ / ✕，鼠标看底栏的提示和取消钮 */
export function syncPlaceUi(bs: BaseScene): void {
  const pl = bs.place;
  if (!pl || !bs.placeBar) return;
  const wall = pl.kind === 'wall' && pl.id === undefined;
  const t = bs.touch;
  pl.float.classList.toggle('on', t && !pl.dragging);
  bs.placeBar.classList.toggle('touch', t);
  pl.hint.textContent = t
    ? wall ? '手指按住拖出一排城墙，松手后点 ✓' : '拖动虚影到空地，松手后点 ✓ 放下'
    : wall ? '按住左键拖出一排城墙，松手放下 · 右键或 Esc 取消' : '左键放下 · 右键或 Esc 取消 · 滚轮缩放 · 贴边移动镜头';
}

/** 每帧：鼠标贴边时平移镜头、虚影跟着鼠标（镜头动了也跟），虚影轻轻浮动，放不下时晃一下，✓ / ✕ 跟着虚影 */
export function placeFrame(bs: BaseScene, time: number, dt: number): void {
  const pl = bs.place!;
  if (!bs.touch) {
    const m = bs.cc.mouse;
    const v = edgePan(m.x, m.y, bs.scale.width / bs.r, bs.scale.height / bs.r);
    bs.cc.panBy((v.vx * dt) / 1000, (v.vy * dt) / 1000);
    if (Number.isFinite(m.x)) {
      const w = bs.cc.toWorld(m.x * bs.r, m.y * bs.r);
      placeAt(bs, w.x, w.y, true);
    }
  }
  let dx = 0;
  if (pl.shake > 0) {
    pl.shake = Math.max(0, pl.shake - dt);
    dx = Math.sin(pl.shake / 22) * 5 * (pl.shake / 320);
  }
  pl.ghost.setPosition(pl.bx + dx, pl.by + (pl.dragging ? -4 : hoverBob(time)));
  if (pl.float.classList.contains('on')) {
    if (time - bs.lastSafe > 400) measureSafe(bs, time);
    const a = pl.line?.length ? pl.line[pl.line.length - 1]! : null;
    const right = a ? iso(a.x + 1, a.y) : iso(pl.x + pl.size, pl.y);
    const left = a ? iso(a.x, a.y + 1) : iso(pl.x, pl.y + pl.size);
    const rs = bs.cc.toScreen(right.x, right.y);
    const ls = bs.cc.toScreen(left.x, left.y);
    const W = 112;
    let x = rs.x - bs.off.x + 10;
    if (x + W > bs.safe.r) x = ls.x - bs.off.x - 10 - W;
    x = Math.min(bs.safe.r - W, Math.max(bs.safe.l, x));
    const y = Math.min(bs.safe.b - 56, Math.max(bs.safe.t + 4, rs.y - bs.off.y - 28));
    pl.float.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
}

/** 格坐标夹到岛上的一格（岛按主寨扩了 bs.ext 圈：[-ext, ISLAND+ext)），拉城墙的起点、终点用 */
function isleCell(bs: BaseScene, gx: number, gy: number): { x: number; y: number } {
  const lo = -bs.ext;
  const hi = ISLAND + bs.ext - 1;
  return { x: Math.min(hi, Math.max(lo, Math.floor(gx))), y: Math.min(hi, Math.max(lo, Math.floor(gy))) };
}

/** 鼠标 / 手指点按的世界坐标 → 虚影落在哪（不像拖动那样往上让手指） */
export function placeAt(bs: BaseScene, wx: number, wy: number, mouse: boolean): void {
  const pl = bs.place;
  if (!pl) return;
  const g = unIso(wx, wy);
  if (pl.kind === 'wall' && pl.id === undefined) {
    const c = isleCell(bs, g.gx, g.gy);
    // 鼠标按着是在拖一排；没按着就是一格跟着鼠标走
    if (!(mouse && pl.mouseLine)) pl.lineFrom = c;
    setLine(bs, c.x, c.y);
    return;
  }
  setPlace(bs, Math.round(g.gx - pl.size / 2), Math.round(g.gy - pl.size / 2));
}

/** 虚影占地的屏幕框（新手引导在电脑上指它） */
export function ghostRect(bs: BaseScene): Rect | null {
  const pl = bs.place;
  if (!pl) return null;
  const pts = [iso(pl.x, pl.y), iso(pl.x + pl.size, pl.y), iso(pl.x + pl.size, pl.y + pl.size), iso(pl.x, pl.y + pl.size)].map((q) => bs.cc.toScreen(q.x, q.y));
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const top = bs.cc.toScreen(pl.ghost.x, pl.ghost.y - pl.ghost.displayHeight * pl.ghost.originY).y;
  const y0 = Math.min(top, ...ys);
  return { x: Math.min(...xs), y: y0, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - y0 };
}

/** 城墙的四邻 mask：上(x,y-1)=1、右(x+1,y)=2、下(x,y+1)=4、左(x-1,y)=8 */
export function wallMask(_bs: BaseScene, w: Placed): number {
  const has = (x: number, y: number): boolean => app.profile.base.buildings.some((q) => q.kind === 'wall' && q.x === x && q.y === y);
  return (has(w.x, w.y - 1) ? 1 : 0) | (has(w.x + 1, w.y) ? 2 : 0) | (has(w.x, w.y + 1) ? 4 : 0) | (has(w.x - 1, w.y) ? 8 : 0);
}

export function lineBegin(bs: BaseScene, wx: number, wy: number, mouse = false): void {
  const pl = bs.place!;
  const g = unIso(wx, wy - (mouse ? 0 : 36 / bs.cc.z));
  pl.lineFrom = isleCell(bs, g.gx, g.gy);
  setLine(bs, pl.lineFrom.x, pl.lineFrom.y);
}

/** 从起点拖到 (cx, cy)：取更长的那根轴画一排；合法的格子绿、不合法的红，费用实时显示 */
function setLine(bs: BaseScene, cx: number, cy: number): void {
  const pl = bs.place!;
  const f = pl.lineFrom ?? { x: cx, y: cy };
  const dx = cx - f.x;
  const dy = cy - f.y;
  const cells: Array<{ x: number; y: number }> = [];
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const n = Math.min(14, (horiz ? Math.abs(dx) : Math.abs(dy)) + 1);
  for (let i = 0; i < n; i++) cells.push(horiz ? { x: f.x + Math.sign(dx || 1) * i, y: f.y } : { x: f.x, y: f.y + Math.sign(dy || 1) * i });
  const lo = -bs.ext;
  const hi = ISLAND + bs.ext;
  const marked = cells.filter((c) => c.x >= lo && c.y >= lo && c.x < hi && c.y < hi).map((c) => ({ ...c, ok: canPlace(app.profile, 'wall', c.x, c.y) }));
  pl.lineCells = marked;
  pl.line = marked.filter((c) => c.ok);
  pl.ghost.setVisible(false);
  const g = pl.diamond.clear();
  for (const c of marked) {
    const pts = [iso(c.x, c.y), iso(c.x + 1, c.y), iso(c.x + 1, c.y + 1), iso(c.x, c.y + 1)].map(v2);
    g.fillStyle(c.ok ? 0x3fae52 : 0xd93b32, 0.5).lineStyle(2, c.ok ? 0xc9ffd2 : 0xffc2b8, 1).fillPoints(pts, true).strokePoints(pts, true);
  }
  const one = BUILDINGS.wall.levels[0]!.cost;
  const k = pl.line.length;
  pl.costEl?.replaceChildren(costRow({ gold: one.gold * k, wood: one.wood * k }, app.profile.res), document.createTextNode(` · ${k} 段`));
  const bad = marked.length - k;
  pl.why.textContent = k === 0 ? '这里放不下' : bad ? `${bad} 格压到了别的，跳过` : '这里能放';
  pl.why.className = `hd-place-why ${k === 0 ? 'bad' : 'ok'}`;
  pl.valid = k > 0;
  pl.ok.disabled = k === 0;
}

/** 手指拖动：虚影比手指高一截，免得被手指挡住 */
export function dragTo(bs: BaseScene, wx: number, wy: number): void {
  const pl = bs.place;
  if (!pl) return;
  pl.moved = true;
  const g = unIso(wx, wy - (pl.mouseLine ? 0 : 36 / bs.cc.z));
  if (pl.kind === 'wall' && pl.id === undefined) {
    const c = isleCell(bs, g.gx, g.gy);
    setLine(bs, c.x, c.y);
    return;
  }
  setPlace(bs, Math.round(g.gx - pl.size / 2), Math.round(g.gy - pl.size / 2));
}

/** 虚影挪到 (x0, y0)：每一格按能放 / 出界 / 压到建筑涂色，底栏写原因（位置没变就不重画） */
function setPlace(bs: BaseScene, x0: number, y0: number): void {
  const pl = bs.place!;
  const { x, y } = clampPlace(x0, y0, pl.size, bs.ext);
  if (pl.check && x === pl.x && y === pl.y) return;
  pl.x = x;
  pl.y = y;
  const c = (pl.check = placeCheck(app.profile.base.buildings, pl.kind, x, y, bs.ext, pl.id));
  pl.valid = canPlace(app.profile, pl.kind, x, y, pl.id);
  const f = footCenter(x, y, pl.size);
  const s = iso(f.gx, f.gy);
  pl.bx = s.x;
  pl.by = s.y;
  pl.ghost.setPosition(s.x, s.y);
  pl.ghost.setTint(pl.valid ? 0xffffff : 0xff9a8a);
  const g = pl.diamond.clear();
  for (const q of c.cells) {
    const pts = [iso(q.x, q.y), iso(q.x + 1, q.y), iso(q.x + 1, q.y + 1), iso(q.x, q.y + 1)].map(v2);
    const okc = q.s === 'ok';
    g.fillStyle(okc ? 0x3fae52 : 0xd93b32, okc ? 0.4 : 0.55).lineStyle(1.5, okc ? 0xc9ffd2 : 0xffc2b8, 0.9).fillPoints(pts, true).strokePoints(pts, true);
  }
  const pts = [iso(x, y), iso(x + pl.size, y), iso(x + pl.size, y + pl.size), iso(x, y + pl.size)].map(v2);
  g.lineStyle(3, pl.valid ? 0x2f8a40 : 0xa1241f, 1).strokePoints(pts, true);
  pl.why.textContent = placeReason(c);
  pl.why.className = `hd-place-why ${pl.valid ? 'ok' : 'bad'}`;
  pl.ok.disabled = !pl.valid;
}

export function confirmPlace(bs: BaseScene): void {
  const pl = bs.place;
  if (pl?.line && pl.kind === 'wall') {
    let prof = app.profile;
    let n = 0;
    let err = '';
    for (const c of pl.line) {
      const r = build(prof, 'wall', c.x, c.y);
      if (!r.ok) {
        err = r.error;
        break;
      }
      prof = r.value;
      n++;
    }
    if (n === 0) {
      sfx('error');
      pl.shake = 320;
      return toast(short(bs, err || 'blocked'));
    }
    const cells = pl.line.slice(0, n);
    cancelPlace(bs);
    app.commit(prof);
    sfx('build');
    bs.refresh();
    for (const c of cells) {
      const w = app.profile.base.buildings.find((b) => b.kind === 'wall' && b.x === c.x && b.y === c.y);
      const node = w && bs.nodes.get(w.id);
      if (node) bs.upfx.rise(node.img);
    }
    if (err) toast(`放了 ${n} 段，${short(bs, err)}`);
    return;
  }
  if (!pl) return;
  if (!pl.valid) {
    sfx('error');
    pl.shake = 320;
    return toast(pl.check ? placeReason(pl.check) : '这里放不下');
  }
  const r = pl.id === undefined ? build(app.profile, pl.kind, pl.x, pl.y) : move(app.profile, pl.id, pl.x, pl.y);
  if (!r.ok) return toast(short(bs, r.error, pl.id === undefined ? BUILDINGS[pl.kind].levels[0]?.cost : undefined));
  const { x, y, kind } = pl;
  const fresh = pl.id === undefined;
  cancelPlace(bs);
  app.commit(r.value);
  sfx(fresh ? buildSound(isBigBuilding(kind, BUILDINGS[kind].size)) : 'land');
  if (fresh) tutAdv(1);
  bs.refresh();
  const nb = app.profile.base.buildings.find((b) => b.kind === kind && b.x === x && b.y === y);
  const n = nb && bs.nodes.get(nb.id);
  if (n && nb && fresh && kind === 'wall') bs.upfx.rise(n.img);
  else if (n && nb && fresh) {
    const size = BUILDINGS[kind].size;
    bs.upfx.build(nb.id, { img: n.img, size, big: isBigBuilding(kind, size), top: () => topOf(bs, n) });
  } else if (n) bs.upfx.drop(n.img, BUILDINGS[kind].size);
}

export function cancelPlace(bs: BaseScene): void {
  const pl = bs.place;
  if (!pl) return;
  pl.ghost.destroy();
  pl.diamond.destroy();
  pl.float.remove();
  bs.placeBar?.remove();
  bs.placeBar = null;
  bs.place = null;
  bs.bottom.style.display = bs.sheet ? 'none' : '';
  bs.refresh();
  drawSel(bs);
}
