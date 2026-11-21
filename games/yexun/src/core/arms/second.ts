/**
 * 2.0 法器第二批的规则（DESIGN.md 3.1、3.3）：铜钱镖、算盘、招魂幡、判官笔、鞭炮，幽冥、聚财套件，五个专属搭配。
 * 和第一批（./index.ts）同一个做法：step.ts 不动逻辑，只在 index.ts 的挂钩里分派到这里。
 * 数值在 content/weapons.ts 的 ARM_FX2；随机走 w.rWeapon；只用四则运算、方向表和 fsqrt。
 */
import { ENEMIES } from '../../content/enemies.ts';
import { SCHOOLS } from '../../content/guide.ts';
import { ARM_FX2, COMBO55, WEAPON_IDS, type WeaponId, type WeaponStats } from '../../content/weapons.ts';
import { Ev } from '../events.ts';
import { dcos, dirIndex, dsin, fsqrt } from '../fmath.ts';
import type { Grid } from '../grid.ts';
import { MAX_ENEMIES, type OwnedWeapon, type World } from '../state.ts';
import { ArmEv, ArmFx } from './events.ts';
import type { ArmApi, Eff } from './index.ts';
import type { Banner, Cracker } from './state.ts';

const CODE = Object.fromEntries(WEAPON_IDS.map((id, i) => [id, i])) as Record<WeaponId, number>;
const tmp = new Int32Array(MAX_ENEMIES);
const picks = new Int32Array(16);

function emit(w: World, t: number, x: number, y: number, a = 0, b = 0, c = 0): void {
  w.ev.push(t as unknown as Ev, x, y, a, b, c);
}
function slotOf(w: World, id: WeaponId): number {
  for (let k = 0; k < w.weapons.length; k++) if (w.weapons[k]!.id === id) return k;
  return -1;
}
const isBoss = (w: World, i: number): boolean => ENEMIES[w.eKind[i]!]!.boss === true;
const isElite = (w: World, i: number): boolean => ENEMIES[w.eKind[i]!]!.elite === true;
const hasMerge = (w: World, id: string): boolean => w.merges.includes(id as never);
function dmgOf(w: World, api: ArmApi, id: WeaponId): { k: number; dmg: number } {
  const k = slotOf(w, id);
  return { k, dmg: k >= 0 ? api.eff(w, w.wstats[k]!).dmg : 0 };
}
/** 这一拍有没有某种事件，返回第一条的下标，没有 -1 */
function evOf(w: World, type: number, a = -1): number {
  const ev = w.ev;
  for (let q = 0; q < ev.n; q++) if (ev.type[q] === type && (a < 0 || ev.a[q] === a)) return q;
  return -1;
}

// ───────────────────────── 套件和被动 ─────────────────────────

/** recompute 里（w.stats 换上之前）：幽冥、聚财套件档，钱袋、白幡、朱笔，套件标签 */
export function armsSchool(w: World, s: { coinBonus: number; magnet: number; critDmg: number }): void {
  const A = w.arms;
  const tierOf = (ids: readonly WeaponId[]): number => {
    let n = 0;
    for (const o of w.weapons) if (ids.includes(o.id)) n++;
    return n >= 4 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 0;
  };
  const was = [A.tier, A.ghostTier, A.wealthTier];
  A.tier = tierOf(SCHOOLS.array.weapons);
  A.ghostTier = tierOf(SCHOOLS.ghost.weapons);
  A.wealthTier = tierOf(SCHOOLS.wealth.weapons);
  if (A.ghostTier >= 4 && was[1]! < 4) A.chaiNext = w.kills + ARM_FX2.school.ghost.chaiEvery;
  if (A.wealthTier >= 4 && was[2]! < 4) A.rainAt = w.tick + ARM_FX2.school.wealth.rainEvery;
  for (const [tier, name] of [[A.tier, SCHOOLS.array.name], [A.ghostTier, SCHOOLS.ghost.name], [A.wealthTier, SCHOOLS.wealth.name]] as const) {
    if (tier > 0) w.sets.push(`${name}·${tier}`);
  }
  const p = (id: 'qiandai' | 'baifan' | 'zhubi'): number => w.passives[id] ?? 0;
  s.coinBonus += ARM_FX2.dart.qiandaiCoin * p('qiandai') + (A.wealthTier >= 2 ? ARM_FX2.school.wealth.two : 0);
  s.magnet *= 1 + ARM_FX2.banner.baifanMagnet * p('baifan');
  s.critDmg += ARM_FX2.brush.zhubiCrit * p('zhubi');
}

