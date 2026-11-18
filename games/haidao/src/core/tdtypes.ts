/**
 * 守岛（塔防）的公共类型：内容表（src/content/td*.ts、branches.ts）、规则核心（td.ts、tdbot.ts）、以后的画面层共用。
 * 坐标约定和登陆战一样：格子是整数，连续坐标 1 格 = 100 单位（types.ts 的 UNIT），海滩在岛外 BEACH 格一圈。
 */
import type { EscortAction, EscortDef, EscortEvent } from './escorttypes.ts';
import type { BuildingKind, Placed } from './types.ts';
import type {
  Td2Action, Td2Event, TdGarrisonSpot, TdGarrisonTower, TdHomeGen, TdMode, TdPadDef, TdTier, TdTowerKind,
} from './td2types.ts';

export type TdEnemyKind = 'sailor' | 'ironclad' | 'fog' | 'skiff' | 'skiffling' | 'sapper' | 'parrot' | 'captain' | 'grenadier' | 'shield' | 'bosun' | 'macaw' | 'mate' | 'medic' | 'gunboat' | 'king';

export interface TdEnemyDef {
  name: string;
  hp: number;
  /** 每拍走多少单位（整数，20 拍 = 1 秒） */
  speed: number;
  /** 砸墙、打英雄的伤害和间隔（拍） */
  dmg: number;
  reload: number;
  /** 近战距离（单位） */
  reach: number;
  /** 摸到宝藏箱一次拿几枚 */
  carry: number;
  /** 打死给多少局内金币 */
  gold: number;
  /** 伤害减免百分比（穿甲不减） */
  armor?: number;
  flying?: boolean;
  /** 不在灯塔半径、英雄身边时看不见、打不中 */
  fog?: boolean;
  /** 打沉后分成几个什么 */
  split?: { kind: TdEnemyKind; n: number };
  /** 工兵：走路把墙当普通格，前面是墙就炸（伤害、半径单位） */
  bomb?: { dmg: number; r: number };
  /** 首领：周围的敌人加速（半径单位、加速百分比） */
  aura?: { r: number; pct: number };
  /** 掷弹兵（规则版本 10）：离挡路的墙、拒马、英雄 range 单位内就停下扔手雷，落点半径 r，炸墙按 wallPct% 算 */
  lob?: { range: number; r: number; wallPct: number };
  /** 军医（规则版本 18）：每秒给 r 单位内别的同伴（首领除外）回最大血量的 pct% */
  heal?: { r: number; pct: number };
  /**
   * 炮艇（规则版本 18）：停在登陆点外的海上不上岸，每 reload 拍炸哑 range 单位内最近的一座塔 jamTicks 拍，停 moor 拍后开走；
   * 海上的目标只有射程够远的塔打得到（TD_SEA_RANGE），英雄打不到
   */
  shell?: { range: number; reload: number; jamTicks: number; moor: number };
  /** 海盗王（规则版本 19）：停在海上时每 every 拍在身边放下 n 个 kind（上岸去抢） */
  drop?: { every: number; n: number; kind: TdEnemyKind };
  /** 海盗王（规则版本 19）：血掉到一半时叫来 n 个 kind 护航（一局一次） */
  escort?: { n: number; kind: TdEnemyKind };
}

/** 塔的分叉加成（branches.ts）：没写的项不变 */
export interface BranchMod {
  dmgPct?: number;
  reloadPct?: number;
  rangePct?: number;
  /** 溅射半径加多少（单位） */
  splash?: number;
  /** 穿甲：打铁甲不打折 */
  pierce?: boolean;
  /** 能打飞的 */
  antiAir?: boolean;
  /** 射程内有飞的先打飞的 */
  airFirst?: boolean;
  /** 灯塔：照亮半径（单位），雾船进来就看得见 */
  light?: number;
  /** 命中减速 */
  slowPct?: number;
  slowTicks?: number;
  /** 落点留火：每秒伤害、持续拍数、半径单位 */
  burnDps?: number;
  burnTicks?: number;
  /** 一次打几个不同的目标（加在基础值上） */
  shots?: number;
  /** 鱼叉贯穿：一条直线上的都打 */
  line?: boolean;
  /** 拖拽：把敌人拉回到多少拍之前的位置 */
  pull?: number;
  /** 震荡炮：震晕时长改成多少拍（规则版本 10） */
  stunTicks?: number;
}

export interface BranchDef {
  id: string;
  tower: BuildingKind;
  /** 1 = 3 级那次，2 = 6 级那次 */
  tier: 1 | 2;
  name: string;
  desc: string;
  mod: BranchMod;
}

