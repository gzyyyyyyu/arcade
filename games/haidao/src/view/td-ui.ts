import { BRANCH_BY_ID, BRANCH_LEVEL, BUILDINGS, branchOptions } from '../content/index.ts';
import { TD2_ENEMIES } from '../content/td2units.ts';
import { TD2_CHAPTERS } from '../content/tdmaps.ts';
import type { Td2ChapterInfo } from '../content/tdmaps.ts';
import { ISLAND, UNIT } from '../core/types.ts';
import { tdBuildRange } from '../core/index.ts';
import {
  COUNTER, TD2_LEVELS, TD2_LOSE_AT, TD2_STAR_LOST, TD_ARMORS, TD_BRANCH_DAMAGE, TD_DAMAGES, TD_ENEMY_ARMOR, TD_TOWER_DAMAGE,
  beijingIsoWeek, branchError, garrisonTier, hqLevel, tdAutoPicks, nextTdUnlock, tdDailyCap, tdGarrisonOptions, tdLevelUnlocked, tideLine, tideMap, weekLabel,
} from '../core/index.ts';
import { tideBest } from '../net/tide.ts';
import type { TdArmor, TdDamage, TdGarrisonOption, TdGarrisonPick, TdGarrisonSpot, TdIslandLevel, TdTowerKind, WavePreview } from '../core/index.ts';
import type { BuildingKind, TdEnemyKind } from '../core/index.ts';
import { app, fmt } from './app.ts';
import { PALETTE as P } from './art/index.ts';
import { bArt, iconA, tdE } from './art.ts';
import { dayIndex } from './meta.ts';
import { button, el, img, uiRoot } from './ui.ts';

/** 守岛的 DOM 界面公共件：选关页、驻守台选塔、克制表卡、预告条、分叉选择卡（守岛局内和基地的塔面板共用）、样式 */

/** 一句话说明这种塔是干什么的（克谁、怕谁不写在这里：一律从克制表 COUNTER 现算，见 towerCounter） */
export const TOWER_INFO: Partial<Record<BuildingKind, { line: string }>> = {
  cannon: { line: '单发重弹' },
  gunTower: { line: '射速快，一发一个' },
  mortar: { line: '抛射溅一片，贴脸打不到' },
  flame: { line: '近身喷一片' },
  harpoon: { line: '一发很重' },
  rocket: { line: '三连发，落点小溅射' },
  shock: { line: '蓄一下，震晕一小团' },
  sniper: { line: '射程最远，先点船长、船医，一发很重' },
};

/** 塔卡上的射程字：直接读核心 1 阶的射程（和地上的射程圈同一个数），1 格 = 100 单位 */
export function rangeText(kind: TdTowerKind): string {
  const r = tdBuildRange(kind, 1);
  const cells = (n: number): string => String(Math.round((n / UNIT) * 10) / 10);
  return r.minRange > 0 ? `射程 ${cells(r.range)} 格（近 ${cells(r.minRange)} 格内打不到）` : `射程 ${cells(r.range)} 格`;
}

// ---------------------------------------------------------------- 克制表（只显示 core 的 COUNTER，不另算）

export const DAMAGE_NAME: Readonly<Record<TdDamage, string>> = { shot: '枪弹', shell: '炮弹', fire: '火', blast: '爆破' };
export const ARMOR_NAME: Readonly<Record<TdArmor, string>> = { cloth: '布衣', heavy: '重甲', wood: '木船', air: '飞禽' };
/** 小徽记上的单字：塔卡、敌人图标、预告条、克制表共用，一眼对上 */
export const DAMAGE_CHAR: Readonly<Record<TdDamage, string>> = { shot: '枪', shell: '炮', fire: '火', blast: '爆' };
export const ARMOR_CHAR: Readonly<Record<TdArmor, string>> = { cloth: '布', heavy: '甲', wood: '船', air: '飞' };

/** 倍率怎么写：150 → ×1.5，0 → 打不到 */
export function pctText(pct: number): string {
  return pct <= 0 ? '打不到' : `×${pct / 100}`;
}

/** 倍率的档：克（> 100）、平（100）、弱（0–100）、打不到（0），格子按档上色 */
export function pctTier(pct: number): 'good' | 'even' | 'weak' | 'none' {
  return pct <= 0 ? 'none' : pct > 100 ? 'good' : pct < 100 ? 'weak' : 'even';
}

/** 一种塔克谁、怕谁、打不到谁（从 COUNTER 读，分叉例外另算在 branchDamageHint） */
export function towerCounter(kind: TdTowerKind): { dmg: TdDamage; good: TdArmor[]; weak: TdArmor[]; none: TdArmor[] } {
  const dmg = TD_TOWER_DAMAGE[kind];
  const row = COUNTER[dmg];
  return {
    dmg,
    good: TD_ARMORS.filter((a) => pctTier(row[a]) === 'good'),
    weak: TD_ARMORS.filter((a) => pctTier(row[a]) === 'weak'),
    none: TD_ARMORS.filter((a) => pctTier(row[a]) === 'none'),
  };
}

/** 建塔卡上的一行：伤害类型 + 克谁 + 怕谁，比如"炮弹 · 克重甲 · 打不到飞禽" */
export function towerCounterLine(kind: TdTowerKind): string {
  const c = towerCounter(kind);
  const out = [DAMAGE_NAME[c.dmg]];
  if (c.good.length) out.push(`克${c.good.map((a) => ARMOR_NAME[a]).join('、')}`);
  if (c.weak.length) out.push(`怕${c.weak.map((a) => ARMOR_NAME[a]).join('、')}`);
  if (c.none.length) out.push(`打不到${c.none.map((a) => ARMOR_NAME[a]).join('、')}`);
  return out.join(' · ');
}

/** 守岛 2.0 分叉卡上只写克制表的两条例外（TD_BRANCH_DAMAGE），别的旧说法（克首领、克铁甲）不写 */
export function branchDamageHint(id: string): string | undefined {
  const ex = TD_BRANCH_DAMAGE[id];
  if (!ex) return undefined;
  if (ex.airPct !== undefined) return `能打${ARMOR_NAME.air}（${pctText(ex.airPct)}）`;
  if (ex.burn) return `留下的火按${DAMAGE_NAME[ex.burn]}算`;
  return undefined;
}

/** 伤害 / 护甲的小徽记（单字圆章，颜色按种类）：塔卡、敌人、预告条、克制表共用 */
export function dmgBadge(d: TdDamage, parent?: HTMLElement): HTMLElement {
  const b = el('i', `hd-dmg d-${d}`, DAMAGE_CHAR[d], parent);
  b.title = `伤害：${DAMAGE_NAME[d]}`;
  return b;
}
export function armorBadge(a: TdArmor, parent?: HTMLElement): HTMLElement {
  const b = el('i', `hd-arm a-${a}`, ARMOR_CHAR[a], parent);
  b.title = `护甲：${ARMOR_NAME[a]}`;
  return b;
}

/** 敌人的小头像（行走第 1 帧）加护甲徽记；雾船、雾区里的再加一只"眼睛"（要照亮才打得到） */
export function enemyChip(kind: TdEnemyKind, n: number, fog: boolean, parent: HTMLElement, px = 26): HTMLElement {
  const c = el('span', 'hd-tden', undefined, parent);
  c.title = `${TD2_ENEMIES[kind].name}${fog ? '（在雾里，要照亮）' : ''}`;
  const f = tdE(kind, 'walk')[0];
  if (f) c.appendChild(img(f, px));
  armorBadge(TD_ENEMY_ARMOR[kind], c);
  if (fog) el('i', 'hd-eye', undefined, c).title = '在雾里：要灯塔或英雄照亮';
  if (n > 0) el('b', '', `×${n}`, c);
  return c;
}

/**
 * 克制表卡：伤害（行）× 护甲（列），格子写倍率、按档上色；表头的护甲列出这一类有哪些敌人的头像。
 * 默认收起成一个"克制表"按钮，点开展开（建塔菜单和敌人图鉴共用）。open 为 true 时直接展开。
 */
export function counterCard(parent: HTMLElement, open = false): HTMLElement {
  injectTdCss();
  const wrap = el('div', `hd-ctr${open ? ' on fixed' : ''}`, undefined, parent);
  const tog = button('', 'hd-btn-wood hd-ctr-tog', () => wrap.classList.toggle('on'), wrap);
  tog.title = '克制表（C）';
  el('span', '', '克制表', tog);
  el('small', '', '哪种伤害打哪种护甲', tog);
  const tb = el('table', 'hd-ctr-tb', undefined, wrap);
  const hr = el('tr', '', undefined, tb);
  el('th', '', '', hr);
  for (const a of TD_ARMORS) {
    const th = el('th', '', undefined, hr);
    armorBadge(a, th);
    el('span', '', ARMOR_NAME[a], th);
  }
  for (const d of TD_DAMAGES) {
    const tr = el('tr', '', undefined, tb);
    const th = el('th', '', undefined, tr);
    dmgBadge(d, th);
    el('span', '', DAMAGE_NAME[d], th);
    for (const a of TD_ARMORS) el('td', `c-${pctTier(COUNTER[d][a])} hd-n`, pctText(COUNTER[d][a]), tr);
  }
  const who = el('p', 'hd-ctr-who', undefined, wrap);
  for (const a of TD_ARMORS) {
    const s = el('span', '', undefined, who);
    armorBadge(a, s);
    s.append(
      (Object.keys(TD_ENEMY_ARMOR) as TdEnemyKind[])
        .filter((k) => TD_ENEMY_ARMOR[k] === a && k !== 'skiffling')
        .map((k) => TD2_ENEMIES[k].name)
        .join('、'),
    );
  }
  el('p', 'hd-ctr-who', '塔：枪弹 = 火枪塔、鱼叉炮、狙击塔、英雄；炮弹 = 加农炮、臼炮、火箭塔；火 = 喷火塔、留在地上的火；爆破 = 火药桶、地雷', wrap);
  // 展开后在建塔面板里只留克制表（其余收起让位），靠这个钮收回去；图鉴里克制表一直展开，没有这个钮
  button('收起克制表', 'hd-btn-wood hd-ctr-off', () => wrap.classList.remove('on'), wrap);
  return wrap;
}

/** 有的敌人要专门提醒怎么对付（图鉴和预告卡的补充行用；规则那边已经写过同一句就不重复） */
export const ENEMY_HINT: Partial<Record<TdEnemyKind, string>> = {
  grenadier: '掷弹兵：先用火',
  shield: '盾兵：先用火、爆',
};
/** 这一波里出现的、带提醒的敌人，对应的提醒句（没有规则已写的重复） */
export function enemyHints(p: WavePreview): string[] {
  const out: string[] = [];
  for (const e of waveEnemies(p)) {
    const h = ENEMY_HINT[e.kind];
    if (h && !(p.note ?? '').includes(h) && !out.includes(h)) out.push(h);
  }
  return out;
}

/** 预告条的"建议"：建议哪种伤害（tdPreview 已经按护甲占比挑好），没有敌人为空串 */
export function suggestText(p: Pick<WavePreview, 'suggest'>): string {
  return p.suggest ? `建议：${DAMAGE_NAME[p.suggest]}` : '';
}

