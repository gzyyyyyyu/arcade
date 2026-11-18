/**
 * 守岛 2.0 的 9 张关卡岛（A–I）：地形、路线、木台、驻守台、火药桶都写死，两关共用一张图。
 * 用矩形和坐标写（格子，岛 22×22），再由 mapLayout 展开成 Placed：墙一律 3 级、2 格厚
 * （敌人穿墙的代价是绕路的 7 倍，薄墙挡不住长绕路；厚墙才能把路逼成 S 形）。
 * 木台、驻守台按"先放的先用"排好：关卡取前 n 个，所以每张图的木台数是两关里较多的那个。
 * 路长按"水手从登陆走到宝藏箱 20–35 秒"画（1 格 1 秒），塔位都在路边 2 格以内。
 */
import { BEACH, ISLAND, type Placed } from '../core/types.ts';
import type { TdGarrisonSpot, TdMapDef, TdMapId, TdPadDef } from '../core/td2types.ts';

type Pt = [number, number];
/** 矩形墙 [x0, y0, x1, y1]（含两端） */
type Rect = [number, number, number, number];

interface MapSpec {
  id: TdMapId;
  name: string;
  /** 一句话：这张图教什么 */
  blurb: string;
  hq: Pt;
  treasures: Pt[];
  walls: Rect[];
  /** 礁石、棕榈（装饰，不挡路） */
  rocks?: Pt[];
  palms?: Pt[];
  lanes: Pt[];
  tide?: Pt;
  /** 雾区候选：关卡自己挑哪几片起作用 */
  fog?: Array<{ x: number; y: number; r: number }>;
  /** 木台：[x, y]，按顺序用 */
  pads: Pt[];
  /** 驻守台：[x, y]，按顺序用 */
  garrison: Pt[];
  kegs: Pt[];
  /** 水面（第四章）：矩形，和墙一样贴着岛边的一直连到海滩尽头（不然沿沙滩就绕过去了） */
  water?: Rect[];
  /** 桥：水面上留的能走的口子，只画木板 */
  bridges?: Pt[];
}

