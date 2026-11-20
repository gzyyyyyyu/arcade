import { BRANCH_BY_ID, BRANCH_LEVEL, BUILDINGS, branchOptions } from '../content/index.ts';
import { TD2_ENEMIES } from '../content/td2units.ts';
import { TD2_CHAPTERS } from '../content/tdmaps.ts';
import type { Td2ChapterInfo } from '../content/tdmaps.ts';
import { ISLAND, RULES_VERSION, UNIT } from '../core/types.ts';
import { counterKind, isTdTowerKind, levelForRules, tdBuildRange, tdHomeHardOpen, tdUpCost } from '../core/index.ts';
import { TD2_COST, TD2_HOME } from '../content/td2units.ts';
import {
  COUNTER, TD2_LEVELS, TD2_LOSE_AT, TD2_STAR_LOST, TD_ARMORS, TD_BRANCH_DAMAGE, TD_BURN_DAMAGE, TD_DAMAGES, TD_ENEMY_ARMOR, TD_HERO_DAMAGE, TD_KEG_DAMAGE, TD_MINE_DAMAGE,
  TD_TOWER_DAMAGE, TD_TOWER_KINDS,
  TIDE_MODS, beijingIsoWeek, branchError, garrisonTier, hqLevel, navUnlocked, nextTdUnlock, tdDailyCap, tdGarrisonOptions, tdLevelUnlocked, tideLine, tideMap, tideMod, weekLabel,
} from '../core/index.ts';
import { tideBest } from '../net/tide.ts';
import { garrisonRec } from './garrisonrec.ts';
import type { TdArmor, TdDamage, TdGarrisonOption, TdGarrisonPick, TdGarrisonSpot, TdIslandLevel, TdTowerKind, WavePreview } from '../core/index.ts';
import type { BuildingKind, TdEnemyKind, TdLevel, TdState } from '../core/index.ts';
import { app, fmt } from './app.ts';
import { bArt, iconA, tdE } from './art.ts';
import { dayIndex } from './meta.ts';
import { button, el, img, toast, uiRoot } from './ui.ts';
import { injectTdCss } from './tdcss.ts';
import { garrisonMap, islandMap } from './islemap.ts';

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

/** 倍率怎么写（人话）：150 → 多打一半，100 → 照常，50 → 只打一半，0 → 打不到；表里没有的倍率退回 ×n */
export function pctText(pct: number): string {
  if (pct <= 0) return '打不到';
  if (pct === 150) return '多打一半';
  if (pct === 100) return '照常';
  if (pct === 50) return '只打一半';
  return `×${pct / 100}`;
}

/** 倍率的档：克（> 100）、平（100）、弱（0–100）、打不到（0），格子按档上色 */
export function pctTier(pct: number): 'good' | 'even' | 'weak' | 'none' {
  return pct <= 0 ? 'none' : pct > 100 ? 'good' : pct < 100 ? 'weak' : 'even';
}

/**
 * 不是塔、也打伤害的东西（英雄、火药桶、地雷、地上的火）：伤害类型读核心的常量，名字只写在这一处。
 * 克制表的「谁打这种伤害」、伤害徽记的说明都从 damageSources 现算，不手写塔的名单。
 */
const DAMAGE_EXTRA: ReadonlyArray<readonly [string, TdDamage]> = [
  ['英雄', TD_HERO_DAMAGE],
  ['火药桶', TD_KEG_DAMAGE],
  ['地雷', TD_MINE_DAMAGE],
  ['地上的火', TD_BURN_DAMAGE],
];

/** 打这种伤害的塔（按 TD_TOWER_KINDS 的顺序） */
export function damageTowers(d: TdDamage): TdTowerKind[] {
  return TD_TOWER_KINDS.filter((k) => TD_TOWER_DAMAGE[k] === d);
}

/** 打这种伤害的所有东西的名字：塔在前，英雄、火药桶这些在后 */
export function damageSources(d: TdDamage): string[] {
  return [...damageTowers(d).map((k) => BUILDINGS[k].name), ...DAMAGE_EXTRA.filter(([, x]) => x === d).map(([n]) => n)];
}

/** 穿这种护甲的敌人（小艇是分裂小艇分出来的，不单列） */
export function armorFoes(a: TdArmor): TdEnemyKind[] {
  return (Object.keys(TD_ENEMY_ARMOR) as TdEnemyKind[]).filter((k) => TD_ENEMY_ARMOR[k] === a && k !== 'skiffling');
}

/** 一种护甲吃哪些伤害多一半、哪些只打一半、哪些打不到：「火打它多一半，枪弹、炮弹照常」这种句子的原料 */
function armorTiers(a: TdArmor): Record<'good' | 'even' | 'weak' | 'none', TdDamage[]> {
  const out: Record<'good' | 'even' | 'weak' | 'none', TdDamage[]> = { good: [], even: [], weak: [], none: [] };
  for (const d of TD_DAMAGES) out[pctTier(COUNTER[d][a])].push(d);
  return out;
}