/**
 * 「建议」只从这局能造的塔里挑：tdPreview 按占比最多的护甲挑理论最好的伤害，可前几关只有加农炮和火枪塔，
 * 建议「火」等于让玩家去找一座造不了的塔。按这波的护甲占比给每种能造的伤害打分（占比 × 克制倍率），取最高的；
 * 只有一种伤害可选、或最高分并列时不给建议（没得选、选哪个都一样）。unlocked 为空（没限制）时原样返回。
 */
export function fitSuggest(pv: readonly WavePreview[], unlocked: readonly TdTowerKind[] | undefined): WavePreview[] {
  if (!unlocked?.length) return [...pv];
  const dmgs = [...new Set(unlocked.map((k) => TD_TOWER_DAMAGE[k]))];
  return pv.map((p) => {
    if (!p.suggest) return p;
    if (dmgs.length < 2) return { ...p, suggest: null };
    let best = dmgs[0]!;
    let top = -1;
    let tie = false;
    for (const d of dmgs) {
      let v = 0;
      for (const a of TD_ARMORS) v += p.armorShare[a] * COUNTER[d][a];
      if (v > top) [best, top, tie] = [d, v, false];
      else if (v === top) tie = true;
    }
    return { ...p, suggest: tie ? null : best };
  });
}

/** 护甲占比从多到少（只列有的），预告条按这个顺序摆徽记 */
export function armorOrder(share: Record<TdArmor, number>): TdArmor[] {
  return TD_ARMORS.filter((a) => share[a] > 0).sort((a, b) => share[b] - share[a]);
}

/** 星数怎么算（选关页、驻守台面板上写；数从规则表读） */
export function starRule(): string {
  const [two, one] = TD2_STAR_LOST;
  return `一枚不丢 3 星 · 丢 ≤ ${two} 枚 2 星 · 丢 ≤ ${one} 枚 1 星 · 丢 ${TD2_LOSE_AT} 枚算输`;
}

/** 叫波按钮的第二行：叫了拿多少金、英雄技能快几秒（tdCallBonus 给的拍数换成秒，向下取整） */
export function callBonusText(gold: number, cdCutTicks: number): string {
  const sec = Math.floor(cdCutTicks / 20);
  const parts: string[] = [];
  if (gold > 0) parts.push(`+${gold} 金`);
  if (sec > 0) parts.push(`技能快 ${sec} 秒`);
  return parts.join(' · ');
}

/** 驻守台在岛上的哪一边（岛 22×22，按台子中心离岛心的方向）：选塔面板上让人知道是哪座台 */
export function spotSide(spot: Pick<TdGarrisonSpot, 'x' | 'y'>): string {
  const c = (ISLAND - 2) / 2;
  const dx = spot.x - c;
  const dy = spot.y - c;
  if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) return '岛中间';
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? '北边' : '南边';
  return dx < 0 ? '西边' : '东边';
}

/** 分叉的一句"克谁"提示（没写的就只显示说明） */
export const BRANCH_HINT: Record<string, string> = {
  'cannon.pierce': '克铁甲',
  'cannon.chain': '克工兵、首领',
  'cannon.grape': '克小艇、扎堆',
  'gunTower.marksman': '克鹦鹉',
  'gunTower.lighthouse': '克雾船',
  'gunTower.rapid': '通用',
  'mortar.fire': '克慢速的敌人',
  'mortar.heavy': '克首领',
  'harpoon.pierce': '克排队的长路',
  'harpoon.drag': '拖住敌人',
  'flame.napalm': '克铁甲、堵口子',
  'flame.long': '覆盖更远',
  'rocket.swarm': '克一大群',
  'rocket.flak': '克鹦鹉',
  'shock.quick': '震得更勤',
  'shock.long': '先震远处的',
  'shock.chain': '克人海，震得更宽',
  'shock.hammer': '克首领、铁甲',
  'mine.big': '范围大',
  'tar.fire': '克铁甲',
};

/** 这座塔现在能选哪一档的分叉：返回档（1/2）；选完了或还没到等级为 null */
export function pendingTier(kind: BuildingKind, level: number, current: readonly string[]): 1 | 2 | null {
  const tier = (current.length + 1) as 1 | 2;
  if (tier > 2 || level < BRANCH_LEVEL[tier]) return null;
  return branchOptions(kind, tier).length > 0 ? tier : null;
}

/**
 * 分叉选择卡：名字 + 一句描述 + 克制提示，点一张就选。
 * hint：克制提示从哪来，默认是基地 / 登陆战的 BRANCH_HINT；守岛传 branchDamageHint（只写克制表的例外）。
 * desc：分叉说明换一套（守岛传 TD_BRANCH_DESC，同一个分叉在守岛里效果不同），没给就用基地的。
 */
export function branchCards(parent: HTMLElement, kind: BuildingKind, level: number, current: readonly string[], onPick: (id: string) => void, hint: (id: string) => string | undefined = (id) => BRANCH_HINT[id], desc: (id: string) => string | undefined = () => undefined): void {
  const tier = pendingTier(kind, level, current);
  if (!tier) return;
  el('p', 'hd-td-sub', `${tier === 1 ? '3' : '6'} 级路线：选一条，选了不能改`, parent);
  const row = el('div', 'hd-td-branches', undefined, parent);
  for (const b of branchOptions(kind, tier)) {
    const c = el('button', 'hd-td-branch', undefined, row);
    c.type = 'button';
    c.disabled = branchError(kind, level, current, b.id) !== null;
    el('b', '', b.name, c);
    el('span', '', desc(b.id) ?? b.desc, c);
    const h = hint(b.id);
    if (h) el('small', '', h, c);
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!c.disabled) onPick(b.id);
    });
  }
}

export function branchName(id: string): string {
  return BRANCH_BY_ID.get(id)?.name ?? id;
}

/** 关卡带的"新机制"（关卡字段开关的那几样），名字给选关页写"新：…" */
function mechanics(lv: TdIslandLevel): string[] {
  const out: string[] = [];
  if (lv.tideOpen) out.push('潮水涨落');
  else if (lv.tide) out.push('潮汐');
  if (lv.fogZones) out.push('雾区');
  if (lv.flank) out.push('东边多一条路');
  if (lv.sapperJam) out.push('炸塔工兵');
  if (lv.bossSkill) out.push('首领发怒');
  if (lv.slots.some((s) => s.wreck)) out.push('沉船压台');
  return out;
}

/** 这一关新出现什么：对比同一张关表里前面的关（第一关写基础玩法）。i 是 levels 里的序号 */
export function levelIntro(levels: readonly TdIslandLevel[], i: number): string {
  const lv = levels[i];
  if (!lv) return '';
  if (i === 0) return '新：建塔、驻守台、英雄、叫下一波';
  const seen = new Set<TdEnemyKind>();
  const seenMech = new Set<string>();
  let boss = false;
  for (let k = 0; k < i; k++) {
    const q = levels[k]!;
    for (const m of mechanics(q)) seenMech.add(m);
    for (const w of q.waves) {
      if (w.boss) boss = true;
      for (const g of w.groups) seen.add(g.enemy);
    }
  }
  const fresh: string[] = mechanics(lv).filter((m) => !seenMech.has(m) && !(m === '潮汐' && seenMech.has('潮水涨落')));
  const added = new Set<TdEnemyKind>();
  for (const w of lv.waves) {
    for (const g of w.groups) {
      if (!seen.has(g.enemy) && !added.has(g.enemy)) {
        added.add(g.enemy);
        fresh.push(TD2_ENEMIES[g.enemy].name);
      }
    }
  }
  if (!boss && lv.waves.some((w) => w.boss)) fresh.push('首领波');
  return fresh.length ? `新：${fresh.join('、')}` : '新：更多更猛的波次';
}

/** 今天还能拿多少守岛收入（金币 / 木材）和上限 */
export function tdIncome(): { gold: number; wood: number; capGold: number; capWood: number } {
  const p = app.profile;
  const cap = tdDailyCap(p);
  const same = p.td?.day === dayIndex();
  return { gold: Math.max(0, cap.gold - (same ? (p.td?.gotGold ?? 0) : 0)), wood: Math.max(0, cap.wood - (same ? (p.td?.gotWood ?? 0) : 0)), capGold: cap.gold, capWood: cap.wood };
}

/** 选关页的章节：战役 18 关按章分好（样板关不在里面） */
export function campaignChapters(): readonly Td2ChapterInfo[] {
  return TD2_CHAPTERS.filter((c) => c.levels.length > 0);
}

/** "海盗来袭"的解锁条件：守下第 1 关（学会建塔、英雄、叫波再守自己的岛） */
export const HOME_UNLOCK = 'td01';
/** 选关页传给 onGo 的"海盗来袭"（不是关卡 id） */
export const HOME_ID = 'home';

/**
 * 选关页：分章（顶上三个章节标签，手机竖屏也放得下），每章 6 关，星数、建议主寨、新东西、锁；顶上是今日剩余守岛收入，
 * 下面并排两个玩法入口（海盗来袭、大潮无尽）。带驻守台的关点"出发"先弹选塔面板，挑好再开。
 * onGo 收到关卡 id，或者 HOME_ID（海盗来袭）。
 */
