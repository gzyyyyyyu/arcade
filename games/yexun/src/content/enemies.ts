import type { Element, WeaponType } from './weapons.ts';
import { RAID_ENEMIES } from './explore.ts';

/**
 * 怪物（DESIGN.md 3.4）。速度按每拍单位（主角 3.0），血量是第 0 分钟、"普通"难度的值，随时间和难度放大（waves.ts）。
 */

export type EnemyKind =
  | 'paper' | 'wisp' | 'jiangshi' | 'lantern' | 'fox' | 'shishi' | 'general' | 'boss'
  | 'horse' | 'water' | 'bone' | 'bat' | 'scarecrow' | 'weasel' | 'snow' | 'whitefox' | 'palanquin' | 'lord'
  | 'patrol'
  | 'beast'
  | 'goblin'
  // 各地区的特色怪（regions.ts 决定谁在哪出）
  | 'bamsprout' | 'snakespirit' | 'bambooking'
  | 'drown' | 'crab' | 'hebo'
  | 'icegolem' | 'icicle' | 'frostsoul'
  | 'nightwatch' | 'stonemonk'
  // 荒庙：庙祝鬼（远远撒香灰）
  | 'templeghost'
  // 守夜危险 3 起的常规怪：提灯鬼（不怕火）
  | 'lampghost'
  // 鬼市：皮影鬼（一闪一闪往前蹦）、鬼贩（你追它就退，远远丢钱袋）、鬼市主（精英）
  | 'puppet' | 'peddler' | 'marketboss'
  // 画皮（竹林、河滩、鬼市的中期首领）和它甩出的人皮分身
  | 'huapi' | 'huapiskin'
  // 2.0：四个中期首领（竹母、水猴王、冰魄娘娘、无面佛）；雪原的雪童子、义庄的棺钉鬼（和它留下的空棺）；
  // 夜探戏楼镇的戏班鬼影、红衣戏子（和换脸的假身）、粮仓镇的鼠妖、硕鼠将军（和吐出的米山）
  | 'zhumu' | 'shuihou' | 'binghun' | 'wumian'
  | 'xuetong' | 'guandingui' | 'coffin'
  | 'ratdemon' | 'troupe' | 'hongyi' | 'hongyiclone' | 'shuoshu' | 'ricepile'
  // 规则 55：克制站桩近身控场（镇守流派）的两种怪——放风筝的纸弩手、盯着不动的人就加速的催命鬼；只在河滩、荒庙刷
  | 'crossbow' | 'hurrier'
  // 乱葬岗：掘墓鬼（脚边土里钻出来，怕火）；夜探窑镇：陶俑（烧过的泥胎，扛刀剑，怕水）
  | 'juemu' | 'taoyong';

export interface EnemyDef {
  kind: EnemyKind;
  /** 数组里的编号（核心用整数存种类） */
  code: number;
  hp: number;
  speed: number;
  /** 碰到主角掉多少血 */
  dmg: number;
  /** 碰撞半径 */
  r: number;
  /** 掉多少魂（经验） */
  xp: number;
  /** 抗击退（0 = 照单全收，1 = 推不动） */
  steady: number;
  /** 精英：掉宝箱 */
  elite?: boolean;
  /** Boss：血不随时间涨、顶上有血条、捆不住、不会被挪走或挤掉 */
  boss?: boolean;
  /**
   * 克制：按法器的类型或五行乘伤害（< 1 扛打，> 1 怕）。同一件法器类型和五行都对上就连乘。
   * 主线 #154：剑阵偏强，靠"有些怪顶得住刀剑"来克，不直接砍剑；纸扎的怪和僵尸（跳尸、尸王）怕火；僵尸怕镇尸铃（镇类），给火和镇守各一个主场。
   */
  vs?: Partial<Record<WeaponType | Element, number>>;
}

