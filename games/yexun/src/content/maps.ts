/**
 * 守夜的地图（DESIGN.md 3.6）。雪原开阔；义庄是一圈院墙围着正堂和棺材，四面各留一个门洞、四角各有缺口，怪从门洞挤进来，尸类怪多；
 * 鬼市是一排排摊子隔出来的横巷；乱葬岗坟包挡路，几块磷火地轮流起火（火区，夜探窑镇的窑口同一套规则，core/fire.ts）。
 * 挡路的东西是轴对齐的矩形（脚底占的地，不是整张图的大小），主角和怪都推不进去；子弹、掉落物不管它。
 */
import type { EnemyKind } from './enemies.ts';
import { ARENA } from './player.ts';

export type MapId = 'snow' | 'yizhuang' | 'bamboo' | 'riverbank' | 'icelake' | 'temple' | 'guishi' | 'luanzang';

/** 一块挡路的东西：x, y 是左上角；look 告诉画面层画什么 */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  look: 'wall_h' | 'wall_v' | 'coffin' | 'hall' | 'bamboo' | 'rock' | 'censer' | 'gstall' | 'grave';
  /** 竹丛的血：被法器打到 0 就倒，倒了的块不再挡路也不再长回来（只有 bamboo 有） */
  hp?: number;
}

/** 轴对齐矩形（水区、冰区、桥） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapDef {
  id: MapId;
  name: string;
  blurb: string;
  blocks: readonly Block[];
  /** 水区：主角和怪进去走得慢（桥是水区之间留的缺口，不算水） */
  water?: readonly Rect[];
  /** 冰面：主角和怪在上面有惯性 */
  ice?: readonly Rect[];
  /** 桥：只给画面层画木板（桥面本来就不是水区）；长边是过河的方向，两头各伸出河岸一点 */
  bridges?: readonly Rect[];
  /** 香火区（荒庙）：主角站在里面慢慢回血，但怪来得更多（TERRAIN.incense*） */
  incense?: readonly Rect[];
  /** 火区（乱葬岗的磷火地）：按 FIRE 的节奏轮流起火，火里的怪掉血、主角挨烫 */
  fire?: readonly Rect[];
  /** 画面层的色调提示（地面染色） */
  tone?: 'snow' | 'yard' | 'bamboo' | 'river' | 'ice' | 'temple' | 'market' | 'grave';
  /** 选模式屏的地图卡上标"难"（按普通机器人的胜率，明显比雪原低一截的图） */
  hard?: boolean;
  /** 刷怪比例的倍数（义庄：跳尸、枯骨多） */
  mix?: Partial<Record<EnemyKind, number>>;
}

const C = ARENA.w / 2;
/** 院墙：半边长、门洞半宽、墙厚 */
const YARD = 520;
const GATE = 200;
/** 院墙四角的缺口 */
const CORNER = 150;
const T = 26;

/**
 * 院墙四角各留一个缺口、门洞放宽：小白被怪追着贴墙跑，封死的话会在四角和长墙上卡住、被灯笼鬼的火球点死，
 * 义庄小白倒下的局一半多是最后 10 秒几乎没挪动的（雪原一成）。
 */
function yard(): Block[] {
  const a = C - YARD;
  const b = C + YARD;
  const run = YARD - GATE - CORNER;
  return [
    { x: a + CORNER, y: a, w: run, h: T, look: 'wall_h' },
    { x: C + GATE, y: a, w: run, h: T, look: 'wall_h' },
    { x: a + CORNER, y: b, w: run, h: T, look: 'wall_h' },
    { x: C + GATE, y: b, w: run, h: T, look: 'wall_h' },
    { x: a, y: a + CORNER, w: T, h: run, look: 'wall_v' },
    { x: a, y: C + GATE, w: T, h: run, look: 'wall_v' },
    { x: b, y: a + CORNER, w: T, h: run, look: 'wall_v' },
    { x: b, y: C + GATE, w: T, h: run, look: 'wall_v' },
  ];
}

/** 地图卡的顺序：雪原打头（第一张），其余按小白危险 2 胜率从高到低（DESIGN 3.6 的表） */
export const MAP_IDS: readonly MapId[] = ['snow', 'bamboo', 'icelake', 'luanzang', 'guishi', 'yizhuang', 'riverbank', 'temple'];

