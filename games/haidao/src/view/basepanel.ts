import { intelButton } from './intelcard.ts';
import { DEFENSE_CARD_KINDS, defenseCard } from './intel.ts';
import type { BaseScene } from './BaseScene.ts';
import { BUILDINGS } from '../content/index.ts';
import { TD_TROPHIES, hqLevel, rankOf, tdChapterCleared, totalStars, upgradeCost, hasBranches, chooseBranch, upgrade, presetLayout, islandExt } from '../core/index.ts';
import type { Res, TroopKind, BuildingKind, Placed } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { hasAchievements, achievementList } from './meta.ts';
import { type ArtPiece, iconA, bArt, troopF } from './art.ts';
import { badgeArt } from './art/index.ts';
import { upgradable } from './dots.ts';
import { lackText, statDiff, costGap, withKey } from './basefeel.ts';
import { branchName, pendingTier, branchCards } from './td-ui.ts';
import { injectTdCss } from './tdcss.ts';
import { sfx } from './audio/sfx.ts';
import { rewardName } from './battlecommon.ts';
import { renderLayout } from './mini.ts';
import { tutAdv } from './tutorial.ts';
import { el, img, button, toast, paginate, confirmBox } from './ui.ts';
import { dismiss, removeNow } from './transitions.ts';
import { closeRing, closeCtx, drawSel, act, whyNot } from './basemenu.ts';
import { cancelPlace, startPlace } from './baseplace.ts';
import { SHORT } from './basecommon.ts';
import { focusPanel } from './basegeom.ts';
import { unlockBlock, researchList, doCollect, claimAll } from './baseupgrade.ts';
import { openMap } from './basenav.ts';
import { rankBlock } from './rankui.ts';
import { rankTitle } from './ranktext.ts';
import { shopSection } from './live.ts';

/** 个人面板：星数、主寨、成就和称号（顶栏只留金币木材主寨，其余收在这里） */
export function openProfile(bs: BaseScene): void {
  const p = app.profile;
  const { body } = openSheet(bs, '船长档案');
  const chips = el('div', 'hd-chips', undefined, body);
  const chip = (icon: ArtPiece, t: string): void => {
    const c = el('span', 'hd-chip', undefined, chips);
    c.appendChild(img(icon, 20));
    c.append(t);
  };
  chip(iconA('home'), `主寨 ${hqLevel(p)} 级`);
  chip(iconA('star'), `${totalStars(p)} 颗星`);
  if (hasAchievements()) chip(iconA('trophy'), `成就 ${p.achievements.length}/${achievementList().length}`);
  if (p.title) el('p', 'hd-desc', `当前称号：「${p.title}」`, body);
  if (rankOf(p) > 0) el('p', 'hd-desc hd-rank-title', rankTitle(rankOf(p)), body);
  if (tdChapterCleared(p.td?.stars ?? {}, 4)) el('p', 'hd-desc', '远洋通关：守岛第四章全部过关', body);
  if (hasAchievements()) {
    const row = el('div', 'hd-row', undefined, body);
    button('成就和称号', 'hd-btn-gold', () => openAchievements(bs, 'ach'), row);
    button('收藏', 'hd-btn-wood', () => openAchievements(bs, 'col'), row);
  }
}

export function reloadFromSave(bs: BaseScene): void {
  closeSheet(bs);
  closeRing(bs);
  cancelPlace(bs);
  bs.refresh();
}

/** instant：马上要在原位换新面板时传 true，不演离场 */
export function closeSheet(bs: BaseScene, instant = false): void {
  bs.ring?.close();
  closeCtx(bs);
  if (bs.sheet) (instant ? removeNow : dismiss)(bs.sheet);
  bs.sheet = null;
  bs.bottom.style.display = bs.place ? 'none' : '';
}

/** kind：面板是哪一种（'build'、'info:<建筑 id>'……），快捷键按它决定开还是关 */
export function openSheet(bs: BaseScene, title: string, kind = ''): { box: HTMLElement; body: HTMLElement } {
  const same = kind !== '' && bs.sheet?.dataset.kind === kind;
  closeSheet(bs, true);
  const box = el('div', 'hd-sheet', undefined, bs.ui);
  box.dataset.kind = kind;
  // 同一种面板原地刷新（升级后重画等）不重演进场
  if (same) box.classList.add('hd-nofx');
  const head = el('div', 'hd-head', undefined, box);
  el('h2', '', title, head);
  button('×', 'hd-x', () => closeSheet(bs), head).title = '关闭（Esc）';
  bs.sheet = box;
  bs.bottom.style.display = 'none';
  return { box, body: el('div', 'hd-sbody', undefined, box) };
}

