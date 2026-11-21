/**
 * 夜探（搜打撤）的内容表（DESIGN.md 2.3、3.5、3.6、3.8、4.2）：地图模板、宝箱、撤离门的时间、夜探刷怪表、守卫的数值、结回倍数。
 * 规则在 `src/explore/`，这里只放数。时间以拍计（每秒 30 拍），距离以单位计（主角半径 14，每拍走 3）。
 */
import type { EnemyDef, EnemyKind } from './enemies.ts';
import type { CharacterId } from './meta.ts';
import type { Minute } from './waves.ts';

const S = 30;
const M = 60 * S;

export type RaidTemplateId = 'guzhen' | 'dukou' | 'shansi' | 'teach' | 'xilou' | 'liangcang' | 'yaozhen';

/** 块坐标（街道之间的第几块，从左上 0 起） */
export type BlockXY = readonly [number, number];

/**
 * 地图模板。骨架按格子生成：`streets` 是街所在的格子行列号（含两边的环街），街和街之间的格子并成一块"院"；
 * 院墙往街上让 `streetPad`（街的净宽 = cell − 2 × streetPad）。种子决定每块院的样子（院、空场、破院）、门开在哪边，
 * 以及宝箱、守卫、出生点。
 */
export interface RaidTemplate {
  id: RaidTemplateId;
  name: string;
  blurb: string;
  /** 场地边长（正方形） */
  size: number;
  cell: number;
  streets: readonly number[];
  streetPad: number;
  /** 街边木箱几个 */
  wood: number;
  /** 一块普通院放铜箱的概率；铜箱带精英守着的概率 */
  copperChance: number;
  copperGuardChance: number;
  /** 铜箱守卫从这几种精英里挑（守夜的精英，行为按守卫的规矩：守着、追远了回去） */
  copperGuards: readonly EnemyKind[];
  /** 空场（摆摊的场子，没墙）、破院（墙上多几个口子）的概率 */
  plazaChance: number;
  ruinChance: number;
  /** 庙：金箱 + 巡夜将 */
  temples: readonly BlockXY[];
  templeGuard: boolean;
  /** 最值钱的院子：镇门石兽守着，两个金箱；只开一个门 */
  vault: BlockXY | null;
  /** 渡口：这一行块整行换成河（含两边的环街），只在 `bridges` 条竖街上留桥 */
  river?: { row: number; bridges: number };
  /** 山寺：这几行横街上砌一道台阶墙（整行），只在 `gaps` 条竖街上留窄口 */
  terraces?: { rows: readonly number[]; gaps: number; gapWidth: number };
  /** 2.0：最值钱的院子由这位首领守（不写就是镇门石兽） */
  vaultGuard?: EnemyKind;
  /** 2.0：这一块是空场，正中一座大戏台（戏楼镇），戏台每隔一阵开一场戏（content/foes.ts 的 STAGE） */
  stage?: BlockXY;
  /** 2.0：正房的样子（粮仓镇画成粮仓，不写是普通房） */
  houseLook?: 'granary';
  /** 窑镇：普通院子有这个概率是窑场——正房换成一座窑，窑口前一块是火区（maps.ts FIRE，和乱葬岗同一套规则） */
  kilnChance?: number;
  /** 四座镇门（北东南西），按场地边长的比例给位置 */
  gates: readonly { name: string; fx: number; fy: number }[];
  /** 夜里游荡的巡夜将：第几拍从离主角远的路口出来 */
  roamers: readonly number[];
}

const FOUR_GATES = [
  { name: '北门', fx: 0.5, fy: 0.03125 },
  { name: '东门', fx: 0.96875, fy: 0.5 },
  { name: '南门', fx: 0.5, fy: 0.96875 },
  { name: '西门', fx: 0.03125, fy: 0.5 },
] as const;

