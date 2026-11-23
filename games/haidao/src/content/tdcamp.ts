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
