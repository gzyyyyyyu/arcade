/**
 * 守岛给界面和机器人的查询（不改状态）：登陆点和落潮路、到宝藏的路线、波次预告、造塔能不能放、卖塔退钱、清障和叫波的价。英雄自己守的站位也用这里的路线。
 */
import { TD_WALL_COST } from '../content/tdunits.ts';
import { TD2_ECON, TD2_ENEMIES, TD2_NAV_SKILL } from '../content/td2units.ts';
import { INF, cellOf, cellX, cellY, nextCell } from './grid.ts';
import { UNIT } from './types.ts';
import { TD_ARMORS, TD_ENEMY_ARMOR } from './td2types.ts';
import { escortMeet } from './escort.ts';
import type { TdArmor, TdRouteLine, WaveLanePreview, WavePreview } from './td2types.ts';
import type { TdLevel } from './tdtypes.ts';
import { inner, isAir, ensureWaves, ensureGrid, treasureFlow, enemyHp, gapBefore, waveGold, slotTower } from './tdstate.ts';
import type { TdState } from './tdstate.ts';
import { dareCount, eventAt } from './tdevent.ts';

/** 第 w 波（0 起）开打时落潮路是不是开着：写了 `tideOpen` 按名单，没写就是 `tide.wave` 起一直开着 */
export function tideOpenAt(lv: TdLevel, w: number): boolean {
  if (!lv.tide) return false;
  return lv.tideOpen ? lv.tideOpen.includes(w) : w >= lv.tide.wave;
}

/** 这一局第 w 波落潮路开不开：关卡的潮 + 玩家关了水闸的波（章末机制，tdmech.ts；没有水闸的局和 tideOpenAt 一样） */
export function tdTideOpen(s: TdState, w: number): boolean {
  return tideOpenAt(s.level, w) && !(s.sluice?.shut.includes(w) ?? false);
}

/**
 * 现在开着的登陆路（格子）：落潮前不含落潮路。机器人和画面层用。
 * 潮水涨落的关（写了 `tideOpen`）按"最近开打的那一波"算，下一波的潮用 `tdNextTide` 预告。
 */
export function tdLanes(s: TdState): Array<{ x: number; y: number }> {
  const lv = s.level;
  const out = lv.lanes.slice();
  if (lv.tide && (lv.tideOpen ? tdTideOpen(s, Math.max(0, s.wave - 1)) : s.wave >= lv.tide.wave)) out.push(lv.tide.lane);
  return out;
}

/** 涨落的潮：下一波开打时落潮路是开（true）还是关（false）；不是涨落的关、没有下一波为 null。画面层提前预告用 */
export function tdNextTide(s: TdState): boolean | null {
  const lv = s.level;
  if (!lv.tide || !lv.tideOpen || s.wave >= lv.waves.length) return null;
  return tdTideOpen(s, s.wave);
}

