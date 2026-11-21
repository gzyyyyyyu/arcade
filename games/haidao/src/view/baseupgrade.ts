import { attachIntel } from './intelcard.ts';
import { troopCard } from './intel.ts';
import type { BaseScene } from './BaseScene.ts';
import { TD2_HERO_SKILL } from '../content/td2units.ts';
import { BUILDINGS, TROOPS, SKILLS, HQ_LEVELS } from '../content/index.ts';
import { heroCap, heroLevel, navUnlocked, heroResearchCost, hqLevel, researchLevel, research, researchCost, researchHero, totalStars, upgrade, upgradeCost, collect, collectAll } from '../core/index.ts';
import type { TroopKind, SkillKind, Placed, Res } from '../core/types.ts';
import { app, fmt } from './app.ts';
import { runAchievements } from './meta.ts';
import { ensureArt } from './textures.ts';
import { tArt, iconA, piecesFor } from './art.ts';
import { floatText } from './fx.ts';
import { celebrateGo } from './basefeel.ts';
import { sfx } from './audio/sfx.ts';
import { feelOn } from './feel.ts';
import { newHintCss } from './newhint.ts';
import { isBigBuilding } from './audio/pick.ts';
import { nextUnlock, itemArt, unlocksAt, itemDesc } from './unlock.ts';
import { tutStep, tutSet, tutAdv } from './tutorial.ts';
import { badgePopup, el, img, openModal, button, toast, costRow, paginate } from './ui.ts';
import type { ArtPiece } from './art.ts';
import { closeSheet, short, openInfo } from './basepanel.ts';
import { openBuild } from './baseplace.ts';
import { topOf, measureSafe } from './basegeom.ts';
import { retexture, collectFly, screenOf } from './basehud.ts';
import { drawSel } from './basemenu.ts';
import { rankHint } from './rankui.ts';

/** 做完会涨统计的事（升级、结算）之后查一遍成就，新的弹徽章 */
export function checkAch(bs: BaseScene): void {
  const r = runAchievements(app.profile);
  if (r.fresh.length) {
    app.commit(r.profile);
    bs.refresh();
    // 正在弹主寨升级庆祝时，等它关了再弹徽章，免得叠在一起
    const show = (): void => {
      if (bs.celebrating || document.querySelector('.hd-celebrate')) setTimeout(show, 400);
      else badgePopup(r.fresh);
    };
    setTimeout(show, 500);
  }
}

/** 主寨面板：升到下一级开放什么，还差什么 */
export function unlockBlock(_bs: BaseScene, body: HTMLElement): void {
  const p = app.profile;
  const nu = nextUnlock(p);
  const box = el('div', 'hd-unlock', undefined, body);
  if (!nu) {
    el('p', 'hd-desc', '主寨已经是最高级，所有东西都开放了。', box);
    return;
  }
  el('b', '', `升到 ${nu.hq} 级开放：`, box);
  const row = el('div', 'hd-items', undefined, box);
  for (const it of nu.items) {
    const c = el('span', 'hd-item', undefined, row);
    c.appendChild(img(itemArt(it), 28));
    el('span', '', it.name, c);
  }
  const need: string[] = [];
  if (nu.starsLeft > 0) need.push(`还差 ${nu.starsLeft} 颗星`);
  if (nu.cost.gold > p.res.gold) need.push(`还差 ${fmt(nu.cost.gold - p.res.gold)} 金币（出海抢金币，重打已通关的岛只给三成）`);
  if (nu.cost.wood > p.res.wood) need.push(`还差 ${fmt(nu.cost.wood - p.res.wood)} 木材`);
  el('p', need.length ? 'hd-need' : 'hd-need ok', need.length ? need.join('，') : '条件够了，可以升级！', box);
  rankHint(box);
}