/** 解锁条件：守夜最长撑过多少秒（null = 一开始就开）；text 是卡上写的一句话 */
export const MAP_UNLOCK: Record<MapId, { seconds: number; text: string } | null> = {
  snow: null,
  yizhuang: null,
  bamboo: { seconds: 240, text: '守夜撑过 4 分钟' },
  icelake: { seconds: 480, text: '守夜撑过 8 分钟' },
  // 河滩按难度该排在冰湖后面（12 分钟），但解锁是按"最长撑过多久"现算的、不存档：改成 12 分钟会把已经开了河滩的老玩家锁回去，所以两张都 8 分钟
  riverbank: { seconds: 480, text: '守夜撑过 8 分钟' },
  temple: { seconds: 600, text: '守夜撑过 10 分钟' },
  guishi: { seconds: 720, text: '守夜撑过 12 分钟' },
  luanzang: { seconds: 720, text: '守夜撑过 12 分钟' },
};

/** 地形手感（核心用，改数值只改这里） */
export const TERRAIN = {
  /** 水里走路的速度倍数（主角、怪都一样；飞的和水鬼不受影响） */
  waterMul: 0.55,
  /** 冰上主角：有输入时每拍向目标速度靠多少、松手时每拍衰减多少 */
  iceAccel: 0.09,
  iceFriction: 0.025,
  /** 冰上的怪：每拍向目标速度靠多少；击退在冰上的保留系数（平地 0.72） */
  iceEnemyAccel: 0.06,
  iceKnock: 0.9,
  /** 同一丛竹子两次受伤的最短间隔（拍）：持续伤害的法器不会一拍砍倒 */
  chopGap: 8,
  /** 义庄的棺材：血量；打碎时坐起几只跳尸 */
  coffinHp: 40,
  coffinFoes: 2,
  /** 香火区里每秒多回几点血（咒印"不回血"照样减半）；怪的上限和刷怪速度乘多少（香火引怪） */
  incenseRegen: 1.6,
  incenseKeep: 1.3,
  incenseRate: 1.7,
} as const;

/**
 * 火区（乱葬岗的磷火地、窑镇的窑口；core/fire.ts）：第 from 拍起，每块按 period 一轮，先预告 warn 拍、再烧 burn 拍，
 * 第 k 块错开 k × period / 块数，轮流起火。烧着时每 tickEvery 拍结一次：火里的普通怪掉最大血的 mob、精英 elite（首领不吃），
 * 怕火的怪（FIRE_FEAR）再乘 fear；主角在火里每次挨 player 点（照常吃危险档伤害倍数和无敌帧）。
 */
/** 怕火的怪：火区里掉血再乘 FIRE.fear */
export const FIRE_FEAR: readonly EnemyKind[] = ['juemu'];
export const FIRE = { from: 20 * 30, period: 300, warn: 45, burn: 60, tickEvery: 15, mob: 0.1, elite: 0.025, fear: 3, player: 6 } as const;

/** 整数 LCG：地图布局用，不依赖核心的 Rng，固定种子，布局永远一样 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 8) / 16777216;
  };
}

/**
 * 竹林：3200 见方铺成 240 的格子，多数格子里长一丛竹（90–150 宽、54–100 高，血随面积），
 * 十字形留出两条通到出生点的宽路，出生点四周留空；相邻两丛之间至少隔 90，能走过去。
 */
function grove(): Block[] {
  const r = lcg(20261017);
  const out: Block[] = [];
  const cell = 240;
  const n = Math.floor(ARENA.w / cell);
  const off = (ARENA.w - n * cell) / 2;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const cx = off + gx * cell + cell / 2;
      const cy = off + gy * cell + cell / 2;
      const w = 90 + Math.floor(r() * 60);
      const h = 54 + Math.floor(r() * 46);
      const jx = Math.floor(r() * (cell - 90 - w));
      const jy = Math.floor(r() * (cell - 90 - h));
      const keep = r() < 0.62;
      // 出生点四周留空；正中一横一竖是宽路；斜着再留一条弯路（第 3 列到第 9 列）
      const dx = cx - C;
      const dy = cy - C;
      if (dx * dx + dy * dy < 340 * 340) continue;
      if (gx === 6 || gy === 6) continue;
      if (gy === gx + 3 && gx < 8) continue;
      if (!keep) continue;
      const x = off + gx * cell + 45 + jx;
      const y = off + gy * cell + 45 + jy;
      out.push({ x, y, w, h, hp: Math.round((w * h) / 90), look: 'bamboo' });
    }
  }
  return out;
}

