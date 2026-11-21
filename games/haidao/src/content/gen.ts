/**
 * 战役后半段（c13–c30）的岛：用占位生成器摆布局，保证不越界、不重叠。
 * 每座岛 = 主寨在中间 + 外圈资源 + 按参数摆的防御；首领岛各带一个特殊机制。
 */
import { BUILDINGS } from './buildings.ts';
import type { LevelDef } from './defs.ts';
import type { BuildingKind, Placed } from '../core/types.ts';

class Builder {
  private grid = new Set<string>();
  readonly list: Placed[] = [];

  fits(kind: BuildingKind, x: number, y: number): boolean {
    const s = BUILDINGS[kind].size;
    // 海怪长在岛边的海里（海滩范围内），其余建筑在岛上
    const lo = kind === 'kraken' ? -3 : 0;
    const hi = kind === 'kraken' ? 25 : 22;
    if (x < lo || y < lo || x + s > hi || y + s > hi) return false;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) if (this.grid.has(`${x + dx},${y + dy}`)) return false;
    return true;
  }

  add(kind: BuildingKind, level: number, x: number, y: number): boolean {
    if (!this.fits(kind, x, y)) return false;
    const s = BUILDINGS[kind].size;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) this.grid.add(`${x + dx},${y + dy}`);
    this.list.push({ id: this.list.length + 1, kind, level, x, y });
    return true;
  }

  /** 先试给定的位置，不行就从中心往外找第一个空位 */
  auto(kind: BuildingKind, level: number, prefer: Array<[number, number]> = []): boolean {
    for (const [x, y] of prefer) if (this.add(kind, level, x, y)) return true;
    const cells: Array<[number, number]> = [];
    for (let y = 1; y <= 20; y++) for (let x = 1; x <= 20; x++) cells.push([x, y]);
    cells.sort((a, b) => Math.abs(a[0] - 10) + Math.abs(a[1] - 10) - (Math.abs(b[0] - 10) + Math.abs(b[1] - 10)) || a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of cells) if (this.add(kind, level, x, y)) return true;
    return false;
  }
}

const RING: Array<[number, number]> = [[5, 5], [15, 5], [5, 15], [15, 15], [9, 5], [9, 15], [5, 10], [16, 10], [13, 7], [7, 13], [6, 8], [14, 11], [3, 10], [11, 4]];
const MINES: Array<[number, number]> = [[3, 3], [18, 3], [3, 18], [18, 18], [8, 8], [13, 13], [8, 3], [13, 18], [3, 14], [18, 6], [2, 11], [19, 11], [11, 2], [11, 19], [6, 11], [15, 8]];
const SEA: Array<[number, number]> = [[-3, 9], [22, 9], [9, -3], [9, 22]];

/**
 * 同构关的摆位思路（非通道式布局的塔先试这里的位置，占了再往后找）：
 * EDGE 沿岛边一圈、CORE 紧贴主寨、EAST / WEST / NORTH 偏一面（从对面登陆好打，从这面登陆吃满）。
 */
const POS: Record<string, Array<[number, number]>> = {
  EDGE: [[2, 2], [17, 2], [2, 17], [17, 17], [9, 2], [9, 17], [2, 9], [17, 10], [5, 2], [13, 2], [2, 5], [2, 13], [17, 5], [17, 13], [5, 17], [13, 17]],
  CORE: [[6, 6], [14, 6], [6, 14], [14, 14], [9, 5], [9, 15], [5, 10], [15, 10], [11, 4], [11, 16], [4, 8], [16, 8]],
  EAST: [[14, 3], [14, 6], [14, 14], [14, 17], [17, 4], [17, 14], [16, 9], [11, 4], [11, 16], [17, 1], [17, 18], [12, 9]],
  WEST: [[4, 3], [4, 6], [4, 14], [4, 17], [1, 4], [1, 14], [2, 9], [8, 4], [8, 16], [1, 1], [1, 18], [7, 9]],
  NORTH: [[3, 4], [6, 4], [12, 4], [15, 4], [4, 1], [14, 1], [9, 3], [2, 8], [17, 8], [8, 7], [11, 7], [9, 12]],
};
/** 狙击塔放后排（射程 11，躲在主寨身后），震荡炮放前排挡路 */
const SNIPE_POS: Array<[number, number]> = [[7, 7], [13, 13], [13, 6], [6, 13]];
const SHOCK_POS: Array<[number, number]> = [[5, 9], [15, 11], [9, 5], [11, 15]];