export const RAID_TEMPLATES: Record<RaidTemplateId, RaidTemplate> = {
  guzhen: {
    id: 'guzhen',
    name: '古镇',
    blurb: '横平竖直的街巷，院连着院；镇中心的大院有石兽守着',
    size: 6400,
    cell: 400,
    streets: [0, 3, 6, 9, 12, 15],
    streetPad: 90,
    wood: 18,
    copperChance: 0.5,
    copperGuardChance: 0.3,
    copperGuards: ['shishi', 'whitefox'],
    plazaChance: 0.15,
    ruinChance: 0.15,
    temples: [[1, 1], [3, 3], [3, 1]],
    templeGuard: true,
    vault: [2, 2],
    gates: FOUR_GATES,
    roamers: [6 * M, 11 * M],
  },
  dukou: {
    id: 'dukou',
    name: '渡口',
    blurb: '一条河把镇子切成两半，只有三座桥',
    size: 6400,
    cell: 400,
    streets: [0, 3, 6, 9, 12, 15],
    streetPad: 90,
    wood: 18,
    copperChance: 0.5,
    copperGuardChance: 0.3,
    copperGuards: ['shishi', 'whitefox'],
    plazaChance: 0.2,
    ruinChance: 0.1,
    temples: [[1, 1], [3, 3]],
    templeGuard: true,
    vault: [3, 1],
    river: { row: 2, bridges: 3 },
    // 东西两门挪到岸上（正中是河）：东门在北岸、西门在南岸，两岸各两座门；离门最远的东北、西南两角各分到一座
    gates: [
      { name: '北门', fx: 0.5, fy: 0.03125 },
      { name: '东门', fx: 0.96875, fy: 0.3125 },
      { name: '南门', fx: 0.5, fy: 0.96875 },
      { name: '西门', fx: 0.03125, fy: 0.6875 },
    ],
    roamers: [6 * M, 11 * M],
  },
  shansi: {
    id: 'shansi',
    name: '山寺',
    blurb: '一层层台阶往上走，只有几个窄口；山门里是寺',
    size: 6400,
    cell: 400,
    streets: [0, 3, 6, 9, 12, 15],
    streetPad: 120,
    wood: 18,
    copperChance: 0.45,
    copperGuardChance: 0.35,
    copperGuards: ['shishi', 'general'],
    plazaChance: 0.1,
    ruinChance: 0.25,
    temples: [[1, 1], [3, 1], [2, 2]],
    templeGuard: true,
    vault: [2, 0],
    terraces: { rows: [6, 12], gaps: 3, gapWidth: 110 },
    gates: FOUR_GATES,
    roamers: [6 * M, 11 * M],
  },
  // 2.0（DESIGN.md 2.3）：戏楼镇 —— 正中一座大戏台，守门首领红衣戏子
  xilou: {
    id: 'xilou',
    name: '戏楼镇',
    blurb: '镇中心一座大戏台，隔一阵开一场戏，戏班鬼影成队冒出来',
    size: 6400,
    cell: 400,
    streets: [0, 3, 6, 9, 12, 15],
    streetPad: 90,
    wood: 18,
    copperChance: 0.5,
    copperGuardChance: 0.45,
    copperGuards: ['shishi', 'whitefox'],
    plazaChance: 0.1,
    ruinChance: 0.15,
    temples: [[1, 1], [3, 1], [3, 3]],
    templeGuard: true,
    vault: [1, 3],
    vaultGuard: 'hongyi',
    stage: [2, 2],
    gates: FOUR_GATES,
    roamers: [3 * M, 6 * M, 9 * M, 11 * M],
  },
  // 粮仓镇：窄巷围着一座座粮仓，宝箱多在仓里，鼠妖成群，守门首领硕鼠将军。
  // 街巷密（7×7 = 49 个院子，老镇 5×5），走两步就是下一个院子：同样的铜箱比例、两座庙、宝库在正中时，普通玩家开的箱子是古镇的三倍、
  // 宝库常被打开，带出价值是老镇平均的两倍。铜箱比例、木箱数按院子多少压低，不放庙，宝库从正中往东北挪一格（再往角上挪就比街上的木箱还浅，违背"越深越值钱"），开箱数和带出价值回到老镇的水平（DESIGN 8.1）
  liangcang: {
    id: 'liangcang',
    name: '粮仓镇',
    blurb: '一排排高墙粮仓围成迷宫，宝箱多放在仓里，鼠妖成群',
    size: 6400,
    cell: 400,
    streets: [0, 2, 4, 6, 8, 10, 12, 15],
    streetPad: 105,
    wood: 8,
    copperChance: 0.1,
    copperGuardChance: 0.4,
    copperGuards: ['shishi'],
    plazaChance: 0,
    ruinChance: 0.05,
    temples: [],
    templeGuard: true,
    vault: [4, 2],
    vaultGuard: 'shuoshu',
    houseLook: 'granary',
    gates: FOUR_GATES,
    roamers: [4 * M, 8 * M, 11 * M],
  },
  // 窑镇：几座院子是窑场，窑口按节奏喷火（火区）；陶俑扛刀剑、怕水；镇心大院照旧石兽守
  yaozhen: {
    id: 'yaozhen',
    name: '窑镇',
    blurb: '窑场一座连一座，窑口隔一阵喷火；陶俑又硬又慢',
    size: 6400,
    cell: 400,
    streets: [0, 3, 6, 9, 12, 15],
    streetPad: 90,
    wood: 18,
    copperChance: 0.5,
    copperGuardChance: 0.3,
    copperGuards: ['shishi', 'general'],
    plazaChance: 0.1,
    ruinChance: 0.1,
    temples: [[1, 3], [3, 1]],
    templeGuard: true,
    vault: [2, 2],
    kilnChance: 0.45,
    gates: FOUR_GATES,
    roamers: [6 * M, 11 * M],
  },
  teach: {
    id: 'teach',
    name: '教学镇',
    blurb: '第一次夜探：小镇子，第 3 分钟就开门，死了也不丢包',
    size: 2800,
    cell: 400,
    streets: [0, 3, 6],
    streetPad: 90,
    wood: 6,
    copperChance: 1,
    copperGuardChance: 0,
    copperGuards: [],
    plazaChance: 0,
    ruinChance: 0,
    temples: [[1, 1]],
    templeGuard: false,
    vault: null,
    gates: FOUR_GATES,
    roamers: [],
  },
};

