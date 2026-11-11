/**
 * 寻宝航线（每日航线）的内容表：微型岛、终点宝岛、船队模板。改数值只改这里，规则在 core/map.ts。
 * 微型岛都用同一副"槽位骨架"摆：主寨居中、四周 8 个 3×3 槽位、槽位之间的缝里埋雷或放宝藏箱，
 * 每座岛整体平移一点（dx、dy）让登陆距离各不一样。这样不越界、不重叠由骨架保证，内容测试再用 validate.ts 扫一遍。
 * 镜像（左右翻）在规则里做，这里只给原样。
 */
import type { MapIslandDef } from '../core/maptypes.ts';
import type { BuildingKind, Placed, SkillKind, TroopKind } from '../core/types.ts';

/** 3×3 槽位的左上角（未平移）；主寨 4×4 在 (9, 9) */
const SLOT = {
  N: [9, 5],
  S: [10, 14],
  W: [5, 10],
  E: [14, 9],
  NW: [5, 5],
  NE: [14, 5],
  SW: [5, 14],
  SE: [14, 14],
} as const;
type Slot = keyof typeof SLOT;

/** 槽位之间的 1×1 缝（地雷、宝藏箱） */
const GAP = {
  g1: [8, 8],
  g2: [13, 8],
  g3: [8, 13],
  g4: [13, 13],
  g5: [12, 6],
  g6: [6, 13],
  g7: [15, 12],
  g8: [8, 4],
  g9: [3, 11],
  g10: [18, 10],
} as const;
type Gap = keyof typeof GAP;

/** 四角的棕榈（装饰，不算摧毁率、不算建筑数） */
const PALMS: Array<[number, number]> = [
  [2, 2],
  [19, 3],
  [3, 19],
  [19, 19],
];

type Row = [BuildingKind, number, Slot | Gap];

const HINT: Array<[BuildingKind, string]> = [
  ['cannon', '炮'],
  ['gunTower', '枪'],
  ['mortar', '臼'],
  ['flame', '火'],
  ['vault', '库'],
  ['treasure', '宝'],
];

/** 侦察图标文字：看得见的防御、金库、宝藏箱各几座；地雷不写 */
export function mapHint(layout: Placed[]): string[] {
  const out: string[] = [];
  for (const [k, label] of HINT) {
    const n = layout.filter((b) => b.kind === k).length;
    if (n > 0) out.push(`${label}×${n}`);
  }
  return out;
}

function isle(id: string, name: string, style: MapIslandDef['style'], pts: number, dx: number, dy: number, hq: number, rows: Row[]): MapIslandDef {
  const layout: Placed[] = [{ id: 1, kind: 'hq', level: hq, x: 9 + dx, y: 9 + dy }];
  for (const [kind, level, at] of rows) {
    const [x, y] = at in SLOT ? SLOT[at as Slot] : GAP[at as Gap];
    layout.push({ id: layout.length + 1, kind, level, x: x + dx, y: y + dy });
  }
  for (const [x, y] of PALMS) layout.push({ id: layout.length + 1, kind: 'palm', level: 1, x: x + dx, y: y + dy });
  return { id, name, style, layout, pts, hint: mapHint(layout) };
}

