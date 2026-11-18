/**
 * 守岛 2.0 的 18 关（td01–td18）：每关 = 一张关卡岛（td2maps.ts）+ 波次配方 + 开局金、驻守台上限等旋钮。
 * 波次不写死个数，写"这一波的预算分给哪几组敌人"：个数 = 预算份额 ÷ 敌人点数（TD2_ENEMY_POINTS），预算见 waveBudget。
 * 这样改 TD2_BUDGET 或敌人点数，18 关的强度跟着连续变；td-sim 还能用 buildLevel 的 budgetPct 量"预算 ±2% 时的三星率"。
 * 难度只来自预算、敌人种类和路数、地图，没有每关单独的血量百分比（hpPct 一律 100）。
 */
import type { TdEnemyKind, TdGroup, TdWave } from '../core/tdtypes.ts';
import type { TdGarrisonSpot, TdIslandLevel, TdMapId, TdPadDef, TdTier } from '../core/td2types.ts';
import { waveBudget } from '../core/td2types.ts';
import { RULES_SINCE } from '../core/types.ts';
import { TD2_ECON, TD2_ENEMY_POINTS } from './td2units.ts';
import { TD2_MAPS, TD2_MAP_SPECS, mapLayout } from './td2maps.ts';

/** [敌人, 份额（占这一波预算的百分比，同一波的非首领组加起来 100）, 登陆路, 延迟拍] */
type G = [TdEnemyKind, number, number, number?];

interface WaveRecipe {
  groups: G[];
  boss?: boolean;
  note?: string;
}

const w = (...groups: G[]): WaveRecipe => ({ groups });
const boss = (...groups: G[]): WaveRecipe => ({ groups, boss: true });
const note = (text: string, r: WaveRecipe): WaveRecipe => ({ ...r, note: text });

interface LevelDef {
  id: string;
  name: string;
  /** 战役里的下标（0 起，进难度公式） */
  index: number;
  map: TdMapId;
  chapter: 1 | 2 | 3;
  /** 建议主寨等级（"建议养成"的口径） */
  hq: number;
  gold: number;
  waveTicks: number;
  /**
   * 这一关的预算再乘多少百分比（默认 100）。公式给整体趋势，每张图的塔位、路长不同，实际承受力差得远，
   * 所以每关用 td-sim 的 curve 找一个让稳机器人三星率落在验收曲线上的值；改地图、敌人点数或塔的数值后要重拟合。
   */
  scale?: number;
  /** 用几个木台、其中哪几个（下标）被沉船压着 */
  pads: number;
  wrecks?: number[];
  /** 每个驻守台的上限阶 */
  garrison: TdTier[];
  /** 起作用的雾区（TdMapDef.fogZones 的下标） */
  fog?: number[];
  /** 落潮路：从第几波（0 起）开始一直开着；或只在列出的这些波开着 */
  tide?: number | number[];
  bossSkill?: boolean;
  sapperJam?: boolean;
  flank?: boolean;
  /** 潮汐水闸（规则版本 16，第二章最后两关）：一局能关几次落潮路（TdLevel.sluice） */
  sluice?: number;
  /** 漂流补给箱（规则版本 16，第一章最后两关）：第几波（0 起）在哪一格沙滩漂来箱子（TdLevel.crates） */
  crates?: Array<{ wave: number; x: number; y: number }>;
  /** 岸防老炮（规则版本 16，第三章最后两关）：炮台摆在哪一格（TdLevel.battery） */
  battery?: { x: number; y: number };
  /** 首领波前多给的倒数（拍），不写用 TD2_BOSS_EXTRA_TICKS */
  bossExtraTicks?: number;
  /**
   * 规则版本 15 起的精英配方（少而精）：第 ELITE.from 波起，水手、鹦鹉每组的份额 ELITE.pct% 换成水手长、鹦鹉王，
   * 整关预算改乘这里的 scale（按 td-sim 拟合到规则 14 下实测的三星率，保持现在的难度）；from 换精英从第几波（0 起）出。
   * 旧版本的局照旧用上面的 scale 和原配方（组带 until，回放逐位不变）。
   * kind：水手的份额换成哪种精英，不写是水手长；写 'mate' 换成大副（倒下散成水手），这套组从规则版本 RULES_SINCE.tdMate 起才出
   */
  elite?: { scale: number; from?: number; kind?: 'mate' };
  waves: WaveRecipe[];
}