export const ENEMIES: readonly EnemyDef[] = [
  { kind: 'paper', code: 0, hp: 5, speed: 1.7, dmg: 5, r: 13, xp: 1, steady: 0, vs: { 火: 1.5 } },
  { kind: 'wisp', code: 1, hp: 4, speed: 2.5, dmg: 4, r: 11, xp: 1, steady: 0 },
  { kind: 'jiangshi', code: 2, hp: 18, speed: 1.45, dmg: 9, r: 17, xp: 2, steady: 0.3, vs: { 剑: 0.65, 火: 1.2, 镇: 1.35, 木: 1.3, 符: 1.2 } },
  { kind: 'lantern', code: 3, hp: 14, speed: 1.2, dmg: 6, r: 15, xp: 2, steady: 0.1, vs: { 剑: 0.6, 水: 1.5, 镇: 1.3 } },
  { kind: 'fox', code: 4, hp: 12, speed: 1.9, dmg: 8, r: 14, xp: 2, steady: 0.1, vs: { 木: 0.9, 镇: 1.15 } },
  { kind: 'shishi', code: 5, hp: 270, speed: 1.15, dmg: 15, r: 30, xp: 20, steady: 0.9, elite: true, vs: { 剑: 0.5, 符: 1.2 } },
  { kind: 'general', code: 6, hp: 520, speed: 1.3, dmg: 16, r: 30, xp: 30, steady: 0.85, elite: true, vs: { 剑: 0.6, 火: 1.1, 镇: 1.3, 符: 1.2 } },
  { kind: 'boss', code: 7, hp: 20000, speed: 1.55, dmg: 19, r: 44, xp: 0, steady: 0.97, boss: true, vs: { 剑: 0.8, 火: 1.2, 镇: 1.65, 木: 0.85 } },
  // 第 4 步：编号接着往后排（存档、录像里存的是编号，已有的不挪）
  { kind: 'horse', code: 8, hp: 10, speed: 4, dmg: 7, r: 16, xp: 2, steady: 0.2, vs: { 火: 1.5, 镇: 1.15, 木: 0.8 } },
  { kind: 'water', code: 9, hp: 22, speed: 0.9, dmg: 6, r: 15, xp: 2, steady: 0.5, vs: { 土: 1.5, 镇: 1.3, 火: 0.7 } },
  { kind: 'bone', code: 10, hp: 16, speed: 1.6, dmg: 7, r: 14, xp: 1, steady: 0.2, vs: { 剑: 0.7, 镇: 1.4 } },
  { kind: 'bat', code: 11, hp: 6, speed: 2.7, dmg: 4, r: 10, xp: 1, steady: 0 },
  { kind: 'scarecrow', code: 12, hp: 55, speed: 1.1, dmg: 10, r: 18, xp: 4, steady: 0.8, vs: { 剑: 0.6, 火: 1.25 } },
  { kind: 'weasel', code: 13, hp: 14, speed: 2.4, dmg: 3, r: 13, xp: 2, steady: 0.1 },
  { kind: 'snow', code: 14, hp: 16, speed: 1.3, dmg: 5, r: 14, xp: 2, steady: 0.2, vs: { 剑: 0.5, 火: 1.2, 镇: 1.3 } },
  { kind: 'whitefox', code: 15, hp: 400, speed: 1.7, dmg: 9, r: 26, xp: 25, steady: 0.85, elite: true, vs: { 剑: 0.6, 镇: 1.15, 符: 1.4, 火: 0.8, 木: 1.25, 水: 1.2 } },
  { kind: 'palanquin', code: 16, hp: 760, speed: 1, dmg: 14, r: 36, xp: 30, steady: 0.9, elite: true, vs: { 剑: 0.7, 火: 1.25, 符: 1.2 } },
  { kind: 'lord', code: 17, hp: 6000, speed: 1.15, dmg: 18, r: 40, xp: 60, steady: 0.96, boss: true, vs: { 火: 1.15 } },
  // 夜探的守卫（数值在 content/explore.ts，移动由 src/explore/guards.ts 算）
  { kind: 'patrol', code: 18, ...RAID_ENEMIES.patrol },
  { kind: 'beast', code: 19, ...RAID_ENEMIES.beast },
  { kind: 'goblin', code: 20, ...RAID_ENEMIES.goblin },
  // 各地区的特色怪（编号 21 起；数值按同一时间段的现有怪定，行为见下面的常量和 step.ts 的 mobAct）
  // 竹林：竹精（地里钻出来）、蛇精（藏着突然窜）、竹王（精英）
  { kind: 'bamsprout', code: 21, hp: 16, speed: 1.4, dmg: 8, r: 14, xp: 2, steady: 0.1, vs: { 火: 1.3, 木: 0.7 } },
  { kind: 'snakespirit', code: 22, hp: 12, speed: 1.5, dmg: 9, r: 13, xp: 2, steady: 0.1, vs: { 火: 1.25, 镇: 1.15 } },
  { kind: 'bambooking', code: 23, hp: 560, speed: 1.2, dmg: 15, r: 32, xp: 30, steady: 0.85, elite: true, vs: { 剑: 0.7, 火: 1.35, 符: 1.2, 木: 0.8 } },
  // 河滩（渡口也用溺鬼）：溺鬼（拖住人）、河蟹（横着走的硬壳）、河伯（精英）
  { kind: 'drown', code: 24, hp: 22, speed: 1.0, dmg: 6, r: 15, xp: 2, steady: 0.4, vs: { 土: 1.4, 镇: 1.2, 火: 0.8 } },
  { kind: 'crab', code: 25, hp: 28, speed: 1.5, dmg: 7, r: 15, xp: 3, steady: 0.5, vs: { 剑: 0.6, 符: 0.85, 火: 1.6, 镇: 1.15 } },
  { kind: 'hebo', code: 26, hp: 700, speed: 1.0, dmg: 14, r: 34, xp: 30, steady: 0.9, elite: true, vs: { 土: 1.3, 火: 0.8, 剑: 0.75, 符: 1.2 } },
  // 冰湖：冰傀（碎成两个）、冰凌（预告落点的冰刺）、冰魄（精英）
  { kind: 'icegolem', code: 27, hp: 30, speed: 1.0, dmg: 8, r: 17, xp: 3, steady: 0.5, vs: { 剑: 0.6, 火: 1.3, 镇: 1.4 } },
  { kind: 'icicle', code: 28, hp: 12, speed: 1.5, dmg: 4, r: 13, xp: 2, steady: 0.1, vs: { 火: 1.4, 剑: 0.7 } },
  { kind: 'frostsoul', code: 29, hp: 620, speed: 1.15, dmg: 14, r: 30, xp: 30, steady: 0.85, elite: true, vs: { 火: 1.3, 剑: 0.6, 符: 1.3 } },
  // 夜探：古镇的更夫鬼、山寺的石僧（渡口用溺鬼）
  { kind: 'nightwatch', code: 30, hp: 26, speed: 1.3, dmg: 7, r: 15, xp: 3, steady: 0.3, vs: { 火: 1.3, 镇: 1.3, 剑: 0.8 } },
  { kind: 'stonemonk', code: 31, hp: 60, speed: 0.9, dmg: 11, r: 19, xp: 4, steady: 0.8, vs: { 剑: 0.5, 火: 0.85, 水: 1.3, 镇: 0.6, 符: 1.25 } },
  // 守夜危险 3 起的常规怪（waves.ts LAMP 决定谁在几分钟出）：提灯鬼，近战直走，不怕火，给火流派一个对手；怕符怕铃。数值按同期的河蟹、冰傀
  { kind: 'lampghost', code: 32, hp: 32, speed: 1.35, dmg: 8, r: 15, xp: 3, steady: 0.2, vs: { 火: 0.5, 木: 1.2, 镇: 1.15 } },
  { kind: 'templeghost', code: 33, hp: 18, speed: 1.3, dmg: 5, r: 14, xp: 3, steady: 0.1, vs: { 火: 1.35, 水: 1.2, 剑: 0.85 } },
  // 鬼市：皮影鬼是驴皮刻的，怕火、怕符，刀剑砍上去像砍皮子（×0.8）；鬼贩躲着人，围着主角转的镇类不好够着它（×0.8），火和木克它
  { kind: 'puppet', code: 34, hp: 14, speed: 1.0, dmg: 7, r: 14, xp: 2, steady: 0.1, vs: { 火: 1.35, 符: 1.2, 剑: 0.8 } },
  { kind: 'peddler', code: 35, hp: 24, speed: 1.15, dmg: 5, r: 15, xp: 3, steady: 0.3, vs: { 木: 1.3, 火: 1.2, 镇: 0.8 } },
  // 鬼市主：扛刀剑和火（一身铜钱褂子），怕符怕铃，给符和镇守一个主场
  { kind: 'marketboss', code: 36, hp: 640, speed: 1.1, dmg: 14, r: 32, xp: 30, steady: 0.88, elite: true, vs: { 剑: 0.7, 火: 0.85, 符: 1.3, 镇: 1.2 } },
  // 画皮：混在怪群里的首领，速度和纸扎老爷一样；血和撞人比纸扎老爷少（多了分身和缠丝两手）。
  // 混迹时机器人和玩家都认不出它、不躲，原来快一档、撞 14 时竹林河滩鬼市危险 2 通关率比纸扎老爷低 4–10 个点（DESIGN 8.1）
  { kind: 'huapi', code: 37, hp: 5600, speed: 1.15, dmg: 10, r: 30, xp: 60, steady: 0.92, boss: true, vs: { 火: 1.1, 符: 1.15 } },
  // 人皮分身：一碰就破的皮，血量在 HUAPI.cloneHp（刷出来时覆盖）
  { kind: 'huapiskin', code: 38, hp: 80, speed: 1.9, dmg: 8, r: 14, xp: 1, steady: 0.1, vs: { 火: 1.4 } },
  // 2.0 的首领和特色怪（DESIGN.md 3.5）。中期首领血、撞人按画皮、纸扎老爷同档起步，行为在 core/foes/，数值在 content/foes.ts
  { kind: 'zhumu', code: 39, hp: 3800, speed: 0.9, dmg: 12, r: 36, xp: 60, steady: 0.95, boss: true, vs: { 火: 1.2, 木: 0.85 } },
  { kind: 'shuihou', code: 40, hp: 4500, speed: 1.2, dmg: 9, r: 30, xp: 60, steady: 0.95, boss: true, vs: { 土: 1.15, 符: 1.1 } },
  { kind: 'binghun', code: 41, hp: 6000, speed: 1.0, dmg: 12, r: 32, xp: 60, steady: 0.95, boss: true, vs: { 火: 1.3, 镇: 1.1 } },
  { kind: 'wumian', code: 42, hp: 4800, speed: 1.0, dmg: 10, r: 40, xp: 60, steady: 0.96, boss: true, vs: { 符: 1.15, 剑: 0.9 } },
  // 雪童子：白毛风里隐在雪中只露一对眼；怕火。棺钉鬼：坐起来远远钉三枚棺钉，倒了留一副挡路的空棺（棺材是不伤人的摆设怪）
  { kind: 'xuetong', code: 43, hp: 20, speed: 1.5, dmg: 7, r: 14, xp: 2, steady: 0.1, vs: { 火: 1.3, 剑: 0.8 } },
  { kind: 'guandingui', code: 44, hp: 18, speed: 0.55, dmg: 6, r: 15, xp: 3, steady: 0.3, vs: { 火: 1.2, 符: 1.2 } },
  { kind: 'ratdemon', code: 45, hp: 8, speed: 2.6, dmg: 6, r: 11, xp: 1, steady: 0, vs: { 火: 1.3, 镇: 1.2 } },
  { kind: 'troupe', code: 46, hp: 36, speed: 1.4, dmg: 13, r: 14, xp: 3, steady: 0.2, vs: { 火: 1.2, 符: 1.2 } },
  // 夜探的守门首领（行为在 core/foes/raid.ts，替石兽守最值钱的院子）
  { kind: 'hongyi', code: 47, hp: 10000, speed: 1.6, dmg: 24, r: 28, xp: 60, steady: 0.95, boss: true, vs: { 符: 1.2, 剑: 0.8 } },
  { kind: 'hongyiclone', code: 48, hp: 40, speed: 1.7, dmg: 8, r: 26, xp: 0, steady: 0.5 },
  { kind: 'shuoshu', code: 49, hp: 11000, speed: 1.4, dmg: 24, r: 36, xp: 60, steady: 0.96, boss: true, vs: { 火: 1.1, 镇: 1.15 } },
  { kind: 'ricepile', code: 50, hp: 260, speed: 0, dmg: 0, r: 34, xp: 0, steady: 1 },
  { kind: 'coffin', code: 51, hp: 300, speed: 0, dmg: 0, r: 34, xp: 0, steady: 1 },
  // 规则 55：纸弩手保持在镇守法器够不着的远处放箭，怕火、怕木（纸扎的），镇类够不着它（×0.8）；催命鬼脆，怕火怕符
  { kind: 'crossbow', code: 52, hp: 20, speed: 1.6, dmg: 5, r: 14, xp: 3, steady: 0.2, vs: { 火: 1.3, 木: 1.2, 镇: 0.8 } },
  { kind: 'hurrier', code: 53, hp: 22, speed: 1.2, dmg: 7, r: 14, xp: 3, steady: 0.1, vs: { 火: 1.25, 符: 1.2 } },
  // 掘墓鬼：照水鬼的规矩在主角附近冒出来（冒的时候不动不伤人），之后直扑；怕火（火类法器 ×1.5，火区里再乘 FIRE.fear）
  { kind: 'juemu', code: 54, hp: 28, speed: 1.7, dmg: 10, r: 14, xp: 2, steady: 0.1, vs: { 火: 1.5, 镇: 1.2 } },
  // 陶俑：硬，慢，刀剑砍上去 ×0.6，水泡软了 ×1.6
  { kind: 'taoyong', code: 55, hp: 42, speed: 0.95, dmg: 10, r: 17, xp: 3, steady: 0.6, vs: { 剑: 0.6, 水: 1.6, 镇: 1.15, 火: 0.8 } },
];

