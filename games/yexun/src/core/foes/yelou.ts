/**
 * 终局首领「夜漏君」（design 第 6 节，数值 content/rushFoes.ts YELOU）。三段按血切：
 * 一更 · 更鼓（鼓圈、更签雨、召更夫鬼）→ 三更 · 月蚀（夜色压下、月牙镰、灯笼）→ 五更 · 漏尽（夜潮、漏珠、滴漏倒数，漏尽后发狂不秒人）。
 * 转阶段无敌 YELOU.shift 拍、清掉场上的敌弹和预警圈。招式伤害按贴身伤害 w.eDmg 乘（YELOU 里的 dmg 是倍数）。
 * 怪身上：eT 倒数到下一招，eS 0 走 1 镰刀预警 2 镰刀冲，eAX/eAY 冲的方向；整场的东西在 w.foe（state.ts）。
 *
 * 发的事件：Ev.Rush 子类 5（b = 新阶段 1 三更 / 2 五更）；Ev.Foe（c = 下标）70 鼓圈（b = 缺口方向）、36/56 更签预警/落下（圈的样子 6）、
 * 72 召更夫鬼（b = 几只）、73 镰刀预警（b = 方向表下标，c = 冲多远）、74 镰刀冲出、75 灯笼亮（b = 几盏）、76 夜色（b = 1 压下 0 散）、
 * 77 夜潮起（b = 半径）、78 夜潮收一截（b = 半径）、79 漏尽发狂、80 转阶段（b = 新阶段）、81 漏壶碎（倒下）
 */
import { PLAYER } from '../../content/player.ts';
import { YELOU } from '../../content/rushFoes.ts';
import { DIR_N } from '../dirs.ts';
import { Ev } from '../events.ts';
import { dcos, dirIndex, dsin, fsqrt } from '../fmath.ts';
import { MAX_ENEMIES, Shot, type World } from '../state.ts';
import { api } from './api.ts';
import { addCircle, addFlame } from './ground.ts';
import { MAX_CIRCLES, MAX_DRUMS, MAX_LANTERNS } from './state.ts';
import type { FoeMv } from './index.ts';

const RAIN_VIS = 6;

/** 出场：排好第一下鼓、第一阵签雨、第一次召更夫鬼，清掉上一只留下的场面 */
export function yelouInit(w: World, i: number): void {
  const f = w.foe;
  w.eT[i] = YELOU.drum.every / 2;
  f.ylRain = w.tick + YELOU.rain.first;
  f.ylCall = w.tick + YELOU.call.first;
  f.ylInv = 0;
  f.ylDark = 0;
  f.lN = 0;
  f.tideR = 0;
  f.dripEnd = 0;
  f.ylRageNext = 0;
  f.ylRageN = 0;
  f.spiral = 0;
  f.dOn.fill(0);
}

/** 转阶段无敌中：打不到、碰不到 */
export function yelouShielded(w: World): boolean {
  return w.tick < w.foe.ylInv;
}

/** 三更站在灯笼旁：打它伤害加成 */
export function yelouHitMul(w: World): number {
  const f = w.foe;
  const r = YELOU.lantern.r;
  for (let k = 0; k < f.lN; k++) {
    const dx = w.x - f.lX[k]!;
    const dy = w.y - f.lY[k]!;
    if (dx * dx + dy * dy <= r * r) return YELOU.lantern.hitMul;
  }
  return 1;
}

/** 五更滴漏还剩几拍（没开始 -1，漏尽 0）；HUD 画滴漏 */
export function yelouDrip(w: World): number {
  const f = w.foe;
  return f.dripEnd === 0 ? -1 : Math.max(0, f.dripEnd - w.tick);
}

/** 倒下：漏壶碎，场面收干净（天亮的转场在画面层） */
export function yelouDown(w: World, x: number, y: number, i: number): void {
  const f = w.foe;
  f.ylDark = 0;
  f.lN = 0;
  f.tideR = 0;
  f.dripEnd = 0;
  f.dOn.fill(0);
  w.ev.push(Ev.Foe, x, y, 81, 0, i);
}

