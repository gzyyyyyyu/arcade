/**
 * 首领连战的首领池、词缀和终局首领「夜漏君」的数值（docs/design-play.md 2.5）。
 * 首领强度只看第几关（content/rush.ts RUSH.hp / dmg），这里的 hpK 只做同关体感拉平。
 */
import { TICKS_PER_SECOND } from './clock.ts';
import type { EnemyKind } from './enemies.ts';
import type { MapId } from './maps.ts';

const S = TICKS_PER_SECOND;

export type RushFoeId = 'lord' | 'zhumu' | 'shuihou' | 'binghun' | 'wumian' | 'huapi' | 'hongyi' | 'shuoshu' | 'boss' | 'duo_lion' | 'duo_corpse' | 'duo_river' | 'duo_market';
export type AffixId = 'tough' | 'swift' | 'split' | 'summon' | 'rage' | 'shield' | 'trail' | 'leech' | 'wind';

export interface RushFoeDef {
  name: string;
  /** 上场的怪（双煞两只） */
  kinds: readonly EnemyKind[];
  /** 主场图：路线图上这一列六成走这张 */
  home: MapId;
  /** 每只的血是这一关基准血的几倍 */
  hpK: number;
  /** 招式狠、起手配装扛不住：不排在第 1 关 */
  late?: true;
}

export const RUSH_FOES: Record<RushFoeId, RushFoeDef> = {
  lord: { name: '纸扎老爷', kinds: ['lord'], home: 'yizhuang', hpK: 1 },
  zhumu: { name: '千年竹母', kinds: ['zhumu'], home: 'bamboo', hpK: 1 },
  shuihou: { name: '水猴王', kinds: ['shuihou'], home: 'riverbank', hpK: 1 },
  binghun: { name: '冰魄娘娘', kinds: ['binghun'], home: 'icelake', hpK: 1, late: true },
  wumian: { name: '无面佛', kinds: ['wumian'], home: 'temple', hpK: 1 },
  huapi: { name: '画皮', kinds: ['huapi'], home: 'guishi', hpK: 1, late: true },
  hongyi: { name: '红衣戏子', kinds: ['hongyi'], home: 'luanzang', hpK: 1, late: true },
  shuoshu: { name: '硕鼠将军', kinds: ['shuoshu'], home: 'yizhuang', hpK: 1, late: true },
  boss: { name: '尸王', kinds: ['boss'], home: 'snow', hpK: 1, late: true },
  duo_lion: { name: '石狮怪和白狐', kinds: ['shishi', 'whitefox'], home: 'temple', hpK: 0.6 },
  duo_corpse: { name: '跳尸将军和纸轿', kinds: ['general', 'palanquin'], home: 'yizhuang', hpK: 0.6, late: true },
  duo_river: { name: '竹王和河伯', kinds: ['bambooking', 'hebo'], home: 'riverbank', hpK: 0.6 },
  duo_market: { name: '鬼市主和冰魄', kinds: ['marketboss', 'frostsoul'], home: 'guishi', hpK: 0.6 },
};

export const RUSH_FOE_IDS = Object.keys(RUSH_FOES) as readonly RushFoeId[];

export const RUSH_AFFIXES: Record<AffixId, { char: string; name: string; text: string }> = {
  tough: { char: '铁', name: '铁', text: '血多四分之一' },
  swift: { char: '疾', name: '疾', text: '走得快四分之一' },
  split: { char: '分', name: '分', text: '半血时分出两个影子' },
  summon: { char: '招', name: '招', text: '每 12 秒叫一群小怪' },
  rage: { char: '狂', name: '狂', text: '血少了打得更狠、走得更快' },
  shield: { char: '护', name: '护', text: '每 15 秒套一层护盾，打破才掉血' },
  trail: { char: '火', name: '火', text: '走过的地方留鬼火' },
  leech: { char: '吸', name: '吸', text: '打中你自己回血' },
  wind: { char: '风', name: '风', text: '每 10 秒把你往它身边拽' },
};

export const AFFIX_IDS = Object.keys(RUSH_AFFIXES) as readonly AffixId[];

/**
 * 词缀的数值（core/foes/affix.ts）。符印「镇尺」：倍数类只取加成的一半（×1.25 → ×1.125），召唤、分身数减半，护盾、吸血、鬼火伤害、风的拽力减半。
 * 伤害类按这只首领的贴身伤害（w.eDmg）乘。
 */
