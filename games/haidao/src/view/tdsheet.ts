import type { TdTier } from '../core/td2types.ts';
import { attachIntel, intelButton } from './intelcard.ts';
import { tdTowerCard } from './intel.ts';
import type { TdScene } from './TdScene.ts';
import { BUILDINGS } from '../content/index.ts';
import { TD_BRANCH_DESC } from '../content/tdbranches.ts';
import { TD_PRIOS, TD_PRIO_NAME, TD_ULT_BY_ID, ultOptions } from '../content/tdults.ts';
import { tdRuleBlock, tdUltCost, tdUltOptions } from '../core/tdquery.ts';
import { type TdState, tdBuildBlock, tdClearCost, TD2_ECON, type TdTowerKind, isTdTowerKind, tdUpCost, tdSellRefund } from '../core/index.ts';
import { TICKS_PER_SEC, UNIT } from '../core/types.ts';
import { iconA } from './art.ts';
import { keyBadge } from './inputs.ts';
import { bestiary, openerLeft, towerIcon, TOWER_INFO, rangeText, towerCounter, dmgBadge, ARMOR_NAME, DAMAGE_NAME, branchName, pendingTier, branchCards, branchDamageHint } from './td-ui.ts';
import { sfx } from './audio/sfx.ts';
import { buildSound, upgradeSound } from './audio/pick.ts';
import { el, button, img } from './ui.ts';
import { waveTitle, laneTitle, hintText } from './tdhud.ts';
import { twoSteps } from './tdpadguide.ts';
import { act, moveMark } from './tdinput.ts';
import { W, TEMP_KINDS, buildCost } from './tdcommon.ts';
import { campAt, campUpCost, type TdCamp } from '../core/tdcamp.ts';
import { TD2_CAMP, TD2_CAMP_BRANCH, type TdCampBranch } from '../content/tdcamp.ts';
import { tdBarracksArt } from './art/tdbarracks.ts';

// ---------------------------------------------------------------- 木台面板

export function closeSheet(bs: TdScene): void {
  bs.sheet?.remove();
  bs.sheet = null;
  bs.openSlot = -1;
  bs.previewKind = null;
  bs.bestOpen = false;
  bs.sheetSig = '';
  bs.sellArmed = -1;
  bs.sellTimer?.remove();
}

export function showSlot(bs: TdScene, i: number): void {
  sfx('tap');
  closeSheet(bs);
  bs.openSlot = i;
  renderSheet(bs);
  slotAboveSheet(bs, i);
}

/**
 * 竖屏的造塔 / 升级面板占屏幕下面一大半，点的木台常被盖住，看不到自己在造哪块：
 * 台子落在面板里时镜头把它挪到面板上方那块的中间（和点预告卡平移同一套；玩家挪过镜头，自动构图让位）
 */
function slotAboveSheet(bs: TdScene, i: number): void {
  const box = bs.sheet;
  const sl = bs.s.slots[i];
  const par = box?.offsetParent;
  if (!box || !par || !sl) return;
  const cv = bs.game.canvas.getBoundingClientRect();
  // 面板是滑进来的（正在播位移动画），按布局位置（offset*，不含变换）量，不然量到的上沿偏低、以为上面空着一大块
  const o = par.getBoundingClientRect();
  const r = { top: o.top + box.offsetTop, left: o.left + box.offsetLeft, right: o.left + box.offsetLeft + box.offsetWidth };
  const top = r.top - cv.top;
  const w = W((sl.x + 1) * UNIT, (sl.y + 1) * UNIT);
  const p = bs.cc.toScreen(w.x, w.y);
  // 只在竖屏挪：横屏和电脑的面板上面只剩约 1/3 屏的一条（或面板在侧边），挪进去也看不清，还把镜头带走
  if (cv.height <= cv.width || p.y < top - PAD_ABOVE || p.x < r.left - cv.left || p.x > r.right - cv.left) return;
  bs.fit.markUser();
  bs.fit.panTo(w.x, w.y, undefined, top);
}

