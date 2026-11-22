/**
 * 第一批法器里自带每拍逻辑的那几件（寒泉、潮水、葫芦、捆仙绳、金钟罩、纸鹤、纸兵、剑、符、铜钱、飞剑、落雷）怎么出手；按冷却开火的分派在 step.ts 的 fireWeapons。
 * 从 step.ts 搬出来，规则一行没改；第二到四批在同目录的 second/third/fourth。
 * 要用的 step.ts 私有函数由 step.ts 加载时调 bindFirstApi 填进来（step.ts 要 import 本文件，反过来 import 会成环）。
 */


import { ENEMIES } from '../../content/enemies.ts';
import { CHAR_FX } from '../../content/meta.ts';
import { DUAL_FX, GOURD_BURN_FIRES, PAPER_FX, WEAPON_CODE, WEAPONS, type WeaponStats } from '../../content/weapons.ts';
import { DIR_N } from '../dirs.ts';
import { Ev } from '../events.ts';
import { dcos, dirIndex, dsin, fsqrt } from '../fmath.ts';
import type { Grid } from '../grid.ts';
import { paperLifeMul, paperRefund } from '../skills.ts';
import { MAX_ENEMIES, MAX_SHOTS, Shot, type World } from '../state.ts';
import { armsBindBonus } from './index.ts';

export interface FirstApi {
  hitEnemy(w: World, i: number, dmg: number, slot: number, kx: number, ky: number, knock: number, rehit: number, credit?: number): boolean;
  nearest(w: World, g: Grid, x: number, y: number, r: number, skip?: number): number;
  eff(w: World, s: WeaponStats): { dmg: number; cd: number; area: number; amount: number };
  heal(w: World, n: number): void;
  chop(w: World, x: number, y: number, r: number, dmg: number): void;
  push(w: World, p: { x: number; y: number }, r: number): boolean;
  addShot(w: World, kind: Shot, x: number, y: number, vx: number, vy: number, life: number, dmg: number, r: number, state: number, slot: number, idx: number): number;
  killShot(w: World, i: number): void;
  removeShots(w: World, kind: Shot, slot: number): void;
  shieldFire(w: World): void;
}

let api: FirstApi;
export function bindFirstApi(a: FirstApi): void {
  api = a;
}

/** 纸鹤里小纸鹤的编号从这里起（step.ts 数小纸鹤也用） */
export const MINI_CRANE = 1000;
const scratch = new Int32Array(MAX_ENEMIES);
const scratch2 = new Int32Array(MAX_ENEMIES);

/**
 * 寒泉：在主角 360 以内挑几只怪当候选（看得见的精英、首领一定在候选里），数谁身边（泉的半径里）怪最多，泉就冒在它脚下；
 * 冒第二眼时离已经冒的泉太近（一个半径以内）的候选不要，免得几眼泉叠在一处。没怪不冒，10 拍后再看。
 */
const springAt = new Float64Array(16);
export function springs(w: World, g: Grid, k: number, evolved: boolean, s: WeaponStats, e: { dmg: number; area: number; amount: number }): boolean {
  const n = g.query(w, w.x, w.y, 360);
  if (n === 0) return false;
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  const tries = Math.min(n, 8);
  let hard = -1;
  for (let q = 0; q < n && hard < 0; q++) {
    const def = ENEMIES[w.eKind[scratch[q]!]!]!;
    if (def.elite || def.boss) hard = scratch[q]!;
  }
  const life = Math.round(s.duration * w.stats.durMul);
  let made = 0;
  for (let j = 0; j < e.amount && j < 8; j++) {
    let best = -1;
    let most = -1;
    for (let t = 0; t <= tries; t++) {
      if (t === tries && hard < 0) break;
      const c = t === tries ? hard : scratch[w.rWeapon.int(n)]!;
      const cx = w.eX[c]!;
      const cy = w.eY[c]!;
      let near = false;
      for (let p = 0; p < made; p++) {
        const dx = cx - springAt[p * 2]!;
        const dy = cy - springAt[p * 2 + 1]!;
        if (dx * dx + dy * dy < e.area * e.area) near = true;
      }
      if (near) continue;
      // 精英、首领脚下算多 6 只：硬怪站在泉里一直挨冻，水府才打得动它们
      const def = ENEMIES[w.eKind[c]!]!;
      const m = g.query(w, cx, cy, e.area) + (def.elite || def.boss ? 6 : 0);
      if (m > most) {
        most = m;
        best = c;
      }
    }
    if (best < 0) break;
    const x = w.eX[best]!;
    const y = w.eY[best]!;
    springAt[made * 2] = x;
    springAt[made * 2 + 1] = y;
    made++;
    api.addShot(w, Shot.Spring, x, y, 0, 0, life, e.dmg, e.area, evolved ? 1 : 0, k, j);
    w.ev.push(Ev.Spring, x, y, 0, e.area);
  }
  if (made > 0) w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.spring);
  return made > 0;
}

