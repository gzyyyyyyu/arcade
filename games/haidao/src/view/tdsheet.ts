import type { TdScene } from './TdScene.ts';
import { BUILDINGS } from '../content/index.ts';
import { TD_BRANCH_DESC } from '../content/tdbranches.ts';
import { type TdState, tdBuildBlock, tdClearCost, TD2_ECON, type TdTowerKind, isTdTowerKind, tdUpCost, tdSellRefund } from '../core/index.ts';
import { TICKS_PER_SEC, UNIT } from '../core/types.ts';
import { iconA } from './art.ts';
import { keyBadge } from './inputs.ts';
import { bestiary, towerIcon, TOWER_INFO, rangeText, towerCounter, dmgBadge, armorBadge, counterCard, ARMOR_NAME, branchName, pendingTier, branchCards, branchDamageHint } from './td-ui.ts';
import { sfx } from './audio/sfx.ts';
import { buildSound, upgradeSound } from './audio/pick.ts';
import { el, button, img } from './ui.ts';
import { waveTitle, laneTitle } from './tdhud.ts';
import { act, moveMark } from './tdinput.ts';
import { W, TEMP_KINDS, buildCost } from './tdcommon.ts';

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
}

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
  bestiary(box, bs.pv, (w) => waveTitle(bs, w), (l) => laneTitle(bs, l));
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
  return `${sl.tower}|${t?.level ?? 0}|${t?.tier ?? 0}|${t?.branch.join(',') ?? ''}|${sl.ups}|${wreckOf(bs, sl)?.id ?? -1}|${bs.sellArmed}|${Math.floor(s.gold / 10)}|${t ? '' : (tdBuildBlock(s, bs.openSlot) ?? '')}`;
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
  if (!t) {
    el('h2', '', gar ? '驻守台（空着）：当木台用' : '木台：造一座塔', head);
    button('×', 'hd-x', () => closeSheet(bs), head).title = '关掉（Esc）';
    el('p', 'hd-desc', '从 1 阶起，能升到 3 阶；打完这局就拆。造价用局内金币。', box);
    // 被挡时核心的 build 会不声不响地拒掉，这里先说清楚为什么点不了（和 build 用同一个 tdBuildBlock）
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
    kinds.forEach((k, i) => {
      const cost = buildCost(k);
      const c = el('button', 'hd-td-tower', undefined, grid);
      c.type = 'button';
      c.dataset.kind = k;
      c.title = `${BUILDINGS[k].name}（${i + 1}）`;
      keyBadge(c, i + 1);
      c.appendChild(towerIcon(k, 2, 44));
      el('b', '', BUILDINGS[k].name, c);
      price(bs, c, cost);
      const info = TOWER_INFO[k];
      if (info) el('small', '', info.line, c);
      el('small', 'hd-td-rng', rangeText(k), c);
      // 伤害类型和克谁：从克制表现算，删掉了旧的"克首领""打不到鹦鹉"这类说法
      const cc = towerCounter(k);
      const ctr = el('small', 'hd-td-ctr', undefined, c);
      dmgBadge(cc.dmg, ctr);
      if (cc.good.length) {
        ctr.append('克');
        for (const a of cc.good) armorBadge(a, ctr);
      }
      for (const a of cc.none) armorBadge(a, ctr).classList.add('ng');
      c.disabled = s.gold < cost || block !== null;
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
        if (c.disabled) return;
        sfx(buildSound(false));
        act(bs, { type: 'build', slot: bs.openSlot, kind: k });
      });
    });
    const locked = TEMP_KINDS.length - kinds.length;
    if (locked > 0) el('p', 'hd-td-note', `还有 ${locked} 种塔：主寨升级后解锁`, box);
    counterCard(box);
    return;
  }
  const tier = t.tier ?? Math.min(3, sl.ups + 1);
  el('h2', '', `${BUILDINGS[t.kind].name}  ${tier} 阶`, head);
  button('×', 'hd-x', () => closeSheet(bs), head).title = '关掉（Esc）';
  const chips = el('div', 'hd-chips', undefined, box);
  if (gar) el('span', 'hd-chip hd-td-tierchip', '从基地带来的驻守塔', chips);
  if (isTdTowerKind(t.kind)) {
    const cc = towerCounter(t.kind);
    const c = el('span', 'hd-chip', undefined, chips);
    dmgBadge(cc.dmg, c);
    c.append(` ${cc.good.length ? `克${cc.good.map((a) => ARMOR_NAME[a]).join('、')}` : ''}`);
    const bonus = bs.d.setup.bonus?.[t.kind] ?? 0;
    if (bonus > 0) el('span', 'hd-chip', `基地加成 伤害 +${bonus}%`, chips);
  }
  for (const id of t.branch) el('span', 'hd-chip', `路线：${branchName(id)}`, chips);
  // 局内塔 3 阶才选分叉（先 3 级那档再 6 级那档），说明换成守岛的（TD_BRANCH_DESC）
  const pend = tier >= 3 ? pendingTier(t.kind, t.level, t.branch) : null;
  if (pend) branchCards(box, t.kind, t.level, t.branch, (id) => act(bs, { type: 'branch', slot: bs.openSlot, branch: id }), branchDamageHint, (id) => TD_BRANCH_DESC.get(id));
  const acts = el('div', 'hd-td-acts', undefined, box);
  const cost = tdUpCost(t.kind, tier - 1);
  if (cost < 0 || tier >= 3) el('span', 'hd-chip', '已到 3 阶', acts);
  else {
    const up = button('', 'hd-btn-gold hd-td-up', () => {
      sfx(upgradeSound(tier >= 2));
      act(bs, { type: 'up', slot: bs.openSlot });
    }, acts);
    up.title = '升级（U）';
    up.append(`升到 ${tier + 1} 阶  `);
    price(bs, up, cost);
    up.disabled = s.gold < cost;
  }
  const refund = tdSellRefund(s, bs.openSlot);
  if (refund >= 0) {
    const armed = bs.sellArmed === bs.openSlot;
    const sell = button('', `hd-btn-wood hd-td-sell${armed ? ' arm' : ''}`, () => sellAt(bs, bs.openSlot), acts, armed ? 'confirm' : 'tap');
    sell.title = `卖掉，退回花掉的 ${TD2_ECON.sellPct}%（S，要按两下）`;
    sell.append(armed ? '再点一下确认 ' : '卖掉 ');
    const pr = el('span', 'hd-td-price', undefined, sell);
    pr.appendChild(img(iconA('hammer'), 16));
    el('b', '', `+${refund}`, pr);
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
export function sellAt(bs: TdScene, slot: number): void {
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