/** 玩家能进的镇子：菜单能选的五个，加第一次固定进的教学镇。用白名单，以后加的镇子先只在开发服务器里能进（?raid=<id>），配平过了再加进来 */
export const RAID_OPEN: readonly RaidTemplateId[] = ['teach', 'guzhen', 'dukou', 'shansi', 'xilou', 'liangcang', 'yaozhen'];
/** 这个模板现在能不能开一局：线上只认 RAID_OPEN；dev（import.meta.env.DEV）时全部模板都行。链接参数、菜单、再来一局、交榜都过这里 */
export function raidOpen(t: string | null | undefined, dev: boolean): t is RaidTemplateId {
  // 用 hasOwnProperty 不用 in：?raid=toString 之类原型上的名字不能当成镇子
  return !!t && Object.hasOwn(RAID_TEMPLATES, t) && (dev || (RAID_OPEN as readonly string[]).includes(t));
}

/** 墙厚；院门宽；院里正房的进深 */
export const RAID_WALL = { thick: 26, door: 140, houseDepth: 110 };

/** 宝箱三档（DESIGN.md 2.3） */
export type ChestTier = 'wood' | 'copper' | 'gold';
export const CHEST_TIERS: readonly ChestTier[] = ['wood', 'copper', 'gold'];

/**
 * 宝箱：几件宝物、每档的权重（凡 / 良 / 珍 / 绝）、深处（离镇中心近）往高档挪多少；铜箱、金箱另给一次守夜的升级宝箱（法器、被动、进化）。
 * deep：深度 0（镇边）到 1（镇中心）之间，按 deep × 深度 把"凡"的权重挪给后三档（按后三档原来的比例）。
 */
export const CHEST: Record<ChestTier, { items: number; weights: readonly [number, number, number, number]; deep: number; upgrade: boolean }> = {
  wood: { items: 1, weights: [0.75, 0.21, 0.035, 0.005], deep: 0.25, upgrade: false },
  copper: { items: 2, weights: [0.42, 0.4, 0.15, 0.03], deep: 0.3, upgrade: true },
  gold: { items: 3, weights: [0.15, 0.4, 0.33, 0.12], deep: 0.3, upgrade: true },
};

/** 开箱：站在 range 以内 hold 拍（1.5 秒）；走出去就从头来（挨打不打断，但会被推开） */
export const CHEST_OPEN = { range: 70, hold: 45 };

/** 宝箱之间至少隔多远、离出生点至少多远 */
export const CHEST_SPACING = { wood: 520, spawn: 700 };

/**
 * 撤离门（DESIGN.md 2.3）：三个时段。one = 随机开一座（第二段换一座没开过的），all = 四门全开。
 * 危险 0 和教学镇第一段从 3:00 开到 6:00（13.3：第 3 分钟开第一座门）。
 */
