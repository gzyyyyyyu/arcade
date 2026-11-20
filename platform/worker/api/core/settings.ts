/**
 * 运行时设置（settings 表，迁移 0004，一个键一行）：这里管"开放注册"开关（维护者 2026-10-14 要求管理员随时能开关，改了不用重新部署）和大厅公告（见文件末尾）。
 * 钱包规则（wallet_rules）也存在这张表里，代码在 wallet/store.ts。
 *
 * 规则（维护者 2026-10-14 同意）：
 * - vars.REGISTRATION 是紧急总闸：只有 "switch"（不分大小写、去首尾空白）才听 D1 的开关；"off"、没设、写错一律强制关（fail-closed）。
 * - 听开关时：settings 里 registration = 'open' 才开，没有这一行按关。
 * - 注册接口每次读最新值（1 行）：关了以后不会还有人注册进来。
 * - /api/me 的 registration 字段用每个 isolate 30 秒的内存缓存：游戏闸门每次打开游戏首页都问 /api/me，不想给每次访问都加一次 D1 读；
 *   代价是登录页的"注册"入口最多晚 30 秒变。
 * 总闸关着时，管理接口和管理页明确说"开关暂时不起作用"，不会出现界面上开着、实际关着。
 *
 * 大厅公告（key = notice，value 是 {"text", "by"} 的 JSON，没有这一行就是没公告）：只回给登录了的人，撤下以后最多晚 30 秒消失。
 * 默认隐藏的游戏（key = hidden_games，value 是游戏 id 的 JSON 数组，15.21）：只回给登录了的人。
 * /api/me 要的这三样一条查询一起读、一起缓存 30 秒（meSettings）：每个 isolate 每 30 秒最多 1 次 D1 读。
 */
import type { Env } from '../../env';
import type { Ctx } from './context';
import type { Db } from '../lib/db';
import { isRecord, parseJsonColumnOr } from '../lib/json-column';
import { GAME_IDS } from '../../../shared/games';

const KEY = 'registration';
const CACHE_MS = 30_000;

/** 总闸：只有 "switch" 听开关，其余一律强制关。 */
export function registrationForcedOff(env: Env): boolean {
  return env.REGISTRATION?.trim().toLowerCase() !== 'switch';
}

/** 读一个键；没有这一行是 null */
export function readSetting(db: Db, key: string): Promise<{ value: string; updated_at: number } | null> {
  return db.first<{ value: string; updated_at: number }>(db.stmt('SELECT value, updated_at FROM settings WHERE key = ?1', key));
}

