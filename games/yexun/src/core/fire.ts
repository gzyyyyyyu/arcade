/**
 * 火区（DESIGN.md 3.6 乱葬岗、2.3 窑镇）：守夜乱葬岗的磷火地和夜探窑镇的窑口共用这一份规则。
 * 每块火区按拍点轮流起火（content/maps.ts FIRE）：预告 warn 拍、烧 burn 拍，第 k 块错开 k × period / 块数；
 * 乱葬岗的「鬼火齐燃」事件里所有火区一起烧。烧着时火里的怪按最大血掉一截（首领不吃，怕火的怪多掉），主角挨烫。
 * 状态全由拍数算出，不存东西：画面层用 fireStage 读同一份。
 */
import { ENEMIES, ENEMY_BY_KIND } from '../content/enemies.ts';
import { mapEventRound } from '../content/mapEvents.ts';
import { FIRE, FIRE_FEAR, type Rect } from '../content/maps.ts';
import { MAX_ENEMIES, type World } from './state.ts';

/** 火区这一拍的样子：0 没烧、1 预告、2 烧着 */
export type FireStage = 0 | 1 | 2;
export const FIRE_IDLE = 0;
export const FIRE_WARN = 1;
export const FIRE_BURN = 2;

/** 火区烫伤主角时记的来源（死因统计用） */
export const FIRE_BY = 2000;

const FEAR = new Uint8Array(ENEMIES.length);
for (const k of FIRE_FEAR) FEAR[ENEMY_BY_KIND[k].code] = 1;

export interface FireApi {
  hitEnemy(w: World, i: number, dmg: number, slot: number, kx: number, ky: number, knock: number, rehit: number, credit?: number): boolean;
  hurt(w: World, dmg: number, by: number): void;
}

/** 第 k 块火区这一拍：没烧、预告、烧着。all 为真（鬼火齐燃）时全部烧着 */
export function fireStage(tick: number, k: number, n: number, all: boolean): FireStage {
  if (all) return FIRE_BURN;
  if (tick < FIRE.from) return FIRE_IDLE;
  const p = (tick - FIRE.from + Math.floor((k * FIRE.period) / n)) % FIRE.period;
  return p < FIRE.warn ? FIRE_WARN : p < FIRE.warn + FIRE.burn ? FIRE_BURN : FIRE_IDLE;
}

const inRect = (z: Rect, x: number, y: number): boolean => x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;

/** 乱葬岗的「鬼火齐燃」正在进行：所有火区一起烧 */
export function fireAll(w: World): boolean {
  return mapEventRound(w.tick, w.setup, 'allfire') > 0;
}

/** 每拍调一次：只在结算拍（每 FIRE.tickEvery 拍）烧火里的怪和主角 */
export function fireTick(w: World, api: FireApi): void {
  const zones = w.fire;
  if (zones.length === 0 || w.tick % FIRE.tickEvery !== 0) return;
  const all = fireAll(w);
  let player = false;
  for (let k = 0; k < zones.length; k++) {
    if (fireStage(w.tick, k, zones.length, all) !== FIRE_BURN) continue;
    const z = zones[k]!;
    if (inRect(z, w.x, w.y)) player = true;
    for (let i = 0; i < MAX_ENEMIES; i++) {
      if (!w.eAlive[i] || !inRect(z, w.eX[i]!, w.eY[i]!)) continue;
      const def = ENEMIES[w.eKind[i]!]!;
      if (def.boss || def.speed === 0) continue;
      const share = (def.elite ? FIRE.elite : FIRE.mob) * (FEAR[def.code] ? FIRE.fear : 1);
      api.hitEnemy(w, i, w.eHpMax[i]! * share, -1, 0, 0, 0, 0, -1);
    }
  }
  if (player) api.hurt(w, FIRE.player, FIRE_BY);
}
