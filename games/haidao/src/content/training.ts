/**
 * 训练营（DESIGN 16）：每个兵种一关短教学 + 三关排兵布阵。岛和部队都写死，不读存档、不看养成，人人打的一样。
 * 兵种关的提示文字不在这里写：直接用介绍卡片（content/intel.ts 的定位和相克、view/intel.ts 的寻敌说明），同一件事只写一处。
 * 主寨到 hq 级开放（兵种关跟兵种的解锁等级走），第一次过关（≥1 星；守岛关守住）给一次 reward，进「一键收取」。
 */
import type { BuildingKind, Placed, Res, TroopKind } from '../core/types.ts';
import { TROOPS } from './troops.ts';

type TrainKind = 'troop' | 'front' | 'counter' | 'td';

interface TrainBoat {
  troop: TroopKind;
  count: number;
}

export interface TrainLesson {
  id: string;
  kind: TrainKind;
  /** 兵种关教的兵 */
  troop?: TroopKind;
  name: string;
  /** 主寨几级开放 */
  hq: number;
  /** 登陆战关：敌岛和船（兵一律 2 级，没有技能） */
  layout?: Placed[];
  boats?: TrainBoat[];
  reward: Res;
}

type Row = [BuildingKind, number, number, number];
const layout = (rows: Row[]): Placed[] => rows.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));

/** 主寨四周一圈城墙（主寨占 9..12，墙在 8 和 13 上） */
const WALL_RING: Row[] = [];
for (let i = 8; i <= 13; i++) {
  WALL_RING.push(['wall', 1, i, 8], ['wall', 1, i, 13]);
  if (i > 8 && i < 13) WALL_RING.push(['wall', 1, 8, i], ['wall', 1, 13, i]);
}

const ECO: Row[] = [
  ['goldmine', 1, 2, 2],
  ['sawmill', 1, 17, 17],
];

/** 兵种关：岛上放它好打的防御，角上放一座它怕的（提示里会点名），部队以它为主 */
const TROOP_ISLANDS: Record<TroopKind, { rows: Row[]; boats: TrainBoat[] }> = {
  sailor: { rows: [['hq', 1, 9, 9], ['cannon', 1, 6, 6], ['cannon', 1, 14, 14], ...ECO], boats: [{ troop: 'sailor', count: 6 }, { troop: 'sailor', count: 6 }] },
  gunner: { rows: [['hq', 1, 9, 9], ['cannon', 1, 6, 6], ['cannon', 1, 14, 14], ...ECO], boats: [{ troop: 'gunner', count: 6 }, { troop: 'gunner', count: 6 }] },
  brute: { rows: [['hq', 2, 9, 9], ['gunTower', 1, 6, 6], ['gunTower', 1, 14, 14], ['mortar', 1, 14, 6], ...ECO], boats: [{ troop: 'brute', count: 2 }, { troop: 'brute', count: 2 }, { troop: 'sailor', count: 6 }] },
  bomber: { rows: [['hq', 2, 9, 9], ...WALL_RING, ['cannon', 1, 5, 9], ['cannon', 1, 15, 11], ...ECO], boats: [{ troop: 'bomber', count: 3 }, { troop: 'sailor', count: 6 }, { troop: 'sailor', count: 6 }] },
  captain: { rows: [['hq', 3, 9, 9], ['cannon', 2, 6, 6], ['gunTower', 2, 14, 14], ['cannon', 1, 14, 6], ...ECO], boats: [{ troop: 'captain', count: 1 }, { troop: 'sailor', count: 6 }] },
  medic: { rows: [['hq', 3, 9, 9], ['gunTower', 2, 6, 6], ['gunTower', 2, 14, 14], ['gunTower', 1, 14, 6], ...ECO], boats: [{ troop: 'medic', count: 3 }, { troop: 'sailor', count: 6 }, { troop: 'sailor', count: 6 }] },
  cannoneer: { rows: [['hq', 3, 9, 9], ['cannon', 2, 6, 6], ['gunTower', 2, 14, 14], ['shock', 1, 14, 6], ...ECO], boats: [{ troop: 'cannoneer', count: 2 }, { troop: 'cannoneer', count: 2 }, { troop: 'sailor', count: 6 }] },
  harpooner: { rows: [['hq', 3, 9, 9], ['flame', 1, 6, 6], ['flame', 1, 14, 14], ['cannon', 1, 14, 6], ...ECO], boats: [{ troop: 'harpooner', count: 6 }, { troop: 'harpooner', count: 6 }, { troop: 'brute', count: 1 }] },
  shield: { rows: [['hq', 3, 9, 9], ['cannon', 2, 6, 6], ['gunTower', 2, 14, 14], ['sniper', 1, 14, 6], ...ECO], boats: [{ troop: 'shield', count: 2 }, { troop: 'gunner', count: 6 }, { troop: 'gunner', count: 6 }] },
  grenadier: { rows: [['hq', 3, 9, 9], ...WALL_RING, ['cannon', 1, 5, 9], ['gunTower', 1, 15, 11], ...ECO], boats: [{ troop: 'grenadier', count: 3 }, { troop: 'grenadier', count: 3 }, { troop: 'brute', count: 1 }] },
};

