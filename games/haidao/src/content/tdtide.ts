/**
 * 大潮无尽（DESIGN.md 10.6e）的内容：每周一张固定的图（手写模板，按周种子轮换，再按种子镜像）和按波数现生成的无限波次。
 * 岛、常驻塔、分叉、英雄等级都写死，和悬赏守岛同一个原则：不看玩家自己的岛和养成，只有局内决策影响成绩。
 * 独立写、不借第一二三章和悬赏岛：那些会被调数值，大潮的配平表不能跟着变。
 * 改这里的任何东西（模板、敌人配比、血量曲线）都要跑 `node tools/td-tide-sim.ts` 并更新 DESIGN 10.6e 的实测表。
 * 坐标是格子（岛 22×22），默认朝向；左右镜像由 core/tdtide.ts 按周种子做。
 */
import { hash32 } from '../core/rng.ts';
import { waveBudget } from '../core/td2types.ts';
import { TD2_ENEMY_POINTS } from './td2units.ts';
import type { BuildingKind, Placed } from '../core/types.ts';
import type { TdEnemyKind, TdGroup, TdLevel, TdWave } from '../core/tdtypes.ts';

export interface TideMap {
  /** 图名（选关页、结算页显示） */
  name: string;
  /** 一句话特点 */
  blurb: string;
  layout: Placed[];
  /** 英雄等级（固定） */
  hero: number;
  lanes: Array<{ x: number; y: number }>;
  /** 落潮路（涨落：有些波开、有些波关） */
  tide: { x: number; y: number };
  fogZones: Array<{ x: number; y: number; r: number }>;
  kegs: Array<{ x: number; y: number }>;
  obstacles: TdLevel['obstacles'];
  slots: Array<{ x: number; y: number }>;
  /** 敌人基础血量百分比（各图的塔位、路线强弱不同，用它把四张图的难度拉平） */
  hp: number;
  /** 有东路绕后（鹦鹉分批从东边来；机器人和界面认） */
  flank: boolean;
}

/** 一座常驻塔：[种类, 等级, 左上角 x, y, 分叉] */
type T = [BuildingKind, number, number, number, string[]?];

function island(towers: T[], treasure: [number, number], walls: Array<[number, number]>, mines: Array<[number, number]>): Placed[] {
  const out: Placed[] = [];
  const add = (kind: BuildingKind, level: number, x: number, y: number, branch?: string[]): void => {
    out.push({ id: out.length + 1, kind, level, x, y, ...(branch ? { branch } : {}) });
  };
  add('hq', 5, 9, 9);
  add('treasure', 1, treasure[0], treasure[1]);
  for (const [kind, level, x, y, branch] of towers) add(kind, level, x, y, branch);
  for (const [x, y] of walls) add('wall', 4, x, y);
  for (const [x, y] of mines) add('mine', 4, x, y);
  return out;
}

const row = (xs: number[], y: number): Array<[number, number]> => xs.map((x) => [x, y]);
const col = (x: number, ys: number[]): Array<[number, number]> => ys.map((y) => [x, y]);

