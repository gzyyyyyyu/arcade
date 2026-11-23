/**
 * 德州在浏览器里存的东西，全从这里过：键名只在这儿定义，读写都带 try/catch（隐私模式、存满、被禁用时不抛错）。
 * 和平台、别的游戏同域，所以键一律 texas. 开头（test/arch.test.ts 守着）。
 * solo.ts、cloud.ts、fun.ts 是经注入的 Storage 读写的（便于测试），它们只从这里拿键名。
 */
export const KEYS = {
  /** 声音、快速、自动下一手，和大厅记住的盲注档/人数/玩法 */
  settings: 'texas.settings',
  /** 现在在的好友房：刷新、关页面后标题页给"回到房间"（不自动进）；点"离开房间"、房间关了就清掉 */
  room: 'texas.room',
  /** 上一次进的好友房：钱包里还有那一桌的一份时，标题页按它给"回到房间"；点"离开房间"、房间关了就清掉 */
  lastRoom: 'texas.lastRoom',
  session: 'texas.session',
  /** 单机锦标赛（Sit & Go）本机存档：刷新、断线后接着打或接着结（src/tour-solo.ts） */
  tour: 'texas.tour',
  /** 互动的总开关（"互动：不看"）。按人屏蔽、首次提示是 kit 的 TableFun 按 storageKey 存的：texas.fun.blocked（sessionStorage）、texas.hint.fun */
  fun: 'texas.fun',
  /** kit 的聊天设置（TableFun 的 prefsKey 默认值，kit 自己读写：弹幕开关 danmaku、电脑版聊天框收起 folded、记录展开 long） */
  chat: 'texas.chat',
  /** 成就（src/achievements.ts）：已拿到的和计数，只在本机，不进云存档 */
  ach: 'texas.ach',
  /** 新手指引（src/guide.ts）：走完或跳过了没、情境提示出过哪几条。不同步 */
  guide: 'texas.guide',
  /** 全下局（全下或弃牌）的最好成绩和玩过几局：{ best, plays }，只在本机 */
  pushfold: 'texas.pushfold',
  /** 今日锦标赛（src/core/daily.ts）：{ date, score, sent }，哪天打过、得了多少分、交榜了没有。和 pushfold 分开存：形状不同，互不覆盖；只在本机 */
  dailyTour: 'texas.dailytour',
  /** 每日谜题（src/puzzle/progress.ts）：哪天选了什么、连续答对几天、一共答对几次。只在本机 */
  puzzle: 'texas.puzzle',
  stats: 'texas.stats',
  meta: 'texas.cloud',
  preSync: 'texas.stats.pre-sync',
  preSwitch: (userId: string): string => `texas.stats.pre-switch.${userId}`,
} as const;

/** 读一个 JSON 值：没有、坏了、读不了都给 null */
export function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

/** 存一个 JSON 值；存不上就算了（这一次有效），返回是否存上了 */
export function writeJson(key: string, v: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 清不掉：该过期的自己过期，该忽略的不再读
  }
}

/** 设置整块读出来（大厅和主页面各取自己要的字段；坏了当没有） */
export function readSettings(): Record<string, unknown> {
  const s = readJson<Record<string, unknown>>(KEYS.settings);
  return s && typeof s === 'object' ? s : {};
}

/** 读—合并—写：主页面和大厅各写各的字段，不覆盖对方的 */
export function patchSettings(patch: Record<string, unknown>): void {
  writeJson(KEYS.settings, { ...readSettings(), ...patch });
}

/** 设置面板里的几个开关（texas.settings 里的这五个字段） */
export interface Prefs {
  /** 音效开关（游戏里没有背景音乐，声音全是音效；道具声音也跟着它） */
  sound: boolean;
  /** 总音量 0–1：设置面板的滑条 */
  volume: number;
  fast: boolean;
  /** 单机一手打完，结果摆几秒后自己发下一手（默认关：试玩时大家要"点了才发"） */
  autoNext: boolean;
  /** 单机桌要跟注时写"胜率 X% · 至少要 Y%"（src/fun/odds.ts；默认开，宁简勿难） */
  hint: boolean;
}

export const DEFAULT_PREFS: Readonly<Prefs> = { sound: true, volume: 0.8, fast: false, autoNext: false, hint: true };

/** 读这五个开关：没存过、存坏了的字段按默认（音效开、音量 0.8、正常速度、不自动下一手、跟注提示开）；旧存档里的 0.35 / 0.8 原样认 */
export function readPrefs(): Prefs {
  const s = readSettings() as Partial<Record<keyof Prefs, unknown>>;
  const v = s.volume;
  const volume = typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_PREFS.volume;
  return { sound: s.sound !== false, volume, fast: s.fast === true, autoNext: s.autoNext === true, hint: s.hint !== false };
}

/** 五个字段一起写回（合并写，不动大厅和聊天、止盈存的字段） */
export function savePrefs(p: Prefs): void {
  patchSettings({ ...p });
}

/** 设置面板"恢复默认"：五个开关回默认，聊天（chatOff、strangerChat）和止盈删掉回默认；大厅记住的档位、人数这些不动 */
export function resetSettings(): void {
  const { chatOff: _a, strangerChat: _b, takeProfit: _c, ...rest } = readSettings();
  writeJson(KEYS.settings, { ...rest, ...DEFAULT_PREFS });
}
