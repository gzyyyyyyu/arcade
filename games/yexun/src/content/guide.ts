/**
 * 玩法说明用的内容（所有者 10-20：参照掼蛋规则说明、麻将规则小册）。名字、配方、数值都从别的表现取，这里只放说明独有的东西：
 * 流派单子（和机器人 tools/bots.ts BUILDS 同一份，tests/view/guide.test.ts 锁住两边一致）、每件法器干什么活、每个流派一句心得。
 * 以后加法器、流派（纸人）、地图（荒庙）时，说明会自己跟上；漏登记的由测试拦下。
 */
import type { PassiveId, WeaponId } from './weapons.ts';

/** 法器干的活：清群（成片小怪）、单体（精英和 Boss）、保命（不让你被围死） */
export type Role = 'crowd' | 'single' | 'guard';
export const ROLE_NAME: Record<Role, string> = { crowd: '清群', single: '单体', guard: '保命' };
export const ROLE_TIP: Record<Role, string> = {
  crowd: '对付成片的小怪，前期最要紧',
  single: '对付精英和尸王，后半夜靠它',
  guard: '减速、推开、挡伤、回血，不让你被围死',
};

export const WEAPON_ROLE: Record<WeaponId, Role> = {
  sword: 'crowd',
  talisman: 'crowd',
  coins: 'guard',
  flysword: 'single',
  thunder: 'single',
  bell: 'guard',
  mirror: 'guard',
  gourd: 'crowd',
  rope: 'guard',
  petals: 'crowd',
  shield: 'guard',
  crane: 'single',
  zhibing: 'guard',
  spring: 'crowd',
  tide: 'guard',
  flag: 'crowd',
  chain: 'crowd',
  pole: 'single',
  lamp: 'guard',
  dart: 'crowd',
  abacus: 'single',
  banner: 'crowd',
  brush: 'single',
  cracker: 'crowd',
};

export type SchoolId = 'sword' | 'talisman' | 'ward' | 'wood' | 'fire' | 'paper' | 'water' | 'array' | 'ghost' | 'wealth';

export interface School {
  id: SchoolId;
  name: string;
  /** 一句话打法（流派页用，十几个字） */
  brief: string;
  /** 想要的法器（按先后，第一件是起手） */
  weapons: readonly WeaponId[];
  /** 想要的被动（进化要的排前面） */
  passives: readonly PassiveId[];
  /** 一句心得：长处、短处、怎么补 */
  tip: string;
}

export const SCHOOL_IDS: readonly SchoolId[] = ['sword', 'talisman', 'ward', 'wood', 'fire', 'paper', 'water', 'array', 'ghost', 'wealth'];