/** 台子中心离面板上沿至少这么远才算看得见（台子本身约 40 高，再留点边） */
const PAD_ABOVE = 36;

/** 敌人图鉴：下两波每一路的敌人和一张展开的克制表；开着时和木台面板一样暂停 */
export function showBest(bs: TdScene): void {
  if (bs.s.over || bs.pv.length === 0) return;
  sfx('tap');
  closeSheet(bs);
  bs.bestOpen = true;
  const box = (bs.sheet = el('div', 'hd-td-sheet hd-td-best', undefined, bs.ui));
  const head = el('div', 'hd-head', undefined, box);
  el('h2', '', '下两波和克制表', head);
  button('×', 'hd-x', () => closeSheet(bs), head).title = '关掉（Esc / C）';
  bestiary(box, bs.pv, (w) => waveTitle(bs, w), (l) => laneTitle(bs, l), openerLeft(bs.s), bs.next?.step);
}

/** 压着这块木台、还没清掉的沉船；没有为 null */
export function wreckOf(bs: TdScene, sl: TdState['slots'][number]): TdState['blocks'][number] | null {
  if (sl.wreck === undefined) return null;
  const b = bs.s.blocks.find((q) => q.id === sl.wreck);
  return b && !b.destroyed ? b : null;
}

export function slotSig(bs: TdScene): string {
  const s = bs.s;
  const sl = s.slots[bs.openSlot];
  if (!sl) return '';
  const t = s.towers.find((q) => q.id === sl.tower);
  return `${sl.tower}|${t?.level ?? 0}|${t?.tier ?? 0}|${t?.branch.join(',') ?? ''}|${sl.ups}|${wreckOf(bs, sl)?.id ?? -1}|${bs.sellArmed}|${Math.floor(s.gold / 10)}|${t ? '' : (tdBuildBlock(s, bs.openSlot) ?? '')}|${t?.ult ?? ''}|${t?.prio ?? ''}|${campSig(s, bs.openSlot)}`;
}

/** 金币标价：锤子图标 + 数字，不够时标红 */
export function price(bs: TdScene, parent: HTMLElement, n: number): void {
  const pr = el('span', `hd-td-price${bs.s.gold < n ? ' short' : ''}`, undefined, parent);
  pr.appendChild(img(iconA('hammer'), 16));
  el('b', 'hd-n', String(n), pr);
}

