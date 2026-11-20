/**
 * 大潮无尽（DESIGN.md 10.6e）：每周一张固定的图，所有人守同一座岛，波次无限，比谁撑得久。
 * 这里是纯函数：周的算法（北京时间 ISO 周，和平台 platform/src/weekly.ts 对齐）、周种子、图和关卡、得分编码。
 * 图和波次的内容表在 content/tdtide.ts；机器人配平用 tools/td-tide-sim.ts。
 */
import { TIDE_FOG_FROM, TIDE_MAPS, TIDE_MOD_NUM, TIDE_MOD_ORDER, tideWave } from '../content/tdtide.ts';
import type { TideMap, TideModId } from '../content/tdtide.ts';
import { BUILDINGS } from '../content/buildings.ts';
import { hash32 } from './rng.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import type { TdLevel, TdSetup } from './tdtypes.ts';
import { TD_TOWER_KINDS } from './td2types.ts';

const DAY = 24 * 60 * 60 * 1000;
/** 北京时间 = UTC+8，不用时区库 */
const SHIFT = 8 * 60 * 60 * 1000;

/** 公历 y-m-d 距 1970-01-01 的天数（整数算法，不用 Date） */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 距 1970-01-01 的第 z 天落在公历哪一年 */
function yearOfDay(z: number): number {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const m = mp + (mp < 10 ? 3 : -9);
  return yoe + era * 400 + (m <= 2 ? 1 : 0);
}

export interface IsoWeek {
  year: number;
  week: number;
}

/**
 * 北京时间的 ISO 周（周一 0 点换周，哪年按这周的周四算，所以年底年初的几天可能算到另一年）。
 * 和 platform/src/weekly.ts 的 beijingIsoWeek 同一个算法，只是年份用整数算法求、不用 Date（规则核心不许用）。
 */
export function beijingIsoWeek(ms: number): IsoWeek {
  const day = Math.floor((ms + SHIFT) / DAY);
  // 1970-01-01 是周四：(day + 3) % 7 是离本周一几天
  const thursday = day - (((day + 3) % 7) + 7) % 7 + 3;
  const year = yearOfDay(thursday);
  const week = Math.floor((thursday - daysFromCivil(year, 1, 1)) / 7) + 1;
  return { year, week };
}

/** 周标签：2026-W44（和平台榜名里的写法一致） */
export function weekLabel(w: IsoWeek): string {
  return `${w.year}-W${String(w.week).padStart(2, '0')}`;
}

/** 这一周的每周榜名（平台 POST /api/scores 的 boardId） */
export function tideBoardId(w: IsoWeek): string {
  return `week-${weekLabel(w)}-tide`;
}

/** 周种子：由 "haidao-tide-<YYYY>-W<ww>" 哈希来。图、镜像和一局里的随机（登陆点抖动）都从它来，所以所有人一样 */
export function tideSeed(w: IsoWeek): number {
  return hash32(`haidao-tide-${weekLabel(w)}`, 1);
}

/** 这周用哪张图（下标）和是否左右镜像 */
export function tidePick(w: IsoWeek): { map: number; mirror: boolean } {
  const label = `haidao-tide-${weekLabel(w)}`;
  return { map: hash32(label, 2) % TIDE_MAPS.length, mirror: (hash32(label, 3) & 1) === 1 };
}

const flip = (x: number, size: number): number => ISLAND - x - size;

/** 镜像：布局、登陆路、落潮路、雾区、火药桶、障碍、塔位一起左右翻（雾区、路按 1 格算） */
function mirrored(m: TideMap): TideMap {
  const pt = <P extends { x: number }>(p: P, size = 1): P => ({ ...p, x: flip(p.x, size) });
  return {
    ...m,
    layout: m.layout.map((b) => ({ ...b, x: flip(b.x, BUILDINGS[b.kind].size) })),
    lanes: m.lanes.map((p) => pt(p)),
    tide: pt(m.tide),
    fogZones: m.fogZones.map((z) => pt(z)),
    kegs: m.kegs.map((p) => pt(p)),
    obstacles: m.obstacles.map((o) => pt(o, o.size)),
    slots: m.slots.map((p) => pt(p, 2)),
  };
}

/** 落潮路开的波（0 起）：前 4 波一直关着，之后开两波、关两波 */
function tideOpenList(): number[] {
  const out: number[] = [];
  for (let w = 4; w < 200; w++) if (w % 4 === 1 || w % 4 === 2) out.push(w);
  return out;
}

/** 一局最多 60 分钟（拍）：防卡死，正常撑不到 */
export const TIDE_MAX_TICKS = 60 * 60 * 20;

/** 这周的图和镜像 */
export function tideMap(w: IsoWeek): TideMap {
  const p = tidePick(w);
  const m = TIDE_MAPS[p.map] as TideMap;
  return p.mirror ? mirrored(m) : m;
}

