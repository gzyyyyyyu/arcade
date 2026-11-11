/**
 * 护航的 3 张航线图（直波海峡 / 双湾回廊 / 鹦鹉岬）：岛 22×22 加一圈 3 格海滩（坐标 -3..24），商船的航线走在岛外的海滩 / 海面格上，
 * 木台建在岛的边缘，离航线 2–3 格，所以航线永远不会压到木台、主寨和装饰。没有宝藏箱，也没有驻守台（护航不读存档里的基地）。
 * 木台按"先用的先排"：先每个隘口一座（小白机器人按这个顺序造），再回头补第二座，难度低的关取更长的前缀，所以哪一档每个隘口都有塔。
 * 航线用折线端点写，walk 展开成 8 邻接的格子序列（先斜走再直走，全整数，确定性）。
 */
import type { Placed } from '../core/types.ts';
import type { TdPadDef } from '../core/td2types.ts';

type Pt = [number, number];

export type EscortMapId = 'strait' | 'bays' | 'cape';

export interface EscortMapDef {
  id: EscortMapId;
  name: string;
  /** 一句话：这张图教什么 */
  blurb: string;
  /** 主寨和装饰（没有宝藏箱） */
  layout: Placed[];
  lanes: Array<{ x: number; y: number }>;
  tide?: { x: number; y: number };
  fogZones?: Array<{ x: number; y: number; r: number }>;
  /** 东边绕后（鹦鹉） */
  flank?: boolean;
  pads: TdPadDef[];
  kegs: Array<{ x: number; y: number }>;
  route: Array<{ x: number; y: number }>;
  /** 隘口：航线下标，升序 */
  gates: number[];
}

/** 折线端点 → 8 邻接格子序列（含两端；每步 x、y 各自向目标走一格，先斜后直） */
function walk(points: readonly Pt[]): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [{ x: (points[0] as Pt)[0], y: (points[0] as Pt)[1] }];
  for (let i = 1; i < points.length; i++) {
    const [tx, ty] = points[i] as Pt;
    let { x, y } = out[out.length - 1] as { x: number; y: number };
    while (x !== tx || y !== ty) {
      x += Math.sign(tx - x);
      y += Math.sign(ty - y);
      out.push({ x, y });
    }
  }
  return out;
}

const pts = (a: readonly Pt[]): Array<{ x: number; y: number }> => a.map(([x, y]) => ({ x, y }));

function layoutOf(rocks: readonly Pt[], palms: readonly Pt[]): Placed[] {
  const out: Placed[] = [{ id: 1, kind: 'hq', level: 3, x: 9, y: 10 }];
  for (const [x, y] of rocks) out.push({ id: out.length + 1, kind: 'rock', level: 1, x, y });
  for (const [x, y] of palms) out.push({ id: out.length + 1, kind: 'palm', level: 1, x, y });
  return out;
}

export const ESCORT_MAPS: readonly EscortMapDef[] = [
  {
    // 一条直线贴着北岸，3 个隘口等距：教"冲"和"停"
    id: 'strait',
    name: '直波海峡',
    blurb: '一路向东，三段塔群，铁甲慢，冲得过去',
    layout: layoutOf([[5, 8], [16, 14], [3, 17]], [[14, 8], [7, 16], [18, 18]]),
    lanes: pts([[-2, 6], [23, 6]]),
    pads: pts([[0, 0], [10, 0], [19, 0], [3, 0], [13, 0], [16, 0], [7, 0], [2, 3], [11, 3], [20, 3]]),
    kegs: pts([[5, 0], [12, 0], [18, 0]]),
    route: walk([[-3, -2], [24, -2]]),
    gates: [4, 14, 24],
  },
  {
    // 绕过东北角：塔群之间有空档，南边多一条落潮路
    id: 'bays',
    name: '双湾回廊',
    blurb: '绕过东北角，四段塔群之间有空档，落潮多一路',
    layout: layoutOf([[4, 9], [15, 16], [6, 18]], [[16, 9], [9, 17], [2, 12]]),
    lanes: pts([[-2, 6], [24, 14], [14, 24]]),
    tide: { x: 3, y: 24 },
    pads: pts([[0, 0], [11, 0], [19, 0], [20, 7], [3, 0], [8, 0], [16, 0], [20, 4], [6, 3], [14, 3], [20, 10]]),
    kegs: pts([[5, 0], [13, 0], [18, 0]]),
    route: walk([[-3, -2], [20, -2], [23, 1], [23, 8]]),
    gates: [3, 12, 22, 31],
  },
  {
    // 先沿西岸北上再转东：鹦鹉从东边绕后，终点前是首领
    id: 'cape',
    name: '鹦鹉岬',
    blurb: '西岸北上再转东，东边飞来鹦鹉，终点前有首领',
    layout: layoutOf([[6, 8], [16, 14], [4, 17]], [[15, 8], [8, 17], [19, 18]]),
    lanes: pts([[-2, 18], [12, 24], [23, 8]]),
    flank: true,
    pads: pts([[0, 9], [3, 0], [17, 0], [0, 5], [13, 0], [0, 0], [8, 0], [0, 13], [4, 4], [12, 3]]),
    kegs: pts([[6, 0], [11, 0], [15, 0]]),
    route: walk([[-3, 12], [-3, -1], [-1, -3], [19, -3]]),
    gates: [4, 17, 33],
  },
];

export const ESCORT_MAP_BY_ID: ReadonlyMap<EscortMapId, EscortMapDef> = new Map(ESCORT_MAPS.map((m) => [m.id, m]));

