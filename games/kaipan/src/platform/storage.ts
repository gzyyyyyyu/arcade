import {
  MONTHS,
  clampDifficulty,
  emptyStats,
  isEventId,
  isFriendId,
  isItemId,
  isPersonaId,
  isStockId,
  isThemeId,
  type GameState,
  type Phase,
} from '../core/index.ts';
import { defaultStore, type KeyValueStore } from './settings.ts';
import { APP_VERSION } from './version.ts';

/**
 * 存档：完整的局面快照 + 写入时的版本号（format 5，对应 0.3.0 起的状态结构 GameState.version 4）。
 *
 * 读档直接使用快照，不回放：小版本调整数值后，旧存档仍按玩家当时看到的局面继续。
 * 0.3 以前和撤回的 0.4.0-alpha.1 的存档（format ≤ 4、6），以及格式 5 里 0.3.0、0.4 开发期的老局（isOldSave）读不了：
 * 清掉，提示"版本大更新"后开新局。
 * 它们以前的迁移和备份在 0.6.15 删了，启动时 clearLegacyKeys 一次性清掉当年留下的备份 key。
 * 存档损坏时先另存一份到 CORRUPT_KEY 再清除，便于排查。
 * 档案（成就、图鉴、解锁、各种最好成绩）在 src/platform/profile.ts，与单局存档互不影响；设置（kaipan.settings）也不受影响。
 */
export const SAVE_FORMAT = 5;

interface SaveData {
  format: typeof SAVE_FORMAT;
  /** 写入存档的游戏版本 */
  appVersion: string;
  savedAt: string;
  state: GameState;
}

/** 读档结果的附加提示：legacy = 读到了读不了的旧版本存档（已清掉）；corrupt = 存档损坏（已备份并清掉）。 */
export type SaveNotice = 'legacy' | 'corrupt' | null;

interface LoadResult {
  state: GameState | null;
  notice: SaveNotice;
}

const KEY = 'kaipan.save';
/** 0.4.0-alpha.1 的存档格式 */
const V04A_FORMAT = 6;
const CORRUPT_KEY = 'kaipan.save.corrupt';

/**
 * 旧版本留在本机的 key（0.6.15 起不再读）：0.1 的操作序列存档、0.1～0.4a 的存档和纪录备份、0.3 找回后留的底、
 * 0.3 的本地纪录（档案取代了它），和删掉的美股原型写的术语记录。只清这些，当前的存档、档案、设置一个都不碰（测试锁住）。
 */
export const LEGACY_KEYS: readonly string[] = [
  'kaipan.save.v1',
  'kaipan.save.v0.1',
  'kaipan.save.v0.2',
  'kaipan.save.v0.3',
  'kaipan.save.v0.3a',
  'kaipan.save.v0.4a',
  'kaipan.save.v0.3.restored',
  'kaipan.records',
  'kaipan.records.v0.2',
  'kaipan.records.v0.3',
  'kaipan.records.v0.4a',
  'kaipan.records.v0.3.restored',
  'kaipan.terms.v04',
];
const PHASES: readonly Phase[] = ['premarket', 'reward', 'event', 'won', 'lost'];

let warnedQuota = false;

