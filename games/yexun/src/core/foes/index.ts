/**
 * 2.0 的首领和特色怪的行为入口（DESIGN.md 3.5）。step.ts 只留最少的挂钩：
 * 出场初始化 foeInit、每只怪每拍 foeAct、每拍收尾 foeTick（圈落下、浪、风、浮冰、摆设、戏台）、
 * 倒下 foeOnKill、挨打 foeOnHit / foeGhost / foeHitMul、主角受伤和走路的倍数 foeHurtMul / foeSlowMul。
 * 首领连战：词缀在 affix.ts（连战调 affixInit / affixTick），终局首领夜漏君在 yelou.ts（这里分发）；地上的圈和鬼火的写法在 ground.ts。
 * 招式伤害都乘出手那只的 w.eAtk（守夜、夜探恒 1；连战按第几关重设）。
 * 技能的数值在 content/foes.ts，状态记在怪的 eT / eS / eV / eAX / eAY 和 World.foe（state.ts）。
 */
import { ENEMY_BY_KIND, type EnemyKind } from '../../content/enemies.ts';
import { BINGHUN, CROSSBOW, GUANDING, HONGYI, HURRIER, PROP_KINDS, RAT, SHUIHOU, SHUOSHU, STAGE, WUMIAN, XUETONG, ZHUMU } from '../../content/foes.ts';
import { PLAYER } from '../../content/player.ts';
import { DIR_N } from '../dirs.ts';
import { dcos, dirIndex, dsin, fsqrt } from '../fmath.ts';
import { Ev } from '../events.ts';
import { MAX_ENEMIES, type World } from '../state.ts';
import { api } from './api.ts';
import { shadowOrphan } from './affix.ts';
import { addCircle } from './ground.ts';
import { MAX_CIRCLES, MAX_FLAMES, MAX_FLOES, MAX_WAVES } from './state.ts';
import { yelouAct, yelouDown, yelouHitMul, yelouInit, yelouShielded } from './yelou.ts';

export { bindFoeApi } from './api.ts';
export { affixInit, affixList, affixPull, affixShieldLeft, affixTick, AFFIX_BIT } from './affix.ts';
export { rushSkipToFinal, yelouDrip } from './yelou.ts';

/** 怪这一拍对方向和速度的改动（moveEnemies 先填进来，foeAct 改完再取走） */
export interface FoeMv {
  vx: number;
  vy: number;
  sp: number;
}

const CODE = (k: EnemyKind): number => ENEMY_BY_KIND[k].code;
const ZHUMU_C = CODE('zhumu');
const SHUIHOU_C = CODE('shuihou');
const BINGHUN_C = CODE('binghun');
const WUMIAN_C = CODE('wumian');
const XUETONG_C = CODE('xuetong');
const GUANDING_C = CODE('guandingui');
const HONGYI_C = CODE('hongyi');
const CLONE_C = CODE('hongyiclone');
const SHUOSHU_C = CODE('shuoshu');
const PILE_C = CODE('ricepile');
const YELOU_C = CODE('yelou');
const SHADOW_C = CODE('yingzi');
const COFFIN_C = CODE('coffin');
const SPROUT_C = CODE('bamsprout');
const PROP_CODES: ReadonlySet<number> = new Set(PROP_KINDS.map(CODE));
const PH = [0.5] as const;

/** 这一代码的怪是不是摆设（不伤人、不掉东西、武器不瞄它） */
export function isProp(code: number): boolean {
  return PROP_CODES.has(code);
}
/** 倒下不掉东西、不记击杀的（摆设和红衣戏子的假身） */
export function noDrop(code: number): boolean {
  return PROP_CODES.has(code) || code === CLONE_C || code === SHADOW_C;
}
/** 是不是 2.0 新增的首领（中期的四个、夜探守门的两个、连战终局夜漏君）：出场放自己的音、倒下发 Ev.Foe 23（夜漏君发 81） */
export function isFoeBoss(code: number): boolean {
  return code === YELOU_C || code === ZHUMU_C || code === SHUIHOU_C || code === BINGHUN_C || code === WUMIAN_C || code === HONGYI_C || code === SHUOSHU_C;
}