/** 龙王令：朝最近的怪（420 以内）挥出几道浪，多道时摆成扇面（每道错开约 20°） */
export function tides(w: World, g: Grid, k: number, s: WeaponStats, e: { dmg: number; area: number; amount: number }): boolean {
  const t = api.nearest(w, g, w.x, w.y, 420);
  if (t < 0) return false;
  const a = dirIndex(w.eX[t]! - w.x, w.eY[t]! - w.y);
  const life = s.duration;
  for (let j = 0; j < e.amount; j++) {
    const d = a + (j * 2 - (e.amount - 1)) * 7;
    api.addShot(w, Shot.Tide, w.x, w.y - 10, dcos(d) * s.speed, dsin(d) * s.speed, life, e.dmg, e.area, 0, k, j);
  }
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.tide);
  return true;
}

/** 火葫芦：没在喷时找最近的怪定方向；喷的那几拍，扇面里的怪隔 rehit 拍挨一下 */
export function gourdTick(w: World, g: Grid, k: number, wp: { timer: number; phase: number; angle: number; evolved: boolean }, s: WeaponStats, e: { dmg: number; cd: number; area: number; amount: number }): void {
  if (wp.phase > 0) {
    wp.phase--;
    // 火舌跟着最近的怪转（每 6 拍重新瞄一次）：人一直在走，定死方向的话喷一会儿就喷空了
    if (wp.phase % 6 === 0) {
      const t = api.nearest(w, g, w.x, w.y, e.area * 1.2);
      if (t >= 0) wp.angle = dirIndex(w.eX[t]! - w.x, w.eY[t]! - w.y);
    }
    const ux = dcos(wp.angle);
    const uy = dsin(wp.angle);
    // 半宽：基础 ±28°，扇面每宽 1 级多 6°（换算成方向表格数）
    const half = Math.round(((28 + 6 * (e.amount - 1)) * DIR_N) / 360);
    const c = dcos(half);
    const c2 = c * c;
    if (wp.phase % 2 === 0) w.ev.push(Ev.Flame, w.x, w.y - 18, wp.angle, e.area, half);
    api.chop(w, w.x + ux * e.area * 0.55, w.y + uy * e.area * 0.55, e.area * 0.45, e.dmg);
    // 三昧真火：每 6 拍在火舌中段留一摊火
    if (wp.evolved && wp.phase % 6 === 0) {
      const a = wp.angle + w.rWeapon.int(half * 2 + 1) - half;
      const r = e.area * (0.35 + w.rWeapon.next() * 0.45);
      const life = Math.round(90 * w.stats.durMul);
      const bx = w.x + dcos(a) * r;
      const by = w.y + dsin(a) * r;
      api.addShot(w, Shot.Burn, bx, by, 0, 0, life, e.dmg * 0.5, 40, 0, k, 0);
      w.ev.push(Ev.Burn, bx, by, 0, 40, life);
    }
    const n = g.query(w, w.x, w.y, e.area);
    for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
    for (let q = 0; q < n; q++) {
      const i = scratch[q]!;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      const dot = dx * ux + dy * uy;
      if (dot <= 0 || dot * dot < c2 * (dx * dx + dy * dy)) continue;
      api.hitEnemy(w, i, e.dmg, k, ux, uy, s.knock, s.rehit);
    }
    // 带够火法器时（GOURD_BURN_FIRES），火舌把扇面里飞来的冰锥、纸钱、火球都烧掉（火流派没有飞剑和铜钱，靠这个顶远程怪）
    let fires = 0;
    for (const o of w.weapons) if (WEAPONS[o.id].el === '火') fires++;
    if (fires < GOURD_BURN_FIRES) return;
    const r2 = e.area * e.area;
    for (let q = 0; q < MAX_SHOTS; q++) {
      if (!w.sAlive[q] || w.sKind[q] !== Shot.Fireball) continue;
      const dx = w.sX[q]! - w.x;
      const dy = w.sY[q]! + 16 - w.y;
      const d2 = dx * dx + dy * dy;
      const dot = dx * ux + dy * uy;
      if (d2 > r2 || dot <= 0 || dot * dot < c2 * d2) continue;
      w.ev.push(Ev.Block, w.sX[q]!, w.sY[q]!);
      api.killShot(w, q);
    }
    return;
  }
  if (--wp.timer > 0) return;
  const t = api.nearest(w, g, w.x, w.y, e.area * 1.4);
  if (t < 0) {
    wp.timer = 6;
    return;
  }
  wp.angle = dirIndex(w.eX[t]! - w.x, w.eY[t]! - w.y);
  wp.phase = Math.round(s.duration * w.stats.durMul);
  wp.timer = e.cd;
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.gourd);
}