export function renderSheet(bs: TdScene): void {
  const s = bs.s;
  const sl = s.slots[bs.openSlot];
  bs.sheet?.remove();
  bs.sheet = null;
  bs.previewKind = null;
  if (!sl) return;
  bs.sheetSig = slotSig(bs);
  const t = s.towers.find((q) => q.id === sl.tower);
  const gar = sl.garrison !== undefined;
  const box = (bs.sheet = el('div', `hd-td-sheet${t ? '' : ' build'}`, undefined, bs.ui));
  const head = el('div', 'hd-head', undefined, box);
  const wreck = wreckOf(bs, sl);
  if (wreck) {
    // 沉船压台：花钱立刻清，或者让英雄去打（打完给钱，但要几秒、英雄离开岗位）
    el('h2', '', '木台被沉船压着', head);
    button('×', 'hd-x', () => closeSheet(bs), head).title = '关掉（Esc）';
    el('p', 'hd-desc', '清掉才能在这里造塔。', box);
    const acts = el('div', 'hd-td-acts', undefined, box);
    const cost = tdClearCost(s, wreck.id);
    const now = button('', 'hd-btn-gold hd-td-clear', () => act(bs, { type: 'clearNow', id: wreck.id }), acts);
    now.append('马上清掉  ');
    price(bs, now, cost);
    now.disabled = cost < 0 || s.gold < cost;
    const hero = button('', 'hd-btn-wood hd-td-clearhero', () => {
      act(bs, { type: 'clear', id: wreck.id });
      const w = W((wreck.x + wreck.size / 2) * UNIT, (wreck.y + wreck.size / 2) * UNIT);
      moveMark(bs, w.x, w.y);
      closeSheet(bs);
    }, acts);
    hero.append(`让英雄去打（打完 +${TD2_ECON.heroClearGold} 金）`);
    hero.disabled = s.hero.respawn >= 0;
    return;
  }
  const camp = campAt(s, bs.openSlot);
  if (camp) return campSheet(bs, box, head, camp);
  if (!t) {
    el('h2', '', gar ? '驻守台（没带塔）：造一座塔' : sl.high ? '崖上高台：造一座塔' : '木台：造一座塔', head);
    button('×', 'hd-x', () => closeSheet(bs), head).title = '关掉（Esc）';
    el('p', 'hd-desc', '从 1 阶起，能升到 3 阶；打完这局就拆。造价用局内金币。', box);
    // 被挡时核心的 build 会不声不响地拒掉，这里先说清楚为什么点不了（和 build 用同一个 tdBuildBlock）
    if (tdRuleBlock(s, bs.openSlot)) {
      // 挑战的限制：这块台这一局造不了（选关卡片上写着这条挑战）
      el('div', 'hd-td-block', undefined, box).append(el('b', '', '这一关的挑战：这块台不能造'));
      return;
    }
    const block = tdBuildBlock(s, bs.openSlot);
    if (block) {
      const nb = el('div', 'hd-td-block', undefined, box);
      el('b', '', block === 'hero' ? '英雄站在台上，先让他走开' : '有敌人在台上，等它走开', nb);
      // 面板开着时游戏暂停，英雄走不开、敌人也不会走：关掉面板让游戏走，台子一空就自动重开面板（TdScene.update 里 reopenWatch）
      button(block === 'hero' ? '让英雄走开' : '关掉等它走开', 'hd-btn-wood', () => {
        const i = bs.openSlot;
        if (block === 'hero') heroOff(bs, sl);
        closeSheet(bs);
        bs.reopen = { slot: i, until: s.tick + REOPEN_TICKS };
      }, nb);
    }
    const grid = el('div', 'hd-td-towers', undefined, box);
    const can = new Set<TdTowerKind>(s.unlocked);
    const kinds = TEMP_KINDS.filter((k) => can.has(k));
    // 该造的塔描金边，和地上的金圈、预告卡说的是同一座：开局造法没造完时按这块台写的，之后按卡上「下一座造」
    // 钱够两步、打开的正是第二步那块台时按第二步的塔描
    const after = twoSteps(bs);
    const step = after && !after.up && after.slot === bs.openSlot ? after : bs.next?.step;
    const rec = openerLeft(s) ? s.level.opener?.find((o) => o.slot === bs.openSlot)?.kind : step && !step.up ? step.kind : undefined;
    kinds.forEach((k, i) => {
      const cost = buildCost(s, bs.openSlot, k);
      const c = el('button', 'hd-td-tower', undefined, grid);
      c.type = 'button';
      c.dataset.kind = k;
      if (k === rec) c.classList.add('rec');
      c.title = `${BUILDINGS[k].name}（${i + 1}）`;
      keyBadge(c, i + 1);
      c.appendChild(towerIcon(k, 2, 44));
      el('b', '', BUILDINGS[k].name, c);
      price(bs, c, cost);
      const info = TOWER_INFO[k];
      if (info) el('small', '', info.line, c);
      el('small', 'hd-td-rng', rangeText(k, !!sl.high), c);
      // 伤害类型和克谁：从克制表现算，删掉了旧的"克首领""打不到鹦鹉"这类说法
      const cc = towerCounter(k);
      const ctr = el('small', 'hd-td-ctr', undefined, c);
      // 伤害只留方章（「炮」「枪」），护甲写全名的带色小条：一个字的小圆章太小，「飞」「布」很容易看错；
      // 打不到的划掉（不写「打不到」三个字，免得卡片折成两行、手机上面板放不下）
      dmgBadge(cc.dmg, ctr);
      if (cc.good.length) ctr.append(' 克');
      for (const a of cc.good) el('i', `hd-armn a-${a}`, ARMOR_NAME[a], ctr);
      for (const a of cc.none) el('i', `hd-armn ng a-${a}`, ARMOR_NAME[a], ctr).title = `打不到${ARMOR_NAME[a]}`;
      // 造不起也不设 disabled：禁用的按钮收不到长按、右键，看不了介绍卡片；点了不造（下面的 click 判 na）
      const na = s.gold < cost || block !== null;
      c.classList.toggle('na', na);
      c.setAttribute('aria-disabled', String(na));
      attachIntel(c, () => tdTowerCard(k, 1));
      // 压着 / 悬停这张卡：地上画这座塔 1 阶的射程圈；移开或松手就收（重画面板时鼠标还在上面就接着画）
      const on = (): void => {
        bs.previewKind = k;
      };
      const off = (): void => {
        if (bs.previewKind === k) bs.previewKind = null;
      };
      c.addEventListener('pointerenter', on);
      c.addEventListener('pointerdown', on);
      c.addEventListener('focus', on);
      c.addEventListener('pointerleave', off);
      c.addEventListener('pointercancel', off);
      c.addEventListener('blur', off);
      if (c.matches(':hover')) bs.previewKind = k;
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        if (na) return;
        sfx(buildSound(false));
        act(bs, { type: 'build', slot: bs.openSlot, kind: k });
        // 造完就关面板、游戏接着走：留着面板（换成这座塔的升级页）每造一座都要多点一下关掉，开着又一直暂停；要升级再点这座塔
        closeSheet(bs);
      });
    });
    const locked = TEMP_KINDS.length - kinds.length;
    if (locked > 0) el('p', 'hd-td-note', `还有 ${locked} 种塔：主寨升级后解锁`, box);
    // 能造水手营的局用一条横钮顶掉克制表那行提示，面板不多占一行（手机两列时第 9 张卡会多出一行）
    // 限塔种的挑战（rule.kinds）不能造营，和核心的 camp 操作同一条
    if (s.campOn && !gar && !s.deep?.rule.kinds) campCard(bs, box, block !== null);
    // 整张克制表在敌人图鉴里（点预告卡或按 C）；这里每张塔卡已写着克谁、打不到谁
    else el('p', 'hd-td-note', '全部克制关系：点预告卡看敌人图鉴', box);
    return;
  }
  const tier = t.tier ?? Math.min(3, sl.ups + 1);
  el('h2', '', `${BUILDINGS[t.kind].name}  ${tier} 阶`, head);
  if (isTdTowerKind(t.kind)) {
    // 介绍卡片：钮放在标题栏（放在内容里会把手机横屏的面板顶出一屏）
    const kind = t.kind;
    intelButton('i 介绍', () => tdTowerCard(kind, tier as TdTier), head);
  }
  button('×', 'hd-x', () => closeSheet(bs), head).title = '关掉（Esc）';
  const chips = el('div', 'hd-chips', undefined, box);
  if (gar) el('span', 'hd-chip hd-td-tierchip', '从基地带来的驻守塔', chips);
  if (isTdTowerKind(t.kind)) {
    const cc = towerCounter(t.kind);
    const c = el('span', 'hd-chip', undefined, chips);
    dmgBadge(cc.dmg, c);
    c.append(` ${DAMAGE_NAME[cc.dmg]}${cc.good.length ? ` · 克${cc.good.map((a) => ARMOR_NAME[a]).join('、')}` : ''}`);
    const bonus = bs.d.setup.bonus?.[t.kind] ?? 0;
    if (bonus > 0) el('span', 'hd-chip', `基地加成 伤害 +${bonus}%`, chips);
  }
  for (const id of t.branch) el('span', 'hd-chip', `路线：${branchName(id)}`, chips);
  // 局内塔 3 阶才选分叉（先 3 级那档再 6 级那档），说明换成守岛的（TD_BRANCH_DESC）
  const pend = tier >= 3 ? pendingTier(t.kind, t.level, t.branch) : null;
  if (pend) branchCards(box, t.kind, t.level, t.branch, (id) => act(bs, { type: 'branch', slot: bs.openSlot, branch: id }), branchDamageHint, (id) => TD_BRANCH_DESC.get(id));
  // 电脑上和造塔面板一样标键位：分叉按数字键选，升级 U、卖 S
  else if (tier >= 3) ultCards(bs, box, t);
  box.querySelectorAll<HTMLElement>('.hd-td-branch').forEach((c, i) => keyBadge(c, i + 1));
  const acts = el('div', 'hd-td-acts', undefined, box);
  if (s.deep && t.kind !== 'sniper') {
    // 先打：一颗循环钮（最前 → 最强 → 最近 → 精英），只在战役、海盗来袭
    const cur = t.prio ?? 'first';
    const next = TD_PRIOS[(TD_PRIOS.indexOf(cur) + 1) % TD_PRIOS.length]!;
    const pb = button(`先打：${TD_PRIO_NAME[cur]}`, 'hd-btn-wood hd-td-prio', () => act(bs, { type: 'prio', slot: bs.openSlot, prio: next }), acts);
    pb.title = `点一下换成「${TD_PRIO_NAME[next]}」（F）`;
    keyBadge(pb, 'F');
  }
  const cost = tdUpCost(t.kind, tier - 1);
  if (cost < 0 || tier >= 3) el('span', 'hd-chip', '已到 3 阶', acts);
  else {
    const up = button('', 'hd-btn-gold hd-td-up', () => {
      sfx(upgradeSound(tier >= 2));
      act(bs, { type: 'up', slot: bs.openSlot });
      // 升到 2 阶就关面板、游戏接着走（和造塔一样，面板开着时整局停着）；升到 3 阶留着，接下来要在这里选分叉
      if (tier + 1 < 3) closeSheet(bs);
    }, acts);
    up.title = '升级（U）';
    keyBadge(up, 'U');
    up.append(`升到 ${tier + 1} 阶  `);
    price(bs, up, cost);
    up.disabled = s.gold < cost;
  }
  const refund = s.deep?.rule.noSell ? -1 : tdSellRefund(s, bs.openSlot);
  if (s.deep?.rule.noSell) el('span', 'hd-chip', '挑战：不能卖', acts);
  if (refund >= 0) {
    const armed = bs.sellArmed === bs.openSlot;
    const sell = button('', `hd-btn-wood hd-td-sell${armed ? ' arm' : ''}`, () => sellAt(bs, bs.openSlot), acts, armed ? 'confirm' : 'tap');
    sell.title = `卖掉，退回花掉的 ${s.deep?.talent.sellPct ?? TD2_ECON.sellPct}%（S，要按两下）`;
    keyBadge(sell, 'S');
    sell.append(armed ? '再点一下确认 ' : '卖掉 ');
    const pr = el('span', 'hd-td-price', undefined, sell);
    pr.appendChild(img(iconA('hammer'), 16));
    el('b', '', `+${refund}`, pr);
  }
}