/** 主寨升级成功：新开放的东西逐个弹出来 */
export function celebrate(bs: BaseScene, level: number): void {
  bs.celebrating = false;
  // 升级面板这时还开着：先收起来，庆祝框不和它叠成两张羊皮纸
  closeSheet(bs);
  const items = unlocksAt(level);
  const mask = openModal({ closable: true });
  const box = el('div', 'hd-dialog hd-celebrate', undefined, mask);
  el('h2', '', `主寨升到 ${level} 级！`, box);
  if (items.length) el('p', 'hd-sub', '新开放：', box);
  const list = el('div', 'hd-newlist', undefined, box);
  items.forEach((it, i) => {
    const row = el('div', 'hd-newitem', undefined, list);
    row.style.opacity = '0';
    row.appendChild(img(itemArt(it), 48));
    const t = el('div', '', undefined, row);
    el('b', '', it.name, t);
    el('div', 'hd-sub', itemDesc(it), t);
    setTimeout(() => {
      row.style.opacity = '1';
      row.classList.add('pop');
      sfx('star');
    }, 250 + i * 450);
  });
  // 新开放的东西多（矮屏、一次升好几项）时按弹窗高度翻页，不出滚动条；翻到后面那页的已经弹完了
  paginate(list, [...list.children] as HTMLElement[], list);
  const go = celebrateGo(items) === 'build';
  // 新开放里有建筑：弹窗关掉（先不了、点外面、Esc）后，在岛上亮一下“建造”和主寨；点了「去建造看看」直接开列表，不用亮
  bs.newHint = go;
  // 新开放里有建筑：主按钮直接带去建造列表（原来只是关框，还得自己再点「建造」）
  button(go ? '去建造看看' : '好的', 'hd-btn-gold', () => {
    mask.remove();
    bs.newHint = false;
    if (go) openBuild(bs);
  }, box).style.width = '100%';
  if (go) {
    const later = button('先不了', 'hd-btn-plain', () => mask.remove(), box);
    later.style.width = '100%';
    later.style.marginTop = '8px';
  }
}

/**
 * 新建筑开放的岛上提示（约 1.5 秒）：“建造”钮一圈金光 + 小星星（CSS 动画，播完自己摘掉 class），主寨脚下一圈金光和光晕（粒子池）。
 * 减弱动态时：钮上只是静态高亮（同一段动画只是不动），岛上不放粒子。
 */
export function showNewHint(bs: BaseScene): void {
  if (!document.getElementById('hd-newhint-css')) {
    const st = document.createElement('style');
    st.id = 'hd-newhint-css';
    st.textContent = newHintCss();
    document.head.appendChild(st);
  }
  const b = bs.buildBtn;
  b.classList.remove('hd-newhint');
  void b.offsetWidth;
  b.classList.add('hd-newhint');
  b.onanimationend = (e) => {
    if (e.animationName === 'hd-newhint') b.classList.remove('hd-newhint');
  };
  const hq = [...app.profile.base.buildings].find((q) => q.kind === 'hq');
  const n = hq && bs.nodes.get(hq.id);
  if (n && feelOn()) {
    bs.pt.ringBurst(n.img.x, n.img.y + 2, BUILDINGS.hq.size);
    bs.pt.bloom.flash(n.img.x, n.img.y - 20, 60, 0xffd86a, 700, 0.5);
  }
  sfx('star');
}

/**
 * 军械所研究：网格卡片分「兵种」「技能」「英雄」三组，一屏看完（不翻页）。整张卡是按钮：升得起点一下就升，
 * 升不起灰着写原因（主寨几级解锁、先升级军械所、已满级），只缺资源时照样列花费、缺的数字标红。等级不能超过军械所等级。
 */
