/**
 * 夜探镇子的缩略图（选模式页的镇子卡左边）：按镇子模板用固定种子生成一张样板地图，画成俯视小地图——
 * 石板街打底，院子按种类上色（大院、寺、空场、废院），房、墙、河、台阶、戏台、摊子、粮仓、窑按块画，窑口的火区画橙红小块，四角的门画红点，出生点画小红点。
 * 每局的镇子按种子变，这张只是"这个镇子大概长这样"；画法和尺寸同守夜的地图缩略图（terrain.ts 的 drawMapThumb），画布边长由调用方按 k × dpr 定。
 */
import type { RaidTemplateId } from '../../content/explore.ts';
import type { RaidLook } from '../../core/blocks.ts';
import { generateMap, type RaidMap, type YardKind } from '../../explore/mapgen.ts';

/** 样板地图的种子：固定一个，每次打开画出来都一样 */
const SAMPLE_SEED = 7;
const maps = new Map<RaidTemplateId, RaidMap>();

const GROUND = '#cfc4a6';
const YARD_FILL: Record<YardKind, string> = {
  yard: '#b3a684',
  plaza: '#ddd0a4',
  ruin: '#968b70',
  temple: '#d9b062',
  vault: '#e0a83a',
};
const LOOK_FILL: Record<RaidLook, string> = {
  wall_h: '#4a3c30',
  wall_v: '#4a3c30',
  house: '#3d4660',
  hall: '#7a2a24',
  stall: '#c8643a',
  river: '#1f6fd0',
  terrace: '#6e5638',
  stage: '#b8322a',
  granary: '#a8803a',
  kiln: '#6a5e56',
};

function sample(t: RaidTemplateId): RaidMap {
  let m = maps.get(t);
  if (!m) {
    m = generateMap(t, SAMPLE_SEED);
    maps.set(t, m);
  }
  return m;
}

export function drawTownThumb(cv: HTMLCanvasElement, t: RaidTemplateId): void {
  const c = cv.getContext('2d');
  if (!c) return;
  const S = cv.width;
  const m = sample(t);
  const k = S / m.size;
  c.clearRect(0, 0, S, S);
  c.fillStyle = GROUND;
  c.fillRect(0, 0, S, S);
  for (const y of m.yards) {
    c.fillStyle = YARD_FILL[y.kind];
    c.fillRect(y.x * k, y.y * k, y.w * k, y.h * k);
  }
  // 墙很薄（几十单位，缩到 64 像素宽不到半像素）：每块至少画 S/90 粗，免得看不见
  const min = Math.max(1, S / 90);
  for (const b of m.blocks) {
    const w = Math.max(b.w * k, min);
    const h = Math.max(b.h * k, min);
    c.fillStyle = LOOK_FILL[b.look];
    c.fillRect(b.x * k + (b.w * k - w) / 2, b.y * k + (b.h * k - h) / 2, w, h);
  }
  // 窑镇的窑口火区：橙红小块，深边
  c.fillStyle = '#ff7a2a';
  c.strokeStyle = '#4a1a10';
  c.lineWidth = Math.max(1, S / 120);
  for (const z of m.fire) {
    c.fillRect(z.x * k, z.y * k, Math.max(z.w * k, min * 2), Math.max(z.h * k, min * 2));
    c.strokeRect(z.x * k, z.y * k, Math.max(z.w * k, min * 2), Math.max(z.h * k, min * 2));
  }
  // 撤离的门：红色小方块
  const g = Math.max(3, S / 22);
  c.fillStyle = '#d0362e';
  for (const gate of m.gates) c.fillRect(Math.min(S - g, Math.max(0, gate.x * k - g / 2)), Math.min(S - g, Math.max(0, gate.y * k - g / 2)), g, g);
  // 出生点：白边小红点（和守夜缩略图一样）
  c.fillStyle = '#d0362e';
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(1, S / 64);
  c.beginPath();
  c.arc(m.spawn.x * k, m.spawn.y * k, Math.max(2.5, S / 26), 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.strokeStyle = 'rgba(23,19,28,0.55)';
  c.lineWidth = Math.max(2, S / 64);
  c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, S - c.lineWidth, S - c.lineWidth);
}