/** 潜水、钻地时：打不到、碰不到、武器不瞄 */
export function foeGhost(w: World, i: number): boolean {
  const k = w.eKind[i]!;
  if (k === YELOU_C) return yelouShielded(w);
  return (k === SHUIHOU_C || k === SHUOSHU_C) && w.eS[i] === 1;
}
/** 武器不瞄它：潜水钻地的首领和摆设 */
export function foeUntargetable(w: World, i: number): boolean {
  return isProp(w.eKind[i]!) || foeGhost(w, i);
}
/** 挨打的倍数：无面佛眩晕时；夜漏君三更站在灯笼旁 */
export function foeHitMul(w: World, i: number): number {
  const k = w.eKind[i]!;
  if (k === YELOU_C) return yelouHitMul(w);
  return k === WUMIAN_C && w.eS[i] === 3 ? WUMIAN.stunHit : 1;
}
/** 被火打中的雪童子现形 */
export function foeOnHit(w: World, i: number, fire: boolean): void {
  if (fire && w.eKind[i] === XUETONG_C && w.tick >= w.eV[i]!) {
    w.eV[i] = w.tick + XUETONG.flash;
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 13, 1, i);
  }
}
/** 主角挨打的倍数：无面佛二段，香火区外加倍 */
export function foeHurtMul(w: World): number {
  return w.foe.dark !== 0 && !w.inIncense ? WUMIAN.darkMul : 1;
}
/** 浮冰上能站稳，裂开期间在水里走路慢 */
export function foeSlowMul(w: World): number {
  const f = w.foe;
  if (w.tick < f.floeWarnEnd || w.tick >= f.floeUntil) return 1;
  for (let k = 0; k < f.fN; k++) if (w.x >= f.fX[k]! && w.x <= f.fX[k]! + f.fW[k]! && w.y >= f.fY[k]! && w.y <= f.fY[k]! + f.fH[k]!) return 1;
  return BINGHUN.crack.offSlow;
}

// ───────────────────────── 出场、倒下 ─────────────────────────

export function foeInit(w: World, i: number, kind: EnemyKind): void {
  w.foe.used = true;
  switch (kind) {
    case 'zhumu':
      w.eT[i] = ZHUMU.every[0]!;
      break;
    case 'shuihou':
      w.eT[i] = SHUIHOU.every[0]!;
      break;
    case 'binghun':
      w.eT[i] = BINGHUN.every[0]!;
      w.eAX[i] = BINGHUN.crack.every;
      break;
    case 'wumian':
      w.eT[i] = WUMIAN.every[0]!;
      w.foe.homeX = w.eX[i]!;
      w.foe.homeY = w.eY[i]!;
      break;
    case 'hongyi':
      w.eT[i] = HONGYI.every[0]!;
      break;
    case 'shuoshu':
      w.eT[i] = SHUOSHU.every[0]!;
      break;
    case 'hongyiclone':
      w.eT[i] = HONGYI.cloneLife;
      break;
    case 'yelou':
      yelouInit(w, i);
      break;
    case 'crossbow':
      // 刚出场先错开一阵，一群不同时放箭
      w.eT[i] = CROSSBOW.every + w.rAi.int(40);
      break;
    case 'hurrier':
      w.eAX[i] = w.x;
      w.eAY[i] = w.y;
      break;
    default:
      break;
  }
}

/** 鼠妖一刷一小群：刚刷出来的这只（x, y）旁边再补 pack − 1 只 */
export function foePack(w: World, kind: EnemyKind, x: number, y: number): void {
  if (kind !== 'ratdemon') return;
  for (let k = 1; k < RAT.pack; k++) api.spawn(w, 'ratdemon', x + (k - 1) * 26 - 13, y + (k % 2) * 20);
}

/** 怪倒下以后：棺钉鬼留一副空棺，首领发倒下的事件 */
export function foeOnKill(w: World, i: number, x: number, y: number): void {
  const k = w.eKind[i]!;
  if (k === GUANDING_C) {
    const j = api.spawn(w, 'coffin', x, y);
    if (j >= 0) {
      w.eT[j] = GUANDING.coffinLife;
      w.ev.push(Ev.Foe, x, y, 16, 0, j);
    }
  } else if (k === YELOU_C) yelouDown(w, x, y, i);
  else if (isFoeBoss(k)) {
    w.ev.push(Ev.Foe, x, y, 23, k, i);
    if (k === WUMIAN_C) w.foe.dark = 0;
  }
}

// ───────────────────────── 圈、浪、风、浮冰 ─────────────────────────