/** 炸塔工兵：走到离塔 1.5 格引爆，3 格内的塔哑火 5 秒 */
const SAP = { r: 3, ticks: 100 };
/** 潮汐水闸一局能关几次：两关的落潮各开 7、8 波，关三次够挑最难的几波，又不至于整关都不用管落潮路 */
const TD_SLUICE_USES = 3;
/**
 * 漂流补给箱：第 3、6、9 波开打时漂来，摆在离登陆路远、离宝藏箱几步的空地上（英雄 5 到 9 秒走得到，箱子 30 秒漂走）。
 * 去捡就要离开防线一会儿，敌人压到宝藏边时去捡会漏，这就是要玩家想的事。两张图的沙滩都离英雄守的地方
 * 8 格以上，一波的倒数里来回走不完，所以都摆在宝藏箱两侧、登陆路不经过的空地上：雾港（C）在宝藏左右，潮沟（D）在宝藏东边（格子要能走：tests/td-mech.test.ts 查）
 */
const CRATES_C = [{ wave: 2, x: 7, y: 18 }, { wave: 5, x: 13, y: 18 }, { wave: 8, x: 7, y: 18 }];
const CRATES_D = [{ wave: 2, x: 16, y: 9 }, { wave: 5, x: 15, y: 12 }, { wave: 8, x: 16, y: 9 }];
/** 黑胡子湾（I 图）的老炮台：东南角的沙滩上，离三条登陆路和落潮路都远，不挡人也不被人挡住 */
const BATTERY_I = { x: 23, y: 18 };
/** 首领技能：血一半时在身边召 8 个水手，炸哑最近的 2 座塔 8 秒 */
const SKILL = { summon: { kind: 'sailor' as const, n: 8 }, jam: 2, jamTicks: 160 };

const S = 'sailor';
const I = 'ironclad';
const F = 'fog';
const K = 'skiff';
const P = 'parrot';
const X = 'sapper';
const C = 'captain';