/** 聚财 4 件：夜市多开一个摊 */
export function armsStalls(w: World): number {
  return w.arms.wealthTier >= 4 ? ARM_FX2.school.wealth.stall : 0;
}

/** 命中倍数的第二批部分：朱笔打精英首领、聚财 3 件按局内铜钱加伤 */
export function secondHitMul(w: World, i: number): number {
  let m = 1;
  const zb = w.passives.zhubi ?? 0;
  if (zb > 0 && (isElite(w, i) || isBoss(w, i))) m *= 1 + ARM_FX2.brush.zhubiElite * zb;
  if (w.arms.wealthTier >= 3) {
    const W = ARM_FX2.school.wealth;
    const bonus = Math.floor(w.coins / W.per) * W.three;
    m *= 1 + (Math.min(bonus, W.threeMax));
  }
  return m;
}

/** 幽冥 2 件的变冤魂概率加成；白幡每级 +baifan；幡本身的概率 */
function ghostChance(w: World, evo: number): number {
  const G = ARM_FX2.banner;
  return (evo ? G.evoChance : G.chance) + G.baifan * (w.passives.baifan ?? 0) + (w.arms.ghostTier >= 2 ? ARM_FX2.school.ghost.two : 0);
}

// ───────────────────────── 出手 ─────────────────────────

export function secondFire(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff, api: ArmApi): void {
  switch (wp.id) {
    case 'dart':
      if (--wp.timer <= 0) wp.timer = castDart(w, g, k, wp, s, e) ? e.cd : 10;
      break;
    case 'abacus':
      if (w.tick % s.rehit === 0) accrue(w, g, wp, e);
      if (--wp.timer <= 0) wp.timer = settle(w, g, k, wp, e, api) ? e.cd : 10;
      break;
    case 'banner':
      if (--wp.timer <= 0) wp.timer = castBanner(w, g, k, wp, s, e) ? e.cd : 10;
      break;
    case 'brush':
      if (--wp.timer <= 0) wp.timer = castBrush(w, g, k, wp, e) ? e.cd : 10;
      break;
    case 'cracker':
      if (--wp.timer <= 0) wp.timer = castCracker(w, g, k, wp, s, e, api) ? e.cd : 10;
      break;
  }
}

/** 每拍在武器和子弹之后：镖、冤魂、点名、爆竹的持续效果，套件，搭配 */
export function secondTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  if (A.banners.length > 0) bannersTick(w, api);
  if (A.darts.length > 0) dartsTick(w, g, api);
  if (A.brushJobs.length > 0) brushTick(w, api);
  if (A.crackers.length > 0) crackersTick(w, g, api);
  if (A.banners.length > 0 || A.marked.length > 0) killsTick(w, g, api);
  if (A.ghosts.length > 0) ghostsTick(w, g, api);
  if (A.ghostTier >= 4 && w.kills >= A.chaiNext) chai(w, api);
  if (A.wealthTier >= 4 && w.tick >= A.rainAt) rain(w, g, api);
  if (w.merges.length > 0) secondCombos(w, g, api);
}

// ───────────────────────── 铜钱镖 ─────────────────────────