/** 12 座微型岛：炮台多 / 地雷多 / 臼炮多 / 金库厚 各 3 座，主寨 3–6 级 */
export const MAP_ISLANDS: MapIslandDef[] = [
  // 炮台多
  isle('m01', '红帆小礁', 'cannon', 45, 0, 0, 3, [
    ['cannon', 3, 'NW'], ['cannon', 3, 'SE'], ['gunTower', 2, 'E'], ['vault', 2, 'N'], ['goldmine', 3, 'SW'], ['sawmill', 2, 'W'], ['mine', 2, 'g3'],
  ]),
  isle('m02', '炮牙岬', 'cannon', 55, 1, -1, 4, [
    ['cannon', 4, 'NW'], ['cannon', 4, 'NE'], ['cannon', 3, 'S'], ['gunTower', 3, 'W'], ['vault', 3, 'N'], ['woodyard', 3, 'E'], ['goldmine', 3, 'SE'], ['mine', 3, 'g1'], ['mine', 3, 'g4'],
  ]),
  isle('m03', '铁炮湾', 'cannon', 65, -1, 1, 5, [
    ['cannon', 5, 'NW'], ['cannon', 5, 'NE'], ['cannon', 4, 'SW'], ['cannon', 4, 'SE'], ['gunTower', 4, 'N'], ['gunTower', 4, 'S'], ['vault', 4, 'W'], ['sawmill', 4, 'E'], ['mine', 4, 'g2'], ['mine', 4, 'g3'],
  ]),
  // 地雷多
  isle('m04', '雷鸣沙洲', 'mine', 40, 2, 0, 3, [
    ['cannon', 2, 'NE'], ['gunTower', 3, 'SW'], ['vault', 2, 'N'], ['goldmine', 2, 'W'], ['sawmill', 2, 'E'], ['mine', 3, 'g1'], ['mine', 3, 'g2'], ['mine', 3, 'g3'], ['mine', 3, 'g4'], ['mine', 3, 'g9'],
  ]),
  isle('m05', '碎骨滩', 'mine', 55, -2, 1, 4, [
    ['cannon', 3, 'N'], ['gunTower', 4, 'S'], ['vault', 3, 'W'], ['goldmine', 3, 'E'], ['woodyard', 3, 'NW'], ['mine', 4, 'g1'], ['mine', 4, 'g2'], ['mine', 4, 'g3'], ['mine', 4, 'g4'], ['mine', 4, 'g7'], ['mine', 4, 'g10'],
  ]),
  isle('m06', '鬼火礁', 'mine', 60, 0, 2, 5, [
    ['cannon', 4, 'NW'], ['gunTower', 5, 'SE'], ['mortar', 4, 'NE'], ['vault', 4, 'SW'], ['goldmine', 4, 'E'], ['mine', 5, 'g1'], ['mine', 5, 'g3'], ['mine', 5, 'g4'], ['mine', 5, 'g6'], ['mine', 5, 'g8'], ['mine', 5, 'g9'],
  ]),
  // 臼炮多
  isle('m07', '炮雾岛', 'mortar', 45, 1, 1, 3, [
    ['mortar', 3, 'N'], ['cannon', 3, 'S'], ['gunTower', 2, 'W'], ['vault', 3, 'E'], ['goldmine', 2, 'NW'], ['sawmill', 2, 'SE'], ['mine', 2, 'g4'], ['mine', 2, 'g6'],
  ]),
  isle('m08', '落雷崖', 'mortar', 60, -1, -1, 5, [
    ['mortar', 5, 'NW'], ['mortar', 5, 'SE'], ['cannon', 4, 'NE'], ['gunTower', 4, 'SW'], ['vault', 4, 'N'], ['woodyard', 4, 'S'], ['mine', 3, 'g2'], ['mine', 3, 'g3'],
  ]),
  isle('m09', '黑烟港', 'mortar', 70, 0, -2, 6, [
    ['mortar', 4, 'N'], ['mortar', 4, 'S'], ['cannon', 4, 'W'], ['cannon', 4, 'E'], ['gunTower', 4, 'SW'], ['vault', 5, 'NW'], ['goldmine', 5, 'NE'], ['mine', 5, 'g4'],
  ]),
  // 金库厚
  isle('m10', '金砂岛', 'vault', 50, 2, 2, 4, [
    ['vault', 4, 'N'], ['vault', 4, 'S'], ['goldmine', 4, 'W'], ['goldmine', 4, 'E'], ['cannon', 3, 'NW'], ['gunTower', 3, 'SE'], ['woodyard', 4, 'NE'], ['mine', 3, 'g1'],
  ]),
  isle('m11', '银锚礁', 'vault', 60, -2, 0, 5, [
    ['vault', 5, 'N'], ['vault', 5, 'W'], ['vault', 4, 'E'], ['woodyard', 4, 'S'], ['goldmine', 4, 'NE'], ['cannon', 4, 'SW'], ['gunTower', 3, 'NW'], ['mortar', 3, 'SE'], ['mine', 4, 'g4'],
  ]),
  isle('m12', '宝窟岩', 'vault', 70, 1, 2, 6, [
    ['vault', 6, 'N'], ['vault', 5, 'S'], ['vault', 5, 'W'], ['woodyard', 5, 'E'], ['woodyard', 4, 'NE'], ['cannon', 4, 'NW'], ['gunTower', 4, 'SE'], ['flame', 4, 'SW'], ['mine', 5, 'g1'], ['mine', 5, 'g3'],
  ]),
];

