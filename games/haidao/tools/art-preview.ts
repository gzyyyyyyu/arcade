/**
 * 美术预览：把 src/view/art 里的素材渲成 PNG。
 * 用法：node tools/art-preview.ts <输出目录>
 * 输出：sheet.png（全部素材图鉴）、base.png（基地全景）、battle.png（战斗定格）。
 * 画图用 @resvg/resvg-js；不开浏览器。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { BuildingKind, TroopKind } from '../src/core/types.ts';
import { BEACH, ISLAND } from '../src/core/types.ts';
import { iso } from '../src/view/iso.ts';
import {
  ART_MAX_LEVEL, BUILDING_KINDS, COAST_KINDS, DECO_KINDS, BUILDING_SIZE, FX_KINDS, ICON_KINDS, POSES, PALETTE, TILE_KINDS, TROOP_KINDS,
  allArt, levelArt, buildingArt, fxFrames, troopFrames, wallArt, TROOP_SKINS, FX_FRAME_KINDS, coastArt, mapDecoArt, mapIslandArt, decoArt, fxArt, iconArt, shipArt, tileArt, troopArt,
} from '../src/view/art/index.ts';
import { badgeArt, krakenArt, scaffoldArt } from '../src/view/art/index.ts';
import type { ArtPiece } from '../src/view/art/index.ts';

const out = process.argv[2];
if (!out) {
  console.error('用法：node tools/art-preview.ts <输出目录>');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const inner = (svg: string): string => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const C = PALETTE as Record<string, string>;
const n1 = (n: number): string => String(Math.round(n * 100) / 100);

/** 把一张素材放到 (x, y)（锚点对齐），可缩放、可水平翻转 */
function put(p: ArtPiece, x: number, y: number, scale = 1, flip = false, op = 1): string {
  const sx = flip ? -scale : scale;
  return `<g transform="translate(${n1(x)} ${n1(y)}) scale(${n1(sx)} ${n1(scale)}) translate(${-p.ax} ${-p.ay})"${op < 1 ? ` opacity="${op}"` : ''}>${inner(p.svg)}</g>`;
}

function render(svg: string, file: string, w: number): void {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: w }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render().asPng();
  fs.writeFileSync(path.join(out!, file), png);
  console.log(file, `${(png.length / 1024).toFixed(0)} KB`);
}

// ================================================================= 图鉴

