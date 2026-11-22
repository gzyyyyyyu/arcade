/**
 * 2.0 的首领和特色怪的数值（DESIGN.md 3.5）。行为在 `src/core/foes/`，血量、速度在 enemies.ts。
 * 时间以拍计（每秒 30 拍），距离以单位计（主角半径 14，每拍走 3）。
 * 起步值按画皮、纸扎老爷同档；配平结果见 DESIGN.md 8.1。
 */
import type { EnemyKind } from './enemies.ts';

/** 中期首领：这几种怪走"中期首领"的规矩（血按危险档不随时间涨、连战里按 lordHp、倒下掉宝箱进收获期） */
export const MID_BOSS_KINDS: readonly EnemyKind[] = ['lord', 'huapi', 'zhumu', 'shuihou', 'binghun', 'wumian'];

/** 摆设怪：不伤人、不掉东西、武器不瞄它；到点自己散掉。主角走不过去（core/foes 每拍把人推出圈外） */
export const PROP_KINDS: readonly EnemyKind[] = ['ricepile', 'coffin'];

/**
 * 千年竹母（竹林 8:00）。eT 倒数到下一个技能；eV 数放了几个技能；eS 0 平时。
 * 一段轮流：竹笋、召竹精；血少一半后三样轮流：竹笋、竹浪、召竹精，更勤。
 * 竹笋：从竹母朝主角方向排成一行 shoots 个，相隔 gap，一个接一个先冒圈（warn 拍）再刺出（stagger 拍错开）。
 * 竹浪：四个方向（西→东、北→南、东→西、南→北）轮流，一道横贯的竹墙从主角 reach 外扫过来，墙上留一个宽 gapW 的空隙，
 * 空隙落在放技能时主角站的位置附近（±jitter），预警 warn 拍里墙停着让人看清空隙在哪。
 */
export const ZHUMU = {
  every: [175, 135],
  phaseAt: 0.5,
  shoots: 7,
  gap: 58,
  stagger: 5,
  warn: 36,
  shootR: 40,
  shootDmg: 7,
  spirits: 3,
  spiritRing: 100,
  /** 场上竹精（含竹王种的）超过这个数就不再召 */
  maxSprouts: 16,
  waveWarn: 42,
  waveSpeed: 7,
  waveThick: 36,
  waveGapW: 200,
  waveJitter: 90,
  waveReach: 520,
  waveDmg: 11,
};

/**
 * 水猴王（河滩 8:00）。eS 0 水面 1 潜水 3 拖人；eT 倒数；eV 数放了几个技能；eAX/eAY 是潜水后冒出来的落点。
 * 一段轮流：潜水扑、水鞭；血少一半后：潜水扑、拖人、水鞭，更勤。
 * 潜水：dive 拍里不见了（打不到、碰不到），最后 warn 拍在主角当时站的位置画圈，到点从那里冒出来扑一下。
 * 水鞭：朝主角扇形甩 whips 条，打中减速（sState 4 的弹，slowTicks 拍）。
 * 拖人：dragTicks 拍里，主角在 dragRange 内每拍被往水猴王身边拖 pull；走出 dragRange 就断。
 */
export const SHUIHOU = {
  every: [190, 150],
  phaseAt: 0.5,
  dive: 100,
  warn: 28,
  pounceR: 80,
  pounceDmg: 12,
  whips: 3,
  whipSpread: 9,
  whipSpeed: 3.2,
  whipDmg: 6,
  whipLife: 150,
  whipR: 11,
  slowTicks: 30,
  dragTicks: 110,
  dragRange: 380,
  pull: 0.6,
};

/**
 * 冰魄娘娘（冰湖 8:00）。eT 倒数到下一个技能，eV 数放了几个技能，eAX 倒数到下一次冰面裂开。
 * 一段轮流：冰风、冰刺圈；血少一半后加冰面裂开（每 crack.every 拍一次，持续 dur 拍）。
 * 冰风：warn 拍预告一条朝主角的长条（长 len、半宽 half），吹到的人挨 dmg、往前推 push，接着 slick 拍里到处都是冰面（滑）。
 * 冰刺：在自己身周一圈 spikes 个落点，先冒圈 warn 拍再刺；二段外面再来一圈。
 * 裂开：主角身边落 floes 块浮冰（floeW × floeH），裂开的 dur 拍里只有浮冰上能站稳，水里走路乘 offSlow（不会死，只是慢）。
 */
export const BINGHUN = {
  every: [150, 120],
  phaseAt: 0.5,
  windWarn: 20,
  windLen: 440,
  windHalf: 90,
  windDmg: 10,
  windPush: 40,
  slick: 150,
  spikes: 10,
  spikeRing: 170,
  spikeR: 38,
  spikeDmg: 14,
  spikeWarn: 30,
  ring2: 270,
  ring2Spikes: 14,
  crack: { every: 900, dur: 360, warn: 40, floes: 3, floeW: 280, floeH: 210, offSlow: 0.7 },
};

