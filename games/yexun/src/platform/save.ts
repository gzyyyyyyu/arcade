/**
 * 本机存档（localStorage `yexun.save`）和设置（`yexun.settings`，音效、音乐开关由 audio/ 读写，同一个 key 里各管各的字段）。
 * 存储不可用（隐私模式、满了）时照常能玩，只是不记得。云存档（`cloud.ts`）同步的就是这一份去掉本机字段后的样子，合并见 `mergeSave`。
 *
 * 局外成长（DESIGN.md 3.7、3.8）：铜钱只在游戏里，和筹码完全分开。铜钱不存一个总数，存"流水"（每局赚的、每次花的各一条，带 id）：
 * 两台设备各玩各花，合并时按 id 取并集再加总，不会因为"取较大的那个总数"白送或者扣成负数（5.5）。
 */
import { DANGER_IDS, type Danger, type Difficulty } from '../content/waves.ts';
import { MAP_UNLOCK, type MapId } from '../content/maps.ts';
import { WEEKLY_FX, type WeeklyId } from '../content/weekly.ts';
import { CHARACTER_IDS, PICK_CHAR_IDS, CURSE_COIN_BONUS, CURSE_IDS, FIRST_RUN_COINS, RUN_BONUS, MAX_CURSES, PERK_IDS, PERKS, ASSIST, COIN_EXCHANGE, KIT_IDS, KITS, LOOK_IDS, LOOKS, type CharacterId, type CurseId, type KitId, type LookId, type LookSlot, type PerkId } from '../content/meta.ts';
import { readFlag, writeFlag } from '../view/audio/sfx.ts';
import { isLiveTier, type LiveTier } from '../content/live.ts';
import { RAID_OPEN } from '../content/explore.ts';
import { emptyVault, herbalistUnlocked, normalizeVault, type VaultSave } from '../explore/vault.ts';
import { mainSchools } from '../content/pools.ts';
import type { SchoolId } from '../content/guide.ts';
import type { Setup } from '../core/state.ts';
import { TRIAL_IDS, TRIAL_OPEN_NEED, TRIAL_TIERS, TRIALS, type TrialId, type TrialTier } from '../content/trials.ts';
import { WEEK_GOAL_ALL, WEEK_GOAL_COINS, weekGoals, type WeekRun } from '../content/weekGoals.ts';

const SAVE_KEY = 'yexun.save';

export interface Best {
  /** 撑了多少拍（赢了 = 天亮） */
  ticks: number;
  kills: number;
  won: boolean;
}

/** 铜钱流水的一条：[id, 变化]；id 是局号或者"买了什么" */
export type Entry = [string, number];

/** 一个角色的开局配置：A 起手换第二件、B 心法（本角色的一个主修流派）；对应 Setup.startAlt / Setup.xinfa */
export interface Loadout {
  alt?: true;
  xinfa?: SchoolId;
}

/** 读存档里的开局配置：认不得的角色、不是该角色主修的流派一律丢掉（手改存档、以后改了流派表都不会带进对局） */
function reviveLoadout(o: unknown): Save['loadout'] {
  const out: Save['loadout'] = {};
  if (!o || typeof o !== 'object') return out;
  for (const id of PICK_CHAR_IDS) {
    const v = (o as Record<string, unknown>)[id];
    if (!v || typeof v !== 'object') continue;
    const { alt, xinfa } = v as Record<string, unknown>;
    const l: Loadout = {};
    if (alt === true) l.alt = true;
    if (typeof xinfa === 'string' && (mainSchools(id) as readonly string[]).includes(xinfa)) l.xinfa = xinfa as SchoolId;
    if (l.alt || l.xinfa) out[id as CharacterId] = l;
  }
  return out;
}

/** 这个角色的配置，直接并进普通守夜、夜探、实盘的 Setup（每日、每周、连战不调它，排行榜局人人一样） */
export function loadoutSetup(s: Pick<Save, 'loadout'>, c: CharacterId): Pick<Setup, 'startAlt' | 'xinfa'> {
  const l = s.loadout[c];
  return { ...(l?.alt ? { startAlt: true } : {}), ...(l?.xinfa ? { xinfa: l.xinfa } : {}) };
}

/** 改一个角色的配置：alt、xinfa 传 undefined 或 false 表示不带；全空就删掉这一项 */
export function setLoadout(s: Save, c: CharacterId, patch: { alt?: boolean; xinfa?: SchoolId | null }): void {
  const cur = s.loadout[c] ?? {};
  const alt = patch.alt === undefined ? cur.alt : patch.alt || undefined;
  const xinfa = patch.xinfa === undefined ? cur.xinfa : patch.xinfa ?? undefined;
  const next: Loadout = { ...(alt ? { alt: true as const } : {}), ...(xinfa ? { xinfa } : {}) };
  if (next.alt || next.xinfa) s.loadout[c] = next;
  else delete s.loadout[c];
}