export const SCHOOLS: Record<SchoolId, School> = {
  sword: {
    id: 'sword',
    name: '剑修',
    brief: '近身砍杀，飞剑补远处',
    weapons: ['sword', 'flysword', 'coins', 'thunder', 'bell'],
    passives: ['zhusha', 'caoxie', 'lingpai', 'xianglu', 'nianzhu', 'xiantao'],
    tip: '刀剑砍不动石狮、跳尸将军、白狐：后期补雷符劈它们（还和桃木剑凑木 2 件）；尸王、跳尸怕镇魂铃',
  },
  talisman: {
    id: 'talisman',
    name: '符箓',
    brief: '符多就是一切，放符连成片',
    weapons: ['talisman', 'thunder', 'crane', 'sword', 'flysword'],
    passives: ['xianglu', 'nianzhu', 'xiantao', 'yinhun', 'zhusha', 'lingpai'],
    tip: '符多就是一切：冷却和范围先拿满，符 3 件每次多飞一张；配火葫芦合成符火燎原，放符就留火；配镇魂铃成铃符，铃响一次劈一道符',
  },
  ward: {
    id: 'ward',
    name: '镇守',
    brief: '站得住死得少，慢慢磨',
    weapons: ['bell', 'mirror', 'shield', 'rope', 'sword'],
    passives: ['xiantao', 'daopao', 'huangli', 'modou', 'nianzhu', 'zhusha'],
    tip: '站得住、死得少，但杀得慢：中期要补一件打得疼的',
  },
  wood: {
    id: 'wood',
    name: '五雷',
    brief: '雷、剑、花一起放，满屏开花',
    weapons: ['thunder', 'sword', 'petals', 'talisman', 'gourd', 'shield', 'mirror'],
    passives: ['nianzhu', 'zhusha', 'xiantao', 'lingzhi', 'xianglu', 'luopan'],
    tip: '木 3 件相生到火：雷、剑、花一起放，满屏开花',
  },
  fire: {
    id: 'fire',
    name: '烈火',
    brief: '放火烧一片，怕火的怪全倒',
    weapons: ['talisman', 'gourd', 'thunder', 'sword', 'petals', 'cracker', 'lamp'],
    passives: ['xianglu', 'luopan', 'xiantao', 'zhusha', 'nianzhu', 'lingpai', 'liuhuang', 'dengyou'],
    tip: '纸扎和僵尸都怕火；符咒配火葫芦合成符火燎原，放一张符就在怪脚下烧一摊火；后期补鞭炮吓退近身的怪、长明灯站着回血；提灯鬼不怕火，半夜见它要换着打',
  },
  paper: {
    id: 'paper',
    name: '纸兵',
    brief: '纸兵顶在前面替你挨打',
    weapons: ['zhibing', 'gourd', 'bell', 'petals', 'talisman', 'shield', 'mirror'],
    passives: ['jiandao', 'modou', 'xiantao', 'zhusha', 'nianzhu', 'lingpai'],
    tip: '纸兵顶在前面替你挨打；配葫芦成火兵、配铃成鸣兵，后半夜靠撒豆成兵炸开',
  },
  water: {
    id: 'water',
    name: '水府',
    brief: '拖慢一片，浪推开近身的怪',
    weapons: ['spring', 'tide', 'crane', 'thunder', 'mirror', 'pole'],
    passives: ['modou', 'xianglu', 'daopao', 'nianzhu', 'xiantao', 'zhusha', 'caoxie'],
    tip: '寒泉冒在怪堆里拖慢一片，龙王令的浪把近身的推开，竹篙戳一道挑着怪走；水 3 件相生到木，带雷符成雷雨',
  },
  array: {
    id: 'array',
    name: '阵法',
    brief: '先布阵再收网，定住再打',
    weapons: ['flag', 'mirror', 'rope', 'chain', 'shield'],
    passives: ['qizhi', 'tielian', 'modou', 'xiantao', 'daopao', 'nianzhu'],
    tip: '先布阵再收网：阵旗定住、缚妖索捆住、勾魂锁拉成一堆；2 件多定 0.3 秒，3 件定住的怪挨打 +30%，4 件每 10 秒脚下自动布一座小阵；阴阳先生、纸匠配镇魂铃成钟鼓齐鸣，站在阵里铃一响，光环里的怪挨打 +40%',
  },
  ghost: {
    id: 'ghost',
    name: '幽冥',
    brief: '冤魂追着撞，笔点血最多的',
    weapons: ['banner', 'brush', 'chain', 'crane', 'bell'],
    passives: ['baifan', 'zhubi', 'tielian', 'xiantao', 'zhusha', 'xianglu'],
    tip: '招魂幡边上死的怪变冤魂追着撞，判官笔专点血最多的；2 件冤魂更常出，3 件冤魂更疼更多，4 件每打倒 15 只召一位鬼差',
  },
  wealth: {
    id: 'wealth',
    name: '聚财',
    brief: '铜钱越多越疼，撒钱雨',
    weapons: ['dart', 'abacus', 'coins', 'flysword', 'shield'],
    passives: ['qiandai', 'huangli', 'lingpai', 'xiantao', 'daopao', 'zhusha'],
    tip: '铜钱镖在怪之间来回弹、算盘记账再一把结清；铜钱越多越疼，2 件多掉铜钱，4 件撒铜钱雨、夜市多开一摊',
  },
};

/** 例子页展开写的流派（第一个写完整路线，后两个各一段） */
export const GUIDE_EXAMPLES: readonly SchoolId[] = ['sword', 'talisman', 'ward'];
