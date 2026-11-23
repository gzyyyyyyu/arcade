/**
 * 守岛的「深度」玩法（设计稿 td.md 批 1、批 2）：终极塔、先打、老兵难度、关卡挑战、海图天赋在局内的那一半。
 * 只在战役和海盗来袭打开（deepOn）：悬赏守岛、大潮、护航收到 ult / prio 操作一律忽略，setup 上的这些字段也不读，实盘逐位不变。
 * 开局由 tdrun 按存档算好写进 TdSetup（ult、vet、rule、talent），规则核心不读存档；能折进 setup 现成字段的（能造的塔、开局金、基地加成、驻守台阶）在 tdrun 折，
 * 这里只管局内要看的那几样。纯函数、整数。
 */
import { TD2_COST } from '../content/td2units.ts';
import { TD_ULT_BY_ID } from '../content/tdults.ts';
import type { TdUltDef } from '../content/tdults.ts';
import type { TdMode, TdTowerKind } from './td2types.ts';
import type { TdSetup, TdTower } from './tdtypes.ts';

/** 关卡挑战的限制（只用现有开关拼）：写了哪条才管哪条 */
export interface TdRule {
  /** 只许造这几种（tdrun 折进 setup.unlocked，这里留着给界面写说明） */
  kinds?: TdTowerKind[];
  /** 木台不能造（只剩驻守台和英雄） */
  noPads?: true;
  /** 这些分叉不许选 */
  noBranch?: string[];
  /** 水闸、岸防老炮、友军船不能用 */
  noSluice?: true;
  noBattery?: true;
  noFleet?: true;
  /** 不能卖塔 */
  noSell?: true;
  /** 这几块木台（关卡木台下标）不能造 */
  noSlots?: number[];
  /** 崖上的高台不能造 */
  noHigh?: true;
  /** 英雄技能冷却 × heroCdPct% */
  heroCdPct?: number;
  /** 开局金 × goldPct%（tdrun 折进关卡）、叫波奖励 × callPct% */
  goldPct?: number;
  callPct?: number;
}

/** 海图天赋折好的局内效果（tdrun 按点了哪几格算好；开局金、基地加成、驻守台阶由 tdrun 折进 setup 别的字段） */
export interface TdTalentFx {
  /** 卖塔退百分之几（不写按 TD2_ECON.sellPct） */
  sellPct?: number;
  /** 终极塔价格 × ultPct% */
  ultPct?: number;
  /** 英雄复活时间 × respawnPct% */
  respawnPct?: number;
  /** 炸药桶、急射旗半径多几个单位 */
  skillR?: number;
  /** 英雄技能冷却 × cdPct% */
  cdPct?: number;
  /** 第一波开打前，英雄可以直接摆到任意能站的空地 */
  heroDrag?: true;
  /** 叫波奖励 × callPct% */
  callPct?: number;
  /** 花钱清沉船 × clearPct% */
  clearPct?: number;
  /** 每波开打时给当前金币的 pct%，封顶 cap */
  interest?: { pct: number; cap: number };
}

/** 局内这一套开着时的状态（createTd 按 setup 写；没开为 undefined） */
export interface TdDeep {
  ult: boolean;
  vet: boolean;
  rule: TdRule;
  talent: TdTalentFx;
}

/** 老兵局：丢到这么多枚就输（普通局 TD2_LOSE_AT） */
export const TD_VET_LOSE_AT = 6;

/** 这种玩法开不开深度玩法：战役和海盗来袭 */
export function deepOn(setup: { mode: TdMode }): boolean {
  return setup.mode === 'campaign' || setup.mode === 'home';
}

/** 开局：deepOn 的局才建状态，老兵和挑战只在战役（海盗来袭只吃天赋和终极） */
export function deepOf(setup: TdSetup): TdDeep | undefined {
  if (!deepOn(setup)) return undefined;
  const camp = setup.mode === 'campaign';
  return { ult: !!setup.ult, vet: camp && !!setup.vet, rule: camp ? { ...(setup.rule ?? {}) } : {}, talent: { ...(setup.talent ?? {}) } };
}

/** 一座塔现在能换哪个终极：塔要 3 阶、两档分叉选完、还没换过，终极属于这种塔 */
export function ultError(t: Pick<TdTower, 'kind' | 'tier' | 'branch' | 'ult'>, id: string): string | null {
  const u = TD_ULT_BY_ID.get(id);
  if (!u || u.tower !== t.kind) return 'bad_ult';
  if (t.tier !== 3 || t.branch.length < 2) return 'not_ready';
  if (t.ult) return 'has_ult';
  return null;
}

/** 终极的价（天赋打折后） */
export function ultCost(u: Pick<TdUltDef, 'tower' | 'costPct'>, talent: TdTalentFx | undefined): number {
  const base = Math.floor((TD2_COST[u.tower] * u.costPct) / 100);
  return talent?.ultPct ? Math.floor((base * talent.ultPct) / 100) : base;
}

/** 两个百分比相乘（都没写为 undefined） */
export function pctOf(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.floor((a * b) / 100);
}
