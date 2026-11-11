/**
 * 炮台预览：每种会转的塔、每档，把底座（不带炮管）和 16 个方向的炮管 / 火枪手按转轴叠起来，排成一张 PNG，
 * 看炮管透视、转轴位置、炮口点（红点）对不对；不开浏览器。
 * 用法：node tools/turret-preview.ts <输出目录> [种类,种类…]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { TURRET_PIVOT, gunTowerRoof, turretBaseArt } from '../src/view/art/buildings.ts';
import { turretFrame, turretGeom, turretPieces } from '../src/view/art/turrets.ts';
import type { ArtPiece } from '../src/view/art/kit.ts';
import { DIRS, TURRET_KINDS, dirAngle, tipOffset, type TurretKind } from '../src/view/aim.ts';

const out = process.argv[2];
if (!out) {
  console.error('用法：node tools/turret-preview.ts <输出目录> [种类,种类…]');
  process.exit(1);
}
const only = (process.argv[3]?.split(',') ?? TURRET_KINDS) as TurretKind[];
fs.mkdirSync(out, { recursive: true });
const inner = (svg: string): string => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const put = (p: ArtPiece, x: number, y: number, sx = 1): string => `<g transform="translate(${x} ${y}) scale(${sx} 1) translate(${-p.ax} ${-p.ay})">${inner(p.svg)}</g>`;

for (const kind of only) {
  const CW = 200;
  const CH = 300;
  let svg = '';
  const rows = [1, 3, 6];
  rows.forEach((lv, row) => {
    const tier = lv <= 2 ? 0 : lv <= 4 ? 1 : 2;
    const pcs = new Map(turretPieces(kind, tier).map((p) => [p.key, p]));
    const base = turretBaseArt(kind, lv);
    const pv = TURRET_PIVOT(kind, lv);
    const g = turretGeom(kind, lv);
    for (let i = 0; i < DIRS; i++) {
      const x = (i % 8) * CW + CW / 2;
      const y = (row * 2 + Math.floor(i / 8)) * CH + CH - 50;
      svg += put(base, x, y);
      const px = x + pv.dx;
      const py = y + pv.dy;
      if (kind === 'gunTower') {
        const body = pcs.get(turretFrame(kind, tier, 'body'));
        const face = Math.cos(dirAngle(i)) - Math.sin(dirAngle(i)) >= 0 ? 1 : -1;
        if (body) svg += put(body, px, py, face);
      }
      const d = pcs.get(turretFrame(kind, tier, `d${i}`));
      if (d) svg += put(d, px, py);
      const roof = kind === 'gunTower' ? gunTowerRoof(lv) : null;
      if (roof) svg += put(roof, x, y);
      const t = tipOffset({ x: 0, y: 0 }, dirAngle(i), g.len, g.z, g.k);
      svg += `<circle cx="${px + t.x}" cy="${py + t.y}" r="2.5" fill="#ff2030"/><circle cx="${px}" cy="${py}" r="2" fill="#20a0ff"/>`;
    }
  });
  const W = CW * 8;
  const H = CH * 6;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#e9d9a6"/>${svg}</svg>`;
  const png = new Resvg(doc, { fitTo: { mode: 'width', value: W } }).render().asPng();
  fs.writeFileSync(path.join(out, `turret-${kind}.png`), png);
  console.log(`turret-${kind}.png`);
}
