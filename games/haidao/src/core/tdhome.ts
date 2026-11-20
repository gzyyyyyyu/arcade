/**
 * 海盗来袭（守岛 2.0 的"守自己的岛"）：用玩家自己的岛和布局（常驻塔照常开火、按基地等级表，木台、火药桶由 placeTdLevel 挑空的摆），
 * 波次按 waveBudget 现生成，打满 TD2_HOME.maxWaves 波或丢到 TD2_LOSE_AT 枚为止；不算星、不进难度曲线，
 * 按撑住的波数给奖励，和战役共用守岛的每日上限（Profile.td 的 day / gotGold / gotWood），不加存档字段。
 * 奖励表、候选位置、开局金这些数在 content/td2units.ts 的 TD2_HOME。纯函数，不改入参。
 */
import { TD2_ENEMY_POINTS, TD2_HOME } from '../content/td2units.ts';
import { hqLevel, islandExt } from './base.ts';
import { Rng } from './rng.ts';
import { waveBudget } from './td2types.ts';
import type { TdHomeGen, TdHomeReward, TdHomeSnapshot } from './td2types.ts';
import { heroLevel } from './tdbase.ts';
import { heroKindOf, placeTdLevel, tdBaseBonus, tdGrant, tdRunReward, tdUnlockedTowers } from './tdrun.ts';
import type { TdPlacedLevel } from './tdrun.ts';
import type { TdEnemyKind, TdGroup, TdResult, TdSetup, TdWave } from './tdtypes.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import { TD_WALL_COST } from '../content/tdunits.ts';
import { cellIdx, inGrid } from './grid.ts';
import { createTd } from './td.ts';
import { treasureFlow } from './tdstate.ts';
import type { Profile, Res, Result } from './types.ts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 落潮路从第几波（0 起）起开着 */
const HOME_TIDE_WAVE = 4;
/** 首领波：每 10 波最后一波来一个船长 */
const HOME_BOSS_EVERY = 10;
/** 一波最多几组（组内同一种敌人走同一路） */
const HOME_GROUPS = 4;

/** 某种敌人从第几波（0 起）开始出现：先水手，再铁甲、小艇、鹦鹉、雾船、工兵（和战役教机制的顺序一样） */
const HOME_FROM: ReadonlyArray<[TdEnemyKind, number]> = [
  ['sailor', 0], ['ironclad', 2], ['skiff', 3], ['parrot', 4], ['fog', 5], ['sapper', 7],
  ['grenadier', 6],
  // 盾兵第 9 波起（大潮不放）
  ['shield', 8],
];

/** 每种敌人一组里隔几拍上一个 */
const EVERY: Readonly<Record<TdEnemyKind, number>> = {
  sailor: 22, ironclad: 50, fog: 30, skiff: 45, skiffling: 20, sapper: 40, parrot: 18, captain: 1, grenadier: 40, shield: 45, bosun: 45, macaw: 30, mate: 45, medic: 40, gunboat: 1, king: 1,
};

/** 从存档取岛快照（布局深拷贝、主寨等级、英雄等级） */
export function tdHomeSnapshot(p: Profile): TdHomeSnapshot {
  return {
    layout: p.base.buildings.map((b) => ({ ...b, ...(b.branch ? { branch: [...b.branch] } : {}) })),
    hq: hqLevel(p),
    hero: heroLevel(p),
  };
}

/** 主寨够不够开加难档 */
export function tdHomeHardOpen(hq: number): boolean {
  return hq >= TD2_HOME.hard.hq;
}

/** 波次生成参数：等效关按主寨等级查 TD2_HOME.levelByHq（加难档再加 hard.levelPlus），种子由界面给（和战役一样） */
export function tdHomeGen(snap: TdHomeSnapshot, seed: number, hard = false): TdHomeGen {
  const t = TD2_HOME.levelByHq;
  const i = Math.max(0, Math.min(t.length - 1, Math.floor(snap.hq) - 1));
  const gen: TdHomeGen = { levelIndex: (t[i] ?? 0) + (hard ? TD2_HOME.hard.levelPlus : 0), seed, gold: TD2_HOME.gold, first: TD2_HOME.first, waveTicks: TD2_HOME.waveTicks };
  if (hard) gen.hard = true;
  return gen;
}

/**
 * 第 w 波（0 起）：只由 gen 和波数决定（同一个 gen 重放出同一局），预算 = waveBudget(gen.levelIndex, w)。
 * 每 10 波的最后一波先放一个船长（首领波）；剩下的预算平分给至多 4 组，每组随机挑一种已经出场的敌人、随机挑一路
 * （开几路随波数加：前 3 波只走 0 号路，往后每 3 波多开一路；落潮路从第 5 波起算进来）。
 */
