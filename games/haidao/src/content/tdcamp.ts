/**
 * 水手营（守岛的兵营塔，core/tdcamp.ts）能调的数：只在战役和海盗来袭有，不进基地、不进驻守台。
 * 速度、距离是单位（100 = 1 格），时间是拍（20 拍 = 1 秒）。升阶花费沿用塔的 TD2_UP_PCT（造价的 80%、120%）。
 */

/** 一阶的兵：血、每下伤害（每 TD2_CAMP.reload 拍一下）、倒下后几拍复活 */
interface CampTier {
  hp: number;
  dmg: number;
  respawn: number;
}

export const TD2_CAMP = {
  /** 木台上造一座的价 */
  cost: 110,
  /** 几名兵 */
  men: 3,
  tiers: [
    { hp: 150, dmg: 8, respawn: 200 },
    { hp: 260, dmg: 14, respawn: 180 },
    { hp: 420, dmg: 22, respawn: 160 },
  ] as readonly [CampTier, CampTier, CampTier],
  /** 兵出手间隔、近战够得着的距离、走路速度（每拍单位） */
  reload: 20,
  reach: 70,
  speed: 6,
  /** 集结点离营（木台中心）最远多远 */
  rally: 300,
  /** 兵只拦集结点这么远以内的敌人（追远了回来） */
  guard: 220,
  /** 兵在集结点上排开的间距 */
  spread: 45,
} as const;

/**
 * 3 阶分叉（二选一）：
 * - 火枪队：兵改远程，站在集结点打 range 内的敌人（能打飞的），伤害 × dmgPct%，不再拦人；
 * - 重盾队：兵血 × hpPct%，一个兵拦 hold 个敌人。
 */
export const TD2_CAMP_BRANCH = {
  'camp.gun': { name: '火枪队', desc: '兵改远程：射程 3 格、伤害 ×1.4，能打飞的，不再拦人', range: 300, dmgPct: 140 },
  'camp.wall': { name: '重盾队', desc: '兵血 ×1.6，一个兵拦 2 个敌人', hpPct: 160, hold: 2 },
} as const;

export type TdCampBranch = keyof typeof TD2_CAMP_BRANCH;

/**
 * 水手营终极（3 阶分叉选完后二选一，价 = 造价 × 200%，受天赋 ultPct 折扣，仅在战役和海盗来袭且 td06 ≥1★ 解锁）：
 * - 陆战营：4 名水兵出战；每 20 秒冲锋一次，让集结点 3 格内地面敌人晕 1 秒；
 * - 炮手营：兵换成 2 门小炮（走位跟集结点，不拦人），每门炮射程 5 格打炮弹溅射。
 */
export const TD2_CAMP_ULT = {
  'ult.camp.marine': {
    name: '陆战营',
    desc: '4 名水兵出战；每 20 秒冲锋晕集结点 3 格地面敌人 1 秒',
    costPct: 200,
    men: 4,
    chargeCd: 400,
    chargeRange: 300,
    chargeStun: 20,
  },
  'ult.camp.cannon': {
    name: '炮手营',
    desc: '换成 2 门小炮（随集结点走位，不拦人），5 格炮弹溅射',
    costPct: 200,
    men: 2,
    range: 500,
    reload: 40,
    dmgPct: 185,
    splash: 120,
  },
} as const;

export type TdCampUlt = keyof typeof TD2_CAMP_ULT;