function ringCircles(w: World, cx: number, cy: number, ring: number, n: number, r: number, warn: number, dmg: number, vis: number): void {
  const off = w.rAi.int(DIR_N);
  for (let k = 0; k < n; k++) {
    const a = off + Math.floor((k * DIR_N) / n);
    addCircle(w, cx + dcos(a) * ring, cy + dsin(a) * ring * 0.8, r, warn, dmg, vis);
  }
}

function addWave(w: World, axis: number, dir: number, start: number, end: number, gap: number, atk: number): void {
  const f = w.foe;
  for (let k = 0; k < MAX_WAVES; k++) {
    if (f.wOn[k]) continue;
    f.wOn[k] = 1;
    f.wWarn[k] = ZHUMU.waveWarn;
    f.wAxis[k] = axis;
    f.wDir[k] = dir;
    f.wPos[k] = start;
    f.wEnd[k] = end;
    f.wGap[k] = gap;
    f.wGapW[k] = ZHUMU.waveGapW;
    f.wAtk[k] = atk;
    return;
  }
}

function crackIce(w: World): void {
  const f = w.foe;
  const C = BINGHUN.crack;
  f.fN = C.floes;
  f.floeWarnEnd = w.tick + C.warn;
  f.floeUntil = w.tick + C.warn + C.dur;
  // 第一块压在主角脚下附近（别一裂开就掉水里），其余几块散在四周
  const off = w.rAi.int(DIR_N);
  for (let k = 0; k < MAX_FLOES; k++) {
    if (k >= C.floes) break;
    const a = off + Math.floor((k * DIR_N) / C.floes);
    const near = k === 0 ? 40 : 330;
    const cx = w.x + dcos(a) * near;
    const cy = w.y + dsin(a) * near * 0.8;
    f.fX[k] = cx - C.floeW / 2;
    f.fY[k] = cy - C.floeH / 2;
    f.fW[k] = C.floeW;
    f.fH[k] = C.floeH;
  }
  w.ev.push(Ev.Foe, w.x, w.y, 9, 0, C.warn);
}

/** 每拍收尾（moveEnemies 之后）：圈落下、竹浪前进、冰风吹出、浮冰到期、摆设挡人、戏台开场 */
export function foeTick(w: World): void {
  const f = w.foe;
  if (!f.used) return;
  for (let k = 0; k < MAX_CIRCLES; k++) {
    if (f.cT[k]! <= 0 || --f.cT[k]! > 0) continue;
    const vis = f.cVis[k]!;
    w.ev.push(Ev.Foe, f.cX[k]!, f.cY[k]!, 50 + vis, f.cR[k]!, 0);
    if (api.areaHurt(w, f.cX[k]!, f.cY[k]!, f.cR[k]!, f.cDmg[k]!, vis) && f.cSlow[k]! > 0) w.slowUntil = Math.max(w.slowUntil, w.tick + f.cSlow[k]!);
  }
  for (let k = 0; k < MAX_WAVES; k++) {
    if (!f.wOn[k]) continue;
    if (f.wWarn[k]! > 0) {
      f.wWarn[k]!--;
      continue;
    }
    f.wPos[k]! += f.wDir[k]! * ZHUMU.waveSpeed;
    const pos = f.wPos[k]!;
    if ((f.wDir[k]! > 0 && pos > f.wEnd[k]!) || (f.wDir[k]! < 0 && pos < f.wEnd[k]!)) {
      f.wOn[k] = 0;
      continue;
    }
    const along = f.wAxis[k] === 0 ? w.x : w.y;
    const perp = f.wAxis[k] === 0 ? w.y : w.x;
    const half = ZHUMU.waveThick / 2 + PLAYER.r;
    const gh = f.wGapW[k]! / 2;
    if (Math.abs(along - pos) < half && Math.abs(perp - f.wGap[k]!) > gh) api.hurt(w, ZHUMU.waveDmg * f.wAtk[k]!, ZHUMU_C);
  }
  if (f.windT > 0 && --f.windT === 0) {
    const c = dcos(f.windDir);
    const s = dsin(f.windDir);
    const ax = (w.x - f.windX) * c + (w.y - f.windY) * s;
    const px = -(w.x - f.windX) * s + (w.y - f.windY) * c;
    f.slickUntil = w.tick + BINGHUN.slick;
    if (ax > 0 && ax < BINGHUN.windLen && Math.abs(px) < BINGHUN.windHalf + PLAYER.r) {
      api.hurt(w, BINGHUN.windDmg * f.windAtk, BINGHUN_C);
      w.x += c * BINGHUN.windPush;
      w.y += s * BINGHUN.windPush;
      api.fixPlayer(w);
    }
  }
  if (f.fN > 0 && w.tick >= f.floeUntil) f.fN = 0;
  // 鬼火：踩进去挨烧（受伤后的无敌拍照常挡）
  for (let k = 0; k < MAX_FLAMES; k++) {
    if (f.hEnd[k]! <= w.tick) continue;
    const dx = w.x - f.hX[k]!;
    const dy = w.y - f.hY[k]!;
    const rr = f.hR[k]! + PLAYER.r;
    if (dx * dx + dy * dy < rr * rr) api.hurt(w, f.hDmg[k]!, f.hBy[k]!);
  }
  for (let i = 0; i < MAX_ENEMIES; i++) {
    if (!w.eAlive[i]) continue;
    const k = w.eKind[i]!;
    // 词缀「分」的影子：本体倒了就散（不掉东西、不记击杀）
    if (k === SHADOW_C && shadowOrphan(w, i)) {
      w.eAlive[i] = 0;
      w.eCount--;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 68, 0, i);
      continue;
    }
    if (k !== PILE_C && k !== COFFIN_C) continue;
    // 摆设：寿命到了散掉；主角走不过去
    if (--w.eT[i]! <= 0) {
      w.eAlive[i] = 0;
      w.eCount--;
      continue;
    }
    const dx = w.x - w.eX[i]!;
    const dy = w.y - w.eY[i]!;
    const rr = w.eR[i]! + PLAYER.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = fsqrt(d2);
    if (d < 1e-6) w.x += rr;
    else {
      w.x = w.eX[i]! + (dx / d) * rr;
      w.y = w.eY[i]! + (dy / d) * rr;
    }
    api.fixPlayer(w);
  }
  stageTick(w);
}

