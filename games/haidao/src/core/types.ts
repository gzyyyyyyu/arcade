/**
 * 海岛规则核心的公共类型：规则核心（src/core、src/content）、画面（src/view）、存档（src/platform）共用这一份。
 * 坐标约定：
 * - 岛上的格子：整数 (x, y)，0 ≤ x, y < ISLAND；建筑的 (x, y) 是占地方块的左上角（x、y 最小的那格），占 size × size 格。
 * - 战斗里的连续坐标：同一个格子坐标系，单位是"格的 1/100"（UNIT = 100），整数。格 (x, y) 的中心是 (x*100+50, y*100+50)。
 * - 海滩（登陆区）在岛外一圈：-BEACH ≤ x, y < ISLAND + BEACH 且不在岛内的格子。
 * 画面按等距 2:1 投影（src/view/iso.ts），规则核心不知道投影。
 */

/** 岛的边长（格） */
export const ISLAND = 22;
/** 玩家的岛按主寨等级最多向四周扩几圈（HQ_LEVELS.ext）；战役、悬赏、航线、护航的岛不扩 */
export const EXT_MAX = 2;
/** 岛外登陆海滩的宽度（格） */
export const BEACH = 3;
/** 战斗坐标里一格多少单位 */
export const UNIT = 100;
/** 战斗每秒拍数（固定步长） */
export const TICKS_PER_SEC = 20;
/** 一场进攻最长多少拍（3 分钟） */
export const BATTLE_TICKS = 180 * TICKS_PER_SEC;
/** 规则版本：规则一改就加一（服务端据此要求旧页面刷新、回放标「旧版本」）；录像和回放不保证跨版本 */
export const RULES_VERSION = 30;

export type BuildingKind =
  | 'hq' // 主寨
  | 'goldmine' // 金矿
  | 'sawmill' // 伐木场
  | 'vault' // 金库
  | 'woodyard' // 木料仓
  | 'dock' // 船坞（船数、每船容量）
  | 'armory' // 军械所（研究）
  | 'cannon' // 加农炮
  | 'gunTower' // 火枪塔
  | 'mortar' // 臼炮
  | 'mine' // 地雷（敌方看不见，踩到才炸）
  | 'flame' // 喷火塔
  | 'palm' // 棕榈树（装饰，不挡路、不算摧毁率）
  | 'rock' // 岩石（装饰）
  | 'harpoon' // 鱼叉炮：单体高伤、射程远
  | 'tar' // 焦油陷阱：隐藏，踩到减速
  | 'rocket' // 火箭塔：一次打多个目标、小范围溅射
  | 'kraken' // 海怪（首领专用）：长在岛边海里，周期性拍打海滩上的兵
  | 'fogTower' // 雾塔（首领专用）：半径内的建筑在兵走近前看不见
  | 'wall' // 城墙：1×1，兵绕路走，绕不过去就砸墙；炸药兵优先炸墙
  | 'statue' // 雕像（掉宝装饰）
  | 'flagpole' // 旗杆（掉宝装饰）
  | 'chest' // 宝箱（掉宝装饰）
  | 'wheel' // 海盗王的舵轮（守岛第四章全部过关的纪念装饰）
  | 'windmill' // 小风车（守岛第一章全部过关的纪念装饰）
  | 'lighthouse' // 小灯塔（守岛第二章全部过关的纪念装饰）
  | 'bonfire' // 篝火（守岛第三章全部过关的纪念装饰）
  | 'lookout' // 瞭望台（守岛第五章全部过关的纪念装饰）
  | 'treasure' // 宝藏箱（守岛里敌人来抢的目标；攻防里是普通建筑，驻岛英雄守在旁边）
  | 'shock' // 震荡炮：小溅射、命中的兵震晕（DESIGN 13）
  | 'sniper'; // 狙击塔：射程最远、单发重伤害，先打船长、船医这类后排（DESIGN 14）

export type TroopKind = 'sailor' | 'gunner' | 'brute' | 'bomber' | 'captain' | 'medic' | 'cannoneer' | 'harpooner' | 'grenadier' | 'shield';
export type SkillKind = 'barrage' | 'flare' | 'medkit';
export type ResKind = 'gold' | 'wood';