/** 缚妖索：从最近的一只开始，一只接一只往外找最近的没捆的，捆住一串；Boss 捆不住，精英只捆一半时间。没有怪返回 false */
export function rope(w: World, g: Grid, k: number, s: WeaponStats, e: { dmg: number; area: number; amount: number }): boolean {
  let cx = w.x;
  let cy = w.y;
  let reach = 320;
  let got = 0;
  for (let j = 0; j < e.amount; j++) {
    const n = g.query(w, cx, cy, reach);
    let best = -1;
    let bd = Infinity;
    for (let q = 0; q < n; q++) {
      const i = g.out[q]!;
      if (ENEMIES[w.eKind[i]!]!.boss || w.eBind[i]! > w.tick) continue;
      const dx = w.eX[i]! - cx;
      const dy = w.eY[i]! - cy;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) break;
    if (got === 0) w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.rope);
    const elite = ENEMIES[w.eKind[best]!]!.elite;
    const t = Math.round(s.duration * w.stats.durMul) + armsBindBonus(w);
    w.eBind[best] = w.tick + (elite ? t >> 1 : t);
    w.ev.push(Ev.Bind, w.eX[best]!, w.eY[best]!, got, 0, best);
    api.hitEnemy(w, best, e.dmg, k, 0, 0, 0, s.rehit);
    got++;
    cx = w.eX[best]!;
    cy = w.eY[best]!;
    reach = e.area;
  }
  return got > 0;
}

/** 金钟罩：不满就按冷却回一层；碎了的下一拍震开身边 */
export function shieldTick(w: World, g: Grid, k: number, wp: { timer: number }, s: WeaponStats, e: { dmg: number; cd: number; area: number; amount: number }): void {
  w.shieldMax = e.amount;
  if (w.shield > w.shieldMax) w.shield = w.shieldMax;
  if (w.shieldBurst) {
    w.shieldBurst = false;
    w.ev.push(Ev.Shield, w.x, w.y, 0, e.area);
    api.chop(w, w.x, w.y, e.area, e.dmg);
    if (w.merges.includes('fenzhong')) api.shieldFire(w);
    const n = g.query(w, w.x, w.y, e.area);
    for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
    for (let q = 0; q < n; q++) {
      const i = scratch[q]!;
      api.hitEnemy(w, i, e.dmg, k, w.eX[i]! - w.x, w.eY[i]! - w.y, s.knock, s.rehit);
    }
  }
  if (w.shield >= w.shieldMax) {
    wp.timer = e.cd;
    return;
  }
  // 墨斗：回层更快
  const cd = Math.max(4, Math.round(e.cd / w.stats.durMul));
  if (wp.timer > cd) wp.timer = cd;
  if (--wp.timer > 0) return;
  wp.timer = cd;
  // 不坏金身：一回就回满
  w.shield = (w.weapons[k]!.evolved ? w.shieldMax : w.shield + 1);
  w.ev.push(Ev.Shield, w.x, w.y, 1, e.area);
}