function shift(w: World, i: number, ph: number): void {
  const f = w.foe;
  const x = w.eX[i]!;
  const y = w.eY[i]!;
  f.ylInv = w.tick + YELOU.shift;
  for (let s = 0; s < w.sAlive.length; s++)
    if (w.sAlive[s] && w.sKind[s] === Shot.Fireball) {
      w.sAlive[s] = 0;
      w.sCount--;
    }
  for (let k = 0; k < MAX_CIRCLES; k++) f.cT[k] = 0;
  f.dOn.fill(0);
  w.eS[i] = 0;
  w.eT[i] = YELOU.scythe.every / 2;
  if (ph === 1) {
    // 三更：夜色压下，主角四周亮三盏灯笼
    f.ylDark = 1;
    const L = YELOU.lantern;
    const off = w.rAi.int(DIR_N);
    f.lN = Math.min(L.n, MAX_LANTERNS);
    for (let k = 0; k < f.lN; k++) {
      const a = off + Math.floor((k * DIR_N) / f.lN);
      f.lX[k] = clampIn(w.x + dcos(a) * L.ring, w.arenaW);
      f.lY[k] = clampIn(w.y + dsin(a) * L.ring * 0.8, w.arenaH);
    }
    w.ev.push(Ev.Foe, x, y, 76, 1, i);
    w.ev.push(Ev.Foe, x, y, 75, f.lN, i);
  } else {
    // 五更：夜色散、灯笼灭，夜潮从主角四周往里收，滴漏开始倒数
    f.ylDark = 0;
    f.lN = 0;
    f.tideX = w.x;
    f.tideY = w.y;
    f.tideR = YELOU.tide.start;
    f.tideNext = w.tick + YELOU.tide.every;
    f.dripEnd = w.tick + YELOU.drip;
    w.ev.push(Ev.Foe, x, y, 76, 0, i);
    w.ev.push(Ev.Foe, f.tideX, f.tideY, 77, f.tideR, i);
  }
  w.ev.push(Ev.Foe, x, y, 80, ph, i);
  w.ev.push(Ev.Rush, x, y, 5, ph, 0);
}

function clampIn(v: number, size: number): number {
  return Math.min(size - 80, Math.max(80, v));
}

/** 每拍（foeAct 分发）：dx、dy 指向主角的单位向量，d 距离 */
export function yelouAct(w: World, i: number, d: number, dx: number, dy: number, mv: FoeMv): void {
  const f = w.foe;
  const before = w.ePhase[i]!;
  const ph = api.phase(w, i, YELOU.phases);
  if (ph > before) shift(w, i, ph);
  mv.sp *= YELOU.speed[ph]!;
  drums(w);
  if (w.tick < f.ylInv) {
    mv.sp = 0;
    return;
  }
  if (ph === 0) gengGu(w, i);
  else if (ph === 1) yueShi(w, i, dx, dy, mv);
  else louJin(w, i, mv);
  void d;
}

/** 一更 · 更鼓 */
function gengGu(w: World, i: number): void {
  const f = w.foe;
  const x = w.eX[i]!;
  const y = w.eY[i]!;
  const atk = w.eDmg[i]!;
  if (--w.eT[i]! <= 0) {
    const D = YELOU.drum;
    w.eT[i] = D.every;
    for (let k = 0; k < MAX_DRUMS; k++) {
      if (f.dOn[k]) continue;
      // 缺口一个开在主角那一侧（偏开最多 90°，得挪几步才进得去），一半概率对面再开一个
      const g0 = (dirIndex(w.x - x, w.y - y) + w.rAi.int(129) - 64 + DIR_N) % DIR_N;
      f.dOn[k] = 1;
      f.dX[k] = x;
      f.dY[k] = y;
      f.dR[k] = 0;
      f.dGap0[k] = g0;
      f.dGap1[k] = w.rAi.next() < D.twoGaps ? (g0 + DIR_N / 2 + w.rAi.int(65) - 32 + DIR_N) % DIR_N : -1;
      f.dDmg[k] = atk * D.dmg;
      w.ev.push(Ev.Foe, x, y, 70, g0, i);
      break;
    }
  }
  if (w.tick >= f.ylRain) {
    const R = YELOU.rain;
    f.ylRain = w.tick + R.every;
    const n = R.nMin + w.rAi.int(R.nMax - R.nMin + 1);
    for (let k = 0; k < n; k++) {
      const a = w.rAi.int(DIR_N);
      const r = k === 0 ? 0 : w.rAi.next() * R.spread;
      addCircle(w, w.x + dcos(a) * r, w.y + dsin(a) * r * 0.8, R.r, R.warn, atk * R.dmg, RAIN_VIS);
    }
  }
  if (w.tick >= f.ylCall) {
    const C = YELOU.call;
    f.ylCall = w.tick + C.every;
    const off = w.rAi.int(DIR_N);
    for (let k = 0; k < C.n; k++) {
      const a = off + Math.floor((k * DIR_N) / C.n);
      api.spawn(w, 'nightwatch', x + dcos(a) * C.ring, y + dsin(a) * C.ring * 0.8);
    }
    w.ev.push(Ev.Foe, x, y, 72, C.n, i);
  }
}

