/**
 * 邀请码（docs/platform-backend.md 15.20）：老用户生成码给朋友，朋友凭码注册，注册成功两人自动成为好友。
 * 公开注册关着时必须带码（auth.ts 的 register），开着时可填可不填。
 *
 * - 额度 = 已用的 + 还有效的（没用、没撤回、没过期）；过期、撤回的未用码把额度还回来。额度和"24 小时内最多生成几个"都写在插入语句的条件里，
 *   并发冲不破，被拒 0 行，不另开计数行。
 * - 四个数（普通用户额度、管理员额度、有效期、每天上限）存在 settings 的 invite_rules，管理员能改、不用发版（同钱包规则）；
 *   单个人的额度在 users.invite_quota，空就按角色用默认。
 * - 码存明文，用掉、撤回、过期以后接口只给末 4 位。
 * - 两种码，类型显式存在 max_uses（迁移 0014）：普通码 1 次（谁都能生成，按额度）；长期码多次（只有管理员在后台建，不占额度、默认不过期、默认 100 次）。
 *   每次使用在 invite_code_uses 记一行；占名额是注册 batch 第一条的条件更新 `uses < max_uses`，并发只放过名额那么多人。
 */
import { count } from '../lib/body';
import { type Ctx, DAY } from '../core/context';
import { formatInviteCode, newInviteCode, newTimeId } from '../lib/crypto';
import type { Db } from '../lib/db';
import { ApiError, json, noContent, rateLimited } from '../lib/http';
import { isRecord, parseJsonColumn } from '../lib/json-column';
import { avatarOf } from './session';
import { readSetting, writeSettingStatement } from '../core/settings';
import { MULTI_CODE } from '../../../shared/invite';

// ---------- 管理员可调的四个数 ----------

export interface InviteRules {
  userQuota: number;
  adminQuota: number;
  ttlDays: number;
  perDay: number;
}

export const DEFAULT_INVITE_RULES: InviteRules = { userQuota: 3, adminQuota: 50, ttlDays: 7, perDay: 5 };

/** 能调的范围：防手滑，不是业务上限 */
export const INVITE_RULE_RANGE: Record<keyof InviteRules, readonly [number, number]> = {
  userQuota: [0, 100],
  adminQuota: [0, 1000],
  ttlDays: [1, 90],
  perDay: [1, 100],
};

/** 单个人的额度能改到多少 */
export const USER_QUOTA_MAX = 1000;

const RULES_KEY = 'invite_rules';
/** 每个 isolate 记 30 秒，同钱包规则 */
const RULES_CACHE_MS = 30_000;
const RULES_LOG = 20;

interface RulesChange {
  at: number;
  by: string;
  changes: Partial<Record<keyof InviteRules, [number, number]>>;
}

let rulesCache: { rules: InviteRules; at: number } | null = null;

export function resetInviteRulesCacheForTests(): void {
  rulesCache = null;
}