export interface Save {
  v: 1;
  runs: number;
  wins: number;
  /** 引导做过的几条（moved / cards / chest），做过就不再提示 */
  tips: string[];
  /** 玩家点了"不再提示" */
  tipsOff: boolean;
  /** 上次选的难度（菜单三档）、地图 */
  difficulty: Difficulty;
  map: MapId;
  best: Partial<Record<Difficulty, Best>>;
  /** 上次选的危险档、角色、咒印 */
  danger: Danger;
  character: CharacterId;
  /** 开局配置：每个角色各记一份（起手换第二件、心法流派）；没记的就是都不带。只在这台设备上（和角色、咒印一样不进云存档） */
  loadout: Partial<Record<CharacterId, Loadout>>;
  curses: CurseId[];
  /** 每个危险档的最好成绩（键是 0–5） */
  bestD: Partial<Record<Danger, Best>>;
  /** 撑到天亮过的最高危险档（−1 = 还没有）；下一档随之解锁 */
  cleared: number;
  /** 永久加成的等级 */
  perks: Partial<Record<PerkId, number>>;
  /** 花铜钱买下的角色（别的角色按成绩解锁，见 charOpen） */
  bought: CharacterId[];
  /** 0.34.0 改成要解锁之前就能选的角色里、老存档照留的（见 reviveSave；新存档是空的） */
  legacy: CharacterId[];
  /** 铜钱流水，太长时最旧的并进 coinBase */
  ledger: Entry[];
  coinBase: number;
  /** 单局最长撑了几秒、最多打死几只（解锁角色用） */
  maxSeconds: number;
  maxKills: number;
  /** 夜探撤出过几次（解锁采药女；老存档没有这项，按 0 起算，已解锁的靠 charOpen 的老条件保住） */
  extracts: number;
  /** 夜市一共买过几样东西（解锁货郎用；两台设备合并取大的，不会回退） */
  marketBuys: number;
  /** 藏宝阁：带出过的宝物（各几件）和见过的（夜探） */
  vault: VaultSave;
  /** 打过教学镇了（之后夜探才能选模板和危险档） */
  raidDone: boolean;
  /** 连着倒下几局（赢了、认输都清零） */
  streak: number;
  /** "降低伤害"开着（成绩不进总榜）；问过了没有（问过不再追着问，设置里能随时开关） */
  assist: boolean;
  assistAsked: boolean;
  /** 菜单上次停在实盘、选的哪一档（本机） */
  liveOn: boolean;
  liveTier: LiveTier;
  /** 上次开的模式、夜探选的镇子（主页"开始"一步直达用；本机偏好，不上云） */
  lastMode: LastMode;
  raidTpl: RaidPick;
  /** 下一局带的锦囊（本机，像咒印一样选着；开局时扣铜钱，见 payKits） */
  kits: KitId[];
  /** 买下的外观（上云取并集）；穿着哪款（本机） */
  looks: LookId[];
  wear: Partial<Record<LookSlot, LookId>>;
  /** 换筹码发出去还没结的（上云：另一台设备也能用同一个 op 重发，钱包按 op 只算一次） */
  xc: XcPending[];
  /** 试炼每关的最好成绩（content/trials.ts trialScore：通关 × 1e9 + 完成度） */
  trials: Partial<Record<TrialId, number>>;
  /** 本周的周目标进度：第几周、三条各多少、完成了哪几条（位 0–2，位 3 = 三条全完成那份） */
  weekGoal: WeekGoal;
}

export interface WeekGoal {
  week: number;
  prog: number[];
  done: number;
}

/** 一笔还没结的兑换：发之前已经记了 `xc:<op>` = −coins，结的时候补 `xcr:<op>` = 退回没入账的部分 */
export interface XcPending {
  op: string;
  /** 要换进的筹码 */
  amount: number;
  /** 先扣的铜钱 = amount × 汇率 */
  coins: number;
}

export type LastMode = 'vigil' | 'raid';
/** 夜探能选的镇（教学镇是第一次固定进的，不记） */
export type RaidPick = 'guzhen' | 'dukou' | 'shansi' | 'xilou' | 'liangcang' | 'yaozhen';
/** 菜单能选的镇子：content/explore.ts 的 RAID_OPEN 去掉教学镇（粮仓镇为什么收起见那里） */
export const RAID_PICKS: readonly RaidPick[] = RAID_OPEN.filter((t): t is RaidPick => t !== 'teach');

/** 流水超过这么多条，最旧的并成一个数（并过的流水在两台设备上可能各算一次，所以留得够长：几百局才会碰到） */
const LEDGER_MAX = 400;

export const fresh = (): Save => ({
  v: 1,
  runs: 0,
  wins: 0,
  tips: [],
  tipsOff: false,
  difficulty: 'easy',
  map: 'snow',
  best: {},
  danger: 0,
  character: 'xiaodao',
  loadout: {},
  curses: [],
  bestD: {},
  cleared: -1,
  perks: {},
  bought: [],
  legacy: [],
  ledger: [],
  coinBase: 0,
  maxSeconds: 0,
  maxKills: 0,
  extracts: 0,
  marketBuys: 0,
  vault: emptyVault(),
  raidDone: false,
  streak: 0,
  assist: false,
  assistAsked: false,
  liveOn: false,
  liveTier: 'small',
  lastMode: 'vigil',
  raidTpl: 'guzhen',
  kits: [],
  looks: [],
  wear: {},
  xc: [],
  trials: {},
  weekGoal: { week: -1, prog: [0, 0, 0], done: 0 },
});

const num = (v: unknown, min = 0, max = 1e12): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : null);
const strs = (v: unknown, max = 500): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length <= 64))].slice(0, max) : []);
const best = (v: unknown): Best | null => {
  if (!v || typeof v !== 'object') return null;
  const b = v as Partial<Best>;
  const ticks = num(b.ticks);
  const kills = num(b.kills);
  return ticks === null || kills === null ? null : { ticks, kills, won: !!b.won };
};

