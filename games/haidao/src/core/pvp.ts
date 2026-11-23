/**
 * 异步攻防的规则部分（DESIGN.md 第 5 节）：重放结算、掠夺、奖杯、流浪海盗岛。纯函数，浏览器和服务端（worker/pvp）共用同一份，
 * 结算以服务端重放为准；浏览器只拿来显示和本地回放。时间、随机数一律由调用方传进来。
 */
import { BUILDINGS, CAMPAIGN, LEAGUES, RAID_HERO, SKILLS } from '../content/index.ts';
import { battleFingerprint, battleResult, createBattle, stepBattle } from './battle.ts';
import { BATTLE_TICKS, BEACH, EXT_MAX, ISLAND, RULES_VERSION, UNIT } from './types.ts';
import type { ArmySetup, BattleAction, BattleResult, BattleSetup, Placed, Res, SkillKind } from './types.ts';
import { isObj } from './validate.ts';

/** 防守方一场最多掉仓库里的百分之几（按摧毁率折算） */
export const LOOT_PCT = 20;
/** 上传快照时带的「这份存档已经加 / 扣过的 raidId」最多几个：浏览器带最近这么多，服务端超了整份不认 */
export const APPLIED_MAX = 100;
/** 进攻方另得的系统赏金（掠夺的百分之几） */
export const BOUNTY_PCT = 50;
/** 流浪海盗岛：掠夺按关卡掠夺的百分之几给 */
export const WANDER_LOOT_PCT = 50;
/** 一场最多交多少条操作（船最多十几条、技能按能量最多十几次，留足余量） */
export const MAX_ACTIONS = 200;

/**
 * 按"布局 + 部队 + 种子 + 操作 + 结束拍"重放。endTick 是进攻方点"结束"时的拍数（不点就打到自然结束），
 * 和 BattleScene 一样：只推进到 endTick 之前。actions 先按拍稳定排序，和 runBattle 的取法一致。
 */
export function replayRaid(setup: BattleSetup, actions: BattleAction[], endTick = BATTLE_TICKS): { result: BattleResult; fingerprint: number; ticks: number; buildings: HitBuilding[] } {
  const s = createBattle(setup);
  const sorted = actions.map((a, i) => ({ a, i })).sort((p, q) => p.a.t - q.a.t || p.i - q.i);
  let k = 0;
  while (!s.over && s.tick < endTick) {
    const now: BattleAction[] = [];
    while (k < sorted.length && (sorted[k]?.a.t ?? 0) <= s.tick) now.push(sorted[k++]!.a);
    stepBattle(s, now);
  }
  return { result: { ...battleResult(s), over: true }, fingerprint: battleFingerprint(s), ticks: s.tick, buildings: s.buildings.map(({ id, hp, maxHp, destroyed }) => ({ id, hp, maxHp, destroyed })) };
}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
// 坐标先按扩得最大的岛放宽，落在不在这一局的海滩上由 canLand 判
const CMIN = -(BEACH + EXT_MAX) * UNIT;
const CMAX = (ISLAND + BEACH + EXT_MAX) * UNIT;

/** 浏览器交上来的操作 → 只留认得的字段；有一条不合格就整串作废（null）。别的字段（星数、摧毁率、掠夺）一律不看 */
export function sanitizeActions(raw: unknown, army: ArmySetup): BattleAction[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ACTIONS) return null;
  const out: BattleAction[] = [];
  for (const a of raw) {
    if (isObj(a) && a.type === 'recall') {
      // 撤回：只有拍和船，没有坐标
      if (!isInt(a.t, 0, BATTLE_TICKS) || !isInt(a.boat, 0, army.boats.length - 1)) return null;
      out.push({ t: a.t, type: 'recall', boat: a.boat });
      continue;
    }
    if (!isObj(a) || !isInt(a.t, 0, BATTLE_TICKS) || !isInt(a.x, CMIN, CMAX) || !isInt(a.y, CMIN, CMAX)) return null;
    if (a.type === 'land') {
      if (!isInt(a.boat, 0, army.boats.length - 1)) return null;
      out.push({ t: a.t, type: 'land', boat: a.boat, x: a.x, y: a.y });
    } else if (a.type === 'skill') {
      if (typeof a.skill !== 'string' || !Object.hasOwn(SKILLS, a.skill) || !army.skills.some((s) => s.kind === a.skill)) return null;
      out.push({ t: a.t, type: 'skill', skill: a.skill as SkillKind, x: a.x, y: a.y });
    } else return null;
  }
  return out;
}

