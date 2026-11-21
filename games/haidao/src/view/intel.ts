/**
 * 介绍卡片的数据：兵种、登陆战的防御、守岛的塔。数值一律从规则核心的表现算（TROOPS、BUILDINGS、raidDefenseBase、td2TierStats），
 * 寻敌说明按规则用的同一份字段（TroopDef.aim、SNIPE_ORDER、溅射 / 死区 / 几发）拼出来，相克读 content/intel.ts 和守岛克制表。
 * 这里不碰 DOM（intelcard.ts 负责画），单测直接比对核心表。
 */
import { BUILDINGS, SHIELD, TROOPS, TROOP_INTEL, defenseMatchups } from '../content/index.ts';
import { td2TierStats, TD2_SHOCK_STUN } from '../content/td2units.ts';
import { BOMBER_WALL_LOOK, GRENADE_LOOK, GRENADE_WALL_PCT, SNIPE_ORDER, WALL_BOMB_MUL, raidDefenseBase } from '../core/battle.ts';
import type { TdTier, TdTowerKind } from '../core/td2types.ts';
import { TICKS_PER_SEC, UNIT, type BuildingKind, type TroopKind } from '../core/types.ts';
import { towerCounter, TOWER_INFO, ARMOR_NAME, DAMAGE_NAME } from './td-ui.ts';

/** 卡片上的一条属性：当前值、下一级的值（满级没有）、条长（0..1，同类里比） */
interface IntelStat {
  key: string;
  label: string;
  cur: string;
  next: string | null;
  /** 涨了多少（「+12」），没涨是空串 */
  up: string;
  bar: number;
}

/** 寻敌的一条：图标 + 一句话 */
export type AimIcon = 'near' | 'defense' | 'wall' | 'cluster' | 'heal' | 'lock' | 'splash' | 'dead' | 'multi' | 'stun' | 'slow' | 'shield' | 'hide' | 'priority' | 'air' | 'front';
interface AimLine {
  icon: AimIcon;
  text: string;
}

export interface IntelCard {
  family: 'troop' | 'defense' | 'td';
  kind: string;
  name: string;
  /** 当前等级（守岛塔是阶），maxLevel 是满级 */
  level: number;
  maxLevel: number;
  levelWord: '级' | '阶';
  role: string;
  stats: IntelStat[];
  aims: AimLine[];
  /** 相克：登陆战是兵种 / 防御的 kind，守岛是护甲名 */
  beats: string[];
  fears: string[];
  /** 守岛：打不到的护甲 */
  none: string[];
}

const cells = (u: number): number => Math.round((u / UNIT) * 10) / 10;
const secs = (ticks: number): number => Math.round((ticks / TICKS_PER_SEC) * 10) / 10;
const dps = (dmg: number, reload: number, shots = 1): number => Math.round((dmg * shots * TICKS_PER_SEC * 10) / Math.max(1, reload)) / 10;
const fmt = (n: number): string => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(n));

interface Raw {
  key: string;
  label: string;
  unit: string;
  cur: number;
  next: number | null;
  /** 同类满级里最大的值（条长的分母） */
  max: number;
  /** 越小越好（攻速的「几秒一下」）：条长倒过来 */
  lower?: boolean;
}
function stat(r: Raw): IntelStat {
  const d = r.next === null ? 0 : Math.round((r.next - r.cur) * 10) / 10;
  const bar = r.max > 0 && r.cur > 0 ? (r.lower ? r.max / r.cur : r.cur / r.max) : 0;
  return {
    key: r.key,
    label: r.label,
    cur: `${fmt(r.cur)}${r.unit}`,
    next: r.next === null ? null : `${fmt(r.next)}${r.unit}`,
    up: d === 0 ? '' : `${d > 0 ? '+' : ''}${fmt(d)}`,
    bar: Math.max(0.04, Math.min(1, bar)),
  };
}

