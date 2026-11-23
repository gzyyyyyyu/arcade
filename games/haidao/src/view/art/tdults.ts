/**
 * 守岛的终极塔（td.md 批 1、批 3）：在 3 阶（建筑 8 级）的图上加件、换一套金属色，不整张重画。
 *
 * 每个终极给四样（都和 3 阶原图同锚点、同转轴，场景直接换 key 就行）：
 * - `tdUltArt(id)`：整张图（图标、炮头没烘好时用），= buildingArt(种类, 8) 换色 + 加件；
 * - `tdUltBaseArt(id)`：不带炮头的底座（分件炮台用），= turretBaseArt(种类, 8) 换色 + 加件；
 * - `tdUltRoofArt(id)`：火枪塔的屋顶（盖在火枪手上面），其余种类给 null；
 * - `tdUltHeadPieces(id)`：炮头图集的帧（`tdUltHeadTex(id)` / `tdUltHeadFrame(id, 部件)`），= 3 阶炮头换色，
 *   攻城巨炮整体放大 `TD_ULT_ART[id].head` 倍（炮口偏移要跟着乘，见 turretGeom 的 k）。
 * 加件分两层：back 画在原图后面（地上的光圈、背后的旗），front 盖在原图前面（护板、火盆、弹堆）。
 */
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { P, box, cone, cyl, ell, f, inner, lighten, line, mat, path, poly, skull } from './kit.ts';
import { gradeHex, gradeSvg } from './grade.ts';
import { gtRoof, gunTowerRoof, towerScale, turretBaseArt, TURRET_PIVOT } from './buildings.ts';
import { turretPieces, turretTier } from './turrets.ts';

/** 终极塔都是 3 阶 = 建筑 8 级 */
const LV = 8;

export type TdUltTower = 'gunTower' | 'cannon' | 'mortar' | 'flame' | 'harpoon' | 'rocket';
/** 终极的美术 id（名字照 td.md：批 1 六个 + 批 3 六个） */
export const TD_ULT_ART_IDS = ['eagle', 'volley', 'siege', 'grape', 'firerain', 'quake', 'dragon', 'melt', 'whaler', 'pierce', 'swarm', 'flare'] as const;
export type TdUltArtId = (typeof TD_ULT_ART_IDS)[number];

interface UltDef {
  tower: TdUltTower;
  name: string;
  /** 换色：3 阶原图里的这些颜色（调色前）换成后面的 */
  swap: Array<[string, string]>;
  /** 火枪塔终极的屋顶瓦色（只有火枪塔用） */
  roof?: string;
  /** 炮头放大倍数（1 = 不放大） */
  head: number;
  back: () => string;
  front: () => string;
}

// ---------------------------------------------------------------- 共用小件

/** 脚下一圈终极的光（画在原图后面）：所有终极都有，一眼和 3 阶分开 */
function aura(c: string): string {
  return ell(0, 4, 78, 38, c, { sw: 0, op: 0.22 }) + ell(0, 4, 70, 34, 'none', { stroke: c, sw: 3, op: 0.75 }) + ell(0, 4, 74, 36, 'none', { stroke: lighten(c, 0.5), sw: 1.2, op: 0.6 });
}

/** 燕尾旗（终极的标志旗）：插在 (gx, gy) 格、高 z 起，杆长 h */
function pennant(gx: number, gy: number, z: number, h: number, c: string, emblem: string): string {
  const b = P(gx, gy, z);
  const t: Pt = [b[0], b[1] - h];
  let o = line(b, t, C.woodDD!, 3.2) + line(b, t, C.wood!, 1.6);
  o += path(`M${f(t[0] + 1)},${f(t[1] + 2)} L${f(t[0] + 30)},${f(t[1] + 4)} L${f(t[0] + 22)},${f(t[1] + 11)} L${f(t[0] + 30)},${f(t[1] + 18)} L${f(t[0] + 1)},${f(t[1] + 17)} Z`, c, { sw: 1.6 });
  o += path(`M${f(t[0] + 1)},${f(t[1] + 4)} L${f(t[0] + 26)},${f(t[1] + 5.5)}`, 'none', { stroke: C.gold!, sw: 1.4 });
  o += `<g transform="translate(${f(t[0] + 11)} ${f(t[1] + 10)})">${emblem}</g>`;
  o += ell(t[0], t[1] - 1, 2.6, 2.6, C.gold!, { sw: 1.2 });
  return o;
}