const DEFS: readonly LevelDef[] = [
  // ---------------------------------------------------------------- 第一章：登陆、铁甲、雾船、鹦鹉、首领
  {
    id: 'td01', name: '初上岛滩', index: 0, map: 'A', chapter: 1, hq: 2, gold: 380, waveTicks: 360, scale: 180, pads: 4, garrison: [1],
    waves: [
      w([S, 100, 0]),
      w([S, 100, 0]),
      w([S, 60, 0], [S, 40, 0, 90]),
      w([S, 100, 0]),
      w([S, 60, 0], [S, 40, 0, 100]),
      w([S, 100, 0]),
      w([S, 55, 0], [S, 45, 0, 100]),
      w([S, 50, 0], [S, 50, 0, 120]),
    ],
  },
  {
    id: 'td02', name: '铁甲登陆', index: 1, map: 'A', chapter: 1, hq: 3, gold: 300, waveTicks: 360, scale: 280, pads: 4, garrison: [1],
    waves: [
      w([S, 15, 0]),
      w([S, 20, 0], [S, 10, 0, 140]),
      note('铁甲来了：炮弹克重甲，枪弹和喷火打不动', w([S, 30, 0], [I, 6, 0, 140])),
      w([S, 30, 0], [S, 25, 0, 140]),
      w([S, 40, 0], [I, 16, 0, 160]),
      w([S, 40, 0], [S, 35, 0, 140]),
      w([S, 40, 0], [I, 30, 0, 160]),
      w([S, 45, 0], [S, 30, 0, 140], [I, 15, 0, 220]),
      w([S, 40, 0], [I, 40, 0, 160]),
    ],
  },
  {
    id: 'td03', name: '双滩汇流', index: 2, map: 'B', chapter: 1, hq: 4, gold: 355, waveTicks: 360, scale: 125, pads: 5, garrison: [2],
    waves: [
      w([S, 100, 0]),
      w([S, 60, 0], [S, 40, 1, 40]),
      note('北路来水手，西路来铁甲', w([S, 60, 0], [I, 40, 1])),
      w([S, 50, 0], [S, 50, 1, 40]),
      w([S, 40, 0], [I, 60, 1]),
      w([I, 50, 0], [S, 50, 1, 40]),
      w([S, 100, 0]),
      w([S, 45, 0], [I, 55, 1]),
      w([S, 40, 1], [I, 60, 0]),
      w([S, 40, 0], [I, 30, 1], [S, 30, 1, 80]),
    ],
  },
  {
    id: 'td04', name: '雾港分路', index: 3, map: 'C', chapter: 1, hq: 5, gold: 300, waveTicks: 360, scale: 130, pads: 6, wrecks: [5], garrison: [2],
    waves: [
      w([S, 45, 0]),
      w([S, 35, 0], [S, 25, 1, 40]),
      note('雾船藏在雾里，要灯塔照亮才打得中', w([S, 55, 0], [F, 10, 1])),
      w([I, 30, 0], [S, 45, 1]),
      w([S, 40, 0], [S, 40, 1, 60]),
      w([I, 45, 1], [F, 10, 0, 40], [S, 20, 0, 60]),
      w([S, 40, 0], [S, 40, 1, 60]),
      w([I, 45, 0], [F, 10, 1], [S, 30, 1, 60]),
      w([S, 35, 1], [I, 40, 0], [S, 20, 0, 60]),
      w([I, 40, 1], [F, 10, 0], [S, 40, 0, 60]),
    ],
  },
  {
    id: 'td05', name: '鹦鹉礁', index: 4, map: 'C', chapter: 1, hq: 5, gold: 300, waveTicks: 360, scale: 128, pads: 6, wrecks: [5], garrison: [2], crates: CRATES_C,
    waves: [
      w([S, 45, 0]),
      w([S, 35, 0], [S, 25, 1, 40]),
      note('鹦鹉直线飞过来，只有枪弹打得中', w([S, 50, 1], [P, 8, 0])),
      w([I, 22, 0], [S, 40, 1]),
      w([P, 15, 1], [S, 40, 0, 40], [S, 30, 1, 80]),
      w([I, 40, 1], [P, 15, 0], [S, 30, 0, 80]),
      w([F, 10, 0], [S, 40, 1], [P, 15, 1, 60]),
      w([I, 45, 0], [P, 25, 1, 40]),
      w([S, 35, 0], [P, 25, 0, 60], [F, 10, 1, 40]),
      w([I, 40, 1], [S, 30, 0], [P, 20, 1, 60]),
      w([F, 10, 0], [I, 40, 1], [P, 25, 0, 60]),
    ],
  },
  {
    id: 'td06', name: '船长来了', index: 5, map: 'D', chapter: 1, hq: 6, gold: 335, waveTicks: 340, scale: 120, pads: 7, garrison: [2, 2], tide: 6, crates: CRATES_D,
    waves: [
      w([S, 45, 0]),
      w([S, 35, 0], [S, 25, 1, 40]),
      w([P, 8, 1], [I, 20, 0], [S, 40, 1]),
      w([S, 40, 0], [K, 20, 1]),
      w([K, 14, 0], [S, 35, 1], [I, 20, 1, 60]),
      w([S, 45, 0], [K, 16, 1, 60]),
      note('落潮路开了：南边多一条路', w([S, 35, 2], [I, 20, 0], [K, 15, 1, 40])),
      w([I, 25, 2], [K, 15, 0], [S, 30, 1, 60]),
      w([K, 25, 0], [S, 40, 2, 40]),
      w([I, 25, 1], [S, 30, 2], [K, 15, 0, 60]),
      w([K, 20, 2], [I, 30, 0, 60], [S, 20, 1, 100]),
      note('船长在最后一波：先打掉他，别的敌人跑得更快', boss([C, 0, 0], [S, 30, 1, 40], [I, 30, 2, 60], [K, 10, 1, 80])),
    ],
  },
  // ---------------------------------------------------------------- 第二章：潮水涨落、成片的雾
  {
    id: 'td07', name: '潮起潮落', index: 6, map: 'D', chapter: 2, hq: 6, gold: 550, waveTicks: 340, scale: 280, elite: { scale: 280, from: 5 }, pads: 7, garrison: [2, 2], tide: [1, 2, 5, 6, 9, 10],
    waves: [
      w([S, 100, 0]),
      note('南边的落潮路开着：预告条会提前一波告诉你', w([S, 60, 2], [I, 40, 1])),
      w([S, 40, 2], [S, 30, 1, 40], [I, 30, 2, 60]),
      w([I, 40, 0], [S, 60, 1]),
      w([K, 40, 1], [S, 60, 0]),
      w([I, 40, 2], [S, 40, 2, 40], [S, 20, 0, 60]),
      w([K, 40, 2], [I, 30, 2], [S, 30, 1, 40]),
      w([S, 60, 0], [I, 40, 1]),
      w([K, 40, 0], [S, 30, 1], [I, 30, 0, 50]),
      w([I, 40, 2], [S, 40, 2], [K, 20, 1, 60]),
      w([K, 40, 2], [I, 40, 2], [S, 20, 0, 60]),
      w([S, 40, 0], [I, 30, 1], [K, 30, 1, 40]),
    ],
  },
  {
    id: 'td08', name: '薄雾渐起', index: 7, map: 'E', chapter: 2, hq: 6, gold: 450, waveTicks: 340, scale: 105, pads: 7, wrecks: [5, 6], garrison: [2, 2], fog: [0],
    waves: [
      w([S, 100, 0]),
      note('北路罩在雾里：雾里的敌人要灯塔或英雄照亮才打得中', w([S, 60, 0], [I, 40, 1])),
      w([S, 45, 0], [F, 30, 1], [I, 25, 1, 40]),
      w([I, 50, 0], [S, 50, 1]),
      w([K, 40, 0], [S, 40, 1], [F, 20, 0, 60]),
      w([S, 60, 0], [I, 40, 1]),
      w([I, 40, 0], [K, 30, 1], [S, 30, 0, 60]),
      w([S, 40, 1], [F, 30, 0], [I, 30, 1, 40]),
      w([K, 40, 0], [I, 30, 1], [S, 30, 0, 40]),
      w([S, 40, 0], [I, 30, 1], [F, 30, 1, 60]),
    ],
  },
  {
    // 开局金不能多：钱太多时"少造升满"的守法第一波就把塔造完、种类按头两波定死，后面守不住（850 守住 100%，920 只剩 3%）
    id: 'td09', name: '雾锁浅滩', index: 8, map: 'E', chapter: 2, hq: 7, gold: 850, waveTicks: 340, scale: 100, pads: 7, wrecks: [5, 6], garrison: [2, 2], fog: [0, 1], tide: [1, 2, 4, 5, 7, 8, 10],
    waves: [
      w([S, 100, 0]),
      w([S, 60, 2], [I, 40, 1]),
      w([I, 40, 2], [S, 40, 2, 30], [F, 20, 1, 40]),
      w([S, 60, 0], [K, 40, 1]),
      w([S, 40, 2], [F, 30, 2], [I, 30, 2, 40]),
      w([I, 40, 2], [S, 30, 1], [K, 30, 2, 60]),
      w([S, 60, 0], [I, 40, 1]),
      w([K, 40, 2], [S, 40, 2], [F, 20, 1, 40]),
      w([I, 40, 2], [K, 30, 2], [S, 30, 0, 60]),
      w([S, 40, 1], [I, 30, 0], [F, 30, 0, 40]),
      w([K, 35, 2], [I, 35, 2], [S, 30, 2, 60]),
    ],
  },
  {
    id: 'td10', name: '浓雾锁港', index: 9, map: 'F', chapter: 2, hq: 7, gold: 300, waveTicks: 340, scale: 166, elite: { scale: 149 }, pads: 8, garrison: [2, 2], fog: [0, 1],
    waves: [
      w([S, 100, 0]),
      w([S, 70, 0], [S, 30, 0, 80]),
      w([P, 20, 0], [S, 80, 0]),
      w([I, 40, 0], [S, 60, 0, 40]),
      w([P, 40, 0], [K, 60, 0]),
      note('在迷宫的拐角用拒马卡口，再用溅射塔打成一团', w([S, 60, 0], [I, 40, 0, 40])),
      w([P, 35, 0], [I, 35, 0], [S, 30, 0, 40]),
      w([K, 50, 0], [S, 50, 0, 40]),
      w([P, 35, 0], [I, 40, 0], [K, 25, 0, 60]),
      w([S, 40, 0], [I, 30, 0], [K, 30, 0, 60]),
      w([P, 30, 0], [I, 35, 0], [K, 20, 0, 60], [S, 15, 0, 100]),
    ],
  },
  {
    id: 'td11', name: '潮雾夹击', index: 10, map: 'F', chapter: 2, hq: 7, gold: 275, waveTicks: 340, scale: 133, pads: 8, garrison: [2, 2], fog: [0], tide: [1, 3, 4, 6, 8, 9, 11], sluice: TD_SLUICE_USES,
    waves: [
      w([S, 100, 0]),
      w([S, 60, 0], [X, 40, 1]),
      w([P, 20, 0], [I, 40, 0], [S, 40, 0, 40]),
      w([S, 50, 1], [F, 30, 0], [X, 20, 1, 40]),
      w([I, 40, 0], [K, 40, 0], [S, 20, 0, 60]),
      w([P, 40, 0], [S, 40, 0], [X, 20, 1, 40]),
      w([K, 40, 1], [I, 30, 0], [F, 30, 0, 50]),
      note('工兵是布衣，火克；墙被炸开后路线会重画', w([S, 40, 0], [X, 40, 1], [P, 20, 0, 50])),
      w([I, 40, 0], [K, 40, 1], [S, 20, 0, 40]),
      w([F, 30, 0], [P, 40, 0], [I, 30, 1, 60]),
      w([X, 35, 1], [K, 35, 0], [I, 30, 0, 40]),
      w([I, 35, 1], [F, 25, 0], [S, 40, 1, 60]),
    ],
  },
  {
    id: 'td12', name: '暴潮之夜', index: 11, map: 'D', chapter: 2, hq: 7, gold: 600, waveTicks: 330, scale: 120, pads: 8, garrison: [2, 2], tide: [1, 2, 4, 5, 7, 8, 10, 11], sluice: TD_SLUICE_USES,
    waves: [
      w([S, 100, 0]),
      w([S, 60, 2], [I, 40, 1]),
      w([I, 40, 2], [S, 40, 2, 30], [K, 20, 1, 40]),
      w([P, 20, 0], [S, 50, 1], [X, 30, 0, 40]),
      w([K, 40, 2], [K, 30, 2], [I, 30, 2, 40]),
      w([I, 40, 2], [S, 40, 2], [P, 20, 0, 60]),
      w([X, 30, 1], [K, 30, 0], [S, 30, 1], [K, 10, 0, 50]),
      w([I, 40, 2], [K, 40, 2], [K, 20, 2, 40]),
      w([P, 15, 1], [S, 50, 0], [I, 35, 1, 40]),
      w([K, 40, 2], [I, 30, 2], [X, 15, 2], [S, 15, 2, 60]),
      w([K, 35, 0], [P, 15, 1], [I, 35, 1], [S, 15, 0, 60]),
      note('第二章的最后一关：三路的取舍，放弃一路交给英雄和拒马', w([I, 35, 2], [K, 30, 2], [S, 25, 2, 30], [K, 10, 2, 60])),
    ],
  },
  // ---------------------------------------------------------------- 第三章：炸塔工兵、绕后鹦鹉、首领发怒
  {
    id: 'td13', name: '工兵营', index: 12, map: 'G', chapter: 3, hq: 7, gold: 300, waveTicks: 320, scale: 140, pads: 8, garrison: [2, 2], sapperJam: true,
    waves: [
      w([S, 100, 0]),
      note('工兵会炸哑 3 格内的塔：先打工兵，塔别扎堆', w([X, 35, 0], [S, 65, 1])),
      w([X, 35, 1], [I, 35, 0], [S, 30, 0, 40]),
      w([S, 60, 0], [X, 40, 0, 40]),
      w([I, 50, 1], [X, 30, 0], [S, 20, 0, 40]),
      w([K, 40, 0], [X, 35, 1], [S, 25, 1, 40]),
      w([X, 35, 0], [I, 40, 1], [S, 25, 0, 40]),
      w([S, 40, 1], [X, 40, 0], [K, 20, 0, 50]),
      w([I, 40, 1], [X, 40, 0], [S, 20, 0, 60]),
      w([X, 35, 0], [K, 30, 1], [I, 35, 0, 40]),
    ],
  },
  {
    id: 'td14', name: '绕后的鹦鹉', index: 13, map: 'H', chapter: 3, hq: 8, gold: 780, waveTicks: 320, scale: 175, elite: { scale: 175 }, pads: 8, garrison: [2, 2], flank: true,
    waves: [
      w([S, 100, 0]),
      w([P, 20, 2], [S, 80, 1]),
      note('鹦鹉分两批：东边先到，北边隔一会儿再来', w([P, 30, 2], [P, 30, 0, 120], [I, 40, 1])),
      w([S, 60, 1], [K, 40, 0]),
      note('鹦鹉从东边、西边两头绕', w([P, 30, 2], [P, 30, 1, 100], [S, 40, 0, 40])),
      w([I, 50, 0], [S, 30, 1], [K, 20, 2, 40]),
      w([P, 35, 2], [P, 25, 0, 110], [S, 40, 1]),
      w([S, 40, 1], [I, 40, 2], [K, 20, 0, 40]),
      note('最大的鹦鹉群：东西两头一起绕', w([P, 30, 2], [P, 25, 1, 100], [I, 30, 0], [S, 15, 0, 40])),
      w([I, 40, 1], [K, 30, 2], [P, 20, 0, 60], [S, 10, 0, 40]),
    ],
  },
  {
    id: 'td15', name: '炸塔与绕后', index: 14, map: 'H', chapter: 3, hq: 8, gold: 490, waveTicks: 320, scale: 110, pads: 8, wrecks: [6, 7], garrison: [2, 2], flank: true, sapperJam: true,
    waves: [
      w([S, 100, 0]),
      w([X, 30, 1], [P, 30, 2], [S, 40, 0]),
      w([I, 40, 0], [X, 30, 2], [S, 30, 1]),
      note('工兵先炸塔，鹦鹉趁哑火的空当飞进来', w([P, 40, 2], [X, 30, 0, 60], [S, 30, 1, 40])),
      w([K, 40, 1], [X, 30, 2], [I, 30, 0]),
      w([P, 35, 2], [I, 40, 1], [S, 25, 0, 40]),
      w([X, 35, 0], [P, 30, 1, 80], [K, 35, 2]),
      w([S, 40, 1], [X, 30, 2], [I, 30, 0, 40]),
      note('鹦鹉和工兵同时压上来', w([P, 35, 2], [X, 30, 1, 40], [I, 25, 0], [S, 10, 0, 60])),
      w([K, 35, 2], [X, 30, 0], [P, 20, 1, 60], [I, 15, 1]),
      w([X, 30, 1], [I, 30, 2], [P, 25, 0], [S, 15, 0, 60]),
    ],
  },
  {
    id: 'td16', name: '船长的怒火', index: 15, map: 'G', chapter: 3, hq: 8, gold: 360, waveTicks: 320, scale: 185, elite: { scale: 185, kind: 'mate' }, pads: 9, garrison: [3, 3, 3], bossSkill: true,
    waves: [
      w([S, 100, 0]),
      w([I, 40, 1], [S, 60, 0]),
      w([P, 25, 0], [K, 35, 1], [S, 40, 0, 40]),
      w([X, 30, 0], [I, 40, 1], [S, 30, 0, 40]),
      w([I, 50, 0], [K, 30, 1], [S, 20, 0, 50]),
      w([P, 35, 0], [S, 40, 1], [X, 25, 1, 40]),
      note('第一个首领：血量过半会发怒，召水手并炸哑最近的两座塔', boss([C, 0, 0], [S, 50, 0, 30], [I, 50, 1, 20])),
      w([S, 40, 1], [I, 40, 0], [K, 20, 0, 40]),
      w([P, 30, 0], [X, 25, 1], [I, 30, 0], [S, 15, 0, 60]),
      w([K, 35, 1], [I, 45, 0], [S, 20, 0, 40]),
      note('第二个首领：首领波前把塔挪开', boss([C, 0, 0], [S, 35, 0, 20], [I, 35, 1, 20], [P, 30, 0, 40])),
    ],
  },
  {
    id: 'td17', name: '海盗联军', index: 16, map: 'I', chapter: 3, hq: 8, gold: 525, waveTicks: 320, scale: 130, pads: 9, wrecks: [7, 8], garrison: [3, 3, 3], flank: true, sapperJam: true, bossSkill: true, battery: BATTERY_I,
    waves: [
      w([S, 100, 0]),
      w([I, 40, 1], [P, 30, 2], [S, 30, 0]),
      w([S, 40, 1], [X, 30, 0], [I, 30, 1, 40]),
      w([I, 40, 0], [K, 30, 1], [P, 30, 2, 60]),
      w([X, 35, 0], [S, 40, 1], [I, 25, 0, 40]),
      // 第 6 波起份额合计只有 65：后半段留给塔少的守法（少造升满阶）也守得住，前几波的难度不变
      w([P, 26, 2], [K, 20, 1], [S, 20, 0, 50]),
      w([I, 26, 1], [X, 20, 1], [S, 20, 0]),
      w([K, 23, 0], [P, 23, 2, 40], [I, 20, 1, 20]),
      note('首领和一整队护卫', boss([C, 0, 1], [S, 23, 1, 30], [K, 16, 0, 30], [P, 26, 2, 60])),
      w([S, 26, 0], [I, 26, 1], [K, 13, 0, 40]),
      w([I, 23, 0], [X, 16, 1], [P, 16, 2, 40], [S, 10, 1, 60]),
      w([K, 20, 1], [I, 23, 0], [P, 13, 2, 60], [S, 10, 1, 60]),
    ],
  },
  {
    id: 'td18', name: '黑胡子', index: 17, map: 'I', chapter: 3, hq: 8, gold: 860, waveTicks: 320, scale: 98, pads: 10, garrison: [3, 3, 3], fog: [0, 1], tide: [1, 2, 5, 6, 9, 10],
    flank: true, sapperJam: true, bossSkill: true, battery: BATTERY_I,
    waves: [
      w([S, 100, 0]),
      w([I, 40, 3], [S, 40, 1], [F, 20, 3, 30]),
      w([P, 35, 2], [X, 25, 3], [S, 40, 3]),
      w([K, 40, 0], [I, 40, 1], [F, 20, 0, 40]),
      w([S, 45, 1], [X, 30, 0], [P, 25, 2, 60]),
      w([I, 40, 3], [K, 30, 3], [S, 30, 3, 40]),
      w([P, 35, 2], [X, 25, 3], [F, 20, 3, 40], [S, 20, 3, 60]),
      // 第 8 波起份额合计只有 55–80（首领波 80，船长的 120 点不缩）：后半段留给塔少的守法（少造升满阶）也守得住，前几波的难度不变
      w([I, 22, 0], [K, 19, 1], [S, 14, 0, 40]),
      note('第一个首领：三路的敌人一起压上来', boss([C, 0, 0], [S, 28, 1, 30], [I, 28, 0, 30], [P, 24, 2, 60])),
      w([X, 17, 3], [I, 22, 3], [K, 17, 3]),
      w([P, 17, 2], [X, 14, 0], [I, 17, 1], [S, 8, 1, 40]),
      note('最后一个首领：黑胡子', boss([C, 0, 0], [S, 24, 0, 20], [I, 24, 1, 20], [K, 12, 0, 40], [P, 20, 2, 60])),
    ],
  },
];