/** 不可信的数据（本机旧档、云端）→ 干净的存档；读不懂的字段用默认值 */
export function reviveSave(o: unknown): Save | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.v !== 1) return null;
  const s = fresh();
  s.runs = num(r.runs) ?? 0;
  s.wins = num(r.wins) ?? 0;
  s.tips = strs(r.tips, 20);
  s.tipsOff = r.tipsOff === true;
  if (r.difficulty === 'easy' || r.difficulty === 'normal' || r.difficulty === 'hard') s.difficulty = r.difficulty;
  if (typeof r.map === 'string' && r.map in MAP_UNLOCK) s.map = r.map as MapId;
  if (r.best && typeof r.best === 'object') {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const b = best((r.best as Record<string, unknown>)[d]);
      if (b) s.best[d] = b;
    }
  }
  const dg = num(r.danger, 0, 8);
  if (dg !== null) s.danger = dg as Danger;
  if (typeof r.character === 'string' && PICK_CHAR_IDS.includes(r.character as CharacterId)) s.character = r.character as CharacterId;
  s.loadout = reviveLoadout(r.loadout);
  s.curses = CURSE_IDS.filter((c) => strs(r.curses).includes(c)).slice(0, MAX_CURSES);
  if (r.bestD && typeof r.bestD === 'object') {
    for (const d of DANGER_IDS) {
      const b = best((r.bestD as Record<string, unknown>)[d]);
      if (b) s.bestD[d] = b;
    }
  }
  s.cleared = num(r.cleared, -1, 8) ?? -1;
  if (r.perks && typeof r.perks === 'object') {
    for (const id of PERK_IDS) {
      const lv = num((r.perks as Record<string, unknown>)[id], 0, PERKS[id].cost.length);
      if (lv) s.perks[id] = lv;
    }
  }
  s.bought = CHARACTER_IDS.filter((c) => strs(r.bought).includes(c));
  // 纸匠、阴阳先生 0.34.0 前一开始就有。没有这个字段的是老存档：打过局的两人都留（存档没按角色记过局数，分不出谁玩过谁，宁可多给不收回）
  s.legacy = Array.isArray(r.legacy) ? LEGACY_CHARS.filter((c) => strs(r.legacy).includes(c)) : s.runs > 0 ? [...LEGACY_CHARS] : [];
  if (Array.isArray(r.ledger)) {
    const seen = new Set<string>();
    for (const e of r.ledger) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || e[0].length > 64 || seen.has(e[0])) continue;
      const n = num(e[1], -1e9, 1e9);
      if (n === null) continue;
      seen.add(e[0]);
      s.ledger.push([e[0], n]);
    }
  }
  s.coinBase = num(r.coinBase, -1e9, 1e12) ?? 0;
  s.maxSeconds = num(r.maxSeconds) ?? 0;
  s.maxKills = num(r.maxKills) ?? 0;
  s.extracts = num(r.extracts, 0, 1e6) ?? 0;
  s.marketBuys = num(r.marketBuys, 0, 1e6) ?? 0;
  s.vault = normalizeVault(r.vault);
  s.raidDone = r.raidDone === true;
  s.streak = num(r.streak, 0, 1000) ?? 0;
  s.assist = r.assist === true;
  s.assistAsked = r.assistAsked === true;
  s.liveOn = r.liveOn === true;
  if (isLiveTier(r.liveTier)) s.liveTier = r.liveTier;
  if (r.lastMode === 'vigil' || r.lastMode === 'raid') s.lastMode = r.lastMode;
  if ((RAID_PICKS as readonly unknown[]).includes(r.raidTpl)) s.raidTpl = r.raidTpl as RaidPick;
  s.kits = KIT_IDS.filter((k) => strs(r.kits).includes(k));
  s.looks = LOOK_IDS.filter((k) => strs(r.looks).includes(k));
  if (r.wear && typeof r.wear === 'object') {
    for (const [slot, id] of Object.entries(r.wear as Record<string, unknown>)) {
      if (s.looks.includes(id as LookId) && LOOKS[id as LookId].slot === slot) s.wear[slot as LookSlot] = id as LookId;
    }
  }
  s.xc = reviveXc(r.xc, s.ledger);
  if (r.trials && typeof r.trials === 'object') {
    for (const id of TRIAL_IDS) {
      const v = num((r.trials as Record<string, unknown>)[id], 0, 2e9);
      if (v !== null) s.trials[id] = v;
    }
  }
  const wg = r.weekGoal as Partial<WeekGoal> | undefined;
  if (wg && typeof wg === 'object') {
    const week = num(wg.week, -1, 1e6);
    if (week !== null) s.weekGoal = { week, prog: [0, 1, 2].map((n) => num(Array.isArray(wg.prog) ? wg.prog[n] : 0) ?? 0), done: num(wg.done, 0, 15) ?? 0 };
  }
  return s;
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return (raw && reviveSave(JSON.parse(raw))) || fresh();
  } catch {
    return fresh();
  }
}

/** 存档写进本机以后通知（main.ts 接云存档：标记 profile 槽待上传） */
export const saveHooks = { onWrite: (): void => undefined };

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* 写不进去就算了 */
  }
  saveHooks.onWrite();
}

// ───────────────────────── 成绩 ─────────────────────────

/** a 比 b 好：先比赢没赢，再比撑的时间，再比击杀 */
function better(a: Best, b: Best | undefined): boolean {
  return !b || (a.won ? !b.won || a.kills > b.kills : !b.won && (a.ticks > b.ticks || (a.ticks === b.ticks && a.kills > b.kills)));
}

