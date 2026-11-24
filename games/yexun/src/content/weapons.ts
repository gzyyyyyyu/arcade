/**
 * 法器、被动、进化（DESIGN.md 3.1–3.3）。改数值只改这里，改完跑模拟器（DESIGN.md 第 8 节）。
 * 单位：时间按拍（每秒 30 拍），距离按世界单位（主角宽约 40），速度按每拍多少单位。
 * 24 件法器、20 个被动、24 个进化、合成 + 双修共 24 个（2.0：阵旗、勾魂锁、竹篙、长明灯、铜钱镖、算盘、招魂幡、判官笔、鞭炮；数值在 ARM_FX，逻辑在 core/arms/）。
 */

// 顺序决定法器编号（事件、宝箱里用），只往后加
export type WeaponId = 'sword' | 'talisman' | 'coins' | 'flysword' | 'thunder' | 'bell' | 'mirror' | 'gourd' | 'rope' | 'petals' | 'shield' | 'crane' | 'zhibing' | 'spring' | 'tide' | 'flag' | 'chain' | 'pole' | 'lamp' | 'dart' | 'abacus' | 'banner' | 'brush' | 'cracker';

/** 五行和类型标签（DESIGN.md 3.1、3.4：同标签凑件数有套装加成） */
export type Element = '金' | '木' | '水' | '火' | '土';
export type WeaponType = '剑' | '符' | '镇' | '灵';
export type PassiveId = 'zhusha' | 'xianglu' | 'caoxie' | 'xiantao' | 'luopan' | 'daopao' | 'nianzhu' | 'lingpai' | 'huangli' | 'lingzhi' | 'modou' | 'yinhun' | 'jiandao' | 'qizhi' | 'tielian' | 'dengyou' | 'qiandai' | 'baifan' | 'zhubi' | 'liuhuang';

/** 一件法器在某一级的数值 */
export interface WeaponStats {
  /** 每下伤害 */
  dmg: number;
  /** 冷却（拍） */
  cd: number;
  /** 范围：剑是斩痕半径，符是爆炸半径，铜钱是绕身半径，铃是光环半径，雷是落点半径 */
  area: number;
  /** 数量：剑几道、符几张、铜钱几枚、飞剑几把、雷几道 */
  amount: number;
  /** 飞行速度（每拍单位）；铜钱是每拍转过的方向表格数 */
  speed: number;
  /** 持续：符的寿命、铜钱一轮转多久、飞剑飞多远（单位） */
  duration: number;
  /** 击退力度（单位） */
  knock: number;
  /** 同一只怪被这件法器连着打的间隔（拍） */
  rehit: number;
}

export interface LevelUp {
  /** 卡片上的一句话 */
  text: string;
  delta: Partial<WeaponStats>;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** 图集里的图标帧 */
  icon: string;
  /** 新拿到时卡片上的说明 */
  desc: string;
  el: Element;
  type: WeaponType;
  base: WeaponStats;
  /** 第 2–8 级的提升（下标 0 是升到 2 级） */
  ups: LevelUp[];
  /** 卡片上各项数值叫什么（没写的用 STAT_NAME）：同一个字段在不同法器里意思不同，比如 amount 是「几道剑气」或「一次捆几只」 */
  stat?: Partial<Record<keyof WeaponStats, string>>;
  /** 进化：满级 + 这件被动，开宝箱时进化 */
  evolve?: { with: PassiveId; name: string; icon: string; desc: string; stats: WeaponStats };
}

