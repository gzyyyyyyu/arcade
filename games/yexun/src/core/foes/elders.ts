/**
 * 老首领的行为：尸王（boss）、纸扎老爷（lord）、画皮（huapi）；数值在 content/enemies.ts 的 BOSS、LORD、HUAPI。
 * step.ts 的 moveEnemies 每拍调 bossAct / lordAct / huapiAct；要用的 step.ts 私有函数走 bindFoeApi（同 index.ts）。
 */
import { BOSS, ENEMY_BY_KIND, HUAPI, LORD } from '../../content/enemies.ts';
import { DIR_N } from '../dirs.ts';
import { Ev } from '../events.ts';
import { dcos, dsin, fsqrt } from '../fmath.ts';
import { MAX_ENEMIES, type World } from '../state.ts';
import { api } from './api.ts';
/**
 * 尸王：eT 倒数到下一个技能；eS = 1 时正在跳砸（eAX/eAY 是每拍的位移方向，速度另算）。
 * 跳砸：在主角站的地方画圈警告，boss 用 stompWarn 拍跳过去，落地一圈伤害。
 */
export function bossAct(w: World, i: number, sp: number): number {
  const phase = bossPhase(w, i, BOSS.phaseAt);
  const raged = phase === 2;
  const stompR = BOSS.stompRadius * (raged ? BOSS.ragedStomp : 1);
  if (w.eS[i] === 1) {
    // 跳砸中：直线飞向落点
    if (--w.eT[i]! <= 0) {
      w.eS[i] = 0;
      w.eT[i] = BOSS.every[phase]!;
      w.ev.push(Ev.Boss, w.eX[i]!, w.eY[i]!, 1, stompR);
      const dx = w.x - w.eX[i]!;
      const dy = w.y - w.eY[i]!;
      if (dx * dx + dy * dy < stompR * stompR) api.hurt(w, BOSS.stompDmg, w.eKind[i]!);
      return 0;
    }
    return w.eV[i]!;
  }
  if (--w.eT[i]! > 0) return sp;
  // 一段只有跳砸和召唤；二段起加尸气
  const skill = w.rAi.int(phase === 0 ? 2 : 3);
  if (skill === 0) {
    // 落点：主角现在的位置；每拍走 (距离 / 拍数)，这一跳的速度记在 eV
    const tx = w.x;
    const ty = w.y;
    const dx = tx - w.eX[i]!;
    const dy = ty - w.eY[i]!;
    const d = fsqrt(dx * dx + dy * dy) || 1;
    w.eS[i] = 1;
    w.eT[i] = BOSS.stompWarn;
    w.eAX[i] = dx / d;
    w.eAY[i] = dy / d;
    w.eV[i] = d / BOSS.stompWarn;
    w.ev.push(Ev.Boss, tx, ty, 0, stompR);
    return 0;
  }
  w.eT[i] = BOSS.every[phase]!;
  if (skill === 1) {
    w.ev.push(Ev.Boss, w.eX[i]!, w.eY[i]!, 2, 90);
    const n = raged ? BOSS.ragedSummon : BOSS.summon;
    for (let k = 0; k < n; k++) {
      const a = (k * DIR_N) / n;
      api.spawn(w, 'jiangshi', w.eX[i]! + dcos(a) * 90, w.eY[i]! + dsin(a) * 90);
    }
  } else {
    w.ev.push(Ev.Boss, w.eX[i]!, w.eY[i]!, 3, 0);
    // 三段：两圈，第二圈错开半格、慢一点
    for (let ring = 0; ring < (raged ? 2 : 1); ring++) {
      const n = BOSS.breath + 6 * ring;
      const off = w.rAi.int(DIR_N);
      const v = BOSS.breathSpeed * (ring === 0 ? 1 : 0.7);
      for (let k = 0; k < n; k++) {
        const a = off + Math.floor((k * DIR_N) / n);
        api.shot(w, w.eX[i]!, w.eY[i]! - 30, dcos(a) * v, dsin(a) * v, 240, BOSS.breathDmg, 12, 0, 0);
      }
    }
  }
  return sp;
}

/** Boss 现在是第几段（血线 at 从高到低）；刚进新一段时发一个事件（a = 4，b = 段号），画面层吼一声、出横幅 */
export function bossPhase(w: World, i: number, at: readonly number[]): number {
  const f = w.eHp[i]! / w.eHpMax[i]!;
  let p = 0;
  while (p < at.length && f < at[p]!) p++;
  if (p > w.ePhase[i]!) {
    w.ePhase[i] = p;
    w.ev.push(Ev.Boss, w.eX[i]!, w.eY[i]!, 4, p, w.eKind[i]!);
  }
  return w.ePhase[i]!;
}