function castDart(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff): boolean {
  const D = ARM_FX2.dart;
  const n = g.query(w, w.x, w.y, s.area * w.stats.areaMul);
  if (n === 0) return false;
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  let got = 0;
  const want = Math.min(e.amount, picks.length);
  for (let r = 0; r < want; r++) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      const i = tmp[j]!;
      if (i < 0) continue;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    if (best < 0) break;
    picks[got++] = tmp[best]!;
    tmp[best] = -1;
  }
  const hops = D.hops + (wp.evolved ? D.evoHops : 0);
  for (let r = 0; r < e.amount && w.arms.darts.length < 24; r++) {
    w.arms.darts.push({ x: w.x, y: w.y, tgt: picks[r % got]!, last: -1, phase: 0, trip: 1, hops, hopsMax: hops, dmg: e.dmg, speed: s.speed, evo: wp.evolved ? 1 : 0, slot: k });
  }
  emit(w, ArmEv.Dart, w.x, w.y, wp.evolved ? 1 : 0, 9, 0);
  emit(w, Ev.Fire, w.x, w.y, CODE.dart);
  return true;
}

export function spawnDart(w: World, x: number, y: number, tgt: number, dmg: number, slot: number, evo: number): void {
  const D = ARM_FX2.dart;
  if (w.arms.darts.length >= 24) return;
  const hops = D.hops + (evo ? D.evoHops : 0);
  w.arms.darts.push({ x, y, tgt, last: -1, phase: 0, trip: 1, hops, hopsMax: hops, dmg, speed: 14, evo, slot });
}

function dartsTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  const D = ARM_FX2.dart;
  for (let q = A.darts.length - 1; q >= 0; q--) {
    const d = A.darts[q]!;
    if (d.phase === 0 && (d.tgt < 0 || !w.eAlive[d.tgt])) {
      d.tgt = api.nearest(w, g, d.x, d.y, 230, d.last);
      if (d.tgt < 0) d.phase = 1;
    }
    const tx = d.phase === 1 ? w.x : w.eX[d.tgt]!;
    const ty = d.phase === 1 ? w.y : w.eY[d.tgt]!;
    const dx = tx - d.x;
    const dy = ty - d.y;
    const dist = fsqrt(dx * dx + dy * dy);
    if (dist <= d.speed + (d.phase === 1 ? 14 : D.hit)) {
      if (d.phase === 1) {
        if (d.trip >= 2) {
          emit(w, ArmEv.Dart, w.x, w.y, d.evo, 8, 0);
          A.darts.splice(q, 1);
          continue;
        }
        d.trip = 2;
        d.phase = 0;
        d.hops = d.hopsMax;
        d.tgt = -1;
        d.last = -1;
      } else {
        api.hitEnemy(w, d.tgt, d.dmg, -1, dx, dy, 4, 0, d.slot);
        emit(w, ArmEv.Dart, tx, ty, d.evo, 7, d.hopsMax - d.hops);
        d.last = d.tgt;
        d.x = tx;
        d.y = ty;
        d.tgt = -1;
        if (--d.hops <= 0) d.phase = 1;
      }
    } else {
      d.x += (dx / dist) * d.speed;
      d.y += (dy / dist) * d.speed;
    }
    emit(w, ArmEv.Dart, d.x, d.y, d.evo, d.phase, d.trip);
  }
}

// ───────────────────────── 算盘 ─────────────────────────

function accrue(w: World, g: Grid, wp: OwnedWeapon, e: Eff): void {
  const B = ARM_FX2.abacus;
  const n = g.query(w, w.x, w.y, e.area);
  let shown = 0;
  for (let j = 0; j < n; j++) {
    const i = g.out[j]!;
    const add = 1 + (wp.evolved && isElite(w, i) ? B.eliteBeads : 0);
    const v = w.arms.beads[i]! + add;
    w.arms.beads[i] = Math.min(v, B.cap);
    if (shown < 14 && j % 2 === 0) {
      emit(w, ArmEv.Abacus, w.eX[i]!, w.eY[i]!, 0, w.arms.beads[i]!, 0);
      shown++;
    }
  }
}