function sheet(): void {
  const W = 2700;
  let y = 16;
  let body = '';
  const label = (t: string, x: number, yy: number): string => `<text x="${x}" y="${yy}" font-size="15" fill="#0c3a4c" font-weight="bold">${t}</text>`;
  const bg = '<rect width="100%" height="100%" fill="#a8dfa0"/>';

  body += label('tiles: grass grass2 sand shallow sea', 16, y + 6);
  y += 20;
  TILE_KINDS.forEach((k, i) => (body += put(tileArt(k), 60 + i * 90, y + 20)));
  y += 48;

  for (const k of BUILDING_KINDS) {
    const lvs = k === 'palm' || k === 'rock' ? [1] : Array.from({ length: ART_MAX_LEVEL }, (_, i) => i + 1);
    const ps = lvs.map((l) => buildingArt(k, l));
    const rowH = Math.max(...ps.map((p) => p.h));
    body += label(`${k} (size ${BUILDING_SIZE[k]}, lv ${lvs.join('/')})`, 16, y + 8);
    y += 14;
    let x = 10;
    ps.forEach((p) => {
      body += put(p, x + p.ax, y + p.ay);
      x += p.w + 6;
    });
    y += rowH + 8;
  }

  body += label('troops: idle walk1 walk2 attack', 16, y + 8);
  y += 14;
  TROOP_KINDS.forEach((k, i) => {
    POSES.forEach((po, j) => (body += put(troopArt(k, po), 50 + (i * 4 + j) * 80, y + 90, 0.8)));
  });
  y += 120;

  body += label('troop frames (idle x4 | walk x4 | attack x4), then gold / shadow / royal', 16, y + 8);
  y += 14;
  for (const k of TROOP_KINDS) {
    let xx = 20;
    for (const an of ['idle', 'walk', 'attack'] as const) {
      for (const p of troopFrames(k, an)) { body += put(p, xx + 40, y + 84, 0.85); xx += 78; }
      xx += 14;
    }
    for (const sk of TROOP_SKINS) { const p = troopFrames(k, 'attack', sk)[1]!; body += put(p, xx + 40, y + 84, 0.85); xx += 90; }
    const q = troopFrames(k, 'idle', 'gold')[0]!;
    void q;
    y += 112;
  }
  y += 10;
  body += label('wall lv1-8 (full) + lv 1/4/8 by mask', 16, y + 8);
  y += 14;
  for (let lv = 1; lv <= 8; lv++) body += put(wallArt(lv, 15), 50 + (lv - 1) * 100, y + 90, 1.1);
  y += 110;
  for (const lv of [1, 4, 8]) {
    for (let m = 0; m < 16; m++) body += put(wallArt(lv, m), 40 + m * 78, y + 80, 0.8);
    y += 100;
  }
  body += label('fx frames: hit / boom / collapse / slash / muzzle', 16, y + 8);
  y += 14;
  for (const k of FX_FRAME_KINDS) {
    let xx = 10;
    for (const p of fxFrames(k)) { body += put(p, xx + p.w / 2, y + 60, 1); xx += p.w + 6; }
    y += 120;
  }
  body += label('fx', 16, y + 8);
  y += 14;
  let x = 10;
  let rowH = 0;
  for (const k of FX_KINDS) {
    const p = fxArt(k);
    body += put(p, x + p.ax, y + p.ay);
    x += p.w + 12;
    rowH = Math.max(rowH, p.h);
  }
  y += rowH + 12;

  body += label('coast + deco', 16, y + 8);
  y += 14;
  x = 10;
  for (const k of COAST_KINDS) { const p = coastArt(k); body += put(p, x + p.ax, y + p.ay + 10); x += p.w + 14; }
  for (const k of DECO_KINDS) { const p = decoArt(k); body += put(p, x + p.ax, y + p.ay + 10); x += p.w + 14; }
  y += 60;
  body += label('icons + ships', 16, y + 8);
  y += 14;
  x = 10;
  for (const k of ICON_KINDS) {
    const p = iconArt(k);
    body += put(p, x + 28, y + 28, 1.5);
    x += 60;
  }
  for (const [i, t] of (['bronze', 'silver', 'gold'] as const).entries()) body += put(badgeArt(t), x + 40 + i * 60, y + 30, 1.4);
  y += 62;
  body += put(krakenArt('idle', 3), 200, y + 150, 0.9) + put(krakenArt('slam', 3), 520, y + 150, 0.9) + put(krakenArt('slam', 8), 840, y + 150, 0.9);
  y += 190;
  const raft = shipArt('raft');
  const fl = shipArt('flagship');
  body += put(raft, 90, y + 60, 1.3) + put(fl, 520, y + 270);
  y += 330;

  render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}">${bg}${body}</svg>`, 'sheet.png', W);
}

// ================================================================= 基地与战斗

interface Item {
  kind: BuildingKind;
  level: number;
  x: number;
  y: number;
}

/** 一个合理的基地：主寨居中，资源建筑在外圈，防御环绕，棕榈岩石点缀 */
const BASE: Item[] = [
  { kind: 'hq', level: 5, x: 9, y: 9 },
  { kind: 'goldmine', level: 4, x: 3, y: 3 }, { kind: 'goldmine', level: 3, x: 16, y: 3 },
  { kind: 'vault', level: 4, x: 9, y: 3 },
  { kind: 'woodyard', level: 3, x: 3, y: 16 }, { kind: 'sawmill', level: 4, x: 7, y: 17 }, { kind: 'sawmill', level: 2, x: 13, y: 16 },
  { kind: 'dock', level: 3, x: 18, y: 18 },
  { kind: 'armory', level: 4, x: 3, y: 9 },
  { kind: 'cannon', level: 5, x: 7, y: 6 }, { kind: 'cannon', level: 3, x: 14, y: 6 }, { kind: 'cannon', level: 2, x: 4, y: 13 },
  { kind: 'gunTower', level: 5, x: 15, y: 10 }, { kind: 'gunTower', level: 3, x: 7, y: 10 },
  { kind: 'mortar', level: 4, x: 14, y: 14 }, { kind: 'mortar', level: 2, x: 7, y: 14 },
  { kind: 'flame', level: 5, x: 12, y: 6 }, { kind: 'flame', level: 2, x: 17, y: 13 },
  { kind: 'mine', level: 2, x: 5, y: 7 }, { kind: 'mine', level: 1, x: 16, y: 7 }, { kind: 'mine', level: 3, x: 10, y: 16 }, { kind: 'mine', level: 1, x: 14, y: 11 },
  { kind: 'palm', level: 1, x: 1, y: 1 }, { kind: 'palm', level: 1, x: 1, y: 8 }, { kind: 'palm', level: 1, x: 0, y: 13 }, { kind: 'palm', level: 1, x: 20, y: 0 },
  { kind: 'palm', level: 1, x: 20, y: 8 }, { kind: 'palm', level: 1, x: 21, y: 13 }, { kind: 'palm', level: 1, x: 10, y: 20 }, { kind: 'palm', level: 1, x: 5, y: 21 },
  { kind: 'palm', level: 1, x: 14, y: 1 }, { kind: 'palm', level: 1, x: 0, y: 19 }, { kind: 'palm', level: 1, x: 14, y: 20 }, { kind: 'palm', level: 1, x: 21, y: 5 },
  { kind: 'rock', level: 1, x: 7, y: 1 }, { kind: 'rock', level: 1, x: 19, y: 11 }, { kind: 'rock', level: 1, x: 12, y: 18 }, { kind: 'rock', level: 1, x: 1, y: 5 }, { kind: 'rock', level: 1, x: 15, y: 20 }, { kind: 'rock', level: 1, x: 20, y: 15 }, { kind: 'rock', level: 1, x: 2, y: 13 },
];