const inRange = (k: keyof InviteRules, v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= INVITE_RULE_RANGE[k][0] && v <= INVITE_RULE_RANGE[k][1];

const isInviteRulesValue = (v: unknown): v is { rules: Partial<InviteRules>; log?: RulesChange[] } =>
  isRecord(v) && isRecord(v.rules) && (v.log === undefined || Array.isArray(v.log));

async function readRulesRow(db: Db): Promise<{ rules: InviteRules; log: RulesChange[]; updatedAt: number | null }> {
  const row = await readSetting(db, RULES_KEY);
  const v = row ? parseJsonColumn(row.value, isInviteRulesValue, 'settings.invite_rules') : { rules: {}, log: [] };
  const rules = { ...DEFAULT_INVITE_RULES };
  for (const k of Object.keys(DEFAULT_INVITE_RULES) as (keyof InviteRules)[]) if (inRange(k, v.rules[k])) rules[k] = v.rules[k];
  return { rules, log: v.log ?? [], updatedAt: row?.updated_at ?? null };
}

/** 生成、注册用的规则：30 秒缓存；读不到按默认值 */
export async function inviteRules(db: Db, now: number): Promise<InviteRules> {
  if (rulesCache && now >= rulesCache.at && now - rulesCache.at < RULES_CACHE_MS) return rulesCache.rules;
  try {
    const { rules } = await readRulesRow(db);
    rulesCache = { rules, at: now };
    return rules;
  } catch (e) {
    // 库暂时读不了：用兜底值撑住，只记错误类型（不记数据），免得悄悄退化没人知道
    console.warn('invite rules read failed', e instanceof Error ? e.name : 'error');
    return DEFAULT_INVITE_RULES;
  }
}

const defaultQuota = (rules: InviteRules, role: string) => (role === 'admin' ? rules.adminQuota : rules.userQuota);

// ---------- 自己的码 ----------

interface CodeRow {
  id: string;
  code: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  revoked_at: number | null;
  uses: number;
  max_uses: number;
}

type Status = 'unused' | 'used' | 'expired' | 'revoked';

/** used：名额用完了（普通码用过一次就是） */
function statusOf(r: CodeRow, now: number): Status {
  if (r.uses >= r.max_uses) return 'used';
  if (r.revoked_at !== null) return 'revoked';
  return r.expires_at <= now ? 'expired' : 'unused';
}

/** 长期码"不过期"存成这个时间（列是 NOT NULL，条件照常写 expires_at > 现在）；接口里给 null */
export const NEVER_EXPIRES = 8_640_000_000_000_000;
const expiresJson = (t: number) => (t >= NEVER_EXPIRES ? null : t);

/** 还能用：名额没满、没撤回、没过期。?2 是现在 */
const USABLE = 'uses < max_uses AND revoked_at IS NULL AND expires_at > ?2';

/** 算进额度的普通码：已用的，或者没撤回、没过期的。?1 是本人，?2 是现在 */
const TAKEN = `(SELECT COUNT(*) FROM invite_codes WHERE owner_id = ?1 AND max_uses = 1 AND (uses > 0 OR (revoked_at IS NULL AND expires_at > ?2)))`;
/** 24 小时内生成的普通码。?1 是本人，?3 是 24 小时前 */
const RECENT = `(SELECT COUNT(*) FROM invite_codes WHERE owner_id = ?1 AND max_uses = 1 AND created_at > ?3)`;

async function quotaState(c: Ctx, rules: InviteRules) {
  const me = c.session!.user;
  const row = await c.db.first<{ quota: number | null; taken: number; recent: number }>(
    c.db.stmt(`SELECT (SELECT invite_quota FROM users WHERE id = ?1) AS quota, ${TAKEN} AS taken, ${RECENT} AS recent`, me.id, c.now, c.now - DAY),
  );
  const quota = row?.quota ?? defaultQuota(rules, me.role);
  const taken = row?.taken ?? 0;
  return { quota, taken, left: Math.max(0, quota - taken), todayLeft: Math.max(0, rules.perDay - (row?.recent ?? 0)) };
}

/** 路径里的码 id：时间前缀 id 的形状，不对直接 404，不碰库 */
export function codeIdParams(segments: string[]): Record<string, string> {
  const id = segments[0] ?? '';
  if (!/^[0-9a-z]{9}[A-Za-z0-9_-]{11}$/.test(id)) throw new ApiError(404, 'not_found');
  return { id };
}

const LIST_MAX = 50;
const hint = (code: string) => `…${code.slice(-4)}`;

/** GET /api/invite-codes：额度、最近 50 个普通码（长期码在管理页看）。只读，0 行 */
export async function listMyCodes(c: Ctx): Promise<Response> {
  const rules = await inviteRules(c.db, c.now);
  const q = await quotaState(c, rules);
  const rows = await c.db.all<CodeRow & { used_by: string | null; display_name: string | null; avatar_json: string | null }>(
    c.db.stmt(
      `SELECT i.id, i.code, i.created_at, i.expires_at, i.used_at, i.revoked_at, i.uses, i.max_uses, cu.user_id AS used_by, u.display_name, u.avatar_json
       FROM invite_codes i LEFT JOIN invite_code_uses cu ON cu.code_id = i.id LEFT JOIN users u ON u.id = cu.user_id
       WHERE i.owner_id = ?1 AND i.max_uses = 1 ORDER BY i.created_at DESC LIMIT ?2`,
      c.session!.user.id, LIST_MAX,
    ),
  );
  const codes = rows.map((r) => {
    const status = statusOf(r, c.now);
    return {
      id: r.id,
      hint: hint(r.code),
      ...(status === 'unused' ? { code: formatInviteCode(r.code) } : {}),
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      status,
      ...(r.used_at !== null
        ? {
            usedAt: r.used_at,
            // 用的人注销了：使用记录已删，显示"账号已注销"
            usedBy: r.used_by && r.display_name !== null ? { userId: r.used_by, displayName: r.display_name, avatar: avatarOf(r.avatar_json) } : null,
          }
        : {}),
    };
  });
  return json(200, { ...q, ttlDays: rules.ttlDays, codes });
}

/**
 * POST /api/invite-codes：生成一个。额度没满、24 小时内没满 perDay 才插进去（一条语句里判断，并发冲不破）。
 * 写入：表 + 两个索引 = 3 行；被拒 0 行（满了先只读查一遍给出准确的错误码）。码撞上唯一索引（60 bit，几乎不会）就换一个再试。
 */
export async function createCode(c: Ctx): Promise<Response> {
  const rules = await inviteRules(c.db, c.now);
  const me = c.session!.user;
  const q = await quotaState(c, rules);
  if (q.left <= 0) throw new ApiError(409, 'quota_full', { quota: q.quota });
  // 24 小时内生成满了：等最早那个满 24 小时（不精确到那一个，按 1 小时报，够用）
  if (q.todayLeft <= 0) throw rateLimited(3_600_000);
  const expiresAt = c.now + rules.ttlDays * DAY;
  for (let attempt = 0; ; attempt++) {
    const id = newTimeId(c.now);
    const code = newInviteCode();
    try {
      const meta = await c.db.run(
        c.db.stmt(
          `INSERT INTO invite_codes (id, code, owner_id, created_at, expires_at)
           SELECT ?4, ?5, ?1, ?2, ?6
           WHERE ${TAKEN} < COALESCE((SELECT invite_quota FROM users WHERE id = ?1), ?7) AND ${RECENT} < ?8`,
          me.id, c.now, c.now - DAY, id, code, expiresAt, defaultQuota(rules, me.role), rules.perDay,
        ),
      );
      // 并发里别的请求先占满了
      if (!meta.changes) throw new ApiError(409, 'quota_full', { quota: q.quota });
      return json(201, { id, code: formatInviteCode(code), link: `/i/${code}`, expiresAt, left: q.left - 1 });
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('invite_codes.code')) || attempt >= 2) throw e;
    }
  }
}