/** 记一局；返回这局是不是这个难度的新纪录；counts = false（认输）只记局数 */
export function recordRun(s: Save, d: Difficulty, run: Best, counts = true): boolean {
  s.runs++;
  if (run.won) s.wins++;
  if (!counts) {
    writeSave(s);
    return false;
  }
  const b = better(run, s.best[d]);
  if (b) s.best[d] = run;
  writeSave(s);
  return b;
}

export interface RunEnd {
  /** 这一局的 id（铜钱流水用；同一局在两台设备上不会重复） */
  id: string;
  danger: Danger;
  won: boolean;
  quit: boolean;
  ticks: number;
  kills: number;
  /** 局里捡到的铜钱 */
  coins: number;
  curses: number;
  /** 打倒了尸王 */
  boss?: boolean;
  /** 这局夜市买了几样（World.mkBuys） */
  market?: number;
  /** 局里铜钱的来源（核心 w.coinBy）；没传就整笔算"捡到的" */
  coinBy?: { drop: number; purse: number; prop: number; chest: number; weekly?: number };
  /** 这局开的本周夜事（Setup.weekly）；铜钱周在这里结算时加成，精英周的额外铜钱已在 coinBy.weekly 里 */
  weekly?: WeeklyId;
  /** 今天的日期（北京时间 YYYY-MM-DD），每日首胜用；没传不发 */
  day?: string;
}

/** 结算页的一行：从哪来、几枚 */
export interface CoinSource {
  label: string;
  coins: number;
}

export interface RunReward {
  /** 这一局记进流水的铜钱（咒印加成、第一局保底以后） */
  coins: number;
  record: boolean;
  /** 刚好这一局解锁了下一档危险 */
  unlockedDanger: Danger | null;
  /** 该问"要不要降低伤害"了 */
  askAssist: boolean;
  /** 按来源分的明细（加起来 = coins，加上每日首胜那笔） */
  sources: CoinSource[];
}

/**
 * 一局带出局外的铜钱：剩下的局内铜钱，扣掉招财进宝多掉、又没在局里花掉的那部分（局里花钱先算花的是它）。
 * 货郎的招财进宝一局能多掉上万枚（0.34.0 量过：别的角色一局 1,200～2,500，货郎 7,500～13,000），只在局里用；
 * 守夜、夜探、实盘都走这里。World 上的两个数只记账，不影响规则。
 */
export function carryCoins(w: { coins: number; coinFortune: number; coinSpent: number }): number {
  return Math.max(0, w.coins - Math.max(0, w.coinFortune - w.coinSpent));
}

/** 一局的铜钱明细：局里捡的按来源，再加撑的时间、击杀、天亮、尸王（按危险档放大）、咒印加成 */
export function runCoins(r: RunEnd): CoinSource[] {
  const out: CoinSource[] = [];
  const add = (label: string, n: number): void => {
    if (n > 0) out.push({ label, coins: Math.floor(n) });
  };
  const by = r.coinBy;
  if (by) {
    const rest = Math.max(0, r.coins - by.purse - by.chest - by.prop - (by.weekly ?? 0));
    add('捡到的铜钱', rest);
    add('碰碎的摆设', by.prop);
    add('铜钱袋', by.purse);
    add('宝箱', by.chest);
    add('本周夜事', by.weekly ?? 0);
  } else add('捡到的铜钱', r.coins);
  const k = 1 + RUN_BONUS.dangerStep * r.danger;
  add(`撑了 ${Math.floor(r.ticks / 1800)} 分钟`, Math.floor(r.ticks / 1800) * RUN_BONUS.perMin * k);
  add(`打倒 ${r.kills} 只`, Math.floor(r.kills / RUN_BONUS.killsPer) * k);
  if (r.won) add('撑到天亮', RUN_BONUS.dawn * k);
  if (r.boss) add('打倒尸王', RUN_BONUS.boss * k);
  // 铜钱周：上面这些合计再多 50%，单列一行；咒印加成在它之后算
  if (r.weekly === 'coin') add('本周夜事', out.reduce((a, c) => a + c.coins, 0) * WEEKLY_FX.coinBonus);
  const sum = out.reduce((a, c) => a + c.coins, 0);
  if (r.curses > 0) add(`咒印 ${r.curses} 条`, sum * CURSE_COIN_BONUS * r.curses);
  return out;
}

/**
 * 一局结束（危险档那一套；菜单三档的 recordRun 另记）：铜钱进流水、危险档解锁、连死计数、解锁角色用的单局最好。
 * 第一局（无论胜负）至少给 FIRST_RUN_COINS，正好够买一级最便宜的加成（3.8）。
 */
