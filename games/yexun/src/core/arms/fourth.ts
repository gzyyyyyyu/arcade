/**
 * 规则 62 的搭配（DESIGN 3.3e，只娱乐局）：剑走偏锋、笔走龙蛇、判阵、寒钟（锁魂幡挂在勾魂锁和怪死的地方，见 index.ts castChain、second.ts killsTick）。
 * 给搭配少的剑侠、阴阳先生、胖师叔补跨流派的搭配，料用他们池里原来没人拿的件。
 * 能不能合由 MERGES 的 since: 62 把关（World.contentFrom(62) = armsCombos），所以这里只看 w.merges。
 * 和前几批一样只用四则运算，不用随机。
 */
import { COMBO62, WEAPON_IDS, type WeaponId } from '../../content/weapons.ts';
import { ENEMIES } from '../../content/enemies.ts';
import { Ev } from '../events.ts';
import type { Grid } from '../grid.ts';
import { MAX_SHOTS, Shot, type World } from '../state.ts';
import { ArmEv, ArmFx } from './events.ts';
import type { ArmApi } from './index.ts';
import { spawnDart } from './second.ts';

const CODE = Object.fromEntries(WEAPON_IDS.map((id, i) => [id, i])) as Record<WeaponId, number>;

const has = (w: World, id: string): boolean => w.merges.includes(id as never);
function emit(w: World, t: number, x: number, y: number, a = 0, b = 0, c = 0): void {
  w.ev.push(t as unknown as Ev, x, y, a, b, c);
}
function slotOf(w: World, id: WeaponId): number {
  for (let k = 0; k < w.weapons.length; k++) if (w.weapons[k]!.id === id) return k;
  return -1;
}

/** g.out 前 n 只里血最多的（同样多取先查到的）；没有回 -1 */
function mostHp(w: World, g: Grid, n: number): number {
  let best = -1;
  let bh = -1;
  for (let j = 0; j < n; j++) {
    const i = g.out[j]!;
    if (w.eHp[i]! > bh) {
      bh = w.eHp[i]!;
      best = i;
    }
  }
  return best;
}

/** 每拍在第三批之后 */
export function fourthTick(w: World, g: Grid, api: ArmApi): void {
  const ev = w.ev;
  // 剑走偏锋：每把飞出去的飞剑（Ev.Fire 带飞剑的码，位置是剑的位置）甩一枚铜钱镖，铜钱镖自己会弹回来
  if (has(w, 'jianzou')) {
    const kd = slotOf(w, 'dart');
    if (kd >= 0) {
      const M = COMBO62.jianzou;
      const dmg = api.eff(w, w.wstats[kd]!).dmg * M.mul;
      const evo = w.weapons[kd]!.evolved ? 1 : 0;
      for (let q = 0; q < ev.n; q++) {
        if (ev.type[q] !== Ev.Fire || ev.a[q] !== CODE.flysword) continue;
        const t = api.nearest(w, g, ev.x[q]!, ev.y[q]!, M.reach);
        if (t < 0) continue;
        spawnDart(w, ev.x[q]!, ev.y[q]!, t, dmg, kd, evo);
        emit(w, ArmEv.Combo, ev.x[q]!, ev.y[q]!, ArmFx.Jianzou, 0);
      }
    }
  }
  // 笔走龙蛇：每推一道浪，浪前血最多的那只挨一笔
  if (has(w, 'longshe')) {
    const kb = slotOf(w, 'brush');
    let fired = false;
    for (let q = 0; q < ev.n && !fired; q++) fired = ev.type[q] === Ev.Fire && ev.a[q] === CODE.tide;
    if (kb >= 0 && fired) {
      const M = COMBO62.longshe;
      const t = mostHp(w, g, g.query(w, w.x, w.y, M.reach));
      if (t >= 0) {
        emit(w, ArmEv.Combo, w.eX[t]!, w.eY[t]!, ArmFx.Longshe, 0);
        api.hitEnemy(w, t, api.eff(w, w.wstats[kb]!).dmg * M.mul, -1, 0, 0, 0, 0, kb);
      }
    }
  }
  // 判阵：隔一会儿点名方阵里血最多的一只
  if (has(w, 'panzhen') && w.arms.zones.length > 0 && w.tick % COMBO62.panzhen.every === 0) {
    const kb = slotOf(w, 'brush');
    if (kb >= 0) judge(w, g, api, kb);
  }
  // 寒钟：铃一响，泉里的怪定住一下
  if (has(w, 'hanzhong')) {
    let rang = false;
    for (let q = 0; q < ev.n && !rang; q++) rang = ev.type[q] === Ev.Bell;
    if (rang) chill(w, g);
  }
}

function judge(w: World, g: Grid, api: ArmApi, kb: number): void {
  const M = COMBO62.panzhen;
  let best = -1;
  let bh = -1;
  for (const z of w.arms.zones) {
    // 方阵是正方形：先按外接圆查，再按边框筛
    const n = g.query(w, z.x, z.y, z.half * 1.5);
    for (let j = 0; j < n; j++) {
      const i = g.out[j]!;
      const dx = w.eX[i]! - z.x;
      const dy = w.eY[i]! - z.y;
      if ((dx < 0 ? -dx : dx) > z.half || (dy < 0 ? -dy : dy) > z.half) continue;
      if (w.eHp[i]! > bh) {
        bh = w.eHp[i]!;
        best = i;
      }
    }
  }
  if (best < 0) return;
  const A = w.arms;
  // 易伤和勾魂锁、钟鼓齐鸣共用一份：倍数大的、时间长的留着，不把别人的盖低
  const end = w.tick + M.ticks;
  if (A.vulnUntil[best]! <= w.tick || A.vulnMul[best]! < M.vuln) A.vulnMul[best] = M.vuln;
  if (A.vulnUntil[best]! < end) A.vulnUntil[best] = end;
  emit(w, ArmEv.Combo, w.eX[best]!, w.eY[best]!, ArmFx.Panzhen, 0);
  api.hitEnemy(w, best, api.eff(w, w.wstats[kb]!).dmg * M.mul, -1, 0, 0, 0, 0, kb);
}

function chill(w: World, g: Grid): void {
  const M = COMBO62.hanzhong;
  for (let p = 0; p < MAX_SHOTS; p++) {
    if (!w.sAlive[p] || w.sKind[p] !== Shot.Spring) continue;
    const n = g.query(w, w.sX[p]!, w.sY[p]!, w.sR[p]!);
    if (n === 0) continue;
    emit(w, ArmEv.Combo, w.sX[p]!, w.sY[p]!, ArmFx.Hanzhong, w.sR[p]!);
    for (let j = 0; j < n; j++) {
      const i = g.out[j]!;
      const e = ENEMIES[w.eKind[i]!]!;
      if (e.boss) continue;
      const t = w.tick + (e.elite ? M.ticks >> 1 : M.ticks);
      if (w.eBind[i]! < t) w.eBind[i] = t;
    }
  }
}
