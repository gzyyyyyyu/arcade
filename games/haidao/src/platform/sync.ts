/**
 * 存档的格式和云存档要的几件事（cloud.ts 的 profileSlot 用）：本地 `haidao.save` = { profile, lastSeen }。
 * 合并：基地布局是一整套摆放，逐项并集会摆出重叠的建筑，所以整份取"进度大"的那份（战役星数 → 主寨等级 → 守岛星数 → 建筑等级合计 → 进攻次数），
 * 进度一样时取最近玩过的。另一份会被 cloud.ts 先备份到 haidao.profile.pre-sync。守岛的老兵徽、挑战章只增不减，两份取并集并进胜出的那份。
 */
import { ESCORT_LEVELS } from '../content/index.ts';
import { TRAIN_BY_ID } from '../content/training.ts';
import { TD_CHALLENGE_BY_ID } from '../content/tdchallenge.ts';
import { talentCell } from '../content/tdtalent.ts';
import { ingotEarned } from '../core/ingot.ts';
import { GOALS, GOAL_BOX, GOAL_KINDS } from '../core/goals.ts';
import { ACHIEVEMENTS, BUILDINGS, CAMPAIGN, COSMETICS, SKILLS, HERO_RESEARCH_MAX, RANKS, tdCampaign, TROOPS, canPlace, hqLevel, navUnlocked, newProfile, sanitizeBranch, tdDailyCap, totalStars } from '../core/index.ts';
import type { Placed, Profile } from '../core/types.ts';
import { isObj } from '../core/validate.ts';

export interface Save {
  profile: Profile;
  /** 上次存档的真实时间（毫秒），打开时按它补算产出；0 = 新档 */
  lastSeen: number;
}