export function finishRun(s: Save, r: RunEnd): RunReward {
  const first = s.ledger.every(([id]) => !id.startsWith('run:')) && s.coinBase === 0;
  s.runs++;
  if (r.won) s.wins++;
  const sources = runCoins(r);
  let coins = sources.reduce((a, c) => a + c.coins, 0);
  if (first && coins < FIRST_RUN_COINS) {
    sources.push({ label: '第一局见面礼', coins: FIRST_RUN_COINS - coins });
    coins = FIRST_RUN_COINS;
  }
  if (coins > 0) earn(s, `run:${r.id}`, coins);
  // 每日首胜：流水 id 带日期，同一天（两台设备也算）只记一次
  if (r.won && r.day && !s.ledger.some(([x]) => x === `dailywin:${r.day}`)) {
    earn(s, `dailywin:${r.day}`, RUN_BONUS.dailyWin);
    sources.push({ label: '今天第一次天亮', coins: RUN_BONUS.dailyWin });
    coins += RUN_BONUS.dailyWin;
  }
  const run: Best = { ticks: r.ticks, kills: r.kills, won: r.won };
  const record = !r.quit && better(run, s.bestD[r.danger]);
  if (record) s.bestD[r.danger] = run;
  let unlockedDanger: Danger | null = null;
  if (r.won && r.danger > s.cleared) {
    s.cleared = r.danger;
    if (r.danger < 8) unlockedDanger = (r.danger + 1) as Danger;
  }
  s.maxSeconds = Math.max(s.maxSeconds, Math.floor(r.ticks / 30));
  s.maxKills = Math.max(s.maxKills, r.kills);
  s.marketBuys += r.market ?? 0;
  s.streak = !r.won && !r.quit ? s.streak + 1 : 0;
  const askAssist = !s.assist && !s.assistAsked && s.streak >= ASSIST.deaths;
  if (askAssist) s.assistAsked = true;
  writeSave(s);
  return { coins, record, unlockedDanger, askAssist, sources };
}

/**
 * 实盘守夜结束：只记解锁要用的进度（0.3.11，所有者实盘中档撑到天亮、竹林还锁着）。
 * - maxSeconds：地图、更夫按它解锁；认输按撑到的时间算，和娱乐一样；
 * - marketBuys：这局夜市买过几次，货郎按它解锁（夜探撤出记 extracts 走 finishRaid，实盘娱乐同一条路）；
 * - cleared：撑到天亮就解锁娱乐的下一危险档、咒印。实盘不带加成、咒印，同一危险档比娱乐只难不易，记上不会让谁白捡；
 *   钱包结回只看实盘档位和结局，不看 cleared，所以不碰实盘的配平。
 * 不加局数、不发铜钱、不记纪录和排行（实盘的钱走钱包，纪录和娱乐分开）。
 */
export function recordLiveVigil(s: Save, r: { danger: Danger; won: boolean; ticks: number; market?: number }): void {
  s.maxSeconds = Math.max(s.maxSeconds, Math.floor(r.ticks / 30));
  if (r.won && r.danger > s.cleared) s.cleared = r.danger;
  // 实盘夜市买的也算货郎的解锁进度（所有者 11-09）
  s.marketBuys += r.market ?? 0;
  writeSave(s);
}

// ───────────────────────── 解锁 ─────────────────────────

/** 能选的最高危险档：撑到天亮过的下一档；第一局锁危险 0（13.2） */
export function dangerOpen(s: Save): Danger {
  return (s.runs === 0 ? 0 : Math.min(8, s.cleared + 1)) as Danger;
}

/** 这张图开了没有（雪原、义庄一开始就开；别的按守夜最长撑过的时间，MAP_UNLOCK） */
export function mapOpen(s: Save, id: MapId): boolean {
  const u = MAP_UNLOCK[id];
  return !u || s.maxSeconds >= u.seconds;
}

/** 纸匠：守夜一局撑过这么久（秒） */
export const ZHIJIANG_SECONDS = 4 * 60;
/** 0.34.0 起要解锁、老存档照留的角色 */
const LEGACY_CHARS: readonly CharacterId[] = ['zhijiang', 'yinyang'];
/** 更夫：守夜一局撑过这么久（秒） */
export const GENGFU_SECONDS = 8 * 60;
/** 摆渡人：夜探撤出过之后，守夜一局撑过这么久（秒） */
export const BAIDU_SECONDS = 6 * 60;
/** 货郎：夜市买过几次东西 */
export const HUOLANG_BUYS = 3;
/** 胖师叔的价钱 */
export const PANG_PRICE = 300;

/**
 * 角色解锁（3.7）：小道士、符师、剑侠一开始就有；纸匠守夜撑过 4 分钟；胖师叔花铜钱；更夫守夜撑过 8 分钟；采药女夜探撤出 1 次；
 * 摆渡人夜探撤出 1 次后守夜撑过 6 分钟；货郎夜市买过 3 次东西；阴阳先生守夜撑到天亮 1 次。
 * 老条件（危险 2 通关、藏宝阁 20 件、0.34.0 前打过局的纸匠和阴阳先生）照认：老存档已经解锁的不会被收回。
 */
export function charOpen(s: Save, c: CharacterId): boolean {
  switch (c) {
    case 'xiaodao':
    case 'fushi':
    case 'jianxia':
      return true;
    case 'pang':
      return s.bought.includes('pang');
    case 'gengfu':
      return s.maxSeconds >= GENGFU_SECONDS || s.cleared >= 2;
    case 'caiyao':
      return s.extracts >= 1 || herbalistUnlocked(s.vault);
    case 'zhijiang':
      return s.maxSeconds >= ZHIJIANG_SECONDS || s.legacy.includes('zhijiang');
    case 'yinyang':
      return s.cleared >= 0 || s.legacy.includes('yinyang');
    case 'baidu':
      return s.extracts >= 1 && s.maxSeconds >= BAIDU_SECONDS;
    case 'huolang':
      return s.marketBuys >= HUOLANG_BUYS;
  }
}

