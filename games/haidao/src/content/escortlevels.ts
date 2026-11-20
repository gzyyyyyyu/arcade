/**
 * 护航的 9 关 = 3 张图 × 3 档难度（新手 / 普通 / 高手），关 id 是 `<图id>-<难度>`。
 * 同一张图三档的敌人配方一样，难度只靠旋钮：船血 hull、预算倍率 scale、开局金、木台数、波间倒数 waveTicks。
 * 不加规则、不改敌人表。用 tools/escort-sim.ts 按共用难度线（src/content/difficulty.ts，进度按难度档）配平。
 * 护航实盘读冻结副本 escortlivelevels.ts，这里的关随便调不影响实盘。
 */
import { waveBudget } from '../core/td2types.ts';
import { ESCORT_DIFFS, type EscortDiff, type EscortLevel } from '../core/escorttypes.ts';
import type { TdEnemyKind, TdGroup, TdWave } from '../core/tdtypes.ts';
import { TD2_ENEMY_POINTS } from './td2units.ts';
import { ESCORT_MAPS, type EscortMapDef, type EscortMapId } from './escortmaps.ts';

/** [敌人, 份额（占这一波预算的百分比）, 登陆路, 延迟拍] */
type G = [TdEnemyKind, number, number, number?];
interface Recipe {
  groups: G[];
  boss?: boolean;
  note?: string;
}
const w = (...groups: G[]): Recipe => ({ groups });
const boss = (note: string, ...groups: G[]): Recipe => ({ groups, boss: true, note });
const S = 'sailor';
const I = 'ironclad';
const F = 'fog';
const K = 'skiff';
const P = 'parrot';
const X = 'sapper';
const C = 'captain';

/** 同守岛 td2levels：每种敌人两个之间最短隔几拍、一组最长放出去的时间（拍） */
const SPAN: Readonly<Record<TdEnemyKind, { span: number; min: number }>> = {
  sailor: { span: 280, min: 7 },
  ironclad: { span: 300, min: 22 },
  fog: { span: 260, min: 16 },
  skiff: { span: 280, min: 18 },
  skiffling: { span: 200, min: 10 },
  sapper: { span: 280, min: 22 },
  parrot: { span: 220, min: 8 },
  captain: { span: 1, min: 1 },
  grenadier: { span: 300, min: 20 },
  shield: { span: 300, min: 20 },
  bosun: { span: 280, min: 20 },
  mate: { span: 280, min: 20 },
  medic: { span: 280, min: 30 },
  gunboat: { span: 200, min: 60 },
  king: { span: 1, min: 1 },
  macaw: { span: 220, min: 16 },
};

function expand(r: Recipe, budget: number): TdWave {
  let left = budget;
  const groups: TdGroup[] = [];
  for (const [kind, , lane] of r.groups) {
    if (kind !== 'captain') continue;
    groups.push({ enemy: 'captain', n: 1, lane, every: 1 });
    left = Math.max(0, left - TD2_ENEMY_POINTS.captain);
  }
  for (const [kind, share, lane, delay] of r.groups) {
    if (kind === 'captain' || share <= 0) continue;
    const n = Math.max(1, Math.round((left * share) / 100 / TD2_ENEMY_POINTS[kind]));
    const s = SPAN[kind];
    groups.push({ enemy: kind, n, lane, every: Math.max(s.min, Math.floor(s.span / n)), ...(delay ? { delay } : {}) });
  }
  const out: TdWave = { groups };
  if (r.boss) out.boss = true;
  if (r.note) out.note = r.note;
  return out;
}

/** 三张图各自的配方（10 波）和难度公式里的等效关下标 */
const RECIPES: Readonly<Record<EscortMapId, { index: number; hq: number; waves: Recipe[] }>> = {
  strait: {
    index: 0,
    hq: 3,
    waves: [
      w([S, 100, 0]),
      w([S, 100, 1]),
      w([S, 60, 0], [I, 40, 1]),
      w([S, 100, 0]),
      w([I, 60, 1], [S, 40, 0, 40]),
      w([S, 50, 1], [S, 50, 0, 60]),
      w([I, 70, 0], [S, 30, 1]),
      w([S, 60, 1], [I, 40, 0, 30]),
      w([I, 50, 0], [S, 50, 1, 30]),
      w([S, 50, 0], [I, 50, 1]),
    ],
  },
  bays: {
    index: 4,
    hq: 5,
    waves: [
      w([S, 100, 0]),
      w([S, 60, 1], [F, 40, 0]),
      w([I, 50, 2], [S, 50, 0]),
      w([K, 60, 1], [S, 40, 2]),
      w([X, 40, 0], [S, 60, 1]),
      w([I, 40, 2], [F, 30, 3], [S, 30, 0, 40]),
      w([K, 50, 0], [I, 30, 1], [S, 20, 2, 40]),
      w([X, 35, 3], [F, 30, 1], [S, 35, 2, 30]),
      w([I, 40, 0], [K, 30, 2], [S, 30, 1, 40]),
      w([X, 30, 1], [I, 40, 3], [F, 30, 0, 30]),
    ],
  },
  cape: {
    index: 8,
    hq: 6,
    waves: [
      w([S, 100, 0]),
      w([I, 50, 1], [S, 50, 0]),
      w([P, 60, 2], [S, 40, 0]),
      w([K, 50, 1], [I, 50, 0]),
      w([P, 40, 2], [S, 60, 1, 30]),
      w([X, 40, 0], [P, 30, 2, 40], [I, 30, 1]),
      w([K, 40, 1], [P, 40, 2], [S, 20, 0, 40]),
      w([I, 40, 0], [X, 30, 1], [P, 30, 2, 40]),
      w([P, 50, 2], [S, 30, 0], [K, 20, 1, 30]),
      boss('终点前的首领：鹦鹉从东边来', [C, 0, 1], [S, 35, 0, 30], [P, 40, 2, 60], [I, 25, 1, 40]),
    ],
  },
};