function settle(w: World, g: Grid, k: number, wp: OwnedWeapon, e: Eff, api: ArmApi): boolean {
  const B = ARM_FX2.abacus;
  const n = g.query(w, w.x, w.y, e.area);
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  let count = 0;
  let top = -1;
  let topBeads = 0;
  for (let j = 0; j < n; j++) {
    const i = tmp[j]!;
    const b = w.arms.beads[i]!;
    if (b === 0 || !w.eAlive[i]) continue;
    if (b > topBeads) {
      topBeads = b;
      top = i;
    }
    api.hitEnemy(w, i, e.dmg * (1 + B.perBead * b), k, w.eX[i]! - w.x, w.eY[i]! - w.y, 0, 0);
    w.arms.beads[i] = wp.evolved ? Math.floor(b * B.keep) : 0;
    count++;
  }
  if (count === 0) return false;
  emit(w, ArmEv.Abacus, w.x, w.y, 1, e.area, count);
  emit(w, Ev.Fire, w.x, w.y, CODE.abacus);
  // 财源滚滚：每结算一次，从层数最多的那只怪身上弹出一枚铜钱镖
  if (hasMerge(w, 'caiyuan') && top >= 0 && w.eAlive[top]) {
    const { k: kd, dmg } = dmgOf(w, api, 'dart');
    if (kd >= 0) {
      const t = api.nearest(w, g, w.eX[top]!, w.eY[top]!, 260, top);
      spawnDart(w, w.eX[top]!, w.eY[top]!, t, dmg * ARM_FX2.combo.caiyuan.mul * w.mergePower('caiyuan'), kd, w.weapons[kd]!.evolved ? 1 : 0);
      emit(w, ArmEv.Combo, w.eX[top]!, w.eY[top]!, ArmFx.Caiyuan, 0);
    }
  }
  return true;
}

// ───────────────────────── 招魂幡 ─────────────────────────

function castBanner(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff): boolean {
  const A = w.arms;
  let have = 0;
  for (const b of A.banners) if (b.slot === k && b.life > 30) have++;
  if (have >= e.amount) return false;
  // 幡立在主角和最近的怪之间（离主角 110 左右）：法器大多在主角身边杀怪，死在幡里的才多
  const n = g.query(w, w.x, w.y, 300);
  if (n === 0) return false;
  const t = g.out[w.rWeapon.int(n)]!;
  const d = dirIndex(w.eX[t]! - w.x, w.eY[t]! - w.y);
  const bx = w.x + dcos(d) * ARM_FX2.banner.reach;
  const by = w.y + dsin(d) * ARM_FX2.banner.reach;
  const life = Math.round(s.duration * w.stats.durMul);
  const b: Banner = { x: bx, y: by, r: e.area, life, evo: wp.evolved ? 1 : 0, slot: k };
  A.banners.push(b);
  emit(w, ArmEv.Banner, b.x, b.y, b.evo, b.r, life);
  emit(w, Ev.Fire, w.x, w.y, CODE.banner);
  return true;
}

function bannersTick(w: World, api: ArmApi): void {
  const A = w.arms;
  // 幡下自己招魂：没有击杀时幡也隔几秒招一个冤魂，让幽冥不靠镇魂铃起手也能打；
  // 带了镇魂铃（本来就强的那条）隔得很久，不再加。按幡的剩余寿命对齐拍数，不另记状态
  const every = slotOf(w, 'bell') >= 0 ? COMBO55.banner.bellEvery : COMBO55.banner.every;
  for (let q = A.banners.length - 1; q >= 0; q--) {
    const b = A.banners[q]!;
    if (b.life % every === 0) spawnGhost(w, api, b.x, b.y, b.slot, b.evo, b.x, b.y);
    if (--b.life <= 0) A.banners.splice(q, 1);
  }
}

function ghostCap(w: World): number {
  return ARM_FX2.banner.cap + (w.arms.ghostTier >= 3 ? ARM_FX2.school.ghost.capPlus : 0);
}