export function researchList(bs: BaseScene, body: HTMLElement, armoryId: number): void {
  const p = app.profile;
  const hq = hqLevel(p);
  // 说明不另起一段：军械所的描述已经写了"研究等级不能超过军械所等级"，英雄只花木材看它卡上的花费
  const box = el('div', 'hd-rs', undefined, body);
  const reopen = (): void => {
    sfx('upgrade');
    bs.refresh();
    openInfo(bs, armoryId);
  };
  const group = (title: string, cls: string): HTMLElement => {
    const g = el('div', `hd-rs-g ${cls}`, undefined, box);
    el('b', 'hd-rs-t', title, g);
    return el('div', 'hd-rs-grid', undefined, g);
  };
  const troops = group('兵种', 'troops');
  const skills = group('技能', 'skills');
  const keys: Array<TroopKind | SkillKind> = [...(Object.keys(TROOPS) as TroopKind[]), ...(Object.keys(SKILLS) as SkillKind[])];
  for (const k of keys) {
    const isTroop = k in TROOPS;
    const def = isTroop ? TROOPS[k as TroopKind] : SKILLS[k as SkillKind];
    const cur = researchLevel(p, k);
    const cost = researchCost(k, cur);
    const r = research(p, k);
    const status = def.unlockHq > hq ? `主寨 ${def.unlockHq} 级解锁` : r.ok ? null : cardWhy(bs, r.error, cost, '已满级', '先升级军械所');
    const card = researchCard(isTroop ? troops : skills, isTroop ? tArt(k as TroopKind, 'idle') : iconA(k as SkillKind), def.name, cur, cost, r.ok, status, () => {
      const rr = research(app.profile, k);
      if (!rr.ok) return toast(short(bs, rr.error, cost));
      app.commit(rr.value);
      reopen();
    });
    card.title = r.ok ? `升到 ${cur + 1} 级` : short(bs, r.error, cost);
    if (isTroop) attachIntel(card, () => troopCard(k as TroopKind, researchLevel(app.profile, k)));
  }
  heroCard(bs, group('英雄', 'hero'), reopen);
}

/** 卡上灰着的原因；只缺资源时返回 null（卡上照样列花费，缺的数字标红） */
function cardWhy(bs: BaseScene, error: string, cost: Res, max: string, needArmory: string): string | null {
  if (error === 'no_gold' || error === 'no_wood') return null;
  if (error === 'max') return max;
  if (error === 'need_armory') return needArmory;
  return short(bs, error, cost);
}

/** 一张研究卡：图标、名字、等级，下面一行是下一级花费（缺的标红）或灰着的原因 */
function researchCard(parent: HTMLElement, icon: ArtPiece, name: string, lv: number, cost: Res, ok: boolean, status: string | null, run: () => void): HTMLButtonElement {
  // 升不了的卡不设 disabled（禁用的按钮收不到长按、右键，看不了介绍）：点了由 run 弹原因
  const c = button('', `hd-rs-card${ok ? ' ok' : ' na'}`, run, parent, null);
  c.setAttribute('aria-disabled', String(!ok));
  // 图标和等级小牌并排一行，名字、花费各一行，卡才矮得下来
  const top = el('span', 'hd-rs-top', undefined, c);
  top.appendChild(img(icon, 32));
  el('span', 'hd-rs-lv hd-n', `${lv} 级`, top);
  const t = el('span', 'hd-rs-tx', undefined, c);
  el('b', 'hd-rs-nm', name, t);
  if (status) el('small', 'hd-rs-why', status, t);
  else t.appendChild(costRow(cost, app.profile.res));
  return c;
}