/** 戏楼镇的戏台：离得近才开场；一场的鬼影分批冒，间隔一批比一批短（锣鼓点越来越快） */
function stageTick(w: World): void {
  const raid = w.raid;
  const st = raid?.map.stage;
  if (!raid || !st) return;
  const f = w.foe;
  if (f.stageNext === 0) f.stageNext = STAGE.first;
  const dx = w.x - st.x;
  const dy = w.y - st.y;
  if (f.stageLeft === 0 && w.tick >= f.stageNext && dx * dx + dy * dy < STAGE.near * STAGE.near) {
    f.stageNext = w.tick + STAGE.every;
    f.stageLeft = STAGE.troupe;
    f.stageAt = w.tick + 30;
    f.stageGap = 34;
    w.ev.push(Ev.Foe, st.x, st.y, 17, ++f.stageN, 0);
  }
  if (f.stageLeft > 0 && w.tick >= f.stageAt) {
    const n = Math.min(2, f.stageLeft);
    for (let k = 0; k < n; k++) {
      const a = w.rAi.int(DIR_N);
      api.spawn(w, 'troupe', st.x + dcos(a) * STAGE.ring, st.y + dsin(a) * STAGE.ring * 0.7);
    }
    f.stageLeft -= n;
    f.stageGap = Math.max(10, f.stageGap - 8);
    f.stageAt = w.tick + f.stageGap;
    w.ev.push(Ev.Foe, st.x, st.y, 18, n, 0);
  }
}

// ───────────────────────── 每只怪每拍 ─────────────────────────

/** dx、dy 是这只怪指向主角的单位向量，d 是距离 */
export function foeAct(w: World, i: number, kind: EnemyKind, d: number, dx: number, dy: number, mv: FoeMv): void {
  switch (kind) {
    case 'zhumu':
      return zhumuAct(w, i, dx, dy);
    case 'shuihou':
      return shuihouAct(w, i, d, dx, dy, mv);
    case 'binghun':
      return binghunAct(w, i, dx, dy);
    case 'wumian':
      return wumianAct(w, i, dx, dy, mv);
    case 'xuetong':
      return xuetongAct(w, i, d, dx, dy, mv);
    case 'guandingui':
      return guandingAct(w, i, d, dx, dy, mv);
    case 'hongyi':
      return hongyiAct(w, i, d, dx, dy, mv);
    case 'hongyiclone':
    case 'ricepile':
    case 'coffin':
      // 假身和摆设到点自己散掉（摆设的寿命在 foeTick 里数）
      if (kind === 'hongyiclone' && --w.eT[i]! <= 0) {
        w.eAlive[i] = 0;
        w.eCount--;
      }
      if (kind !== 'hongyiclone') mv.sp = 0;
      return;
    case 'shuoshu':
      return shuoshuAct(w, i, d, dx, dy, mv);
    case 'crossbow':
      return crossbowAct(w, i, d, dx, dy, mv);
    case 'hurrier':
      return hurrierAct(w, i, mv);
    case 'yelou':
      return yelouAct(w, i, d, dx, dy, mv);
    default:
      return;
  }
}