/** 拆光时防守方最多掉多少（掉多少按 raidLoot 分摊到建筑）：仓库 × LOOT_PCT% × pct%，向下取整 */
export function raidLoss(stash: Res, destroyedPct: number): Res {
  const f = (v: number): number => Math.max(0, Math.floor((Math.max(0, v) * LOOT_PCT * destroyedPct) / 10000));
  return { gold: f(stash.gold), wood: f(stash.wood) };
}

/** 能抢的那份里主寨占百分之几，其余按容量分给金库（金币）、木料仓（木材）；没有仓库全在主寨 */
export const HQ_LOOT_PCT = 30;

/** 结束时一座建筑掉了多少血（结算只看这几项） */
export interface HitBuilding {
  id: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}
/** 一座建筑能抢到的那份 */
export interface LootShare {
  id: number;
  gold: number;
  wood: number;
}

/**
 * 把能抢的总数分到主寨和仓库上（base.md 第②批）：金库分金币、木料仓分木材，按容量比例分 (100 − HQ_LOOT_PCT)%，
 * 整数向下取整，零头都归主寨，所以拆光时合计正好等于 total。没有主寨（不该有）就全按仓库分，仓库也没有则什么都抢不到。
 */
export function lootPlan(layout: readonly Placed[], total: Res): LootShare[] {
  const hq = layout.find((b) => b.kind === 'hq');
  const capOf = (b: Placed): number => (BUILDINGS[b.kind].levels[b.level - 1] as { cap?: number } | undefined)?.cap ?? 0;
  const out: LootShare[] = [];
  const split = (kind: 'vault' | 'woodyard', amount: number): number => {
    const list = layout.filter((b) => b.kind === kind && capOf(b) > 0);
    const sum = list.reduce((a, b) => a + capOf(b), 0);
    if (sum === 0) return 0;
    const pool = hq ? Math.floor((amount * (100 - HQ_LOOT_PCT)) / 100) : amount;
    let given = 0;
    for (const b of list) {
      const v = Math.floor((pool * capOf(b)) / sum);
      given += v;
      let row = out.find((x) => x.id === b.id);
      if (!row) out.push((row = { id: b.id, gold: 0, wood: 0 }));
      row[kind === 'vault' ? 'gold' : 'wood'] += v;
    }
    return given;
  };
  const g = split('vault', total.gold);
  const w = split('woodyard', total.wood);
  if (hq) out.unshift({ id: hq.id, gold: total.gold - g, wood: total.wood - w });
  return out;
}

/** 按结束时的血量算抢到多少：拆掉的拿满那份，没拆掉的按掉血比例，向下取整 */
export function lootTaken(plan: readonly LootShare[], buildings: readonly HitBuilding[]): Res {
  let gold = 0;
  let wood = 0;
  for (const p of plan) {
    const b = buildings.find((x) => x.id === p.id);
    if (!b || b.maxHp <= 0) continue;
    const lost = b.destroyed ? b.maxHp : Math.max(0, Math.min(b.maxHp, b.maxHp - b.hp));
    gold += Math.floor((p.gold * lost) / b.maxHp);
    wood += Math.floor((p.wood * lost) / b.maxHp);
  }
  return { gold, wood };
}

/** 真人岛防守方掉多少：能抢的上限（仓库 × LOOT_PCT%）按建筑分摊，按拆掉的算 */
export function raidLoot(layout: readonly Placed[], stash: Res, buildings: readonly HitBuilding[]): Res {
  return lootTaken(lootPlan(layout, raidLoss(stash, 100)), buildings);
}

