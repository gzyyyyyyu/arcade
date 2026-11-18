/**
 * 守岛章末机制（规则版本 16，DESIGN 10.6d）：每章最后两关给玩家多一件工具，不用就和没有一样——
 * 漂流补给箱（第一章）、潮汐水闸（第二章）、岸防老炮（第三章）。只由关卡字段打开，规则版本低于 RULES_SINCE.tdChapterMech 的局一律不建、遇到操作忽略，旧回放逐位不变。
 */
import { TD2_BATTERY, TD2_CRATE } from '../content/td2units.ts';
import { inGrid } from './grid.ts';
import { tideOpenAt } from './tdquery.ts';
import { HIT_KEG, addGold, d2, inner, waveGold } from './tdstate.ts';
import type { TdState } from './tdstate.ts';
import { RULES_SINCE, UNIT } from './types.ts';
import type { TdEvent } from './tdtypes.ts';

/** 开局时按关卡字段建好章末机制的状态（createTd 最后调） */
export function initMech(s: TdState): void {
  if (s.rules < RULES_SINCE.tdChapterMech) return;
  const lv = s.level;
  if (lv.sluice && lv.tide && lv.tideOpen) s.sluice = { left: lv.sluice, shut: [] };
  if (lv.battery) s.battery = { x: lv.battery.x, y: lv.battery.y, ready: 0 };
  if (lv.crates?.length) s.drift = { crates: [], chase: -1 };
}

/** 第 w 波开打：这一波写了补给箱就在沙滩上漂来一个（startWave 调） */
export function driftCrates(s: TdState, ev: TdEvent[], w: number): void {
  const d = s.drift;
  if (!d) return;
  for (const c of s.level.crates ?? []) {
    if (c.wave !== w) continue;
    const box = { id: inner(s).nextId++, x: c.x * UNIT + 50, y: c.y * UNIT + 50, until: s.tick + TD2_CRATE.ticks, wave: w };
    d.crates.push(box);
    ev.push({ type: 'crate', what: 'drift', id: box.id, x: box.x, y: box.y, until: box.until, gold: 0 });
  }
}

/** 叫英雄去捡：走过去，不改他的守点（捡到或箱子漂走后回守点）；倒下了、箱子不在了不理 */
export function fetchCrate(s: TdState, id: number): void {
  const d = s.drift;
  const box = d?.crates.find((c) => c.id === id);
  if (!d || !box || s.hero.respawn >= 0) return;
  d.chase = id;
  s.hero.goal = { x: box.x, y: box.y };
  s.hero.clear = -1;
  inner(s).heroAuto = false;
}

/** 玩家另外指挥了英雄（走位、清障）：不再惦记箱子 */
export function forgetFetch(s: TdState): void {
  if (s.drift) s.drift.chase = -1;
}

/** 每拍（英雄走完之后）：英雄够得着的箱子捡起来，到时间的漂走；被叫去捡的那个没了就让英雄回守点 */
export function stepCrates(s: TdState, ev: TdEvent[]): void {
  const d = s.drift;
  if (!d || d.crates.length === 0) return;
  const h = s.hero;
  const keep: typeof d.crates = [];
  for (const c of d.crates) {
    if (h.respawn < 0 && d2(h.x, h.y, c.x, c.y) <= TD2_CRATE.pickR * TD2_CRATE.pickR) {
      const gold = Math.max(TD2_CRATE.minGold, Math.floor((waveGold(s.level, c.wave) * TD2_CRATE.goldPct) / 100));
      addGold(s, gold);
      h.kegReady = Math.min(h.kegReady, s.tick);
      h.barricadeReady = Math.min(h.barricadeReady ?? 0, s.tick);
      ev.push({ type: 'crate', what: 'pick', id: c.id, x: c.x, y: c.y, until: c.until, gold });
    } else if (s.tick >= c.until) {
      ev.push({ type: 'crate', what: 'gone', id: c.id, x: c.x, y: c.y, until: c.until, gold: 0 });
    } else {
      keep.push(c);
      continue;
    }
    if (d.chase === c.id) {
      d.chase = -1;
      h.goal = h.post ? { ...h.post } : null;
      inner(s).heroAuto = true;
    }
  }
  d.crates = keep;
  // 叫去捡的英雄停下了却没捡到（走不到、被别的事拉走）：不再惦记它，交回守点逻辑
  if (d.chase >= 0 && !h.goal) d.chase = -1;
}

/**
 * 老炮往 (x, y) 打一发：冷却好了、落点在格子里才打；1 秒后按炸药桶同一套爆炸结算（爆破、雾里照打、炸障碍不炸自己人），
 * 伤害由 td.ts 按这一关的平均敌人血量算好传进来
 */
export function fireBattery(s: TdState, ev: TdEvent[], x: number, y: number, dmg: number): void {
  const b = s.battery;
  if (!b || s.tick < b.ready || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (!inGrid(Math.floor(tx / UNIT), Math.floor(ty / UNIT))) return;
  const t1 = s.tick + TD2_BATTERY.delay;
  b.ready = s.tick + TD2_BATTERY.cd;
  inner(s).pend.push({ t: t1, kind: 'heroKeg', id: -1, dmg, x: tx, y: ty, r: TD2_BATTERY.r, hit: HIT_KEG, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0 });
  ev.push({ type: 'battery', x0: b.x * UNIT + 50, y0: b.y * UNIT + 50, x1: tx, y1: ty, t1, ready: b.ready });
}

/**
 * 现在按水闸会怎样：'shut' 关上下一波（s.wave）的落潮路，'open' 把已经关上的重新打开（退回次数），null 按了没用
 * （没有水闸、下一波本来就涨潮、次数用完、没有下一波）。界面的按钮和规则共用这一个判断。
 */
export function tdSluiceCan(s: TdState): 'shut' | 'open' | null {
  const sl = s.sluice;
  if (!sl || s.wave >= s.level.waves.length) return null;
  if (sl.shut.includes(s.wave)) return 'open';
  return sl.left > 0 && tideOpenAt(s.level, s.wave) ? 'shut' : null;
}

export function toggleSluice(s: TdState, ev: TdEvent[]): void {
  const sl = s.sluice;
  const can = tdSluiceCan(s);
  if (!sl || !can) return;
  if (can === 'shut') {
    sl.shut.push(s.wave);
    sl.left--;
  } else {
    sl.shut = sl.shut.filter((w) => w !== s.wave);
    sl.left++;
  }
  ev.push({ type: 'sluice', wave: s.wave, shut: can === 'shut', left: sl.left });
}