function spawnGhost(w: World, api: ArmApi, x: number, y: number, slot: number, evo: number, hx: number, hy: number): void {
  const A = w.arms;
  let n = 0;
  for (const gh of A.ghosts) if (gh.kind === 0) n++;
  if (n >= ghostCap(w)) return;
  const st = w.wstats[slot]!;
  const dmg = api.eff(w, st).dmg * (A.ghostTier >= 3 ? 1 + ARM_FX2.school.ghost.three : 1);
  A.ghosts.push({ x, y, kind: 0, life: ARM_FX2.banner.life, dmg, speed: st.speed, evo, ret: 0, hx, hy, slot });
  emit(w, ArmEv.Ghost, x, y, 0, 0, evo);
}

/** 这一拍死的怪：锁魂幡记下的必定变冤魂，死在幡里的按概率变冤魂；贴了符的爆成铜钱 */
function killsTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  const ev = w.ev;
  const ks = A.banners.length > 0 ? slotOf(w, 'banner') : -1;
  for (let q = 0; q < ev.n; q++) {
    if (ev.type[q] !== Ev.Kill) continue;
    const x = ev.x[q]!;
    const y = ev.y[q]!;
    const slot = ev.c[q]!;
    // 锁魂幡：被锁拉过的怪死了必定变冤魂（不看在不在幡下；冤魂挂在招魂幡上）
    let souled = false;
    if (slot >= 0 && slot < MAX_ENEMIES && A.souled[slot]) {
      A.souled[slot] = 0;
      const kb = slotOf(w, 'banner');
      if (kb >= 0) {
        souled = true;
        emit(w, ArmEv.Combo, x, y, ArmFx.Suohun, 0);
        spawnGhost(w, api, x, y, kb, w.weapons[kb]!.evolved ? 1 : 0, w.x, w.y);
      }
    }
    if (ks >= 0 && !souled) {
      for (const b of A.banners) {
        const dx = x - b.x;
        const dy = y - b.y;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        if (w.rWeapon.next() < ghostChance(w, b.evo)) spawnGhost(w, api, x, y, ks, b.evo, b.x, b.y);
        break;
      }
    }
    if (slot >= 0 && slot < MAX_ENEMIES && A.marked[slot]) {
      A.marked[slot] = 0;
      maibuBurst(w, g, api, x, y);
    }
  }
}

function ghostsTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  const S = ARM_FX2.school.ghost;
  for (let q = A.ghosts.length - 1; q >= 0; q--) {
    const gh = A.ghosts[q]!;
    if (--gh.life <= 0) {
      A.ghosts.splice(q, 1);
      continue;
    }
    if (gh.kind === 1) {
      // 鬼差：追着最近的怪走，沿路扫一排
      const t = api.nearest(w, g, gh.x, gh.y, 520);
      if (t >= 0) {
        const dx = w.eX[t]! - gh.x;
        const dy = w.eY[t]! - gh.y;
        const d = fsqrt(dx * dx + dy * dy) + 0.01;
        gh.x += (dx / d) * gh.speed;
        gh.y += (dy / d) * gh.speed;
      }
      if (gh.life % 5 === 0) {
        const n = g.query(w, gh.x, gh.y, S.chaiR);
        for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
        for (let j = 0; j < n; j++) api.hitEnemy(w, tmp[j]!, gh.dmg, -1, w.eX[tmp[j]!]! - gh.x, w.eY[tmp[j]!]! - gh.y, 16, 0, gh.slot);
      }
      emit(w, ArmEv.Ghost, gh.x, gh.y, 1, 1, 0);
      continue;
    }
    let tx: number;
    let ty: number;
    let t = -1;
    if (gh.ret === 1) {
      tx = gh.hx;
      ty = gh.hy;
    } else {
      t = api.nearest(w, g, gh.x, gh.y, 420);
      tx = t >= 0 ? w.eX[t]! : gh.hx;
      ty = t >= 0 ? w.eY[t]! : gh.hy;
    }
    const dx = tx - gh.x;
    const dy = ty - gh.y;
    const dist = fsqrt(dx * dx + dy * dy);
    if (gh.ret === 1 && dist <= gh.speed + 16) {
      gh.ret = 2;
      gh.life = ARM_FX2.banner.life;
    } else if (gh.ret !== 1 && t >= 0 && dist <= gh.speed + ARM_FX2.banner.hit) {
      api.hitEnemy(w, t, gh.dmg, -1, dx, dy, 0, 0, gh.slot);
      // 冤魂撞上去是一团阴气，旁边的怪也挨一下
      const nb = g.query(w, tx, ty, ARM_FX2.banner.aoe);
      for (let j = 0; j < nb; j++) tmp[j] = g.out[j]!;
      for (let j = 0; j < nb; j++) if (tmp[j] !== t) api.hitEnemy(w, tmp[j]!, gh.dmg * 0.8, -1, 0, 0, 0, 0, gh.slot);
      emit(w, ArmEv.Ghost, tx, ty, 2, 0, gh.evo);
      if (gh.evo && gh.ret === 0) gh.ret = 1;
      else {
        A.ghosts.splice(q, 1);
        continue;
      }
    } else if (dist > 1) {
      // 没有目标时慢慢漂回幡旁
      const sp = gh.ret !== 1 && t < 0 ? gh.speed * 0.4 : gh.speed;
      gh.x += (dx / dist) * sp;
      gh.y += (dy / dist) * sp;
    }
    emit(w, ArmEv.Ghost, gh.x, gh.y, 1, 0, gh.ret);
  }
}

