/**
 * 首领连战的词缀（design 第 7 节，数值 content/rushFoes.ts AFFIX_FX）。
 * 连战生成首领后调 affixInit 记下词缀（w.eAffix 位掩码 = AFFIX_IDS 下标）并占一格 FoeState 的词缀状态；
 * 敌人循环里 eAffix ≠ 0 的每拍调 affixTick。地上的鬼火在 index.ts foeTick 里烧人，影子随本体倒下在 foeTick 里散掉。
 * 符印「镇尺」：倍数类只取一半加成，召唤、分身数减半，护盾、吸血、鬼火伤害、风的拽力减半。
 *
 * 发的事件（Ev.Foe，c = 首领下标）：60 上护盾（b = 盾量）61 护盾破 62 分身（b = 几个）63 召小怪（b = 几只）64 狂
 * 65 风预警（b = 预警拍）66 风开始拽（b = 拽几拍）67 吸血（b = 回了多少）68 影子散了（本体倒下，c = 影子下标）
 */
import { ENEMY_BY_KIND, type EnemyKind } from '../../content/enemies.ts';
import { PLAYER } from '../../content/player.ts';
import { vigilRegion } from '../../content/regions.ts';
import { AFFIX_FX, AFFIX_IDS, type AffixId } from '../../content/rushFoes.ts';
import { DIR_N } from '../dirs.ts';
import { Ev } from '../events.ts';
import { dcos, dsin, fsqrt } from '../fmath.ts';
import type { World } from '../state.ts';
import type { FoeApi } from './api.ts';
import { addFlame } from './ground.ts';
import { MAX_AFFIXED } from './state.ts';

/** 词缀的位 */
export const AFFIX_BIT = Object.fromEntries(AFFIX_IDS.map((id, k) => [id, 1 << k])) as Record<AffixId, number>;
const B = AFFIX_BIT;
const SHADOW: EnemyKind = 'yingzi';
const SHADOW_C = ENEMY_BY_KIND.yingzi.code;

/** 这只怪身上的词缀（按 AFFIX_IDS 的顺序） */
export function affixList(w: World, i: number): AffixId[] {
  const m = w.eAffix[i]!;
  return AFFIX_IDS.filter((id) => (m & B[id]) !== 0);
}

/** 带了符印「镇尺」 */
function ruler(w: World): boolean {
  return w.rushRelics.includes('ruler');
}

/** 倍数类的加成：镇尺只取一半 */
function boost(k: number, half: boolean): number {
  return half ? 1 + (k - 1) / 2 : k;
}

function slotOf(w: World, i: number): number {
  const f = w.foe;
  for (let s = 0; s < MAX_AFFIXED; s++) if (f.aI[s] === i && f.aGen[s] === w.eGen[i]) return s;
  return -1;
}

function freeSlot(w: World): number {
  const f = w.foe;
  for (let s = 0; s < MAX_AFFIXED; s++) {
    const j = f.aI[s]!;
    if (j < 0 || !w.eAlive[j] || w.eGen[j] !== f.aGen[s]) return s;
  }
  return -1;
}

/** 首领刚生成（血、贴身伤害、eAtk 都已按关设好）后调：记词缀、铁加血、疾加速，排好各词缀的第一次 */
export function affixInit(w: World, i: number, affixes: readonly AffixId[]): void {
  if (affixes.length === 0) return;
  let m = 0;
  for (const a of affixes) m |= B[a];
  const s = freeSlot(w);
  if (s < 0) return;
  const f = w.foe;
  f.used = true;
  w.eAffix[i] = m;
  f.aI[s] = i;
  f.aGen[s] = w.eGen[i]!;
  f.aSummon[s] = AFFIX_FX.summon.first;
  f.aShieldT[s] = AFFIX_FX.shield.first;
  f.aShield[s] = -1;
  f.aWind[s] = AFFIX_FX.wind.first;
  f.aPull[s] = 0;
  f.aDone[s] = 0;
  f.aHp[s] = w.hp;
  const half = ruler(w);
  if (m & B.tough) {
    const k = boost(AFFIX_FX.tough, half);
    w.eHp[i]! *= k;
    w.eHpMax[i]! *= k;
  }
  if (m & B.swift) w.eSpeed[i]! *= boost(AFFIX_FX.swift, half);
}

/** 护盾还剩多少（没有盾 0）；画面画金圈、血条扣掉它 */
export function affixShieldLeft(w: World, i: number): number {
  const s = slotOf(w, i);
  if (s < 0) return 0;
  const base = w.foe.aShield[s]!;
  return base < 0 ? 0 : Math.max(0, w.eHp[i]! - base);
}

/** 风：还在预警（负数，剩几拍）、正在拽（正数，剩几拍）、没有（0）；画面画拽的线 */
export function affixPull(w: World, i: number): number {
  const s = slotOf(w, i);
  return s < 0 ? 0 : w.foe.aPull[s]!;
}