export function short(_bs: BaseScene, code: string, need?: Res): string {
  if (need && (code === 'no_gold' || code === 'no_wood')) {
    const t = lackText(need, app.profile.res);
    if (t) return t;
  }
  return SHORT[code] ?? '现在做不了';
}

// ---- 建筑信息 / 升级：左栏大立绘和"这一级 → 下一级"对比，右栏数值"当前 → 下一级 +差值"、花费、大升级钮；竖屏两栏变上下
export function openInfo(bs: BaseScene, id: number): void {
  const p = app.profile;
  const b = p.base.buildings.find((q) => q.id === id);
  if (!b) return;
  const def = BUILDINGS[b.kind];
  const { box, body } = openSheet(bs, `${def.name}  ${b.level} 级`, `info:${id}`);
  // 防御的介绍卡片：钮放在标题栏 × 左边（放在内容里会把手机横屏的面板顶出一屏）
  if (DEFENSE_CARD_KINDS.includes(b.kind)) {
    const head = box.querySelector<HTMLElement>('.hd-head')!;
    head.insertBefore(intelButton('i 介绍', () => defenseCard(b.kind, b.level), head), head.querySelector('.hd-x'));
  }
  // 面板内容在这个函数里填完，量高度要等它返回
  queueMicrotask(() => {
    if (bs.sheet === box) focusPanel(bs, id);
  });
  bs.sel = id;
  drawSel(bs);
  if (b.kind === 'hq') tutAdv(2);
  const cost = upgradeCost(b.kind, b.level);
  const up = el('div', `hd-up${cost ? '' : ' max'}`, undefined, body);
  upArt(up, b.kind, b.level, !!cost);
  const side = el('div', 'hd-up-side', undefined, up);
  el('p', 'hd-desc', def.desc, side);
  const chips = el('div', 'hd-chips', undefined, side);
  if (!cost && def.maxLevel > 1) el('span', 'hd-chip hd-up-max', '已满级', chips);
  statTable(side, b.kind, b.level);
  if (cost) upBox(bs, side, b, cost);
  // 其余内容（主寨的解锁预告和王阶、塔的分叉、军械所的研究）收在一块：电脑在两栏下面（军械所在右边），手机横屏在右边一栏
  const more = el('div', 'hd-up-more', undefined, body);
  if (b.kind === 'hq') {
    unlockBlock(bs, more);
    rankBlock(bs, more, () => openInfo(bs, id));
  }
  if (hasBranches(b.kind)) {
    injectTdCss();
    // 塔的分叉（3 级、6 级各选一次）：守岛全额生效，攻防里打折（DESIGN 10.6）
    const cur = b.branch ?? [];
    for (const bid of cur) el('span', 'hd-chip', `路线：${branchName(bid)}`, chips);
    if (pendingTier(b.kind, b.level, cur)) {
      branchCards(more, b.kind, b.level, cur, (bid) => {
        const r = chooseBranch(app.profile, id, bid);
        if (!r.ok) return toast('现在不能选这条路线');
        app.commit(r.value);
        sfx('upgrade');
        openInfo(bs, id);
      });
    }
    el('p', 'hd-td-note', '守岛全额生效；别人来打你时效果打折，防空、穿甲、灯塔不起作用', more);
  }
  const pageResearch = b.kind === 'armory' ? researchList(bs, more, b.id) : null;
  if (!more.childElementCount) more.remove();
  footRow(bs, box, body, b);
  pageResearch?.();
}

/** 左栏：当前等级的大立绘；能升级时下面一排"N 级 → N+1 级"两张小图（下一级带金光） */
function upArt(parent: HTMLElement, kind: BuildingKind, level: number, canUp: boolean): void {
  const art = el('div', 'hd-up-art', undefined, parent);
  el('div', 'hd-up-big', undefined, art).appendChild(img(bArt(kind, level), 150));
  if (!canUp) return;
  const hero = el('div', 'hd-uphero', undefined, art);
  const look = (lv: number, cls: string): void => {
    const c = el('div', `hd-uplook ${cls}`, undefined, hero);
    el('div', 'hd-uppic', undefined, c).appendChild(img(bArt(kind, lv), 56));
    el('span', '', `${lv} 级`, c);
  };
  look(level, 'cur');
  el('span', 'hd-uparrow', '➜', hero);
  look(level + 1, 'next');
}