/** 幽冥 4 件：每打倒 15 只怪，召出一位鬼差 */
function chai(w: World, api: ArmApi): void {
  const A = w.arms;
  const S = ARM_FX2.school.ghost;
  A.chaiNext += S.chaiEvery;
  const { k, dmg } = dmgOf(w, api, 'banner');
  const base = k >= 0 ? dmg : 30 + 2 * w.level;
  A.ghosts.push({ x: w.x, y: w.y, kind: 1, life: S.chaiLife, dmg: base * S.chaiMul, speed: 9, evo: 0, ret: 0, hx: w.x, hy: w.y, slot: k });
  emit(w, ArmEv.Ghost, w.x, w.y, 3, 0, 0);
}

// ───────────────────────── 判官笔 ─────────────────────────

function castBrush(w: World, g: Grid, k: number, wp: OwnedWeapon, e: Eff): boolean {
  const A = w.arms;
  const n = g.query(w, w.x, w.y, e.area);
  if (n === 0) return false;
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  let got = 0;
  for (let r = 0; r < e.amount && r < picks.length; r++) {
    let best = -1;
    let bh = -1;
    for (let j = 0; j < n; j++) {
      const i = tmp[j]!;
      if (i < 0) continue;
      let taken = false;
      for (const job of A.brushJobs) if (job.tgt === i) taken = true;
      if (taken) {
        tmp[j] = -1;
        continue;
      }
      if (w.eHp[i]! > bh) {
        bh = w.eHp[i]!;
        best = j;
      }
    }
    if (best < 0) break;
    const i = tmp[best]!;
    tmp[best] = -1;
    A.brushJobs.push({ tgt: i, left: 3, next: w.tick + got * 3, dmg: e.dmg, evo: wp.evolved ? 1 : 0, slot: k });
    got++;
  }
  if (got === 0) return false;
  emit(w, Ev.Fire, w.x, w.y, CODE.brush);
  return true;
}

function brushTick(w: World, api: ArmApi): void {
  const A = w.arms;
  const B = ARM_FX2.brush;
  for (let q = A.brushJobs.length - 1; q >= 0; q--) {
    const j = A.brushJobs[q]!;
    if (w.tick < j.next) continue;
    if (!w.eAlive[j.tgt]) {
      A.brushJobs.splice(q, 1);
      continue;
    }
    const i = j.tgt;
    const idx = 3 - j.left;
    let dmg = j.dmg * (idx === 2 ? 1.5 : 1);
    let exec = 0;
    if (j.evo) {
      if (isBoss(w, i)) dmg *= 1 + B.bossBonus;
      else if (w.eHp[i]! <= w.eHpMax[i]! * B.execute) {
        dmg = w.eHp[i]! * 4 + 10;
        exec = 1;
      }
    }
    emit(w, ArmEv.Brush, w.eX[i]!, w.eY[i]!, idx, j.evo, exec);
    api.hitEnemy(w, i, dmg, -1, 0, 0, 0, 0, j.slot);
    if (--j.left <= 0) A.brushJobs.splice(q, 1);
    else j.next = w.tick + B.gap;
  }
}