/** 奖励随开放等级涨：主寨 1 级约等于半小时的矿产，8 级的一关约等于打一座中期战役岛 */
const reward = (hq: number): Res => ({ gold: 150 + 100 * hq, wood: 100 + 60 * hq });

const TROOP_ORDER: TroopKind[] = ['sailor', 'gunner', 'brute', 'bomber', 'captain', 'grenadier', 'shield', 'harpooner', 'medic', 'cannoneer'];

const troopLessons: TrainLesson[] = TROOP_ORDER.map((t) => {
  const hq = TROOPS[t].unlockHq;
  const isl = TROOP_ISLANDS[t];
  return { id: `t-${t}`, kind: 'troop', troop: t, name: TROOPS[t].name, hq, layout: layout(isl.rows), boats: isl.boats, reward: reward(hq) };
});

export const TRAIN_LESSONS: readonly TrainLesson[] = [
  ...troopLessons,
  {
    // 前排后排：壮汉先上吸炮火，火枪手跟在后面放枪（模拟：这样 100% 三星；先放火枪手只有 7% 三星）
    id: 'f-front',
    kind: 'front',
    name: '前排后排',
    hq: 3,
    layout: layout([['hq', 2, 9, 9], ['cannon', 4, 5, 9], ['cannon', 4, 5, 13], ['gunTower', 4, 14, 10], ...ECO]),
    boats: [{ troop: 'brute', count: 2 }, { troop: 'gunner', count: 4 }, { troop: 'gunner', count: 4 }],
    reward: reward(3),
  },
  {
    // 兵克塔：火枪手怕臼炮、好打大炮，壮汉专拆防御、不怕臼炮（模拟 400 种子：壮汉去右上拆臼炮、火枪手去左边打大炮 100% 三星，反过来 2%；
    // 壮汉 2→3 后小白机器人过关（≥1 星）64%→100%，三星仍要派对兵）
    id: 'f-counter',
    kind: 'counter',
    name: '兵克塔',
    hq: 3,
    layout: layout([['hq', 2, 9, 9], ['mortar', 2, 14, 5], ['cannon', 2, 5, 14], ['cannon', 2, 4, 10], ...ECO]),
    boats: [{ troop: 'brute', count: 3 }, { troop: 'gunner', count: 6 }, { troop: 'gunner', count: 6 }],
    reward: reward(3),
  },
  // 塔位摆放：守岛第一关的岛，只打前几波（core/training.ts 的 trainTdLevel）
  { id: 'f-td', kind: 'td', name: '塔放哪', hq: 1, reward: reward(1) },
];

export const TRAIN_BY_ID: ReadonlyMap<string, TrainLesson> = new Map(TRAIN_LESSONS.map((l) => [l.id, l]));

/** 训练营里兵的研究等级（所有人一样） */
export const TRAIN_TROOP_LEVEL = 2;
/** 守岛关：借哪一关的岛、打前几波 */
export const TRAIN_TD_LEVEL = 'td01';
/** 守岛那一关的 id（结算记账用） */
export const TRAIN_TD_LESSON = 'f-td';
export const TRAIN_TD_WAVES = 3;
