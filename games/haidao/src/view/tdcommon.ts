import type Phaser from 'phaser';
import { type TdSetup, type IsoWeek, type TdAction, type TdTowerKind, TD2_COST, TD2_HERO_SKILL, type BuildingKind, type TdEnemyKind } from '../core/index.ts';
import type { LiveTier } from '../core/live.ts';
import { UNIT } from '../core/types.ts';
import { BarList } from './bars.ts';
import type { RigKind } from './rig.ts';
import type { Rig } from './rigsprite.ts';
import { hatchSegments } from './tdfx.ts';
import { iso } from './iso.ts';
import type { Turret } from './turret.ts';

export interface TdData {
  levelId: string;
  setup: TdSetup;
  speed: number;
  /** 悬赏守岛（实盘）的一局：结束走筹码结回，不发本岛守岛奖励、不记章节星数 */
  live?: { tier: LiveTier };
  /** 大潮无尽（每周榜）的一局：不发金币木材、不记星数，只记本周最好并交分 */
  tide?: { week: IsoWeek };
  /** 海盗来袭（守自己的岛）：不算星，按撑住的波数给奖励（和关卡共用每日上限） */
  home?: boolean;
  /** 护航（商船队）的一局：levelId 是 `<图>-<难度>`，结算走 settleEscort */
  escort?: boolean;
  /** 护航实盘的一局（同时 escort 为真）：结束走筹码结回，不发护航奖励、不记护航星数 */
  escortLive?: { tier: LiveTier };
}

export type Act = TdAction extends infer U ? (U extends { t: number } ? Omit<U, 't'> : never) : never;


/** 血条清单（帧内同步用完，对象复用） */
export const tdBarList = new BarList();

export const TEMP_KINDS: TdTowerKind[] = ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'];

/** 木台上造一座塔的价格（和规则核心 build 读同一张表） */
export function buildCost(k: TdTowerKind): number {
  return TD2_COST[k];
}

export const HATCH = hatchSegments(9);

/** 英雄技能的范围（单位）和冷却（拍）：1 拒马、2 炸药桶、锚钩（8 级起） */
export const SKILL = {
  barricade: { range: TD2_HERO_SKILL.barricade.range, cd: TD2_HERO_SKILL.barricade.cd },
  bomb: { range: TD2_HERO_SKILL.bomb.range, cd: TD2_HERO_SKILL.bomb.cd },
  hook: { range: TD2_HERO_SKILL.hook.range, cd: TD2_HERO_SKILL.hook.cd },
} as const;

/** 弹道：[素材, 弧度, 要不要朝飞行方向转] */
export const PROJ: Partial<Record<BuildingKind, ['ball' | 'bullet' | 'shell' | 'flame' | 'rocket' | 'harpoon' | 'shock' | 'snipe', number, boolean]>> = {
  cannon: ['ball', 1, false], gunTower: ['bullet', 0, true], mortar: ['shell', 1.6, false], flame: ['flame', 0, false], harpoon: ['harpoon', 0, true], rocket: ['rocket', 0.35, true], shock: ['shock', 0.5, false], sniper: ['snipe', 0, true],
};


/** 地面上半径 1 格的圆画在等距屏幕上，横向半径多少像素（√2 × 32） */
export const SHOCK_RING = 45.25;

export const W = (x: number, y: number): { x: number; y: number } => iso(x / UNIT, y / UNIT);

/** 边缘指示隔多久重算一次（毫秒）：敌人走得慢，没必要每帧算 */
export const EDGE_MS = 120;

export interface ESpr {
  /** 分件骨架（鹦鹉群只用整帧图），倒下演完放回对象池 */
  rig: Rig;
  kind: TdEnemyKind;
  px: number;
  py: number;
  still: number;
  carry: Phaser.GameObjects.Text | null;
  phase: number;
  /** 最近一次挨打的伤害：倒下时按它选被打飞还是跪倒 */
  lastDmg: number;
  /** 船（炮艇、海盗王）上次开炮的画面时刻：船身后坐用（motion.ts 的 shipRecoil） */
  fired: number;
  /** 上一拍和这一拍的世界位置（画面按帧在两者之间插值）、记到的拍数 */
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  tick: number;
  /** 画面上的挤开偏移（逻辑单位，crowd.ts 算目标、按时间追过去）：只影响显示，规则位置不动 */
  ox: number;
  oy: number;
  /** 朝向过渡（-1..1）、走过的屏幕距离、上一帧屏幕位置 */
  face: number;
  dist: number;
  lx: number;
  ly: number;
}

/** 英雄攻击没有出手拍可对齐，按这个周期循环（毫秒） */
export const ATK_MS = 640;
/** 守岛里的船（整张图，停在海上）：画面上起伏、开炮后坐、沉没（不是倒下） */
export const SHIP_FOES: ReadonlySet<TdEnemyKind> = new Set<TdEnemyKind>(['gunboat', 'king']);

/** 骨架的种类：鹦鹉群不是人形，用整帧图 */
export const RIG_OF: Record<TdEnemyKind, RigKind | null> = { sailor: 'e.sailor', ironclad: 'e.ironclad', fog: 'e.fog', skiff: 'e.skiff', skiffling: 'e.skiffling', sapper: 'e.sapper', grenadier: 'e.grenadier', parrot: null, captain: 'e.captain', shield: 'e.shield', bosun: 'e.bosun', macaw: null, mate: 'e.mate', medic: 'e.medic', gunboat: null, king: null };

export interface TSpr {
  img: Phaser.GameObjects.Image;
  key: string;
  baseX: number;
  baseY: number;
  /** 已选路线（逗号连起来）：变了就演一次"变形" */
  br: string;
  /** 会转的塔（turret.ts） */
  tu?: Turret;
  /** 在哪块木台上（卖掉后把木台换回空的），常驻塔 -1 */
  slot: number;
}
