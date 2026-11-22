import type { BaseScene } from './BaseScene.ts';
import { BUILDINGS } from '../content/index.ts';
import { upgradeCost, upgrade } from '../core/index.ts';
import type { Placed, Res } from '../core/types.ts';
import { app } from './app.ts';
import { type MenuItem, buildingMenu, menuPos, type BaseKeyAction } from './basefeel.ts';
import { type RingItem, RING_ICON } from './ringmenu.ts';
import { iso } from './iso.ts';
import { sfx } from './audio/sfx.ts';
import { toast, el, button, costRow, modalOpen } from './ui.ts';
import { starText, doUpgrade, doCollect, claimAll } from './baseupgrade.ts';
import { short, openInfo, closeSheet } from './basepanel.ts';
import { startPlace, cancelPlace, buildingAt, openBuild } from './baseplace.ts';
import { measureSafe, centerOf, topOf } from './basegeom.ts';
import { v2 } from './basecommon.ts';
import { openTraining, trainDot } from './training.ts';

// ---- 建筑的操作：手机点建筑弹操作环，电脑右键弹菜单；两边的项都来自 basefeel.ts 的 buildingMenu

/** 这座建筑现在能做的操作（升级不了时带原因） */
function menuFor(bs: BaseScene, id: number): MenuItem[] {
  const b = app.profile.base.buildings.find((q) => q.id === id);
  if (!b) return [];
  const cost = upgradeCost(b.kind, b.level);
  const r = cost ? upgrade(app.profile, id) : null;
  const up = r ? (r.ok ? { ok: true as const } : { ok: false as const, why: whyNot(bs, b, r.error, cost!) }) : null;
  return buildingMenu(b.kind, b.level, b.stored ?? 0, up, cost).map((m) => (m.id === 'train' ? { ...m, dot: trainDot() } : m));
}

/** 操作环灰钮下的短原因：钮只有 48 宽，整句放不下，点了还有整句的提示 */
function ringTag(why: string | undefined): string | undefined {
  if (!why) return undefined;
  const stars = /还差 (\d+) 颗星/.exec(why);
  if (stars) return `差 ${stars[1]} 星`;
  const gold = why.includes('金币');
  const wood = why.includes('木材');
  return gold && wood ? '缺资源' : gold ? '缺金币' : wood ? '缺木材' : undefined;
}

/** 升级不了的一句话 */
export function whyNot(bs: BaseScene, b: Placed, code: string, cost: Res): string {
  return code === 'need_stars' ? starText(bs, b) : short(bs, code, cost);
}

/** 执行一项操作（操作环、右键菜单、快捷键共用）；after 在升级 / 收集之后调（重开环或面板） */
export function act(bs: BaseScene, what: MenuItem['id'], id: number, after?: () => void): void {
  const b = app.profile.base.buildings.find((q) => q.id === id);
  if (!b) return;
  bs.sel = id;
  drawSel(bs);
  if (what === 'upgrade') {
    const m = menuFor(bs, id).find((x) => x.id === 'upgrade');
    if (!m) return toast(`${BUILDINGS[b.kind].name}已经是最高级`);
    if (m.off) {
      sfx('error');
      return toast(`升级：${m.why ?? '现在做不了'}`);
    }
    doUpgrade(bs, id, false);
    after?.();
  } else if (what === 'info') {
    closeRing(bs);
    openInfo(bs, id);
  } else if (what === 'train') {
    closeRing(bs);
    openTraining();
  } else if (what === 'collect') {
    doCollect(bs, id);
    after?.();
  } else {
    closeRing(bs);
    startPlace(bs, b.kind, id);
  }
}

