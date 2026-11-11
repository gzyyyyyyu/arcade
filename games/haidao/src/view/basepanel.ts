import type { BaseScene } from './BaseScene.ts';
import { BUILDINGS } from '../content/index.ts';
import { hqLevel, rankOf, totalStars, upgradeCost, hasBranches, chooseBranch, upgrade, presetLayout } from '../core/index.ts';
import type { Res, TroopKind, BuildingKind } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { hasAchievements, achievementList } from './meta.ts';
import { type ArtPiece, iconA, bArt, troopF } from './art.ts';
import { badgeArt } from './art/index.ts';
import { upgradable } from './dots.ts';
import { lackText, statDiff, costGap, withKey } from './basefeel.ts';
import { injectTdCss, branchName, pendingTier, branchCards } from './td-ui.ts';
import { sfx } from './audio/sfx.ts';
import { rewardName } from './battlecommon.ts';
import { renderLayout } from './mini.ts';
import { tutAdv } from './tutorial.ts';
import { el, img, button, toast, paginate, confirmBox } from './ui.ts';
import { dismiss, removeNow } from './transitions.ts';
import { closeRing, closeCtx, drawSel, act, whyNot, collectAll } from './basemenu.ts';
import { cancelPlace, startPlace } from './baseplace.ts';
import { SHORT } from './basecommon.ts';
import { focusPanel } from './basegeom.ts';
import { unlockBlock, researchList, doCollect } from './baseupgrade.ts';
import { openMap } from './basenav.ts';
import { rankBlock } from './rankui.ts';
import { rankTitle } from './ranktext.ts';

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