export interface TdHeroLevel {
  hp: number;
  dmg: number;
  reload: number;
  range: number;
  speed: number;
  kegDmg: number;
  kegR: number;
  kegCd: number;
  rallyTicks: number;
  rallyCd: number;
}

/** 一组敌人：从第几条登陆路、隔几拍上一个 */
export interface TdGroup {
  enemy: TdEnemyKind;
  n: number;
  /** 登陆路下标；等于 lanes.length 表示落潮路（落潮前改走 0 号路） */
  lane: number;
  /** 两个敌人之间隔几拍 */
  every: number;
  /** 这一波开始后多少拍才开始上这一组 */
  delay?: number;
  /**
   * 只在这个规则版本区间 [since, until) 的局里出（没写 = 不限）。关卡换配方时新旧两套组并排写，
   * createTd 按 setup.rules 挑，旧版本的局逐位不变（RULES_SINCE.tdElite）
   */
  since?: number;
  until?: number;
}

export interface TdWave {
  groups: TdGroup[];
  /** 首领波：界面提示用 */
  boss?: boolean;
  /** 这一波的预告（界面在上一波倒数里显示，开打时再亮一次），比如"鹦鹉从东边绕后" */
  note?: string;
  /** 这一波的敌人血量再乘多少百分比（大潮无尽越往后越肉；没写就是 100，旧关卡不带） */
  hpPct?: number;
}

export interface TdObstacle {
  kind: 'wreck' | 'barrel';
  x: number;
  y: number;
  size: number;
  hp: number;
  gold: number;
}

/** 一关：波次、潮汐、火药桶、沉船木桶、临时塔位都写死（格子坐标）；地图是玩家自己的岛（TdSetup.layout） */
export interface TdLevel {
  id: string;
  name: string;
  /** 建议主寨等级 */
  hq: number;
  /** 敌人血量百分比（同一份敌人表，关卡按它整体调强弱） */
  hpPct: number;
  /** 开局局内金币 */
  gold: number;
  /** 开局到第一波的倒数（拍） */
  first: number;
  /** 一波开始到下一波开始的倒数（拍） */
  waveTicks: number;
  /** 登陆点（海滩上的格子） */
  lanes: Array<{ x: number; y: number }>;
  /** 第几波（0 起）开始落潮，多露出一条登陆路 */
  tide?: { wave: number; lane: { x: number; y: number } };
  waves: TdWave[];
  /**
   * 潮水涨落（第二章起，DESIGN 10.6d）：写了它，落潮路只在列出的这些波（0 起）开着，其余波涨潮、落潮路关上
   * （走落潮路的组改走 0 号路）；要和 `tide` 一起写（tide.lane 是落潮路，tide.wave 不再用）。不写就是第一章的"从第几波起一直开着"。
   */
  tideOpen?: number[];
  /** 成片的雾区（第二章起）：圆心（格子坐标）和半径（格）；区里的敌人不管是什么都得被灯塔、英雄照亮才打得中 */
  fogZones?: Array<{ x: number; y: number; r: number }>;
  /** 首领技能（第三章起）：首领血量掉到一半时发一次——在身边召一批小敌人，并炸哑离它最近的几座塔几拍 */
  bossSkill?: { summon: { kind: TdEnemyKind; n: number }; jam: number; jamTicks: number };
  /** 东路绕后（第三章）：关卡多一条东边的登陆路，鹦鹉分批从那边飞来；只给机器人和界面认（塔位打分把鹦鹉的飞行线算进去、鹦鹉在场英雄回箱子边、备火箭塔） */
  flank?: boolean;
  /** 炸塔工兵（第三章起）：工兵走到离塔 1.5 格就引爆（自己没了），半径（格）内的塔哑火这么多拍 */
  sapperJam?: { r: number; ticks: number };
  /** 水面格（规则版本 18，第四章的水道、火口湖）：谁都走不过去，塔、木台也不摆在上面；飞的照飞 */
  water?: Array<{ x: number; y: number }>;
  /**
   * 潮汐水闸（规则版本 16，第二章最后两关）：落潮路口一道闸，下一波落潮路要开时玩家可以关上那一波（走落潮路的组改走 0 号路），
   * 一局能关几次。要和 tide、tideOpen 一起写；规则版本低于 16 的局不起作用（tdmech.ts）
   */
  sluice?: number;
  /** 漂流补给箱（规则版本 16，第一章最后两关）：第几波（0 起）开打时在哪一格（沙滩）漂来一个箱子 */
  crates?: Array<{ wave: number; x: number; y: number }>;
  /** 岸防老炮（规则版本 16，第三章最后两关）：炮台摆在哪一格（只是画面和炮弹的出膛点，不挡路）；全岛都打得到 */
  battery?: { x: number; y: number };
  /** 友军巡航船（规则版本 19，第四章最后两关）：写了就有；船沿岛外一圈开，不需要坐标 */
  fleet?: boolean;
  /**
   * 大潮无尽（DESIGN 10.6e）：写了它，波次按波数现生成（`waves` 只是已经生成的前缀，开局和每开一波都往后补几波），打不完，宝藏丢光才结束。
   * 必须是只由波数（和写死的种子）决定的纯函数，同一个 setup 才能重放出同一局。
   */
  endless?: (w: number) => TdWave;
  /** 雾区从第几波开始起作用（开了几波之后；没写就是一开始就有）。大潮无尽前几分钟轻松，雾区晚点来 */
  fogFrom?: number;
  /** 这一局最多多少拍；没写用 TD_MAX_TICKS（8 分钟） */
  maxTicks?: number;
  /** 火药桶（格子） */
  kegs: Array<{ x: number; y: number }>;
  obstacles: TdObstacle[];
  /** 临时塔位（2×2 木台的左上角格子）；守岛 2.0 的关卡岛里可以带 wreck（被沉船压着） */
  slots: TdPadDef[];
  /** 守岛 2.0：驻守台（关卡岛写死，1–3 个） */
  garrison?: TdGarrisonSpot[];
  /** 测试和模拟用的岛（真实关卡用玩家自己的岛，不带这个） */
  demo?: Placed[];
  /** 护航（escorttypes.ts）：写了它就是护航关，不摆宝藏箱，敌人追着商船咬；没写的关一律走原来的守岛规则 */
  escort?: EscortDef;
}

