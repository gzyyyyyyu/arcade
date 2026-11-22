import { describe, expect, it } from 'vitest';
import { requestJson, userOf, type Fetch } from '../../src/platform/http.ts';

describe('和平台说话的唯一入口', () => {
  it('读请求：同源、不缓存、带超时，不带写请求头', async () => {
    let seen: RequestInit | undefined;
    const f: Fetch = async (_u, i) => {
      seen = i;
      return new Response('{"a":1}', { status: 200 });
    };
    expect(await requestJson(f, 'GET', '/api/me')).toEqual({ status: 200, body: { a: 1 } });
    expect(seen).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(seen?.headers).toBeUndefined();
  });

  it('写请求：JSON、带 X-Arcade，keepalive 照传', async () => {
    let seen: RequestInit | undefined;
    const f: Fetch = async (_u, i) => {
      seen = i;
      return new Response('{}', { status: 200 });
    };
    await requestJson(f, 'POST', '/api/scores', '{"x":1}', true);
    expect(seen).toMatchObject({ body: '{"x":1}', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Arcade': '1' } });
  });

  it('连不上是 status 0；回的不是 JSON 对象时 body 为 null', async () => {
    expect(await requestJson(async () => Promise.reject(new TypeError('down')), 'GET', '/x')).toEqual({ status: 0, body: null });
    expect(await requestJson(async () => new Response('[1]', { status: 200 }), 'GET', '/x')).toEqual({ status: 200, body: null });
    expect(await requestJson(async () => new Response('坏了', { status: 502 }), 'GET', '/x')).toEqual({ status: 502, body: null });
  });

  it('/api/me 的结论：id、明确没登录、回的不对', () => {
    expect(userOf({ user: { id: 'u1' } })).toBe('u1');
    expect(userOf({ user: null })).toBeNull();
    expect(userOf({ user: { id: 3 } })).toBe('fail');
    expect(userOf({})).toBe('fail');
  });
});