/** 纸鹤：常驻盘旋，轮流俯冲到最近的怪那里啄一下（落点一小圈），再飞回来 */
export function craneTick(w: World, g: Grid, k: number, wp: { timer: number; phase: number }, s: WeaponStats, e: { cd: number; amount: number; dmg: number; area: number }): void {
  let have = 0;
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Crane && w.sSlot[i] === k && w.sIdx[i]! < MINI_CRANE) have++;
  for (let j = have; j < e.amount; j++) api.addShot(w, Shot.Crane, w.x, w.y - 60, 0, 0, 0, e.dmg, 26, 0, k, j);
  if (--wp.timer > 0) return;
  const target = api.nearest(w, g, w.x, w.y, e.area);
  if (target < 0) {
    wp.timer = 6;
    return;
  }
  for (let tries = 0; tries < e.amount; tries++) {
    const idx = wp.phase % e.amount;
    wp.phase++;
    for (let i = 0; i < MAX_SHOTS; i++) {
      if (!w.sAlive[i] || w.sKind[i] !== Shot.Crane || w.sSlot[i] !== k || w.sIdx[i] !== idx || w.sState[i] !== 0) continue;
      const dx = w.eX[target]! - w.sX[i]!;
      const dy = w.eY[target]! - w.sY[i]!;
      const d = fsqrt(dx * dx + dy * dy) || 1;
      w.sState[i] = 1;
      w.sVX[i] = (dx / d) * s.speed;
      w.sVY[i] = (dy / d) * s.speed;
      w.sLife[i] = Math.max(1, Math.ceil(d / s.speed));
      w.sDmg[i] = e.dmg;
      w.ev.push(Ev.Fire, w.sX[i]!, w.sY[i]!, WEAPON_CODE.crane);
      wp.timer = Math.max(3, Math.round(e.cd / e.amount));
      return;
    }
  }
  wp.timer = 4;
}

/** 纸兵：不够数就隔 cd 拍在主角身边补一个（剪刀让它活得更久） */
export function paperTick(w: World, k: number, wp: { timer: number; phase: number }, s: WeaponStats, e: { cd: number; amount: number; dmg: number }): void {
  if (--wp.timer > 0) return;
  let have = 0;
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Paper && w.sSlot[i] === k) have++;
  if (have >= e.amount) {
    wp.timer = 6;
    return;
  }
  wp.timer = e.cd;
  const life = Math.round(s.duration * w.stats.durMul * (1 + PAPER_FX.jiandaoLife * (w.passives.jiandao ?? 0)) * paperLifeMul(w));
  const a = (wp.phase++ * 37) & (DIR_N - 1);
  api.addShot(w, Shot.Paper, w.x + dcos(a) * 40, w.y + dsin(a) * 30, 0, 0, life, e.dmg, 20, 0, k, have);
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.zhibing);
}

/**
 * 纸兵这一拍：找 area 内最近的怪走过去，贴上了就停下顶住——每 rehit 拍打一下、把怪往回顶；
 * 贴身时每拍多折 1 拍寿（挡怪是要付代价的）。没有怪就跟在主角身边。寿尽倒下：撒豆成兵炸开、火兵留火、鸣兵震开。
 */
