/**
 * 守岛相关的基地函数（纯函数，不改入参）：塔的分叉、守岛英雄的研究、给攻防用的快照。
 * 规则版本 6 起宝藏箱、分叉、英雄研究都进攻防（DESIGN 10.6）：pvpSnapshot 只去掉攻防用不上的本机进度。
 */
import { BRANCH_BY_ID, BRANCH_LEVEL } from '../content/branches.ts';
import { HERO_RESEARCH_MAX } from '../content/tdunits.ts';
import { hqLevel } from './base.ts';
import type { BuildingKind, Profile, Res, Result } from './types.ts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * 能不能给一座 kind、level 级、已选 current 的塔再选分叉 id；能就返回 null，不能返回原因码：
 * bad_branch（没有这个分叉或不是这种塔的）/ chosen（这一档已经选过）/ need_level（没到 3 级或 6 级）/ need_tier1（6 级那次要先选 3 级那次）
 */
export function branchError(kind: BuildingKind, level: number, current: readonly string[], id: string): string | null {
  const def = BRANCH_BY_ID.get(id);
  if (!def || def.tower !== kind) return 'bad_branch';
  if (current[def.tier - 1] !== undefined) return 'chosen';
  if (level < BRANCH_LEVEL[def.tier]) return 'need_level';
  if (def.tier === 2 && current[0] === undefined) return 'need_tier1';
  return null;
}

/** 常驻塔选分叉：一座塔每档只能选一次，改路线要拆了重建（DESIGN 10.2） */
export function chooseBranch(p: Profile, id: number, branch: string): Result<Profile> {
  const b = p.base.buildings.find((q) => q.id === id);
  if (!b) return err('not_found');
  const cur = b.branch ?? [];
  const e = branchError(b.kind, b.level, cur, branch);
  if (e) return err(e);
  const next = [...cur, branch];
  return ok({ ...p, base: { ...p.base, buildings: p.base.buildings.map((q) => (q.id === id ? { ...q, branch: next } : q)) } });
}

/** 不可信的分叉列表（存档、快照）→ 合法的前缀；一个都不合法为 undefined */
export function sanitizeBranch(kind: BuildingKind, level: number, raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const id of raw.slice(0, 2)) {
    if (typeof id !== 'string' || branchError(kind, level, out, id) !== null) break;
    out.push(id);
  }
  return out.length > 0 ? out : undefined;
}

/** 英雄研究能到几级：主寨 8 级前等于主寨等级，8 级起 HERO_RESEARCH_MAX */
export const heroCap = (hq: number): number => (hq >= 8 ? HERO_RESEARCH_MAX : Math.max(1, hq));

/** 守岛英雄的等级：研究 hero（没写 = 1），封顶 heroCap（降不了主寨，这里只是兜底坏档） */
export function heroLevel(p: Profile): number {
  const lv = p.research.hero ?? 1;
  return Math.max(1, Math.min(lv, heroCap(hqLevel(p))));
}

/** 英雄研究的花费：只花木材（DESIGN 10.4），和兵种研究同一条曲线的木材部分再贵一半，因为英雄一个顶一座塔 */
export function heroResearchCost(current: number): Res {
  return { gold: 0, wood: 300 * current * current };
}

/** 军械所研究英雄：要有军械所，最高 heroCap（主寨 8 级前等于主寨等级） */
export function researchHero(p: Profile): Result<Profile> {
  const cur = p.research.hero ?? 1;
  if (cur >= heroCap(hqLevel(p))) return err('max');
  if (!p.base.buildings.some((b) => b.kind === 'armory')) return err('need_armory');
  const cost = heroResearchCost(cur);
  if (p.res.wood < cost.wood) return err('no_wood');
  return ok({ ...p, res: { gold: p.res.gold, wood: p.res.wood - cost.wood }, research: { ...p.research, hero: cur + 1 } });
}

/**
 * 给攻防用的快照：宝藏箱、分叉、英雄研究原样带上（规则版本 6，服务端 validateBase 校验），只去掉攻防用不上的本机进度
 * （守岛进度 td、每日悬赏 daily、成就和称号、王阶攒了一半的 rankFund），快照小一点（上限 16 KB）。王阶 rank 留着，只给对面看王旗。
 */
export function pvpSnapshot(p: Profile): Profile {
  const { td: _td, daily: _daily, title: _title, rankFund: _fund, ...rest } = p;
  void _td;
  void _daily;
  void _title;
  void _fund;
  return { ...rest, achievements: [] };
}

/** 一座建筑能不能选分叉（界面判断按钮用）：防御塔和陷阱 */
export function hasBranches(kind: BuildingKind): boolean {
  for (const d of BRANCH_BY_ID.values()) if (d.tower === kind) return true;
  return false;
}