function checkOverlap(items: Item[]): void {
  const taken = new Map<string, string>();
  for (const it of items) {
    const s = BUILDING_SIZE[it.kind];
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) {
      const key = `${it.x + a},${it.y + b}`;
      if (taken.has(key)) throw new Error(`基地摆放重叠：${it.kind}@${it.x},${it.y} 与 ${taken.get(key)}`);
      if (it.x + a >= ISLAND || it.y + b >= ISLAND) throw new Error(`出界：${it.kind}`);
      taken.set(key, `${it.kind}@${it.x},${it.y}`);
    }
  }
}

let seed = 12345;
const rnd = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const hash = (x: number, y: number): number => ((Math.imul(x + 101, 73856093) ^ Math.imul(y + 211, 19349663)) >>> 0) % 1000;

type Ground = 'grass' | 'grass2' | 'sand' | 'shallow' | 'sea';
function groundAt(gx: number, gy: number): Ground {
  const dx = Math.max(-gx, gx - (ISLAND - 1), 0);
  const dy = Math.max(-gy, gy - (ISLAND - 1), 0);
  if (dx === 0 && dy === 0) {
    // 岛内：一条通向海滩的沙路
    return hash(gx, gy) % 7 < 2 ? 'grass2' : 'grass';
  }
  const d = Math.max(dx, dy);
  const h = hash(gx >> 1, gy >> 1);
  // 海岸线加一点随机起伏，不再是笔直的菱形边
  const reach = BEACH - (d === BEACH && h % 4 === 0 ? 1 : 0) + (d === BEACH - 1 && h % 5 === 0 ? 0 : 0);
  if (d <= reach && dx + dy <= BEACH + 2 + (h % 2)) return 'sand';
  if (d <= BEACH + 1 + (h % 2) && dx + dy <= BEACH + 4 + (h % 3)) return 'shallow';
  return 'sea';
}


function seaBackground(W: number, H: number): string {
  let s = `<defs><linearGradient id="seabg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.seaLight}"/><stop offset="0.35" stop-color="${C.sea}"/><stop offset="1" stop-color="${C.seaDeep}"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#seabg)"/>`;
  seed = 777;
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const l = 14 + rnd() * 22;
    s += `<path d="M${n1(x)},${n1(y)} q${n1(l / 4)},-5 ${n1(l / 2)},0 t${n1(l / 2)},0" fill="none" stroke="${i % 3 ? C.seaLight : '#ffffff'}" stroke-width="2" stroke-linecap="round" opacity="${i % 3 ? 0.5 : 0.35}"/>`;
  }
  for (let i = 0; i < 14; i++) s += `<ellipse cx="${n1(rnd() * W)}" cy="${n1(rnd() * H)}" rx="${n1(60 + rnd() * 120)}" ry="${n1(20 + rnd() * 40)}" fill="${C.seaDark}" opacity="0.09"/>`;
  return s;
}

