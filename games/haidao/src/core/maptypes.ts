/**
 * 寻宝航线（每日航线）的类型契约：规则（core/map.ts）、内容（content/maps.ts）和画面（view/map*.ts）都只依赖这里。
 * 一局 = 4 站：前 3 站每站在两个节点里二选一（岛或补给礁），第 4 站是终点宝岛；每站一场 50 秒的小登陆战，
 * 兵的损耗和旗舰能量跨站累计。同一天全服同一条航线、同一支船队（种子 = 北京时间日期），所以每日榜可比。
 * 确定性：整数、sfc32 按用途分流，规则同 core 其余部分（tests/arch.test.ts 扫源码）。
 */
import type { ArmySetup, BattleResult, BattleSetup, Placed, SkillKind, TroopKind } from './types.ts';

/** 每站战斗最多打多少拍（20 拍 / 秒 × 50 秒），到点按当时的摧毁率结算这一站 */
export const MAP_STOP_TICKS = 1000;
/** 航线层数（含终点） */
export const MAP_LAYERS = 4;

/** 微型岛定义（内容表 content/maps.ts） */
export interface MapIslandDef {
  id: string;
  name: string;
  /** 风格决定侦察图标和配色：炮台多 / 地雷多 / 臼炮多 / 金库厚 / 终点宝岛 */
  style: 'cannon' | 'mine' | 'mortar' | 'vault' | 'boss';
  /** 8–12 座建筑，和战役同一套 Placed，坐标在微型岛范围内 */
  layout: Placed[];
  /** 满摧毁率能拿的宝分 */
  pts: number;
  /** 侦察图标文字（"炮×2"），地雷不写 */
  hint: string[];
}

export type MapNode =
  | { kind: 'island'; island: string; mirror: boolean }
  | { kind: 'reef' };

/** 一天的航线：layers[0..2] 各 2 个节点，layers[3] 只有终点岛 1 个 */
export interface MapRoute {
  day: string;
  seed: number;
  layers: MapNode[][];
  /** 当天的船队（全服一样） */
  fleet: MapBoat[];
  skills: Array<{ kind: SkillKind; level: number }>;
}

export interface MapBoat {
  troop: TroopKind;
  level: number;
  /** 满编人数 / 现有人数（船长恒为 1） */
  cap: number;
  alive: number;
}

/** 补给礁的二选一 */
export type ReefPick = 'crew' | 'energy';

export interface MapStopLog {
  layer: number;
  node: number;
  /** 战斗站：本站摧毁率、星、宝分增量、各船损耗；补给礁：选了什么 */
  destroyedPct?: number;
  stars?: number;
  gain: number;
  reef?: ReefPick;
  rested?: number;
  /** 战斗站：本站一共损失几个兵（加法字段，站间结算条用） */
  lost?: number;
}

export interface MapState {
  route: MapRoute;
  /** 当前在第几层（0..3）；over 后不再变 */
  layer: number;
  fleet: MapBoat[];
  /** 旗舰能量，跨站累计，0..MAP_ENERGY_MAX */
  energy: number;
  /** 宝分 */
  pts: number;
  log: MapStopLog[];
  over: boolean;
  /** 结束方式：通关终点 / 中途收航 / 船队全灭 */
  end?: 'clear' | 'home' | 'wiped';
}

export const MAP_ENERGY_MAX = 20;

/** 终局：宝分（全灭按 70%）、星、给每日榜交的分 */
export interface MapFinal {
  pts: number;
  stars: number;
  /** 每日榜分数 = pts（整数，越大越好） */
  score: number;
}

/**
 * 规则函数签名（实现在 core/map.ts）。画面层只调这些，不自己算。
 * - routeOf(day)：北京日期 'YYYY-MM-DD' → 当天航线（纯函数，同一天同一结果）
 * - startMap(route)：开局状态
 * - stopSetup(s, node, rest)：选第 node 个节点、休整第 rest 条船（-1 = 不休整）时这一站的 BattleSetup（岛节点才有）
 * - finishStop(s, node, rest, result, survivors, energyLeft?)：战斗结束后写回（survivors = 每条出战船的存活数，按 fleet 下标，休整船填原值；
 *   energyLeft = 战斗结束时 BattleState.energy，加法参数，不传按没花能量算）
 * - takeReef(s, node, pick)：补给礁
 * - goHome(s)：收航
 * - mapFinal(s)：终局分数和星
 */
export interface MapRules {
  routeOf(day: string): MapRoute;
  startMap(route: MapRoute): MapState;
  stopSetup(s: MapState, node: number, rest: number): BattleSetup;
  finishStop(s: MapState, node: number, rest: number, result: BattleResult, survivors: number[], energyLeft?: number): MapState;
  takeReef(s: MapState, node: number, pick: ReefPick): MapState;
  goHome(s: MapState): MapState;
  mapFinal(s: MapState): MapFinal;
}

/** 战斗站出战的船队（去掉休整的、去掉全灭的），给 stopSetup 和画面共用 */
export type MapArmy = ArmySetup;