const SPECS: readonly MapSpec[] = [
  {
    // A 小湾：北口一条路，两道厚墙把路逼成 S 形
    id: 'A',
    name: '小湾',
    blurb: '一条路，S 形绕进来',
    hq: [14, 15],
    treasures: [[8, 17]],
    walls: [[0, 5, 16, 6], [4, 11, 21, 12]],
    rocks: [[19, 1], [20, 2], [1, 19], [20, 19]],
    palms: [[18, 3], [2, 15], [19, 14]],
    lanes: [[11, -2]],
    pads: [[9, 13], [3, 14], [16, 2], [8, 2]],
    garrison: [[0, 7]],
    kegs: [[11, 0], [12, 0], [0, 10]],
  },
  {
    // B 双滩：北、西两条路，在宝藏箱前面合到一起
    id: 'B',
    name: '双滩',
    blurb: '两路在箱子前汇合',
    hq: [16, 15],
    treasures: [[12, 12]],
    walls: [[0, 6, 15, 7], [5, 12, 6, 21]],
    rocks: [[19, 3], [20, 10], [2, 9]],
    palms: [[17, 1], [18, 9], [9, 19]],
    lanes: [[3, -2], [-2, 20]],
    pads: [[9, 13], [14, 9], [8, 3], [2, 3], [2, 17]],
    garrison: [[13, 14]],
    kegs: [[3, 0], [4, 0], [0, 19], [0, 20]],
  },
  {
    // C 雾港：北边两个口子，中间一整块礁石把路分成两支，下面从同一个口子合到箱子
    id: 'C',
    name: '雾港',
    blurb: '两支路绕过中间的礁石',
    hq: [16, 17],
    treasures: [[10, 18]],
    walls: [[8, 2, 13, 11], [0, 14, 6, 15], [15, 14, 21, 15]],
    rocks: [[9, 3], [10, 6], [11, 8], [12, 4], [2, 18], [19, 11]],
    palms: [[3, 1], [18, 1], [5, 19]],
    lanes: [[5, -2], [16, -2]],
    pads: [[3, 5], [17, 5], [5, 11], [15, 11], [7, 16], [13, 16]],
    garrison: [[10, 12]],
    kegs: [[5, 0], [6, 0], [16, 0], [15, 0]],
  },
  {
    // D 潮沟：北、西两路，南边落潮时多一条；箱子在正中，三面都要守
    id: 'D',
    name: '潮沟',
    blurb: '两路加落潮路，三面守',
    hq: [17, 11],
    treasures: [[11, 11]],
    walls: [[0, 4, 17, 5], [3, 8, 4, 21], [8, 17, 21, 18]],
    rocks: [[20, 8], [1, 1], [20, 20]],
    palms: [[18, 1], [19, 11], [1, 12]],
    lanes: [[10, -2], [-2, 11]],
    tide: [11, 23],
    pads: [[7, 2], [18, 2], [1, 6], [6, 13], [6, 19], [13, 20], [14, 8], [8, 7]],
    garrison: [[13, 14], [7, 10]],
    kegs: [[10, 0], [11, 0], [0, 10], [0, 11], [12, 21]],
  },
  {
    // E 雾湾：北路整段罩在雾里，西路正常，南边落潮路也罩雾
    id: 'E',
    name: '雾湾',
    blurb: '雾区盖住了北路和落潮路',
    hq: [0, 0],
    treasures: [[11, 12]],
    walls: [[0, 7, 13, 8], [0, 16, 5, 17], [15, 17, 21, 18]],
    rocks: [[19, 14], [2, 3], [1, 20]],
    palms: [[6, 13], [19, 6]],
    lanes: [[4, -2], [-2, 12]],
    tide: [13, 23],
    fog: [{ x: 8, y: 3, r: 3.2 }, { x: 13, y: 20, r: 3 }],
    pads: [[5, 4], [11, 4], [2, 13], [7, 15], [15, 13], [10, 18], [13, 4]],
    garrison: [[8, 10], [12, 10]],
    kegs: [[4, 0], [5, 0], [0, 11], [0, 12], [13, 21]],
  },
  {
    // F 礁石迷宫：北口一条三折的长路；落潮时东边多一条直通箱子的短路
    id: 'F',
    name: '礁石迷宫',
    blurb: '三折长路，落潮时有捷径',
    hq: [0, 0],
    treasures: [[10, 19]],
    walls: [[0, 4, 12, 5], [8, 9, 21, 10], [0, 14, 12, 15]],
    rocks: [[19, 1], [2, 20], [20, 20], [14, 7], [4, 12]],
    palms: [[16, 20], [1, 8]],
    lanes: [[8, -2]],
    tide: [23, 18],
    fog: [{ x: 9, y: 2, r: 2.8 }, { x: 5, y: 12, r: 2.6 }],
    pads: [[5, 1], [15, 1], [18, 6], [1, 11], [18, 11], [4, 17], [14, 17], [14, 12]],
    garrison: [[1, 6], [17, 19]],
    kegs: [[8, 0], [9, 0], [20, 17], [20, 18]],
  },
  {
    // G 炮台山：两路，塔位都在路边的小山（礁石围着）上
    id: 'G',
    name: '炮台山',
    blurb: '塔建在路边的小山上',
    hq: [3, 16],
    treasures: [[10, 15]],
    walls: [[0, 9, 9, 10], [12, 4, 21, 5]],
    rocks: [[17, 7], [18, 7], [6, 12], [7, 12], [17, 11], [18, 11], [5, 6], [14, 17], [15, 17]],
    palms: [[20, 8], [1, 12]],
    lanes: [[14, -2], [-2, 8]],
    pads: [[17, 8], [7, 6], [16, 12], [2, 11], [13, 13], [7, 13], [12, 17], [18, 16], [9, 2]],
    garrison: [[13, 8], [3, 6], [10, 12]],
    kegs: [[14, 0], [15, 0], [0, 7], [0, 8]],
  },
  {
    // H 东崖：北、西两路，东边的崖挡住了船，只有鹦鹉从东边飞过来
    id: 'H',
    name: '东崖',
    blurb: '东边崖上飞来鹦鹉',
    hq: [15, 15],
    treasures: [[10, 12]],
    walls: [[18, 0, 19, 14], [0, 6, 11, 7], [14, 3, 17, 4]],
    rocks: [[20, 6], [20, 10], [20, 14], [2, 18], [12, 19]],
    palms: [[16, 9], [1, 3], [9, 19]],
    lanes: [[6, -2], [-2, 12], [23, 8]],
    pads: [[6, 9], [13, 8], [10, 2], [3, 14], [8, 16], [13, 12], [15, 6], [1, 9]],
    garrison: [[7, 11], [14, 10]],
    kegs: [[6, 0], [7, 0], [0, 11], [0, 12], [21, 7]],
  },
  {
    // I 黑胡子湾：三路加落潮路，雾区，最大的一座岛。每条路都被厚墙逼着绕一段
    id: 'I',
    name: '黑胡子湾',
    blurb: '三面来船，南边落潮，雾盖三路',
    hq: [0, 0],
    treasures: [[10, 12], [8, 8]],
    walls: [[0, 4, 13, 5], [3, 6, 4, 17], [0, 20, 13, 21]],
    rocks: [[20, 1], [20, 20], [12, 16], [19, 18]],
    palms: [[9, 2], [19, 13], [2, 18]],
    lanes: [[10, -2], [-2, 11], [23, 10]],
    tide: [16, 23],
    fog: [{ x: 10, y: 2, r: 2.6 }, { x: 1, y: 11, r: 2.2 }, { x: 16, y: 21, r: 2.6 }],
    pads: [[7, 2], [17, 2], [1, 7], [1, 14], [6, 15], [13, 15], [14, 8], [6, 7], [20, 15], [10, 16]],
    garrison: [[11, 14], [8, 11], [14, 11]],
    kegs: [[10, 0], [11, 0], [0, 10], [0, 11], [21, 9], [15, 21]],
  },
  {
    // J 双子岛（第四章）：横穿全岛一道水道，只有正中一座两格宽的桥；大队从北半边上岸、都要过桥，桥口就是卡口。
    // 东边沙滩靠南还有一处后岛登陆点（第 4 条路），少量人不过桥直接上南半边——只守桥口太好守（每关都三星），要分兵顾后面
    id: 'J',
    name: '双子岛',
    blurb: '一座桥是卡口，后岛也有人上岸',
    hq: [16, 16],
    treasures: [[10, 17]],
    walls: [[0, 4, 7, 5], [14, 4, 21, 5]],
    water: [[0, 9, 9, 10], [12, 9, 21, 10]],
    bridges: [[10, 9], [11, 9], [10, 10], [11, 10]],
    rocks: [[2, 13], [19, 1], [1, 20]],
    palms: [[4, 19], [20, 12], [19, 7]],
    lanes: [[5, -2], [16, -2], [-2, 7], [23, 19]],
    pads: [[8, 12], [12, 12], [13, 6], [6, 6], [5, 13], [15, 12], [3, 7], [17, 7], [6, 17], [13, 19]],
    garrison: [[7, 15], [13, 15], [9, 19]],
    kegs: [[5, 0], [6, 0], [16, 0], [17, 0], [0, 7]],
  },
  {
    // K 火山口（第四章）：岛中间一口火口湖，北、西、东三面上岸绕着湖走，路短；东西两道矮墙把人逼到湖边
    id: 'K',
    name: '火山口',
    blurb: '中间一口湖，三面绕湖而来',
    hq: [1, 17],
    treasures: [[10, 15]],
    walls: [[0, 13, 5, 14], [16, 13, 21, 14]],
    water: [[8, 7, 13, 12]],
    rocks: [[7, 6], [14, 6], [7, 13], [14, 13], [20, 20]],
    palms: [[2, 2], [19, 2], [18, 18]],
    lanes: [[10, -2], [-2, 9], [23, 10]],
    pads: [[7, 16], [12, 16], [5, 4], [15, 4], [3, 9], [17, 8], [10, 19], [6, 19], [14, 19], [12, 2]],
    garrison: [[5, 11], [15, 11], [10, 4]],
    kegs: [[10, 0], [11, 0], [0, 9], [21, 10]],
  },
];