export function tdHomeWave(gen: TdHomeGen, w: number): TdWave {
  const rng = new Rng(gen.seed, `td-home-wave-${w}`);
  let left = waveBudget(gen.levelIndex, w);
  const groups: TdGroup[] = [];
  const boss = (w + 1) % HOME_BOSS_EVERY === 0;
  if (boss) {
    groups.push({ enemy: 'captain', n: 1, lane: 0, every: EVERY.captain, delay: 60 });
    left = Math.max(0, left - TD2_ENEMY_POINTS.captain);
  }
  const lanes = TD2_HOME.lanes.length + (w >= HOME_TIDE_WAVE ? 1 : 0);
  const open = Math.max(1, Math.min(lanes, 1 + Math.floor(w / 3)));
  const pool = HOME_FROM.filter(([, from]) => w >= from).map(([k]) => k);
  // 加难档：精英按 hard.elite 的波数进池（排在普通敌人后面，普通档的池子和抽签顺序不变）
  if (gen.hard) for (const [k, from] of TD2_HOME.hard.elite) if (w >= from) pool.push(k);
  for (let g = 0; g < HOME_GROUPS && left > 0; g++) {
    const kind = pool[rng.int(pool.length)] as TdEnemyKind;
    const pts = TD2_ENEMY_POINTS[kind];
    const share = Math.floor(left / (HOME_GROUPS - g));
    let n = Math.max(1, Math.floor(share / pts));
    if (n * pts > left) n = Math.floor(left / pts);
    if (n <= 0) continue;
    left -= n * pts;
    // 落潮路下标 = 陆上的路数（和关卡的约定一致）
    const lane = rng.int(open);
    groups.push({ enemy: kind, n, lane, every: EVERY[kind], delay: g * 40 });
  }
  const wave: TdWave = boss ? { groups, boss: true } : { groups };
  // 盾兵、掷弹兵第一次成组出现的那几波，预告卡提醒怎么打
  if (w < 14 && groups.some((g) => g.enemy === 'shield')) wave.note = '盾兵：正面挡枪炮，用溅射、爆破';
  else if (w < 12 && groups.some((g) => g.enemy === 'grenadier')) wave.note = '掷弹兵：先用火';
  return wave;
}

/**
 * 开一局海盗来袭：TdSetup.mode = 'home'，level 由 TD2_HOME 的候选位置（按玩家布局挑空的摆）和 tdHomeWave 拼出，一共 maxWaves 波；hard 要主寨够级。
 * 登陆点也按布局挑（homeLanes）。
 */
export function tdHomeSetup(p: Profile, seed: number, hard = false): Result<TdSetup> {
  if (!Number.isInteger(seed)) return err('bad_seed');
  const snap = tdHomeSnapshot(p);
  if (hard && !tdHomeHardOpen(snap.hq)) return err('hard_locked');
  const gen = tdHomeGen(snap, seed, hard);
  const ext = islandExt(snap.layout);
  const raw: TdPlacedLevel = {
    id: 'home',
    name: '海盗来袭',
    hq: snap.hq,
    hpPct: 100,
    gold: gen.gold,
    first: gen.first,
    waveTicks: gen.waveTicks,
    lanes: TD2_HOME.lanes.map((l) => pushOut(l, ext)),
    tide: { wave: HOME_TIDE_WAVE, lane: pushOut(TD2_HOME.tide, ext) },
    waves: Array.from({ length: TD2_HOME.maxWaves }, (_, w) => tdHomeWave(gen, w)),
    kegs: TD2_HOME.kegs.map((k) => pushOut(k, ext)),
    obstacles: [],
    slots: TD2_HOME.slots.map((s) => ({ ...s })),
    place: { slots: TD2_HOME.slots.length, kegs: TD2_HOME.kegs.length, wrecks: 0, barrels: 0 },
  };
  const setup: TdSetup = {
    layout: snap.layout,
    level: placeTdLevel(raw, snap.layout, ext),
    hero: snap.hero,
    seed,
    rules: RULES_VERSION,
    mode: 'home',
    bonus: tdBaseBonus(p),
    unlocked: tdUnlockedTowers(p),
    home: gen,
    ...(ext > 0 ? { ext } : {}),
    ...heroKindOf(p),
  };
  return ok({ ...setup, level: { ...setup.level, ...homeLanes(setup) } });
}

type Pt = { x: number; y: number };