interface Spec {
  id: string;
  name: string;
  captain: string;
  blurb: string;
  hq: number;
  reqStars: number;
  loot: { gold: number; wood: number };
  /** 防御建筑的等级（≤ 主寨等级） */
  lv: number;
  n: Partial<Record<BuildingKind, number>>;
  boss?: { name: string; mechanic: string; counter: string };
  /** 通道式布局：按区域摆建筑，主寨四面各留一条空道（见 ZONES） */
  plan?: Partial<Record<Zone, BuildingKind[]>>;
  /** 个别种类单独指定等级（其余用 lv） */
  lvBy?: Partial<Record<BuildingKind, number>>;
  /** 城墙：内圈（贴着主寨）和外圈（圈住整片炮台）各自选哪几面；gate = 缺口宽度（格），默认 2 */
  walls?: { inner?: Side[]; outer?: Side[]; gate?: number };
  /** 摆位思路（POS 的键），不写 = 默认一圈 RING */
  pos?: string;
  /** 细档：按固定顺序（先外圈后内圈）挑 up 座炮塔再高一级（不超过主寨等级），lv 和 lv+1 之间的中间档 */
  up?: number;
  /** 城墙单独一个等级，不写 = lv */
  wallLv?: number;
}

/** 参与「升一级」的炮塔（地雷、焦油、雾塔、海怪、墙和经济建筑不算） */
const UP_KINDS: BuildingKind[] = ['cannon', 'gunTower', 'mortar', 'flame', 'sniper', 'rocket', 'harpoon', 'shock'];

/** 从离主寨最远的塔开始（同距离按摆放顺序），挑 up 座高一级；单独指定了 lvBy 的种类不动 */
function applyUp(spec: Spec, b: Builder): void {
  if (!spec.up) return;
  const d = (p: Placed): number => {
    const h = BUILDINGS[p.kind].size / 2;
    return Math.abs(p.x + h - 10.5) + Math.abs(p.y + h - 10.5);
  };
  const towers = b.list.filter((p) => UP_KINDS.includes(p.kind) && !spec.lvBy?.[p.kind]).sort((a, c) => d(c) - d(a) || a.id - c.id);
  for (const t of towers.slice(0, spec.up)) t.level = Math.min(spec.hq, t.level + 1);
}

type Side = 'N' | 'S' | 'E' | 'W';
const SIDES: Side[] = ['N', 'S', 'E', 'W'];

/**
 * 一面墙的格子。内圈方框 7..14，外圈方框 4..17（主寨占 9..12，象限炮台占 5..6 和 15..16，所以外圈把炮台圈在里面）。
 * 南北两面带两个角，东西两面不带，四面拼起来不重格。内圈缺口在中线（10–11，正对地雷道），
 * 外圈缺口按风车错开（北偏东、南偏西、西偏北、东偏南），兵进了外圈缺口不能直走到内圈缺口，得绕半圈。
 */
function wallCells(side: Side, ring: 'inner' | 'outer', gate: number): Array<[number, number]> {
  const lo = ring === 'inner' ? 7 : 4;
  const hi = ring === 'inner' ? 14 : 17;
  // 缺口起点：内圈 10；外圈北 13、南 7、西 7、东 13（宽度 gate，gate = 1 时只留起点那格）
  const gapAt = ring === 'inner' ? 10 : { N: 13, S: 7, W: 7, E: 13 }[side];
  const out: Array<[number, number]> = [];
  const horizontal = side === 'N' || side === 'S';
  const y0 = side === 'N' ? lo : hi;
  const x0 = side === 'W' ? lo : hi;
  const from = horizontal ? lo : lo + 1;
  const to = horizontal ? hi : hi - 1;
  for (let k = from; k <= to; k++) {
    if (k >= gapAt && k < gapAt + gate) continue;
    out.push(horizontal ? [k, y0] : [x0, k]);
  }
  return out;
}