function island(sc: number, ox: number, oy: number): string {
  const at = (gx: number, gy: number): { x: number; y: number } => {
    const p = iso(gx, gy);
    return { x: ox + p.x * sc, y: oy + p.y * sc };
  };
  const g: Record<string, ArtPiece> = {};
  for (const k of TILE_KINDS) g[k] = tileArt(k);
  const R = ISLAND + BEACH + 3;
  let tiles = '';
  let foam = '';
  const kinds = new Map<string, Ground>();
  for (let gy = -BEACH - 3; gy < R; gy++) for (let gx = -BEACH - 3; gx < R; gx++) kinds.set(`${gx},${gy}`, groundAt(gx, gy));
  // 外圈浅滩渐隐：先画一层更大的透明浅色，再画瓦片
  for (let gy = -BEACH - 3; gy < R; gy++) {
    for (let gx = -BEACH - 3; gx < R; gx++) {
      const k = kinds.get(`${gx},${gy}`)!;
      if (k === 'sea') continue;
      const p = at(gx + 0.5, gy + 0.5);
      tiles += put(g[k]!, p.x, p.y, sc);
    }
  }
  // 海岸泡沫：陆地和更浅一级相邻的边
  const rank: Record<Ground, number> = { grass: 3, grass2: 3, sand: 2, shallow: 1, sea: 0 };
  for (let gy = -BEACH - 3; gy < R; gy++) {
    for (let gx = -BEACH - 3; gx < R; gx++) {
      const k = kinds.get(`${gx},${gy}`)!;
      if (rank[k] < 1) continue;
      const nb: Array<[number, number, [number, number], [number, number]]> = [
        [1, 0, [gx + 1, gy], [gx + 1, gy + 1]],
        [0, 1, [gx, gy + 1], [gx + 1, gy + 1]],
        [-1, 0, [gx, gy], [gx, gy + 1]],
        [0, -1, [gx, gy], [gx + 1, gy]],
      ];
      for (const [dx, dy, a, b] of nb) {
        const nk = kinds.get(`${gx + dx},${gy + dy}`) ?? 'sea';
        if (rank[nk] < rank[k] && rank[nk] === 0) {
          const pa = at(a[0], a[1]);
          const pb = at(b[0], b[1]);
          foam += `<line x1="${n1(pa.x)}" y1="${n1(pa.y)}" x2="${n1(pb.x)}" y2="${n1(pb.y)}" stroke="#ffffff" stroke-width="${n1(9 * sc)}" stroke-linecap="round" opacity="0.55"/>`;
        } else if (rank[nk] < rank[k] && rank[k] === 2 && rank[nk] === 1) {
          const pa = at(a[0], a[1]);
          const pb = at(b[0], b[1]);
          foam += `<line x1="${n1(pa.x)}" y1="${n1(pa.y)}" x2="${n1(pb.x)}" y2="${n1(pb.y)}" stroke="#ffffff" stroke-width="${n1(5 * sc)}" stroke-linecap="round" opacity="0.28"/>`;
        }
      }
    }
  }
  // 岛的底部厚度（沙色断面），给体积感
  let cliff = '';
  for (let gy = -BEACH - 3; gy < R; gy++) {
    for (let gx = -BEACH - 3; gx < R; gx++) {
      const k = kinds.get(`${gx},${gy}`)!;
      if (k !== 'sand') continue;
      const dep = 9 * sc;
      for (const [dx, dy, a, b, c] of [
        [0, 1, [gx, gy + 1], [gx + 1, gy + 1], '#c79a52'],
        [1, 0, [gx + 1, gy + 1], [gx + 1, gy], '#a97c3c'],
      ] as Array<[number, number, [number, number], [number, number], string]>) {
        const nk = kinds.get(`${gx + dx},${gy + dy}`) ?? 'sea';
        if (rank[nk] <= 1) {
          const pa = at(a[0], a[1]);
          const pb = at(b[0], b[1]);
          cliff += `<polygon points="${n1(pa.x)},${n1(pa.y)} ${n1(pb.x)},${n1(pb.y)} ${n1(pb.x)},${n1(pb.y + dep)} ${n1(pa.x)},${n1(pa.y + dep)}" fill="${c}" stroke="#7a5424" stroke-width="${n1(sc)}" stroke-linejoin="round"/>`;
        }
      }
    }
  }
  // 小路：草地上的沙土踏石
  let pathT = '';
  for (let gy = 13; gy < ISLAND; gy++) for (const gx of [10, 11]) { const p = at(gx + 0.5, gy + 0.5); pathT += put(decoArt('path'), p.x, p.y, sc, false, gy % 3 === 0 ? 0.7 : 0.95); }
  for (let gx = 7; gx <= 14; gx++) { const p = at(gx + 0.5, 13.5); pathT += put(decoArt('path'), p.x, p.y, sc, false, 0.9); }
  // 海岸装饰：浅滩斑块、礁石、浪花、沙嘴沿岸撒一圈（位置由哈希决定，固定不变）
  let coastS = '';
  const coastItems: Array<{ d: number; svg: string }> = [];
  for (let gy = -BEACH - 3; gy < R; gy++) {
    for (let gx = -BEACH - 3; gx < R; gx++) {
      const k = kinds.get(`${gx},${gy}`)!;
      const h = hash(gx, gy);
      const p = at(gx + 0.5, gy + 0.5);
      if (k === 'shallow' && h % 4 === 0) coastItems.push({ d: gx + gy, svg: put(coastArt('wave'), p.x + (h % 20) - 10, p.y, sc * (0.8 + (h % 5) / 10)) });
      if (k === 'sea') {
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].some(([a, b]) => (kinds.get(`${gx + a!},${gy + b!}`) ?? 'sea') === 'shallow');
        if (near && h % 5 === 0) coastItems.push({ d: gx + gy, svg: put(coastArt(h % 2 ? 'reef' : 'foamPatch'), p.x, p.y, sc * 0.9) });
        else if (near && h % 7 === 1) coastItems.push({ d: gx + gy, svg: put(coastArt('shoal'), p.x, p.y, sc * 1.3) });
      }
      if (k === 'shallow' && h % 11 === 3) coastItems.push({ d: gx + gy, svg: put(coastArt('spit'), p.x, p.y, sc) });
    }
  }
  coastItems.sort((a, b) => a.d - b.d);
  coastS = coastItems.map((c) => c.svg).join('');
  const blur = '<defs><filter id="softfoam" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="4"/></filter></defs>';
  return cliff + tiles + blur + `<g filter="url(#softfoam)">${foam}</g>` + pathT + coastS;
}