/** TD2_HOME 的坐标按 22×22 的岛写：贴边（岛边一排、海滩上）的点跟着扩出来的圈往外挪 ext 格，岛里面的不动 */
function pushOut(p: Pt, ext: number): Pt {
  const f = (c: number): number => (c <= 0 ? c - ext : c >= ISLAND - 1 ? c + ext : c);
  return { x: f(p.x), y: f(p.y) };
}

/**
 * 登陆点按玩家的布局挑。TD2_HOME 的登陆路和落潮路是写死的坐标，不看岛怎么摆；等级越高建筑越多，宝藏箱越容易被挤到岛边，
 * 正好摆在某个登陆点门口时敌人一上岸就抢到（主寨 8 级推荐布局 spread 北路只有 2 格，普通机器人平均只撑 4.8 波，6、7 级是 8 格）。
 * 每条登陆路（含落潮路）先看原位置：到最近宝藏箱的路程（敌人寻路的流场，砸墙按墙代价）≥ TD2_HOME.laneMinPath 就不动；
 * 不够就在同一条海滩上挑离原位置最近、够远、没被别的路占的格（同距离取坐标小的）；都不够挑最远的。
 */
function homeLanes(setup: TdSetup): { lanes: Pt[]; tide?: NonNullable<TdSetup['level']['tide']> } {
  const s = createTd(setup);
  const flows = s.treasures.map((_, i) => treasureFlow(s, i, TD_WALL_COST));
  const dist = (p: Pt): number => (inGrid(s.ext, p.x, p.y) ? Math.min(...flows.map((f) => f[cellIdx(p.x, p.y)] as number)) : -1);
  const taken: Pt[] = [];
  const pick = (p: Pt): Pt => {
    let out = p;
    if (dist(p) < TD2_HOME.laneMinPath) {
      // 同一条海滩：上下两边的沿 x 走，左右两边的沿 y 走
      const alongX = p.y < -s.ext || p.y > ISLAND - 1 + s.ext;
      const cand: Pt[] = [];
      for (let k = -s.ext; k < ISLAND + s.ext; k++) cand.push(alongX ? { x: k, y: p.y } : { x: p.x, y: k });
      const free = cand.filter((q) => !taken.some((t) => t.x === q.x && t.y === q.y));
      const gap = (q: Pt): number => Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      free.sort((a, b) => gap(a) - gap(b) || a.x - b.x || a.y - b.y);
      out = free.find((q) => dist(q) >= TD2_HOME.laneMinPath) ?? free.reduce((a, b) => (dist(b) > dist(a) ? b : a), p);
    }
    taken.push(out);
    return out;
  };
  const lanes = setup.level.lanes.map(pick);
  const tide = setup.level.tide;
  return tide ? { lanes, tide: { ...tide, lane: pick(tide.lane) } } : { lanes };
}

/** 撑住 waves 波的原始奖励（还没按每日上限截）：tdRunReward(主寨, 3★) × 每波比例% × min(waves, maxWaves)；加难档按 hard.perWavePct */
export function tdHomeRawReward(hq: number, waves: number, hard = false): Res {
  const w = Math.max(0, Math.min(TD2_HOME.maxWaves, Math.floor(waves)));
  const r = tdRunReward({ hq }, 3);
  const pct = hard ? TD2_HOME.hard.perWavePct : TD2_HOME.perWavePct;
  return { gold: Math.floor((r.gold * pct * w) / 100), wood: Math.floor((r.wood * pct * w) / 100) };
}

/**
 * 结算一局海盗来袭：按每日上限和仓库截（tdGrant，和 settleTd 共用 Profile.td 的 day / gotGold / gotWood），不记星。dayIndex 同 settleTd；
 * gen 是这一局的生成参数（setup.home），加难档按它的 hard 给奖励
 */
export function settleTdHome(p: Profile, result: TdResult, dayIndex: number, gen?: Pick<TdHomeGen, 'hard'>): Result<{ profile: Profile; reward: TdHomeReward }> {
  if (!result.over) return err('not_over');
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return err('bad_day');
  const waves = Math.max(0, Math.min(TD2_HOME.maxWaves, Math.floor(result.waves)));
  const hard = gen?.hard === true;
  const g = tdGrant(p, tdHomeRawReward(hqLevel(p), waves, hard), { gold: 0, wood: 0 }, dayIndex);
  const profile: Profile = {
    ...p,
    res: g.res,
    td: { stars: { ...(p.td?.stars ?? {}) }, day: dayIndex, gotGold: g.got.gold, gotWood: g.got.wood },
  };
  return ok({ profile, reward: { waves, hard, gold: g.run.gold, wood: g.run.wood, capped: g.capped, full: g.full } });
}