type Zone = 'NW' | 'NE' | 'SW' | 'SE' | 'INNER' | 'W' | 'N' | 'S' | 'E' | 'SEA';

/**
 * 通道式布局的槽位：四个象限放 2×2 的塔，象限之间和主寨四面各留一条两格宽的空道
 * （西道 y=10–11、北道 x=10–11、南道 x=10–11、东道 y=10–11），地雷和焦油只埋在道上。
 * 从不同的海滩登陆，走不同的道，遇到的东西就不一样。
 */
const ZONES: Record<Zone, Array<[number, number]>> = {
  NW: [[2, 2], [5, 2], [2, 5], [5, 5]],
  NE: [[15, 2], [18, 2], [15, 5], [18, 5]],
  SW: [[2, 15], [5, 15], [2, 18], [5, 18]],
  SE: [[15, 15], [18, 15], [15, 18], [18, 18]],
  INNER: [[7, 7], [13, 7], [7, 13], [13, 13]],
  W: [[1, 10], [3, 11], [5, 10], [7, 11], [2, 11], [4, 10], [6, 11], [8, 10]],
  N: [[10, 1], [11, 3], [10, 5], [11, 7], [11, 2], [10, 4], [11, 6], [10, 8]],
  S: [[10, 20], [11, 18], [10, 16], [11, 14], [11, 19], [10, 17], [11, 15], [10, 13]],
  E: [[20, 10], [18, 11], [16, 10], [14, 11], [19, 11], [17, 10], [15, 11], [13, 10]],
  SEA: [[22, 9], [-3, 9], [9, -3], [9, 22]],
};

function build(spec: Spec): LevelDef {
  const b = new Builder();
  const eco = Math.min(spec.hq, spec.lv + 1);
  b.add('hq', spec.hq, 9, 9);
  if (spec.plan) {
    // 资源建筑贴着道边，不挡道
    b.add('goldmine', eco, 0, 7);
    b.add('sawmill', eco, 19, 7);
    b.add('vault', eco, 7, 0);
    b.add('woodyard', eco, 7, 19);
    b.add('armory', eco, 19, 12);
    for (const zone of Object.keys(spec.plan) as Zone[]) {
      (spec.plan[zone] ?? []).forEach((kind, i) => {
        const at = ZONES[zone][i];
        if (at) b.add(kind, spec.lvBy?.[kind] ?? spec.lv, at[0], at[1]);
      });
    }
    for (const kind of ['sniper', 'shock'] as const) {
      for (let i = 0; i < (spec.n[kind] ?? 0); i++) b.auto(kind, spec.lvBy?.[kind] ?? spec.lv, (kind === 'sniper' ? SNIPE_POS : SHOCK_POS).slice(i));
    }
    for (const [x, y] of [[1, 1], [20, 1], [1, 20], [20, 20], [9, 6], [12, 6]] as Array<[number, number]>) b.add('palm', 1, x, y);
    applyUp(spec, b);
    addWalls(spec, b);
    return finish(spec, b);
  }
  b.add('goldmine', eco, 0, 8);
  b.add('sawmill', eco, 19, 8);
  b.add('vault', eco, 8, 0);
  b.add('woodyard', eco, 8, 19);
  b.add('armory', eco, 18, 12);
  const order: BuildingKind[] = ['kraken', 'fogTower', 'harpoon', 'sniper', 'rocket', 'shock', 'cannon', 'mortar', 'gunTower', 'flame', 'mine', 'tar'];
  for (const kind of order) {
    const count = spec.n[kind] ?? 0;
    for (let i = 0; i < count; i++) {
      if (kind === 'kraken') b.auto(kind, spec.lv, SEA.slice(i));
      else if (kind === 'mine' || kind === 'tar') b.auto(kind, spec.lv, MINES.slice((kind === 'tar' ? 5 : 0) + i));
      else if (kind === 'sniper') b.auto(kind, spec.lvBy?.[kind] ?? spec.lv, SNIPE_POS.slice(i));
      else if (kind === 'shock') b.auto(kind, spec.lvBy?.[kind] ?? spec.lv, SHOCK_POS.slice(i));
      else b.auto(kind, spec.lvBy?.[kind] ?? spec.lv, (spec.pos ? POS[spec.pos] ?? RING : RING).slice(i));
    }
  }
  for (const [x, y] of [[1, 1], [20, 1], [1, 20], [20, 20], [14, 2], [2, 6], [20, 15]] as Array<[number, number]>) b.add('palm', 1, x, y);
  applyUp(spec, b);
  addWalls(spec, b);
  return finish(spec, b);
}

