/**
 * 分件骨架预览：把每个兵种 / 守岛敌人的动作按帧采样，用和游戏里同一套正解（rig.ts 的 solveRig）把部件（art/rigparts.ts）拼起来，渲成 PNG。
 * 用法：node tools/rig-preview.ts <输出目录> [种类,种类…]
 * 输出：rig-<种类>.png，一行一个动作：走路（一个循环 8 帧）、攻击（10 帧，标出手帧）、待机、受击、被打飞、跪倒（各 8 帧）。不开浏览器。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { rigPieces, rigFrame, type RigFrame } from '../src/view/art/rigparts.ts';
import { DIE_FLY, DIE_KNEEL, HIT, RIG_KINDS, SKEL, STYLE, addPose, hatDrop, newXf, onRest, sampleClip, solveRig, zeroPose, type Clip, type DeathStyle, type RigKind } from '../src/view/rig.ts';
import type { ArtPiece } from '../src/view/art/index.ts';

const out = process.argv[2];
if (!out) {
  console.error('用法：node tools/rig-preview.ts <输出目录> [种类,种类…]');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
const only = process.argv[3]?.split(',') as RigKind[] | undefined;
const inner = (svg: string): string => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const n2 = (n: number): string => String(Math.round(n * 100) / 100);

function draw(kind: RigKind, clip: Clip, k: number, death?: DeathStyle, hitK = -1): string {
  const sk = SKEL[kind];
  const st = STYLE[kind];
  const by = new Map<string, ArtPiece>(rigPieces(kind).map((p) => [p.key, p]));
  const d = zeroPose();
  const pose = zeroPose();
  sampleClip(d, clip, k);
  onRest(pose, st.rest, d, clip);
  if (hitK >= 0) addPose(pose, sampleClip(zeroPose(), HIT, hitK), st.hitScale);
  const xf = solveRig(newXf(), sk, pose);
  const one = (name: RigFrame, x: number, y: number, r: number, op = 1): string => {
    const p = by.get(rigFrame(kind, name));
    if (!p) return '';
    return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2((r * 180) / Math.PI)}) translate(${n2(-p.ax)} ${n2(-p.ay)})"${op < 1 ? ` opacity="${n2(op)}"` : ''}>${inner(p.svg)}</g>`;
  };
  let s = one('shadow', pose.x * sk.s * 0.9, 0, 0);
  for (const name of ['legB', 'legF', 'armB', 'torso'] as const) s += one(name, xf[name].x, xf[name].y, xf[name].r);
  s += one('head', xf.head.x, xf.head.y, xf.head.r);
  if (death) {
    const h0 = solveRig(newXf(), sk, onRest(zeroPose(), st.rest, zeroPose(), clip)).head;
    const o = hatDrop({ x: 0, y: 0, r: 0 }, death, k, h0.y / sk.s);
    s += one('hat', h0.x + o.x * sk.s, h0.y + o.y * sk.s, h0.r + (o.r * Math.PI) / 180);
  } else s += one('hat', xf.head.x, xf.head.y, xf.head.r);
  s += one('armF', xf.armF.x, xf.armF.y, xf.armF.r) + one('wep', xf.wep.x, xf.wep.y, xf.wep.r);
  if (pose.trail > 0.03) s += one('trail', xf.armF.x, xf.armF.y, xf.armF.r, Math.min(1, pose.trail) * 0.85);
  const sq = pose.sq;
  return `<g transform="scale(${n2(1 + sq / 2)} ${n2(1 - sq)})">${s}</g>`;
}

const CELL = 150;
for (const kind of only ?? RIG_KINDS) {
  const st = STYLE[kind];
  const rows: Array<{ name: string; cells: string[]; mark?: number }> = [];
  rows.push({ name: '走路', cells: Array.from({ length: 8 }, (_, i) => draw(kind, st.walk, i / 8)) });
  const hit = st.attack.hit ?? 0.42;
  // 攻击按它自己的关键帧时刻取样（出手那一格正好是规则的出手拍）
  const ak = st.attack.keys.map((k) => k.t);
  rows.push({ name: '攻击', cells: ak.map((k) => draw(kind, st.attack, k)), mark: ak.reduce((b, k, i) => (Math.abs(k - hit) < Math.abs(ak[b]! - hit) ? i : b), 0) });
  rows.push({ name: '待机', cells: Array.from({ length: 8 }, (_, i) => draw(kind, st.idle, i / 8)) });
  rows.push({ name: '受击', cells: Array.from({ length: 8 }, (_, i) => draw(kind, st.idle, 0, undefined, i / 7)) });
  rows.push({ name: '打飞', cells: Array.from({ length: 8 }, (_, i) => draw(kind, DIE_FLY, (i / 7) * 0.62, 'fly')) });
  rows.push({ name: '跪倒', cells: Array.from({ length: 8 }, (_, i) => draw(kind, DIE_KNEEL, (i / 7) * 0.8, 'kneel')) });
  const W = 70 + 10 * CELL;
  const H = rows.length * CELL + 20;
  let body = `<rect width="${W}" height="${H}" fill="#7fb35a"/>`;
  rows.forEach((row, ri) => {
    const y = 10 + ri * CELL;
    body += `<text x="8" y="${y + CELL / 2}" font-size="16" fill="#132">${row.name}</text>`;
    row.cells.forEach((c, i) => {
      const x = 70 + i * CELL;
      if (row.mark === i) body += `<rect x="${x + 2}" y="${y + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="none" stroke="#ff3" stroke-width="3"/>`;
      body += `<g transform="translate(${x + CELL / 2} ${y + CELL - 26})">${c}</g>`;
    });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng();
  fs.writeFileSync(path.join(out, `rig-${kind}.png`), png);
  console.log(`rig-${kind}.png`);
}