export const GATE_WINDOWS: readonly { from: number; to: number; all: boolean }[] = [
  { from: 5 * M, to: 6 * M, all: false },
  { from: 10 * M, to: 11 * M, all: false },
  { from: 14 * M, to: 15 * M, all: true },
];
export const GATE_WINDOWS_EARLY: readonly { from: number; to: number; all: boolean }[] = [
  { from: 3 * M, to: 6 * M, all: false },
  { from: 10 * M, to: 11 * M, all: false },
  { from: 14 * M, to: 15 * M, all: true },
];

/** 门圈半径；在圈里站 hold 拍（3 秒）撤出，挨打不打断，出圈从头来 */
export const GATE = { r: 110, hold: 90 };

/** 天亮（迷失）：15:00；14:00 起顶上换成天亮倒计时，最后 30 秒变红 */
export const RAID_DAWN = 15 * M;
export const DAWN_WARN = 14 * M;
export const DAWN_RED = 15 * M - 30 * S;

/** 出生点：四个角里种子挑一个（离镇子中心最远，深处要自己走进去） */
export const SPAWN_INSET = 200;

/**
 * 离镇中心越近怪越凶（DESIGN.md 2.3）：深度 d（0 镇边，1 镇中心）时血 × (1 + hp × d)、伤害 × (1 + dmg × d)、刷怪量 × (1 + count × d)。
 */
export const RAID_ZONE = { hp: 0.8, dmg: 0.4, count: 0.5 };

/**
 * 夜探的刷怪表（每分钟一档，形状同守夜 `waves.ts` 的 MINUTES）：场地大、有墙，场上保持的数量比守夜少；
 * 远程怪同样压在 8% 以下。没有定点的围圈、群冲和 Boss：压力来自守卫和时间。
 */
export const RAID_MINUTES: readonly Minute[] = [
  { keep: 14, rate: 2, mix: { paper: 0.8, wisp: 0.2 } },
  { keep: 22, rate: 3, mix: { paper: 0.55, wisp: 0.25, bat: 0.2 } },
  { keep: 32, rate: 3.5, mix: { paper: 0.4, wisp: 0.25, bat: 0.2, jiangshi: 0.15 } },
  { keep: 42, rate: 4, mix: { paper: 0.25, jiangshi: 0.4, horse: 0.15, bat: 0.2 } },
  { keep: 52, rate: 4.5, mix: { paper: 0.2, jiangshi: 0.4, weasel: 0.15, bone: 0.25 } },
  { keep: 60, rate: 5, mix: { jiangshi: 0.4, lantern: 0.08, bone: 0.3, weasel: 0.12, bat: 0.1 } },
  { keep: 68, rate: 5.5, mix: { jiangshi: 0.35, fox: 0.2, bone: 0.25, water: 0.12, lantern: 0.08 } },
  { keep: 78, rate: 6, mix: { jiangshi: 0.3, fox: 0.25, scarecrow: 0.15, water: 0.15, bone: 0.15 } },
  { keep: 88, rate: 6.5, mix: { jiangshi: 0.3, fox: 0.25, scarecrow: 0.15, weasel: 0.12, snow: 0.06, bone: 0.12 } },
  { keep: 98, rate: 7, mix: { jiangshi: 0.3, fox: 0.25, water: 0.15, bone: 0.2, snow: 0.07, lantern: 0.03 } },
  { keep: 108, rate: 7.5, mix: { jiangshi: 0.3, fox: 0.25, scarecrow: 0.15, bone: 0.2, snow: 0.07, weasel: 0.03 } },
  { keep: 118, rate: 8, mix: { jiangshi: 0.35, fox: 0.2, water: 0.1, bone: 0.2, snow: 0.07, horse: 0.08 } },
  { keep: 130, rate: 9, mix: { jiangshi: 0.35, fox: 0.2, scarecrow: 0.1, bone: 0.2, snow: 0.07, bat: 0.08 } },
  { keep: 145, rate: 10, mix: { jiangshi: 0.35, fox: 0.2, bone: 0.2, horse: 0.1, snow: 0.07, lantern: 0.08 } },
  { keep: 160, rate: 11, mix: { paper: 0.15, jiangshi: 0.4, fox: 0.2, bone: 0.25 } },
];

/**
 * 夜探的两种新怪（DESIGN.md 3.5）。字段同 `enemies.ts` 的 EnemyDef（kind、code 由核心接进 ENEMIES 时给，建议 18、19）。
 * 巡夜将：守金箱、会追人，比主角慢一点（追得上停下来的人，追不上一直跑的）；黑甲，刀剑砍着费劲。
 * 镇门石兽：守最值钱的院子，青石身子，刀剑、土都不太吃；怕水（冲刷）和镇（镇物压得住）。
 */
