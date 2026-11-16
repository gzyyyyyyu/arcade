/**
 * 2.0 法器第一批的规则（DESIGN.md 3.1、3.3）：阵旗、勾魂锁、竹篙、长明灯，阵法套件，10 个搭配的效果。
 * step.ts 只留几处挂钩（fireWeapons 里分派、每拍 armsTick、减速、命中倍数、绳的定身加时、recompute），逻辑都在这里。
 * step.ts 里的几个内部函数（命中、找最近的怪、等效数值、回血、落雷）通过 ArmApi 传进来，免得两个文件互相引用。
 * 数值在 content/weapons.ts 的 ARM_FX。只用四则运算、方向表和 fsqrt；随机走 w.rWeapon。
 */
import { ENEMIES } from '../../content/enemies.ts';
import { CHAR_FX, CURSE_FX } from '../../content/meta.ts';
import { ARM_FX, ARM_FX2, WEAPON_IDS, type WeaponId, type Element, type WeaponStats, type WeaponType } from '../../content/weapons.ts';
import { DIR_N } from '../dirs.ts';
import { Ev } from '../events.ts';
import { dcos, dirIndex, dsin } from '../fmath.ts';
import type { Grid } from '../grid.ts';
import { MAX_ENEMIES, MAX_SHOTS, Shot, type OwnedWeapon, type World } from '../state.ts';
import { ArmEv, ArmFx } from './events.ts';
import { armsSchool, armsStalls, secondFire, secondHitMul, secondTick } from './second.ts';
import { fourthTick } from './fourth.ts';
import { thirdTick } from './third.ts';
import { yinyangSide } from '../skills.ts';

export { ArmEv, ArmFx } from './events.ts';
export { ArmsState } from './state.ts';
export { armsStalls };

/** step.ts 里的几个内部函数 */
export interface ArmApi {
  hitEnemy(w: World, i: number, dmg: number, slot: number, kx: number, ky: number, knock: number, rehit: number, credit?: number): boolean;
  nearest(w: World, g: Grid, x: number, y: number, r: number, skip?: number): number;
  eff(w: World, s: WeaponStats): { dmg: number; cd: number; area: number; amount: number };
  heal(w: World, n: number): void;
  burn(w: World, x: number, y: number, life: number, dmg: number, r: number, slot: number): void;
}
export type Eff = { dmg: number; cd: number; area: number; amount: number };

const CODE = Object.fromEntries(WEAPON_IDS.map((id, i) => [id, i])) as Record<WeaponId, number>;
const tmp = new Int32Array(MAX_ENEMIES);
const tmp2 = new Int32Array(MAX_ENEMIES);
const pulled = new Int32Array(64);

function emit(w: World, t: number, x: number, y: number, a = 0, b = 0, c = 0): void {
  w.ev.push(t as unknown as Ev, x, y, a, b, c);
}
function slotOf(w: World, id: WeaponId): number {
  for (let k = 0; k < w.weapons.length; k++) if (w.weapons[k]!.id === id) return k;
  return -1;
}
const isBoss = (w: World, i: number): boolean => ENEMIES[w.eKind[i]!]!.boss === true;
const isElite = (w: World, i: number): boolean => ENEMIES[w.eKind[i]!]!.elite === true;

// ───────────────────────── 挂钩（step.ts 调） ─────────────────────────

/** recompute 里：令旗给镇类法器加范围，铁链给所有法器加击退 / 拉拽距离 */
export function armsStats(w: World, type: WeaponType, ws: WeaponStats, el: Element): void {
  // 实盘局暂不放 2.0 的新被动（拿不到），这里照算也只是 0
  const qd = w.passives.qiandai ?? 0;
  if (qd > 0 && el === '金') ws.dmg *= 1 + ARM_FX2.dart.qiandaiGold * qd;
  const lh = w.passives.liuhuang ?? 0;
  if (lh > 0 && el === '火') {
    ws.dmg *= 1 + ARM_FX2.cracker.liuhuangFire * lh;
    ws.duration *= 1 + ARM_FX2.cracker.liuhuangDur * lh;
  }
  const qi = w.passives.qizhi ?? 0;
  if (qi > 0 && type === '镇') ws.area *= 1 + ARM_FX.flag.qizhiArea * qi;
  const tie = w.passives.tielian ?? 0;
  if (tie > 0) ws.knock *= 1 + ARM_FX.chain.tielianKnock * tie;
}

