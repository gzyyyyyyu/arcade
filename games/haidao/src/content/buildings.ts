import type { BuildingKind } from '../core/types.ts';
import type { BuildingDef, BuildingLevel } from './defs.ts';
import { INCOME_PCT } from './income.ts';

/** 第 L 级（1 起）的数值：基础值按每级百分比增长，全程整数运算 */
function grow(base: number, pctPerLevel: number, level: number): number {
  return Math.floor((base * (100 + pctPerLevel * (level - 1))) / 100);
}

/** 建筑血量总倍率：调它就整体拉长或缩短一场的时间（百分比） */
const HP_PCT = 320;
/** 防御建筑血量倍率低一些：炮台拆得动，一场的时长主要花在拆主寨和仓库上 */
const DEF_HP_PCT = 220;
function hpOf(base: number, pctPerLevel: number, level: number, pct = HP_PCT): number {
  return Math.floor((grow(base, pctPerLevel, level) * pct) / 100);
}

/** 升级花费的倍率（百分比）：每升一级大约翻倍多一点，高级贵得多 */
const COST_MUL = [100, 220, 500, 1100, 2400, 5200, 6500, 9000];

/** 经济、仓储、船坞、军械所 各级升级价额外放大（百分比，5 级起）：主寨价受仓库上限约束不能无限抬，满级用时靠这些非主寨花费拉回 */
const ECO_PCT = [100, 100, 100, 100, 130, 170, 210, 250];
const ECO_MUL = COST_MUL.map((m, i) => Math.round((m * (ECO_PCT[i] ?? 100)) / 100));

function costs(gold: number, wood: number, mul: number[] = COST_MUL): Array<{ gold: number; wood: number }> {
  return mul.map((m) => ({ gold: Math.round((gold * m) / 100 / 10) * 10, wood: Math.round((wood * m) / 100 / 10) * 10 }));
}

function six(f: (level: number) => Omit<BuildingLevel, 'cost'>, gold: number, wood: number, mul: number[] = COST_MUL): BuildingLevel[] {
  const c = costs(gold, wood, mul);
  return c.map((cost, i) => ({ cost, ...f(i + 1) }));
}

/** 每小时产量：基础表 × INCOME_PCT（金矿上限 = 12 小时产量，跟着涨） */
const RATE_GOLD = [150, 200, 260, 330, 420, 520, 640, 780].map((v) => Math.round((v * INCOME_PCT.gold) / 100));
const RATE_WOOD = [120, 160, 210, 270, 340, 420, 520, 640].map((v) => Math.round((v * INCOME_PCT.wood) / 100));
/**
 * 金库每座存多少金币。规则（tests/base.test.ts 锁住）：每个主寨等级建满后，能花的金币（主寨自带 + 金库）
 * ≥ 这一级能买的最贵单项（建筑升级或升下一级主寨）× 1.25，且 ≥ 这一级守岛 3★ 两局的收入；只加不减。
 * 6–8 级卡在狙击塔（6 / 7 / 8 级 104,000 / 130,000 / 180,000 金），金库要装得下（≥ 最贵单项 × 1.25）。
 */
