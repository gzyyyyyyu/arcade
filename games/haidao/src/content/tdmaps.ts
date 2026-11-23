/**
 * 守岛 2.0 的关卡岛和战役关表的出口（契约：core/index.ts 从这里取 TD2_MAPS、TD2_LEVELS、TD2_LEVEL_BY_ID）。
 * 11 张图在 td2maps.ts，24 关的波次配方和旋钮在 td2levels.ts；这里再加一关只给单测用的样板关（不进选关页和战役关表）。
 */
import type { Placed } from '../core/types.ts';
import type { TdIslandLevel } from '../core/td2types.ts';
import type { TdEnemyKind, TdGroup, TdWave } from '../core/tdtypes.ts';
import { TD2_LEVELS as REAL_LEVELS } from './td2levels.ts';

export { TD2_CHAPTERS } from './td2levels.ts';
export type { Td2ChapterInfo } from './td2levels.ts';
export { TD2_MAPS, TD2_MAP_BLURB } from './td2maps.ts';
export { buildLevel, TD2_LEVEL_DEFS, levelWaves } from './td2levels.ts';

/** [敌人, 个数, 登陆路, 间隔拍, 延迟拍] */
type G = [TdEnemyKind, number, number, number, number?];
function wave(...groups: G[]): TdWave {
  return { groups: groups.map(([enemy, n, lane, every, delay]): TdGroup => ({ enemy, n, lane, every, ...(delay ? { delay } : {}) })) };
}

function layoutOf(items: Array<[Placed['kind'], number, number, number]>): Placed[] {
  return items.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));
}

/** 样板岛：北边一排墙留口子；五块木台（西路那块压着沉船）、北口一个驻守台 */
const SAMPLE_LAYOUT = layoutOf([
  ['hq', 3, 9, 9],
  ['treasure', 1, 10, 13],
  ...[5, 6, 7, 8, 13, 14, 15, 16].map((x): ['wall', number, number, number] => ['wall', 3, x, 5]),
]);

/** 样板关：8 波，水手为主，第 3 波起铁甲、第 5 波起小艇，第 6 波起落潮路开。单测和规则核心的冒烟用，数值不配平 */
const TD2_SAMPLE_LEVEL: TdIslandLevel = {
  id: 'td2-sample',
  name: '样板关',
  index: 0,
  map: 'A',
  chapter: 1,
  hq: 2,
  hpPct: 100,
  gold: 200,
  first: 400,
  waveTicks: 340,
  layout: SAMPLE_LAYOUT,
  lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }],
  tide: { wave: 5, lane: { x: 11, y: 23 } },
  slots: [{ x: 5, y: 7 }, { x: 15, y: 7 }, { x: 2, y: 12, wreck: { hp: 220 } }, { x: 15, y: 15 }, { x: 11, y: 19 }],
  garrison: [{ x: 12, y: 6 }],
  kegs: [{ x: 10, y: 0 }, { x: 11, y: 0 }, { x: 0, y: 10 }],
  obstacles: [],
  waves: [
    wave(['sailor', 8, 0, 30]),
    wave(['sailor', 6, 0, 28], ['sailor', 4, 1, 30, 60]),
    wave(['ironclad', 2, 0, 60], ['sailor', 6, 1, 25]),
    wave(['sailor', 10, 0, 20], ['ironclad', 2, 1, 60, 40]),
    wave(['skiff', 3, 1, 50], ['sailor', 8, 0, 20]),
    wave(['ironclad', 3, 2, 50], ['sailor', 8, 0, 20]),
    wave(['skiff', 4, 0, 40], ['sailor', 10, 2, 18], ['ironclad', 2, 1, 60]),
    wave(['ironclad', 4, 0, 40], ['skiff', 4, 2, 40], ['sailor', 12, 1, 15]),
  ],
};

/** 全部关：战役 30 关（td01–td30，按解锁顺序）加样板关；战役关表用 tdCampaign()，它按 id 滤掉样板关 */
export const TD2_LEVELS: readonly TdIslandLevel[] = [...REAL_LEVELS, TD2_SAMPLE_LEVEL];
/** 按 id 查关 */
export const TD2_LEVEL_BY_ID: ReadonlyMap<string, TdIslandLevel> = new Map(TD2_LEVELS.map((l) => [l.id, l]));