/** 从某格出发，地面敌人去最近宝藏箱会走的格子序列（不含起点，最多 200 步）。机器人选塔位、英雄站位用 */
export function tdRoute(s: TdState, cx: number, cy: number): number[] {
  ensureGrid(s);
  const I = inner(s);
  const x0 = cx * UNIT + 50;
  const y0 = cy * UNIT + 50;
  let best: Int32Array | null = null;
  let bd = INF;
  for (let i = 0; i < s.treasures.length; i++) {
    const f = treasureFlow(s, i, TD_WALL_COST);
    const d = f[cellOf(x0, y0)] as number;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  const out: number[] = [];
  if (!best) return out;
  let x = x0;
  let y = y0;
  for (let k = 0; k < 200; k++) {
    const n = nextCell(I.occ, s.ext, best, x, y);
    if (n < 0) break;
    out.push(n);
    x = cellX(n);
    y = cellY(n);
  }
  return out;
}


/** 第 w 波第 g 组实际走哪条路：落潮路（下标 = lanes.length）在涨潮的波、关了水闸的波改走 0 号路 */
export function laneOf(s: TdState, lane: number, w: number): number {
  const lv = s.level;
  if (lane === lv.lanes.length) return tdTideOpen(s, w) ? lane : 0;
  return lane % Math.max(1, lv.lanes.length);
}

/** 一条登陆路（下标同 laneOf）的格子坐标 */
export function laneCell(lv: TdLevel, lane: number): { x: number; y: number } | undefined {
  return lane === lv.lanes.length ? lv.tide?.lane : lv.lanes[lane];
}

/** 第 w 波从哪几个登陆口上岛（格子坐标，按出现顺序去重）：竖屏开场推镜、开新一波时镜头跟过去都读它 */
export function tdWaveLanes(s: TdState, w: number): Array<{ x: number; y: number }> {
  const lv = s.level;
  ensureWaves(lv, w + 1);
  const wave = lv.waves[w];
  if (!wave) return [];
  const seen = new Set<number>();
  const out: Array<{ x: number; y: number }> = [];
  for (const g of wave.groups) {
    const lane = laneOf(s, g.lane, w);
    if (seen.has(lane)) continue;
    seen.add(lane);
    const c = laneCell(lv, lane);
    if (c) out.push({ x: c.x, y: c.y });
  }
  return out;
}

/** 还有敌人没上岛的最早一波（0 起）；都上岛了或还没开波为 -1。竖屏自动构图用它判断"人马上要来"，没人来时镜头不动 */
export function tdIncomingWave(s: TdState): number {
  let w = -1;
  for (const sp of inner(s).spawns) if (w < 0 || sp.wave < w) w = sp.wave;
  return w;
}

/** 这条地面路线有没有经过雾区（雾区按 fogFrom 晚来的，按那一波算） */
function routeFoggy(s: TdState, lane: number, w: number): boolean {
  const zones = s.level.fogZones;
  if (!zones || zones.length === 0) return false;
  if (s.level.fogFrom !== undefined && w < s.level.fogFrom) return false;
  const c = laneCell(s.level, lane);
  if (!c) return false;
  for (const cell of tdRoute(s, c.x, c.y)) {
    const x = cellX(cell);
    const y = cellY(cell);
    for (const z of zones) {
      // 雾区圆心是格子坐标、按格子中心算（和 inFogZone 一致）
      const dx = x - Math.round(z.x * UNIT + UNIT / 2);
      const dy = y - Math.round(z.y * UNIT + UNIT / 2);
      const r = Math.round(z.r * UNIT);
      if (dx * dx + dy * dy <= r * r) return true;
    }
  }
  return false;
}

/**
 * 下 n 波（从还没开打的第 s.wave 波起）的预告：每路什么敌人几个、护甲占比（卡上「下一座造」由画面拿它去问 counterKind）。
 * 界面和机器人都只读它。等效血量 = 统一敌人表 × 关卡 hpPct × 波次 hpPct（分裂小艇算上分出来的）。
 */
export function tdPreview(s: TdState, n = 2): WavePreview[] {
  const lv = s.level;
  ensureWaves(lv, s.wave + n);
  const out: WavePreview[] = [];
  let at = s.next;
  for (let w = s.wave; w < Math.min(lv.waves.length, s.wave + n); w++) {
    const wave = lv.waves[w] as TdLevel['waves'][number];
    const byLane = new Map<number, WaveLanePreview>();
    const hp: Record<TdArmor, number> = { cloth: 0, heavy: 0, wood: 0, air: 0 };
    for (const g of wave.groups) {
      const lane = laneOf(s, g.lane, w);
      let lp = byLane.get(lane);
      if (!lp) {
        lp = { lane, fly: true, enemies: [] };
        byLane.set(lane, lp);
      }
      const def = TD2_ENEMIES[g.enemy];
      const armor = TD_ENEMY_ARMOR[g.enemy];
      if (armor !== 'air') lp.fly = false;
      const fog = !!def.fog || (armor !== 'air' && routeFoggy(s, lane, w));
      const n = dareCount(s, w, g.n);
      const same = lp.enemies.find((e) => e.kind === g.enemy && e.fog === fog);
      if (same) same.n += n;
      else lp.enemies.push({ kind: g.enemy, armor, n, fog });
      let one = enemyHp(lv, g.enemy, w);
      if (def.split) one += enemyHp(lv, def.split.kind, w) * def.split.n;
      hp[armor] += one * n;
    }
    const total = hp.cloth + hp.heavy + hp.wood + hp.air;
    const share: Record<TdArmor, number> = { cloth: 0, heavy: 0, wood: 0, air: 0 };
    let top: TdArmor | null = null;
    for (const a of TD_ARMORS) {
      share[a] = total > 0 ? Math.floor((hp[a] * 100) / total) : 0;
      if (hp[a] > 0 && (top === null || hp[a] > hp[top])) top = a;
    }
    if (w > s.wave && at >= 0) at += gapBefore(lv, w);
    const p: WavePreview = {
      wave: w,
      at: s.next < 0 ? -1 : at,
      boss: !!wave.boss,
      tide: lv.tide ? tdTideOpen(s, w) : null,
      lanes: [...byLane.values()].sort((a, b) => a.lane - b.lane),
      armorShare: share,
    };
    if (wave.note) p.note = wave.note;
    const happen = eventAt(s, w);
    if (happen) {
      p.event = happen;
      if (happen === 'dare') p.dare = !!s.happen?.dare.includes(w);
    }
    if (s.escort) {
      // 先头敌人和船最早相遇在航线哪一格（各组取最靠前的；追不上 -1）
      let meet = -1;
      for (const g of wave.groups) {
        const c = laneCell(lv, laneOf(s, g.lane, w));
        if (!c) continue;
        const m = escortMeet(s.escort, s.next < 0 ? 0 : Math.max(0, at - s.tick), c, TD2_ENEMIES[g.enemy].speed);
        if (m >= 0 && (meet < 0 || m < meet)) meet = m;
      }
      p.meet = meet;
    }
    out.push(p);
  }
  return out;
}

/** 每条登陆路（含落潮路）到宝藏箱的地面路线；落潮路按下一波开不开标 open。墙破、墙修后再调就是新路线 */
export function tdRoutes(s: TdState): TdRouteLine[] {
  const lv = s.level;
  const out: TdRouteLine[] = lv.lanes.map((l, i) => ({ lane: i, x: l.x, y: l.y, cells: tdRoute(s, l.x, l.y), tide: false, open: true }));
  if (lv.tide) {
    const l = lv.tide.lane;
    const open = s.wave < lv.waves.length ? tdTideOpen(s, s.wave) : tdTideOpen(s, Math.max(0, s.wave - 1));
    out.push({ lane: lv.lanes.length, x: l.x, y: l.y, cells: tdRoute(s, l.x, l.y), tide: true, open });
  }
  return out;
}

/**
 * 这块木台现在为什么造不了（只看「有人站在上面」这两条，钱、解锁、有塔由调用方另判）：
 * 'enemy' 有地面敌人站在台上（造上去会把它卡在塔里），'hero' 活着的英雄站在台上（同理），能造为 null。
 * build 和界面共用这一个函数：界面据此把塔卡画成不可点并说明原因，不自己重算规则（以前点了没反应、没有任何提示）。
 */
export function tdBuildBlock(s: TdState, slot: number): 'enemy' | 'hero' | null {
  const sl = s.slots[slot];
  if (!sl) return null;
  for (const e of s.enemies) {
    if ((e.mode === 'in' || e.mode === 'out') && !isAir(e.kind) && e.x >= sl.x * UNIT && e.x < (sl.x + 2) * UNIT && e.y >= sl.y * UNIT && e.y < (sl.y + 2) * UNIT) return 'enemy';
  }
  const h = s.hero;
  if (Math.abs(h.x - (sl.x * UNIT + 100)) < 100 && Math.abs(h.y - (sl.y * UNIT + 100)) < 100 && h.respawn < 0) return 'hero';
  return null;
}

/** 卖掉某块木台（或驻守台）上的塔能退多少金：已花的 TD2_ECON.sellPct%（驻守台的塔按同阶木台塔的花费算）；没塔为 -1 */
export function tdSellRefund(s: TdState, slot: number): number {
  const sl = s.slots[slot];
  const t = slotTower(s, slot);
  if (!sl || !t) return -1;
  return Math.floor(((sl.spent ?? 0) * TD2_ECON.sellPct) / 100);
}

/** 花钱立刻清掉一块障碍（压木台的沉船、木桶）要多少金；清不了（没有、已经没了）为 -1 */
export function tdClearCost(s: TdState, id: number): number {
  const b = s.blocks.find((q) => q.id === id);
  return !b || b.destroyed ? -1 : TD2_ECON.clearGold;
}

/**
 * 现在叫下一波能拿多少金、抵掉多少拍英雄技能冷却：
 * 金 = ⌊下一波击杀金 × 剩余倒数 ÷ 这段倒数总长 × callPct%⌋（航海士的被动精打细算再 × TD2_NAV_SKILL.call.pct%），冷却 = 剩余倒数 × callCdPct%。没有下一波、已经到点为 0。
 */
export function tdCallBonus(s: TdState): { gold: number; cdCut: number } {
  if (s.wave >= s.level.waves.length || s.next <= s.tick) return { gold: 0, cdCut: 0 };
  const left = s.next - s.tick;
  const total = Math.max(left, inner(s).cdTotal);
  const gold = Math.floor((waveGold(s.level, s.wave) * left * TD2_ECON.callPct) / (total * 100));
  return {
    gold: s.hero.kind ? Math.floor((gold * TD2_NAV_SKILL.call.pct) / 100) : gold,
    cdCut: Math.floor((left * TD2_ECON.callCdPct) / 100),
  };
}