/** 墙最后摆：碰到已有的建筑就跳过那一格，炮台和地雷的位置不挪（碰上的地方等于多开一个口子） */
function addWalls(spec: Spec, b: Builder): void {
  const w = spec.walls;
  if (!w) return;
  const gate = w.gate ?? 2;
  for (const side of SIDES) {
    if (w.inner?.includes(side)) for (const [x, y] of wallCells(side, 'inner', gate)) b.add('wall', spec.wallLv ?? spec.lv, x, y);
    if (w.outer?.includes(side)) for (const [x, y] of wallCells(side, 'outer', gate)) b.add('wall', spec.wallLv ?? spec.lv, x, y);
  }
}

function finish(spec: Spec, b: Builder): LevelDef {
  const lv: LevelDef = {
    id: spec.id,
    name: spec.name,
    captain: spec.captain,
    blurb: spec.blurb,
    hq: spec.hq,
    layout: b.list,
    loot: spec.loot,
    reqStars: spec.reqStars,
  };
  if (spec.boss) {
    lv.boss = true;
    lv.bossName = spec.boss.name;
    lv.mechanic = spec.boss.mechanic;
    lv.counter = spec.boss.counter;
  }
  return lv;
}

function loot(i: number): { gold: number; wood: number } {
  // 从 c12 的 14000 金往外推，每关约 +9%
  let g = 14000;
  for (let k = 12; k < i; k++) g = Math.floor((g * 109) / 100);
  g = Math.round(g / 100) * 100;
  return { gold: g, wood: Math.round((g * 40) / 100 / 100) * 100 };
}

/**
 * 各关的城墙（后段才有：c13 起，数量随关卡涨；c16 是悬赏出海借用的关，不加）。
 * 内圈 = 贴着主寨的方框，外圈 = 圈住象限炮台的大方框；缺口见 wallCells。
 */
const IN4: Side[] = ['N', 'S', 'E', 'W'];
const WALLS: Record<number, Spec['walls']> = {
  13: { inner: ['N', 'S'] },
  14: { inner: IN4 },
  15: { inner: IN4 },
  17: { inner: IN4, outer: ['N'] },
  18: { inner: IN4, outer: ['N', 'S'] },
  19: { inner: IN4, outer: ['W', 'E'] },
  20: { inner: IN4, outer: ['N', 'S'] },
  21: { inner: IN4, outer: ['N', 'S', 'W'] },
  22: { inner: IN4, outer: ['N', 'S', 'E'] },
  23: { inner: ['N', 'S'], outer: IN4 },
  24: { inner: ['N', 'S', 'W'], outer: IN4 },
  25: { inner: IN4, outer: IN4 },
  26: { inner: IN4, outer: IN4 },
  27: { inner: IN4, outer: IN4 },
  28: { inner: IN4, outer: IN4, gate: 1 },
  29: { inner: IN4, outer: IN4, gate: 1 },
  30: { inner: IN4, outer: IN4, gate: 1 },
};

/** 各关的摆位思路（没列的用默认一圈；c16 是悬赏出海借用的关，不动） */
const POS_OF: Record<number, string> = { 14: 'EDGE', 18: 'CORE', 22: 'EDGE', 26: 'CORE', 28: 'NORTH' };