export const ENEMY_BY_KIND: Record<EnemyKind, EnemyDef> = Object.fromEntries(ENEMIES.map((e) => [e.kind, e])) as Record<EnemyKind, EnemyDef>;

/** 跳尸一跳的周期（拍）和腾空的那段：腾空时走、落地停一下 */
export const HOP_PERIOD = 26;
export const HOP_AIR = 16;
export const HOP_SPEED_MUL = 1.6;

/** 灯笼鬼：停在这个距离吐火球 */
export const LANTERN = { range: 270, every: 120, speed: 3.2, dmg: 5, life: 160, r: 9 };
/** 狐妖：近了停一下再冲 */
export const FOX = { trigger: 250, windup: 14, dash: 18, dashSpeed: 6.5, rest: 110 };
/** 狐妖、白狐的冲刺；白狐一次连冲 chain 下，两下之间只蓄力 rewind 拍 */
export const WHITEFOX = { chain: 2, rewind: 18 };
/** 雪魅：停在这个距离丢冰锥，打中主角走路变慢 slowTicks 拍 */
export const SNOW = { range: 300, every: 180, speed: 3.6, dmg: 4, life: 150, r: 9, slowTicks: 45 };
/** 主角被冰锥打中、被水鬼抓住时的走路速度倍数 */
export const PLAYER_SLOW = 0.62;
/** 水鬼：在主角附近冒出来，冒的那几拍不动也不伤人；抓住主角拖慢 grabTicks 拍 */
export const WATER = { emerge: 40, near: 200, far: 280, grabTicks: 50 };
/** 掘墓鬼：钻在主角脚边 near–far 远处，冒 emerge 拍（这几拍不动不伤人），站着不动就被它扑个正着 */
export const JUEMU = { emerge: 30, near: 80, far: 150 };
/** 枯骨：打散成两只小的（个头 size、血是原来的 hp 倍），小的不再散 */
export const BONE = { split: 2, size: 0.62, hp: 0.4 };
/** 蝙蝠精：每隔几拍换一个侧向的晃动 */
export const BAT = { every: 8, wobble: 0.9 };
/** 稻草人：站着不动，主角走到 wake 以内才醒 */
export const SCARECROW = { wake: 190 };
/** 黄鼠狼：每 scan 拍找一次 range 以内的铜钱，叼走就跑（跑出 lose 就带着钱消失），打死还双倍 */
export const WEASEL = { scan: 15, range: 520, flee: 1.25, lose: 1000, payback: 2 };
/** 纸轿：每 every 拍从轿后放 drop 个纸人，打碎放出 burst 个 */
export const PALANQUIN = { every: 240, drop: 3, burst: 14 };
/** 跳尸将军：隔一阵召一圈小跳尸 */
export const GENERAL = { every: 260, count: 6, ring: 70 };
/**
 * 尸王：按血分三段（DESIGN.md 2.2）。一段（满血到 2/3）只跳砸和召唤；二段加尸气、更勤；三段（1/3 以下）发怒：
 * 跳砸的圈更大、尸气两圈、召唤更多。进新一段时吼一声（事件里 a = 4）。
 */