export function movePaper(w: World, g: Grid, i: number, k: number, s: WeaponStats): void {
  const x = w.sX[i]!;
  const y = w.sY[i]!;
  const area = s.area * w.stats.areaMul;
  const t = api.nearest(w, g, x, y, area);
  let touching = false;
  if (t >= 0) {
    const dx = w.eX[t]! - x;
    const dy = w.eY[t]! - y;
    const d = fsqrt(dx * dx + dy * dy) || 1;
    const reach = w.sR[i]! + ENEMIES[w.eKind[t]!]!.r * w.eSize[t]!;
    if (d > reach) {
      w.sX[i] = x + (dx / d) * s.speed;
      w.sY[i] = y + (dy / d) * s.speed;
    } else touching = true;
  } else {
    // 没有怪：回到主角身边（按编号错开站位）
    const a = (w.sIdx[i]! * 41) & (DIR_N - 1);
    const tx = w.x + dcos(a) * 60;
    const ty = w.y + dsin(a) * 40;
    const dx = tx - x;
    const dy = ty - y;
    const d = fsqrt(dx * dx + dy * dy);
    if (d > s.speed) {
      w.sX[i] = x + (dx / d) * s.speed * 1.4;
      w.sY[i] = y + (dy / d) * s.speed * 1.4;
    }
  }
  // 不挂槽位的（k = -1）没有逐怪的再打间隔，改用这只纸兵自己的计时（sState）每 rehit 拍打一下
  if (touching && (k >= 0 || --w.sState[i]! <= 0)) {
    if (k < 0) w.sState[i] = s.rehit;
    const n = g.query(w, w.sX[i]!, w.sY[i]!, w.sR[i]! + 24);
    for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
    for (let q = 0; q < n; q++) {
      const j = scratch[q]!;
      api.hitEnemy(w, j, w.sDmg[i]!, k, w.eX[j]! - w.sX[i]!, w.eY[j]! - w.sY[i]!, s.knock, s.rehit);
    }
  }
  if (touching) {
    w.sLife[i]!--;
    if (k >= 0 && w.merges.includes('huobing') && --w.sDist[i]! <= 0) {
      w.sDist[i] = DUAL_FX.paperFire.every;
      api.addShot(w, Shot.Burn, w.sX[i]!, w.sY[i]!, 0, 0, DUAL_FX.paperFire.life, w.sDmg[i]! * DUAL_FX.paperFire.mul * w.mergePower('huobing'), DUAL_FX.paperFire.r, 0, k, 0);
    }
  }
  if (--w.sLife[i]! > 0) return;
  paperFall(w, g, i, k, s);
  // 纸匠·巧手：倒下时两成概率还一张纸兵的冷却（下一拍就补一个）
  if (k >= 0 && paperRefund(w, i)) w.weapons[k]!.timer = 1;
  api.killShot(w, i);
}

function paperFall(w: World, g: Grid, i: number, k: number, s: WeaponStats): void {
  const x = w.sX[i]!;
  const y = w.sY[i]!;
  const dmg = w.sDmg[i]!;
  const evolved = w.weapons[k]?.evolved ?? false;
  w.ev.push(Ev.Paper, x, y, 0, 0);
  const ring = (r: number, d: number, knock: number, kind: number): void => {
    w.ev.push(Ev.Paper, x, y, kind, r);
    const n = g.query(w, x, y, r);
    for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
    for (let q = 0; q < n; q++) api.hitEnemy(w, scratch[q]!, d, -1, w.eX[scratch[q]!]! - x, w.eY[scratch[q]!]! - y, knock, 0, k);
  };
  if (evolved) ring(PAPER_FX.boomR * w.stats.areaMul, dmg * PAPER_FX.boomMul, s.knock, 1);
  if (w.merges.includes('mingbing')) ring(DUAL_FX.paperBell.r * w.stats.areaMul, dmg * DUAL_FX.paperBell.mul * w.mergePower('mingbing'), DUAL_FX.paperBell.knock, 2);
  if (k >= 0 && w.merges.includes('huobing')) api.addShot(w, Shot.Burn, x, y, 0, 0, DUAL_FX.paperFire.deathLife, dmg * DUAL_FX.paperFire.mul * w.mergePower('huobing'), DUAL_FX.paperFire.deathR, 0, k, 0);
}

/**
 * 桃木剑：第 j 道的方向——0 面前、1 身后、2 面前偏上、3 身后偏下……扇形 ±75°。
 * 进化后（斩妖剑）砍中回血，每一挥最多回 4 点。
 */
