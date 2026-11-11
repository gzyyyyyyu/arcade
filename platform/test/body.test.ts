/**
 * worker/api/lib/body.ts：请求体的嵌套层数检查（安全相关，直接测）和字段读取器的错误码约定。
 * 接口层面的 400、413、422 在各接口的测试里，这里只锁住读取器本身。
 */
import { describe, expect, it } from 'vitest';
import { bool, check, count, gameId, JSON_MAX_DEPTH, match, oneOf, optBool, optStr, scoreOf, str, tooDeep } from '../worker/api/lib/body';
import { ApiError } from '../worker/api/lib/http';

/** 读取器抛的 [状态码, 错误码]；没抛返回 null */
function thrown(f: () => unknown): [number, string] | null {
  try {
    f();
    return null;
  } catch (e) {
    if (e instanceof ApiError) return [e.status, e.code];
    throw e;
  }
}

describe('tooDeep：解析前数括号', () => {
  const nest = (n: number) => '['.repeat(n) + ']'.repeat(n);
  it('正好到上限不算深，多一层就算', () => {
    expect(tooDeep(nest(JSON_MAX_DEPTH), JSON_MAX_DEPTH)).toBe(false);
    expect(tooDeep(nest(JSON_MAX_DEPTH + 1), JSON_MAX_DEPTH)).toBe(true);
    expect(tooDeep('{"a":' + nest(3) + '}', 3)).toBe(true);
  });
  it('字符串里的括号和转义的引号不算', () => {
    expect(tooDeep(JSON.stringify({ s: '[[[[[[{{{{' }), 2)).toBe(false);
    expect(tooDeep(JSON.stringify({ s: 'a\\"[[[[' }), 2)).toBe(false);
    expect(tooDeep(JSON.stringify({ s: '\\' }) + nest(3), 2)).toBe(true);
  });
  it('平着排的很多对括号不累计', () => {
    expect(tooDeep('[' + '[],'.repeat(10_000) + '[]]', 2)).toBe(false);
  });
});

describe('读取器：形状不对 400 bad_request', () => {
  it('合法的原样返回', () => {
    expect(str('a')).toBe('a');
    expect(optStr(undefined)).toBeUndefined();
    expect(match('ab', /^[a-z]+$/)).toBe('ab');
    expect(bool(false)).toBe(false);
    expect(optBool(undefined)).toBeUndefined();
    expect(count(0)).toBe(0);
    expect(oneOf('x', new Set(['x', 'y']))).toBe('x');
    expect(gameId('kaipan')).toBe('kaipan');
  });
  it.each([
    ['str', () => str(1)],
    ['optStr', () => optStr(null)],
    ['match', () => match('AB', /^[a-z]+$/)],
    ['bool', () => bool('true')],
    ['optBool', () => optBool(0)],
    ['count 负数', () => count(-1)],
    ['count 小数', () => count(1.5)],
    ['oneOf', () => oneOf('z', new Set(['x']))],
    ['gameId', () => gameId('nope')],
    ['gameId 原型上的名字', () => gameId('constructor')],
  ])('%s', (_, f) => {
    expect(thrown(f)).toEqual([400, 'bad_request']);
  });
});

describe('分数和业务规则：422', () => {
  it('scoreOf：不是安全整数或超过上限都是 invalid_score', () => {
    expect(scoreOf(-5)).toBe(-5);
    expect(scoreOf(10, 10)).toBe(10);
    for (const v of ['1', 1.5, 2 ** 53, null, undefined]) expect(thrown(() => scoreOf(v)), String(v)).toEqual([422, 'invalid_score']);
    expect(thrown(() => scoreOf(11, 10))).toEqual([422, 'invalid_score']);
  });
  it('check：ok 放行，别的结果码原样变成 422', () => {
    expect(thrown(() => check('ok'))).toBeNull();
    expect(thrown(() => check('weak_password'))).toEqual([422, 'weak_password']);
  });
});
