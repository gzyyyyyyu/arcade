/**
 * 每局不一样（DESIGN 15）：漂流宝箱、中途援军，外加撤回的判断。纯函数、整数、确定性：
 * 各用战斗种子派生的独立 sfc32 流（'fun.chest'、'fun.ally'），不碰登陆战自己的 'land' 流，所以开关关着时整局和没有这个功能时逐位一致。
 * 只有 setup.fun 写了才生效；服务端重放（异步攻防）、悬赏、航线、守岛的 setup 不带 fun，永远关。
 */
import { FUN } from '../content/fun.ts';
import { TROOPS } from '../content/index.ts';
import { Rng } from './rng.ts';
import { cellIdx, GRID, inGrid, inIsle } from './grid.ts';
import { BEACH, ISLAND, UNIT } from './types.ts';
import type { BBuilding, BChest, BUnit, BattleEvent, BattleSetup, BattleState, ChestReward, TroopKind } from './types.ts';

export interface AllyPlan {
  at: number;
  x: number;
  y: number;
  kind: TroopKind;
  level: number;
  count: number;
}

export interface FunState {
  chest: boolean;
  ally?: AllyPlan & { rng: Rng; warned: boolean; landed: boolean };
  /** 护盾：兵 id → 到哪一拍之前挨打减半 */
  shield: number[];
}

/** 援军靠岸点：岛外半格多的海滩上（ext 是岛扩了几圈） */
function allyPoint(rng: Rng, ext: number): { x: number; y: number } {
  const side = rng.int(4);
  const t = 200 + rng.int(ISLAND * UNIT - 400);
  const out = -150 - ext * UNIT;
  const far = (ISLAND + ext) * UNIT + 150;
  if (side === 0) return { x: out, y: t };
  if (side === 1) return { x: far, y: t };
  if (side === 2) return { x: t, y: out };
  return { x: t, y: far };
}

/** 援军的规模：总血量约占玩家船队的 hpPct%，种类由流抽，等级取船队平均 */
export function allyPlan(setup: BattleSetup, rng: Rng): AllyPlan {
  const at = FUN.ally.atMin + rng.int(FUN.ally.atSpan);
  const p = allyPoint(rng, setup.ext ?? 0);
  const kind = FUN.ally.kinds[rng.int(FUN.ally.kinds.length)] ?? 'sailor';
  let hp = 0;
  let lvSum = 0;
  let n = 0;
  for (const b of setup.army.boats) {
    const l = TROOPS[b.troop].levels[b.level - 1];
    if (!l) continue;
    hp += l.hp * b.count;
    lvSum += b.level;
    n++;
  }
  const levels = TROOPS[kind].levels;
  const level = Math.max(1, Math.min(levels.length, n ? Math.round(lvSum / n) : 1));
  const per = levels[level - 1]?.hp ?? 1;
  const count = Math.max(1, Math.min(FUN.ally.maxCount, Math.floor((hp * FUN.ally.hpPct) / 100 / per)));
  return { at, x: p.x, y: p.y, kind, level, count };
}

/** 兵走得进去的空地（按 grid.ts 的 cellIdx 下标）：从海滩往里 4 邻域扩散，建筑（含城墙、装饰、地雷）占的格子过不去，所以城墙圈里的格子到不了 */
export function reachableCells(buildings: readonly BBuilding[], ext: number): boolean[] {
  const blocked = new Array<boolean>(GRID * GRID).fill(false);
  for (const b of buildings) for (let j = 0; j < b.size; j++) for (let i = 0; i < b.size; i++) blocked[cellIdx(b.x + i, b.y + j)] = true;
  const seen = new Array<boolean>(GRID * GRID).fill(false);
  const q: Array<[number, number]> = [];
  for (let cy = -BEACH - ext; cy < ISLAND + BEACH + ext; cy++) {
    for (let cx = -BEACH - ext; cx < ISLAND + BEACH + ext; cx++) {
      if (inIsle(ext, cx, cy)) continue;
      seen[cellIdx(cx, cy)] = true;
      q.push([cx, cy]);
    }
  }
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h] as [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inGrid(ext, nx, ny)) continue;
      const n = cellIdx(nx, ny);
      if (seen[n] || blocked[n]) continue;
      seen[n] = true;
      q.push([nx, ny]);
    }
  }
  return seen.map((v, i) => v && !blocked[i]);
}

/** 撒宝箱：可达的岛内空格里按流抽，箱与箱至少隔 gap 格 */
export function placeChests(buildings: readonly BBuilding[], ext: number, rng: Rng): BChest[] {
  const ok = reachableCells(buildings, ext);
  let cand: Array<[number, number]> = [];
  for (let cy = -ext; cy < ISLAND + ext; cy++) for (let cx = -ext; cx < ISLAND + ext; cx++) if (ok[cellIdx(cx, cy)]) cand.push([cx, cy]);
  const out: BChest[] = [];
  const want = FUN.chest.min + rng.int(FUN.chest.extra);
  for (let i = 0; i < want && cand.length > 0; i++) {
    const [cx, cy] = cand[rng.int(cand.length)] as [number, number];
    const reward = FUN.chest.rewards[rng.int(FUN.chest.rewards.length)] as ChestReward;
    out.push({ id: i + 1, x: cx * UNIT + UNIT / 2, y: cy * UNIT + UNIT / 2, reward, taken: false });
    cand = cand.filter(([x, y]) => Math.max(Math.abs(x - cx), Math.abs(y - cy)) >= FUN.chest.gap);
  }
  return out;
}

