/**
 * 隐藏游戏（docs/platform-backend.md 15.21）：管理员设默认隐藏哪些游戏，每个人在 设置 → 偏好 里逐个改。
 * 每人只存"和默认不一样的"（show：默认隐藏、我要看；hide：默认显示、我不看），管理员以后改默认，没动过的人跟着变。
 * 这是显示偏好不是权限：被隐藏的游戏不出现在大厅、继续玩、排行页签、动态里，直接打开游戏地址照常能玩。
 * 接口和界面都只经这里算"哪些被隐藏"。
 */
export interface GamePrefs {
  show: string[];
  hide: string[];
}

export const NO_PREFS: GamePrefs = { show: [], hide: [] };

/** 实际隐藏的游戏：默认隐藏的去掉我要看的，加上我不看的 */
export function hiddenGameIds(defaults: readonly string[], prefs: GamePrefs): Set<string> {
  const show = new Set(prefs.show);
  return new Set([...defaults.filter((id) => !show.has(id)), ...prefs.hide]);
}

/** 我想隐藏 hidden 这些：按现在的默认换成"和默认不一样的"两张表 */
export function prefsFor(defaults: readonly string[], hidden: Iterable<string>): GamePrefs {
  const want = new Set(hidden);
  const def = new Set(defaults);
  return { show: defaults.filter((id) => !want.has(id)), hide: [...want].filter((id) => !def.has(id)).sort() };
}

/** 按隐藏的过滤：游戏表（大厅、排行页签）按 id，动态这类按 gameOf 取出的游戏 id */
export function visibleOf<T>(items: readonly T[], hidden: ReadonlySet<string>, gameOf: (x: T) => string): T[] {
  return hidden.size ? items.filter((x) => !hidden.has(gameOf(x))) : [...items];
}
