/**
 * 周目标（docs/design-play.md 2.6）：北京时间每个自然周（周一起）3 条，按周序号从三个池子里各轮一条（不用随机）。
 * 守夜、夜探、实盘、试炼、每日挑战的局都算进度（只看打了什么，不看输赢筹码）；首领连战不算（构筑是给好的）。
 * 每条完成给铜钱，三条都完成再加一份。进度和发奖在 platform/save.ts（流水 id `weekgoal:<周>:<n>`、`weekgoal:<周>:all`）。
 */

/** 一局里周目标看得到的东西（finish 里从对局和结算凑） */
export interface WeekRun {
  /** 守夜（含实盘守夜、试炼守夜）/ 夜探 */
  mode: 'vigil' | 'raid';
  /** 守夜撑到天亮 / 夜探撤出 */
  won: boolean;
  danger: number;
  kills: number;
  elites: number;
  boss: boolean;
  evolves: number;
  /** 夜探撤出时带出几件宝物 */
  treasures: number;
}

export interface WeekGoalDef {
  id: string;
  text: string;
  need: number;
  /** 这一局给多少进度 */
  gain: (r: WeekRun) => number;
}

const dawn = (r: WeekRun): number => (r.mode === 'vigil' && r.won ? 1 : 0);

/** 三个池子：第 n 条从第 n 个池子轮，奖励随之 300 / 500 / 800 */
const WEEK_GOAL_POOLS: readonly (readonly WeekGoalDef[])[] = [
  [
    { id: 'dawn1', text: '守夜撑到天亮 1 次', need: 1, gain: dawn },
    { id: 'kill3k', text: '一共打倒 3,000 只怪', need: 3000, gain: (r) => r.kills },
    { id: 'raid1', text: '夜探撤出 1 次', need: 1, gain: (r) => (r.mode === 'raid' && r.won ? 1 : 0) },
    { id: 'elite10', text: '一共打倒 10 只精英', need: 10, gain: (r) => r.elites },
  ],
  [
    { id: 'evo4', text: '进化法器 4 次', need: 4, gain: (r) => r.evolves },
    { id: 'dawn3', text: '守夜撑到天亮 3 次', need: 3, gain: dawn },
    { id: 'loot5', text: '夜探带出 5 件宝物', need: 5, gain: (r) => (r.mode === 'raid' && r.won ? r.treasures : 0) },
    { id: 'elite25', text: '一共打倒 25 只精英', need: 25, gain: (r) => r.elites },
  ],
  [
    { id: 'boss2', text: '打倒尸王 2 次', need: 2, gain: (r) => (r.boss ? 1 : 0) },
    { id: 'hard2', text: '危险 4 以上撑到天亮 2 次', need: 2, gain: (r) => (r.danger >= 4 ? dawn(r) : 0) },
    { id: 'loot12', text: '夜探带出 12 件宝物', need: 12, gain: (r) => (r.mode === 'raid' && r.won ? r.treasures : 0) },
    { id: 'elite60', text: '一共打倒 60 只精英', need: 60, gain: (r) => r.elites },
  ],
];

/** 每条的铜钱、三条全完成另给 */
export const WEEK_GOAL_COINS: readonly number[] = [300, 500, 800];
export const WEEK_GOAL_ALL = 500;

/** 第几周（online/weekly.ts weekIndex）的 3 条 */
export function weekGoals(week: number): readonly WeekGoalDef[] {
  return WEEK_GOAL_POOLS.map((pool, n) => pool[(((week + n) % pool.length) + pool.length) % pool.length]!);
}
