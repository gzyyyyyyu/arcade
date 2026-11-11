import { BUILDINGS } from '../content/index.ts';
import { ISLAND, UNIT, type BBuilding, type BattleResult } from '../core/index.ts';
import { topBlame } from './fxlayout.ts';

/** 四面沙滩的登陆参考点（格坐标）：按左、下、右、上的顺序，和 SIDE_NAME 一一对应 */
export const BEACH_PTS: ReadonlyArray<readonly [number, number]> = [[-1.5, 11], [11, ISLAND + 0.5], [ISLAND + 0.5, 11], [11, -1.5]];
export const SIDE_NAME = ['左边', '下边', '右边', '上边'];
const ARTILLERY = new Set(['cannon', 'mortar', 'rocket', 'harpoon', 'shock']);

/** 失败建议要用到的这一场的统计（都是纯数据，不依赖 Phaser 和 DOM） */
export interface AdviceInput {
  buildings: ReadonlyArray<BBuilding>;
  deathBy: ReadonlyMap<string, number>;
  landPts: ReadonlyArray<{ x: number; y: number }>;
  casts: number;
  hasBrute: boolean;
  /** 这一关连输的次数（含这一场） */
  streak: number;
}

/** 失败原因：按这场的统计给 1–2 句话，连输再加一句换打法 */
export function adviceLines(res: Pick<BattleResult, 'destroyedPct'>, a: AdviceInput): string[] {
  const out: string[] = [];
  const lay = a.buildings.filter((b) => BUILDINGS[b.kind].category === 'defense' && b.kind !== 'mine' && b.kind !== 'tar' && b.kind !== 'kraken');
  const near = (px: number, py: number): number => lay.filter((b) => Math.hypot(b.x + b.size / 2 - px, b.y + b.size / 2 - py) <= 8).length;
  const tb = topBlame(a.deathBy);
  // 防御最少的一面沙滩（换一侧登陆的建议）
  const sideN = BEACH_PTS.map(([x, y]) => near(x, y));
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
  if (a.streak >= 2) lines.push(`已经连输 ${a.streak} 次了：换兵种搭配、换登陆点，或先去军械所升兵种。`);
  return lines;
}