// ───────────────────────── 鞭炮 ─────────────────────────

function pushCracker(w: World, c: Cracker): void {
  if (w.arms.crackers.length < 24) w.arms.crackers.push(c);
}

function castCracker(w: World, g: Grid, k: number, wp: OwnedWeapon, s: WeaponStats, e: Eff, api: ArmApi): boolean {
  const t = api.nearest(w, g, w.x, w.y, 420);
  if (t < 0) return false;
  const d = dirIndex(w.eX[t]! - w.x, w.eY[t]! - w.y);
  const ux = dcos(d);
  const uy = dsin(d);
  pushCracker(w, { x: w.x + ux * 50, y: w.y + uy * 50, ux, uy, step: s.speed, total: e.amount, left: e.amount, next: w.tick, dmg: e.dmg, r: e.area, knock: s.knock, evo: wp.evolved ? 1 : 0, round: 1, slot: k });
  emit(w, Ev.Fire, w.x, w.y, CODE.cracker);
  return true;
}

function crackersTick(w: World, g: Grid, api: ArmApi): void {
  const A = w.arms;
  const C = ARM_FX2.cracker;
  for (let q = A.crackers.length - 1; q >= 0; q--) {
    const c = A.crackers[q]!;
    if (w.tick < c.next) continue;
    const idx = c.total - c.left;
    const bx = c.x + c.ux * c.step * idx;
    const by = c.y + c.uy * c.step * idx;
    emit(w, ArmEv.Cracker, bx, by, c.evo, c.r, c.round);
    const n = g.query(w, bx, by, c.r);
    for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
    for (let j = 0; j < n; j++) {
      const i = tmp[j]!;
      api.hitEnemy(w, i, c.dmg, -1, w.eX[i]! - bx, w.eY[i]! - by, c.knock, 0, c.slot);
    }
    if (--c.left > 0) c.next = w.tick + C.gap;
    else if (c.evo && c.round === 1) {
      c.round = 2;
      c.left = c.total;
      c.next = w.tick + C.round2;
    } else A.crackers.splice(q, 1);
  }
}

// ───────────────────────── 聚财 4 件 ─────────────────────────

function rain(w: World, g: Grid, api: ArmApi): void {
  const S = ARM_FX2.school.wealth;
  w.arms.rainAt += S.rainEvery;
  const dmg = (40 + 3 * w.level) * S.rainMul;
  emit(w, ArmEv.Rain, w.x, w.y, 0, S.rainR, 0);
  const n = g.query(w, w.x, w.y, S.rainR);
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  for (let j = 0; j < n; j++) api.hitEnemy(w, tmp[j]!, dmg, -1, 0, 0, 0, 0, -1);
}

// ───────────────────────── 搭配 ─────────────────────────

function maibuBurst(w: World, g: Grid, api: ArmApi, x: number, y: number): void {
  const M = ARM_FX2.combo.maibu;
  const p = w.mergePower('maibu');
  const coins = Math.max(1, Math.round(M.coins * p));
  w.coins += coins;
  w.coinBy.drop += coins;
  emit(w, ArmEv.Combo, x, y, ArmFx.Maibu, M.r, 1);
  const { k, dmg } = dmgOf(w, api, 'dart');
  if (k < 0) return;
  const n = g.query(w, x, y, M.r);
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  for (let j = 0; j < n; j++) api.hitEnemy(w, tmp[j]!, dmg * M.mul * p, -1, 0, 0, 0, 0, k);
}

