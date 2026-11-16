/**
 * 被震晕的画面（震荡炮，DESIGN 13）：头顶三颗小星绕着转、人晃一晃；守岛的敌人和进攻的兵共用这一份。
 * 减少动效时：星静止不转、人不晃，只有一圈静态的星。
 */
import { REDUCED } from './feel.ts';

/** 晃动角度（弧度）：左右快速小幅摇，被震的人站不稳 */
export function wobbleAt(now: number, phase = 0): number {
  return REDUCED ? 0 : Math.sin(now / 52 + phase) * 0.11;
}

/** 三颗星绕头的位置（相对头顶）：椭圆轨道，后半圈在头后（画小、淡），前半圈在头前 */
export function starOrbit(i: number, now: number, still = REDUCED): { dx: number; dy: number; s: number; a: number; front: boolean } {
  const an = (i / 3) * Math.PI * 2 + (still ? 0.4 : now / 260);
  const c = Math.cos(an);
  const sn = Math.sin(an);
  return { dx: c * 18, dy: sn * 6.5, s: 0.85 + 0.25 * sn, a: 0.85 + 0.15 * sn, front: sn >= 0 };
}
