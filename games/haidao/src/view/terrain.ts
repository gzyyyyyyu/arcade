/**
 * 地面烘焙：整座岛和周围的海一次画进一张 canvas（ground.ts 再贴成一张图）。
 * 全部程序生成，不放图片；同样的参数永远画出同样的图（只用 grade.ts 里的整数散列）：
 * - 海：离岸越近越浅越亮、越远越深（一圈圈略带起伏的色带），岸边一条浪花线；
 * - 沙滩：靠海一圈湿沙（深一档）、细沙粒、零星贝壳和一串脚印；
 * - 草地：成片深浅草丛（不是棋盘格）、草叶、小花、小石头，岛边一圈泥土边；格子线只留很淡的一层给建造对位；
 * - 光源在左上：草丛亮面偏暖，岛边泥土只在右下露出一圈（落在背光面）。
 */
import { BEACH, ISLAND } from '../core/types.ts';
import { PALETTE as C } from './art/palette.ts';
import { gradeHex, h32, rng } from './art/grade.ts';
import { mix } from './art/kit.ts';
import { iso, unIso } from './iso.ts';

type Pt = { x: number; y: number };

/** 岛外画多远的海（格），和 ground.ts 的 EXT 一致 */
export const SEA_EXT = BEACH + 3;

const g = (c: string): string => gradeHex(c);
/** 地面用色（都过一遍配色分级，和素材统一） */
export const TERRAIN = {
  seaFar: g(C.seaDeep!),
  seaMid: g(C.sea!),
  seaNear: g(C.shallow!),
  seaShore: g(C.shallowL!),
  foam: '#f4fdf8',
  sandWet: g(C.sandWet!),
  sandMid: g('#e3c57e'),
  sand: g(C.sand!),
  sandL: g(C.sandL!),
  sandD: g(C.sandD!),
  grass: g(C.grass!),
  grassD: g('#3f9a3c'),
  grassDD: g('#2f7d36'),
  grassL: g('#9bd868'),
  soil: g('#9e7442'),
  soilD: g('#5f4120'),
};
/** 摄像机背景色 = 最远处海色，画布边缘不露底 */
export const SEA_BG = TERRAIN.seaFar;