export const TIDE_MAPS: readonly TideMap[] = [
  {
    // 双口湾：北口、西路两条路，落潮时南边多一条；北边一排墙留口子，塔守口子
    name: '双口湾',
    hp: 125,
    blurb: '北口和西路，南边落潮',
    hero: 5,
    layout: island(
      [
        ['cannon', 5, 7, 6, ['cannon.pierce']], ['gunTower', 5, 13, 6, ['gunTower.rapid']], ['cannon', 5, 6, 13, ['cannon.grape']],
        ['gunTower', 5, 13, 13, ['gunTower.lighthouse']], ['mortar', 5, 9, 16, ['mortar.fire']], ['rocket', 5, 16, 9, ['rocket.flak']],
      ],
      [10, 13], row([5, 6, 7, 8, 13, 14, 15, 16], 5), [[5, 11], [15, 11]],
    ),
    lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }],
    tide: { x: 11, y: 23 },
    fogZones: [{ x: 10, y: 2, r: 2.4 }, { x: 11, y: 19, r: 2.4 }],
    kegs: [{ x: 10, y: 0 }, { x: 11, y: 0 }, { x: 10, y: 1 }, { x: 0, y: 10 }, { x: 0, y: 11 }],
    obstacles: [
      { kind: 'wreck', x: 0, y: 13, size: 2, hp: 400, gold: 30 },
      { kind: 'barrel', x: 8, y: 1, size: 1, hp: 120, gold: 12 },
      { kind: 'barrel', x: 13, y: 1, size: 1, hp: 120, gold: 12 },
    ],
    slots: [{ x: 5, y: 7 }, { x: 15, y: 7 }, { x: 2, y: 12 }, { x: 15, y: 15 }, { x: 11, y: 19 }],
    flank: false,
  },
  {
    // 三叉滩：北、西、东三条路，鹦鹉从东边绕；塔分守三面，南边落潮
    name: '三叉滩',
    hp: 120,
    blurb: '三面来船，东边有鹦鹉绕后',
    hero: 5,
    layout: island(
      [
        ['cannon', 5, 7, 6, ['cannon.pierce']], ['gunTower', 5, 13, 6, ['gunTower.marksman']], ['cannon', 5, 6, 13, ['cannon.chain']],
        ['gunTower', 5, 13, 13, ['gunTower.lighthouse']], ['mortar', 5, 9, 16, ['mortar.fire']], ['rocket', 5, 17, 10, ['rocket.flak']],
        ['gunTower', 5, 4, 9, ['gunTower.rapid']],
      ],
      [10, 13], row([6, 7, 8, 13, 14, 15], 5), [[15, 12]],
    ),
    lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }, { x: 23, y: 10 }],
    tide: { x: 11, y: 23 },
    fogZones: [{ x: 10, y: 2, r: 2.2 }, { x: 1, y: 11, r: 2 }, { x: 11, y: 19, r: 2.4 }],
    kegs: [{ x: 10, y: 0 }, { x: 11, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 11 }, { x: 21, y: 10 }],
    obstacles: [
      { kind: 'wreck', x: 20, y: 13, size: 2, hp: 400, gold: 30 },
      { kind: 'barrel', x: 8, y: 1, size: 1, hp: 120, gold: 12 },
      { kind: 'barrel', x: 13, y: 1, size: 1, hp: 120, gold: 12 },
    ],
    slots: [{ x: 5, y: 7 }, { x: 15, y: 7 }, { x: 2, y: 13 }, { x: 18, y: 13 }, { x: 11, y: 19 }],
    flank: true,
  },
  {
    // 东风礁：西路和北边偏东一条路（双口湾转了个向），喷火和鱼叉守口，东边落潮
    name: '东风礁',
    hp: 165,
    blurb: '西路和北路，东边落潮，近身火力强',
    hero: 5,
    layout: island(
      [
        ['flame', 5, 6, 7, ['flame.napalm']], ['gunTower', 5, 6, 13, ['gunTower.rapid']], ['harpoon', 5, 13, 6, ['harpoon.pierce']],
        ['gunTower', 5, 13, 13, ['gunTower.lighthouse']], ['mortar', 5, 16, 9, ['mortar.wide']], ['cannon', 5, 9, 16, ['cannon.pierce']],
      ],
      [13, 10], col(5, [6, 7, 8, 13, 14, 15, 16]), [[11, 5], [11, 15]],
    ),
    lanes: [{ x: -2, y: 10 }, { x: 11, y: -2 }],
    tide: { x: 23, y: 11 },
    fogZones: [{ x: 2, y: 10, r: 2.4 }, { x: 19, y: 11, r: 2.4 }],
    kegs: [{ x: 0, y: 10 }, { x: 0, y: 11 }, { x: 1, y: 10 }, { x: 10, y: 0 }, { x: 11, y: 0 }],
    obstacles: [
      { kind: 'wreck', x: 13, y: 0, size: 2, hp: 400, gold: 30 },
      { kind: 'barrel', x: 1, y: 8, size: 1, hp: 120, gold: 12 },
      { kind: 'barrel', x: 1, y: 13, size: 1, hp: 120, gold: 12 },
    ],
    slots: [{ x: 7, y: 5 }, { x: 7, y: 15 }, { x: 12, y: 2 }, { x: 15, y: 15 }, { x: 19, y: 11 }],
    flank: false,
  },
  {
    // 回廊岛：北、南两头来船，西边落潮；塔分守南北，宝藏箱在正中，英雄两头跑
    name: '回廊岛',
    hp: 127,
    blurb: '南北两头来船，西边落潮',
    hero: 5,
    layout: island(
      [
        ['cannon', 5, 7, 6, ['cannon.pierce']], ['gunTower', 5, 13, 6, ['gunTower.rapid']], ['cannon', 5, 7, 14, ['cannon.grape']],
        ['gunTower', 5, 13, 14, ['gunTower.lighthouse']], ['mortar', 5, 4, 9, ['mortar.fire']], ['rocket', 5, 16, 10, ['rocket.flak']],
      ],
      [10, 13], [...row([5, 6, 8, 13, 15, 16], 5), ...row([5, 6, 8, 13, 15, 16], 17)], [[5, 11], [15, 12]],
    ),
    lanes: [{ x: 10, y: -2 }, { x: 11, y: 23 }],
    tide: { x: -2, y: 11 },
    fogZones: [{ x: 10, y: 2, r: 2.4 }, { x: 11, y: 19, r: 2.4 }, { x: 1, y: 11, r: 2 }],
    kegs: [{ x: 10, y: 0 }, { x: 11, y: 0 }, { x: 10, y: 21 }, { x: 11, y: 21 }, { x: 0, y: 10 }],
    obstacles: [
      { kind: 'wreck', x: 19, y: 13, size: 2, hp: 400, gold: 30 },
      { kind: 'barrel', x: 8, y: 1, size: 1, hp: 120, gold: 12 },
      { kind: 'barrel', x: 13, y: 20, size: 1, hp: 120, gold: 12 },
    ],
    slots: [{ x: 5, y: 7 }, { x: 15, y: 7 }, { x: 5, y: 15 }, { x: 15, y: 15 }, { x: 2, y: 12 }],
    flank: false,
  },
];