/** 河滩：一条横河（北）加一条竖河（东南），各开几座桥；桥是水区之间的缺口 */
function riverbank(): { water: Rect[]; bridges: Rect[]; blocks: Block[] } {
  const water: Rect[] = [];
  const bridges: Rect[] = [];
  const W = ARENA.w;
  // 横河：y 1260–1440（出生点正北，桥就在正上方），横贯，桥在 x 500、1600、2700
  const h0 = 1260;
  const h1 = 1440;
  const hb = [500, 1600, 2700];
  let x = 0;
  for (const c of hb) {
    water.push({ x, y: h0, w: c - 90 - x, h: h1 - h0 });
    bridges.push({ x: c - 90, y: h0 - 30, w: 180, h: h1 - h0 + 60 });
    x = c + 90;
  }
  water.push({ x, y: h0, w: W - x, h: h1 - h0 });
  // 竖河：x 2050–2230，从横河一直到南边，桥在 y 1800、2650
  const v0 = 2050;
  const v1 = 2230;
  let y = h1;
  for (const c of [1800, 2650]) {
    water.push({ x: v0, y, w: v1 - v0, h: c - 90 - y });
    bridges.push({ x: v0 - 30, y: c - 90, w: v1 - v0 + 60, h: 180 });
    y = c + 90;
  }
  water.push({ x: v0, y, w: v1 - v0, h: W - y });
  // 河岸的石头（挡路，小）
  const rock = (cx: number, cy: number): Block => ({ x: cx - 28, y: cy - 14, w: 56, h: 28, look: 'rock' });
  const blocks = [
    rock(300, 1220), rock(1000, 1475), rock(1250, 1220), rock(2000, 1475), rock(2750, 1220),
    rock(2020, 1650), rock(2260, 2200), rock(2020, 2400), rock(2260, 2950), rock(800, 1480),
  ];
  return { water, bridges, blocks };
}

/** 冰湖：中间一大片冰面，冰上散几块石头（滑过去会撞停） */
function icelake(): { ice: Rect[]; blocks: Block[] } {
  const ice: Rect[] = [{ x: 560, y: 560, w: 2080, h: 2080 }];
  const rock = (cx: number, cy: number): Block => ({ x: cx - 30, y: cy - 15, w: 60, h: 30, look: 'rock' });
  const blocks = [
    rock(1000, 900), rock(2200, 1000), rock(1250, 2150), rock(2300, 2300), rock(900, 1700), rock(2150, 1650),
    // 湖外雪地里也有几块
    rock(300, 400), rock(2900, 700), rock(400, 2800), rock(2800, 2900),
  ];
  return { ice, blocks };
}

/**
 * 荒庙：正中一座破庙，院墙塌了好几处（缺口能走），北边大殿；院里一尊大香炉，庙外还有三尊。
 * 香炉四周一块是香火区：站进去慢慢回血，可香火也把怪引过来，待久了被围（DESIGN.md 3.6 荒庙）。
 */
function temple(): { blocks: Block[]; incense: Rect[] } {
  const a = C - 560;
  const b = C + 560;
  const T2 = 26;
  const blocks: Block[] = [
    // 北墙：三段，中间和东边塌了，西北角也塌了（同义庄：小白贴墙跑进死角出不来）
    { x: a + 140, y: a, w: 200, h: T2, look: 'wall_h' },
    { x: C - 120, y: a, w: 200, h: T2, look: 'wall_h' },
    { x: b - 180, y: a, w: 180 + T2, h: T2, look: 'wall_h' },
    // 南墙：两段，正中山门和西南角塌了
    { x: a + 160, y: b, w: 300, h: T2, look: 'wall_h' },
    { x: C + 130, y: b, w: 280, h: T2, look: 'wall_h' },
    // 西墙、东墙：各断两处
    { x: a, y: a + 150, w: T2, h: 160, look: 'wall_v' },
    { x: a, y: C + 40, w: T2, h: 300, look: 'wall_v' },
    { x: b, y: a + 180, w: T2, h: 300, look: 'wall_v' },
    { x: b, y: C + 200, w: T2, h: 200, look: 'wall_v' },
    // 大殿和院里的香炉
    { x: C - 140, y: a + 70, w: 280, h: 70, look: 'hall' },
    { x: C - 24, y: C - 230, w: 48, h: 30, look: 'censer' },
  ];
  const outside: [number, number][] = [[620, 760], [2560, 900], [1500, 2660]];
  for (const [x, y] of outside) blocks.push({ x: x - 24, y: y - 15, w: 48, h: 30, look: 'censer' });
  const rock = (cx: number, cy: number): Block => ({ x: cx - 28, y: cy - 14, w: 56, h: 28, look: 'rock' });
  blocks.push(rock(400, 1500), rock(2800, 1700), rock(1000, 2300), rock(2300, 2500), rock(1800, 500), rock(2900, 2900), rock(300, 2900));
  const zone = (x: number, y: number): Rect => ({ x: x - 130, y: y - 120, w: 260, h: 240 });
  const incense = [zone(C, C - 215), ...outside.map(([x, y]) => zone(x, y))];
  return { blocks, incense };
}