/** recompute 里（w.stats 换上之前）：数阵法 / 幽冥 / 聚财单子里凑了几件，写套件标签；阵法 4 件时开始计自动布阵 */
export function armsRecompute(w: World, s: { coinBonus: number; magnet: number; critDmg: number }): void {
  const was = w.arms.tier;
  armsSchool(w, s);
  const A = w.arms;
  if (A.tier >= 4 && was < 4) A.autoAt = w.tick + ARM_FX.flag.autoEvery;
}

/** 绳、阵里定住的拍数再加多少：阵法 2 件 + 令旗 + 阴阳先生在阴（规则 62，只娱乐局：阳打得狠，阴定得久） */
export function armsBindBonus(w: World): number {
  const yin = w.armsCombos && yinyangSide(w) === 'yin' ? CHAR_FX.yinyangBind : 0;
  return (w.arms.tier >= 2 ? ARM_FX.set.two : 0) + ARM_FX.flag.qizhiTicks * (w.passives.qizhi ?? 0) + yin;
}

/** 命中倍数：被勾魂锁拉过的怪易伤；阵法 3 件时被定住、捆住的怪多挨 */
export function armsHitMul(w: World, i: number): number {
  const A = w.arms;
  let m = A.vulnUntil[i]! > w.tick ? A.vulnMul[i]! : 1;
  if (A.tier >= 3 && w.eBind[i]! > w.tick) m *= ARM_FX.set.three;
  return m * secondHitMul(w, i);
}

/** 水痕里的怪慢三成（记 4；铃光环的 1、2 更狠，不盖掉）。在 markSlow 里、怪移动之前调 */
export function armsSlow(w: World, g: Grid): void {
  const P = w.arms.puddles;
  if (P.length === 0) return;
  g.build(w);
  for (const p of P) {
    const n = g.query(w, p.x, p.y, p.r);
    for (let j = 0; j < n; j++) {
      const i = g.out[j]!;
      if (w.eSlow[i] !== 1 && w.eSlow[i] !== 2) w.eSlow[i] = ARM_FX.pole.slow;
    }
  }
}

/** fireWeapons 里分派：四件法器各自的出手 */
export function armsFire(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff, api: ArmApi): void {
  switch (wp.id) {
    case 'flag':
      if (--wp.timer <= 0) wp.timer = castFlag(w, g, k, wp, s, e, api) ? e.cd : 10;
      break;
    case 'chain':
      if (--wp.timer <= 0) wp.timer = castChain(w, g, k, wp, s, e, api) ? e.cd : 10;
      break;
    case 'pole':
      if (--wp.timer <= 0) wp.timer = castPole(w, g, k, wp, s, e, api) ? e.cd : 10;
      break;
    case 'lamp':
      if (--wp.timer <= 0) wp.timer = castLamp(w, k, wp, s, e) ? e.cd : 10;
      if (wp.evolved) smallLamps(w, g, k, s, e, api);
      break;
    case 'dart':
    case 'abacus':
    case 'banner':
    case 'brush':
    case 'cracker':
      secondFire(w, g, k, wp, s, e, api);
      break;
  }
}