export interface TdSetup {
  /** 自己的岛（含宝藏箱、塔的分叉） */
  layout: Placed[];
  level: TdLevel;
  /** 英雄等级（军械所研究 hero） */
  hero: number;
  seed: number;
  rules: number;
  /** 守岛 2.0：哪种玩法（没写按 campaign；旧存档、旧测试不带） */
  mode?: TdMode;
  /** 守岛 2.0：驻守台上的塔（tdrun 按存档算好阶和分叉） */
  garrison?: TdGarrisonTower[];
  /** 守岛 2.0：基地加成（每种塔的伤害加成百分比，baseBonusPct 算好） */
  bonus?: Partial<Record<TdTowerKind, number>>;
  /** 守岛 2.0：木台上能造哪些塔（基地已解锁的种类）；没写 = 全部 */
  unlocked?: TdTowerKind[];
  /** 守岛 2.0 海盗来袭：波次生成参数 */
  home?: TdHomeGen;
}

export type TdAction =
  | { t: number; type: 'call' }
  | { t: number; type: 'build'; slot: number; kind: BuildingKind }
  | { t: number; type: 'up'; slot: number }
  | { t: number; type: 'branch'; slot: number; branch: string }
  | { t: number; type: 'repair'; id: number }
  | { t: number; type: 'move'; x: number; y: number }
  | { t: number; type: 'clear'; id: number }
  | { t: number; type: 'keg'; x: number; y: number }
  | { t: number; type: 'rally' }
  | Td2Action
  | EscortAction;

export interface TdEnemy {
  id: number;
  kind: TdEnemyKind;
  wave: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** in 去抢、out 拿到了回船、dead 打死、gone 回到船上 */
  mode: 'in' | 'out' | 'dead' | 'gone';
  /** 身上带着几枚宝藏 */
  carry: number;
  /** 回船的登陆点（单位） */
  hx: number;
  hy: number;
  cd: number;
  slowUntil: number;
  slowPct: number;
  face: 1 | -1;
  /** 震晕到哪一拍（不走）、免控到哪一拍（见 combat.ts applyStun） */
  stunUntil?: number;
  immuneUntil?: number;
  /** 盾兵：盾朝的方向（单位向量 × 100，整数），按走的方向更新（combat.ts shieldFaces） */
  gx?: number;
  gy?: number;
  /** 上一拍的位置（塔算提前量用：速度 = 这一拍减上一拍）；刚出生时等于出生点 */
  px?: number;
  py?: number;
  /** 每 10 拍记一次位置（拖拽用），最多 6 个 */
  trail: number[];
  /** 炮艇：哪一拍开走（不带宝藏、不算丢） */
  until?: number;
}