/** 难度旋钮：船血、预算倍率（百分比）、开局金、少给几个木台、一波到下一波的倒数（拍） */
const KNOBS: Readonly<Record<EscortDiff, { hull: number; scale: number; gold: number; fewer: number; waveTicks: number; first: number }>> = {
  easy: { first: 700, hull: 1200, scale: 70, gold: 420, fewer: 0, waveTicks: 400 },
  normal: { first: 600, hull: 1000, scale: 100, gold: 520, fewer: 1, waveTicks: 380 },
  hard: { first: 400, hull: 650, scale: 130, gold: 400, fewer: 2, waveTicks: 320 },
};

type Knobs = { hull: number; scale: number; gold: number; fewer: number; waveTicks: number; first: number };
/**
 * 每张图每档对基础旋钮的修正（配平结果）：后面的图预算本来就大、航线长，所以倍率和船血要单独调；同一张图船血新手 > 普通 > 高手（单测锁住）。
 * 新手档的倍率是放宽过的：真人照提示打三局全沉，小白机器人 83% 只代表「第 0 拍巡航 + 跟随」一种打法，
 * 换个开局（停船造塔、晚开跟随、自己加喷火）就从 100% 翻到 0%；放宽后各种说得过去的打法三张图都 ≥ 85%（.local 取证）。
 * 0.55.0 按共用难度线重配：直波海峡新手 / 普通档三星原来只有 2–3%（普通机器人几乎全 2★），高手档小白胜率 0–14%，都放宽到线上（docs/balance-haidao.md 难度曲线总表）
 */
const TUNE: Readonly<Record<EscortMapId, Readonly<Record<EscortDiff, Partial<Knobs>>>>> = {
  strait: { easy: { scale: 25, hull: 1400 }, normal: { scale: 60, hull: 1300, gold: 620 }, hard: { scale: 50, hull: 900 } },
  bays: { easy: { scale: 34, hull: 1500 }, normal: { scale: 58, hull: 1400, gold: 700, first: 900 }, hard: { scale: 35, hull: 1150 } },
  cape: { easy: { scale: 54 }, normal: { scale: 73, hull: 1100 }, hard: { scale: 50, hull: 1050 } },
};

export const ESCORT_MAX_TICKS = 6000;

/** 一张图一档的 10 波 */
function levelWaves(rc: (typeof RECIPES)[EscortMapId], scale: number): TdWave[] {
  return rc.waves.map((r, i) => expand(r, Math.floor((waveBudget(rc.index, i) * scale) / 100)));
}

function buildLevel(m: EscortMapDef, diff: EscortDiff): EscortLevel {
  const rc = RECIPES[m.id];
  const k = { ...KNOBS[diff], ...TUNE[m.id][diff] };
  return {
    id: `${m.id}-${diff}`,
    name: `${m.name}·${{ easy: '新手', normal: '普通', hard: '高手' }[diff]}`,
    hq: rc.hq,
    hpPct: 100,
    gold: k.gold,
    first: k.first,
    waveTicks: k.waveTicks,
    lanes: m.lanes.map((p) => ({ ...p })),
    ...(m.tide ? { tide: { wave: 2, lane: { ...m.tide } } } : {}),
    ...(m.fogZones ? { fogZones: m.fogZones.map((z) => ({ ...z })) } : {}),
    ...(m.flank ? { flank: true } : {}),
    maxTicks: ESCORT_MAX_TICKS,
    waves: levelWaves(rc, k.scale),
    kegs: m.kegs.map((p) => ({ ...p })),
    obstacles: [],
    slots: m.pads.slice(0, m.pads.length - k.fewer).map((p) => ({ ...p })),
    escort: { route: m.route.map((p) => ({ ...p })), gates: [...m.gates], hull: k.hull, stars: [50, 90] },
    map: m.id,
    diff,
  };
}

export const ESCORT_LEVELS: readonly EscortLevel[] = ESCORT_MAPS.flatMap((m) => ESCORT_DIFFS.map((d) => buildLevel(m, d)));
export const ESCORT_LEVEL_BY_ID: ReadonlyMap<string, EscortLevel> = new Map(ESCORT_LEVELS.map((l) => [l.id, l]));
export { ESCORT_MAPS };
