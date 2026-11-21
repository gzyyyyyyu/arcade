/**
 * 娱乐玩法共用的难度目标线（docs/balance-haidao.md「难度曲线总表」）：出海战役、守岛战役、护航都按「这一关在本玩法里走到哪」取目标，
 * 配平模拟器（tools/sim.ts、td-sim.ts、escort-sim.ts）的「目标」列和离群标记都读这里，数字只在这一处。规则核心不读。
 * - 稳机器人（会放技能的 normal）三星率：第一关 100%，线性降到最后一关 45%；
 * - 新手机器人（出海 novice、守岛 guided、护航 novice）至少 1 星：100% 线性降到 65%；
 * - 实测偏出目标超过 DIFF_TOL 个百分点算离群，要调到线上（宁简勿难：两条线顾不全时先保新手过关、往容易的一边偏）。
 * 进度 p：出海、守岛是第 i 关 / (关数 − 1)；护航三张图并列，按难度档（新手 0、普通 0.5、高手 1）。
 */
const DIFF_TOL = 20;
const STEADY3 = { from: 100, to: 45 } as const;
const NOVICE1 = { from: 100, to: 65 } as const;

interface DiffTarget {
  /** 稳机器人三星率（%） */
  steady3: number;
  /** 新手机器人至少 1 星的比例（%） */
  novice1: number;
}

/** p ∈ [0, 1]：本玩法里的进度 */
export function diffTarget(p: number): DiffTarget {
  const q = Math.max(0, Math.min(1, p));
  return { steady3: STEADY3.from + (STEADY3.to - STEADY3.from) * q, novice1: NOVICE1.from + (NOVICE1.to - NOVICE1.from) * q };
}

/** 第 i 关（0 起）在 n 关里的进度 */
export function progressOf(i: number, n: number): number {
  return n > 1 ? i / (n - 1) : 0;
}

/** 实测和目标差多少：在容差带里给空串，偏出给「↑」（太容易）或「↓」（太难），模拟器的离群标记 */
export function offMark(actual: number, target: number): string {
  if (actual > target + DIFF_TOL) return '↑';
  if (actual < target - DIFF_TOL) return '↓';
  return '';
}