function secondCombos(w: World, g: Grid, api: ArmApi): void {
  const C = ARM_FX2.combo;
  // 阴律斩：每次挥剑，判官笔对挥中最疼（血最多）的那只补一笔
  if (hasMerge(w, 'yinlv') && evOf(w, Ev.Fire, CODE.sword) >= 0) {
    const ks = slotOf(w, 'sword');
    const { k, dmg } = dmgOf(w, api, 'brush');
    if (ks >= 0 && k >= 0) {
      const n = g.query(w, w.x, w.y, api.eff(w, w.wstats[ks]!).area);
      let best = -1;
      let bh = -1;
      for (let j = 0; j < n; j++) {
        const i = g.out[j]!;
        if (w.eHp[i]! > bh) {
          bh = w.eHp[i]!;
          best = i;
        }
      }
      if (best >= 0) {
        emit(w, ArmEv.Combo, w.eX[best]!, w.eY[best]!, ArmFx.Yinlv, 0);
        api.hitEnemy(w, best, dmg * C.yinlv.mul * w.mergePower('yinlv'), -1, 0, 0, 0, 0, k);
      }
    }
  }
  // 买路符钱：隔一阵给近处一只怪贴一张符，它死了爆成铜钱（killsTick 里兑现）
  if (hasMerge(w, 'maibu') && w.tick >= w.arms.maibuAt) {
    w.arms.maibuAt = w.tick + C.maibu.every;
    const n = g.query(w, w.x, w.y, C.maibu.reach);
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      const i = g.out[j]!;
      if (w.arms.marked[i]) continue;
      const dx = w.eX[i]! - w.x;
      const dy = w.eY[i]! - w.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      w.arms.marked[best] = 1;
      emit(w, ArmEv.Combo, w.eX[best]!, w.eY[best]!, ArmFx.Maibu, 0, 0);
    }
  }
  // 阴兵借道：纸兵倒下时变成一个冤魂
  if (hasMerge(w, 'yinbing')) {
    const ks = slotOf(w, 'banner');
    // 规则 63 的初成：变冤魂是开关，按 mergePower 的概率（大成每只都变，不抽随机数）
    const p = w.mergePower('yinbing');
    if (ks >= 0) {
      for (let q = 0; q < w.ev.n; q++) {
        if (w.ev.type[q] !== Ev.Paper || w.ev.a[q] !== 0) continue;
        if (p < 1 && w.rWeapon.next() >= p) continue;
        emit(w, ArmEv.Combo, w.ev.x[q]!, w.ev.y[q]!, ArmFx.Yinbing, 0);
        spawnGhost(w, api, w.ev.x[q]!, w.ev.y[q]!, ks, w.weapons[ks]!.evolved ? 1 : 0, w.x, w.y);
      }
    }
  }
  // 爆竹驱年：护盾破时连放一串爆竹，震开全屏
  if (hasMerge(w, 'baozhu') && evOf(w, Ev.Shield, 0) >= 0) {
    const { k, dmg } = dmgOf(w, api, 'cracker');
    if (k >= 0) {
      const M = C.baozhu;
      const p = w.mergePower('baozhu');
      const n2 = Math.max(1, Math.round((M.crackers >> 1) * p));
      emit(w, ArmEv.Combo, w.x, w.y, ArmFx.Baozhu, 600);
      for (let r = 0; r < 8; r++) {
        const d = r * 32;
        pushCracker(w, { x: w.x + dcos(d) * 40, y: w.y + dsin(d) * 40, ux: dcos(d), uy: dsin(d), step: 46, total: n2, left: n2, next: w.tick + r, dmg: dmg * M.mul * p, r: 46, knock: M.knock, evo: 0, round: 1, slot: k });
      }
      const n = g.query(w, w.x, w.y, 600);
      for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
      for (let j = 0; j < n; j++) api.hitEnemy(w, tmp[j]!, dmg * M.mul * p, -1, w.eX[tmp[j]!]! - w.x, w.eY[tmp[j]!]! - w.y, M.knock, 0, k);
    }
  }
}