function zhumuAct(w: World, i: number, dx: number, dy: number): void {
  const ph = api.phase(w, i, PH);
  if (--w.eT[i]! > 0) return;
  w.eT[i] = ZHUMU.every[ph]!;
  const n = w.eV[i]!++;
  const skill = ph === 0 ? (n % 2 === 0 ? 0 : 2) : n % 3;
  const x = w.eX[i]!;
  const y = w.eY[i]!;
  if (skill === 0) {
    // 竹笋：朝主角排一行，一个比一个晚冒
    w.ev.push(Ev.Foe, x, y, 3, 0, 0);
    for (let k = 1; k <= ZHUMU.shoots; k++) addCircle(w, x + dx * ZHUMU.gap * k, y + dy * ZHUMU.gap * k, ZHUMU.shootR, ZHUMU.warn + ZHUMU.stagger * k, ZHUMU.shootDmg * w.eAtk[i]!, 0);
  } else if (skill === 1) {
    // 竹浪：四个方向轮流，空隙落在主角现在站的地方附近
    const c = w.eAX[i]!++ & 3;
    const axis = c & 1;
    const dir = c < 2 ? 1 : -1;
    const p0 = axis === 0 ? w.x : w.y;
    const perp = axis === 0 ? w.y : w.x;
    const gap = perp + (w.rAi.next() - 0.5) * 2 * ZHUMU.waveJitter;
    addWave(w, axis, dir, p0 - dir * ZHUMU.waveReach, p0 + dir * ZHUMU.waveReach, gap, w.eAtk[i]!);
    w.ev.push(Ev.Foe, w.x, w.y, 2, c, 0);
  } else {
    // 召一圈竹精（场上太多就不召）
    let have = 0;
    for (let k = 0; k < MAX_ENEMIES; k++) if (w.eAlive[k] && w.eKind[k] === SPROUT_C) have++;
    if (have > ZHUMU.maxSprouts) return;
    w.ev.push(Ev.Foe, x, y, 3, ZHUMU.spiritRing, 0);
    const off = w.rAi.int(DIR_N);
    for (let k = 0; k < ZHUMU.spirits; k++) {
      const a = off + Math.floor((k * DIR_N) / ZHUMU.spirits);
      api.spawn(w, 'bamsprout', x + dcos(a) * ZHUMU.spiritRing, y + dsin(a) * ZHUMU.spiritRing * 0.8);
    }
  }
}

function shuihouAct(w: World, i: number, d: number, dx: number, dy: number, mv: FoeMv): void {
  const ph = api.phase(w, i, PH);
  const S = SHUIHOU;
  if (w.eS[i] === 1) {
    // 潜水：不动，快冒出来时在主角现在站的位置画圈
    mv.sp = 0;
    if (w.eT[i] === S.warn) {
      w.eAX[i] = w.x;
      w.eAY[i] = w.y;
      addCircle(w, w.x, w.y, S.pounceR, S.warn, S.pounceDmg * w.eAtk[i]!, 1);
    }
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 0;
      w.eT[i] = S.every[ph]!;
      w.eX[i] = w.eAX[i]!;
      w.eY[i] = w.eAY[i]!;
      w.ePX[i] = w.eX[i]!;
      w.ePY[i] = w.eY[i]!;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 5, 0, i);
    }
    return;
  }
  if (w.eS[i] === 3) {
    // 拖人：站住，把人往自己身边拖；走出 dragRange 就断
    mv.sp = 0;
    if (d < S.dragRange && --w.eT[i]! > 0) {
      if (d > 40) {
        w.x -= dx * S.pull;
        w.y -= dy * S.pull;
        api.fixPlayer(w);
      }
    } else {
      w.eS[i] = 0;
      w.eT[i] = S.every[ph]!;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 7, 0, i);
    }
    return;
  }
  if (--w.eT[i]! > 0) return;
  w.eT[i] = S.every[ph]!;
  const n = w.eV[i]!++;
  const skill = ph === 0 ? (n % 2 === 0 ? 0 : 2) : n % 3;
  if (skill === 0) {
    w.eS[i] = 1;
    w.eT[i] = S.dive;
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 4, 0, i);
  } else if (skill === 1) {
    w.eS[i] = 3;
    w.eT[i] = S.dragTicks;
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 7, 1, i);
  } else {
    const a0 = dirIndex(dx, dy);
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 6, a0, i);
    for (let k = -1; k <= 1; k++) {
      const a = a0 + k * S.whipSpread;
      api.shot(w, w.eX[i]!, w.eY[i]! - 20, dcos(a) * S.whipSpeed, dsin(a) * S.whipSpeed, S.whipLife, S.whipDmg * w.eAtk[i]!, S.whipR, 4);
    }
  }
}