/** 花铜钱买的角色和价格 */
export const CHAR_PRICE: Partial<Record<CharacterId, number>> = { pang: PANG_PRICE };

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** 没解锁的角色，角色页上显示的进度（一句话） */
export function charProgress(s: Save, c: CharacterId): string {
  switch (c) {
    case 'pang':
      return `攒够 ${PANG_PRICE} 铜钱就能请他`;
    case 'zhijiang':
      return `守夜撑过 4 分钟（最好 ${mmss(s.maxSeconds)}）`;
    case 'gengfu':
      return `守夜撑过 8 分钟（最好 ${mmss(s.maxSeconds)}）`;
    case 'caiyao':
      return `夜探成功撤出 1 次（已 ${s.extracts} 次）`;
    case 'baidu':
      return `夜探撤出 1 次（已 ${s.extracts} 次），再守夜撑过 6 分钟（最好 ${mmss(s.maxSeconds)}）`;
    case 'huolang':
      return `夜市买过 ${HUOLANG_BUYS} 次东西（已 ${s.marketBuys} 次）`;
    case 'yinyang':
      return '守夜撑到天亮 1 次';
    default:
      return '';
  }
}

// ───────────────────────── 铜钱 ─────────────────────────

export function coins(s: Save): number {
  let n = s.coinBase;
  for (const [, v] of s.ledger) n += v;
  return n;
}

function earn(s: Save, id: string, n: number): void {
  if (s.ledger.some(([x]) => x === id)) return;
  s.ledger.push([id, n]);
  if (s.ledger.length > LEDGER_MAX) {
    const old = s.ledger.splice(0, s.ledger.length - LEDGER_MAX);
    for (const [, v] of old) s.coinBase += v;
  }
}

/** 记一笔别处来的铜钱（成就奖励等）；同一个 id 只记一次 */
export function grantCoins(s: Save, id: string, n: number): void {
  if (n <= 0) return;
  earn(s, id, n);
  writeSave(s);
}

/** 流水 id 要在两台设备上都不撞：带上本机的随机后缀（画面层传进来，核心不碰随机） */
function spend(s: Save, id: string, n: number): boolean {
  if (n > coins(s)) return false;
  earn(s, id, -n);
  return true;
}

/** 下一级的价格；满级为 null */
export function perkPrice(s: Save, id: PerkId): number | null {
  return PERKS[id].cost[s.perks[id] ?? 0] ?? null;
}

/** 买一级加成；nonce 让流水 id 唯一（画面层给一个随机串） */
export function buyPerk(s: Save, id: PerkId, nonce: string): boolean {
  const price = perkPrice(s, id);
  if (price === null || !spend(s, `perk:${id}:${(s.perks[id] ?? 0) + 1}:${nonce}`, price)) return false;
  s.perks[id] = (s.perks[id] ?? 0) + 1;
  writeSave(s);
  return true;
}

/** 全退：加成清零，花掉的铜钱全数还回来（3.8"随时全退重配"） */
export function refundPerks(s: Save, nonce: string): number {
  let back = 0;
  for (const id of PERK_IDS) for (let lv = 0; lv < (s.perks[id] ?? 0); lv++) back += PERKS[id].cost[lv]!;
  if (back <= 0) return 0;
  earn(s, `refund:${nonce}`, back);
  s.perks = {};
  writeSave(s);
  return back;
}

export function buyChar(s: Save, c: CharacterId, nonce: string): boolean {
  const price = CHAR_PRICE[c];
  if (price === undefined || s.bought.includes(c) || !spend(s, `char:${c}:${nonce}`, price)) return false;
  s.bought.push(c);
  writeSave(s);
  return true;
}

// ───────────────────────── 锦囊、外观 ─────────────────────────

/** 开局时扣锦囊的铜钱，返回这局实际带上的（钱不够的那个不带，从选着的里去掉）；seed 让流水 id 一局一个 */
export function payKits(s: Save, seed: number, nonce: string): KitId[] {
  const got: KitId[] = [];
  for (const k of s.kits) if (spend(s, `kit:${k}:${seed.toString(36)}:${nonce}`, KITS[k].cost)) got.push(k);
  s.kits = got;
  writeSave(s);
  return got;
}

export function buyLook(s: Save, id: LookId, nonce: string): boolean {
  if (s.looks.includes(id) || !spend(s, `look:${id}:${nonce}`, LOOKS[id].cost)) return false;
  s.looks.push(id);
  s.wear[LOOKS[id].slot] = id;
  writeSave(s);
  return true;
}

/** 穿上（买下了的）或者脱下这一栏 */
export function wearLook(s: Save, slot: LookSlot, id: LookId | null): void {
  if (id === null) delete s.wear[slot];
  else if (s.looks.includes(id) && LOOKS[id].slot === slot) s.wear[slot] = id;
  writeSave(s);
}

// ───────────────────────── 铜钱换筹码（流水只追加） ─────────────────────────

const XC_OP = /^xc-[A-Za-z0-9_-]{5,61}$/;
const settled = (ledger: Entry[], op: string): boolean => ledger.some(([id]) => id === `xcr:${op}`);

function reviveXc(v: unknown, ledger: Entry[]): XcPending[] {
  if (!Array.isArray(v)) return [];
  const out: XcPending[] = [];
  for (const x of v.slice(0, 20)) {
    if (!x || typeof x !== 'object') continue;
    const { op, amount, coins: c } = x as Record<string, unknown>;
    const a = num(amount, 1, 1e7);
    if (typeof op !== 'string' || !XC_OP.test(op) || a === null || num(c) !== a * COIN_EXCHANGE.rate || settled(ledger, op) || out.some((y) => y.op === op)) continue;
    out.push({ op, amount: a, coins: a * COIN_EXCHANGE.rate });
  }
  return out;
}