// ---------------------------------------------------------------- 波次

/** 敌人解锁的波（0 起）：前几波只有水手，越往后种类越多 */
const UNLOCK: Record<Exclude<TdEnemyKind, 'skiffling' | 'captain' | 'shield' | 'bosun' | 'macaw' | 'mate'>, number> = { sailor: 0, ironclad: 2, skiff: 4, fog: 5, parrot: 6, sapper: 8, grenadier: 7 };
/** 一个敌人折多少点：和战役同一张表（TD2_ENEMY_POINTS），预算也走同一条公式 */
const COST = TD2_ENEMY_POINTS;
/** 大潮的预算按战役里第几关（0 起）的底数算：靠这个把"开局多难"和战役对上，往后的涨幅靠 hpPct 曲线 */
export const TIDE_LEVEL = 4;
/** 每 N 波一个首领波（从第 N 波起：第 8、16、24… 波） */
export const TIDE_BOSS_EVERY = 8;
/** 雾区从第几波起起作用（开了这么多波之后）、炸塔工兵的冲击波 */
export const TIDE_FOG_FROM = 8;

/** 第 w 波（0 起）敌人血量再乘多少百分比：线性往上，10 波后每波再多涨一点 */
export function tideHpPct(w: number): number {
  return 100 + 9 * w + (w > 10 ? 3 * (w - 10) : 0);
}

/** 第 w 波（0 起）的预算点数：waveBudget(TIDE_LEVEL, w) */
export function tideBudget(w: number): number {
  return waveBudget(TIDE_LEVEL, w);
}

/**
 * 第 w 波（0 起）：只由波数、周种子和图的路数决定。
 * 做法：先算这一波的预算，主打一种解锁了的敌人（占一半）、再配一种（占三成），剩下补水手；每隔 TIDE_BOSS_EVERY 波是首领波，
 * 首领加护卫（三成预算）。登陆路按哈希挑：前三波只走北口 / 西路，落潮路（下标 = 路数）第 4 波起才会被挑到。
 */
export function tideWave(w: number, seed: number, lanes: number, tide: boolean, rules = 10): TdWave {
  const h = (k: number): number => hash32(`tide-${w}-${k}`, seed);
  // 掷弹兵这版不进大潮：一进来回廊岛一张图普通机器人少撑 13 波，周榜中途变难不公平；下周换榜时再放开（DESIGN 13）
  void rules;
  const unlocked = (Object.keys(UNLOCK) as Array<keyof typeof UNLOCK>).filter((k) => UNLOCK[k] <= w && k !== 'grenadier');
  const boss = w % TIDE_BOSS_EVERY === TIDE_BOSS_EVERY - 1;
  let budget = tideBudget(w);
  const groups: TdGroup[] = [];
  const laneFor = (k: number, fly: boolean): number => {
    const n = fly || !tide || w < 3 ? lanes : lanes + 1;
    const c = h(100 + k) % n;
    // 前三波只用 0、1 号路，免得开局三面受敌
    return w < 3 ? Math.min(c, Math.min(1, lanes - 1)) : c;
  };
  const add = (kind: keyof typeof UNLOCK, pts: number, k: number, delay = 0): void => {
    const n = Math.max(1, Math.floor(pts / COST[kind]));
    const every = Math.max(8, Math.floor((26 - Math.floor(w / 2)) * (kind === 'ironclad' || kind === 'grenadier' ? 2 : kind === 'sapper' ? 1.5 : 1)));
    groups.push({ enemy: kind, n, lane: laneFor(k, kind === 'parrot'), every, ...(delay > 0 ? { delay } : {}) });
  };
  if (boss) {
    const escort = Math.floor((budget * 3) / 10);
    budget -= escort;
    groups.push({ enemy: 'captain', n: 1 + Math.floor(w / (TIDE_BOSS_EVERY * 3)), lane: laneFor(7, false), every: 120 });
    const k2 = unlocked[h(1) % unlocked.length]!;
    add(k2, escort, 8, 40);
  }
  const main = unlocked[1 + (h(2) % Math.max(1, unlocked.length - 1))] ?? 'sailor';
  const second = unlocked[h(3) % unlocked.length]!;
  add(main, Math.floor(budget / 2), 1);
  if (second !== main) add(second, Math.floor((budget * 3) / 10), 2, 40);
  add('sailor', Math.max(COST.sailor, budget - Math.floor(budget / 2) - Math.floor((budget * 3) / 10)), 3, 20);
  const wave: TdWave = { groups, hpPct: tideHpPct(w) };
  if (boss) wave.boss = true;
  if (groups.some((g) => g.enemy === 'parrot') && w < 12) wave.note = '鹦鹉群来了，要能打飞的塔';
  else if (groups.some((g) => g.enemy === 'grenadier') && w < 16) wave.note = '掷弹兵：先用火';
  return wave;
}