/** 数值表：名称 | 当前 | → | 下一级 | +差值（满级只有名称和当前） */
function statTable(parent: HTMLElement, kind: BuildingKind, level: number): void {
  const rows = statDiff(kind, level);
  if (!rows.length) return;
  const tbl = el('div', 'hd-stats', undefined, parent);
  for (const r of rows) {
    const row = el('div', 'hd-stat', undefined, tbl);
    el('span', 'hd-stat-k', r.label, row);
    el('b', 'hd-stat-v hd-n', `${fmt(r.cur)}${r.unit}`, row);
    if (r.next === null) continue;
    el('span', 'hd-stat-a', '→', row);
    el('b', 'hd-stat-n hd-n', `${fmt(r.next)}${r.unit}`, row);
    el('span', `hd-stat-d hd-n hd-pos${r.delta > 0 ? '' : ' zero'}`, r.delta > 0 ? `+${fmt(r.delta)}` : '', row);
  }
}

/** 花费和大升级钮：每项写够不够，不够的标红写还差多少；升不起时按钮灰着写原因，缺星或缺资源给去拿的入口 */
function upBox(bs: BaseScene, parent: HTMLElement, b: Placed, cost: Res): void {
  const p = app.profile;
  const id = b.id;
  const box = el('div', 'hd-upbox', undefined, parent);
  const costs = el('div', 'hd-upcost', undefined, box);
  el('span', 'hd-upcost-k', '升级花费', costs);
  for (const c of costGap(cost, p.res)) {
    const it = el('span', `hd-upcost-i${c.short > 0 ? ' short' : ''}`, undefined, costs);
    it.appendChild(img(iconA(c.k), 22));
    el('b', 'hd-n', fmt(c.need), it);
    if (c.short > 0) el('small', '', `还差 ${fmt(c.short)}`, it);
  }
  const r = upgrade(p, id);
  const up = button('', 'hd-btn-gold hd-upbtn', () => act(bs, 'upgrade', id, () => openInfo(bs, id)), box, 'confirm');
  up.title = withKey('升级', 'upgrade');
  if (r.ok) {
    up.appendChild(img(iconA('hammer'), 26));
    el('span', '', `升到 ${b.level + 1} 级`, up);
    return;
  }
  up.disabled = true;
  el('span', '', whyNot(bs, b, r.error, cost), up);
  // 矿里攒着的够补上差额才叫先收，否则金币和星都在出海拿；木材只能靠伐木场收
  const stored = (kind: 'goldmine' | 'sawmill'): number => p.base.buildings.filter((q) => q.kind === kind).reduce((a, q) => a + Math.floor(q.stored ?? 0), 0);
  const lackG = cost.gold > p.res.gold;
  const lackW = cost.wood > p.res.wood;
  const collectThen = (): void => {
    claimAll(bs, false);
    openInfo(bs, id);
  };
  let go: [string, () => void] | null = null;
  if (r.error === 'need_stars') go = ['去出海打关拿星', () => openMap(bs)];
  else if (lackG && stored('goldmine') >= cost.gold - p.res.gold) go = [`先收金矿里攒的 ${fmt(stored('goldmine'))}`, collectThen];
  else if (lackG) go = ['去出海抢金币', () => openMap(bs)];
  else if (lackW && stored('sawmill') >= cost.wood - p.res.wood) go = [`先收伐木场里攒的 ${fmt(stored('sawmill'))}`, collectThen];
  if (go) button(go[0], 'hd-btn-wood hd-upgo', go[1], box);
}

/**
 * 收取、移动挂在标题栏（关闭钮左边），面板底只剩"接着升"：还有别的现在升得起的，直接换过去，不用退回建造列表再找。
 * 标题栏本来就有一行高，放进去不占内容的高度，手机上整块面板才一屏放得下
 */