/** 每拍在武器和子弹之后：阵、灯、水痕的持续效果，阵法 4 件套，搭配 */
export function armsTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  if (A.zones.length > 0) for (let q = A.zones.length - 1; q >= 0; q--) zoneTick(w, g, A.zones[q]!, q, api);
  if (A.lamps.length > 0) lampsTick(w, g, api);
  if (A.puddles.length > 0) puddlesTick(w, g, api);
  if (A.tier >= 4 && w.tick >= A.autoAt) autoZone(w, g, api);
  if (w.merges.length > 0) combos(w, g, api);
  secondTick(w, g, api);
  if (w.merges.length > 0) {
    thirdTick(w, g, api);
    fourthTick(w, g, api);
  }
}

// ───────────────────────── 阵旗 ─────────────────────────

function addZone(w: World, x: number, y: number, half: number, life: number, kind: number, dmg: number, rehit: number, slot: number, off: number): void {
  const Z = w.arms.zones;
  // 同一件法器最多留 amount × 2 座之外的就把最老的顶掉；总数封顶 8，免得叠成一片
  if (Z.length >= 8) Z.shift();
  Z.push({ x, y, half, life, kind, dmg, rehit, slot, off });
  emit(w, ArmEv.Zone, x, y, kind, half, life);
}

function castFlag(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff, api: ArmApi): boolean {
  if (api.nearest(w, g, w.x, w.y, 360) < 0) return false;
  const life = Math.round(s.duration * w.stats.durMul);
  for (let j = 0; j < e.amount && j < 6; j++) {
    let x = w.x;
    let y = w.y;
    if (j > 0) {
      // 第二座起落在附近一只怪脚下，没有怪就落在面前
      const n = g.query(w, w.x, w.y, 320);
      if (n > 0) {
        const t = g.out[w.rWeapon.int(n)]!;
        x = w.eX[t]!;
        y = w.eY[t]!;
      } else {
        x = w.x + dcos(w.face) * e.area * 1.6;
        y = w.y + dsin(w.face) * e.area * 1.6;
      }
    }
    addZone(w, x, y, e.area, life, wp.evolved ? 1 : 0, e.dmg, s.rehit, k, j * 4);
  }
  emit(w, Ev.Fire, w.x, w.y, CODE.flag);
  return true;
}

/** 阵法 4 件套：每 autoEvery 拍在脚下布一座小阵（不占阵旗的冷却；带了阵旗就按它的伤害，没带按表） */
function autoZone(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  A.autoAt = w.tick + ARM_FX.flag.autoEvery;
  if (api.nearest(w, g, w.x, w.y, 360) < 0) return;
  const kf = slotOf(w, 'flag');
  const dmg = kf >= 0 ? api.eff(w, w.wstats[kf]!).dmg * 0.6 : ARM_FX.flag.autoDmg;
  addZone(w, w.x, w.y, ARM_FX.flag.autoHalf * w.stats.areaMul, Math.round(ARM_FX.flag.autoLife * w.stats.durMul), 2, dmg, 15, kf, 0);
  emit(w, Ev.Fire, w.x, w.y, CODE.flag);
}

function zoneTick(w: World, g: Grid, z: import('./state.ts').Zone, q: number, api: ArmApi): void {
  if (--z.life <= 0) {
    w.arms.zones.splice(q, 1);
    return;
  }
  const F = ARM_FX.flag;
  const extra = z.kind === 1 ? F.band : 0;
  const reach = (z.half + extra) * 1.42;
  const n = g.query(w, z.x, z.y, reach);
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  const hitNow = (w.tick + z.off) % z.rehit === 0;
  const bonus = armsBindBonus(w);
  for (let j = 0; j < n; j++) {
    const i = tmp[j]!;
    if (!w.eAlive[i]) continue;
    const dx = w.eX[i]! - z.x;
    const dy = w.eY[i]! - z.y;
    const ax = dx < 0 ? -dx : dx;
    const ay = dy < 0 ? -dy : dy;
    if (ax > z.half + extra || ay > z.half + extra) continue;
    const inside = ax <= z.half && ay <= z.half;
    if (inside && w.tick >= w.arms.freezeAt[i]! && !isBoss(w, i)) {
      const dur = F.freeze + bonus;
      const t = isElite(w, i) ? dur >> 1 : dur;
      if (w.eBind[i]! < w.tick + t) w.eBind[i] = w.tick + t;
      w.arms.freezeAt[i] = w.tick + F.freezeEvery + t;
      emit(w, ArmEv.Freeze, w.eX[i]!, w.eY[i]!, t);
    }
    if (hitNow) {
      const edge = Math.max(ax, ay);
      const onLine = z.kind === 1 && edge >= z.half - F.band;
      api.hitEnemy(w, i, z.dmg * (onLine ? F.lineMul : 1), -1, dx, dy, 0, 0, z.slot);
    }
  }
}