export interface TdTower {
  id: number;
  kind: BuildingKind;
  level: number;
  x: number;
  y: number;
  size: number;
  branch: string[];
  cd: number;
  aim: number;
  /** 锁定的目标 id：还在射程里、优先级没被更高一类压过就一直打它，不每拍换（-1 / 没写 = 没锁） */
  lock?: number;
  /** 临时塔：在哪个木台上，常驻塔为 -1 */
  slot: number;
  /** 守岛 2.0：局内的阶（木台、驻守台上的塔），常驻塔没有 */
  tier?: TdTier;
  /** 守岛 2.0：在驻守台上（slot 是驻守台对应的木台下标） */
  garrison?: boolean;
}

export interface TdWall {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

export interface TdBlock {
  id: number;
  kind: 'wreck' | 'barrel';
  x: number;
  y: number;
  size: number;
  hp: number;
  gold: number;
  destroyed: boolean;
}

export interface TdHero {
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 倒下时为复活的拍，活着为 -1 */
  respawn: number;
  /** 走向的目标（单位），没有为 null */
  goal: { x: number; y: number } | null;
  /** 要清的障碍 id，-1 没有 */
  clear: number;
  cd: number;
  kegReady: number;
  rallyReady: number;
  aim: number;
  /** 守岛 2.0：拒马下次能放的拍（炸药桶沿用 kegReady） */
  barricadeReady?: number;
  /** 守点：玩家最后一次让他走到的地方（开局是出生点）；没手动指令时在守点附近迎敌，追远了回来 */
  post?: { x: number; y: number };
}

export interface TdSlot {
  x: number;
  y: number;
  /** 上面的临时塔 id，-1 空着 */
  tower: number;
  /** 升了几次（0..2） */
  ups: number;
  /** 守岛 2.0：这块是驻守台（驻守台下标），木台没有 */
  garrison?: number;
  /** 守岛 2.0：压着它的沉船（TdBlock id），清掉前不能造；没压为 undefined */
  wreck?: number;
  /** 守岛 2.0：这块上已经花了多少金（卖塔按它退） */
  spent?: number;
}

export type TdEvent =
  | { type: 'wave'; wave: number; early: boolean; bonus: number; cdCut?: number }
  | { type: 'spawn'; id: number; kind: TdEnemyKind; x: number; y: number }
  | { type: 'shoot'; /** 塔的 id；英雄开火是 -1 */ id: number; x0: number; y0: number; x1: number; y1: number; t1: number; /** 打的是哪个敌人（直射的弹道画面跟着它飞） */ target?: number }
  | { type: 'hit'; id: number; dmg: number }
  | { type: 'die'; id: number; kind: TdEnemyKind }
  | { type: 'explode'; x: number; y: number; r: number }
  | { type: 'grab'; id: number; n: number }
  | { type: 'drop'; x: number; y: number; n: number }
  | { type: 'pickup'; n: number }
  | { type: 'escape'; id: number; n: number }
  | { type: 'wall'; id: number; destroyed: boolean }
  | { type: 'block'; id: number }
  | { type: 'hero'; what: 'down' | 'up' | 'keg' | 'rally' | 'barricade' }
  | { type: 'jam'; id: number; until: number }
  /** 震荡炮震晕了一个敌人（DESIGN 13），until 拍之前不走 */
  | { type: 'stun'; id: number; until: number }
  /** 掷弹兵扔出一颗手雷：从 (x0,y0) 抛到 (x1,y1)，t1 拍落地，爆炸半径 r（画面画抛物线、落点影子和范围圈） */
  | { type: 'lob'; id: number; x0: number; y0: number; x1: number; y1: number; t1: number; r: number }
  /** 狙击塔锁定一个敌人，fireAt 拍开火（画面画瞄准线 / 准星预警，DESIGN 14） */
  | { type: 'aim'; id: number; target: number; fireAt: number }
  /** 盾兵挡下一发直射（id 是盾兵；x、y 是挡住的点） */
  | { type: 'guard'; id: number; x: number; y: number }
  | { type: 'skill'; id: number; x: number; y: number }
  | { type: 'end'; stars: number }
  | Td2Event
  | EscortEvent;

export interface TdResult {
  over: boolean;
  stars: number;
  /** 丢掉（被带回船）的宝藏枚数 */
  lost: number;
  /** 撑过（敌人全部处理完）的波数 */
  waves: number;
  total: number;
  ticks: number;
  /** 局内金币挣了多少（结算展示用） */
  goldEarned: number;
  /** 打沉的敌人数（大潮无尽的得分用；旧调用方不带） */
  kills?: number;
}
