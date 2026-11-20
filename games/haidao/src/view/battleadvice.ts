import { BUILDINGS } from '../content/index.ts';
import { ISLAND, UNIT, type BBuilding, type BattleResult } from '../core/index.ts';
import { topBlame } from './fxlayout.ts';

/** 四面沙滩的登陆参考点（格坐标）：按左、下、右、上的顺序，和 SIDE_NAME 一一对应；ext 是岛扩了几圈，沙滩跟着往外挪 */
export function beachPts(ext: number): ReadonlyArray<readonly [number, number]> {
  return [[-1.5 - ext, 11], [11, ISLAND + ext + 0.5], [ISLAND + ext + 0.5, 11], [11, -1.5 - ext]];
}
export const SIDE_NAME = ['左边', '下边', '右边', '上边'];
const ARTILLERY = new Set(['cannon', 'mortar', 'rocket', 'harpoon', 'shock']);

/** 失败建议要用到的这一场的统计（都是纯数据，不依赖 Phaser 和 DOM） */
export interface AdviceInput {
  buildings: ReadonlyArray<BBuilding>;
  /** 岛扩了几圈（这一局的 state.ext） */
  ext: number;
  deathBy: ReadonlyMap<string, number>;
  landPts: ReadonlyArray<{ x: number; y: number }>;
  casts: number;
  hasBrute: boolean;
  /** 这一关连输的次数（含这一场） */
  streak: number;
  /** 船坞等级和能升到的等级（= 主寨）：没跟上时连输建议改指船坞（不给就按跟上算） */
  dock?: { have: number; can: number };
}

/**
 * 船坞从 have 级升到 want 级多出来的东西：「多 1 条船、每船 14→16 人」；跟上了返回 null。
 * 中段（主寨 8 第一关 c23）卡关的真正原因是船坞比主寨低一级，不是研究（DESIGN 2.4）：输了要指对路。
 */
export function dockGain(have: number, want: number): string | null {
  // 还没造船坞（have = 0）不在这里管：造船坞有新手引导
  if (have < 1 || have >= want) return null;
  const a = BUILDINGS.dock.levels[have - 1];
  const b = BUILDINGS.dock.levels[want - 1];
  if (!b) return null;
  const parts: string[] = [];
  const boats = (b.boats ?? 0) - (a?.boats ?? 0);
  if (boats > 0) parts.push(`多 ${boats} 条船`);
  if ((b.boatCap ?? 0) > (a?.boatCap ?? 0)) parts.push(`每船 ${a?.boatCap ?? 0}→${b.boatCap} 人`);
  return parts.length ? parts.join('、') : null;
}

/** 失败原因：按这场的统计给 1–2 句话，连输再加一句换打法 */
export function adviceLines(res: Pick<BattleResult, 'destroyedPct'>, a: AdviceInput): string[] {
  const out: string[] = [];
  const lay = a.buildings.filter((b) => BUILDINGS[b.kind].category === 'defense' && b.kind !== 'mine' && b.kind !== 'tar' && b.kind !== 'kraken');
  const near = (px: number, py: number): number => lay.filter((b) => Math.hypot(b.x + b.size / 2 - px, b.y + b.size / 2 - py) <= 8).length;
  const tb = topBlame(a.deathBy);
  // 防御最少的一面沙滩（换一侧登陆的建议）
  const sideN = beachPts(a.ext).map(([x, y]) => near(x, y));
  const bestSide = sideN.indexOf(Math.min(...sideN));
  if (tb) {
    const nm = BUILDINGS[tb.kind as keyof typeof BUILDINGS].name;
    const pct = Math.round((tb.n / tb.total) * 100);
    if (ARTILLERY.has(tb.kind)) out.push(`「${nm}」打倒了 ${pct}% 的兵：点「炮击」再点它，或者改从${SIDE_NAME[bestSide]}沙滩登陆。`);
    else if (tb.kind === 'flame') out.push(`「喷火塔」烧倒了 ${pct}% 的兵：别让兵扎堆，分两侧登陆，或先炮击它。`);
    else out.push(`「${nm}」旁边倒了 ${pct}% 的兵：带壮汉顶在前面，或者改从${SIDE_NAME[bestSide]}沙滩登陆。`);
  }
  if (a.landPts.length && !tb) {
    const here = a.landPts.reduce((n, p) => n + near(p.x / UNIT, p.y / UNIT), 0) / a.landPts.length;
    if (here >= Math.min(...sideN) + 2) out.push(`登陆点离防御太近：改从${SIDE_NAME[bestSide]}沙滩登陆，那边防御最少。`);
  }
  if (a.casts === 0) out.push('炮击一次都没放：能量够了就点技能，再点那门最凶的炮。');
  if (out.length < 2 && !a.hasBrute && lay.length >= 4) out.push('防御不少：带壮汉顶在前面吸引火力。');
  if (!out.length) out.push(res.destroyedPct < 5 ? '这次兵没打出伤害：换个登陆点，或先升级兵种和军械所再来。' : '再试一次：先点炮击打掉最凶的那座防御，再换个登陆点。');
  const lines = out.slice(0, 2);
  if (a.streak >= 2) {
    const gain = a.dock ? dockGain(a.dock.have, a.dock.can) : null;
    lines.push(a.dock && gain ? `已经连输 ${a.streak} 次了：先把船坞升到 ${a.dock.can} 级（${gain}），比升兵种管用。` : `已经连输 ${a.streak} 次了：换兵种搭配、换登陆点，或先去军械所升兵种。`);
  }
  return lines;
}