// ───────────────────────── 勾魂锁 ─────────────────────────

function castChain(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff, api: ArmApi): boolean {
  const C = ARM_FX.chain;
  const t = api.nearest(w, g, w.x, w.y, C.reach);
  if (t < 0) return false;
  const ax = w.eX[t]!;
  const ay = w.eY[t]!;
  const n = g.query(w, ax, ay, e.area);
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  // 离锚点最近的先拉，拉满 amount 只
  let got = 0;
  const want = Math.min(e.amount, pulled.length);
  for (let r = 0; r < want; r++) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      const i = tmp[j]!;
      if (i < 0) continue;
      const dx = w.eX[i]! - ax;
      const dy = w.eY[i]! - ay;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best < 0) break;
    pulled[got++] = tmp[best]!;
    tmp[best] = -1;
  }
  const evo = wp.evolved ? 1 : 0;
  const frac = Math.min(C.maxPull, s.knock / 100);
  const tie = w.passives.tielian ?? 0;
  const vul = (wp.evolved ? C.evoHurt : 0) + C.tielianHurt * tie;
  const vulTicks = wp.evolved ? s.duration : C.hurtTicks;
  emit(w, ArmEv.Chain, ax, ay, evo, e.area, got);
  for (let r = 0; r < got; r++) {
    const i = pulled[r]!;
    if (!isBoss(w, i)) {
      const f = isElite(w, i) ? frac * C.eliteMul : frac;
      const nx = ax + (w.eX[i]! - ax) * (1 - f);
      const ny = ay + (w.eY[i]! - ay) * (1 - f);
      emit(w, ArmEv.Pull, w.eX[i]!, w.eY[i]!, nx, ny, evo);
      w.eX[i] = nx;
      w.eY[i] = ny;
      w.ePX[i] = nx;
      w.ePY[i] = ny;
    }
    if (vul > 0) {
      w.arms.vulnUntil[i] = w.tick + vulTicks;
      w.arms.vulnMul[i] = 1 + vul;
    }
  }
  // 位置变了，格子重建一次，后面的查询才找得到
  g.build(w);
  // 锁魂幡：先记下再打（这一下打死的也算）
  if (w.merges.includes('suohun')) for (let r = 0; r < got; r++) w.arms.souled[pulled[r]!] = 1;
  for (let r = 0; r < got; r++) api.hitEnemy(w, pulled[r]!, e.dmg, k, 0, 0, 0, s.rehit);
  // 雷劫锁魂：被拉到一处的怪里最靠近锚点的几只，头上落一道雷
  if (w.merges.includes('leijie')) {
    const kt = slotOf(w, 'thunder');
    if (kt >= 0) {
      const M = ARM_FX.combo.leijie;
      const dmg = api.eff(w, w.wstats[kt]!).dmg * M.mul;
      for (let r = 0; r < got && r < M.bolts; r++) {
        const i = pulled[r]!;
        if (!w.eAlive[i]) continue;
        emit(w, Ev.Thunder, w.eX[i]!, w.eY[i]!, 0, M.r, 0);
        emit(w, ArmEv.Combo, w.eX[i]!, w.eY[i]!, ArmFx.Leijie, M.r);
        api.hitEnemy(w, i, dmg, -1, 0, 0, 0, 0, kt);
      }
    }
  }
  emit(w, Ev.Fire, w.x, w.y, CODE.chain);
  return got > 0;
}