export function swordSwing(w: World, g: Grid, k: number, s: WeaponStats, e: { dmg: number; area: number; amount: number }): void {
  const evolved = w.weapons[k]!.evolved;
  let healed = 0;
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.sword);
  for (let j = 0; j < e.amount; j++) {
    const base = j % 2 === 0 ? w.face : w.face + DIR_N / 2;
    const tilt = j < 2 ? 0 : ((j >> 1) % 2 === 1 ? -1 : 1) * 22;
    const a = base + tilt;
    const ux = dcos(a);
    const uy = dsin(a);
    w.ev.push(Ev.Slash, w.x, w.y, a & (DIR_N - 1), e.area, evolved ? 1 : 0);
    api.chop(w, w.x + ux * e.area * 0.55, w.y + uy * e.area * 0.55, e.area * 0.5, e.dmg);
    const n = g.query(w, w.x, w.y, e.area);
    for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
    for (let q = 0; q < n; q++) {
      const i = scratch[q]!;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      const dot = dx * ux + dy * uy;
      // cos 75° ≈ 0.26：dot ≥ 0.26 × |d|，两边平方免得开方
      if (dot < 0 || dot * dot < 0.0676 * (dx * dx + dy * dy)) continue;
      if (api.hitEnemy(w, i, e.dmg, k, ux, uy, s.knock, s.rehit) && evolved && healed < 4) {
        api.heal(w, 1);
        healed++;
      }
    }
  }
  // 诛邪剑阵：挥剑时待命的飞剑一起射出去
  if (w.merges.includes('zhuxie')) {
    const kf = w.weapons.findIndex((o) => o.id === 'flysword');
    const t = kf >= 0 ? api.nearest(w, g, w.x, w.y, 420) : -1;
    if (t >= 0) launchAllFly(w, kf, w.wstats[kf]!, api.eff(w, w.wstats[kf]!).dmg * w.mergePower('zhuxie'), w.eX[t]!, w.eY[t]! - 20);
  }
}

export function fireTalismans(w: World, g: Grid, k: number, s: WeaponStats, e: { dmg: number; area: number; amount: number }): void {
  // 依次瞄最近的几只（不重复），没有怪就朝面前飞
  const n = g.query(w, w.x, w.y, 520);
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  let taken = 0;
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.talisman);
  // 符师：每第 4 次出符多发一张
  const amount = e.amount + (w.setup.character === 'fushi' && ++w.weapons[k]!.phase % CHAR_FX.fushiEvery === 0 ? 1 : 0);
  for (let j = 0; j < amount; j++) {
    let best = -1;
    let bd = Infinity;
    for (let q = taken; q < n; q++) {
      const i = scratch[q]!;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    let vx = dcos(w.face + j * 9);
    let vy = dsin(w.face + j * 9);
    if (best >= 0) {
      const i = scratch[best]!;
      scratch[best] = scratch[taken]!;
      scratch[taken++] = i;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - (w.y - 24);
      const d = fsqrt(dx * dx + dy * dy) || 1;
      vx = dx / d;
      vy = dy / d;
    }
    api.addShot(w, Shot.Talisman, w.x, w.y - 24, vx * s.speed, vy * s.speed, s.duration, e.dmg, e.area, 1, k, j);
  }
}

export function coinsTick(w: World, k: number, wp: { timer: number; phase: number; angle: number; evolved: boolean }, s: WeaponStats, e: { area: number; amount: number; dmg: number }): void {
  if (wp.evolved) {
    // 金钱阵：两圈铜钱常驻，不歇
    wp.angle = (wp.angle + s.speed) & (DIR_N - 1);
    let have = 0;
    for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Coin && w.sSlot[i] === k) have++;
    for (let j = have; j < e.amount; j++) api.addShot(w, Shot.Coin, w.x, w.y, 0, 0, 1 << 30, e.dmg, 12, 0, k, j);
    return;
  }
  // 墨斗：转得更久
  const dur = Math.round(s.duration * w.stats.durMul);
  if (wp.phase > 0) {
    wp.phase--;
    wp.angle = (wp.angle + s.speed) & (DIR_N - 1);
    if (wp.phase === 0) {
      api.removeShots(w, Shot.Coin, k);
      wp.timer = Math.max(4, Math.round((s.cd - s.duration) * w.stats.cdMul));
    }
    return;
  }
  if (--wp.timer > 0) return;
  wp.phase = dur;
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.coins);
  for (let j = 0; j < e.amount; j++) api.addShot(w, Shot.Coin, w.x, w.y, 0, 0, dur + 1, e.dmg, 12, 0, k, j);
}

