/**
 * 护航（守岛的新玩法，DESIGN 第 12 节）的类型和常量：商船沿写死的航线从起点开到终点，海盗上岸追着船咬；
 * 玩家在航线边的木台造塔、英雄贴身守、随时定船速（停 / 巡航 / 冲）、花金币修船。到终点时船剩多少血定星。
 *
 * 只在关卡带 `escort` 字段时生效（TdLevel.escort），守岛现有玩法逐位不变（tests/td-golden.test.ts 不重新生成）；
 * 护航自己的规则版本是 ESCORT_RULES，不动 RULES_VERSION。
 */
import type { TdLevel } from './tdtypes.ts';

/** 护航自己的规则版本：护航规则改了就加一（指纹键名带它），不动 RULES_VERSION */
export const ESCORT_RULES = 1;
/** 航线上 1 格 = 600 个位置单位（船的 pos 用它，整数） */
export const ESCORT_CELL = 600;
/** 每拍前进多少位置单位：停 0 / 巡航 6（100 拍一格）/ 冲 9（约 67 拍一格）。配平只改这里 */
export const ESCORT_PACE = { hold: 0, sail: 6, rush: 9 } as const;
export type EscortPace = keyof typeof ESCORT_PACE;
/** 修船：花多少金、回满血的百分之几、冷却多少拍 */
export const ESCORT_MEND = { gold: 60, pct: 10, cd: 100 } as const;
/** 咬船伤害 = 敌人一次攻击的伤害 × 这个 ÷ 100 */
export const ESCORT_BITE_PCT = 60;
/** 咬住的敌人到这个数就钉死（速度 0）；1 到这个数减 1 之间速度减半 */
export const ESCORT_PIN_AT = 3;
/** 船的半径（单位，1 格 = 100）：敌人离船 ≤ 攻击距离 + 这个就站住咬 */
export const ESCORT_SHIP_R = 60;

/** 关卡里的航线部分（写在 TdLevel.escort；没有它就是普通守岛） */
export interface EscortDef {
  /** 航线格子序列（8 邻接，格子坐标，同守岛），起点是第 0 个 */
  route: Array<{ x: number; y: number }>;
  /** 隘口所在的航线下标，升序；规则不读（只发 gate 事件），界面和机器人读 */
  gates: number[];
  /** 商船满血 */
  hull: number;
  /** 到达时剩余血量百分比：≥ stars[0] 得 2★，≥ stars[1] 得 3★，其余 1★ */
  stars: readonly [number, number];
}

/** 运行时状态（TdState.escort，没有护航时为 undefined） */
export interface EscortState {
  def: EscortDef;
  /** 位置，0 .. (route.length - 1) × ESCORT_CELL */
  pos: number;
  pace: EscortPace;
  hull: number;
  /** 此刻在咬船的敌人数（每拍重算） */
  biters: number;
  /** 修船下次可用的拍 */
  mendReady: number;
  /** 英雄跟随船 */
  follow: boolean;
  /** 已经过了几个隘口（gates 的前几个） */
  gatesPassed: number;
  arrived: boolean;
  sunk: boolean;
  /** 修了几次 */
  mends: number;
}

export type EscortAction =
  | { t: number; type: 'pace'; pace: EscortPace }
  | { t: number; type: 'mend' }
  | { t: number; type: 'follow'; on: boolean };

export type EscortEvent =
  | { type: 'pace'; pace: EscortPace }
  | { type: 'bite'; id: number; dmg: number; hull: number }
  | { type: 'mend'; hull: number }
  | { type: 'gate'; index: number }
  | { type: 'arrive'; hullPct: number }
  | { type: 'sunk' };

export interface EscortResult {
  over: boolean;
  arrived: boolean;
  sunk: boolean;
  /** 剩余血量百分比（0–100，向下取整） */
  hullPct: number;
  /** 走过的格数、航线总格数 */
  cells: number;
  total: number;
  stars: number;
  ticks: number;
  mends: number;
}

/** 护航的一关：一份 TdLevel（必带 escort）加上图和难度 */
export interface EscortLevel extends TdLevel {
  escort: EscortDef;
  /** 图 id（escortmaps.ts） */
  map: string;
  /** 难度：新手 / 普通 / 高手 */
  diff: EscortDiff;
}

export type EscortDiff = 'easy' | 'normal' | 'hard';
export const ESCORT_DIFFS: readonly EscortDiff[] = ['easy', 'normal', 'hard'];
export const ESCORT_DIFF_NAME: Readonly<Record<EscortDiff, string>> = { easy: '新手', normal: '普通', hard: '高手' };

/** 存档里的护航进度（Profile.escort）：每关（`<图>-<难度>`）最好的星数 */
export interface EscortSave {
  stars: Record<string, number>;
}