// ───────────────────────── 竹篙 ─────────────────────────

function addPuddle(w: World, x: number, y: number, r: number, life: number): void {
  const P = w.arms.puddles;
  if (P.length >= ARM_FX.pole.trailMax) P.shift();
  const lit = w.merges.includes('dudeng');
  P.push({ x, y, r, life, lit });
  emit(w, ArmEv.Trail, x, y, r, life, lit ? 1 : 0);
}

function castPole(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff, api: ArmApi): boolean {
  const P = ARM_FX.pole;
  const t = api.nearest(w, g, w.x, w.y, e.area + 40);
  if (t < 0) return false;
  const a0 = dirIndex(w.eX[t]! - w.x, w.eY[t]! - w.y);
  const len = e.area;
  const life = Math.round(s.duration * w.stats.durMul);
  for (let j = 0; j < e.amount && j < 8; j++) {
    const d = a0 + (j * 2 - (e.amount - 1)) * P.fan;
    const ux = dcos(d);
    const uy = dsin(d);
    emit(w, ArmEv.Thrust, w.x, w.y, d & (DIR_N - 1), len, wp.evolved ? 1 : 0);
    const n = g.query(w, w.x + (ux * len) / 2, w.y + (uy * len) / 2, len / 2 + P.half);
    for (let q = 0; q < n; q++) tmp2[q] = g.out[q]!;
    for (let q = 0; q < n; q++) {
      const i = tmp2[q]!;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      const along = dx * ux + dy * uy;
      if (along < 0 || along > len) continue;
      const side = dx * uy - dy * ux;
      if ((side < 0 ? -side : side) > P.half) continue;
      api.hitEnemy(w, i, e.dmg, k, ux, uy, s.knock, s.rehit);
    }
    if (wp.evolved) for (let at = P.trailStep; at <= len; at += P.trailStep) addPuddle(w, w.x + ux * at, w.y + uy * at, P.trailR, life);
  }
  emit(w, Ev.Fire, w.x, w.y, CODE.pole);
  return true;
}

function puddlesTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  const kl = slotOf(w, 'lamp');
  const M = ARM_FX.combo.dudeng;
  for (let q = A.puddles.length - 1; q >= 0; q--) {
    const p = A.puddles[q]!;
    if (--p.life <= 0) {
      A.puddles.splice(q, 1);
      continue;
    }
    // 渡魂灯：亮着灯的水痕每隔几拍烧一下里面的怪（按长明灯的伤害）
    if (p.lit && kl >= 0 && w.tick % M.every === q % M.every) {
      const dmg = api.eff(w, w.wstats[kl]!).dmg * M.mul;
      const n = g.query(w, p.x, p.y, p.r);
      for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
      let hit = 0;
      for (let j = 0; j < n; j++) if (api.hitEnemy(w, tmp[j]!, dmg, -1, 0, 0, 0, 0, kl)) hit++;
      if (hit > 0) emit(w, ArmEv.Combo, p.x, p.y, ArmFx.Dudeng, p.r);
    }
  }
}

// ───────────────────────── 长明灯 ─────────────────────────

function castLamp(w: World, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff): boolean {
  const L = ARM_FX.lamp;
  const A = w.arms;
  let have = 0;
  // 还能亮 12 拍以上的才算数：快灭的灯不挡着点新的，灯和灯之间不留空
  for (const l of A.lamps) if (l.slot === k && l.life > 12) have++;
  const want = wp.evolved ? 1 : e.amount;
  if (have >= want) return false;
  const life = Math.round(s.duration * w.stats.durMul * (1 + L.dengyouDur * (w.passives.dengyou ?? 0)));
  for (let j = have; j < want; j++) {
    const x = j === 0 ? w.x : w.x + dcos(w.face + j * 85) * e.area * 0.8;
    const y = j === 0 ? w.y : w.y + dsin(w.face + j * 85) * e.area * 0.8;
    A.lamps.push({ x, y, r: e.area, life, kind: wp.evolved ? 1 : 0, dmg: e.dmg, rehit: s.rehit, slot: k });
    emit(w, ArmEv.Lamp, x, y, wp.evolved ? 1 : 0, e.area, life);
  }
  emit(w, Ev.Fire, w.x, w.y, CODE.lamp);
  return true;
}

