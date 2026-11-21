/** 内容表的类型：规则核心、画面、界面共用（types.ts 管状态，这里管"表里长什么样"） */
import type { BuildingKind, Placed, Res, SkillKind, TroopKind } from '../core/types.ts';

export interface BuildingLevel {
  /** 建出这一级（1 级）或从上一级升上来要花的资源 */
  cost: Res;
  hp: number;
  /** 产出建筑：每小时产量 */
  rate?: number;
  /** 产出建筑自身存量上限，或仓库 / 主寨容量 */
  cap?: number;
  dmg?: number;
  /** 射程（格） */
  range?: number;
  minRange?: number;
  /** 两次攻击间隔（拍） */
  reload?: number;
  /** 溅射半径（格） */
  splash?: number;
  /** 震荡炮：命中的兵震晕几拍 */
  stun?: number;
  boats?: number;
  boatCap?: number;
}

export interface BuildingDef {
  name: string;
  size: number;
  category: 'core' | 'resource' | 'storage' | 'army' | 'defense' | 'deco';
  unlockHq: number;
  maxLevel: number;
  desc: string;
  levels: BuildingLevel[];
}

export interface TroopLevel {
  hp: number;
  dmg: number;
  range: number;
  /** 格每秒 */
  speed: number;
  reload: number;
  /** 出海要付的木材（每个） */
  cost: number;
  splash?: number;
}

export interface TroopDef {
  name: string;
  housing: number;
  unlockHq: number;
  desc: string;
  levels: TroopLevel[];
  /** 挑目标的方式（core/battle.ts 的 pickTarget 按它走，介绍卡片也读它）：最近的建筑 / 先找防御塔 / 附近有墙先炸墙 / 挑一雷炸得最多的 / 不打建筑、跟着给伤员回血 */
  aim: TroopAim;
}

type TroopAim = 'nearest' | 'defense' | 'wallFirst' | 'cluster' | 'heal';

interface SkillLevel {
  energy: number;
  dmg?: number;
  radius: number;
  heal?: number;
  duration?: number;
}

export interface SkillDef {
  name: string;
  unlockHq: number;
  desc: string;
  levels: SkillLevel[];
}

export interface HqLevel {
  level: number;
  needStars: number;
  cost: Res;
  limits: Partial<Record<BuildingKind, number>>;
  energy: number;
  /** 岛向四周扩几圈（可建范围 [-ext, ISLAND+ext)）：名额涨到 22×22 摆不下时扩地，中心不动，老坐标照旧有效 */
  ext: number;
}

export interface LevelDef {
  id: string;
  name: string;
  captain: string;
  blurb: string;
  hq: number;
  layout: Placed[];
  loot: Res;
  reqStars: number;
  /** 首领岛：每 5 关一个，有特殊机制 */
  boss?: boolean;
  bossName?: string;
  /** 首领机制的一句话（给界面） */
  mechanic?: string;
  /** 首领岛的解法提示（一句话） */
  counter?: string;
  /** 难度旋钮：防御塔血量和塔、陷阱伤害的百分比，没写 = 100；按 src/content/difficulty.ts 的目标线逐关拟合（docs/balance-haidao.md 难度曲线总表） */
  defPct?: number;
}

export type { BuildingKind, TroopKind, SkillKind };