function binghunAct(w: World, i: number, dx: number, dy: number): void {
  const ph = api.phase(w, i, PH);
  const x = w.eX[i]!;
  const y = w.eY[i]!;
  if (ph === 1 && --w.eAX[i]! <= 0) {
    w.eAX[i] = BINGHUN.crack.every;
    crackIce(w);
  }
  if (--w.eT[i]! > 0) return;
  w.eT[i] = BINGHUN.every[ph]!;
  if (w.eV[i]!++ % 2 === 0) {
    const f = w.foe;
    f.windT = BINGHUN.windWarn;
    f.windX = x;
    f.windY = y;
    f.windDir = dirIndex(dx, dy);
    f.windAtk = w.eAtk[i]!;
    w.ev.push(Ev.Foe, x, y, 8, f.windDir, BINGHUN.windWarn);
  } else {
    ringCircles(w, x, y, BINGHUN.spikeRing, BINGHUN.spikes, BINGHUN.spikeR, BINGHUN.spikeWarn, BINGHUN.spikeDmg * w.eAtk[i]!, 2);
    if (ph === 1) ringCircles(w, x, y, BINGHUN.ring2, BINGHUN.ring2Spikes, BINGHUN.spikeR, BINGHUN.spikeWarn + 8, BINGHUN.spikeDmg * w.eAtk[i]!, 2);
  }
}

/** 无面佛：eS 0 端坐 1 蓄力 2 冲撞 3 眩晕 4 歇；eT 倒数；eV 数放了几个技能；eAX/eAY 冲撞的方向 */
function wumianAct(w: World, i: number, dx: number, dy: number, mv: FoeMv): void {
  const ph = api.phase(w, i, PH);
  const f = w.foe;
  if (ph === 1 && f.dark === 0) {
    f.dark = 1;
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 12, 0, i);
  }
  const s = w.eS[i]!;
  if (s === 0) {
    mv.sp *= WUMIAN.creep;
    if (--w.eT[i]! > 0) return;
    w.eT[i] = WUMIAN.every[ph]!;
    const n = w.eV[i]!++;
    const cyc = WUMIAN.rings[ph]! + 1;
    if (n % cyc === cyc - 1) {
      w.eS[i] = 1;
      w.eT[i] = WUMIAN.windup;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 10, 0, i);
      return;
    }
    // 四尊小佛轮流放金光圈（二段两尊一起），圈落在主角现在站的地方
    const cast = ph === 0 ? 1 : 2;
    for (let k = 0; k < cast; k++) {
      const idx = (n + k * 2) & 3;
      const sx = f.homeX + (idx === 0 || idx === 3 ? -1 : 1) * WUMIAN.statue * 0.8;
      const sy = f.homeY + (idx < 2 ? -1 : 1) * WUMIAN.statue * 0.55;
      addCircle(w, w.x, w.y, WUMIAN.ringR, WUMIAN.ringWarn, WUMIAN.ringDmg * w.eAtk[i]!, 3);
      w.ev.push(Ev.Foe, sx, sy, 20, idx, 0);
    }
    return;
  }
  if (s === 1) {
    mv.sp = 0;
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 2;
      w.eT[i] = WUMIAN.dash;
      w.eAX[i] = dx;
      w.eAY[i] = dy;
    }
    return;
  }
  if (s === 2) {
    mv.sp = WUMIAN.dashSpeed;
    mv.vx = w.eAX[i]!;
    mv.vy = w.eAY[i]!;
    // 前面是挡路的块（庙柱、墙）：撞上去眩晕
    if (api.blocked(w, w.eX[i]! + w.eAX[i]! * (WUMIAN.dashSpeed + 6), w.eY[i]! + w.eAY[i]! * (WUMIAN.dashSpeed + 6), w.eR[i]!)) {
      w.eS[i] = 3;
      w.eT[i] = WUMIAN.stun;
      mv.sp = 0;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 11, 0, i);
    } else if (--w.eT[i]! <= 0) {
      w.eS[i] = 4;
      w.eT[i] = WUMIAN.rest;
    }
    return;
  }
  // 眩晕、歇着：不动
  mv.sp = 0;
  if (--w.eT[i]! <= 0) {
    w.eS[i] = 0;
    w.eT[i] = WUMIAN.every[ph]!;
  }
}