/** 万家灯火：身边一圈小灯跟着主角走，数量 = amount + 等级 / 10；每盏每隔 rehit 拍烧一下 */
function smallLamps(w: World, g: Grid, k: number, s: WeaponStats, e: Eff, api: ArmApi): void {
  const L = ARM_FX.lamp;
  const count = e.amount + Math.floor(w.level / L.evoPerLevel);
  const r = L.smallR * w.stats.areaMul;
  for (let j = 0; j < count; j++) {
    const a = w.tick * 2 + Math.floor((j * DIR_N) / count);
    const x = w.x + dcos(a) * L.orbit;
    const y = w.y + dsin(a) * L.orbit * 0.8;
    emit(w, ArmEv.Lamp, x, y, 2, r, 4);
    if ((w.tick + j * 3) % s.rehit !== 0) continue;
    const n = g.query(w, x, y, r);
    for (let q = 0; q < n; q++) tmp2[q] = g.out[q]!;
    for (let q = 0; q < n; q++) api.hitEnemy(w, tmp2[q]!, e.dmg * L.smallMul, -1, 0, 0, 0, 0, k);
  }
}

function lampsTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  const L = ARM_FX.lamp;
  let inLight = false;
  let evo = false;
  for (let q = A.lamps.length - 1; q >= 0; q--) {
    const l = A.lamps[q]!;
    if (--l.life <= 0) {
      A.lamps.splice(q, 1);
      continue;
    }
    const dx = w.x - l.x;
    const dy = w.y - l.y;
    if (dx * dx + dy * dy <= l.r * l.r) {
      inLight = true;
      if (l.kind === 1) evo = true;
    }
    if ((w.tick + q * 5) % l.rehit !== 0) continue;
    const n = g.query(w, l.x, l.y, l.r);
    for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
    for (let j = 0; j < n; j++) api.hitEnemy(w, tmp[j]!, l.dmg, -1, 0, 0, 0, 0, l.slot);
  }
  if (!inLight || w.hp >= w.stats.hpMax) return;
  // 站在光里每秒回血：满血不攒零头；"枯"咒印减半
  const rate = (evo ? L.healEvo : L.heal) + L.dengyouHeal * (w.passives.dengyou ?? 0);
  A.healAcc += (rate * (w.setup.curses?.includes('noheal') ? CURSE_FX.noheal : 1)) / 30;
  if (A.healAcc >= 1) {
    api.heal(w, 1);
    A.healAcc -= 1;
  }
}

// ───────────────────────── 搭配 ─────────────────────────

function inAnyZone(w: World): boolean {
  for (const z of w.arms.zones) {
    const dx = w.x - z.x;
    const dy = w.y - z.y;
    if ((dx < 0 ? -dx : dx) <= z.half && (dy < 0 ? -dy : dy) <= z.half) return true;
  }
  return false;
}

/** 这一拍有没有某种事件（法器里发的铃响、盾碎），返回第一条的下标，没有 -1 */
function evOf(w: World, type: number, a = -1): number {
  const ev = w.ev;
  for (let q = 0; q < ev.n; q++) if (ev.type[q] === type && (a < 0 || ev.a[q] === a)) return q;
  return -1;
}