/** 把这一格所有待命的飞剑一起射向 (tx, ty)，排成扇面（万剑归宗、诛邪剑阵） */
function launchAllFly(w: World, k: number, s: WeaponStats, dmg: number, tx: number, ty: number): number {
  let n = 0;
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Fly && w.sSlot[i] === k && w.sState[i] === 0) n++;
  if (n === 0) return 0;
  const base = dirIndex(tx - w.x, ty - w.y);
  let j = 0;
  for (let i = 0; i < MAX_SHOTS; i++) {
    if (!w.sAlive[i] || w.sKind[i] !== Shot.Fly || w.sSlot[i] !== k || w.sState[i] !== 0) continue;
    // 扇面：每把错开 6 格（约 8°）
    const a = base + Math.round((j - (n - 1) / 2) * 6);
    w.sState[i] = 1;
    w.sVX[i] = dcos(a) * s.speed;
    w.sVY[i] = dsin(a) * s.speed;
    w.sDist[i] = 0;
    w.sDmg[i] = dmg;
    j++;
  }
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.flysword);
  return n;
}

export function flyTick(w: World, g: Grid, k: number, wp: { timer: number; phase: number; evolved: boolean }, s: WeaponStats, e: { cd: number; amount: number; dmg: number }): void {
  // 飞剑常驻：数量不够就补上（升级、令牌加数量时）
  let have = 0;
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Fly && w.sSlot[i] === k) have++;
  for (let j = have; j < e.amount; j++) api.addShot(w, Shot.Fly, w.x, w.y, 0, 0, 1 << 30, e.dmg, 14, 0, k, j);
  if (--wp.timer > 0) return;
  // 轮到下一把待命的飞出去
  const target = api.nearest(w, g, w.x, w.y, s.duration * 0.9);
  if (target < 0) {
    wp.timer = 6;
    return;
  }
  if (wp.evolved) {
    // 万剑归宗：一次全射出去
    wp.timer = launchAllFly(w, k, s, e.dmg, w.eX[target]!, w.eY[target]! - 20) > 0 ? e.cd : 4;
    return;
  }
  for (let tries = 0; tries < e.amount; tries++) {
    const idx = wp.phase % e.amount;
    wp.phase++;
    for (let i = 0; i < MAX_SHOTS; i++) {
      if (!w.sAlive[i] || w.sKind[i] !== Shot.Fly || w.sSlot[i] !== k || w.sIdx[i] !== idx || w.sState[i] !== 0) continue;
      const dx = w.eX[target]! - w.sX[i]!;
      const dy = w.eY[target]! - 20 - w.sY[i]!;
      const d = fsqrt(dx * dx + dy * dy) || 1;
      w.sState[i] = 1;
      w.sVX[i] = (dx / d) * s.speed;
      w.sVY[i] = (dy / d) * s.speed;
      w.sDist[i] = 0;
      w.sDmg[i] = e.dmg;
      w.ev.push(Ev.Fire, w.sX[i]!, w.sY[i]!, WEAPON_CODE.flysword);
      wp.timer = Math.max(3, Math.round((Math.max(4, Math.round(s.cd * w.stats.cdMul)) / e.amount) * 1.2));
      return;
    }
  }
  wp.timer = 4;
}