export const BOSS = {
  /** 每段两个技能之间隔几拍 */
  every: [150, 120, 90],
  /** 进入二段、三段的血线 */
  phaseAt: [2 / 3, 1 / 3],
  /** 跳砸：先在地上画圈警告，跳到主角站的地方砸下来 */
  stompWarn: 30,
  stompRadius: 120,
  stompDmg: 34,
  /** 召唤：一圈跳尸 */
  summon: 8,
  /** 尸气：一圈慢速弹 */
  breath: 14,
  breathSpeed: 2.6,
  breathDmg: 13,
  /** 三段：跳砸的圈放大、召唤加量 */
  ragedStomp: 1.35,
  ragedSummon: 12,
};

/**
 * 纸扎老爷（守夜中期 Boss，8:00）：两段。一段撒纸钱（一圈慢慢旋开的纸钱弹）；血少于一半进二段：纸钱撒两圈、更勤，
 * 每第三个技能召一顶纸轿（场上最多 2 顶，召来的不掉宝箱）。打倒掉宝箱。
 */
export const LORD = {
  every: [120, 90],
  money: 16,
  moneySpeed: 2.3,
  moneyDmg: 5,
  moneyLife: 260,
  moneyR: 10,
  /** 每拍纸钱的速度方向转一格（方向表 256 格），转成旋涡 */
  moneyTurn: 1,
  maxPalanquin: 2,
};