// ---------------------------------------------------------------- 展开成引擎吃的关卡

/** 每种敌人两个之间最短隔几拍；一组最长放出去的时间（拍）按敌人给 */
const SPAN: Readonly<Record<TdEnemyKind, { span: number; min: number }>> = {
  sailor: { span: 280, min: 7 },
  ironclad: { span: 300, min: 22 },
  fog: { span: 260, min: 16 },
  skiff: { span: 280, min: 18 },
  skiffling: { span: 200, min: 10 },
  sapper: { span: 280, min: 22 },
  parrot: { span: 220, min: 8 },
  captain: { span: 1, min: 1 },
  grenadier: { span: 300, min: 20 },
  shield: { span: 300, min: 20 },
  bosun: { span: 280, min: 20 },
  macaw: { span: 220, min: 16 },
  mate: { span: 280, min: 20 },
};

/** 精英从第几波（0 起）出、占水手和鹦鹉份额的百分之几；精英一个顶四个（TD2_ENEMY_POINTS） */
export const TD_ELITE = { from: 3, pct: 60 } as const;
const ELITE_OF: Partial<Record<TdEnemyKind, TdEnemyKind>> = { sailor: 'bosun', parrot: 'macaw' };

function everyOf(kind: TdEnemyKind, n: number): number {
  const s = SPAN[kind];
  return Math.max(s.min, Math.floor(s.span / Math.max(1, n)));
}