/**
 * 无面佛（荒庙 8:00）。一段端坐不动（只在放技能后慢慢蹭 creep 倍速度），周围四尊小佛（离它 statue 远的四角）轮流放金光圈；
 * 每放 rings 次光圈接一次冲撞：蓄力 windup 拍，认准主角的方向冲 dash 拍，冲到挡路的块（庙柱、墙）上就眩晕 stun 拍（给输出窗口，挨打 ×stunHit），
 * 没撞到就歇 rest 拍。血少一半后香炉全灭：香火区外主角挨的伤害 ×darkMul；光圈两尊同放，冲撞更勤。
 */
export const WUMIAN = {
  every: [140, 105],
  phaseAt: 0.5,
  statue: 230,
  ringWarn: 38,
  ringR: 78,
  ringDmg: 10,
  rings: [2, 1],
  windup: 26,
  dash: 34,
  dashSpeed: 7.5,
  rest: 70,
  stun: 90,
  stunHit: 1.25,
  creep: 0.5,
  darkMul: 1.5,
};

/** 雪童子：白毛风里隐着（慢慢靠，速度乘 creep），进了 reveal 就蓄力 windup 拍冲 dash 拍；被火打中现形 flash 拍；风停了照常追 */
export const XUETONG = { creep: 0.6, reveal: 180, windup: 10, dash: 14, dashSpeed: 6, rest: 70, flash: 90 };
/** 棺钉鬼：躺着不动，主角走到 wake 以内弹开棺盖坐起，之后每 every 拍朝主角钉 nails 枚（并排相隔 spread 格方向）；倒了留一副空棺 coffinLife 拍 */
export const GUANDING = { wake: 220, open: 18, every: 180, nails: 2, spread: 5, speed: 3.4, dmg: 4, life: 120, r: 8, coffinLife: 120 };
/** 鼠妖：成群出，一次 pack 只 */
export const RAT = { pack: 3 };

/**
 * 戏楼镇：戏台正中。戏台每 every 拍开一场（第一场 first 拍），锣鼓点 beats 响，戏班鬼影 troupe 个从台前冒出来；
 * 主角离戏台 near 以外不开（看不见的戏白开一场只是多刷怪）。
 */
export const STAGE = { first: 24 * 30, every: 24 * 30, troupe: 11, near: 1100, ring: 130, beats: 4 };

/**
 * 红衣戏子（戏楼镇守门）。eT 倒数，eV 数放了几个技能；一段轮流：水袖、（每第三个）换脸；血少一半后水袖更勤、每个都换脸。
 * 水袖：蓄力 warn 拍（圈 sleeveR 画在原地），一圈挨 dmg。换脸：自己闪到主角另一侧，留一个假身（hongyiclone，一碰就破，
 * 头顶没有红丝），真身头顶有一缕红丝。
 */
export const HONGYI = { every: [70, 48], phaseAt: 0.5, warn: 24, sleeveR: 200, sleeveDmg: 55, cloneOffset: 170, clones: 1, cloneHp: 40, cloneLife: 360 };
/**
 * 硕鼠将军（粮仓镇守门）。eS 0 地面 1 钻地；eT 倒数；一段轮流：钻地、吐米；血少一半后每次钻地冒出来还带一窝鼠妖。
 * 钻地：burrow 拍里不见了（打不到、碰不到），最后 warn 拍在主角附近（dist）画圈，到点从那里冒出来扑一下。
 * 吐米：朝主角的方向 piles 堆米山，挡在两人之间，米山 life 拍后散。
 */
export const SHUOSHU = { every: [150, 115], phaseAt: 0.5, burrow: 80, warn: 26, dist: 220, popR: 80, popDmg: 24, piles: 3, pileGap: 72, pileFront: 150, pileLife: 540, pileHp: 240, rats: 4 };

/**
 * 纸弩手（规则 55，河滩、荒庙）：克制站桩近身控场的镇守流派。离主角近于 near 就往后退（速度乘 back），远于 far 才靠过来，中间站住，
 * 每 every 拍朝主角射一支直飞的弩箭；near 比镇守法器的作用半径大，站着不动它就一直在圈外放箭，得追上去打（追的时候它还在退）。
 */
export const CROSSBOW = { near: 330, far: 430, back: 1.15, every: 105, speed: 4.2, dmg: 5, life: 150, r: 8, reach: 560 };
/**
 * 催命鬼（规则 55，河滩、荒庙）：主角停在原地（离上次记下的位置不到 still）满 wait 拍，就进入催命：速度乘 rush；一动（离开 still 以外）就恢复。
 * eAX / eAY 记主角的参考位置，eV 数停了几拍，eS 1 = 催命中（画面读来变红）。
 */
export const HURRIER = { still: 36, wait: 60, rush: 2.6 };
