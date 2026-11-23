/**
 * 浏览器存储：全部 key 带 `guandan.` 前缀（所有游戏同域，前缀是唯一的隔离手段）。
 * 读坏了（JSON 损坏、版本不对）一律退回默认值，不让坏存档卡死游戏。
 */
import { soloLevelOf, type SoloLevel } from '../variants/guandan/ai/venue.ts';
import type { GameState, Options } from '../variants/guandan/core/index.ts';
import type { MatchLog } from '../variants/guandan/stake/titles.ts';
import { DDZ_RULES, type DdzState } from '../variants/doudizhu/core/index.ts';
import { isTier, type TierId } from '../core/stake.ts';

export const KEYS = {
  save: 'guandan.save',
  settings: 'guandan.settings',
  stats: 'guandan.stats',
  tutorial: 'guandan.tutorial',
  errors: 'guandan.errors',
  /** 云同步元数据 {v, userId, rev, dirty}（cloud.ts） */
  cloud: 'guandan.cloud',
  /** iOS 防崩溃标记 {v, pending, low, ver}（device.ts） */
  boot: 'guandan.boot',
  /** "添加到主屏幕"提示关掉了（a2hs.ts） */
  a2hs: 'guandan.a2hs',
  /** 联机：最近进的房间 {code, host, at}，刷新后回得去（net.ts） */
  room: 'guandan.room',
  /** 单机实盘这一场（stake.ts）：只在本机，不进云同步 */
  stake: 'guandan.stake',
  /** 单独部署（没有平台）时好友房里的昵称（platform.ts、online.ts） */
  nick: 'guandan.nick',
  /** 牌馆 0.28.0：主页上次选的玩法（掼蛋 / 斗地主） */
  variant: 'guandan.variant',
  /** 斗地主单机娱乐的这一局（和掼蛋的 save 分开） */
  ddzSave: 'guandan.ddz.save',
  /** 斗地主战绩：第一版只在本机，不进云同步 */
  ddzStats: 'guandan.ddz.stats',
  /** 斗地主单机实盘这一场（doudizhu/stake.ts）：只在本机，不进云同步；和掼蛋的 stake 分开 */
  ddzStake: 'guandan.ddz.stake',
  /** 斗地主单机的新手引导看过了（只在本机，不进云同步，和斗地主战绩一样） */
  ddzTutorial: 'guandan.ddz.tutorial',
  /** 斗地主残局闯关过了哪几关 {v, done: id[]}（doudizhu/puzzle.ts）：只在本机，不进云同步 */
  ddzPuzzles: 'guandan.ddz.puzzles',
  /** 斗地主每日残局今天的最好成绩 {v, date, best, tries}（doudizhu/puzzle.ts）：只在本机，不进云同步 */
  ddzDailyPuzzle: 'guandan.ddz.dailyPuzzle',
  /** 成就 {v, unlocked, gdGames, ddzGames, gdStreak}（achievements.ts）：只在本机，不进云同步 */
  achievements: 'guandan.achievements',
} as const;

/** 云同步的槽（只同步战绩和教程标记；打到一半的牌局、设置不同步）→ 本地 key */
export const SYNC_SLOTS = { stats: KEYS.stats, tutorial: KEYS.tutorial } as const;
export type SyncSlot = keyof typeof SYNC_SLOTS;
/**
 * 云同步改本地数据前的备份：tag = pre-sync（合并前，只留最近一份）或 pre-switch.<旧 userId>（换账号前，每个旧账号一份，
 * 分开放是为了换完账号后的合并备份不把旧账号的数据盖掉）
 */
export const backupKey = (slot: SyncSlot, tag: string): string => `guandan.${slot}.${tag}`;
const syncListeners = new Set<(slot: SyncSlot) => void>();
/** 玩家自己改了要同步的数据（不含云同步写回本地）时通知 */
export function onSyncedChange(fn: (slot: SyncSlot) => void): () => void {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}
function changed(slot: SyncSlot): void {
  for (const fn of syncListeners) fn(slot);
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** 云同步直接读写槽、元数据和合并前备份（不触发 onSyncedChange） */
export const rawStore = {
  read: <T>(key: string): T | null => read<T>(key),
  write: (key: string, value: unknown): void => write(key, value),
  remove: (key: string): void => {
    try {
      store()?.removeItem(key);
    } catch {
      // 忽略
    }
  },
};

function write(key: string, value: unknown): void {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    // 存储满了或被禁用：游戏照常进行，只是不能续玩
  }
}

