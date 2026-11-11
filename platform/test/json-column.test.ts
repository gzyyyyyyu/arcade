/**
 * D1 的 JSON 列读取（worker/api/lib/json-column.ts）：坏数据明确失败或回兜底值，错误和日志只带列名，不带数据。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadColumnError, isNumberRecord, isRecordOf, isUnknown, parseJsonColumn, parseJsonColumnOr } from '../worker/api/lib/json-column';
import { isWalletState } from '../worker/api/wallet/state';
import { call, env, registerUser, resetAll, rowsWritten } from './helpers';

beforeEach(() => resetAll());

describe('parseJsonColumn / parseJsonColumnOr', () => {
  it('正常数据原样解析', () => {
    expect(parseJsonColumn('{"a":1,"b":2}', isNumberRecord, 'c')).toEqual({ a: 1, b: 2 });
    expect(parseJsonColumn('[1,"x"]', isUnknown, 'c')).toEqual([1, 'x']);
    expect(parseJsonColumnOr('{"a":1}', isNumberRecord, {}, 'c')).toEqual({ a: 1 });
  });

  it('不是合法 JSON、形状不对都抛 BadColumnError，message 只有列名', () => {
    for (const bad of ['{oops secret-123', '{"a":"secret-123"}', '[1]']) {
      let err: unknown;
      try {
        parseJsonColumn(bad, isNumberRecord, 'wallets.played');
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(BadColumnError);
      expect((err as Error).message).toBe('wallets.played');
      expect((err as Error).name).toBe('BadColumnError');
      expect(String(err)).not.toContain('secret-123');
    }
  });

  it('宽松版：空值给兜底不记日志；坏了给兜底并只记列名', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseJsonColumnOr(null, isNumberRecord, { z: 0 }, 'c')).toEqual({ z: 0 });
    expect(parseJsonColumnOr(undefined, isNumberRecord, { z: 0 }, 'c')).toEqual({ z: 0 });
    expect(parseJsonColumnOr('', isNumberRecord, { z: 0 }, 'c')).toEqual({ z: 0 });
    expect(warn).not.toHaveBeenCalled();
    expect(parseJsonColumnOr('{broken secret-123', isNumberRecord, null, 'users.avatar_json')).toBeNull();
    expect(parseJsonColumnOr('{"a":"secret-123"}', isNumberRecord, null, 'users.avatar_json')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('bad json column', 'users.avatar_json');
    warn.mockRestore();
  });

  it('isRecordOf：值逐个校验，数组和 null 不算对象', () => {
    const g = isRecordOf((v: unknown): v is string => typeof v === 'string');
    expect(g({ a: 'x' })).toBe(true);
    expect(g({ a: 1 })).toBe(false);
    expect(g([])).toBe(false);
    expect(g(null)).toBe(false);
  });
});

describe('钱包状态 guard', () => {
  const good = {
    v: 1,
    balance: 100,
    stakes: {},
    reliefDay: '',
    today: { day: '2026-10-14', writes: 0, grant: 0, relief: 0, games: {} },
    prev: null,
    ops: [],
    expired: [],
    createdAt: 1,
  };
  it('完整的过；缺余额、余额是字符串、桌上金额不是数字都不过', () => {
    expect(isWalletState(good)).toBe(true);
    const { balance: _b, ...noBalance } = good;
    expect(isWalletState(noBalance)).toBe(false);
    expect(isWalletState({ ...good, balance: '100' })).toBe(false);
    expect(isWalletState({ ...good, balance: Number.NaN })).toBe(false);
    expect(isWalletState({ ...good, stakes: { 'k:r': { game: 'k', amount: '5', until: 1 } } })).toBe(false);
    expect(isWalletState({ ...good, ops: {} })).toBe(false);
    expect(isWalletState(null)).toBe(false);
  });

  it('GET /api/wallet：库里的状态坏了回 500，不改库', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const u = await registerUser();
    const bad = JSON.stringify({ ...good, balance: '100' });
    await env.DB.prepare('INSERT INTO wallets (user_id, rev, state, updated_at) VALUES (?1, 1, ?2, 1)').bind(u.user.id, bad).run();
    const res = await call('/api/wallet', { cookie: u.cookie });
    expect(res.status).toBe(500);
    expect(rowsWritten()).toBe(0);
    const row = await env.DB.prepare('SELECT rev, state FROM wallets WHERE user_id = ?1').bind(u.user.id).first<{ rev: number; state: string }>();
    expect(row).toEqual({ rev: 1, state: bad });
    // 日志只有路径和错误类型
    expect(warn).toHaveBeenCalledWith('api error', '/api/wallet', 'BadColumnError');
    warn.mockRestore();
  });
});