export function openRing(bs: BaseScene, id: number): void {
  const b = app.profile.base.buildings.find((q) => q.id === id);
  if (!b) return;
  closeSheet(bs);
  measureSafe(bs);
  bs.sel = id;
  drawSel(bs);
  const items: RingItem[] = menuFor(bs, id).map((m) => ({
    id: m.id, label: m.label, icon: RING_ICON[m.id], off: m.off, dot: m.dot, tag: m.off ? ringTag(m.why) : undefined,
    onTap: () => act(bs, m.id, id, () => openRing(bs, id)),
  }));
  bs.ring.open(id, items);
  const n = bs.nodes.get(id);
  if (n) {
    const c = centerOf(bs, n);
    const sp = bs.cc.toScreen(c.x, c.y);
    bs.ring.follow(sp.x - bs.off.x, sp.y - bs.off.y);
  }
}

export function closeRing(bs: BaseScene): void {
  bs.ring.close();
}

/** 电脑右键：在建筑上弹菜单（贴着鼠标），空白处取消选择；摆放中就是取消摆放 */
export function right(bs: BaseScene, wx: number, wy: number, sx: number, sy: number): void {
  bs.touch = false;
  if (bs.place) return cancelPlace(bs);
  const hit = buildingAt(bs, wx, wy);
  if (hit === null) {
    closeCtx(bs);
    closeRing(bs);
    bs.sel = null;
    drawSel(bs);
    return closeSheet(bs);
  }
  openCtx(bs, hit, sx, sy);
}

/** 右键菜单：竖排，升级（带花费）、信息、收集、移动，每项右边写快捷键 */
function openCtx(bs: BaseScene, id: number, sx: number, sy: number): void {
  const b = app.profile.base.buildings.find((q) => q.id === id);
  if (!b) return;
  closeCtx(bs);
  closeRing(bs);
  measureSafe(bs);
  bs.sel = id;
  drawSel(bs);
  const box = el('div', 'hd-ctxmenu', undefined, bs.ui);
  el('div', 'hd-ctxhead', `${BUILDINGS[b.kind].name} · ${b.level} 级`, box);
  for (const m of menuFor(bs, id)) {
    const it = button('', `hd-ctxitem${m.off ? ' off' : ''}${m.id === 'upgrade' ? ' up' : ''}`, () => {
      closeCtx(bs);
      act(bs, m.id, id);
    }, box, m.off ? null : 'tap');
    it.dataset.ctx = m.id;
    const ic = el('span', 'hd-ctxic', undefined, it);
    ic.innerHTML = RING_ICON[m.id];
    el('span', 'hd-ctxlb', m.label, it);
    // 升不起时直接写原因（不用悬停才看到），升得起写花费
    if (m.off && m.why) el('small', 'hd-ctxwhy', m.why, it);
    else if (m.cost) it.appendChild(costRow(m.cost, app.profile.res));
    el('kbd', 'hd-ctxkey', m.key, it);
    it.title = m.off && m.why ? `${m.label}：${m.why}` : `${m.label}（${m.key}）`;
    if (m.dot) el('i', 'hd-dot', undefined, it);
  }
  const r = box.getBoundingClientRect();
  const p = menuPos(sx - bs.off.x, sy - bs.off.y, r.width, r.height, bs.safe);
  box.style.left = `${Math.round(p.x)}px`;
  box.style.top = `${Math.round(p.y)}px`;
  bs.ctx = box;
  // 点菜单外面任何地方（顶栏、底栏、画面）都收起；画面上的点按另外在 tap 里处理
  const off = (e: PointerEvent): void => {
    if (!(e.target instanceof Element && box.contains(e.target))) closeCtx(bs);
  };
  window.addEventListener('pointerdown', off, true);
  const wheel = (): void => closeCtx(bs);
  window.addEventListener('wheel', wheel, { passive: true });
  bs.ctxOff = () => {
    window.removeEventListener('pointerdown', off, true);
    window.removeEventListener('wheel', wheel);
  };
}

export function closeCtx(bs: BaseScene): void {
  bs.ctx?.remove();
  bs.ctx = null;
  bs.ctxOff?.();
  bs.ctxOff = null;
}

/** 有弹窗（确认框、庆祝、徽章）挡着时快捷键不动作 */
export function modal(_bs: BaseScene): boolean {
  return modalOpen();
}