const campSig = (s: TdState, slot: number): string => {
  const c = campAt(s, slot);
  return c ? `c${c.tier}${c.branch ?? ''}` : '';
};

const CAMP_ART_BRANCH: Readonly<Record<TdCampBranch, 'gun' | 'shield'>> = { 'camp.gun': 'gun', 'camp.wall': 'shield' };

/** 造塔页底下的水手营横钮（图、名字、一句话、价） */
function campCard(bs: TdScene, box: HTMLElement, blocked: boolean): void {
  const s = bs.s;
  const c = button('', 'hd-btn-wood hd-td-campbtn', () => {
    if (na) return;
    sfx(buildSound(false));
    act(bs, { type: 'camp', slot: bs.openSlot });
    closeSheet(bs);
  }, box, null);
  c.dataset.kind = 'camp';
  c.appendChild(img(tdBarracksArt(1), 28));
  el('b', '', '水手营', c);
  el('small', '', `${TD2_CAMP.men} 个水兵拦地面敌人`, c);
  price(bs, c, TD2_CAMP.cost);
  const na = s.gold < TD2_CAMP.cost || blocked;
  c.classList.toggle('na', na);
  c.setAttribute('aria-disabled', String(na));
}

/** 水手营的面板：阶、3 阶分叉、挪集结点、升阶、卖 */
function campSheet(bs: TdScene, box: HTMLElement, head: HTMLElement, camp: TdCamp): void {
  const s = bs.s;
  const slot = bs.openSlot;
  box.classList.remove('build');
  el('h2', '', `水手营  ${camp.tier} 阶`, head);
  button('×', 'hd-x', () => closeSheet(bs), head).title = '关掉（Esc）';
  const chips = el('div', 'hd-chips', undefined, box);
  const up = camp.men.filter((m) => m.respawn < 0).length;
  el('span', 'hd-chip', `水兵 ${up}/${camp.men.length}`, chips);
  if (camp.branch) el('span', 'hd-chip', `路线：${TD2_CAMP_BRANCH[camp.branch].name}`, chips);
  if (camp.tier >= 3 && !camp.branch) {
    el('p', 'hd-td-sub', '选一条路线，选了不能改', box);
    const row = el('div', 'hd-td-branches', undefined, box);
    for (const id of Object.keys(TD2_CAMP_BRANCH) as TdCampBranch[]) {
      const b = TD2_CAMP_BRANCH[id];
      const c = el('button', 'hd-td-branch', undefined, row);
      c.type = 'button';
      c.appendChild(img(tdBarracksArt(3, CAMP_ART_BRANCH[id]), 36));
      el('b', '', b.name, c);
      el('span', '', b.desc, c);
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx(upgradeSound(true));
        act(bs, { type: 'branch', slot, branch: id });
      });
    }
    box.querySelectorAll<HTMLElement>('.hd-td-branch').forEach((c, i) => keyBadge(c, i + 1));
  }
  const acts = el('div', 'hd-td-acts', undefined, box);
  const mv = button('挪集结点', 'hd-btn-wood hd-td-muster', () => {
    closeSheet(bs);
    bs.mode = 'muster';
    bs.musterSlot = slot;
    hintText(bs, '点营旁边 3 格内的路面，水兵站过去');
  }, acts);
  mv.title = '挪集结点（M）';
  keyBadge(mv, 'M');
  const cost = campUpCost(camp);
  if (cost < 0) el('span', 'hd-chip', '已到 3 阶', acts);
  else {
    const ub = button('', 'hd-btn-gold hd-td-up', () => {
      sfx(upgradeSound(camp.tier >= 2));
      act(bs, { type: 'up', slot });
      if (camp.tier + 1 < 3) closeSheet(bs);
    }, acts);
    ub.title = '升级（U）';
    keyBadge(ub, 'U');
    ub.append(`升到 ${camp.tier + 1} 阶  `);
    price(bs, ub, cost);
    ub.disabled = s.gold < cost;
  }
  const refund = s.deep?.rule.noSell ? -1 : tdSellRefund(s, slot);
  if (refund >= 0) {
    const armed = bs.sellArmed === slot;
    const sell = button('', `hd-btn-wood hd-td-sell${armed ? ' arm' : ''}`, () => sellAt(bs, slot), acts, armed ? 'confirm' : 'tap');
    sell.title = '卖掉（S，要按两下）';
    keyBadge(sell, 'S');
    sell.append(armed ? '再点一下确认 ' : '卖掉 ');
    const pr = el('span', 'hd-td-price', undefined, sell);
    pr.appendChild(img(iconA('hammer'), 16));
    el('b', '', `+${refund}`, pr);
  }
}