/** 一颗金星（旗上的纹章），中心在原点 */
const star = (r: number, c = C.gold!): string => {
  const p: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    p.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return poly(p, c, { sw: 1 });
};

/** 一团火苗（底在 (x, y)，高 h） */
function flame(x: number, y: number, h: number): string {
  const w = h * 0.55;
  return (
    path(`M${f(x - w)},${f(y)} Q${f(x - w * 1.1)},${f(y - h * 0.55)} ${f(x - w * 0.2)},${f(y - h)} Q${f(x)},${f(y - h * 0.6)} ${f(x + w * 0.35)},${f(y - h * 0.85)} Q${f(x + w * 1.1)},${f(y - h * 0.45)} ${f(x + w)},${f(y)} Z`, C.fire!, { sw: 1.2, stroke: '#a33a1a' }) +
    path(`M${f(x - w * 0.55)},${f(y)} Q${f(x - w * 0.5)},${f(y - h * 0.45)} ${f(x)},${f(y - h * 0.7)} Q${f(x + w * 0.55)},${f(y - h * 0.4)} ${f(x + w * 0.55)},${f(y)} Z`, C.fireL!, { sw: 0 }) +
    ell(x, y - h * 0.18, w * 0.3, h * 0.16, '#fff3c0', { sw: 0, op: 0.9 })
  );
}

/** 一堆炮弹（金字塔），底边中心 (gx, gy)，球半径 r */
function ballPile(gx: number, gy: number, r: number, c: string): string {
  const b = P(gx, gy);
  let o = '';
  const rows: Array<[number, number]> = [[3, 0], [2, 1], [1, 2]];
  for (const [n, k] of rows) {
    for (let i = 0; i < n; i++) {
      const x = b[0] + (i - (n - 1) / 2) * r * 2;
      const y = b[1] - r - k * r * 1.6;
      o += ell(x, y, r, r, c, { sw: 1.4 }) + ell(x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.25, lighten(c, 0.5), { sw: 0, op: 0.8 });
    }
  }
  return o;
}

/** 铆钉铁板：贴在占地边上一块斜立的护板，(gx0,gy0)→(gx1,gy1) 沿地，高 h */
function plate(a: [number, number], b: [number, number], h: number, c: string, trim: string): string {
  const p0 = P(a[0], a[1]);
  const p1 = P(b[0], b[1]);
  const q: Pt[] = [p0, p1, [p1[0], p1[1] - h], [p0[0], p0[1] - h]];
  let o = poly(q, c, { sw: 1.8 });
  o += line([p0[0], p0[1] - h], [p1[0], p1[1] - h], trim, 2.2);
  for (const t of [0.2, 0.5, 0.8])
    for (const u of [0.3, 0.75]) o += ell(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - h * u, 1.5, 1.5, lighten(c, 0.45), { sw: 0 });
  return o;
}

/** 地上的裂纹（发光），从原点往外几条折线 */
function cracks(c: string): string {
  const segs: Array<Pt[]> = [
    [[-30, 10], [-52, 16], [-66, 12], [-80, 20]],
    [[26, 12], [44, 20], [58, 18], [74, 26]],
    [[-8, 26], [-14, 38], [-6, 46]],
    [[10, 24], [22, 40], [16, 50]],
  ];
  let o = '';
  for (const s of segs) {
    const d = 'M' + s.map((p) => `${f(p[0])},${f(p[1])}`).join(' L');
    o += path(d, 'none', { stroke: '#1b1630', sw: 4.4 }) + path(d, 'none', { stroke: c, sw: 2 });
  }
  return o;
}

// ---------------------------------------------------------------- 十二个终极

/** 转轴高处（已乘放大倍数）：deck 上的件按它摆 */
const pivot = (t: TdUltTower): Pt => {
  const p = TURRET_PIVOT(t, LV);
  return [p.dx, p.dy];
};