export interface Res {
  gold: number;
  wood: number;
}

/** 摆在岛上的一座建筑 */
export interface Placed {
  id: number;
  kind: BuildingKind;
  level: number;
  x: number;
  y: number;
  /** 产出建筑里攒着、还没收的资源（只有金矿、伐木场有） */
  stored?: number;
  /** 防御塔选过的分叉（src/content/branches.ts 的 id）：下标 0 是 3 级那次，1 是 6 级那次。守岛全额生效，攻防打折生效 */
  branch?: string[];
}

/** 一条船：只装一种兵，数量 = 船容量 ÷ 兵的人口（向下取整） */
interface Boat {
  troop: TroopKind;
}

/** 玩家的基地和进度（存档的规则部分；时间戳、设置这类画面层的东西不在这里） */
/** 每日三件小事的种类（goals.ts） */
export type GoalKind = 'sail' | 'star' | 'raid' | 'td' | 'upgrade' | 'collect' | 'duel' | 'scrim';

export interface Profile {
  v: 1;
  base: { buildings: Placed[]; nextId: number };
  res: Res;
  /** 战役每关拿到的最高星数（关卡 id → 0..3） */
  stars: Record<string, number>;
  /** 研究等级（兵种、技能、守岛英雄 hero），没写 = 1 */
  research: Partial<Record<TroopKind | SkillKind | 'hero', number>>;
  /** 船队编成（下标 = 第几条船） */
  boats: Boat[];
  /** 新手引导进行到第几步（引导自己定义含义） */
  tutorial: number;
  stats: {
    attacks: number;
    wins: number;
    lootGold: number;
    lootWood: number;
    /** 以下为第二期新增的计数，旧档缺字段按 0 算 */
    threeStars?: number;
    bossWins?: number;
    dailyDone?: number;
    maxStreak?: number;
    /** 当前连胜（连续 ≥1 星的场数） */
    streak?: number;
    /** 攻防（真人岛）：三星抢下的场数、复仇赢的场数、守住（对方 0 星）的次数（服务端记，me 回）、到过的最高奖杯 */
    pvpThree?: number;
    revengeWins?: number;
    holds?: number;
    bestTrophies?: number;
  };
  /** 收藏：掉宝得到的 `skin:<兵>:<gold|shadow|royal>`、`deco:<statue|flagpole|chest>`，守岛每章全部过关送的 `deco:<windmill|lighthouse|bonfire|wheel|lookout>`（TD_TROPHIES） */
  cosmetics: string[];
  /** 装备的皮肤：兵种 → 皮肤名 */
  skins: Partial<Record<TroopKind, string>>;
  /** 已达成的成就 id */
  achievements: string[];
  /** 当前佩戴的称号（成就 title） */
  title?: string;
  /** 守岛带哪个英雄：'nav' 航海士（第一章通关解锁，开局前在面板上切换）；没写 = 船长 */
  heroPick?: 'nav';
  /** 海盗王阶（rank.ts）：已到第几阶（0..10，没写 = 0），只管外观和展示 */
  rank?: number;
  /** 下一阶已经献了多少（没写 = 0）；不进攻防快照 */
  rankFund?: Res;
  /** 每日悬赏：打到哪天、是否已完成（天数由画面按北京时间传入） */
  daily?: { day: number; done: boolean };
  /**
   * 守岛进度（tdrun.ts）：每关最高星数、当天（北京时间天数）已拿的资源（计入每日上限；首次拿星的奖励不计）；
   * vet / chal 是拿到老兵徽、挑战章的关（content/tdchallenge.ts），talent 是点了的海图天赋格（content/tdtalent.ts），没有就不写
   */
  td?: { stars: Record<string, number>; day: number; gotGold: number; gotWood: number; vet?: Record<string, 1>; chal?: Record<string, 1>; talent?: string[] };
  /** 护航进度（escortrun.ts）：每关（`<图>-<难度>`）最高星数；资源奖励和守岛共用 td 的每日上限 */
  escort?: { stars: Record<string, number> };
  /** 训练营（training.ts）：过了哪几关、还没领的奖励（没有待领就不写 owed） */
  train?: { done: string[]; owed?: Res };
  /** 金银锭（ingot.ts）：领了多少、换掉多少；挣了多少从存档算，没写 = 都是 0 */
  ingot?: { claimed: number; spent: number };
  /** 每日三件小事（goals.ts）：哪天（北京时间天数）、各件做了几次、领过哪几件（含三件领完的箱子 'box'）；不进攻防快照 */
  goals?: { day: number; prog: Partial<Record<GoalKind, number>>; got: string[] };
}