export type RaidEnemyKind = 'patrol' | 'beast' | 'goblin';
export const RAID_ENEMIES: Record<RaidEnemyKind, Omit<EnemyDef, 'kind' | 'code'>> = {
  patrol: { hp: 900, speed: 2.5, dmg: 14, r: 26, xp: 30, steady: 0.9, elite: true, vs: { 剑: 0.7, 火: 1.25 } },
  beast: { hp: 9000, speed: 1.4, dmg: 20, r: 46, xp: 80, steady: 0.97, boss: true, vs: { 剑: 0.6, 土: 0.7, 水: 1.4, 镇: 1.3 } },
  // 宝妖：背着宝袋的小妖，见人就跑（比主角慢一点，追得上），不打人；打倒掉两件好宝物
  goblin: { hp: 420, speed: 2.6, dmg: 0, r: 20, xp: 20, steady: 0.95, elite: true },
};

/**
 * 夜探后半段（DESIGN.md 2.3，主线 2026-10-17 批的 B）：所有者试玩觉得 6 分钟以后没东西可搜、只剩躲怪等门。
 * 都按夜探自己的随机流（raid-late）抽，录像和每日挑战能复现；不加"越晚撤越多倍"的倍数，多出来的价值全来自这些。
 * - restock：6:00 起每 90 秒，把 n 个已经开过的箱子重新封上、换一批东西（每一波深度 +deepStep，越晚越值钱）；
 * - goblin：5:00、10:00 各出一只宝妖，离主角 900–1,600 的路口；life 拍后钻地跑掉；打倒直接进背包 items 件（深度 1 抽）；
 * - market：7:00–8:00 镇中心附近的鬼市，三个摊子各摆一件，站在摊前 hold 拍、身上铜钱够就按价值 × rate 买下；
 * - vault：最深的金箱从开局就贴着封条，8:00 以后、身上有钥匙才能搜，开出 items 件（深度 1）；
 *   钥匙：keyFrom 以后打倒的第一只精英或守卫掉（宝妖不算），一局一把。
 */
export const RAID_LATE = {
  restock: { from: 6 * M, every: 90 * 30, n: 3, deepStep: 0.25 },
  goblin: { at: [5 * M, 10 * M], life: 45 * 30, minD: 900, maxD: 1600, items: 2, flee: 520 },
  market: { from: 7 * M, to: 8 * M, stalls: 3, rate: 0.7, r: 56, hold: 30, gap: 110, depth: 0.8 },
  vault: { at: 8 * M, items: 6, keyFrom: 5 * M },
};

/**
 * 守卫的规矩（`src/explore/guards.ts`）：
 * - aggro：主角走到守的地方这么近（或离守卫本身 aggro × 0.6 以内）就追；
 * - leash：追出离家这么远就回去（回去的路上主角再进 aggro 又追）；
 * - homeSpeed：回家时的速度倍数。
 * 游荡的巡夜将没有家：看见（aggro 以内）就追，主角跑出 leash 就放弃，接着沿街走。
 */
export const GUARD = {
  copper: { aggro: 260, leash: 620, homeSpeed: 1.1 },
  patrol: { aggro: 340, leash: 900, homeSpeed: 1.1 },
  roamer: { aggro: 380, leash: 820 },
  beast: { aggro: 420, leash: 760, homeSpeed: 1.2 },
};

/**
 * 镇门石兽（DESIGN.md 3.5：扑击、甩尾扫一圈）。血少于一半进二段：技能更勤、扫的圈更大、扑击连扑两下。
 * pounce：先在落点画圈警告 warn 拍，再用 fly 拍扑过去，落地 radius 以内挨 dmg；
 * sweep：原地蓄力 warn 拍（画圈），然后一圈 radius 以内挨 dmg。
 */
export const BEAST = {
  every: [100, 70],
  phaseAt: 0.5,
  pounce: { warn: 24, fly: 14, radius: 95, dmg: 26, range: 520 },
  sweep: { warn: 20, radius: 165, dmg: 20, ragedRadius: 210 },
  /** 二段：扑完马上再扑一次 */
  ragedChain: 2,
};

/** 巡夜将游荡时的速度倍数（不追人时慢慢走） */
export const ROAM_SPEED = 0.6;

