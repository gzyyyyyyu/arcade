/**
 * 存档的格式和云存档要的几件事（cloud.ts 的 profileSlot 用）：本地 `haidao.save` = { profile, lastSeen }。
 * 合并：基地布局是一整套摆放，逐项并集会摆出重叠的建筑，所以整份取"进度大"的那份（战役星数 → 主寨等级 → 守岛星数 → 建筑等级合计 → 进攻次数），
 * 进度一样时取最近玩过的。另一份会被 cloud.ts 先备份到 haidao.profile.pre-sync。
 */
import { ESCORT_LEVELS } from '../content/index.ts';
import { ACHIEVEMENTS, BUILDINGS, CAMPAIGN, RARE_POOL, SKILLS, HERO_RESEARCH_MAX, RANKS, tdCampaign, TROOPS, canPlace, hqLevel, newProfile, sanitizeBranch, tdDailyCap, totalStars } from '../core/index.ts';
import type { Placed, Profile } from '../core/types.ts';

export interface Save {
  profile: Profile;
  /** 上次存档的真实时间（毫秒），打开时按它补算产出；0 = 新档 */
  lastSeen: number;
}

export function fresh(): Save {
  return { profile: newProfile(), lastSeen: 0 };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
/** 只认自己的键：`in` 会把 'toString' 这类原型链上的名字放过去 */
const own = <T extends object>(o: T, k: unknown): k is keyof T => typeof k === 'string' && Object.hasOwn(o, k);
const RES_MAX = 1e12;

/**
 * 不可信的数据（本地读出来的、云端的）→ 存档；救不回来为 null。
 * 单机不防作弊，但坏档不能变成"有效档"再同步上云、也不能让规则核心崩：
 * 建筑逐座查（种类、等级 1..上限、坐标在岛内、不和前面的重叠、id 不重复），不合格的丢掉；丢完没有主寨就整份作废；
 * 船只留认识的兵种；星数只留认识的关卡、0..3 的整数；研究等级卡在 1..上限；nextId 抬到比现有最大 id 大。
 */
export function reviveSave(raw: unknown): Save | null {
  if (!isObj(raw) || !isObj(raw.profile)) return null;
  const p = raw.profile;
  if (p.v !== 1 || !isObj(p.base) || !Array.isArray(p.base.buildings) || !isObj(p.res)) return null;
  const base = newProfile();
  const profile: Profile = { ...base, base: { buildings: [], nextId: 1 }, stars: {}, research: {}, boats: [] };
  const ids = new Set<number>();
  for (const b of p.base.buildings) {
    if (!isObj(b) || !own(BUILDINGS, b.kind)) continue;
    const def = BUILDINGS[b.kind];
    if (!isInt(b.id, 1, Number.MAX_SAFE_INTEGER) || ids.has(b.id) || !isInt(b.level, 1, def.maxLevel)) continue;
    if (!canPlace(profile, b.kind, b.x as number, b.y as number)) continue;
    const kept: Placed = { id: b.id, kind: b.kind, level: b.level, x: b.x as number, y: b.y as number };
    if (isNum(b.stored) && b.stored >= 0) kept.stored = b.stored;
    // 塔的分叉（守岛用）：只留合法的前缀（种类对、等级够、先 3 级再 6 级），一个都不合法就不带这个字段
    const branch = sanitizeBranch(b.kind, b.level, b.branch);
    if (branch) kept.branch = branch;
    profile.base.buildings.push(kept);
    ids.add(b.id);
  }
  if (!profile.base.buildings.some((b) => b.kind === 'hq')) return null;
  const maxId = Math.max(...ids);
  profile.base.nextId = isInt(p.base.nextId, maxId + 1, Number.MAX_SAFE_INTEGER) ? p.base.nextId : maxId + 1;
  profile.res = {
    gold: isNum(p.res.gold) ? Math.min(RES_MAX, Math.max(0, Math.floor(p.res.gold))) : 0,
    wood: isNum(p.res.wood) ? Math.min(RES_MAX, Math.max(0, Math.floor(p.res.wood))) : 0,
  };
  if (isObj(p.stars)) {
    for (const l of CAMPAIGN) if (isInt(p.stars[l.id], 0, 3)) profile.stars[l.id] = p.stars[l.id] as number;
  }
  if (isObj(p.research)) {
    for (const [k, v] of Object.entries(p.research)) {
      // hero 是守岛英雄（军械所研究）：上限是能研究到的最高级；封顶主寨等级由 heroLevel 兜底，这里不按主寨砍，免得主寨读坏时丢进度
      const max = own(TROOPS, k) ? TROOPS[k].levels.length : own(SKILLS, k) ? SKILLS[k].levels.length : k === 'hero' ? HERO_RESEARCH_MAX : 0;
      if (max > 0 && isInt(v, 1, max)) profile.research[k as keyof Profile['research']] = v;
    }
  }
  if (Array.isArray(p.boats)) {
    for (const bt of p.boats) if (isObj(bt) && own(TROOPS, bt.troop)) profile.boats.push({ troop: bt.troop });
  }
  if (profile.boats.length === 0) profile.boats = base.boats;
  profile.tutorial = isInt(p.tutorial, 0, 1000) ? p.tutorial : 0;
  const st = isObj(p.stats) ? p.stats : {};
  const cnt = (v: unknown): number => (isNum(v) && v >= 0 ? Math.floor(v) : 0);
  profile.stats = {
    attacks: cnt(st.attacks),
    wins: cnt(st.wins),
    lootGold: cnt(st.lootGold),
    lootWood: cnt(st.lootWood),
  };
  // 第二期加的计数是可选字段，旧档没有就不补（规则核心按 0 算）
  for (const k of ['threeStars', 'bossWins', 'dailyDone', 'maxStreak', 'streak'] as const) if (st[k] !== undefined) profile.stats[k] = cnt(st[k]);
  // 成就只留认识的、不重复；称号必须是已达成成就给的
  const known = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  profile.achievements = Array.isArray(p.achievements) ? [...new Set(p.achievements.filter((a): a is string => typeof a === 'string' && known.has(a)))] : [];
  const title = typeof p.title === 'string' ? p.title : undefined;
  if (title && profile.achievements.some((id) => known.get(id)?.title === title)) profile.title = title;
  else delete profile.title;
  if (isObj(p.daily) && isInt(p.daily.day, 0, 1e7) && typeof p.daily.done === 'boolean') profile.daily = { day: p.daily.day, done: p.daily.done };
  else delete profile.daily;
  // 守岛进度：只留第一章认识的关卡和 0..3 的星数；当天已拿的资源不能为负、不超过当前主寨的每日上限（免得坏档把今天锁死）
  if (isObj(p.td)) {
    const stars: Record<string, number> = {};
    if (isObj(p.td.stars)) for (const l of tdCampaign()) if (isInt(p.td.stars[l.id], 0, 3)) stars[l.id] = p.td.stars[l.id] as number;
    const cap = tdDailyCap(profile);
    const got = (v: unknown, max: number): number => (isNum(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
    profile.td = { stars, day: isInt(p.td.day, 0, 1e7) ? p.td.day : 0, gotGold: got(p.td.gotGold, cap.gold), gotWood: got(p.td.gotWood, cap.wood) };
  }
  // 海盗王阶：0..10；攒了一半的 rankFund 不能超过下一阶的价（满阶就不留）
  if (isInt(p.rank, 1, RANKS.length)) profile.rank = p.rank;
  else delete profile.rank;
  const nextRank = RANKS[profile.rank ?? 0];
  if (nextRank && isObj(p.rankFund)) {
    const fund = (v: unknown, max: number): number => (isNum(v) && v >= 0 ? Math.min(max - 1, Math.floor(v)) : 0);
    const f = { gold: fund(p.rankFund.gold, nextRank.cost.gold), wood: fund(p.rankFund.wood, nextRank.cost.wood) };
    if (f.gold > 0 || f.wood > 0) profile.rankFund = f;
  }
  // 护航进度：只留认识的关卡和 0..3 的星数
  if (isObj(p.escort)) {
    const stars: Record<string, number> = {};
    if (isObj(p.escort.stars)) for (const l of ESCORT_LEVELS) if (isInt(p.escort.stars[l.id], 0, 3)) stars[l.id] = p.escort.stars[l.id] as number;
    profile.escort = { stars };
  }
  // 掉宝：只留稀有池里认识的；装备的皮肤必须已拥有；摆出来的装饰也必须已拥有（规则核心 build 同样这么查）
  const pool = new Set(RARE_POOL);
  profile.cosmetics = Array.isArray(p.cosmetics) ? [...new Set(p.cosmetics.filter((c): c is string => typeof c === 'string' && pool.has(c)))] : [];
  profile.skins = {};
  if (isObj(p.skins)) {
    for (const [t, s] of Object.entries(p.skins)) {
      if (own(TROOPS, t) && typeof s === 'string' && profile.cosmetics.includes(`skin:${t}:${s}`)) profile.skins[t] = s;
    }
  }
  profile.base.buildings = profile.base.buildings.filter((b) => BUILDINGS[b.kind].category !== 'deco' || !RARE_POOL.includes(`deco:${b.kind}`) || profile.cosmetics.includes(`deco:${b.kind}`));
  return { profile, lastSeen: isNum(raw.lastSeen) && raw.lastSeen > 0 ? raw.lastSeen : 0 };
}

function progress(s: Save): number[] {
  const p = s.profile;
  const levels = p.base.buildings.reduce((n, b) => n + b.level, 0);
  // 守岛的星数排在战役星数和主寨之后：只打守岛的人进度也算数，云同步不会被另一份盖掉
  const tdStars = Object.values(p.td?.stars ?? {}).reduce((n, v) => n + v, 0) + Object.values(p.escort?.stars ?? {}).reduce((n, v) => n + v, 0);
  return [totalStars(p), hqLevel(p), tdStars, levels, p.stats.attacks, s.lastSeen];
}

export function mergeSave(local: Save, cloud: Save): Save {
  const a = progress(local);
  const b = progress(cloud);
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]! ? local : cloud;
  }
  return local;
}

export function savePayload(s: Save): unknown {
  return s;
}