/** 规则函数的统一回话：成功给新值，失败给固定短码（界面按码出文案） */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// ---------------------------------------------------------------- 战斗

/** 进攻方带进战斗的部队 */
export interface ArmySetup {
  /** 船长（英雄）也是一条船，count 恒为 1 */
  boats: Array<{ troop: TroopKind; count: number; level: number }>;
  skills: Array<{ kind: SkillKind; level: number }>;
  /** 开局旗舰能量 */
  energy: number;
}

export interface BattleSetup {
  /** 防守方的建筑（快照） */
  layout: Placed[];
  army: ArmySetup;
  seed: number;
  rules: number;
  /** 防守方的驻岛英雄等级（军械所研究 hero）：岛上有宝藏箱才出场；没写 = 没有英雄（战役、流浪海盗岛、悬赏岛） */
  hero?: number;
  /** "每局不一样"开关（DESIGN 15）：没写 = 全关，整局和没有这个字段时逐位一致。只有战役娱乐局由界面打开，服务端重放、悬赏、航线永不带 */
  fun?: { chest?: boolean; ally?: boolean };
  /** 防守方的岛扩了几圈（玩家的岛按主寨等级，islandExt）；没写 = 不扩（电脑海盗的岛） */
  ext?: number;
  /** 防御塔血量和塔、陷阱伤害的百分比（战役关的难度旋钮 LevelDef.defPct，campaignSetup 带进来）；没写 = 100，异步攻防、悬赏、航线永不带 */
  defPct?: number;
}

/** 玩家在某一拍的操作：登陆一条船、或放一个旗舰技能。坐标是战斗单位 */
export type BattleAction =
  | { t: number; type: 'land'; boat: number; x: number; y: number }
  | { t: number; type: 'skill'; skill: SkillKind; x: number; y: number }
  /** 落地 10 拍内、这批兵还没出手、没掉血，兵回船、船可以再放（canRecall） */
  | { t: number; type: 'recall'; boat: number };

export type ChestReward = 'energy' | 'heal' | 'shield';
export interface BChest {
  id: number;
  x: number;
  y: number;
  reward: ChestReward;
  taken: boolean;
}

export interface BUnit {
  id: number;
  /** 震晕到哪一拍（不走不打）、免控到哪一拍（见 combat.ts applyStun） */
  stunUntil?: number;
  immuneUntil?: number;
  /** 盾兵：盾朝的方向（单位向量 × 100，整数），按走的方向 / 打的目标更新；正面 ±60° 来的直射算挡住（combat.ts shieldFaces） */
  gx?: number;
  gy?: number;
  kind: TroopKind;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 目标建筑 id，没有为 -1 */
  target: number;
  mode: 'move' | 'attack' | 'dead';
  /** 朝向：1 向右（屏幕上 x 增大），-1 向左；画面翻转用 */
  face: 1 | -1;
  /** 下一次能出手的拍 */
  cd: number;
  /** 上一拍的位置（塔瞄提前量用）；刚登陆还没走过就没有 */
  px?: number;
  py?: number;
}

export interface BBuilding {
  id: number;
  kind: BuildingKind;
  level: number;
  /** 占地左上角（格）和边长 */
  x: number;
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  /** 地雷是否已暴露（踩到或被炸）；别的建筑恒为 true */
  revealed: boolean;
  /** 防御建筑当前瞄准的兵 id，-1 没有 */
  aim: number;
  cd: number;
  /** 分叉（带进战斗；画面挂小徽章用） */
  branch?: string[];
  /** 锁定的兵 id（见 combat.ts rankTargets）；没有或 -1 = 没锁 */
  lock?: number;
}