/**
 * 一波的组：预算先扣掉首领（固定 1 个），剩下的按份额分给各组，个数 = 份额 ÷ 敌人点数（四舍五入，至少 1 个；份额 0 的组不出）。
 * budgetPct：预算整体再乘多少百分比（100 = 原样；td-sim 用 98 / 102 量"预算 ±2%"）。
 */
function expand(r: WaveRecipe, budget: number, elite: Partial<Record<TdEnemyKind, TdEnemyKind>> | null = null): TdWave {
  let left = budget;
  const groups: TdGroup[] = [];
  for (const [kind, , lane] of r.groups) {
    if (kind !== 'captain') continue;
    groups.push({ enemy: 'captain', n: 1, lane, every: 1 });
    left = Math.max(0, left - TD2_ENEMY_POINTS.captain);
  }
  const put = (kind: TdEnemyKind, share: number, lane: number, delay: number | undefined): void => {
    const n = Math.max(1, Math.round((left * share) / 100 / TD2_ENEMY_POINTS[kind]));
    groups.push({ enemy: kind, n, lane, every: everyOf(kind, n), ...(delay ? { delay } : {}) });
  };
  for (const [kind, share, lane, delay] of r.groups) {
    if (kind === 'captain' || share <= 0) continue;
    const ek = elite?.[kind];
    if (!ek) {
      put(kind, share, lane, delay);
      continue;
    }
    put(ek, (share * TD_ELITE.pct) / 100, lane, delay);
    put(kind, (share * (100 - TD_ELITE.pct)) / 100, lane, delay);
  }
  const out: TdWave = { groups };
  if (r.boss) out.boss = true;
  if (r.note) out.note = r.note;
  return out;
}