// ---------------------------------------------------------------- 兵种

const TROOP_MAX = 8;
const troopMax = (f: (k: TroopKind) => number): number => Math.max(...(Object.keys(TROOPS) as TroopKind[]).map(f));

/** 兵种卡：level = 研究等级（1..8） */
export function troopCard(kind: TroopKind, level: number): IntelCard {
  const def = TROOPS[kind];
  const lv = Math.max(1, Math.min(TROOP_MAX, level));
  const cur = def.levels[lv - 1]!;
  const nx = lv < TROOP_MAX ? def.levels[lv]! : null;
  const top = (k: TroopKind) => TROOPS[k].levels[TROOP_MAX - 1]!;
  const stats: IntelStat[] = [
    stat({ key: 'hp', label: '血量', unit: '', cur: cur.hp, next: nx?.hp ?? null, max: troopMax((k) => top(k).hp) }),
  ];
  if (def.aim === 'heal') {
    stats.push(stat({ key: 'dmg', label: '每次回血', unit: '', cur: cur.dmg, next: nx?.dmg ?? null, max: troopMax((k) => top(k).dmg) }));
  } else {
    stats.push(stat({ key: 'dps', label: '每秒伤害', unit: '', cur: dps(cur.dmg, cur.reload), next: nx ? dps(nx.dmg, nx.reload) : null, max: troopMax((k) => dps(top(k).dmg, top(k).reload)) }));
    stats.push(stat({ key: 'dmg', label: '每下伤害', unit: '', cur: cur.dmg, next: nx?.dmg ?? null, max: troopMax((k) => top(k).dmg) }));
  }
  stats.push(stat({ key: 'reload', label: def.aim === 'heal' ? '几秒回一次' : '几秒打一下', unit: ' 秒', cur: secs(cur.reload), next: nx ? secs(nx.reload) : null, max: Math.min(...(Object.keys(TROOPS) as TroopKind[]).map((k) => secs(top(k).reload))), lower: true }));
  stats.push(stat({ key: 'range', label: '射程', unit: ' 格', cur: cur.range, next: nx?.range ?? null, max: troopMax((k) => top(k).range) }));
  stats.push(stat({ key: 'speed', label: '移速', unit: ' 格/秒', cur: cur.speed, next: nx?.speed ?? null, max: troopMax((k) => top(k).speed) }));
  if (cur.splash) stats.push(stat({ key: 'splash', label: '溅射', unit: ' 格', cur: cur.splash, next: nx?.splash ?? null, max: troopMax((k) => top(k).splash ?? 0) }));
  stats.push(stat({ key: 'housing', label: '占船位', unit: '', cur: def.housing, next: null, max: troopMax((k) => TROOPS[k].housing) }));
  stats.push(stat({ key: 'cost', label: '每个花木材', unit: '', cur: cur.cost, next: nx?.cost ?? null, max: troopMax((k) => top(k).cost) }));
  const it = TROOP_INTEL[kind];
  return { family: 'troop', kind, name: def.name, level: lv, maxLevel: TROOP_MAX, levelWord: '级', role: it.role, stats, aims: troopAims(kind), beats: [...it.beats], fears: [...it.fears], none: [] };
}