const VAULT_CAP = [1800, 3000, 4800, 7200, 10200, 40400, 44000, 48000];
/** 木料仓每座存多少木材：同一条规则（≥ 最贵单项 × 1.25，最贵是 8 级船坞 33,750 木），不跟金库一起涨 */
const WOODYARD_CAP = [1800, 3000, 4800, 7200, 10200, 14400, 20400, 28800];
const HQ_CAP = [1500, 2200, 3200, 4500, 6500, 9000, 13000, 18000];
const HQ_COST = [
  { gold: 0, wood: 0 },
  { gold: 500, wood: 150 },
  { gold: 2200, wood: 650 },
  { gold: 5200, wood: 1500 },
  { gold: 9500, wood: 2600 },
  { gold: 17000, wood: 3800 },
  { gold: 38000, wood: 8000 },
  { gold: 70000, wood: 13500 },
];
const HQ_HP = [800, 1300, 1900, 2600, 3300, 4100, 5000, 6000];
const DOCK_BOATS = [3, 3, 4, 5, 5, 6, 6, 7];
const DOCK_CAP = [6, 7, 8, 9, 10, 12, 14, 16];

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  hq: {
    name: '主寨',
    size: 4,
    category: 'core',
    unlockHq: 1,
    maxLevel: 8,
    desc: '你的老巢。升级需要战役星数，升级后开放新建筑、新兵种，旗舰能量更多。',
    levels: HQ_COST.map((cost, i) => ({ cost, hp: Math.floor(((HQ_HP[i] ?? 0) * HP_PCT) / 100), cap: HQ_CAP[i] ?? 0 })),
  },
  goldmine: {
    name: '金矿',
    size: 3,
    category: 'resource',
    unlockHq: 1,
    maxLevel: 8,
    desc: '慢慢攒金币，攒满要点一下才收。',
    levels: six((l) => ({ hp: hpOf(200, 20, l), rate: RATE_GOLD[l - 1] ?? 0, cap: (RATE_GOLD[l - 1] ?? 0) * 12 }), 150, 0, ECO_MUL),
  },
  sawmill: {
    name: '伐木场',
    size: 3,
    category: 'resource',
    unlockHq: 1,
    maxLevel: 8,
    desc: '慢慢攒木材，造兵、研究都要木材。',
    levels: six((l) => ({ hp: hpOf(200, 20, l), rate: RATE_WOOD[l - 1] ?? 0, cap: (RATE_WOOD[l - 1] ?? 0) * 12 }), 120, 40, ECO_MUL),
  },
  vault: {
    name: '金库',
    size: 3,
    category: 'storage',
    unlockHq: 1,
    maxLevel: 8,
    desc: '多存金币。',
    levels: six((l) => ({ hp: hpOf(300, 20, l), cap: VAULT_CAP[l - 1] ?? 0 }), 200, 0, ECO_MUL),
  },
  woodyard: {
    name: '木料仓',
    size: 3,
    category: 'storage',
    unlockHq: 1,
    maxLevel: 8,
    desc: '多存木材。',
    levels: six((l) => ({ hp: hpOf(300, 20, l), cap: WOODYARD_CAP[l - 1] ?? 0 }), 100, 100, ECO_MUL),
  },
  dock: {
    name: '船坞',
    size: 3,
    category: 'army',
    unlockHq: 2,
    maxLevel: 8,
    desc: '多一条船，船也装得更多。',
    levels: six((l) => ({ hp: hpOf(330, 20, l), boats: DOCK_BOATS[l - 1] ?? 0, boatCap: DOCK_CAP[l - 1] ?? 0 }), 350, 150, ECO_MUL),
  },
  armory: {
    name: '军械所',
    size: 3,
    category: 'army',
    unlockHq: 4,
    maxLevel: 8,
    desc: '研究兵种和旗舰技能。研究等级不能超过军械所等级。',
    levels: six((l) => ({ hp: hpOf(330, 20, l) }), 600, 120, ECO_MUL),
  },
  cannon: {
    name: '加农炮',
    size: 2,
    category: 'defense',
    unlockHq: 1,
    maxLevel: 8,
    desc: '打射程内最近的敌人，一发一发慢慢打。',
    levels: six((l) => ({ hp: hpOf(420, 18, l, DEF_HP_PCT), dmg: grow(40, 18, l), range: 7, reload: 80 }), 120, 0),
  },
  gunTower: {
    name: '火枪塔',
    size: 2,
    category: 'defense',
    unlockHq: 1,
    maxLevel: 8,
    desc: '连发小子弹，打得快但伤害小。',
    levels: six((l) => ({ hp: hpOf(360, 18, l, DEF_HP_PCT), dmg: grow(10, 18, l), range: 6, reload: 16 }), 160, 20),
  },
  mortar: {
    name: '臼炮',
    size: 2,
    category: 'defense',
    unlockHq: 3,
    maxLevel: 8,
    desc: '远程溅射，近处打不到。专克扎堆的兵。',
    levels: six((l) => ({ hp: hpOf(450, 18, l, DEF_HP_PCT), dmg: grow(55, 18, l), range: 10, minRange: 3, reload: 120, splash: 1.5 }), 420, 60),
  },
  mine: {
    name: '地雷',
    size: 1,
    category: 'defense',
    unlockHq: 2,
    maxLevel: 8,
    desc: '埋在地里看不见，兵走近就炸。',
    levels: six((l) => ({ hp: 1, dmg: grow(160, 20, l), range: 1, splash: 1.5 }), 60, 20),
  },
  flame: {
    name: '喷火塔',
    size: 2,
    category: 'defense',
    unlockHq: 6,
    maxLevel: 8,
    desc: '近处一片火，兵一靠近就烧。',
    levels: six((l) => ({ hp: hpOf(520, 18, l, DEF_HP_PCT), dmg: grow(9, 18, l), range: 4.5, reload: 8, splash: 0.8 }), 900, 150),
  },
  harpoon: {
    name: '鱼叉炮',
    size: 2,
    category: 'defense',
    unlockHq: 7,
    maxLevel: 8,
    desc: '一发一叉，单体伤害高，射程远。',
    levels: six((l) => ({ hp: hpOf(480, 18, l, DEF_HP_PCT), dmg: grow(95, 18, l), range: 9, reload: 100 }), 1500, 250),
  },
  tar: {
    name: '焦油陷阱',
    size: 1,
    category: 'defense',
    unlockHq: 8,
    maxLevel: 8,
    desc: '埋在地里看不见，兵踩上去被粘住，走路慢一半。',
    levels: six((l) => ({ hp: 1, dmg: 0, range: 1.2, splash: 1.5, reload: 60 + 10 * l }), 120, 40),
  },
  rocket: {
    name: '火箭塔',
    size: 2,
    category: 'defense',
    unlockHq: 7,
    maxLevel: 8,
    desc: '一次射出三发火箭，打三个不同的兵，带一点溅射。',
    levels: six((l) => ({ hp: hpOf(500, 18, l, DEF_HP_PCT), dmg: grow(18, 18, l), range: 8, reload: 110, splash: 0.8 }), 1800, 300),
  },
  shock: {
    name: '震荡炮',
    size: 2,
    category: 'defense',
    unlockHq: 5,
    maxLevel: 8,
    desc: '一炮震一小片，被震到的兵原地发晕一会儿。专克走得慢的壮汉和船长，怕人多的散兵。',
    // 伤害按加农的七成，3 秒一发，1 格小溅射，震晕 1.2 秒（24 拍，DESIGN 13）
    levels: six((l) => ({ hp: hpOf(470, 18, l, DEF_HP_PCT), dmg: grow(28, 18, l), range: 6, reload: 60, splash: 1, stun: 24 }), 1100, 200),
  },
  sniper: {
    name: '狙击塔',
    size: 2,
    category: 'defense',
    unlockHq: 6,
    maxLevel: 8,
    desc: '射程全岛最远，一发重伤害，先打船长、船医、火炮兵这类躲在后排的。锁定后要 0.5 秒才开火，兵走出射程就白瞄。怕人多：一发只打一个。',
    // 伤害是同级加农的 2.2 倍（grow(88) 对 grow(40)），4 秒一发，射程 11 格，不溅射（DESIGN 14）
    levels: six((l) => ({ hp: hpOf(380, 18, l, DEF_HP_PCT), dmg: grow(88, 18, l), range: 11, reload: 80 }), 2000, 350),
  },
  kraken: {
    name: '海怪',
    size: 3,
    category: 'defense',
    unlockHq: 99,
    maxLevel: 8,
    desc: '首领岛专属：长在岛边的海里，周期性拍打海滩上的兵。能被打掉。',
    levels: six((l) => ({ hp: hpOf(900, 18, l, DEF_HP_PCT), dmg: grow(70, 18, l), range: 4.5, reload: 110, splash: 1.8 }), 0, 0),
  },
  fogTower: {
    name: '雾塔',
    size: 2,
    category: 'defense',
    unlockHq: 99,
    maxLevel: 8,
    desc: '首领岛专属：周围的建筑看不见，兵走近了才现形；炮击打不中看不见的。',
    levels: six((l) => ({ hp: hpOf(500, 18, l, DEF_HP_PCT), range: 5 }), 0, 0),
  },
  wall: {
    name: '城墙',
    size: 1,
    category: 'defense',
    unlockHq: 2,
    maxLevel: 8,
    desc: '一小段墙。连成墙，兵就得绕路，绕不过去就得砸墙；把兵引到炮口和地雷上。掷弹兵的手雷能越过墙，墙圈离主寨远一点才挡得住它。',
    levels: six((l) => ({ hp: hpOf(160, 22, l, DEF_HP_PCT) }), 12, 0),
  },
  statue: {
    name: '雕像',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '掉宝装饰，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  flagpole: {
    name: '旗杆',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '掉宝装饰，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  chest: {
    name: '宝箱',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '掉宝装饰，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  wheel: {
    name: '海盗王的舵轮',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '守岛第四章全部过关的纪念，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  windmill: {
    name: '小风车',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '守岛第一章全部过关的纪念，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  lighthouse: {
    name: '小灯塔',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '守岛第二章全部过关的纪念，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  bonfire: {
    name: '篝火',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '守岛第三章全部过关的纪念，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  lookout: {
    name: '瞭望台',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '守岛第五章全部过关的纪念，只占格。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  treasure: {
    name: '宝藏箱',
    size: 1,
    // 不放进建造菜单的四类（画面层按 category 过滤），第 4 步做界面时再接；也不是掉宝装饰 chest
    category: 'core',
    unlockHq: 1,
    maxLevel: 1,
    desc: '守岛时敌人登陆来抢的宝藏。用墙和塔把去宝藏箱的路摆成迷宫。',
    // 血量给第 5 步进攻防时用（和 3 级金库差不多，算摧毁率）；第 3 步攻防快照里没有它
    levels: [{ cost: { gold: 300, wood: 100 }, hp: hpOf(260, 0, 1) }],
  },
  palm: {
    name: '棕榈树',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '装饰，不挡路。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
  rock: {
    name: '岩石',
    size: 1,
    category: 'deco',
    unlockHq: 1,
    maxLevel: 1,
    desc: '装饰，不挡路。',
    levels: [{ cost: { gold: 0, wood: 0 }, hp: 0 }],
  },
};

export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
/** 装饰（棕榈、岩石、掉宝装饰、章节纪念）：只占格，不挡路、不挨打、不算摧毁率 */
export const isDecoKind = (k: BuildingKind): boolean => BUILDINGS[k].category === 'deco';
export const DEFENSE_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'kraken', 'shock', 'sniper']);