/** 发兑换之前：先扣全额铜钱、记待办。钱不够返回 false，什么都不记 */
export function startExchange(s: Save, op: string, amount: number): boolean {
  const c = amount * COIN_EXCHANGE.rate;
  if (!XC_OP.test(op) || amount < 1 || !spend(s, `xc:${op}`, c)) return false;
  s.xc.push({ op, amount, coins: c });
  writeSave(s);
  return true;
}

/** 结一笔：credited 是钱包实际换进的筹码（被拒是 0），没入账的铜钱退回；退 0 也记一条，作为「这笔结过了」的记号 */
export function endExchange(s: Save, op: string, credited: number): void {
  const p = s.xc.find((x) => x.op === op);
  s.xc = s.xc.filter((x) => x.op !== op);
  if (p && !settled(s.ledger, op)) earn(s, `xcr:${op}`, p.coins - Math.max(0, Math.min(p.amount, Math.floor(credited))) * COIN_EXCHANGE.rate);
  writeSave(s);
}

/** 换筹码页底下的本机流水：一笔兑换 = `xc:` 扣的铜钱 + `xcr:` 退的；时间从兑换号里读（老的号读不出是 null） */
export interface XcLogRow {
  at: number | null;
  /** 换进的筹码（还没结的是要换的数） */
  chips: number;
  coins: number;
  pending: boolean;
}

/** 最近 n 笔（新的在前）；被拒、全额退回的不算 */
export function exchangeLog(s: Save, n: number): XcLogRow[] {
  const refund = new Map<string, number>();
  for (const [id, v] of s.ledger) if (id.startsWith('xcr:')) refund.set(id.slice(4), v);
  const out: XcLogRow[] = [];
  for (let i = s.ledger.length - 1; i >= 0 && out.length < n; i--) {
    const [id, v] = s.ledger[i]!;
    if (!id.startsWith('xc:')) continue;
    const op = id.slice(3);
    const pending = s.xc.some((x) => x.op === op);
    const coinsOut = -v - (pending ? 0 : (refund.get(op) ?? 0));
    if (coinsOut <= 0) continue;
    out.push({ at: xcOpTime(op), chips: coinsOut / COIN_EXCHANGE.rate, coins: coinsOut, pending });
  }
  return out;
}

/** 兑换号 `xc-<毫秒的 36 进制>-<随机>` 里的时间 */
export function newXcOp(nowMs: number, rand: string): string {
  return `xc-${nowMs.toString(36)}-${rand}`;
}
function xcOpTime(op: string): number | null {
  const m = /^xc-([0-9a-z]{8,9})-/.exec(op);
  return m ? parseInt(m[1]!, 36) : null;
}

// ───────────────────────── 云存档合并 ─────────────────────────

/**
 * 两份存档合成一份（DESIGN.md 5.5）：集合取并集、计数和最好成绩取较好的、铜钱流水按 id 取并集。
 * 加成等级取较高的：两台设备各买了一级同一项时等级只算一次而钱扣了两次，偏向玩家吃亏一点而不是白送；
 * 全退一次（refund 流水）就能拿回来。本机才有意义的（上次选了什么、引导、连死、降低伤害）以本机为准。
 */
export function mergeSave(local: Save, cloud: Save): Save {
  const m: Save = { ...local };
  m.runs = Math.max(local.runs, cloud.runs);
  m.wins = Math.max(local.wins, cloud.wins);
  m.tips = [...new Set([...local.tips, ...cloud.tips])];
  for (const d of ['easy', 'normal', 'hard'] as const) {
    const c = cloud.best[d];
    m.best = { ...m.best };
    if (c && better(c, local.best[d])) m.best[d] = c;
  }
  m.bestD = { ...local.bestD };
  for (const d of DANGER_IDS) {
    const c = cloud.bestD[d];
    if (c && better(c, local.bestD[d])) m.bestD[d] = c;
  }
  m.cleared = Math.max(local.cleared, cloud.cleared);
  m.perks = { ...local.perks };
  for (const id of PERK_IDS) {
    const lv = Math.max(local.perks[id] ?? 0, cloud.perks[id] ?? 0);
    if (lv) m.perks[id] = lv;
  }
  m.bought = CHARACTER_IDS.filter((c) => local.bought.includes(c) || cloud.bought.includes(c));
  m.legacy = LEGACY_CHARS.filter((c) => local.legacy.includes(c) || cloud.legacy.includes(c));
  const seen = new Set(local.ledger.map(([id]) => id));
  m.ledger = [...local.ledger, ...cloud.ledger.filter(([id]) => !seen.has(id))];
  m.coinBase = Math.max(local.coinBase, cloud.coinBase);
  m.maxSeconds = Math.max(local.maxSeconds, cloud.maxSeconds);
  m.maxKills = Math.max(local.maxKills, cloud.maxKills);
  m.extracts = Math.max(local.extracts, cloud.extracts);
  m.marketBuys = Math.max(local.marketBuys, cloud.marketBuys);
  // 藏宝阁：每件取两边多的那个数，见过的取并集（两台设备各打各的都不丢）
  const got: Record<string, number> = { ...cloud.vault.got };
  for (const [id, n] of Object.entries(local.vault.got)) got[id] = Math.max(n, got[id] ?? 0);
  m.vault = normalizeVault({ got, seen: [...local.vault.seen, ...cloud.vault.seen] });
  m.raidDone = local.raidDone || cloud.raidDone;
  m.looks = LOOK_IDS.filter((k) => local.looks.includes(k) || cloud.looks.includes(k));
  // 兑换待办：两边取并集，已经结过的（流水里有 xcr:）去掉
  m.xc = reviveXc([...local.xc, ...cloud.xc], m.ledger);
  m.assistAsked = local.assistAsked || cloud.assistAsked;
  if (m.ledger.length > LEDGER_MAX) {
    const old = m.ledger.splice(0, m.ledger.length - LEDGER_MAX);
    for (const [, v] of old) m.coinBase += v;
  }
  return m;
}

