/**
 * 悬赏守岛（实盘，DESIGN.md 10.5）的四档岛：岛、常驻塔、分叉、临时塔位、波次、英雄等级都写死，只由档位决定。
 * 独立写、不借第一章和测试关：那些关会被调数值，实盘的配平表不能跟着变（教训见 DESIGN 4.3）。
 * 改这里的任何东西都要重跑 `node tools/td-live-sim.ts` 并更新 DESIGN 10.5 的实测表。
 * 坐标是格子（岛 22×22），默认朝向；左右镜像由 core/tdlive.ts 按种子最低位做。
 */
import type { LiveTier } from '../core/live.ts';
import type { BuildingKind, Placed } from '../core/types.ts';
import type { TdEnemyKind, TdGroup, TdLevel, TdWave } from '../core/tdtypes.ts';

/** [敌人, 个数, 登陆路, 间隔拍, 延迟拍] */
type G = [TdEnemyKind, number, number, number, number?];
function wave(...groups: G[]): TdWave {
  return { groups: groups.map(([enemy, n, lane, every, delay]): TdGroup => ({ enemy, n, lane, every, ...(delay ? { delay } : {}) })) };
}
function boss(...groups: G[]): TdWave {
  return { ...wave(...groups), boss: true };
}

export interface TdLiveIsland {
  layout: Placed[];
  level: TdLevel;
  /** 英雄等级（固定，不看玩家的研究） */
  hero: number;
}

/** 一座常驻塔：[种类, 等级, 左上角 x, y, 分叉] */
type T = [BuildingKind, number, number, number, string[]?];

function island(towers: T[], treasures: Array<[number, number]>, hqLevel: number, walls: boolean, mines: boolean): Placed[] {
  const out: Placed[] = [];
  const add = (kind: BuildingKind, level: number, x: number, y: number, branch?: string[]): void => {
    out.push({ id: out.length + 1, kind, level, x, y, ...(branch ? { branch } : {}) });
  };
  add('hq', hqLevel, 9, 9);
  for (const [x, y] of treasures) add('treasure', 1, x, y);
  for (const [kind, level, x, y, branch] of towers) add(kind, level, x, y, branch);
  // 北边一排墙，中间留 4 格的口子：敌人从口子进，塔守口子
  if (walls) for (const x of [5, 6, 7, 8, 13, 14, 15, 16]) add('wall', 3, x, 5);
  if (mines) {
    add('mine', 3, 5, 11);
    add('mine', 3, 15, 11);
  }
  return out;
}

const LANES = [{ x: 10, y: -2 }, { x: -2, y: 11 }];
const TIDE = { x: 11, y: 23 };
const KEGS = [{ x: 10, y: 0 }, { x: 11, y: 0 }, { x: 10, y: 1 }, { x: 0, y: 10 }, { x: 0, y: 11 }];
const OBST: TdLevel['obstacles'] = [
  { kind: 'wreck', x: 0, y: 13, size: 2, hp: 400, gold: 30 },
  { kind: 'barrel', x: 8, y: 1, size: 1, hp: 120, gold: 12 },
  { kind: 'barrel', x: 13, y: 1, size: 1, hp: 120, gold: 12 },
];
/** 临时塔位（2×2 左上角）：守北口两侧、西路、东南、南边落潮路。豪华档少最后一个 */
const SLOTS = [{ x: 5, y: 7 }, { x: 15, y: 7 }, { x: 2, y: 12 }, { x: 15, y: 15 }, { x: 11, y: 19 }];

