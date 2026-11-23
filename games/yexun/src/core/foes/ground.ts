/**
 * 首领留在地上的东西的公共写法：先预警后落下的圈、烧一阵的鬼火。index.ts、affix.ts、yelou.ts 共用；
 * 落下、烧人在 index.ts 的 foeTick 里结算。
 */
import { Ev } from '../events.ts';
import type { World } from '../state.ts';
import { MAX_CIRCLES, MAX_FLAMES } from './state.ts';

/** 地上落一个圈：warn 拍后 (x, y) 半径 r 里的主角挨 dmg（slow > 0 再慢那么多拍）；vis 是圈的样子 */
export function addCircle(w: World, x: number, y: number, r: number, warn: number, dmg: number, vis: number, slow = 0): void {
  const f = w.foe;
  for (let k = 0; k < MAX_CIRCLES; k++) {
    if (f.cT[k]! > 0) continue;
    f.cT[k] = warn;
    f.cX[k] = x;
    f.cY[k] = y;
    f.cR[k] = r;
    f.cDmg[k] = dmg;
    f.cVis[k] = vis;
    f.cSlow[k] = slow;
    w.ev.push(Ev.Foe, x, y, 30 + vis, r, warn);
    return;
  }
}

/** 地上烧一团鬼火：life 拍内踩进半径 r 的主角挨 dmg（受伤后的无敌拍照常挡）；满了顶掉最早灭的那团 */
export function addFlame(w: World, x: number, y: number, r: number, life: number, dmg: number, by: number): void {
  const f = w.foe;
  let slot = 0;
  for (let k = 0; k < MAX_FLAMES; k++) {
    if (f.hEnd[k]! <= w.tick) {
      slot = k;
      break;
    }
    if (f.hEnd[k]! < f.hEnd[slot]!) slot = k;
  }
  f.hEnd[slot] = w.tick + life;
  f.hX[slot] = x;
  f.hY[slot] = y;
  f.hR[slot] = r;
  f.hDmg[slot] = dmg;
  f.hBy[slot] = by;
}