/** 守岛英雄：只花木材，主寨 8 级前封顶主寨等级、8 级后能到 heroCap（12）；9 级以上只加守岛和海盗来袭，别人打我的岛时驻岛英雄按 8 级算 */
function heroCard(bs: BaseScene, parent: HTMLElement, reopen: () => void): void {
  const p = app.profile;
  const cur = heroLevel(p);
  const cap = heroCap(hqLevel(p));
  const cost = heroResearchCost(cur);
  const r = researchHero(p);
  const status = r.ok ? null : cardWhy(bs, r.error, cost, cap > 8 ? '已满级' : `主寨 ${cur + 1} 级可升`, '先造军械所');
  const c = researchCard(parent, tArt('captain', 'idle'), '守岛英雄', cur, cost, r.ok, status, () => {
    const rr = researchHero(app.profile);
    if (!rr.ok) return toast(short(bs, rr.error, cost));
    app.commit(rr.value);
    reopen();
  });
  c.classList.add('hd-rs-herocard');
  c.title = cap > 8 ? '9 级起只加守岛和海盗来袭，别人来打你的岛时按 8 级算' : `最高到主寨等级（${cap} 级）；主寨 8 级后能升到 12 级`;
  // 8 级的新技能和第二个英雄写在卡上，升级前就看得到盼头；等级两个英雄共用，带谁在守岛开局前选
  const t = c.querySelector<HTMLElement>('.hd-rs-tx')!;
  if (cur < TD2_HERO_SKILL.hook.level) el('small', 'hd-rs-note', `${TD2_HERO_SKILL.hook.level} 级新技能「锚钩」`, t);
  el('small', 'hd-rs-note', navUnlocked(p) ? '航海士已解锁，等级共用' : '守岛第一章通关解锁「航海士」', t);
  if (navUnlocked(p)) c.title += '；守岛开局前选带船长还是航海士';
}

export function starText(_bs: BaseScene, b: Placed): string {
  return `还差 ${Math.max(0, (HQ_LEVELS[b.level]?.needStars ?? 0) - totalStars(app.profile))} 颗星才能升主寨`;
}

/**
 * 升级：规则核心立即完成（设计如此，不等时间），画面放一段 1.6–2 秒的施工 → 完成演出（upfx.ts），演出不挡操作。
 * 主寨的解锁弹窗等演出播完再出。
 */
export function doUpgrade(bs: BaseScene, id: number, reopen = true): void {
  const r = upgrade(app.profile, id);
  const ub = app.profile.base.buildings.find((q) => q.id === id);
  if (!r.ok) return toast(short(bs, r.error, ub ? (upgradeCost(ub.kind, ub.level) ?? undefined) : undefined));
  const before = app.profile.base.buildings.find((x) => x.id === id);
  const upgraded = r.value.base.buildings.find((x) => x.id === id);
  const prev = bs.nodes.get(id);
  app.commit(r.value);
  if (tutStep() >= 6) tutSet(7);
  const hq = upgraded?.kind === 'hq';
  if (hq) bs.celebrating = true;
  if (prev && before && upgraded) {
    const size = BUILDINGS[upgraded.kind].size;
    const n = prev;
    // 先开演出再同步画面：refresh 看到"正在施工"就先不换贴图
    bs.upfx.start(id, {
      img: n.img,
      size,
      plan: hq ? 'hq' : upgraded.kind === 'wall' ? 'quick' : 'normal',
      oldKey: n.key,
      oldLv: before.level,
      newLv: upgraded.level,
      big: isBigBuilding(upgraded.kind, size) || upgraded.level >= 4,
      top: () => topOf(bs, n),
      minY: () => {
        if (performance.now() - bs.lastSafe > 400) measureSafe(bs);
        return bs.cc.toWorld(0, (bs.safe.t + bs.off.y) * bs.r).y;
      },
      morph: () => {
        const b = app.profile.base.buildings.find((x) => x.id === id);
        if (b && n.img.active) retexture(bs, n, b);
      },
      done: hq ? () => bs.scene.isActive() && celebrate(bs, upgraded.level) : undefined,
    });
  } else if (hq && upgraded) celebrate(bs, upgraded.level);
  checkAch(bs);
  bs.refresh();
  drawSel(bs);
  bs.plateSig = '';
  void ensureArt(bs.textures, piecesFor(r.value.base.buildings), bs.r).then(() => bs.scene.isActive() && bs.refresh());
  if (reopen) openInfo(bs, id);
}