export function openTdSelect(onGo: (levelId: string) => void, onClose: () => void, onLive?: () => void, onTide?: () => void): () => void {
  injectTdCss();
  const p = app.profile;
  const hq = hqLevel(p);
  const chapters = campaignChapters();
  const all = chapters.flatMap((c) => c.levels);
  // 第一关一直开着（和规则核心一样）；其余按 tdLevelUnlocked
  const open = (i: number): boolean => i === 0 || (i > 0 && tdLevelUnlocked(p, all[i]!.id));
  // 左栏（标题、今日收入、玩法入口）和右栏（章节页签、关卡）：手机横屏并排，竖屏和电脑上下叠；分栏见 tdCss 的 .hd-tdsel-main
  const wrap = el('div', 'hd-tdsel hd-tdsel-main hd-tdpage', undefined, uiRoot());
  const left = el('div', 'hd-tdsel-l', undefined, wrap);
  const right = el('div', 'hd-tdsel-r', undefined, wrap);
  const head = el('div', 'hd-tdsel-head', undefined, left);
  el('h2', '', '守岛', head);
  const top = el('div', 'hd-tdsel-top', undefined, left);
  const inc = tdIncome();
  const bar = el('div', 'hd-td-income', undefined, top);
  el('small', '', '今日守岛收入还剩', bar);
  for (const [k, leftN, cap] of [['gold', inc.gold, inc.capGold], ['wood', inc.wood, inc.capWood]] as const) {
    const s = el('span', 'hd-td-inc', undefined, bar);
    s.appendChild(img(iconA(k), 20));
    el('b', 'hd-n', `${fmt(leftN)}`, s);
    el('small', 'hd-n', `/ ${fmt(cap)}`, s);
  }
  if (inc.gold <= 0 && inc.wood <= 0) el('small', 'hd-td-capnote', '今天的守岛收入满了，还能打，只拿星', bar);
  // 悬赏守岛（实盘）入口：没登录、单独部署（liveState.off）时 onLive 不传
  if (onLive) button('悬赏守岛（实盘）', 'hd-btn-gold hd-tdsel-live', onLive, top);
  const modes = el('div', 'hd-tdmodes', undefined, left);
  homeCard(modes, p.td?.stars[HOME_UNLOCK] ?? 0, () => onGo(HOME_ID));
  if (onTide) tideCard(modes, p.td?.stars[TIDE_UNLOCK] ?? 0, onTide);
  // 默认打开"下一关要打的"那一章：第一个还没拿到星的已解锁关；全拿过星就停在最后一章
  const nextIdx = all.findIndex((lv, i) => open(i) && (p.td?.stars[lv.id] ?? 0) === 0);
  const startChapter = nextIdx < 0 ? chapters.length - 1 : chapters.findIndex((c) => c.levels.some((l) => l.id === all[nextIdx]!.id));
  const tabs = el('div', 'hd-tdtabs', undefined, right);
  const theme = el('small', 'hd-tdtheme', undefined, right);
  el('small', 'hd-tdtheme hd-tdrule', starRule(), right);
  const list = el('div', 'hd-tdsel-list', undefined, right);
  // 手机上一章 6 关一屏放不下，章内再翻页（每页 3 关，360×640 这种矮屏每页 2 关）；电脑一章一屏全摆出来
  const pager = el('div', 'hd-tdpager', undefined, right);
  const mq2 = matchMedia(PAGED2_QUERY);
  const mq3 = matchMedia(PAGED3_QUERY);
  let page = 0;
  let curChapter = 0;

  let pick: (() => void) | null = null;
  const go = (lv: TdIslandLevel): void => {
    if (lv.garrison.length === 0) {
      app.tdPicks = [];
      stop();
      onGo(lv.id);
      return;
    }
    wrap.classList.add('away');
    pick = openGarrisonPick(lv, (picks) => {
      app.tdPicks = picks;
      pick = null;
      stop();
      onGo(lv.id);
    }, () => {
      pick = null;
      wrap.classList.remove('away');
    });
  };
  const show = (ci: number, pg = 0): void => {
    curChapter = ci;
    tabs.textContent = '';
    list.textContent = '';
    pager.textContent = '';
    chapters.forEach((c, k) => {
      const got = c.levels.reduce((n, l) => n + (p.td?.stars[l.id] ?? 0), 0);
      const tb = el('button', `hd-tdtab${k === ci ? ' on' : ''}`, undefined, tabs);
      tb.type = 'button';
      tb.dataset.chapter = String(c.id);
      el('b', '', c.name, tb);
      el('small', '', `${got}/${c.levels.length * 3} 星`, tb);
      tb.addEventListener('click', () => show(k));
    });
    page = pg;
    const ch = chapters[ci]!;
    theme.textContent = ch.theme ? `新东西：${ch.theme}` : '';
    theme.style.display = ch.theme ? '' : 'none';
    const per = mq2.matches ? 2 : mq3.matches ? 3 : ch.levels.length;
    const pages = Math.ceil(ch.levels.length / per);
    wrap.classList.toggle('paged', pages > 1);
    ch.levels.forEach((lv, j) => {
      if (Math.floor(j / per) !== page) return;
      const i = all.indexOf(lv);
      const locked = !open(i);
      const stars = p.td?.stars[lv.id] ?? 0;
      const c = el('div', `hd-tdcard${locked ? ' lock' : ''}`, undefined, list);
      el('span', 'hd-tdnum hd-n', String(j + 1), c);
      const mid = el('div', 'hd-tdmid', undefined, c);
      const nm = el('b', 'hd-tdname', lv.name, mid);
      // 守岛 2.0 换了关卡：以前拿过星的关挂"新版"角标（星数照算，可以再来）
      if (stars > 0) el('em', 'hd-tdnewver', '新版', nm).title = '关卡改版了：地图和波次都换了，以前的星照算';
      const st = el('span', 'hd-stars', undefined, mid);
      for (let n = 0; n < 3; n++) st.appendChild(img(iconA(n < stars ? 'star' : 'starEmpty'), 18));
      const b = button(locked ? '未解锁' : stars > 0 ? '再守' : '出发', locked ? 'hd-btn-plain' : 'hd-btn-gold', () => go(lv), c);
      b.disabled = locked;
      b.dataset.level = lv.id;
      const info = el('div', 'hd-tdinfo', undefined, c);
      const sm = el('small', hq < lv.hq ? 'hd-short' : '', `建议主寨 ${lv.hq} 级`, info);
      // 各段之间留一个普通空格当折行点（nowrap 段自己的首尾空格不算折行点）
      if (hq < lv.hq) {
        sm.append(' ');
        el('span', 'hd-nowrap', `（你 ${hq} 级，会偏难）`, sm);
      }
      // 括号里的话、驻守台的数各自不拆行：窄卡里折行只能整段换到下一行，不能把「阶）」单独剩在第二行
      if (lv.garrison.length) {
        sm.append(' ');
        el('span', 'hd-nowrap', `· 驻守台 ${lv.garrison.length} 座`, sm);
        sm.append(' ');
        el('span', 'hd-nowrap', `（最高 ${Math.max(...lv.garrison.map((g) => g.cap))} 阶）`, sm);
      }
      const nw = levelIntro(all, i);
      if (nw) el('small', 'hd-tdnew', nw, info);
      if (locked) {
        const prev = all[i - 1];
        el('small', 'hd-tdlock', `先守下「${prev?.name ?? ''}」（≥1 星）`, info);
      }
    });
    if (pages > 1) {
      const prevB = button('上一页', 'hd-btn-wood hd-tdpg-prev', () => show(ci, page - 1), pager);
      prevB.disabled = page <= 0;
      el('b', 'hd-n', `${page + 1} / ${pages}`, pager);
      const nextB = button('下一页', 'hd-btn-wood hd-tdpg-next', () => show(ci, page + 1), pager);
      nextB.disabled = page >= pages - 1;
    }
    const nx = nextTdUnlock(p);
    if (nx && all.some((l) => l.id === nx.id)) el('small', 'hd-tdsel-foot', `下一关「${nx.name}」：守下前一关拿到 1 星解锁`, list);
  };
  show(Math.max(0, startChapter));
  // 转屏、改窗口大小跨过"矮小竖屏"的界线时，重摆一遍（回到当前章第一页）
  const onMq = (): void => show(curChapter);
  mq2.addEventListener('change', onMq);
  mq3.addEventListener('change', onMq);
  const close = button('回岛', 'hd-btn-wood hd-tdsel-close', () => {
    stop();
    onClose();
  }, uiRoot());
  function stop(): void {
    mq2.removeEventListener('change', onMq);
    mq3.removeEventListener('change', onMq);
    pick?.();
    wrap.remove();
    close.remove();
  }
  return stop;
}

/** 矮小的竖屏手机：选关页一章的关卡分三页摆，每页 2 关（见 openTdSelect） */
const PAGED2_QUERY = '(max-width:420px) and (max-height:700px)';
/** 手机（竖屏窄、横屏矮）：一章分两页，每页 3 关 */
const PAGED3_QUERY = '(max-width:700px), (max-height:500px)';

/**
 * 驻守台选塔面板（开局前）：每座台一排卡片，卡上是基地里这种塔折出来的阶、带进来的分叉、伤害加成；"空着"也是一项。
 * 阶、分叉、加成都读 tdGarrisonOptions（规则核心按存档算，开局时 startTd2 再算一遍，不信界面）。
 * 返回关掉面板的函数。键盘：空格 / 回车开打、Esc 返回。
 */
export function openGarrisonPick(lv: TdIslandLevel, onGo: (picks: TdGarrisonPick[]) => void, onBack: () => void): () => void {
  injectTdCss();
  const p = app.profile;
  const optsOf = (cap: TdGarrisonSpot['cap']): TdGarrisonOption[] => tdGarrisonOptions(p, cap);
  // 上次给这一关挑过的（再守一次时）优先，否则按规则核心的推荐（tdAutoPicks）
  const prev = app.tdPicksFor === lv.id ? app.tdPicks : null;
  const picks = new Map<number, TdTowerKind>();
  for (const pk of prev ?? tdAutoPicks(p, lv.id)) picks.set(pk.spot, pk.kind);
  const wrap = el('div', 'hd-tdsel hd-tdgar hd-tdgar-main hd-tdpage', undefined, uiRoot());
  const head = el('div', 'hd-tdsel-head', undefined, wrap);
  el('h2', '', `${lv.name} · 驻守台`, head);
  el('p', 'hd-tdgar-note', '从自己的基地带塔上岛：阶数按基地里同种塔的最高等级折算（1–3 级 1 阶、4–6 级 2 阶、7–8 级 3 阶），不超过台子的上限。带上岛的塔照样能升级、能卖。', wrap);
  // 多座台：电脑上并排摆成几列；手机和矮屏放不下，改成顶上几个台子页签（页签上写这座台现在挑了什么），一次摆一座台的选项
  const mqTab = matchMedia('(max-width:700px), (max-height:700px)');
  const tabbed = lv.garrison.length > 1 && mqTab.matches;
  const tabEls: HTMLButtonElement[] = [];
  const tabBar = tabbed ? el('div', 'hd-tdgar-tabs', undefined, wrap) : null;
  const spotsBox = el('div', 'hd-tdgar-spots', undefined, wrap);
  spotsBox.style.setProperty('--spots', String(tabbed ? 1 : lv.garrison.length));
  const spotEls: HTMLElement[] = [];
  const showSpot = (k: number): void => {
    spotEls.forEach((e, i) => e.classList.toggle('off', tabbed && i !== k));
    tabEls.forEach((t, i) => t.classList.toggle('on', i === k));
  };
  lv.garrison.forEach((spot, si) => {
    const box = el('div', 'hd-tdgar-spot', undefined, spotsBox);
    spotEls.push(box);
    const tab = tabBar ? el('button', 'hd-tdgar-tab', undefined, tabBar) : null;
    if (tab) {
      tab.type = 'button';
      tab.addEventListener('click', () => showSpot(si));
      tabEls.push(tab);
    }
    const title = el('div', 'hd-tdgar-title', undefined, box);
    el('b', '', `${si + 1} 号台`, title);
    el('small', '', `${spotSide(spot)} · 最高 ${spot.cap} 阶`, title);
    const row = el('div', 'hd-tdgar-row', undefined, box);
    const opts = optsOf(spot.cap);
    const cards: HTMLButtonElement[] = [];
    const sync = (): void => {
      for (const c of cards) c.classList.toggle('on', (c.dataset.kind ?? '') === (picks.get(si) ?? ''));
      if (tab) {
        tab.textContent = '';
        el('b', '', `${si + 1} 号台`, tab);
        const k = picks.get(si);
        el('small', '', k ? towerName(k) : '空着', tab);
      }
    };
    const card = (o: TdGarrisonOption | null): void => {
      const c = el('button', 'hd-tdgar-card', undefined, row);
      c.type = 'button';
      c.dataset.kind = o?.kind ?? '';
      if (o) {
        c.appendChild(towerIcon(o.kind, Math.min(8, o.baseLevel), 40));
        el('b', '', towerName(o.kind), c);
        const t = el('span', 'hd-tdgar-tier', undefined, c);
        el('strong', '', `${o.tier} 阶`, t);
        if (o.tier < garrisonTier(o.baseLevel, 3)) el('small', '', '（台子封顶）', t);
        const tags = el('span', 'hd-tdgar-tags', undefined, c);
        dmgBadge(TD_TOWER_DAMAGE[o.kind], tags);
        for (const b of o.branch) el('small', 'hd-chip', branchName(b), tags);
        if (o.bonusPct > 0) el('small', 'hd-tdgar-bonus', `伤害 +${o.bonusPct}%`, c);
        c.title = `${towerName(o.kind)}：基地最高 ${o.baseLevel} 级 → ${o.tier} 阶`;
      } else {
        el('b', '', '空着', c);
        el('small', '', '开局当木台用', c);
      }
      c.addEventListener('click', () => {
        if (o) picks.set(si, o.kind);
        else picks.delete(si);
        sync();
      });
      cards.push(c);
    };
    for (const o of opts) card(o);
    card(null);
    if (opts.length === 0) el('small', 'hd-tdgar-empty', '基地里还没有防御塔：这座台只能空着（去基地造几座塔，下次就能带）', box);
    sync();
  });
  showSpot(0);
  el('small', 'hd-tdtheme hd-tdrule', starRule(), wrap);
  const btns = el('div', 'hd-td-btns hd-tdgar-btns', undefined, wrap);
  const back = (): void => {
    stop();
    onBack();
  };
  const start = (): void => {
    const out: TdGarrisonPick[] = [...picks.entries()].sort((a, b) => a[0] - b[0]).map(([spot, kind]) => ({ spot, kind }));
    app.tdPicksFor = lv.id;
    stop();
    onGo(out);
  };
  button('返回', 'hd-btn-plain', back, btns).title = '返回选关（Esc）';
  const go = button('开打', 'hd-btn-gold hd-tdgar-go', start, btns);
  go.title = '开打（空格）';
  const key = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') back();
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      start();
    }
  };
  window.addEventListener('keydown', key);
  function stop(): void {
    window.removeEventListener('keydown', key);
    wrap.remove();
  }
  return stop;
}