/**
 * 鬼市：一排排鬼摊子横着摆满全场，摊子之间是横向的长巷（宽约 270），同一排摊子之间只留 100 宽的缝；
 * 相邻两排错开半个摊位，缝对不齐，南北走要拐着钻。正中一块空场（出生点）和一条南北大街直通上下。
 * 横着跑顺、竖着跑要找缝，怪也一样被摊子挡着，从缝里一只只挤出来（DESIGN.md 3.6 鬼市）。
 */
function guishi(): Block[] {
  const out: Block[] = [];
  const sw = 130;
  const sh = 44;
  const step = 230;
  let row = 0;
  for (let ry = 300; ry < ARENA.h - 200; ry += 320, row++) {
    const shift = row % 2 === 0 ? 0 : step / 2;
    for (let sx = 150 + shift; sx < ARENA.w - 120; sx += step) {
      const dx = sx - C;
      const dy = ry - C;
      // 南北大街
      if (dx > -150 && dx < 150) continue;
      // 正中的空场
      if (dx * dx + dy * dy < 400 * 400) continue;
      out.push({ x: sx - sw / 2, y: ry - sh / 2, w: sw, h: sh, look: 'gstall' });
    }
  }
  return out;
}

/** 义庄：院墙 + 正堂、棺材和院外的残墙 */
function yizhuang(): Block[] {
  return [
    ...yard(),
    // 正堂在院子北边，门前留出空地
    { x: C - 110, y: C - 330, w: 220, h: 60, look: 'hall' },
    // 院里两排棺材
    coffin(C - 240, C - 120),
    coffin(C + 240, C - 120),
    coffin(C - 240, C + 170),
    coffin(C + 240, C + 170),
    // 院外：散落的棺材和残墙
    coffin(C - 820, C - 640),
    coffin(C + 760, C - 700),
    coffin(C - 700, C + 760),
    coffin(C + 880, C + 620),
    coffin(C - 1100, C + 80),
    coffin(C + 1150, C - 40),
    { x: C - 1000, y: C - 1000, w: 320, h: T, look: 'wall_h' },
    { x: C + 700, y: C - 1080, w: T, h: 300, look: 'wall_v' },
    { x: C - 1060, y: C + 820, w: T, h: 300, look: 'wall_v' },
    { x: C + 640, y: C + 1000, w: 360, h: T, look: 'wall_h' },
  ];
}

/**
 * 乱葬岗：满地坟包（挡路，矮，不挡视线），八块磷火地两圈错开摆，出生点四周留空。
 * 磷火地轮流起火（FIRE）：把怪引进火里烧是这张图的打法，自己别站进去（DESIGN.md 3.6 乱葬岗）。
 */
function luanzang(): { blocks: Block[]; fire: Rect[] } {
  const zone = (x: number, y: number): Rect => ({ x: x - 120, y: y - 100, w: 240, h: 200 });
  const fire: Rect[] = [];
  // 内圈正东南西北 620 远，外圈斜角 1,000 远（各轴 707.1），内外交替排：相邻编号的两块离得远，轮流起火时不扎堆
  const inner: readonly (readonly [number, number])[] = [[620, 0], [0, 620], [-620, 0], [0, -620]];
  const outer: readonly (readonly [number, number])[] = [[707.1, 707.1], [-707.1, 707.1], [-707.1, -707.1], [707.1, -707.1]];
  for (let k = 0; k < 4; k++) {
    fire.push(zone(C + inner[k]![0], C + inner[k]![1]));
    fire.push(zone(C + outer[k]![0], C + outer[k]![1]));
  }
  const r = lcg(20261120);
  const blocks: Block[] = [];
  const gw = 76;
  const gh = 40;
  const clear = (x: number, y: number): boolean => {
    const dx = x - C;
    const dy = y - C;
    if (dx * dx + dy * dy < 320 * 320) return false;
    for (const z of fire) if (x + gw / 2 > z.x - 50 && x - gw / 2 < z.x + z.w + 50 && y + gh / 2 > z.y - 50 && y - gh / 2 < z.y + z.h + 50) return false;
    for (const b of blocks) if (x + gw / 2 > b.x - 46 && x - gw / 2 < b.x + b.w + 46 && y + gh / 2 > b.y - 40 && y - gh / 2 < b.y + b.h + 40) return false;
    return true;
  };
  for (let n = 0; n < 1200 && blocks.length < 150; n++) {
    const x = 160 + Math.floor(r() * (ARENA.w - 320));
    const y = 160 + Math.floor(r() * (ARENA.h - 320));
    if (clear(x, y)) blocks.push({ x: x - gw / 2, y: y - gh / 2, w: gw, h: gh, look: 'grave' });
  }
  return { blocks, fire };
}