export const MAX_WEAPON_LEVEL = 8;
/** 两段式合成：两件料各到 halfLevel 级（进化了也算）合初成，初成的效果按 halfPower 打折 */
export const MERGE_STAGE = { halfLevel: 5, halfPower: 0.5 } as const;
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: '桃木剑',
    icon: 'i_sword',
    desc: '朝面前横扫一道大弧',
    el: '木',
    type: '剑',
    stat: { amount: '剑气几道' },
    base: { dmg: 14, cd: 36, area: 118, amount: 2, speed: 0, duration: 0, knock: 10, rehit: 8 },
    ups: [
      { text: '多砍一道', delta: { amount: 1 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '范围变大', delta: { area: 20 } },
      { text: '多砍一道', delta: { amount: 1 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '出手更快', delta: { cd: -6 } },
      { text: '范围变大、伤害 +8', delta: { area: 20, dmg: 8 } },
    ],
    evolve: {
      with: 'zhusha',
      name: '斩妖剑',
      icon: 'i_sword_evo',
      desc: '前后各两道大斩，砍中回血',
      stats: { dmg: 44, cd: 26, area: 175, amount: 4, speed: 0, duration: 0, knock: 16, rehit: 8 },
    },
  },
  talisman: {
    id: 'talisman',
    name: '符咒',
    icon: 'i_talisman',
    desc: '黄符飞向最近的怪，命中爆开',
    el: '火',
    type: '符',
    stat: { amount: '几张符', speed: '飞行速度', duration: '符飞多久' },
    base: { dmg: 18, cd: 30, area: 34, amount: 1, speed: 13, duration: 70, knock: 6, rehit: 10 },
    ups: [
      { text: '多发一张', delta: { amount: 1 } },
      { text: '伤害 +7', delta: { dmg: 7 } },
      { text: '出手更快', delta: { cd: -5 } },
      { text: '多发一张', delta: { amount: 1 } },
      { text: '爆炸更大', delta: { area: 14 } },
      { text: '伤害 +9', delta: { dmg: 9 } },
      { text: '多发一张', delta: { amount: 1 } },
    ],
    evolve: {
      with: 'xianglu',
      name: '天师符雨',
      icon: 'i_talisman_evo',
      desc: '符咒几乎不停地飞出去',
      stats: { dmg: 36, cd: 9, area: 56, amount: 3, speed: 16, duration: 80, knock: 8, rehit: 8 },
    },
  },
  coins: {
    id: 'coins',
    name: '铜钱剑',
    icon: 'i_coins',
    desc: '铜钱绕身转，还能挡下飞来的火球和冰锥',
    el: '金',
    type: '剑',
    stat: { amount: '几枚铜钱', area: '绕身半径', duration: '一轮转多久', speed: '转速' },
    base: { dmg: 13, cd: 150, area: 76, amount: 3, speed: 7, duration: 90, knock: 8, rehit: 12 },
    ups: [
      { text: '多一枚铜钱', delta: { amount: 1 } },
      { text: '转得更大圈', delta: { area: 16 } },
      { text: '转得更久', delta: { duration: 30 } },
      { text: '伤害 +7', delta: { dmg: 7 } },
      { text: '多一枚铜钱', delta: { amount: 1 } },
      { text: '转得更久、歇得更短', delta: { duration: 30, cd: -20 } },
      { text: '伤害 +8、多一枚', delta: { dmg: 8, amount: 1 } },
    ],
    evolve: {
      with: 'lingpai',
      name: '金钱阵',
      icon: 'i_coins_evo',
      desc: '两圈铜钱常驻绕身，不再歇',
      stats: { dmg: 40, cd: 30, area: 96, amount: 8, speed: 8, duration: 0, knock: 10, rehit: 10 },
    },
  },
  flysword: {
    id: 'flysword',
    name: '飞剑',
    icon: 'i_fly',
    desc: '飞剑绕身待命，看见怪就飞出去穿过一串',
    el: '金',
    type: '剑',
    stat: { amount: '几把飞剑', duration: '飞多远', speed: '飞行速度' },
    base: { dmg: 16, cd: 54, area: 0, amount: 2, speed: 22, duration: 340, knock: 6, rehit: 14 },
    ups: [
      { text: '多一把飞剑', delta: { amount: 1 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '出手更快', delta: { cd: -10 } },
      { text: '多一把飞剑', delta: { amount: 1 } },
      { text: '飞得更快更远', delta: { speed: 4, duration: 60 } },
      { text: '伤害 +8', delta: { dmg: 8 } },
      { text: '多一把飞剑', delta: { amount: 1 } },
    ],
    evolve: {
      with: 'caoxie',
      name: '万剑归宗',
      icon: 'i_fly_evo',
      desc: '一出手就是一扇面，飞回来再打一遍',
      stats: { dmg: 40, cd: 40, area: 0, amount: 8, speed: 28, duration: 460, knock: 8, rehit: 10 },
    },
  },
  thunder: {
    id: 'thunder',
    name: '雷符',
    icon: 'i_thunder',
    desc: '天雷劈向附近的怪，落点一圈都挨打',
    el: '木',
    type: '符',
    stat: { amount: '几道雷', area: '落点半径' },
    base: { dmg: 28, cd: 62, area: 50, amount: 1, speed: 0, duration: 430, knock: 4, rehit: 1 },
    ups: [
      { text: '多劈一道', delta: { amount: 1 } },
      { text: '伤害 +10', delta: { dmg: 10 } },
      { text: '落点更大', delta: { area: 14 } },
      { text: '多劈一道', delta: { amount: 1 } },
      { text: '劈得更勤', delta: { cd: -14 } },
      { text: '伤害 +14', delta: { dmg: 14 } },
      { text: '再多劈一道', delta: { amount: 1 } },
    ],
    evolve: {
      with: 'nianzhu',
      name: '五雷正法',
      icon: 'i_thunder_evo',
      desc: '每道雷连着劈五只',
      stats: { dmg: 70, cd: 54, area: 70, amount: 2, speed: 0, duration: 460, knock: 6, rehit: 1 },
    },
  },
  bell: {
    id: 'bell',
    name: '镇魂铃',
    icon: 'i_bell',
    desc: '身边一圈光环，里面的怪持续挨打、走得慢',
    el: '金',
    type: '镇',
    stat: { area: '光环多大' },
    // 1.1：镇流派中、大档最弱（前期清怪慢），1、2 级光环 73，3 级起照常（第一次变大只 +5）
    base: { dmg: 12, cd: 15, area: 70, amount: 1, speed: 0, duration: 0, knock: 1, rehit: 1 },
    ups: [
      { text: '光环变大', delta: { area: 5 } },
      { text: '伤害 +5', delta: { dmg: 5 } },
      { text: '光环变大', delta: { area: 12 } },
      { text: '响得更勤', delta: { cd: -3 } },
      { text: '伤害 +4', delta: { dmg: 4 } },
      { text: '光环变大', delta: { area: 14 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
    ],
    evolve: {
      with: 'xiantao',
      name: '往生铃',
      icon: 'i_bell_evo',
      desc: '光环更大，光环里的怪死了给你回血',
      stats: { dmg: 32, cd: 12, area: 150, amount: 1, speed: 0, duration: 0, knock: 1, rehit: 1 },
    },
  },
  mirror: {
    id: 'mirror',
    name: '八卦镜',
    icon: 'i_mirror',
    desc: '一圈光波往外推，推开并打伤一圈怪',
    el: '水',
    type: '镇',
    stat: { area: '光波推多远', speed: '光波速度', amount: '连放几道' },
    // area：光波推到多远；speed：光波每拍扩多少；amount：一次连放几道（隔 8 拍）
    base: { dmg: 12, cd: 96, area: 150, amount: 1, speed: 9, duration: 0, knock: 26, rehit: 30 },
    ups: [
      { text: '光波推得更远', delta: { area: 20 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '放得更勤', delta: { cd: -12 } },
      { text: '一次两道光波', delta: { amount: 1 } },
      { text: '推得更远、更狠', delta: { area: 20, knock: 8 } },
      { text: '伤害 +8', delta: { dmg: 8 } },
      { text: '放得更勤', delta: { cd: -14 } },
    ],
    evolve: {
      with: 'daopao',
      name: '太极镜',
      icon: 'i_mirror_evo',
      desc: '一黑一白两道光波，扫掉怪的火球',
      stats: { dmg: 40, cd: 60, area: 230, amount: 2, speed: 10, duration: 0, knock: 40, rehit: 6 },
    },
  },
  gourd: {
    id: 'gourd',
    name: '火葫芦',
    icon: 'i_gourd',
    desc: '朝最近的怪喷一道火，扇面里都挨烧；带两件火法器时飞来的弹也烧掉',
    el: '火',
    type: '灵',
    stat: { area: '火舌多长', duration: '一次喷多久', amount: '扇面宽' },
    // area：火舌多长；duration：一次喷几拍；amount：扇面宽（每多 1 宽 6°，基础 ±22°）
    base: { dmg: 22, cd: 84, area: 190, amount: 1, speed: 0, duration: 36, knock: 2, rehit: 6 },
    ups: [
      { text: '伤害 +5', delta: { dmg: 5 } },
      { text: '火舌更长', delta: { area: 20 } },
      { text: '喷得更久', delta: { duration: 12 } },
      { text: '扇面更宽', delta: { amount: 1 } },
      { text: '伤害 +4', delta: { dmg: 4 } },
      { text: '喷得更勤', delta: { cd: -14 } },
      { text: '扇面更宽、伤害 +6', delta: { amount: 1, dmg: 6 } },
    ],
    evolve: {
      with: 'luopan',
      name: '三昧真火',
      icon: 'i_gourd_evo',
      desc: '喷过的地方留一摊火，烧一阵',
      stats: { dmg: 36, cd: 60, area: 245, amount: 3, speed: 0, duration: 54, knock: 2, rehit: 6 },
    },
  },
  rope: {
    id: 'rope',
    name: '缚妖索',
    icon: 'i_rope',
    desc: '甩出绳索捆住一串怪，捆住的走不动',
    el: '土',
    type: '镇',
    stat: { amount: '一次捆几只', area: '找下一只的距离', duration: '捆多久' },
    // amount：一次捆几只；area：从第一只往外找下一只的距离；duration：捆几拍
    // 主要是控场：伤害低，捆住的怪不会马上死，拖住才有用
    base: { dmg: 10, cd: 120, area: 140, amount: 3, speed: 0, duration: 75, knock: 0, rehit: 1 },
    ups: [
      { text: '多捆两只', delta: { amount: 2 } },
      { text: '捆得更久', delta: { duration: 15 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '多捆两只', delta: { amount: 2 } },
      { text: '甩得更勤', delta: { cd: -20 } },
      { text: '捆得更久', delta: { duration: 20 } },
      { text: '多捆三只', delta: { amount: 3 } },
    ],
    evolve: {
      with: 'modou',
      name: '捆仙绳',
      icon: 'i_rope_evo',
      desc: '一次捆一大片，捆住的挨打加倍',
      stats: { dmg: 16, cd: 90, area: 200, amount: 18, speed: 0, duration: 130, knock: 0, rehit: 1 },
    },
  },
  petals: {
    id: 'petals',
    name: '桃花雨',
    icon: 'i_petal',
    desc: '身边落桃花，砸中的怪挨打，主角回一点血',
    el: '木',
    type: '灵',
    stat: { amount: '一次落几片', area: '落多大一圈', duration: '落地要多久' },
    // amount：一次落几片；area：落在身边多大一圈；duration：花瓣落地要几拍
    base: { dmg: 16, cd: 60, area: 150, amount: 4, speed: 0, duration: 14, knock: 3, rehit: 1 },
    ups: [
      { text: '多落两片', delta: { amount: 2 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '落得更开', delta: { area: 20 } },
      { text: '多落两片', delta: { amount: 2 } },
      { text: '落得更勤', delta: { cd: -10 } },
      { text: '伤害 +7', delta: { dmg: 7 } },
      { text: '多落三片', delta: { amount: 3 } },
    ],
    evolve: {
      with: 'lingzhi',
      name: '十里桃林',
      icon: 'i_petal_evo',
      desc: '花瓣铺满一圈，回血更多',
      stats: { dmg: 36, cd: 40, area: 200, amount: 18, speed: 0, duration: 14, knock: 3, rehit: 1 },
    },
  },
  shield: {
    id: 'shield',
    name: '金钟罩',
    icon: 'i_shield',
    desc: '护盾挡下一次伤害，碎的时候震开身边的怪',
    el: '土',
    type: '镇',
    stat: { amount: '最多挡几下', cd: '回一层要多久', area: '碎时震多大', dmg: '碎时伤害' },
    // amount：最多挡几下；cd：回一层要几拍；area、dmg：碎的时候震多大、打多少
    base: { dmg: 50, cd: 360, area: 110, amount: 1, speed: 0, duration: 0, knock: 30, rehit: 1 },
    ups: [
      { text: '回得更快', delta: { cd: -60 } },
      { text: '震得更疼', delta: { dmg: 20 } },
      { text: '多挡一下', delta: { amount: 1 } },
      { text: '震得更远', delta: { area: 20 } },
      { text: '回得更快', delta: { cd: -60 } },
      { text: '震得更疼', delta: { dmg: 24 } },
      { text: '多挡一下', delta: { amount: 1 } },
    ],
    evolve: {
      with: 'huangli',
      name: '不坏金身',
      icon: 'i_shield_evo',
      desc: '护盾一回就回满，碎的时候震开全屏',
      stats: { dmg: 100, cd: 90, area: 600, amount: 3, speed: 0, duration: 0, knock: 40, rehit: 1 },
    },
  },
  crane: {
    id: 'crane',
    name: '纸鹤',
    icon: 'i_crane',
    desc: '纸鹤在身边盘旋，俯冲去啄最近的怪',
    el: '水',
    type: '符',
    stat: { amount: '几只纸鹤', area: '看多远', speed: '俯冲速度', cd: '俯冲间隔' },
    // amount：几只纸鹤；area：看多远的怪；speed：俯冲多快；cd：一轮俯冲的间隔（几只轮流）
    base: { dmg: 28, cd: 48, area: 300, amount: 1, speed: 15, duration: 0, knock: 6, rehit: 10 },
    ups: [
      { text: '多一只纸鹤', delta: { amount: 1 } },
      { text: '伤害 +8', delta: { dmg: 8 } },
      { text: '啄得更勤', delta: { cd: -12 } },
      { text: '多一只纸鹤', delta: { amount: 1 } },
      { text: '飞得更快、伤害 +8', delta: { speed: 4, dmg: 8 } },
      { text: '多一只纸鹤', delta: { amount: 1 } },
      { text: '伤害 +13', delta: { dmg: 13 } },
    ],
    evolve: {
      with: 'yinhun',
      name: '千鹤引魂',
      icon: 'i_crane_evo',
      desc: '一群纸鹤，啄死的怪变成小纸鹤',
      stats: { dmg: 56, cd: 36, area: 340, amount: 6, speed: 20, duration: 0, knock: 6, rehit: 10 },
    },
  },
  // 10-20 新流派（纸人这个名字已经是怪了，所以叫纸兵）：召唤会走的纸兵替你挡怪
  zhibing: {
    id: 'zhibing',
    name: '纸兵',
    icon: 'i_zhibing',
    desc: '剪出几个纸兵，走去顶住最近的怪，边挡边打；挨打会折寿',
    el: '土',
    type: '灵',
    stat: { amount: '同时最多几个', cd: '补一个要多久', area: '找怪距离', speed: '走多快', duration: '活多久' },
    // amount：同时最多几个；cd：补一个要几拍；area：多远内找怪；speed：走多快；duration：活几拍；dmg、rehit：贴身每隔几拍打一下；knock：把怪顶回去多远
    base: { dmg: 11, cd: 120, area: 280, amount: 2, speed: 2.6, duration: 300, knock: 10, rehit: 15 },
    ups: [
      { text: '多一个纸兵', delta: { amount: 1 } },
      { text: '伤害 +4', delta: { dmg: 4 } },
      { text: '补得更快', delta: { cd: -25 } },
      { text: '活得更久', delta: { duration: 90 } },
      { text: '多一个纸兵', delta: { amount: 1 } },
      { text: '伤害 +5、顶得更远', delta: { dmg: 5, knock: 4 } },
      { text: '多一个纸兵', delta: { amount: 1 } },
    ],
    evolve: {
      with: 'jiandao',
      name: '撒豆成兵',
      icon: 'i_zhibing_evo',
      desc: '纸兵成群，倒下时炸开一圈',
      stats: { dmg: 36, cd: 60, area: 320, amount: 7, speed: 3, duration: 420, knock: 14, rehit: 12 },
    },
  },
  // 10-30 新流派「水府」（龙王、雨师）：地上冒寒泉（地面持续区）、令牌召浪（推着怪走的一道直线浪），配八卦镜、纸鹤凑水 3 件
  spring: {
    id: 'spring',
    name: '寒泉',
    icon: 'i_spring',
    desc: '在怪最密的地方冒一眼寒泉，泉里的怪持续挨冻、走得慢',
    el: '水',
    // 灵（泉眼通灵）：试过算镇，危险 2 吃满怪"怕镇"的加成（尸王 ×1.65）太顺、危险 5 一下没了；算灵不沾克制，两档差得和别的流派一样
    type: '灵',
    stat: { amount: '一次冒几眼', area: '泉多大', duration: '泉留多久' },
    // amount：一次冒几眼；area：泉多大；duration：泉留几拍（墨斗加长）；dmg、rehit：泉里每隔几拍冻一下
    // 估算：1 级泉里每只 22/秒、同时约 1.2 眼（半径 56）；8 级每只 48/秒、同时约 3.75 眼（半径 78）；
    // 镇魂铃 8 级是身边一圈每只 67/秒、一直在。泉离身、要怪走进去才打，单只低一截、铺得开；精英首领在泉里 ×2（WATER_FX）
    base: { dmg: 11, cd: 100, area: 56, amount: 1, speed: 0, duration: 120, knock: 0, rehit: 15 },
    ups: [
      { text: '多冒一眼', delta: { amount: 1 } },
      { text: '伤害 +5', delta: { dmg: 5 } },
      { text: '泉更大', delta: { area: 12 } },
      { text: '泉留得更久', delta: { duration: 30 } },
      { text: '伤害 +5', delta: { dmg: 5 } },
      { text: '冒得更勤', delta: { cd: -20 } },
      { text: '泉更大、伤害 +3', delta: { area: 10, dmg: 3 } },
    ],
    evolve: {
      with: 'modou',
      name: '玄冥寒潭',
      icon: 'i_spring_evo',
      desc: '寒潭更大，潭里的怪冻得只剩一半速度，潭干时炸开一圈冰碴',
      stats: { dmg: 30, cd: 80, area: 92, amount: 2, speed: 0, duration: 160, knock: 0, rehit: 15 },
    },
  },
  tide: {
    id: 'tide',
    name: '龙王令',
    icon: 'i_tide',
    desc: '令牌一挥，一道浪朝最近的怪推过去，一路带着怪往外走',
    el: '水',
    // 灵（龙王显灵召浪）：不算符，免得和纸鹤、雷符凑成符 3 件、又吃满怪"怕符"的加成（危险 2 太顺、危险 5 一下没了）
    type: '灵',
    stat: { amount: '几道浪', area: '浪头多宽', speed: '浪速', duration: '浪走多久', knock: '带怪力度' },
    // amount：一次几道浪（扇面）；area：浪头多宽（半径）；speed：浪每拍走多远；duration：浪走几拍；knock：浪里的怪被带着走浪速的几成（百分数）
    // 估算：1 级一道浪扫过 80×350 的一条，每只 24，2.3 秒一道；8 级三道（扇面）扫过 100×455，每只 42、1.8 秒一挥。
    // 同档雷符 8 级是 4 道雷各砸半径 64 一圈、每只 52、1.6 秒一阵：浪单只低、扫得宽，扫过的面积 × 伤害差不多；进化回程再打一遍
    // 带怪的力度 12（浪速的 12%）：试过 35，近身的怪一直被推走，危险 2 太顺
    base: { dmg: 24, cd: 70, area: 40, amount: 1, speed: 7, duration: 50, knock: 12, rehit: 30 },
    ups: [
      { text: '多一道浪', delta: { amount: 1 } },
      { text: '伤害 +8', delta: { dmg: 8 } },
      { text: '浪更宽', delta: { area: 10 } },
      { text: '浪走得更远', delta: { duration: 15 } },
      { text: '多一道浪', delta: { amount: 1 } },
      { text: '伤害 +10', delta: { dmg: 10 } },
      { text: '挥得更勤', delta: { cd: -15 } },
    ],
    evolve: {
      with: 'xianglu',
      name: '翻江倒海',
      icon: 'i_tide_evo',
      desc: '一挥三道大浪，浪走到头再卷回来打一遍',
      // 回程不带怪（往回带就是把怪送到你脸上），只打
      stats: { dmg: 56, cd: 50, area: 60, amount: 3, speed: 8, duration: 60, knock: 12, rehit: 20 },
    },
  },
  // 2.0 第一批（DESIGN.md 3.1）。四件都有专属特效和音效，逻辑在 core/arms/，数值在下面的 ARM_FX
  flag: {
    id: 'flag',
    name: '阵旗',
    icon: 'i_flag',
    desc: '脚下插四面小旗围成方阵，阵里的怪持续挨打，每隔一阵被定住一下',
    el: '土',
    type: '镇',
    stat: { area: '阵多大', amount: '一次布几座', duration: '阵留多久' },
    // area：方阵半边长；amount：一次布几座；duration：阵留几拍；dmg、rehit：阵里每隔几拍打一下；阵里的怪每 ARM_FX.flag.freezeEvery 拍定住 ARM_FX.flag.freeze 拍
    base: { dmg: 6, cd: 150, area: 84, amount: 1, speed: 0, duration: 150, knock: 0, rehit: 15 },
    ups: [
      { text: '阵更大', delta: { area: 10 } },
      { text: '伤害 +4', delta: { dmg: 4 } },
      { text: '阵留得更久', delta: { duration: 30 } },
      { text: '布得更勤', delta: { cd: -20 } },
      { text: '伤害 +5', delta: { dmg: 5 } },
      { text: '阵更大', delta: { area: 12 } },
      { text: '多布一座阵', delta: { amount: 1 } },
    ],
    evolve: {
      with: 'qizhi',
      name: '四象大阵',
      icon: 'i_flag_evo',
      desc: '阵更大，旗与旗之间连起光线，线上的怪挨得更疼',
      stats: { dmg: 30, cd: 110, area: 130, amount: 2, speed: 0, duration: 180, knock: 0, rehit: 15 },
    },
  },
  chain: {
    id: 'chain',
    name: '勾魂锁',
    icon: 'i_chain',
    desc: '甩出黑白锁链，把一群怪拉到一处再勒一下',
    el: '金',
    type: '镇',
    stat: { area: '抓多远', amount: '一次拉几只', knock: '往里拉几成' },
    // area：从最近的怪往外抓多远；amount：一次拉几只；knock：往中心拉掉距离的百分之几；duration：被拉的怪多挨打的拍数（进化才有）
    base: { dmg: 10, cd: 140, area: 130, amount: 3, speed: 0, duration: 0, knock: 55, rehit: 1 },
    ups: [
      { text: '多拉两只', delta: { amount: 2 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '抓得更远', delta: { area: 20 } },
      { text: '甩得更勤', delta: { cd: -15 } },
      { text: '多拉两只', delta: { amount: 2 } },
      { text: '伤害 +8', delta: { dmg: 8 } },
      { text: '多拉一只、拉得更狠', delta: { amount: 1, knock: 15 } },
    ],
    evolve: {
      with: 'tielian',
      name: '勾魂索命',
      icon: 'i_chain_evo',
      desc: '抓得更远更多，被拉到的怪三秒内挨打 +25%',
      stats: { dmg: 64, cd: 70, area: 200, amount: 12, speed: 0, duration: 90, knock: 85, rehit: 1 },
    },
  },
  pole: {
    id: 'pole',
    name: '竹篙',
    icon: 'i_pole',
    desc: '朝最近的怪戳一道直线，把一路上的怪挑着往后送',
    el: '水',
    type: '剑',
    stat: { area: '戳多长', amount: '一次戳几下', knock: '挑多远' },
    // area：戳多长；amount：一次戳几下（扇面）；knock：挑出去多远；duration：水痕留几拍（进化才有）
    base: { dmg: 22, cd: 54, area: 240, amount: 1, speed: 0, duration: 0, knock: 30, rehit: 20 },
    ups: [
      { text: '多戳一下', delta: { amount: 1 } },
      { text: '伤害 +7', delta: { dmg: 7 } },
      { text: '戳得更远', delta: { area: 30 } },
      { text: '戳得更勤', delta: { cd: -8 } },
      { text: '多戳一下', delta: { amount: 1 } },
      { text: '伤害 +9', delta: { dmg: 9 } },
      { text: '戳得更勤、更远', delta: { cd: -8, area: 20 } },
    ],
    evolve: {
      with: 'caoxie',
      name: '撑船破浪',
      icon: 'i_pole_evo',
      desc: '一戳三下，戳过的路上留下水痕，水痕里的怪慢三成',
      stats: { dmg: 50, cd: 40, area: 330, amount: 3, speed: 0, duration: 120, knock: 40, rehit: 15 },
    },
  },
  lamp: {
    id: 'lamp',
    name: '长明灯',
    icon: 'i_lamp',
    desc: '在脚下点一盏灯，灯照到的怪持续灼烧，你站在光里慢慢回血',
    el: '火',
    type: '灵',
    stat: { area: '灯照多大', amount: '几盏灯', duration: '灯亮多久' },
    // area：灯照多大；amount：同时几盏（进化后是跟着走的小灯数）；duration：灯亮几拍；dmg、rehit：每隔几拍灼一下
    base: { dmg: 7, cd: 270, area: 78, amount: 1, speed: 0, duration: 270, knock: 0, rehit: 20 },
    ups: [
      { text: '灯更亮', delta: { area: 12 } },
      { text: '伤害 +4', delta: { dmg: 4 } },
      { text: '灯亮得更久', delta: { duration: 60 } },
      { text: '多点一盏', delta: { amount: 1 } },
      { text: '点得更勤', delta: { cd: -60 } },
      { text: '伤害 +5', delta: { dmg: 5 } },
      { text: '灯更亮、伤害 +3', delta: { area: 12, dmg: 3 } },
    ],
    evolve: {
      with: 'dengyou',
      name: '万家灯火',
      icon: 'i_lamp_evo',
      desc: '脚下一盏大灯，身边还有一圈小灯跟着你走，一起烧',
      stats: { dmg: 28, cd: 190, area: 124, amount: 4, speed: 0, duration: 420, knock: 0, rehit: 20 },
    },
  },
  // 2.0 第二批（DESIGN.md 3.1）。逻辑在 core/arms/second.ts，数值在下面的 ARM_FX2
  dart: {
    id: 'dart',
    name: '铜钱镖',
    icon: 'i_dart',
    desc: '掷出一枚回旋镖，来回两趟，每趟在怪之间弹跳',
    el: '金',
    type: '符',
    stat: { area: '看多远', amount: '一次掷几枚', speed: '飞行速度' },
    // area：看多远的怪；amount：一次掷几枚；speed：飞多快（每拍）；每趟最多弹 ARM_FX2.dart.hops 只怪（进化 +evoHops）
    base: { dmg: 24, cd: 60, area: 300, amount: 1, speed: 14, duration: 0, knock: 4, rehit: 1 },
    ups: [
      { text: '多掷一枚', delta: { amount: 1 } },
      { text: '伤害 +7', delta: { dmg: 7 } },
      { text: '掷得更勤', delta: { cd: -7 } },
      { text: '看得更远', delta: { area: 50 } },
      { text: '多掷一枚', delta: { amount: 1 } },
      { text: '伤害 +11', delta: { dmg: 11 } },
      { text: '掷得更勤、飞得更快', delta: { cd: -6, speed: 3 } },
    ],
    evolve: {
      with: 'qiandai',
      name: '飞钱雨',
      icon: 'i_dart_evo',
      desc: '一次掷出一扇铜钱镖，每趟多弹两只',
      stats: { dmg: 38, cd: 46, area: 380, amount: 5, speed: 17, duration: 0, knock: 6, rehit: 1 },
    },
  },
  abacus: {
    id: 'abacus',
    name: '算盘',
    icon: 'i_abacus',
    desc: '范围里每只怪每隔一阵多记一层账，到点结算，层数越多这一下越疼',
    el: '金',
    type: '灵',
    stat: { area: '记账范围', cd: '结算间隔', rehit: '记一层要多久', dmg: '每层底数' },
    // area：记账范围（也是结算范围）；cd：结算间隔；rehit：多久记一层；dmg：每层之前的底数，结算伤害 = dmg × (1 + perBead × 层数)
    base: { dmg: 13, cd: 110, area: 200, amount: 1, speed: 0, duration: 0, knock: 0, rehit: 22 },
    ups: [
      { text: '范围变大', delta: { area: 20 } },
      { text: '伤害 +7', delta: { dmg: 7 } },
      { text: '算得更勤', delta: { cd: -12 } },
      { text: '记得更快', delta: { rehit: -3 } },
      { text: '伤害 +8', delta: { dmg: 8 } },
      { text: '范围变大', delta: { area: 24 } },
      { text: '伤害 +10、算得更勤', delta: { dmg: 10, cd: -10 } },
    ],
    evolve: {
      with: 'huangli',
      name: '天机算盘',
      icon: 'i_abacus_evo',
      desc: '结算后账不清零（留一半），精英多记三层',
      stats: { dmg: 54, cd: 72, area: 280, amount: 1, speed: 0, duration: 0, knock: 0, rehit: 16 },
    },
  },
  banner: {
    id: 'banner',
    name: '招魂幡',
    icon: 'i_banner',
    desc: '立一面幡，幡附近死的怪有几成变成冤魂，追着最近的怪撞一下',
    el: '土',
    type: '灵',
    stat: { area: '幡多大', amount: '几面幡', duration: '幡立多久', dmg: '冤魂一撞', speed: '冤魂速度' },
    // area：幡多大（死在里面才变冤魂）；amount：同时几面幡；duration：幡立几拍；dmg：冤魂一撞；speed：冤魂每拍飞多快
    base: { dmg: 40, cd: 200, area: 190, amount: 1, speed: 7, duration: 420, knock: 6, rehit: 1 },
    ups: [
      { text: '幡更大', delta: { area: 20 } },
      { text: '冤魂伤害 +14', delta: { dmg: 14 } },
      { text: '幡立得更久', delta: { duration: 90 } },
      { text: '多立一面幡', delta: { amount: 1 } },
      { text: '冤魂飞得更快', delta: { speed: 2 } },
      { text: '冤魂伤害 +16', delta: { dmg: 16 } },
      { text: '立得更勤、幡更大', delta: { cd: -50, area: 20 } },
    ],
    evolve: {
      with: 'baifan',
      name: '万魂幡',
      icon: 'i_banner_evo',
      desc: '变冤魂的概率翻倍，冤魂撞完还会回到幡旁再来一次',
      stats: { dmg: 90, cd: 170, area: 240, amount: 2, speed: 9, duration: 540, knock: 8, rehit: 1 },
    },
  },
  brush: {
    id: 'brush',
    name: '判官笔',
    icon: 'i_brush',
    desc: '点名血最多的怪，连点三下',
    el: '木',
    type: '剑',
    stat: { area: '点多远', amount: '一次点几只' },
    // area：能点多远的怪；amount：一次点名几只；dmg：每一下
    base: { dmg: 58, cd: 78, area: 400, amount: 1, speed: 0, duration: 0, knock: 0, rehit: 1 },
    ups: [
      { text: '伤害 +16', delta: { dmg: 16 } },
      { text: '点得更勤', delta: { cd: -8 } },
      { text: '多点名一只', delta: { amount: 1 } },
      { text: '伤害 +14', delta: { dmg: 14 } },
      { text: '点得更勤', delta: { cd: -12 } },
      { text: '多点名一只', delta: { amount: 1 } },
      { text: '伤害 +18', delta: { dmg: 18 } },
    ],
    evolve: {
      with: 'zhubi',
      name: '生死簿',
      icon: 'i_brush_evo',
      desc: '血剩两成以下的怪直接勾销，首领改为额外挨 20%',
      stats: { dmg: 120, cd: 56, area: 440, amount: 3, speed: 0, duration: 0, knock: 0, rehit: 1 },
    },
  },
  cracker: {
    id: 'cracker',
    name: '鞭炮',
    icon: 'i_cracker',
    desc: '朝前抛一串爆竹，沿路噼啪连爆，吓退小怪',
    el: '火',
    type: '符',
    stat: { area: '每响半径', amount: '一串几响', knock: '吓退多远', speed: '响间距' },
    // area：每一响的半径；amount：一串几响；knock：每一响把怪吓退多远；speed：响与响之间隔多远
    base: { dmg: 11, cd: 78, area: 40, amount: 6, speed: 38, duration: 0, knock: 18, rehit: 1 },
    ups: [
      { text: '多两响', delta: { amount: 2 } },
      { text: '伤害 +4', delta: { dmg: 4 } },
      { text: '抛得更勤', delta: { cd: -10 } },
      { text: '每响更大', delta: { area: 6 } },
      { text: '多两响', delta: { amount: 2 } },
      { text: '伤害 +6', delta: { dmg: 6 } },
      { text: '抛得更勤、吓得更远', delta: { cd: -10, knock: 8 } },
    ],
    evolve: {
      with: 'liuhuang',
      name: '十响连环',
      icon: 'i_cracker_evo',
      desc: '爆竹落地后再炸一轮，吓退的距离加倍',
      stats: { dmg: 22, cd: 56, area: 52, amount: 10, speed: 40, duration: 0, knock: 40, rehit: 1 },
    },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
/** 法器在事件里的编号（WEAPON_IDS 的下标） */
export const WEAPON_CODE: Record<WeaponId, number> = Object.fromEntries(WEAPON_IDS.map((id, i) => [id, i])) as Record<WeaponId, number>;

/** 镇 3 件：被减速的怪挨打的倍数（只算镇 3 件和镇魂铃减速的怪） */
export const WARD_SET_HIT = 1.25;
/**
 * 火葫芦烧飞来的弹，要带几件火法器（火葫芦自己算一件）。烧弹是烈火顶远程怪的办法（烈火没有飞剑、铜钱）；
 * 别的流派单带火葫芦也烧弹，镇守混搭火葫芦就补上了没有的防远程，不加这条焚天金钟危险 5 胜率高约 6.5 点（DESIGN 12）
 */
export const GOURD_BURN_FIRES = 2;
/** 带几件镇类法器起，危险 4 起的精英不吃减速（waves.ts eliteNoWard） */
export const ELITE_NO_WARD_PIECES = 2;
const pct = (m: number): string => `${Math.round((m - 1) * 100)}%`;

/** 套装（DESIGN.md 3.4）：同类型 / 同五行的法器凑够 2 件、3 件各有加成。卡片和暂停页的说明也从这里取 */
export const TYPE_SETS: Record<WeaponType, [string, string]> = {
  剑: ['暴击 +8%', '暴击伤害 +50%'],
  符: ['冷却 −8%', '符类每次多发一张'],
  镇: ['范围 +12%', `身边的怪减速 20%，被减速的挨打 +${pct(WARD_SET_HIT)}`],
  灵: ['持续 +15%', '灵类伤害 +25%'],
};
/** 五行相生：木生火、火生土、土生金、金生水、水生木 */
export const NEXT_ELEMENT: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
export const ELEMENT_SET: [string, string] = ['这一系法器伤害 +10%', '它生的那一系伤害也 +10%'];

/** 某件法器在某一级（1–8）的数值；进化后用进化的数值 */
export function weaponStats(id: WeaponId, level: number, evolved: boolean): WeaponStats {
  const def = WEAPONS[id];
  if (evolved && def.evolve) return { ...def.evolve.stats };
  const s = { ...def.base };
  for (let i = 0; i < level - 1 && i < def.ups.length; i++) {
    const d = def.ups[i]!.delta;
    for (const k of Object.keys(d) as (keyof WeaponStats)[]) s[k] += d[k]!;
  }
  return s;
}

/** 数值的默认叫法；按拍记的（STAT_TICKS）在卡片上换成秒 */
export const STAT_NAME: Record<keyof WeaponStats, string> = { dmg: '伤害', cd: '冷却', area: '范围', amount: '数量', speed: '速度', duration: '持续', knock: '击退', rehit: '连打间隔' };
const STAT_TICKS: ReadonlySet<keyof WeaponStats> = new Set(['cd', 'duration', 'rehit']);

export interface StatChange {
  /** 哪一项（界面按它挑图标） */
  key: keyof WeaponStats;
  /** 这件法器的叫法（def.stat 里写了的用它，否则 STAT_NAME） */
  name: string;
  from: number;
  to: number;
  /** '秒' 或空 */
  unit: string;
}

/**
 * 升到 level + 1 级具体改了什么（升级卡用）：从 weaponStats 算前后两级的数，只列 ups 里这一级动到的字段。
 * 拍换成秒（飞剑的 duration 是飞多远，不换）；数从规则表来，界面不另写。
 */
export function upChanges(id: WeaponId, level: number): StatChange[] {
  const def = WEAPONS[id];
  const up = def.ups[level - 1];
  if (!up) return [];
  const a = weaponStats(id, level, false);
  const b = weaponStats(id, level + 1, false);
  return (Object.keys(up.delta) as (keyof WeaponStats)[]).map((k) => {
    const sec = STAT_TICKS.has(k) && !(id === 'flysword' && k === 'duration');
    const f = (v: number): number => +(sec ? v / 30 : v).toFixed(2);
    return { key: k, name: def.stat?.[k] ?? STAT_NAME[k], from: f(a[k]), to: f(b[k]), unit: sec ? '秒' : '' };
  });
}

/** 图鉴：1 级 → 满级（没进化）的伤害、冷却 */
export function spanNums(id: WeaponId): StatChange[] {
  const a = weaponStats(id, 1, false);
  const b = weaponStats(id, MAX_WEAPON_LEVEL, false);
  return (['dmg', 'cd'] as const).map((k) => {
    const sec = k === 'cd';
    const f = (v: number): number => +(sec ? v / 30 : v).toFixed(2);
    return { key: k, name: WEAPONS[id].stat?.[k] ?? STAT_NAME[k], from: f(a[k]), to: f(b[k]), unit: sec ? '秒' : '' };
  });
}

/** 新法器卡的基础数：伤害、冷却、数量（数量写了专门叫法的才列，比如「几把飞剑」） */
export function baseNums(id: WeaponId): StatChange[] {
  const def = WEAPONS[id];
  const keys: (keyof WeaponStats)[] = def.stat?.amount ? ['dmg', 'cd', 'amount'] : ['dmg', 'cd'];
  return keys.map((k) => {
    const sec = k === 'cd';
    const v = +(sec ? def.base[k] / 30 : def.base[k]).toFixed(2);
    return { key: k, name: def.stat?.[k] ?? STAT_NAME[k], from: v, to: v, unit: sec ? '秒' : '' };
  });
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  icon: string;
  /** 每级的说明 */
  text: string;
  max: number;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  zhusha: { id: 'zhusha', name: '朱砂', icon: 'p_zhusha', text: '伤害 +10%', max: 5 },
  xianglu: { id: 'xianglu', name: '香炉', icon: 'p_xianglu', text: '冷却 −8%', max: 5 },
  caoxie: { id: 'caoxie', name: '草鞋', icon: 'p_caoxie', text: '走得快 10%', max: 5 },
  xiantao: { id: 'xiantao', name: '仙桃', icon: 'p_xiantao', text: '血上限 +15，慢慢回血', max: 5 },
  luopan: { id: 'luopan', name: '罗盘', icon: 'p_luopan', text: '吸魂珠的范围 +30%', max: 5 },
  daopao: { id: 'daopao', name: '道袍', icon: 'p_daopao', text: '每次挨打少掉 1 点血', max: 5 },
  nianzhu: { id: 'nianzhu', name: '念珠', icon: 'p_nianzhu', text: '法器范围 +10%', max: 5 },
  lingpai: { id: 'lingpai', name: '令牌', icon: 'p_lingpai', text: '法器数量 +1', max: 2 },
  huangli: { id: 'huangli', name: '黄历', icon: 'p_huangli', text: '幸运 +10%：暴击、宝箱多给、好卡', max: 5 },
  lingzhi: { id: 'lingzhi', name: '灵芝', icon: 'p_lingzhi', text: '魂珠经验 +8%', max: 5 },
  modou: { id: 'modou', name: '墨斗', icon: 'p_modou', text: '持续 +10%：火、绳、铜钱、护盾、寒泉', max: 5 },
  yinhun: { id: 'yinhun', name: '引魂灯', icon: 'p_yinhun', text: '怪多 10%、快 5%，经验和铜钱 +12%', max: 5 },
  jiandao: { id: 'jiandao', name: '剪刀', icon: 'p_jiandao', text: '持续 +6%，纸兵活得更久 +20%', max: 5 },
  qizhi: { id: 'qizhi', name: '令旗', icon: 'p_qizhi', text: '镇类范围 +10%，被定住、捆住的怪多定 0.1 秒', max: 5 },
  tielian: { id: 'tielian', name: '铁链', icon: 'p_tielian', text: '击退和拉拽距离 +12%，被勾魂锁拉到的怪多挨 3%', max: 5 },
  dengyou: { id: 'dengyou', name: '灯油', icon: 'p_dengyou', text: '长明灯亮得久 10%，站在灯光里每秒多回 0.2 血', max: 5 },
  qiandai: { id: 'qiandai', name: '钱袋', icon: 'p_qiandai', text: '铜钱掉落 +15%，金类伤害 +4%', max: 5 },
  baifan: { id: 'baifan', name: '白幡', icon: 'p_baifan', text: '死的怪变冤魂的概率 +4%，魂珠范围 +10%', max: 5 },
  zhubi: { id: 'zhubi', name: '朱笔', icon: 'p_zhubi', text: '暴击伤害 +15%，对精英和首领 +4%', max: 5 },
  liuhuang: { id: 'liuhuang', name: '硫磺', icon: 'p_liuhuang', text: '火类伤害 +8%，火类持续 +10%', max: 5 },
};

/**
 * 合成（DESIGN.md 3.3、3.3b）：两件都进化了，宝箱里合成一件，空出一个法器格（料到一半先合初成、大成才空格，3.3f）；a 留在原来的格子里，b 也照常出手。
 * dual = 双修：两件不同流派（类型或五行）的法器合成，效果把两边的打法接在一起。
 * color：这个合成自己的颜色（图标底牌、合成演出、图鉴边）。
 */
export interface MergeDef {
  id: 'zhuxie' | 'leihuo' | 'yinyang' | 'fujian' | 'fenzhong' | 'linghua' | 'huobing' | 'mingbing' | 'leiyu' | 'leijie' | 'hejin' | 'qiankun' | 'qianjian' | 'heling' | 'yiwei' | 'chenzhong' | 'huadeng' | 'dudeng' | 'liangyi' | 'yinlv' | 'maibu' | 'yinbing' | 'baozhu' | 'caiyuan' | 'fuhuo' | 'linfu' | 'lingyan' | 'zhonggu' | 'jianzou' | 'longshe' | 'panzhen' | 'suohun' | 'hanzhong';
  name: string;
  icon: string;
  desc: string;
  a: WeaponId;
  b: WeaponId;
  color: string;
  dual?: boolean;
  /** 角色专属：只有这个角色的宝箱里出现（CharacterId；2.0 的新角色 id 由角色那一路定，没有这个角色时合不出来）；几个角色共有的用逗号隔开 */
  only?: string;
}

/** 这个角色的宝箱里能不能出这个搭配（专属的只认自己的角色） */
export const mergeFor = (m: MergeDef, character: string | undefined): boolean => !m.only || m.only.split(',').includes(character ?? 'xiaodao');

export const MERGES: readonly MergeDef[] = [
  { id: 'zhuxie', name: '诛邪剑阵', icon: 'm_sword', desc: '每次挥剑，待命的飞剑一起射出去', a: 'sword', b: 'flysword', color: '#b58cff' },
  { id: 'leihuo', name: '雷火符箓', icon: 'm_talisman', desc: '每张符爆开时落一道雷', a: 'talisman', b: 'thunder', color: '#b58cff' },
  { id: 'yinyang', name: '阴阳镇魂', icon: 'm_mirror', desc: '光环里的怪减速一半，光波从光环边上再放一圈', a: 'mirror', b: 'bell', color: '#b58cff' },
  // 双修（剑 + 符、镇 + 火、木 + 铃）
  { id: 'fujian', name: '符剑合璧', icon: 'm_fujian', desc: '飞剑打中的怪被贴一张符，一秒多后炸开', a: 'flysword', b: 'talisman', color: '#ff5a4a', dual: true },
  { id: 'fenzhong', name: '焚天金钟', icon: 'm_fenzhong', desc: '护盾在身，外圈一圈火持续烧；盾碎时地上留下一圈火', a: 'shield', b: 'gourd', color: '#ff9a2e', dual: true },
  { id: 'linghua', name: '铃落桃花', icon: 'm_linghua', desc: '铃声一响，空中的花瓣追着怪落下，落点也更大', a: 'petals', b: 'bell', color: '#ff7eb6', dual: true },
  { id: 'huobing', name: '火兵', icon: 'm_huobing', desc: '纸兵着了火，贴着怪烧；倒下时留一摊火', a: 'zhibing', b: 'gourd', color: '#ff7a3a', dual: true },
  { id: 'mingbing', name: '鸣兵', icon: 'm_mingbing', desc: '纸兵腰上挂铃，倒下时铃声震开一圈怪', a: 'zhibing', b: 'bell', color: '#7fc0ff', dual: true },
  // 水府 + 雷（水·镇 + 木·符）：天雷先劈泉里的怪，电顺着泉水传给整眼泉
  { id: 'leiyu', name: '雷雨', icon: 'm_leiyu', desc: '天雷先劈泉里的怪，电顺着泉水传遍整眼泉', a: 'spring', b: 'thunder', color: '#4aa8ff', dual: true },
  // 2.0 第一批的搭配（DESIGN.md 3.3）。前五个人人能合，后五个只有对应角色的宝箱里有
  { id: 'leijie', name: '雷劫锁魂', icon: 'm_leijie', desc: '被锁拉到一处的怪，立刻挨一道落雷', a: 'chain', b: 'thunder', color: '#8fa8ff', dual: true },
  { id: 'hejin', name: '鹤翼金身', icon: 'm_hejin', desc: '护盾在时纸鹤替你啄近处的怪，盾碎时纸鹤俯冲一圈', a: 'crane', b: 'shield', color: '#ffd24a', dual: true },
  { id: 'qiankun', name: '乾坤护阵', icon: 'm_qiankun', desc: '护盾破时放出一圈光波，光波挡下飞来的弹幕', a: 'mirror', b: 'shield', color: '#b58cff' },
  { id: 'qianjian', name: '钱剑连城', icon: 'm_qianjian', desc: '飞剑飞出时带着铜钱串，穿过的怪被铜钱多打一下', a: 'coins', b: 'flysword', color: '#ffc83a' },
  { id: 'heling', name: '引魂鹤铃', icon: 'm_heling', desc: '铃声一响，纸鹤飞去啄铃里最近的怪', a: 'crane', b: 'bell', color: '#6fd0e8', dual: true },
  { id: 'yiwei', name: '一苇渡江', icon: 'm_yiwei', desc: '飞剑飞过的路上留下水痕，水痕里的怪慢三成', a: 'flysword', b: 'pole', color: '#4ad0c8', dual: true, only: 'jianxia' },
  { id: 'chenzhong', name: '晨钟暮鼓', icon: 'm_chenzhong', desc: '你站在阵旗围出的方阵里时，铃的光环多响一遍', a: 'bell', b: 'flag', color: '#e0a860', dual: true, only: 'pang' },
  { id: 'huadeng', name: '花灯会', icon: 'm_huadeng', desc: '你站在灯光里时，花瓣追着灯边的怪落下，回血更多', a: 'petals', b: 'lamp', color: '#ff9ec8', dual: true, only: 'caiyao' },
  { id: 'dudeng', name: '渡魂灯', icon: 'm_dudeng', desc: '水痕上亮起灯，灯照着的怪慢三成并持续受伤', a: 'pole', b: 'lamp', color: '#ffb64a', dual: true, only: 'baidu' },
  { id: 'liangyi', name: '两仪阵', icon: 'm_liangyi', desc: '方阵里的怪被镜光推向旗线，在旗线上挨打', a: 'flag', b: 'mirror', color: '#9aa0b8', only: 'yinyang' },
  // 2.0 第二批的搭配：五个角色专属
  { id: 'yinlv', name: '阴律斩', icon: 'm_yinlv', desc: '每次挥剑，判官笔对挥中最疼的那只补一笔', a: 'sword', b: 'brush', color: '#7a5aa0', dual: true, only: 'xiaodao' },
  { id: 'maibu', name: '买路符钱', icon: 'm_maibu', desc: '符贴在怪身上，怪死后爆成铜钱', a: 'talisman', b: 'dart', color: '#e8b830', dual: true, only: 'fushi' },
  { id: 'yinbing', name: '阴兵借道', icon: 'm_yinbing', desc: '纸兵倒下时变成一个冤魂', a: 'zhibing', b: 'banner', color: '#6a8aa8', dual: true, only: 'zhijiang' },
  { id: 'baozhu', name: '爆竹驱年', icon: 'm_baozhu', desc: '护盾破时连放一串爆竹，震开全屏', a: 'shield', b: 'cracker', color: '#e8503a', dual: true, only: 'gengfu' },
  { id: 'caiyuan', name: '财源滚滚', icon: 'm_caiyuan', desc: '算盘每结算一次，从怪身上弹出一枚铜钱镖', a: 'dart', b: 'abacus', color: '#c8a020', dual: true, only: 'huolang' },
  // DESIGN 3.3c：把被镇魂铃起手挤出线的烈火、符箓、镇守、阵法抬回来
  { id: 'fuhuo', name: '符火燎原', icon: 'm_fuhuo', desc: '每放一次符，最近的怪脚下烧起一摊火', a: 'talisman', b: 'gourd', color: '#ff6a3a', dual: true },
  // 镇魂铃一响就有的搭配：这几张图上带铃的路线明显占优，没带铃的流派把铃接进来才追得上（DESIGN 3.3c）
  { id: 'linfu', name: '铃符', icon: 'm_linfu', desc: '每响一次铃，光环里血最多的怪挨一道符', a: 'talisman', b: 'bell', color: '#e8b04a', dual: true },
  { id: 'lingyan', name: '铃焰', icon: 'm_lingyan', desc: '铃响三次，最近的怪脚下烧起一摊火', a: 'gourd', b: 'bell', color: '#ff8a4a', dual: true },
  { id: 'zhonggu', name: '钟鼓齐鸣', icon: 'm_zhonggu', desc: '你站在阵旗方阵里时，每响一次铃，光环里的怪挨打 +40%', a: 'flag', b: 'bell', color: '#d89a50', dual: true, only: 'zhijiang,yinyang' },
  // 给搭配少的剑侠、阴阳先生、胖师叔补的跨流派搭配，料用他们池里原来没人拿的件（DESIGN 3.3e）
  { id: 'jianzou', name: '剑走偏锋', icon: 'm_jianzou', desc: '每飞出一把剑，就朝最近的怪甩出一枚铜钱镖', a: 'flysword', b: 'dart', color: '#d8b04a', dual: true },
  { id: 'longshe', name: '笔走龙蛇', icon: 'm_longshe', desc: '每推一道浪，浪前血最多的那只挨判官笔一笔', a: 'tide', b: 'brush', color: '#4a8ad8', dual: true, only: 'jianxia,xiaodao' },
  { id: 'panzhen', name: '判阵', icon: 'm_panzhen', desc: '方阵里血最多的怪隔一会儿被判官笔点名：挨一笔，之后挨打更疼', a: 'flag', b: 'brush', color: '#8a5ad8', dual: true },
  { id: 'suohun', name: '锁魂幡', icon: 'm_suohun', desc: '被勾魂锁拉过的怪死了必定变成冤魂', a: 'chain', b: 'banner', color: '#5a6a9a', dual: true },
  { id: 'hanzhong', name: '寒钟', icon: 'm_hanzhong', desc: '铃一响，泉里的怪冻住一下', a: 'bell', b: 'spring', color: '#6ac8e8', dual: true },
];

/** 双修的数值（拍、单位）。强度参照现有合成：只给一点额外输出，不翻倍 */
export const DUAL_FX = {
  /** 符剑合璧：贴符后几拍炸、炸多大、伤害是符咒伤害的几成 */
  seal: { delay: 36, area: 84, mul: 0.5 },
  /** 焚天金钟：外圈半径（再乘范围加成）、内沿占比、几拍烧一下、伤害是葫芦伤害的几成；盾碎时留几摊火、火摊伤害占比 */
  // 0.4.7 配平：焚天金钟危险 2 比镇守最好的单修高 15 个百分点（口径 ≤ 8），外圈火和盾碎火圈都减一截
  ring: { radius: 110, inner: 0.55, every: 15, mul: 0.07, pools: 5, poolMul: 0.15, poolLife: 90, poolR: 40 },
  /** 铃落桃花：花瓣每拍朝最近的怪挪多远、多远内才追、落点多大 */
  petal: { speed: 6, reach: 180, bonusR: 4 },
  /** 火兵：贴身时每隔几拍在脚下点一小摊火、倒下留一摊，火的伤害是纸兵伤害的几成；鸣兵：倒下时震开多大、伤害几成、震多远 */
  paperFire: { every: 30, life: 60, r: 36, mul: 0.5, deathLife: 90, deathR: 48 },
  paperBell: { r: 120, mul: 1.2, knock: 34 },
  /** 雷雨：每一阵雷里前几道（每眼泉一道）先劈泉里的怪；劈在泉里时整眼泉的怪挨雷伤害的几成（只算从天上劈的那一下，连锁跳的不传） */
  rain: { mul: 0.3 },
} as const;

/**
 * 水府（10-30）。寒泉：玄冥寒潭干时炸开，伤害是泉伤害的 burstMul 倍；精英、首领在泉里挨 hardMul 倍
 * （危险 4 起精英成对来，水府没有单体硬伤害，本地小样本危险 4 比剑修低十几个点，补在这里）。
 * 龙王令：浪里的怪每拍被带着走浪速的几成（knock / carryDiv），按 1 - steady 打折（尸王、精英推不太动）
 */
export const WATER_FX = { burstMul: 1.5, hardMul: 2, carryDiv: 100 };

/** 纸兵进化（撒豆成兵）倒下时炸开：半径、伤害是纸兵伤害的几成；剪刀每级纸兵寿命 +20% */
export const PAPER_FX = { boomR: 80, boomMul: 1.5, jiandaoLife: 0.2 };

/**
 * 2.0 第一批法器的数值（拍、单位）。阵旗：阵里的怪每隔 freezeEvery 拍定住 freeze 拍（精英减半、首领不定），
 * 四象大阵的旗线是方阵边外一圈（band 宽），线上的怪挨 lineMul 倍；阵法 4 件套每 autoEvery 拍在脚下布一座小阵。
 * 勾魂锁：被拉到的怪非进化时多挨 hurtMul（只有带铁链才有，每级 +tielianHurt）持续 hurtTicks 拍。
 * 竹篙：线宽（半宽）、水痕半径和每隔多远留一个；水痕里的怪慢三成。长明灯：站在灯里每秒回血、小灯绕身半径和灯半径。
 * 搭配的数值写在 combo 里（伤害都是对应法器伤害的几成）
 */
export const ARM_FX = {
  flag: { freezeEvery: 90, freeze: 15, band: 18, lineMul: 1.5, qizhiTicks: 3, qizhiArea: 0.1, autoEvery: 300, autoHalf: 64, autoLife: 90, autoDmg: 7 },
  /** 阵法套件（SCHOOLS.array）：2 件被定住、捆住的怪多定几拍；3 件这样的怪挨打的倍数；4 件见 flag.auto* */
  set: { two: 9, three: 1.15 },
  chain: { hurtTicks: 60, evoHurt: 0.25, tielianHurt: 0.03, tielianKnock: 0.12, maxPull: 0.95, eliteMul: 0.5, reach: 420 },
  pole: { half: 30, trailR: 46, trailStep: 60, trailMax: 40, slow: 4, fan: 5 },
  lamp: { heal: 0.5, healEvo: 1, dengyouHeal: 0.2, dengyouDur: 0.1, orbit: 95, smallR: 40, smallMul: 0.7, evoPerLevel: 10 },
  combo: {
    leijie: { mul: 0.6, bolts: 3, r: 50 },
    hejin: { peckMul: 0.4, peckEvery: 45, peckReach: 130, diveMul: 1, diveR: 160 },
    qiankun: { mul: 0.8, r: 200, blockR: 320 },
    qianjian: { mul: 0.5, every: 6, r: 44 },
    heling: { mul: 1.2 },
    yiwei: { every: 4, r: 34, life: 75 },
    chenzhong: { mul: 1 },
    huadeng: { every: 45, mul: 0.8, reach: 120, heal: 1 },
    dudeng: { every: 20, mul: 0.5 },
    liangyi: { every: 20, push: 14, band: 18, mul: 0.6 },
  },
} as const;

/**
 * 2.0 第二批法器的数值（拍、单位）。铜钱镖：每趟最多弹 hops 只（进化 +evoHops），飞钱雨一扇的张角、掠过时离怪多近算命中；
 * 算盘：每层加伤 perBead、封顶 cap 层，进化后精英多记 eliteBeads 层、结算留一半；
 * 招魂幡：怪死在幡里变冤魂的概率（进化翻倍；白幡每级 +baifan）、冤魂同屏上限和寿命；
 * 判官笔：三下之间隔几拍；生死簿勾销的血线、首领改挨的额外倍数；
 * 鞭炮：两响之间隔几拍，十响连环第二轮晚几拍。
 * 套件：school.ghost / school.wealth 是幽冥、聚财 2/3/4 件的数；搭配的数值在 combo 里
 */
export const ARM_FX2 = {
  dart: { hops: 2, evoHops: 2, spread: 7, hit: 26, back: 2, qiandaiGold: 0.04, qiandaiCoin: 0.15 },
  abacus: { perBead: 0.45, cap: 12, eliteBeads: 3, keep: 0.5 },
  banner: { chance: 0.3, evoChance: 0.55, baifan: 0.05, baifanMagnet: 0.1, cap: 10, life: 180, hit: 22, aoe: 80, reach: 110, evoReturn: 1 },
  brush: { gap: 8, execute: 0.12, bossBonus: 0.2, zhubiCrit: 0.15, zhubiElite: 0.04 },
  cracker: { gap: 2, round2: 20, liuhuangFire: 0.08, liuhuangDur: 0.1, scare: 0.5 },
  school: {
    ghost: { two: 0.08, three: 0.3, capPlus: 4, chaiEvery: 15, chaiMul: 3, chaiLife: 60, chaiR: 54 },
    wealth: { two: 0.25, per: 100, three: 0.01, threeMax: 0.12, rainEvery: 600, rainMul: 2.5, rainR: 190, stall: 1 },
  },
  combo: {
    yinlv: { mul: 0.8 },
    maibu: { every: 60, reach: 320, coins: 6, mul: 0.8, r: 70 },
    yinbing: { mul: 1 },
    baozhu: { crackers: 12, mul: 0.8, knock: 60 },
    caiyuan: { darts: 1, mul: 1 },
  },
} as const;

/**
 * 规则 55 的新增数值（拍、单位）。
 * 招魂幡自己招魂：幡立着时每隔 every 拍在幡下招一个冤魂（带镇魂铃时隔 bellEvery 拍，镇魂铃起手那条本来就强，不再加）。
 * 搭配：符火燎原（火摊伤害是葫芦的 mul 倍、留 life 拍、半径 r、找最近的怪的范围 reach）、铃符、铃焰、钟鼓齐鸣，数值见各条
 */
export const COMBO55 = {
  banner: { every: 100, bellEvery: 300 },
  fuhuo: { mul: 1.2, life: 90, r: 56, reach: 420 },
  /** 铃符：每响一次铃一道符，伤害是符咒的 mul 倍；铃焰：每 rings 响放一摊火 */
  linfu: { mul: 1 },
  lingyan: { rings: 3, mul: 1.2, life: 90, r: 56 },
  /** 钟鼓齐鸣：站在方阵里时铃光环里的怪易伤的倍数、每次续的拍数 */
  zhonggu: { mul: 1.4, ticks: 20 },
} as const;

/** 规则 62 的五个搭配（core/arms/fourth.ts） */
export const COMBO62 = {
  /** 剑走偏锋：每飞出一把剑甩一枚铜钱镖，伤害是铜钱镖的 mul 倍，找 reach 以内最近的怪 */
  jianzou: { mul: 0.6, reach: 360 },
  /** 笔走龙蛇：每推一道浪，reach 以内血最多的那只挨判官笔 mul 倍 */
  longshe: { mul: 1.5, reach: 420 },
  /** 判阵：每 every 拍点名方阵里血最多的一只，挨判官笔 mul 倍并易伤 vuln 倍 ticks 拍 */
  panzhen: { every: 45, mul: 1.2, vuln: 1.3, ticks: 60 },
  /** 锁魂幡：被锁拉过的怪死了一定变冤魂（只看有没有拉过，不另设数） */
  suohun: {},
  /** 寒钟：铃响时泉里的怪定住 ticks 拍（精英减半、首领不定） */
  hanzhong: { ticks: 10 },
} as const;

/** 幽冥、聚财套件的说明（2 / 3 / 4 件），阵法的在 SCHOOL_SETS.array */
export const SCHOOL_SETS = {
  array: ['被定住、捆住的怪多定 0.3 秒', '被定住、捆住的怪挨打 +30%', '每 10 秒脚下自动布一座小阵'],
  ghost: ['怪死时变冤魂的概率 +10%', '冤魂伤害 +40%，同屏上限 +4', '每打倒 15 只怪，召出一位鬼差'],
  wealth: ['铜钱掉落 +25%', '每 100 枚局内铜钱伤害 +1%（最多 +12%）', '每 20 秒撒一圈铜钱雨，夜市多开一件货'],
} as const;

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];