const WALL_LEVEL = 3;

/** 展开成 Placed：主寨、宝藏箱、墙、礁石、棕榈。hqLevel 是这一关建议的主寨等级 */
export function mapLayout(m: MapSpec, hqLevel: number): Placed[] {
  const out: Placed[] = [];
  const add = (kind: Placed['kind'], level: number, x: number, y: number): void => {
    out.push({ id: out.length + 1, kind, level, x, y });
  };
  add('hq', Math.max(1, hqLevel), m.hq[0], m.hq[1]);
  for (const [x, y] of m.treasures) add('treasure', 1, x, y);
  // 贴着岛边的墙一直连到海滩尽头：不然敌人会沿沙滩绕过去，S 形的路就白画了
  for (const r of m.walls) for (const [x, y] of rectCells(r)) add('wall', WALL_LEVEL, x, y);
  for (const [x, y] of m.rocks ?? []) add('rock', 1, x, y);
  for (const [x, y] of m.palms ?? []) add('palm', 1, x, y);
  return out;
}

/** 矩形里的格子；贴着岛边的一直延到海滩尽头 */
function rectCells([x0, y0, x1, y1]: Rect): Pt[] {
  const [a, b, c, d] = [x0 <= 0 ? -BEACH : x0, y0 <= 0 ? -BEACH : y0, x1 >= ISLAND - 1 ? ISLAND + BEACH - 1 : x1, y1 >= ISLAND - 1 ? ISLAND + BEACH - 1 : y1];
  const out: Pt[] = [];
  for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) out.push([x, y]);
  return out;
}

function defOf(m: MapSpec): TdMapDef {
  return {
    id: m.id,
    name: m.name,
    layout: mapLayout(m, 3),
    lanes: m.lanes.map(([x, y]) => ({ x, y })),
    ...(m.tide ? { tide: { x: m.tide[0], y: m.tide[1] } } : {}),
    ...(m.fog ? { fogZones: m.fog.map((z) => ({ ...z })) } : {}),
    pads: m.pads.map(([x, y]): TdPadDef => ({ x, y })),
    garrison: m.garrison.map(([x, y]): TdGarrisonSpot => ({ x, y, cap: 3 })),
    kegs: m.kegs.map(([x, y]) => ({ x, y })),
    ...(m.water ? { water: m.water.flatMap(rectCells).map(([x, y]) => ({ x, y })) } : {}),
    ...(m.bridges ? { bridges: m.bridges.map(([x, y]) => ({ x, y })) } : {}),
  };
}

export const TD2_MAP_SPECS: ReadonlyMap<TdMapId, MapSpec> = new Map(SPECS.map((m) => [m.id, m]));
export const TD2_MAPS: readonly TdMapDef[] = SPECS.map(defOf);
export const TD2_MAP_BLURB: Readonly<Record<TdMapId, string>> = Object.fromEntries(SPECS.map((m) => [m.id, m.blurb])) as Record<TdMapId, string>;