/** 选关页上的"海盗来袭"入口：守自己的岛，撑得越久奖励越多，不算星 */
function homeCard(parent: HTMLElement, stars: number, onHome: () => void): void {
  const locked = stars < 1;
  const c = el('div', `hd-tidecard hd-homecard${locked ? ' lock' : ''}`, undefined, parent);
  const mid = el('div', 'hd-tdmid', undefined, c);
  el('b', 'hd-tdname', locked ? '海盗来袭 · 未解锁' : '海盗来袭', mid);
  if (locked) el('small', 'hd-tdlock', `先守下「${TD2_LEVELS.find((l) => l.id === HOME_UNLOCK)?.name ?? '第 1 关'}」（≥1 星）`, mid);
  else {
    el('small', '', '守自己的岛：海盗一波比一波多，撑住几波拿几波的奖励', mid);
    el('small', 'hd-tidebest', '不算星 · 和关卡共用今日守岛收入', mid);
  }
  const go = button(locked ? '未解锁' : '出发', locked ? 'hd-btn-plain' : 'hd-btn-gold', onHome, c);
  go.disabled = locked;
  go.dataset.home = '1';
}

/** 大潮无尽的解锁条件：通过第一章第 3 关（≥ 1 星） */
export const TIDE_UNLOCK = 'td03';

/** 选关页上的"大潮"入口：本周第几周、这周的图名、我的本周最好；没解锁时显示锁和条件 */
function tideCard(parent: HTMLElement, stars: number, onTide: () => void): void {
  const week = beijingIsoWeek(Date.now());
  const label = weekLabel(week);
  const locked = stars < 1;
  const c = el('div', `hd-tidecard${locked ? ' lock' : ''}`, undefined, parent);
  const mid = el('div', 'hd-tdmid', undefined, c);
  el('b', 'hd-tdname', locked ? '大潮无尽 · 未解锁' : `大潮无尽 · ${week.year} 年第 ${week.week} 周`, mid);
  if (locked) {
    el('small', 'hd-tdlock', `先守下「${TD2_LEVELS.find((l) => l.id === TIDE_UNLOCK)?.name ?? '第 3 关'}」（第一章第 3 关，≥1 星）`, mid);
  } else {
    el('small', '', `本周的图：${tideMap(week).name}，所有人守同一座岛，比谁撑得久`, mid);
    const best = tideBest(label);
    el('small', 'hd-tidebest', best > 0 ? `我的本周最好：${tideLine(best)}` : '这周还没打过', mid);
  }
  const go = button(locked ? '未解锁' : '出发', locked ? 'hd-btn-plain' : 'hd-btn-gold', onTide, c);
  go.disabled = locked;
  go.dataset.tide = '1';
}

/** 一波预告里的敌人按种类合并（各路加起来），图鉴和"再下一波"用 */
export function waveEnemies(p: WavePreview): Array<{ kind: TdEnemyKind; n: number; fog: boolean }> {
  const out: Array<{ kind: TdEnemyKind; n: number; fog: boolean }> = [];
  for (const l of p.lanes) {
    for (const e of l.enemies) {
      const same = out.find((q) => q.kind === e.kind);
      if (same) {
        same.n += e.n;
        same.fog ||= e.fog;
      } else out.push({ kind: e.kind, n: e.n, fog: e.fog });
    }
  }
  return out;
}

/**
 * 顶部预告卡（一整块算一个牌子）：第一行"第 N 波"+ 护甲徽记（占比从多到少）+ 建议的伤害 + 倒数；
 * 第二行写潮水和关卡的补充（note），首领波整块变红；第三行"再下一波"只列护甲徽记。点它打开敌人图鉴。
 * tide：涨落的潮这一波开不开（不是涨落的关传 null），laneTitle：登陆路下标 → 北路 / 西路…
 */
export function planCard(box: HTMLElement, pv: readonly WavePreview[], o: { title: (w: number) => string; left: number; tide: string; laneTitle: (lane: number) => string }): void {
  box.textContent = '';
  const p = pv[0];
  box.classList.toggle('boss', !!p?.boss);
  if (!p) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  const r1 = el('div', 'hd-plan-r1', undefined, box);
  el('b', 'hd-plan-w', p.boss ? `首领波 · ${o.title(p.wave)}` : o.title(p.wave), r1);
  const arm = el('span', 'hd-plan-arm', undefined, r1);
  for (const a of armorOrder(p.armorShare)) {
    const s = el('span', '', undefined, arm);
    armorBadge(a, s);
    el('small', '', `${p.armorShare[a]}%`, s);
  }
  if (p.suggest) {
    const sg = el('span', 'hd-plan-sug', undefined, r1);
    dmgBadge(p.suggest, sg);
    sg.append(suggestText(p));
  }
  if (o.left >= 0) el('span', 'hd-plan-left', `${o.left}秒`, r1);
  const lanes = p.lanes.map((l) => `${o.laneTitle(l.lane)}${l.fly ? '（飞）' : ''}`);
  const note = [lanes.length ? `${lanes.join('、')}来` : '', o.tide, p.note ?? '', ...enemyHints(p)].filter(Boolean).join(' · ');
  if (note) el('div', 'hd-plan-note', note, box);
  const q = pv[1];
  if (q) {
    const r3 = el('div', 'hd-plan-next', undefined, box);
    el('small', '', q.boss ? '再下一波是首领波' : '再下一波', r3);
    for (const a of armorOrder(q.armorShare)) armorBadge(a, r3);
  }
}

/** 敌人图鉴（点预告卡打开）：下两波每一路什么敌人几个，再加一张展开的克制表 */
export function bestiary(box: HTMLElement, pv: readonly WavePreview[], title: (w: number) => string, laneTitle: (lane: number) => string): void {
  injectTdCss();
  const waves = el('div', 'hd-best-waves', undefined, box);
  // 竖屏手机放不下两波，一次看一波、翻页看另一波；别的尺寸两波一起摆
  const paged = pv.length > 1 && matchMedia('(max-width:700px) and (orientation:portrait)').matches;
  const draw = (pg: number): void => {
    waves.textContent = '';
    pv.forEach((p, k) => {
      if (paged && k !== pg) return;
      el('p', `hd-td-sub${p.boss ? ' boss' : ''}`, `${p.boss ? '首领波 · ' : ''}${title(p.wave)}${p.suggest ? ` · ${suggestText(p)}` : ''}`, waves);
      for (const l of p.lanes) {
        const row = el('div', 'hd-best-row', undefined, waves);
        el('small', 'hd-best-lane', `${laneTitle(l.lane)}${l.fly ? '（飞）' : ''}`, row);
        for (const e of l.enemies) enemyChip(e.kind, e.n, e.fog, row, 30);
      }
      const notes = [p.note ?? '', ...enemyHints(p)].filter(Boolean).join(' · ');
      if (notes) el('p', 'hd-td-note', notes, waves);
    });
    if (paged) {
      const pg2 = el('div', 'hd-best-pager', undefined, waves);
      button('上一波', 'hd-btn-wood', () => draw(pg - 1), pg2).disabled = pg <= 0;
      el('b', 'hd-n', `${pg + 1} / ${pv.length}`, pg2);
      button('下一波', 'hd-btn-wood', () => draw(pg + 1), pg2).disabled = pg >= pv.length - 1;
    }
  };
  draw(0);
  counterCard(box, true);
}

/** 守岛结算的标题：按星数分档（M1）。1 星带上丢了几枚；悬赏守岛和普通关共用，别各写一套 */
export function tdVerdict(stars: number, lost: number): string {
  if (stars >= 3) return '完美守住！';
  if (stars === 2) return '守住了！';
  if (stars === 1) return `勉强守住（丢了 ${lost} 枚）`;
  // 丢够 TD2_LOSE_AT 枚就算输，箱子里通常还剩一半，不能说「抢光了」
  return `没守住（丢了 ${lost} 枚）`;
}

/** 登陆路在哪个方向（岛外一圈：y<0 北、x<0 西、y 超出南、x 超出东）；潮水预告和结算用，让人知道"哪条路" */
export function laneName(l: { x: number; y: number }): string {
  if (l.y < 0) return '北路';
  if (l.x < 0) return '西路';
  if (l.y >= ISLAND) return '南路';
  if (l.x >= ISLAND) return '东路';
  return '那条路';
}

/**
 * 结算的星星：先摆好空 / 满的星，得到的星依次落下（每颗约 380ms，back 曲线回弹）。
 * at(i) 是第 i 颗落下的时刻（和音效共用 audio/result.ts 的时间轴）。返回那一行，调用方自己放到合适的位置。
 */
export function dropStars(parent: HTMLElement, stars: number, size: number, at: (i: number) => number = (i) => 250 + i * 300): HTMLElement {
  injectTdCss();
  const row = el('div', 'hd-stars hd-td-starrow', undefined, parent);
  for (let i = 0; i < 3; i++) {
    const im = img(iconA(i < stars ? 'star' : 'starEmpty'), size);
    if (i < stars) {
      im.style.opacity = '0';
      setTimeout(() => {
        if (!im.isConnected) return;
        im.style.opacity = '1';
        im.classList.add('hd-td-drop');
      }, at(i));
    }
    row.appendChild(im);
  }
  return row;
}

let cssDone = false;
export function injectTdCss(): void {
  if (cssDone) return;
  cssDone = true;
  const st = el('style');
  st.textContent = tdCss();
  document.head.appendChild(st);
}

/** 塔的缩略图（建塔菜单用） */
export function towerIcon(kind: BuildingKind, level: number, px: number): HTMLImageElement {
  return img(bArt(kind, level), px);
}

export const towerName = (kind: BuildingKind): string => BUILDINGS[kind].name;

