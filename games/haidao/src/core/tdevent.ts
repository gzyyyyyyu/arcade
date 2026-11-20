/**
 * 守岛关内事件和大潮每周海况（DESIGN 10.6g）：
 * - 战役：关卡写了 events，开局用这一局的种子（独立的一条流 'td.event'）在每条的波段里挑一波发生，提前一波写进预告；
 * - 大潮：tideSetup 按周写 killGoldPct / heroCdPct（和开局金、雾区），同一周所有人一样。
 * 只在关卡写了这些字段时建状态（s.happen）。
 */
import { TD2_EVENT, TD2_NAV_SKILL } from '../content/td2units.ts';
import { Rng } from './rng.ts';
import { tdWaveLanes } from './tdquery.ts';
import { addGold, d2, inner, waveGold } from './tdstate.ts';
import type { TdState } from './tdstate.ts';
import { UNIT } from './types.ts';
import type { TdEnemy, TdEvent, TdEventKind } from './tdtypes.ts';

/** 开局（createTd 最后调）：关卡写了事件或海况才建 s.happen */
export function initHappen(s: TdState, seed: number): void {
  const lv = s.level;
  if (!lv.events?.length && lv.killGoldPct === undefined && lv.heroCdPct === undefined) return;
  const rng = new Rng(seed, 'td.event');
  const at: Array<{ wave: number; kind: TdEventKind }> = [];
  // 首领波不挑：战书会把首领也翻多，赏金船、暴雨压在首领波上一下子太乱
  for (const e of lv.events ?? []) {
    const pool: number[] = [];
    for (let w = e.from; w <= Math.min(e.to, lv.waves.length - 1); w++) if (!lv.waves[w]?.boss && !at.some((a) => a.wave === w)) pool.push(w);
    if (pool.length === 0) continue;
    at.push({ wave: pool[rng.int(pool.length)] as number, kind: e.kind });
  }
  s.happen = { at, dare: [] };
}

/** 第 w 波（0 起）发生什么事件（开局挑好的）；没有为 null */
export function eventAt(s: TdState, w: number): TdEventKind | null {
  return s.happen?.at.find((a) => a.wave === w)?.kind ?? null;
}

/** 现在在下雨：正在打的这一波（最近开打的那一波）是暴雨波 */
export function raining(s: TdState): boolean {
  return s.happen !== undefined && eventAt(s, s.wave - 1) === 'rain';
}

/** 英雄技能的冷却（大潮英雄周减半）：没有海况原样返回 */
export function heroCd(s: TdState, cd: number): number {
  const pct = s.happen ? s.level.heroCdPct : undefined;
  return pct === undefined ? cd : Math.max(1, Math.floor((cd * pct) / 100));
}

/** 打死一个敌人给多少局内金：大潮海况的击杀金百分比、接了战书的波翻倍，倒在航海士重赏圈里的再翻倍（和战书相乘） */
export function killGold(s: TdState, e: TdEnemy, base: number): number {
  const h = s.happen;
  let g = base;
  if (h) {
    if (s.level.killGoldPct !== undefined) g = Math.floor((base * s.level.killGoldPct) / 100);
    if (h.dare.includes(e.wave)) g *= TD2_EVENT.dare.goldMul;
  }
  // 重赏：只有航海士的局才有 hero.reward，船长局走不到这里
  const rw = s.hero.reward;
  if (rw && s.tick < rw.until && d2(e.x, e.y, rw.x, rw.y) <= TD2_NAV_SKILL.reward.r * TD2_NAV_SKILL.reward.r) g *= TD2_NAV_SKILL.reward.mul;
  return g;
}

/** 第 w 波一组 n 个敌人：接了战书多 morePct%（向下取整，单个的首领、精英不会翻成两个） */
export function dareCount(s: TdState, w: number, n: number): number {
  if (!s.happen?.dare.includes(w)) return n;
  return Math.floor((n * (100 + TD2_EVENT.dare.morePct)) / 100);
}

/** 现在按战书会怎样：'take' 接下一波（s.wave）的战书，'drop' 把接了的退掉，null 下一波没有战书。界面和规则共用 */
export function tdDareCan(s: TdState): 'take' | 'drop' | null {
  const h = s.happen;
  if (!h || s.wave >= s.level.waves.length || eventAt(s, s.wave) !== 'dare') return null;
  return h.dare.includes(s.wave) ? 'drop' : 'take';
}

export function toggleDare(s: TdState, ev: TdEvent[]): void {
  const h = s.happen;
  const can = tdDareCan(s);
  if (!h || !can) return;
  if (can === 'take') h.dare.push(s.wave);
  else h.dare = h.dare.filter((w) => w !== s.wave);
  ev.push({ type: 'dare', wave: s.wave, on: can === 'take' });
}

/**
 * 第 w 波开打（startWave 调）：是赏金波就排一个赏金船上岸。从这一波第一条登陆路上岸，往离它最远的另一条登陆路跑
 * （同样远取下标小的；只有一条路就原路回去）
 */
export function queueBounty(s: TdState, w: number): void {
  if (eventAt(s, w) !== 'bounty') return;
  const lanes = tdWaveLanes(s, w);
  const from = lanes[0] ?? s.level.lanes[0];
  if (!from) return;
  const fx = from.x * UNIT + 50;
  const fy = from.y * UNIT + 50;
  let exit = { x: fx, y: fy };
  let bd = -1;
  for (const l of s.level.lanes) {
    const p = { x: l.x * UNIT + 50, y: l.y * UNIT + 50 };
    const d = d2(p.x, p.y, fx, fy);
    if (d > bd) {
      bd = d;
      exit = p;
    }
  }
  const I = inner(s);
  I.spawns.push({ t: s.tick + TD2_EVENT.bounty.delay, kind: 'sailor', x: fx, y: fy, wave: w, exit });
  I.waveLeft[w] = (I.waveLeft[w] ?? 0) + 1;
}

/** 赏金船被打倒（damageEnemy 调）：多给这一波击杀金的 goldPct%（至少 minGold） */
export function payBounty(s: TdState, ev: TdEvent[], e: TdEnemy): void {
  const b = TD2_EVENT.bounty;
  const gold = Math.max(b.minGold, Math.floor((waveGold(s.level, e.wave) * b.goldPct) / 100));
  addGold(s, gold);
  ev.push({ type: 'bounty', what: 'paid', id: e.id, x: e.x, y: e.y, gold });
}
