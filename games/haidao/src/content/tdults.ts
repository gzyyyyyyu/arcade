/**
 * 守岛的终极塔和「先打」（设计稿 td.md 批 1）：3 阶塔选完两档分叉后，花造价的 costPct% 换成终极，换外形、换打法，一座塔只能选一个。
 * 只在战役和海盗来袭打开（core/tdults.ts 的 deepOn），守岛第一章 td06 ≥ 1★ 才解锁；基地、登陆战、攻防都不读这张表。
 * 数值都相对这座塔 3 阶（含分叉）的数：dmgPct、reloadPct、rangePct 是百分比，splash 是单位（取和原来大的），ticks 是拍（20 拍 1 秒）。
 */
import type { TdEnemyKind } from '../core/tdtypes.ts';
import type { TdTowerKind } from '../core/td2types.ts';

export interface TdUltDef {
  id: string;
  tower: TdTowerKind;
  name: string;
  /** 终极卡上的一句话 */
  desc: string;
  /** 价 = 造价 × costPct% */
  costPct: number;
  dmgPct: number;
  reloadPct?: number;
  rangePct?: number;
  /** 溅射半径（单位）：和原来的取大的；写 0 的不改 */
  splash?: number;
  /** 一次打几个不同的目标（覆盖） */
  shots?: number;
  /** 身边照亮雾的半径（单位） */
  light?: number;
  /** 每第 n 发是「弱点射击」：伤害 × pct%，打重甲另加 heavy 个百分点 */
  every?: { n: number; pct: number; heavy: number };
  /** 打中飞禽减速 */
  airSlow?: { pct: number; ticks: number };
  /** 打首领（TD_ULT_BOSS）伤害 × bossPct% */
  bossPct?: number;
  /** 打中的地面敌人（不含首领）往回推：拉回 push 拍前走过的位置（和鱼叉拖拽同一套） */
  push?: number;
  /** 一炮落 n 发：目标点和身边 off 单位内的点（按敌人编号定序，不随机） */
  rain?: { n: number; off: number };
  /** 落点留火（按「火」算）：每秒伤害、持续拍数 */
  burn?: { dps: number; ticks: number };
  /** 打中晕几拍（免控、首领减半照 combat.ts applyStun） */
  stun?: number;
}

export const TD_ULTS: readonly TdUltDef[] = [
  {
    id: 'ult.eagle', tower: 'gunTower', name: '鹰眼哨', desc: '远射；每第 4 发打弱点 3 倍、打铁甲不减半；照亮身边的雾',
    costPct: 200, dmgPct: 190, rangePct: 150, light: 300, every: { n: 4, pct: 300, heavy: 50 },
  },
  {
    id: 'ult.gatling', tower: 'gunTower', name: '连珠楼', desc: '一次打 3 个；打中的鹦鹉慢下来',
    costPct: 200, dmgPct: 80, shots: 3, airSlow: { pct: 30, ticks: 20 },
  },
  {
    id: 'ult.siege', tower: 'cannon', name: '攻城巨炮', desc: '慢而重，打首领再加五成，落点小范围',
    costPct: 200, dmgPct: 450, reloadPct: 125, splash: 100, bossPct: 150,
  },
  {
    id: 'ult.blunder', tower: 'cannon', name: '霰弹炮台', desc: '近距离一大片，把地面的敌人往回推',
    costPct: 200, dmgPct: 120, reloadPct: 50, rangePct: 72, splash: 150, push: 10,
  },
  {
    id: 'ult.rain', tower: 'mortar', name: '火雨', desc: '一炮落三发，落点留火',
    costPct: 200, dmgPct: 70, rain: { n: 3, off: 100 }, burn: { dps: 30, ticks: 60 },
  },
  {
    id: 'ult.quake', tower: 'mortar', name: '震地弹', desc: '大范围，打中的晕一下',
    costPct: 200, dmgPct: 150, splash: 200, stun: 10,
  },
];

export const TD_ULT_BY_ID: ReadonlyMap<string, TdUltDef> = new Map(TD_ULTS.map((u) => [u.id, u]));

/** 这种塔有哪些终极（没有的塔为空） */
export function ultOptions(kind: string): TdUltDef[] {
  return TD_ULTS.filter((u) => u.tower === kind);
}

/** 守岛哪一关 ≥ 1★ 后解锁终极（第一章最后一关） */
export const TD_ULT_UNLOCK = 'td06';

/** 巨炮多打的「首领」 */
export const TD_ULT_BOSS: ReadonlySet<TdEnemyKind> = new Set<TdEnemyKind>(['captain', 'king', 'tyrantShip', 'tyrant', 'tyrantRun']);

/** 「先打」四档：最前（默认，原来的规则）、最强（血最多）、最近（离塔最近）、精英（精英和首领先） */
export type TdPrio = 'first' | 'strong' | 'near' | 'elite';
export const TD_PRIOS: readonly TdPrio[] = ['first', 'strong', 'near', 'elite'];
export const TD_PRIO_NAME: Readonly<Record<TdPrio, string>> = { first: '最前', strong: '最强', near: '最近', elite: '精英' };

/** 「先打：精英」排前面的：精英、首领、军医（新敌人在这里加） */
export const TD_PRIO_ELITE: ReadonlySet<string> = new Set<string>(['bosun', 'macaw', 'mate', 'captain', 'king', 'medic', 'drummer', 'tyrantShip', 'tyrant', 'tyrantRun']);
