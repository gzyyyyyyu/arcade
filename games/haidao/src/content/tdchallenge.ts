/**
 * 守岛战役的老兵难度和关卡挑战（设计稿 td.md 批 2）。只在战役：海盗来袭、悬赏守岛、大潮、护航都不读这张表。
 * 老兵：一关 3★ 后能开，预算 × TD_VET_BUDGET_PCT%、精英从第 3 波起、不给新手放宽（开局多给的金照留）、丢 6 枚就输（core/tddeep.ts TD_VET_LOSE_AT）。
 * 挑战：一关 ≥1★ 后能开，限制只用现有开关拼（core/tddeep.ts 的 TdRule）。老兵徽、挑战章都只记在存档里，不给金币木材、不碰筹码。
 */
import { TD2_LEVEL_DEFS, buildLevel } from './td2levels.ts';
import type { TdIslandLevel } from '../core/td2types.ts';
import type { TdRule } from '../core/tddeep.ts';

/** 老兵局的波次预算 × 这么多 % */
export const TD_VET_BUDGET_PCT = 130;
/** 个别关的老兵预算（td-sim --vet 稳机器人 ≥1★ 远低于 40% 的关单拧） */
export const TD_VET_BUDGET_BY_ID: Readonly<Record<string, number>> = { td24: 110 };
/** 老兵局精英从第几波起（0 起，2 = 第 3 波） */
export const TD_VET_ELITE_FROM = 2;

const vetCache = new Map<string, TdIslandLevel>();

/** 老兵档的关卡（id 和普通档相同）；没有这关为 undefined */
export function vetLevel(id: string): TdIslandLevel | undefined {
  const hit = vetCache.get(id);
  if (hit) return hit;
  const def = TD2_LEVEL_DEFS.find((d) => d.id === id);
  if (!def) return undefined;
  const ease = def.ease?.gold ? { gold: def.ease.gold } : undefined;
  const lv = buildLevel({ ...def, ease, elite: { ...(def.elite ?? {}), from: TD_VET_ELITE_FROM } }, TD_VET_BUDGET_BY_ID[id] ?? TD_VET_BUDGET_PCT);
  vetCache.set(id, lv);
  return lv;
}

export interface TdChallengeDef {
  /** 关 id */
  id: string;
  name: string;
  /** 选关卡片上的一句话 */
  desc: string;
  rule: TdRule;
}

export const TD_CHALLENGES: readonly TdChallengeDef[] = [
  { id: 'td03', name: '两样就够', desc: '只许造火枪塔、加农炮', rule: { kinds: ['gunTower', 'cannon'] } },
  { id: 'td05', name: '独木难支', desc: '木台不能造，只有驻守台和英雄', rule: { noPads: true } },
  { id: 'td09', name: '不点灯', desc: '火枪塔不许选灯塔', rule: { noBranch: ['gunTower.lighthouse'] } },
  { id: 'td12', name: '闸门全开', desc: '水闸不能用', rule: { noSluice: true } },
  { id: 'td14', name: '不卖不拆', desc: '塔不能卖', rule: { noSell: true } },
  { id: 'td17', name: '老炮封存', desc: '岸防老炮不能用', rule: { noBattery: true } },
  // J 图第 10 块木台（下标 9，13,19）离东南后岛登陆点最近
  { id: 'td20', name: '只守桥头', desc: '后岛那块木台不能造', rule: { noSlots: [9] } },
  { id: 'td24', name: '王前无援', desc: '援船不来，英雄技能冷却多一半', rule: { noFleet: true, heroCdPct: 150 } },
  { id: 'td26', name: '高台不上', desc: '崖上的高台不能造', rule: { noHigh: true } },
  { id: 'td30', name: '半饷', desc: '开局金一半，叫波奖励一半', rule: { goldPct: 50, callPct: 50 } },
];

export const TD_CHALLENGE_BY_ID: ReadonlyMap<string, TdChallengeDef> = new Map(TD_CHALLENGES.map((c) => [c.id, c]));