/**
 * 一关的波次（预算按 budgetPct 缩放）。带精英配方的关，每一波是新旧两套组并排：旧的带 until、新的带 since（RULES_SINCE.tdElite，换大副的是 tdMate），
 * 引擎按局的规则版本挑一套（createTd）
 */
export function levelWaves(def: LevelDef, budgetPct = 100): TdWave[] {
  const budget = (i: number, scale: number): number => Math.floor((waveBudget(def.index, i) * scale * budgetPct) / 10_000);
  return def.waves.map((r, i) => {
    const old = expand(r, budget(i, def.scale ?? 100));
    if (!def.elite) return old;
    const kinds = def.elite.kind ? { ...ELITE_OF, sailor: def.elite.kind } : ELITE_OF;
    const now = expand(r, budget(i, def.elite.scale), i >= (def.elite.from ?? TD_ELITE.from) ? kinds : null);
    const since = def.elite.kind ? RULES_SINCE.tdMate : RULES_SINCE.tdElite;
    return { ...old, groups: [...old.groups.map((g) => ({ ...g, until: since })), ...now.groups.map((g) => ({ ...g, since }))] };
  });
}

/**
 * 造一关。budgetPct：波次预算再乘多少百分比，配平和 td-sim 的"预算 ±2%"用，正式关卡是 100。
 * 木台取地图的前 pads 个，wrecks 里的下标压着沉船；驻守台取前 garrison.length 个，封顶阶按关卡写。
 */