/** 单独部署时好友房里的昵称：没填是空串（服务端按"游客"加数字叫） */
export function getNick(): string {
  const v = read<unknown>(KEYS.nick);
  return typeof v === 'string' ? v : '';
}

export function setNick(name: string): void {
  if (name) write(KEYS.nick, name);
  else rawStore.remove(KEYS.nick);
}

// ───────────── 设置 ─────────────

type SpeedSetting = 'slow' | 'normal' | 'fast';
/** 音乐、音效各一档：0 关、1 小、2 中、3 大（设置里分别调，分别记住） */
export type SoundLevel = 0 | 1 | 2 | 3;
/** 每档对应的音量（0..1） */
export const SOUND_GAIN: readonly number[] = [0, 0.35, 0.65, 1];

function isSoundLevel(v: unknown): v is SoundLevel {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/** 声音设置：两档合法就照用，坏数据用默认值 */
function soundOf(raw: { sfx?: unknown; musicVol?: unknown; muted?: unknown }): { sfx: SoundLevel; musicVol: SoundLevel; muted: boolean } {
  return {
    sfx: isSoundLevel(raw.sfx) ? raw.sfx : DEFAULT_SETTINGS.sfx,
    musicVol: isSoundLevel(raw.musicVol) ? raw.musicVol : DEFAULT_SETTINGS.musicVol,
    muted: raw.muted === true,
  };
}

export interface Settings {
  v: 1;
  /** 音效档位 */
  sfx: SoundLevel;
  /** 背景音乐档位 */
  musicVol: SoundLevel;
  /** 全部静音（设置里一下关掉所有声音；不动上面两档，取消后回到原来的档） */
  muted: boolean;
  speed: SpeedSetting;
  difficulty: SoloLevel;
  /** 地方规则开关（新开一局时生效） */
  rules: Partial<Options>;
  back: 0 | 1;
  /** 牌桌顶上的记牌器：点一下收起、再点展开 */
  counter: boolean;
  /** 牌桌互动开 / 不看（设置里叫"互动"）：关掉后好友房里别人的、单机电脑的短语、表情、道具都不播，电脑也不反应 */
  taunts: boolean;
  /** 聊天开 / 不看（好友房 0.22.0、单机 0.23.0，和"互动"分开：有人想关掉嘲讽但想看朋友说话）：不看时别人说的不冒气泡、不进记录，自己也没有聊天页 */
  chat: boolean;
  /**
   * 快速匹配桌上和陌生人打字聊天（kit docs/match.md 第 5 节，默认开）：关掉时进匹配桌不带 chat=1，房间不给这条连接转聊天、自己也发不了。
   * 好友房、单机只看上面的 chat。开放公开注册时重新评估默认值
   */
  strangerChat: boolean;
  /** 娱乐单机的局长：短局打到 10、完整打过 A；记住上次选的，快速开始按它开 */
  length: GameLength;
  /** 斗地主娱乐单机的发牌：经典洗牌 / 不洗牌（炸弹多）；记住上次选的，快速开始按它开 */
  ddzDeal: DdzDeal;
}

export type GameLength = 'short' | 'full';
export type DdzDeal = 'classic' | 'clump';

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  sfx: 3,
  musicVol: 3,
  muted: false,
  speed: 'normal',
  difficulty: 'novice',
  rules: {},
  back: 0,
  counter: true,
  taunts: true,
  chat: true,
  strangerChat: true,
  length: 'short',
  ddzDeal: 'classic',
};

export const SPEED_FACTOR: Record<SpeedSetting, number> = { slow: 0.7, normal: 1, fast: 1.7 };

let settingsCache: Settings | null = null;

export function getSettings(): Settings {
  if (settingsCache) return settingsCache;
  const s = read<Partial<Settings>>(KEYS.settings);
  settingsCache = s && s.v === 1 ? { ...DEFAULT_SETTINGS, ...s, rules: { ...(s.rules ?? {}) } } : { ...DEFAULT_SETTINGS };
  // 难度 0.12.1 起是新手 / 普通 / 高手三档：旧版本存的四档换过来（简单→新手、较强→普通、困难→高手），认不得的按默认
  settingsCache.difficulty = soloLevelOf(settingsCache.difficulty) ?? DEFAULT_SETTINGS.difficulty;
  if (settingsCache.length !== 'short' && settingsCache.length !== 'full') settingsCache.length = DEFAULT_SETTINGS.length;
  if (settingsCache.ddzDeal !== 'classic' && settingsCache.ddzDeal !== 'clump') settingsCache.ddzDeal = DEFAULT_SETTINGS.ddzDeal;
  Object.assign(settingsCache, soundOf(settingsCache));
  return settingsCache;
}