const DEFS: Record<TdUltArtId, UltDef> = {
  // 火枪 · 鹰眼哨：绿呢军装、屋顶上一座瞭望笼和一只铜望远镜，塔身一盏照雾的灯
  eagle: {
    tower: 'gunTower',
    name: '鹰眼哨',
    roof: '#3f8a52',
    swap: [[C.red!, '#2f8a4a'], [C.blueD!, '#2f6b3e'], [C.black!, '#1f3a2a']],
    head: 1,
    back: () => aura('#7fd88a'),
    front: () => {
      const [x, y] = pivot('gunTower');
      // 塔身前的照雾灯：铜框、暖光晕
      let o = ell(x + 18, y + 34, 16, 12, '#fff3a0', { sw: 0, op: 0.35 }) + path(`M${f(x + 12)},${f(y + 26)} L${f(x + 24)},${f(y + 26)} L${f(x + 22)},${f(y + 40)} L${f(x + 14)},${f(y + 40)} Z`, '#ffe27a', { sw: 1.6, stroke: C.copperD! });
      o += line([x + 18, y + 22], [x + 18, y + 26], C.copperD!, 2);
      return o;
    },
  },
  // 火枪 · 连珠楼：大红制服、塔身三层枪眼各伸一支枪、两面红旗
  volley: {
    tower: 'gunTower',
    name: '连珠楼',
    roof: C.roofTile!,
    swap: [[C.red!, '#d8402e'], [C.blueD!, '#9a2a26'], [C.black!, '#4a1616']],
    head: 1,
    back: () => aura('#ff8a6a') + pennant(-0.95, 0.4, 40, 70, '#c8382e', star(4)),
    front: () => {
      const [x, y] = pivot('gunTower');
      let o = '';
      for (const [dx, dy] of [[-22, 30], [20, 34], [0, 52]] as const) {
        o += path(`M${f(x + dx - 6)},${f(y + dy - 4)} h12 v8 h-12 Z`, '#241410', { sw: 1.2 });
        o += line([x + dx + 4, y + dy], [x + dx + 22, y + dy - 6], '#241410', 4.4) + line([x + dx + 4, y + dy], [x + dx + 22, y + dy - 6], C.ironL!, 2);
      }
      return o;
    },
  },
  // 加农 · 攻城巨炮：黑铁、金箍；炮头大一圈；底座四面铆钉铁板，旁边一堆大炮弹
  siege: {
    tower: 'cannon',
    name: '攻城巨炮',
    swap: [[C.red!, '#2a2b36'], [C.ironD!, '#262b36'], [C.copper!, C.gold!]],
    head: 1.25,
    back: () => aura('#ffd060') + pennant(-0.2, -1.05, 30, 74, '#2a2b36', skull(0, 0, 5, false)),
    front: () => plate([-1.05, 0.3], [-0.3, 1.05], 22, '#2f3542', C.gold!) + plate([0.3, 1.05], [1.05, 0.3], 22, '#262b36', C.gold!) + ballPile(1.05, -0.15, 6, '#2a2c34'),
  },
  // 加农 · 霰弹炮台：青铜炮身；正前方一面带尖刺的扇形挡板、一桶霰弹
  grape: {
    tower: 'cannon',
    name: '霰弹炮台',
    swap: [[C.red!, '#b8862e'], [C.ironD!, '#7a5a2e'], [C.copper!, '#e8c070']],
    head: 1,
    back: () => aura('#f0b860'),
    front: () => {
      // 扇形挡板（沿前两条边弯一圈），尖刺朝外
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * 0.12 + (Math.PI * 0.76 * i) / 8;
        pts.push([Math.cos(a) * 82, Math.sin(a) * 40 + 4]);
      }
      let o = '';
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        o += poly([a, b, [b[0], b[1] - 14], [a[0], a[1] - 14]], i % 2 ? '#8a6a3a' : '#7a5a2e', { sw: 1.4 });
        const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 14];
        o += poly([[m[0] - 3, m[1]], [m[0] + 3, m[1]], [m[0] + (m[0] > 0 ? 4 : -4), m[1] - 10]], C.ironL!, { sw: 1 });
      }
      // 一桶霰弹（小铁丸）
      const bx = P(-1.0, -0.2);
      o += cyl(-1.0, -0.2, 9, 0, 14, mat(C.wood!), 1);
      for (const [dx, dy] of [[-4, 0], [0, -2], [4, 0], [-2, 2], [2, 2]] as const) o += ell(bx[0] + dx, bx[1] - 14 + dy, 2.2, 2.2, '#3a3a44', { sw: 0.8 });
      return o;
    },
  },
  // 臼炮 · 火雨：焦红铁；四角三个火盆
  firerain: {
    tower: 'mortar',
    name: '火雨',
    swap: [[C.red!, '#e8601e'], [C.ironD!, '#5e2a22'], [C.copper!, '#ff9a3c']],
    head: 1,
    back: () => aura('#ff7040') + ell(0, 6, 74, 34, '#ff7a30', { sw: 0, op: 0.12 }),
    front: () => {
      let o = '';
      for (const [gx, gy] of [[-1.05, 0.25], [0.25, 1.05], [1.05, 0.25]] as const) {
        const b = P(gx, gy);
        o += cyl(gx, gy, 8, 0, 12, mat('#4a3a34'), 1) + ell(b[0], b[1] - 12, 8, 4, '#2a1a14', { sw: 1 }) + flame(b[0], b[1] - 12, 18);
      }
      return o;
    },
  },
  // 臼炮 · 震地弹：紫钢；地上发青光的裂纹、两根定音石柱
  quake: {
    tower: 'mortar',
    name: '震地弹',
    swap: [[C.red!, '#5a4aa0'], [C.ironD!, '#41386e'], [C.copper!, '#8fe8ff']],
    head: 1,
    back: () => aura('#8fd8ff') + cracks('#8fe8ff'),
    front: () => {
      let o = '';
      for (const [gx, gy] of [[-1.05, 0.35], [0.35, 1.05]] as const) {
        o += box(gx - 0.12, gy - 0.12, gx + 0.12, gy + 0.12, 0, 26, mat('#5a5470', 'stone')) + cone(gx, gy, 6, 26, 10, mat('#8fe8ff'), 1);
      }
      return o;
    },
  },
  // 喷火 · 龙息：暗红鳞铁、喷火口两侧一对龙角、地上留火
  dragon: {
    tower: 'flame',
    name: '龙息',
    swap: [[C.red!, '#8a1e1e'], [C.ironD!, '#6a2420'], [C.copper!, C.gold!]],
    head: 1,
    back: () => aura('#ff6a30'),
    front: () => {
      const [x, y] = pivot('flame');
      let o = '';
      for (const s of [-1, 1]) o += path(`M${f(x + s * 14)},${f(y + 10)} Q${f(x + s * 30)},${f(y - 4)} ${f(x + s * 26)},${f(y - 26)} Q${f(x + s * 22)},${f(y - 8)} ${f(x + s * 8)},${f(y + 4)} Z`, '#e8dcc0', { sw: 1.6 });
      for (const [gx, gy] of [[-0.9, 0.6], [0.7, 0.9]] as const) {
        const b = P(gx, gy);
        o += flame(b[0], b[1], 12);
      }
      return o;
    },
  },
  // 喷火 · 熔铁枪：亮铜、塔前一口烧红的熔铁坩埚
  melt: {
    tower: 'flame',
    name: '熔铁枪',
    swap: [[C.red!, '#d87a20'], [C.ironD!, '#5a4a40'], [C.copper!, '#ffb060']],
    head: 1,
    back: () => aura('#ffa040'),
    front: () => {
      const b = P(0.95, 0.4);
      return cyl(0.95, 0.4, 13, 0, 16, mat('#3a3a44'), 1) + ell(b[0], b[1] - 16, 11, 5.5, '#ff7a20', { sw: 1.2 }) + ell(b[0] - 2, b[1] - 17, 6, 2.6, '#ffe08a', { sw: 0 });
    },
  },
  // 鱼叉 · 捕鲸叉：深海蓝、塔边一卷粗缆绳和一只大铁钩
  whaler: {
    tower: 'harpoon',
    name: '捕鲸叉',
    swap: [[C.red!, '#1f5a8a'], [C.ironD!, '#1f4a6a'], [C.copper!, '#d8e8f0']],
    head: 1,
    back: () => aura('#6ad0ff') + pennant(-1.0, 0.3, 30, 64, '#1f4a6a', star(4, '#d8e8f0')),
    front: () => {
      const b = P(0.9, 0.55);
      let o = '';
      for (let i = 0; i < 4; i++) o += ell(b[0], b[1] - 4 - i * 4, 14 - i, 6 - i * 0.4, i % 2 ? '#c8a060' : '#a8804a', { sw: 1.4 });
      o += path(`M${f(b[0] + 18)},${f(b[1] - 30)} v16 q0,10 -10,10 q-8,0 -8,-8`, 'none', { stroke: '#241410', sw: 5 }) + path(`M${f(b[0] + 18)},${f(b[1] - 30)} v16 q0,10 -10,10 q-8,0 -8,-8`, 'none', { stroke: C.ironL!, sw: 2.6 });
      return o;
    },
  },
  // 鱼叉 · 穿浪弩：银白、弩臂上两道浪纹护板
  pierce: {
    tower: 'harpoon',
    name: '穿浪弩',
    swap: [[C.red!, '#3aa8b8'], [C.ironD!, '#4a6a7a'], [C.copper!, '#7ae0e8']],
    head: 1,
    back: () => aura('#7ae0e8'),
    front: () => {
      let o = '';
      for (const s of [-1, 1]) {
        const a = P(s < 0 ? -1.05 : 0.2, s < 0 ? 0.2 : 1.05);
        const b = P(s < 0 ? -0.2 : 1.05, s < 0 ? 1.05 : 0.2);
        o += path(`M${f(a[0])},${f(a[1] - 4)} Q${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2 - 22)} ${f(b[0])},${f(b[1] - 4)}`, 'none', { stroke: '#241410', sw: 6 });
        o += path(`M${f(a[0])},${f(a[1] - 4)} Q${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2 - 22)} ${f(b[0])},${f(b[1] - 4)}`, 'none', { stroke: '#7ae0e8', sw: 3 });
      }
      return o;
    },
  },
  // 火箭 · 蜂群：黄黑条纹、塔边一排备用小火箭
  swarm: {
    tower: 'rocket',
    name: '蜂群',
    swap: [[C.red!, '#e8b81e'], [C.ironD!, '#3a3420'], [C.copper!, '#ffd23a']],
    head: 1,
    back: () => aura('#ffd23a'),
    front: () => {
      let o = '';
      for (let i = 0; i < 5; i++) {
        const b = P(-1.0 + i * 0.12, 0.45 + i * 0.12);
        o += line([b[0], b[1]], [b[0] + 3, b[1] - 22], '#241410', 4.6) + line([b[0], b[1]], [b[0] + 3, b[1] - 22], i % 2 ? '#ffd23a' : '#2a2a30', 2.6);
        o += poly([[b[0] + 1, b[1] - 22], [b[0] + 5, b[1] - 22], [b[0] + 4, b[1] - 29]], C.red!, { sw: 1 });
      }
      return o;
    },
  },
  // 火箭 · 信号弹：墨绿、塔顶一根挂着信号灯的高杆
  flare: {
    tower: 'rocket',
    name: '信号弹',
    swap: [[C.red!, '#2a8a5a'], [C.ironD!, '#2a4a3a'], [C.copper!, '#7affb0']],
    head: 1,
    back: () => {
      const b = P(-0.9, -0.9);
      return aura('#7affb0') + line(b, [b[0], b[1] - 96], C.woodDD!, 3.4) + line(b, [b[0], b[1] - 96], C.wood!, 1.6) + ell(b[0], b[1] - 100, 14, 14, '#7affb0', { sw: 0, op: 0.3 }) + ell(b[0], b[1] - 100, 6, 6, '#d8ffe8', { sw: 1.6, stroke: '#2a4a3a' });
    },
    front: () => '',
  },
};