function nearIsland(gx: number, gy: number): boolean {
  return gx > -6 && gy > -6 && gx < ISLAND + 6 && gy < ISLAND + 6;
}
void nearIsland;

interface Layer {
  depth: number;
  svg: string;
}

function hpBar(x: number, y: number, w: number, frac: number, sc: number): string {
  const h = 6 * sc;
  const col = frac > 0.6 ? '#5fd35a' : frac > 0.3 ? '#ffc933' : '#ff5a3a';
  return `<rect x="${n1(x - w / 2)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(h / 2)}" fill="#2b1a15" stroke="#2b1a15" stroke-width="${n1(sc * 1.4)}"/><rect x="${n1(x - w / 2 + sc)}" y="${n1(y + sc)}" width="${n1(Math.max(0, (w - 2 * sc) * frac))}" height="${n1(h - 2 * sc)}" rx="${n1((h - 2 * sc) / 2)}" fill="${col}"/>`;
}

function baseScene(battle: boolean): void {
  checkOverlap(BASE);
  const W = 1170;
  const H = 1400;
  const sc = 0.8;
  const ox = W / 2;
  // 岛：世界原点 (0,0) 在左上格；中心 (11,11) 对齐画面中心
  const c = iso(ISLAND / 2, ISLAND / 2);
  const OX = ox - c.x * sc;
  const OY = H / 2 - c.y * sc + (battle ? 20 : 0);
  const at = (gx: number, gy: number): { x: number; y: number } => {
    const p = iso(gx, gy);
    return { x: OX + p.x * sc, y: OY + p.y * sc };
  };
  let body = seaBackground(W, H);
  // 远处的小岛（填满竖图的上下空白）
  const islet = (x: number, y: number, s: number): string => {
    let o = `<ellipse cx="${x}" cy="${y + 6 * s}" rx="${70 * s}" ry="${26 * s}" fill="#ffffff" opacity="0.5"/>`;
    o += `<ellipse cx="${x}" cy="${y + 4 * s}" rx="${60 * s}" ry="${22 * s}" fill="${C.sand}" stroke="#c9a45a" stroke-width="${2 * s}"/>`;
    o += `<ellipse cx="${x}" cy="${y}" rx="${44 * s}" ry="${15 * s}" fill="${C.grass}"/>`;
    o += put(buildingArt('palm', 1), x - 14 * s, y + 4 * s, s * 0.8) + put(buildingArt('palm', 1), x + 16 * s, y + 8 * s, s * 0.65);
    return o;
  };
  body += islet(180, 150, 1.5) + islet(1000, 240, 1.1) + islet(120, 1260, 1.2) + islet(1040, 1210, 1.6) + islet(600, 70, 0.9);
  body += island(sc, OX, OY);

  const layers: Layer[] = [];
  // 战斗画的是敌岛：地雷看不见，不画
  const items: Item[] = BASE.filter((b) => !battle || b.kind !== 'mine').map((b) => ({ ...b }));

  // 小路上的小旗和灯：只在基地里
  for (const it of items) {
    const s = BUILDING_SIZE[it.kind];
    const cx = it.x + s / 2;
    const cy = it.y + s / 2;
    const p = at(cx, cy);
    const piece = buildingArt(it.kind, it.level);
    layers.push({ depth: cx + cy, svg: put(piece, p.x, p.y, sc) });
  }
  if (battle) battleOverlay(layers, items, at, sc);
  else {
    // 资源气泡和等级角标
    for (const it of items) {
      if (it.kind === 'goldmine' || it.kind === 'sawmill') {
        const s = BUILDING_SIZE[it.kind];
        const p = at(it.x + s / 2, it.y + s / 2);
        const icon = iconArt(it.kind === 'goldmine' ? 'gold' : 'wood');
        const by = p.y - (it.kind === 'goldmine' ? 108 : 112) * sc;
        layers.push({ depth: 999, svg: `<ellipse cx="${n1(p.x)}" cy="${n1(by)}" rx="${n1(18 * sc)}" ry="${n1(18 * sc)}" fill="#fff" stroke="#2b1a15" stroke-width="${n1(2 * sc)}"/>` + put(icon, p.x, by, sc * 0.75) });
      }
    }
    // 停在海里的旗舰（自己的）
    const fp = at(27, 24);
    layers.push({ depth: 40, svg: put(shipArt('flagship'), fp.x, fp.y + 10, 0.62) });
    const rp = at(-3.6, 10);
    layers.push({ depth: 40, svg: put(shipArt('raft'), rp.x, rp.y, 0.85) });
    const rp2 = at(5, 24.2);
    layers.push({ depth: 40, svg: put(shipArt('raft'), rp2.x, rp2.y, 0.85, true) });
  }
  // 空草地撒灌木、花丛、石块、草丛（四角的大片空地也有细节）
  const occ = new Set<string>();
  for (const it of items) for (let a = -1; a <= BUILDING_SIZE[it.kind]; a++) for (let b = -1; b <= BUILDING_SIZE[it.kind]; b++) occ.add(`${it.x + a},${it.y + b}`);
  for (let gy = 0; gy < ISLAND; gy++) {
    for (let gx = 0; gx < ISLAND; gx++) {
      if (occ.has(`${gx},${gy}`) || ((gx === 10 || gx === 11) && gy >= 13) || (gy === 13 && gx >= 7 && gx <= 14)) continue;
      const h = hash(gx, gy);
      const kind = h % 8 === 0 ? 'bush' : h % 8 === 1 ? 'flowers' : h % 17 === 2 ? 'stones' : h % 6 === 3 ? 'tuft' : '';
      if (!kind) continue;
      const p = at(gx + 0.5, gy + 0.5);
      layers.push({ depth: gx + gy + 0.5, svg: put(decoArt(kind), p.x, p.y + 4 * sc, sc * 1.25) });
    }
  }
  layers.sort((a, b) => a.depth - b.depth);
  body += layers.map((l) => l.svg).join('');
  // 轻微暗角
  body += `<defs><radialGradient id="vg" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#06304a" stop-opacity="0"/><stop offset="1" stop-color="#06304a" stop-opacity="0.35"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#vg)"/>`;
  render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`, battle ? 'battle.png' : 'base.png', W);
}

// ----------------------------------------------------------------- 战斗定格

function battleOverlay(layers: Layer[], items: Item[], at: (gx: number, gy: number) => { x: number; y: number }, sc: number): void {
  const bk = (kind: BuildingKind, x: number, y: number): Item | undefined => items.find((i) => i.kind === kind && i.x === x && i.y === y);
  const center = (it: Item): { gx: number; gy: number } => ({ gx: it.x + BUILDING_SIZE[it.kind] / 2, gy: it.y + BUILDING_SIZE[it.kind] / 2 });
  const add = (depth: number, svg: string): void => void layers.push({ depth, svg });

  // 被摧毁的建筑：用废墟替换（先把原来画的建筑拿掉）
  const ruined = [bk('cannon', 7, 6), bk('goldmine', 3, 3), bk('gunTower', 7, 10), bk('mortar', 10, 14), bk('mine', 8, 15)].filter((i): i is Item => !!i);
  const ruinedSet = new Set(ruined);
  for (let i = layers.length - 1; i >= 0; i--) {
    // 重画：删掉所有建筑层，下面统一重建（简单）
    void i;
  }
  layers.length = 0;
  for (const it of items) {
    const { gx, gy } = center(it);
    const p = at(gx, gy);
    if (ruinedSet.has(it)) {
      const s = BUILDING_SIZE[it.kind];
      add(gx + gy, put(fxArt('rubble'), p.x, p.y + 4 * sc, sc * (0.5 + s * 0.28)));
      add(gx + gy + 0.1, put(fxArt('smoke'), p.x - 6 * sc, p.y - 30 * sc, sc * 1.1, false, 0.9) + put(fxArt('smoke'), p.x + 14 * sc, p.y - 58 * sc, sc * 1.4, false, 0.65));
    } else {
      add(gx + gy, put(buildingArt(it.kind, it.level), p.x, p.y, sc));
    }
  }
  // 受伤的建筑：冒烟着火、血条
  const hurt: Array<[Item | undefined, number, boolean]> = [
    [bk('hq', 9, 9), 0.45, true], [bk('armory', 3, 9), 0.5, true], [bk('vault', 9, 3), 0.7, false], [bk('cannon', 14, 6), 0.35, true],
    [bk('flame', 12, 6), 0.55, false], [bk('sawmill', 7, 17), 0.8, false], [bk('goldmine', 16, 3), 0.9, false], [bk('cannon', 6, 13), 0.4, true], [bk('gunTower', 15, 10), 0.65, false],
  ];
  const upOf = (k: BuildingKind): number => (k === 'hq' ? 130 : k === 'gunTower' ? 110 : k === 'goldmine' ? 60 : k === 'flame' || k === 'armory' ? 80 : 50);
  for (const [it, hp, fire] of hurt) {
    if (!it) continue;
    const { gx, gy } = center(it);
    const p = at(gx, gy);
    const up = upOf(it.kind) * sc;
    if (fire) {
      const fl = fxArt('flame');
      add(gx + gy + 0.2, put(fl, p.x - 14 * sc, p.y - up * 0.5, sc * 1.5) + put(fl, p.x + 18 * sc, p.y - up * 0.35, sc * 1.1, true));
    }
    add(gx + gy + 0.1, put(fxArt('smoke'), p.x + 4 * sc, p.y - up - 10 * sc, sc * 1.3, false, 0.85) + (fire ? put(fxArt('smoke'), p.x - 6 * sc, p.y - up - 40 * sc, sc * 1.6, false, 0.6) : ''));
    add(999, hpBar(p.x, p.y - (up + 78 * sc * (it.kind === 'hq' ? 1 : 0.7)), 40 * sc * 1.2 + BUILDING_SIZE[it.kind] * 8, hp, sc));
  }
  // 登陆小船（海滩上），带兵
  const rafts: Array<[number, number, boolean]> = [[-2.4, 9.0, false], [-2.2, 14.5, false], [6.5, 24.0, true], [13, 24.2, true]];
  for (const [gx, gy, fl] of rafts) {
    const p = at(gx, gy);
    add(gx + gy + 0.3, put(shipArt('raft'), p.x, p.y, sc * 1.0, fl));
  }
  // 兵：[kind, gx, gy, pose, 朝右?]
  const T = (k: TroopKind, gx: number, gy: number, pose: 'idle' | 'walk1' | 'walk2' | 'attack', right: boolean): void => {
    const p = at(gx, gy);
    add(gx + gy + 0.35, put(troopArt(k, pose), p.x, p.y, sc * 1.0, !right));
  };
  T('sailor', -0.4, 8.4, 'walk1', true); T('sailor', 0.8, 10.2, 'walk2', true); T('sailor', 1.6, 7.0, 'walk1', true);
  T('sailor', 2.6, 12.8, 'attack', true); T('sailor', 5.2, 15.8, 'attack', true);
  T('gunner', 0.6, 13.4, 'walk2', true); T('gunner', 5.8, 11.0, 'attack', true); T('gunner', 3.0, 8.0, 'attack', true);
  T('brute', 2.0, 10.6, 'walk1', true); T('brute', 6.4, 13.6, 'attack', true);
  T('bomber', 0.2, 15.2, 'walk2', true); T('bomber', 3.8, 14.4, 'walk1', true); T('bomber', 8.0, 22.6, 'walk2', true);
  T('captain', 8.4, 12.2, 'attack', true);
  T('sailor', 8.0, 14.6, 'attack', true); T('gunner', 9.6, 15.2, 'idle', true);
  T('sailor', 5.4, 22.4, 'walk1', true); T('sailor', 11.0, 22.6, 'walk2', true);
  // 防守方炮弹和爆炸
  const ball = (x0: number, y0: number, x1: number, y1: number, t: number): string => {
    const a = at(x0, y0);
    const b = at(x1, y1);
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 60 * sc;
    const tx = a.x + (b.x - a.x) * (t - 0.14);
    const ty = a.y + (b.y - a.y) * (t - 0.14) - Math.sin((t - 0.14) * Math.PI) * 60 * sc;
    return `<line x1="${n1(tx)}" y1="${n1(ty)}" x2="${n1(px)}" y2="${n1(py)}" stroke="#fff" stroke-width="${n1(4 * sc)}" stroke-linecap="round" opacity="0.5"/>` + put(fxArt('ball'), px, py, sc * 1.4);
  };
  add(990, ball(14.5, 7, 4.4, 12, 0.55) + ball(8, 7, 2.8, 8.4, 0.7) + ball(15.5, 11, 6.2, 14.4, 0.4));
  const bm = at(5.8, 11.6);
  add(995, put(fxArt('boom'), bm.x, bm.y - 14 * sc, sc * 1.2));
  const bm2 = at(10.6, 14.6);
  add(995, put(fxArt('boom'), bm2.x, bm2.y - 6 * sc, sc * 0.9));
  const sp = at(3.6, 11.5);
  add(996, put(fxArt('spark'), sp.x, sp.y - 30 * sc, sc * 1.4) + put(fxArt('spark'), sp.x + 40 * sc, sp.y - 8 * sc, sc * 1.2));
  const bul = at(5.0, 12.3);
  add(996, put(fxArt('bullet'), bul.x + 26 * sc, bul.y - 22 * sc, sc * 1.6) + put(fxArt('bullet'), bul.x + 6 * sc, bul.y - 8 * sc, sc * 1.6));
  const hl = at(9.6, 13.4);
  add(996, put(fxArt('heal'), hl.x, hl.y, sc * 1.1, false, 0.9));
  const fr = at(12.2, 10.5);
  add(996, put(fxArt('flare'), fr.x, fr.y - 40 * sc, sc * 1.4));
  // 旗舰（海上）开炮：炮弹落在岛上
  const fp = at(27.5, 21.5);
  add(980, put(shipArt('flagship'), fp.x, fp.y + 10, 0.66));
  const mz = at(25.4, 20.8);
  add(981, put(fxArt('boom'), mz.x - 10, mz.y - 18, 0.5) + put(fxArt('smoke'), mz.x - 18, mz.y - 56, 0.8, false, 0.7));
  const shl = (t: number): string => {
    const a = at(25.4, 20.4);
    const b = at(15.0, 15.0);
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 140 * sc;
    return put(fxArt('shell'), px, py, sc * 1.6);
  };
  add(992, shl(0.42));
  const sh2 = at(16.2, 17.0);
  add(992, put(fxArt('boom'), sh2.x, sh2.y - 10 * sc, sc * 0.8));
}

// ================================================================= 海图素材

function mapSheet(): void {
  const W = 1100;
  let body = '<defs><linearGradient id="mb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd6d8"/><stop offset="1" stop-color="#1b9bbd"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#mb)"/>';
  for (let v = 0; v < 30; v++) body += put(mapIslandArt(v), 100 + (v % 6) * 180, 100 + Math.floor(v / 6) * 150, v % 5 === 4 ? 0.95 : 1.2);
  (['wave', 'gull', 'rock', 'compass', 'ship'] as const).forEach((k, i) => (body += put(mapDecoArt(k), 80 + i * 140, 820, 1.4)));
  render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="880">${body}</svg>`, 'map-sheet.png', W);
}

