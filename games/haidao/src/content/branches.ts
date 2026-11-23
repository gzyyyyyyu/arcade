/**
 * 塔的分叉（DESIGN 10.2）：每种防御塔 3 级选一次（tier 1）、6 级选一次（tier 2），各 2–3 条。
 * 守岛里全额生效（td.ts 读）；登陆战（攻防）按 RAID_BRANCH_PCT 打折（battle.ts 读）。数值是百分比或单位的整数，单位见 tdtypes.ts 的 BranchMod。
 */
import type { BuildingKind } from '../core/types.ts';
import type { BranchDef } from '../core/tdtypes.ts';

/** 选分叉要的塔等级：tier 1 在 3 级、tier 2 在 6 级 */
export const BRANCH_LEVEL: Record<1 | 2, number> = { 1: 3, 2: 6 };

export const BRANCHES: BranchDef[] = [
  // 加农炮：三条路线各克一种敌人，选错就吃亏
  // 穿甲弹只加一点伤害：主要价值是铁甲不打 4 折（等于对铁甲 2.75 倍），对别的敌人和不选差不多
  { id: 'cannon.pierce', tower: 'cannon', tier: 1, name: '穿甲弹', desc: '打铁甲不打折', mod: { pierce: true, dmgPct: 10 } },
  // 链弹减速 40% 两秒：拖住工兵和首领，让后排的塔多打几发；溅射小，不抢葡萄弹的位置
  { id: 'cannon.chain', tower: 'cannon', tier: 1, name: '链弹', desc: '命中减速，小范围', mod: { slowPct: 40, slowTicks: 40, splash: 60 } },
  // 葡萄弹射程砍三分之一换 1.2 格散射：守口子用，专克分裂小艇和扎堆的水手
  { id: 'cannon.grape', tower: 'cannon', tier: 1, name: '葡萄弹', desc: '近距离散射', mod: { rangePct: -35, splash: 120, dmgPct: -10 } },
  { id: 'cannon.heavy', tower: 'cannon', tier: 2, name: '重炮', desc: '伤害更高', mod: { dmgPct: 35 } },
  { id: 'cannon.quick', tower: 'cannon', tier: 2, name: '快装', desc: '装填更快', mod: { reloadPct: -25 } },

  // 火枪塔：神射手是主要的防空手段；灯塔自己伤害低，但没有它雾船根本打不中
  { id: 'gunTower.marksman', tower: 'gunTower', tier: 1, name: '神射手', desc: '远射，先打鹦鹉', mod: { rangePct: 35, airFirst: true, dmgPct: 15 } },
  // 灯塔半径 6 格：和火枪射程一样，摆在路边才照得到整段路；伤害打六折是代价
  { id: 'gunTower.lighthouse', tower: 'gunTower', tier: 1, name: '灯塔', desc: '照亮雾船，伤害低', mod: { light: 600, dmgPct: -40 } },
  { id: 'gunTower.rapid', tower: 'gunTower', tier: 1, name: '连射', desc: '打得更快', mod: { reloadPct: -35 } },
  { id: 'gunTower.keen', tower: 'gunTower', tier: 2, name: '准星', desc: '伤害更高', mod: { dmgPct: 30 } },
  // 双发：一次打两个不同目标，单体伤害不变，等于对散开的敌人翻倍
  { id: 'gunTower.volley', tower: 'gunTower', tier: 2, name: '双发', desc: '一次打两个', mod: { shots: 1 } },

  // 臼炮：燃烧弹留火，专烧走得慢的；重弹一炮大伤害，对首领
  { id: 'mortar.fire', tower: 'mortar', tier: 1, name: '燃烧弹', desc: '落点留火', mod: { burnDps: 24, burnTicks: 80 } },
  { id: 'mortar.heavy', tower: 'mortar', tier: 1, name: '重弹', desc: '大伤害、慢装填', mod: { dmgPct: 70, reloadPct: 40 } },
  { id: 'mortar.wide', tower: 'mortar', tier: 2, name: '大药量', desc: '溅射更大', mod: { splash: 50 } },
  { id: 'mortar.quick', tower: 'mortar', tier: 2, name: '快装', desc: '装填更快', mod: { reloadPct: -20 } },

  // 鱼叉：贯穿打一条线上的（排队走迷宫时很强）；拖拽把敌人拉回 1.5 秒前的位置，等于多走一段路
  { id: 'harpoon.pierce', tower: 'harpoon', tier: 1, name: '贯穿', desc: '一条直线上的都打', mod: { line: true } },
  { id: 'harpoon.drag', tower: 'harpoon', tier: 1, name: '拖拽', desc: '把敌人拉回几格', mod: { pull: 30 } },
  { id: 'harpoon.barb', tower: 'harpoon', tier: 2, name: '倒钩', desc: '伤害更高', mod: { dmgPct: 30 } },
  { id: 'harpoon.reel', tower: 'harpoon', tier: 2, name: '快绞', desc: '装填更快', mod: { reloadPct: -25 } },

  // 喷火塔：本来就穿甲；两条路线一条留火、一条喷得远
  { id: 'flame.napalm', tower: 'flame', tier: 1, name: '火油', desc: '地上留火', mod: { burnDps: 18, burnTicks: 60 } },
  { id: 'flame.long', tower: 'flame', tier: 1, name: '长管', desc: '喷得更远', mod: { rangePct: 30 } },
  { id: 'flame.hot', tower: 'flame', tier: 2, name: '猛火', desc: '伤害更高', mod: { dmgPct: 30 } },
  { id: 'flame.wide', tower: 'flame', tier: 2, name: '扇面', desc: '范围更大', mod: { splash: 40 } },

  // 火箭塔：齐射多打两个目标但每发弱；高射专打鹦鹉
  { id: 'rocket.swarm', tower: 'rocket', tier: 1, name: '齐射', desc: '一次多打两个', mod: { shots: 2, dmgPct: -20 } },
  { id: 'rocket.flak', tower: 'rocket', tier: 1, name: '高射', desc: '先打鹦鹉，伤害更高', mod: { airFirst: true, dmgPct: 25 } },
  { id: 'rocket.big', tower: 'rocket', tier: 2, name: '大弹头', desc: '溅射更大', mod: { splash: 40 } },
  { id: 'rocket.quick', tower: 'rocket', tier: 2, name: '快装', desc: '装填更快', mod: { reloadPct: -20 } },

  // 震荡炮（DESIGN 13）：3 级装填或射程；6 级（守岛 3 阶）分叉"连震"震一大片、"重锤"伤害高但震得短
  { id: 'shock.quick', tower: 'shock', tier: 1, name: '快装', desc: '装填更快', mod: { reloadPct: -20 } },
  { id: 'shock.long', tower: 'shock', tier: 1, name: '远震', desc: '射程更远', mod: { rangePct: 20 } },
  { id: 'shock.chain', tower: 'shock', tier: 2, name: '连震', desc: '震晕范围更大', mod: { splash: 50 } },
  { id: 'shock.hammer', tower: 'shock', tier: 2, name: '重锤', desc: '伤害更高，震得短一点', mod: { dmgPct: 40, stunTicks: 16 } },

  // 狙击塔（DESIGN 14）：3 级装填或射程；6 级（守岛 3 阶）分叉"穿甲"打重甲不再减半、"连狙"一次两发打同一个目标
  { id: 'sniper.quick', tower: 'sniper', tier: 1, name: '快装', desc: '装填更快', mod: { reloadPct: -20 } },
  { id: 'sniper.scope', tower: 'sniper', tier: 1, name: '瞄准镜', desc: '射程更远', mod: { rangePct: 20 } },
  { id: 'sniper.pierce', tower: 'sniper', tier: 2, name: '穿甲', desc: '打重甲不再减半', mod: { pierce: true, dmgPct: 10 } },
  { id: 'sniper.twin', tower: 'sniper', tier: 2, name: '连狙', desc: '一次两发', mod: { shots: 1, dmgPct: -30 } },

  // 陷阱：地雷和焦油各两条
  { id: 'mine.big', tower: 'mine', tier: 1, name: '大地雷', desc: '炸得更大', mod: { splash: 50 } },
  { id: 'mine.shrapnel', tower: 'mine', tier: 1, name: '破片', desc: '伤害更高', mod: { dmgPct: 40 } },
  { id: 'mine.deep', tower: 'mine', tier: 2, name: '深埋', desc: '伤害更高', mod: { dmgPct: 30 } },
  { id: 'mine.slow', tower: 'mine', tier: 2, name: '震晕', desc: '炸到的减速', mod: { slowPct: 50, slowTicks: 40 } },
  { id: 'tar.deep', tower: 'tar', tier: 1, name: '深坑', desc: '粘得更久', mod: { slowTicks: 60 } },
  { id: 'tar.fire', tower: 'tar', tier: 1, name: '火油坑', desc: '踩上去着火', mod: { burnDps: 20, burnTicks: 80 } },
  { id: 'tar.wide', tower: 'tar', tier: 2, name: '大坑', desc: '范围更大', mod: { splash: 50 } },
  { id: 'tar.sticky', tower: 'tar', tier: 2, name: '黏稠', desc: '减速更狠', mod: { slowPct: 20 } },
];

/**
 * 登陆战（攻防）里分叉的数值按表里的百分之几算：伤害、装填、射程、溅射、减速、留火、拖拽的加减都乘它，
 * 布尔项（贯穿）和多打几个（shots）不变。守岛里敌人是一波波送上来的，登陆战的兵是玩家挑的、数量少，
 * 全额照搬会让满配分叉的岛把同级进攻打到拿不到星（DESIGN 10.6 的配平表），所以攻防打折。
 */
export const RAID_BRANCH_PCT = 15;
/** 登陆战里鱼叉贯穿一次最多穿几个兵（守岛不限）：登陆的兵排成一串，全穿等于一发打一船 */
export const RAID_LINE_MAX = 3;

export const BRANCH_BY_ID: ReadonlyMap<string, BranchDef> = new Map(BRANCHES.map((b) => [b.id, b]));

/** 某种塔某一档能选的分叉（表里的顺序） */
export function branchOptions(tower: BuildingKind, tier: 1 | 2): BranchDef[] {
  return BRANCHES.filter((b) => b.tower === tower && b.tier === tier);
}