/** 一个终极的说明（名字、塔种、炮头放大倍数），给场景和图鉴用 */
export const TD_ULT_ART: Readonly<Record<TdUltArtId, { tower: TdUltTower; name: string; head: number }>> = Object.fromEntries(
  TD_ULT_ART_IDS.map((id) => [id, { tower: DEFS[id].tower, name: DEFS[id].name, head: DEFS[id].head }]),
) as Record<TdUltArtId, { tower: TdUltTower; name: string; head: number }>;

// ---------------------------------------------------------------- 合成

/** 已调色的 svg 里，把原色（调色前）换成新色：两边都按同一套调色换算，所以只换到这几种颜色 */
function recolor(svg: string, swap: Array<[string, string]>): string {
  let s = svg;
  for (const [a, b] of swap) s = s.split(gradeHex(a)).join(gradeHex(b));
  return s;
}

/** 外扩画布：加件可能伸出原图（旗、光圈） */
const PAD = { l: 30, r: 30, t: 70, b: 20 };

/** 原图（已调色）换色后，前后各叠一层加件（加件按原图的放大倍数画，不放大的光圈另算） */
function compose(key: string, base: ArtPiece, d: UltDef): ArtPiece {
  const w = base.w + PAD.l + PAD.r;
  const h = base.h + PAD.t + PAD.b;
  const ax = base.ax + PAD.l;
  const ay = base.ay + PAD.t;
  const at = (body: string): string => `<g transform="translate(${ax} ${ay})">${gradeSvg(body)}</g>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    at(d.back()) +
    `<g transform="translate(${PAD.l} ${PAD.t})">${recolor(inner(base.svg), d.swap)}</g>` +
    at(d.front()) +
    '</svg>';
  return { key, svg, w, h, ax, ay };
}

const cache = new Map<string, ArtPiece>();
const memo = (key: string, mk: () => ArtPiece): ArtPiece => {
  let p = cache.get(key);
  if (!p) cache.set(key, (p = mk()));
  return p;
};

/** 一张素材按锚点叠到 (x, y)（坐标系 = 外层画布） */
const at = (p: ArtPiece, x: number, y: number): string => `<g transform="translate(${f(x - p.ax)} ${f(y - p.ay)})">${inner(p.svg)}</g>`;

/** 整张终极塔（图标、炮头还没烘好时）：底座 + 朝右前（d0）的炮头 + 屋顶，和分件炮台叠出来的一样 */
export function tdUltArt(id: TdUltArtId): ArtPiece {
  return memo(`b.ult.${id}`, () => {
    const d = DEFS[id];
    const b = tdUltBaseArt(id);
    const [px, py] = pivot(d.tower);
    const hs = tdUltHeadPieces(id);
    let top = '';
    for (const n of ['body', 'd0']) {
      const p = hs.find((q) => q.key === tdUltHeadFrame(id, n));
      if (p) top += at(p, b.ax + px, b.ay + py);
    }
    const roof = tdUltRoofArt(id);
    if (roof) top += at(roof, b.ax, b.ay);
    return { ...b, key: `b.ult.${id}`, svg: b.svg.replace(/<\/svg>\s*$/, `${top}</svg>`) };
  });
}

/** 不带炮头的底座（分件炮台用；转轴同 TURRET_PIVOT(种类, 8)） */
export function tdUltBaseArt(id: TdUltArtId): ArtPiece {
  const d = DEFS[id];
  return memo(`b.ult.${id}.ng`, () => compose(`b.ult.${id}.ng`, turretBaseArt(d.tower, LV), d));
}

/**
 * 火枪塔终极的屋顶（盖在火枪手上面，锚点 = 建筑锚点）：照 8 级屋顶的尺寸重画——换瓦色、檐口金箍、尖上插终极的燕尾旗，
 * 鹰眼哨多一座瞭望笼和铜望远镜；别的塔没有屋顶给 null
 */
export function tdUltRoofArt(id: TdUltArtId): ArtPiece | null {
  const d = DEFS[id];
  const base = d.tower === 'gunTower' ? gunTowerRoof(LV) : null;
  if (!base || !d.roof) return null;
  return memo(`b.ult.${id}.roof`, () => {
    const k = towerScale('gunTower');
    const { zr, rx, h } = gtRoof(LV);
    let o = cyl(0, 0, rx - 2, zr - 5, zr, mat(C.gold!, 'iron'), 0, 1.4) + cone(0, 0, rx, zr, h, mat(d.roof!, 'stone'), 4);
    o += id === 'eagle' ? eagleNest(zr + h) : pennant(0, 0, zr + h - 2, 30, d.swap[0]![1], star(4));
    const extra = 70;
    const w = base.w + extra;
    const hh = base.h + extra;
    const ax = base.ax + extra / 2;
    const ay = base.ay + extra;
    return { key: `b.ult.${id}.roof`, w, h: hh, ax, ay, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><g transform="translate(${ax} ${ay}) scale(${k})">${gradeSvg(o)}</g></svg>` };
  });
}