export function buildLevel(def: LevelDef, budgetPct = 100): TdIslandLevel {
  const spec = TD2_MAP_SPECS.get(def.map);
  const map = TD2_MAPS.find((m) => m.id === def.map);
  if (!spec || !map) throw new Error(`没有这张图：${def.map}`);
  const pads: TdPadDef[] = map.pads.slice(0, def.pads).map((p, i) => ({ ...p, ...(def.wrecks?.includes(i) ? { wreck: { hp: TD2_ECON.wreckHp } } : {}) }));
  const garrison: TdGarrisonSpot[] = def.garrison.map((cap, i) => ({ ...(map.garrison[i] as TdGarrisonSpot), cap }));
  const tideLane = map.tide as { x: number; y: number } | undefined;
  const open = Array.isArray(def.tide) ? def.tide : undefined;
  const lv: TdIslandLevel = {
    id: def.id,
    name: def.name,
    index: def.index,
    map: def.map,
    chapter: def.chapter,
    hq: def.hq,
    hpPct: 100,
    gold: def.gold,
    first: 400,
    waveTicks: def.waveTicks,
    layout: mapLayout(spec, def.hq),
    lanes: map.lanes.map((p) => ({ ...p })),
    ...(tideLane && def.tide !== undefined ? { tide: { wave: typeof def.tide === 'number' ? def.tide : 0, lane: { ...tideLane } } } : {}),
    ...(open ? { tideOpen: [...open] } : {}),
    ...(def.fog && map.fogZones ? { fogZones: def.fog.map((i) => ({ ...(map.fogZones![i] as { x: number; y: number; r: number }) })) } : {}),
    ...(def.bossSkill ? { bossSkill: SKILL } : {}),
    ...(def.sapperJam ? { sapperJam: SAP } : {}),
    ...(def.flank ? { flank: true } : {}),
    ...(def.bossExtraTicks ? { bossExtra: def.bossExtraTicks } : {}),
    ...(def.sluice ? { sluice: def.sluice } : {}),
    ...(def.battery ? { battery: { ...def.battery } } : {}),
    ...(def.crates ? { crates: def.crates.map((c) => ({ ...c })) } : {}),
    slots: pads,
    garrison,
    kegs: map.kegs.map((p) => ({ ...p })),
    obstacles: [],
    waves: levelWaves(def, budgetPct),
  };
  return lv;
}

export const TD2_LEVEL_DEFS: readonly LevelDef[] = DEFS;
export const TD2_LEVELS: readonly TdIslandLevel[] = DEFS.map((d) => buildLevel(d));
export const TD2_LEVEL_BY_ID: ReadonlyMap<string, TdIslandLevel> = new Map(TD2_LEVELS.map((l) => [l.id, l]));

/** 选关页的章节 */
export interface Td2ChapterInfo {
  id: 1 | 2 | 3;
  name: string;
  theme: string;
  levels: TdIslandLevel[];
}

export const TD2_CHAPTERS: readonly Td2ChapterInfo[] = [
  { id: 1, name: '第一章', theme: '登陆、铁甲、雾船、鹦鹉、船长', levels: TD2_LEVELS.filter((l) => l.chapter === 1) },
  { id: 2, name: '第二章', theme: '潮水涨落 · 成片的雾', levels: TD2_LEVELS.filter((l) => l.chapter === 2) },
  { id: 3, name: '第三章', theme: '炸塔工兵 · 绕后鹦鹉 · 首领发怒', levels: TD2_LEVELS.filter((l) => l.chapter === 3) },
];