export function fresh(): Save {
  return { profile: newProfile(), lastSeen: 0 };
}

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
  for (const k of ['threeStars', 'bossWins', 'dailyDone', 'maxStreak', 'streak', 'pvpThree', 'revengeWins', 'holds', 'bestTrophies'] as const) if (st[k] !== undefined) profile.stats[k] = cnt(st[k]);
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
    // 老兵徽、挑战章只留认识的关；天赋只留认识的格、不重复（点数够不够开局时 tdTalentPicks 再判）
    const marks = (v: unknown, ok: (id: string) => boolean): Record<string, 1> | undefined => {
      if (!isObj(v)) return undefined;
      const ids = Object.keys(v).filter((id) => v[id] === 1 && ok(id));
      return ids.length > 0 ? Object.fromEntries(ids.map((id) => [id, 1 as const])) : undefined;
    };
    const vet = marks(p.td.vet, (id) => tdCampaign().some((l) => l.id === id));
    const chal = marks(p.td.chal, (id) => TD_CHALLENGE_BY_ID.has(id));
    const talent = Array.isArray(p.td.talent) ? [...new Set(p.td.talent.filter((t): t is string => typeof t === 'string' && talentCell(t) !== null))] : [];
    if (vet) profile.td.vet = vet;
    if (chal) profile.td.chal = chal;
    if (talent.length > 0) profile.td.talent = talent;
  }
  // 守岛带哪个英雄：只认航海士，而且要第一章已经通关（别的值、没解锁的都按船长，不写这个字段）
  if (p.heroPick === 'nav' && navUnlocked(profile)) profile.heroPick = 'nav';
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
  // 训练营：只留认识的关、不重复；待领不能为负、不超过已过关的奖励合计（坏档不能凭空多领）
  if (isObj(p.train) && Array.isArray(p.train.done)) {
    const done = [...new Set(p.train.done.filter((id): id is string => typeof id === 'string' && TRAIN_BY_ID.has(id)))];
    const sum = (k: 'gold' | 'wood'): number => done.reduce((n, id) => n + TRAIN_BY_ID.get(id)!.reward[k], 0);
    const owed = isObj(p.train.owed) ? p.train.owed : {};
    const amt = (v: unknown, max: number): number => (isNum(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
    const o = { gold: amt(owed.gold, sum('gold')), wood: amt(owed.wood, sum('wood')) };
    profile.train = o.gold > 0 || o.wood > 0 ? { done, owed: o } : { done };
  }
  // 收藏：只留认识的（掉宝池 + 纪念装饰）；装备的皮肤必须已拥有；摆出来的装饰也必须已拥有（规则核心 build 同样这么查）
  const pool = new Set(COSMETICS);
  profile.cosmetics = Array.isArray(p.cosmetics) ? [...new Set(p.cosmetics.filter((c): c is string => typeof c === 'string' && pool.has(c)))] : [];
  profile.skins = {};
  if (isObj(p.skins)) {
    for (const [t, s] of Object.entries(p.skins)) {
      if (own(TROOPS, t) && typeof s === 'string' && profile.cosmetics.includes(`skin:${t}:${s}`)) profile.skins[t] = s;
    }
  }
  profile.base.buildings = profile.base.buildings.filter((b) => BUILDINGS[b.kind].category !== 'deco' || !pool.has(`deco:${b.kind}`) || profile.cosmetics.includes(`deco:${b.kind}`));
  // 金银锭：领的不超过挣的（挣的从上面校验过的存档算），换掉的不超过领的；都是 0 就不写
  if (isObj(p.ingot)) {
    const claimed = isNum(p.ingot.claimed) && p.ingot.claimed > 0 ? Math.min(ingotEarned(profile), Math.floor(p.ingot.claimed)) : 0;
    const spent = isNum(p.ingot.spent) && p.ingot.spent > 0 ? Math.min(claimed, Math.floor(p.ingot.spent)) : 0;
    if (claimed > 0) profile.ingot = { claimed, spent };
  }
  // 每日三件小事：只留认识的种类、0..要求次数；领过的只留认识的 id、不重复
  if (isObj(p.goals) && isInt(p.goals.day, 0, 1e7)) {
    const prog: NonNullable<Profile['goals']>['prog'] = {};
    if (isObj(p.goals.prog)) for (const k of GOAL_KINDS) if (isInt(p.goals.prog[k], 0, GOALS[k].need)) prog[k] = p.goals.prog[k] as number;
    const ids = new Set<string>([...GOAL_KINDS, GOAL_BOX]);
    const got = Array.isArray(p.goals.got) ? [...new Set(p.goals.got.filter((g): g is string => typeof g === 'string' && ids.has(g)))] : [];
    profile.goals = { day: p.goals.day, prog, got };
  }
  return { profile, lastSeen: isNum(raw.lastSeen) && raw.lastSeen > 0 ? raw.lastSeen : 0 };
}

function progress(s: Save): number[] {
  const p = s.profile;
  const levels = p.base.buildings.reduce((n, b) => n + b.level, 0);
  // 守岛的星数排在战役星数和主寨之后：只打守岛的人进度也算数，云同步不会被另一份盖掉
  const tdStars = Object.values(p.td?.stars ?? {}).reduce((n, v) => n + v, 0) + Object.values(p.escort?.stars ?? {}).reduce((n, v) => n + v, 0);
  // 换掉的金银锭排在攻击次数之后：别的都一样时留换得多的那份，免得旧档盖回来、同一批锭再换一次
  return [totalStars(p), hqLevel(p), tdStars, levels, p.stats.attacks, p.ingot?.spent ?? 0, s.lastSeen];
}

export function mergeSave(local: Save, cloud: Save): Save {
  const a = progress(local);
  const b = progress(cloud);
  let win = local;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) {
      win = a[i]! > b[i]! ? local : cloud;
      break;
    }
  }
  return withMarks(win, win === local ? cloud : local);
}

/** 胜出的那份并上输家的老兵徽、挑战章（都没有就原样返回） */
function withMarks(win: Save, lose: Save): Save {
  const w = win.profile.td;
  const l = lose.profile.td;
  if (!w || (!l?.vet && !l?.chal)) return win;
  const vet = { ...(l.vet ?? {}), ...(w.vet ?? {}) };
  const chal = { ...(l.chal ?? {}), ...(w.chal ?? {}) };
  const td = { ...w, ...(Object.keys(vet).length > 0 ? { vet } : {}), ...(Object.keys(chal).length > 0 ? { chal } : {}) };
  return { ...win, profile: { ...win.profile, td } };
}

export function savePayload(s: Save): unknown {
  return s;
}