export function doCollect(bs: BaseScene, id: number): void {
  const before = { gold: app.profile.res.gold, wood: app.profile.res.wood };
  const r = collect(app.profile, id);
  if (!r.ok) {
    if (r.error === 'full') {
      toast('仓库满了，先花掉一些或升级仓库');
      sfx('error');
    }
    return;
  }
  app.commit(r.value.profile);
  sfx(r.value.kind === 'gold' ? 'coin' : 'wood');
  tutAdv(0);
  const n = bs.nodes.get(id);
  if (n) {
    floatText(bs, bs.r, bs.cc.z, n.img.x, topOf(bs, n), `+${fmt(r.value.got)}`, r.value.kind === 'gold' ? '#ffe885' : '#f0b878', 22);
    const k = r.value.kind as 'gold' | 'wood';
    collectFly(bs, k, screenOf(bs, n.img.x, topOf(bs, n)), before[k], r.value.profile.res[k]);
  }
  bs.refresh();
}

/**
 * 一键收取（主寨顶栏的「收取」、键盘 C、升级面板里的「先收」）：金矿、伐木场全部收进仓库，顺带结算达成的成就；
 * summary = true 时弹一个汇总框（收了多少、仓库满了留在矿里多少、新徽章），false 只飘字（升级面板里收完接着升级用）。
 */
export function claimAll(bs: BaseScene, summary = true): void {
  const p0 = app.profile;
  const r = collectAll(p0);
  const ach = runAchievements(r.profile);
  if (!r.ids.length && !ach.fresh.length) {
    if (r.left.gold + r.left.wood > 0) {
      sfx('error');
      return toast('仓库满了，先花掉一些或升级金库、木料场');
    }
    return toast('现在没有能收的');
  }
  app.commit(ach.profile);
  tutAdv(0);
  const flown = new Set<string>();
  for (const id of r.ids) {
    const n = bs.nodes.get(id);
    const b = p0.base.buildings.find((q) => q.id === id);
    if (!n || !b) continue;
    const k: 'gold' | 'wood' = b.kind === 'goldmine' ? 'gold' : 'wood';
    const was = Math.floor(b.stored ?? 0);
    const now = Math.floor(r.profile.base.buildings.find((q) => q.id === id)?.stored ?? 0);
    floatText(bs, bs.r, bs.cc.z, n.img.x, topOf(bs, n), `+${fmt(was - now)}`, k === 'gold' ? '#ffe885' : '#f0b878', 22);
    // 每种资源只飞一次（从收得最多的那座起飞），十几座一起飞眼花
    if (!flown.has(k)) {
      flown.add(k);
      collectFly(bs, k, screenOf(bs, n.img.x, topOf(bs, n)), p0.res[k], r.profile.res[k]);
    }
  }
  if (r.got.gold) sfx('coin');
  else if (r.got.wood) sfx('wood');
  bs.refresh();
  if (summary) claimSummary(r.got, r.left, ach.fresh);
  else if (ach.fresh.length) badgePopup(ach.fresh);
}

function claimSummary(got: Res, left: Res, badges: Array<{ name: string; desc: string; tier: 'bronze' | 'silver' | 'gold' }>): void {
  const mask = openModal({ cls: 'hd-claim-mask', closable: true });
  const dlg = el('div', 'hd-dialog hd-claim', undefined, mask);
  el('h2', '', '全部收好了', dlg);
  const list = el('div', 'hd-claim-list', undefined, dlg);
  const row = (icon: ArtPiece, text: string, cls = ''): void => {
    const r = el('div', `hd-claim-row ${cls}`, undefined, list);
    r.appendChild(img(icon, 28));
    el('b', 'hd-n', text, r);
  };
  if (got.gold) row(iconA('gold'), `+${fmt(got.gold)} 金币`);
  if (got.wood) row(iconA('wood'), `+${fmt(got.wood)} 木材`);
  if (left.gold) row(iconA('gold'), `金库满了，金矿里还留着 ${fmt(left.gold)}`, 'left');
  if (left.wood) row(iconA('wood'), `木料场满了，伐木场里还留着 ${fmt(left.wood)}`, 'left');
  for (const b of badges) row(iconA('star'), `新徽章：${b.name}`, 'badge');
  button('好', 'hd-btn-gold', () => mask.remove(), dlg, 'confirm');
}