/** 每拍（敌人循环里，eAffix ≠ 0 的首领） */
export function affixTick(w: World, i: number, api: FoeApi): void {
  const s = slotOf(w, i);
  if (s < 0) return;
  const f = w.foe;
  const m = w.eAffix[i]!;
  const half = ruler(w);
  const x = w.eX[i]!;
  const y = w.eY[i]!;
  const max = w.eHpMax[i]!;

  // 护：盾在时 eHp 比底线多出的那截就是盾；打到底线就破
  if (f.aShield[s]! >= 0 && w.eHp[i]! <= f.aShield[s]!) {
    f.aShield[s] = -1;
    w.ev.push(Ev.Foe, x, y, 61, 0, i);
  }
  if (m & B.shield && f.aShield[s]! < 0 && --f.aShieldT[s]! <= 0) {
    f.aShieldT[s] = AFFIX_FX.shield.every;
    const amt = max * AFFIX_FX.shield.hp * (half ? 0.5 : 1);
    f.aShield[s] = w.eHp[i]!;
    w.eHp[i]! += amt;
    w.ev.push(Ev.Foe, x, y, 60, amt, i);
  }
  const real = f.aShield[s]! >= 0 ? Math.min(w.eHp[i]!, f.aShield[s]!) : w.eHp[i]!;

  if (m & B.split && !(f.aDone[s]! & 1) && real < max * AFFIX_FX.split.at) {
    f.aDone[s]! |= 1;
    const S = AFFIX_FX.split;
    const n = half ? Math.ceil(S.n / 2) : S.n;
    const off = w.rAi.int(DIR_N);
    for (let k = 0; k < n; k++) {
      const a = off + Math.floor((k * DIR_N) / n);
      const j = api.spawn(w, SHADOW, x + dcos(a) * S.ring, y + dsin(a) * S.ring * 0.8);
      if (j < 0) continue;
      w.eHp[j] = max * S.hp;
      w.eHpMax[j] = max * S.hp;
      w.eDmg[j] = w.eDmg[i]! * S.dmg;
      w.eSpeed[j] = Math.max(w.eSpeed[j]!, w.eSpeed[i]!);
      // 影子记住本体（下标和代数），本体倒了它就散（foeTick）
      w.eAX[j] = i;
      w.eAY[j] = w.eGen[i]!;
    }
    w.ev.push(Ev.Foe, x, y, 62, n, i);
  }

  if (m & B.summon && --f.aSummon[s]! <= 0) {
    const S = AFFIX_FX.summon;
    f.aSummon[s] = S.every;
    const n = half ? Math.ceil(S.n / 2) : S.n;
    const mobs = vigilRegion(w.mapId)?.mobs;
    const kind: EnemyKind = mobs && mobs.length > 0 ? mobs[w.rAi.int(mobs.length)]!.kind : 'paper';
    const off = w.rAi.int(DIR_N);
    for (let k = 0; k < n; k++) {
      const a = off + Math.floor((k * DIR_N) / n);
      api.spawn(w, kind, x + dcos(a) * S.ring, y + dsin(a) * S.ring * 0.8);
    }
    w.ev.push(Ev.Foe, x, y, 63, n, i);
  }

  if (m & B.rage && !(f.aDone[s]! & 2) && real < max * AFFIX_FX.rage.at) {
    f.aDone[s]! |= 2;
    const k = boost(AFFIX_FX.rage.dmg, half);
    w.eDmg[i]! *= k;
    w.eAtk[i]! *= k;
    w.eSpeed[i]! *= boost(AFFIX_FX.rage.speed, half);
    w.ev.push(Ev.Foe, x, y, 64, 0, i);
  }

  if (m & B.trail && w.tick % AFFIX_FX.trail.every === 0) {
    const T = AFFIX_FX.trail;
    addFlame(w, x, y, T.r, T.life, w.eDmg[i]! * T.dmg * (half ? 0.5 : 1), w.eKind[i]!);
  }

  if (m & B.leech) {
    // 吸：主角这一拍掉了血、记在它名下、又贴着它，就是被它撞的
    const dx = w.x - x;
    const dy = w.y - y;
    const rr = w.eR[i]! + PLAYER.r + 4;
    if (w.hp < f.aHp[s]! && w.hurtBy === w.eKind[i] && dx * dx + dy * dy <= rr * rr) {
      const heal = max * AFFIX_FX.leech.heal * (half ? 0.5 : 1);
      if (f.aShield[s]! >= 0) {
        const add = Math.min(heal, max - f.aShield[s]!);
        f.aShield[s]! += add;
        w.eHp[i]! += add;
      } else w.eHp[i] = Math.min(max, w.eHp[i]! + heal);
      w.ev.push(Ev.Foe, x, y, 67, heal, i);
    }
    f.aHp[s] = w.hp;
  }

  if (m & B.wind) {
    const W = AFFIX_FX.wind;
    if (f.aPull[s]! < 0) {
      if (++f.aPull[s]! === 0) {
        f.aPull[s] = W.pull;
        w.ev.push(Ev.Foe, x, y, 66, W.pull, i);
      }
    } else if (f.aPull[s]! > 0) {
      f.aPull[s]!--;
      const dx = x - w.x;
      const dy = y - w.y;
      const d = fsqrt(dx * dx + dy * dy);
      if (d > W.near) {
        const sp = W.speed * (half ? 0.5 : 1);
        w.x += (dx / d) * sp;
        w.y += (dy / d) * sp;
        api.fixPlayer(w);
      }
    } else if (--f.aWind[s]! <= 0) {
      f.aWind[s] = W.every;
      f.aPull[s] = -W.warn;
      w.ev.push(Ev.Foe, x, y, 65, W.warn, i);
    }
  }
}

/** 影子：本体（eAX 下标、eAY 代数）不在了就散 */
export function shadowOrphan(w: World, i: number): boolean {
  if (w.eKind[i] !== SHADOW_C) return false;
  const p = w.eAX[i]!;
  return !w.eAlive[p] || w.eGen[p] !== w.eAY[i];
}