/** 雪童子：eS 0 走 1 蓄力 2 冲 3 歇；eV 被火打出原形到哪一拍；eAX 这一拍是不是隐在雪里（画面读）；eAY/eT 记冲的方向和倒数 */
function xuetongAct(w: World, i: number, d: number, dx: number, dy: number, mv: FoeMv): void {
  const s = w.eS[i]!;
  const hidden = s === 0 && w.tick >= w.eV[i]! && api.mapEvent(w, 'wind') > 0;
  w.eAX[i] = hidden ? 1 : 0;
  if (s === 0) {
    if (hidden) {
      mv.sp *= XUETONG.creep;
      if (d < XUETONG.reveal) {
        w.eS[i] = 1;
        w.eT[i] = XUETONG.windup;
        w.eAY[i] = dirIndex(dx, dy);
        w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 13, 0, i);
      }
    }
    return;
  }
  if (s === 1) {
    mv.sp = 0;
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 2;
      w.eT[i] = XUETONG.dash;
    }
    return;
  }
  if (s === 2) {
    mv.sp = XUETONG.dashSpeed;
    mv.vx = dcos(w.eAY[i]!);
    mv.vy = dsin(w.eAY[i]!);
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 3;
      w.eT[i] = XUETONG.rest;
    }
    return;
  }
  if (--w.eT[i]! <= 0) w.eS[i] = 0;
}

/** 棺钉鬼：eS 0 躺着（不动）1 棺盖弹开 2 坐着钉钉子；eT 倒数 */
function guandingAct(w: World, i: number, d: number, dx: number, dy: number, mv: FoeMv): void {
  const s = w.eS[i]!;
  if (s === 0) {
    mv.sp = 0;
    if (d < GUANDING.wake) {
      w.eS[i] = 1;
      w.eT[i] = GUANDING.open;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 14, 0, i);
    }
    return;
  }
  if (s === 1) {
    mv.sp = 0;
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 2;
      w.eT[i] = 20;
    }
    return;
  }
  // 坐起来以后：离主角近于 stay 就站住钉，远了慢慢蹭过来
  if (d < 360) mv.sp = 0;
  if (--w.eT[i]! > 0 || d > 520) return;
  w.eT[i] = GUANDING.every;
  const a0 = dirIndex(dx, dy);
  w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 15, a0, i);
  for (let k = -1; k <= 1; k++) {
    const a = a0 + k * GUANDING.spread;
    api.shot(w, w.eX[i]!, w.eY[i]! - 22, dcos(a) * GUANDING.speed, dsin(a) * GUANDING.speed, GUANDING.life, GUANDING.dmg, GUANDING.r, 5);
  }
}

/** 纸弩手：近了退、远了才靠、中间站住；eT 倒数到下一箭，主角在 reach 以内才射 */
function crossbowAct(w: World, i: number, d: number, dx: number, dy: number, mv: FoeMv): void {
  if (d < CROSSBOW.near) {
    mv.vx = -dx;
    mv.vy = -dy;
    mv.sp *= CROSSBOW.back;
  } else if (d < CROSSBOW.far) mv.sp = 0;
  if (--w.eT[i]! > 0 || d > CROSSBOW.reach) return;
  w.eT[i] = CROSSBOW.every;
  api.shot(w, w.eX[i]!, w.eY[i]! - 18, dx * CROSSBOW.speed, dy * CROSSBOW.speed, CROSSBOW.life, CROSSBOW.dmg, CROSSBOW.r, 5);
}