// ================================================================= 升级施工的脚手架

/** 升级演出用的脚手架：每种尺寸一列（后半 + 建筑 + 前半叠起来、单独的前半、单独的后半），看它围住建筑的样子 */
function scaffoldSheet(): void {
  const kinds: BuildingKind[] = ['mine', 'cannon', 'goldmine', 'hq'];
  const W = 1200;
  let body = `<rect width="100%" height="100%" fill="${C.grass ?? '#7cc35a'}"/>`;
  kinds.forEach((k, i) => {
    const s = BUILDING_SIZE[k];
    const x = 150 + i * 290;
    body += put(scaffoldArt(s, 'back'), x, 260) + put(buildingArt(k, 3), x, 260) + put(scaffoldArt(s, 'front'), x, 260);
    body += put(scaffoldArt(s, 'front'), x - 60, 470, 0.8) + put(scaffoldArt(s, 'back'), x + 60, 470, 0.8);
  });
  render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="560">${body}</svg>`, 'scaffold.png', W);
}

// ================================================================= 主流程

{
  // 估算：allArt() 全部按 2 倍烘焙成 RGBA 的总内存
  const mb = (a: ArtPiece[]): string => (a.reduce((n, p) => n + p.w * 2 * (p.h * 2) * 4, 0) / 1048576).toFixed(1);
  const all = allArt();
  console.log(`allArt() 默认：${all.length} 张，2 倍烘焙约 ${mb(all)} MB（目标 ≤ 60）`);
  console.log(`allArt({ maxLevel: 8 })：约 ${mb(allArt({ maxLevel: 8 }))} MB`);
  for (const lv of [3, 5, 8]) console.log(`levelArt(${lv})：约 ${mb(levelArt(lv))} MB`);
}
mapSheet();
scaffoldSheet();
sheet();
baseScene(false);
baseScene(true);
