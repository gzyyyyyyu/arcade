/**
 * 首领连战（DESIGN.md 2.5）：守夜的一个子模式（Setup.rush）。开局直接给一套成型的构筑，精英和首领一关一关上，
 * 打倒全部或 5 分钟到点收工。这里只放数值和名单；按种子抽构筑和关卡在 core/rush.ts，每日的种子在 online/rush.ts。
 */
import { TICKS_PER_SECOND } from './clock.ts';
import type { EnemyKind } from './enemies.ts';
import type { MapId } from './maps.ts';

const S = TICKS_PER_SECOND;

export const RUSH = {
  /** 一局最多 5 分钟 */
  limit: 300 * S,
  /** 开局几拍后第一关上场（先看一眼手上的构筑） */
  first: 3 * S,
  /** 两关之间喘口气：这么多拍后下一关上场，期间掉肉包 */
  rest: 6 * S,
  /** 每次喘息掉几个肉包 */
  buns: 2,
  /** 开局等级：升级要的魂多，一局只升一两级（构筑是给好的，比的是走位） */
  level: 14,
  /**
   * 每一关按守夜第几分钟的强度算精英的血和伤害（SCALE.hpPerMin、dmgPerMin），下标是第几关。
   * 构筑是中后期的，精英也要中后期的硬度，否则一碰就倒、没有看头
   */
  minute: [9, 10, 11, 12, 13, 14, 15] as readonly number[],
  /**
   * 纸扎老爷、尸王的血是守夜里的几成（一局只有 5 分钟，原样的尸王要打一分多钟）。
   * 按 `node tools/sim.ts --mode rush --n 60` 定：普通机器人全清约三成，平均打倒 9 只里的近 8 只，难点在压轴的尸王
   */
  lordHp: 0.6,
  bossHp: 0.7,
} as const;

/** 常规精英（守夜时间线上的四种） */
export const RUSH_BASIC: readonly EnemyKind[] = ['shishi', 'whitefox', 'general', 'palanquin'];
/** 各图的特色精英：没有特色精英的图（雪原、义庄）从这几只里抽 */
export const RUSH_SPECIAL: readonly EnemyKind[] = ['bambooking', 'hebo', 'frostsoul'];
/** 有特色精英的图：这张图上的"特色"那一关就上它 */
export const RUSH_MAP_SPECIAL: Partial<Record<MapId, EnemyKind>> = { bamboo: 'bambooking', riverbank: 'hebo', icelake: 'frostsoul', temple: 'shishi' };

/**
 * 关卡骨架：b = 常规精英，s = 特色精英，lord = 纸扎老爷，boss = 尸王。先易后难，中间一只纸扎老爷，最后尸王压轴；
 * 第 2、3 关的先后按种子换。具体是哪只按种子抽（core/rush.ts）
 */
export const RUSH_STAGES: readonly (readonly ('b' | 's' | 'lord' | 'boss')[])[] = [['b'], ['b'], ['s'], ['b', 'b'], ['lord'], ['s', 'b'], ['boss']];

/** 构筑：主法器到几级（进化的概率）、副法器、第三件；第四件有一定概率带 */
export const RUSH_BUILD = { main: 8, evolve: 0.5, second: [6, 7] as const, third: [4, 5] as const, fourth: 0.4, fourthLevel: 3, passive: [2, 3] as const };