/** 催命鬼：主角在参考位置 still 以内待满 wait 拍就催命（速度乘 rush），一动就清零、换新参考位置 */
function hurrierAct(w: World, i: number, mv: FoeMv): void {
  const ox = w.x - w.eAX[i]!;
  const oy = w.y - w.eAY[i]!;
  if (ox * ox + oy * oy > HURRIER.still * HURRIER.still) {
    w.eAX[i] = w.x;
    w.eAY[i] = w.y;
    w.eV[i] = 0;
    w.eS[i] = 0;
  } else if (++w.eV[i]! >= HURRIER.wait) w.eS[i] = 1;
  if (w.eS[i] === 1) mv.sp *= HURRIER.rush;
}

/** 红衣戏子：eS 0 追 1 水袖蓄力；eT 倒数；eV 数放了几个技能 */
function hongyiAct(w: World, i: number, d: number, dx: number, dy: number, mv: FoeMv): void {
  const ph = api.phase(w, i, PH);
  if (w.eS[i] === 1) {
    mv.sp = 0;
    if (--w.eAY[i]! <= 0) {
      w.eS[i] = 0;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 19, HONGYI.sleeveR, 0);
    }
    return;
  }
  if (--w.eT[i]! > 0) return;
  w.eT[i] = HONGYI.every[ph]!;
  const n = w.eV[i]!++;
  if (ph === 1 || n % 3 === 2) {
    // 换脸：留一个假身在原地，真身闪到主角另一侧
    const x = w.eX[i]!;
    const y = w.eY[i]!;
    const j = api.spawn(w, 'hongyiclone', x, y);
    if (j >= 0) {
      w.eHp[j] = HONGYI.cloneHp;
      w.eHpMax[j] = HONGYI.cloneHp;
    }
    const nx = w.x + dx * HONGYI.cloneOffset;
    const ny = w.y + dy * HONGYI.cloneOffset;
    w.eX[i] = nx;
    w.eY[i] = ny;
    w.ePX[i] = nx;
    w.ePY[i] = ny;
    w.ev.push(Ev.Foe, x, y, 20, 9, i);
  } else {
    w.eS[i] = 1;
    w.eAY[i] = HONGYI.warn;
    addCircle(w, w.eX[i]!, w.eY[i]!, HONGYI.sleeveR, HONGYI.warn, HONGYI.sleeveDmg * w.eAtk[i]!, 5);
  }
  void d;
}

/** 硕鼠将军：eS 0 地面 1 钻地；eT 倒数；eV 数放了几个技能；eAX/eAY 冒出来的落点 */
function shuoshuAct(w: World, i: number, d: number, dx: number, dy: number, mv: FoeMv): void {
  const ph = api.phase(w, i, PH);
  const S = SHUOSHU;
  if (w.eS[i] === 1) {
    mv.sp = 0;
    if (w.eT[i] === S.warn) {
      const a = w.rAi.int(DIR_N);
      w.eAX[i] = w.x + dcos(a) * S.dist;
      w.eAY[i] = w.y + dsin(a) * S.dist * 0.8;
      addCircle(w, w.eAX[i]!, w.eAY[i]!, S.popR, S.warn, S.popDmg * w.eAtk[i]!, 4);
    }
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 0;
      w.eT[i] = S.every[ph]!;
      w.eX[i] = w.eAX[i]!;
      w.eY[i] = w.eAY[i]!;
      w.ePX[i] = w.eX[i]!;
      w.ePY[i] = w.eY[i]!;
      w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 21, 1, i);
      if (ph === 1) for (let k = 0; k < S.rats; k++) api.spawn(w, 'ratdemon', w.eX[i]! + (k - 1.5) * 24, w.eY[i]! + (k % 2) * 22);
    }
    return;
  }
  if (--w.eT[i]! > 0) return;
  w.eT[i] = S.every[ph]!;
  if (w.eV[i]!++ % 2 === 0) {
    w.eS[i] = 1;
    w.eT[i] = S.burrow;
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 21, 0, i);
  } else {
    // 吐米：朝主角的方向并排堆几座米山挡在两人之间
    w.ev.push(Ev.Foe, w.eX[i]!, w.eY[i]!, 22, 0, i);
    for (let k = -1; k <= 1; k++) {
      const j = api.spawn(w, 'ricepile', w.eX[i]! + dx * S.pileFront - dy * S.pileGap * k, w.eY[i]! + dy * S.pileFront + dx * S.pileGap * k);
      if (j < 0) continue;
      w.eHp[j] = S.pileHp;
      w.eHpMax[j] = S.pileHp;
      w.eT[j] = S.pileLife;
    }
  }
  void d;
  void mv;
}