/** 纸扎老爷：eT 倒数到下一个技能，eS 数放了几个技能（二段每第三个召纸轿），eAX 是纸钱圈转到的方向 */
export function lordAct(w: World, i: number, dx: number, dy: number): void {
  const phase = bossPhase(w, i, [0.5]);
  if (--w.eT[i]! > 0) return;
  w.eT[i] = LORD.every[phase]!;
  w.eS[i]!++;
  if (phase === 1 && w.eS[i]! % 3 === 0) {
    let have = 0;
    for (let k = 0; k < MAX_ENEMIES; k++) if (w.eAlive[k] && w.eKind[k] === PALANQUIN_CODE) have++;
    if (have < LORD.maxPalanquin) {
      // 召来的纸轿不掉宝箱（eV = 1）
      const j = api.spawn(w, 'palanquin', w.eX[i]! - dx * 90, w.eY[i]! - dy * 90);
      if (j >= 0) w.eV[j] = 1;
      w.ev.push(Ev.Boss, w.eX[i]!, w.eY[i]!, 5, 0);
      return;
    }
  }
  // 撒纸钱：一圈（二段两圈，第二圈错开半格）慢慢旋开
  w.ev.push(Ev.Boss, w.eX[i]!, w.eY[i]!, 6, 0);
  w.eAX[i] = (w.eAX[i]! + 5) & (DIR_N - 1);
  for (let ring = 0; ring <= phase; ring++) {
    const off = w.eAX[i]! + ring * (DIR_N / LORD.money / 2);
    const v = LORD.moneySpeed * (ring === 0 ? 1 : 0.8);
    for (let k = 0; k < LORD.money; k++) {
      const a = off + Math.floor((k * DIR_N) / LORD.money);
      api.shot(w, w.eX[i]!, w.eY[i]! - 40, dcos(a) * v, dsin(a) * v, LORD.moneyLife, LORD.moneyDmg, LORD.moneyR, 2, ring);
    }
  }
}
const PALANQUIN_CODE = ENEMY_BY_KIND.palanquin.code;
const SKIN_CODE = ENEMY_BY_KIND.huapiskin.code;

/** 画皮出场离主角多远：在 spawnMin–spawnMax 里抽（走 rSpawn 流，和别的刷怪一样） */
export function huapiDist(w: World): number {
  return HUAPI.spawnMin + w.rSpawn.next() * (HUAPI.spawnMax - HUAPI.spawnMin);
}

/**
 * 画皮：eS 0 混迹 / 1 现形，eAY 记"混迹时挨过打"（只提示一次），eT 倒数到下一次甩分身。
 * 混迹时和普通怪一样追人、不放技能；血掉到 revealAt 现形并立刻甩一次；现形后缠丝常驻（silkUntil 每拍续上）。
 */
export function huapiAct(w: World, i: number, sp: number, d: number): number {
  const f = w.eHp[i]! / w.eHpMax[i]!;
  if (w.eS[i] === 0) {
    if (f < HUAPI.revealAt) {
      w.eS[i] = 1;
      w.ev.push(Ev.Huapi, w.eX[i]!, w.eY[i]!, 2, i);
      w.eT[i] = HUAPI.every[0]!;
      huapiClones(w, i);
    }
    return sp;
  }
  // 一拍里主角先走、怪后动，所以要续到下一拍：+2
  if (d < HUAPI.silkR) w.silkUntil = w.tick + 2;
  if (--w.eT[i]! <= 0) {
    w.eT[i] = HUAPI.every[f < HUAPI.rageAt ? 1 : 0]!;
    huapiClones(w, i);
  }
  return sp * HUAPI.revealSpeed;
}

/** 在主角四周落 clones 个人皮分身（场上最多 maxClones 个），血和寿命按 HUAPI 定，不随时间涨 */
function huapiClones(w: World, i: number): void {
  let have = 0;
  for (let k = 0; k < MAX_ENEMIES; k++) if (w.eAlive[k] && w.eKind[k] === SKIN_CODE) have++;
  const n = Math.min(HUAPI.clones, HUAPI.maxClones - have);
  if (n <= 0) return;
  const off = w.rAi.int(DIR_N);
  let made = 0;
  for (let k = 0; k < n; k++) {
    const a = off + Math.floor((k * DIR_N) / n);
    const j = api.spawn(w, 'huapiskin', w.x + dcos(a) * HUAPI.cloneRing, w.y + dsin(a) * HUAPI.cloneRing * 0.8);
    if (j < 0) continue;
    w.eHp[j] = HUAPI.cloneHp;
    w.eHpMax[j] = HUAPI.cloneHp;
    w.eT[j] = HUAPI.cloneLife;
    made++;
  }
  w.ev.push(Ev.Huapi, w.eX[i]!, w.eY[i]!, 3, made);
}