/** 写一个键（有就改）：1 行 */
export function writeSettingStatement(db: Db, key: string, value: string, now: number): D1PreparedStatement {
  return db.stmt(
    `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key, value, now,
  );
}

export function resetSettingsCacheForTests(): void {
  meCache = null;
}

// ---------- /api/me 用的三样，一起读、一起缓存 ----------

interface MeSettings {
  /** D1 的注册开关（不管总闸） */
  open: boolean;
  notice: Notice | null;
  hiddenDefault: string[];
}

const ME_FALLBACK: MeSettings = { open: false, notice: null, hiddenDefault: [] };
let meCache: { v: MeSettings; at: number } | null = null;

/** 30 秒缓存；停服档或读不到时按兜底（注册关、没公告、不隐藏）：这三样都不值得让 /api/me 出错，真正注册时还会再读开关 */
async function meSettings(c: Ctx): Promise<MeSettings> {
  if (meCache && c.now >= meCache.at && c.now - meCache.at < CACHE_MS) return meCache.v;
  if (c.tier === 'off') return ME_FALLBACK;
  try {
    const rows = await c.db.all<{ key: string; value: string; updated_at: number }>(
      c.db.stmt('SELECT key, value, updated_at FROM settings WHERE key IN (?1, ?2, ?3)', KEY, NOTICE_KEY, HIDDEN_KEY),
    );
    const row = (k: string) => rows.find((r) => r.key === k) ?? null;
    const notice = noticeOf(row(NOTICE_KEY));
    const v = { open: row(KEY)?.value === 'open', notice: notice && { text: notice.text, at: notice.at }, hiddenDefault: hiddenOf(row(HIDDEN_KEY)) };
    meCache = { v, at: c.now };
    return v;
  } catch (e) {
    // 库暂时读不了：用兜底值撑住，只记错误类型（不记数据），免得悄悄退化没人知道
    console.warn('settings read failed', e instanceof Error ? e.name : 'error');
    return ME_FALLBACK;
  }
}

/** 管理员改了某一样：同一个 isolate 的缓存马上跟着变（别的 isolate 最多晚 30 秒） */
function patchMeCache(patch: Partial<MeSettings>): void {
  if (meCache) meCache.v = { ...meCache.v, ...patch };
}

/** D1 里的开关（不管总闸）。 */
export async function readRegistrationSwitch(db: Db): Promise<{ open: boolean; updatedAt: number | null }> {
  const row = await readSetting(db, KEY);
  return { open: row?.value === 'open', updatedAt: row?.updated_at ?? null };
}

/** 注册时用：每次读最新值。 */
export async function registrationOpenFresh(c: Ctx): Promise<boolean> {
  if (registrationForcedOff(c.env)) return false;
  const { open } = await readRegistrationSwitch(c.db);
  patchMeCache({ open });
  return open;
}

/** /api/me 用：30 秒缓存（只影响登录页露不露"注册"，真正注册时还会再读）。 */
export async function registrationOpenCached(c: Ctx): Promise<boolean> {
  return !registrationForcedOff(c.env) && (await meSettings(c)).open;
}

/** 管理员改开关：1 行。同一个 isolate 的缓存马上跟着变。 */
export function setRegistrationStatement(db: Db, open: boolean, now: number): D1PreparedStatement {
  return writeSettingStatement(db, KEY, open ? 'open' : 'closed', now);
}

export function rememberRegistration(open: boolean): void {
  patchMeCache({ open });
}

// ---------- 大厅公告 ----------

const NOTICE_KEY = 'notice';
/** 大厅顶上一行放得下；按字（码点）数 */
export const NOTICE_MAX = 120;

export interface Notice {
  text: string;
  at: number;
}

/** 现在的公告和谁发的；坏数据当没有公告。 */
export async function readNotice(db: Db): Promise<(Notice & { by: string }) | null> {
  return noticeOf(await readSetting(db, NOTICE_KEY));
}

function noticeOf(row: { value: string; updated_at: number } | null): (Notice & { by: string }) | null {
  if (!row) return null;
  // 存的公告坏了：记一条日志、当没有公告
  const v = parseJsonColumnOr<Record<string, unknown> | null>(row.value, isRecord, null, 'settings.notice');
  if (typeof v?.text !== 'string' || !v.text) return null;
  return { text: v.text, at: row.updated_at, by: typeof v.by === 'string' ? v.by : '' };
}

/** /api/me 用：30 秒缓存 */
export async function noticeCached(c: Ctx): Promise<Notice | null> {
  return (await meSettings(c)).notice;
}

/** 管理员发公告（text）或撤下（null）：1 行。 */
export function setNoticeStatement(db: Db, text: string | null, by: string, now: number): D1PreparedStatement {
  if (text === null) return db.stmt('DELETE FROM settings WHERE key = ?1', NOTICE_KEY);
  return writeSettingStatement(db, NOTICE_KEY, JSON.stringify({ text, by }), now);
}

export function rememberNotice(notice: Notice | null): void {
  patchMeCache({ notice });
}

// ---------- 默认隐藏的游戏（15.21） ----------

const HIDDEN_KEY = 'hidden_games';

const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** 坏数据当没有；下架了的游戏 id 去掉 */
function hiddenOf(row: { value: string } | null): string[] {
  if (!row) return [];
  return parseJsonColumnOr<string[]>(row.value, isIdList, [], 'settings.hidden_games').filter((id) => GAME_IDS.has(id));
}

export async function readHiddenDefault(db: Db): Promise<string[]> {
  return hiddenOf(await readSetting(db, HIDDEN_KEY));
}

/** /api/me 用：30 秒缓存（改偏好算差量用 readHiddenDefault 现读） */
export async function hiddenDefaultCached(c: Ctx): Promise<string[]> {
  return (await meSettings(c)).hiddenDefault;
}

/** 管理员改默认隐藏：1 行 */
export function setHiddenDefaultStatement(db: Db, ids: string[], now: number): D1PreparedStatement {
  return writeSettingStatement(db, HIDDEN_KEY, JSON.stringify(ids), now);
}

export function rememberHiddenDefault(ids: string[]): void {
  patchMeCache({ hiddenDefault: ids });
}