/** Esc：弹窗开着时已由 ui.ts 的 openModal 接走（到不了这里）；否则先收右键菜单，再取消摆放，再关面板 / 操作环，最后取消选择 */
export function escapeKey(bs: BaseScene): void {
  if (bs.stopMap || modal(bs)) return;
  if (bs.ctx) return closeCtx(bs);
  if (bs.place) return cancelPlace(bs);
  if (bs.sheet || bs.ring.isOpen) {
    closeRing(bs);
    return closeSheet(bs);
  }
  bs.sel = null;
  drawSel(bs);
}

/** 快捷键作用的建筑：选中的，没有就是鼠标下面那座 */
function focusId(bs: BaseScene): number | null {
  const ids = new Set(app.profile.base.buildings.map((b) => b.id));
  for (const id of [bs.sel, bs.ring.owner, bs.hoverId]) if (id !== null && ids.has(id)) return id;
  return null;
}

export function keyAct(bs: BaseScene, a: BaseKeyAction): void {
  if (bs.stopMap || modal(bs) || bs.place) return;
  bs.touch = false;
  if (a === 'build') {
    if (bs.sheet?.dataset.kind === 'build') closeSheet(bs);
    else openBuild(bs);
    return;
  }
  if (a === 'collectAll') return claimAll(bs);
  if (a === 'train') return openTraining();
  const id = focusId(bs);
  if (id === null) return toast('先点一座建筑');
  closeCtx(bs);
  const infoOpen = bs.sheet?.dataset.kind === `info:${id}`;
  if (a === 'upgrade') act(bs, 'upgrade', id, () => (infoOpen ? openInfo(bs, id) : bs.ring.owner === id ? openRing(bs, id) : undefined));
  else if (a === 'info') act(bs, 'info', id);
  else if (a === 'move') act(bs, 'move', id);
}

/** 选中的建筑：占地一圈细金边（和悬停的粗金边区分） */
export function drawSel(bs: BaseScene): void {
  const g = bs.selG;
  g.clear();
  const b = bs.sel === null ? undefined : app.profile.base.buildings.find((q) => q.id === bs.sel);
  if (!b || bs.place) return;
  const sz = BUILDINGS[b.kind].size;
  const pts = [iso(b.x, b.y), iso(b.x + sz, b.y), iso(b.x + sz, b.y + sz), iso(b.x, b.y + sz)].map(v2);
  g.lineStyle(5, 0x2b1a15, 0.55).strokePoints(pts, true).lineStyle(2.5, 0xfff2b0, 1).strokePoints(pts, true);
}

/** 悬停名牌：名字 + 等级 + 能升级的小箭头，贴在建筑顶上，每帧跟着镜头走；内容隔一阵才重算 */
export function plateFrame(bs: BaseScene, time: number): void {
  const id = bs.hoverId;
  const n = id === null ? undefined : bs.nodes.get(id);
  const b = id === null ? undefined : app.profile.base.buildings.find((q) => q.id === id);
  if (!n || !b || bs.place || bs.ctx) {
    bs.plate.classList.remove('on');
    return;
  }
  if (time - bs.lastSafe > 400) measureSafe(bs, time);
  if (time - bs.plateAt > 250) {
    bs.plateAt = time;
    const can = !!upgradeCost(b.kind, b.level) && upgrade(app.profile, b.id).ok;
    const sig = `${b.id}:${b.level}:${can}`;
    if (sig !== bs.plateSig) {
      bs.plateSig = sig;
      bs.plate.replaceChildren();
      el('b', '', BUILDINGS[b.kind].name, bs.plate);
      el('span', 'hd-np-lv', `${b.level} 级`, bs.plate);
      if (can) el('i', 'hd-np-up', '▲', bs.plate).title = '能升级';
    }
  }
  const top = bs.cc.toScreen(n.img.x, topOf(bs, n));
  bs.plate.style.transform = `translate(${Math.round(top.x - bs.off.x)}px,${Math.round(top.y - bs.off.y - 8)}px) translate(-50%,-100%)`;
  bs.plate.classList.add('on');
}