const TP = temple();
const LZ = luanzang();
const RB = riverbank();
const IL = icelake();

/** 义庄的棺材：挡路，打得碎，碎了坐起跳尸（TERRAIN.coffin*） */
const coffin = (x: number, y: number): Block => ({ x: x - 34, y: y - 12, w: 68, h: 24, hp: TERRAIN.coffinHp, look: 'coffin' });

export const MAPS: Record<MapId, MapDef> = {
  snow: { id: 'snow', name: '雪原', blurb: '开阔的雪地，往哪儿跑都行', blocks: [], tone: 'snow' },
  bamboo: { id: 'bamboo', name: '竹林', blurb: '竹子挡路，打几下就倒', blocks: grove(), tone: 'bamboo' },
  riverbank: { id: 'riverbank', name: '河滩', blurb: '两条河把地分开，桥是要道，水里走不快', blocks: RB.blocks, water: RB.water, bridges: RB.bridges, tone: 'river' },
  icelake: { id: 'icelake', name: '冰湖', blurb: '冰面打滑，停不住脚', blocks: IL.blocks, ice: IL.ice, tone: 'ice' },
  temple: { id: 'temple', name: '荒庙', blurb: '香炉边能回血，可香火会引来更多怪', blocks: TP.blocks, incense: TP.incense, tone: 'temple', hard: true },
  luanzang: { id: 'luanzang', name: '乱葬岗', blurb: '坟包挡路，磷火轮流烧起来，把怪引进火里', blocks: LZ.blocks, fire: LZ.fire, tone: 'grave' },
  guishi: { id: 'guishi', name: '鬼市', blurb: '摊子一排排，横着好跑，竖着要钻缝', blocks: guishi(), tone: 'market' },
  yizhuang: {
    id: 'yizhuang',
    name: '义庄',
    blurb: '院墙围着，怪从门洞挤进来；尸类多',
    blocks: yizhuang(),
    tone: 'yard',
    hard: true,
    mix: { jiangshi: 1.5, bone: 1.3, general: 1 },
  },
};

/** 圆（x, y, r）压进了哪块就推出来；返回推过没有。轴对齐矩形：找矩形上离圆心最近的点，沿那个方向推开 */
export function pushOut(blocks: readonly Block[], p: { x: number; y: number }, r: number): boolean {
  let moved = false;
  for (const b of blocks) {
    if (p.x + r <= b.x || p.x - r >= b.x + b.w || p.y + r <= b.y || p.y - r >= b.y + b.h) continue;
    const nx = p.x < b.x ? b.x : Math.min(p.x, b.x + b.w);
    const ny = p.y < b.y ? b.y : Math.min(p.y, b.y + b.h);
    const dx = p.x - nx;
    const dy = p.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0) {
      // 圆心在矩形外：沿最近点的方向推到刚好贴边（只用四则运算：按轴分量比例推）
      const ax = dx < 0 ? -dx : dx;
      const ay = dy < 0 ? -dy : dy;
      if (ax >= ay) p.x = nx + (dx < 0 ? -r : r);
      else p.y = ny + (dy < 0 ? -r : r);
    } else {
      // 圆心进了矩形：从最浅的那条边推出去
      const l = p.x - b.x;
      const rr = b.x + b.w - p.x;
      const t = p.y - b.y;
      const bb = b.y + b.h - p.y;
      const m = Math.min(l, rr, t, bb);
      if (m === l) p.x = b.x - r;
      else if (m === rr) p.x = b.x + b.w + r;
      else if (m === t) p.y = b.y - r;
      else p.y = b.y + b.h + r;
    }
    moved = true;
  }
  return moved;
}

/** 点在不在某个矩形里（水区、冰区） */
export function inRects(rs: readonly Rect[] | undefined, x: number, y: number): boolean {
  if (!rs) return false;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]!;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
  }
  return false;
}