/** 鼓圈往外扩；主角在圈上、又不在缺口里就挨一下（每圈只打一次：打中就把这圈在主角那儿的缺口补上不再判） */
function drums(w: World): void {
  const f = w.foe;
  const D = YELOU.drum;
  for (let k = 0; k < MAX_DRUMS; k++) {
    if (!f.dOn[k]) continue;
    f.dR[k]! += D.speed;
    if (f.dR[k]! > D.reach) {
      f.dOn[k] = 0;
      continue;
    }
    const dx = w.x - f.dX[k]!;
    const dy = w.y - f.dY[k]!;
    const d = fsqrt(dx * dx + dy * dy);
    if (Math.abs(d - f.dR[k]!) > D.thick / 2 + PLAYER.r) continue;
    const a = dirIndex(dx, dy);
    if (inGap(a, f.dGap0[k]!) || inGap(a, f.dGap1[k]!)) continue;
    api.hurt(w, f.dDmg[k]!, -1);
  }
}

function inGap(a: number, g: number): boolean {
  if (g < 0) return false;
  const diff = Math.abs(((a - g + DIR_N + DIR_N / 2) % DIR_N) - DIR_N / 2);
  return diff <= YELOU.drum.gapHalf;
}

/** 三更 · 月蚀：月牙镰 */
function yueShi(w: World, i: number, dx: number, dy: number, mv: FoeMv): void {
  const C = YELOU.scythe;
  const s = w.eS[i]!;
  if (s === 0) {
    if (--w.eT[i]! > 0) return;
    w.eS[i] = 1;
    w.eT[i] = C.warn;
    w.eAX[i] = dx;
    w.eAY[i] = dy;
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 73, dirIndex(dx, dy), C.dash * C.speed);
    mv.sp = 0;
    return;
  }
  if (s === 1) {
    mv.sp = 0;
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 2;
      w.eT[i] = C.dash;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 74, 0, i);
    }
    return;
  }
  mv.sp = C.speed;
  mv.vx = w.eAX[i]!;
  mv.vy = w.eAY[i]!;
  if (w.eT[i]! % C.flameEvery === 0) addFlame(w, w.eX[i]!, w.eY[i]!, C.flameR, C.flameLife, w.eDmg[i]! * C.flameDmg, w.eKind[i]!);
  const ex = w.x - w.eX[i]!;
  const ey = w.y - w.eY[i]!;
  const rr = w.eR[i]! + PLAYER.r;
  if (ex * ex + ey * ey <= rr * rr) api.hurt(w, w.eDmg[i]! * C.dmg, w.eKind[i]!);
  if (--w.eT[i]! <= 0) {
    w.eS[i] = 0;
    w.eT[i] = C.every;
  }
}

/** 五更 · 漏尽：夜潮、漏珠、滴漏 */
function louJin(w: World, i: number, mv: FoeMv): void {
  const f = w.foe;
  const T = YELOU.tide;
  const atk = w.eDmg[i]!;
  const drained = w.tick >= f.dripEnd;
  if (!drained && w.tick >= f.tideNext && f.tideR > T.min) {
    f.tideR = Math.max(T.min, f.tideR - T.step);
    f.tideNext = w.tick + T.every;
    w.ev.push(Ev.Foe, f.tideX, f.tideY, 78, f.tideR, i);
  }
  if ((f.dripEnd - w.tick) % T.hurtEvery === 0) {
    const dx = w.x - f.tideX;
    const dy = w.y - f.tideY;
    if (dx * dx + dy * dy > f.tideR * f.tideR) api.hurt(w, atk * T.dmg, -1);
  }
  const P = YELOU.spiral;
  if (w.tick % P.every === 0) {
    f.spiral = (f.spiral + P.turn) % DIR_N;
    for (const a of [f.spiral, (DIR_N - f.spiral) % DIR_N]) api.shot(w, w.eX[i]!, w.eY[i]! - 40, dcos(a) * P.speed, dsin(a) * P.speed, P.life, atk * P.dmg, P.r, 0);
  }
  if (drained) {
    const E = YELOU.enrage;
    if (f.ylRageNext === 0) {
      f.ylRageNext = w.tick;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 79, 0, i);
    }
    if (w.tick >= f.ylRageNext && 1 + E.dmg * (f.ylRageN + 1) <= E.maxDmg + 1e-9) {
      f.ylRageNext = w.tick + E.every;
      const n = ++f.ylRageN;
      const k = (1 + E.dmg * n) / (1 + E.dmg * (n - 1));
      w.eDmg[i]! *= k;
      w.eAtk[i]! *= k;
    }
    mv.sp *= Math.min(E.maxSpeed, 1 + E.speed * f.ylRageN);
  }
}

/** 连战开发入口 ?rushfinal：把这一局直接排到终局（画面接线由入口做） */
export function rushSkipToFinal(w: World, stages: number): void {
  w.rushStage = stages;
  w.rushDown = stages;
  w.rushAt = w.tick + 30;
  for (let k = 0; k < MAX_ENEMIES; k++) {
    if (!w.eAlive[k]) continue;
    w.eAlive[k] = 0;
    w.eCount--;
  }
  w.rushLeft = 0;
}