export const AFFIX_FX = {
  tough: 1.25,
  swift: 1.25,
  /** 分：血掉到 at 分出 n 个影子，每个血 = 血上限 × hp，贴身伤害 = 本体 × dmg */
  split: { at: 0.5, n: 2, hp: 0.15, dmg: 0.6, ring: 110 },
  summon: { first: 6 * S, every: 12 * S, n: 6, ring: 150 },
  rage: { at: 0.4, dmg: 1.3, speed: 1.15 },
  shield: { first: 5 * S, every: 15 * S, hp: 0.08 },
  /** 火：每 every 拍在脚下留一团，烧 life 拍 */
  trail: { every: 6, life: 3 * S, r: 26, dmg: 0.5 },
  /** 吸：撞中主角回血上限的 heal */
  leech: { heal: 0.03 },
  /** 风：每 every 拍预警 warn 拍，再拽 pull 拍，每拍拽 speed（离它 near 以内不拽） */
  wind: { first: 6 * S, every: 10 * S, warn: S, pull: 1.5 * S, speed: 2.6, near: 70 },
};

/**
 * 终局首领夜漏君：总血按危险档 hpMul 乘，三段按血切（design 第 6 节）。招式伤害按贴身伤害 w.eDmg 乘（dmg 字段是倍数）。
 * 一更 · 更鼓：鼓圈、更签雨、召更夫鬼；三更 · 月蚀：夜色压下、月牙镰、灯笼；五更 · 漏尽：夜潮、漏珠、滴漏倒数。
 */
export const YELOU = {
  hp: 30000,
  dmg: 22,
  /** 切到第二、第三段的血线（剩余血的比例） */
  phases: [0.65, 0.3] as readonly number[],
  /** 转阶段：无敌几拍 */
  shift: 1.5 * S,
  /** 鼓圈：每 every 拍从脚下扩出一圈，每拍扩 speed，扩到 reach 散；圈厚 thick；缺口半宽（方向表 256 格里占几格）；第二个缺口的概率 */
  drum: { every: 4 * S, speed: 7, reach: 1300, thick: 28, gapHalf: 16, twoGaps: 0.5, dmg: 0.8 },
  /** 更签雨：每 every 拍在主角四周 spread 以内亮 n 个落点（最少 nMin 个），warn 拍后砸下 */
  rain: { first: 2 * S, every: 5 * S, nMin: 6, nMax: 10, spread: 300, r: 52, warn: S, dmg: 1 },
  /** 召更夫鬼：每 every 拍一圈 n 只 */
  call: { first: 8 * S, every: 15 * S, n: 6, ring: 170 },
  /** 月牙镰：每 every 拍；红线预警 warn 拍（它隐在暗处），沿线冲 dash 拍、每拍 speed；身后留冷焰 */
  scythe: { every: 4 * S, warn: 24, dash: 20, speed: 24, dmg: 1.4, flameEvery: 3, flameLife: 3 * S, flameR: 34, flameDmg: 0.45 },
  /** 灯笼：几盏、离场心多远、站在多近算灯旁、灯旁打它的伤害倍数 */
  lantern: { n: 3, ring: 520, r: 150, hitMul: 1.2 },
  /** 月蚀时看得见的半径（和咒「暗」一样的口径） */
  sight: 0.6,
  /** 夜潮：从 start 起每 every 拍收 step，收到 min；圈外每 hurtEvery 拍挨 dmg */
  tide: { start: 1500, every: 5 * S, step: 150, min: 600, hurtEvery: S, dmg: 0.5 },
  /** 漏珠：每 every 拍两条反向的螺旋各一颗，每颗转 turn 格 */
  spiral: { every: 8, turn: 11, speed: 2.4, life: 300, r: 11, dmg: 0.6 },
  /** 五更的滴漏倒数；漏尽后像软限时那样发狂（每 every 拍伤害 +dmg、移速 +speed，封顶 maxDmg / maxSpeed） */
  drip: 45 * S,
  enrage: { every: 10 * S, dmg: 0.1, speed: 0.05, maxDmg: 2, maxSpeed: 1.3 },
  /** 各段的移速倍数 */
  speed: [1, 1.1, 0.9] as readonly number[],
};
