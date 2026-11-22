/** 对局横幅里按怪种类查的固定文案：精英出场、首领出场、首领进下一段。其余横幅带现场数字，留在 GameScene 的事件处理里。 */
import type { EnemyKind } from '../../content/enemies.ts';

/** 精英出场横幅的一句怎么打（标题是怪名） */
export const ELITE_TIP: Partial<Record<EnemyKind, string>> = {
  shishi: '刀剑砍不动，用符和铃',
  general: '会召小跳尸，打倒掉宝箱',
  whitefox: '连冲三下，看准了躲',
  palanquin: '打碎会放出一群纸人',
  bambooking: '隔一阵在你四周种出竹精，看地上的绿圈',
  hebo: '涨潮放出一圈水弹，还会放溺鬼',
  frostsoul: '蓄力后震出寒霜圈，躲出圈外',
  marketboss: '朝你撒一扇铜钱，往两边躲',
};
/** 首领出场横幅的一句怎么打，标题是「怪名来了」（画皮混迹时不报，现形才盖章） */
export const BOSS_TIP: Partial<Record<EnemyKind, string>> = {
  boss: '天亮前打倒它，天就提前亮',
  lord: '撒纸钱、召纸轿，打倒掉宝箱',
  zhumu: '笋刺先冒红圈，血少了竹浪扫来，躲进空隙',
  shuihou: '它潜水会从脚边冒出来，看红圈',
  binghun: '冰风吹过路更滑，躲开冰刺圈',
  wumian: '躲金光圈，它撞上柱子眩晕时输出',
};
/** Boss 进下一段的横幅（按种类、段号） */
export const PHASE_BANNER: Partial<Record<string, [string, string][]>> = {
  boss: [['', ''], ['尸王发怒', '会吐尸气了'], ['尸王发狂', '跳砸更大，尸气两圈']],
  lord: [['', ''], ['老爷翻脸', '纸钱两圈，会召纸轿']],
  zhumu: [['', ''], ['竹母发怒', '竹浪四面扫来，躲进空隙']],
  shuihou: [['', ''], ['水猴王发怒', '会把你往河里拖，走出河岸就断']],
  binghun: [['', ''], ['冰魄发怒', '冰面要裂开了，找浮冰站稳']],
  wumian: [['', ''], ['无面佛发怒', '冲撞更勤，金光圈两尊同放']],
};