function get(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(store: KeyValueStore | null, key: string, value: string): boolean {
  try {
    store?.setItem(key, value);
    return true;
  } catch (err) {
    // 配额不足等：存档失败不影响本次游戏，只提醒一次
    if (!warnedQuota) console.warn('存档写入失败：', err);
    warnedQuota = true;
    return false;
  }
}

function remove(store: KeyValueStore | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // 忽略
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function int(v: unknown): v is number {
  return Number.isInteger(v);
}

/**
 * 把校验过的存档对象当成 GameState 用。
 * 为什么安全：reviveState 前面已逐项校验了所有会让引擎崩的字段（版本、阶段、数值、各个数组和表的形状），
 * 其余字段是本游戏自己写进去的快照原样（顶层、today、event、reward 的形状和成员类型都查过）；缺的统计字段紧接着补缺省。这是存档读回的唯一一处强转，
 * 类型系统没法表达「校验过的 unknown 对象」，所以集中在这里。
 */
function asGameState(checked: Record<string, unknown>): GameState {
  return checked as unknown as GameState;
}

/**
 * 校验并修整 0.3 的快照：结构不对返回 null；新版本已删除的道具、群友被剔除，
 * 持仓里已删除的股票变成空格，其余字段原样保留（引擎是纯函数，从快照即可继续）。
 */
export function reviveState(raw: unknown): GameState | null {
  if (!isObject(raw) || raw.version !== 4 || typeof raw.seed !== 'string') return null;
  if (typeof raw.persona !== 'string' || !isPersonaId(raw.persona)) return null;
  if (!Array.isArray(raw.pending) || !Array.isArray(raw.expiring)) return null;
  if (!PHASES.includes(raw.phase as Phase) || !finite(raw.account) || raw.account < 0) return null;
  if (!int(raw.month) || (raw.month as number) < 1 || (raw.month as number) > MONTHS) return null;
  if (!int(raw.dayIndex) || !int(raw.dayInMonth) || !int(raw.difficulty)) return null;
  if (!Array.isArray(raw.themeIds) || !isObject(raw.themes) || !isObject(raw.stocks)) return null;
  if (!Array.isArray(raw.slots) || !Array.isArray(raw.friends) || !Array.isArray(raw.items) || !Array.isArray(raw.actions)) return null;
  if (!isObject(raw.bill) || !finite(raw.bill.amount) || !isObject(raw.stats) || !Array.isArray(raw.stats.trades)) return null;
  const t = raw.today;
  if (!isObject(t) || !Array.isArray(t.messages) || !Array.isArray(t.recs) || !isObject(t.plan) || !int(t.buysLeft)) return null;
  for (const id of raw.themeIds as unknown[]) {
    if (typeof id !== 'string' || !isThemeId(id)) return null;
    const th = (raw.themes as Record<string, unknown>)[id];
    if (!isObject(th) || !finite(th.heat) || !Array.isArray(th.history) || typeof th.stage !== 'string' || !int(th.left)) return null;
  }
  for (const st of Object.values(raw.stocks as Record<string, unknown>)) {
    if (!isObject(st) || !finite(st.price) || !int(st.boards) || !Array.isArray(st.history)) return null;
  }
  for (const h of raw.slots as unknown[]) {
    if (h === null) continue;
    if (!isObject(h) || typeof h.stockId !== 'string' || !finite(h.value) || !int(h.boughtDay)) return null;
  }
  for (const f of raw.friends as unknown[]) {
    if (!isObject(f) || typeof f.id !== 'string' || !int(f.hits) || !int(f.total)) return null;
  }
  // 下面几处后面会直接读成员的字段（r.stockId、m.theme、c.kind、event.id），成员不是对象会在过滤时抛错而不是走损坏备份，所以先查形状
  if (!(raw.items as unknown[]).every((id) => typeof id === 'string')) return null;
  if (!t.recs.every(isObject) || !t.messages.every(isObject)) return null;
  if (raw.event != null && !isObject(raw.event)) return null;
  if (raw.reward != null && (!isObject(raw.reward) || !Array.isArray(raw.reward.cards) || !raw.reward.cards.every(isObject))) return null;

  const copy = structuredClone(raw);
  const state = asGameState(copy);
  state.difficulty = clampDifficulty(state.difficulty);
  // 统计字段：缺失或类型不对的补缺省值（以后加的统计项，旧存档读进来从 0 记起，玩几步不出错）
  // copy 和 state 是同一个对象，这里按「键值表」读写 stats，前面的校验已经保证它是对象
  const stats = copy.stats;
  if (!isObject(stats)) return null;
  for (const [k, v] of Object.entries(emptyStats(state.account))) {
    const cur = stats[k];
    const ok = Array.isArray(v) ? Array.isArray(cur) : v === null ? cur === null || finite(cur) : finite(cur);
    if (!ok) stats[k] = structuredClone(v);
  }
  state.pending = state.pending.filter((p) => isObject(p) && typeof p.id === 'string' && isEventId(p.id) && finite(p.amount) && int(p.month));
  state.expiring = state.expiring.filter((x) => isObject(x) && typeof x.id === 'string' && isItemId(x.id) && int(x.month));
  if (state.event && !isEventId(state.event.id)) return null;
  const dropped = state.items.filter((id) => !isItemId(id));
  if (dropped.length > 0) {
    console.warn('存档里有当前版本已移除的道具，已剔除：', dropped.join('、'));
    state.items = state.items.filter((id) => isItemId(id));
  }
  state.friends = state.friends.filter((f) => isFriendId(f.id));
  state.slots = state.slots.map((h) => (h && isStockId(h.stockId) && (state.stocks[h.stockId] || h.ipo?.stage === 'frozen') ? h : null));
  state.today.recs = state.today.recs.filter((r) => isStockId(r.stockId));
  state.today.messages = state.today.messages.filter((m) => isThemeId(m.theme));
  if (state.reward) {
    state.reward.cards = state.reward.cards.filter((c) => (c.kind === 'item' ? isItemId(c.id) : c.kind === 'friend' ? isFriendId(c.id) : isStockId(c.id)));
  }
  return state;
}

export function writeSave(state: GameState, store: KeyValueStore | null = defaultStore()): void {
  const data: SaveData = { format: SAVE_FORMAT, appVersion: APP_VERSION, savedAt: new Date().toISOString(), state };
  set(store, KEY, JSON.stringify(data));
}

export function clearSave(store: KeyValueStore | null = defaultStore()): void {
  remove(store, KEY);
}

/** 启动时调用：清掉旧版本留下的 key（LEGACY_KEYS），没有就什么都不做。 */
export function clearLegacyKeys(store: KeyValueStore | null = defaultStore()): void {
  for (const key of LEGACY_KEYS) if (get(store, key) !== null) remove(store, key);
}

function discard(store: KeyValueStore | null, key: string, raw: string, reason: string): LoadResult {
  console.warn(`存档无法读取（${reason}），已备份到 ${CORRUPT_KEY} 并清除`);
  set(store, CORRUPT_KEY, raw);
  remove(store, key);
  return { state: null, notice: 'corrupt' };
}

/**
 * 读取存档（启动时调用一次）：
 * - 没有存档：{ state: null, notice: null }
 * - 0.3 以前、0.4.0-alpha.1 的存档，和格式 5 里接不上的老局（isOldSave）：清掉，{ state: null, notice: 'legacy' }，开始菜单提示后开新局
 * - 存档损坏、格式不认识：备份到 kaipan.save.corrupt 后清除，{ state: null, notice: 'corrupt' }
 */
export function loadSave(store: KeyValueStore | null = defaultStore()): LoadResult {
  const raw = get(store, KEY);
  if (!raw) return { state: null, notice: null };
  let data: Partial<SaveData> & { format?: unknown };
  try {
    data = JSON.parse(raw) as Partial<SaveData>;
  } catch (err) {
    return discard(store, KEY, raw, `解析失败：${String(err)}`);
  }
  if (!isObject(data)) return discard(store, KEY, raw, '不是对象');
  const format: unknown = data.format;
  if (typeof format === 'number' && (format < SAVE_FORMAT || format === V04A_FORMAT)) {
    remove(store, KEY);
    console.info(`读到旧版本的存档（format ${format}），已清掉`);
    return { state: null, notice: 'legacy' };
  }
  if (format !== SAVE_FORMAT) return discard(store, KEY, raw, `未知存档格式 ${String(format)}`);
  if (isOldSave(data.state)) {
    remove(store, KEY);
    console.info('读到接不上的老局（0.4 开发期真实行情或 0.3.0），已清掉');
    return { state: null, notice: 'legacy' };
  }
  const state = reviveState(data.state);
  if (!state) return discard(store, KEY, raw, '局面结构不对');
  if (data.appVersion !== APP_VERSION) console.info(`存档来自 ${String(data.appVersion)}，当前 ${APP_VERSION}，按存档局面继续`);
  return { state, notice: null };
}

/**
 * 格式也是 5、但现在的代码接不上的老局，读到提示一次后清掉：
 * - 0.4 开发期的真实行情局：state.real 没有 track（0.5 起个股照搬真实走势，旧的映射走法已删）；
 * - 0.3.0 的局：上一天结算没有新闻（0.3.1 起才有归因、新闻、台词）。
 */
function isOldSave(state: unknown): boolean {
  if (!isObject(state)) return false;
  if (isObject(state.real) && state.real.track !== true) return true;
  return isObject(state.lastDay) && !Array.isArray(state.lastDay.news);
}

/** 是否有可以继续的存档（不修改存储）。 */
export function hasSave(store: KeyValueStore | null = defaultStore()): boolean {
  const raw = get(store, KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    return data.format === SAVE_FORMAT && !isOldSave(data.state) && reviveState(data.state) !== null;
  } catch {
    return false;
  }
}