export const TD_LIVE_ISLANDS: Record<LiveTier, TdLiveIsland> = {
  small: {
    // 小：一个宝藏箱，两条路（北、西），4 座 3 级塔，水手和铁甲
    hero: 3,
    layout: island(
      [['cannon', 3, 7, 6, ['cannon.pierce']], ['gunTower', 3, 13, 6, ['gunTower.rapid']], ['cannon', 3, 6, 13, ['cannon.grape']], ['gunTower', 3, 13, 13, ['gunTower.rapid']]],
      [[10, 13]], 3, true, false,
    ),
    level: {
      id: 'live-small', name: '小岛悬赏', hq: 3, hpPct: 203, gold: 200, first: 240, waveTicks: 360,
      lanes: LANES, kegs: KEGS, obstacles: OBST, slots: SLOTS.slice(0, 4),
      waves: [
        wave(['sailor', 6, 0, 28]),
        wave(['sailor', 6, 1, 25], ['sailor', 4, 0, 28, 60]),
        wave(['ironclad', 2, 0, 60], ['sailor', 5, 1, 25]),
        wave(['sailor', 8, 0, 20], ['ironclad', 2, 1, 60, 40]),
        wave(['ironclad', 3, 0, 50], ['sailor', 6, 1, 22]),
        wave(['sailor', 8, 1, 20], ['ironclad', 3, 0, 50, 40]),
        wave(['ironclad', 4, 1, 45], ['sailor', 8, 0, 20]),
        wave(['ironclad', 4, 0, 40], ['sailor', 8, 1, 18], ['ironclad', 2, 1, 50, 80]),
      ],
    },
  },
  mid: {
    // 中：中岛，落潮多一条南路，6 座 4 级塔（带 3 级分叉），加雾船、分裂小艇
    hero: 4,
    layout: island(
      [
        ['cannon', 4, 7, 6, ['cannon.pierce']], ['gunTower', 4, 13, 6, ['gunTower.lighthouse']], ['cannon', 4, 6, 13, ['cannon.grape']],
        ['gunTower', 4, 13, 13, ['gunTower.lighthouse']], ['mortar', 4, 9, 16, ['mortar.fire']], ['gunTower', 4, 16, 9, ['gunTower.rapid']],
      ],
      [[10, 13]], 4, true, true,
    ),
    level: {
      id: 'live-mid', name: '中岛悬赏', hq: 4, hpPct: 190, gold: 220, first: 240, waveTicks: 360,
      lanes: LANES, tide: { wave: 4, lane: TIDE }, kegs: KEGS, obstacles: OBST, slots: SLOTS,
      waves: [
        wave(['sailor', 8, 0, 25]),
        wave(['fog', 3, 1, 40], ['sailor', 6, 0, 25]),
        wave(['skiff', 3, 0, 50], ['sailor', 6, 1, 25]),
        wave(['ironclad', 3, 1, 50], ['fog', 3, 0, 35, 40]),
        wave(['skiff', 3, 2, 45], ['sailor', 8, 0, 20]),
        wave(['fog', 4, 2, 30], ['ironclad', 3, 1, 50]),
        wave(['skiff', 4, 0, 40], ['sailor', 8, 1, 20], ['fog', 3, 2, 30, 40]),
        wave(['ironclad', 5, 0, 40], ['skiff', 4, 2, 40]),
        wave(['fog', 5, 1, 25], ['skiff', 4, 0, 35], ['ironclad', 3, 2, 50]),
        wave(['sailor', 10, 0, 15], ['fog', 4, 2, 25], ['skiff', 4, 1, 35], ['ironclad', 4, 1, 45, 60]),
      ],
    },
  },
  big: {
    // 大：大岛，两个宝藏箱，8 座 5–6 级塔，加工兵、鹦鹉
    hero: 5,
    layout: island(
      [
        ['cannon', 5, 7, 6, ['cannon.pierce']], ['gunTower', 5, 13, 6, ['gunTower.marksman']], ['cannon', 5, 6, 13, ['cannon.grape']],
        ['gunTower', 5, 13, 13, ['gunTower.lighthouse']], ['mortar', 5, 9, 16, ['mortar.fire']], ['gunTower', 6, 16, 9, ['gunTower.rapid', 'gunTower.keen']],
        ['rocket', 5, 19, 12, ['rocket.flak']], ['cannon', 6, 4, 9, ['cannon.chain', 'cannon.heavy']],
      ],
      [[10, 13], [8, 8]], 5, true, true,
    ),
    level: {
      id: 'live-big', name: '大岛悬赏', hq: 5, hpPct: 96, gold: 260, first: 240, waveTicks: 360,
      lanes: LANES, tide: { wave: 5, lane: TIDE }, kegs: KEGS, obstacles: OBST, slots: SLOTS,
      waves: [
        wave(['sailor', 10, 0, 20]),
        wave(['parrot', 4, 0, 20], ['sailor', 6, 1, 25]),
        wave(['sapper', 2, 0, 60], ['sailor', 8, 0, 20, 40]),
        wave(['fog', 4, 1, 35], ['skiff', 3, 0, 45]),
        wave(['parrot', 5, 1, 16], ['ironclad', 3, 0, 50]),
        wave(['sapper', 3, 2, 45], ['sailor', 8, 1, 20], ['skiff', 3, 0, 40]),
        wave(['ironclad', 5, 0, 40], ['fog', 4, 2, 30]),
        wave(['parrot', 6, 2, 14], ['sapper', 3, 0, 45], ['sailor', 8, 1, 18]),
        wave(['skiff', 5, 1, 30], ['ironclad', 4, 2, 40], ['fog', 4, 0, 28]),
        wave(['sapper', 4, 1, 40], ['parrot', 6, 0, 13], ['ironclad', 4, 2, 40]),
        wave(['fog', 5, 2, 25], ['sailor', 12, 0, 14], ['skiff', 5, 1, 30]),
        wave(['parrot', 7, 1, 12], ['ironclad', 5, 0, 38], ['sapper', 3, 2, 45], ['sailor', 8, 1, 16, 60]),
      ],
    },
  },
  lux: {
    // 豪华：大岛，三个宝藏箱，塔同大档，临时塔位少一个，全部敌人，最后一波首领
    hero: 6,
    layout: island(
      [
        ['cannon', 5, 7, 6, ['cannon.pierce']], ['gunTower', 5, 13, 6, ['gunTower.marksman']], ['cannon', 5, 6, 13, ['cannon.grape']],
        ['gunTower', 5, 13, 13, ['gunTower.lighthouse']], ['mortar', 5, 9, 16, ['mortar.fire']], ['gunTower', 6, 16, 9, ['gunTower.rapid', 'gunTower.keen']],
        ['rocket', 5, 19, 12, ['rocket.flak']], ['cannon', 6, 4, 9, ['cannon.chain', 'cannon.heavy']],
      ],
      [[10, 13], [8, 8], [13, 10]], 6, true, true,
    ),
    level: {
      id: 'live-lux', name: '豪华悬赏', hq: 6, hpPct: 190, gold: 280, first: 240, waveTicks: 360,
      lanes: LANES, tide: { wave: 5, lane: TIDE }, kegs: KEGS, obstacles: OBST, slots: SLOTS.slice(0, 4),
      waves: [
        wave(['sailor', 10, 0, 20]),
        wave(['ironclad', 3, 1, 50], ['sailor', 8, 0, 20]),
        wave(['fog', 4, 0, 30], ['skiff', 3, 1, 40]),
        wave(['parrot', 6, 1, 15], ['sapper', 3, 0, 50]),
        wave(['ironclad', 5, 0, 40], ['fog', 4, 1, 30]),
        wave(['skiff', 5, 2, 30], ['parrot', 6, 0, 15], ['sailor', 8, 1, 20]),
        wave(['sapper', 4, 0, 40], ['ironclad', 4, 2, 50], ['fog', 5, 1, 25]),
        wave(['parrot', 8, 2, 12], ['skiff', 5, 0, 30], ['sailor', 10, 1, 15]),
        wave(['ironclad', 6, 1, 35], ['fog', 6, 0, 25], ['sapper', 3, 2, 50]),
        wave(['parrot', 9, 0, 10], ['skiff', 6, 1, 30], ['ironclad', 4, 2, 40]),
        wave(['fog', 7, 2, 20], ['sailor', 12, 0, 12], ['sapper', 4, 1, 40]),
        boss(['captain', 1, 0, 1], ['sailor', 10, 0, 15, 20], ['ironclad', 4, 1, 40], ['parrot', 6, 2, 15]),
      ],
    },
  },
};
