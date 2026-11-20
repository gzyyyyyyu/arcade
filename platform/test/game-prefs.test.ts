/** 隐藏游戏（docs/platform-backend.md 15.21）：管理员设默认、每人改偏好（存和默认不一样的部分）、/api/me 带默认、计数和写入行数、纯函数。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { hiddenGameIds, prefsFor, visibleOf } from '../shared/game-prefs';
import { GAMES } from '../shared/games';
import { resetSettingsCacheForTests } from '../worker/api/core/settings';
import { call, env, errorOf, registerUser, resetAll, rowsWritten } from './helpers';

beforeEach(() => resetAll());

const [G1, G2, G3] = GAMES.map((g) => g.id) as [string, string, string];

async function admin() {
  const a = await registerUser();
  await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?1").bind(a.user.id).run();
  return a;
}
const setDefault = (cookie: string, hidden: unknown) => call('/api/admin/settings/games', { body: { hidden }, cookie });
const putPrefs = (cookie: string, hidden: unknown) => call('/api/me/games', { method: 'PUT', body: { hidden }, cookie });
interface Me {
  user: { gamePrefs: { show: string[]; hide: string[] } } | null;
  hiddenDefault?: string[];
}
const me = async (cookie?: string) => (await (await call('/api/me', { cookie })).json()) as Me;
const hiddenOf = (m: Me) => [...hiddenGameIds(m.hiddenDefault ?? [], m.user!.gamePrefs)].sort();

describe('纯函数', () => {
  it('默认隐藏的去掉我要看的、加上我不看的；prefsFor 换回"和默认不一样的"', () => {
    expect([...hiddenGameIds([G1, G2], { show: [G1], hide: [G3] })].sort()).toEqual([G2, G3].sort());
    expect(prefsFor([G1, G2], [G2, G3])).toEqual({ show: [G1], hide: [G3] });
    expect(prefsFor([G1], [G1])).toEqual({ show: [], hide: [] });
    expect(visibleOf(GAMES, new Set([G1]), (g) => g.id).map((g) => g.id)).not.toContain(G1);
  });
});

describe('隐藏游戏', () => {
  it('管理员设默认（2 行），登录的人在 /api/me 里拿到，没登录的不给；普通用户 403；没登记的 id 400', async () => {
    const [a, u] = [await admin(), await registerUser()];
    expect((await me(u.cookie)).hiddenDefault).toEqual([]);
    const res = await setDefault(a.cookie, [G2, G1, G2]);
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(2);
    expect(await res.json()).toEqual({ hidden: [G1, G2].sort() });
    expect((await me(u.cookie)).hiddenDefault).toEqual([G1, G2].sort());
    expect((await me()).hiddenDefault).toBeUndefined();
    expect((await setDefault(u.cookie, [G1])).status).toBe(403);
    expect((await setDefault(a.cookie, ['nope'])).status).toBe(400);
    expect((await setDefault(a.cookie, G1)).status).toBe(400);
    expect(await (await call('/api/admin/settings/games', { cookie: a.cookie })).json()).toEqual({ hidden: [G1, G2].sort() });
  });

  it('每人改偏好：2 行，只存和默认不一样的；管理员以后改默认，没动过的那部分跟着变', async () => {
    const [a, u] = [await admin(), await registerUser()];
    await setDefault(a.cookie, [G1]);
    // 把默认隐藏的 G1 打开，再隐藏 G3
    const res = await putPrefs(u.cookie, [G3]);
    expect(res.status).toBe(200);
    expect(rowsWritten()).toBe(2);
    expect(((await res.json()) as Me).user!.gamePrefs).toEqual({ show: [G1], hide: [G3] });
    expect(hiddenOf(await me(u.cookie))).toEqual([G3]);
    // 管理员再默认隐藏 G2：我没动过 G2，跟着隐藏
    await setDefault(a.cookie, [G1, G2]);
    expect(hiddenOf(await me(u.cookie))).toEqual([G2, G3].sort());
    // 改回和默认一样：存 null
    await putPrefs(u.cookie, [G1, G2]);
    expect((await env.DB.prepare('SELECT game_prefs FROM users WHERE id = ?1').bind(u.user.id).first<{ game_prefs: string | null }>())?.game_prefs).toBeNull();
  });

  it('改偏好按库里现在的默认算差量：别的 isolate 刚改了默认、本地缓存还是旧的，也不会把没动过的游戏写进个人偏好', async () => {
    const [a, u] = [await admin(), await registerUser()];
    await setDefault(a.cookie, [G1]);
    expect((await me(u.cookie)).hiddenDefault).toEqual([G1]);
    // 绕过本 isolate 的缓存直接改库，当作别的 isolate 改的
    await env.DB.prepare("UPDATE settings SET value = ?1 WHERE key = 'hidden_games'").bind(JSON.stringify([G1, G2].sort())).run();
    const res = await putPrefs(u.cookie, [G1, G2]);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Me).hiddenDefault).toEqual([G1, G2].sort());
    expect((await env.DB.prepare('SELECT game_prefs FROM users WHERE id = ?1').bind(u.user.id).first<{ game_prefs: string | null }>())?.game_prefs).toBeNull();
    // 读到的新默认顺带记进缓存
    expect((await me(u.cookie)).hiddenDefault).toEqual([G1, G2].sort());
  });

  it('形状不对 400、没登录 401、缺 X-Arcade 403；每人每天 prefsPerDay 次，超了 429、0 行', async () => {
    await resetAll({ prefsPerDay: 3 });
    const u = await registerUser();
    for (const bad of [G1, ['nope'], [1], null]) expect((await putPrefs(u.cookie, bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await call('/api/me/games', { method: 'PUT', body: { hidden: [] } })).status).toBe(401);
    expect((await call('/api/me/games', { method: 'PUT', body: { hidden: [] }, cookie: u.cookie, csrf: false })).status).toBe(403);
    for (let i = 0; i < 3; i++) expect((await putPrefs(u.cookie, i % 2 ? [G1] : [])).status).toBe(200);
    const res = await putPrefs(u.cookie, []);
    expect([res.status, await errorOf(res)]).toEqual([429, 'rate_limited']);
    expect(rowsWritten()).toBe(0);
  });

  it('坏数据当默认：存的偏好坏了按默认，settings 坏了当不隐藏', async () => {
    const u = await registerUser();
    await env.DB.prepare("UPDATE users SET game_prefs = '{bad' WHERE id = ?1").bind(u.user.id).run();
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('hidden_games', '\"x\"', 0)").run();
    resetSettingsCacheForTests();
    const m = await me(u.cookie);
    expect(m.user!.gamePrefs).toEqual({ show: [], hide: [] });
    expect(m.hiddenDefault).toEqual([]);
  });
});