/**
 * 每周海况从 2026 年第 48 周（北京时间 11 月 23 日周一）换榜时才进大潮：周中换规则，同一周的榜前后难度不一样，不公平。
 * 0.47.0 赶不上这个周一就把它往后挪一周，代码里只这一处
 */
export const TIDE_MODS_FROM: IsoWeek = { year: 2026, week: 48 };
const before = (w: IsoWeek, from: IsoWeek): boolean => w.year < from.year || (w.year === from.year && w.week < from.week);

/** 这一周的周一是第几周（1970-01-05 那个周一起算），只给海况轮换用 */
function weekIndex(w: IsoWeek): number {
  const jan4 = daysFromCivil(w.year, 1, 4);
  const monday1 = jan4 - ((((jan4 + 3) % 7) + 7) % 7);
  return Math.floor((monday1 + (w.week - 1) * 7 - 4) / 7);
}

/** 这周的海况：第 48 周以前没有（null）；之后按 TIDE_MOD_ORDER 一周一条轮换 */
export function tideMod(w: IsoWeek): TideModId | null {
  if (before(w, TIDE_MODS_FROM)) return null;
  const n = TIDE_MOD_ORDER.length;
  return TIDE_MOD_ORDER[((weekIndex(w) % n) + n) % n] as TideModId;
}

/**
 * 这周的一局：固定的岛、固定的塔、固定的英雄；每次调用造一份新的关卡对象（波次是现生成往里补的）。
 * mod 只给配平模拟指定海况用（td-tide-sim --mod）；游戏里一律按周算
 */
export function tideSetup(w: IsoWeek, mod: TideModId | null = tideMod(w)): TdSetup {
  const m = tideMap(w);
  const seed = tideSeed(w);
  const level: TdLevel = {
    id: 'tide',
    name: m.name,
    hq: 5,
    hpPct: m.hp,
    gold: 260,
    first: 280,
    waveTicks: 380,
    lanes: m.lanes.map((p) => ({ ...p })),
    tide: { wave: 0, lane: { ...m.tide } },
    tideOpen: tideOpenList(),
    fogZones: m.fogZones.map((z) => ({ ...z })),
    fogFrom: TIDE_FOG_FROM,
    sapperJam: { r: 3, ticks: 100 },
    bossSkill: { summon: { kind: 'sailor', n: 6 }, jam: 2, jamTicks: 160 },
    ...(m.flank ? { flank: true } : {}),
    kegs: m.kegs.map((p) => ({ ...p })),
    obstacles: m.obstacles.map((o) => ({ ...o })),
    slots: m.slots.map((p) => ({ ...p })),
    waves: [],
    endless: (n) => tideWave(n, seed, m.lanes.length, true),
    maxTicks: TIDE_MAX_TICKS,
  };
  if (mod === 'fog') level.fogFrom = 0;
  if (mod === 'rich') {
    level.gold = Math.floor((level.gold * TIDE_MOD_NUM.richGoldPct) / 100);
    level.killGoldPct = TIDE_MOD_NUM.richKillPct;
  }
  if (mod === 'hero') level.heroCdPct = TIDE_MOD_NUM.heroCdPct;
  // 狙击塔、盾兵同样这版不进大潮（DESIGN 14）
  // 震荡炮这版不进大潮：机器人有了第 7 种塔挑塔就变，单张图差十几波，周榜中途变难不公平；下周换榜时再放开（DESIGN 13）
  const unlocked = TD_TOWER_KINDS.filter((k) => k !== 'shock' && k !== 'sniper');
  return { layout: m.layout.map((b) => ({ ...b, ...(b.branch ? { branch: [...b.branch] } : {}) })), level, hero: m.hero, seed, rules: RULES_VERSION, mode: 'tide', unlocked };
}

// ---------------------------------------------------------------- 得分

/** 击退数在得分里最多占几位（封顶 9999） */
export const TIDE_KILLS_CAP = 9999;
const WAVE_UNIT = 10000;

/** 得分 = 撑过的波数 × 10000 + 击退敌人数（封顶 9999）；平台 weekly.json 的 fields 按这个拆 */
export function tideScore(waves: number, kills: number): number {
  const w = Math.max(0, Math.floor(waves));
  const k = Math.max(0, Math.min(TIDE_KILLS_CAP, Math.floor(kills)));
  return w * WAVE_UNIT + k;
}

export function tideDecode(score: number): { waves: number; kills: number } {
  return { waves: Math.floor(score / WAVE_UNIT), kills: score % WAVE_UNIT };
}

/** 成绩的一句话（结算页、选关页用；平台 weekly.json 写的是同一句） */
export function tideLine(score: number): string {
  const { waves, kills } = tideDecode(score);
  return `撑过 ${waves} 波 · 击退 ${kills}`;
}