function footRow(bs: BaseScene, box: HTMLElement, body: HTMLElement, b: Placed): void {
  const p = app.profile;
  const id = b.id;
  const head = box.querySelector<HTMLElement>('.hd-head')!;
  const x = head.querySelector('.hd-x');
  const acts = el('div', 'hd-up-acts');
  head.insertBefore(acts, x);
  const stored = Math.floor(b.stored ?? 0);
  if ((b.kind === 'goldmine' || b.kind === 'sawmill') && stored >= 1) {
    button(`收取 ${fmt(stored)}`, 'hd-btn-gold', () => {
      doCollect(bs, id);
      openInfo(bs, id);
    }, acts).title = '收取（C 一次收全部）';
  }
  button('移动', 'hd-btn-wood', () => startPlace(bs, b.kind, id), acts).title = withKey('移动', 'move');
  const next = upgradable(p).map((q) => p.base.buildings.find((x) => x.id === q)!).filter((x) => x.id !== id && x.kind !== 'wall').slice(0, 3);
  if (!next.length) return;
  const chips = el('div', 'hd-chips hd-nextup hd-up-foot', undefined, body);
  el('span', 'hd-nextup-k', '接着升', chips);
  for (const q of next) button(`${BUILDINGS[q.kind].name} ${q.level}→${q.level + 1}`, 'hd-btn-gold hd-upchip', () => openInfo(bs, q.id), chips);
}

/** 成就面板：列表、已得/未得、挑一个称号显示在顶栏 */
function openAchievements(bs: BaseScene, tab: 'ach' | 'col' = 'ach'): void {
  const p = app.profile;
  const list = achievementList();
  const { body } = openSheet(bs, tab === 'col' ? '收藏' : `成就 ${p.achievements.length}/${list.length}`);
  const tabs = el('div', 'hd-tabs', undefined, body);
  button('成就', tab === 'ach' ? 'hd-btn-gold' : 'hd-btn-plain', () => openAchievements(bs, 'ach'), tabs);
  button('收藏', tab === 'col' ? 'hd-btn-gold' : 'hd-btn-plain', () => openAchievements(bs, 'col'), tabs);
  if (tab === 'col') return collection(bs, body);
  el('p', 'hd-desc', '完成成就拿徽章；有称号的成就，点“佩戴”就能挂在顶栏。', body);
  const rows: HTMLElement[] = [];
  for (const a of list) {
    const got = p.achievements.includes(a.id);
    const row = el('div', `hd-ach${got ? '' : ' off'}`, undefined, body);
    rows.push(row);
    row.appendChild(img(badgeArt(a.tier), 46));
    const t = el('div', 'hd-at', undefined, row);
    el('b', '', a.name, t);
    el('small', '', got ? a.desc : `${a.desc}（还没达成）`, t);
    if (got && a.title) {
      const wearing = p.title === a.title;
      button(wearing ? '已佩戴' : `佩戴「${a.title}」`, wearing ? 'hd-btn-gold' : 'hd-btn-plain', () => {
        app.commit({ ...app.profile, title: wearing ? undefined : a.title });
        bs.refresh();
        openAchievements(bs);
      }, row);
    }
  }
  // 成就多，一页放不下：翻页
  if (rows.length && bs.sheet) paginate(bs.sheet, rows, rows[rows.length - 1]!);
}

