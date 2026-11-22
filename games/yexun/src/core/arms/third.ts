/**
 * 第三批搭配（DESIGN 3.3c）：符火燎原、铃符、铃焰、钟鼓齐鸣。
 * 目的是把被镇魂铃起手那条挤出线的流派（烈火、符箓、镇守、阵法）抬回来，所以都是「往上补」：只给这些搭配的持有者加输出。
 * 能不能合由宝箱（core/step.ts mergeOpen）把关，所以这里只看 w.merges。
 * 和第二批一样只用四则运算，随机不用。
 */
import { COMBO55, WEAPON_CODE, type WeaponId } from '../../content/weapons.ts';
import { Ev } from '../events.ts';
import type { Grid } from '../grid.ts';
import { MAX_ENEMIES, type World } from '../state.ts';
import { ArmEv, ArmFx } from './events.ts';
import type { ArmApi } from './index.ts';

const tmp = new Int32Array(MAX_ENEMIES);

const has = (w: World, id: string): boolean => w.merges.includes(id as never);
function emit(w: World, t: number, x: number, y: number, a = 0, b = 0, c = 0): void {
  w.ev.push(t as unknown as Ev, x, y, a, b, c);
}
function slotOf(w: World, id: WeaponId): number {
  for (let k = 0; k < w.weapons.length; k++) if (w.weapons[k]!.id === id) return k;
  return -1;
}

/** 给一只怪上易伤（和勾魂锁共用同一份 vulnUntil / vulnMul，取倍数大的、时间长的，不把别人的盖低） */
function vuln(w: World, i: number, mul: number, ticks: number): void {
  const A = w.arms;
  const end = w.tick + ticks;
  if (A.vulnUntil[i]! > w.tick && A.vulnMul[i]! >= mul) {
    if (A.vulnUntil[i]! < end) A.vulnUntil[i] = end;
    return;
  }
  A.vulnUntil[i] = end;
  A.vulnMul[i] = mul;
}

/** (x, y) 在不在某座方阵里 */
function inZone(w: World, x: number, y: number): boolean {
  for (const z of w.arms.zones) {
    const dx = x - z.x;
    const dy = y - z.y;
    if ((dx < 0 ? -dx : dx) <= z.half && (dy < 0 ? -dy : dy) <= z.half) return true;
  }
  return false;
}

/** 每拍在第二批之后：四个搭配 */
export function thirdTick(w: World, g: Grid, api: ArmApi): void {
  // 铃符 / 铃焰 / 钟鼓齐鸣：都挂在镇魂铃响的那一拍上
  if (has(w, 'linfu') || has(w, 'lingyan') || has(w, 'zhonggu')) {
    const q = w.ev.find(Ev.Bell);
    if (q >= 0) bellCombos(w, g, api, w.ev.b[q]!);
  }
  // 符火燎原：每放一次符，最近的怪脚下烧起一摊火（火摊用火葫芦的伤害）
  if (has(w, 'fuhuo') && w.ev.find(Ev.Fire, WEAPON_CODE.talisman) >= 0) {
    const kg = slotOf(w, 'gourd');
    if (kg >= 0) {
      const M = COMBO55.fuhuo;
      const t = api.nearest(w, g, w.x, w.y, M.reach);
      if (t >= 0) {
        const life = Math.round(M.life * w.stats.durMul);
        api.burn(w, w.eX[t]!, w.eY[t]!, life, api.eff(w, w.wstats[kg]!).dmg * M.mul * w.mergePower('fuhuo'), M.r, kg);
        emit(w, ArmEv.Combo, w.eX[t]!, w.eY[t]!, ArmFx.Fuhuo, M.r);
      }
    }
  }
}

/** 铃响那一拍的三个搭配；r 是铃光环半径 */
function bellCombos(w: World, g: Grid, api: ArmApi, r: number): void {
  const n = g.query(w, w.x, w.y, r);
  if (n === 0) return;
  for (let j = 0; j < n; j++) tmp[j] = g.out[j]!;
  if (has(w, 'linfu')) {
    const kt = slotOf(w, 'talisman');
    if (kt >= 0) {
      let best = -1;
      let bh = -1;
      for (let j = 0; j < n; j++) {
        const i = tmp[j]!;
        if (w.eHp[i]! > bh) {
          bh = w.eHp[i]!;
          best = i;
        }
      }
      emit(w, ArmEv.Combo, w.eX[best]!, w.eY[best]!, ArmFx.Linfu, 0);
      api.hitEnemy(w, best, api.eff(w, w.wstats[kt]!).dmg * COMBO55.linfu.mul * w.mergePower('linfu'), -1, 0, 0, 0, 0, kt);
    }
  }
  if (has(w, 'lingyan') && Math.floor(w.tick / 15) % COMBO55.lingyan.rings === 0) {
    const kg = slotOf(w, 'gourd');
    const t = kg >= 0 ? api.nearest(w, g, w.x, w.y, r) : -1;
    if (t >= 0) {
      const M = COMBO55.lingyan;
      api.burn(w, w.eX[t]!, w.eY[t]!, Math.round(M.life * w.stats.durMul), api.eff(w, w.wstats[kg]!).dmg * M.mul * w.mergePower('lingyan'), M.r, kg);
      emit(w, ArmEv.Combo, w.eX[t]!, w.eY[t]!, ArmFx.Lingyan, M.r);
    }
  }
  if (has(w, 'zhonggu') && inZone(w, w.x, w.y)) {
    const M = COMBO55.zhonggu;
    // 规则 63 的初成：只打折多出来的那部分（+40% → +20%），大成原样
    const p = w.mergePower('zhonggu');
    const mul = p === 1 ? M.mul : 1 + (M.mul - 1) * p;
    for (let j = 0; j < n; j++) vuln(w, tmp[j]!, mul, M.ticks);
    emit(w, ArmEv.Combo, w.x, w.y, ArmFx.Zhonggu, r);
  }
}