/** 恢复默认：只重置设置（声音、对局、地方规则），不动战绩、存档、引导 */
export function resetSettings(): Settings {
  settingsCache = { ...DEFAULT_SETTINGS, rules: {} };
  write(KEYS.settings, settingsCache);
  return settingsCache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  settingsCache = { ...getSettings(), ...patch };
  write(KEYS.settings, settingsCache);
  return settingsCache;
}

// ───────────── 存档 ─────────────

interface SaveData {
  v: 1;
  state: GameState;
  difficulty: SoloLevel;
  /** 这一局的胜负是否已记入战绩（防止刷新后重复计） */
  counted: boolean;
  /** 已记入战绩的副数（同上） */
  dealsCounted: number;
  /** 这一局攒到哪了（整局称号、晒战绩用；回大厅再"继续"不丢）。0.40.1 以前的存档没有，从接着打的那副开始攒 */
  log?: MatchLog;
  loggedDeal?: number;
}

export function loadSave(): SaveData | null {
  const s = read<SaveData>(KEYS.save);
  if (s?.v !== 1 || !s.state || s.state.v !== 1 || !Array.isArray(s.state.hands)) return null;
  // 0.1.10 及以前的存档没记规则版本，都是第 1 版规则开的
  if (typeof s.state.rules !== 'number') s.state.rules = 1;
  // 存档里的难度认不得就按默认接着打（同 getSettings）
  s.difficulty = soloLevelOf(s.difficulty) ?? DEFAULT_SETTINGS.difficulty;
  return s;
}

export function writeSave(data: SaveData): void {
  write(KEYS.save, data);
}

export function clearSave(): void {
  try {
    store()?.removeItem(KEYS.save);
  } catch {
    // 忽略
  }
}

// ───────────── 战绩 ─────────────

export interface Stats {
  v: 1;
  games: number;
  wins: number;
  streak: number;
  bestStreak: number;
  deals: number;
  /** 我拿头游的副数 */
  firsts: number;
  /** 我方升级的副数 */
  dealWins: number;
}

export const EMPTY_STATS: Stats = { v: 1, games: 0, wins: 0, streak: 0, bestStreak: 0, deals: 0, firsts: 0, dealWins: 0 };

export function getStats(): Stats {
  const s = read<Stats>(KEYS.stats);
  return s && s.v === 1 ? { ...EMPTY_STATS, ...s } : { ...EMPTY_STATS };
}

export function recordDeal(first: boolean, won: boolean): Stats {
  const s = getStats();
  s.deals += 1;
  if (first) s.firsts += 1;
  if (won) s.dealWins += 1;
  write(KEYS.stats, s);
  changed('stats');
  return s;
}

export function recordGame(won: boolean): Stats {
  const s = getStats();
  s.games += 1;
  if (won) {
    s.wins += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.streak = 0;
  }
  write(KEYS.stats, s);
  changed('stats');
  return s;
}

// ───────────── 牌馆：玩法、斗地主存档和战绩 ─────────────

export type VariantId = 'guandan' | 'ddz';

export function getVariant(): VariantId {
  return read<string>(KEYS.variant) === 'ddz' ? 'ddz' : 'guandan';
}

export function setVariant(v: VariantId): void {
  write(KEYS.variant, v);
}

interface DdzSaveData {
  v: 1;
  state: DdzState;
  level: SoloLevel;
  /** 这一局的胜负记过战绩没有、记到第几副（刷新后不重复记） */
  counted: boolean;
  dealsCounted: number;
}

export function loadDdzSave(): DdzSaveData | null {
  const s = read<DdzSaveData>(KEYS.ddzSave);
  if (s?.v !== 1 || !s.state || !Array.isArray(s.state.hands) || s.state.rules !== DDZ_RULES) return null;
  s.level = soloLevelOf(s.level) ?? DEFAULT_SETTINGS.difficulty;
  return s;
}

export function writeDdzSave(data: DdzSaveData): void {
  write(KEYS.ddzSave, data);
}

export function clearDdzSave(): void {
  rawStore.remove(KEYS.ddzSave);
}

interface DdzStats {
  v: 1;
  games: number;
  wins: number;
  deals: number;
  dealWins: number;
  /** 当地主的副数、当地主赢的副数 */
  landlord: number;
  landlordWins: number;
  springs: number;
}

const EMPTY_DDZ_STATS: DdzStats = { v: 1, games: 0, wins: 0, deals: 0, dealWins: 0, landlord: 0, landlordWins: 0, springs: 0 };