/** 进攻方拿多少：防守方掉的 + 系统赏金 */
export function raidGain(loss: Res): Res {
  return { gold: loss.gold + Math.floor((loss.gold * BOUNTY_PCT) / 100), wood: loss.wood + Math.floor((loss.wood * BOUNTY_PCT) / 100) };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * 奖杯变化：赢（≥1 星）进攻方加 10–30，输扣 5–15，打奖杯比自己高的赢得多、输得少。
 * 防守方反过来（赢的扣、输的加），都不扣到 0 以下。流浪海盗岛减半、没有防守方。
 */
export function trophyDelta(att: number, def: number, stars: number, wanderer = false): { att: number; def: number } {
  const diff = Math.floor((def - att) / 30);
  let a: number;
  if (stars > 0) a = clamp(10 + 5 * stars + diff, 10, 30);
  else a = -clamp(10 - diff, 5, 15);
  if (wanderer) a = a > 0 ? Math.floor(a / 2) : -Math.floor(-a / 2);
  const attNext = Math.max(0, att + a);
  if (wanderer) return { att: attNext - att, def: 0 };
  const defNext = Math.max(0, def - a);
  return { att: attNext - att, def: defNext - def };
}

/** 奖杯 → 第几档段位（LEAGUES 的下标，0 起） */
export function leagueOf(trophies: number): number {
  let i = 0;
  while (i + 1 < LEAGUES.length && trophies >= LEAGUES[i + 1]!.min) i++;
  return i;
}

/** 被打后的护盾（毫秒）：摧毁 ≥ 90% 给 12 小时，打掉了东西给 8 小时，一点没拆（含过期没交的空打）不给 */
export function shieldMs(destroyedPct: number): number {
  if (destroyedPct >= 90) return 12 * 3600_000;
  if (destroyedPct > 0) return 8 * 3600_000;
  return 0;
}

/**
 * 流浪海盗岛：没有合适的真人时用战役关卡改一座。按奖杯挑关（每 100 杯往后一关），不超过进攻方主寨 + 1 级能碰到的关；
 * 种子最低位决定左右镜像，让同一关看着不一样。掠夺来自系统，不扣任何人。
 */
export function wandererIsland(trophies: number, hq: number, seed: number): { levelId: string; name: string; hq: number; layout: Placed[]; loot: Res } {
  const ok = CAMPAIGN.filter((l) => l.hq <= hq + 1);
  const pool = ok.length > 0 ? ok : CAMPAIGN.slice(0, 1);
  const lv = pool[clamp(Math.floor(Math.max(0, trophies) / 100), 0, pool.length - 1)]!;
  const mirror = (seed & 1) === 1;
  const layout = lv.layout.map((b) => ({ ...b, x: mirror ? ISLAND - b.x - BUILDINGS[b.kind].size : b.x }));
  return { levelId: lv.id, name: `流浪海盗·${lv.captain}`, hq: lv.hq, layout, loot: { ...lv.loot } };
}

/** 流浪海盗岛、影子岛拆光最多拿多少：关卡掠夺的 WANDER_LOOT_PCT% */
export function wandererCap(loot: Res): Res {
  return { gold: Math.floor((loot.gold * WANDER_LOOT_PCT) / 100), wood: Math.floor((loot.wood * WANDER_LOOT_PCT) / 100) };
}

/** 流浪海盗岛、影子岛拿多少：上限按这座岛的主寨和仓库分摊，按拆掉的算（和真人岛同一个规则），系统给、不扣任何人 */
export function wandererGain(loot: Res, layout: readonly Placed[], buildings: readonly HitBuilding[]): Res {
  return lootTaken(lootPlan(layout, wandererCap(loot)), buildings);
}

/**
 * 一场进攻的 setup。ext = 岛扩了几圈（玩家的岛 islandExt，流浪海盗岛 0）；hero = 防守方的驻岛英雄等级（tdbase.ts heroLevel）；流浪海盗岛不传，没有英雄。
 * 驻岛英雄只有 8 级（RAID_HERO）：主寨 8 级后英雄研究到 9–12 级只加守岛，这里封顶 8，攻防和以前逐位一样（tests/rank.test.ts）。
 */
export function raidSetup(layout: Placed[], ext: number, army: ArmySetup, seed: number, hero?: number): BattleSetup {
  const h = hero !== undefined ? Math.max(1, Math.min(RAID_HERO.length, hero)) : undefined;
  return {
    layout: layout.map((b) => ({ ...b, ...(b.branch ? { branch: [...b.branch] } : {}) })),
    army,
    seed,
    rules: RULES_VERSION,
    ...(ext > 0 ? { ext } : {}),
    ...(h !== undefined ? { hero: h } : {}),
  };
}