/** 收藏页：皮肤（可装备）和装饰（可摆放） */
export function collection(bs: BaseScene, body: HTMLElement): void {
  const p = app.profile;
  const own = p.cosmetics ?? [];
  const skins = own.filter((c) => c.startsWith('skin:'));
  const decos = own.filter((c) => c.startsWith('deco:'));
  el('p', 'hd-desc', '打赢关卡有几率掉落皮肤和装饰；首领岛首次三星必掉一件。守岛每一章全部过关，送一件会动的装饰。', body);
  const first = body.children.length;
  el('b', '', `兵种皮肤 ${skins.length}`, body);
  if (!skins.length) el('p', 'hd-sub', '还没有皮肤。', body);
  for (const id of skins) {
    const [, kind, name] = id.split(':') as [string, TroopKind, string];
    const row = el('div', 'hd-ach', undefined, body);
    try {
      row.appendChild(img(troopF(kind, 'idle', name)[0]!, 46));
    } catch {
      // 没有这张图就只显示文字
    }
    const t = el('div', 'hd-at', undefined, row);
    el('b', '', rewardName(id), t);
    const on = p.skins?.[kind] === name;
    button(on ? '已装备（点一下卸下）' : '装备', on ? 'hd-btn-gold' : 'hd-btn-plain', () => {
      const skinsNow = { ...(app.profile.skins ?? {}) };
      if (on) delete skinsNow[kind];
      else skinsNow[kind] = name;
      app.commit({ ...app.profile, skins: skinsNow });
      openAchievements(bs, 'col');
    }, row);
  }
  el('b', '', `岛上装饰 ${decos.length}`, body);
  for (const id of decos) {
    const kind = id.split(':')[1] as BuildingKind;
    const row = el('div', 'hd-ach', undefined, body);
    try {
      row.appendChild(img(bArt(kind, 1), 46));
    } catch {
      // 没有这张图就只显示文字
    }
    const t = el('div', 'hd-at', undefined, row);
    el('b', '', rewardName(id), t);
    const placed = p.base.buildings.some((q) => q.kind === kind);
    button(placed ? '再摆一个' : '摆到岛上', 'hd-btn-gold', () => startPlace(bs, kind), row);
  }
  // 还没拿到的章节纪念：灰着排在后面，写清怎么拿
  for (const [ch, id] of Object.entries(TD_TROPHIES)) {
    if (own.includes(id)) continue;
    const kind = id.split(':')[1] as BuildingKind;
    const row = el('div', 'hd-ach off', undefined, body);
    row.appendChild(img(bArt(kind, 1), 46));
    const t = el('div', 'hd-at', undefined, row);
    el('b', '', rewardName(id), t);
    el('small', '', `守岛第 ${ch} 章全部过关得到（每关至少 1 星）`, t);
  }
  // 掉宝池里还没有的，可以用筹码买（登录、有钱包时才有）
  shopSection(body, rewardName, (id) => {
    const [kind, a, b] = id.split(':') as [string, string, string];
    try {
      return kind === 'skin' ? img(troopF(a as TroopKind, 'idle', b)[0]!, 46) : img(bArt(a as BuildingKind, 1), 46);
    } catch {
      return null;
    }
  }, () => openAchievements(bs, 'col'));
  const items = [...body.children].slice(first) as HTMLElement[];
  if (items.length && bs.sheet) paginate(bs.sheet, items, items[items.length - 1]!);
}

/** 推荐布局：三套摆法的预览，选一套确认后一键换 */
export function openPresets(bs: BaseScene): void {
  const p = app.profile;
  const { body } = openSheet(bs, '推荐布局');
  el('p', 'hd-desc', '把现有的建筑按一种思路重新摆一遍（建筑和资源都不变，只换位置）。', body);
  const styles: Array<['turtle' | 'spread' | 'trap', string, string]> = [
    ['turtle', '龟壳阵', '城墙围一圈，防御挤在里面互相掩护。'],
    ['spread', '分散阵', '防御铺开，不怕被一炮端；墙只立几段。'],
    ['trap', '陷阱阵', '墙圈留个缺口，缺口里埋地雷和焦油。'],
  ];
  const boxes: HTMLElement[] = [];
  const draws: Array<() => void> = [];
  for (const [style, name, desc] of styles) {
    const box = el('div', 'hd-preset', undefined, body);
    boxes.push(box);
    el('b', '', name, box);
    el('span', 'hd-sub', desc, box);
    const host = el('div', 'hd-preset-map', undefined, box);
    const layout = presetLayout(p, style);
    // 预览按框的实际大小画：翻页藏起来的框量不到尺寸，翻到时再画
    const draw = (): void => {
      if (host.isConnected && host.clientWidth > 0) renderLayout(host, layout, islandExt(p.base.buildings), { interactive: false });
    };
    draws.push(draw);
    button('用这套', 'hd-btn-gold', () => {
      confirmBox(`换成「${name}」？建筑会重新摆位置，随时可以再换。`, '换', () => {
        app.commit({ ...app.profile, base: { ...app.profile.base, buildings: layout } });
        closeSheet(bs);
        bs.refresh();
        toast(`已换成${name}`);
      });
    }, box).disabled = layout.length === 0;
  }
  // 三套放不下一屏就翻页（不滚动）
  const redraw = (): void => draws.forEach((d) => d());
  if (bs.sheet) paginate(bs.sheet, boxes, boxes[boxes.length - 1]!, null, redraw);
  redraw();
  requestAnimationFrame(redraw);
}