/**
 * 画皮（竹林、河滩、鬼市的中期首领，8:00）：混迹和现形两段（w.eS：0 混迹，1 现形）。
 * 混迹：出场混在主角身边 spawnMin–spawnMax 远的怪群里，走得和僵尸一样快，不放技能；第一次挨打时提示一次，
 * 血掉到 revealAt 现形、立刻甩一次分身。现形后每 every 拍甩 clones 个人皮分身（血少于 rageAt 换成 every[1]，更勤），
 * 画皮身边 silkR 内主角走路乘 silkSlow（缠丝，常驻）。disguiseScale 只给画面用：混迹时外形比普通怪大一圈。
 */
export const HUAPI = {
  revealAt: 0.7,
  rageAt: 0.35,
  every: [210, 150],
  clones: 3,
  cloneHp: 80,
  /** 分身的寿命（拍）：十来秒后自己散掉 */
  cloneLife: 330,
  /** 场上最多同时有几只分身 */
  maxClones: 9,
  /** 分身落在主角四周这么远的一圈上 */
  cloneRing: 150,
  silkR: 150,
  silkSlow: 0.85,
  /** 缠丝和寒冰、水鬼的减速叠在一起，主角走路最慢不低于原速的这个比例（0.45 时河滩水里叠缠丝跑不掉，危险 2 比纸扎老爷低 5 个点） */
  slowFloor: 0.6,
  /** 现形后走得快一点 */
  revealSpeed: 1.1,
  spawnMin: 300,
  spawnMax: 450,
  disguiseScale: 1.35,
};