/** 3 座终点宝岛：主寨 6 级、防御更硬，带两只宝藏箱（算摧毁率） */
export const MAP_BOSSES: MapIslandDef[] = [
  isle('b1', '骷髅王岛', 'boss', 120, 0, 0, 6, [
    ['cannon', 6, 'NW'], ['cannon', 6, 'NE'], ['cannon', 5, 'SE'], ['gunTower', 5, 'W'], ['gunTower', 5, 'E'], ['mortar', 5, 'N'], ['flame', 5, 'SW'], ['vault', 6, 'S'], ['treasure', 1, 'g1'], ['treasure', 1, 'g4'], ['mine', 5, 'g3'],
  ]),
  isle('b2', '深渊宝岛', 'boss', 120, 1, 1, 6, [
    ['mortar', 5, 'NW'], ['mortar', 4, 'SE'], ['cannon', 5, 'NE'], ['cannon', 5, 'SW'], ['flame', 4, 'N'], ['gunTower', 5, 'W'], ['vault', 6, 'E'], ['woodyard', 5, 'S'], ['treasure', 1, 'g2'], ['treasure', 1, 'g3'], ['mine', 5, 'g6'],
  ]),
  isle('b3', '金骨王城', 'boss', 120, -1, 0, 6, [
    ['cannon', 6, 'NW'], ['cannon', 6, 'NE'], ['cannon', 5, 'SW'], ['cannon', 5, 'SE'], ['gunTower', 6, 'N'], ['gunTower', 5, 'S'], ['vault', 6, 'W'], ['vault', 6, 'E'], ['treasure', 1, 'g1'], ['treasure', 1, 'g4'],
  ]),
];

export const MAP_ISLAND_BY_ID: Record<string, MapIslandDef> = Object.fromEntries([...MAP_ISLANDS, ...MAP_BOSSES].map((d) => [d.id, d]));

/** 航线每层从哪些岛里抽（越往后越硬）；同一天同一层的两座岛风格不同 */
export const MAP_LAYER_POOL: string[][] = [
  ['m01', 'm04', 'm07', 'm02', 'm05', 'm10'],
  ['m02', 'm05', 'm10', 'm03', 'm06', 'm08', 'm11'],
  ['m03', 'm06', 'm08', 'm11', 'm09', 'm12'],
];

/** 第 1、2 层出补给礁的概率（百分比；第 0 层没有） */
export const MAP_REEF_PCT = 50;

/** 当天的船队模板：每条船的兵种、研究等级、每船人口（雇来的船，不看玩家存档），技能等级 */
export interface MapFleetDef {
  id: string;
  name: string;
  crew: TroopKind[];
  level: number;
  boatCap: number;
  skills: Array<{ kind: SkillKind; level: number }>;
}

export const MAP_FLEETS: MapFleetDef[] = [
  { id: 'iron', name: '铁拳船队', crew: ['brute', 'brute', 'gunner', 'bomber', 'sailor'], level: 4, boatCap: 12, skills: [{ kind: 'barrage', level: 4 }, { kind: 'flare', level: 4 }] },
  { id: 'musket', name: '火枪船队', crew: ['gunner', 'gunner', 'brute', 'sailor', 'bomber'], level: 4, boatCap: 12, skills: [{ kind: 'barrage', level: 4 }, { kind: 'medkit', level: 4 }] },
  { id: 'captain', name: '船长亲征', crew: ['captain', 'brute', 'sailor', 'sailor', 'gunner'], level: 4, boatCap: 12, skills: [{ kind: 'barrage', level: 4 }, { kind: 'flare', level: 4 }, { kind: 'medkit', level: 4 }] },
  { id: 'blast', name: '爆破船队', crew: ['bomber', 'bomber', 'brute', 'brute', 'gunner', 'sailor'], level: 4, boatCap: 12, skills: [{ kind: 'barrage', level: 4 }, { kind: 'flare', level: 4 }] },
];