/** POST /api/invite-codes/<id>/revoke：撤回自己没用的码，额度还回来。1 行；不是自己的、已用、已撤回、已过期 404、0 行 */
export async function revokeCode(c: Ctx): Promise<Response> {
  const meta = await c.db.run(
    c.db.stmt(`UPDATE invite_codes SET revoked_at = ?2 WHERE id = ?1 AND owner_id = ?3 AND ${USABLE}`, c.params.id!, c.now, c.session!.user.id),
  );
  if (!meta.changes) throw new ApiError(404, 'not_found');
  return noContent();
}

// ---------- 注册时用 ----------

export interface UsableCode {
  id: string;
  owner_id: string;
  max_uses: number;
}

/** 能用的码：名额没满、没撤回、没过期。只读 */
export async function findUsableCode(db: Db, code: string, now: number): Promise<UsableCode | null> {
  return db.first<UsableCode>(db.stmt(`SELECT id, owner_id, max_uses FROM invite_codes WHERE code = ?1 AND ${USABLE}`, code, now));
}

/**
 * 占名额（注册 batch 的第一条）：条件更新 `uses < max_uses`，并发里只有名额那么多人改得成，调用方看影响行数。1 行。
 * used_by 记"刚占到的人"：batch 里后面的语句（使用记录、建号）以它等于新 id 为条件，没占到就一行都不写
 */
export function claimStatement(db: Db, id: string, userId: string, now: number): D1PreparedStatement {
  return db.stmt(`UPDATE invite_codes SET uses = uses + 1, used_by = ?3, used_at = ?2 WHERE id = ?1 AND ${USABLE}`, id, now, userId);
}

/** 使用记录（batch 第二条）：占到了才写。表 + user 索引 2 行 */
export function recordUseStatement(db: Db, id: string, userId: string, now: number): D1PreparedStatement {
  return db.stmt(
    'INSERT INTO invite_code_uses (code_id, user_id, used_at) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM invite_codes WHERE id = ?1 AND used_by = ?2)',
    id, userId, now,
  );
}

/** 注册成功顺带加好友：新号建成了、邀请人好友没满才加（满了只建号）。表 + user_b 索引 2 行 */
export function inviteFriendStatement(db: Db, ownerId: string, newId: string, now: number, friendsMax: number): D1PreparedStatement {
  const [a, b] = ownerId < newId ? [ownerId, newId] : [newId, ownerId];
  return db.stmt(
    `INSERT INTO friendships (user_a, user_b, status, requested_by, created_at)
     SELECT ?1, ?2, 'accepted', ?3, ?4
     WHERE EXISTS (SELECT 1 FROM users WHERE id = ?5)
       AND (SELECT COUNT(*) FROM friendships WHERE (user_a = ?3 OR user_b = ?3) AND status = 'accepted') < ?6`,
    a, b, ownerId, now, newId, friendsMax,
  );
}

// ---------- 管理 ----------