/** 各关的细档（没列的 = S 里写的 lv、不升级、墙同 lv）：lv 覆盖基础等级，up 座塔再高一级，wall 是墙的等级 */
type Tune = Record<number, { lv?: number; up?: number; wall?: number; add?: Partial<Record<BuildingKind, number>>; lvBy?: Spec['lvBy']; pos?: string }>;
export const TUNE: Tune = {
  13: { lv: 5, up: 6, lvBy: { sniper: 5, shock: 5 } },
  14: { lv: 5, up: 4, lvBy: { sniper: 5, shock: 5 } },
  15: { lv: 3, up: 4, add: { sniper: 2, shock: 2 }, lvBy: { sniper: 3, shock: 3 } },
  16: { lv: 4, up: 4, add: { sniper: 1 }, lvBy: { sniper: 4, shock: 4 } },
  17: { lv: 6, up: 8, add: { sniper: 1 }, lvBy: { sniper: 6, shock: 6 } },
  18: { lv: 6, up: 0, add: { sniper: 2, shock: 2 }, lvBy: { sniper: 6, shock: 6 } },
  19: { lv: 6, up: 4, lvBy: { sniper: 6, shock: 6 } },
  20: { lv: 7, up: 0, add: { sniper: 4, shock: 1 }, lvBy: { sniper: 7, shock: 7 } },
  21: { lv: 4, up: 4, add: { shock: 1 }, lvBy: { sniper: 4, shock: 4 } },
  22: { lv: 7, up: 0, add: { sniper: 2, shock: 2 }, lvBy: { sniper: 7, shock: 7 } },
  23: { lv: 6, up: 4, add: { sniper: 1 }, lvBy: { sniper: 6, shock: 6 } },
  24: { lv: 4, up: 12, add: { sniper: 2, shock: 1 }, lvBy: { sniper: 4, shock: 4 } },
  25: { lv: 7, up: 10, add: { sniper: 1, shock: 1 }, lvBy: { sniper: 7, shock: 7 } },
  26: { lv: 5, up: 4, lvBy: { sniper: 5, shock: 5 }, pos: 'EDGE' },
  27: { lv: 4, up: 8, lvBy: { sniper: 4, shock: 4 } },
  28: { lv: 5, up: 4, lvBy: { sniper: 5, shock: 5 }, pos: 'EDGE' },
  // c29 少一座火箭塔：南面登陆正对两座火箭，小白从南面上岸只赢 28%，比终关 c30 还难（0.31.23，小白 59% → 74%，普通不变）
  29: { lv: 6, up: 8, add: { sniper: 1, rocket: -1 }, lvBy: { sniper: 6, shock: 6 }, pos: 'EDGE' },
};

function addN(n: Spec['n'], add: Spec['n'] | undefined): Spec['n'] {
  if (!add) return n;
  const out = { ...n };
  for (const k of Object.keys(add) as BuildingKind[]) out[k] = (out[k] ?? 0) + (add[k] ?? 0);
  return out;
}