/** 上云的内容：去掉只在本机有意义的字段 */
export function savePayload(s: Save): Omit<Save, 'difficulty' | 'map' | 'danger' | 'character' | 'loadout' | 'curses' | 'streak' | 'assist' | 'tipsOff' | 'liveOn' | 'liveTier' | 'lastMode' | 'raidTpl' | 'kits' | 'wear'> {
  const { difficulty: _d, map: _m, danger: _g, character: _c, loadout: _lo, curses: _u, streak: _s, assist: _a, tipsOff: _t, liveOn: _l, liveTier: _lt, lastMode: _lm, raidTpl: _rt, kits: _k, wear: _w, ...rest } = s;
  return rest;
}

/** 设置里除了声音的几项（声音开关在 audio/ 里） */
export const settings = {
  get shake(): boolean {
    return readFlag('shake', true);
  },
  set shake(on: boolean) {
    writeFlag('shake', on);
  },
  /** 固定摇杆（左下角）；默认浮动摇杆（按哪儿出在哪儿） */
  get fixedStick(): boolean {
    return readFlag('fixedStick', false);
  },
  set fixedStick(on: boolean) {
    writeFlag('fixedStick', on);
  },
};

// ───────────────────────── 试炼、周目标（docs/design-play.md 2.6） ─────────────────────────

/** 这一关通关过没有 */
export const trialCleared = (s: Pick<Save, 'trials'>, id: TrialId): boolean => (s.trials[id] ?? 0) >= 1e9;

/** 这一档开了没有：入门一直开；往后要前一档通过 TRIAL_OPEN_NEED 关 */
export function trialTierOpen(s: Pick<Save, 'trials'>, tier: TrialTier): boolean {
  if (tier === 0) return true;
  return TRIAL_IDS.filter((id) => TRIALS[id].tier === tier - 1 && trialCleared(s, id)).length >= TRIAL_OPEN_NEED;
}

export interface TrialReward {
  /** 刷新了这关的最好成绩（要交排行榜） */
  best: boolean;
  /** 第一次通关，给了多少铜钱（流水 trial:<id>，只记一次）；没有为 0 */
  first: number;
}

/** 试炼一局结束：记最好成绩，第一次通关发铜钱。认输的照常记（成绩按当时算） */
export function finishTrial(s: Save, id: TrialId, score: number): TrialReward {
  const before = s.trials[id] ?? -1;
  const best = score > before;
  if (best) s.trials[id] = score;
  let first = 0;
  if (score >= 1e9 && before < 1e9 && !s.ledger.some(([x]) => x === `trial:${id}`)) {
    first = TRIAL_TIERS[TRIALS[id].tier]!.coins;
    earn(s, `trial:${id}`, first);
  }
  writeSave(s);
  return { best, first };
}

/** 换周了就从零开始（周序号由画面层按北京时间算好传进来） */
function weekGoalOf(s: Save, week: number): WeekGoal {
  if (s.weekGoal.week !== week) s.weekGoal = { week, prog: [0, 0, 0], done: 0 };
  return s.weekGoal;
}

/** 本周 3 条的进度（主页、试炼页显示用；不写存档） */
export function weekGoalView(s: Save, week: number): { text: string; need: number; prog: number; done: boolean; coins: number }[] {
  const g = s.weekGoal.week === week ? s.weekGoal : { prog: [0, 0, 0], done: 0 };
  return weekGoals(week).map((d, n) => ({ text: d.text, need: d.need, prog: Math.min(d.need, g.prog[n] ?? 0), done: (g.done & (1 << n)) !== 0, coins: WEEK_GOAL_COINS[n]! }));
}

/** 一局算进本周进度；新完成的条目发铜钱（流水 weekgoal:<周>:<n>、weekgoal:<周>:all，各只记一次），返回结算页的来源行 */
export function applyWeekRun(s: Save, week: number, run: WeekRun): CoinSource[] {
  const g = weekGoalOf(s, week);
  const out: CoinSource[] = [];
  weekGoals(week).forEach((d, n) => {
    if (g.done & (1 << n)) return;
    g.prog[n] = Math.min(d.need, (g.prog[n] ?? 0) + d.gain(run));
    if (g.prog[n]! < d.need) return;
    g.done |= 1 << n;
    const id = `weekgoal:${week}:${n}`;
    if (s.ledger.some(([x]) => x === id)) return;
    earn(s, id, WEEK_GOAL_COINS[n]!);
    out.push({ label: `周目标：${d.text}`, coins: WEEK_GOAL_COINS[n]! });
  });
  if ((g.done & 7) === 7 && !(g.done & 8)) {
    g.done |= 8;
    const id = `weekgoal:${week}:all`;
    if (!s.ledger.some(([x]) => x === id)) {
      earn(s, id, WEEK_GOAL_ALL);
      out.push({ label: '本周目标全完成', coins: WEEK_GOAL_ALL });
    }
  }
  writeSave(s);
  return out;
}