async function rulesState(c: Ctx) {
  const { rules, log, updatedAt } = await readRulesRow(c.db);
  return { rules, defaults: DEFAULT_INVITE_RULES, range: INVITE_RULE_RANGE, log: [...log].reverse(), updatedAt };
}

/** GET /api/admin/settings/invites：读 1 行 */
export async function getInviteRules(c: Ctx): Promise<Response> {
  return json(200, await rulesState(c));
}

/**
 * POST /api/admin/settings/invites {userQuota?, adminQuota?, ttlDays?, perDay?}：只改传了的，每条要在范围里，不合格整个 400。
 * 有变化时返回要写的语句（settings 1 行），调用方和管理员每日计数一起 batch；没变化返回 null
 */
export async function planInviteRulesChange(c: Ctx, by: string): Promise<{ stmt: D1PreparedStatement | null; rules: InviteRules }> {
  const cur = await readRulesRow(c.db);
  const next = { ...cur.rules };
  const changes: RulesChange['changes'] = {};
  for (const k of Object.keys(DEFAULT_INVITE_RULES) as (keyof InviteRules)[]) {
    const v = c.body[k];
    if (v === undefined) continue;
    if (!inRange(k, v)) throw new ApiError(400, 'bad_request', { field: k, range: INVITE_RULE_RANGE[k] });
    if (v !== cur.rules[k]) {
      changes[k] = [cur.rules[k], v];
      next[k] = v;
    }
  }
  if (!Object.keys(changes).length) return { stmt: null, rules: cur.rules };
  const log = [...cur.log, { at: c.now, by, changes }].slice(-RULES_LOG);
  return { stmt: writeSettingStatement(c.db, RULES_KEY, JSON.stringify({ rules: next, log }), c.now), rules: next };
}

export function rememberInviteRules(rules: InviteRules, now: number): void {
  rulesCache = { rules, at: now };
}

export { rulesState as inviteRulesState };

/** 管理页的全站列表：最近 100 个，看得到用户名（管理员本来就看得到） */
export async function adminCodes(c: Ctx): Promise<Response> {
  const status = new URL(c.request.url).searchParams.get('status') ?? 'all';
  if (!['all', 'unused', 'used', 'multi'].includes(status)) throw new ApiError(400, 'bad_request');
  const where = {
    all: '',
    used: 'WHERE i.uses > 0',
    unused: 'WHERE i.uses < i.max_uses AND i.revoked_at IS NULL AND i.expires_at > ?1',
    multi: 'WHERE i.max_uses > 1',
  }[status];
  const rows = await c.db.all<CodeRow & { owner_name: string | null; owner_display: string | null }>(
    c.db.stmt(
      `SELECT i.id, i.code, i.created_at, i.expires_at, i.used_at, i.revoked_at, i.uses, i.max_uses,
              o.username AS owner_name, o.display_name AS owner_display
       FROM invite_codes i LEFT JOIN users o ON o.id = i.owner_id
       ${where} ORDER BY i.created_at DESC LIMIT 100`,
      // 只有"没用的"要比现在的时间；别的不带参数（多给 D1 会报绑定个数不对）
      ...(status === 'unused' ? [c.now] : []),
    ),
  );
  const people = await usesOf(c.db, rows.filter((r) => r.uses > 0).map((r) => r.id));
  return json(200, {
    codes: rows.map((r) => {
      const st = statusOf(r, c.now);
      const users = people.get(r.id) ?? [];
      return {
        id: r.id,
        hint: hint(r.code),
        // 没用的码给全（管理员要复制给人）：和本人列表一样只给还能用的，用过、过期、撤回的只给末四位
        ...(st === 'unused' ? { code: formatInviteCode(r.code) } : {}),
        status: st,
        owner: r.owner_name ? { username: r.owner_name, displayName: r.owner_display } : null,
        createdAt: r.created_at,
        expiresAt: expiresJson(r.expires_at),
        uses: r.uses,
        maxUses: r.max_uses,
        // 普通码：用的人（注销了是 null）；长期码：用它注册的人（注销了的不列）
        ...(r.max_uses === 1 && r.used_at !== null ? { usedAt: r.used_at, usedBy: users[0] ?? null } : {}),
        ...(r.max_uses > 1 ? { users } : {}),
      };
    }),
  });
}