function troopAims(kind: TroopKind): AimLine[] {
  const def = TROOPS[kind];
  const out: AimLine[] = [];
  switch (def.aim) {
    case 'nearest':
      out.push({ icon: 'near', text: '找最近的建筑打（城墙、陷阱不算）' });
      break;
    case 'defense':
      out.push({ icon: 'defense', text: '先找最近的防御塔，塔都倒了再打别的' });
      break;
    case 'wallFirst':
      out.push({ icon: 'wall', text: `${cells(BOMBER_WALL_LOOK)} 格内有墙先炸墙（炸墙 ${WALL_BOMB_MUL} 倍伤害），没有就冲最近的建筑` });
      break;
    case 'cluster':
      out.push({ icon: 'cluster', text: `射程外再多看 ${cells(GRENADE_LOOK)} 格，挑一雷炸到建筑最多的那座（防御塔算 3 座）` });
      break;
    case 'heal':
      out.push({ icon: 'heal', text: '不打建筑：先跟着附近血最少的伤员，给身边的兵回血' });
      break;
  }
  if (def.aim !== 'heal') out.push({ icon: 'lock', text: '盯住一个目标拆到倒才换，挨打也不回头' });
  if (kind === 'grenadier') out.push({ icon: 'wall', text: `手雷越过城墙打里面；炸到墙只算 ${GRENADE_WALL_PCT}%` });
  else if (def.aim !== 'heal' && kind !== 'bomber') out.push({ icon: 'wall', text: '路被墙堵死就砸墙，能绕就绕' });
  if (kind === 'bomber') out.push({ icon: 'dead', text: '一炸就没了，炸到身边一圈的建筑' });
  else if (def.levels[0]!.splash) out.push({ icon: 'splash', text: `落点溅射 ${def.levels[0]!.splash} 格` });
  if (kind === 'shield') out.push({ icon: 'shield', text: `正面来的子弹、炮弹只吃 ${SHIELD.frontPct}%，身后 ${cells(SHIELD.coverRadius)} 格内的友军少吃 ${SHIELD.coverCutPct}%；挡不住溅射和抛射` });
  if (def.levels[0]!.range > 1.5 && def.aim !== 'heal') out.push({ icon: 'front', text: '前面有盾兵时会等它，不抢到盾前面' });
  return out;
}

// ---------------------------------------------------------------- 登陆战的防御

/** 有介绍卡片的防御（登陆战里会打人、会挡路的） */
export const DEFENSE_CARD_KINDS: readonly BuildingKind[] = ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper', 'kraken', 'mine', 'tar', 'wall'];
/** 单体直射：盾兵正面能挡 */
const DIRECT: ReadonlySet<BuildingKind> = new Set(['cannon', 'gunTower', 'harpoon', 'sniper']);
/** 瞄提前量的（炮弹落在兵要走到的地方） */
const LEAD: ReadonlySet<BuildingKind> = new Set(['cannon', 'mortar', 'rocket', 'shock', 'kraken']);

const defMax = (f: (k: BuildingKind) => number): number => Math.max(...DEFENSE_CARD_KINDS.filter((k) => k !== 'kraken').map(f));