export function getDdzStats(): DdzStats {
  const s = read<DdzStats>(KEYS.ddzStats);
  return s && s.v === 1 ? { ...EMPTY_DDZ_STATS, ...s } : { ...EMPTY_DDZ_STATS };
}

export function recordDdzDeal(won: boolean, landlord: boolean, spring: boolean): DdzStats {
  const s = getDdzStats();
  s.deals += 1;
  if (won) s.dealWins += 1;
  if (landlord) {
    s.landlord += 1;
    if (won) s.landlordWins += 1;
  }
  if (won && spring) s.springs += 1;
  write(KEYS.ddzStats, s);
  return s;
}

export function recordDdzGame(won: boolean): DdzStats {
  const s = getDdzStats();
  s.games += 1;
  if (won) s.wins += 1;
  write(KEYS.ddzStats, s);
  return s;
}

// ───────────── 斗地主单机实盘（doudizhu/stake.ts） ─────────────

/** 存档的内容，字段的意思见 doudizhu/stake.ts */
export interface DdzStakeSaveData {
  v: 1;
  userId: string;
  ref: string;
  tier: TierId;
  share: number;
  until: number;
  /** 规则版本（variants/doudizhu/stake 的 StakeRules）：没有这个字段是版本 1（每分 1/40、8 副的老存档），按老数打完 */
  rules?: number;
  state: DdzState;
  settle: { points: number; deals: number } | null;
}

export function loadDdzStake(): DdzStakeSaveData | null {
  const s = read<DdzStakeSaveData>(KEYS.ddzStake);
  if (s?.v !== 1 || typeof s.userId !== 'string' || typeof s.ref !== 'string' || !isTier(s.tier) || !s.state || !Array.isArray(s.state.hands) || s.state.rules !== DDZ_RULES) return null;
  return s;
}

export function writeDdzStake(data: DdzStakeSaveData): void {
  write(KEYS.ddzStake, data);
}

export function clearDdzStake(): void {
  rawStore.remove(KEYS.ddzStake);
}

// ───────────── 新手引导 ─────────────

export function tutorialDone(): boolean {
  return read<{ v: 1; done: boolean }>(KEYS.tutorial)?.done === true;
}

export function setTutorialDone(done: boolean): void {
  write(KEYS.tutorial, { v: 1, done });
  // "重看引导"清掉的标记不上传：合并规则是"或"，传了也会被云端的"看过"盖回来
  if (done) changed('tutorial');
}

export function ddzTutorialDone(): boolean {
  return read<{ v: 1; done: boolean }>(KEYS.ddzTutorial)?.done === true;
}

export function setDdzTutorialDone(done: boolean): void {
  write(KEYS.ddzTutorial, { v: 1, done });
}

// ───────────── 斗地主残局闯关 ─────────────

/** 过了的关卡 id（坏数据、认不得的内容当空；是不是真有这一关由 doudizhu/puzzle.ts 核对） */
export function getDdzPuzzlesDone(): string[] {
  const s = read<{ v?: unknown; done?: unknown }>(KEYS.ddzPuzzles);
  if (s?.v !== 1 || !Array.isArray(s.done)) return [];
  return [...new Set(s.done.filter((x): x is string => typeof x === 'string'))];
}

export function addDdzPuzzleDone(id: string): void {
  const done = getDdzPuzzlesDone();
  if (done.includes(id)) return;
  write(KEYS.ddzPuzzles, { v: 1, done: [...done, id] });
}

// ───────────── 斗地主每日残局 ─────────────

/** 这一天的最好分和打完了几次；不是这一天的记录、坏数据都当没打过 */
export function getDdzDailyPuzzle(date: string): { best: number; tries: number } {
  const s = read<{ v?: unknown; date?: unknown; best?: unknown; tries?: unknown }>(KEYS.ddzDailyPuzzle);
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (!s || typeof s !== 'object' || s.v !== 1 || s.date !== date || !ok(s.best) || !ok(s.tries)) return { best: 0, tries: 0 };
  return { best: s.best, tries: s.tries };
}

/** 打完一次：次数加一，最好分只升不降；换了一天就从头记 */
export function recordDdzDailyPuzzle(date: string, score: number): void {
  const old = getDdzDailyPuzzle(date);
  write(KEYS.ddzDailyPuzzle, { v: 1, date, best: Math.max(old.best, Math.max(0, Math.floor(score))), tries: old.tries + 1 });
}

// ───────────── 错误记录 ─────────────

export function rememberError(rec: unknown): void {
  const list = read<unknown[]>(KEYS.errors) ?? [];
  list.push(rec);
  write(KEYS.errors, list.slice(-20));
}