/**
 * 3 阶两档分叉选完后的终极卡（同一时刻只有分叉卡或终极卡一组）：换过的写一行；这一局没开终极的写为什么
 */
function ultCards(bs: TdScene, box: HTMLElement, t: TdState['towers'][number]): void {
  const s = bs.s;
  if (t.ult) {
    const u = TD_ULT_BY_ID.get(t.ult);
    if (u) el('p', 'hd-td-sub', `终极：${u.name}（${u.desc}）`, box);
    return;
  }
  if (ultOptions(t.kind).length === 0 || t.branch.length < 2) return;
  if (!s.deep) {
    el('p', 'hd-td-note', '悬赏守岛不开放终极', box);
    return;
  }
  if (!s.deep.ult) {
    el('p', 'hd-td-note', '第一章通关后解锁终极', box);
    return;
  }
  el('p', 'hd-td-sub', '终极：选一个，选了不能改', box);
  const row = el('div', 'hd-td-branches', undefined, box);
  for (const u of tdUltOptions(s, bs.openSlot)) {
    const cost = tdUltCost(s, u.id);
    const c = el('button', 'hd-td-branch hd-td-ult', undefined, row);
    c.type = 'button';
    el('b', '', u.name, c);
    el('span', '', u.desc, c);
    price(bs, c, cost);
    c.disabled = s.gold < cost;
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (c.disabled) return;
      sfx(upgradeSound(true));
      act(bs, { type: 'ult', slot: bs.openSlot, ult: u.id });
    });
  }
}