function tdCss(): string {
  const c = P;
  const ink = c.ink!, cream = c.cream!, creamD = c.creamD!, gold = c.gold!, red = c.red!, redD = c.redD!;
  return `
.hd-ui .hd-tdsel { position:absolute; inset:0; z-index:20; pointer-events:auto; background:linear-gradient(${c.seaLight},${c.sea} 40%,${c.seaDeep}); overflow-y:auto; padding:56px 10px 24px; }
.hd-ui .hd-tdsel-head { display:flex; align-items:center; justify-content:center; margin:0 auto; width:min(100%,520px); padding-left:84px; padding-right:60px; min-height:44px; }
.hd-ui .hd-tdsel-head h2 { margin:0; font-size:20px; flex:1; text-align:center; text-shadow:0 2px 0 rgba(255,255,255,.5); }
.hd-ui .hd-td-income { width:min(100%,520px); margin:6px auto 10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:6px 12px; display:flex; flex-wrap:wrap; gap:4px 14px; align-items:center; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-td-inc { display:inline-flex; align-items:center; gap:4px; }
.hd-ui .hd-td-inc small { opacity:.7; }
.hd-ui .hd-td-capnote { flex-basis:100%; color:${redD}; font-weight:800; }
.hd-ui .hd-tidecard { display:flex; align-items:center; gap:10px; width:min(100%,520px); margin:0 auto 10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:8px 10px; box-shadow:0 3px 0 ${ink}; min-height:84px; }
.hd-ui .hd-tidecard.lock { filter:grayscale(.7); opacity:.8; }
.hd-ui .hd-tidecard .hd-btn { flex:none; min-width:74px; min-height:44px; }
.hd-ui .hd-tidebest { font-weight:800; opacity:1 !important; }
.hd-ui .hd-tdsel-live { display:block; width:min(100%,520px); min-height:44px; margin:0 auto 10px; }
.hd-ui .hd-tdtabs { width:min(100%,520px); margin:0 auto 6px; display:flex; gap:8px; }
.hd-ui .hd-tdtab { flex:1 1 0; min-width:0; min-height:48px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; padding:2px 4px; font:inherit; color:inherit; cursor:pointer; background:#fff8e6; border:3px solid ${ink}; border-radius:12px; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdtab b { font-size:14px; font-weight:900; }
.hd-ui .hd-tdtab small { font-size:12px; opacity:.85; }
.hd-ui .hd-tdtab.on { background:linear-gradient(${c.goldL},${gold}); transform:translateY(2px); box-shadow:0 1px 0 ${ink}; }
.hd-ui .hd-tdtheme { display:block; width:min(100%,520px); margin:0 auto 8px; font-size:14px; font-weight:800; color:#fff; text-shadow:0 1px 2px ${c.seaDark}; text-align:center; }
.hd-ui .hd-tdsel-list { width:min(100%,520px); margin:0 auto; display:flex; flex-direction:column; gap:10px; }
.hd-ui .hd-tdcard { display:flex; align-items:center; gap:10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:8px 10px; box-shadow:0 3px 0 ${ink}; min-height:84px; }
.hd-ui .hd-tdcard.lock { filter:grayscale(.7); opacity:.8; }
.hd-ui .hd-tdnum { flex:none; width:34px; height:34px; border-radius:50%; background:${gold}; border:3px solid ${ink}; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:16px; }
.hd-ui .hd-tdmid { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.hd-ui .hd-tdname { font-size:16px; font-weight:900; }
.hd-ui .hd-tdmid small { font-size:14px; opacity:.85; }
.hd-ui .hd-tdmid small.hd-short { color:${red}; opacity:1; font-weight:800; }
.hd-ui .hd-tdnew { color:${c.grassDD}; font-weight:800; opacity:1 !important; }
.hd-ui .hd-tdlock { color:${redD}; }
.hd-ui .hd-tdcard .hd-btn { flex:none; min-width:74px; }
.hd-ui .hd-tdsel-foot { text-align:center; color:#fff; text-shadow:0 1px 0 ${c.seaDark}; }
.hd-ui .hd-tdsel-close { position:absolute; top:6px; right:6px; z-index:31; }
/* 页面切换：选关页 → 驻守台面板，新页从右侧滑入，旧页往左淡出 */
.hd-ui .hd-tdpage { animation:hd-tdpagein .26s cubic-bezier(.2,.9,.3,1) both; transition:transform .26s cubic-bezier(.2,.9,.3,1), opacity .26s ease-out; }
.hd-ui .hd-tdpage.away { transform:translateX(-18%); opacity:0; pointer-events:none !important; }
@keyframes hd-tdpagein { 0% { transform:translateX(14%); opacity:0; } 100% { transform:none; opacity:1; } }
@keyframes hd-tdin { 0% { transform:translateY(-6px); opacity:0; } 100% { transform:none; opacity:1; } }
.hd-ui .hd-tdmodes { width:min(100%,520px); margin:0 auto; display:grid; grid-template-columns:1fr; gap:0 10px; }
@media (min-width:700px) { .hd-ui .hd-tdmodes { width:min(100%,760px); grid-template-columns:1fr 1fr; } }
.hd-ui .hd-tdmodes .hd-tidecard { width:auto; margin:0 0 10px; }
.hd-ui .hd-homecard { background:linear-gradient(#fff1d6,${cream}); }
.hd-ui .hd-tdnewver { display:inline-block; margin-left:6px; padding:0 6px; font-size:12px; font-style:normal; font-weight:900; color:#fff; background:${red}; border:2px solid ${ink}; border-radius:8px; vertical-align:2px; }
.hd-ui .hd-tdrule { opacity:.95; font-weight:700; }
.hd-ui .hd-tdgar { z-index:22; }
.hd-ui .hd-tdgar-note { width:min(100%,560px); margin:0 auto 10px; font-size:14px; color:#fff; text-shadow:0 1px 2px ${c.seaDark}; }
.hd-ui .hd-tdgar-spot { width:min(100%,560px); margin:0 auto 10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:8px 10px; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdgar-title { display:flex; align-items:baseline; gap:8px; margin-bottom:6px; }
.hd-ui .hd-tdgar-title b { font-size:16px; font-weight:900; }
.hd-ui .hd-tdgar-title small { font-size:14px; }
.hd-ui .hd-tdgar-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr)); gap:8px; }
.hd-ui .hd-tdgar-card { display:flex; flex-direction:column; align-items:center; gap:2px; min-height:118px; padding:5px 4px; border:3px solid ${ink}; border-radius:12px; background:#fff8e6; font:inherit; color:inherit; cursor:pointer; transition:transform .12s, box-shadow .12s; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdgar-card b { font-size:14px; }
.hd-ui .hd-tdgar-card small { font-size:12px; }
.hd-ui .hd-tdgar-card.on { background:linear-gradient(${c.goldL},${gold}); transform:translateY(-3px); box-shadow:0 5px 0 ${ink}, 0 0 0 3px #fff3b0; }
.hd-ui .hd-tdgar-card:active { transform:translateY(2px); box-shadow:0 1px 0 ${ink}; }
.hd-ui .hd-tdgar-card:disabled { opacity:.5; filter:grayscale(.7); cursor:default; }
@media (hover:hover) and (pointer:fine) { .hd-ui .hd-tdgar-card:hover:not(:disabled) { filter:brightness(1.08); } }
.hd-ui .hd-tdgar-tier strong { font-size:14px; font-weight:900; color:${c.grassDD}; }
.hd-ui .hd-tdgar-tags { display:flex; flex-wrap:wrap; gap:3px; justify-content:center; align-items:center; }
.hd-ui .hd-tdgar-tags .hd-chip { font-size:12px; padding:0 5px; }
.hd-ui .hd-tdgar-bonus { color:${c.grassDD}; font-weight:800; }
.hd-ui .hd-tdgar-empty { display:block; margin-top:6px; color:${redD}; font-weight:800; }
.hd-ui .hd-tdgar-btns { width:min(100%,560px); margin:12px auto 0; }
.hd-ui .hd-tdgar-btns .hd-btn { min-height:52px; font-size:16px; }

/* 选关页版面：左栏（标题、收入、玩法入口）+ 右栏（章节页签、关卡）。电脑上下叠、关卡 3 列；手机竖屏 1 列、章内翻页；
   手机横屏左右并排。比 layout.ts 的 .hd-ui.hd-skin 规则多一级，盖得过它的 720 宽 */
.hd-ui.hd-skin .hd-tdsel-main { display:flex; flex-direction:column; align-items:center; gap:8px; padding:6px 8px 8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-l, .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-r { width:min(100%,1040px); min-width:0; display:flex; flex-direction:column; gap:6px; }
.hd-ui.hd-skin .hd-tdsel-main :is(.hd-tdsel-head,.hd-td-income,.hd-tidecard,.hd-tdsel-live,.hd-tdtabs,.hd-tdtheme,.hd-tdsel-list,.hd-tdmodes,.hd-tdsel-top) { width:100%; margin:0; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-head { padding:0 136px 0 84px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-top { display:grid; grid-template-columns:1fr auto; gap:8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-td-income { padding:4px 12px; gap:2px 12px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-td-income > small:first-child { flex-basis:auto; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-live { display:flex; align-items:center; justify-content:center; min-height:44px; padding:0 20px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes .hd-tidecard { margin:0; min-height:0; padding:6px 10px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tidecard .hd-tdmid small { font-size:12px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdtab { min-height:44px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdtheme { margin:0; font-size:12px; line-height:1.25; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; align-content:start; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-foot { grid-column:1 / -1; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdcard { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:4px 8px; min-height:0; padding:6px 8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdcard .hd-btn { min-width:64px; min-height:44px; padding:0 8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo { grid-column:1 / -1; display:flex; flex-direction:column; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small { font-size:12px; line-height:1.3; opacity:.9; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small.hd-short { color:${red}; opacity:1; font-weight:800; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small.hd-tdnew { color:${c.grassDD}; font-weight:800; opacity:1; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small.hd-tdlock { color:${redD}; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdname { font-size:14px; line-height:1.2; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdnum { font-size:16px; }
.hd-ui.hd-skin .hd-tdpager { display:none; align-items:center; justify-content:center; gap:12px; }
.hd-ui.hd-skin .hd-tdsel-main.paged .hd-tdpager { display:flex; }
.hd-ui.hd-skin .hd-tdpager .hd-btn { min-width:88px; min-height:44px; }
.hd-ui.hd-skin .hd-tdpager b { min-width:48px; text-align:center; color:#fff; text-shadow:0 1px 2px ${c.seaDark}; }
@media (pointer:coarse), (max-width:959px) { .hd-ui.hd-skin .hd-tdsel-main .hd-tdnum { width:44px; height:44px; } }
/* 手机竖屏：顶上一行本来只是给大厅、回岛、设置钮留的，悬赏入口就放进这一行正中，标题让位 */
@media (max-width:700px) and (orientation:portrait) {
  .hd-ui.hd-skin .hd-tdsel-main { position:absolute; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-head h2 { display:none; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-live { position:absolute; top:6px; left:calc(50% - 70px); width:116px; padding:0 2px; font-size:12px; z-index:1; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income { flex-wrap:nowrap; padding:3px 8px; gap:2px 8px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income b { font-size:14px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income small { font-size:12px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income .hd-td-capnote { flex-basis:auto; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes .hd-tidecard { padding:4px 8px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes .hd-tdname { font-size:14px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tidecard .hd-tdmid small { line-height:1.2; }
}
@media (max-width:700px) {
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-top, .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes, .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-list { grid-template-columns:1fr; }
}
/* 手机横屏：左右并排，关卡 3 列、每张竖着摆（名字行 / 说明 / 按钮），一页 3 关 */
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui.hd-skin .hd-tdsel-main { flex-direction:row; align-items:flex-start; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-l { width:300px; flex:none; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-r { flex:1 1 0; width:auto; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-head { padding:0 0 0 84px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-top, .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes { grid-template-columns:1fr; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdtabs { padding-right:176px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-list { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdcard { grid-template-columns:auto minmax(0,1fr); }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdcard .hd-tdinfo { grid-row:2; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdcard .hd-btn { grid-column:1 / -1; grid-row:3; }
}

/* 驻守台选塔页：一座台一块；多座台电脑上并排成列，手机和矮屏用顶上的台子页签一次摆一座；选项卡横排（图标在左、字在右）省高度 */
.hd-ui .hd-tdgar-main { display:flex; flex-direction:column; align-items:center; gap:8px; padding:6px 8px 8px; }
.hd-ui .hd-tdgar-main > * { width:min(100%,1040px); margin:0; }
.hd-ui .hd-tdgar-main .hd-tdsel-head { padding:0 136px 0 84px; }
.hd-ui .hd-tdgar-main .hd-tdgar-note { font-size:12px; line-height:1.3; }
.hd-ui .hd-tdgar-main .hd-tdgar-spots { display:grid; grid-template-columns:repeat(var(--spots,1),minmax(0,1fr)); gap:8px; align-items:start; }
.hd-ui .hd-tdgar-main .hd-tdgar-spot { margin:0; width:auto; padding:6px 8px; }
.hd-ui .hd-tdgar-main .hd-tdgar-spot.off { display:none; }
.hd-ui .hd-tdgar-main .hd-tdgar-title { margin-bottom:8px; }
.hd-ui .hd-tdgar-main .hd-tdgar-row { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
.hd-ui .hd-tdgar-main .hd-tdgar-card { display:grid; grid-template-columns:minmax(0,1fr); align-content:center; justify-items:start; text-align:left; gap:0 6px; min-height:48px; padding:3px 6px; }
/* 名字列按内容宽、不许折行（窄卡上"加农炮"被挤成竖排一字一行，卡片高出一倍）；阶数和加成靠右占剩下的宽 */
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) { grid-template-columns:32px auto minmax(0,1fr); min-height:44px; }
.hd-ui .hd-tdgar-main .hd-tdgar-card > b { white-space:nowrap; }
.hd-ui .hd-tdgar-main .hd-tdgar-card > img { width:32px; height:32px; }
.hd-ui .hd-tdgar-main .hd-tdgar-bonus { white-space:nowrap; }
.hd-ui .hd-tdgar-main .hd-tdgar-card > img { grid-column:1; grid-row:1 / span 2; align-self:center; }
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) > b { grid-column:2; grid-row:1; }
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) > .hd-tdgar-tier { grid-column:3; grid-row:1; justify-self:end; }
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) > .hd-tdgar-tags { grid-column:2; grid-row:2; }
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) > .hd-tdgar-bonus { grid-column:3; grid-row:2; justify-self:end; }
.hd-ui .hd-tdgar-main .hd-tdgar-tags { justify-content:flex-start; }
.hd-ui .hd-tdgar-main .hd-tdgar-tabs { display:flex; gap:8px; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab { flex:1 1 0; min-width:0; min-height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2px 4px; font:inherit; color:inherit; cursor:pointer; background:#fff8e6; border:3px solid ${ink}; border-radius:12px; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab b { font-size:14px; font-weight:900; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab small { font-size:12px; opacity:.85; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab.on { background:linear-gradient(${c.goldL},${gold}); transform:translateY(2px); box-shadow:0 1px 0 ${ink}; }
.hd-ui .hd-tdgar-main .hd-tdgar-btns { margin-top:0; }
.hd-ui .hd-tdgar-main .hd-tdgar-btns .hd-btn { min-height:48px; }
/* 局内 */
.hd-ui .hd-td-bar { position:absolute; top:6px; left:92px; right:58px; display:flex; flex-wrap:nowrap; gap:6px; pointer-events:none !important; }
.hd-ui .hd-td-bar .hd-pill { min-width:0; }
.hd-ui .hd-td-speedtop { display:none; flex:none; min-width:44px; min-height:44px; padding:0 4px; }
.hd-ui .hd-plan-tog { display:none; position:relative; flex:none; min-width:44px; min-height:44px; padding:0 2px; font-size:12px; font-weight:900; white-space:nowrap; }
/* 驻守台选塔页盖在选关页上面时，底下那页不再参与排版和点按 */
.hd-ui .hd-tdsel:not(.hd-tdgar):has(~ .hd-tdgar) { visibility:hidden; }
.hd-ui .hd-plan-tog.hint { padding-right:12px; }
.hd-ui .hd-plan-tog.hint::after { content:''; position:absolute; top:3px; right:3px; width:10px; height:10px; border-radius:50%; background:#e0402f; border:2px solid ${ink}; } /* 红点收在钮里：探出去会把钮的可滚宽度撑大；钮右边让出一截，免得压住「4/8」 */
@media (max-width:520px) {
  .hd-ui .hd-td-bar { gap:4px; }
  .hd-ui .hd-td-bar .hd-tw { display:none; }
  .hd-ui .hd-td-bar .hd-pill { padding:0 8px 0 4px; gap:4px; }
  .hd-ui .hd-td-bar .hd-pill b { font-size:14px; }
}
.hd-ui .hd-td-bar2 { position:absolute; top:58px; left:6px; right:6px; display:flex; gap:6px; align-items:center; pointer-events:none !important; }
.hd-ui .hd-td-bar2 > * { pointer-events:auto; }
/* 克制表的小徽记：伤害（方章）、护甲（圆章），单字 + 颜色，塔卡、敌人、预告、克制表都用这一套 */
.hd-ui .hd-dmg, .hd-ui .hd-arm { display:inline-flex; align-items:center; justify-content:center; flex:none; width:20px; height:20px; font:900 12px/1 system-ui,sans-serif; font-style:normal; color:#fff; border:2px solid ${ink}; text-shadow:0 1px 0 rgba(0,0,0,.45); vertical-align:middle; }
.hd-ui .hd-dmg { border-radius:5px; }
.hd-ui .hd-arm { border-radius:50%; }
.hd-ui .hd-dmg.d-shot { background:#3f6fa8; } .hd-ui .hd-dmg.d-shell { background:#5a4636; } .hd-ui .hd-dmg.d-fire { background:#e0602f; } .hd-ui .hd-dmg.d-blast { background:#b8322a; }
.hd-ui .hd-arm.a-cloth { background:#b98f55; } .hd-ui .hd-arm.a-heavy { background:#66737f; } .hd-ui .hd-arm.a-wood { background:#86562b; } .hd-ui .hd-arm.a-air { background:#3d9ad1; }
.hd-ui .hd-tden { position:relative; display:inline-flex; align-items:flex-end; gap:1px; }
.hd-ui .hd-tden .hd-arm { position:absolute; left:-4px; bottom:-2px; width:16px; height:16px; font-size:12px; border-width:1.5px; }
.hd-ui .hd-tden b { font-size:14px; font-weight:900; }
.hd-ui .hd-eye { display:inline-block; width:16px; height:10px; border:2px solid ${ink}; border-radius:50%/60%; background:radial-gradient(circle,${ink} 0 2.5px,#fff 3px); position:absolute; right:-6px; top:-4px; }
/* 克制表卡：默认收成一个按钮，.on 展开 */
.hd-ui .hd-ctr { margin:8px 0 2px; }
.hd-ui .hd-ctr-tog { width:100%; min-height:44px; flex-direction:row; gap:8px; justify-content:center; }
.hd-ui .hd-ctr-tog small { font-size:12px; opacity:.85; }
.hd-ui .hd-ctr-tb, .hd-ui .hd-ctr-who { display:none; }
.hd-ui .hd-ctr.on .hd-ctr-tb { display:table; }
.hd-ui .hd-ctr.on .hd-ctr-who { display:flex; }
.hd-ui .hd-ctr.on .hd-ctr-tog { display:none; }
.hd-ui .hd-ctr-tb { width:100%; border-collapse:separate; border-spacing:3px; font-size:14px; animation:hd-tdin .22s cubic-bezier(.3,1.4,.5,1); }
.hd-ui .hd-ctr-tb th { font-weight:800; font-size:12px; white-space:nowrap; text-align:center; }
.hd-ui .hd-ctr-tb th span { margin-left:3px; }
.hd-ui .hd-ctr-tb td { text-align:center; font-weight:900; border:2px solid ${ink}; border-radius:7px; padding:3px 2px; background:#fff8e6; }
.hd-ui .hd-ctr-tb td.c-good { background:#9fe08a; }
.hd-ui .hd-ctr-tb td.c-weak { background:#ffc9a0; }
.hd-ui .hd-ctr-tb td.c-none { background:#cfcfcf; color:#5b5b5b; font-size:12px; }
.hd-ui .hd-ctr-who { flex-wrap:wrap; gap:2px 10px; margin:4px 0 0; font-size:12px; }
.hd-ui .hd-ctr-who span { display:inline-flex; align-items:center; gap:3px; }
/* 顶部预告卡：一整块，首领波变红；点它打开敌人图鉴 */
.hd-ui .hd-td-plan { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 110px); left:6px; max-width:min(360px,calc(100% - 12px)); z-index:30; pointer-events:auto; cursor:pointer; padding:4px 9px 5px; border:2px solid ${ink}; border-radius:12px; background:${cream}; box-shadow:0 2px 0 ${ink}; font-size:14px; font-weight:800; line-height:1.25; transition:transform .18s cubic-bezier(.3,1.5,.5,1); }
.hd-ui .hd-td-plan:active { transform:translateY(2px); box-shadow:0 0 0 ${ink}; }
.hd-ui .hd-td-plan.fresh { animation:hd-tdplanin .5s cubic-bezier(.3,1.5,.5,1); }
.hd-ui .hd-td-plan.boss { background:linear-gradient(#ffd0c4,#ffab98); border-color:${redD}; }
.hd-ui .hd-plan-r1 { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.hd-ui .hd-plan-w { font-size:14px; font-weight:900; }
.hd-ui .hd-plan-arm { display:inline-flex; gap:5px; }
.hd-ui .hd-plan-arm span { display:inline-flex; align-items:center; gap:2px; }
.hd-ui .hd-plan-arm small { font-size:12px; }
.hd-ui .hd-plan-sug { display:inline-flex; align-items:center; gap:3px; padding:0 6px 0 2px; border-radius:9px; background:#fff1c4; border:2px solid ${ink}; }
.hd-ui .hd-plan-left { margin-left:auto; font-variant-numeric:tabular-nums; }
.hd-ui .hd-plan-note { font-size:12px; margin-top:2px; opacity:.9; }
.hd-ui .hd-plan-next { display:flex; align-items:center; gap:3px; margin-top:2px; font-size:12px; opacity:.85; }
.hd-ui .hd-plan-next .hd-arm { width:16px; height:16px; font-size:12px; border-width:1.5px; }
@keyframes hd-tdplanin { 0% { transform:translateY(-10px) scale(.92); opacity:0; } 60% { transform:scale(1.04); opacity:1; } 100% { transform:none; } }
@media (hover:hover) and (pointer:fine) { .hd-ui .hd-td-plan:hover { filter:brightness(1.06); } }
/* 敌人图鉴 */
.hd-ui .hd-best-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:3px 0 5px; border-bottom:1px dashed rgba(43,26,21,.25); }
.hd-ui .hd-best-lane { min-width:52px; font-weight:800; }
.hd-ui .hd-td-sub.boss { color:${redD}; }
.hd-ui .hd-td-bar .hd-pill b, .hd-ui .hd-td-bar2 .hd-pill b { font-variant-numeric:tabular-nums; }
.hd-ui .hd-pill.bump { animation:hd-tdbump .4s; }
.hd-ui .hd-pill.hurt { background:#ffd6cf; border-color:${redD}; animation:hd-tdbump .5s; }
.hd-ui .hd-td-flash { position:absolute; inset:0; background:radial-gradient(transparent 40%,rgba(217,59,50,.55)); opacity:0; pointer-events:none !important; z-index:35; }
.hd-ui .hd-td-flash.on { animation:hd-tdflash .6s ease-out; }
.hd-ui .hd-td-banner { position:absolute; left:0; right:0; top:calc(env(safe-area-inset-top, 0px) + 110px); z-index:44; text-align:center; pointer-events:none !important; animation:hd-tdban .9s ease-out forwards; }
.hd-ui .hd-td-banner span { display:inline-block; background:linear-gradient(${c.goldL},${gold}); border:4px solid ${ink}; border-radius:18px; padding:3px 20px; font-size:20px; font-weight:900; box-shadow:0 5px 0 ${ink}; }
.hd-ui .hd-td-banner.boss span { background:linear-gradient(${c.redL},${red}); color:#fff; }
.hd-ui .hd-td-banner small { display:block; margin-top:4px; font-size:14px; color:#fff; text-shadow:0 1px 3px ${ink}; font-weight:800; }
.hd-ui .hd-td-bottom { position:absolute; left:0; right:0; bottom:0; padding:6px 8px 8px; display:flex; gap:8px; justify-content:center; align-items:flex-end; pointer-events:none !important; }
.hd-ui .hd-td-bottom > * { pointer-events:auto; }
.hd-ui .hd-hint { position:absolute; left:50%; bottom:92px; transform:translateX(-50%); white-space:nowrap; pointer-events:none !important; }
.hd-ui .hd-td .hd-padhint { bottom:calc(150px + env(safe-area-inset-bottom,0px)); font-size:16px; font-weight:900; background:#ffe885; color:#2b1a15; box-shadow:0 3px 0 #2b1a15; z-index:7; }
.hd-ui .hd-td:has(.hd-td-sheet) .hd-padhint { display:none; }
.hd-ui .hd-td-skill { position:relative; width:68px; min-height:68px; padding:0; flex-direction:column; gap:0; font-size:12px; overflow:hidden; }
.hd-ui .hd-td-skill.sel { background:linear-gradient(${c.goldL},${gold}); transform:translateY(-4px); }
.hd-ui .hd-td-skill .hd-cd { position:absolute; inset:0; background:conic-gradient(rgba(20,35,58,.62) var(--cd,0deg), transparent 0); pointer-events:none; }
.hd-ui .hd-td-skill.cool { filter:grayscale(.6); }
.hd-ui .hd-td-skill b { position:relative; font-size:12px; }
/* 竖屏放大时屏外东西的边缘指示：敌人是红底箭头加数量（点了镜头移过去），空木台是不挡点按的小金标 */
.hd-ui .hd-td-edges { position:absolute; inset:0; pointer-events:none; z-index:6; }
/* 屏外的提示三种，都带指向那边的箭头：红圈 = 敌人（剑 + 个数，点一下镜头过去）；木牌加号 = 能造塔的空木台；黄旗 = 路口 / 关口 */
.hd-ui .hd-td-edge { position:absolute; left:-22px; top:-22px; width:44px; min-width:44px; height:44px; min-height:44px; padding:0; border-radius:50%; pointer-events:auto; background:rgba(150,30,24,0.9); border:2px solid #ffd27a; color:#fff; font-size:14px; font-weight:900; line-height:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; }
.hd-ui .hd-td-edge .hd-img { flex:none; }
.hd-ui .hd-td-edge i { position:absolute; inset:0; pointer-events:none; }
.hd-ui .hd-td-edge i::after { content:''; position:absolute; right:-4px; top:50%; margin-top:-8px; border:8px solid transparent; border-left:10px solid #ffd27a; border-right:0; filter:drop-shadow(0 1px 0 rgba(0,0,0,.6)); }
.hd-ui .hd-td-edge b { position:relative; }
.hd-ui .hd-td-edge.slot, .hd-ui .hd-td-edge.gate { left:-15px; top:-15px; width:30px; min-width:30px; height:30px; min-height:30px; border-radius:6px; transform-origin:center; pointer-events:none; background:#d9a766; border:2px solid #6b4a1e; color:#4a2e12; font-size:16px; }
.hd-ui .hd-td-edge.slot i::after, .hd-ui .hd-td-edge.gate i::after { right:-3px; margin-top:-6px; border-width:6px; border-left-width:8px; border-left-color:#ffd27a; }
.hd-ui .hd-td-edge.slot b::before { content:'+' attr(data-n); }
.hd-ui .hd-td-edge.gate { background:transparent; border-color:transparent; }
.hd-ui .hd-td-edge.gate b { display:block; width:4px; height:26px; background:#6b4a1e; border-radius:2px; }
.hd-ui .hd-td-edge.gate b::before { content:''; position:absolute; left:4px; top:1px; width:14px; height:11px; background:#f2c14e; border:2px solid #6b4a1e; border-radius:2px 5px 5px 2px; box-sizing:border-box; }
.hd-ui .hd-td-call { position:relative; flex:1 1 auto; max-width:230px; min-height:68px; flex-direction:column; gap:0; font-size:16px; }
.hd-ui .hd-td-call small { font-size:12px; font-weight:800; }
.hd-ui .hd-td-sheet { position:absolute; left:0; right:0; margin:0 auto; bottom:0; width:min(100%,560px); max-height:62%; overflow:auto; z-index:36; pointer-events:auto; background:${cream}; border:3px solid ${ink}; border-bottom:0; border-radius:18px 18px 0 0; padding:10px 10px 12px; box-shadow:0 -4px 0 rgba(43,26,21,.25); }
.hd-ui .hd-td-sheet h2 { margin:0; font-size:16px; font-weight:900; flex:1; }
.hd-ui .hd-td-towers { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.hd-ui .hd-td-tower { display:flex; flex-direction:column; align-items:center; gap:1px; min-height:112px; padding:4px 3px; border:3px solid ${ink}; border-radius:12px; background:#fff8e6; font:inherit; color:inherit; cursor:pointer; }
.hd-ui .hd-td-tower:disabled { opacity:.5; filter:grayscale(.6); cursor:default; }
.hd-ui .hd-td-tower b { font-size:14px; }
.hd-ui .hd-td-tower small { font-size:12px; line-height:1.2; text-align:center; }
.hd-ui .hd-td-tower .hd-td-price { display:inline-flex; align-items:center; gap:2px; font-weight:900; }
.hd-ui .hd-td-tower .hd-td-price.short { color:${red}; }
.hd-ui .hd-td-tower .hd-td-ctr { display:flex; align-items:center; gap:3px; flex-wrap:wrap; justify-content:center; font-weight:800; }
.hd-ui .hd-td-tower .hd-td-ctr .hd-arm { width:16px; height:16px; font-size:12px; border-width:1.5px; }
.hd-ui .hd-td-tower .hd-td-ctr .ng { opacity:.55; text-decoration:line-through; }
.hd-ui .hd-td-tower .hd-key { left:4px; top:3px; }
.hd-ui .hd-td-tower { position:relative; }
.hd-ui .hd-td-tower:active:not(:disabled) { transform:translateY(2px); }
.hd-ui .hd-td-acts { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.hd-ui .hd-td-acts .hd-btn { flex:1 1 140px; min-height:48px; }
.hd-ui .hd-td-sell.arm { background:linear-gradient(#ffb7a8,#e0402f) !important; color:#fff; }
.hd-ui .hd-td-tierchip { font-weight:900; }
.hd-ui .hd-td-sub { margin:8px 0 4px; font-size:14px; font-weight:800; }
.hd-ui .hd-td-branches { display:grid; grid-template-columns:repeat(auto-fit,minmax(104px,1fr)); gap:8px; }
.hd-ui .hd-td-branch { display:flex; flex-direction:column; gap:1px; align-items:flex-start; min-height:76px; padding:6px 8px; border:3px solid ${ink}; border-radius:12px; background:linear-gradient(#fff8e6,${creamD}); font:inherit; color:inherit; text-align:left; cursor:pointer; }
.hd-ui .hd-td-branch:disabled { opacity:.5; }
.hd-ui .hd-td-branch b { font-size:14px; }
.hd-ui .hd-td-branch span { font-size:12px; }
.hd-ui .hd-td-branch small { font-size:12px; color:${c.grassDD}; font-weight:800; }
.hd-ui .hd-td-note { margin:8px 0 0; font-size:12px; opacity:.75; }
.hd-ui .hd-td-sheet .hd-td-block { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 8px; padding:6px 8px; border-radius:10px; background:rgba(200,60,40,.16); border:2px solid rgba(200,60,40,.55); font-size:14px; }
.hd-ui .hd-td-sheet .hd-td-block .hd-btn { min-height:40px; padding:0 12px; font-size:14px; }
.hd-ui .hd-td-result { text-align:center; max-width:360px; }
.hd-ui .hd-td-result h2 { margin:0 0 4px; font-size:24px; }
.hd-ui .hd-td-kept { display:flex; align-items:center; justify-content:center; gap:8px; margin:6px 0; font-size:16px; font-weight:900; }
.hd-ui .hd-td-line { margin:4px 0 !important; font-size:14px !important; }
.hd-ui .hd-td-line.cap { color:${redD}; font-weight:800; }
.hd-ui .hd-td-stolen { position:absolute; z-index:61; left:50%; top:calc(env(safe-area-inset-top, 0px) + 168px); transform:translateX(-50%); white-space:nowrap; font-size:14px; font-weight:900; color:#fff; background:#d8463a; border:2px solid #2b1d14; border-radius:10px; padding:1px 8px; pointer-events:none; transition:opacity .4s; }
.hd-ui .hd-td-stolen.off { opacity:0; }
.hd-ui .hd-td-store { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 118px); left:50%; transform:translateX(-50%); max-width:calc(100% - 12px); white-space:nowrap; font-size:14px; z-index:62; display:flex; gap:6px; padding:4px 10px 4px 8px; background:${cream}; border:3px solid ${ink}; border-radius:20px; box-shadow:0 2px 0 ${ink}; align-items:center; pointer-events:none; }
.hd-ui .hd-td-store span { display:inline-flex; align-items:center; gap:3px; }
.hd-ui .hd-td-store.bump { animation:hd-tdstorebump .3s; }
.hd-ui .hd-td-btns { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.hd-ui .hd-td-btns .hd-btn { flex:1 1 100px; }
.hd-ui .hd-bar-branch { margin:8px 0; }
.hd-ui .hd-td-drop { animation:hd-tddrop .38s cubic-bezier(.3,1.5,.5,1); }
.hd-ui .hd-td-starrow { display:flex; justify-content:center; margin:4px 0; }
.hd-ui .hd-td-paused { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 110px); right:6px; z-index:31; padding:2px 10px; border:2px solid ${ink}; border-radius:12px; background:#ffe885; font-size:14px; font-weight:900; box-shadow:0 2px 0 ${ink}; pointer-events:none !important; display:none; }
.hd-ui .hd-td-paused.on { display:block; animation:hd-tdpause .25s ease-out; }
.hd-ui .hd-screen .hd-hint.bad { background:${red}; color:#fff; font-weight:900; }
.hd-ui .hd-td-sheet .hd-td-branch small { font-size:12px; }
@keyframes hd-tdpause { 0% { transform:translateY(-8px); opacity:0; } 100% { transform:none; opacity:1; } }
/* 手机竖屏：面板做成矮一点的底部抽屉，上面的岛和敌人还看得见；分叉卡竖排成行 */
@media (max-width:600px) and (orientation:portrait) {
  .hd-ui .hd-td-sheet { max-height:88%; padding:8px 8px 10px; }
  .hd-ui .hd-td-sheet.build { max-height:88%; }
  .hd-ui .hd-td-sheet .hd-desc { margin:2px 0 6px; font-size:12px; }
  .hd-ui .hd-td-towers { gap:8px; }
  .hd-ui .hd-td-tower { min-height:92px; padding:2px 2px; }
  .hd-ui .hd-td-branches { grid-template-columns:1fr; gap:8px; }
  .hd-ui .hd-td-branch { flex-direction:row; flex-wrap:wrap; align-items:center; min-height:44px; padding:3px 8px; gap:0 8px; }
  .hd-ui .hd-td-branch b { font-size:14px; }
  .hd-ui .hd-td-sub { margin:4px 0 4px; }
  .hd-ui .hd-bar-branch { margin:4px 0; }
  /* 预告卡占左上，"已暂停"挪到它下面一行的右边，不叠在一起 */
  .hd-ui .hd-td-paused { top:calc(env(safe-area-inset-top, 0px) + 156px); }
  .hd-ui .hd-td-plan { max-width:calc(100% - 12px); padding:3px 7px 4px; }
  .hd-ui .hd-tdgar-row { grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); }
}
@media (max-height:500px) { .hd-ui .hd-td-sheet { max-height:72%; } }


/* 克制表展开（建塔面板里）：其余内容让位，只留表和"收起"钮；图鉴里的表一直展开 */
.hd-ui .hd-ctr-off { display:none; width:100%; min-height:44px; margin-top:8px; }
.hd-ui .hd-ctr.on:not(.fixed) .hd-ctr-off { display:flex; }
.hd-ui .hd-td-sheet:not(.hd-td-best):has(.hd-ctr.on) > :not(.hd-head):not(.hd-ctr) { display:none; }
.hd-ui .hd-best-pager { display:flex; align-items:center; justify-content:center; gap:12px; margin-top:8px; }
.hd-ui .hd-best-pager .hd-btn { min-width:88px; min-height:44px; }
.hd-ui .hd-td-price b, .hd-ui .hd-td-store b, .hd-ui .hd-td-kept b { font-variant-numeric:tabular-nums; }
@media (max-width:600px) and (orientation:portrait) {
  .hd-ui .hd-ctr-tb { border-spacing:2px; }
  .hd-ui .hd-ctr-tb td { padding:2px 1px; }
  .hd-ui .hd-ctr-who { margin:2px 0 0; font-size:12px; line-height:1.25; }
  .hd-ui .hd-best-row { padding:1px 0 3px; }
}
/* 造塔卡：横排（图标在左，名字和造价一行，下面是一句话、射程、克谁），电脑和竖屏两列、横屏四列，八种塔也放得下 */
.hd-ui .hd-td-towers { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.hd-ui .hd-td-tower { display:grid; grid-template-columns:44px minmax(0,1fr) auto; column-gap:6px; align-content:center; justify-items:start; text-align:left; min-height:0; padding:2px 6px 2px 8px; }
.hd-ui .hd-td-tower > img { grid-column:1; grid-row:1 / span 4; align-self:center; }
.hd-ui .hd-td-tower > b { grid-column:2; grid-row:1; }
.hd-ui .hd-td-tower > .hd-td-price { grid-column:3; grid-row:1; justify-self:end; }
.hd-ui .hd-td-tower > small { grid-column:2 / -1; text-align:left; }
.hd-ui .hd-td-tower .hd-td-ctr { justify-content:flex-start; }
.hd-ui .hd-td-tower .hd-key { top:2px; left:2px; }
/* 窄竖屏（360 一类）：名字列太窄会把"加农炮"挤成一字一行；图标缩到 32 只占前两行，说明、射程、克谁铺满整张卡宽 */
@media (max-width:420px) {
  /* 矮竖屏造塔面板：塔卡行距和说明行高、面板内边距收紧，八种塔 + 克制表钮一屏放下 */
  .hd-ui .hd-td-sheet.build { padding-top:6px; padding-bottom:8px; }
  .hd-ui .hd-td-sheet.build .hd-desc { margin:2px 0 4px; }
  .hd-ui .hd-td-tower { row-gap:0; }
  .hd-ui .hd-td-tower small { line-height:1.1; }
  .hd-ui .hd-td-towers { gap:8px; }
  .hd-ui .hd-td-tower { grid-template-columns:32px minmax(0,1fr) auto; padding:1px 5px 1px 6px; }
  .hd-ui .hd-td-tower > img { grid-row:1 / span 2; width:32px; height:32px; }
  .hd-ui .hd-td-tower > b { white-space:nowrap; }
  .hd-ui .hd-td-tower > small { grid-column:1 / -1; }
  .hd-ui .hd-td-tower > small:first-of-type { grid-column:2 / -1; }
}
/* 小屏上面板顶到右上角，会和齿轮、撤退钮叠在一起；面板开着时整局暂停，先把这两个藏起来 */
@media (max-height:500px), (max-width:420px) {
  .hd-ui.hd-skin:has(.hd-td > .hd-td-sheet) .hd-mute, .hd-ui.hd-skin .hd-td:has(> .hd-td-sheet) .hd-btn-red { visibility:hidden; }
}
/* 手机横屏：面板铺满宽度（只让出顶上一行），造塔卡横排（图标在左、字在右）一行四张；图鉴左边两波、右边克制表 */
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui.hd-skin .hd-td > .hd-td-sheet { left:6px; right:6px; width:auto; max-height:calc(100% - 8px); margin:0; padding:6px 10px 8px; }
  .hd-ui .hd-td-sheet .hd-desc { margin:2px 0 4px; }
  .hd-ui .hd-td-towers { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .hd-ui .hd-ctr { margin:8px 0 0; }
  .hd-ui .hd-tdgar-main { padding-top:3px; padding-bottom:3px; }
  .hd-ui .hd-tdgar-main .hd-tdgar-spot { padding-top:4px; padding-bottom:4px; }
  .hd-ui .hd-tdgar-main .hd-tdgar-card { padding-top:2px; padding-bottom:2px; }
  .hd-ui .hd-td-sheet.hd-td-best { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); column-gap:14px; align-content:start; }
  .hd-ui .hd-td-sheet.hd-td-best > .hd-head { grid-column:1 / -1; }
  .hd-ui .hd-td-best .hd-best-waves { grid-column:1; }
  .hd-ui .hd-td-best .hd-ctr { grid-column:2; grid-row:2; margin:0; }
}

/* 守岛 2.0 新件的皮肤（羊皮纸底，和 skin.ts 的卡片一致；比上面多一级 .hd-skin，盖过布局里的纯色底） */
.hd-ui.hd-skin .hd-td-plan, .hd-ui.hd-skin .hd-tdgar-spot { background:var(--hd-parch),linear-gradient(#f7ead0,#e9d4a2); box-shadow:inset 0 0 14px rgba(120,72,22,.26),0 3px 0 ${ink}; }
.hd-ui.hd-skin .hd-td-plan.boss { background:var(--hd-parch),linear-gradient(#ffcfc2,#f09a85); }
.hd-ui.hd-skin .hd-tdgar-card { background:var(--hd-parch),linear-gradient(#f9eed6,#e8d2a0); box-shadow:inset 0 2px 0 rgba(255,250,230,.7),inset 0 0 14px rgba(120,72,22,.25),0 3px 0 ${ink}; }
.hd-ui.hd-skin .hd-tdgar-card.on { background:var(--hd-parch),linear-gradient(${c.goldL},${gold}); box-shadow:0 5px 0 ${ink},0 0 0 3px #fff3b0,0 0 16px rgba(255,214,90,.8); }

/* 下面几条比 layout.ts 多一级选择器，盖过它 */
.hd-ui .hd-nowrap { white-space:nowrap; }
/* 叫波钮副文字永远单行；超出就省略号，整句在 title 里 */
.hd-ui .hd-td-call small { white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
/* 开着造塔 / 图鉴面板时整局暂停，预告卡收起：「已暂停」黄条在它原来的位置，不再压着文字 */
.hd-ui.hd-skin .hd-td:has(.hd-td-sheet) .hd-td-plan { visibility:hidden; }
/* 窄屏（手机竖横屏）：顶栏「已来」二字收起，牌只留「N/M 波」，右邻牌不再盖住最后一个字 */
@media (max-width:900px) { .hd-ui .hd-wave-pre { display:none; } }
/* 手机的叫波钮（竖屏底栏、横屏右下角 170 宽的板）放不下「技能快 N 秒」，收起 */
@media (max-width:559px), (orientation:landscape) and (max-height:500px) { .hd-ui .hd-td-call .hd-call-cd { display:none; } }
/* 手机竖屏：放大后出现的「全景」钮在预告卡右边，卡给钮让出 62 像素（卡最多五行，不让它盖住右下角的倒计时） */
@media (max-width:559px) and (orientation:portrait) { .hd-ui.hd-skin .hd-td:has(.hd-fitbtn.on) .hd-td-plan { max-width:calc(100% - 74px); } }
/* 矮横屏的结算：结算框占满高度，仓库条（金币木材飞入的落点）不再盖在框中间，挪到框左边的空地，框宽 360 居中，两边各剩一半 */
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui.hd-skin .hd-mask > .hd-td-store { left:6px; top:calc(env(safe-area-inset-top, 0px) + 64px); transform:none; max-width:calc((100% - 360px) / 2 - 12px); animation-name:none; }
  .hd-ui.hd-skin .hd-mask > .hd-td-store.bump { animation:hd-tdbump .3s; }
  @media (max-width:720px) { .hd-ui.hd-skin .hd-mask > .hd-td-store { flex-direction:column; align-items:flex-start; border-radius:14px; } }
}
@keyframes hd-tdbump { 40% { transform:scale(1.18); } }
@keyframes hd-tdstorebump { 40% { transform:translateX(-50%) scale(1.18); } }
@keyframes hd-tdflash { 0% { opacity:1; } 100% { opacity:0; } }
@keyframes hd-tdban { 0% { transform:translateY(-26px) scale(.7); opacity:0; } 17% { transform:scale(1.08); opacity:1; } 28% { transform:none; } 70% { opacity:1; } 100% { transform:translateY(-8px); opacity:0; } }
@keyframes hd-tddrop { 0% { transform:translateY(-70px) scale(2); opacity:0; } 55% { transform:translateY(4px) scale(.92); opacity:1; } 100% { transform:none; opacity:1; } }
`;
}