/** 按细档表生成 c13–c30（调参脚本传自己的表） */
function makeLate(tune: Tune = TUNE): LevelDef[] {
  const S = (i: number, name: string, captain: string, blurb: string, hq: number, lv: number, n: Spec['n'], boss?: Spec['boss'], plan?: Spec['plan'], lvBy?: Spec['lvBy']): LevelDef => {
    const t = tune[i] ?? {};
    return build({ id: `c${i}`, name, captain, blurb, hq, reqStars: 30 + (i - 12) * 2, loot: loot(i), lv: t.lv ?? lv, up: t.up, wallLv: t.wall, n: addN(n, t.add), boss, plan, lvBy: t.lvBy ?? lvBy, walls: WALLS[i], pos: t.pos ?? POS_OF[i] });
  };

  return [
  S(13, '咸水岛', '咸胡子哈克', '海水泡出来的老油条，炮多枪多，没什么花样。', 6, 5, { cannon: 3, gunTower: 4, mortar: 1, flame: 1, mine: 5 }),
  S(14, '碎浪礁', '碎浪阿珍', '她的炮台建在浪花里，近岸一带最密。', 6, 5, { cannon: 4, gunTower: 4, mortar: 2, flame: 1, mine: 6 }),
  S(15, '雾锁岛', '迷雾女王莉娜', '两座雾塔把岛罩得严严实实，炮击打不中看不见的，兵走近了建筑才现形。', 6, 5, { fogTower: 2, cannon: 3, gunTower: 3, mortar: 1, flame: 2, mine: 8 }, { name: '迷雾女王·莉娜', mechanic: '雾塔：半径内的建筑看不见，兵走近才现形；炮击和信号弹打不到看不见的', counter: '兵先走进雾里近身侦察，建筑现形后再放炮击；先打掉雾塔雾就散了。' }, { NW: ['cannon', 'gunTower'], NE: ['cannon', 'gunTower'], SW: ['cannon', 'mortar'], SE: ['gunTower', 'flame', 'flame'], INNER: ['fogTower', 'fogTower'], W: ['mine', 'mine', 'mine'], N: ['mine', 'mine'], S: ['mine'], E: ['mine', 'mine'] }),
  S(16, '铜钟港', '铜钟老魏', '一口铜钟敲响，满港炮火都开了。', 6, 5, { cannon: 4, gunTower: 4, mortar: 1, flame: 2, mine: 6 }),
  S(17, '暗礁堡', '暗礁蛮牛', '暗礁堡里藏着第一批鱼叉炮，射程比你的火枪手远得多。', 7, 7, { harpoon: 2, cannon: 3, gunTower: 3, mortar: 2, flame: 2, mine: 6 }),
  S(18, '红树湾', '红树寡妇', '红树林里全是地雷，火箭塔在树后打冷枪。', 7, 7, { rocket: 1, harpoon: 1, cannon: 3, gunTower: 3, mortar: 2, mine: 10 }),
  S(19, '乌鸦岭', '乌鸦托比', '乌鸦一叫，炮火齐发；兵别扎堆。', 7, 5, { rocket: 1, harpoon: 1, cannon: 4, gunTower: 3, mortar: 2, flame: 1, mine: 8 }),
  S(20, '焦油沼泽', '黑泥老爹', '满地都是看不见的焦油，踩上去走路慢一半，炮火专打慢兵。', 7, 6, { tar: 12, rocket: 1, harpoon: 1, cannon: 4, gunTower: 4, mortar: 2, flame: 2, mine: 4 }, { name: '沼泽之王·黑泥老爹', mechanic: '焦油陷阱：看不见，踩上去减速一半几秒', counter: '壮汉走在前面扛伤（有船医更好，主寨 8 级开放），别让兵挤在焦油上挨炮；先用炮击拆鱼叉炮和火箭塔。' }, { NW: ['cannon', 'gunTower', 'cannon', 'gunTower'], NE: ['harpoon', 'rocket', 'cannon', 'gunTower'], SW: ['mortar', 'flame', 'cannon', 'gunTower'], SE: ['mortar', 'flame'], W: ['tar', 'tar', 'tar', 'tar', 'tar', 'tar'], S: ['tar', 'tar', 'tar', 'tar', 'tar', 'tar'], N: ['mine', 'mine', 'mine', 'mine'] }),
  S(21, '铁钩湾', '铁钩雷克', '铁钩一甩，鱼叉齐飞，远处还有一座狙击塔专点后排。', 7, 4, { sniper: 1, rocket: 2, harpoon: 2, cannon: 4, gunTower: 3, mortar: 2, flame: 2, mine: 8 }, undefined, undefined, { sniper: 2 }),
  S(22, '白骨滩', '白骨玛莎', '白骨铺成的海滩，每一步都有人在盯着你。', 7, 5, { rocket: 1, harpoon: 1, cannon: 3, gunTower: 4, mortar: 2, flame: 2, mine: 8 }),
  S(23, '鲸骨岛', '鲸骨船长', '鲸骨搭成的堡垒，焦油和火箭一起上。', 8, 6, { tar: 6, rocket: 2, harpoon: 2, cannon: 4, gunTower: 4, mortar: 3, flame: 1, mine: 8 }),
  S(24, '雷霆礁', '雷霆阿岩', '鱼叉炮一排排架着，前排还有震荡炮，被震晕的兵走不动。', 8, 5, { shock: 1, tar: 4, rocket: 2, harpoon: 3, cannon: 4, gunTower: 4, mortar: 3, flame: 1, mine: 8 }, undefined, undefined, { shock: 2 }),
  S(25, '火箭要塞', '火箭疯子洛基', '满岛的火箭塔，一次三发，船医别站在最前面。', 8, 8, { rocket: 4, harpoon: 2, cannon: 3, gunTower: 3, mortar: 2, mine: 6 }, { name: '火箭疯子·洛基', mechanic: '火箭塔阵：一次打三个目标，小范围溅射', counter: '分开两侧登陆，别扎堆吃溅射；用炮击先拆火箭塔，壮汉挡在前面。' }, { NE: ['rocket', 'rocket', 'harpoon', 'cannon'], NW: ['rocket', 'rocket', 'gunTower', 'gunTower'], SW: ['mortar', 'cannon', 'gunTower'], SE: ['harpoon', 'mortar', 'cannon'], W: ['mine', 'mine', 'mine'], S: ['mine', 'mine', 'mine'] }),
  S(26, '沉钟岛', '沉钟守夜人', '夜里钟声一响，所有炮台一起转向海滩。', 8, 5, { tar: 6, rocket: 3, harpoon: 3, cannon: 5, gunTower: 4, mortar: 3, flame: 3, mine: 8 }),
  S(27, '狂潮湾', '狂潮朵拉', '潮水退下，露出一排又一排陷阱，震荡炮和狙击塔前后配合。', 8, 4, { sniper: 2, shock: 2, tar: 8, rocket: 3, harpoon: 3, cannon: 5, gunTower: 5, mortar: 3, flame: 3, mine: 10 }),
  S(28, '赤焰岛', '赤焰索尔', '喷火塔把整个岛烧成一片红。', 8, 5, { tar: 6, rocket: 3, harpoon: 3, cannon: 5, gunTower: 5, mortar: 3, flame: 5, mine: 10 }),
  S(29, '深渊口', '深渊渔夫', '最后一道关口，海怪、雾、雷样样都有。', 8, 8, { kraken: 1, fogTower: 1, tar: 6, rocket: 2, harpoon: 2, cannon: 4, gunTower: 4, mortar: 3, flame: 4, mine: 10 }),
  S(30, '海王殿', '海王不沉王', '海盗王的老巢：海怪、迷雾、焦油、火箭，全套都在。赢了你就是新的海盗王。', 8, 5, { kraken: 1, fogTower: 2, tar: 6, rocket: 4, harpoon: 3, cannon: 3, gunTower: 4, mortar: 2, flame: 2, mine: 12 }, { name: '海盗王·不沉王', mechanic: '终极混合：海怪、雾塔、焦油陷阱、火箭塔', counter: '避开海怪那一侧登陆，近身侦察破雾，壮汉加船医推进，炮击优先拆火箭塔和鱼叉炮。' }, { SEA: ['kraken'], INNER: ['rocket', 'fogTower', 'fogTower', 'rocket'], NW: ['cannon', 'gunTower', 'cannon', 'gunTower'], NE: ['rocket', 'harpoon', 'harpoon', 'gunTower'], SW: ['cannon', 'mortar', 'flame', 'flame'], SE: ['rocket', 'mortar', 'gunTower', 'harpoon'], W: ['tar', 'mine', 'tar', 'mine', 'tar', 'mine', 'tar', 'mine'], N: ['mine', 'mine', 'tar', 'mine'], S: ['mine', 'mine', 'mine', 'mine', 'tar', 'mine'] }),
  ];
}

export const LATE_CAMPAIGN: LevelDef[] = makeLate();