/** 一种护甲怎么打，一句话：「火打它多一半，枪弹、火只打一半，炮弹打不到」，照常的不写 */
export function armorLine(a: TdArmor): string {
  const t = armorTiers(a);
  const names = (ds: TdDamage[]): string => ds.map((d) => DAMAGE_NAME[d]).join('、');
  return [t.good.length ? `${names(t.good)}打它多一半` : '', t.weak.length ? `${names(t.weak)}只打一半` : '', t.none.length ? `${names(t.none)}打不到` : '']
    .filter(Boolean)
    .join('，');
}

/** 敌人的一行说明：「水手 · 布衣：火打它多一半」（图鉴、徽记说明用） */
export function foeLine(k: TdEnemyKind): string {
  const a = TD_ENEMY_ARMOR[k];
  return `${TD2_ENEMIES[k].name} · ${ARMOR_NAME[a]}：${armorLine(a)}`;
}

/** 一种伤害打哪种护甲多一半 / 只打一半 / 打不到，一句话（徽记说明用） */
function damageLine(d: TdDamage): string {
  const row = COUNTER[d];
  const by = (tier: 'good' | 'weak' | 'none'): string => TD_ARMORS.filter((a) => pctTier(row[a]) === tier).map((a) => ARMOR_NAME[a]).join('、');
  const good = by('good');
  const weak = by('weak');
  const none = by('none');
  return [good ? `打${good}多一半` : '', weak ? `打${weak}只打一半` : '', none ? `打不到${none}` : ''].filter(Boolean).join('，') || '打谁都照常';
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

/** 守岛 2.0 分叉卡上只写克制表的两条例外（TD_BRANCH_DAMAGE），别的旧说法（克首领、克铁甲）不写 */
export function branchDamageHint(id: string): string | undefined {
  const ex = TD_BRANCH_DAMAGE[id];
  if (!ex) return undefined;
  if (ex.airPct !== undefined) return `能打${ARMOR_NAME.air}（${pctText(ex.airPct)}）`;
  if (ex.burn) return `留下的火按${DAMAGE_NAME[ex.burn]}算`;
  return undefined;
}

/** 伤害徽记的说明：谁打这种伤害、它克谁 */
export function damageTip(d: TdDamage): string {
  return `${DAMAGE_NAME[d]}（${damageSources(d).join('、')}）：${damageLine(d)}`;
}
/** 护甲徽记的说明：谁穿这种护甲、什么打它多一半 */
export function armorTip(a: TdArmor): string {
  return `${ARMOR_NAME[a]}（${armorFoes(a).map((k) => TD2_ENEMIES[k].name).join('、')}）：${armorLine(a)}`;
}

/**
 * 徽记悬停出说明（title）；不在按钮里的点一下弹一条（手机没有悬停）。在塔卡这类按钮里的不接点击：点卡是造塔，不能被徽记吃掉
 */
function explain(b: HTMLElement, tip: string): HTMLElement {
  b.title = tip;
  b.addEventListener('click', (e) => {
    if (b.closest('button')) return;
    e.stopPropagation();
    toast(tip);
  });
  return b;
}

/** 伤害 / 护甲的小徽记（单字圆章，颜色按种类）：塔卡、敌人、预告条、克制表共用 */
export function dmgBadge(d: TdDamage, parent?: HTMLElement): HTMLElement {
  return explain(el('i', `hd-dmg d-${d}`, DAMAGE_CHAR[d], parent), damageTip(d));
}
export function armorBadge(a: TdArmor, parent?: HTMLElement): HTMLElement {
  return explain(el('i', `hd-arm a-${a}`, ARMOR_CHAR[a], parent), armorTip(a));
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
 * 克制表卡：伤害（行）× 护甲（列）。行头是伤害加打这种伤害的塔的小图，列头是护甲加穿这种护甲的敌人头像，
 * 格子写人话（多打一半 / 照常 / 只打一半 / 打不到）按档上色；表上一句怎么读，表下按名字列出每种伤害、每种护甲都有谁。
 * 塔、敌人、英雄这些全部从核心的表现算（damageSources、armorFoes），不手写名单。
 * 默认收起成一个"克制表"按钮，点开展开（建塔菜单和敌人图鉴共用）。open 为 true 时直接展开。
 */
export function counterCard(parent: HTMLElement, open = false): HTMLElement {
  injectTdCss();
  const wrap = el('div', `hd-ctr${open ? ' on fixed' : ''}`, undefined, parent);
  const tog = button('', 'hd-btn-wood hd-ctr-tog', () => wrap.classList.toggle('on'), wrap);
  tog.title = '克制表（C）';
  el('span', '', '克制表', tog);
  el('small', '', '什么塔打什么敌人最狠', tog);
  const key = el('p', 'hd-ctr-key', '每座塔打一种伤害，每个敌人穿一种护甲。', wrap);
  for (const [tier, word] of [['good', '多打一半'], ['weak', '只打一半'], ['none', '打不到']] as const) el('i', `c-${tier}`, word, key);
  const tb = el('table', 'hd-ctr-tb', undefined, wrap);
  const hr = el('tr', '', undefined, tb);
  el('th', 'hd-ctr-corner', '塔 \\ 敌人', hr);
  for (const a of TD_ARMORS) {
    const th = el('th', '', undefined, hr);
    const h = el('div', 'hd-ctr-h', undefined, th);
    armorBadge(a, h);
    el('span', '', ARMOR_NAME[a], h);
    const ic = el('div', 'hd-ctr-ic', undefined, th);
    for (const k of armorFoes(a)) {
      const f = tdE(k, 'walk')[0];
      if (f) ic.appendChild(img(f, 18)).title = TD2_ENEMIES[k].name;
    }
  }
  for (const d of TD_DAMAGES) {
    const tr = el('tr', '', undefined, tb);
    const th = el('th', '', undefined, tr);
    const h = el('div', 'hd-ctr-h', undefined, th);
    dmgBadge(d, h);
    el('span', '', DAMAGE_NAME[d], h);
    const ic = el('div', 'hd-ctr-ic', undefined, th);
    for (const k of damageTowers(d)) ic.appendChild(towerIcon(k, 1, 18)).title = BUILDINGS[k].name;
    for (const a of TD_ARMORS) el('td', `c-${pctTier(COUNTER[d][a])}`, pctText(COUNTER[d][a]), tr);
  }
  const who = el('div', 'hd-ctr-who', undefined, wrap);
  for (const d of TD_DAMAGES) {
    const s = el('span', '', undefined, who);
    dmgBadge(d, s);
    s.append(`${DAMAGE_NAME[d]}：${damageSources(d).join('、')}`);
  }
  for (const a of TD_ARMORS) {
    const s = el('span', '', undefined, who);
    armorBadge(a, s);
    s.append(`${ARMOR_NAME[a]}：${armorFoes(a).map((k) => TD2_ENEMIES[k].name).join('、')}`);
  }
  // 展开后在建塔面板里只留克制表（其余收起让位），靠这个钮收回去；图鉴里克制表一直展开，没有这个钮
  button('收起克制表', 'hd-btn-wood hd-ctr-off', () => wrap.classList.remove('on'), wrap);
  return wrap;
}

/** 有的敌人要专门提醒怎么对付（图鉴和预告卡的补充行用；规则那边已经写过同一句就不重复） */
export const ENEMY_HINT: Partial<Record<TdEnemyKind, string>> = {
  grenadier: '掷弹兵：先用火',
  shield: '盾兵：先用火、爆',
  bosun: '水手长：狙击、臼炮打它最划算',
  macaw: '鹦鹉王：要多留火枪塔',
  mate: '大副：狙击打本体、臼炮收散开的水手',
  medic: '军医：先打掉，狙击塔会先瞄它',
  gunboat: '炮艇：臼炮、鱼叉、火箭、狙击才够得着',
  king: '海盗王：远程塔和友军船才够得着，先打掉它就不再放人',
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

/** 开局造法按塔合并（「火枪塔」三座写一次 ×3），保持第一次出现的顺序 */
export function openerKinds(op: ReadonlyArray<{ kind: TdTowerKind }>): Array<[TdTowerKind, number]> {
  const m = new Map<TdTowerKind, number>();
  for (const o of op) m.set(o.kind, (m.get(o.kind) ?? 0) + 1);
  return [...m];
}

/**
 * 还没造的开局造法：只在第一波开打前给；照它造完了就返回 undefined，卡上换成「下一座造」——
 * 以前造完了卡上还写「先造：火枪塔、臼炮」，手里剩的钱不知道该造什么
 */
export function openerLeft(s: TdState): TdLevel['opener'] {
  const left = s.wave === 0 ? s.level.opener?.filter((o) => s.slots[o.slot]!.tower < 0) : undefined;
  return left?.length ? left : undefined;
}

/** 开局造法的一句话：「先造：火枪塔 ×2、臼炮」 */
export function openerText(op: ReadonlyArray<{ kind: TdTowerKind }>): string {
  return `先造：${openerKinds(op)
    .map(([k, n]) => `${towerName(k)}${n > 1 ? ` ×${n}` : ''}`)
    .join('、')}`;
}

/**
 * 预告卡的下一步：有空木台写「下一座造」哪种塔，造满了写「钱够就升级」哪座。
 * 造哪种：照建议的新手机器人挑的那座（核心的 counterKind：按下两波的护甲和每金输出挑，同种塔越多越打折，有飞的先备打飞的、
 * 有雾先备火枪）；以前只按这一波的护甲挑一种伤害，第一波几乎都是布衣，卡上永远是「火」，新手照着全造喷火就守不住
 * （docs/balance-haidao.md 第 5 节）。升哪座：升阶最便宜的那座（并列取木台序号小的），等于先把各座都升到 2 阶再往上；
 * 试过稳机器人的挑法（离路最近的一座攒钱升满），照卡升的新手在 td18 至少一星 70 → 58，最便宜的是 78、其余关和照建议的新手差 ≤ 4。
 * 定住：只在木台上的塔变了（造、卖、升）之后才重挑，翻波、倒数里不换——跟着预告每波重算时卡会自己变，攒钱造 A 的新手看到它变成 B
 */
export interface NextStep {
  kind: TdTowerKind;
  /** 升级的那座塔在哪块木台；造新塔是 -1 */
  slot: number;
  cost: number;
}
export interface HeldStep {
  key: string;
  step: NextStep | null;
}

/** 木台上的塔（哪座、几阶）和沉船：变了才重挑下一步 */
export function stepKey(s: TdState): string {
  return s.slots
    .map((sl) => {
      const tw = sl.tower >= 0 ? s.towers.find((q) => q.id === sl.tower) : undefined;
      return tw ? `${tw.id}.${tw.tier ?? 0}` : sl.wreck !== undefined ? 'w' : '-';
    })
    .join(',');
}

export function nextStep(prev: HeldStep | undefined, s: TdState, pv: WavePreview[]): HeldStep {
  const key = stepKey(s);
  if (prev?.key === key) return prev;
  if (!s.unlocked.length) return { key, step: null };
  if (s.slots.some((sl) => sl.tower < 0 && sl.wreck === undefined)) {
    const kind = counterKind(s, pv);
    return { key, step: { kind, slot: -1, cost: TD2_COST[kind] } };
  }
  let best: NextStep | null = null;
  s.slots.forEach((sl, slot) => {
    const tw = sl.tower >= 0 ? s.towers.find((q) => q.id === sl.tower) : undefined;
    if (!tw || tw.tier === undefined || tw.tier >= 3 || !isTdTowerKind(tw.kind)) return;
    const cost = tdUpCost(tw.kind, tw.tier - 1);
    if (cost >= 0 && (!best || cost < best.cost)) best = { kind: tw.kind, slot, cost };
  });
  return { key, step: best };
}

/** 图鉴标题里的一句（不看钱）：「下一座造：臼炮」「钱够就升级：火枪塔」 */
export const nextStepText = (st: NextStep): string => `${st.slot < 0 ? '下一座造' : '钱够就升级'}：${towerName(st.kind)}`;
/**
 * 预告卡上那一格随钱变的两段：开头和「· 差 N」。卡宽 360，「钱够就升级 火枪塔 还差 65 金」挤得这一格单独占一行、卡变四行，
 * 所以钱不够时升级只写「升级」（差多少已经说明了要攒钱），差额写短的「差 65」
 */
export function stepLine(st: NextStep, gold: number): { lead: string; short: string } {
  const short = st.cost > gold ? `差 ${st.cost - gold}` : '';
  return { lead: st.slot < 0 ? '下一座造' : short ? '升级' : '钱够就升级', short };
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

/** 这一关新出现什么：对比同一张关表里前面的关（第一关写基础玩法）。i 是 levels 里的序号；波次按现在的规则版本挑（levelForRules） */
export function levelIntro(levels: readonly TdIslandLevel[], i: number): string {
  if (!levels[i]) return '';
  const lv = levelForRules(levels[i]!, RULES_VERSION);
  if (i === 0) return '新：建塔、驻守台、英雄、叫下一波';
  const seen = new Set<TdEnemyKind>();
  const seenMech = new Set<string>();
  let boss = false;
  for (let k = 0; k < i; k++) {
    const q = levels[k]!;
    for (const m of mechanics(q)) seenMech.add(m);
    for (const w of levelForRules(q, RULES_VERSION).waves) {
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

/**
 * 选关卡片上只写一句（驻守台几座、几阶在点进去的选塔页上）：锁着写解锁条件；主寨不够写差几级；
 * 没打过的写这关的新东西；其余写建议主寨。返回 [类名, 文字]。
 */
export function cardLine(lv: TdIslandLevel, all: readonly TdIslandLevel[], i: number, locked: boolean, hq: number, stars: number): [string, string] {
  if (locked) return ['hd-tdlock', `先守下「${all[i - 1]?.name ?? ''}」（≥1 星）`];
  if (hq < lv.hq) return ['hd-short', `建议主寨 ${lv.hq} 级（你 ${hq} 级，会偏难）`];
  const nw = stars === 0 ? levelIntro(all, i) : '';
  return nw ? ['hd-tdnew', nw] : ['', `建议主寨 ${lv.hq} 级`];
}

/**
 * 一章的卡片说明：每张卡的 cardLine，外加章节标题下的一句提醒。两张及以上卡都是「主寨不够」时，那句红字只在章节下写一次
 * （同一句重复六遍像报错），这些卡改写各自不一样的那句：没打过写新东西，打过写建议主寨。i0 是这一章第一关在 all 里的序号。
 */
export function chapterLines(
  levels: readonly TdIslandLevel[],
  all: readonly TdIslandLevel[],
  i0: number,
  locked: (i: number) => boolean,
  hq: number,
  stars: (id: string) => number,
): { warn: string; lines: Array<[string, string]> } {
  const lines = levels.map((lv, j) => cardLine(lv, all, i0 + j, locked(i0 + j), hq, stars(lv.id)));
  const short = levels.filter((_, j) => lines[j]![0] === 'hd-short');
  if (short.length < 2) return { warn: '', lines };
  const lo = Math.min(...short.map((l) => l.hq));
  const hi = Math.max(...short.map((l) => l.hq));
  const who = short.length === levels.length ? '这一章' : `这一章有 ${short.length} 关`;
  const warn = `${who}建议主寨 ${lo === hi ? lo : `${lo}–${hi}`} 级（你 ${hq} 级，会偏难）`;
  return {
    warn,
    lines: lines.map((ln, j) => {
      if (ln[0] !== 'hd-short') return ln;
      const lv = levels[j]!;
      const nw = stars(lv.id) === 0 ? levelIntro(all, i0 + j) : '';
      return nw ? ['hd-tdnew', nw] : ['', `建议主寨 ${lv.hq} 级`];
    }),
  };
}

/** 选关页的章节：战役各关按章分好（样板关不在里面） */
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
  homeCard(modes, p.td?.stars[HOME_UNLOCK] ?? 0, tdHomeHardOpen(hqLevel(p)), () => onGo(HOME_ID));
  if (onTide) tideCard(modes, p.td?.stars[TIDE_UNLOCK] ?? 0, onTide);
  // 默认打开"下一关要打的"那一章：第一个还没拿到星的已解锁关；全拿过星就停在最后一章
  const nextIdx = all.findIndex((lv, i) => open(i) && (p.td?.stars[lv.id] ?? 0) === 0);
  const startChapter = nextIdx < 0 ? chapters.length - 1 : chapters.findIndex((c) => c.levels.some((l) => l.id === all[nextIdx]!.id));
  const tabs = el('div', 'hd-tdtabs', undefined, right);
  const theme = el('small', 'hd-tdtheme', undefined, right);
  const warn = el('small', 'hd-tdtheme hd-tdwarn', undefined, right);
  el('small', 'hd-tdtheme hd-tdrule', starRule(), right);
  const list = el('div', 'hd-tdsel-list', undefined, right);
  // 手机上一章 6 关一屏放不下，章内再翻页（每页 3 关，360×640 这种矮屏每页 2 关）；电脑一章一屏全摆出来
  const pager = el('div', 'hd-tdpager', undefined, right);
  const mq2 = matchMedia(PAGED2_QUERY);
  const mq3 = matchMedia(PAGED3_QUERY);
  const mqThumb = matchMedia(THUMB_QUERY);
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
    const i0 = all.indexOf(ch.levels[0]!);
    const cl = chapterLines(ch.levels, all, i0, (i) => !open(i), hq, (id) => p.td?.stars[id] ?? 0);
    warn.textContent = cl.warn;
    warn.style.display = cl.warn ? '' : 'none';
    const thumbs = mqThumb.matches;
    const per = mq2.matches ? 2 : mq3.matches ? 3 : ch.levels.length;
    const pages = Math.ceil(ch.levels.length / per);
    wrap.classList.toggle('paged', pages > 1);
    ch.levels.forEach((lv, j) => {
      if (Math.floor(j / per) !== page) return;
      const i = all.indexOf(lv);
      const locked = !open(i);
      const stars = p.td?.stars[lv.id] ?? 0;
      // 下一关（第一个还没拿星的已解锁关）描金边：一眼看出该打哪关
      const c = el('div', `hd-tdcard${locked ? ' lock' : ''}${i === nextIdx ? ' next' : ''}${thumbs ? ' thumb' : ''}`, undefined, list);
      if (thumbs) islandMap({ lv, layout: lv.layout }, c, 'hd-tdthumb');
      el('span', 'hd-tdnum hd-n', String(j + 1), c);
      const mid = el('div', 'hd-tdmid', undefined, c);
      el('b', 'hd-tdname', lv.name, mid);
      const st = el('span', 'hd-stars', undefined, mid);
      for (let n = 0; n < 3; n++) st.appendChild(img(iconA(n < stars ? 'star' : 'starEmpty'), 18));
      const b = button(locked ? '未解锁' : stars > 0 ? '再守' : '出发', locked ? 'hd-btn-plain' : 'hd-btn-gold', () => go(lv), c);
      b.disabled = locked;
      b.dataset.level = lv.id;
      const [cls, line] = cl.lines[j]!;
      if (line) el('small', cls, line, el('div', 'hd-tdinfo', undefined, c));
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
  mqThumb.addEventListener('change', onMq);
  const close = button('回岛', 'hd-btn-wood hd-tdsel-close', () => {
    stop();
    onClose();
  }, uiRoot());
  function stop(): void {
    mq2.removeEventListener('change', onMq);
    mq3.removeEventListener('change', onMq);
    mqThumb.removeEventListener('change', onMq);
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
/** 电脑（宽、够高）和竖拿的平板：一章 6 关一屏摆得下还有富余，卡片顶上加这一关的岛缩略图，不让下半屏空着 */
const THUMB_QUERY = '(min-width:960px) and (min-height:700px), (min-width:701px) and (min-height:1000px)';

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
  // 按这一关的敌人推荐（garrisonrec.ts：克制、够不够得着海上的船、几座台不重样），卡上挂「这关推荐」，默认就挑它；
  // 再守一次沿用上次的挑法，推荐照样标出来
  const rec = garrisonRec(lv.waves, lv.garrison.map((sp) => optsOf(sp.cap)));
  if (prev) for (const pk of prev) picks.set(pk.spot, pk.kind);
  else for (const [spot, kind] of rec) picks.set(spot, kind);
  const wrap = el('div', 'hd-tdsel hd-tdgar hd-tdgar-main hd-tdpage', undefined, uiRoot());
  const head = el('div', 'hd-tdsel-head', undefined, wrap);
  el('h2', '', `${lv.name} · 驻守台`, head);
  // 小地图和说明并排（竖屏手机上小地图占满面板上方的空当，选塔面板沉到底下，见 tdcss）
  const top = el('div', 'hd-tdgar-top', undefined, wrap);
  const markSpot = garrisonMap(lv, top, (k) => showSpot(k));
  el('p', 'hd-tdgar-note', '从自己的基地带塔上岛：阶数按基地里同种塔的最高等级折算（1–3 级 1 阶、4–6 级 2 阶、7–8 级 3 阶），不超过台子的上限。带上岛的塔照样能升级、能卖。金色「荐」是按这关的敌人推荐的。', top);
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
    // 并排摆全部台子时（电脑）小地图上不单独描亮哪一座
    markSpot(tabbed || lv.garrison.length === 1 ? k : -1);
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
        // 名字下面一行排开：伤害类型、加成、台子封顶、带进来的分叉；同一个能换行的容器，宽卡一行放下，窄卡折行，谁也压不住谁
        const meta = el('span', 'hd-tdgar-meta', undefined, c);
        const dm = el('small', 'hd-tdgar-dmg', undefined, meta);
        dmgBadge(TD_TOWER_DAMAGE[o.kind], dm);
        el('span', '', DAMAGE_NAME[TD_TOWER_DAMAGE[o.kind]], dm);
        if (o.bonusPct > 0) el('small', 'hd-tdgar-bonus', `伤害 +${o.bonusPct}%`, meta);
        if (o.tier < garrisonTier(o.baseLevel, 3)) el('small', 'hd-tdgar-cap', '台子封顶', meta);
        for (const b of o.branch) el('small', 'hd-chip', branchName(b), meta);
        c.title = `${towerName(o.kind)}：基地最高 ${o.baseLevel} 级 → ${o.tier} 阶`;
        // 「荐」：压在卡片左上角的金色圆章（绝对定位、不占卡里的高度——写成一行字会把卡撑高，电脑上整页多出一截要滚；左上角是卡里唯一空着的地方）
        if (rec.get(si) === o.kind) {
          el('small', 'hd-tdgar-rec', '荐', c).title = '这关推荐';
          c.setAttribute('aria-description', '这关推荐');
        }
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
  heroSwitch(btns);
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

/**
 * 带哪个英雄（规则版本 23）：第一章通关后，战役的驻守台面板和海盗来袭卡片上各一个切换钮，点一下在船长、航海士之间换，
 * 存进存档（heroPick），下次默认上次选的。没解锁不出钮。悬赏守岛、大潮、护航不出（第一版只有船长）
 */
export function heroSwitch(parent: HTMLElement): HTMLButtonElement | null {
  if (!navUnlocked(app.profile)) return null;
  const say = (): void => {
    const nav = app.profile.heroPick === 'nav';
    b.textContent = nav ? '带：航海士' : '带：船长';
    b.classList.toggle('on', nav);
    b.setAttribute('aria-pressed', String(nav));
    b.title = nav ? '航海士：急射旗让旗边的塔打得快一倍，重赏圈里倒下的海盗金币翻倍，提前叫波多拿一半金币；打得远、跑得快。塔铺得散、登陆口离宝藏近的岛，带船长更稳。点一下换回船长' : '船长：拒马挡路、炸药桶炸一群、身边的塔打得快一点。塔铺得散、登陆口离宝藏近的岛，带船长更稳。点一下换成航海士';
  };
  const b = button('', 'hd-btn-plain hd-tdhero', () => {
    const { heroPick: _, ...rest } = app.profile;
    app.commit(app.profile.heroPick === 'nav' ? rest : { ...rest, heroPick: 'nav' });
    say();
  }, parent);
  say();
  return b;
}

/** 选关页上的"海盗来袭"入口：守自己的岛，撑得越久奖励越多，不算星 */
/** 加难档的奖励比普通档多几成（四舍五入，8% 比 6% 是 3 成；结算页同一个说法） */
export function hardMore(): number {
  return Math.round(((TD2_HOME.hard.perWavePct - TD2_HOME.perWavePct) * 10) / TD2_HOME.perWavePct);
}

function homeCard(parent: HTMLElement, stars: number, hardOpen: boolean, onHome: () => void): void {
  const locked = stars < 1;
  const c = el('div', `hd-tidecard hd-homecard${locked ? ' lock' : ''}`, undefined, parent);
  const mid = el('div', 'hd-tdmid', undefined, c);
  // 三个钮一组：窄屏放不下时整组换到第二行
  const acts = el('div', 'hd-home-acts', undefined, c);
  el('b', 'hd-tdname', locked ? '海盗来袭 · 未解锁' : '海盗来袭', mid);
  if (locked) el('small', 'hd-tdlock', `先守下「${TD2_LEVELS.find((l) => l.id === HOME_UNLOCK)?.name ?? '第 1 关'}」（≥1 星）`, mid);
  else {
    const line = el('small', '', '', mid);
    const say = (): void => {
      line.textContent = hardOpen && app.homeHard ? `加难：海盗多、有精英，奖励多 ${hardMore()} 成` : '守自己的岛，撑几波拿几波的奖励';
    };
    say();
    c.title = '海盗一波比一波多；不算星，和关卡共用今日守岛收入';
    // 加难档（主寨 6 级起）：开关只在够级时出现，默认关；和关卡共用今日守岛收入，奖励多也不会超
    if (hardOpen) {
      const hard = button('加难', `hd-btn-plain hd-home-hard${app.homeHard ? ' on' : ''}`, () => {
        app.homeHard = !app.homeHard;
        hard.classList.toggle('on', app.homeHard);
        hard.setAttribute('aria-pressed', String(app.homeHard));
        say();
      }, acts);
      hard.setAttribute('aria-pressed', String(app.homeHard));
      hard.title = `海盗多约两成、第 6 波起有精英；每撑住一波的奖励从 ${TD2_HOME.perWavePct}% 提到 ${TD2_HOME.hard.perWavePct}%（一局三星的百分比）`;
    } else app.homeHard = false;
    heroSwitch(acts);
  }
  const go = button(locked ? '未解锁' : '出发', locked ? 'hd-btn-plain' : 'hd-btn-gold', onHome, acts);
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
  // 每周海况（规则版本 22）：名字挂在标题后面，怎么回事写在悬停提示里
  const mod = tideMod(week);
  el('b', 'hd-tdname', locked ? '大潮无尽 · 未解锁' : `大潮无尽 · 第 ${week.week} 周${mod ? ` · ${TIDE_MODS[mod].name}` : ''}`, mid);
  if (locked) {
    el('small', 'hd-tdlock', `先守下「${TD2_LEVELS.find((l) => l.id === TIDE_UNLOCK)?.name ?? '第 3 关'}」（第一章第 3 关，≥1 星）`, mid);
  } else {
    const best = tideBest(label);
    el('small', best > 0 ? 'hd-tidebest' : '', best > 0 ? `本周最好：${tideLine(best)}` : `本周守${tideMap(week).name}，比谁撑得久`, mid);
    c.title = `${week.year} 年第 ${week.week} 周：所有人守同一座岛，波次无限${mod ? `。本周海况「${TIDE_MODS[mod].name}」：${TIDE_MODS[mod].desc}` : ''}`;
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
/** 关内事件（规则版本 22）在预告卡第三行、图鉴里的短说法；名字给「再下一波」那一小格 */
export const EVENT_NAME: Readonly<Record<NonNullable<WavePreview['event']>, string>> = { bounty: '赏金船', rain: '暴雨', dare: '战书' };
export function eventNote(p: WavePreview): string {
  if (p.event === 'bounty') return '赏金船上岸，打倒多给金币';
  if (p.event === 'rain') return '暴雨：火弱两成';
  if (p.event === 'dare') return p.dare ? '已接战书：金币翻倍' : '有战书可接';
  return '';
}

/** opener：这一关还没造的开局造法（只在第一波开打前给），有就显示它；否则显示 next（nextStep 定住的下一步，开头和差多少由 HUD 每拍按 stepLine 补） */
export function planCard(
  box: HTMLElement,
  pv: readonly WavePreview[],
  o: { title: (w: number) => string; left: number; tide: string; laneTitle: (lane: number) => string; opener?: TdLevel['opener']; next?: NextStep | null; gold: number },
): void {
  box.textContent = '';
  const p = pv[0];
  box.classList.toggle('boss', !!p?.boss);
  if (!p) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  // 三行，和改前一样高（平板竖屏顶底栏要 ≤ 22%）：① 第几波、来什么敌人（头像 × 数量）、倒数 ② 护甲全名和建议 ③ 从哪来、再下一波
  // 头像和护甲全名替代原来只有一个「布」字的小圆章：新玩家看不出那是护甲，更不知道该造什么
  const r1 = el('div', 'hd-plan-r1', undefined, box);
  el('b', 'hd-plan-w', p.boss ? `首领波 · ${o.title(p.wave)}` : o.title(p.wave), r1);
  const foes = el('span', 'hd-plan-foes', undefined, r1);
  for (const e of waveEnemies(p)) enemyChip(e.kind, e.n, e.fog, foes, 20);
  if (o.left >= 0) el('span', 'hd-plan-left', `${o.left}秒`, r1);
  const arm = el('div', 'hd-plan-arm', undefined, box);
  const kinds = armorOrder(p.armorShare);
  for (const a of kinds) {
    const sp = el('span', '', undefined, arm);
    armorBadge(a, sp);
    sp.append(kinds.length === 1 ? `全是${ARMOR_NAME[a]}` : `${ARMOR_NAME[a]} ${p.armorShare[a]}%`);
  }
  // 写了开局造法的关，开打前先写还没造的那几座（木台上有金圈），造完了再换成「下一座造」
  const op = p.wave === 0 ? o.opener : undefined;
  if (op?.length) {
    const sg = el('span', 'hd-plan-sug hd-plan-open', '先造', arm);
    for (const [k, n] of openerKinds(op)) {
      sg.append(towerIcon(k, 1, 18), `${towerName(k)}${n > 1 ? `×${n}` : ''}`);
    }
  } else if (o.next) {
    const ln = stepLine(o.next, o.gold);
    const sg = el('span', 'hd-plan-sug hd-plan-open', undefined, arm);
    el('span', 'hd-plan-lead', ln.lead, sg);
    sg.append(towerIcon(o.next.kind, 1, 18), towerName(o.next.kind));
    el('small', 'hd-plan-short', ln.short, sg);
  }
  const lanes = p.lanes.map((l) => `${o.laneTitle(l.lane)}${l.fly ? '（飞）' : ''}`);
  // 关卡说明和敌人打法只在图鉴里写全（点卡打开）：以前全塞进第三行，后几波长到五六行，盖住出生点和海上的炮艇
  const tips = !!p.note || enemyHints(p).length > 0;
  const note = [lanes.length ? `${lanes.join('、')}来` : '', o.tide, eventNote(p), tips ? '点开看打法' : ''].filter(Boolean).join(' · ');
  const q = pv[1];
  if (note || q) {
    const r3 = el('div', 'hd-plan-note', note, box);
    if (q) {
      const nx = el('span', 'hd-plan-next', undefined, r3);
      el('small', '', `${q.boss ? '再下一波是首领波' : '再下一波'}${q.event ? ` · ${EVENT_NAME[q.event]}` : ''}`, nx);
      for (const a of armorOrder(q.armorShare)) armorBadge(a, nx);
    }
  }
}

/** 敌人图鉴（点预告卡打开）：下两波每一路什么敌人几个、每种敌人怎么打，再加一张展开的克制表 */
export function bestiary(
  box: HTMLElement,
  pv: readonly WavePreview[],
  title: (w: number) => string,
  laneTitle: (lane: number) => string,
  opener?: TdLevel['opener'],
  next?: NextStep | null,
): void {
  injectTdCss();
  const waves = el('div', 'hd-best-waves', undefined, box);
  // 竖屏手机放不下两波，一次看一波、翻页看另一波；别的尺寸两波一起摆
  const paged = pv.length > 1 && matchMedia('(max-width:700px) and (orientation:portrait)').matches;
  const draw = (pg: number): void => {
    waves.textContent = '';
    pv.forEach((p, k) => {
      if (paged && k !== pg) return;
      // 建议只写在头一波（第一波开打前写开局造法，之后写下一座）：第二波的建议要等这一波打完、造完塔才知道
      const sug = k > 0 ? '' : opener?.length ? openerText(opener) : next ? nextStepText(next) : '';
      el('p', `hd-td-sub${p.boss ? ' boss' : ''}`, `${p.boss ? '首领波 · ' : ''}${title(p.wave)}${sug ? ` · ${sug}` : ''}`, waves);
      for (const l of p.lanes) {
        const row = el('div', 'hd-best-row', undefined, waves);
        el('small', 'hd-best-lane', `${laneTitle(l.lane)}${l.fly ? '（飞）' : ''}`, row);
        for (const e of l.enemies) enemyChip(e.kind, e.n, e.fog, row, 30);
      }
      const notes = [eventNote(p), p.note ?? '', ...enemyHints(p)].filter(Boolean).join(' · ');
      if (notes) el('p', 'hd-td-note', notes, waves);
    });
    // 看得到的这几波里每种敌人一行（两波重复的只写一次）：叫什么、穿什么护甲、什么打它多一半——头像上的单字圆章新玩家看不懂
    const kinds = new Set(pv.filter((_, k) => !paged || k === pg).flatMap((p) => waveEnemies(p).map((e) => e.kind)));
    const foes = el('div', 'hd-best-foes', undefined, waves);
    for (const k of kinds) {
      const r = el('span', '', undefined, foes);
      armorBadge(TD_ENEMY_ARMOR[k], r);
      r.append(foeLine(k));
    }
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

/** 塔的缩略图（建塔菜单用） */
export function towerIcon(kind: BuildingKind, level: number, px: number): HTMLImageElement {
  return img(bArt(kind, level), px);
}

export const towerName = (kind: BuildingKind): string => BUILDINGS[kind].name;