export function thunder(w: World, g: Grid, k: number, s: WeaponStats, e: { dmg: number; area: number; amount: number }): void {
  const n = g.query(w, w.x, w.y, s.duration);
  if (n === 0) return;
  for (let q = 0; q < n; q++) scratch[q] = g.out[q]!;
  w.ev.push(Ev.Fire, w.x, w.y, WEAPON_CODE.thunder);
  // 五雷正法：每道雷劈完再连着往最近的没劈过的跳，一共五下
  const chain = w.weapons[k]!.evolved ? 5 : 1;
  // 雷雨：这一阵的前几道雷先劈泉里的怪（每眼泉一道）
  let pools = 0;
  if (w.merges.includes('leiyu')) {
    for (let p = 0; p < MAX_SHOTS && pools < poolList.length; p++) if (w.sAlive[p] && w.sKind[p] === Shot.Spring) poolList[pools++] = p;
  }
  for (let j = 0; j < e.amount; j++) {
    let t = scratch[w.rWeapon.int(n)]!;
    if (j < pools) {
      const p = poolList[j]!;
      const inPool = api.nearest(w, g, w.sX[p]!, w.sY[p]!, w.sR[p]!);
      if (inPool >= 0) t = inPool;
    }
    let px = w.eX[t]!;
    let py = w.eY[t]! - 400;
    for (let c = 0; c < chain && t >= 0; c++) {
      const tx = w.eX[t]!;
      const ty = w.eY[t]!;
      w.ev.push(Ev.Thunder, tx, ty, c, e.area, c === 0 ? 0 : 1);
      if (c > 0) w.ev.push(Ev.Chain, px, py, 0, tx, ty);
      strike(w, g, k, tx, ty, e.dmg, e.area, s.knock);
      if (c === 0 && pools > 0) conduct(w, g, k, tx, ty, e.dmg, pools);
      px = tx;
      py = ty;
      t = c + 1 < chain ? nearestUnhit(w, g, tx, ty, 220, k) : -1;
    }
  }
}

/** 雷雨：这一阵雷要先劈的泉（子弹下标） */
const poolList = new Int32Array(8);

/** 雷雨：从天上劈下的雷落在哪眼泉里，整眼泉的怪都挨一截（只传一眼） */
function conduct(w: World, g: Grid, k: number, x: number, y: number, dmg: number, pools: number): void {
  for (let q = 0; q < pools; q++) {
    const p = poolList[q]!;
    if (!w.sAlive[p] || w.sKind[p] !== Shot.Spring) continue;
    const cx = w.sX[p]!;
    const cy = w.sY[p]!;
    const r = w.sR[p]!;
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > r * r) continue;
    w.ev.push(Ev.Spring, cx, cy, 2, r);
    const m = g.query(w, cx, cy, r);
    for (let j = 0; j < m; j++) scratch2[j] = g.out[j]!;
    for (let j = 0; j < m; j++) api.hitEnemy(w, scratch2[j]!, dmg * DUAL_FX.rain.mul * w.mergePower('leiyu'), -1, 0, 0, 0, 0, k);
    return;
  }
}

/** 一道雷落在 (x, y)：一圈都挨打（雷符、雷火符箓） */
export function strike(w: World, g: Grid, k: number, x: number, y: number, dmg: number, area: number, knock: number): void {
  api.chop(w, x, y, area, dmg);
  const m = g.query(w, x, y, area);
  const local = scratch2;
  for (let q = 0; q < m; q++) local[q] = g.out[q]!;
  for (let q = 0; q < m; q++) {
    const i = local[q]!;
    api.hitEnemy(w, i, dmg, -1, w.eX[i]! - x, w.eY[i]! - y, knock, 0, k);
  }
}

/** 离 (x, y) 最近、这一拍还没被这件法器打过的怪（连锁雷用） */
function nearestUnhit(w: World, g: Grid, x: number, y: number, r: number, k: number): number {
  const n = g.query(w, x, y, r);
  let best = -1;
  let bd = Infinity;
  for (let j = 0; j < n; j++) {
    const i = g.out[j]!;
    if (w.eLastHit[i] === w.tick && w.eLastBy[i] === k) continue;
    const dx = w.eX[i]! - x;
    const dy = w.eY[i]! - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