/** 竹精：钻出来之前地上先冒一个 warn 拍的圈，圈里的人在出土那一下挨 dmg */
export const SPROUT = { warn: 45, r: 58, dmg: 12 };
/** 蛇精：藏着时慢慢游（速度乘 creep、画面半透明），进了 trigger 就盘身 windup 拍再窜 lunge 拍，窜完露出来歇 rest 拍 */
export const SNAKE = { trigger: 170, windup: 10, lunge: 14, lungeSpeed: 6.2, rest: 70, creep: 0.55 };
/** 竹王：隔 every 拍在主角四周 ring 远的地方种 sprouts 个竹精；血少一半后更勤、更多（下标 0 / 1） */
export const BAMBOO_KING = { every: [210, 140], sprouts: [4, 6], ring: 120 };
/** 溺鬼：冒出来 emerge 拍；离主角 grab 以内就抓住，hold 拍里把人往自己身边拖（每拍 pull）并拖慢；松手后 cool 拍内不再抓 */
export const DROWN = { emerge: 36, grab: 60, hold: 30, pull: 1.0, cool: 150, slowTicks: 8 };
/** 河蟹：横着走，每 swap 拍换个方向；side 是横走的比例，近身（pinch 以内）才直着夹过来 */
export const CRAB = { swap: 70, side: 0.85, pinch: 70 };
/** 河伯：每 every 拍涨一次潮（一圈 ring 颗水弹）并在主角四周放 drowns 个溺鬼 */
export const HEBO = { every: 210, ring: 8, shotSpeed: 2.2, shotDmg: 8, shotLife: 200, drowns: 2, near: 150 };
/** 冰傀：被打碎裂成两个小的（个头 size、血是原来的 hp 倍），小的不再裂 */
export const ICEGOLEM = { size: 0.6, hp: 0.35 };
/** 冰凌：停在 range 远，每 every 拍在主角脚下标一个圈，warn 拍后落冰刺（圈里的人挨 dmg） */
export const ICICLE = { range: 280, every: 150, warn: 30, r: 52, dmg: 9 };
/** 冰魄：每 every 拍蓄力 warn 拍，然后以自己为圆心震出一圈霜（半径 r，伤 dmg，冻脚 slowTicks 拍）；每第二次还放 golems 个冰傀 */
export const FROSTSOUL = { every: 180, warn: 30, r: 170, dmg: 16, slowTicks: 70, golems: 2 };
/** 更夫鬼：每 every 拍敲一次梆子，唤来 calls 只小鬼火（场上怪超过 cap 只就不唤） */
export const NIGHTWATCH = { every: 170, calls: 2, cap: 260 };
/** 石僧：走 every 拍就停下蓄力 warn 拍，然后一掌拍地（半径 r，伤 dmg） */
/** 庙祝鬼：离主角 range 以内站住，每 every 拍往主角脚下撒一把香灰，warn 拍后落地，r 内挨 dmg 并迷眼走慢 slowTicks 拍 */
export const TEMPLEGHOST = { range: 250, every: 210, warn: 40, r: 56, dmg: 4, slowTicks: 24 };
export const MONK = { every: 150, warn: 24, r: 95, dmg: 14 };
/**
 * 皮影鬼：平时慢慢走；每 every 拍原地抖 warn 拍（画面上一闪一闪），然后一下闪到朝主角 dist 远的地方（离主角至少留 keep）。
 * 百鬼夜行（地图事件）刷出来的排成一横排，march 拍里按同一个方向齐步走（速度 marchSpeed），不追人、不闪，走完才照常。
 */
export const PUPPET = { every: 100, warn: 20, dist: 120, keep: 40, march: 330, marchSpeed: 2.3 };
/** 鬼贩：离主角近于 near 就往后退（速度乘 back），远于 far 才靠过来，中间站住；每 every 拍朝主角丢一个钱袋（直飞） */
export const PEDDLER = { near: 230, far: 320, back: 0.9, every: 160, speed: 3.0, dmg: 5, life: 150, r: 10 };
/**
 * 鬼市主：每 every 拍朝主角撒一扇铜钱（fan 颗，相邻两颗差 spread 格方向，方向表 256 格一圈）；
 * 血少一半后更勤、更多，每次还在主角四周叫出 puppets 个皮影鬼（下标 0 / 1）
 */
export const MARKETBOSS = { every: [190, 140], fan: [5, 7], spread: 9, speed: 2.6, dmg: 7, life: 220, r: 10, puppets: [0, 3], ring: 150 };