/** 开局：没有开关返回 undefined，调用方一项都不碰 */
export function makeFun(setup: BattleSetup, buildings: readonly BBuilding[]): { fun: FunState; chests?: BChest[] } | undefined {
  const f = setup.fun;
  if (!f || (!f.chest && !f.ally)) return undefined;
  const fun: FunState = { chest: f.chest === true, shield: [] };
  let chests: BChest[] | undefined;
  if (f.chest) chests = placeChests(buildings, setup.ext ?? 0, new Rng(setup.seed, 'fun.chest'));
  if (f.ally) {
    const rng = new Rng(setup.seed, 'fun.ally');
    fun.ally = { ...allyPlan(setup, rng), rng, warned: false, landed: false };
  }
  return chests ? { fun, chests } : { fun };
}

/** 援军还没靠岸：整局不能算"兵打光了"而提前结束 */
export function allyPending(f: FunState | undefined): boolean {
  return !!f?.ally && !f.ally.landed;
}

/** 护盾期间挨打折算（damageUnit 用） */
export function funCut(f: FunState | undefined, id: number, tick: number, dmg: number): number {
  if (!f || (f.shield[id] ?? 0) <= tick) return dmg;
  return Math.floor((dmg * (100 - FUN.chest.shieldCutPct)) / 100);
}

/** 进指纹的东西（只在开着时追加） */
export function funFingerprint(f: FunState, chests: readonly BChest[] | undefined): number[] {
  const parts: number[] = [];
  for (const c of chests ?? []) parts.push(c.id, c.x, c.y, c.taken ? 1 : 0);
  if (f.ally) parts.push(f.ally.at, f.ally.landed ? 1 : 0, ...f.ally.rng.snapshot());
  for (const v of f.shield) parts.push(v ?? 0);
  return parts;
}

/** 一拍里的宝箱拾取和援军；返回新的 nextUnit（援军要领新 id） */
export function stepFun(s: BattleState, ev: BattleEvent[], f: FunState, nextUnit: number): number {
  if (f.chest && s.chests) {
    for (const c of s.chests) {
      if (c.taken) continue;
      const r = FUN.chest.pickR;
      const taker = s.units.find((u) => u.mode !== 'dead' && (u.x - c.x) * (u.x - c.x) + (u.y - c.y) * (u.y - c.y) <= r * r);
      if (!taker) continue;
      c.taken = true;
      let amount: number;
      if (c.reward === 'energy') {
        const before = s.energy;
        s.energy = Math.min(FUN.energyCap, s.energy + FUN.chest.energy);
        amount = s.energy - before;
      } else if (c.reward === 'heal') {
        amount = FUN.chest.healPct;
        for (const u of s.units) {
          if (u.mode === 'dead' || u.hp >= u.maxHp) continue;
          const add = Math.min(u.maxHp - u.hp, Math.floor((u.maxHp * FUN.chest.healPct) / 100));
          u.hp += add;
          if (add > 0) ev.push({ type: 'heal', id: u.id, amount: add });
        }
      } else {
        amount = FUN.chest.shieldTicks;
        for (const u of s.units) if (u.mode !== 'dead') f.shield[u.id] = s.tick + FUN.chest.shieldTicks;
      }
      ev.push({ type: 'chest', id: c.id, x: c.x, y: c.y, reward: c.reward, amount });
    }
  }
  const a = f.ally;
  if (a && !a.landed) {
    if (!a.warned && s.tick >= a.at - FUN.ally.warnTicks) {
      a.warned = true;
      ev.push({ type: 'ally', phase: 'warn', x: a.x, y: a.y, at: a.at, units: [] });
    }
    if (s.tick >= a.at) {
      a.landed = true;
      const lvl = TROOPS[a.kind].levels[a.level - 1];
      const ids: number[] = [];
      if (lvl) {
        for (let i = 0; i < a.count; i++) {
          const u: BUnit = {
            id: nextUnit++,
            kind: a.kind,
            level: a.level,
            x: a.x + a.rng.int(121) - 60,
            y: a.y + a.rng.int(121) - 60,
            hp: lvl.hp,
            maxHp: lvl.hp,
            target: -1,
            mode: 'move',
            face: 1,
            cd: s.tick,
          };
          s.units.push(u);
          ids.push(u.id);
        }
      }
      ev.push({ type: 'ally', phase: 'land', x: a.x, y: a.y, at: a.at, units: ids });
    }
  }
  return nextUnit;
}
