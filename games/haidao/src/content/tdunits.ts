/**
 * 守岛的公共常量和攻防的驻岛英雄。守岛 2.0 的敌人、英雄、塔、经济数值在 td2units.ts，规则核心读那边；
 * TD_HERO 不能动：登陆战的驻岛英雄 RAID_HERO 由它派生（改它就改了攻防）。
 * 速度是每拍多少单位（20 拍 1 秒，100 单位 1 格），伤害、血量是整数。
 */
import type { TdHeroLevel } from '../core/tdtypes.ts';

/** 英雄 1–8 级（等级 = 军械所研究 hero，最高等于主寨等级）：每级血 +15%、伤害 +15%，技能伤害一起涨 */
export const TD_HERO: TdHeroLevel[] = [1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({
  // 血量够挡住 4–5 个水手几秒，挡多了会倒：英雄是堵口子的，不是一个人守全岛
  hp: Math.floor((420 * (100 + 15 * (l - 1))) / 100),
  // 每秒约 22 伤（1 级），和一座 3 级火枪塔差不多
  dmg: Math.floor((22 * (100 + 15 * (l - 1))) / 100),
  reload: 20,
  // 2.5 格：比照亮雾船的 2 格稍远，站在路边能打到路上的
  range: 250,
  // 1.3 格/秒：比水手快一点，追得上回船的；追不上鹦鹉
  speed: 6,
  // 火药桶一次 120 伤（1 级）、半径 1.5 格：能炸死一堆小艇或水手，炸不死铁甲
  kegDmg: Math.floor((120 * (100 + 15 * (l - 1))) / 100),
  kegR: 150,
  // 15 秒一个：一波（约 18 秒）最多扔一次
  kegCd: 300,
  // 号令 5 秒起、每级多 0.5 秒；25 秒一次
  rallyTicks: 100 + 10 * (l - 1),
  rallyCd: 500,
}));

/**
 * 守岛英雄研究的最高级：主寨 8 级前封顶主寨等级，8 级以后能研究到 12 级（木材出口，DESIGN 10.4）。
 * 9–12 级只在守岛、海盗来袭里有用（td.ts tdHeroStats 按级数涨）；攻防的驻岛英雄 RAID_HERO 只有 8 级，raidSetup 封顶 8，别人打我的岛和以前逐位一样。
 */
export const HERO_RESEARCH_MAX = 12;

/** 英雄扔火药桶的最远距离（单位）：5 格，得走到前线才扔得到 */
export const TD_KEG_THROW = 500;
/** 号令罩住英雄身边几格的塔（单位）和攻速加成（百分比，DESIGN 写的 +30%） */
export const TD_RALLY_R = 500;
export const TD_RALLY_PCT = 30;
/** 英雄照亮雾船的半径（单位）：DESIGN 定的 2 格 */
export const TD_HERO_LIGHT = 200;
/** 一局的宝藏枚数（DESIGN 10.1） */
export const TD_TREASURE = 20;
/** 地上的宝藏多近能捡起来（单位） */
export const TD_PICK_R = 70;
/** 地上的火药桶：爆炸半径、伤害（敌我都炸）、被点着后几拍炸（连锁有个先后，看得出来） */
export const TD_KEG = { r: 150, dmg: 160, fuse: 6 };
/** 一局最长 8 分钟：12 波 × 18 秒 + 收尾，足够；防止卡死的局永远不结束 */
export const TD_MAX_TICKS = 8 * 60 * 20;
/** 敌人把墙当几倍代价：和登陆战一样是 7（砸一段墙相当于绕 7 格），有缺口就绕，迷宫才有用 */
export const TD_WALL_COST = 7;
/** 工兵把墙当几倍代价：1 = 和空地一样，路线直接穿墙，走到墙前就炸 */
export const TD_SAPPER_WALL_COST = 1;

/**
 * 驻岛英雄（DESIGN 10.6）：别人来打我的岛时由电脑操控，守在第一个宝藏箱旁。
 * 驻岛版按守岛版（TD_HERO）的百分比折算，可以比守岛版弱：登陆战的兵是玩家自己挑的、会集火，英雄又不复活。
 * 改了跑 `node tools/raid-sim.ts --n 200` 看配平门槛（平均星数降 ≤ 0.3、胜率降 ≤ 10 个百分点）。
 */
export const RAID_HERO_PCT = { hp: 50, dmg: 50, keg: 50 };
export const RAID_HERO: TdHeroLevel[] = TD_HERO.map((h) => ({
  ...h,
  hp: Math.floor((h.hp * RAID_HERO_PCT.hp) / 100),
  dmg: Math.floor((h.dmg * RAID_HERO_PCT.dmg) / 100),
  kegDmg: Math.floor((h.kegDmg * RAID_HERO_PCT.keg) / 100),
}));
/** 驻岛英雄：接战半径（离英雄 4 格内最近的进攻兵）、追出岗位多远回岗（6 格）、几个兵扎堆才扔火药桶（单位、个） */
export const RAID_HERO_GUARD = 400;
export const RAID_HERO_LEASH = 600;
export const RAID_HERO_CLUSTER = 3;
/** 进攻兵离英雄多近会转身打英雄（单位；远程兵按自己的射程，取大的） */
export const RAID_HERO_AGGRO = 300;