// ---- 建筑信息：现在和下一级的样子、每项数值"当前 → 下一级"、花费差多少、一个大升级钮
export function openInfo(bs: BaseScene, id: number): void {
  const p = app.profile;
  const b = p.base.buildings.find((q) => q.id === id);
  if (!b) return;
  const def = BUILDINGS[b.kind];
  const { box, body } = openSheet(bs, `${def.name}  ${b.level} 级`, `info:${id}`);
  // 面板内容在这个函数里填完，量高度要等它返回
  queueMicrotask(() => {
    if (bs.sheet === box) focusPanel(bs, id);
  });
  bs.sel = id;
  drawSel(bs);
  if (b.kind === 'hq') tutAdv(2);
  el('p', 'hd-desc', def.desc, body);
  const cost = upgradeCost(b.kind, b.level);
  const rows = statDiff(b.kind, b.level);
  if (cost) {
    // 外观：这一级 → 下一级（下一级的图带金光，一眼看出变成什么样）
    const hero = el('div', 'hd-uphero', undefined, body);
    const look = (lv: number, cls: string): void => {
      const c = el('div', `hd-uplook ${cls}`, undefined, hero);
      el('div', 'hd-uppic', undefined, c).appendChild(img(bArt(b.kind, lv), 72));
      el('span', '', `${lv} 级`, c);
    };
    look(b.level, 'cur');
    el('span', 'hd-uparrow', '➜', hero);
    look(b.level + 1, 'next');
  }
  if (rows.length) {
    const tbl = el('div', 'hd-stats', undefined, body);
    for (const r of rows) {
      const row = el('div', 'hd-stat', undefined, tbl);
      el('span', 'hd-stat-k', r.label, row);
      el('b', 'hd-stat-v', `${fmt(r.cur)}${r.unit}`, row);
      if (r.next !== null) {
        el('span', 'hd-stat-a', '→', row);
        el('b', 'hd-stat-n', `${fmt(r.next)}${r.unit}`, row);
        el('span', `hd-stat-d${r.delta > 0 ? '' : ' zero'}`, r.delta > 0 ? `+${fmt(r.delta)}` : '', row);
      }
    }
  }
  const chips = el('div', 'hd-chips', undefined, body);
  if (!cost && def.maxLevel > 1) el('span', 'hd-chip', '已满级', chips);
  if (b.kind === 'hq') {
    unlockBlock(bs, body);
    rankBlock(bs, body, () => openInfo(bs, id));
  }
  if (hasBranches(b.kind)) {
    injectTdCss();
    // 塔的分叉（3 级、6 级各选一次）：守岛全额生效，攻防里打折（DESIGN 10.6）
    const cur = b.branch ?? [];
    for (const bid of cur) el('span', 'hd-chip', `路线：${branchName(bid)}`, chips);
    if (pendingTier(b.kind, b.level, cur)) {
      branchCards(body, b.kind, b.level, cur, (bid) => {
        const r = chooseBranch(app.profile, id, bid);
        if (!r.ok) return toast('现在不能选这条路线');
        app.commit(r.value);
        sfx('upgrade');
        openInfo(bs, id);
      });
    }
    el('p', 'hd-td-note', '守岛全额生效；别人来打你时效果打折，防空、穿甲、灯塔不起作用', body);
  }
  if (b.kind === 'armory') researchList(bs, body, b.id);
  if (cost) {
    // 花费：每项写够不够，不够的标红写差多少；按钮大而醒目，升不起时写原因
    const box = el('div', 'hd-upbox', undefined, body);
    const costs = el('div', 'hd-upcost', undefined, box);
    el('span', 'hd-upcost-k', '升级花费', costs);
    for (const c of costGap(cost, p.res)) {
      const it = el('span', `hd-upcost-i${c.short > 0 ? ' short' : ''}`, undefined, costs);
      it.appendChild(img(iconA(c.k), 22));
      el('b', '', fmt(c.need), it);
      if (c.short > 0) el('small', '', `差 ${fmt(c.short)}`, it);
    }
    const r = upgrade(p, id);
    const up = button('', 'hd-btn-gold hd-upbtn', () => act(bs, 'upgrade', id, () => openInfo(bs, id)), box, 'confirm');
    up.title = withKey('升级', 'upgrade');
    if (r.ok) {
      up.appendChild(img(iconA('hammer'), 26));
      el('span', '', `升到 ${b.level + 1} 级`, up);
    } else {
      up.disabled = true;
      el('span', '', whyNot(bs, b, r.error, cost), up);
      // 缺星或缺资源：直接给去拿的入口。矿里攒着的够补上差额才叫先收，否则金币和星都在出海拿；木材只能靠伐木场收
      const stored = (kind: 'goldmine' | 'sawmill'): number => p.base.buildings.filter((q) => q.kind === kind).reduce((a, q) => a + Math.floor(q.stored ?? 0), 0);
      const lackG = cost.gold > p.res.gold;
      const lackW = cost.wood > p.res.wood;
      let label = '';
      let run: (() => void) | null = null;
      if (r.error === 'need_stars') {
        label = '去出海打关拿星';
        run = () => openMap(bs);
      } else if (lackG && stored('goldmine') >= cost.gold - p.res.gold) {
        label = `先收金矿里攒的 ${fmt(stored('goldmine'))}`;
        run = () => {
          collectAll(bs);
          openInfo(bs, id);
        };
      } else if (lackG) {
        label = '去出海抢金币';
        run = () => openMap(bs);
      } else if (lackW && stored('sawmill') >= cost.wood - p.res.wood) {
        label = `先收伐木场里攒的 ${fmt(stored('sawmill'))}`;
        run = () => {
          collectAll(bs);
          openInfo(bs, id);
        };
      }
      if (run) {
        const go = button(label, 'hd-btn-wood hd-upgo', run, box);
        go.style.cssText += ';width:100%;margin-top:8px;min-height:44px';
      }
    }
  }
  const row = el('div', 'hd-row', undefined, body);
  const stored = Math.floor(b.stored ?? 0);
  if ((b.kind === 'goldmine' || b.kind === 'sawmill') && stored >= 1) {
    button(`收取 ${fmt(stored)}`, 'hd-btn-gold', () => {
      doCollect(bs, id);
      openInfo(bs, id);
    }, row).title = '收取（C 一次收全部）';
  }
  button('移动', 'hd-btn-wood', () => startPlace(bs, b.kind, id), row).title = withKey('移动', 'move');
  // 接着升：还有别的现在升得起的，直接在这里换过去，不用退回建造列表再找一遍
  const next = upgradable(p).map((q) => p.base.buildings.find((x) => x.id === q)!).filter((x) => x.id !== id && x.kind !== 'wall').slice(0, 3);
  if (next.length > 0) {
    el('p', 'hd-sub hd-nextup-k', '接着升：', body);
    const chips = el('div', 'hd-chips hd-nextup', undefined, body);
    for (const q of next) {
      button(`${BUILDINGS[q.kind].name} ${q.level}→${q.level + 1}`, 'hd-btn-gold hd-upchip', () => openInfo(bs, q.id), chips).style.minHeight = '44px';
    }
  }
}

/** 成就面板：列表、已得/未得、挑一个称号显示在顶栏 */
export function openAchievements(bs: BaseScene, tab: 'ach' | 'col' = 'ach'): void {
  const p = app.profile;
  const list = achievementList();
  const { body } = openSheet(bs, `成就 ${p.achievements.length}/${list.length}`);
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
  el('p', 'hd-desc', '打赢关卡有几率掉落皮肤和装饰；首领岛首次三星必掉一件。', body);
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
  if (!decos.length) el('p', 'hd-sub', '还没有装饰。', body);
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
  for (const [style, name, desc] of styles) {
    const box = el('div', 'hd-preset', undefined, body);
    el('b', '', name, box);
    el('span', 'hd-sub', desc, box);
    const host = el('div', 'hd-preset-map', undefined, box);
    let layout: ReturnType<typeof presetLayout> = [];
    try {
      layout = presetLayout(p, style);
    } catch {
      layout = [];
    }
    renderLayout(host, layout, { interactive: false });
    requestAnimationFrame(() => host.isConnected && renderLayout(host, layout, { interactive: false }));
    button('用这套', 'hd-btn-gold', () => {
      confirmBox(`换成「${name}」？建筑会重新摆位置，随时可以再换。`, '换', () => {
        app.commit({ ...app.profile, base: { ...app.profile.base, buildings: layout } });
        closeSheet(bs);
        bs.refresh();
        toast(`已换成${name}`);
      });
    }, box).disabled = layout.length === 0;
  }
}