/**
 * 实盘结回（DESIGN.md 4.2）：撤出时倍数 = clamp(带出的宝物价值 ÷ 基准价值, 保底, 封顶)；死亡、迷失、认输为 0。结回 = 带入 × 倍数 向下取整，按万分之一传。
 * 基准按"档位 × 镇子"各一个：三个镇子同一档的平均带出价值差三成（模拟器第 3 轮），只按一个数会有"挑镇子赚钱"的空子。
 * 保底（1.1）：按撤出时刻从 1 涨到满额，按档分开定（见下面 floor / floorRamp）；不按镇子分开：保底一高，手熟的人"开门就走"就比认真搜还赚。
 * 档位 → 危险：小 0、中 1、大 2（主线 2026-10-17 同意放低一档）；夜探的危险 1、2 走 waves.ts 的 RAID_DANGERS（比守夜缓），0.2.0 起三档都开。
 * 基准是 1.1 全量模拟（每格 2,000 局）拟合的：普通玩家落在区间里、且比开门就走至少多 0.15 份，见 DESIGN.md 4.2。
 */
export const RAID_LIVE = {
  cap: 3,
  /**
   * 保底满额和几拍给满：撤出越早给得越少，从 1.0 线性涨到满额（1.1：认真搜要比开门就走多拿 ≥ 0.15 份）。
   * 按档分开：中、大档第一座门 5 分钟才开，开门就走也在 6 分钟左右，同样的保底在那里就等于白送，所以中档给满拖到 10 分钟、大档满额压到 1.25。
   */
  // 豪华档（规则 64 开）照大档的思路：8 分钟给满，满额比大档低（豪华档目标带低一截），数值是拟出来的（DESIGN 4.2）
  floor: { small: 1.6, medium: 1.6, large: 1.25, luxe: 1.2 } as Record<RaidLiveTier, number>,
  floorRamp: { small: 5 * 60 * 30, medium: 10 * 60 * 30, large: 8 * 60 * 30, luxe: 8 * 60 * 30 } as Record<RaidLiveTier, number>,
  // 戏楼镇、粮仓镇（0.17.6）：小道士每格 300 局，普通锚区间中点，两条线期望 + 2SE 不超上限（DESIGN.md 4.2）
  // 窑镇（0.32.0）：小道士每格 2,000 局，普通锚古镇同档普通；豪华档锚到古镇要基准 40，小白撤出就顶封顶、和普通一样高，取 70（DESIGN 4.2a）
  base: {
    small: { guzhen: 250, dukou: 182, shansi: 220, xilou: 176, liangcang: 246, yaozhen: 219 },
    medium: { guzhen: 211, dukou: 241, shansi: 153, xilou: 184, liangcang: 224, yaozhen: 170 },
    large: { guzhen: 175, dukou: 153, shansi: 98, xilou: 135, liangcang: 210, yaozhen: 123 },
    // 规则 68 危险档变难后按古镇小道士同种子各 2,000 局重拟，五镇同比例 ÷1.26（原 139 / 121 / 45 / 79 / 164）
    luxe: { guzhen: 111, dukou: 96, shansi: 36, xilou: 63, liangcang: 130, yaozhen: 70 },
  } as Record<RaidLiveTier, Record<RaidLiveTemplate, number>>,
  danger: { small: 0, medium: 1, large: 2, luxe: 3 } as Record<RaidLiveTier, number>,
  /**
   * 角色系数（万分比，默认 10_000；0.3.6 实盘可选已解锁的角色）：乘在按保底、封顶算好的倍数上，结果仍至少 1 份、最多封顶（liveMultiplier）。
   * 某角色同档的实盘期望比最高、最低的差出 0.15 份以上才单独给，按档写，不改角色本身的数值。
   */
  charBp: {
    // 0.27.0（规则 64 的内容进实盘）：45 个「角色 × 镇子」小、中、大三档 sim --stop 重量（最多 2,000 局），豪华档每格 2,000 局。
    // 口径「宁简勿难」：只压超过多发线（带上限 + 0.15）的，压到普通回到带上限、小白不超多发线；普通低于带下限的抬到带上限（最多 2 倍）；其余照旧。
    // 豪华档的基准把小道士普通锚到 +0.40（主线 11-17：往多给提，但不到大档带上限 +0.45），角色系数按同一个锚压。逐格的拟出值和之前的历史见 docs/balance-yexun.md 第 1 节
    xiaodao: { medium: { guzhen: 10_000, dukou: 11_400, shansi: 10_000, xilou: 10_000, liangcang: 10_000, yaozhen: 10_000 }, large: { guzhen: 10_000, dukou: 10_000, shansi: 9_200, xilou: 10_000, liangcang: 10_000, yaozhen: 10_000 } },
    fushi: { small: { guzhen: 8_800, dukou: 9_400, shansi: 9_600, xilou: 9_200, liangcang: 8_900, yaozhen: 8_800 }, medium: { guzhen: 8_400, dukou: 10_000, shansi: 8_300, xilou: 10_100, liangcang: 8_400, yaozhen: 8_400 }, large: { guzhen: 8_100, dukou: 8_600, shansi: 7_300, xilou: 8_700, liangcang: 8_500, yaozhen: 8_100 }, luxe: { guzhen: 8_200, dukou: 8_300, shansi: 7_000, xilou: 8_300, liangcang: 7_900, yaozhen: 8_200 } },
    jianxia: { small: { guzhen: 8_300, dukou: 8_200, shansi: 9_400, xilou: 8_200, liangcang: 8_200, yaozhen: 8_300 }, medium: { guzhen: 7_900, dukou: 9_100, shansi: 7_700, xilou: 8_400, liangcang: 7_900, yaozhen: 7_900 }, large: { guzhen: 6_700, dukou: 8_100, shansi: 6_800, xilou: 7_900, liangcang: 7_100, yaozhen: 6_700 }, luxe: { guzhen: 7_200, dukou: 7_900, shansi: 7_100, xilou: 7_300, liangcang: 6_400, yaozhen: 7_200 } },
    pang: { small: { guzhen: 9_000, dukou: 8_900, shansi: 9_000, xilou: 8_900, liangcang: 9_900, yaozhen: 9_000 }, medium: { guzhen: 8_200, dukou: 10_200, shansi: 8_100, xilou: 9_200, liangcang: 8_100, yaozhen: 8_200 }, large: { guzhen: 7_200, dukou: 8_800, shansi: 8_200, xilou: 8_700, liangcang: 9_000, yaozhen: 7_200 }, luxe: { guzhen: 7_100, dukou: 7_900, shansi: 6_200, xilou: 7_100, liangcang: 7_100, yaozhen: 6_100 } },
    gengfu: { small: { guzhen: 10_000, dukou: 10_000, shansi: 10_000, xilou: 8_900, liangcang: 11_500, yaozhen: 10_000 }, medium: { guzhen: 8_800, dukou: 10_000, shansi: 8_400, xilou: 10_000, liangcang: 10_000, yaozhen: 8_800 }, large: { guzhen: 8_700, dukou: 10_000, shansi: 6_800, xilou: 9_500, liangcang: 10_300, yaozhen: 8_700 }, luxe: { guzhen: 8_500, dukou: 9_600, shansi: 7_500, xilou: 8_400, liangcang: 10_000, yaozhen: 8_500 } },
    caiyao: { small: { guzhen: 10_000, dukou: 8_700, shansi: 8_400, xilou: 8_400, liangcang: 9_600, yaozhen: 10_000 }, medium: { guzhen: 8_000, dukou: 10_000, shansi: 7_600, xilou: 9_900, liangcang: 9_000, yaozhen: 8_000 }, large: { guzhen: 7_800, dukou: 8_600, shansi: 7_100, xilou: 9_100, liangcang: 9_600, yaozhen: 7_800 }, luxe: { guzhen: 7_300, dukou: 8_500, shansi: 6_800, xilou: 8_200, liangcang: 8_900, yaozhen: 7_300 } },
    zhijiang: { small: { guzhen: 10_000, dukou: 10_000, shansi: 10_000, xilou: 9_100, liangcang: 10_300, yaozhen: 10_000 }, medium: { guzhen: 8_900, dukou: 10_600, shansi: 7_900, xilou: 9_700, liangcang: 9_100, yaozhen: 8_900 }, large: { guzhen: 8_900, dukou: 9_300, shansi: 7_900, xilou: 9_200, liangcang: 10_000, yaozhen: 8_900 }, luxe: { guzhen: 8_300, dukou: 9_000, shansi: 8_400, xilou: 9_000, liangcang: 9_400, yaozhen: 8_300 } },
    huolang: { small: { guzhen: 11_300, dukou: 11_700, shansi: 10_600, xilou: 11_000, liangcang: 11_000, yaozhen: 11_300 }, medium: { guzhen: 10_400, dukou: 10_500, shansi: 9_900, xilou: 10_400, liangcang: 10_400, yaozhen: 10_400 }, large: { guzhen: 10_200, dukou: 11_400, shansi: 9_200, xilou: 9_600, liangcang: 11_300, yaozhen: 10_200 }, luxe: { guzhen: 10_000, dukou: 10_000, shansi: 6_800, xilou: 7_800, liangcang: 9_500, yaozhen: 8_300 } },
    yinyang: { small: { guzhen: 10_000, dukou: 10_000, shansi: 11_000, xilou: 12_200, liangcang: 11_300, yaozhen: 10_000 }, medium: { guzhen: 10_000, dukou: 10_000, shansi: 11_300, xilou: 12_100, liangcang: 10_000, yaozhen: 10_000 }, large: { guzhen: 10_000, dukou: 10_000, shansi: 10_700, xilou: 10_000, liangcang: 11_800, yaozhen: 10_000 }, luxe: { guzhen: 9_300, dukou: 10_000, shansi: 9_500, xilou: 9_300, liangcang: 10_000, yaozhen: 8_000 } },
    // 窑镇（0.32.0）：各角色照古镇系数，四档两线各 150–450 局筛查，两线 ±2SE 明确多发的只有豪华档胖师叔、货郎、阴阳先生，压到普通 +0.40（DESIGN 4.2a）
    // 摆渡人 0.30.0 放出才进实盘（之前的局里没有他）：五个镇子小、中、大三档默认线各 150 局，普通低于带下限的抬到带上限（最多 2 倍；山寺中档按配对的小白不超多发线收一点）；古镇小档普通和小道士配对正好贴多发线，压 1%；豪华档照默认
    baidu: { small: { guzhen: 9_900, dukou: 10_000, shansi: 11_700, xilou: 10_000, liangcang: 10_000, yaozhen: 9_900 }, medium: { guzhen: 10_000, dukou: 12_000, shansi: 14_200, xilou: 10_000, liangcang: 10_000, yaozhen: 10_000 }, large: { guzhen: 10_000, dukou: 13_200, shansi: 20_000, xilou: 14_300, liangcang: 12_900, yaozhen: 10_000 } },
  } as Partial<Record<CharacterId, Partial<Record<RaidLiveTier, RaidCharCoef>>>>,
};