/** 驻岛英雄（电脑操控，DESIGN 10.6）：守在宝藏箱旁，倒下这一场不再起来 */
export interface BHero {
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 岗位（宝藏箱旁一格的中心，单位） */
  postX: number;
  postY: number;
  /** idle 在岗 / move 追人或回岗 / attack 出手 / dead 倒下 */
  mode: 'idle' | 'move' | 'attack' | 'dead';
  face: 1 | -1;
  /** 正在打的进攻兵 id，-1 没有 */
  target: number;
  /** 下一次能出手、能扔火药桶、能号令的拍 */
  cd: number;
  kegReady: number;
  rallyReady: number;
  /** 号令到哪一拍为止、罩住哪些塔（建筑 id） */
  rallyUntil: number;
  rallyIds: number[];
  /** true = 追出 6 格了，先回岗，回到岗位前不再接战 */
  returning: boolean;
}

export interface BProjectile {
  id: number;
  kind: 'ball' | 'bullet' | 'shell' | 'flame' | 'barrage' | 'dynamite' | 'keg' | 'grenade' | 'shock';
  /** 出发点、落点（战斗单位） */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 发射拍、命中拍 */
  t0: number;
  t1: number;
}

export type BattleEvent =
  | { type: 'land'; boat: number; x: number; y: number; units: number[] }
  | { type: 'shoot'; from: 'building' | 'unit' | 'hero'; id: number; projectile: number }
  | { type: 'hit'; x: number; y: number; dmg: number; target: 'building' | 'unit' | 'hero'; id: number }
  | { type: 'explode'; x: number; y: number; r: number }
  /** 震荡炮震晕了一个兵或驻岛英雄，until 拍之前不走不打 */
  | { type: 'stun'; target: 'unit' | 'hero'; id: number; until: number }
  /** 狙击塔锁定一个目标，fireAt 拍开火（画面从现在到 fireAt 画瞄准线 / 准星预警） */
  | { type: 'aim'; id: number; target: 'unit' | 'hero'; tid: number; fireAt: number }
  /** 盾兵用盾挡下一发直射（id 是盾兵；x、y 是挡住的点，画火花；cover 为真表示挡的是身后友军的） */
  | { type: 'guard'; id: number; x: number; y: number; cover: boolean }
  | { type: 'destroy'; id: number; kind: BuildingKind }
  | { type: 'die'; id: number; kind: TroopKind }
  | { type: 'skill'; skill: SkillKind; x: number; y: number }
  /** 误放撤回，units 是回船的兵 */
  | { type: 'recall'; boat: number; units: number[] }
  /** 漂流宝箱被捡走（reward 三选一，amount：能量点数 / 治疗百分比 / 护盾拍数） */
  | { type: 'chest'; id: number; x: number; y: number; reward: ChestReward; amount: number }
  /** 中途援军：warn = 提前预告（at 拍靠岸），land = 靠岸放下 units */
  | { type: 'ally'; phase: 'warn' | 'land'; x: number; y: number; at: number; units: number[] }
  | { type: 'heal'; id: number; amount: number }
  /** 驻岛英雄：扔火药桶（x、y 是落点）、号令（x、y 是英雄）、倒下 */
  | { type: 'hero'; what: 'keg' | 'rally' | 'down'; x: number; y: number }
  | { type: 'end'; stars: number };

export interface BattleState {
  rules: number;
  /** 岛扩了几圈（BattleSetup.ext） */
  ext: number;
  tick: number;
  units: BUnit[];
  buildings: BBuilding[];
  projectiles: BProjectile[];
  /** 还没登陆的船（下标对应 ArmySetup.boats），登陆后为 true */
  landed: boolean[];
  energy: number;
  over: boolean;
  /** 驻岛英雄（有宝藏箱才有），画面照着画 */
  hero?: BHero;
  /** 漂流宝箱（setup.fun.chest 开着才有）：坐标、奖励、是否已被捡，画面照着画 */
  chests?: BChest[];
  /** 地上的火（燃烧弹、火油这类分叉留下的）：中心、半径（单位）、烧到哪一拍 */
  fires?: Array<{ x: number; y: number; r: number; until: number }>;
  /** 内部用：RNG 状态、id 计数、信号弹目标等，画面不读 */
  internal: unknown;
}

export interface BattleResult {
  over: boolean;
  stars: number;
  /** 摧毁率 0..100（整数，不算装饰和地雷） */
  destroyedPct: number;
  hqDown: boolean;
}