const rgba = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.round(a * 1000) / 1000})`;
};

/** 平滑值噪声（0..1），用格点散列做双线性 + smoothstep */
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (a: number, b: number): number => h32(a, b, seed) / 4294967296;
  const top = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * sx;
  const bot = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
}

/**
 * 离岛 e 格的一圈轮廓（闭合折线，屏幕坐标）：沿四条边每 0.4 格取一点，
 * 沿外法线按噪声起伏 amp 像素（lo..hi 控制只向外凸还是内外都有），得到不规则的海岸线。
 */
export function shoreline(e: number, amp: number, seed: number, outwardOnly = false): Pt[] {
  const I = ISLAND;
  const out: Pt[] = [];
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number): void => {
    const len = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    const n = Math.max(2, Math.round(len / 0.4));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const gx = ax + (bx - ax) * t;
      const gy = ay + (by - ay) * t;
      const k = vnoise(gx * 0.55 + 31, gy * 0.55 + 17, seed);
      const d = (outwardOnly ? k : (k - 0.5) * 2) * (amp / 36);
      out.push(iso(gx + nx * d, gy + ny * d));
    }
  };
  edge(-e, -e, I + e, -e, 0, -1);
  edge(I + e, -e, I + e, I + e, 1, 0);
  edge(I + e, I + e, -e, I + e, 0, 1);
  edge(-e, I + e, -e, -e, -1, 0);
  return out;
}

/** 闭合折线 → 二次曲线平滑的路径（过各段中点） */
export function trace(cx: CanvasRenderingContext2D, pts: Pt[]): void {
  const n = pts.length;
  cx.beginPath();
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = mid(pts[n - 1]!, pts[0]!);
  cx.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i]!, pts[(i + 1) % n]!);
    cx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, m.x, m.y);
  }
  cx.closePath();
}

/** 椭圆形软斑（等距里压扁一半）：径向渐变，边缘透明 */
function blob(cx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
  cx.save();
  cx.translate(x, y);
  cx.scale(1, 0.5);
  const gr = cx.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  cx.fillStyle = gr;
  cx.beginPath();
  cx.arc(0, 0, r, 0, Math.PI * 2);
  cx.fill();
  cx.restore();
}

/** 岛上随机一格里的一点（屏幕坐标） */
function onIsland(R: () => number, margin = 0): Pt {
  return iso(margin + R() * (ISLAND - margin * 2), margin + R() * (ISLAND - margin * 2));
}

export interface TerrainOpts {
  /** 战斗和守岛：细节收一收（格子线更淡、花草少一点），免得和兵、塔抢眼 */
  soft: boolean;
  /** 画布左上角在世界里的位置（像素）和渲染倍数 */
  x0: number;
  y0: number;
  s: number;
  w: number;
  h: number;
}

/** 把海、沙滩、草地画进 cx（cx 已经设好 setTransform(s,0,0,s,-x0*s,-y0*s)，世界坐标直接画） */
export function paintTerrain(cx: CanvasRenderingContext2D, o: TerrainOpts): void {
  const T = TERRAIN;
  const soft = o.soft;
  // ---- 海：远海底色上一层压扁成岛形的径向渐变（近岸浅青 → 远海深蓝，平滑过渡），叠 6 层环礁浅带和大片深浅斑（洋流）。
  // 这一层全是没有细节的柔和底色，整层画在 1/4 分辨率的小画布上再一次拉伸贴回：全尺寸的渐变填充、羽化、几十个大斑各要几十毫秒，
  // 小画布上只要几毫秒，贴回一次十来毫秒，整层比改前 30 圈硬色阶还省。细的短波纹、亮点还在全尺寸上画
  const q = o.s / 4;
  const sm = document.createElement('canvas');
  sm.width = Math.ceil(o.w * q);
  sm.height = Math.ceil(o.h * q);
  const sx = sm.getContext('2d')!;
  sx.setTransform(q, 0, 0, q, -o.x0 * q, -o.y0 * q);
  sx.fillStyle = T.seaFar;
  sx.fillRect(o.x0 - 4, o.y0 - 4, o.w + 8, o.h + 8);
  const mid = iso(ISLAND / 2, ISLAND / 2);
  const far = iso(ISLAND / 2, -SEA_EXT).y - mid.y;
  sx.save();
  sx.translate(mid.x, mid.y);
  sx.scale(2, 1);
  const rg = sx.createRadialGradient(0, 0, 0, 0, 0, -far);
  rg.addColorStop(0, T.seaNear);
  rg.addColorStop(0.42, T.seaNear);
  rg.addColorStop(0.62, T.seaMid);
  rg.addColorStop(0.85, T.seaFar);
  rg.addColorStop(1, T.seaFar);
  sx.fillStyle = rg;
  sx.fillRect(-o.w, -o.h, o.w * 2, o.h * 2);
  sx.restore();
  // 环礁浅带只画羽化后的影子（形状本身移到画布外，影子偏移回来），叠起来是渐变、没有一圈圈硬边。
  // 6 层收在离岛 3.2–5.2 格，加上羽化也落在地形画布（离岛 SEA_EXT = 6 格）以内，四个尖角外不会被画布边直线切断
  const off = (o.w + 200) * 2;
  sx.save();
  sx.shadowOffsetX = -off * q;
  sx.shadowBlur = 22 * q;
  sx.fillStyle = '#000';
  for (let i = 0; i < 6; i++) {
    const e = BEACH + 0.2 + i * 0.4;
    trace(sx, shoreline(e, 10, 90 + i).map((p) => ({ x: p.x + off, y: p.y })));
    sx.shadowColor = rgba(i < 3 ? g(C.shallowL!) : g(C.seaLight!), 0.2);
    sx.fill();
  }
  sx.restore();
  // 海面质感：大片深浅斑（洋流，在小画布上）、零散的短波纹和细碎的亮点（全尺寸；沙滩画在它上面，盖住岛内的部分）
  const Rw = rng(h32(5, 9, 1));
  // 只在离岛不到 SEA_EXT-1 格的范围里撒（画布边缘保持纯远海色，和摄像机背景接上）
  const sea = (): Pt => {
    for (let k = 0; k < 40; k++) {
      const p = { x: o.x0 + Rw() * o.w, y: o.y0 + Rw() * o.h };
      const u = unIso(p.x, p.y);
      if (Math.max(-u.gx, u.gx - ISLAND, -u.gy, u.gy - ISLAND) < SEA_EXT - 1) return p;
    }
    return iso(ISLAND / 2, ISLAND / 2);
  };
  for (let i = 0; i < 46; i++) {
    const p = sea();
    blob(sx, p.x, p.y, 70 + Rw() * 110, Rw() < 0.5 ? T.seaFar : T.seaNear, soft ? 0.1 : 0.16);
  }
  // 双线性拉伸（默认的 low）：底色本来就柔，看不出差别；'high' 的滤波在大图上要多花几十毫秒
  cx.drawImage(sm, o.x0, o.y0, sm.width / q, sm.height / q);
  cx.lineCap = 'round';
  for (const [col, n, lw, a] of [[T.seaNear, 150, 1.6, 0.4], [T.foam, 90, 1.2, 0.28]] as const) {
    cx.strokeStyle = rgba(col, a);
    cx.lineWidth = lw;
    cx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = sea();
      const len = 10 + Rw() * 16;
      cx.moveTo(p.x, p.y);
      cx.quadraticCurveTo(p.x + len / 2, p.y - 3, p.x + len, p.y);
    }
    cx.stroke();
  }
  // ---- 沙滩：湿沙在最外（深一档），向里渐渐干
  const sandOuter = shoreline(BEACH, 9, 7);
  trace(cx, sandOuter);
  cx.fillStyle = T.sandWet;
  cx.fill();
  const bands: Array<[number, string, number]> = [[BEACH - 0.35, mix(T.sandWet, T.sandMid, 0.5), 7], [BEACH - 0.85, T.sandMid, 8], [BEACH - 1.5, T.sand, 9]];
  for (const [e, col, sd] of bands) {
    cx.save();
    cx.shadowColor = col;
    cx.shadowBlur = 7 * o.s;
    trace(cx, shoreline(e, 7, sd));
    cx.fillStyle = col;
    cx.fill();
    cx.restore();
  }
  // 岛内沙下面铺满（防止草地边缘露底）
  trace(cx, shoreline(0, 4, 3, true));
  cx.fillStyle = T.sand;
  cx.fill();
  // 沙面：浅深沙粒、细波纹、贝壳、脚印（只画在沙滩轮廓里；草地之后盖住）
  cx.save();
  trace(cx, sandOuter);
  cx.clip();
  const Rs = rng(h32(11, 3, 5));
  const grains = soft ? 700 : 1100;
  for (const [col, n, a] of [[T.sandD, grains, 0.5], [T.sandL, grains, 0.55]] as const) {
    cx.fillStyle = rgba(col, a);
    cx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = iso(-BEACH + Rs() * (ISLAND + BEACH * 2), -BEACH + Rs() * (ISLAND + BEACH * 2));
      const w = 1 + Rs() * 1.6;
      cx.rect(p.x, p.y, w, w * 0.6);
    }
    cx.fill();
  }
  // 风成沙波纹：亮暗成对的 2 像素弧线，长 14–24（1× 下看得清）
  cx.lineWidth = 2;
  const rip: Array<[number, number, number]> = [];
  for (let i = 0; i < 60; i++) {
    const p = iso(-BEACH + Rs() * (ISLAND + BEACH * 2), -BEACH + Rs() * (ISLAND + BEACH * 2));
    rip.push([p.x, p.y, 14 + Rs() * 10]);
  }
  for (const [col, dy] of [[T.sandL, 0], [T.sandD, 2.2]] as const) {
    cx.strokeStyle = rgba(col, 0.32);
    cx.beginPath();
    for (const [x, y, l] of rip) {
      cx.moveTo(x, y + dy);
      cx.quadraticCurveTo(x + l / 2, y + dy - 2.6, x + l, y + dy);
    }
    cx.stroke();
  }
  // 贝壳：小圆片，粉、白、米色
  const shells = [g('#f6dccf'), g('#fff6e8'), g('#e9c7a6')];
  for (let i = 0; i < 46; i++) {
    const side = Rs();
    // 只放在沙滩带里：从四边各取外圈
    const gx = side < 0.5 ? -BEACH + 0.4 + Rs() * (ISLAND + BEACH * 2 - 0.8) : Rs() < 0.5 ? -BEACH + 0.4 + Rs() * 2.2 : ISLAND + BEACH - 2.6 + Rs() * 2.2;
    const gy = side < 0.5 ? (Rs() < 0.5 ? -BEACH + 0.4 + Rs() * 2.2 : ISLAND + BEACH - 2.6 + Rs() * 2.2) : -BEACH + 0.4 + Rs() * (ISLAND + BEACH * 2 - 0.8);
    const p = iso(gx, gy);
    cx.fillStyle = rgba(T.sandD, 0.5);
    cx.beginPath();
    cx.ellipse(p.x + 1, p.y + 1, 2.4, 1.3, 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = shells[i % 3]!;
    cx.beginPath();
    cx.ellipse(p.x, p.y, 2.2, 1.4, 0, 0, Math.PI * 2);
    cx.fill();
    cx.strokeStyle = rgba(T.sandD, 0.7);
    cx.lineWidth = 0.6;
    cx.beginPath();
    cx.moveTo(p.x - 1.4, p.y);
    cx.lineTo(p.x + 1.4, p.y);
    cx.stroke();
  }
  // 脚印：沿南面沙滩走一串，左右脚交替，朝同一个方向
  if (!soft) {
    const start = iso(6, ISLAND + 0.9);
    for (let i = 0; i < 14; i++) {
      const p = { x: start.x + i * 13, y: start.y - i * 6.5 + (i % 2 ? 3 : -3) };
      cx.fillStyle = rgba(T.sandWet, 0.55);
      cx.beginPath();
      cx.ellipse(p.x, p.y, 2.6, 1.5, -0.45, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = rgba(T.sandL, 0.35);
      cx.beginPath();
      cx.ellipse(p.x - 0.6, p.y - 0.5, 1.4, 0.7, -0.45, 0, Math.PI * 2);
      cx.fill();
    }
  }
  cx.restore();
  // 潮间带：湿沙内缘一条水渍线
  cx.strokeStyle = rgba(g(C.sandWetD!), 0.45);
  cx.lineWidth = 1.5;
  trace(cx, shoreline(BEACH - 0.4, 7, 7));
  cx.stroke();
  // 浪花线：贴着水陆交界一条主浪（4 像素）+ 外面一圈淡的；再往外一道断续的副浪
  trace(cx, sandOuter);
  cx.strokeStyle = rgba(T.foam, 0.28);
  cx.lineWidth = 9;
  cx.stroke();
  cx.strokeStyle = rgba(T.foam, 0.9);
  cx.lineWidth = 4;
  cx.stroke();
  cx.setLineDash([32, 15]);
  cx.strokeStyle = rgba(T.foam, 0.55);
  cx.lineWidth = 2;
  trace(cx, shoreline(BEACH + 0.4, 12, 41));
  cx.stroke();
  cx.setLineDash([]);

  // ---- 草地：草皮比沙滩高一截。先在右下落一片沙上的影子，再垫一圈草根土唇（右下露出来），最后草坪
  const grassEdge = shoreline(0, 13, 3, true);
  cx.save();
  cx.translate(5, 7);
  trace(cx, grassEdge);
  cx.fillStyle = 'rgba(110,78,38,0.28)';
  cx.fill();
  cx.translate(-2, -3);
  trace(cx, grassEdge);
  cx.fillStyle = T.soil;
  cx.fill();
  cx.restore();
  // 沙滩在草地边缘的阴影：贴着草边一圈暗沙
  cx.save();
  cx.shadowColor = rgba(T.sandD, 0.9);
  cx.shadowBlur = 9 * o.s;
  trace(cx, grassEdge);
  cx.fillStyle = T.grass;
  cx.fill();
  cx.restore();
  cx.save();
  trace(cx, grassEdge);
  cx.clip();
  // 底色：从左上亮暖到右下略暗冷
  const a = iso(0, 0);
  const b = iso(ISLAND, ISLAND);
  const lg = cx.createLinearGradient(a.x, a.y, b.x, b.y);
  lg.addColorStop(0, mix(T.grass, '#ffe9a8', 0.08));
  lg.addColorStop(1, mix(T.grass, '#1d3a6a', 0.07));
  cx.fillStyle = lg;
  cx.fillRect(o.x0, o.y0, o.w, o.h);
  const Rg = rng(h32(21, 8, 2));
  // 大片深浅草丛
  for (let i = 0; i < 64; i++) {
    const p = onIsland(Rg);
    blob(cx, p.x, p.y, 60 + Rg() * 90, Rg() < 0.55 ? T.grassD : T.grassL, 0.34 + Rg() * 0.2);
  }
  for (let i = 0; i < 200; i++) {
    const p = onIsland(Rg);
    blob(cx, p.x, p.y, 16 + Rg() * 30, Rg() < 0.5 ? T.grassDD : T.grassL, 0.2 + Rg() * 0.16);
  }
  // 几处裸土
  for (let i = 0; i < 12; i++) {
    const p = onIsland(Rg, 1);
    blob(cx, p.x, p.y, 14 + Rg() * 18, T.soil, 0.2);
  }
  // 草叶：一把一把的小短线，深浅两色
  for (const [col, n, a2] of [[T.grassDD, 900, 0.45], [T.grassL, 700, 0.5]] as const) {
    cx.strokeStyle = rgba(col, a2);
    cx.lineWidth = 1.1;
    cx.beginPath();
    for (let i = 0; i < n * (soft ? 0.7 : 1); i++) {
      const p = onIsland(Rg);
      const hh = 3 + Rg() * 3.5;
      const lean = (Rg() - 0.5) * 3;
      cx.moveTo(p.x, p.y);
      cx.lineTo(p.x + lean, p.y - hh);
      cx.moveTo(p.x + 2, p.y + 0.5);
      cx.lineTo(p.x + 2 - lean * 0.6, p.y - hh * 0.8);
    }
    cx.stroke();
  }
  // 三叶小草丛：6–10 像素的一簇，1× 下认得出（比满地的碎草叶清楚）
  for (let i = 0; i < 45; i++) {
    const p = onIsland(Rg, 0.5);
    const k = 6 + Rg() * 4;
    for (const [col, dx] of [[T.grassD, 0], [T.grassL, -1]] as const) {
      cx.fillStyle = rgba(col, 0.35 + (dx ? 0.1 : 0));
      cx.beginPath();
      for (const an of [-0.6, 0, 0.6]) {
        cx.ellipse(p.x + dx + Math.sin(an) * k * 0.45, p.y - k * 0.35, k * 0.18, k * 0.42, an, 0, Math.PI * 2);
      }
      cx.fill();
    }
  }
  // 小花：白、黄、淡粉，稀疏
  const flowers = [g('#fffdf4'), g('#ffe27a'), g('#f7b8c4'), g('#cbb2f0')];
  for (let i = 0; i < (soft ? 70 : 130); i++) {
    const p = onIsland(Rg, 0.3);
    cx.fillStyle = flowers[i % 4]!;
    cx.beginPath();
    cx.arc(p.x, p.y, 1.1 + Rg() * 0.5, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = rgba('#ffd23f', 0.9);
    cx.fillRect(p.x - 0.3, p.y - 0.3, 0.6, 0.6);
  }
  // 小石头：灰椭圆 + 亮面 + 脚下一点暗
  for (let i = 0; i < (soft ? 28 : 46); i++) {
    const p = onIsland(Rg, 0.4);
    const r = 1.8 + Rg() * 2.2;
    cx.fillStyle = rgba('#1c2a18', 0.3);
    cx.beginPath();
    cx.ellipse(p.x + 1.2, p.y + 1.2, r + 0.8, r * 0.55 + 0.5, 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = g('#9aa2a9');
    cx.beginPath();
    cx.ellipse(p.x, p.y, r, r * 0.62, 0, 0, Math.PI * 2);
    cx.fill();
    cx.fillStyle = g('#cfd5da');
    cx.beginPath();
    cx.ellipse(p.x - r * 0.25, p.y - r * 0.2, r * 0.5, r * 0.25, 0, 0, Math.PI * 2);
    cx.fill();
  }
  // 格子线：只留很淡的一层，建造对位用
  cx.strokeStyle = rgba(T.grassDD, soft ? 0.08 : 0.15);
  cx.lineWidth = 1;
  cx.beginPath();
  for (let i = 0; i <= ISLAND; i++) {
    const a1 = iso(i, 0);
    const a2 = iso(i, ISLAND);
    const b1 = iso(0, i);
    const b2 = iso(ISLAND, i);
    cx.moveTo(a1.x, a1.y);
    cx.lineTo(a2.x, a2.y);
    cx.moveTo(b1.x, b1.y);
    cx.lineTo(b2.x, b2.y);
  }
  cx.stroke();
  cx.restore();
  // 受光草眉：草边朝左上的那一半描一条亮绿（背光的右下只露土唇和落影，不画亮边）
  const l1e = iso(0, ISLAND);
  const l3e = iso(ISLAND, 0);
  cx.save();
  cx.beginPath();
  cx.moveTo(l1e.x - 400, l1e.y + 40);
  cx.lineTo(l3e.x + 400, l3e.y + 40);
  cx.lineTo(l3e.x + 400, l3e.y - 4000);
  cx.lineTo(l1e.x - 400, l1e.y - 4000);
  cx.closePath();
  cx.clip();
  cx.strokeStyle = rgba(T.grassL, 0.65);
  cx.lineWidth = 2;
  trace(cx, grassEdge);
  cx.stroke();
  cx.restore();
  // 草簇：沿草边每 18–26 像素一簇三瓣，伸到沙上 4–6 像素，打碎一整条光滑的边
  {
    const c0 = iso(ISLAND / 2, ISLAND / 2);
    const Rt = rng(h32(31, 7, 3));
    let acc = 0;
    let next = 18 + Rt() * 8;
    for (let i = 1; i < grassEdge.length; i++) {
      const { x: ax, y: ay } = grassEdge[i - 1]!;
      const { x: bx, y: by } = grassEdge[i]!;
      acc += Math.hypot(bx - ax, by - ay);
      if (acc < next) continue;
      acc = 0;
      next = 18 + Rt() * 8;
      const dx = bx - c0.x;
      const dy = (by - c0.y) * 2;
      const dl = Math.hypot(dx, dy) || 1;
      const ox = (dx / dl) * (4 + Rt() * 2);
      const oy = ((dy / dl) * (4 + Rt() * 2)) / 2;
      const k = 8 + Rt() * 4;
      cx.fillStyle = T.grass;
      cx.beginPath();
      for (const t of [-0.35, 0, 0.35]) cx.ellipse(bx + ox * 0.5 + t * k, by + oy * 0.5 - Math.abs(t) * 2, k * 0.22, k * 0.3, t, 0, Math.PI * 2);
      cx.fill();
      cx.fillStyle = rgba(T.grassL, 0.8);
      cx.beginPath();
      for (const t of [-0.35, 0, 0.35]) cx.ellipse(bx + ox * 0.5 + t * k - 0.6, by + oy * 0.5 - Math.abs(t) * 2 - 1.2, k * 0.1, k * 0.14, t, 0, Math.PI * 2);
      cx.fill();
    }
  }
  // 草边的亮线（左上迎光的两条边更亮）
  cx.save();
  cx.strokeStyle = rgba('#fff4c0', 0.22);
  cx.lineWidth = 1.6;
  const l1 = iso(0, ISLAND);
  const l2 = iso(0, 0);
  const l3 = iso(ISLAND, 0);
  cx.beginPath();
  cx.moveTo(l1.x, l1.y - 0.5);
  cx.lineTo(l2.x, l2.y - 0.5);
  cx.lineTo(l3.x, l3.y - 0.5);
  cx.stroke();
  cx.restore();
}
