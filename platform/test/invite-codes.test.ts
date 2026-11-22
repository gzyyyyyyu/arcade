/**
 * 邀请码（docs/platform-backend.md 15.20）：生成（额度、24 小时上限、并发）、撤回和过期还额度、带码注册（13 行、自动加好友、
 * 一码一用、并发只建成一个号、填错计数和每 IP 上限）、注册关着时必须带码、管理（四个数、单人额度、全站列表、撤回）、
 * 长期码（只有管理员会话能建、多次、并发抢最后一个名额、撤回、过期、不占额度、不加好友、防刷照样生效）、注销和 Cron 清理。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { insertUser } from '../worker/api/account/auth';
import { limitsOf } from '../worker/api/lib/config';
import type { Ctx } from '../worker/api/core/context';
import { runCleanup } from '../worker/api/ops/cron';
import { Db, newStats } from '../worker/api/lib/db';
import { claimStatement, resetInviteRulesCacheForTests, recordUseStatement } from '../worker/api/account/invite-codes';
import { newSession } from '../worker/api/account/session';
import { advance, call, count, env, errorOf, registerUser, resetAll, rowsWritten, sidOf, uniqueName } from './helpers';

beforeEach(() => resetAll({ anonPerIpPerMinute: 1000 }));

const DAY = 86_400_000;
let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq % 250}`;
const newUser = () => registerUser(undefined, undefined, nextIp());
type U = Awaited<ReturnType<typeof newUser>>;

interface Code {
  id: string;
  hint: string;
  code?: string;
  status: string;
  usedBy?: { userId: string; displayName: string } | null;
}
interface Mine {
  quota: number;
  taken: number;
  left: number;
  todayLeft: number;
  codes: Code[];
}

const create = (u: U) => call('/api/invite-codes', { body: {}, cookie: u.cookie });
const createCode = async (u: U) => {
  const res = await create(u);
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; code: string; link: string };
};
const mine = async (u: U) => (await (await call('/api/invite-codes', { cookie: u.cookie })).json()) as Mine;
const revoke = (u: U, id: string) => call(`/api/invite-codes/${id}/revoke`, { body: {}, cookie: u.cookie });
const registerWith = (inviteCode: unknown, o: { ip?: string; username?: string } = {}) =>
  call('/api/auth/register', { body: { username: o.username ?? uniqueName(), password: 'Correct-Horse-9', displayName: '新朋友', inviteCode }, ip: o.ip ?? nextIp() });
const closeRegistration = () => env.DB.prepare("UPDATE settings SET value = 'closed' WHERE key = 'registration'").run();
async function makeAdmin(u: U) {
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(u.user.id).run();
}
async function setRules(rules: Record<string, number>) {
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('invite_rules', ?1, 0)").bind(JSON.stringify({ rules, log: [] })).run();
  resetInviteRulesCacheForTests();
}

describe('生成和额度', () => {
  it('生成：201、3 行（表 + 两个索引），码 12 位显示成 4-4-4，链接 /i/<码>；列表里没用的给码', async () => {
    const a = await newUser();
    const c = await createCode(a);
    expect(rowsWritten()).toBe(3);
    expect(c.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(c.link).toBe(`/i/${c.code.replaceAll('-', '')}`);
    expect(await mine(a)).toMatchObject({ quota: 3, taken: 1, left: 2, codes: [{ id: c.id, status: 'unused', code: c.code, hint: `…${c.code.slice(-4)}` }] });
  });

  it('普通用户 3 个：第 4 个 409 quota_full、0 行；撤回一个、过期一个都把额度还回来；撤回别人的 404', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const first = await createCode(a);
    await createCode(a);
    await createCode(a);
    const full = await create(a);
    expect([full.status, await errorOf(full)]).toEqual([409, 'quota_full']);
    expect(rowsWritten()).toBe(0);
    expect((await revoke(b, first.id)).status).toBe(404);
    expect((await revoke(a, first.id)).status).toBe(204);
    expect(rowsWritten()).toBe(1);
    expect((await revoke(a, first.id)).status).toBe(404);
    expect((await mine(a)).left).toBe(1);
    await createCode(a);
    expect((await create(a)).status).toBe(409);
    // 7 天以后都过期了：额度全回来，列表里过期的不再给码
    advance(7 * DAY + 1);
    const later = await mine(a);
    expect(later.left).toBe(3);
    expect(later.codes.every((x) => x.status !== 'unused' && x.code === undefined)).toBe(true);
  });

  it('并发 8 个生成：只有 3 个插进去（额度写在插入条件里）', async () => {
    const a = await newUser();
    const res = await Promise.all(Array.from({ length: 8 }, () => create(a)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(3);
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes WHERE owner_id = ?1', a.user.id)).toBe(3);
  });

  it('24 小时最多生成 perDay 个（撤回了也算），满了 429；管理员默认 50 个', async () => {
    await setRules({ userQuota: 10, perDay: 2 });
    const a = await newUser();
    const x = await createCode(a);
    await revoke(a, x.id);
    await createCode(a);
    const res = await create(a);
    expect(res.status).toBe(429);
    expect(rowsWritten()).toBe(0);
    advance(DAY + 1);
    await createCode(a);
    const admin = await newUser();
    await makeAdmin(admin);
    expect((await mine(admin)).quota).toBe(50);
  });
});

describe('带码注册', () => {
  it('注册关着：不带码 403；带有效的码 201、13 行，两人自动成为好友，码变成"已用"并显示用的人', async () => {
    const a = await newUser();
    const c = await createCode(a);
    await closeRegistration();
    expect(await errorOf(await registerWith(undefined))).toBe('registration_closed');
    const res = await registerWith(c.code.toLowerCase());
    expect(res.status).toBe(201);
    // 原来的 9 行 + 试码计数 1 + 占码 1 + 使用记录 2 + 好友 2
    expect(rowsWritten()).toBe(15);
    const newId = ((await res.json()) as { user: { id: string } }).user.id;
    const friends = ((await (await call('/api/friends', { cookie: a.cookie })).json()) as { friends: { userId: string }[] }).friends;
    expect(friends.map((f) => f.userId)).toEqual([newId]);
    const list = await mine(a);
    expect(list.codes[0]).toMatchObject({ status: 'used', usedBy: { userId: newId, displayName: '新朋友' } });
    expect(list.codes[0]!.code).toBeUndefined();
    expect(list.taken).toBe(1);
    // 一码一用：再用 400，只写试码计数 1 行
    const again = await registerWith(c.code);
    expect([again.status, await errorOf(again)]).toEqual([400, 'invite_invalid']);
    expect(rowsWritten()).toBe(1);
  });

  it('码不对、过期、撤回都是 400 invite_invalid（一个错误码）；注册开着时填错也不回落成普通注册；不带码照常 9 行', async () => {
    const a = await newUser();
    const [expired, revoked] = [await createCode(a), await createCode(a)];
    await revoke(a, revoked.id);
    for (const code of ['AAAA-AAAA-AAAA', 'not-a-code', revoked.code]) {
      const res = await registerWith(code);
      expect([res.status, await errorOf(res)], code).toEqual([400, 'invite_invalid']);
    }
    advance(7 * DAY + 1);
    expect(await errorOf(await registerWith(expired.code))).toBe('invite_invalid');
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(1);
    expect((await registerWith('')).status).toBe(201);
    expect(rowsWritten()).toBe(9);
  });

  it('试码每 IP 每小时 10 次（成败都算），第 11 次 429、0 行；换个 IP 照常', async () => {
    const a = await newUser();
    const c = await createCode(a);
    await closeRegistration();
    for (let i = 0; i < 10; i++) expect((await registerWith('AAAA-AAAA-AAAA', { ip: '192.0.2.9' })).status).toBe(400);
    const blocked = await registerWith(c.code, { ip: '192.0.2.9' });
    expect(blocked.status).toBe(429);
    expect(rowsWritten()).toBe(0);
    expect((await registerWith(c.code, { ip: '192.0.2.10' })).status).toBe(201);
  });

  it('同一个码两个人同时用：只建成一个号，另一个 409 invite_used 或 400，没有半截的凭证和会话', async () => {
    const a = await newUser();
    const c = await createCode(a);
    await closeRegistration();
    const res = await Promise.all([registerWith(c.code), registerWith(c.code), registerWith(c.code)]);
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of res.filter((x) => x.status !== 201)) expect(['invite_used', 'invite_invalid']).toContain(await errorOf(r));
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(2);
    expect(await count('SELECT COUNT(*) AS n FROM credentials')).toBe(4);
    expect(await count('SELECT COUNT(*) AS n FROM sessions')).toBe(2);
    expect(await count('SELECT COUNT(*) AS n FROM friendships')).toBe(1);
  });

  it('占码没改成（码在查完之后被别人用了）：整批一行不写，抛 409 invite_used', async () => {
    const a = await newUser();
    const c = await createCode(a);
    // 别人先占了
    await env.DB.prepare('UPDATE invite_codes SET uses = 1, used_at = 1, used_by = ?1 WHERE id = ?2').bind('someone', c.id).run();
    const db = new Db(env.DB, newStats(), 'reg');
    const now = Date.now();
    const limits = limitsOf(env);
    const ctx = { db, env, limits, now } as unknown as Ctx;
    const userId = 'late_comer_id_000000000';
    const session = await newSession(env, db, userId, limits, now, true);
    await expect(
      insertUser(ctx, { userId, username: 'late_comer', displayName: '晚到', password: 'Correct-Horse-9', role: 'user' }, [session.stmt], {
        id: c.id,
        claim: [claimStatement(db, c.id, userId, now), recordUseStatement(db, c.id, userId, now)],
      }),
    ).rejects.toMatchObject({ status: 409, code: 'invite_used' });
    for (const t of ['users WHERE id = ?1', 'credentials WHERE user_id = ?1', 'sessions WHERE user_id = ?1', 'invite_code_uses WHERE user_id = ?1']) {
      expect(await count(`SELECT COUNT(*) AS n FROM ${t}`, userId), t).toBe(0);
    }
  });
});

describe('管理', () => {
  it('四个数：读、改（2 行）、超范围 400、没变化 0 行；改了马上生效', async () => {
    const admin = await newUser();
    await makeAdmin(admin);
    const get = await (await call('/api/admin/settings/invites', { cookie: admin.cookie })).json();
    expect(get).toMatchObject({ rules: { userQuota: 3, adminQuota: 50, ttlDays: 7, perDay: 5 } });
    const set = await call('/api/admin/settings/invites', { body: { userQuota: 1 }, cookie: admin.cookie });
    expect(set.status).toBe(200);
    expect(rowsWritten()).toBe(2);
    expect((await call('/api/admin/settings/invites', { body: { userQuota: 1 }, cookie: admin.cookie })).status).toBe(200);
    expect(rowsWritten()).toBe(0);
    expect((await call('/api/admin/settings/invites', { body: { ttlDays: 0 }, cookie: admin.cookie })).status).toBe(400);
    const a = await newUser();
    await createCode(a);
    expect((await create(a)).status).toBe(409);
  });

  it('单人额度：改了就按它（2 行），null 恢复默认；不是管理员 403', async () => {
    const [admin, a] = [await newUser(), await newUser()];
    await makeAdmin(admin);
    expect((await call(`/api/admin/users/${a.user.id}/invite-quota`, { body: { quota: 1 }, cookie: a.cookie })).status).toBe(403);
    const res = await call(`/api/admin/users/${a.user.id}/invite-quota`, { body: { quota: 5 }, cookie: admin.cookie });
    expect(await res.json()).toEqual({ quota: 5, custom: true });
    expect(rowsWritten()).toBe(2);
    expect((await mine(a)).quota).toBe(5);
    await call(`/api/admin/users/${a.user.id}/invite-quota`, { body: { quota: null }, cookie: admin.cookie });
    expect((await mine(a)).quota).toBe(3);
    expect((await call(`/api/admin/users/${a.user.id}/invite-quota`, { body: { quota: -1 }, cookie: admin.cookie })).status).toBe(400);
  });

  it('全站列表看得到谁发的、谁用的（用户名），不给码；撤回没用的（2 行），已用的 404', async () => {
    const [admin, a] = [await newUser(), await newUser()];
    await makeAdmin(admin);
    const [x, y] = [await createCode(a), await createCode(a)];
    expect((await registerWith(y.code, { username: 'invited_one' })).status).toBe(201);
    const list = (await (await call('/api/admin/invite-codes', { cookie: admin.cookie })).json()) as { codes: (Code & { owner: { username: string }; usedBy?: { username: string } })[] };
    expect(list.codes).toHaveLength(2);
    expect(list.codes.find((c) => c.id === y.id)).toMatchObject({ status: 'used', owner: { username: a.username }, usedBy: { username: 'invited_one' } });
    // 没用的给全码（管理员复制给人），用过的只给末四位
    expect(list.codes.find((c) => c.id === x.id)?.code).toBe(x.code);
    expect(list.codes.find((c) => c.id === y.id)?.code).toBeUndefined();
    expect(JSON.stringify(list)).not.toContain(y.code.replaceAll('-', ''));
    const ids = async (status: string) =>
      ((await (await call(`/api/admin/invite-codes?status=${status}`, { cookie: admin.cookie })).json()) as { codes: Code[] }).codes.map((c) => c.id);
    expect(await ids('unused')).toEqual([x.id]);
    expect(await ids('used')).toEqual([y.id]);
    expect((await call('/api/admin/invite-codes?status=nope', { cookie: admin.cookie })).status).toBe(400);
    expect((await call(`/api/admin/invite-codes/${x.id}/revoke`, { body: {}, cookie: admin.cookie })).status).toBe(204);
    expect(rowsWritten()).toBe(2);
    expect((await call(`/api/admin/invite-codes/${y.id}/revoke`, { body: {}, cookie: admin.cookie })).status).toBe(404);
  });
});

describe('长期码（多次）', () => {
  interface Multi {
    id: string;
    code: string;
    maxUses: number;
    expiresAt: number | null;
  }
  const createMulti = (u: U, body: Record<string, unknown> = {}) => call('/api/admin/invite-codes', { body, cookie: u.cookie });
  const multi = async (u: U, body: Record<string, unknown> = {}) => {
    const res = await createMulti(u, body);
    expect(res.status).toBe(201);
    return (await res.json()) as Multi;
  };
  const adminUser = async () => {
    const u = await newUser();
    await makeAdmin(u);
    return u;
  };

  it('只有管理员会话能建：默认 100 次、不过期，4 行（码 3 + 每日计数 1）；普通用户 403，令牌 403 session_required；范围不对 400', async () => {
    const [admin, a] = [await adminUser(), await newUser()];
    expect((await createMulti(a)).status).toBe(403);
    const m = await multi(admin);
    expect(rowsWritten()).toBe(4);
    expect(m).toMatchObject({ maxUses: 100, expiresAt: null });
    const token = await call('/api/admin/invite-codes', { body: {}, csrf: false, authorization: `Bearer ${env.ADMIN_TOKEN}` });
    expect([token.status, await errorOf(token)]).toEqual([403, 'session_required']);
    expect((await createMulti(admin, { maxUses: 10_000 })).status).toBe(201);
    for (const body of [{ maxUses: 1 }, { maxUses: 10_001 }, { maxUses: '5' }, { days: 0 }, { days: 366 }]) {
      expect((await createMulti(admin, body)).status, JSON.stringify(body)).toBe(400);
    }
    // 用户侧的生成接口传什么都只建普通码
    await call('/api/invite-codes', { body: { maxUses: 100 }, cookie: a.cookie });
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes WHERE owner_id = ?1 AND max_uses = 1', a.user.id)).toBe(1);
  });

  it('多人能用：每次 13 行（不加好友），记下每个人；不占管理员的额度、不进本人列表；管理页看得到 已用/上限 和用它注册的人', async () => {
    const admin = await adminUser();
    const m = await multi(admin, { maxUses: 3 });
    await closeRegistration();
    expect((await registerWith(m.code, { username: 'multi_one' })).status).toBe(201);
    // 9 + 试码 1 + 占名额 1 + 使用记录 2
    expect(rowsWritten()).toBe(13);
    expect((await registerWith(m.code, { username: 'multi_two' })).status).toBe(201);
    expect(await count('SELECT COUNT(*) AS n FROM friendships')).toBe(0);
    expect(await mine(admin)).toMatchObject({ taken: 0, left: 50, codes: [] });
    const list = (await (await call('/api/admin/invite-codes?status=multi', { cookie: admin.cookie })).json()) as {
      codes: { id: string; status: string; code?: string; uses: number; maxUses: number; users: { username: string }[] }[];
    };
    expect(list.codes).toHaveLength(1);
    expect(list.codes[0]).toMatchObject({ id: m.id, status: 'unused', code: m.code, uses: 2, maxUses: 3 });
    expect(list.codes[0]!.users.map((u) => u.username).sort()).toEqual(['multi_one', 'multi_two']);
  });

  it('并发抢最后一个名额：恰好一人成功，没有半截的号；用完了 400 invite_invalid', async () => {
    const admin = await adminUser();
    const m = await multi(admin, { maxUses: 2 });
    await closeRegistration();
    expect((await registerWith(m.code)).status).toBe(201);
    const res = await Promise.all(Array.from({ length: 4 }, () => registerWith(m.code)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(1);
    for (const r of res.filter((x) => x.status !== 201)) expect(['invite_used', 'invite_invalid']).toContain(await errorOf(r));
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(3);
    expect(await count('SELECT COUNT(*) AS n FROM credentials')).toBe(6);
    expect(await count('SELECT COUNT(*) AS n FROM invite_code_uses WHERE code_id = ?1', m.id)).toBe(2);
    expect(await count('SELECT uses AS n FROM invite_codes WHERE id = ?1', m.id)).toBe(2);
    expect(await errorOf(await registerWith(m.code))).toBe('invite_invalid');
  });

  it('撤回后不能再用（已注册的人不受影响），用完的不能撤；设了天数的到期后不能用', async () => {
    const admin = await adminUser();
    const [m, d] = [await multi(admin), await multi(admin, { days: 2 })];
    expect(d.expiresAt).toBe(Date.now() + 2 * DAY);
    await closeRegistration();
    expect((await registerWith(m.code)).status).toBe(201);
    expect((await call(`/api/admin/invite-codes/${m.id}/revoke`, { body: {}, cookie: admin.cookie })).status).toBe(204);
    expect(await errorOf(await registerWith(m.code))).toBe('invite_invalid');
    expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(2);
    advance(2 * DAY + 1);
    expect(await errorOf(await registerWith(d.code))).toBe('invite_invalid');
    // 不过期的那个过了很久照样能用（另建一个，m 已经撤回）
    const forever = await multi(admin);
    advance(400 * DAY);
    expect((await registerWith(forever.code)).status).toBe(201);
  });

  it('改长期码能用几次：管理员会话 2 行；2–10000；不小于已用（等于可以，用完的改大又能用）；普通码、撤回的、不存在 404；普通用户 403，令牌 403 session_required；都是 0 行', async () => {
    const [admin, a] = [await adminUser(), await newUser()];
    const m = await multi(admin, { maxUses: 2 });
    const setUses = (id: string, maxUses: unknown, u: U = admin) => call(`/api/admin/invite-codes/${id}/uses`, { body: { maxUses }, cookie: u.cookie });
    const res = await setUses(m.id, 10_000);
    expect([res.status, await res.json()]).toEqual([200, { id: m.id, maxUses: 10_000 }]);
    expect(rowsWritten()).toBe(2);
    expect(await count('SELECT max_uses AS n FROM invite_codes WHERE id = ?1', m.id)).toBe(10_000);
    for (const v of [1, 10_001, '5', null, 2.5]) {
      expect((await setUses(m.id, v)).status, JSON.stringify(v)).toBe(400);
      expect(rowsWritten()).toBe(0);
    }
    // 已经用掉 3 次：改成 2 不行（409、带已用数），改成 3 可以（正好用完，注册不了），再改成 4 又能用
    await env.DB.prepare('UPDATE invite_codes SET uses = 3 WHERE id = ?1').bind(m.id).run();
    const below = await setUses(m.id, 2);
    expect([below.status, await errorOf(below)]).toEqual([409, 'below_used']);
    expect(rowsWritten()).toBe(0);
    expect((await setUses(m.id, 3)).status).toBe(200);
    await closeRegistration();
    expect(await errorOf(await registerWith(m.code))).toBe('invite_invalid');
    expect((await setUses(m.id, 4)).status).toBe(200);
    expect((await registerWith(m.code)).status).toBe(201);
    // 权限：普通用户 403，命令行令牌 403 session_required，缺 X-Arcade 403
    expect((await setUses(m.id, 500, a)).status).toBe(403);
    const token = await call(`/api/admin/invite-codes/${m.id}/uses`, { body: { maxUses: 500 }, csrf: false, authorization: `Bearer ${env.ADMIN_TOKEN}` });
    expect([token.status, await errorOf(token)]).toEqual([403, 'session_required']);
    expect((await call(`/api/admin/invite-codes/${m.id}/uses`, { body: { maxUses: 500 }, cookie: admin.cookie, csrf: false })).status).toBe(403);
    expect(rowsWritten()).toBe(0);
    // 普通码（max_uses = 1）、撤回的长期码、不存在的：404
    await call('/api/invite-codes', { body: {}, cookie: a.cookie });
    const plain = (await env.DB.prepare('SELECT id FROM invite_codes WHERE owner_id = ?1').bind(a.user.id).first<{ id: string }>())!;
    expect((await setUses(plain.id, 5)).status).toBe(404);
    const r = await multi(admin);
    await call(`/api/admin/invite-codes/${r.id}/revoke`, { body: {}, cookie: admin.cookie });
    expect((await setUses(r.id, 500)).status).toBe(404);
    expect((await setUses(`${r.id.slice(0, -1)}${r.id.endsWith('A') ? 'B' : 'A'}`, 500)).status).toBe(404);
    expect(rowsWritten()).toBe(0);
    expect(await count('SELECT max_uses AS n FROM invite_codes WHERE id = ?1', r.id)).toBe(100);
  });

  it('注册防刷照样生效：同一 IP 一天的注册上限到了 429、0 行', async () => {
    const admin = await adminUser();
    const m = await multi(admin);
    await closeRegistration();
    const ip = '192.0.2.77';
    let last = 0;
    for (let i = 0; i < 20 && last !== 429; i++) last = (await registerWith(m.code, { ip })).status;
    expect(last).toBe(429);
    expect(rowsWritten()).toBe(0);
  });

  it('用它注册的人注销：使用记录删掉、名额不还', async () => {
    const admin = await adminUser();
    const m = await multi(admin, { maxUses: 5 });
    const res = await registerWith(m.code);
    expect((await call('/api/account/delete', { body: { currentPassword: 'Correct-Horse-9' }, cookie: sidOf(res)! })).status).toBe(204);
    expect(await count('SELECT COUNT(*) AS n FROM invite_code_uses')).toBe(0);
    expect(await count('SELECT uses AS n FROM invite_codes WHERE id = ?1', m.id)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes WHERE used_by IS NOT NULL')).toBe(0);
  });

  it('发码的管理员注销：长期码连同别人用它的使用记录一起删，用码的人账号不动', async () => {
    const admin = await adminUser();
    const m = await multi(admin, { maxUses: 5 });
    expect((await registerWith(m.code)).status).toBe(201);
    expect((await registerWith(m.code, { username: 'second_one' })).status).toBe(201);
    expect((await call('/api/account/delete', { body: { currentPassword: admin.password }, cookie: admin.cookie })).status).toBe(204);
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes WHERE id = ?1', m.id)).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM invite_code_uses')).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE username = 'second_one'")).toBe(1);
  });
});

describe('删干净', () => {
  it('邀请人注销：他生成的码全删；被邀请人注销：码的 used_by 清空、仍算已用，列表里显示用的人已注销', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const c = await createCode(a);
    await createCode(b);
    const res = await registerWith(c.code, { username: 'will_leave' });
    expect((await call('/api/account/delete', { body: { currentPassword: 'Correct-Horse-9' }, cookie: sidOf(res)! })).status).toBe(204);
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes WHERE used_by IS NOT NULL')).toBe(0);
    const list = await mine(a);
    expect(list.codes[0]).toMatchObject({ status: 'used', usedBy: null });
    expect(list.taken).toBe(1);
    expect((await call('/api/account/delete', { body: { currentPassword: b.password }, cookie: b.cookie })).status).toBe(204);
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes WHERE owner_id = ?1', b.user.id)).toBe(0);
  });

  it('Cron：没用的码过期或撤回满 30 天删掉，已用的留着', async () => {
    const a = await newUser();
    const [used, revoked] = [await createCode(a), await createCode(a)];
    await createCode(a);
    await revoke(a, revoked.id);
    expect((await registerWith(used.code)).status).toBe(201);
    advance(40 * DAY);
    await runCleanup(env, Date.now());
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes')).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM invite_codes WHERE id = ?1', used.id)).toBe(1);
  });
});
