// 比较两次 scenes 截图（同名 png）：node scripts/compare-shots.mjs <A> <B> [--px=N]
// 同一份构建跑两次，摊牌那几张的牌面圆角边缘抗锯齿每次差一点（浏览器留着翻牌动画时的栅格，见 harness.ts 的 stableShot），
// 灰度能差到 30 多级，按灰度放宽会把真的画面差别一起放过去。所以按位置放宽：
// --px=N：不同的像素，在另一张图上 N 像素以内找得到几乎同色（每通道差 ≤2 级）的点，两边互相都找得到，才算边缘抖动；默认 0 = 逐像素一致。
// 每张不一致的图都报差了几个像素、最大差几级、在哪一块。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const px = Number(args.find((s) => s.startsWith('--px='))?.slice(5) ?? 0);
const [a, b] = args.filter((s) => !s.startsWith('--'));
const raw = (d, f) => sharp(readFileSync(join(d, f))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
/** p 这个点在 q 图上 px 以内有没有几乎同色的点 */
const near = (p, q, w, h, i) => {
  const cx = (i / 4) % w;
  const cy = Math.floor(i / 4 / w);
  for (let dy = -px; dy <= px; dy++)
    for (let dx = -px; dx <= px; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = (y * w + x) * 4;
      let ok = true;
      for (let c = 0; c < 4 && ok; c++) ok = Math.abs(p[i + c] - q[j + c]) <= 2;
      if (ok) return true;
    }
  return false;
};
const names = readdirSync(a)
  .filter((f) => f.endsWith('.png'))
  .sort();
let same = 0;
let within = 0;
const bad = [];
for (const f of names) {
  if (!existsSync(join(b, f))) {
    bad.push(`${f}: B 缺`);
    continue;
  }
  const [x, y] = await Promise.all([raw(a, f), raw(b, f)]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) {
    bad.push(`${f}: 尺寸不同`);
    continue;
  }
  let n = 0;
  let over = 0;
  let max = 0;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < x.data.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(x.data[i + c] - y.data[i + c]));
    if (!d) continue;
    n++;
    max = Math.max(max, d);
    if (!px || !near(x.data, y.data, x.info.width, x.info.height, i) || !near(y.data, x.data, x.info.width, x.info.height, i)) over++;
    const p = i / 4;
    const cx = p % x.info.width;
    const cy = Math.floor(p / x.info.width);
    x0 = Math.min(x0, cx);
    x1 = Math.max(x1, cx);
    y0 = Math.min(y0, cy);
    y1 = Math.max(y1, cy);
  }
  const where = `${n} 像素不同，最大差 ${max} 级，范围 x ${x0}-${x1} y ${y0}-${y1}`;
  if (!n) same++;
  else if (!over) {
    within++;
    console.log(`容差内 ${f}: ${where}`);
  } else bad.push(`${f}: ${where}，其中 ${over} 个在容差外`);
}
console.log(`共 ${names.length} 张，逐像素一致 ${same}，${px} 像素容差内一致 ${within}，不一致 ${bad.length}`);
for (const l of bad) console.log(l);
process.exitCode = bad.length ? 1 : 0;