/** 鹰眼哨屋顶尖上的瞭望笼和铜望远镜（z = 屋顶尖高，坐标未乘放大倍数） */
function eagleNest(z: number): string {
  const [x, y] = P(0, 0, z);
  let o = line([x, y + 2], [x, y - 16], C.woodDD!, 3.4);
  o += path(`M${f(x - 11)},${f(y - 16)} v-10 M${f(x + 11)},${f(y - 16)} v-10 M${f(x)},${f(y - 12)} v-12`, 'none', { stroke: '#5a3a1e', sw: 2 });
  o += ell(x, y - 16, 12, 5, '#6a4a2a', { sw: 1.6 }) + ell(x, y - 26, 12, 5, 'none', { stroke: '#5a3a1e', sw: 2 });
  o += line([x - 6, y - 30], [x + 18, y - 38], '#241410', 6) + line([x - 6, y - 30], [x + 18, y - 38], C.copper!, 3.6) + ell(x + 18, y - 38, 2.6, 3, '#cfe8ff', { sw: 1 });
  return o + pennant(0, 0, z + 26, 24, '#2f8a4a', star(4));
}

/** 终极炮头图集的贴图 key、帧名（帧名的部件同 3 阶：d0..d15、e0..e15、body、rod） */
export const tdUltHeadTex = (id: TdUltArtId): string => `tur.u.${id}`;
export const tdUltHeadFrame = (id: TdUltArtId, part: string): string => `tur.u.${id}.${part}`;