/** 这些码的使用记录（新的在前）；码 id 最多 100 个，按主键前缀查 */
async function usesOf(db: Db, ids: string[]) {
  const map = new Map<string, { username: string; displayName: string; usedAt: number }[]>();
  if (!ids.length) return map;
  const rows = await db.all<{ code_id: string; username: string; display_name: string; used_at: number }>(
    db.stmt(
      `SELECT cu.code_id, u.username, u.display_name, cu.used_at FROM invite_code_uses cu JOIN users u ON u.id = cu.user_id
       WHERE cu.code_id IN (SELECT value FROM json_each(?1)) ORDER BY cu.used_at DESC`,
      JSON.stringify(ids),
    ),
  );
  for (const r of rows) {
    const list = map.get(r.code_id) ?? [];
    list.push({ username: r.username, displayName: r.display_name, usedAt: r.used_at });
    map.set(r.code_id, list);
  }
  return map;
}

/**
 * POST /api/admin/invite-codes {maxUses?: 2–10000（默认 100）, days?: 1–365（不给或 null 不过期），范围见 shared/invite.ts 的 MULTI_CODE}：建一个长期码，只有管理员会话能建
 * （码要记在一个人名下；Bearer 令牌 403 session_required）。不占邀请额度，不算 24 小时上限。
 * 返回要写的语句（表 + 两个索引 3 行），调用方和每日计数一起 batch
 */
export function planMultiCode(c: Ctx): { stmt: D1PreparedStatement; code: { id: string; code: string; link: string; maxUses: number; expiresAt: number | null } } {
  if (!c.session) throw new ApiError(403, 'session_required');
  const maxUses = c.body.maxUses === undefined ? MULTI_CODE.usesDefault : multiUses(c.body.maxUses);
  const days = c.body.days === undefined || c.body.days === null ? null : count(c.body.days);
  if (days !== null && (days < 1 || days > MULTI_CODE.daysMax)) throw new ApiError(400, 'bad_request', { field: 'days', range: [1, MULTI_CODE.daysMax] });
  const expiresAt = days === null ? NEVER_EXPIRES : c.now + days * DAY;
  const id = newTimeId(c.now);
  const code = newInviteCode();
  return {
    stmt: c.db.stmt(
      'INSERT INTO invite_codes (id, code, owner_id, created_at, expires_at, max_uses) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
      id, code, c.session.user.id, c.now, expiresAt, maxUses,
    ),
    code: { id, code: formatInviteCode(code), link: `/i/${code}`, maxUses, expiresAt: expiresJson(expiresAt) },
  };
}

/** 长期码能用几次：整数 2–usesMax，不对 400 */
function multiUses(v: unknown): number {
  const n = count(v);
  if (n < 2 || n > MULTI_CODE.usesMax) throw new ApiError(400, 'bad_request', { field: 'maxUses', range: [2, MULTI_CODE.usesMax] });
  return n;
}

/**
 * 改长期码能用几次（只认管理员会话，同建码）：只改长期码（max_uses > 1）、没撤回的，新次数不小于已经用掉的。
 * 一条带条件的 UPDATE，写 0 行就是不满足条件（调用方再查是哪一条）；并发注册占名额也走带条件的 UPDATE，不会被改到比已用少。
 */
export function planMultiUses(c: Ctx): { maxUses: number; stmt: D1PreparedStatement } {
  if (!c.session) throw new ApiError(403, 'session_required');
  const maxUses = multiUses(c.body.maxUses);
  return {
    maxUses,
    stmt: c.db.stmt('UPDATE invite_codes SET max_uses = ?2 WHERE id = ?1 AND max_uses > 1 AND revoked_at IS NULL AND uses <= ?2', c.params.id, maxUses),
  };
}

/** 管理员撤回：名额没满、没撤回的码才能撤（1 行），调用方加每日计数。长期码撤回后已经注册的人不受影响 */
export function adminRevokeStatement(db: Db, id: string, now: number): D1PreparedStatement {
  return db.stmt('UPDATE invite_codes SET revoked_at = ?2 WHERE id = ?1 AND uses < max_uses AND revoked_at IS NULL', id, now);
}

/** 单个人的额度：整数 0–USER_QUOTA_MAX，或 null 恢复默认 */
export function parseUserQuota(v: unknown): number | null {
  if (v === null) return null;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= USER_QUOTA_MAX) return v;
  throw new ApiError(400, 'bad_request', { max: USER_QUOTA_MAX });
}

// ---------- 清理 ----------

/** Cron：一次没用过的码过期或撤回满 30 天就删（用过的留着，额度和使用记录要算）。表小，按条件扫 */
export const INVITE_KEEP_MS = 30 * DAY;
export function cleanupStatement(db: Db, now: number, limit: number): D1PreparedStatement {
  return db.stmt(
    `DELETE FROM invite_codes WHERE id IN (SELECT id FROM invite_codes
       WHERE uses = 0 AND (expires_at < ?1 OR revoked_at < ?1) LIMIT ?2)`,
    now - INVITE_KEEP_MS, limit,
  );
}