export function defenseCard(kind: BuildingKind, level: number): IntelCard {
  const def = BUILDINGS[kind];
  const lv = Math.max(1, Math.min(def.maxLevel, level));
  const cur = raidDefenseBase(kind, lv);
  const nx = lv < def.maxLevel ? raidDefenseBase(kind, lv + 1) : null;
  const top = (k: BuildingKind) => raidDefenseBase(k, BUILDINGS[k].maxLevel);
  const hp = (k: BuildingKind, l: number) => BUILDINGS[k].levels[l - 1]?.hp ?? 0;
  const stats: IntelStat[] = [];
  const trap = kind === 'mine' || kind === 'tar';
  if (!trap) stats.push(stat({ key: 'hp', label: '血量', unit: '', cur: hp(kind, lv), next: nx ? hp(kind, lv + 1) : null, max: defMax((k) => hp(k, BUILDINGS[k].maxLevel)) }));
  if (cur.dmg > 0 && !trap) {
    stats.push(stat({ key: 'dps', label: '每秒伤害', unit: '', cur: dps(cur.dmg, cur.reload, cur.shots), next: nx ? dps(nx.dmg, nx.reload, nx.shots) : null, max: defMax((k) => dps(top(k).dmg, top(k).reload, top(k).shots)) }));
    stats.push(stat({ key: 'dmg', label: '每发伤害', unit: '', cur: cur.dmg, next: nx?.dmg ?? null, max: defMax((k) => top(k).dmg) }));
    stats.push(stat({ key: 'reload', label: '几秒一发', unit: ' 秒', cur: secs(cur.reload), next: nx ? secs(nx.reload) : null, max: Math.min(...DEFENSE_CARD_KINDS.filter((k) => top(k).dmg > 0 && k !== 'mine' && k !== 'tar').map((k) => secs(top(k).reload))), lower: true }));
  }
  if (kind === 'mine') stats.push(stat({ key: 'dmg', label: '爆炸伤害', unit: '', cur: cur.dmg, next: nx?.dmg ?? null, max: top('mine').dmg }));
  if (cur.range > 0) stats.push(stat({ key: 'range', label: trap ? '踩到范围' : '射程', unit: ' 格', cur: cells(cur.range), next: nx ? cells(nx.range) : null, max: trap ? cells(top(kind).range) : defMax((k) => (k === 'mine' || k === 'tar' ? 0 : cells(top(k).range))) }));
  if (cur.splash > 0) stats.push(stat({ key: 'splash', label: '溅射', unit: ' 格', cur: cells(cur.splash), next: nx ? cells(nx.splash) : null, max: defMax((k) => cells(top(k).splash)) }));
  if (cur.stun > 0) stats.push(stat({ key: 'stun', label: '震晕', unit: ' 秒', cur: secs(cur.stun), next: nx ? secs(nx.stun) : null, max: secs(top(kind).stun) }));
  const m = defenseMatchups(kind);
  return { family: 'defense', kind, name: def.name, level: lv, maxLevel: def.maxLevel, levelWord: '级', role: def.desc, stats, aims: defenseAims(kind, lv), beats: m.beats, fears: m.fears, none: [] };
}

function defenseAims(kind: BuildingKind, level: number): AimLine[] {
  const b = raidDefenseBase(kind, level);
  const out: AimLine[] = [];
  if (kind === 'wall') return [{ icon: 'wall', text: '不打人：连成墙兵就得绕路，绕不过去才砸墙；把兵引到炮口和地雷上' }];
  if (kind === 'mine') return [{ icon: 'hide', text: `埋着看不见，兵走到 ${cells(b.range)} 格内就炸，炸一圈 ${cells(b.splash)} 格；炸一次就没了` }];
  if (kind === 'tar') return [{ icon: 'slow', text: `埋着看不见，兵踩进 ${cells(b.splash)} 格内被粘住，走路慢 ${b.slowPct}%` }];
  if (kind === 'sniper') {
    const names = SNIPE_ORDER.map((g) => g.map((k) => TROOPS[k].name).join('、')).join(' > ');
    out.push({ icon: 'priority', text: `先打 ${names}，同一档先打血多的；锁定后 0.5 秒才开火，走出射程就白瞄` });
  } else if (kind === 'kraken') out.push({ icon: 'near', text: '长在海里，周期性拍打海滩上最近的那个兵' });
  else out.push({ icon: 'near', text: '打射程里离它最近的兵' });
  out.push({ icon: 'lock', text: '盯住一个打到死或走出射程；在路上的伤害已经够打死的，就换下一个' });
  if (b.minRange > 0) out.push({ icon: 'dead', text: `贴脸打不到：近处 ${cells(b.minRange)} 格内是死角` });
  if (b.shots > 1) out.push({ icon: 'multi', text: `一次 ${b.shots} 发，分给不同的兵` });
  if (b.splash > 0) out.push({ icon: 'splash', text: `落点溅射 ${cells(b.splash)} 格，越扎堆越疼` });
  if (b.stun > 0) out.push({ icon: 'stun', text: `被炸到的兵原地发晕 ${secs(b.stun)} 秒，盾兵晕了盾也放下` });
  if (LEAD.has(kind)) out.push({ icon: 'front', text: '炮弹瞄兵要走到的地方，直着走就会挨上' });
  if (DIRECT.has(kind)) out.push({ icon: 'shield', text: `单发直射：盾兵正面挡掉 ${100 - SHIELD.frontPct}%` });
  return out;
}

