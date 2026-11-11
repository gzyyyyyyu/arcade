/**
 * 生成大厅封面 public/cover.webp（800×450）。
 * 用法：node tools/cover.ts [输出路径]
 * 做法：用 src/view/art 的 SVG 拼一个横版海岛场景，叠上 CSS 标题，无头 chromium 截图后在页面里用 canvas 转 webp。
 * 需要 playwright-core 的 chromium（启动参数照 tools/shot.ts）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import type { BuildingKind } from '../src/core/types.ts';
import { iso } from '../src/view/iso.ts';
import { BUILDING_SIZE, PALETTE, buildingArt, coastArt, decoArt, shipArt, tileArt, troopArt } from '../src/view/art/index.ts';
import type { ArtPiece } from '../src/view/art/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(here, '..', 'public', 'cover.webp');
const W = 800;
const H = 450;
const SC = 0.64;
const N = 12;
const C = PALETTE as Record<string, string>;

const inner = (svg: string): string => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const r1 = (n: number): string => String(Math.round(n * 10) / 10);
function put(p: ArtPiece, x: number, y: number, s = 1, flip = false): string {
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(flip ? -s : s)} ${r1(s)}) translate(${-p.ax} ${-p.ay})">${inner(p.svg)}</g>`;
}

// 岛在右侧：(0,0) 格的屏幕位置
const c0 = iso(N / 2, N / 2);
const OX = 565 - c0.x * SC;
const OY = 262 - c0.y * SC;
const at = (gx: number, gy: number): { x: number; y: number } => {
  const p = iso(gx, gy);
  return { x: OX + p.x * SC, y: OY + p.y * SC };
};

type G = 'grass' | 'grass2' | 'sand' | 'shallow' | 'sea';
const hash = (x: number, y: number): number => ((Math.imul(x + 101, 73856093) ^ Math.imul(y + 211, 19349663)) >>> 0) % 1000;
function ground(gx: number, gy: number): G {
  const dx = Math.max(-gx, gx - (N - 1), 0);
  const dy = Math.max(-gy, gy - (N - 1), 0);
  if (!dx && !dy) return hash(gx, gy) % 7 < 2 ? 'grass2' : 'grass';
  const d = Math.max(dx, dy);
  const h = hash(gx >> 1, gy >> 1);
  if (d <= 2 && dx + dy <= 3 + (h % 2)) return 'sand';
  if (d <= 3 && dx + dy <= 5 + (h % 2)) return 'shallow';
  return 'sea';
}

interface Item { kind: BuildingKind; level: number; x: number; y: number }
const ITEMS: Item[] = [
  { kind: 'hq', level: 6, x: 4, y: 4 },
  { kind: 'goldmine', level: 5, x: 0, y: 0 }, { kind: 'sawmill', level: 4, x: 8, y: 0 }, { kind: 'vault', level: 5, x: 8, y: 8 },
  { kind: 'cannon', level: 5, x: 1, y: 4 }, { kind: 'flame', level: 4, x: 1, y: 8 }, { kind: 'gunTower', level: 6, x: 4, y: 8 }, { kind: 'mortar', level: 4, x: 8, y: 5 },
  { kind: 'palm', level: 1, x: 11, y: 1 }, { kind: 'palm', level: 1, x: 11, y: 5 }, { kind: 'palm', level: 1, x: 11, y: 10 }, { kind: 'palm', level: 1, x: 0, y: 11 },
  { kind: 'palm', level: 1, x: 6, y: 11 }, { kind: 'palm', level: 1, x: 3, y: 3 }, { kind: 'palm', level: 1, x: 3, y: 6 }, { kind: 'palm', level: 1, x: 6, y: 0 },
  { kind: 'rock', level: 1, x: 7, y: 3 }, { kind: 'rock', level: 1, x: 3, y: 10 }, { kind: 'rock', level: 1, x: 9, y: 4 },
];

function scene(): string {
  let s = '';
  // 天空 + 海
  s += `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb4ee"/><stop offset="1" stop-color="#bff0ff"/></linearGradient>` +
    `<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.seaLight}"/><stop offset="0.45" stop-color="${C.sea}"/><stop offset="1" stop-color="${C.seaDeep}"/></linearGradient>` +
    `<radialGradient id="sun"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.35" stop-color="#ffe98a"/><stop offset="1" stop-color="#ffe98a" stop-opacity="0"/></radialGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="url(#sky)"/><circle cx="640" cy="70" r="120" fill="url(#sun)"/><circle cx="640" cy="70" r="30" fill="#fff6c0"/>`;
  s += `<rect y="150" width="${W}" height="${H - 150}" fill="url(#sea)"/>`;
  // 云
  for (const [x, y, k] of [[110, 60, 1], [330, 100, 0.8], [520, 40, 0.7], [740, 120, 0.9]] as const) {
    s += `<g fill="#fff" opacity="0.92" transform="translate(${x} ${y}) scale(${k})"><ellipse cx="0" cy="0" rx="46" ry="14"/><ellipse cx="-20" cy="-10" rx="22" ry="14"/><ellipse cx="14" cy="-14" rx="26" ry="16"/></g>`;
  }
  // 海面浪纹
  for (let i = 0; i < 70; i++) {
    const x = hash(i, 3) * 0.8;
    const y = 160 + (hash(i, 9) / 1000) * 290;
    const l = 14 + (hash(i, 5) % 20);
    s += `<path d="M${r1(x)},${r1(y)} q${r1(l / 4)},-4 ${r1(l / 2)},0 t${r1(l / 2)},0" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.38"/>`;
  }
  // 地面
  let tiles = '';
  for (let gy = -4; gy < N + 4; gy++) for (let gx = -4; gx < N + 4; gx++) {
    const k = ground(gx, gy);
    if (k === 'sea') continue;
    const p = at(gx + 0.5, gy + 0.5);
    tiles += put(tileArt(k), p.x, p.y, SC);
  }
  s += `<defs><filter id="soft"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
  let foam = '';
  for (let gy = -4; gy < N + 4; gy++) for (let gx = -4; gx < N + 4; gx++) {
    if (ground(gx, gy) !== 'shallow') continue;
    const p = at(gx + 0.5, gy + 0.5);
    foam += `<ellipse cx="${r1(p.x)}" cy="${r1(p.y)}" rx="${r1(30 * SC)}" ry="${r1(15 * SC)}" fill="#fff" opacity="0.35"/>`;
  }
  s += `<ellipse cx="${r1(at(N / 2, N / 2).x)}" cy="${r1(at(N / 2, N / 2).y + 14)}" rx="${r1(N * 34 * SC)}" ry="${r1(N * 17 * SC)}" fill="#0b3a55" opacity="0.22"/>`;
  s += tiles + `<g filter="url(#soft)">${foam}</g>`;
  // 海岸装饰
  const deco: Array<{ d: number; svg: string }> = [];
  for (let gy = -4; gy < N + 4; gy++) for (let gx = -4; gx < N + 4; gx++) {
    const h = hash(gx, gy);
    const k = ground(gx, gy);
    const p = at(gx + 0.5, gy + 0.5);
    if (k === 'shallow' && h % 4 === 0) deco.push({ d: gx + gy, svg: put(coastArt('wave'), p.x, p.y, SC) });
    if (k === 'sea' && h % 6 === 0 && ground(gx + 1, gy) === 'shallow') deco.push({ d: gx + gy, svg: put(coastArt('reef'), p.x, p.y, SC) });
    if (k === 'grass' && h % 9 === 0) deco.push({ d: gx + gy, svg: put(decoArt(h % 2 ? 'bush' : 'flowers'), p.x, p.y + 3, SC * 1.2) });
  }
  // 建筑与装饰按深度画
  const layers: Array<{ d: number; svg: string }> = [...deco];
  for (const it of ITEMS) {
    const sz = BUILDING_SIZE[it.kind];
    const p = at(it.x + sz / 2, it.y + sz / 2);
    layers.push({ d: it.x + it.y + sz, svg: put(buildingArt(it.kind, it.level), p.x, p.y, SC) });
  }
  // 登陆的兵：岛左下的沙滩上
  const trs: Array<['sailor' | 'gunner' | 'brute' | 'bomber' | 'captain', number, number, 'walk1' | 'walk2' | 'attack']> = [
    ['captain', 3.2, 14.2, 'attack'], ['sailor', 1.6, 13.8, 'walk1'], ['brute', 5.2, 14.8, 'walk2'], ['bomber', 0.4, 12.6, 'walk2'], ['gunner', 2.4, 15.4, 'attack'],
  ];
  for (const [k, gx, gy, po] of trs) {
    const p = at(gx, gy);
    layers.push({ d: gx + gy + 0.5, svg: put(troopArt(k, po), p.x, p.y, SC * 0.95) });
  }
  layers.sort((a, b) => a.d - b.d);
  s += layers.map((l) => l.svg).join('');
  // 旗舰（左下）
  s += put(shipArt('flagship'), 215, 395, 0.95);
  const rp = at(-1.5, 14.2);
  s += put(shipArt('raft'), rp.x - 20, rp.y + 18, 0.8);
  // 海鸥
  for (const [x, y] of [[300, 80], [350, 60], [470, 120]] as const) s += `<path d="M${x},${y} q7,-8 14,0 q7,-8 14,0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`;
  // 暗角
  s += `<defs><radialGradient id="vg" cx="0.5" cy="0.5" r="0.75"><stop offset="0.65" stop-color="#06304a" stop-opacity="0"/><stop offset="1" stop-color="#06304a" stop-opacity="0.3"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#vg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#000}
#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}
#stage svg{position:absolute;left:0;top:0}
.t{position:absolute;left:34px;top:22px;font-family:"Noto Sans CJK SC","PingFang SC",sans-serif;font-weight:900;color:#fff;line-height:1;
  -webkit-text-stroke:7px #3a1d10;paint-order:stroke fill;letter-spacing:6px;
  text-shadow:0 5px 0 #3a1d10,0 8px 14px rgba(0,0,0,.45)}
#h{font-size:112px;color:#ffe45e}
#s{font-size:30px;margin-top:10px;-webkit-text-stroke:5px #3a1d10;letter-spacing:5px;position:static}
</style><div id="stage">${scene()}<div class="t"><div id="h">海岛</div><div id="s">建岛 · 出海 · 抢宝</div></div></div>`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const png = (await page.locator('#stage').screenshot({ type: 'png' })).toString('base64');
  const webp = await page.evaluate(async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 800;
    cv.height = 450;
    cv.getContext('2d')!.drawImage(img, 0, 0);
    return cv.toDataURL('image/webp', 0.85).split(',')[1] ?? '';
  }, png);
  if (!webp) throw new Error('webp 转换失败');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(webp, 'base64'));
  console.log(`写出 ${OUT}（${Math.round((webp.length * 3) / 4 / 1024)} KB）`);
} finally {
  await browser.close();
}