/** 角色系数：一个数 = 这一档所有镇子都用；写成按镇子分的，没写的镇子 = 10_000（有的角色在山寺比在古镇、渡口强得多） */
export type RaidCharCoef = number | Partial<Record<RaidLiveTemplate, number>>;
/** 这个角色在这一档、这个镇子的实盘系数（万分比）；没登记 = undefined */
export function raidCharCoef(character: CharacterId, tier: RaidLiveTier, template: RaidLiveTemplate): number | undefined {
  const c = RAID_LIVE.charBp[character]?.[tier];
  return typeof c === 'object' ? (c[template] ?? 10_000) : c;
}
export type RaidLiveTier = 'small' | 'medium' | 'large' | 'luxe';
/** 能开实盘的镇子（教学镇不能）；菜单、实盘记录、结回都按这一份 */
export type RaidLiveTemplate = Exclude<RaidTemplateId, 'teach'>;
export const RAID_LIVE_TEMPLATES: readonly RaidLiveTemplate[] = ['guzhen', 'dukou', 'shansi', 'xilou', 'liangcang', 'yaozhen'];
export const RAID_LIVE_TIERS: readonly RaidLiveTier[] = ['small', 'medium', 'large', 'luxe'];

/** 娱乐：撤出时背包按价值换铜钱（1 价值 = 1 铜钱）；死了或迷失拿这局捡到的铜钱的一半 */
export const RAID_EXCHANGE = { rate: 1, deathCoinShare: 0.5 };

/**
 * 早搜奖励（1.1）：前 until 拍（5 分钟）里、离出生点 near 以内的木箱和铜箱，开出来的宝物结算时价值按 mul 算。
 * 让"顺手搜两三个箱子再走"的小白不靠保底也有赚；纯刷保底不碰箱子拿不到。不改抽到什么（宝物照旧），只在结算时加价。
 */
export const RAID_EARLY = { until: 5 * 60 * 30, near: 1200, mul: 1.3 };

/** 藏宝阁：带出过多少件不同的宝物解锁采药女（DESIGN.md 3.7） */
export const VAULT_UNLOCK = { herbalist: 20 };