const REOPEN_TICKS = 4 * TICKS_PER_SEC;

/** 等着重开的木台空出来了就重开；超时、或玩家已经开了别的面板就作罢 */
export function reopenWatch(bs: TdScene): void {
  const r = bs.reopen;
  if (!r) return;
  if (bs.sheet || bs.s.tick > r.until || bs.s.over) {
    bs.reopen = null;
    return;
  }
  if (tdBuildBlock(bs.s, r.slot) === null) {
    bs.reopen = null;
    showSlot(bs, r.slot);
  }
}

/** 让英雄从木台上走开：挑台子四周 1.5 格外第一个不压木台、塔、墙、障碍的点（走不到的话核心会让他原地不动，提示还在） */
function heroOff(bs: TdScene, sl: TdState['slots'][number]): void {
  const s = bs.s;
  const cx = sl.x + 1;
  const cy = sl.y + 1;
  const taken = (gx: number, gy: number): boolean =>
    s.slots.some((q) => gx >= q.x && gx < q.x + 2 && gy >= q.y && gy < q.y + 2) ||
    s.walls.some((w) => !w.destroyed && w.x === gx && w.y === gy) ||
    s.blocks.some((b) => !b.destroyed && gx >= b.x && gx < b.x + b.size && gy >= b.y && gy < b.y + b.size);
  const h = s.hero;
  const dirs = [[0, 1.6], [1.6, 0], [0, -1.6], [-1.6, 0], [1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]] as const;
  // 先试离英雄近的方向，少走几步
  const pts = dirs.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy })).sort((a, b) => Math.hypot(a.x * UNIT - h.x, a.y * UNIT - h.y) - Math.hypot(b.x * UNIT - h.x, b.y * UNIT - h.y));
  const p = pts.find((q) => !taken(Math.floor(q.x), Math.floor(q.y)));
  if (!p) return;
  act(bs, { type: 'move', x: Math.round(p.x * UNIT), y: Math.round(p.y * UNIT) });
  const w = W(p.x * UNIT, p.y * UNIT);
  moveMark(bs, w.x, w.y);
}

/** 卖塔：第一下只是"上膛"（按钮变红，2 秒内再点才卖），防止手滑卖掉 */
function sellAt(bs: TdScene, slot: number): void {
  if (bs.sellArmed !== slot) {
    bs.sellArmed = slot;
    bs.sellTimer?.remove();
    bs.sellTimer = bs.time.delayedCall(2000, () => {
      bs.sellArmed = -1;
    });
    return;
  }
  bs.sellArmed = -1;
  bs.sellTimer?.remove();
  act(bs, { type: 'sell', slot });
}