const headCache = new Map<TdUltArtId, ArtPiece[]>();
/** 终极炮头的全部帧：3 阶炮头换色，攻城巨炮整体放大（转轴是锚点，放大后转轴不动） */
export function tdUltHeadPieces(id: TdUltArtId): ArtPiece[] {
  const hit = headCache.get(id);
  if (hit) return hit;
  const d = DEFS[id];
  const tier = turretTier(d.tower, LV);
  const prefix = `tur.${d.tower}.${tier}.`;
  const out = turretPieces(d.tower, tier).map((p) => {
    const part = p.key.slice(prefix.length);
    const s = d.head;
    const svg = recolor(p.svg, d.swap);
    if (s === 1) return { ...p, key: tdUltHeadFrame(id, part), svg };
    const w = Math.ceil(p.w * s);
    const h = Math.ceil(p.h * s);
    return { key: tdUltHeadFrame(id, part), w, h, ax: Math.round(p.ax * s), ay: Math.round(p.ay * s), svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g transform="scale(${s})">${inner(svg)}</g></svg>` };
  });
  headCache.set(id, out);
  return out;
}

/** 规则里的终极 id（content/tdults.ts）→ 美术 id */
export const TD_ULT_ART_OF: Readonly<Record<string, TdUltArtId>> = {
  'ult.eagle': 'eagle',
  'ult.gatling': 'volley',
  'ult.siege': 'siege',
  'ult.blunder': 'grape',
  'ult.rain': 'firerain',
  'ult.quake': 'quake',
};

/** 图鉴、预览用：所有终极的整张图 */
export const tdUltAll = (): ArtPiece[] => TD_ULT_ART_IDS.map(tdUltArt);

