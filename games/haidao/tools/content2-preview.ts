/**
 * 第二片新素材预览：狙击塔 1/3/5/8 级整张图、盾兵（兵 / 守岛敌人）整张帧、狙击弹迹，红框是画布边界（看有没有被裁）；不开浏览器。
 * 用法：node tools/content2-preview.ts <输出目录>
 */
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { buildingArt, troopFrames, fxArt } from '../src/view/art/index.ts';
import { tdEnemyFrames } from '../src/view/art/tdart.ts';
const inner = (svg: string): string => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
let x = 10; let svg = ''; let H = 0;
const put = (p: { w: number; h: number; svg: string }, label: string) => { svg += `<g transform="translate(${x} 10)"><rect width="${p.w}" height="${p.h}" fill="#9ccf6a" stroke="red" stroke-width="1"/>${inner(p.svg)}</g><text x="${x}" y="${p.h + 24}" font-size="12">${label}</text>`; x += p.w + 12; H = Math.max(H, p.h); };
for (const lv of [1, 3, 5, 8]) put(buildingArt('sniper', lv), `sniper L${lv}`);
for (const f of troopFrames('shield', 'idle').slice(0, 1)) put(f, 'shield t idle');
for (const f of troopFrames('shield', 'attack').slice(0, 3)) put(f, 'shield t atk');
for (const f of tdEnemyFrames('shield', 'walk').slice(0, 2)) put(f, 'shield e walk');
put(fxArt('snipe'), 'snipe');
const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${H + 40}"><rect width="100%" height="100%" fill="#e8d9a8"/>${svg}</svg>`);
const out = process.argv[2];
if (!out) {
  console.error('用法：node tools/content2-preview.ts <输出目录>');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/content2-pieces.png`, r.render().asPng());