// ---------------------------------------------------------------- 守岛的塔

const TD_KINDS: readonly TdTowerKind[] = ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'];
const tdMax = (f: (k: TdTowerKind) => number): number => Math.max(...TD_KINDS.map(f));

export function tdTowerCard(kind: TdTowerKind, tier: TdTier): IntelCard {
  const cur = td2TierStats(kind, tier);
  const nx = tier < 3 ? td2TierStats(kind, (tier + 1) as TdTier) : null;
  const top = (k: TdTowerKind) => td2TierStats(k, 3);
  const stats: IntelStat[] = [
    stat({ key: 'dps', label: '每秒伤害', unit: '', cur: dps(cur.dmg, cur.reload, cur.shots), next: nx ? dps(nx.dmg, nx.reload, nx.shots) : null, max: tdMax((k) => dps(top(k).dmg, top(k).reload, top(k).shots)) }),
    stat({ key: 'dmg', label: '每发伤害', unit: '', cur: cur.dmg, next: nx?.dmg ?? null, max: tdMax((k) => top(k).dmg) }),
    stat({ key: 'reload', label: '几秒一发', unit: ' 秒', cur: secs(cur.reload), next: nx ? secs(nx.reload) : null, max: Math.min(...TD_KINDS.map((k) => secs(top(k).reload))), lower: true }),
    stat({ key: 'range', label: '射程', unit: ' 格', cur: cells(cur.range), next: nx ? cells(nx.range) : null, max: tdMax((k) => cells(top(k).range)) }),
  ];
  if (cur.splash > 0) stats.push(stat({ key: 'splash', label: '溅射', unit: ' 格', cur: cells(cur.splash), next: nx ? cells(nx.splash) : null, max: tdMax((k) => cells(top(k).splash)) }));
  const cc = towerCounter(kind);
  const aims: AimLine[] = [];
  if (kind === 'sniper') aims.push({ icon: 'priority', text: '先打首领和军医，再打扛着宝藏的，其余打走在最前面的；锁定 0.5 秒才开火' });
  else aims.push({ icon: 'front', text: '先打扛着宝藏往回跑的，再打离宝藏箱最近（走在最前面）的' });
  aims.push({ icon: 'lock', text: '盯住一个直到它死或走出射程；在路上的伤害已经够打死的，就换下一个' });
  if (cur.minRange > 0) aims.push({ icon: 'dead', text: `近处 ${cells(cur.minRange)} 格内打不到` });
  if (cur.shots > 1) aims.push({ icon: 'multi', text: `一次 ${cur.shots} 发，分给不同的敌人` });
  if (cur.splash > 0) aims.push({ icon: 'splash', text: `落点溅射 ${cells(cur.splash)} 格` });
  if (kind === 'shock') aims.push({ icon: 'stun', text: `命中震晕 ${secs(TD2_SHOCK_STUN)} 秒，之后一阵子震不晕，首领减半` });
  aims.push({ icon: 'air', text: !cc.none.includes('air') ? `能打${ARMOR_NAME.air}` : kind === 'rocket' ? `打不到${ARMOR_NAME.air}，选「高射」路线才能打` : `打不到${ARMOR_NAME.air}` });
  return {
    family: 'td',
    kind,
    name: BUILDINGS[kind].name,
    level: tier,
    maxLevel: 3,
    levelWord: '阶',
    role: `${TOWER_INFO[kind]?.line ?? ''}，打${DAMAGE_NAME[cc.dmg]}伤害`,
    stats,
    aims,
    beats: cc.good.map((a) => ARMOR_NAME[a]),
    fears: cc.weak.map((a) => ARMOR_NAME[a]),
    none: cc.none.map((a) => ARMOR_NAME[a]),
  };
}
