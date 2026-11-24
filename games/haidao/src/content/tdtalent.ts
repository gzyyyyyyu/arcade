/**
 * 守岛的海图天赋（设计稿 td.md 批 2）：三列 × 4 格，第 k 格花 k 点、要先点同列上一格；随时免费重置（存档只记点了哪几格）。
 * 点数 = ⌊守岛战役总星 ÷ 6⌋ + ⌊老兵徽数 ÷ 3⌋。只在战役和海盗来袭起作用；core/tdrun.ts 开局按存档折进 setup（talentFold），规则核心不读存档。
 * 存档的格 id：`tower1`…`hero4`、`supply1`…；炮台第 4 格带塔名 `tower4:<塔>`。
 */
import { TD_TOWER_KINDS } from '../core/td2types.ts';
import type { TdTowerKind } from '../core/td2types.ts';
import type { TdTalentFx } from '../core/tddeep.ts';

export type TdTalentCol = 'tower' | 'hero' | 'supply';
export const TD_TALENT_COLS: readonly TdTalentCol[] = ['tower', 'hero', 'supply'];
export const TD_TALENT_COL_NAME: Readonly<Record<TdTalentCol, string>> = { tower: '炮台', hero: '英雄', supply: '补给' };

export interface TdTalentDef {
  /** 存档 id（炮台第 4 格存成 `tower4:<塔>`） */
  id: string;
  col: TdTalentCol;
  /** 第几格（1–4），也是要花的点数 */
  row: number;
  name: string;
  desc: string;
}

export const TD_TALENTS: readonly TdTalentDef[] = [
  { id: 'tower1', col: 'tower', row: 1, name: '回收', desc: '卖塔退八成' },
  { id: 'tower2', col: 'tower', row: 2, name: '老匠人', desc: '终极塔便宜一成' },
  { id: 'tower3', col: 'tower', row: 3, name: '老兵驻守', desc: '驻守台的塔高一阶（最高 3 阶）' },
  { id: 'tower4', col: 'tower', row: 4, name: '偏爱', desc: '选一种塔伤害 +8%，别的 −3%' },
  { id: 'hero1', col: 'hero', row: 1, name: '快回', desc: '英雄复活快 15%' },
  { id: 'hero2', col: 'hero', row: 2, name: '大桶', desc: '炸药桶、急射旗范围大 0.2 格' },
  { id: 'hero3', col: 'hero', row: 3, name: '熟手', desc: '英雄技能冷却少 5%' },
  { id: 'hero4', col: 'hero', row: 4, name: '抢位', desc: '第一波前，英雄能直接摆到任意空地' },
  { id: 'supply1', col: 'supply', row: 1, name: '家底', desc: '开局多 15 金' },
  { id: 'supply2', col: 'supply', row: 2, name: '抢功', desc: '叫波奖励多 15%' },
  { id: 'supply3', col: 'supply', row: 3, name: '打捞队', desc: '清沉船便宜一半' },
  { id: 'supply4', col: 'supply', row: 4, name: '利息', desc: '每波开打时得当前金币 1%（最多 15）' },
];

export const TD_TALENT_BY_ID: ReadonlyMap<string, TdTalentDef> = new Map(TD_TALENTS.map((t) => [t.id, t]));

/** 炮台第 4 格的加成：选的塔 +focus%，别的 +other% */
export const TD_TALENT_FOCUS = { focus: 8, other: -3 } as const;
/** 补给第 1 格：开局多给的金 */
export const TD_TALENT_GOLD = 15;

/** 天赋点数 */
export function talentPoints(totalStars: number, vetBadges: number): number {
  return Math.floor(Math.max(0, totalStars) / 6) + Math.floor(Math.max(0, vetBadges) / 3);
}

/** 存档 id 对应的格（`tower4:<塔>` 回 tower4 那格和塔名）；不认识的为 null */
export function talentCell(id: string): { def: TdTalentDef; focus?: TdTowerKind } | null {
  const [base, kind] = id.split(':');
  const def = TD_TALENT_BY_ID.get(base ?? '');
  if (!def) return null;
  if (def.id === 'tower4') {
    if (!kind || !(TD_TOWER_KINDS as readonly string[]).includes(kind)) return null;
    return { def, focus: kind as TdTowerKind };
  }
  return kind === undefined ? { def } : null;
}

/** 一组格花多少点 */
export function talentSpent(ids: readonly string[]): number {
  return ids.reduce((s, id) => s + (talentCell(id)?.def.row ?? 0), 0);
}

/**
 * 这组格合不合法：都认识、不重复（一列一格一次）、每格同列上一格也点了、总点数不超过 points。
 * 不合法回原因，合法回 null。
 */
export function talentError(ids: readonly string[], points: number): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    const c = talentCell(id);
    if (!c) return 'bad_talent';
    if (seen.has(c.def.id)) return 'dup_talent';
    seen.add(c.def.id);
  }
  for (const id of seen) {
    const d = TD_TALENT_BY_ID.get(id) as TdTalentDef;
    if (d.row > 1 && !seen.has(`${d.col}${d.row - 1}`)) return 'need_prev';
  }
  return talentSpent(ids) > points ? 'no_points' : null;
}

/** 天赋折好的开局效果：fx 写进 setup.talent，其余由 tdrun 折进 setup 现成字段 */
export interface TdTalentFold {
  fx: TdTalentFx;
  /** 开局多给的金 */
  gold: number;
  /** 驻守台的塔高一阶 */
  garrisonUp: boolean;
  /** 偏爱的塔（加成折进 setup.bonus） */
  focus?: TdTowerKind;
}

/** 折天赋（ids 要先过 talentError） */
export function talentFold(ids: readonly string[]): TdTalentFold {
  const out: TdTalentFold = { fx: {}, gold: 0, garrisonUp: false };
  for (const id of ids) {
    const c = talentCell(id);
    if (!c) continue;
    switch (c.def.id) {
      case 'tower1': out.fx.sellPct = 80; break;
      case 'tower2': out.fx.ultPct = 90; break;
      case 'tower3': out.garrisonUp = true; break;
      case 'tower4': out.focus = c.focus; break;
      case 'hero1': out.fx.respawnPct = 85; break;
      case 'hero2': out.fx.skillR = 20; break;
      case 'hero3': out.fx.cdPct = 95; break;
      case 'hero4': out.fx.heroDrag = true; break;
      case 'supply1': out.gold = TD_TALENT_GOLD; break;
      case 'supply2': out.fx.callPct = 115; break;
      case 'supply3': out.fx.clearPct = 50; break;
      case 'supply4': out.fx.interest = { pct: 1, cap: 15 }; break;
    }
  }
  return out;
}

/** 偏爱折成的每种塔加成（和基地加成相加） */
export function focusBonus(focus: TdTowerKind | undefined, base: Partial<Record<TdTowerKind, number>> = {}): Partial<Record<TdTowerKind, number>> {
  if (!focus) return { ...base };
  const out: Partial<Record<TdTowerKind, number>> = {};
  for (const k of TD_TOWER_KINDS) out[k] = (base[k] ?? 0) + (k === focus ? TD_TALENT_FOCUS.focus : TD_TALENT_FOCUS.other);
  return out;
}
