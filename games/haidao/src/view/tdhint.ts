/**
 * 守岛里「第一次来某种敌人」的提示（纯函数，不依赖 Phaser / DOM；画面在 tdhud.ts 的 foeHint，卡片是 hintcard.ts 共用的）。
 * 每种敌人一句大白话：它会干什么、该用什么伤害打（伤害读克制表，不写死）。已见过的记在本地存储 haidao.hint.foe，
 * tests/tdhint.test.ts 锁住。
 */
import { COUNTER, TD_ENEMY_ARMOR, TD_TOWER_DAMAGE, bestDamageVs, type TdArmor, type TdDamage, type TdEnemyKind, type TdTowerKind } from '../core/index.ts';
import type { TdEventKind } from '../core/tdtypes.ts';
import { ARMOR_NAME, DAMAGE_NAME } from './td-ui.ts';
import { TD2_ENEMIES } from '../content/td2units.ts';

export const FOE_KEY = 'haidao.hint.foe';
/** 一次最多提示几种，避免一张卡太长 */
export const FOE_MAX = 2;

/** 它会干什么（≤ 16 字；怎么打由 foeText 按克制表补上） */
const FOE_TRAIT: Readonly<Record<TdEnemyKind, string>> = {
  sailor: '最常见的海盗，人多',
  ironclad: '皮厚、走得慢',
  fog: '躲在雾里，要灯塔或英雄照亮才打得到',
  skiff: '打沉会分成 3 条小艇',
  skiffling: '又小又快',
  sapper: '冲到墙前自爆，把墙炸开',
  parrot: '会飞，墙和拒马拦不住',
  captain: '首领：身边的海盗走得更快',
  shield: '正面挡枪和炮，火和爆照吃',
  grenadier: '隔着墙扔手雷，炸墙',
  bosun: '一个顶四个，狙击、臼炮打它最划算',
  macaw: '一只顶一群，会飞，要多留火枪塔',
  mate: '倒下散成 3 个水手，要有溅射收',
  medic: '给身边的同伴回血，先打掉它',
  gunboat: '停在海上炸哑塔，射程 8 格以上的塔才打得到',
  king: '停在海上放人上岸、血过半叫护航；射程 8 格以上的塔才够得着',
};

/**
 * 一句话：会干什么 + 护甲 + 什么伤害打它多一半（和克制表、图鉴同一个说法）。挑哪种伤害和预告卡的建议同一口径（td-ui.ts 的 fitSuggest）：只从这局能造的塔里挑，
 * 只有一种伤害可选或并列时不写（前几关只有加农炮和火枪塔，写「火打它多一半」等于让玩家找一座造不了的塔）；unlocked 为空（没限制）按克制表挑。
 */
export function foeText(k: TdEnemyKind, unlocked?: readonly TdTowerKind[]): string {
  const a = TD_ENEMY_ARMOR[k];
  const best = bestOf(a, unlocked?.length ? [...new Set(unlocked.map((t) => TD_TOWER_DAMAGE[t]))] : null);
  // 炮艇在海上，克制它的伤害种类里有的塔（火焰、加农）根本够不着，只说特点（特点里写了谁够得着）
  if (TD2_ENEMIES[k].shell) return `${FOE_TRAIT[k]}。`;
  return `${FOE_TRAIT[k]}。${ARMOR_NAME[a]}${best ? `：${DAMAGE_NAME[best]}打它多一半` : ''}`;
}

function bestOf(a: TdArmor, dmgs: TdDamage[] | null): TdDamage | null {
  if (!dmgs) return bestDamageVs(a);
  if (dmgs.length < 2) return null;
  const top = Math.max(...dmgs.map((d) => COUNTER[d][a]));
  const tops = dmgs.filter((d) => COUNTER[d][a] === top);
  return tops.length === 1 ? tops[0]! : null;
}

/** 这一波里第一次见到的敌人：按出场顺序、最多 max 种；已见过的不出 */
export function newFoes(kinds: Iterable<TdEnemyKind>, seen: ReadonlySet<string>, max = FOE_MAX): TdEnemyKind[] {
  const out: TdEnemyKind[] = [];
  for (const k of kinds) if (!seen.has(k) && !out.includes(k) && out.length < max) out.push(k);
  return out;
}

// ---------------------------------------------------------------- 章末机制（规则版本 16）

export const MECH_KEY = 'haidao.hint.mech';
/** 章末机制和关内事件（规则版本 22）共用这一套首次提示 */
export type MechKind = 'crate' | 'sluice' | 'battery' | 'fleet' | TdEventKind;

/** 每种章末机制一句怎么用（每章倒数第二关第一次见到时弹，和新敌人共用一张卡） */
export const MECH_HINT: Readonly<Record<MechKind, { name: string; text: string }>> = {
  crate: { name: '漂流补给箱', text: '有的波会漂来箱子：点它叫英雄去捡，给金币、技能马上好' },
  sluice: { name: '潮汐水闸', text: '落潮路要开时点「水闸」关上，那条路的敌人改走主路' },
  battery: { name: '岸防老炮', text: '点「老炮」再点地面，1 秒后落一发大炸弹；打不到飞的' },
  fleet: { name: '友军巡航船', text: '点「援船」叫船沿岸边开半圈，海上的炮艇也打得到' },
  bounty: { name: '赏金船', text: '挂金旗的海盗不抢宝藏、横穿上岛就跑；打倒它多给一笔金币' },
  rain: { name: '暴雨', text: '下雨的那一波火弱两成、地上的火不烧，飞的也慢一点' },
  dare: { name: '战书', text: '开打前可以接：这一波敌人多 1/4，打倒的金币翻倍' },
};

/** 这一局有哪些章末机制（只看规则核心建好的状态：旧版本的局、没有机制的关为空） */
export function mechsOf(s: {
  drift?: unknown; sluice?: unknown; battery?: unknown; fleet?: unknown;
  happen?: { at: ReadonlyArray<{ kind: TdEventKind }> };
}): MechKind[] {
  const out: MechKind[] = [];
  if (s.drift) out.push('crate');
  if (s.sluice) out.push('sluice');
  if (s.battery) out.push('battery');
  if (s.fleet) out.push('fleet');
  // 关内事件（规则版本 22）：这一局会发生的
  for (const a of s.happen?.at ?? []) if (!out.includes(a.kind)) out.push(a.kind);
  return out;
}