function combos(w: World, g: Grid, api: ArmApi): void {
  const has = (id: string): boolean => w.merges.includes(id as never);
  const C = ARM_FX.combo;
  const dmgOf = (id: WeaponId): { k: number; dmg: number } => {
    const k = slotOf(w, id);
    return { k, dmg: k >= 0 ? api.eff(w, w.wstats[k]!).dmg : 0 };
  };

  // 盾碎：鹤翼金身（纸鹤俯冲一圈）、乾坤护阵（光波 + 挡弹幕）
  const burst = has('hejin') || has('qiankun') ? evOf(w, Ev.Shield, 0) : -1;
  if (burst >= 0) {
    if (has('hejin')) {
      const { k, dmg } = dmgOf('crane');
      if (k >= 0) {
        const r = C.hejin.diveR * w.stats.areaMul;
        emit(w, ArmEv.Combo, w.x, w.y, ArmFx.Hejin, r);
        const n = g.query(w, w.x, w.y, r);
        for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
        for (let j = 0; j < n; j++) api.hitEnemy(w, tmp[j]!, dmg * C.hejin.diveMul, -1, 0, 0, 0, 0, k);
      }
    }
    if (has('qiankun')) {
      const { k, dmg } = dmgOf('mirror');
      const r = C.qiankun.r * w.stats.areaMul;
      emit(w, ArmEv.Combo, w.x, w.y, ArmFx.Qiankun, C.qiankun.blockR);
      if (k >= 0) {
        const n = g.query(w, w.x, w.y, r);
        for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
        for (let j = 0; j < n; j++) {
          const i = tmp[j]!;
          api.hitEnemy(w, i, dmg * C.qiankun.mul, -1, w.eX[i]! - w.x, w.eY[i]! - w.y, 26, 0, k);
        }
      }
      const b2 = C.qiankun.blockR * C.qiankun.blockR;
      for (let q = 0; q < MAX_SHOTS; q++) {
        if (!w.sAlive[q] || w.sKind[q] !== Shot.Fireball) continue;
        const dx = w.sX[q]! - w.x;
        const dy = w.sY[q]! - w.y;
        if (dx * dx + dy * dy > b2) continue;
        emit(w, Ev.Block, w.sX[q]!, w.sY[q]!);
        w.sAlive[q] = 0;
        w.sCount--;
      }
    }
  }
  // 鹤翼金身：护盾在时，纸鹤隔一阵替你啄近处一只
  if (has('hejin') && w.shield > 0 && w.tick % C.hejin.peckEvery === 0) {
    const { k, dmg } = dmgOf('crane');
    const t = k >= 0 ? api.nearest(w, g, w.x, w.y, C.hejin.peckReach) : -1;
    if (t >= 0) {
      emit(w, ArmEv.Combo, w.eX[t]!, w.eY[t]!, ArmFx.Hejin, 0);
      api.hitEnemy(w, t, dmg * C.hejin.peckMul, -1, 0, 0, 0, 0, k);
    }
  }
  // 铃响：引魂鹤铃（纸鹤啄铃里最近的怪）、晨钟暮鼓（站在阵里，铃再响一遍）
  if (has('heling') || has('chenzhong')) {
    const q = evOf(w, Ev.Bell);
    if (q >= 0) {
      const r = w.ev.b[q]!;
      if (has('heling')) {
        const { k, dmg } = dmgOf('crane');
        const t = k >= 0 ? api.nearest(w, g, w.x, w.y, r) : -1;
        if (t >= 0) {
          emit(w, ArmEv.Combo, w.eX[t]!, w.eY[t]!, ArmFx.Heling, 0);
          api.hitEnemy(w, t, dmg * C.heling.mul, -1, 0, 0, 0, 0, k);
        }
      }
      if (has('chenzhong') && inAnyZone(w)) {
        const { k, dmg } = dmgOf('bell');
        if (k >= 0) {
          emit(w, Ev.Bell, w.x, w.y, 0, r);
          emit(w, ArmEv.Combo, w.x, w.y, ArmFx.Chenzhong, r);
          const n = g.query(w, w.x, w.y, r);
          for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
          for (let j = 0; j < n; j++) api.hitEnemy(w, tmp[j]!, dmg * C.chenzhong.mul, -1, 0, 0, 0, 0, k);
        }
      }
    }
  }
  // 飞剑在路上：钱剑连城（铜钱串多打一下）、一苇渡江（留水痕）
  if (has('qianjian') && w.tick % C.qianjian.every === 0) {
    const { k, dmg } = dmgOf('coins');
    if (k >= 0) {
      for (let q = 0; q < MAX_SHOTS; q++) {
        if (!w.sAlive[q] || w.sKind[q] !== Shot.Fly || w.sState[q] === 0) continue;
        const n = g.query(w, w.sX[q]!, w.sY[q]!, C.qianjian.r);
        for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
        let hit = 0;
        for (let j = 0; j < n; j++) if (api.hitEnemy(w, tmp[j]!, dmg * C.qianjian.mul, -1, 0, 0, 0, 0, k)) hit++;
        if (hit > 0) emit(w, ArmEv.Combo, w.sX[q]!, w.sY[q]!, ArmFx.Qianjian, C.qianjian.r);
      }
    }
  }
  if (has('yiwei') && w.tick % C.yiwei.every === 0) {
    for (let q = 0; q < MAX_SHOTS; q++) {
      if (!w.sAlive[q] || w.sKind[q] !== Shot.Fly || w.sState[q] === 0) continue;
      addPuddle(w, w.sX[q]!, w.sY[q]!, C.yiwei.r, Math.round(C.yiwei.life * w.stats.durMul));
    }
  }
  // 花灯会：站在灯光里，花瓣追着灯边的怪落下并回血
  if (has('huadeng') && w.tick % C.huadeng.every === 0) {
    for (const l of w.arms.lamps) {
      const dx = w.x - l.x;
      const dy = w.y - l.y;
      if (dx * dx + dy * dy > l.r * l.r) continue;
      const { k, dmg } = dmgOf('petals');
      const t = k >= 0 ? api.nearest(w, g, l.x, l.y, l.r + C.huadeng.reach) : -1;
      if (t >= 0) {
        emit(w, ArmEv.Combo, w.eX[t]!, w.eY[t]!, ArmFx.Huadeng, 0);
        api.hitEnemy(w, t, dmg * C.huadeng.mul, -1, 0, 0, 0, 0, k);
        api.heal(w, C.huadeng.heal);
      }
      break;
    }
  }
  // 两仪阵：方阵里的怪被镜光推向最近的旗线，在旗线上挨打
  if (has('liangyi') && w.tick % C.liangyi.every === 0) {
    const { k, dmg } = dmgOf('mirror');
    for (const z of w.arms.zones) {
      if (z.kind === 2) continue;
      const n = g.query(w, z.x, z.y, z.half * 1.42);
      for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
      let moved = 0;
      for (let j = 0; j < n; j++) {
        const i = tmp[j]!;
        if (!w.eAlive[i] || isBoss(w, i)) continue;
        const dx = w.eX[i]! - z.x;
        const dy = w.eY[i]! - z.y;
        const ax = dx < 0 ? -dx : dx;
        const ay = dy < 0 ? -dy : dy;
        if (ax > z.half || ay > z.half) continue;
        const ex = z.half - ax;
        const ey = z.half - ay;
        if (ex < ey) w.eX[i]! += dx < 0 ? -C.liangyi.push : C.liangyi.push;
        else w.eY[i]! += dy < 0 ? -C.liangyi.push : C.liangyi.push;
        moved++;
        if ((Math.min(ex, ey)) < C.liangyi.band && k >= 0) api.hitEnemy(w, i, dmg * C.liangyi.mul, -1, 0, 0, 0, 0, k);
      }
      if (moved > 0) emit(w, ArmEv.Combo, z.x, z.y, ArmFx.Liangyi, z.half);
    }
  }
}
